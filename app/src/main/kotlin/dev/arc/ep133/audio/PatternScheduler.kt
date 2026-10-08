package dev.arc.ep133.audio

import dev.arc.ep133.features.BeatGrid
import dev.arc.ep133.features.FrameClock
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.PatternPlayer
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectPatterns
import dev.arc.ep133.features.SeqNote
import dev.arc.ep133.features.Tempo
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

/**
 * A pad's sound as the pattern plays it (an addition): [pcm] at [channels]
 * and [rate], shaped by [shape] for a pad hit and [keysShape] for a KEYS
 * note on the pad, as Live's own presses play them.
 */
class PadVoice(val pcm: ShortArray, val channels: Int, val rate: Int, val shape: VoiceShape, val keysShape: VoiceShape)

/**
 * What the sequencer plays (an addition): the project's [patterns], the
 * sounds on their pads ([voices]; a note on a pad not in it is told to
 * [PatternScheduler.onMissing]), [skip] (a note's id to the pass not to play,
 * [dev.arc.ep133.features.PatternRecorder.Recorded.skipPass]) and the tempo,
 * [bpm]. Made anew for each change, never changed in place.
 */
class SeqPlan(val patterns: ProjectPatterns, val voices: Map<PhysicalPad, PadVoice>, val skip: Map<Int, Long>, val bpm: Double) {
    companion object {
        val EMPTY = SeqPlan(ProjectPatterns(), emptyMap(), emptyMap(), Tempo.DEFAULT.toDouble())
    }
}

/**
 * Where the transport is in heard time (an addition): its [clock] (ticks to
 * mix frames) through the output's stamp [frames] (mix frames to
 * System.nanoTime), so a press's time finds its tick and a tick its time.
 */
class Timeline(val clock: TransportClock, val frames: FrameClock) {
    /** The tick heard at [nanos] (System.nanoTime), fractional; below 0 in the count-in. */
    fun tickAt(nanos: Long): Double =
        (frames.frame + (nanos - frames.nanos) / 1e9 * frames.rate - clock.anchorFrame) / clock.framesPerTick

    /** The click's beats: beat 0 on tick 0, the count-in's −4..−1. */
    fun grid(): BeatGrid = clock.beatGrid(frames)

    /** The mix frame tick [t] plays at. */
    fun frameOfTick(t: Long): Long = clock.frameOf(t)

    /** When tick [t] is heard (System.nanoTime). */
    fun nanosOf(t: Long): Long = clock.nanosOf(t, frames)
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

    /** Whether it plays (or counts in): the output's stamp is wanted, and focus kept. */
    val running: Boolean
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
 * frames rendered so far. A new [SeqPlan.bpm] takes over where scheduling
 * has got to. Notes are counted by tick across windows, so a tempo change's
 * rounding neither repeats a note nor skips one.
 *
 * A pad hit plays as voice "live:<group>:<offset>", the pad's own key (the
 * rings light as for a press); a KEYS note as "seq:<group>:<offset>:<midi>".
 * Each gets a tag of its own below 0, so its release lets go of that voice
 * only (a press of the same pad plays on) and it never counts as a press's
 * latency.
 *
 * [stop] drops what is still waiting ([ScheduleSink.flushTimed]) and lets go
 * of every note still sounding. [lost] does the same, then waits for the
 * output's next stamp and re-anchors on it, keeping the tick heard then:
 * a short gap, and the beat goes on where it was.
 *
 * [plan] and the commands may come from any thread; [fill] and [clock] come
 * on the output's thread, and touch the rest. Steady scheduling allocates
 * only the notes [PatternPlayer.window] finds.
 */
class PatternScheduler(private val lookaheadNs: Long = LOOKAHEAD_NS) : MixScheduler {
    companion object {
        /** How far ahead of the mix notes are sent: past a stalled thread or two. */
        const val LOOKAHEAD_NS = 50_000_000L

        // A gate whose release isn't sent yet.
        private const val UNSENT = Long.MIN_VALUE

        // The stamp drifted this far (in ms) from the timeline shown: shown anew.
        private const val DRIFT_MS = 1
    }

    /** What plays: published by the main thread, read by the output's on each block. */
    @Volatile var plan: SeqPlan = SeqPlan.EMPTY

    /**
     * A note whose pad has no [PadVoice] in the plan (the controller loads
     * it), once a plan, on the output's thread: hand it on, don't load it there.
     */
    var onMissing: (PhysicalPad) -> Unit = {}

    private val _timeline = MutableStateFlow<Timeline?>(null)

