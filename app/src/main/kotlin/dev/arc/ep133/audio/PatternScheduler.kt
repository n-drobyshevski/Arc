package dev.arc.ep133.audio

import dev.arc.ep133.features.Arp
import dev.arc.ep133.features.ArpNote
import dev.arc.ep133.features.ArpSettings
import dev.arc.ep133.features.BeatGrid
import dev.arc.ep133.features.FrameClock
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.Pattern
import dev.arc.ep133.features.PatternPlayer
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectPatterns
import dev.arc.ep133.features.SeqNote
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TimingSettings
import dev.arc.ep133.features.TransportClock
import dev.arc.ep133.features.barFrames
import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.VoiceShape
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

/**
 * A pad's sound as the pattern plays it (an addition): [pcm] at [channels]
 * and [rate], shaped by [shape] for a pad hit and [keysShape] for a KEYS
 * note on the pad, as Live's own presses play them.
 */
class PadVoice(val pcm: ShortArray, val channels: Int, val rate: Int, val shape: VoiceShape, val keysShape: VoiceShape)

/**
 * A pattern waiting to take over a group (an addition: a pick made while
 * the sequencer plays): [pattern] plays from global tick [atTick] on.
 */
data class QueuedSwitch(val pattern: Pattern, val atTick: Long)

/**
 * What the sequencer plays (an addition): the project's [patterns], the
 * sounds on their pads ([voices]; a note on a pad not in it is told to
 * [PatternScheduler.onMissing]), [skip] (a note's id to the pass not to play,
 * [dev.arc.ep133.features.PatternRecorder.Recorded.skipPass]) and the tempo,
 * [bpm]. [queued] gives a group (0..3) the pattern that takes over from a
 * tick: its notes before the tick come from [patterns], those from it on
 * from the queued one, each at the global tick mod its own pattern's length
 * (patterns stay locked to bar 1, as arc's clock is, so a 2-bar pattern
 * switched in at an odd bar starts at its bar 2; the device starts it at
 * its bar 1). Made anew for each change, never changed in place.
 */
class SeqPlan(
    val patterns: ProjectPatterns,
    val voices: Map<PhysicalPad, PadVoice>,
    val skip: Map<Int, Long>,
    val bpm: Double,
    val queued: Map<Int, QueuedSwitch> = emptyMap(),
) {
    companion object {
        val EMPTY = SeqPlan(ProjectPatterns(), emptyMap(), emptyMap(), Tempo.DEFAULT.toDouble())
    }
}

/**
 * What the arp or note repeat plays (an addition): the [notes] held, in the
 * order pressed (latched ones too), the sounds on their pads ([voices]),
 * whether it is KEYS's arp ([keys]) or PADS's note repeat, TIMING and the
 * arp's settings, the tempo ([bpm]), the RANDOM order's [seed] and the press
 * that started the run ([pressNanos], System.nanoTime): another one starts
 * the run again, its first step on that press. Made anew for each change,
 * never changed in place.
 */
class ArpPlan(
    val notes: List<ArpNote>,
    val voices: Map<PhysicalPad, PadVoice>,
    val keys: Boolean,
    val timing: TimingSettings,
    val settings: ArpSettings,
    val bpm: Double,
    val seed: Int,
    val pressNanos: Long,
)

/** A note the arp played at [globalTick] of the pattern's clock, [gateTicks] long: for RECORD. */
class ArpStep(val note: ArpNote, val globalTick: Long, val gateTicks: Int)

/**
 * Where the transport is in time (an addition): its [clock] (ticks to mix
 * frames) through the output's stamp [frames] (mix frames to
 * System.nanoTime), so a press's time finds its tick and a tick its time.
 * [tickAt] and [nanosOf] are by the stamp, when the output presents a tick;
 * a wireless output's stamp may leave part of its delay out, which
 * [heardTickAt] and [heardNanosOf] add ([OutputDelay]).
 */
class Timeline(val clock: TransportClock, val frames: FrameClock) {
    /** The tick heard at [nanos] (System.nanoTime), fractional; below 0 in the count-in. */
    fun tickAt(nanos: Long): Double =
        (frames.frame + (nanos - frames.nanos) / 1e9 * frames.rate - clock.anchorFrame) / clock.framesPerTick

    /**
     * The tick the player hears at [nanos], when the stamp leaves [delayNs] of
     * the output's delay out ([OutputDelay]): the one it has that long before. What the
     * eye follows and where a live press lands go by this; the notes
     * themselves are not moved. [delayNs] 0 is [tickAt].
     */
    fun heardTickAt(nanos: Long, delayNs: Long): Double = if (delayNs == 0L) tickAt(nanos) else tickAt(nanos) - OutputDelay.ticks(delayNs, clock.bpm)

    /** The click's beats: beat 0 on tick 0, the count-in's −4..−1. */
    fun grid(): BeatGrid = clock.beatGrid(frames)

