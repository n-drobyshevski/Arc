package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs

class SequencerTest {
    private val ms = 1_000_000L

    private fun notes(vararg ticks: Int, offset: Int = 0) = ticks.map { PatternNote(it, offset, 24) }

    /** Every note from [from] to [to] in windows of [block] frames, back to back. */
    private fun play(p: ProjectPatterns, clock: TransportClock, from: Long, to: Long, block: Int, skip: Map<Int, Long> = emptyMap()): List<SeqNote> {
        val all = ArrayList<SeqNote>()
        val out = ArrayList<SeqNote>()
        var f = from
        while (f < to) {
            val end = minOf(f + block, to)
            PatternPlayer.window(p, clock, f, end, skip, out)
            for (n in out) assertTrue(n.startFrame in f until end)
            all += out
            f = end
        }
        return all
    }

    @Test
    fun `the clock turns ticks into mix frames and back`() {
        val c = TransportClock(1_000, 48_000, 120.0)
        assertEquals(250.0, c.framesPerTick)
        assertEquals(1_000L, c.frameOf(0))
        assertEquals(1_000L + 24_000, c.frameOf(96))
        assertEquals(1_000L - 96_000, c.frameOf(-384))
        assertEquals(96.0, c.tickAt(25_000))
        assertEquals(-0.5, c.tickAt(875))
        // 44.1 kHz at 123 BPM: 224.09... frames a tick, rounded half up as barFrames.
        val odd = TransportClock(0, 44_100, 123.0)
        assertEquals(barFrames(1, 123.0, 44_100), odd.frameOf(Seq.TICKS_PER_BAR.toLong()))
        assertEquals(barFrames(7, 123.0, 44_100), odd.frameOf(7L * Seq.TICKS_PER_BAR))
        assertEquals(224L, odd.frameOf(1))
    }

    @Test
    fun `another tempo keeps the tick where it changes`() {
        val c = TransportClock(500, 48_000, 120.0)
        val at = 500L + 3 * 96_000 + 1_234
        val r = c.retempo(at, 93.0)
        assertEquals(93.0, r.bpm)
        assertTrue(abs(r.tickAt(at) - c.tickAt(at)) < 1 / r.framesPerTick)
        // Ticks after it go at the new tempo.
        assertEquals(r.framesPerTick * 96, (r.frameOf(1_000 + 96) - r.frameOf(1_000)).toDouble(), 1.0)
    }

    @Test
    fun `a new frame count keeps the tick`() {
        val c = TransportClock(500, 48_000, 120.0).rebase(10, 384.0, 44_100)
        assertEquals(44_100, c.rate)
        assertEquals(120.0, c.bpm)
        assertEquals(384.0, c.tickAt(10), 1e-9)
        assertEquals(10L - 88_200, c.anchorFrame)
    }

    @Test
    fun `the click's beats fall on the pattern's, count-in before`() {
        val c = TransportClock(48_000, 48_000, 120.0)
        // The output played frame 0 at 5 s: tick 0 plays at 6 s.
        val out = FrameClock(0, 5_000 * ms, 48_000)
        val g = c.beatGrid(out)
        assertEquals(6_000 * ms, g.at(0))
        assertEquals(500.0 * ms, g.periodNs)
        assertTrue(g.barKnown)
        assertEquals(4_000 * ms, g.at(-4))
        assertTrue(g.accent(-4))
        assertEquals(listOf(false, false, false, true), (-3L..0L).map(g::accent))
        assertEquals(6_000 * ms + 250 * ms, c.nanosOf(48, out))
        assertEquals(c.nanosOf(96, out), g.at(1))
        // Round the frame to the nanosecond the way FrameClock.frameAt goes back.
        assertEquals(c.frameOf(37), out.frameAt(c.nanosOf(37, out)))
    }

    @Test
    fun `windows back to back play every note once`() {
        val p = ProjectPatterns()
            .with(0, Pattern(1, notes(0, 96, 191, 383)))
            .with(1, Pattern(2, notes(0, 400, 700, offset = 5)))
            .with(3, Pattern(3, notes(1_000)))
        for (rate in listOf(44_100, 48_000)) {
            val clock = TransportClock(1_234, rate, 123.0)
            val end = clock.frameOf(12L * Seq.TICKS_PER_BAR)
            val whole = ArrayList<SeqNote>()
            PatternPlayer.window(p, clock, 0, end, emptyMap(), whole)
            // 12 bars: A 12 times, B 6, D 4.
            assertEquals(4 * 12 + 3 * 6 + 4, whole.size)
            for (block in listOf(1, 96, 192, 1024, 7_919)) assertEquals(whole, play(p, clock, 0, end, block))
            assertEquals(whole.sortedWith(compareBy({ it.startTick }, { it.group })), whole)
            for (n in whole) assertEquals(clock.frameOf(n.startTick), n.startFrame)
        }
    }

