package dev.arc.ep133.features

import dev.arc.ep133.formats.Wav
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.log10

class SampleEditTest {
    private fun pcm(vararg s: Int) = ShortArray(s.size) { s[it].toShort() }

    @Test
    fun `normalizing brings the loudest sample to full scale`() {
        // A take peaking at half scale is doubled, near enough.
        val half = pcm(0, 8000, -16384, 4000)
        assertEquals(32767f / 16384, SampleEdit.normalizeGain(half, 1, 0, 4))
        assertEquals(2f, SampleEdit.normalizeGain(half, 1, 0, 4), 1e-3f)
        // Only the range counts, clamped to the audio, across both channels.
        assertEquals((32767.0 / 8000).toFloat(), SampleEdit.normalizeGain(half, 1, 0, 2))
        assertEquals(32767f / 16384, SampleEdit.normalizeGain(half, 2, -5, 99))
        assertEquals((32767.0 / 4000).toFloat(), SampleEdit.normalizeGain(pcm(10, 20, 4000, -100), 2, 1, 2))
        // A full-scale negative sample is turned down a hair to fit.
        assertTrue(SampleEdit.normalizeGain(pcm(-32768), 1, 0, 1) < 1f)
    }

    @Test
    fun `normalizing raises at most 24 dB, and leaves silence alone`() {
        assertEquals(24f, SampleEdit.MAX_NORMALIZE_DB)
        val quiet = pcm(0, 100, -50)
        assertEquals(15.8489f, SampleEdit.normalizeGain(quiet, 1, 0, 3), 1e-4f)
        assertEquals(24.0, 20 * log10(SampleEdit.normalizeGain(quiet, 1, 0, 3).toDouble()), 1e-4)
        assertEquals(1f, SampleEdit.normalizeGain(pcm(0, 0, 0, 0), 2, 0, 2))
        assertEquals(1f, SampleEdit.normalizeGain(pcm(1000, 1000), 1, 1, 1))
        assertEquals(1f, SampleEdit.normalizeGain(ShortArray(0), 1, 0, 10))
    }

    @Test
    fun `gain rounds half up and clips to 16 bits`() {
        assertArrayEquals(pcm(2, -2, 2, -2, 0), SampleEdit.applyGain(pcm(1, -1, 1, -1, 0), 2f))
        // Halves round up: 1.5 to 2, -1.5 to -1, 0.5 to 1 and -0.5 to 0.
        assertArrayEquals(pcm(2, -1), SampleEdit.applyGain(pcm(1, -1), 1.5f))
        assertArrayEquals(pcm(5, -5, 1, 0), SampleEdit.applyGain(pcm(10, -10, 1, -1), 0.5f))
        assertArrayEquals(pcm(32767, -32768, 30000), SampleEdit.applyGain(pcm(20000, -20000, 15000), 2f))
        // A copy, even at unity gain.
        val take = pcm(7, 8)
        val same = SampleEdit.applyGain(take, 1f)
        assertArrayEquals(take, same)
        same[0] = 0
        assertEquals(7, take[0].toInt())
    }

    @Test
    fun `the sound starts after the silence, less a guard`() {
        // -48 dBFS is a sample of about 130.
        val mono = pcm(0, 3, -129, 50, 0, -131, 900, 0)
        assertEquals(5, SampleEdit.leadingSilence(mono, 1, guardFrames = 0))
        assertEquals(3, SampleEdit.leadingSilence(mono, 1, guardFrames = 2))
        assertEquals(0, SampleEdit.leadingSilence(mono, 1, guardFrames = 20))
        assertEquals(6, SampleEdit.leadingSilence(mono, 1, guardFrames = 0, thresholdDb = -40f))
        // Either channel starts it; frames, not samples, are counted.
        val stereo = pcm(0, 0, 10, -10, 0, 500, 0, 0)
        assertEquals(2, SampleEdit.leadingSilence(stereo, 2, guardFrames = 0))
        assertEquals(1, SampleEdit.leadingSilence(stereo, 2, guardFrames = 1))
        // All silent (or empty): nothing to start from.
        assertNull(SampleEdit.leadingSilence(pcm(0, 10, -100, 0), 1, guardFrames = 0))
        assertNull(SampleEdit.leadingSilence(ShortArray(0), 2, guardFrames = 0))
    }

