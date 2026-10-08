package dev.arc.ep133.audio

import dev.arc.ep133.features.FrameClock
import dev.arc.ep133.features.PeakMeter
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.SampleCapture
import dev.arc.ep133.features.SampleInput
import dev.arc.ep133.features.SampleLimits
import dev.arc.ep133.features.SamplePhase
import dev.arc.ep133.features.SampleSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs
import kotlin.math.floor

/**
 * What takes Live's mix beside REC (an addition): SAMPLE's RSP, set as
 * [MixSource.sampleTap]. [mixed] and [clock] come on the output's thread;
 * [lost] may come on any.
 */
interface MixTap {
    /** [frames] stereo frames of the mix in [pcm], the first at mix frame [at], at [rate]. */
    fun mixed(pcm: ShortArray, frames: Int, at: Long, rate: Int)

    /** When a mix frame is heard, from the output's timestamp ([LiveListener.clock]). */
    fun clock(clock: FrameClock)

    /** No more of the mix comes through this tap ([why]): Live's output closed or gave out. */
    fun lost(why: String)
}

/** Where RSP's mix comes from (an addition): [LiveAudio] in the app, a fake in the tests. */
interface MixSource {
    /** The output's sample rate, null while it is closed. */
    val mixRate: Int?

    /** Who takes the mix beside REC; null for no one. */
    var sampleTap: MixTap?
}

/**
 * A take SAMPLE made (an addition): [pcm], interleaved at [channels] and
 * [rate], recorded from [input] into [pad]. [end] says why it ended;
 * [latched] when it ran hands-free.
 */
class SampleTake(
    val pad: PhysicalPad,
    val input: SampleInput,
    val pcm: ShortArray,
    val channels: Int,
    val rate: Int,
    val end: SampleCapture.End,
    val latched: Boolean,
) {
    val frames: Int get() = pcm.size / channels
}

/**
 * Runs SAMPLE mode's input (an addition, after the EP-133's sampler): one
 * input open at a time, metered from the moment it opens ([level], [clip])
 * and recorded into a pad only when a take is armed.
 *
 * The phone's mic and the EP-133 over USB come through an [Input] that
 * [openInput] makes ([InputCapture] in the app), on that input's own
 * thread; RSP takes Live's mix through [MixSource.sampleTap], on the
 * output's thread. Either way the input's frames are counted from a clock
 * of its own ([FrameClock]: the input's timestamp, or the output's for RSP),
 * so a press or a release at a given [nanoTime] is turned into the frame
 * that was being recorded, or played, at that moment, however late the
 * block holding it arrives.
 *
 * A press reaches the recorder after the frames of its moment: the mic's
 * by the touch's delay, Live's mix by the whole output latency, since it is
 * mixed that far ahead of what is heard. So each take buffer keeps the last
 * [REACH_MS] of the input, and a take starts at its press however late it is
 * picked up; one waiting for the threshold still keeps only the 20 ms before
 * the crossing.
 *
 * Commands ([arm], [schedule], [scheduleMix], [stop], [cancel]) are queued and picked up
 * by the feeding thread before its next block, as REC's are in [LiveAudio]:
 * the [SampleCapture] and the [PeakMeter] are touched only there, under the
 * input's lock, which [close] and a lost input take once more to end what is
 * going on. Two take buffers are allocated when the input opens, each the
 * longest take for its mono or stereo, and both are fed every block: a
 * finished take is copied out of its buffer on [scope] and given to
 * [onDone] there, outside the lock, while the input records on into the
 * other, which has the latest frames already. So the feeding thread never
 * copies or allocates a take, and a press straight after a take loses
 * nothing. Only when both are away (two takes ended within one copy) does a
 * press wait for one, and the frames meanwhile are silence.
 *
 * [phase] shows what is going on: [SamplePhase.Ready], [SamplePhase.Waiting]
 * for the threshold (or a scheduled start), and [SamplePhase.Recording] with
 * the seconds so far, posted as they change. The controller adds the
 * count-in, waiting for PLAY and uploading on top. [going] says whether a
 * take asked for is still under way, however it ends, so the controller
 * never waits for one that ended with nothing.
 */
