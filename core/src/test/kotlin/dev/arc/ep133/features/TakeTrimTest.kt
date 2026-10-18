package dev.arc.ep133.features

import dev.arc.ep133.text.MirrorText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** A take's trim: kept inside the take, never shorter than a tenth of a second, null when it is all of it. */
class TakeTrimTest {
    @Test
    fun `a trim stays inside the take and is null when it is the whole take`() {
        assertEquals(TakeTrim(4_800, 9_600), TakeTrim.of(4_800, 9_600, 48_000, 48_000))
        assertNull(TakeTrim.of(0, 48_000, 48_000, 48_000))
        assertNull(TakeTrim.of(-10, 60_000, 48_000, 48_000))
        assertEquals(TakeTrim(0, 24_000), TakeTrim.of(-10, 24_000, 48_000, 48_000))
    }

    @Test
    fun `a trim is at least a tenth of a second, the end moving first`() {
        assertEquals(TakeTrim(1_000, 5_800), TakeTrim.of(1_000, 1_200, 48_000, 48_000))
        assertEquals(TakeTrim(43_200, 48_000), TakeTrim.of(47_000, 47_500, 48_000, 48_000))
        // A take shorter than that is all of it.
        assertNull(TakeTrim.of(10, 20, 100, 48_000))
    }

    @Test
    fun `a trim file reads back, and what isn't one is nothing`() {
        val t = TakeTrim(147_200, 316_800)
        assertEquals("147200 316800", t.text())
        assertEquals(t, TakeTrim.parse(t.text() + "\n", 584_000, 8_000))
        assertNull(TakeTrim.parse("", 584_000, 8_000))
        assertNull(TakeTrim.parse("12 x", 584_000, 8_000))
        assertNull(TakeTrim.parse("500 100", 584_000, 8_000))
        assertNull(TakeTrim.parse("0 584000", 584_000, 8_000))
        assertEquals(147_200 until 316_800, t.range())
    }

    @Test
    fun `the wave's peaks span all channels`() {
        val pcm = shortArrayOf(1000, -2000, 0, 0, 32767, -32768, 0, 0)
        val p = TakeTrim.peaks(pcm, 2, 2)
        assertEquals(Peak(-2000 / 32768f, 1000 / 32767f), p[0])
        assertEquals(Peak(-1f, 1f), p[1])
        assertEquals(List(3) { Peak(0f, 0f) }, TakeTrim.peaks(ShortArray(0), 1, 3))
    }

    @Test
    fun `the glass's times`() {
        assertEquals("0:18.4", MirrorText.trimTime(18.46))
        assertEquals("1:05.0", MirrorText.trimTime(65.0))
        assertEquals("0:18.4 → 0:39.6", MirrorText.trimSpan(18.4, 39.6))
        assertEquals("T02, 0:21 trimmed, Oct 4, playing", MirrorText.takeRow(2, 21.2, "Oct 4", true, trimmed = true))
        assertEquals("T05, a copy of T02", MirrorText.takeDuplicated(5, 2))
    }
}
