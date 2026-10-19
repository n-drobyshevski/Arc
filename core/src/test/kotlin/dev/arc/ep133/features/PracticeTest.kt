package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** PRACTICE: what the player plays, what plays under them, and how their presses score. */
class PracticeTest {
    private val kick = 9
    private val snare = 11
    private val hat = 6

    // A bar: kick on 1 and 3, snare on 2 and 4, a KEYS note on the kick's pad (left to the backing).
    private val drums = Pattern(
        1,
        listOf(
            PatternNote(0, kick, 24), PatternNote(96, snare, 24), PatternNote(192, kick, 24), PatternNote(288, snare, 24),
            PatternNote(48, kick, 24, semitones = 3),
        ),
    )
    private val bass = Pattern(2, listOf(PatternNote(0, 9, 96, semitones = 0), PatternNote(400, 9, 96, semitones = 2)))

    @Test
    fun `the player's hits are the group's pad hits on the pads picked, in time order`() {
        assertEquals(listOf(0 to kick, 96 to snare, 192 to kick, 288 to snare), Practice.targets(drums, PracticeSpec(0)).map { it.tick to it.offset })
        assertEquals(listOf(0, 192), Practice.targets(drums, PracticeSpec(0, pads = setOf(kick))).map { it.tick })
        assertEquals(Seq.TICKS_PER_BAR, Practice.length(Pattern(4), PracticeSpec(0, bars = 1)))
        assertEquals(Seq.TICKS_PER_BAR * 2, Practice.length(Pattern(2), PracticeSpec(0, bars = 4)))
    }

    @Test
    fun `the backing is the rest, the player's hits out, cut to the bars, silent without backing or in wait`() {
        val all = ProjectPatterns(listOf(drums, bass, Pattern(), Pattern()))
        val p = Practice.patterns(all, PracticeSpec(0, pads = setOf(kick), bars = 1))
        assertEquals(listOf(96, 288, 48), p.group(0).notes.map { it.tick })
        assertEquals(1, p.group(1).bars)
        assertEquals(listOf(0), p.group(1).notes.map { it.tick })
        val alone = Practice.patterns(all, PracticeSpec(0, backing = false))
        assertTrue(alone.isEmpty)
        assertTrue(Practice.patterns(all, PracticeSpec(0, wait = true)).isEmpty)
        assertEquals(2, Practice.patterns(all, PracticeSpec(0)).group(1).bars)
    }

    @Test
    fun `a press is in time, early or late by how far it is, or extra with no hit near`() {
        // At 120 BPM 60 ms is 11.5 ticks, held to a third of a sixteenth: 8 ticks.
        val s = PracticeScore(Practice.targets(drums, PracticeSpec(0)), Seq.TICKS_PER_BAR, 120.0)
        assertEquals(HitMark.ON_TIME, s.press(kick, 4.0))
        assertEquals(HitMark.EARLY, s.press(snare, 80.0))
        assertEquals(HitMark.LATE, s.press(kick, 210.0))
        assertEquals(HitMark.EXTRA, s.press(hat, 288.0))
        // The same hit can't be played twice.
        assertEquals(HitMark.EXTRA, s.press(kick, 5.0))
        assertEquals(PracticeCounts(onTime = 1, early = 1, late = 1, extra = 2), s.counts)
    }

    @Test
    fun `hits let go by are missed, and a pass with nothing missed or extra is clean`() {
        val s = PracticeScore(Practice.targets(drums, PracticeSpec(0)), Seq.TICKS_PER_BAR, 90.0)
        for (t in listOf(0, 96, 192, 288)) s.press(if (t % 192 == 0) kick else snare, t.toDouble())
        s.advance(Seq.TICKS_PER_BAR + 20.0)
        assertEquals(1, s.counts.passes)
        assertEquals(1, s.counts.cleanRun)
        // The second pass: the snare on 2 never comes.
        s.press(kick, 384.0)
        s.press(kick, 576.0)
        s.press(snare, 672.0)
        s.advance(2.0 * Seq.TICKS_PER_BAR + 20)
        assertEquals(1, s.counts.missed)
        assertEquals(2, s.counts.passes)
        assertEquals(0, s.counts.cleanRun)
        assertEquals(88, s.counts.percent)
        // A missed hit can't be played afterwards.
        assertEquals(HitMark.EXTRA, s.press(snare, 480.0))
    }

    @Test
    fun `the pads light for the next hits not yet played, and the worst pad is named`() {
        val s = PracticeScore(Practice.targets(drums, PracticeSpec(0)), Seq.TICKS_PER_BAR, 120.0)
        assertEquals(listOf(kick to 0.0, snare to 96.0, kick to 192.0, snare to 288.0), s.upcoming(0.0).map { it.first.offset to it.second })
        s.press(kick, 2.0)
        assertEquals(snare, s.upcoming(10.0).first().first.offset)
        // Into the next pass.
        assertTrue(s.upcoming(300.0).any { it.first.offset == kick && it.second == 84.0 })
        assertNull(s.worst())
        s.press(snare, 80.0)
        s.press(snare, 270.0)
        s.advance(1000.0)
        assertEquals(kick to HitMark.MISSED, s.worst())
    }

    @Test
    fun `wait goes on once every pad on the step is played, and round again`() {
        val two = Practice.targets(Pattern(1, listOf(PatternNote(0, kick, 24), PatternNote(0, hat, 24), PatternNote(96, snare, 24))), PracticeSpec(0))
        val w = PracticeWait(two)
        assertEquals(setOf(kick, hat), w.waiting)
        assertEquals(HitMark.EXTRA, w.press(snare))
        w.press(kick)
        assertEquals(setOf(hat), w.waiting)
        w.press(hat)
        assertEquals(96, w.tick)
        w.press(snare)
        assertEquals(0, w.step)
        assertEquals(PracticeCounts(onTime = 3, extra = 1, passes = 1, cleanRun = 0), w.counts)
    }
}
