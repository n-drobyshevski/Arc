package dev.arc.ep133.controller

import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.Pattern
import dev.arc.ep133.features.PatternNote
import dev.arc.ep133.features.PatternRecorder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectPatterns
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TimingSettings
import dev.arc.ep133.features.TransportPhase
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** STEP as the controller keeps it: the cursor, the panel's presses, − / +, the knobs, CORRECT, and what Live shows of them. */
class StepPlanTest {
    private val kick = PhysicalPad(0, 9)
    private val snare = PhysicalPad(0, 11)
    private val keysPad = PhysicalPad(0, 6)
    private val names = mapOf(kick to "kick", snare to "snare")
    private val t = TimingSettings(Timing.SIXTEENTH, 50, true)
    private val recorder = PatternRecorder()
    private val desk = StepDesk { stepWord(it, names[it.pad], NoteNames.LETTERS) }

    private fun hit(pad: PhysicalPad) = StepNote(pad, null)

    private fun key(pad: PhysicalPad) = "live:${pad.group}:${pad.offset}"

    // Group A [bars] long with [notes].
    private fun patterns(bars: Int, vararg notes: PatternNote) = ProjectPatterns().with(0, Pattern(bars, notes.toList()))

    private fun note(tick: Int, pad: PhysicalPad, semitones: Int? = null, velocity: Int = 127, gate: Int = 24) = PatternNote(tick, pad.offset, gate, semitones, velocity)

    private fun ticks(p: ProjectPatterns, pad: PhysicalPad) = p.group(pad.group).notes.filter { it.offset == pad.offset }.map { it.tick }.sorted()

    @Test
    fun `the cursor keeps its place across intervals and wraps into a shorter pattern, and the strip's page follows it`() {
        assertEquals(2, cursorAt(5, Timing.SIXTEENTH, Timing.EIGHTH, 16))
        assertEquals(4, cursorAt(2, Timing.EIGHTH, Timing.SIXTEENTH, 32))
        assertEquals(4, cursorAt(20, Timing.SIXTEENTH, Timing.SIXTEENTH, 16))
        assertEquals(15, cursorAt(-1, Timing.SIXTEENTH, Timing.SIXTEENTH, 16))
        assertEquals(listOf(0, 1, 0, 1), listOf(stepPage(15, Timing.SIXTEENTH), stepPage(16, Timing.SIXTEENTH), stepPage(3, Timing.QUARTER), stepPage(4, Timing.QUARTER)))
        assertEquals(16, barStep(1, Timing.SIXTEENTH))
        assertEquals(12, barStep(1, Timing.EIGHTH_T))

        val p = patterns(2)
        desk.open(1, 0)
        // − from the first step wraps to the last, the page with it.
        desk.minusPlus(-1, p, recorder, t)
        desk.ui(p, t).let {
            assertEquals(31, it.step)
            assertEquals(32, it.count)
            assertEquals(1, it.page)
            assertEquals("2.4.4", it.label)
            assertEquals(2, it.bars)
        }
        desk.minusPlus(1, p, recorder, t)
        assertEquals(0, desk.ui(p, t).page)
        // At 1/8 the 7th 1/16 is the 4th step; back at 1/16 it is where it was.
        desk.jump(6, p, recorder, t)
        assertEquals(3, desk.ui(p, t.withInterval(Timing.EIGHTH)).step)
        assertEquals(6, desk.ui(p, t).step)
        // Made a bar long, the cursor on step 21 wraps to 5.
        desk.page(1, p, recorder, t)
        desk.minusPlus(1, p, recorder, t)
        desk.minusPlus(1, p, recorder, t)
        desk.minusPlus(1, p, recorder, t)
        desk.minusPlus(1, p, recorder, t)
        desk.minusPlus(1, p, recorder, t)
        assertEquals(21, desk.ui(p, t).step)
        assertEquals(5, desk.ui(patterns(1), t).step)
        // Each project's groups have their own; another project starts at the first step.
        desk.group(1)
        assertEquals(0, desk.ui(p, t).step)
        desk.group(0)
        assertEquals(21, desk.ui(p, t).step)
        desk.project = 2
        assertEquals(0, desk.ui(p, t).step)
    }

