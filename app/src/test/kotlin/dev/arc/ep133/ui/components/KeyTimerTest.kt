package dev.arc.ep133.ui.components

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The connection key's hold: a second with the finger down disconnects, letting go before then never does. */
class KeyTimerTest {
    @Test
    fun `the hold is a second`() {
        assertEquals(1000L, HOLD_MS)
    }

    @Test
    fun `progress fills over the second and stays full`() {
        val t = KeyTimer()
        assertEquals(0f, t.progress(500))
        t.down(500)
        assertEquals(0f, t.progress(500))
        assertEquals(0.25f, t.progress(750))
        assertEquals(0.999f, t.progress(1499), 1e-6f)
        assertEquals(1f, t.progress(1500))
        assertEquals(1f, t.progress(9000))
    }

    @Test
    fun `it is due once, at a second and not before`() {
        val t = KeyTimer()
        t.down(100)
        assertFalse(t.due(1099))
        assertTrue(t.due(1100))
        assertFalse(t.due(1100))
        assertFalse(t.due(2000))
    }

    @Test
    fun `let go before a second it is a tap and never due`() {
        val t = KeyTimer()
        t.down(0)
        assertFalse(t.due(999))
        assertEquals(HoldEnd.TAP, t.up(999))
        // A late poll after the lift finds nothing to act on.
        assertFalse(t.due(5000))
        assertEquals(HoldEnd.NONE, t.up(5000))
        assertEquals(0f, t.progress(5000))
        assertFalse(t.down)
    }

    @Test
    fun `let go after it was due is done, so the lift does nothing more`() {
        val t = KeyTimer()
        t.down(0)
        assertTrue(t.due(1000))
        assertEquals(HoldEnd.DONE, t.up(1700))
    }

    @Test
    fun `let go past a second before anyone looked is the hold`() {
        val t = KeyTimer()
        t.down(0)
        assertEquals(HoldEnd.HELD, t.up(1000))
        assertFalse(t.due(1001))
    }

    @Test
    fun `a cancel resets the ring and the next touch starts again`() {
        val t = KeyTimer()
        t.down(0)
        assertEquals(0.5f, t.progress(500))
        t.cancel()
        assertEquals(0f, t.progress(500))
        assertFalse(t.due(5000))
        assertEquals(HoldEnd.NONE, t.up(5000))
        t.down(6000)
        assertFalse(t.due(6999))
        assertEquals(0.5f, t.progress(6500))
        assertTrue(t.due(7000))
    }

    @Test
    fun `a touch after a hold starts clean`() {
        val t = KeyTimer()
        t.down(0)
        assertTrue(t.due(1000))
        assertEquals(HoldEnd.DONE, t.up(1200))
        t.down(2000)
        assertFalse(t.due(2500))
        assertEquals(HoldEnd.TAP, t.up(2500))
    }
}
