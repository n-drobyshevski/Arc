package dev.arc.ep133.controller

import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.PatternRecorder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectPatterns
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.Steps
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TimingSettings
import dev.arc.ep133.features.TransportPhase
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.screens.PressureSense
import kotlin.math.abs
import kotlin.math.roundToLong

// ---------- STEP: the pattern a step at a time while stopped, and timing correct (the device's − / +, RECORD + pad, SHIFT + TIMING) ----------

/** LEN's knob: the note lengths it snaps through, in ticks, from a tick to a bar. */
internal val STEP_GATES = listOf(1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 36, 48, 64, 72, 96, 128, 144, 192, 288, 384)

/** A step's note heard as the cursor lands on it sounds as long as its gate, but this long at least, and at most (ms). */
internal const val STEP_AUDITION_MIN_MS = 60L
internal const val STEP_AUDITION_MAX_MS = 1_500L

/** The line keeps "5 corrected" this long after the last pad held to correct while playing lets go. */
internal const val CORRECT_SHOWN_MS = 1_500L

/**
 * A note as the STEP panel names it: its [pad], and its KEYS pitch
 * ([semitones] from [Keys.ROOT_NOTE]); null for a pad hit, and for a pad's
 * every pitch where PADS picks or corrects a pad.
 */
data class StepNote(val pad: PhysicalPad, val semitones: Int?)

/**
 * STEP as Live shows it (an addition: the device's − / + and RECORD + pad
 * while stopped, SHIFT + KNOB X / Y, and SHIFT + TIMING's timing correct):
 * the panel [open] on [group]'s pattern, the cursor ([step] of [count],
 * [label] as the device shows it, at TIMING's [interval]), the group's
 * length ([bars]) and the bar the strip shows ([page], from 0), the steps
 * with notes ([occupied]), what lights on the cursor's step ([lit]:
 * (offset, semitones) pairs, a KEYS note by its pitch), the first note's
 * [velocity] and [gate] there (null: an empty step, the knobs off), the
 * panel's RECORD held ([recordHeld]), NUDGE latched and waiting for a pad
 * ([nudgePick]) and the note [picked] for − / +, CORRECT on ([correct]:
 * while playing too, where a pad held corrects as it plays), the status
 * line ([status]: "+ SNARE", "KICK → 1.2.2", "5 corrected", "KICK +1 tk";
 * null shows the cursor), and what a screen reader says of the last change
 * ([said]: "Step 1.2.1, 2 notes").
 */
data class StepUi(
    val open: Boolean = false,
    val group: Int = 0,
    val step: Int = 0,
    val count: Int = Seq.DEFAULT_BARS * Seq.TICKS_PER_BAR / Timing.DEFAULT.ticks,
    val label: String = MirrorText.stepLabel(0, Timing.DEFAULT),
    val bars: Int = Seq.DEFAULT_BARS,
    val page: Int = 0,
    val occupied: List<Boolean> = List(count) { false },
    val lit: Set<Pair<Int, Int?>> = emptySet(),
    val velocity: Int? = null,
    val gate: Int? = null,
    val recordHeld: Boolean = false,
    val nudgePick: Boolean = false,
    val picked: StepNote? = null,
    val correct: Boolean = false,
    val status: String? = null,
    val said: String? = null,
    val interval: Timing = Timing.DEFAULT,
)

/** A press in the STEP panel: the [patterns] after it, and whether the pad sounds ([plays]; a pick doesn't). */
internal data class StepPress(val patterns: ProjectPatterns, val plays: Boolean)

/** − or + in the STEP panel: the [patterns] after it, and whether the cursor moved on (its notes [audition]). */
internal data class StepMove(val patterns: ProjectPatterns, val audition: Boolean)

/** Whether the STEP panel opens with the transport in [phase]: stopped, or armed (disarmed first, as STOP does). */
internal fun stepOpens(phase: TransportPhase): Boolean = phase == TransportPhase.STOPPED || phase == TransportPhase.ARMED

/** Whether a pad or KEYS press arms the pattern's recording: RECORD armed, and not in SAMPLE ([sampling]) or the STEP panel ([stepping]). */
internal fun pressArms(phase: TransportPhase, sampling: Boolean, stepping: Boolean): Boolean = phase == TransportPhase.ARMED && !sampling && !stepping

