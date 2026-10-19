package dev.arc.ep133.audio

import dev.arc.ep133.features.BeatGrid
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** The Bluetooth delay's maths: when it applies, how much of it is left out of the stamp, its size in ticks and nanoseconds, and where a press lands. */
class OutputDelayTest {
    @Test
    fun `nothing is made up for wired, with the setting off, or closed`() {
        assertEquals(0, OutputDelay.ms(on = true, wireless = false, countedMs = 140))
        assertEquals(0, OutputDelay.ms(on = false, wireless = true, countedMs = 140))
        assertEquals(0, OutputDelay.ms(on = false, wireless = false, countedMs = null))
        assertEquals(0L, OutputDelay.nanos(0))
    }

    @Test
    fun `wireless makes up what the stamp leaves out of a typical delay, else all of it`() {
        assertEquals(180, OutputDelay.TYPICAL_MS)
        // Nothing measured: the stamp is not known to count any of it.
        assertEquals(180, OutputDelay.ms(on = true, wireless = true, countedMs = null))
        // A reading of nothing is no reading.
        assertEquals(180, OutputDelay.ms(on = true, wireless = true, countedMs = 0))
        assertEquals(180, OutputDelay.ms(on = true, wireless = true, countedMs = -1))
        // The phone's own buffers (30 ms) are counted; the link's 150 is not.
        assertEquals(150, OutputDelay.ms(on = true, wireless = true, countedMs = 30))
        assertEquals(60, OutputDelay.ms(on = true, wireless = true, countedMs = 120))
    }

    @Test
    fun `the measured latency is never made up for twice`() {
        // A stamp that already counts the link (a long latency) leaves nothing to add, however long.
        assertEquals(0, OutputDelay.ms(on = true, wireless = true, countedMs = 180))
        assertEquals(0, OutputDelay.ms(on = true, wireless = true, countedMs = 220))
        assertEquals(0, OutputDelay.ms(on = true, wireless = true, countedMs = 4000))
        for (counted in listOf(null, 0, 30, 120, 180, 220, 4000)) {
            // What the stamp counts and what is made up add up to the whole delay, never over it.
            val made = OutputDelay.ms(on = true, wireless = true, countedMs = counted)
            assertEquals(OutputDelay.totalMs(counted), made + (counted?.coerceAtLeast(0) ?: 0))
        }
        assertEquals(180, OutputDelay.totalMs(null))
        assertEquals(180, OutputDelay.totalMs(30))
        assertEquals(220, OutputDelay.totalMs(220))
    }

    @Test
    fun `the delay as nanoseconds and ticks`() {
        assertEquals(180_000_000L, OutputDelay.nanos(180))
        // At 120 BPM a tick is 5.2083 ms: 180 ms is 34.56 ticks. At 60 BPM, half as many.
        assertEquals(34.56, OutputDelay.ticks(180_000_000L, 120.0), 1e-9)
        assertEquals(17.28, OutputDelay.ticks(180_000_000L, 60.0), 1e-9)
        assertEquals(0.0, OutputDelay.ticks(0L, 120.0))
    }

    @Test
    fun `a press is where it was heard`() {
        // Heard in the pass before the stamp's: its own global tick, which the recorder floors into the pattern.
        assertEquals(354.44, OutputDelay.placed(389.0, 354.44, countedIn = false), 1e-9)
        assertEquals(354.44, OutputDelay.placed(389.0, 354.44, countedIn = true), 1e-9)
        assertEquals(100.0, OutputDelay.placed(134.0, 100.0, countedIn = false))
        // Exactly on the start stays on it.
        assertEquals(0.0, OutputDelay.placed(34.0, 0.0, countedIn = false))
        // Counted in, the player still hears the count-in: the press stays there, as it does wired.
        assertEquals(-10.0, OutputDelay.placed(24.56, -10.0, countedIn = true), 1e-9)
        assertEquals(-50.0, OutputDelay.placed(-20.0, -50.0, countedIn = true))
        // A press started the run and nothing is heard yet: no earlier than the start, and not the loop's end.
        assertEquals(0.0, OutputDelay.placed(5.0, -29.56, countedIn = false))
        // (Before the start by the stamp's own count it is as the stamp has it.)
        assertEquals(-20.0, OutputDelay.placed(-20.0, -50.0, countedIn = false))
        // No delay: unchanged, bit for bit.
        for (tick in listOf(-3.0, 0.0, 5.0, 123.456, 4000.5)) {
            assertEquals(tick, OutputDelay.placed(tick, tick, countedIn = false))
            assertEquals(tick, OutputDelay.placed(tick, tick, countedIn = true))
        }
    }

    @Test
    fun `the EP-133's beats go out early by the delay, and as they were with none`() {
        val grid = BeatGrid(anchor = 1_000_000_000L, beatIndex = 8, periodNs = 5e8, barKnown = true)
        val early = OutputDelay.earlier(grid, 180_000_000L)
        assertEquals(820_000_000L, early.anchor)
        assertEquals(grid.at(9) - 180_000_000L, early.at(9))
        assertEquals(grid.periodNs, early.periodNs)
        assertEquals(grid.beatIndex, early.beatIndex)
        assertEquals(grid.barKnown, early.barKnown)
        assertEquals(grid, OutputDelay.earlier(grid, 0L))
    }

    @Test
    fun `the latency is the frames not yet played, by the output's timestamp`() {
        val rate = 48000
        // 4800 frames written; the stamp says frame 1000 left at 10 s; at 10.02 s (960 frames later) 1960 have played.
        assertEquals(59, OutputDelay.latencyMs(4800, 1000, 10_000_000_000L, 10_020_000_000L, rate))
        // Exactly at the stamp: 3800 frames to go.
        assertEquals(79, OutputDelay.latencyMs(4800, 1000, 10_000_000_000L, 10_000_000_000L, rate))
        // Everything played, or more (a stale stamp): none.
        assertNull(OutputDelay.latencyMs(4800, 1000, 10_000_000_000L, 10_200_000_000L, rate))
        // A stamp from the future, or no rate: none.
        assertNull(OutputDelay.latencyMs(4800, 1000, 10_000_000_000L, 9_000_000_000L, rate))
        assertNull(OutputDelay.latencyMs(4800, 1000, 10_000_000_000L, 10_000_000_000L, 0))
        // Less than half a millisecond is none, not 0.
        assertNull(OutputDelay.latencyMs(1010, 1000, 10_000_000_000L, 10_000_000_000L, rate))
    }
}
