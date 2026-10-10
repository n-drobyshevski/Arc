package dev.arc.ep133.formats.fx

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

class DistortionTest {
    private val rate = 48000

    /** [frames] stereo frames of a sine at [hz] and [level], both channels alike. */
    private fun sine(hz: Double, level: Double, frames: Int) =
        FloatArray(frames * 2) { (level * sin(2 * PI * hz * (it / 2) / rate)).toFloat() }

    private fun noise(frames: Int, seed: Int): FloatArray {
        val lcg = Lcg(seed)
        return FloatArray(frames * 2) { (lcg.unit() * 2f - 1f) * 16000f }
    }

    /** [input] through a fresh distortion at [x], [y], in blocks of 96 as the bus sends them. */
    private fun run(input: FloatArray, x: Float, y: Float): FloatArray {
        val fx = Distortion(rate).apply { setParams(x, y, 120f) }
        val out = FloatArray(input.size)
        val block = 96
        var at = 0
        while (at < input.size / 2) {
            val n = minOf(block, input.size / 2 - at)
            val i = input.copyOfRange(at * 2, (at + n) * 2)
            val o = FloatArray(n * 2)
            fx.setParams(x, y, 120f)
            fx.process(i, o, n)
            o.copyInto(out, at * 2)
            at += n
        }
        return out
    }

    /** The left channel's level at [hz] (Goertzel), past the first [skip] frames. */
    private fun level(out: FloatArray, hz: Double, skip: Int = 4800): Double {
        var re = 0.0
        var im = 0.0
        val n = out.size / 2 - skip
        for (i in 0 until n) {
            val w = 2 * PI * hz * (i + skip) / rate
            re += out[2 * (i + skip)] * cos(w)
            im += out[2 * (i + skip)] * sin(w)
        }
        return 2 * sqrt(re * re + im * im) / n
    }

    private fun rms(out: FloatArray, skip: Int = 4800): Double {
        var sum = 0.0
        for (i in skip * 2 until out.size) sum += out[i].toDouble() * out[i]
        return sqrt(sum / (out.size - skip * 2))
    }

    /** The RMS of the left channel's step from one frame to the next: how much top end there is. */
    private fun edge(out: FloatArray, skip: Int = 4800): Double {
        var sum = 0.0
        for (i in skip + 1 until out.size / 2) {
            val d = out[2 * i].toDouble() - out[2 * i - 2]
            sum += d * d
        }
        return sqrt(sum / (out.size / 2 - skip - 1))
    }

    @Test
    fun `more drive raises the odd harmonics, and only those`() {
        // 1 kHz at about -6 dB: the drive bends it into a square's odd harmonics.
        val tone = sine(1000.0, 16000.0, 48000)
        val soft = run(tone, 0f, 0.5f)
        val hard = run(tone, 1f, 0.5f)
        val third = { out: FloatArray -> level(out, 3000.0) / level(out, 1000.0) }
        assertTrue(third(hard) > 0.2) { "${third(hard)}" }
        assertTrue(third(hard) > 5 * third(soft)) { "${third(soft)} -> ${third(hard)}" }
        assertTrue(level(hard, 5000.0) / level(hard, 1000.0) > 0.05)
        // The clip is the same both ways round: no even harmonics.
        assertTrue(level(hard, 2000.0) / level(hard, 1000.0) < 1e-3)
    }

    @Test
    fun `a hard drive clips the peaks and is made up by its square root`() {
        val tone = sine(440.0, 32000.0, 48000)
        val hard = run(tone, 1f, 0.5f)
        val peak = hard.maxOf { abs(it) }
        // The clip's ceiling is full scale over sqrt(40); a sine's peak is sqrt(2) its RMS, a square's 1.
        assertTrue(peak <= 32768f / sqrt(40f) + 1f) { "$peak" }
        assertTrue(peak / rms(hard) < 1.15) { "${peak / rms(hard)}" }
    }

    @Test
    fun `the middle of Y is the clip alone, exactly`() {
        val input = noise(4800, 3)
        val out = run(input, 0f, 0.5f)
        for (i in input.indices) assertEquals(softClip(input[i] * (1f / 32768f)) * 32768f, out[i])
    }

    @Test
    fun `Y colours the clip, a low-pass below the middle and a high-pass above it`() {
        // Noise loses its top end below the middle.
        val input = noise(48000, 5)
        val tilt = { out: FloatArray -> edge(out) / rms(out) }
        assertTrue(tilt(run(input, 0.3f, 0f)) < 0.2 * tilt(run(input, 0.3f, 0.5f)))
        // A high tone goes through the high-pass, not the low-pass; a low one the other way round.
        val high = sine(9000.0, 8000.0, 48000)
        assertTrue(level(run(high, 0f, 1f), 9000.0) > 0.7 * 8000)
        assertTrue(level(run(high, 0f, 0f), 9000.0) < 0.05 * 8000)
        val low = sine(80.0, 8000.0, 48000)
        assertTrue(level(run(low, 0f, 0f), 80.0) > 0.7 * 8000)
        assertTrue(level(run(low, 0f, 1f), 80.0) < 0.05 * 8000)
    }

    @Test
    fun `a knob that moves glides, and crossing the middle does not click`() {
        val fx = Distortion(rate)
        val tone = sine(200.0, 12000.0, 9600)
        val out = FloatArray(tone.size)
        var y = 0.35f
        for (b in 0 until 100) {
            // Y back and forth across the middle, X from one end to the other, a block at a time.
            y = if (b % 20 < 10) y + 0.03f else y - 0.03f
            fx.setParams(if (b % 10 < 5) 0f else 1f, y, 120f)
            val o = FloatArray(192)
            fx.process(tone.copyOfRange(b * 192, b * 192 + 192), o, 96)
            o.copyInto(out, b * 192)
        }
        var step = 0f
        for (i in 1 until out.size / 2) step = maxOf(step, abs(out[2 * i] - out[2 * i - 2]))
        // A 200 Hz sine at 12000 moves at most 314 a frame, sqrt(40) times that clipped at the hardest
        // drive (about 2000); a drive jumping from 1 to 40 at once would step by over 6000.
        assertTrue(step < 3000f) { "$step" }
    }

    @Test
    fun `it is silent until it hears something, and again once that is gone`() {
        val fx = Distortion(rate)
        assertTrue(fx.silent)
        fx.setParams(0.5f, 0f, 120f)
        val out = FloatArray(192)
        fx.process(noise(96, 1), out, 96)
        assertFalse(fx.silent)
        val zeros = FloatArray(192)
        var blocks = 0
        while (!fx.silent) {
            fx.process(zeros, FloatArray(192), 96)
            blocks++
            assertTrue(blocks < 1000)
        }
        fx.process(noise(96, 2), out, 96)
        fx.reset()
        assertTrue(fx.silent)
    }
}