/** Whether the arp takes a press: it is on, the press holds (a screen reader's tap, only latched), and the STEP panel isn't open ([stepping]). */
internal fun arpTakesPress(arpOn: Boolean, latch: Boolean, hold: Boolean, stepping: Boolean): Boolean = !stepping && arpOn && (hold || latch)

/** The cursor at [to] where it stood at [from] ([Steps.convert]), wrapped into the pattern's [count] steps (a shorter length). */
internal fun cursorAt(step: Int, from: Timing, to: Timing, count: Int): Int = Steps.clampStep(Steps.convert(step, from, to), count)

/** The bar the strip shows (from 0) with the cursor on [step] at [interval]: the page follows the cursor. */
internal fun stepPage(step: Int, interval: Timing): Int = step * interval.ticks / Seq.TICKS_PER_BAR

/** The first step of [bar] (from 0) at [interval]: where BAR's page puts the cursor. */
internal fun barStep(bar: Int, interval: Timing): Int = bar * Seq.TICKS_PER_BAR / interval.ticks

/** LEN's knob at [ticks]: the nearest of [STEP_GATES] (the shorter of two as near). */
internal fun snapGate(ticks: Int): Int = STEP_GATES.minBy { abs(it - ticks) }

/** How long a note [gate] ticks long sounds as the cursor auditions it, at [bpm]: 60 ms to 1.5 s. */
internal fun auditionMs(gate: Int, bpm: Double): Long =
    (gate * 60_000.0 / (bpm * Seq.PPQN)).roundToLong().coerceIn(STEP_AUDITION_MIN_MS, STEP_AUDITION_MAX_MS)

/** [note] as the status line names it: a KEYS note by [names] ("MI"), else its sound's [name] in capitals ("KICK"), else the pad ("A 7"). */
internal fun stepWord(note: StepNote, name: String?, names: NoteNames): String =
    note.semitones?.let { Keys.name(Keys.ROOT_NOTE + it, names) }
        ?: name?.trim()?.takeIf { it.isNotEmpty() }?.uppercase()
        ?: "${note.pad.groupLetter} ${note.pad.label}"

/** Whether [note] has a note among [lit] (the cursor's step, in its group): any pitch on the pad, for a PADS note (no [StepNote.semitones]). */
internal fun litHas(lit: Set<Pair<Int, Int?>>, note: StepNote): Boolean =
    if (note.semitones == null) lit.any { it.first == note.pad.offset } else note.pad.offset to note.semitones in lit

/**
 * STEP as the controller keeps it (an addition): the panel open or not, on
 * which group, the cursor of each project's groups (in memory while arc
 * runs, at the interval it was set at, so a change of interval keeps its
 * place and a shorter length wraps it), the panel's RECORD, NUDGE and the
 * note picked, CORRECT, the fingers down while the panel is open (by their
 * voice's key, "live:<group>:<offset>" or "note:<midi>"), the pads held to
 * correct while playing, and the status line. Its edits are
 * [PatternRecorder]'s step edits on the patterns handed in, at the TIMING
 * handed in, and give the patterns back; [word] names a note for the
 * status. A touch's pressure, on a phone that tells it ([PressureSense]),
 * is a placed note's velocity. Main thread only.
 */
internal class StepDesk(private val word: (StepNote) -> String) {
    /** The panel is shown. */
    var open = false
        private set

    /** The project whose cursors these are: the patterns handed in are its. */
    var project = 0

    /** The group the panel steps through. */
    var group = 0
        private set

    /** The panel's RECORD is held: a press places its note on the step. */
    var recordHeld = false
        private set

    /** NUDGE latched: a tap picks its pad instead of sounding. */
    var nudgePick = false
        private set

    /** The note − / + nudge, picked on the cursor's step; null for none. */
    var picked: StepNote? = null
        private set

    /** CORRECT on: a tap in the panel puts its pad's notes on the grid, and a pad held while playing corrects them as they pass. */
    var correct = false
        private set

    /** The panel's status line (null: the cursor shows). */
    var status: String? = null
        private set

    /** What a screen reader says of the last change. */
    var said: String? = null
        private set

    // Each project's groups' cursors, by (project, group): the step, and the interval it was set at.
    private val cursors = HashMap<Pair<Int, Int>, Pair<Int, Timing>>()
    // The fingers down while the panel is open, by voice key.
    private val down = LinkedHashMap<String, Down>()
    // The pads held to correct while playing, by "group:offset:semitones".
    private val holds = HashMap<String, CorrectHold>()
    // The notes the holds going on have corrected, for the line.
    private var corrected = 0
    private val sense = PressureSense()

