package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PatternRecorderTest {
    private val a3 = PhysicalPad(0, 3)
    private val a4 = PhysicalPad(0, 4)
    private val b0 = PhysicalPad(1, 0)
    private val sixteenth = Timing.SIXTEENTH

    /** [pad] played at [tick] and heard then, on the 1/16 grid unless [timing] says otherwise. */
    private fun PatternRecorder.hit(p: ProjectPatterns, pad: PhysicalPad, tick: Double, timing: Timing = sixteenth, semitones: Int? = null) =
        noteOn(p, pad, semitones, tick, tick, timing)

    private fun ticks(p: ProjectPatterns, g: Int = 0) = p.group(g).notes.map { it.tick }

    @Test
    fun `a press goes to the nearest grid tick, and one on the length wraps to 0`() {
        val r = PatternRecorder()
        var p = r.punchIn(ProjectPatterns(), fromStop = true, autoLength = false)
        p = r.hit(p, a3, 101.0).patterns
        assertEquals(listOf(96), ticks(p))
        // 380 snaps to 384, the length: tick 0 of the next pass.
        p = r.hit(p, a4, 380.0).patterns
        assertEquals(listOf(96, 0), ticks(p))
        // A later pass lands on the same pattern ticks.
        p = r.hit(p, b0, 384.0 * 5 + 50).patterns
        assertEquals(listOf(48), ticks(p, 1))
        assertEquals(PatternNote(96, 3, 24, id = 1), p.group(0).notes[0])
    }

    @Test
    fun `a press half a step before the count-in ends records at 0, earlier ones nothing`() {
        val r = PatternRecorder()
        val p0 = r.punchIn(ProjectPatterns(), fromStop = true, autoLength = false)
        val at0 = r.hit(p0, a3, -12.0)
        assertEquals(listOf(0), ticks(at0.patterns))
        val early = r.hit(at0.patterns, a3, -12.5)
        assertEquals(0, early.id)
        assertEquals(at0.patterns, early.patterns)
        assertNull(early.skipPass)
        // OFF: half a tick.
        assertEquals(0, r.hit(p0, a3, -0.6, Timing.OFF).id)
        assertEquals(listOf(0), ticks(r.hit(p0, a3, -0.5, Timing.OFF).patterns))
    }

    @Test
    fun `timing OFF records the tick played`() {
        val r = PatternRecorder()
        val p = r.hit(ProjectPatterns(), a3, 101.4, Timing.OFF).patterns
        assertEquals(listOf(101), ticks(p))
    }

    @Test
    fun `a note on the same pad and pitch at the same tick replaces the old one`() {
        val r = PatternRecorder()
        var p = r.hit(ProjectPatterns(), a3, 96.0).patterns
        p = r.hit(p, a3, 100.0).patterns
        assertEquals(listOf(96), ticks(p))
        assertEquals(2, p.group(0).notes[0].id)
        // Another pitch on the pad, or another pad, is another note.
        p = r.hit(p, a3, 96.0, semitones = 2).patterns
        p = r.hit(p, a4, 96.0).patterns
        assertEquals(3, p.group(0).notes.size)
        // OFF: within 6 ticks, round the loop too.
        var off = r.hit(ProjectPatterns(), a3, 100.0, Timing.OFF).patterns
        off = r.hit(off, a3, 106.0, Timing.OFF).patterns
        assertEquals(listOf(106), ticks(off))
        off = r.hit(off, a3, 113.0, Timing.OFF).patterns
        assertEquals(listOf(106, 113), ticks(off))
        off = r.hit(ProjectPatterns(), a3, 382.0, Timing.OFF).patterns
        off = r.hit(off, a3, 384.0 + 2, Timing.OFF).patterns
        assertEquals(listOf(2), ticks(off))
        // Notes left past the end aren't played: nothing played replaces them.
        val past = ProjectPatterns().with(0, Pattern(1, listOf(PatternNote(500, 3, 24), PatternNote(386, 3, 24))))
        assertEquals(listOf(500, 386, 0), ticks(r.hit(past, a3, 0.0).patterns))
        assertEquals(listOf(500, 386, 2), ticks(r.hit(past, a3, 2.0, Timing.OFF).patterns))
    }

    @Test
    fun `a note the grid puts after it was heard skips that pass`() {
        val r = PatternRecorder()
        // Heard at 380, snapped to 384: the next pass's tick 0 would play it again at once.
        val late = r.noteOn(ProjectPatterns(), a3, null, 380.0, 380.0, sixteenth)
        assertEquals(1L, late.skipPass)
        assertEquals(3L, r.noteOn(ProjectPatterns(), a3, null, 384.0 * 3 + 90, 384.0 * 3 + 90, sixteenth).skipPass)
        // Snapped back to before it was heard: nothing to skip.
        assertNull(r.noteOn(ProjectPatterns(), a3, null, 101.0, 101.0, sixteenth).skipPass)
        assertNull(r.noteOn(ProjectPatterns(), a3, null, 96.0, 96.0, sixteenth).skipPass)
        // Heard after where it snaps to (the press time was early): nothing.
        assertNull(r.noteOn(ProjectPatterns(), a3, null, 90.0, 97.0, sixteenth).skipPass)
        assertEquals(0L, r.noteOn(ProjectPatterns(), a3, null, 90.0, 90.0, sixteenth).skipPass)
    }

    @Test
    fun `a note's gate runs from its grid start to the release`() {
        val r = PatternRecorder()
        val on = r.hit(ProjectPatterns(), a3, 101.0)
        assertEquals(24, on.patterns.group(0).notes[0].gate)
        assertEquals(44, r.noteOff(on.patterns, on.id, 140.2).group(0).notes[0].gate)
        // At least a tick; at most the length.
        val short = r.hit(ProjectPatterns(), a3, 101.0)
        assertEquals(1, r.noteOff(short.patterns, short.id, 96.2).group(0).notes[0].gate)
        val long = r.hit(ProjectPatterns(), a3, 101.0)
        assertEquals(384, r.noteOff(long.patterns, long.id, 96.0 + 2000).group(0).notes[0].gate)
        // Snapped across the wrap: from the next pass's 0.
        val wrap = r.hit(ProjectPatterns(), a3, 380.0)
        assertEquals(16, r.noteOff(wrap.patterns, wrap.id, 400.0).group(0).notes[0].gate)
        // A note no longer known (id 0, or gone): nothing changes.
        assertEquals(on.patterns, r.noteOff(on.patterns, 0, 200.0))
        assertEquals(on.patterns, r.noteOff(on.patterns, 99, 200.0))
    }

    @Test
    fun `a release after an undo goes from where the note sits, round the loop`() {
        val r = PatternRecorder()
        val p = ProjectPatterns().with(0, Pattern(1, listOf(PatternNote(370, 3, 24, id = 5))))
        assertEquals(30, r.noteOff(p, 5, 384.0 * 2 + 16).group(0).notes[0].gate)
    }

    @Test
    fun `groups empty at a recording from stop open with auto length, and close where it stops`() {
        val r = PatternRecorder()
        val start = ProjectPatterns().with(0, Pattern(1, listOf(PatternNote(0, 0, 24)))).with(1, Pattern(3))
        assertEquals(start, r.punchIn(start, fromStop = false, autoLength = true))
        assertEquals(start, r.punchIn(start, fromStop = true, autoLength = false))
        var p = r.punchIn(start, fromStop = true, autoLength = true)
        assertFalse(p.group(0).open)
        assertEquals(listOf(false, true, true, true), p.groups.map { it.open })
        assertEquals(1, p.group(1).bars)
        // In an open group the tick is the global one: no wrap.
        p = r.hit(p, PhysicalPad(2, 0), 500.0).patterns
        assertEquals(listOf(504), ticks(p, 2))
        assertEquals(2, p.group(2).bars)
        assertTrue(p.group(2).open)
        // Stopped in the 2nd bar: 2 bars. B, with no notes, goes back to its 3.
        val out = r.punchOut(p, 600.0)
        assertEquals(listOf(1, 3, 2, 1), out.groups.map { it.bars })
        assertTrue(out.groups.none { it.open })
        // The bars gone by, up to the next of 1, 2, 4 or 8.
        assertEquals(4, r.punchOut(p, 1200.0).group(2).bars)
        assertEquals(8, r.punchOut(p, 1600.0).group(2).bars)
        assertEquals(8, r.punchOut(p, 384.0 * 20).group(2).bars)
        // Never shorter than the notes in it.
        assertEquals(2, r.punchOut(p, 100.0).group(2).bars)
    }

    @Test
    fun `open groups grow to take in the playhead, and loop past 8 bars`() {
        val r = PatternRecorder()
        val p = r.punchIn(ProjectPatterns(), fromStop = true, autoLength = true)
        assertEquals(p, r.grow(p, -100.0))
        assertEquals(p, r.grow(p, 383.0))
        assertEquals(2, r.grow(p, 384.0).group(0).bars)
        assertEquals(4, r.grow(p, 1200.0).group(0).bars)
        assertEquals(8, r.grow(p, 384.0 * 7.5).group(0).bars)
        assertTrue(r.grow(p, 384.0 * 7.5).group(0).open)
        val past = r.grow(p, 384.0 * 8)
        assertEquals(8, past.group(0).bars)
        assertFalse(past.group(0).open)
        // A note past 8 bars loops into the closed 8.
        assertEquals(listOf(96), ticks(r.hit(p, a3, 384.0 * 8 + 96).patterns))
    }

    @Test
    fun `a group takes no more than its note cap`() {
        val r = PatternRecorder()
        val full = ProjectPatterns().with(0, Pattern(99, List(Seq.MAX_NOTES) { PatternNote(it, 0, 1) }))
        val more = r.hit(full, a3, 100_000.0)
        assertEquals(0, more.id)
        assertEquals(full, more.patterns)
        // Replacing a note still fits.
        assertNotEquals(0, r.hit(full, PhysicalPad(0, 0), 96.0).id)
    }

    @Test
    fun `undo takes back a pass at a time`() {
        val r = PatternRecorder()
        assertFalse(r.canUndo)
        assertNull(r.undo(ProjectPatterns()))
        val empty = ProjectPatterns()
        var p = r.punchIn(empty, fromStop = true, autoLength = false)
        assertFalse(r.canUndo)
        p = r.hit(p, a3, 0.0).patterns
        assertTrue(r.canUndo)
        p = r.hit(p, a4, 96.0).patterns
        val firstPass = p
        r.passed(0, 1)
        // The same pass again doesn't mark another.
        p = r.hit(p, a3, 384.0 + 192).patterns
        r.passed(0, 1)
        p = r.hit(p, a4, 384.0 + 288).patterns
        assertEquals(firstPass, r.undo(p))
        assertEquals(empty, r.undo(firstPass))
        assertNull(r.undo(empty))
        assertFalse(r.canUndo)
    }

    @Test
    fun `each erase, clear, length change or double is its own checkpoint`() {
        val r = PatternRecorder()
        val p0 = ProjectPatterns().with(0, Pattern(1, listOf(PatternNote(0, 3, 24), PatternNote(96, 4, 24))))
        val p1 = r.erasePad(p0, a3)
        val p2 = r.setLength(p1, 0, 2)
        val p3 = r.double(p2, 0)
        val p4 = r.clear(p3, null)
        // Nothing to erase: no checkpoint.
        assertEquals(p4, r.erasePad(p4, a3))
        // Recorded after an erase: a checkpoint of its own.
        val p5 = r.hit(p4, a3, 0.0).patterns
        assertEquals(p4, r.undo(p5))
        assertEquals(p3, r.undo(p4))
        assertEquals(p2, r.undo(p3))
        assertEquals(p1, r.undo(p2))
        assertEquals(p0, r.undo(p1))
        assertNull(r.undo(p0))
    }

    @Test
    fun `at most maxUndo checkpoints are kept`() {
        val r = PatternRecorder(maxUndo = 2)
        val p0 = ProjectPatterns()
        val p1 = r.setLength(p0, 0, 2)
        val p2 = r.setLength(p1, 0, 3)
        val p3 = r.setLength(p2, 0, 4)
        assertEquals(p2, r.undo(p3))
        assertEquals(p1, r.undo(p2))
        assertNull(r.undo(p1))
    }

    @Test
    fun `an undo of an auto length recording closes the groups again`() {
        val r = PatternRecorder()
        val start = ProjectPatterns().with(1, Pattern(3))
        var p = r.punchIn(start, fromStop = true, autoLength = true)
        p = r.hit(p, b0, 500.0).patterns
        p = r.punchOut(p, 600.0)
        assertEquals(start, r.undo(p))
    }

    @Test
    fun `erasing a pad takes all its notes, or one pitch's`() {
        val r = PatternRecorder()
        val p = ProjectPatterns().with(
            0,
            Pattern(1, listOf(PatternNote(0, 3, 24), PatternNote(96, 3, 24, semitones = 2), PatternNote(192, 3, 24, semitones = 5), PatternNote(0, 4, 24))),
        )
        assertEquals(listOf(4), r.erasePad(p, a3).group(0).notes.map { it.offset })
        assertEquals(listOf(0, 192, 0), r.erasePad(p, a3, semitones = 2).group(0).notes.map { it.tick })
    }

    @Test
    fun `erasing while playing takes the notes the playhead passes, round the loop`() {
        val r = PatternRecorder()
        val notes = listOf(PatternNote(10, 3, 24), PatternNote(200, 3, 24), PatternNote(370, 3, 24), PatternNote(380, 3, 24), PatternNote(380, 4, 24))
        val p = ProjectPatterns().with(0, Pattern(1, notes))
        // 760..780 is 376..12 of the pattern.
        assertEquals(listOf(200, 370, 380), ticks(r.eraseRange(p, a3, null, 760.0, 780.0)))
        assertEquals(listOf(10, 370, 380, 380), ticks(r.eraseRange(p, a3, null, 100.0, 300.0)))
        // A whole loop or more: every note on the pad.
        assertEquals(listOf(4), r.eraseRange(p, a3, null, 1000.0, 1384.0).group(0).notes.map { it.offset })
        assertEquals(p, r.eraseRange(p, a3, null, 300.0, 300.0))
        // A stretch with none of the pad's notes gives the very patterns back (nothing to publish or save).
        assertSame(p, r.eraseRange(p, a3, null, 220.0, 300.0))
        // Notes left past the end aren't played, so the playhead never passes them.
        val past = ProjectPatterns().with(0, Pattern(1, listOf(PatternNote(10, 3, 24), PatternNote(500, 3, 24))))
        assertEquals(listOf(500), ticks(r.eraseRange(past, a3, null, 760.0, 780.0)))
        assertEquals(listOf(500), ticks(r.eraseRange(past, a3, null, 0.0, 384.0)))
    }

    @Test
    fun `a pad held in erase is one checkpoint`() {
        val r = PatternRecorder()
        val p0 = ProjectPatterns().with(0, Pattern(1, listOf(PatternNote(10, 3, 24), PatternNote(100, 3, 24), PatternNote(200, 3, 24))))
        // Its first stretch passes nothing; the next ones follow on.
        var p = r.eraseRange(p0, a3, null, 0.0, 5.0)
        p = r.eraseRange(p, a3, null, 5.0, 50.0)
        p = r.eraseRange(p, a3, null, 50.0, 150.0)
        p = r.eraseRange(p, a3, null, 150.0, 250.0)
        assertTrue(p.group(0).isEmpty)
        assertEquals(p0, r.undo(p))
        assertNull(r.undo(p0))
        // Let go and held again: another gesture.
        var q = r.eraseRange(p0, a3, null, 0.0, 50.0)
        q = r.eraseRange(q, a3, null, 300.0, 384.0 + 150)
        assertEquals(listOf(100, 200), ticks(r.undo(q)!!))
    }

    @Test
    fun `clear takes the notes of a group or all, and keeps the lengths`() {
        val r = PatternRecorder()
        val p = ProjectPatterns().with(0, Pattern(2, listOf(PatternNote(0, 3, 24)))).with(1, Pattern(1, listOf(PatternNote(0, 0, 24))))
        val a = r.clear(p, 0)
        assertTrue(a.group(0).isEmpty)
        assertEquals(2, a.group(0).bars)
        assertFalse(a.group(1).isEmpty)
        val all = r.clear(p, null)
        assertTrue(all.isEmpty)
        assertEquals(listOf(2, 1, 1, 1), all.groups.map { it.bars })
    }

    @Test
    fun `a length is 1 to 99 bars, and notes past the end are kept`() {
        val r = PatternRecorder()
        val p = ProjectPatterns().with(0, Pattern(2, listOf(PatternNote(0, 3, 24), PatternNote(500, 3, 24))))
        val one = r.setLength(p, 0, 1)
        assertEquals(listOf(0, 500), ticks(one))
        assertEquals(listOf(0), one.group(0).playable().map { it.tick })
        assertEquals(listOf(0, 500), r.setLength(one, 0, 2).group(0).playable().map { it.tick })
        assertEquals(1, r.setLength(p, 0, 0).group(0).bars)
        assertEquals(99, r.setLength(p, 0, 120).group(0).bars)
        // It closes an open group.
        val open = r.punchIn(ProjectPatterns(), fromStop = true, autoLength = true)
        assertFalse(r.setLength(open, 3, 4).group(3).open)
    }

    @Test
    fun `double copies the notes into the new half, up to 99 bars`() {
        val r = PatternRecorder()
        val p = ProjectPatterns().with(0, Pattern(1, listOf(PatternNote(0, 3, 24, id = 4), PatternNote(96, 4, 12), PatternNote(500, 5, 24))))
        val d = r.double(p, 0)
        assertEquals(2, d.group(0).bars)
        // The note left past the old end is replaced by the copies.
        assertEquals(listOf(PatternNote(0, 3, 24, id = 4), PatternNote(96, 4, 12), PatternNote(384, 3, 24), PatternNote(480, 4, 12)), d.group(0).notes)
        // 60 bars give 99, with the copies that fit.
        val long = ProjectPatterns().with(0, Pattern(60, listOf(PatternNote(0, 0, 24), PatternNote(384 * 50, 0, 24))))
        val l = r.double(long, 0)
        assertEquals(99, l.group(0).bars)
        assertEquals(listOf(0, 384 * 50, 384 * 60), ticks(l))
        val most = ProjectPatterns().with(0, Pattern(99))
        assertEquals(most, r.double(most, 0))
    }

    @Test
    fun `a press snaps to the swung grid and keeps its velocity`() {
        val r = PatternRecorder()
        val p0 = r.punchIn(ProjectPatterns(), fromStop = true, autoLength = false)
        // At 75 the off-beat 1/16 is at 36: 30 snaps there, straight it would go to 24.
        val swung = r.noteOn(p0, a3, null, 30.0, 30.0, sixteenth, swing = 75, velocity = 90)
        assertEquals(PatternNote(36, 3, 24, null, 90, swung.id), swung.patterns.group(0).notes.single())
        val straight = r.noteOn(p0, a3, null, 30.0, 30.0, sixteenth)
        assertEquals(PatternNote(24, 3, 24, null, 127, straight.id), straight.patterns.group(0).notes.single())
    }

    private fun one(vararg notes: PatternNote) = ProjectPatterns().with(0, Pattern(1, notes.toList()))

    @Test
    fun `a note placed on a step replaces the pad's at its pitch`() {
        val r = PatternRecorder()
        val p0 = one(PatternNote(96, 3, 24, velocity = 50), PatternNote(98, 3, 24, semitones = 2), PatternNote(100, 3, 24), PatternNote(120, 3, 24))
        // Step 4 at 1/16 is 96..107: both of A 3's pad hits go, its KEYS note of another pitch and step 5 stay.
        val p1 = r.stepPlace(p0, a3, null, 4, sixteenth, 50, velocity = 90)
        assertEquals(listOf(PatternNote(98, 3, 24, 2), PatternNote(120, 3, 24), PatternNote(96, 3, 24, null, 90)), p1.group(0).notes)
        val p2 = r.stepPlace(p1, a3, 2, 4, sixteenth, 50)
        assertEquals(listOf(120, 96, 96), ticks(p2))
        assertEquals(listOf(null, null, 2), p2.group(0).notes.map { it.semitones })
        // One interval long, on the swung grid, at 1..127.
        assertEquals(PatternNote(72, 4, 48, null, 127), PatternRecorder().stepPlace(ProjectPatterns(), a4, null, 1, Timing.EIGHTH, 75, velocity = 200).group(0).notes.single())
        assertEquals(1, PatternRecorder().stepPlace(ProjectPatterns(), a4, null, 0, sixteenth, 50, velocity = 0).group(0).notes.single().velocity)
        // Each place is a checkpoint.
        assertEquals(p1, r.undo(p2))
        assertEquals(p0, r.undo(p1))
    }

    @Test
    fun `a full pattern takes no step note, but a replaced one still fits`() {
        val r = PatternRecorder()
        val full = ProjectPatterns().with(0, Pattern(99, List(Seq.MAX_NOTES) { PatternNote(it, 0, 1) }))
        assertSame(full, r.stepPlace(full, a3, null, 0, sixteenth, 50))
        // Ticks 0..11 are step 0.
        assertEquals(Seq.MAX_NOTES - 11, r.stepPlace(full, PhysicalPad(0, 0), null, 0, sixteenth, 50).group(0).notes.size)
    }

    @Test
    fun `a step's velocity and length are held to range, and a knob turn is one undo`() {
        val r = PatternRecorder()
        val p0 = one(PatternNote(0, 3, 24), PatternNote(2, 4, 24, semitones = 5), PatternNote(24, 3, 24))
        var p = r.stepVelocity(p0, 0, 0, sixteenth, 50, 90)
        assertEquals(listOf(90, 90, 127), p.group(0).notes.map { it.velocity })
        p = r.stepVelocity(p, 0, 0, sixteenth, 50, 0)
        assertEquals(listOf(1, 1, 127), p.group(0).notes.map { it.velocity })
        p = r.stepVelocity(p, 0, 0, sixteenth, 50, 300)
        p = r.stepVelocity(p, 0, 0, sixteenth, 50, 100)
        assertEquals(listOf(100, 100, 127), p.group(0).notes.map { it.velocity })
        assertEquals(p0, r.undo(p))
        assertNull(r.undo(p0))
        var g = r.stepGate(p0, 0, 0, sixteenth, 50, 0)
        assertEquals(listOf(1, 1, 24), g.group(0).notes.map { it.gate })
        g = r.stepGate(g, 0, 0, sixteenth, 50, 1000)
        assertEquals(listOf(384, 384, 24), g.group(0).notes.map { it.gate })
        g = r.stepGate(g, 0, 0, sixteenth, 50, 48)
        assertEquals(p0, r.undo(g))
        // An empty step: nothing changes.
        assertSame(p0, r.stepVelocity(p0, 0, 5, sixteenth, 50, 10))
        // Another step is another gesture, as is the knob let go of.
        var q = r.stepVelocity(p0, 0, 0, sixteenth, 50, 90)
        q = r.stepVelocity(q, 0, 1, sixteenth, 50, 90)
        val second = q
        q = r.stepVelocity(q, 0, 1, sixteenth, 50, 80)
        r.endRun()
        q = r.stepVelocity(q, 0, 1, sixteenth, 50, 70)
        assertEquals(listOf(90, 90, 80), r.undo(q)!!.group(0).notes.map { it.velocity })
        assertEquals(listOf(90, 90, 127), r.undo(second)!!.group(0).notes.map { it.velocity })
    }

    @Test
    fun `a nudge moves a step on the grid, or a tick in free time, and the cursor follows`() {
        val r = PatternRecorder()
        val p0 = one(PatternNote(24, 3, 24), PatternNote(24, 3, 24, semitones = 2), PatternNote(24, 4, 24))
        val up = r.nudge(p0, a3, null, 1, sixteenth, 50, quantize = true, dir = 1)
        assertEquals(listOf(48, 48, 24), ticks(up.patterns))
        assertEquals(2, up.step)
        assertEquals(listOf(24, 48, 24), ticks(r.nudge(p0, a3, 2, 1, sixteenth, 50, true, 1).patterns))
        val free = r.nudge(p0, a3, null, 1, sixteenth, 50, quantize = false, dir = -1)
        assertEquals(listOf(23, 23, 24), ticks(free.patterns))
        assertEquals(1, free.step)
        // A tick past halfway: the next step.
        assertEquals(PatternRecorder.Nudged(one(PatternNote(36, 3, 24)), 2), r.nudge(one(PatternNote(35, 3, 24)), a3, null, 1, sixteenth, 50, false, 1))
        // Nothing of the pad there: the very patterns, the cursor where it was.
        val none = r.nudge(p0, a3, null, 3, sixteenth, 50, true, 1)
        assertSame(p0, none.patterns)
        assertEquals(3, none.step)
    }

    @Test
    fun `a nudge wraps round both ends`() {
        val r = PatternRecorder()
        assertEquals(PatternRecorder.Nudged(one(PatternNote(360, 3, 24)), 15), r.nudge(one(PatternNote(0, 3, 24)), a3, null, 0, sixteenth, 50, true, -1))
        assertEquals(PatternRecorder.Nudged(one(PatternNote(0, 3, 24)), 0), r.nudge(one(PatternNote(360, 3, 24)), a3, null, 15, sixteenth, 50, true, 1))
        // Free time: 383 still rounds to step 0.
        assertEquals(PatternRecorder.Nudged(one(PatternNote(383, 3, 24)), 0), r.nudge(one(PatternNote(0, 3, 24)), a3, null, 0, sixteenth, 50, false, -1))
        assertEquals(PatternRecorder.Nudged(one(PatternNote(0, 3, 24)), 0), r.nudge(one(PatternNote(383, 3, 24)), a3, null, 0, sixteenth, 50, false, 1))
    }

    @Test
    fun `a nudge keeps a swung grid swung`() {
        val r = PatternRecorder()
        var n = r.nudge(one(PatternNote(36, 3, 24)), a3, null, 1, sixteenth, 75, true, 1)
        assertEquals(listOf(48), ticks(n.patterns))
        n = r.nudge(n.patterns, a3, null, n.step, sixteenth, 75, true, 1)
        assertEquals(PatternRecorder.Nudged(one(PatternNote(84, 3, 24)), 3), n)
        // Off the grid, on step 1 (36): it snaps to step 0.
        assertEquals(listOf(0), ticks(r.nudge(one(PatternNote(40, 3, 24)), a3, null, 1, sixteenth, 75, true, -1).patterns))
    }

    @Test
    fun `a nudged note replaces one it lands on, and the presses are one undo`() {
        val r = PatternRecorder()
        val p0 = one(PatternNote(24, 3, 24), PatternNote(48, 3, 24, velocity = 50), PatternNote(48, 4, 24))
        val hit = r.nudge(p0, a3, null, 1, sixteenth, 50, true, 1)
        assertEquals(listOf(PatternNote(48, 3, 24), PatternNote(48, 4, 24)), hit.patterns.group(0).notes)
        var n = hit
        n = r.nudge(n.patterns, a3, null, n.step, sixteenth, 50, true, 1)
        n = r.nudge(n.patterns, a3, null, n.step, sixteenth, 50, false, 1)
        assertEquals(listOf(73, 48), ticks(n.patterns))
        assertEquals(3, n.step)
        assertEquals(p0, r.undo(n.patterns))
        assertNull(r.undo(p0))
    }

    @Test
    fun `a pad's notes shift a tick, round the loop, past the end left alone`() {
        val r = PatternRecorder()
        val p0 = one(PatternNote(0, 3, 24), PatternNote(200, 3, 24, semitones = 2), PatternNote(500, 3, 24), PatternNote(0, 4, 24))
        var p = r.shiftPad(p0, a3, null, -1)
        assertEquals(listOf(383, 199, 500, 0), ticks(p))
        p = r.shiftPad(p, a3, null, -1)
        p = r.shiftPad(p, a3, null, -1)
        assertEquals(listOf(381, 197, 500, 0), ticks(p))
        assertEquals(p0, r.undo(p))
        assertNull(r.undo(p0))
        assertEquals(listOf(0, 201, 500, 0), ticks(r.shiftPad(p0, a3, 2, 1)))
        assertEquals(listOf(0, 0), ticks(r.shiftPad(one(PatternNote(383, 3, 24), PatternNote(0, 4, 24)), a3, null, 1)))
    }

    @Test
    fun `timing correct puts a pad's notes on the grid, the first of two on a tick staying`() {
        val r = PatternRecorder()
        val p0 = one(
            PatternNote(5, 3, 24),
            PatternNote(22, 3, 24, velocity = 60),
            PatternNote(26, 3, 24, velocity = 70),
            PatternNote(48, 3, 24),
            PatternNote(380, 3, 24),
            PatternNote(500, 3, 24),
            PatternNote(13, 4, 24),
        )
        val c = r.correctPad(p0, a3, null, sixteenth, 50)
        // 5 and 22 move; 26 lands on 22's 24 and 380 on 5's 0 (round the loop): both dropped.
        assertEquals(4, c.moved)
        assertEquals(listOf(0, 24, 48, 500, 13), ticks(c.patterns))
        assertEquals(listOf(127, 60, 127, 127, 127), c.patterns.group(0).notes.map { it.velocity })
        // Already on it: nothing moved, the very patterns.
        val again = r.correctPad(c.patterns, a3, null, sixteenth, 50)
        assertEquals(0, again.moved)
        assertSame(c.patterns, again.patterns)
        // Swung: 30 and 40 go to 36, 70 to 84.
        val swung = PatternRecorder().correctPad(one(PatternNote(30, 3, 24), PatternNote(40, 3, 24), PatternNote(70, 3, 24)), a3, null, sixteenth, 75)
        assertEquals(PatternRecorder.Corrected(one(PatternNote(36, 3, 24), PatternNote(84, 3, 24)), 3), swung)
        // One pitch of the pad.
        assertEquals(PatternRecorder.Corrected(one(PatternNote(5, 3, 24), PatternNote(0, 3, 24, 2)), 1), PatternRecorder().correctPad(one(PatternNote(5, 3, 24), PatternNote(5, 3, 24, 2)), a3, 2, sixteenth, 50))
        // Each is a checkpoint.
        val p2 = r.correctPad(c.patterns, a3, null, Timing.QUARTER, 50).patterns
        // At 1/4, 24 lands on 0 and 48 rounds up to 96.
        assertEquals(listOf(0, 96, 500, 13), ticks(p2))
        assertEquals(c.patterns, r.undo(p2))
        assertEquals(p0, r.undo(c.patterns))
    }

    @Test
    fun `a pad held to correct while playing is one checkpoint`() {
        val r = PatternRecorder()
        val p0 = one(PatternNote(10, 3, 24), PatternNote(100, 3, 24), PatternNote(200, 3, 24))
        var total = 0
        var p = p0
        for ((from, to) in listOf(0.0 to 5.0, 5.0 to 50.0, 50.0 to 150.0, 150.0 to 250.0)) {
            val c = r.correctRange(p, a3, null, from, to, sixteenth, 50)
            total += c.moved
            p = c.patterns
        }
        assertEquals(3, total)
        assertEquals(listOf(0, 96, 192), ticks(p))
        assertEquals(p0, r.undo(p))
        assertNull(r.undo(p0))
        // Let go and held again: another gesture.
        var q = r.correctRange(p0, a3, null, 0.0, 50.0, sixteenth, 50).patterns
        val again = r.correctRange(q, a3, null, 300.0, 384.0 + 150, sixteenth, 50)
        assertEquals(1, again.moved)
        q = again.patterns
        assertEquals(listOf(0, 100, 200), ticks(r.undo(q)!!))
        // Round the loop, and a whole loop.
        assertEquals(PatternRecorder.Corrected(one(PatternNote(0, 3, 24), PatternNote(200, 3, 24)), 1), r.correctRange(one(PatternNote(380, 3, 24), PatternNote(200, 3, 24)), a3, null, 760.0, 780.0, sixteenth, 50))
        val whole = r.correctRange(p0, a3, null, 1000.0, 1384.0, sixteenth, 50)
        assertEquals(3, whole.moved)
        assertEquals(PatternRecorder.Corrected(p0, 0), r.correctRange(p0, a3, null, 300.0, 300.0, sixteenth, 50))
    }

    @Test
    fun `another edit in between breaks a run`() {
        val r = PatternRecorder()
        val p0 = one(PatternNote(0, 3, 24), PatternNote(10, 4, 24), PatternNote(30, 4, 24))
        val p1 = r.stepVelocity(p0, 0, 0, sixteenth, 50, 90)
        val p2 = r.stepGate(p1, 0, 0, sixteenth, 50, 48)
        val p3 = r.stepVelocity(p2, 0, 0, sixteenth, 50, 80)
        val p4 = r.correctRange(p3, a4, null, 0.0, 20.0, sixteenth, 50).patterns
        val p5 = r.erasePad(p4, a3)
        // Follows on from 20, but the erase came in between: a checkpoint of its own.
        val p6 = r.correctRange(p5, a4, null, 20.0, 40.0, sixteenth, 50).patterns
        assertEquals(listOf(0, 24), ticks(p6))
        val p7 = r.shiftPad(p6, a4, null, 1)
        val p8 = r.hit(p7, a3, 96.0).patterns
        val p9 = r.shiftPad(p8, a4, null, 1)
        assertEquals(listOf(2, 26, 96), ticks(p9))
        assertEquals(p8, r.undo(p9))
        assertEquals(p7, r.undo(p8))
        assertEquals(p6, r.undo(p7))
        assertEquals(p5, r.undo(p6))
        assertEquals(p4, r.undo(p5))
        assertEquals(p3, r.undo(p4))
        assertEquals(p2, r.undo(p3))
        assertEquals(p1, r.undo(p2))
        assertEquals(p0, r.undo(p1))
        assertNull(r.undo(p0))
    }

    @Test
    fun `step edits and corrects leave an open pattern alone`() {
        val r = PatternRecorder()
        var p = r.punchIn(ProjectPatterns(), fromStop = true, autoLength = true)
        p = r.hit(p, a3, 30.0).patterns
        assertTrue(p.group(0).open)
        assertSame(p, r.stepPlace(p, a4, null, 0, sixteenth, 50))
        assertSame(p, r.stepVelocity(p, 0, 1, sixteenth, 50, 10))
        assertSame(p, r.stepGate(p, 0, 1, sixteenth, 50, 10))
        assertEquals(PatternRecorder.Nudged(p, 1), r.nudge(p, a3, null, 1, sixteenth, 50, true, 1))
        assertSame(p, r.shiftPad(p, a3, null, 1))
        assertEquals(PatternRecorder.Corrected(p, 0), r.correctPad(p, a3, null, Timing.QUARTER, 50))
        assertEquals(PatternRecorder.Corrected(p, 0), r.correctRange(p, a3, null, 0.0, 50.0, Timing.QUARTER, 50))
    }
}