    @Test
    fun `LEN snaps to the gate table, and an audition lasts the gate at the tempo, 60 ms to 1,5 s`() {
        assertEquals(
            listOf(1, 1, 4, 24, 32, 32, 96, 384),
            listOf(0, 1, 5, 25, 30, 34, 100, 1000).map(::snapGate),
        )
        assertEquals(20, STEP_GATES.size)
        assertEquals(STEP_GATES.sorted(), STEP_GATES)
        assertEquals(125L, auditionMs(24, 120.0))
        assertEquals(60L, auditionMs(1, 120.0))
        assertEquals(1_500L, auditionMs(384, 60.0))
    }

    @Test
    fun `the status names a KEYS note by its pitch, a pad by its sound in capitals, else by the pad`() {
        assertEquals(Keys.name(Keys.ROOT_NOTE + 4, NoteNames.SOLFEGE), stepWord(StepNote(keysPad, 4), "piano", NoteNames.SOLFEGE))
        assertEquals("KICK 2", stepWord(hit(kick), " kick 2 ", NoteNames.LETTERS))
        assertEquals("A 7", stepWord(hit(kick), null, NoteNames.LETTERS))
        assertEquals("A 7", stepWord(hit(kick), "  ", NoteNames.LETTERS))
    }

    @Test
    fun `the cursor's step lights its pads, KEYS notes by pitch, and the knobs show its first note`() {
        // On step 1: a kick a little early, and two KEYS notes on one pad; the next step has another.
        val p = patterns(1, note(26, kick, velocity = 90, gate = 48), note(22, keysPad, 3, velocity = 64, gate = 12), note(24, keysPad, 5), note(48, keysPad, 7))
        desk.open(1, 0)
        desk.jump(1, p, recorder, t)
        val ui = desk.ui(p, t)
        assertEquals(setOf(kick.offset to null, keysPad.offset to 3, keysPad.offset to 5), ui.lit)
        // The first in tick order.
        assertEquals(64, ui.velocity)
        assertEquals(12, ui.gate)
        assertEquals(listOf(false, true, true) + List(13) { false }, ui.occupied)
        assertTrue(litHas(ui.lit, hit(keysPad)))
        assertTrue(litHas(ui.lit, StepNote(keysPad, 3)))
        assertFalse(litHas(ui.lit, StepNote(keysPad, 7)))
        assertFalse(litHas(ui.lit, hit(snare)))
        // An empty step: the knobs are off.
        desk.jump(5, p, recorder, t)
        assertNull(desk.ui(p, t).velocity)
        assertNull(desk.ui(p, t).gate)
        assertSame(p, desk.velocity(80, p, recorder, t))
    }

    @Test
    fun `a press places its note only while the panel's RECORD is held`() {
        val p = patterns(1)
        desk.open(1, 0)
        desk.jump(4, p, recorder, t)
        // Without RECORD it only sounds.
        val heard = desk.press(key(kick), hit(kick), Float.NaN, p, recorder, t)
        assertSame(p, heard.patterns)
        assertTrue(heard.plays)
        assertSame(p, desk.release(key(kick), p, recorder, t))
        assertFalse(recorder.canUndo)

        desk.record(true)
        val placed = desk.press(key(kick), hit(kick), Float.NaN, p, recorder, t).patterns
        assertEquals(listOf(PatternNote(96, kick.offset, 24, null, 127)), placed.group(0).notes)
        assertEquals("+ KICK", desk.status)
        assertEquals("KICK on step 1.2.1", desk.said)
        desk.release(key(kick), placed, recorder, t)
        // Again: the same pad on the step is replaced, a KEYS note beside it stays.
        val again = desk.press(key(kick), hit(kick), Float.NaN, placed, recorder, t).patterns
        val both = desk.press("note:63", StepNote(kick, 3), Float.NaN, again, recorder, t).patterns
        assertEquals(listOf(96, 96), ticks(both, kick))
        assertEquals(setOf(kick.offset to null, kick.offset to 3), desk.ui(both, t).lit)
        desk.record(false)
        assertTrue(desk.ui(both, t).occupied[4])
    }

