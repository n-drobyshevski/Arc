package dev.arc.ep133.formats.fx

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

class DelayTest {
    private val rate = 48000

    /** [input] through [fx] in blocks of 96, the knobs from [knobs] (by block) set before each, at [bpm]. */
    private fun run(input: FloatArray, fx: Delay = Delay(rate), bpm: Float = 120f, knobs: (Int) -> Pair<Float, Float>): FloatArray {
        val out = FloatArray(input.size)
        var at = 0
        var b = 0
        while (at < input.size / 2) {
            val n = minOf(96, input.size / 2 - at)
            val (x, y) = knobs(b++)
            fx.setParams(x, y, bpm)
            val o = FloatArray(n * 2)
            fx.process(input.copyOfRange(at * 2, (at + n) * 2), o, n)
            o.copyInto(out, at * 2)
            at += n
        }
        return out
    }

    /** [frames] stereo frames of silence with a click of [level] on both channels at frame 0. */
    private fun click(frames: Int, level: Float = 1000f) = FloatArray(frames * 2).also {
        it[0] = level
        it[1] = level
    }

    /** The left channel's samples from frame [from] until [to], summed. */
    private fun sum(out: FloatArray, from: Int, to: Int): Double = (from until to).sumOf { out[2 * it].toDouble() }

    @Test
    fun `an eighth at 120 BPM echoes a click 12000 frames on, each repeat fed back by Y`() {
        // X = 0.45 is the sixth division, an eighth: a quarter of a second at 120 BPM.
        val out = run(click(80000)) { 0.45f to 0.5f }
        for (i in 0 until 12000) assertEquals(0f, out[2 * i])
        // The first echo is the click as it was, on both sides.
        assertEquals(1000f, out[24000])
        assertEquals(1000f, out[24001])
        for (i in 12001 until 24000) assertEquals(0f, out[2 * i])
        // The next ones are fed back by 0.475 (0.95 Y) through the low-pass, which smears them a little
        // but keeps their sum (its gain at 0 Hz is 1).
        assertEquals(475.0, sum(out, 23990, 24300), 1.0)
        assertEquals(475.0 * 0.475, sum(out, 35990, 36400), 1.0)
        assertTrue(out[2 * 24000] < 475f) { "${out[2 * 24000]}" }
        // Y = 0: a single echo.
        val once = run(click(40000)) { 0.45f to 0f }
        assertEquals(1000f, once[24000])
        for (i in 12001 until 40000) assertEquals(0f, once[2 * i])
    }

    @Test
    fun `X picks one of twelve divisions of the beat, held to 2 seconds`() {
        // At 120 BPM a 24th of a beat is 1000 frames.
        val ticks = intArrayOf(3, 4, 6, 8, 9, 12, 16, 18, 24, 32, 36, 48)
        for ((d, t) in ticks.withIndex()) {
            val x = (d + 0.5f) / 12f
            val out = run(click(t * 1000 + 10)) { x to 0f }
            val first = (0 until t * 1000 + 10).first { it > 0 && out[2 * it] != 0f }
            assertEquals(t * 1000, first) { "division $d" }
        }
        // A half note at 20 BPM is 6 seconds: held to 2.
        val out = run(click(96010), bpm = 20f) { 1f to 0f }
        assertEquals(96000, (1 until 96010).first { out[2 * it] != 0f })
    }

    @Test
    fun `a new length glides there rather than jumping`() {
        val fx = Delay(rate)
        val level = 10000f
        val tone = FloatArray(96000 * 2) { (level * sin(2 * PI * 200.0 * (it / 2) / rate)).toFloat() }
        // An eighth for half a second, then a quarter: the read head moves 12000 frames over 60 ms.
        val out = run(tone, fx) { b -> (if (b < 250) 0.45f else 0.7f) to 0.3f }
        var step = 0f
        for (i in 24000 until 96000) step = maxOf(step, abs(out[2 * i] - out[2 * i - 2]))
        // The sine moves at most 262 a frame; the glide reads up to 5 times as fast (a fifth of that
        // again from the feedback); a jump would step by up to twice the level.
        assertTrue(step < 0.25f * level) { "$step" }
        // Once there, it echoes at the new length: the tone (no feedback below) a quarter of a second back.
        val plain = run(tone) { b -> (if (b < 250) 0.45f else 0.7f) to 0f }
        for (i in 80000 until 96000) assertEquals(tone[2 * (i - 24000)], plain[2 * i])
    }

    @Test
    fun `it is silent until it hears something, and only once its echoes are gone`() {
        val fx = Delay(rate)
        assertTrue(fx.silent)
        // The shortest length (300 BPM, 1/32: 1200 frames), the most feedback.
        fx.setParams(0f, 1f, 300f)
        fx.process(click(96), FloatArray(192), 96)
        assertFalse(fx.silent)
        val zeros = FloatArray(192)
        // Nothing comes out until the first echo, but it is not silent.
        repeat(10) {
            val out = FloatArray(192)
            fx.process(zeros, out, 96)
            assertTrue(out.all { it == 0f })
            assertFalse(fx.silent)
        }
        var blocks = 0
        while (!fx.silent) {
            fx.setParams(0f, 1f, 300f)
            fx.process(zeros, FloatArray(192), 96)
            blocks++
            assertTrue(blocks < 20000)
        }
        // 0.95 a repeat (less through the low-pass) down from 1000 to below 1e-6, and a line's length after.
        assertTrue(blocks > 1000) { "$blocks" }
        val out = FloatArray(192)
        fx.process(zeros, out, 96)
        assertTrue(out.all { abs(it) < 1e-6f })
        // Reset: from silence.
        fx.process(click(96), FloatArray(192), 96)
        fx.reset()
        assertTrue(fx.silent)
        fx.setParams(0f, 1f, 300f)
        repeat(30) {
            val o = FloatArray(192)
            fx.process(zeros, o, 96)
            assertTrue(o.all { it == 0f })
        }
    }
}
