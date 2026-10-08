package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PeakMeterTest {
    @Test
    fun `levels in dBFS, silence at the floor`() {
        assertEquals(0f, PeakMeter.toDb(1f))
        assertEquals(-6.0206f, PeakMeter.toDb(0.5f), 1e-4f)
        assertEquals(-20f, PeakMeter.toDb(0.1f), 1e-4f)
        assertEquals(-60f, PeakMeter.toDb(0.001f), 1e-4f)
        // Quieter than the floor, and silence, read as the floor.
        assertEquals(PeakMeter.FLOOR_DB, PeakMeter.toDb(0.0001f))
        assertEquals(PeakMeter.FLOOR_DB, PeakMeter.toDb(0f))
        assertEquals(PeakMeter.FLOOR_DB, PeakMeter.toDb(-1f))
        // And back.
        assertEquals(1f, PeakMeter.fromDb(0f))
        assertEquals(0.5012f, PeakMeter.fromDb(-6f), 1e-4f)
        assertEquals(0.001f, PeakMeter.fromDb(-60f), 1e-7f)
    }

    @Test
    fun `silence reads 0`() {
        val m = PeakMeter(1000)
        assertEquals(PeakMeter.FLOOR_DB, m.dbfs())
        assertEquals(0f, m.level01())
        m.onBlock(0f, 100)
        assertEquals(PeakMeter.FLOOR_DB, m.dbfs())
        assertEquals(0f, m.level01())
        assertFalse(m.clip)
    }

    @Test
    fun `a peak holds for 300 ms, then falls at 20 dB a second`() {
        val m = PeakMeter(1000)
        m.onBlock(1f, 10)
        assertEquals(0f, m.dbfs())
        // 300 frames at 1 kHz: still held.
        m.onBlock(0f, 100)
        m.onBlock(0f, 200)
        assertEquals(0f, m.dbfs())
        // Half a second on: 10 dB down.
        m.onBlock(0f, 500)
        assertEquals(-10f, m.dbfs(), 1e-4f)
        // A block that ends the hold only falls for the part after it.
        val n = PeakMeter(1000)
        n.onBlock(1f, 10)
        n.onBlock(0f, 400)
        assertEquals(-2f, n.dbfs(), 1e-4f)
        // A quieter peak while falling doesn't lift it; a louder one holds again.
        m.onBlock(0.1f, 100)
        assertEquals(-12f, m.dbfs(), 1e-4f)
        m.onBlock(0.5f, 10)
        assertEquals(-6.0206f, m.dbfs(), 1e-4f)
        m.onBlock(0f, 300)
        assertEquals(-6.0206f, m.dbfs(), 1e-4f)
        // It comes to rest at the floor.
        m.onBlock(0f, 10_000)
        assertEquals(PeakMeter.FLOOR_DB, m.dbfs())
        assertEquals(0f, m.level01())
    }

    @Test
    fun `a clip stays lit for a second`() {
        val m = PeakMeter(1000)
        m.onBlock(0.99f, 10)
        assertFalse(m.clip)
        m.onBlock(32767 / 32768f, 10)
        assertTrue(m.clip)
        m.onBlock(0f, 999)
        assertTrue(m.clip)
        m.onBlock(0f, 1)
        assertFalse(m.clip)
        // Clipping again lights it again, and a reset puts it out.
        m.onBlock(1f, 10)
        assertTrue(m.clip)
        m.reset()
        assertFalse(m.clip)
        assertEquals(PeakMeter.FLOOR_DB, m.dbfs())
    }

    @Test
    fun `the level and the threshold mark share a scale`() {
        assertEquals(0f, PeakMeter.markOf(-60f))
        assertEquals(0.5f, PeakMeter.markOf(-30f))
        assertEquals(1f, PeakMeter.markOf(0f))
        assertEquals(0f, PeakMeter.markOf(-90f))
        assertEquals(1f, PeakMeter.markOf(6f))
        for (db in listOf(-60f, -48f, -30f, -12f, -6f, 0f)) {
            val m = PeakMeter(48_000)
            m.onBlock(PeakMeter.fromDb(db), 480)
            assertEquals(PeakMeter.markOf(db), m.level01(), 1e-5f)
            assertEquals(db, m.dbfs(), 1e-4f)
        }
    }
}