    // A finger down on [note]: whether it corrects as it lets go (CORRECT on, RECORD not held), and − / +'s shifts of its notes.
    private class Down(val note: StepNote, val corrects: Boolean) {
        var shifts = 0
        var net = 0
    }

    // A pad held to correct while playing from [downAt]; [from] is the tick it has corrected to, once it holds.
    private class CorrectHold(val note: StepNote, val downAt: Long) {
        var from: Double? = null
    }

    /** Whether a pad is held to correct while playing. */
    val holding: Boolean get() = holds.isNotEmpty()

    /** The cursor on [p]'s [group] at [interval]: where it was left, kept in its place and wrapped into the pattern. */
    fun cursor(p: ProjectPatterns, interval: Timing): Int {
        val (step, at) = cursors[project to group] ?: return 0
        return cursorAt(step, at, interval, Steps.count(p.group(group), interval))
    }

    /** The panel opens on [group] of [project]'s patterns, the cursor where it was left. */
    fun open(project: Int, group: Int) {
        this.project = project
        this.group = group.coerceIn(0, 3)
        open = true
        status = null
    }

    /**
     * The panel closes (✕, PLAY, another project): the pick, NUDGE, RECORD
     * held, the fingers, the status and what a screen reader was told go
     * (and [recorder]'s run); CORRECT stays.
     */
    fun close(recorder: PatternRecorder) {
        open = false
        picked = null
        nudgePick = false
        recordHeld = false
        status = null
        said = null
        down.clear()
        recorder.endRun()
    }

    /** Live shows [group] now: the panel steps through it, at its own cursor; a pick on another group's pad goes. */
    fun group(group: Int) {
        if (group == this.group || group !in 0..3) return
        this.group = group
        picked = null
        status = null
    }

    /** The panel's RECORD down or up ([held]). */
    fun record(held: Boolean) {
        recordHeld = held
        status = null
    }

    /** NUDGE latched ([on]: a tap picks its pad) or not (the pick goes); CORRECT goes off with it on. */
    fun nudge(on: Boolean, recorder: PatternRecorder) {
        nudgePick = on
        if (on) endCorrect() else picked = null
        status = null
        recorder.endRun()
    }

    /** CORRECT on or off; either way NUDGE and the pick go, and off, the pads held to correct let go. */
    fun correct(on: Boolean, recorder: PatternRecorder) {
        if (!on) endCorrect()
        correct = on
        nudgePick = false
        picked = null
        status = null
        recorder.endRun()
    }

    /**
     * A finger down on voice [key] in the open panel, on [note] (its group
     * becomes the panel's), at the touch's [pressure] (NaN: none told). With
     * the panel's RECORD held it is placed on the cursor's step
     * ([PatternRecorder.stepPlace]) at the pressure's velocity, on a phone
     * that tells pressure (else 127). Else, with NUDGE waiting, it is picked
     * instead ([pick]) and doesn't sound; else it only sounds, and with
     * CORRECT on its notes go onto the grid as it lets go ([release]).
     */
    fun press(key: String, note: StepNote, pressure: Float, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): StepPress {
        group(note.pad.group)
        status = null
        val level = sense.level(pressure)
        if (!recordHeld && nudgePick) {
            pick(note, p, recorder, t)
            return StepPress(p, plays = false)
        }
        down[key] = Down(note, corrects = correct && !recordHeld)
        if (!recordHeld) return StepPress(p, plays = true)
        val step = cursor(p, t.interval)
        val out = recorder.stepPlace(p, note.pad, note.semitones, step, t.interval, t.swing, level?.let(::pressureVelocity) ?: 127)
        if (out !== p) {
            val w = word(note)
            status = MirrorText.stepPlaced(w)
            said = MirrorText.stepPlacedSpoken(w, MirrorText.stepLabel(step, t.interval))
        }
        return StepPress(out, plays = true)
    }

    /**
     * The finger on voice [key] up. With CORRECT on its note's notes go
     * onto the grid ([PatternRecorder.correctPad]: a tap), unless − / +
     * shifted them while it was held: that run ends instead.
     */
    fun release(key: String, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): ProjectPatterns {
        val d = down.remove(key) ?: return p
        if (d.shifts > 0) {
            recorder.endRun()
            return p
        }
        if (!d.corrects || !correct) return p
        val r = recorder.correctPad(p, d.note.pad, d.note.semitones, t.interval, t.swing)
        status = MirrorText.correctedLine(r.moved)
        said = status
        return r.patterns
    }