class SampleRecorder(
    private val mix: MixSource,
    private val openInput: (input: SampleInput, sink: Sink) -> Input,
    private val scope: CoroutineScope,
    private val nanoTime: () -> Long = System::nanoTime,
) {
    /** A MIC or USB input, made by [openInput] and not yet started. */
    interface Input {
        /** Its sample rate. */
        val rate: Int

        /** The channels its blocks hold (1 or 2), once [start]ed: a stereo input may open mono. */
        val channels: Int

        /** Starts the input's thread; throws, saying why, when the input can't be opened. */
        fun start()

        /** Stops it; no block comes after its thread ends. */
        fun close()
    }

    /** What an [Input]'s thread tells the recorder; every call on that thread. */
    interface Sink {
        /** [frames] frames of [pcm], interleaved at the input's channels, the first at input frame [at]. */
        fun block(pcm: ShortArray, frames: Int, at: Long)

        /** When an input frame was captured. */
        fun clock(clock: FrameClock)

        /** The input went away ([why]): no block comes after. */
        fun lost(why: String)

        /** Whether Android is silencing the input (another app has the mic). */
        fun silenced(on: Boolean)
    }

    companion object {
        /** RSP's rate while Live's output is closed: the blocks say the real one when it opens. */
        const val DEFAULT_RATE = 48000

        /**
         * How far back a press reaches into frames already fed: past Live's
         * output latency (Bluetooth's 150 ms and more) for RSP, and a
         * touch's delay for the mic.
         */
        const val REACH_MS = 500

        /** A level in dB as the gain applied to each sample. */
        fun gainOf(db: Float): Float = PeakMeter.fromDb(db)
    }

    private val _phase = MutableStateFlow<SamplePhase>(SamplePhase.Ready)

    /** What is going on, for SAMPLE's header; [SamplePhase.Ready] while closed. */
    val phase: StateFlow<SamplePhase> = _phase

    private val _silenced = MutableStateFlow(false)

    /** Whether Android silences the open input: another app is using the mic. */
    val silenced: StateFlow<Boolean> = _silenced

    /**
     * Gets each take that has frames, on [scope]. A cancelled take, or one
     * with nothing in it, never comes: [going] says when it is over.
     */
    var onDone: (SampleTake) -> Unit = {}

    // Takes asked for ([arm], [schedule], [scheduleMix]) and not over yet: counted up on the caller's thread as each
    // is asked, down as each ends, on the feeding thread, or with its input when it never started.
    private val open = AtomicInteger()

    /**
     * Whether a take asked for is still under way: queued, waiting for the
     * threshold or its start, or recording. False again once it ends,
     * whatever the end: kept, cancelled, stopped before it started, or let
     * go of with its input (a −/+ while it waits for the threshold), which
     * [onDone] never hears of. Read on the caller's thread: an [arm] makes it
     * true at once.
     */
    val going: Boolean get() = open.get() > 0

    /**
     * The open input went away for good, on [scope] ([why], in the input's
     * words): the USB device unplugged, the mic taken, Live's output closed.
     * A take going on ends [SampleCapture.End.LOST] and comes to [onDone]
     * first. RSP comes back by itself when Live's output only reopened.
     */
    var onLost: (input: SampleInput, why: String) -> Unit = { _, _ -> }

    /**
     * RSP opened again by itself, on [scope], when Live's output reopened
     * at another rate: [rate] (and so the longest take) may be another now.
     */
    var onReopened: () -> Unit = {}

    // The open input; set and cleared on the caller's thread (the main one).
    @Volatile private var feed: Feed? = null

    @Volatile private var gain = 1f

    // The threshold as a level 0..1 of full scale, null for none.
    @Volatile private var threshold: Float? = null

    /** The open input, null while closed. */
    val input: SampleInput? get() = feed?.input

    /** The open input's sample rate (a take's), null while closed. */
    val rate: Int? get() = feed?.rate

    /**
     * The channels a take has (1 or 2), null while closed or starting: a
     * stereo input the phone only opens mono records mono, and so for
     * [SampleLimits.MAX_MONO_S].
     */
    val channels: Int? get() = feed?.channels?.takeIf { it > 0 }

    /**
     * Opens [input] at [gainDb] and starts metering it; nothing is recorded
     * until a take is armed. Another input open is closed first, its take
     * kept ([close]). Returns null once open, else why it couldn't be (the
     * input's own words); RSP always opens, and waits for Live's mix.
     */
    fun open(input: SampleInput, gainDb: Float): String? {
        setGain(gainDb)
        if (feed?.input == input) return null
        close()
        return start(input)
    }

    // RSP opens at [rspRate] when given (the rate Live's blocks came at), else the output's.
    private fun start(input: SampleInput, rspRate: Int? = null): String? {
        if (input.source == SampleSource.RSP) {
            val f = Feed(input, rspRate ?: mix.mixRate ?: DEFAULT_RATE, null)
            // Live's mix is stereo whatever the take: a mono one mixes it down.
            f.ready(if (input.stereo) 2 else 1)
            feed = f
            mix.sampleTap = f
            return null
        }
        lateinit var f: Feed
        val sink = object : Sink {
            override fun block(pcm: ShortArray, frames: Int, at: Long) = f.block(pcm, frames, at)
            override fun clock(clock: FrameClock) = f.clock(clock)
            override fun lost(why: String) = f.lost(why)
            override fun silenced(on: Boolean) = f.silenced(on)
        }
        val source = try {
            openInput(input, sink)
        } catch (e: Exception) {
            return why(e)
        }
        f = Feed(input, source.rate, source)
        feed = f
        try {
            source.start()
        } catch (e: Exception) {
            feed = null
            source.close()
            return why(e)
        }
        // Only now does the input know its channels: a stereo one may have opened mono.
        f.ready(minOf(if (input.stereo) 2 else 1, source.channels))
        return null
    }

    /**
     * Closes the input. A take going on ends with what was recorded up to
     * the last block and comes to [onDone] like any other; one still waiting
     * for its start ends with nothing.
     */
    fun close() {
        val f = feed ?: return
        feed = null
        if (mix.sampleTap === f) mix.sampleTap = null
        f.source?.close()
        f.close()
        _phase.value = SamplePhase.Ready
        _silenced.value = false
    }

    /** The input level in dB, from the next block. */
    fun setGain(db: Float) {
        gain = gainOf(db)
    }

    /** The threshold in dBFS that an armed take waits for, null for none; from the next [arm]. */
    fun setThreshold(db: Float?) {
        threshold = db?.let { PeakMeter.fromDb(it) }
    }

    /**
     * Arms a take into [pad]: pressed at [pressedAtNanos] ([nanoTime]'s
     * clock), it records from the frame of that moment, or from when the
     * input first reaches the threshold after it, with the 20 ms before;
     * [latched] when it runs hands-free. It ends at [stop], or after
     * [maxFrames] frames (no more than the input's longest take; the free
     * space may make it less). A take still going ends where this one is
     * pressed. False when no input is open or [maxFrames] leaves no room.
     */
    fun arm(pad: PhysicalPad, pressedAtNanos: Long, latched: Boolean, maxFrames: Int): Boolean {
        val f = feed ?: return false
        if (maxFrames <= 0) return false
        f.ask(Ask.Arm(pad, pressedAtNanos, latched, maxFrames, threshold))
        return true
    }

    /**
     * Schedules a take of exactly [lengthFrames] into [pad] from
     * [startNanos] (the downbeat after a count-in, or PLAY), whatever the
     * threshold: a hands-free take of set bars. [maxFrames] caps it as for
     * [arm]. False when no input is open.
     */
    fun schedule(pad: PhysicalPad, startNanos: Long, lengthFrames: Long, maxFrames: Int = Int.MAX_VALUE): Boolean {
        val f = feed ?: return false
        if (maxFrames <= 0 || lengthFrames < 0) return false
        f.ask(Ask.Schedule(pad, startNanos, maxFrames, lengthFrames))
        return true
    }

    /**
     * Schedules a take of exactly [lengthFrames] of Live's mix into [pad]
     * from mix frame [startMixFrame] (a pattern's loop start, from its
     * timeline): RSP only, to the frame, with no clock in between. [maxFrames]
     * caps it as for [arm]. Live's output reopening before it starts ends it
     * with nothing, since its frames count afresh. False when RSP isn't open.
     */
    fun scheduleMix(pad: PhysicalPad, startMixFrame: Long, lengthFrames: Long, maxFrames: Int = Int.MAX_VALUE): Boolean {
        val f = feed ?: return false
        if (f.input.source != SampleSource.RSP || maxFrames <= 0 || lengthFrames < 0) return false
        f.ask(Ask.ScheduleFrame(pad, startMixFrame, maxFrames, lengthFrames))
        return true
    }

    /** Stops the take at the frame of [releasedAtNanos], keeping what came before it. */
    fun stop(releasedAtNanos: Long = nanoTime()) {
        feed?.ask(Ask.Stop(releasedAtNanos))
    }

    /** Throws the take away (a tap, or a press that turned into a scroll): [onDone] never gets it. */
    fun cancel() {
        feed?.ask(Ask.Cancel)
    }

    /** The input's level, 0..1 across −60..0 dBFS, to draw now. */
    fun level(): Float = feed?.meter?.level01() ?: 0f

    /** Whether the input clipped in the last second, to draw now. */
    fun clip(): Boolean = feed?.meter?.clip == true

    private fun why(e: Exception): String = e.message ?: e.toString()

    // An input went away (on [scope]): RSP comes back on Live's output if it only reopened.
    private fun inputLost(f: Feed, why: String) {
        if (feed !== f) {
            // Closed meanwhile: what it was asked and never started goes with it.
            f.drop()
            return
        }
        feed = null
        if (mix.sampleTap === f) mix.sampleTap = null
        f.source?.close()
        _phase.value = SamplePhase.Ready
        _silenced.value = false
        if (f.input.source == SampleSource.RSP && mix.mixRate != null) {
            start(f.input, f.nextRate)
            // A press as Live's output opened at another rate (or reopened), or a take still waiting for
            // its start, records on the new one.
            feed?.let(f::handOn)
            onReopened()
            return
        }
        f.drop()
        onLost(f.input, why)
    }

    /** A command for the feeding thread, at [nanos] on [nanoTime]'s clock. */
    private sealed interface Ask {
        /** A take into [pad], [latched] or not, of at most [maxFrames]. */
        sealed class Start(val pad: PhysicalPad, val nanos: Long, val latched: Boolean, val maxFrames: Int) : Ask

        class Arm(pad: PhysicalPad, nanos: Long, latched: Boolean, maxFrames: Int, val threshold: Float?) : Start(pad, nanos, latched, maxFrames)

        class Schedule(pad: PhysicalPad, nanos: Long, maxFrames: Int, val length: Long) : Start(pad, nanos, true, maxFrames)

        /** RSP's take of set frames from mix frame [frame] rather than a moment ([nanos] unused). */
        class ScheduleFrame(pad: PhysicalPad, val frame: Long, maxFrames: Int, val length: Long) : Start(pad, 0L, true, maxFrames)

        class Stop(val nanos: Long) : Ask

        data object Cancel : Ask
    }

    /**
     * One open input: its take buffers, its meter and the take going on.
     * Everything but the volatiles and the queues is under its lock, which
     * the feeding thread holds for each block.
     */
    private inner class Feed(val input: SampleInput, val rate: Int, val source: Input?) : MixTap {
        /** The channels of a take, once [ready]; 0 before. */
        @Volatile var channels = 0
            private set

        val meter = PeakMeter(rate)
        private val asks = ConcurrentLinkedQueue<Ask>()

        // The buffer the input feeds the take into; null before [ready], and while both are away being copied.
        private var capture: SampleCapture? = null

        // The other buffer while it is here: fed too, so it has the latest frames when it takes over.
        private var spare: SampleCapture? = null

        // Buffers home from [scope], for the next take.
        private val home = ConcurrentLinkedQueue<SampleCapture>()

        // Takes ended under the lock, to hand over once out of it.
        private val handed = ConcurrentLinkedQueue<() -> Unit>()

        @Volatile private var frameClock: FrameClock? = null
        private var closed = false

        // The frame after the last one fed, once one was.
        private var fed = false
        private var fedEnd = 0L

        // An arm or schedule that waits for a buffer: the take before it was just handed over.
        private var held: Ask? = null

        // What started the take going on, and that take once the input went before it started: the
        // input that takes over (RSP on Live's reopened output) starts it again.
        private var current: Ask.Start? = null
        private var unstarted: Ask.Start? = null

        // The take going on: its pad, how it runs, its cap, and what [phase] shows of it.
        private var pad: PhysicalPad? = null
        private var latched = false
        private var cap = 0
        private var capped = false
        private var startSeen = false
        private var shown = -1

        private fun newCapture() = SampleCapture(
            rate, channels, SampleLimits.maxFrames(channels == 2, rate),
            keptFrames = maxOf(rate * REACH_MS / 1000, rate / 50),
        )

        /** Allocates the take buffers, at [channels]; until then the input is only metered. */
        fun ready(channels: Int) {
            synchronized(this) {
                this.channels = channels
                capture = newCapture()
                spare = newCapture()
            }
        }

        fun ask(a: Ask) {
            if (a is Ask.Start) open.incrementAndGet()
            asks.add(a)
        }

        /**
         * Gives what was asked of this input and not yet done to [next], which
         * takes over from it: a take that hadn't started first, then the asks
         * queued, their frames counted at [next]'s rate.
         */
        fun handOn(next: Feed) {
            synchronized(this) {
                val all = listOfNotNull(unstarted, held) + generateSequence { asks.poll() }
                unstarted = null
                held = null
                // Still counted in [open]: each goes on as the same take. One at a mix frame is
                // over: the next output's frames count afresh.
                all.forEach { if (it is Ask.ScheduleFrame) open.decrementAndGet() else next.asks.add(rescaled(it, rate, next.rate)) }
            }
        }

        /** Lets go of what was asked of this input and never started (its input gone): those takes are over. */
        fun drop() {
            synchronized(this) {
                val all = listOfNotNull(unstarted, held) + generateSequence { asks.poll() }
                unstarted = null
                held = null
                all.forEach { if (it is Ask.Start) open.decrementAndGet() }
            }
        }

        // MIC and USB: the input's channels; RSP: the mix, at its own rate.
        fun block(pcm: ShortArray, frames: Int, at: Long) {
            feed(pcm, frames, source?.channels ?: 2, at)
        }

        // RSP: the rate Live's mix came at when it changed, to open anew at.
        @Volatile var nextRate: Int? = null

        override fun mixed(pcm: ShortArray, frames: Int, at: Long, rate: Int) {
            // Live's output (re)opened at another rate than this input's: RSP opens anew at it.
            if (rate != this.rate) {
                nextRate = rate
                lost("the output's rate changed")
                return
            }
            feed(pcm, frames, 2, at)
        }

        override fun clock(clock: FrameClock) {
            frameClock = clock
        }

        fun silenced(on: Boolean) {
            synchronized(this) { if (!closed) _silenced.value = on }
        }

        override fun lost(why: String) {
            synchronized(this) {
                if (closed) return
                closed = true
                capture?.let {
                    val c = current
                    if (c != null && pad != null && (it.state == SampleCapture.State.ARMED || it.state == SampleCapture.State.SCHEDULED)) {
                        // Not started: nothing to keep, and it may start on the input taking over ([handOn]).
                        it.cancel()
                        pad = null
                        current = null
                        unstarted = c
                    } else {
                        it.lost()
                        after(it)
                    }
                }
            }
            handOver()
            // After the take's hand-over, so [onDone] has it before [onLost] is told.
            scope.launch {
                yield()
                inputLost(this@Feed, why)
            }
        }

        // Ends what is going on: a take with what was fed, one waiting with nothing.
        fun close() {
            synchronized(this) {
                if (closed) return
                closed = true
                take()
                val c = capture
                if (c != null && going(c)) {
                    if (fed) c.stop(fedEnd)
                    if (going(c)) c.cancel()
                    after(c)
                }
            }
            // Asks no buffer was free to take (both away being copied) end here too.
            drop()
            handOver()
        }

        private fun feed(pcm: ShortArray, frames: Int, inChannels: Int, at: Long) {
            synchronized(this) {
                if (closed) return
                take()
                val c = capture
                if (c == null) {
                    // Not ready yet, or both buffers away being copied: the meter carries on.
                    meter.onBlock(peak(pcm, frames * inChannels, gain), frames)
                } else {
                    c.gain = gain
                    c.feed(pcm, frames, inChannels, at)
                    meter.onBlock(c.blockPeak, frames)
                }
                spare?.let {
                    it.gain = gain
                    it.feed(pcm, frames, inChannels, at)
                }
                fedEnd = if (fed) maxOf(fedEnd, at + frames) else at + frames
                fed = true
                if (c != null) after(c)
            }
            handOver()
        }

        // A buffer home from [scope] takes over when none feeds a take, else waits as the spare.
        private fun restock() {
            while (true) {
                val h = home.poll() ?: return
                if (capture == null) capture = h else spare = h
            }
        }

        // The asks queued since the last block, in order, while there is a buffer to take them.
        private fun take() {
            restock()
            while (true) {
                val c = capture ?: return
                val a = held ?: asks.poll() ?: return
                held = null
                when (a) {
                    is Ask.Start -> {
                        val at = if (a is Ask.ScheduleFrame) a.frame else frameAt(a.nanos)
                        if (going(c)) {
                            // The take before it ends where this one starts, and is handed over first.
                            if (fed) c.stop(minOf(at, fedEnd))
                            if (going(c)) c.cancel()
                            held = a
                            after(c)
                            continue
                        }
                        pad = a.pad
                        current = a
                        latched = a.latched
                        cap = minOf(a.maxFrames, c.maxFrames)
                        capped = cap < c.maxFrames
                        startSeen = false
                        shown = -1
                        when (a) {
                            is Ask.Arm -> c.arm(at, a.threshold)
                            is Ask.Schedule -> c.schedule(at, a.length)
                            is Ask.ScheduleFrame -> c.schedule(at, a.length)
                        }
                        _phase.value = SamplePhase.Waiting(a.pad, a.latched)
                        after(c)
                    }
                    is Ask.Stop -> if (going(c)) {
                        c.stop(frameAt(a.nanos))
                        after(c)
                    }
                    Ask.Cancel -> if (going(c)) {
                        c.cancel()
                        after(c)
                    }
                }
            }
        }

        private fun going(c: SampleCapture): Boolean = pad != null &&
            (c.state == SampleCapture.State.ARMED || c.state == SampleCapture.State.SCHEDULED || c.state == SampleCapture.State.RECORDING)

        // The input frame at [nanos]; with no clock yet, the frame after the last fed (or the first to come).
        private fun frameAt(nanos: Long): Long = frameClock?.frameAt(nanos) ?: if (fed) fedEnd else 0L

        // What the take did: capped once it started, shown as it goes, handed over once it ends.
        private fun after(c: SampleCapture) {
            val p = pad ?: return
            if (!startSeen) {
                c.started?.let { s ->
                    startSeen = true
                    // A cap below the buffer's length (the free space) ends the take there.
                    if (capped) c.stop(s + cap)
                }
            }
            when (c.state) {
                SampleCapture.State.RECORDING -> {
                    val seconds = c.frames / rate
                    if (seconds != shown) {
                        shown = seconds
                        _phase.value = SamplePhase.Recording(p, seconds, cap / rate, latched)
                    }
                }
                SampleCapture.State.DONE -> finish(c, p)
                else -> {}
            }
        }

        private fun finish(c: SampleCapture, p: PhysicalPad) {
            val ended = c.end ?: SampleCapture.End.CANCELLED
            val frames = minOf(c.frames, cap)
            val end = if (capped && ended == SampleCapture.End.STOPPED && c.frames >= cap) SampleCapture.End.LIMIT else ended
            val wasLatched = latched
            pad = null
            current = null
            open.decrementAndGet()
            _phase.value = SamplePhase.Ready
            if (end == SampleCapture.End.CANCELLED || frames <= 0) return
            // Handed over: copied on [scope], then home for a later take; the spare takes over.
            capture = spare
            spare = null
            val n = frames * channels
            val ch = channels
            handed.add {
                val all = c.take()
                val pcm = if (all.size > n) all.copyOf(n) else all
                home.add(c)
                onDone(SampleTake(p, input, pcm, ch, rate, end, wasLatched))
            }
        }

        // The takes just ended go to [scope], out of the lock: their copy and [onDone] (the
        // controller's KEEP) never hold up a block on the feeding thread.
        private fun handOver() {
            while (true) {
                val h = handed.poll() ?: return
                scope.launch {
                    // Posted even when called on the scope's own thread (Dispatchers.Main.immediate runs
                    // a launch in place): [close] and [open] finish before [onDone] can call them again.
                    yield()
                    h()
                }
            }
        }
    }

    // [a] asked at [from] Hz for an input at [to] Hz: its lengths in the new input's frames.
    private fun rescaled(a: Ask, from: Int, to: Int): Ask {
        if (from == to) return a
        fun scale(n: Long) = minOf(n * to / from, Int.MAX_VALUE.toLong())
        return when (a) {
            is Ask.Arm -> Ask.Arm(a.pad, a.nanos, a.latched, scale(a.maxFrames.toLong()).toInt(), a.threshold)
            is Ask.Schedule -> Ask.Schedule(a.pad, a.nanos, scale(a.maxFrames.toLong()).toInt(), scale(a.length))
            else -> a
        }
    }

    // The loudest sample of [n] after [gain], 0..1 of full scale, the way the take rounds it.
    private fun peak(pcm: ShortArray, n: Int, gain: Float): Float {
        val g = gain.toDouble()
        var peak = 0.0
        for (i in 0 until n) peak = maxOf(peak, abs(floor(pcm[i] * g + 0.5)))
        return (minOf(peak, 32768.0) / 32768).toFloat()
    }
}
