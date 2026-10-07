package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SampleTimingTest {
    private val ms = 1_000_000L
    private val period = 500.0 * ms // 120 BPM

    /** Beat [index] of a steady 120 BPM click, accented on a bar's first beat. */
    private fun beat(index: Long, accent: Boolean = index % 4 == 0L) = Beat(index, index * 500 * ms, accent)

    @Test
    fun `a frame clock gives the frame before and after its stamp`() {
        val c = FrameClock(1_000, 5_000 * ms, 48_000)
        assertEquals(1_000L, c.frameAt(5_000 * ms))
        assertEquals(1_480L, c.frameAt(5_010 * ms))
        assertEquals(520L, c.frameAt(4_990 * ms))
        // Half a frame is 10 416.67 ns at 48 kHz: rounded half up, either side.
        assertEquals(1_001L, c.frameAt(5_000 * ms + 10_417))
        assertEquals(1_000L, c.frameAt(5_000 * ms + 10_416))
        assertEquals(1_000L, c.frameAt(5_000 * ms - 10_416))
        assertEquals(999L, c.frameAt(5_000 * ms - 10_417))
        // An hour on: no overflow.
        assertEquals(1_000L + 172_800_000L, c.frameAt(5_000 * ms + 3_600_000 * ms))
    }

    @Test
    fun `a count-in waits for an accent, counts, then gives the start`() {
        val c = CountIn()
        assertEquals(CountIn.Step.Waiting, c.onBeat(beat(1), period))
        assertEquals(CountIn.Step.Waiting, c.onBeat(beat(2), period))
        assertEquals(CountIn.Step.Waiting, c.onBeat(beat(3), period))
        assertEquals(CountIn.Step.Counting(1), c.onBeat(beat(4), period))
        assertEquals(CountIn.Step.Counting(2), c.onBeat(beat(5), period))
        assertEquals(CountIn.Step.Counting(3), c.onBeat(beat(6), period))
        // The 4th beat: the take starts on the next bar's first beat, the downbeat + 4 beats.
        assertEquals(CountIn.Step.Start(4_000 * ms), c.onBeat(beat(7), period))
        // Then it waits for an accent again.
        assertEquals(CountIn.Step.Counting(1), c.onBeat(beat(8), period))
        c.reset()
        assertEquals(CountIn.Step.Waiting, c.onBeat(beat(9), period))
    }

    @Test
    fun `no accent while the bar isn't known`() {
        val c = CountIn()
        for (i in 0L..8L) assertEquals(CountIn.Step.Waiting, c.onBeat(beat(i, accent = false), period))
    }

    @Test
    fun `a skipped beat still counts, and a count that goes back starts again`() {
        val c = CountIn()
        c.onBeat(beat(0), period)
        c.onBeat(beat(1), period)
        // Beat 2 was skipped (a late click): beat 3 is still the 4th.
        assertEquals(CountIn.Step.Start(2_000 * ms), c.onBeat(beat(3), period))
        // A new Start on the EP-133 counts from 0 again, from its accent.
        assertEquals(CountIn.Step.Counting(1), c.onBeat(beat(4), period))
        assertEquals(CountIn.Step.Counting(2), c.onBeat(beat(5), period))
        assertEquals(CountIn.Step.Counting(1), c.onBeat(Beat(0, 9_000 * ms, true), period))
        assertEquals(CountIn.Step.Counting(2), c.onBeat(Beat(1, 9_500 * ms, false), period))
        // Gone back without an accent: waiting again.
        c.reset()
        c.onBeat(beat(4), period)
        assertEquals(CountIn.Step.Waiting, c.onBeat(beat(2), period))
    }

    @Test
    fun `the start follows the latest beat, and longer counts go past the bar`() {
        val c = CountIn()
        c.onBeat(beat(0), period)
        c.onBeat(beat(1), period)
        c.onBeat(beat(2), period)
        // The tempo nudged on the last beat: a beat after it.
        assertEquals(CountIn.Step.Start(1_510 * ms + 480 * ms), c.onBeat(Beat(3, 1_510 * ms, false), 480.0 * ms))
        val two = CountIn(beats = 8)
        two.onBeat(beat(0), period)
        for (i in 1L..3L) two.onBeat(beat(i), period)
        assertEquals(CountIn.Step.Counting(5), two.onBeat(beat(4), period)) // the next bar's accent goes on counting
        for (i in 5L..6L) two.onBeat(beat(i), period)
        assertEquals(CountIn.Step.Start(4_000 * ms), two.onBeat(beat(7), period))
        // A one-beat count starts from its accent.
        assertEquals(CountIn.Step.Start(2_500 * ms), CountIn(beats = 1).onBeat(beat(4), period))
    }

    @Test
    fun `follow starts on the edge into playing`() {
        assertTrue(followStart(true, false))
        assertTrue(followStart(true, null))
        assertFalse(followStart(true, true))
        assertFalse(followStart(false, false))
        assertFalse(followStart(false, true))
        assertFalse(followStart(null, false))
        assertFalse(followStart(null, null))
    }
}