    /** The mix frame tick [t] plays at. */
    fun frameOfTick(t: Long): Long = clock.frameOf(t)

    /** When the stamp has tick [t] presented (System.nanoTime). */
    fun nanosOf(t: Long): Long = clock.nanosOf(t, frames)

    /** When tick [t] is heard when the stamp leaves [delayNs] out: [delayNs] after [nanosOf]. */
    fun heardNanosOf(t: Long, delayNs: Long): Long = nanosOf(t) + delayNs
}

/**
 * What schedules into Live's mix ahead of the output (an addition): told by
 * [LiveAudio] on the output's thread, before each block ([fill]) and with the
 * output's stamp ([clock]); [lost] on any thread.
 */
interface MixScheduler {
    /** Before a block: [rendered] mix frames are done, at [rate]; what falls ahead goes to [sink]. */
    fun fill(sink: ScheduleSink, rendered: Long, rate: Int)

    /** When a mix frame is heard ([LiveListener.clock]). */
    fun clock(c: FrameClock)

    /** The mix's frames were let go of or count anew (the stream reopened or rerouted, another engine): it re-anchors. */
    fun lost()

    /** Whether it plays (or counts in, or the arp plays): the output's stamp is wanted, and focus kept. */
    val running: Boolean

    /** Whether RECORD is armed, so a pad may start it: the output's stamp is wanted, not focus. */
    val armed: Boolean
}

/**
 * The pattern sequencer (an addition): plays the plan's patterns into Live's
 * mix on the output's own thread, with no thread of its own. Before each
 * block ([fill]) it sends the notes that start in the next [lookaheadNs]
 * as timed starts ([ScheduleSink.startAt]), each to its mix frame, and the
 * releases of the gates that end in it ([ScheduleSink.releaseAt]), so a note
 * plays to the frame however late the thread runs, as long as it runs within
 * the lookahead (later, it plays late, never not at all).
 *
 * The clock is arc's own ([TransportClock]): [play] anchors tick 0 a
 * lookahead (and the count-in's bars, and any lead asked for) after the
 * frames rendered so far, or on the frame heard at a pad's press (RECORD
 * armed: the output's stamps are kept while stopped for it, and forgotten
 * once disarmed). A new [SeqPlan.bpm] takes over where scheduling
 * has got to. Notes are counted by tick across windows, so a tempo change's
 * rounding neither repeats a note nor skips one.
 *
 * That clock follows nothing outside the phone (only its tempo can be the
 * EP-133's), so over a wireless output ([OutputDelay]) the notes are not sent
 * earlier: every sound the phone makes is as late as the next, and the pattern
 * stays in step with the click and with what a press plays. What moves is what
 * is heard against the stamp: the [timeline]'s [Timeline.heardTickAt] is what
 * the playhead and a live press go by. (The click that follows the EP-133's
 * clock does line up with outside sound, and is sent earlier.)
 *
 * A pad hit plays as voice "live:<group>:<offset>", the pad's own key (the
 * rings light as for a press); a KEYS note as "seq:<group>:<offset>:<midi>".
 * Each gets a tag of its own below 0, so its release lets go of that voice
 * only (a press of the same pad plays on) and it never counts as a press's
 * latency.
 *
 * The arp and note repeat ([arp], [ArpRunner]) play from here too, Live's
 * output having room for one scheduler: on the pattern's grid while the
 * transport runs, else on a clock of their own from the press.
 *
 * [stop] drops what is still waiting ([ScheduleSink.flushTimed]) and lets go
 * of every note still sounding. [lost] does the same, then waits for the
 * output's next stamp and re-anchors on it, keeping the tick heard then:
 * a short gap, and the beat goes on where it was.
 *
 * A group whose plan has a [SeqPlan.queued] switch plays its old pattern
 * up to the switch's tick and the queued one from it, in the same window:
 * the switch is as exact as any note. Notes of the old pattern still
 * sounding at the switch are let go of at their own gates.
 *
 * [plan] and the commands may come from any thread; [fill] and [clock] come
 * on the output's thread, and touch the rest. Steady scheduling allocates
 * only the notes [PatternPlayer.window] finds (and, with a switch queued,
 * the queued patterns' own, once a plan).
 */
