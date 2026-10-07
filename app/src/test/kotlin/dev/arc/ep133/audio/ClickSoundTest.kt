package dev.arc.ep133.audio

import dev.arc.ep133.features.Beat
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs
import kotlin.math.log10

/** The click's sound, and how it is laid into the click stream's blocks. */
class ClickSoundTest {
    private fun peakDb(a: ShortArray) = 20 * log10(a.maxOf { abs(it.toInt()) } / 32767.0)

    private fun crossings(a: ShortArray) = (1 until a.size).count { (a[it - 1] < 0) != (a[it] < 0) }

    @Test
    fun `thirty milliseconds, peaking near -7 dBFS, from zero to zero`() {
        for (rate in listOf(44100, 48000)) {
            for (accent in listOf(false, true)) {
                val a = ClickSound.render(rate, accent)
                assertEquals(Math.round(ClickSound.LENGTH_S * rate).toInt(), a.size)
                assertEquals(0, a.first().toInt())
                assertEquals(0, a.last().toInt())
                val db = peakDb(a)
                assertTrue(db <= ClickSound.PEAK_DBFS + 0.01 && db > ClickSound.PEAK_DBFS - 1.5) { "$rate $accent: $db dBFS" }
            }
        }
    }

    @Test
    fun `it rises without a step and the accent is higher`() {
        val a = ClickSound.render(48000, accent = false)
        // The first samples, inside the 1 ms attack, stay far under the peak.
        assertTrue(abs(a[2].toInt()) < ClickSound.peak * 0.1)
        // Its last 2 ms only fade.
        assertTrue(a.takeLast(10).all { abs(it.toInt()) < ClickSound.peak * 0.01 })
        val accent = ClickSound.render(48000, accent = true)
        assertTrue(crossings(accent) > crossings(a) * 1.3) { "${crossings(accent)} vs ${crossings(a)}" }
    }

    @Test
    fun `a click past a block's end goes on in the next, then silence`() {
        val t = ClickTrack(48000)
        val sound = ClickSound.render(48000, accent = false)
        val out = ShortArray(192) { 7 }
        t.fill(out, 192, listOf(ClickScheduler.Click(150, Beat(0, 0, accent = false))))
        assertTrue(out.take(150).all { it.toInt() == 0 })
        assertArrayEquals(sound.copyOfRange(0, 42), out.copyOfRange(150, 192))
        var at = 42
        while (at < sound.size) {
            t.fill(out, 192, emptyList())
            val n = minOf(192, sound.size - at)
            assertArrayEquals(sound.copyOfRange(at, at + n), out.copyOfRange(0, n))
            assertTrue(out.drop(n).all { it.toInt() == 0 })
            at += n
        }
        t.fill(out, 192, emptyList())
        assertTrue(out.all { it.toInt() == 0 })
    }

    @Test
    fun `an accented click plays the accent's sound`() {
        val t = ClickTrack(48000)
        val out = ShortArray(64)
        t.fill(out, 64, listOf(ClickScheduler.Click(0, Beat(4, 0, accent = true))))
        assertArrayEquals(ClickSound.render(48000, accent = true).copyOfRange(0, 64), out)
    }
}
