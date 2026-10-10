package dev.arc.ep133.formats.fx

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.math.sqrt

class PunchTest {
    private val rate = 48000

    /**
     * [input] through [punch] in blocks of 96 as the bus plays it (recorded every block, processed while a
     * slot is active), [controls] called with each block's first frame before it.
     */
    private fun play(input: FloatArray, punch: Punch = Punch(rate), controls: Punch.(Int) -> Unit): FloatArray {
        val out = input.copyOf()
        val frames = input.size / 2
        var at = 0
        while (at < frames) {
            val n = minOf(96, frames - at)
            punch.controls(at)
            val block = out.copyOfRange(at * 2, (at + n) * 2)
            punch.record(block, n)
            if (punch.active) punch.process(block, n)
            block.copyInto(out, at * 2)
            at += n
        }
        return out
    }

    /** [frames] stereo frames of a sine at [hz] and [level], both channels alike. */
    private fun sine(hz: Double, level: Float, frames: Int) =
        FloatArray(frames * 2) { (level * sin(2 * PI * hz * (it / 2) / rate)).toFloat() }

    /** [frames] stereo frames of noise at ±[level], each sample its own. */
    private fun noise(frames: Int, seed: Int, level: Float): FloatArray {
        val lcg = Lcg(seed)
        return FloatArray(frames * 2) { (lcg.unit() * 2f - 1f) * level }
    }

    /** How often the left channel crosses 0 going up between frames [from] and [to]. */
    private fun crossings(out: FloatArray, from: Int, to: Int): Int =
        (from + 1 until to).count { out[2 * it - 2] < 0f && out[2 * it] >= 0f }

    /** The left channel's RMS between frames [from] and [to]. */
    private fun rms(out: FloatArray, from: Int, to: Int): Double =
        sqrt((from until to).sumOf { out[2 * it].toDouble() * out[2 * it] } / (to - from))

    /** The biggest step of the left channel from one frame to the next, between frames [from] and [to]. */
    private fun maxStep(out: FloatArray, from: Int, to: Int): Float =
        (from + 1 until to).maxOf { abs(out[2 * it] - out[2 * it - 2]) }

    @Test
    fun `nothing held leaves the mix alone, bit for bit, and SEND_FX only raises the sends`() {
        val input = noise(9600, 7, 20000f)
        val punch = Punch(rate)
        assertFalse(punch.active)
        assertArrayEquals(input, play(input, punch) {})
        // Called anyway: nothing.
        val block = input.copyOf()
        punch.process(block, 4800)
        assertArrayEquals(input, block)
        // SEND_FX held: still nothing here.
        punch.set(FxControl.SEND_FX, 0.6f)
        assertFalse(punch.active)
        assertEquals(0.6f, punch.sendBoost())
        punch.set(FxControl.SEND_FX, 0f)
        assertEquals(0f, punch.sendBoost())
        // Out of range: ignored.
        punch.set(12, 1f)
        punch.set(-1, 1f)
        assertFalse(punch.active)
        // Pressed and let go of before a block: nothing either.
        punch.set(FxControl.LPF, 0.5f)
        punch.set(FxControl.LPF, 0f)
        assertFalse(punch.active)
        assertArrayEquals(input, play(input, punch) {})
    }

    @Test
    fun `BEAT_REPEAT loops the last 16th before its press at 120 BPM`() {
        val input = noise(96000, 11, 10000f)
        // Pressed at 0.5 s with depth 0.6 (the third quarter): a 16th, 6000 frames.
        val press = 24000
        val out = play(input) { at -> if (at == press) set(FxControl.BEAT_REPEAT, 0.6f) }
        for (i in 0 until press) assertEquals(input[2 * i], out[2 * i])
        // Past its 5 ms fade in, the slice before the press, over and over.
        for (i in press + 240 until 96000) {
            val j = press - 6000 + (i - press) % 6000
            assertEquals(input[2 * j], out[2 * i]) { "frame $i" }
            assertEquals(input[2 * j + 1], out[2 * i + 1]) { "frame $i" }
        }
        // The other quarters: a quarter, an eighth and a 32nd note.
        for ((depth, period) in listOf(0.1f to 24000, 0.3f to 12000, 0.9f to 3000)) {
            val o = play(input) { at -> if (at == press) set(FxControl.BEAT_REPEAT, depth) }
            for (i in press + 240 until 96000 - period) assertEquals(o[2 * i], o[2 * (i + period)]) { "depth $depth" }
        }
    }

