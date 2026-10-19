package dev.arc.ep133.formats.fx

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs
import kotlin.math.sqrt

class ReverbTest {
    private val rate = 48000

    /** [input] through a fresh reverb at [x], [y], in blocks of 96. */
    private fun run(input: FloatArray, x: Float, y: Float, fx: Reverb = Reverb(rate)): FloatArray {
        val out = FloatArray(input.size)
        var at = 0
        while (at < input.size / 2) {
            val n = minOf(96, input.size / 2 - at)
            fx.setParams(x, y, 120f)
            val o = FloatArray(n * 2)
            fx.process(input.copyOfRange(at * 2, (at + n) * 2), o, n)
            o.copyInto(out, at * 2)
            at += n
        }
        return out
    }

    /** A tenth of a second of noise at ±16000 (each channel its own), then silence until [frames]. */
    private fun burst(frames: Int, seed: Int = 7): FloatArray {
        val lcg = Lcg(seed)
        return FloatArray(frames * 2) { if (it < 9600) (lcg.unit() * 2f - 1f) * 16000f else 0f }
    }

    /** The RMS of both channels from frame [from] until [to]. */
    private fun rms(out: FloatArray, from: Int, to: Int): Double {
        var sum = 0.0
        for (i in from * 2 until to * 2) sum += out[i].toDouble() * out[i]
        return sqrt(sum / ((to - from) * 2))
    }

    /** How much top end the left channel has from [from] until [to]: the RMS of its step a frame, over its RMS. */
    private fun brightness(out: FloatArray, from: Int, to: Int): Double {
        var sum = 0.0
        var level = 0.0
        for (i in from until to) {
            val d = out[2 * i].toDouble() - out[2 * i - 2]
            sum += d * d
            level += out[2 * i].toDouble() * out[2 * i]
        }
        return sqrt(sum / level)
    }

    @Test
    fun `the tail rings longer the larger X is`() {
        val input = burst(96000)
        val small = run(input, 0f, 0.5f)
        val mid = run(input, 0.5f, 0.5f)
        val large = run(input, 1f, 0.5f)
        // Half a second to a second after the burst.
        val tail = { out: FloatArray -> rms(out, 33600, 57600) }
        assertTrue(tail(mid) > 3 * tail(small)) { "${tail(small)} -> ${tail(mid)}" }
        assertTrue(tail(large) > 3 * tail(mid)) { "${tail(mid)} -> ${tail(large)}" }
        // While the burst plays, it is a reverb of about the level it is fed.
        assertTrue(rms(mid, 4800, 9600) in 1000.0..16000.0) { "${rms(mid, 4800, 9600)}" }
    }

    @Test
    fun `Y darkens the tail below the middle and brightens it above`() {
        val input = burst(48000)
        val tone = { y: Float -> brightness(run(input, 0.6f, y), 14400, 33600) }
        val dark = tone(0f)
        val open = tone(0.5f)
        val bright = tone(1f)
        assertTrue(dark < 0.6 * open) { "$dark $open" }
        assertTrue(bright > 1.15 * open) { "$open $bright" }
    }

    @Test
    fun `the two sides differ`() {
        val out = run(burst(48000), 0.5f, 0.5f)
        var same = 0.0
        var all = 0.0
        for (i in 9600 until 48000) {
            val d = out[2 * i] - out[2 * i + 1]
            same += d.toDouble() * d
            all += out[2 * i].toDouble() * out[2 * i]
        }
        assertTrue(same > 0.5 * all) { "$same $all" }
    }

    @Test
    fun `it is silent until it hears something, and again once its tail is gone`() {
        val fx = Reverb(rate)
        assertTrue(fx.silent)
        fx.setParams(1f, 0.5f, 120f)
        fx.process(burst(96), FloatArray(192), 96)
        assertFalse(fx.silent)
        val zeros = FloatArray(192)
        var blocks = 0
        while (!fx.silent) {
            fx.setParams(1f, 0.5f, 120f)
            fx.process(zeros, FloatArray(192), 96)
            blocks++
            assertTrue(blocks < 100000)
        }
        // The longest size rings for a while: more than a second.
        assertTrue(blocks > 500) { "$blocks" }
        val out = FloatArray(192)
        fx.process(zeros, out, 96)
        assertTrue(out.all { abs(it) < 1e-5f })
        // Reset: from silence.
        fx.process(burst(96), FloatArray(192), 96)
        fx.reset()
        assertTrue(fx.silent)
        fx.setParams(0.5f, 0.5f, 120f)
        repeat(100) {
            val o = FloatArray(192)
            fx.process(zeros, o, 96)
            assertTrue(o.all { it == 0f })
        }
    }

    @Test
    fun `its lines scale to the rate, even a slow one`() {
        // At 1000 Hz the lines are a few frames long: it still rings and dies away.
        val fx = Reverb(1000)
        val out = run(FloatArray(4000).also { it[0] = 10000f }, 0.5f, 0.5f, fx)
        assertTrue(rms(out, 0, 200) > 1.0)
        assertTrue(out.all { it.isFinite() })
    }
}
