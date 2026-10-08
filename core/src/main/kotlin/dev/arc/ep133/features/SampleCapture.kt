package dev.arc.ep133.features

import kotlin.math.abs
import kotlin.math.floor

/** What SAMPLE mode's line under the keys shows (an addition): ready, waiting for a take to start, recording, or uploading one. */
sealed interface SamplePhase {
    /** Nothing going on: holding a pad records into it. */
    data object Ready : SamplePhase

    /** [pad] is held or latched ([latched]: hands-free), and the take waits for the input to pass the threshold. */
    data class Waiting(val pad: PhysicalPad, val latched: Boolean = false) : SamplePhase

    /** A take of some bars into [pad] waits for PLAY on the EP-133 (its MIDI Start). */
    data class WaitingForPlay(val pad: PhysicalPad) : SamplePhase

    /** The click counts [beat] of the bar before a take of some bars into [pad]. */
    data class CountIn(val pad: PhysicalPad, val beat: Int) : SamplePhase

    /** Recording into [pad]: [seconds] of at most [max]; [latched] when it runs hands-free until STOP, or a tap on its pad, stops it (or its bars run out). */
    data class Recording(val pad: PhysicalPad, val seconds: Int, val max: Int, val latched: Boolean) : SamplePhase

    /** A kept take goes onto [pad] on the EP-133, [percent] of it sent. */
    data class Uploading(val pad: PhysicalPad, val percent: Int) : SamplePhase
}

/**
 * One take in SAMPLE mode (an addition, after the EP-133's own sampler):
 * the input's blocks go in through [feed], each at its absolute input frame,
 * and the take comes out as 16-bit PCM at [channels] channels and the
 * input's [rate]. A take is armed, by a held pad, to start at a frame or
 * when the input first reaches a threshold; or scheduled, for some bars, to
 * start and end at exact frames. It ends when stopped at a frame, at
 * [maxFrames], at the scheduled end, or when cancelled or the input is lost.
 *
 * The last [keptFrames] frames are always kept (at least [preRollFrames],
 * 20 ms), so a take that waits for the threshold still has the
 * [preRollFrames] of attack before it crossed, and one armed late (a press
 * time the input has already passed, as when the press reaches the input
 * after its frames do) starts where it was asked to, or at a threshold those
 * frames already crossed.
 *
 * Only the input's thread calls it, and it allocates nothing after it is
 * built but the [Event.Started] of each take: the take's buffer is the full
 * [maxFrames] from the start. Rounding is
 * floor(x + 0.5) and stereo mixes down with shr, so the web's port gives the
 * same samples.
 */
