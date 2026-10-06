package dev.arc.ep133.audio

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class OutputPacerTest {
    private val ms = 1_000_000L
    private fun pacer() = OutputPacer(burst = 192, rate = 48000, floor = 384)

    @Test
    fun `writes while a burst fits, then waits a fraction of a burst`() {
        val p = pacer()
        assertEquals(OutputPacer.WRITE, p.next(0, 384, 0))
        p.wrote(192)
        assertEquals(OutputPacer.WRITE, p.next(0, 384, 0))
        p.wrote(192)
        // Full: wait, an eighth to half a burst (4 ms).
        val wait = p.next(0, 384, 0)
        assertTrue(wait in p.burstNanos / 8..p.burstNanos / 2) { "$wait" }
        // The head moved a burst on: room again.
        assertEquals(OutputPacer.WRITE, p.next(192, 384, 4 * ms))
    }

    @Test
    fun `a head that stands still gets a blocking write, three in a row block for good`() {
        val p = pacer()
        p.wrote(384)
        var now = 0L
        assertTrue(p.next(0, 384, now) > 0)
        // Still waiting, but within the stall time.
        now += p.stallNanos
        assertTrue(p.next(0, 384, now) > 0)
        now += 1
        assertEquals(OutputPacer.BLOCK, p.next(0, 384, now))
        assertFalse(p.blocking)
        p.wrote(192)
        // The head moves: the count of stalls starts over.
        assertEquals(OutputPacer.WRITE, p.next(384, 384, now))
        p.wrote(192)
        repeat(OutputPacer.MAX_STALLS) {
            assertTrue(p.next(384, 384, now) > 0)
            now += p.stallNanos + 1
            assertEquals(OutputPacer.BLOCK, p.next(384, 384, now))
            p.wrote(192)
        }
        assertTrue(p.blocking)
        assertEquals(OutputPacer.BLOCK, p.next(10_000, 384, now))
    }

    @Test
    fun `a head past what was written, or gone backwards, is not trusted`() {
        val ahead = pacer()
        ahead.wrote(192)
        assertEquals(OutputPacer.BLOCK, ahead.next(500, 384, 0))
        assertTrue(ahead.blocking)

        val back = pacer()
        back.wrote(384)
        assertEquals(OutputPacer.WRITE, back.next(200, 384, 0))
        assertEquals(OutputPacer.BLOCK, back.next(100, 384, 0))
        assertTrue(back.blocking)
    }

    @Test
    fun `the head's 32-bit counter wraps`() {
        val p = pacer()
        // Run the head up to just under 2^32 frames, as hours of output would.
        var head = 0L
        while (head < 0xFFFFFF00L) {
            p.wrote(0x10000000)
            head += 0x10000000
            assertEquals(OutputPacer.WRITE, p.next(head.toInt(), 0x20000000, 0))
        }
        p.wrote(384)
        // Past 2^32 the raw counter starts again from the bottom.
        val raw = (head + 384).toInt()
        assertEquals(OutputPacer.WRITE, p.next(raw, 384, 0))
        assertFalse(p.blocking)
    }

    @Test
    fun `the buffer grows on an underrun and shrinks back after a quiet while, not under the floor`() {
        val p = pacer()
        val cap = 192 * 8
        var now = 0L
        assertEquals(384, p.resize(384, cap, 0, now))
        assertEquals(576, p.resize(384, cap, 1, now))
        assertEquals(768, p.resize(576, cap, 2, now))
        // No growing past the capacity.
        assertEquals(cap, p.resize(cap, cap, 3, now))
        now += OutputPacer.DECAY_NS - 1
        assertEquals(768, p.resize(768, cap, 3, now))
        now += 2
        assertEquals(576, p.resize(768, cap, 3, now))
        now += OutputPacer.DECAY_NS + 1
        assertEquals(384, p.resize(576, cap, 3, now))
        now += OutputPacer.DECAY_NS + 1
        assertEquals(384, p.resize(384, cap, 3, now))
    }

    @Test
    fun `old writes every burst blocking from the start, and its buffer only grows`() {
        // As Live wrote before the pacing: the latency test's "AudioTrack, old".
        val p = OutputPacer(burst = 192, rate = 48000, floor = 384, old = true)
        assertTrue(p.blocking)
        assertEquals(OutputPacer.BLOCK, p.next(0, 384, 0))
        p.wrote(192)
        assertEquals(OutputPacer.BLOCK, p.next(192, 384, 0))
        val cap = 192 * 8
        assertEquals(576, p.resize(384, cap, 1, 0))
        assertEquals(576, p.resize(576, cap, 1, OutputPacer.DECAY_NS * 3))
    }
}