class PatternScheduler(
    private val lookaheadNs: Long = LOOKAHEAD_NS,
    // System.nanoTime, on the output's thread: how long a press has waited for a stamp.
    private val nanos: () -> Long = System::nanoTime,
) : MixScheduler {
    companion object {
        /** How far ahead of the mix notes are sent: past a stalled thread or two. */
        const val LOOKAHEAD_NS = 50_000_000L

        /** How long a press with no stamp waits for one before the frames rendered stand in for it. */
        const val PRESS_WAIT_NS = 500_000_000L

        // A gate whose release isn't sent yet.
        private const val UNSENT = Long.MIN_VALUE

        // The stamp drifted this far (in ms) from the timeline shown: shown anew.
        private const val DRIFT_MS = 1

        // Notes by tick, then group, as [PatternPlayer.window] gives them.
        private val BY_TICK = Comparator<SeqNote> { a, b -> if (a.startTick != b.startTick) a.startTick.compareTo(b.startTick) else a.group - b.group }
    }

    /** What plays: published by the main thread, read by the output's on each block. */
    @Volatile var plan: SeqPlan = SeqPlan.EMPTY

    /**
     * A note whose pad has no [PadVoice] in the plan (the controller loads
     * it), once a plan, on the output's thread: hand it on, don't load it there.
     */
    var onMissing: (PhysicalPad) -> Unit = {}

    /** What the arp or note repeat plays: published by the main thread; null (or no notes) stops it. */
    @Volatile var arp: ArpPlan? = null

    /**
     * A step the arp played while the pattern's clock runs, on the output's
     * thread once it is mixed (one STOP or PLAY dropped before never is):
     * hand it on (RECORD takes it), don't record it there.
     */
    var onArpStep: ((ArpStep) -> Unit)?
        get() = arpRunner.onStep
        set(value) {
            arpRunner.onStep = value
        }

    private val _timeline = MutableStateFlow<Timeline?>(null)

    /**
     * Where the transport is in heard time: null while stopped and until the
     * output's first stamp after [play]; new only when the anchor, the tempo
     * or the output changes, not every block.
     */
    val timeline: StateFlow<Timeline?> = _timeline

    private sealed interface Ask {
        class Play(val countInBars: Int, val extraLeadNs: Long, val atNanos: Long?) : Ask

        data object Stop : Ask
    }

    private val asks = ConcurrentLinkedQueue<Ask>()
    private val lostAsked = AtomicBoolean(false)
    @Volatile private var on = false

    /** The transport plays (or counts in), or the arp does: the output's stamp is wanted, and focus kept. */
    override val running: Boolean get() = on || arp?.notes?.isNotEmpty() == true

    /** The transport plays (or counts in); the arp alone doesn't count. */
    val playing: Boolean get() = on

    /**
     * The first tick a plan published now is sure to reach before it is
     * sent (an addition, for a [SeqPlan.queued] switch while it plays): a
     * lookahead past the first tick not sent yet, room for the blocks sent
     * meanwhile. A switch at an earlier tick would find the old pattern's
     * notes from it sent already, and the queued one's never. [Long.MIN_VALUE]
     * until the transport's first block is sent.
     */
    @Volatile var freeTick: Long = Long.MIN_VALUE
        private set

    /** RECORD is armed (set by the main thread): the output's stamps keep coming while stopped, for [play] at a press. */
    @Volatile override var armed = false

    // Everything below is the output thread's.

    // The anchored clock (null while stopped), and the output's stamp since it was anchored.
    private var clock: TransportClock? = null
    private var stamp: FrameClock? = null
    // The output's latest stamp, stopped too: where a press is heard, for an anchor on it.
    private var latest: FrameClock? = null
    // A press that came with no stamp: no scheduling until the next stamp anchors tick 0 where it was heard.
    private var pressAsk: Ask.Play? = null

    // Lost: no scheduling until the next stamp re-anchors; [lostTick] is where it was, should no timeline say.
    private var waiting = false
    private var lostTick = 0.0

    // The first tick not yet sent, and the mix frame scheduling has got to.
    private var nextTick = 0L
    private var scheduledTo = 0L
    private var lastRendered = 0L

    private var nextTag = -1L
    private val notes = ArrayList<SeqNote>()
    private val arpRunner = ArpRunner { nextTag-- }

    // The notes sent and not over: key, tag, end tick, and the frame their release was sent for (UNSENT).
    private var held = 0
    private var heldKeys = arrayOfNulls<String>(64)
    private var heldTags = LongArray(64)
    private var heldEnds = LongArray(64)
    private var heldSent = LongArray(64)

    // The pads told to [onMissing] for [missingOf].
    private var missingOf: SeqPlan? = null
    private val missing = HashSet<PhysicalPad>()

    // The queued patterns of [switchOf] as a project's patterns (a blank one for a group with none), and their notes in a window.
    private var switchOf: SeqPlan? = null
    private var switched = ProjectPatterns()
    private val switchedNotes = ArrayList<SeqNote>()

    // Keys and pads made once, so a note finds them without a new string or object.
    private val pads = Array(4) { g -> Array(12) { o -> PhysicalPad(g, o) } }
    private val padKeys = Array(4) { g -> Array(12) { o -> "live:$g:$o" } }
    private val noteKeys = arrayOfNulls<String>(4 * 12 * 128)

    /**
     * Starts the transport, from tick 0, [countInBars] bars after the next
     * block's lookahead, and [extraLeadNs] later still (time for a count-in's
     * click to start). Picked up on the next [fill]; playing already, it starts again.
     *
     * [atNanos] (System.nanoTime, a pad's press): tick 0 is the frame heard
     * then, by the output's latest stamp, and the timeline is out at once.
     * What falls before the frames rendered by more than the lookahead isn't
     * played (the first notes of other groups may play a little late, or not
     * at all). No stamp yet: it waits for the next one, which tells where
     * the press was heard ([PRESS_WAIT_NS] at most; then the frames rendered
     * are taken as heard at once), the timeline out with it.
     */
    fun play(countInBars: Int, extraLeadNs: Long = 0, atNanos: Long? = null) {
        on = true
        asks.add(Ask.Play(maxOf(countInBars, 0), maxOf(extraLeadNs, 0L), atNanos))
    }

    /** Stops it: on the next [fill], what waits is dropped and the notes sounding let go of. */
    fun stop() {
        on = false
        asks.add(Ask.Stop)
    }

    override fun lost() {
        lostAsked.set(true)
    }

    override fun fill(sink: ScheduleSink, rendered: Long, rate: Int) {
        // Taken first: a loss told before a start or a stop here is the old run's, not the new anchor's.
        val lost = lostAsked.getAndSet(false)
        // The arp's frames are gone too, whatever the transport does: a loss, or frames counted anew.
        val arpLost = lost || rendered < lastRendered
        // The arp's steps mixed by now go to RECORD, before a flush below drops those not yet.
        arpRunner.mixed(rendered, arpLost)
        fillPattern(sink, rendered, rate, lost)
        val c = clock
        arpRunner.fill(sink, rendered, rate, lookaheadNs * rate / 1_000_000_000L, arp, c?.takeIf { !waiting }, c != null && waiting, latest, arpLost)
    }

    // The pattern's part of [fill]: the transport's asks, its anchor and the notes and gates of this window.
    private fun fillPattern(sink: ScheduleSink, rendered: Long, rate: Int, lost: Boolean) {
        var lostNow = lost
        // A stamp of frames counted before (a loss, another rate, from 0 again) doesn't find a press,
        // nor one from before the clock was last wanted (disarmed and stopped, the arp off: none came since).
        if (lostNow || rendered < lastRendered || latest?.rate != rate || !armed && !running) latest = null
        while (true) {
            when (val a = asks.poll() ?: break) {
                is Ask.Play -> {
                    flush(sink)
                    freeTick = Long.MIN_VALUE
                    anchor(a, rendered, rate)
                    lostNow = false
                }
                Ask.Stop -> {
                    flush(sink)
                    freeTick = Long.MIN_VALUE
                    clock = null
                    stamp = null
                    waiting = false
                    pressAsk = null
                    _timeline.value = null
                    lostNow = false
                }
            }
        }
        var c = clock
        // Lost, or the frames count anew (another rate, or from 0 again): what was sent is gone.
        if (c != null && !waiting && (lostNow || rate != c.rate || rendered < lastRendered)) {
            flush(sink)
            lostTick = c.tickAt(lastRendered)
            waiting = true
            stamp = null
        }
        lastRendered = rendered
        val press = pressAsk
        if (c != null && press != null) {
            val now = nanos()
            if (now - press.atNanos!! < PRESS_WAIT_NS) return
            // No stamp all that while: the frames rendered are taken as heard now.
            c = TransportClock(rendered - (now - press.atNanos) * rate / 1_000_000_000L + barFrames(press.countInBars, c.bpm, rate), rate, c.bpm)
            clock = c
            nextTick = firstTick(c, rendered - lookaheadNs * rate / 1_000_000_000L)
            scheduledTo = rendered
            waiting = false
            pressAsk = null
        }
        if (c == null || waiting) return
        val p = plan
        val bpm = p.bpm
        if (bpm > 0 && bpm != c.bpm) {
            c = c.retempo(maxOf(scheduledTo, rendered), bpm)
            clock = c
            // Not out yet: below, once this block is sent.
            if (_timeline.value != null) publish()
        }
        val ahead = lookaheadNs * rate / 1_000_000_000L
        val to = rendered + ahead
        // From the first tick not sent; one fallen further behind than the lookahead is let go.
        val from = maxOf(c.frameOf(nextTick), rendered - ahead)
        if (to > from) {
            PatternPlayer.window(p.patterns, c, from, to, p.skip, notes)
            if (p.queued.isNotEmpty()) switchIn(p, c, from, to)
            for (i in notes.indices) start(sink, p, notes[i])
            nextTick = firstTick(c, to)
        }
        freeTick = maxOf(nextTick, firstTick(c, to + ahead))
        scheduledTo = to
        releases(sink, c, to, rendered)
        // Out once what fell behind the mix at an anchor on a press is sent: a press told it after that isn't sent again.
        if (_timeline.value == null) publish()
    }

    // [notes] (the plan's patterns' window) with each queued group's notes from its switch's tick on taken from the queued pattern instead.
    private fun switchIn(p: SeqPlan, c: TransportClock, from: Long, to: Long) {
        if (switchOf !== p) {
            switchOf = p
            var q = ProjectPatterns()
            for ((g, s) in p.queued) if (g in 0..3) q = q.with(g, s.pattern)
            switched = q
        }
        PatternPlayer.window(switched, c, from, to, emptyMap(), switchedNotes)
        var k = 0
        for (i in notes.indices) {
            val n = notes[i]
            val s = p.queued[n.group]
            if (s == null || n.startTick < s.atTick) notes[k++] = n
        }
        while (notes.size > k) notes.removeAt(notes.lastIndex)
        for (i in switchedNotes.indices) {
            val n = switchedNotes[i]
            if (n.startTick >= p.queued.getValue(n.group).atTick) notes += n
        }
        notes.sortWith(BY_TICK)
    }

    override fun clock(c: FrameClock) {
        latest = c
        val t = clock ?: return
        val press = pressAsk
        if (press != null) {
            // The press that came with no stamp: tick 0 on the frame heard then, sent from the next block
            // (up to a lookahead behind the mix, as at a press with a stamp), and the timeline out after it.
            val n = TransportClock(c.frameAt(press.atNanos!!) + barFrames(press.countInBars, t.bpm, c.rate), c.rate, t.bpm)
            clock = n
            stamp = c
            nextTick = firstTick(n, lastRendered - lookaheadNs * c.rate / 1_000_000_000L)
            scheduledTo = lastRendered
            waiting = false
            pressAsk = null
            return
        }
        if (waiting) {
            // The tick heard at the new stamp's moment, through the timeline before the loss.
            val tick = _timeline.value?.takeIf { it.clock === t }?.tickAt(c.nanos)
            val n = if (tick != null) t.rebase(c.frame, tick, c.rate) else t.rebase(lastRendered, lostTick, c.rate)
            clock = n
            nextTick = firstTick(n, lastRendered)
            scheduledTo = lastRendered
            waiting = false
        }
        stamp = c
        val shown = _timeline.value
        // A new anchor or tempo, or the output's stamp drifted from the one shown.
        if (shown == null || shown.clock !== clock || abs(shown.frames.frameAt(c.nanos) - c.frame) > c.rate.toLong() * DRIFT_MS / 1000) publish()
    }

    private fun anchor(a: Ask.Play, rendered: Long, rate: Int) {
        val bpm = plan.bpm.takeIf { it > 0 } ?: Tempo.DEFAULT.toDouble()
        val at = a.atNanos
        // At a press: the frame heard then, by the latest stamp (kept, so the timeline is out at once).
        val s = latest.takeIf { at != null }
        val start = when {
            at == null -> rendered + (lookaheadNs + a.extraLeadNs) * rate / 1_000_000_000L
            s != null -> s.frameAt(at)
            // Till a stamp says (or [PRESS_WAIT_NS] is up).
            else -> rendered
        }
        val c = TransportClock(start + barFrames(a.countInBars, bpm, rate), rate, bpm)
        clock = c
        stamp = s
        // At a press with no stamp yet, the next one anchors it ([clock]).
        pressAsk = a.takeIf { at != null && s == null }
        waiting = pressAsk != null
        // At a press, notes up to a lookahead behind the mix still go (late); nothing before.
        nextTick = firstTick(c, if (at != null) rendered - lookaheadNs * rate / 1_000_000_000L else rendered)
        scheduledTo = rendered
        lastRendered = rendered
        // Out at the end of this block's [fill], with a stamp: after what fell behind is sent.
        _timeline.value = null
    }

    private fun publish() {
        val c = clock ?: return
        val s = stamp ?: return
        _timeline.value = Timeline(c, s)
    }

    private fun start(sink: ScheduleSink, p: SeqPlan, n: SeqNote) {
        val o = n.note.offset
        if (n.group !in 0..3 || o !in 0..11) return
        val pad = pads[n.group][o]
        val v = p.voices[pad]
        if (v == null) {
            if (missingOf !== p) {
                missingOf = p
                missing.clear()
            }
            if (missing.add(pad)) onMissing(pad)
            return
        }
        val semis = n.note.semitones
        val key = if (semis == null) padKeys[n.group][o] else noteKey(n.group, o, Keys.ROOT_NOTE + semis)
        val tag = nextTag--
        val shape = velocityShape(if (semis == null) v.shape else v.keysShape, n.note.velocity)
        val ok = sink.startAt(key, v.pcm, v.channels, v.rate, semis ?: 0, tag, shape, n.startFrame)
        if (ok) hold(key, tag, n.startTick + n.note.gate)
    }

    // The releases that fall before [to] are sent; a note is forgotten once its release is rendered.
    private fun releases(sink: ScheduleSink, c: TransportClock, to: Long, rendered: Long) {
        var k = 0
        for (i in 0 until held) {
            if (heldSent[i] == UNSENT) {
                val f = c.frameOf(heldEnds[i])
                if (f < to) {
                    sink.releaseAt(heldKeys[i]!!, f, heldTags[i])
                    heldSent[i] = f
                }
            }
            if (heldSent[i] != UNSENT && heldSent[i] < rendered) continue
            if (k != i) {
                heldKeys[k] = heldKeys[i]
                heldTags[k] = heldTags[i]
                heldEnds[k] = heldEnds[i]
                heldSent[k] = heldSent[i]
            }
            k++
        }
        for (i in k until held) heldKeys[i] = null
        held = k
    }

    // What waits is dropped first, then every note sent and not over is let go of now (the arp's too).
    private fun flush(sink: ScheduleSink) {
        sink.flushTimed()
        for (i in 0 until held) {
            sink.releaseAt(heldKeys[i]!!, VoiceMixer.NOW, heldTags[i])
            heldKeys[i] = null
        }
        held = 0
        arpRunner.flushed(sink)
    }

    private fun hold(key: String, tag: Long, endTick: Long) {
        if (held == heldKeys.size) {
            val n = held * 2
            heldKeys = heldKeys.copyOf(n)
            heldTags = heldTags.copyOf(n)
            heldEnds = heldEnds.copyOf(n)
            heldSent = heldSent.copyOf(n)
        }
        heldKeys[held] = key
        heldTags[held] = tag
        heldEnds[held] = endTick
        heldSent[held] = UNSENT
        held++
    }

    private fun noteKey(g: Int, o: Int, midi: Int): String {
        if (midi !in 0..127) return "seq:$g:$o:$midi"
        val i = (g * 12 + o) * 128 + midi
        return noteKeys[i] ?: "seq:$g:$o:$midi".also { noteKeys[i] = it }
    }

    // The first tick whose frame is at or after [frame].
    private fun firstTick(c: TransportClock, frame: Long): Long {
        var t = ceil(c.tickAt(frame)).toLong() - 1
        while (c.frameOf(t) < frame) t++
        return t
    }
}

