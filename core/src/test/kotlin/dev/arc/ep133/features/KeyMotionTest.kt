package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class KeyMotionTest {
    /** Steps [key] 1 ms at a time for [ms], [down] throughout; the lowest position seen. */
    private fun run(key: KeyMotion.Key, down: Boolean, ms: Int): Float {
        var lowest = key.pos
        repeat(ms) {
            KeyMotion.step(key, down, 1f)
            lowest = minOf(lowest, key.pos)
        }
        return lowest
    }

    @Test
    fun `a press goes straight down to a hard stop`() {
        val key = KeyMotion.Key()
        assertTrue(KeyMotion.step(key, true, 12f))
        assertEquals(0.5f, key.pos, 1e-6f)
        assertFalse(KeyMotion.step(key, true, 12f))
        assertEquals(1f, key.pos)
        // Held, it stays there.
        assertFalse(KeyMotion.step(key, true, 100f))
        assertTrue(key.still)
    }

    @Test
    fun `a quick tap stays down its shortest time`() {
        val key = KeyMotion.Key()
        run(key, true, 10)
        // Let go at 10 ms: it still goes on down and stays until 50 ms.
        assertTrue(KeyMotion.step(key, false, 20f))
        assertEquals(1f, key.pos)
        run(key, false, 19)
        assertEquals(1f, key.pos)
        run(key, false, 2)
        assertTrue(key.pos < 1f)
    }

    @Test
    fun `let go, it springs back past rest and settles`() {
        val key = KeyMotion.Key()
        run(key, true, 100)
        val lowest = run(key, false, KeyMotion.RELEASE_MS)
        // The face lifts 16% of the travel past its edge, then settles at rest.
        assertEquals(-0.163f, lowest, 0.01f)
        assertTrue(key.still)
        assertEquals(0f, key.pos)
    }

    @Test
    fun `the steps follow the spring's own curve`() {
        val key = KeyMotion.Key()
        run(key, true, 100)
        for (ms in 1..KeyMotion.RELEASE_MS / 2) {
            KeyMotion.step(key, false, 1f)
            assertEquals(KeyMotion.release(ms.toDouble() / KeyMotion.RELEASE_MS), 1.0 - key.pos, 1e-4)
        }
    }

    @Test
    fun `pressed again on the way up, it goes down from where it is`() {
        val key = KeyMotion.Key()
        run(key, true, 100)
        run(key, false, 20)
        val at = key.pos
        KeyMotion.step(key, true, 6f)
        assertEquals(maxOf(0f, at) + 0.25f, key.pos, 1e-5f)
    }

    @Test
    fun `the release curve`() {
        assertEquals(0.0, KeyMotion.release(0.0), 1e-9)
        assertEquals(1.0, KeyMotion.release(1.0), 0.01)
    }
}
