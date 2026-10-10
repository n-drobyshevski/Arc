package dev.arc.ep133.formats.fx

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.pow

class CompressorTest {
    private val rate = 48000

    /** [input] through [fx] in blocks of 96 at [x], [y]: added to silence, or in place. */
    private fun run(input: FloatArray, x: Float, y: Float, fx: Compressor = Compressor(rate), inPlace: Boolean = false): FloatArray {
        val out = FloatArray(input.size)
        var at = 0
        while (at < input.size / 2) {
            val n = minOf(96, input.size / 2 - at)
            fx.setParams(x, y, 120f)
            val i = input.copyOfRange(at * 2, (at + n) * 2)
            if (inPlace) {
                fx.processInPlace(i, n)
                i.copyInto(out, at * 2)
            } else {
                val o = FloatArray(n * 2)
                fx.process(i, o, n)
                o.copyInto(out, at * 2)
            }
            at += n
        }
        return out
    }

    @Test
    fun `below the threshold it leaves the level alone, above it it pulls it down 4 to 1`() {
        // No drive: 1x in, 1x made up.
        val quiet = FloatArray(96000) { if (it % 2 == 0) 2000f else -2000f }
        assertArrayEquals(quiet, run(quiet, 0f, 0f))
        val loud = FloatArray(96000) { 20000f }
        val out = run(loud, 0f, 0f)
        // Settled: the threshold plus a quarter of the way above it (in dB).
        val expected = Compressor.THRESHOLD * (20000.0 / Compressor.THRESHOLD).pow(0.25)
        assertEquals(expected, out.last().toDouble(), expected * 0.01)
        assertTrue(out.last() < 0.35f * 20000f)
    }

    @Test
    fun `the drive pushes it harder, and makes up for itself below the threshold`() {
        // X = 1: 8x in, 1/sqrt(8) out, so what stays below comes up by sqrt(8).
        val soft = FloatArray(9600) { 300f }
        assertEquals(300.0 * sqrt8, run(soft, 1f, 0.5f).last().toDouble(), 0.01)
        // A level that was below the threshold is driven over it.
        val mid = FloatArray(96000) { 3000f }
        val driven = run(mid, 1f, 0f).last()
        assertTrue(driven < 3000f * sqrt8.toFloat() * 0.8f) { "$driven" }
    }

    @Test
    fun `the speed picks the attack, fast pulling a sudden peak down sooner`() {
        val step = FloatArray(96000) { if (it < 9600) 0f else 20000f }
        fun settle(y: Float): Int {
            val out = run(step, 0f, y)
            // Frames from the step until it is down 6 dB.
            for (i in 4800 until 48000) if (out[2 * i] < 10000f) return i - 4800
            return Int.MAX_VALUE
        }
        val fast = settle(0f)
        val slow = settle(0.99f)
        assertTrue(fast < 48) { "$fast" }
        assertTrue(slow > 5 * fast) { "$fast vs $slow" }
        // And the release: once the peak has gone, fast lets go sooner.
        val burst = FloatArray(96000) { if (it < 24000) 20000f else 2000f }
        fun recover(y: Float): Int {
            val out = run(burst, 0f, y)
            for (i in 12000 until 48000) if (out[2 * i] > 1900f) return i - 12000
            return Int.MAX_VALUE
        }
        assertTrue(recover(0f) * 5 < recover(0.99f)) { "${recover(0f)} vs ${recover(0.99f)}" }
    }

    @Test
    fun `the master compresses in place as the effect adds`() {
        val lcg = Lcg(11)
        val noise = FloatArray(48000) { (lcg.unit() * 2f - 1f) * 30000f }
        assertArrayEquals(run(noise, 0.7f, 0.3f), run(noise, 0.7f, 0.3f, inPlace = true))
    }

    @Test
    fun `it is silent once its input is, and it has let go`() {
        val fx = Compressor(rate)
        assertTrue(fx.silent)
        fx.setParams(0f, 0f, 120f)
        fx.process(FloatArray(192) { 20000f }, FloatArray(192), 96)
        assertFalse(fx.silent)
        // Its input gone, it returns nothing, but it is not silent until the envelope is below the threshold.
        val out = FloatArray(192)
        fx.process(FloatArray(192), out, 96)
        assertTrue(out.all { it == 0f })
        var blocks = 0
        while (!fx.silent) {
            fx.process(FloatArray(192), FloatArray(192), 96)
            blocks++
        }
        assertTrue(blocks in 1..100) { "$blocks" }
        fx.process(FloatArray(192) { 20000f }, FloatArray(192), 96)
        fx.reset()
        assertTrue(fx.silent)
    }

    private val sqrt8 = kotlin.math.sqrt(8.0)
}