    @Test
    fun `STUTTER loops the last 20 to 80 ms before its press`() {
        val input = noise(48000, 5, 10000f)
        val press = 9600
        for ((depth, period) in listOf(0.01f to 988, 0.5f to 2400, 1f to 3840)) {
            val out = play(input) { at -> if (at == press) set(FxControl.STUTTER, depth) }
            for (i in press + 240 until 48000) {
                val j = press - period + (i - press) % period
                assertEquals(input[2 * j], out[2 * i]) { "depth $depth, frame $i" }
            }
        }
    }

    @Test
    fun `TAPE_STOP slows to a stop over its time, then holds silence`() {
        val input = sine(1000.0, 10000f, 96000)
        // Depth 0.5: 1.5 - 0.6 = 0.9 s, 43200 frames.
        val press = 4800
        val out = play(input) { at -> if (at == press) set(FxControl.TAPE_STOP, 0.5f) }
        // It starts where the mix is, so there is no jump, then falls in pitch.
        assertTrue(maxStep(out, press - 10, press + 2000) < 1400f)
        val early = crossings(out, press, press + 4800)
        val late = crossings(out, press + 28800, press + 33600)
        assertTrue(early in 85..100) { "$early" }
        assertTrue(late in 20..45) { "$late" }
        assertTrue(rms(out, press + 38000, press + 43000) > 100.0)
        for (i in press + 43200 until 96000) {
            assertEquals(0f, out[2 * i]) { "frame $i" }
            assertEquals(0f, out[2 * i + 1])
        }
    }

    @Test
    fun `SLICE gates each 16th, open for less of it the deeper it goes`() {
        val input = FloatArray(48000 * 2) { 1000f }
        // 120 BPM: a 16th is 6000 frames; depth 0.5 leaves 0.6 of it open, 3600 frames, with 96-frame edges.
        val press = 960
        val out = play(input) { at -> if (at == press) set(FxControl.SLICE, 0.5f) }
        // From the second 16th (the first fades in): open, the edges ramping, then shut.
        for (cycle in 1 until 7) {
            val at = press + cycle * 6000
            if (at + 6000 > 48000) break
            assertEquals(0f, out[2 * at], 0.5f)
            for (i in at + 100 until at + 3498) assertEquals(1000f, out[2 * i]) { "frame $i" }
            for (i in at + 3602 until at + 5998) assertEquals(0f, out[2 * i]) { "frame $i" }
            assertTrue(out[2 * (at + 48)] in 400f..600f) { "${out[2 * (at + 48)]}" }
            assertTrue(out[2 * (at + 3552)] in 400f..600f)
        }
        // Depth 1: open for a fifth.
        val deep = play(input) { at -> if (at == press) set(FxControl.SLICE, 1f) }
        for (i in press + 1202 until press + 5998) assertEquals(0f, deep[2 * i])
        assertEquals(1000f, deep[2 * (press + 600)])
    }

