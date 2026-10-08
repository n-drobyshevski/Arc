package dev.arc.ep133.formats.fx

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs
import kotlin.math.sqrt

class SvfTest {
    private val rate = 48000

    /** The RMS of [out] past its first [skip] samples (the filter settling). */
    private fun rms(out: FloatArray, skip: Int): Float {
        var sum = 0.0
        for (i in skip until out.size) sum += out[i].toDouble() * out[i]
        return sqrt(sum / (out.size - skip)).toFloat()
    }

    private fun run(svf: Svf, input: FloatArray, pick: (Svf) -> Float) = FloatArray(input.size) {
        svf.process(input[it])
        pick(svf)
    }

    @Test
    fun `the low-pass takes out what is far above its cutoff`() {
        // A square at the Nyquist rate, and noise, through a 500 Hz low-pass.
        val square = FloatArray(4800) { if (it % 2 == 0) 1f else -1f }
        val svf = Svf().apply { tune(500f, 0.707f, rate) }
        assertTrue(rms(run(svf, square) { it.lp }, 480) < 1e-3f)
        val lcg = Lcg(133)
        val noise = FloatArray(48000) { lcg.unit() * 2f - 1f }
        val quiet = rms(run(Svf().apply { tune(500f, 0.707f, rate) }, noise) { it.lp }, 480)
        // White noise keeps about sqrt(500 / 24000) of itself under 500 Hz: well under a quarter.
        assertTrue(quiet < 0.25f * rms(noise, 0)) { "$quiet" }
        // Its high-pass keeps the square whole.
        val loud = rms(run(Svf().apply { tune(500f, 0.707f, rate) }, square) { it.hp }, 480)
        assertEquals(1f, loud, 0.01f)
    }

    @Test
    fun `the high-pass takes out DC, the low-pass keeps it`() {
        val dc = FloatArray(9600) { 1f }
        val hp = run(Svf().apply { tune(100f, 0.707f, rate) }, dc) { it.hp }
        assertTrue(abs(hp.last()) < 1e-4f) { "${hp.last()}" }
        val lp = run(Svf().apply { tune(100f, 0.707f, rate) }, dc) { it.lp }
        assertEquals(1f, lp.last(), 1e-4f)
        // The band-pass is the difference: neither.
        val bp = run(Svf().apply { tune(100f, 0.707f, rate) }, dc) { it.bp }
        assertTrue(abs(bp.last()) < 1e-4f)
    }

    @Test
    fun `at Q 8 near the cutoff cap it rings but stays bounded`() {
        val lcg = Lcg(7)
        val noise = FloatArray(96000) { (lcg.unit() * 2f - 1f) * 32768f }
        for (hz in listOf(0.39f * rate, 0.4f * rate, 30000f, 20f)) {
            val svf = Svf().apply { tune(hz, 8f, rate) }
            var peak = 0f
            for (x in noise) {
                svf.process(x)
                for (v in floatArrayOf(svf.lp, svf.bp, svf.hp)) {
                    assertTrue(v.isFinite()) { "$hz Hz" }
                    peak = maxOf(peak, abs(v))
                }
            }
            // Q 8 rings at most about Q times the input at the cutoff.
            assertTrue(peak < 32768f * 40f) { "$hz Hz: $peak" }
        }
    }

    @Test
    fun `a tail dies to exactly zero, and reset silences it at once`() {
        val svf = Svf().apply { tune(1000f, 8f, rate) }
        svf.process(32768f)
        repeat(rate * 4) { svf.process(0f) }
        assertEquals(0f, svf.lp)
        assertEquals(0f, svf.bp)
        assertEquals(0f, svf.hp)
        svf.process(1000f)
        svf.reset()
        svf.process(0f)
        assertEquals(0f, svf.lp)
        assertEquals(0f, svf.hp)
    }

    @Test
    fun `retuning keeps the state, so a sweep does not click`() {
        val svf = Svf().apply { tune(200f, 0.707f, rate) }
        repeat(4800) { svf.process(1f) }
        val before = svf.lp
        svf.tune(5000f, 0.707f, rate)
        svf.process(1f)
        assertEquals(before, svf.lp, 1e-3f)
    }
}
