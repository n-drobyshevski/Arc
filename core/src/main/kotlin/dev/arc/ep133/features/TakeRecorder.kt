package dev.arc.ep133.features

/** Live's REC key: off, waiting for the first sound, or recording for [Recording.seconds]. */
sealed interface RecState {
    data object Idle : RecState
    data object Armed : RecState
    data class Recording(val seconds: Int) : RecState
}

/**
 * Which part of Live's mix goes into a take (an addition): REC arms it, the
 * first sound after that starts it (so a take has no silence in front, as on
 * the EP-133's sampler), and it runs until [stop] or [maxFrames]. Silence
 * after the last sound is left out when it stops.
 *
 * The EP-133 starting to play (MIDI clock start, [transportStart]) also starts
 * an armed take, from the next burst, so the take lines up with the device's
 * bar; such a take is [byTransport], and the device stopping ends it.
 *
 * A take locked to the pattern is armed at a mix frame instead ([armAt]): it
 * starts there, sound or not, and is stopped at one ([stopAt]), keeping the
 * silence up to it, so it is exactly the frames between.
 *
 * Only the output's thread calls it: [onBurst] once for each burst the mixer
 * renders, before the next.
 */
class TakeRecorder(val outRate: Int, val maxFrames: Long = MAX_SECONDS.toLong() * outRate) {
    companion object {
        /** Ten minutes: about 115 MB at 48 kHz stereo. */
        const val MAX_SECONDS = 600
    }

    enum class State { IDLE, ARMED, RECORDING }

    /** Record [frames] frames of the burst from frame [from]; [last] when the take reached [maxFrames] with them. */
    class Keep(val from: Int, val frames: Int, val last: Boolean)

    var state = State.IDLE
        private set

    /** Frames recorded so far. */
    var frames = 0L
        private set

    /** Frames up to the last one that isn't silent: what the take keeps. */
    var audible = 0L
        private set

    val seconds: Int get() = (frames / outRate).toInt()

    /** Whether the device's PLAY started the take, so the device stopping ends it. */
    var byTransport = false
        private set

    // The device started playing while armed: the next burst starts the take.
    private var startNext = false

    // [armAt]'s frame (null: the first sound's), [stopAt]'s (none: MAX_VALUE), the take's first mix frame.
    private var startAt: Long? = null
    private var endAt = Long.MAX_VALUE
    private var first = 0L

    fun arm() {
        if (state != State.IDLE) return
        state = State.ARMED
        frames = 0
        audible = 0
        startAt = null
        endAt = Long.MAX_VALUE
        byTransport = false
        startNext = false
    }

    /** The EP-133 started playing: an armed take starts with the next burst. */
    fun transportStart() {
        if (state == State.ARMED) startNext = true
    }

    /** Arms the take to start at mix frame [frame], whether or not anything sounds then; armed already, it starts there instead. */
    fun armAt(frame: Long) {
        if (state == State.RECORDING) return
        state = State.ARMED
        frames = 0
        audible = 0
        startAt = frame
        endAt = Long.MAX_VALUE
        byTransport = false
        startNext = false
    }

    /**
     * Ends the take at mix frame [frame], keeping the silence up to it: the
     * burst that reaches it is the last ([Keep.last]). A frame already
     * recorded past ends it there.
     */
    fun stopAt(frame: Long) {
        if (state != State.IDLE) endAt = frame
    }

    /**
     * The burst just rendered: [frames] stereo frames in [out], the first at
     * mix frame [at]; [firstStart] is the earliest mix frame a voice began at
     * in it, if any did. Returns the part to record, or null for none.
     */
    fun onBurst(out: ShortArray, frames: Int, at: Long, firstStart: Long?): Keep? {
        val from = when (state) {
            State.IDLE -> return null
            State.ARMED -> {
                if (startNext) {
                    // The device's PLAY: from this burst on, so the take lines up with it.
                    startNext = false
                    byTransport = true
                    state = State.RECORDING
                    first = at
                    0
                } else {
                    val start = startAt ?: firstStart ?: return null
                    // Armed at a frame: not yet. Come late, it starts with this burst.
                    if (start >= at + frames) return null
                    state = State.RECORDING
                    (start - at).coerceIn(0, frames.toLong()).toInt().also { first = at + it }
                }
            }
            State.RECORDING -> 0
        }
        // Up to [stopAt]'s frame, if it comes in this burst (or came already).
        val left = if (endAt == Long.MAX_VALUE) Long.MAX_VALUE else maxOf(0L, endAt - (at + from))
        val n = minOf((frames - from).toLong(), maxFrames - this.frames, left).toInt()
        for (i in n - 1 downTo 0) {
            val j = 2 * (from + i)
            if (out[j].toInt() != 0 || out[j + 1].toInt() != 0) {
                audible = this.frames + i + 1
                break
            }
        }
        this.frames += n
        val stopped = endAt != Long.MAX_VALUE && at + from + n >= endAt
        // Stopped at a frame: the silence before it is kept too.
        if (stopped) audible = keptTo(endAt)
        val last = this.frames >= maxFrames || stopped
        if (last) state = State.IDLE
        return Keep(from, n, last)
    }

    /** Stops: the frames the take keeps, 0 when nothing was played since REC (nor did an [armAt] frame come). */
    fun stop(): Long {
        val keep = when {
            state == State.ARMED -> 0L
            state == State.RECORDING && endAt != Long.MAX_VALUE -> keptTo(endAt)
            else -> audible
        }
        state = State.IDLE
        startNext = false
        return keep
    }

    /** The frames recorded up to mix frame [end], silent or not. */
    private fun keptTo(end: Long): Long = (end - first).coerceIn(0L, frames)
}
