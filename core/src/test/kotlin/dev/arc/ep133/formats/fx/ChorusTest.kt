package dev.arc.ep133.formats.fx

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

class ChorusTest {
    private val rate = 48000

    /** [input] through [fx] in blocks of 96 at [x], [y]. */
    private fun run(input: FloatArray, x: Float, y: Float, fx: Chorus = Chorus(rate)): FloatArray {
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

    /** [frames] stereo frames of a 1 kHz sine (48 frames a cycle) at [level], both channels alike. */
    private fun tone(frames: Int, level: Float) =
        FloatArray(frames * 2) { (level * sin(2 * PI * 1000.0 * (it / 2) / rate)).toFloat() }

    /** The most the left channel differs from itself one cycle (48 frames) on, from frame [from]. */
    private fun drift(out: FloatArray, from: Int, channel: Int = 0): Float {
        var most = 0f
        for (i in from until out.size / 2 - 48) most = maxOf(most, abs(out[2 * (i + 48) + channel] - out[2 * i + channel]))
        return most
    }

    @Test
    fun `its taps move, so a steady tone comes back bent, not as a still comb`() {
        val level = 10000f
        val out = run(tone(96000, level), 0.6f, 0.5f)
        // A still delay of a steady tone repeats every cycle; a moving one does not.
        assertTrue(drift(out, 4800) > 0.05f * level) { "${drift(out, 4800)}" }
        assertTrue(drift(out, 4800, 1) > 0.05f * level)
        // The two sides move a quarter of a cycle apart.
        var apart = 0f
        for (i in 4800 until 96000) apart = maxOf(apart, abs(out[2 * i] - out[2 * i + 1]))
        assertTrue(apart > 0.05f * level) { "$apart" }
        // Y = 0 still moves (a quarter of the swing), with less to it.
        val shallow = run(tone(96000, level), 0.6f, 0f)
        assertTrue(drift(shallow, 4800) > 0.01f * level)
        assertTrue(drift(shallow, 4800) < drift(out, 4800))
    }

    @Test
    fun `X sets how fast the taps move`() {
        val level = 10000f
        // Over a tenth of a second, a slow LFO hardly moves; a fast one goes through half a cycle.
        val slow = run(tone(4800 + 4800, level), 0.1f, 1f)
        val fast = run(tone(4800 + 4800, level), 1f, 1f)
        assertTrue(drift(fast, 4800) > 4 * drift(slow, 4800)) { "${drift(slow, 4800)} ${drift(fast, 4800)}" }
    }

    @Test
    fun `the most feedback stays bounded`() {
        val lcg = Lcg(11)
        val noise = FloatArray(96000 * 2) { (lcg.unit() * 2f - 1f) * 30000f }
        val out = run(noise, 1f, 1f)
        // Fed back 0.7 of the taps' mean, the line holds at most 1 / 0.3 of the input.
        val peak = out.maxOf { abs(it) }
        assertTrue(peak < 30000f / 0.3f) { "$peak" }
        assertTrue(out.all { it.isFinite() })
        // A steady tone settles: its last half second is no louder than the half second before.
        val ring = run(tone(96000, 10000f), 1f, 1f)
        val late = (72000 until 96000).maxOf { abs(ring[2 * it]) }
        val earlier = (48000 until 72000).maxOf { abs(ring[2 * it]) }
        assertTrue(late < earlier * 1.1f) { "$earlier $late" }
    }

    @Test
    fun `it is silent until it hears something, and again once that is gone`() {
        val fx = Chorus(rate)
        assertTrue(fx.silent)
        fx.setParams(0.5f, 1f, 120f)
        fx.process(tone(96, 10000f), FloatArray(192), 96)
        assertFalse(fx.silent)
        val zeros = FloatArray(192)
        var blocks = 0
        while (!fx.silent) {
            fx.setParams(0.5f, 1f, 120f)
            fx.process(zeros, FloatArray(192), 96)
            blocks++
            assertTrue(blocks < 10000)
        }
        // More than the line's length: its feedback rang on.
        assertTrue(blocks > 13) { "$blocks" }
        val out = FloatArray(192)
        fx.process(zeros, out, 96)
        assertTrue(out.all { abs(it) < 1e-6f })
        fx.process(tone(96, 10000f), FloatArray(192), 96)
        fx.reset()
        assertTrue(fx.silent)
        fx.setParams(0.5f, 1f, 120f)
        val o = FloatArray(192)
        fx.process(zeros, o, 96)
        assertTrue(o.all { it == 0f })
    }
}