    @Test
    fun `the notes loop at their group's length`() {
        val p = ProjectPatterns().with(0, Pattern(1, notes(96))).with(2, Pattern(2, notes(96, offset = 3)))
        val clock = TransportClock(0, 48_000, 120.0)
        val out = ArrayList<SeqNote>()
        PatternPlayer.window(p, clock, 0, clock.frameOf(4L * 384), emptyMap(), out)
        assertEquals(listOf(96L to 0, 96L to 2, 480L to 0, 864L to 0, 864L to 2, 1_248L to 0), out.map { it.startTick to it.group })
        assertEquals(PatternNote(96, 3, 24), out[1].note)
    }

    @Test
    fun `nothing plays before tick 0, or in an empty window`() {
        val p = ProjectPatterns().with(0, Pattern(1, notes(0, 192)))
        val clock = TransportClock(100_000, 48_000, 120.0)
        val out = arrayListOf(SeqNote(0, PatternNote(0, 0, 1), 0, 0))
        PatternPlayer.window(p, clock, 0, 100_000, emptyMap(), out)
        assertTrue(out.isEmpty())
        PatternPlayer.window(p, clock, 0, 100_001, emptyMap(), out)
        assertEquals(listOf(0L), out.map { it.startTick })
        PatternPlayer.window(p, clock, 100_000, 100_000, emptyMap(), out)
        assertTrue(out.isEmpty())
    }

    @Test
    fun `an open pattern plays once, and notes past the end don't`() {
        val open = ProjectPatterns().with(0, Pattern(2, notes(100, 500), open = true)).with(1, Pattern(1, notes(10, 400)))
        val clock = TransportClock(0, 48_000, 120.0)
        val out = ArrayList<SeqNote>()
        PatternPlayer.window(open, clock, 0, clock.frameOf(4L * 384), emptyMap(), out)
        assertEquals(listOf(10L to 1, 100L to 0, 394L to 1, 500L to 0, 778L to 1, 1_162L to 1), out.map { it.startTick to it.group })
    }

    @Test
    fun `a pass heard as it was recorded is skipped`() {
        val p = ProjectPatterns().with(0, Pattern(1, listOf(PatternNote(0, 0, 24, id = 7), PatternNote(0, 1, 24))))
        val clock = TransportClock(0, 48_000, 120.0)
        val got = play(p, clock, 0, clock.frameOf(3L * 384), 512, skip = mapOf(7 to 1L))
        assertEquals(listOf(0L to 0, 0L to 1, 384L to 1, 768L to 0, 768L to 1), got.map { it.startTick to it.note.offset })
    }

    @Test
    fun `passes and loop starts`() {
        assertEquals(0L, passOf(0, 384))
        assertEquals(0L, passOf(383, 384))
        assertEquals(1L, passOf(384, 384))
        assertEquals(-1L, passOf(-1, 384))
        assertEquals(0L, nextLoopStart(-300.0, 768))
        assertEquals(0L, nextLoopStart(0.0, 768))
        assertEquals(768L, nextLoopStart(0.5, 768))
        assertEquals(1_536L, nextLoopStart(1_000.0, 768))
        assertEquals(1_536L, nextLoopStart(1_536.0, 768))
    }

    @Test
    fun `the position reads bar dot beat of the bars`() {
        val four = Pattern(4)
        assertEquals(PatternPosition(2, 3, 4, 0.375f), positionOf(384.0 + 192, four))
        assertEquals(PatternPosition(2, 3, 4, 0.375f), positionOf(1_536.0 * 3 + 384 + 192 + 10, four).copy(fraction = 0.375f))
        assertEquals(PatternPosition(1, 1, 4, 0f), positionOf(-200.0, four))
        assertEquals(PatternPosition(4, 4, 4, 1_535f / 1_536), positionOf(1_535.0, four))
        assertEquals(PatternPosition(1, 1, 4, 0f), positionOf(1_536.0, four))
        // Open, it doesn't loop.
        assertEquals(PatternPosition(2, 1, 2, 0.5f), positionOf(384.0, Pattern(2, open = true)))
    }
}
