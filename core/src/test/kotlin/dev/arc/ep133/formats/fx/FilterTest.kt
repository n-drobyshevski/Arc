package dev.arc.ep133.formats.fx

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.math.sqrt

class FilterTest {
    private val rate = 48000

    /** [frames] stereo frames of a sine at [hz] and [level], both channels alike. */
    private fun sine(hz: Double, level: Double, frames: Int) =
        FloatArray(frames * 2) { (level * sin(2 * PI * hz * (it / 2) / rate)).toFloat() }

    /** [input] through [fx] in blocks of 96, the knobs from [knobs] (by block) set before each. */
    private fun run(input: FloatArray, fx: Filter = Filter(rate), knobs: (Int) -> Pair<Float, Float>): FloatArray {
        val out = FloatArray(input.size)
        var at = 0
        var b = 0
        while (at < input.size / 2) {
            val n = minOf(96, input.size / 2 - at)
            val (x, y) = knobs(b++)
            fx.setParams(x, y, 120f)
            val o = FloatArray(n * 2)
            fx.process(input.copyOfRange(at * 2, (at + n) * 2), o, n)
            o.copyInto(out, at * 2)
            at += n
        }
        return out
    }

    private fun rms(out: FloatArray, skip: Int = 4800): Double {
        var sum = 0.0
        for (i in skip * 2 until out.size) sum += out[i].toDouble() * out[i]
        return sqrt(sum / (out.size - skip * 2))
    }

    @Test
    fun `low on X is a low-pass that takes the highs away`() {
        // X = 0.1: a cutoff of about 250 Hz.
        val high = sine(8000.0, 10000.0, 24000)
        val low = sine(50.0, 10000.0, 24000)
        assertTrue(rms(run(high) { 0.1f to 0f }) < 0.01 * rms(high))
        assertTrue(rms(run(low) { 0.1f to 0f }) > 0.9 * rms(low))
    }

    @Test
    fun `high on X is a high-pass that takes the lows away`() {
        // X = 0.9: a cutoff of about 3.9 kHz.
        val low = sine(100.0, 10000.0, 24000)
        val high = sine(15000.0, 10000.0, 24000)
        assertTrue(rms(run(low) { 0.9f to 0f }) < 0.01 * rms(low))
        assertTrue(rms(run(high) { 0.9f to 0f }) > 0.9 * rms(high))
    }

    @Test
    fun `the middle of X lets the input through untouched`() {
        val lcg = Lcg(9)
        val noise = FloatArray(9600) { (lcg.unit() * 2f - 1f) * 30000f }
        for (x in listOf(0.47f, 0.5f, 0.53f)) {
            for (y in listOf(0f, 0.5f, 1f)) assertArrayEquals(noise, run(noise) { x to y }, "x $x, y $y")
        }
    }

    @Test
    fun `Y raises the resonance at the cutoff`() {
        // At its own cutoff a filter's gain is about its Q: 0.5 at Y = 0, 8 at Y = 1.
        val hz = knobHz(0.2f / 0.47f, 60f, 20000f).toDouble()
        val tone = sine(hz, 1000.0, 24000)
        assertTrue(rms(run(tone) { 0.2f to 0f }) < 0.6 * rms(tone))
        assertTrue(rms(run(tone) { 0.2f to 1f }) > 6 * rms(tone))
    }

    @Test
    fun `crossing from one mode to another fades instead of stepping`() {
        val tone = sine(200.0, 10000.0, 19200)
        // A low-pass, straight over to a high-pass, to the middle, back to the low-pass (from silence),
        // and over to the high-pass again before that fade is over.
        val jumps = listOf(0.1f, 0.9f, 0.5f, 0.1f, 0.9f)
        // Then a slow sweep across the middle and back.
        val sweep = List(41) { 0.4f + it * 0.005f } + List(41) { 0.6f - it * 0.005f }
        for (xs in listOf(jumps, sweep)) {
            val out = run(tone) { b -> xs[minOf(b / 4, xs.size - 1)] to 0.3f }
            var step = 0f
            for (i in 1 until out.size / 2) step = maxOf(step, abs(out[2 * i] - out[2 * i - 2]))
            // 200 Hz at 10000 moves at most 262 a frame; the low-pass to high-pass jump unfaded would be thousands.
            assertTrue(step < 400f) { "$xs: $step" }
        }
    }

    @Test
    fun `it is silent until it hears something, and again once that is gone`() {
        val fx = Filter(rate)
        assertTrue(fx.silent)
        fx.setParams(0.2f, 1f, 120f)
        fx.process(sine(300.0, 10000.0, 96), FloatArray(192), 96)
        assertFalse(fx.silent)
        var blocks = 0
        while (!fx.silent) {
            fx.process(FloatArray(192), FloatArray(192), 96)
            blocks++
            assertTrue(blocks < 2000)
        }
        fx.setParams(0.5f, 1f, 120f)
        fx.process(FloatArray(192), FloatArray(192), 96)
        assertTrue(fx.silent)
        fx.process(sine(300.0, 10000.0, 96), FloatArray(192), 96)
        fx.reset()
        assertTrue(fx.silent)
    }
}