/** [shape] for a note at [velocity] (1..127): its gain times [Arp.velocityGain]; itself at 127. */
internal fun velocityShape(shape: VoiceShape, velocity: Int): VoiceShape {
    val g = Arp.velocityGain(velocity)
    return if (g == 1f) shape else shape.copy(gain = shape.gain * g)
}

/**
 * The arp and note repeat as [PatternScheduler] plays them (an addition),
 * on the output's thread, after the pattern's notes in each [fill]. A step
 * is TIMING's interval, swung on its odd steps: while the transport runs,
 * on the pattern's own grid (step k at k × interval + swing, from tick 0),
 * else on a clock of its own whose step 0 is the frame the run's press was
 * heard at (by the output's latest stamp; with none, the frames rendered).
 * A run that starts while the transport runs plays its first step at the
 * press all the same, and the grid's after it, leaving out one less than
 * half a step on.
 *
 * KEYS (the arp) plays one note of [Arp.cycle] a step, PADS (note repeat)
 * every pad held. Each step's notes play as "arp:<group>:<offset>:<semitones>"
 * ("n" for a pad hit), with a tag of their own below 0 ([tag]), and let go
 * of [Arp.gateTicks] later. Steps are counted across windows, so a tempo or
 * plan change neither repeats a step nor skips one; a new plan's notes play
 * from the next step on (what was sent, at most a lookahead, plays out).
 * With no plan, every arp voice sounding is let go of where the mix is.
 *
 * Its gates are kept in frames, not ticks: a run may go from its own clock
 * to the pattern's (PLAY) and back (STOP) while a note sounds.
 */