    @Test
    fun `LPF and HPF take the top or the bottom off`() {
        val high = sine(5000.0, 10000f, 24000)
        val low = sine(100.0, 10000f, 24000)
        // LPF at depth 0.8: about 240 Hz.
        val lpHigh = play(high) { at -> if (at == 0) set(FxControl.LPF, 0.8f) }
        val lpLow = play(low) { at -> if (at == 0) set(FxControl.LPF, 0.8f) }
        assertTrue(rms(lpHigh, 4800, 24000) < 0.01 * rms(high, 4800, 24000)) { "${rms(lpHigh, 4800, 24000)}" }
        assertTrue(rms(lpLow, 4800, 24000) > 0.9 * rms(low, 4800, 24000))
        // HPF at depth 0.6: about 1300 Hz.
        val hpHigh = play(high) { at -> if (at == 0) set(FxControl.HPF, 0.6f) }
        val hpLow = play(low) { at -> if (at == 0) set(FxControl.HPF, 0.6f) }
        assertTrue(rms(hpLow, 4800, 24000) < 0.01 * rms(low, 4800, 24000)) { "${rms(hpLow, 4800, 24000)}" }
        assertTrue(rms(hpHigh, 4800, 24000) > 0.9 * rms(high, 4800, 24000))
        // Barely pressed, the low-pass is near 20 kHz (held to 0.4 of the rate): the 5 kHz tone passes.
        val open = play(high) { at -> if (at == 0) set(FxControl.LPF, 0.01f) }
        assertTrue(rms(open, 4800, 24000) > 0.95 * rms(high, 4800, 24000))
    }

    @Test
    fun `FILTER_LFO sweeps a band-pass once a beat, and TREMOLO swells each 16th`() {
        val tone = sine(1500.0, 10000f, 72000)
        val out = play(tone) { at -> if (at == 0) set(FxControl.FILTER_LFO, 0.6f) }
        // 1.5 kHz rings out as the band sweeps over it, and hardly passes at the sweep's bottom (each
        // beat's start), the same each beat.
        val levels = (0 until 50).map { rms(out, 24000 + it * 480, 24000 + (it + 1) * 480) }
        assertTrue(levels.max() > 10 * levels.min()) { "$levels" }
        assertTrue(levels[0] < 0.2 * levels.max()) { "$levels" }
        for (i in 24000 until 48000) assertEquals(out[2 * i], out[2 * (i + 24000)], 100f)
        val steady = FloatArray(24000 * 2) { 1000f }
        val trem = play(steady) { at -> if (at == 0) set(FxControl.TREMOLO, 0.7f) }
        var lo = 1000f
        for (i in 240 until 24000) {
            assertTrue(trem[2 * i] <= 1000f && trem[2 * i] >= 299f) { "frame $i" }
            lo = minOf(lo, trem[2 * i])
        }
        assertTrue(lo < 310f) { "$lo" }
        // A cycle a 16th: the same 6000 frames on.
        for (i in 240 until 18000) assertEquals(trem[2 * i], trem[2 * (i + 6000)], 1f)
    }

    @Test
    fun `DECIMATOR holds samples and truncates them to fewer bits`() {
        val input = noise(9600, 3, 20000f)
        // Depth 0.5: every 8th sample held, 6 bits off (multiples of 64).
        val out = play(input) { at -> if (at == 0) set(FxControl.DECIMATOR, 0.5f) }
        for (i in 240 until 9600) {
            assertEquals(0f, abs(out[2 * i] % 64f)) { "frame $i" }
            val j = i - i % 8
            assertEquals(out[2 * j], out[2 * i])
            assertEquals((input[2 * j] / 64f).toInt() * 64f, out[2 * i])
        }
        // Depth 1: every 16th, 12 bits off.
        val deep = play(input) { at -> if (at == 0) set(FxControl.DECIMATOR, 1f) }
        for (i in 240 until 9600) assertEquals((input[2 * (i - i % 16)] / 4096f).toInt() * 4096f, deep[2 * i])
    }

    @Test
    fun `OCTAVE_DOWN halves the pitch, mixed in by its depth`() {
        val tone = sine(400.0, 10000f, 48000)
        val out = play(tone) { at -> if (at == 0) set(FxControl.OCTAVE_DOWN, 1f) }
        val ups = crossings(out, 4800, 48000)
        // 0.9 s of 400 Hz: 360 crossings; an octave down, 180.
        assertTrue(ups in 165..195) { "$ups" }
        assertTrue(rms(out, 4800, 48000) > 0.5 * rms(tone, 4800, 48000))
        // Half: both at once.
        val half = play(tone) { at -> if (at == 0) set(FxControl.OCTAVE_DOWN, 0.5f) }
        val dry = rms(tone, 4800, 48000)
        assertTrue(rms(half, 4800, 48000) in 0.4 * dry..1.2 * dry)
    }