    /**
     * [note] picked for − / + (a long press, or a tap with NUDGE waiting),
     * when it has a note on the cursor's step; the one picked already is let
     * go of. Not with CORRECT on, where − / + shift a held pad. False when
     * nothing was picked or let go of (the note isn't on the step).
     */
    fun pick(note: StepNote, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): Boolean {
        status = null
        if (correct || note.pad.group != group || !litHas(lit(p, t), note)) return false
        picked = if (picked == note) null else note
        recorder.endRun()
        return true
    }

    /**
     * − or + ([dir] -1 or +1). With CORRECT on and a pad held, its notes a
     * tick earlier or later ([PatternRecorder.shiftPad]); else, a note
     * picked, it is nudged ([PatternRecorder.nudge]: a step on the swung
     * grid with TIMING's quantize, else a tick), the cursor following it;
     * else the cursor moves a step, wrapping round the pattern (its notes
     * are auditioned: [StepMove.audition]).
     */
    fun minusPlus(dir: Int, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): StepMove {
        status = null
        val held = down.values.lastOrNull()?.takeIf { correct }
        if (held != null) {
            val out = recorder.shiftPad(p, held.note.pad, held.note.semitones, dir)
            held.shifts++
            held.net += dir
            val w = word(held.note)
            status = MirrorText.stepShifted(w, held.net)
            said = MirrorText.stepShiftedSpoken(w, held.net)
            return StepMove(out, audition = false)
        }
        val pick = picked
        val step = cursor(p, t.interval)
        if (pick != null) {
            val r = recorder.nudge(p, pick.pad, pick.semitones, step, t.interval, t.swing, t.quantize, dir)
            setCursor(r.step, t.interval)
            val w = word(pick)
            val label = MirrorText.stepLabel(r.step, t.interval)
            status = MirrorText.stepNudged(w, label)
            said = MirrorText.stepNudgedSpoken(w, label)
            return StepMove(r.patterns, audition = false)
        }
        moveTo(step + dir, p, t)
        return StepMove(p, audition = true)
    }

    /** The strip's step [step] tapped: the cursor jumps there, and the pick goes. */
    fun jump(step: Int, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings) {
        status = null
        if (picked != null) recorder.endRun()
        picked = null
        moveTo(step, p, t)
    }

    /** BAR's page [bar] (from 0) tapped: the cursor jumps to its first step, and the pick goes. */
    fun page(bar: Int, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings) = jump(barStep(bar, t.interval), p, recorder, t)

    /** VEL's knob at [velocity] (1..127): every note on the cursor's step; nothing on an empty one. */
    fun velocity(velocity: Int, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): ProjectPatterns {
        status = null
        val step = cursor(p, t.interval)
        if (Steps.notesOn(p.group(group), step, t.interval, t.swing).isEmpty()) return p
        return recorder.stepVelocity(p, group, step, t.interval, t.swing, velocity)
    }

    /** LEN's knob at [ticks], snapped to [STEP_GATES]: every note on the cursor's step that long; nothing on an empty one. */
    fun gate(ticks: Int, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): ProjectPatterns {
        status = null
        val step = cursor(p, t.interval)
        if (Steps.notesOn(p.group(group), step, t.interval, t.swing).isEmpty()) return p
        return recorder.stepGate(p, group, step, t.interval, t.swing, snapGate(ticks))
    }

    /**
     * A pad (or a KEYS note on it) pressed at [at] while playing with CORRECT
     * on, by [key]: what it corrects is known as it is held, or let go of
     * ([holdUp]). The line counts from 0 when no other pad is held.
     */
    fun holdDown(key: String, note: StepNote, at: Long) {
        if (!correct) return
        if (holds.isEmpty()) corrected = 0
        holds[key] = CorrectHold(note, at)
        status = MirrorText.correctedLine(corrected)
    }