internal class ArpRunner(private val tag: () -> Long) {
    /** A step played on the pattern's clock (not on the arp's own), told once mixed ([mixed]): for RECORD. */
    var onStep: ((ArpStep) -> Unit)? = null

    // The plan the cycle is of, and the run's press (a new one starts the run again); active while it plays.
    private var shown: ArpPlan? = null
    private var cycle: List<ArpNote> = emptyList()
    private var runPress = 0L
    private var active = false
    // The steps played this run: the cycle's index.
    private var count = 0L
    // The arp's own clock while the transport is stopped; whether it steps on the pattern's grid instead.
    private var free: TransportClock? = null
    private var onGrid = false
    // The next step of the grid in use, its interval and swing, and the frame scheduling has got to.
    private var nextStep = 0L
    private var stepInterval: Timing? = null
    private var stepSwing = TimingSettings.SWING_MIN
    private var scheduledTo = 0L
    // What was sent may be gone (flushed, or the frames count anew): steps go from the frames rendered again.
    private var resync = false

    // The notes sent and not over: key, tag, start and end frame, and whether the release is sent.
    private var held = 0
    private var heldKeys = arrayOfNulls<String>(32)
    private var heldTags = LongArray(32)
    private var heldStarts = LongArray(32)
    private var heldEnds = LongArray(32)
    private var heldSent = BooleanArray(32)