class SampleCapture(
    val rate: Int,
    val channels: Int,
    val maxFrames: Int,
    val preRollFrames: Int = rate / 50,
    val keptFrames: Int = preRollFrames,
) {
    init {
        require(channels == 1 || channels == 2) { "a take is mono or stereo, not $channels channels" }
        require(maxFrames >= 0 && preRollFrames >= 0) { "no take of $maxFrames frames with $preRollFrames before it" }
        require(keptFrames >= preRollFrames) { "$keptFrames frames kept can't hold $preRollFrames before a take" }
    }

    enum class State { IDLE, ARMED, SCHEDULED, RECORDING, DONE }

    /** Why a take ended: [stop], [maxFrames], the scheduled length, [cancel], or [lost]. */
    enum class End { STOPPED, LIMIT, BARS, CANCELLED, LOST }

    /** What a [feed] did to the take, if anything. */
    sealed interface Event {
        /** The take starts at input frame [frame]. */
        data class Started(val frame: Long) : Event

        /** The take ended, for [end]. */
        data class Ended(val end: End) : Event
    }

    /** The input level: each sample is multiplied by it, then clipped to 16 bits. */
    var gain = 1f

    private val buffer = ShortArray(maxFrames * channels)

    // The last frames fed, converted, oldest first from ringHead - ringCount;
    // the newest is the frame before nextFrame.
    private val ring = ShortArray(keptFrames * channels)

    // The loudest sample of each frame in the ring, after gain, before mixing
    // down: what the threshold is checked against.
    private val ringPeak = IntArray(keptFrames)
    private var ringHead = 0
    private var ringCount = 0

    private var fed = false
    private var nextFrame = 0L

    private var fromFrame = 0L
    private var threshold: Float? = null

    // The first frame already fed when the take was armed that reaches its
    // threshold, or NONE: the next feed or stop starts the take there.
    private var ringHit = NONE
    private var startFrame = 0L
    private var barsEnd = Long.MAX_VALUE
    private var stopFrame = Long.MAX_VALUE
    private var event: Event? = null
    private val endings = End.entries.map { Event.Ended(it) }

    var state = State.IDLE
        private set

    /** Frames in the take so far. */
    var frames = 0
        private set

    val seconds: Int get() = frames / rate

    /** Why the take ended, null until it has. */
    var end: End? = null
        private set

    /** The input frame the take started at, null until it has (or after [cancel]). */
    val started: Long? get() = if (startedAt == NONE) null else startedAt

    private var startedAt = NONE

    /** The loudest sample of the last block fed, after [gain]: 0..1 of full scale. */
    var blockPeak = 0f
        private set

    /**
     * Waits for a take that starts at [fromFrame], or with a [threshold] (a
     * level 0..1 of full scale, after [gain]) when the input first reaches it
     * at or after [fromFrame], [preRollFrames] earlier. Either start reaches
     * back only as far as the frames fed and kept ([keptFrames]), and never
     * before [fromFrame].
     * Forgets any take before it.
     */
    fun arm(fromFrame: Long, threshold: Float?) {
        reset(State.ARMED)
        this.fromFrame = fromFrame
        this.threshold = threshold
        if (threshold != null && fed) ringHit = ringCrossing(fromFrame, nextFrame, threshold.toDouble() * 32768)
    }

    /**
     * A take of exactly [lengthFrames] from [startFrame], whatever the level
     * (for some bars): it ends [End.BARS], or [End.LIMIT] if [maxFrames] comes
     * first. Frames before the start that were never fed are silence, so the
     * take still lines up with the bars. Forgets any take before it.
     */
    fun schedule(startFrame: Long, lengthFrames: Long) {
        require(lengthFrames >= 0) { "a take can't be $lengthFrames frames long" }
        reset(State.SCHEDULED)
        this.startFrame = startFrame
        barsEnd = startFrame + lengthFrames
    }

    /**
     * Stops the take at input frame [atFrame], keeping the frames before it.
     * When the input hasn't reached it yet the take goes on until it does; a
     * take that never started ends with no frames. Nothing happens when there
     * is no take going on.
     */
    fun stop(atFrame: Long) {
        if (state == State.IDLE || state == State.DONE) return
        stopFrame = minOf(stopFrame, atFrame)
        // The frames up to the stop are still to come: feed ends the take.
        if (!fed || stopFrame > nextFrame) return
        when (state) {
            State.ARMED -> {
                val reach = nextFrame - ringCount
                val from = when {
                    threshold == null -> maxOf(fromFrame, reach)
                    ringHit < stopFrame -> ringStart(reach)
                    else -> NONE
                }
                if (from != NONE && from < stopFrame) begin(from, stopFrame, nextFrame)
            }
            State.SCHEDULED -> if (startFrame < stopFrame) begin(startFrame, stopFrame, nextFrame)
            State.RECORDING -> frames = (stopFrame - startedAt).coerceIn(0, frames.toLong()).toInt()
            else -> {}
        }
        if (state != State.DONE) finish(End.STOPPED)
    }

    /** Throws the take away: it ends [End.CANCELLED] with no frames. */
    fun cancel() {
        state = State.DONE
        end = End.CANCELLED
        frames = 0
        startedAt = NONE
    }

    /** The input went away: the take ends [End.LOST], keeping what was recorded. */
    fun lost() {
        if (state == State.ARMED || state == State.SCHEDULED || state == State.RECORDING) finish(End.LOST)
    }

    /**
     * The input's next block: [frames] frames of [pcm], interleaved at
     * [inChannels] (1 or 2), the first at input frame [at]. Each sample goes
     * through [gain] and is clipped, then stereo is mixed down to a mono take
     * ((l + r) shr 1) or mono doubled for a stereo one. Frames between the
     * last block and [at] (a block the input dropped) are silence; frames
     * already fed are skipped. Returns [Event.Started] when the take starts,
     * [Event.Ended] when it ends (also when it started in the same block; see
     * [started]), or null.
     */
    fun feed(pcm: ShortArray, frames: Int, inChannels: Int, at: Long): Event? {
        require(inChannels == 1 || inChannels == 2) { "the input is mono or stereo, not $inChannels channels" }
        require(frames >= 0 && pcm.size >= frames * inChannels) { "$frames frames don't fit in ${pcm.size} samples" }
        val g = gain.toDouble()
        var peak = 0
        for (i in 0 until frames * inChannels) peak = maxOf(peak, abs(gained(pcm[i], g)))
        blockPeak = peak / 32768f
        event = null
        var skip = 0
        if (fed) {
            if (at > nextFrame) run(null, 0, 1, nextFrame, at - nextFrame, g)
            else skip = minOf(nextFrame - at, frames.toLong()).toInt()
        }
        if (skip < frames) run(pcm, skip * inChannels, inChannels, at + skip, (frames - skip).toLong(), g)
        nextFrame = if (fed) maxOf(nextFrame, at + frames) else at + frames
        fed = true
        return event
    }

    /** A copy of the take: [frames] frames, interleaved at [channels]. */
    fun take(): ShortArray = buffer.copyOf(frames * channels)

    private fun reset(to: State) {
        state = to
        frames = 0
        end = null
        startedAt = NONE
        threshold = null
        ringHit = NONE
        barsEnd = Long.MAX_VALUE
        stopFrame = Long.MAX_VALUE
    }

    // [n] frames from input frame [first]: from [src] at sample [offset], or
    // silence when [src] is null. The ring holds the frames before [first].
    private fun run(src: ShortArray?, offset: Int, inChannels: Int, first: Long, n: Long, g: Double) {
        val last = first + n
        var pos = first
        while (pos < last) {
            pos = when (state) {
                State.IDLE, State.DONE -> last
                State.ARMED -> armed(src, offset, inChannels, first, last, g)
                State.SCHEDULED -> scheduled(first, last)
                State.RECORDING -> record(src, offset, inChannels, first, pos, last, g)
            }
        }
        remember(src, offset, inChannels, n, g)
    }

    private fun armed(src: ShortArray?, offset: Int, inChannels: Int, first: Long, last: Long, g: Double): Long {
        val until = minOf(last, stopFrame)
        val reach = first - ringCount
        val thr = threshold
        val from = when {
            thr == null -> if (fromFrame < until) maxOf(fromFrame, reach) else NONE
            ringHit != NONE -> if (ringHit < until) ringStart(reach) else NONE
            else -> {
                val hit = crossing(src, offset, inChannels, first, maxOf(fromFrame, first), until, thr, g)
                if (hit == NONE) NONE else maxOf(hit - preRollFrames, fromFrame, reach)
            }
        }
        // A frame the ring had when armed is only checked once, now it's past.
        ringHit = NONE
        if (from == NONE) {
            if (stopFrame <= last) finish(End.STOPPED)
            return last
        }
        begin(from, first, first)
        return maxOf(from, first)
    }

    // Where a take starts that the ring crossed the threshold for, at [ringHit]:
    // the pre-roll before it, no further back than [reach] or the armed frame.
    // NONE when the ring didn't cross it.
    private fun ringStart(reach: Long): Long = if (ringHit == NONE) NONE else maxOf(ringHit - preRollFrames, fromFrame, reach)

    private fun scheduled(first: Long, last: Long): Long {
        if (startFrame < minOf(last, stopFrame)) {
            begin(startFrame, first, first)
            return maxOf(startFrame, first)
        }
        if (stopFrame <= last) finish(End.STOPPED)
        return last
    }

    // The take starts at [from]; frames before [until] are already past, so
    // they come from the ring, which ends at [ringEnd], or are silence where
    // it doesn't reach.
    private fun begin(from: Long, until: Long, ringEnd: Long) {
        state = State.RECORDING
        startedAt = from
        frames = 0
        event = Event.Started(from)
        val to = minOf(until, endFrame())
        var f = from
        while (f < to) {
            val o = frames * channels
            val back = ringEnd - f
            if (back > ringCount) {
                buffer[o] = 0
                if (channels == 2) buffer[o + 1] = 0
            } else {
                val r = ((ringHead - back.toInt() + keptFrames) % keptFrames) * channels
                buffer[o] = ring[r]
                if (channels == 2) buffer[o + 1] = ring[r + 1]
            }
            frames++
            f++
        }
        settle()
    }

    private fun record(src: ShortArray?, offset: Int, inChannels: Int, first: Long, pos: Long, last: Long, g: Double): Long {
        val to = minOf(last, endFrame())
        for (f in pos until to) {
            convert(src, offset + (f - first).toInt() * inChannels, inChannels, g, buffer, frames * channels)
            frames++
        }
        return if (settle()) last else to
    }

    // The frame the take can't go past: the scheduled end, the limit or the stop.
    private fun endFrame(): Long = minOf(barsEnd, startedAt + maxFrames, stopFrame)

    // Ends the take if it reached its end; whether it did.
    private fun settle(): Boolean {
        val at = startedAt + frames
        finish(
            when {
                at >= barsEnd -> End.BARS
                frames >= maxFrames -> End.LIMIT
                at >= stopFrame -> End.STOPPED
                else -> return false
            },
        )
        return true
    }

    private fun finish(why: End) {
        state = State.DONE
        end = why
        event = endings[why.ordinal]
    }

    // The first frame in [from, to) with a sample at or above [threshold], or NONE.
    private fun crossing(src: ShortArray?, offset: Int, inChannels: Int, first: Long, from: Long, to: Long, threshold: Float, g: Double): Long {
        if (from >= to) return NONE
        val level = threshold.toDouble() * 32768
        if (src == null) return if (0 >= level) from else NONE
        for (f in from until to) {
            val i = offset + (f - first).toInt() * inChannels
            for (c in 0 until inChannels) if (abs(gained(src[i + c], g)) >= level) return f
        }
        return NONE
    }

    // The first frame the ring holds, from [from] on, with a sample at or
    // above [level]; [ringEnd] is the frame after its newest. NONE if none.
    private fun ringCrossing(from: Long, ringEnd: Long, level: Double): Long {
        for (f in maxOf(from, ringEnd - ringCount) until ringEnd) {
            val back = (ringEnd - f).toInt()
            if (ringPeak[(ringHead - back + keptFrames) % keptFrames] >= level) return f
        }
        return NONE
    }

    // Keeps the last of the [n] frames just run in the ring.
    private fun remember(src: ShortArray?, offset: Int, inChannels: Int, n: Long, g: Double) {
        val m = minOf(n, keptFrames.toLong()).toInt()
        for (k in n - m until n) {
            val i = offset + k.toInt() * inChannels
            convert(src, i, inChannels, g, ring, ringHead * channels)
            ringPeak[ringHead] = when {
                src == null -> 0
                inChannels == 1 -> abs(gained(src[i], g))
                else -> maxOf(abs(gained(src[i], g)), abs(gained(src[i + 1], g)))
            }
            ringHead = (ringHead + 1) % keptFrames
        }
        ringCount = minOf(ringCount + m, keptFrames)
    }

    // One input frame at sample [i] of [src] (silence when null), as a frame of the take at [o] of [dst].
    private fun convert(src: ShortArray?, i: Int, inChannels: Int, g: Double, dst: ShortArray, o: Int) {
        if (src == null) {
            dst[o] = 0
            if (channels == 2) dst[o + 1] = 0
        } else if (inChannels == 1) {
            val v = gained(src[i], g).toShort()
            dst[o] = v
            if (channels == 2) dst[o + 1] = v
        } else {
            val l = gained(src[i], g)
            val r = gained(src[i + 1], g)
            if (channels == 1) {
                dst[o] = ((l + r) shr 1).toShort()
            } else {
                dst[o] = l.toShort()
                dst[o + 1] = r.toShort()
            }
        }
    }

    private fun gained(s: Short, g: Double): Int {
        if (g == 1.0) return s.toInt()
        val v = floor(s * g + 0.5)
        return if (v > 32767) 32767 else if (v < -32768) -32768 else v.toInt()
    }

    private companion object {
        // No frame: no start yet, no crossing.
        const val NONE = Long.MIN_VALUE
    }
}