    /**
     * Where the transport is in heard time: null while stopped and until the
     * output's first stamp after [play]; new only when the anchor, the tempo
     * or the output changes, not every block.
     */
    val timeline: StateFlow<Timeline?> = _timeline

    private sealed interface Ask {
        class Play(val countInBars: Int, val extraLeadNs: Long) : Ask

        data object Stop : Ask
    }

    private val asks = ConcurrentLinkedQueue<Ask>()
    private val lostAsked = AtomicBoolean(false)
    @Volatile private var on = false

    override val running: Boolean get() = on

    // Everything below is the output thread's.

    // The anchored clock (null while stopped), and the output's stamp since it was anchored.
    private var clock: TransportClock? = null
    private var stamp: FrameClock? = null

    // Lost: no scheduling until the next stamp re-anchors; [lostTick] is where it was, should no timeline say.
    private var waiting = false
    private var lostTick = 0.0

    // The first tick not yet sent, and the mix frame scheduling has got to.
    private var nextTick = 0L
    private var scheduledTo = 0L
    private var lastRendered = 0L

    private var nextTag = -1L
    private val notes = ArrayList<SeqNote>()

    // The notes sent and not over: key, tag, end tick, and the frame their release was sent for (UNSENT).
    private var held = 0
    private var heldKeys = arrayOfNulls<String>(64)
    private var heldTags = LongArray(64)
    private var heldEnds = LongArray(64)
    private var heldSent = LongArray(64)

    // The pads told to [onMissing] for [missingOf].
    private var missingOf: SeqPlan? = null
    private val missing = HashSet<PhysicalPad>()

    // Keys and pads made once, so a note finds them without a new string or object.
    private val pads = Array(4) { g -> Array(12) { o -> PhysicalPad(g, o) } }
    private val padKeys = Array(4) { g -> Array(12) { o -> "live:$g:$o" } }
    private val noteKeys = arrayOfNulls<String>(4 * 12 * 128)

    /**
     * Starts the transport, from tick 0, [countInBars] bars after the next
     * block's lookahead, and [extraLeadNs] later still (time for a count-in's
     * click to start). Picked up on the next [fill]; playing already, it starts again.
     */
    fun play(countInBars: Int, extraLeadNs: Long = 0) {
        on = true
        asks.add(Ask.Play(maxOf(countInBars, 0), maxOf(extraLeadNs, 0L)))
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
        var lostNow = lostAsked.getAndSet(false)
        while (true) {
            when (val a = asks.poll() ?: break) {
                is Ask.Play -> {
                    flush(sink)
                    anchor(a, rendered, rate)
                    lostNow = false
                }
                Ask.Stop -> {
                    flush(sink)
                    clock = null
                    stamp = null
                    waiting = false
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
        if (c == null || waiting) return
        val p = plan
        val bpm = p.bpm
        if (bpm > 0 && bpm != c.bpm) {
            c = c.retempo(maxOf(scheduledTo, rendered), bpm)
            clock = c
            publish()
        }
        val ahead = lookaheadNs * rate / 1_000_000_000L
        val to = rendered + ahead
        // From the first tick not sent; one fallen further behind than the lookahead is let go.
        val from = maxOf(c.frameOf(nextTick), rendered - ahead)
        if (to > from) {
            PatternPlayer.window(p.patterns, c, from, to, p.skip, notes)
            for (i in notes.indices) start(sink, p, notes[i])
            nextTick = firstTick(c, to)
        }
        scheduledTo = to
        releases(sink, c, to, rendered)
    }

    override fun clock(c: FrameClock) {
        val t = clock ?: return
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
        val lead = (lookaheadNs + a.extraLeadNs) * rate / 1_000_000_000L
        val c = TransportClock(rendered + lead + barFrames(a.countInBars, bpm, rate), rate, bpm)
        clock = c
        stamp = null
        waiting = false
        nextTick = firstTick(c, rendered)
        scheduledTo = rendered
        lastRendered = rendered
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
        val ok = if (semis == null) {
            sink.startAt(key, v.pcm, v.channels, v.rate, 0, tag, v.shape, n.startFrame)
        } else {
            sink.startAt(key, v.pcm, v.channels, v.rate, semis, tag, v.keysShape, n.startFrame)
        }
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

    // What waits is dropped first, then every note sent and not over is let go of now.
    private fun flush(sink: ScheduleSink) {
        sink.flushTimed()
        for (i in 0 until held) {
            sink.releaseAt(heldKeys[i]!!, VoiceMixer.NOW, heldTags[i])
            heldKeys[i] = null
        }
        held = 0
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