    @Test
    fun `presses in the panel neither arm the pattern nor go to the arp`() {
        assertTrue(pressArms(TransportPhase.ARMED, sampling = false, stepping = false))
        assertFalse(pressArms(TransportPhase.ARMED, sampling = false, stepping = true))
        assertFalse(pressArms(TransportPhase.ARMED, sampling = true, stepping = false))
        assertFalse(pressArms(TransportPhase.STOPPED, sampling = false, stepping = false))
        assertTrue(arpTakesPress(arpOn = true, latch = false, hold = true, stepping = false))
        assertFalse(arpTakesPress(arpOn = true, latch = true, hold = true, stepping = true))
        assertTrue(arpTakesPress(arpOn = true, latch = true, hold = false, stepping = false))
        assertFalse(arpTakesPress(arpOn = false, latch = true, hold = true, stepping = false))
        // The panel opens stopped, or armed (disarmed first); not while the pattern runs.
        assertEquals(
            listOf(true, true, false, false),
            listOf(TransportPhase.STOPPED, TransportPhase.ARMED, TransportPhase.COUNT_IN, TransportPhase.PLAYING).map(::stepOpens),
        )
    }

    @Test
    fun `minus and plus shift a held pad with CORRECT on, else nudge the pick, else move the cursor`() {
        val p = patterns(1, note(0, kick), note(100, kick), note(48, snare))
        desk.open(1, 0)
        desk.correct(true, recorder)
        // CORRECT and a kick held: its notes a tick later, the cursor where it was.
        desk.press(key(kick), hit(kick), Float.NaN, p, recorder, t)
        val once = desk.minusPlus(1, p, recorder, t)
        assertFalse(once.audition)
        assertEquals(listOf(1, 101), ticks(once.patterns, kick))
        assertEquals("KICK +1 tk", desk.status)
        val twice = desk.minusPlus(1, once.patterns, recorder, t).patterns
        assertEquals(listOf(2, 102), ticks(twice, kick))
        assertEquals("KICK +2 tk", desk.status)
        assertEquals("KICK 2 ticks later", desk.said)
        assertEquals(0, desk.ui(twice, t).step)
        // Let go of after − / +: not corrected; the shifts were one UNDO step.
        assertSame(twice, desk.release(key(kick), twice, recorder, t))

        // CORRECT off, the kick picked: + nudges it a step later on the grid, and the cursor follows it.
        desk.correct(false, recorder)
        assertTrue(desk.pick(hit(kick), twice, recorder, t))
        assertEquals(hit(kick), desk.picked)
        val nudged = desk.minusPlus(1, twice, recorder, t)
        assertFalse(nudged.audition)
        assertEquals(listOf(24, 102), ticks(nudged.patterns, kick))
        assertEquals(1, desk.ui(nudged.patterns, t).step)
        assertEquals("KICK → 1.1.2", desk.status)
        // Picked again, it is let go of: + moves the cursor, whose notes sound.
        assertTrue(desk.pick(hit(kick), nudged.patterns, recorder, t))
        assertNull(desk.picked)
        val moved = desk.minusPlus(1, nudged.patterns, recorder, t)
        assertTrue(moved.audition)
        assertSame(nudged.patterns, moved.patterns)
        assertEquals(2, desk.ui(moved.patterns, t).step)
        assertEquals("Step 1.1.3, 1 note", desk.said)
        assertNull(desk.status)
        // A pad with no note on the cursor's step isn't picked.
        assertFalse(desk.pick(hit(kick), moved.patterns, recorder, t))

        // UNDO: the nudge, then the shifts, each one step.
        val beforeNudge = recorder.undo(moved.patterns)
        assertEquals(twice, beforeNudge)
        assertEquals(p, recorder.undo(beforeNudge!!))
    }

    @Test
    fun `NUDGE latched picks with a tap instead of sounding, and CORRECT turns it off`() {
        val p = patterns(1, note(0, kick))
        desk.open(1, 0)
        desk.nudge(true, recorder)
        val r = desk.press(key(kick), hit(kick), Float.NaN, p, recorder, t)
        assertFalse(r.plays)
        assertEquals(hit(kick), desk.picked)
        assertTrue(desk.nudgePick)
        desk.correct(true, recorder)
        assertFalse(desk.nudgePick)
        assertNull(desk.picked)
        // With CORRECT on nothing is picked: − / + shift a held pad.
        assertFalse(desk.pick(hit(kick), p, recorder, t))
        // NUDGE on turns CORRECT off.
        desk.nudge(true, recorder)
        assertFalse(desk.correct)
    }

    @Test
    fun `a tap with CORRECT on in the panel puts the pad's notes on the grid and says how many`() {
        val p = patterns(1, note(5, kick), note(50, kick), note(96, kick), note(30, snare))
        desk.open(1, 0)
        desk.correct(true, recorder)
        val r = desk.press(key(kick), hit(kick), Float.NaN, p, recorder, t)
        assertTrue(r.plays)
        val out = desk.release(key(kick), r.patterns, recorder, t)
        assertEquals(listOf(0, 48, 96), ticks(out, kick))
        assertEquals(listOf(30), ticks(out, snare))
        assertEquals("2 corrected", desk.status)
    }