    /**
     * The pads held to correct while playing put their notes on the grid as
     * the playhead passes ([PatternRecorder.correctRange]), from where each
     * was pressed up to global tick [to] (a lookahead ahead) at [now];
     * [tickAt] is the tick heard at a time. A hold shorter than a tap
     * corrects nothing here ([holdUp] takes the pad's every note). All the
     * pads held together, from the first down to the last up, are one UNDO
     * step ([PatternRecorder.correctRange]'s run, ended by [holdUp] and
     * [holdsEnd]); the line counts the notes corrected.
     */
    fun held(p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings, to: Double, now: Long, tickAt: (Long) -> Double): ProjectPatterns {
        var out = p
        for (h in holds.values) {
            if (now - h.downAt < ERASE_TAP_NS) continue
            val from = h.from ?: maxOf(tickAt(h.downAt), 0.0)
            if (to <= from) continue
            val r = recorder.correctRange(out, h.note.pad, h.note.semitones, from, to, t.interval, t.swing)
            out = r.patterns
            corrected += r.moved
            h.from = to
            status = MirrorText.correctedLine(corrected)
        }
        return out
    }

    /**
     * The pad held to correct, by [key], let go of at [releasedAt]. A tap,
     * or a press while not playing ([tickAt] null), puts the pad's every
     * note on the grid ([PatternRecorder.correctPad]); held while playing,
     * it corrected its notes as they passed, up to here. The line says how
     * many, the last pad up ending the run.
     */
    fun holdUp(key: String, releasedAt: Long, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings, tickAt: ((Long) -> Double)?): ProjectPatterns {
        val h = holds.remove(key) ?: return p
        val out = if (tickAt == null || h.from == null && releasedAt - h.downAt < ERASE_TAP_NS) {
            // Part of the gesture of the pads held with it, from the first down to the last up.
            recorder.correctPad(p, h.note.pad, h.note.semitones, t.interval, t.swing, inRun = true).also { corrected += it.moved }.patterns
        } else {
            val from = h.from ?: maxOf(tickAt(h.downAt), 0.0)
            val to = tickAt(releasedAt)
            if (to > from) recorder.correctRange(p, h.note.pad, h.note.semitones, from, to, t.interval, t.swing).also { corrected += it.moved }.patterns else p
        }
        if (holds.isEmpty()) recorder.endRun()
        status = MirrorText.correctedLine(corrected)
        said = status
        return out
    }

    /** STOP: the pads held to correct let go, correcting no more (the line keeps its count a moment). */
    fun holdsEnd(recorder: PatternRecorder) {
        if (holds.isEmpty()) return
        holds.clear()
        recorder.endRun()
    }

    /** The line's "5 corrected" goes, a moment after the last pad held to correct while playing let go (not while the panel shows). */
    fun correctedShown() {
        if (holds.isEmpty() && !open) status = null
    }

    /** What Live shows: the panel and the cursor's step on [p] at TIMING [t]. */
    fun ui(p: ProjectPatterns, t: TimingSettings): StepUi {
        val pat = p.group(group)
        val interval = t.interval
        val step = cursor(p, interval)
        val notes = Steps.notesOn(pat, step, interval, t.swing)
        // The first in tick order (of two at one tick, the first recorded).
        val first = notes.minByOrNull { it.tick }
        return StepUi(
            open = open,
            group = group,
            step = step,
            count = Steps.count(pat, interval),
            label = MirrorText.stepLabel(step, interval),
            bars = pat.bars,
            page = stepPage(step, interval),
            occupied = Steps.occupied(pat, interval, t.swing).toList(),
            lit = notes.mapTo(HashSet()) { it.offset to it.semitones },
            velocity = first?.velocity,
            gate = first?.gate,
            recordHeld = recordHeld,
            nudgePick = nudgePick,
            picked = picked,
            correct = correct,
            status = status,
            said = said,
            interval = interval,
        )
    }

    // The pads on the cursor's step, as Steps.padsOn has them.
    private fun lit(p: ProjectPatterns, t: TimingSettings): Set<Pair<Int, Int?>> = Steps.padsOn(p.group(group), cursor(p, t.interval), t.interval, t.swing)

    private fun setCursor(step: Int, interval: Timing) {
        cursors[project to group] = step to interval
    }

    // The cursor onto [step], wrapped round [p]'s pattern; a screen reader hears where, and how many notes are there.
    private fun moveTo(step: Int, p: ProjectPatterns, t: TimingSettings) {
        val pat = p.group(group)
        val s = Steps.clampStep(step, Steps.count(pat, t.interval))
        setCursor(s, t.interval)
        said = MirrorText.stepSpoken(MirrorText.stepLabel(s, t.interval), Steps.notesOn(pat, s, t.interval, t.swing).size)
    }

    // CORRECT's holds let go (the line's count with them, but for the panel's own status).
    private fun endCorrect() {
        correct = false
        holds.clear()
        corrected = 0
    }
}