    // The steps for [onStep] not mixed yet, and their frames: a flush drops them, unheard, unrecorded.
    private var told = 0
    private var toldSteps = arrayOfNulls<ArpStep>(16)
    private var toldFrames = LongArray(16)

    // Keys made once: semitones -64..127 for each pad, and a pad hit's ("n").
    private val keys = arrayOfNulls<String>(4 * 12 * KEY_SEMIS)
    private val hitKeys = Array(4) { g -> Array(12) { o -> "arp:$g:$o:n" } }

    /**
     * Before a block: [rendered] frames done at [rate], [ahead] frames of
     * lookahead. [grid] is the pattern's clock while it runs and is anchored;
     * [paused] while it waits for a stamp to anchor (nothing new goes then).
     * [latest] is the output's latest stamp; [lost]: the frames count anew.
     */
    fun fill(sink: ScheduleSink, rendered: Long, rate: Int, ahead: Long, plan: ArpPlan?, grid: TransportClock?, paused: Boolean, latest: FrameClock?, lost: Boolean) {
        val to = rendered + ahead
        if (lost) flushed(sink)
        val p = plan?.takeIf { it.notes.isNotEmpty() }
        if (p == null) {
            if (active) stop(sink, rendered)
            releases(sink, to, rendered)
            return
        }
        if (paused) {
            releases(sink, to, rendered)
            return
        }
        val restart = !active || p.pressNanos != runPress
        if (p !== shown) {
            shown = p
            cycle = if (p.keys) Arp.cycle(p.notes, p.settings.order, p.settings.octaves) else Arp.repeatNotes(p.notes)
        }
        if (restart) {
            active = true
            runPress = p.pressNanos
            count = 0
        }
        val interval = p.timing.interval
        val ticks = interval.ticks
        val swing = p.timing.swing
        val gate = Arp.gateTicks(interval, p.settings.gate)
        // Where the press was heard; up to a lookahead behind the mix, as a press's pattern notes go.
        val press = if (restart) maxOf(latest?.takeIf { it.rate == rate }?.frameAt(p.pressNanos) ?: rendered, rendered - ahead) else 0L
        val c: TransportClock
        if (grid != null) {
            c = grid
            if (restart) {
                // The press plays at once; the grid's steps go on from half a step after it.
                val t = c.tickAt(press)
                step(sink, p, c, floor(t + 0.5).toLong(), press, gate, true)
                val after = t + ticks / 2.0
                nextStep = firstStep(after, ticks) { k -> k * ticks + interval.swingOffset(k, swing) >= after }
            } else if (!onGrid || resync || interval != stepInterval) {
                // From the pattern's next step on: the transport started, steps were dropped, or another interval.
                val from = if (onGrid && !resync) scheduledTo else rendered
                nextStep = firstStep(c.tickAt(from), ticks) { k -> c.frameOf(k * ticks + interval.swingOffset(k, swing)) >= from }
            }
            onGrid = true
            free = null
        } else {
            val bpm = p.bpm.takeIf { it > 0 } ?: Tempo.DEFAULT.toDouble()
            var f = free
            if (restart || f == null || onGrid || resync || f.rate != rate) {
                // Step 0 on the press, or (the transport stopped, frames lost) where the mix is.
                f = TransportClock(if (restart) press else rendered, rate, bpm)
                nextStep = 0
            } else if (interval != stepInterval) {
                // Another interval: its step 0 where the old one's next step was.
                val old = stepInterval ?: interval
                f = TransportClock(f.frameOf(nextStep * old.ticks + old.swingOffset(nextStep, stepSwing)), rate, f.bpm)
                nextStep = 0
            } else if (bpm != f.bpm) {
                f = f.retempo(maxOf(scheduledTo, rendered), bpm)
            }
            onGrid = false
            free = f
            c = f
        }
        stepInterval = interval
        stepSwing = swing
        resync = false
        var k = nextStep
        while (true) {
            val t = k * ticks + interval.swingOffset(k, swing)
            val f = c.frameOf(t)
            if (f >= to) break
            // One fallen further behind than the lookahead is let go.
            if (f >= rendered - ahead) step(sink, p, c, t, f, gate, grid != null)
            k++
        }
        nextStep = k
        scheduledTo = to
        releases(sink, to, rendered)
    }