    @Test
    fun `VEL and LEN set every note on the step, a turn being one UNDO step`() {
        val p = patterns(1, note(24, kick), note(24, snare), note(48, kick))
        desk.open(1, 0)
        desk.jump(1, p, recorder, t)
        val a = desk.velocity(100, p, recorder, t)
        val b = desk.velocity(80, a, recorder, t)
        assertEquals(listOf(80, 80, 127), b.group(0).notes.map { it.velocity })
        recorder.endRun()
        val c = desk.gate(30, b, recorder, t)
        assertEquals(listOf(32, 32, 24), c.group(0).notes.map { it.gate })
        assertEquals(b, recorder.undo(c))
        assertEquals(p, recorder.undo(b))
    }

    @Test
    fun `a pad held with CORRECT on while playing corrects its notes as they pass, one UNDO step`() {
        val p = patterns(1, note(5, kick), note(101, kick), note(197, kick), note(290, kick))
        desk.correct(true, recorder)
        // One tick a millisecond.
        val tickAt = { nanos: Long -> nanos / 1e6 }
        desk.holdDown("0:9:null", hit(kick), 0L)
        assertTrue(desk.holding)
        assertEquals("0 corrected", desk.status)
        // Within a tap's time it corrects nothing yet.
        assertSame(p, desk.held(p, recorder, t, 100.0, 100_000_000L, tickAt))
        val a = desk.held(p, recorder, t, 100.0, 300_000_000L, tickAt)
        assertEquals(listOf(0, 101, 197, 290), ticks(a, kick))
        val b = desk.held(a, recorder, t, 200.0, 320_000_000L, tickAt)
        assertEquals(listOf(0, 96, 192, 290), ticks(b, kick))
        assertEquals("3 corrected", desk.status)
        val c = desk.holdUp("0:9:null", 350_000_000L, b, recorder, t, tickAt)
        assertEquals(listOf(0, 96, 192, 288), ticks(c, kick))
        assertEquals("4 corrected", desk.status)
        assertFalse(desk.holding)
        // The whole hold is one UNDO step.
        assertEquals(p, recorder.undo(c))
        assertNull(recorder.undo(p))
        // The count goes a moment later (not while the panel shows).
        desk.correctedShown()
        assertNull(desk.status)
    }

    @Test
    fun `a tap with CORRECT on while playing corrects the pad's every note, and CORRECT off ends the holds`() {
        val p = patterns(1, note(5, kick), note(290, kick))
        desk.correct(true, recorder)
        val tickAt = { nanos: Long -> nanos / 1e6 }
        desk.holdDown("0:9:null", hit(kick), 0L)
        val out = desk.holdUp("0:9:null", 100_000_000L, p, recorder, t, tickAt)
        assertEquals(listOf(0, 288), ticks(out, kick))
        assertEquals("2 corrected", desk.status)
        desk.holdDown("0:9:null", hit(kick), 0L)
        desk.correct(false, recorder)
        assertFalse(desk.holding)
        // CORRECT off, a press holds nothing.
        desk.holdDown("0:9:null", hit(kick), 0L)
        assertFalse(desk.holding)
    }

    @Test
    fun `closing lets go of the pick, NUDGE, RECORD and the status, and keeps CORRECT`() {
        val p = patterns(1, note(0, kick))
        desk.open(1, 0)
        desk.record(true)
        desk.press(key(kick), hit(kick), Float.NaN, p, recorder, t)
        desk.record(false)
        desk.pick(hit(kick), p, recorder, t)
        desk.correct(true, recorder)
        desk.close(recorder)
        val ui = desk.ui(p, t)
        assertFalse(ui.open)
        assertFalse(ui.recordHeld)
        assertFalse(ui.nudgePick)
        assertNull(ui.picked)
        assertNull(ui.status)
        // Nor is the placement told again as the panel opens anew.
        assertNull(ui.said)
        assertTrue(ui.correct)
        // Another group shown: the pick on this one goes.
        desk.open(1, 0)
        desk.correct(false, recorder)
        desk.pick(hit(kick), p, recorder, t)
        desk.group(1)
        assertNull(desk.picked)
        assertEquals(1, desk.ui(p, t).group)
    }
}
