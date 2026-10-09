package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class StepsTest {
    private val sixteenth = Timing.SIXTEENTH
    private val eighth = Timing.EIGHTH

    @Test
    fun `a bar has a whole number of steps at every interval`() {
        assertEquals(listOf(1, 2, 4, 8, 12, 16, 24, 32), Timing.intervals.map { Steps.count(Pattern(1), it) })
        assertEquals(listOf(2, 4, 8, 16, 24, 32, 48, 64), Timing.intervals.map { Steps.count(Pattern(2), it) })
    }

    @Test
    fun `a step's tick is on the swung grid, and gives the step back`() {
        assertEquals(listOf(0, 24, 48, 72), (0..3).map { Steps.tickOf(it, sixteenth, 50) })
        // At 75 the odd steps play half a step late; at 60 a fifth.
        assertEquals(listOf(0, 36, 48, 84), (0..3).map { Steps.tickOf(it, sixteenth, 75) })
        assertEquals(29, Steps.tickOf(1, sixteenth, 60))
        assertEquals(listOf(0, 72, 96, 168), (0..3).map { Steps.tickOf(it, eighth, 75) })
        for (t in listOf(sixteenth, eighth)) for (swing in listOf(50, 75)) {
            val count = Steps.count(Pattern(2), t)
            for (step in 0 until count) assertEquals(step, Steps.indexOf(Steps.tickOf(step, t, swing), t, swing, count))
        }
        // Off the grid: the nearest swung point, ties to the later one.
        assertEquals(1, Steps.indexOf(30, sixteenth, 75, 16))
        assertEquals(2, Steps.indexOf(42, sixteenth, 75, 16))
        assertEquals(0, Steps.indexOf(17, sixteenth, 75, 16))
        assertEquals(1, Steps.indexOf(35, sixteenth, 50, 16))
        assertEquals(2, Steps.indexOf(36, sixteenth, 50, 16))
    }

    @Test
    fun `triplets have no swing`() {
        assertEquals(12, Steps.count(Pattern(1), Timing.EIGHTH_T))
        assertEquals(listOf(0, 32, 64), (0..2).map { Steps.tickOf(it, Timing.EIGHTH_T, 75) })
        assertEquals(1, Steps.indexOf(47, Timing.EIGHTH_T, 75, 12))
        assertEquals(2, Steps.indexOf(48, Timing.EIGHTH_T, 75, 12))
        assertEquals(80, Steps.tickOf(5, Timing.SIXTEENTH_T, 50))
        assertEquals(6, Steps.indexOf(88, Timing.SIXTEENTH_T, 50, 24))
    }

    @Test
    fun `a note near the end rounds up to step 0`() {
        assertEquals(15, Steps.indexOf(371, sixteenth, 50, 16))
        assertEquals(0, Steps.indexOf(372, sixteenth, 50, 16))
        assertEquals(0, Steps.indexOf(380, sixteenth, 50, 16))
        // Swung, step 15 is at 372.
        assertEquals(15, Steps.indexOf(377, sixteenth, 75, 16))
        assertEquals(0, Steps.indexOf(380, sixteenth, 75, 16))
        // The cursor wraps as − / + do.
        assertEquals(listOf(15, 0, 5), listOf(-1, 16, 5).map { Steps.clampStep(it, 16) })
    }

    @Test
    fun `the notes on a step are those that play there`() {
        val p = Pattern(1, listOf(PatternNote(0, 3, 24), PatternNote(384, 3, 24), PatternNote(10, 4, 24, semitones = 2), PatternNote(30, 5, 24), PatternNote(380, 6, 24)))
        // 384 is past the end: on no step. 380 rounds up to step 0.
        assertEquals(listOf(0, 10, 380), Steps.notesOn(p, 0, sixteenth, 50).map { it.tick })
        assertEquals(listOf(30), Steps.notesOn(p, 1, sixteenth, 50).map { it.tick })
        assertEquals(listOf(true, true) + List(14) { false }, Steps.occupied(p, sixteenth, 50).toList())
        assertEquals(setOf(3 to null, 4 to 2, 6 to null), Steps.padsOn(p, 0, sixteenth, 50))
        assertEquals(emptySet<Pair<Int, Int?>>(), Steps.padsOn(p, 2, sixteenth, 50))
        assertEquals(listOf(true, false, false, false), Steps.occupied(p, Timing.QUARTER, 50).toList())
    }

    @Test
    fun `the cursor keeps its place when the interval changes`() {
        assertEquals(2, Steps.convert(5, sixteenth, eighth))
        assertEquals(4, Steps.convert(2, eighth, sixteenth))
        assertEquals(5, Steps.convert(7, sixteenth, Timing.EIGHTH_T))
        assertEquals(4, Steps.convert(3, Timing.EIGHTH_T, sixteenth))
        assertEquals(0, Steps.convert(15, sixteenth, Timing.WHOLE))
    }
}