    /** What was sent and waits is gone ([ScheduleSink.flushTimed]): every arp voice is let go of now, and steps go on from the mix. */
    fun flushed(sink: ScheduleSink) {
        for (i in 0 until held) {
            sink.releaseAt(heldKeys[i]!!, VoiceMixer.NOW, heldTags[i])
            heldKeys[i] = null
        }
        held = 0
        resync = true
        // Never heard, so not for RECORD either.
        mixed(Long.MIN_VALUE, lost = true)
    }

    /**
     * Before a block, [rendered] frames done: the steps on the pattern's
     * clock mixed by now are told ([onStep]); [lost] (the frames gone), none
     * still waiting ever is.
     */
    fun mixed(rendered: Long, lost: Boolean) {
        var k = 0
        for (i in 0 until told) {
            val s = toldSteps[i]!!
            toldSteps[i] = null
            if (lost) continue
            if (toldFrames[i] < rendered) {
                onStep?.invoke(s)
            } else {
                toldSteps[k] = s
                toldFrames[k] = toldFrames[i]
                k++
            }
        }
        told = k
    }

    // The run ends: the voices sounding are let go of at [rendered]; those sent to start later play out their gate.
    private fun stop(sink: ScheduleSink, rendered: Long) {
        for (i in 0 until held) {
            if (heldStarts[i] >= rendered || heldSent[i] && heldEnds[i] <= rendered) continue
            sink.releaseAt(heldKeys[i]!!, rendered, heldTags[i])
            heldEnds[i] = rendered
            heldSent[i] = true
        }
        active = false
        shown = null
        cycle = emptyList()
        free = null
        onGrid = false
    }

