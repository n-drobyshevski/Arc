package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
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
}