    @Test
    fun `PITCH_RANDOM moves the pitch each beat, the same way each time`() {
        val tone = sine(400.0, 10000f, 144000)
        val press: Punch.(Int) -> Unit = { at -> if (at == 0) set(FxControl.PITCH_RANDOM, 1f) }
        val out = play(tone, Punch(rate), press)
        assertArrayEquals(out, play(tone, Punch(rate), press))
        // Each beat (24000 frames) its own step, none of them the tone's own pitch (160 crossings in 0.4 s).
        val rates = (0 until 6).map { crossings(out, it * 24000 + 2400, it * 24000 + 21600) }
        for (r in rates) assertTrue(abs(r - 160) > 4) { "$rates" }
        assertTrue(rates.toSet().size >= 3) { "$rates" }
        val near = play(tone, Punch(rate)) { at -> if (at == 0) set(FxControl.PITCH_RANDOM, 0.01f) }
        // At depth 0: a semitone up or down. (A pure tone's pitch through 50 ms grains lands on a multiple
        // of 40 Hz, the half window's rate: 360 or 440 Hz here, 144 or 176 crossings.)
        for (b in 0 until 6) {
            val r = crossings(near, b * 24000 + 2400, b * 24000 + 21600)
            assertTrue(abs(r - 160) in 4..20) { "beat $b: $r" }
        }
    }

    @Test
    fun `let go of, a slot crossfades back without a step and stops`() {
        val tone = sine(200.0, 10000f, 48000)
        val punch = Punch(rate)
        // Stopped, then let go of: back from silence to the tone over 5 ms.
        val out = play(tone, punch) { at ->
            if (at == 0) set(FxControl.TAPE_STOP, 1f)
            if (at == 24000) set(FxControl.TAPE_STOP, 0f)
        }
        for (i in 14400 until 24000) assertEquals(0f, out[2 * i])
        // The tone moves up to 262 a frame; the fade adds a 240th of the level.
        assertTrue(maxStep(out, 23900, 24400) < 320f) { "${maxStep(out, 23900, 24400)}" }
        for (i in 24240 until 48000) assertEquals(tone[2 * i], out[2 * i])
        assertFalse(punch.active)
        // A loop let go of, the same.
        val loop = play(tone, Punch(rate)) { at ->
            if (at == 9600) set(FxControl.BEAT_REPEAT, 1f)
            if (at == 19200) set(FxControl.BEAT_REPEAT, 0f)
        }
        assertTrue(maxStep(loop, 19100, 19600) < 320f) { "${maxStep(loop, 19100, 19600)}" }
        for (i in 19440 until 48000) assertEquals(tone[2 * i], loop[2 * i])
    }

    @Test
    fun `slots combine, the replays first`() {
        val input = noise(48000, 21, 10000f)
        val press = 9600
        // The repeat's loop, gated by the slice: where the gate is shut, silence; where it is open, the loop.
        val out = play(input) { at ->
            if (at == press) {
                set(FxControl.BEAT_REPEAT, 0.6f)
                set(FxControl.SLICE, 0.5f)
            }
        }
        for (i in press + 240 until press + 3498) assertEquals(input[2 * (press - 6000 + (i - press))], out[2 * i]) { "frame $i" }
        for (i in press + 3602 until press + 5998) assertEquals(0f, out[2 * i], 0f)
        // Reset: every slot let go of at once.
        val punch = Punch(rate)
        punch.set(FxControl.LPF, 1f)
        punch.set(FxControl.SEND_FX, 1f)
        assertTrue(punch.active)
        punch.reset()
        assertFalse(punch.active)
        assertEquals(0f, punch.sendBoost())
    }
}