    // Step [tick] at [frame]: the arp's note, or every pad held; [recorded] on the pattern's clock.
    private fun step(sink: ScheduleSink, p: ArpPlan, c: TransportClock, tick: Long, frame: Long, gate: Int, recorded: Boolean) {
        val end = frame + floor(gate * c.framesPerTick + 0.5).toLong()
        if (p.keys) {
            Arp.noteAt(count, cycle, p.settings.order, p.seed)?.let { play(sink, p, it, tick, frame, end, gate, recorded) }
        } else {
            for (i in cycle.indices) play(sink, p, cycle[i], tick, frame, end, gate, recorded)
        }
        count++
    }

    private fun play(sink: ScheduleSink, p: ArpPlan, n: ArpNote, tick: Long, frame: Long, end: Long, gate: Int, recorded: Boolean) {
        val pad = n.pad
        val v = p.voices[pad] ?: return
        if (pad.group !in 0..3 || pad.offset !in 0..11) return
        val semis = n.semitones
        val key = key(pad.group, pad.offset, semis)
        val t = tag()
        val shape = velocityShape(if (semis == null) v.shape else v.keysShape, n.velocity)
        if (!sink.startAt(key, v.pcm, v.channels, v.rate, semis ?: 0, t, shape, frame)) return
        hold(key, t, frame, end)
        if (recorded && onStep != null) tell(ArpStep(n, tick, gate), frame)
    }

    // [s], played at [frame], for [onStep] once mixed.
    private fun tell(s: ArpStep, frame: Long) {
        if (told == toldSteps.size) {
            toldSteps = toldSteps.copyOf(told * 2)
            toldFrames = toldFrames.copyOf(told * 2)
        }
        toldSteps[told] = s
        toldFrames[told] = frame
        told++
    }

    // The releases that fall before [to] are sent; a note is forgotten once its release is rendered.
    private fun releases(sink: ScheduleSink, to: Long, rendered: Long) {
        var k = 0
        for (i in 0 until held) {
            if (!heldSent[i] && heldEnds[i] < to) {
                sink.releaseAt(heldKeys[i]!!, heldEnds[i], heldTags[i])
                heldSent[i] = true
            }
            if (heldSent[i] && heldEnds[i] < rendered) continue
            if (k != i) {
                heldKeys[k] = heldKeys[i]
                heldTags[k] = heldTags[i]
                heldStarts[k] = heldStarts[i]
                heldEnds[k] = heldEnds[i]
                heldSent[k] = heldSent[i]
            }
            k++
        }
        for (i in k until held) heldKeys[i] = null
        held = k
    }

    private fun hold(key: String, tag: Long, start: Long, end: Long) {
        if (held == heldKeys.size) {
            val n = held * 2
            heldKeys = heldKeys.copyOf(n)
            heldTags = heldTags.copyOf(n)
            heldStarts = heldStarts.copyOf(n)
            heldEnds = heldEnds.copyOf(n)
            heldSent = heldSent.copyOf(n)
        }
        heldKeys[held] = key
        heldTags[held] = tag
        heldStarts[held] = start
        heldEnds[held] = end
        heldSent[held] = false
        held++
    }

    private fun key(g: Int, o: Int, semis: Int?): String {
        if (semis == null) return hitKeys[g][o]
        if (semis !in KEY_LOW until KEY_LOW + KEY_SEMIS) return "arp:$g:$o:$semis"
        val i = (g * 12 + o) * KEY_SEMIS + semis - KEY_LOW
        return keys[i] ?: "arp:$g:$o:$semis".also { keys[i] = it }
    }

    // The first step [at] holds for, the steps rising: from two below the one at [tick] (a swing is under a step).
    private inline fun firstStep(tick: Double, ticks: Int, at: (Long) -> Boolean): Long {
        var k = floor(tick / ticks).toLong() - 2
        while (!at(k)) k++
        return k
    }

    private companion object {
        // The semitones a KEYS note's key is kept for: the keys' reach and three octaves up.
        const val KEY_LOW = -64
        const val KEY_SEMIS = 192
    }
}