    @Test
    fun `stereo mixes down to mono`() {
        assertArrayEquals(pcm(150, -150, -1, 32767, -32768), SampleEdit.toMono(pcm(100, 200, -100, -200, 0, -1, 32767, 32767, -32768, -32768)))
        // (l + r) shr 1 floors: -1 and 0 give -1, 1 and 0 give 0.
        assertArrayEquals(pcm(-1, 0), SampleEdit.toMono(pcm(-1, 0, 1, 0)))
        // A trailing odd sample is dropped.
        assertArrayEquals(pcm(15), SampleEdit.toMono(pcm(10, 20, 30)))
    }

    @Test
    fun `cut takes whole frames and clamps the range`() {
        val stereo = pcm(1, -1, 2, -2, 3, -3, 4, -4)
        assertArrayEquals(pcm(2, -2, 3, -3), SampleEdit.cut(stereo, 2, 1, 2))
        assertArrayEquals(pcm(3, -3, 4, -4), SampleEdit.cut(stereo, 2, 2, 99))
        assertArrayEquals(pcm(4, -4), SampleEdit.cut(stereo, 2, 3, Int.MAX_VALUE))
        assertArrayEquals(pcm(1, -1), SampleEdit.cut(stereo, 2, -3, 1))
        assertArrayEquals(ShortArray(0), SampleEdit.cut(stereo, 2, 9, 2))
        assertArrayEquals(ShortArray(0), SampleEdit.cut(stereo, 2, 1, -2))
        assertArrayEquals(pcm(2, -2, 3), SampleEdit.cut(stereo, 1, 2, 3))
        assertEquals(4, SampleEdit.frames(stereo, 2))
        assertEquals(2, SampleEdit.frames(pcm(1, 2, 3, 4, 5), 2))
    }

    @Test
    fun `peaks give one min and max per column`() {
        val take = ShortArray(2 * 1000) { i -> (if (i % 2 == 0) (i * 37) % 20000 - 10000 else -(i * 13) % 9000).toShort() }
        val p = SampleEdit.peaks(take, 2, 64)
        assertEquals(64, p.size)
        for (c in p) {
            assertTrue(c.min <= c.max)
            assertTrue(c.min >= -1f && c.max <= 1f)
        }
        // More columns than frames still gives every column.
        assertEquals(10, SampleEdit.peaks(pcm(1, 2, 3), 1, 10).size)
        // The same as SampleTrim's, for the same audio as bytes.
        val bytes = ByteArray(take.size * 2)
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(take)
        assertEquals(SampleTrim.peaks(bytes, 2, 64), p)
        assertEquals(listOf(Peak(-1f, 1f), Peak(0f, 16384 / 32767f)), SampleEdit.peaks(pcm(0, 0, 32767, -32768, 0, 0, 16384, 0), 1, 2))
        assertEquals(List(3) { Peak(0f, 0f) }, SampleEdit.peaks(ShortArray(0), 1, 3))
        assertEquals(emptyList<Peak>(), SampleEdit.peaks(take, 2, 0))
    }

    @Test
    fun `a take wraps as a WAV`() {
        val take = pcm(1, -1, 256, -256, 32767, -32768)
        val wav = SampleEdit.toWavBytes(take, 2, 46875)
        assertEquals(44 + 12, wav.size)
        val bb = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(36 + 12, bb.getInt(4))
        assertEquals(2, bb.getShort(22).toInt())
        assertEquals(46875, bb.getInt(24))
        assertEquals(46875 * 4, bb.getInt(28))
        assertEquals(12, bb.getInt(40))
        assertEquals(-256, bb.getShort(44 + 6).toInt())
        val bytes = wav.copyOfRange(44, wav.size)
        assertTrue(wav.contentEquals(Wav.encode(bytes, 2, 46875)))
        val back = Wav.decode(wav)
        assertEquals(2, back.channels)
        assertEquals(46875L, back.sampleRate)
        assertArrayEquals(bytes, back.pcm)
        // Mono, and an empty take.
        val mono = SampleEdit.toWavBytes(pcm(5), 1, 48000)
        assertEquals(1, ByteBuffer.wrap(mono).order(ByteOrder.LITTLE_ENDIAN).getShort(22).toInt())
        assertEquals(44, SampleEdit.toWavBytes(ShortArray(0), 1, 48000).size)
    }
}
