package dev.arc.ep133.features

import dev.arc.ep133.formats.Wav
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * What SAMPLE's review does to a take before it goes on a pad (an addition):
 * normalize, trim the silence in front, mix down, cut, draw and wrap it as a
 * WAV. A take is 16-bit PCM in a ShortArray, interleaved at its channel
 * count, as [SampleCapture] gives it; positions and lengths are in frames.
 *
 * Gain rounds as floor(x + 0.5) and stereo mixes down with shr, so the web's
 * port gives the same samples.
 */
object SampleEdit {
    /** The most normalizing raises a take, so a near-silent one doesn't come out as loud noise. */
    const val MAX_NORMALIZE_DB = 24f

    /** The frames in [pcm] at [channels] channels; a trailing part frame doesn't count. */
    fun frames(pcm: ShortArray, channels: Int): Int = if (channels <= 0) 0 else pcm.size / channels

    /**
     * The gain that brings the loudest sample of frames [start, end) of [pcm]
     * to full scale (32767), at most [MAX_NORMALIZE_DB] up. The range is
     * clamped to the audio; 1 when it is silent or empty.
     */
    fun normalizeGain(pcm: ShortArray, channels: Int, start: Int, end: Int): Float {
        val n = frames(pcm, channels)
        val a = start.coerceIn(0, n)
        val b = end.coerceIn(a, n)
        var peak = 0
        for (i in a * channels until b * channels) peak = max(peak, abs(pcm[i].toInt()))
        if (peak == 0) return 1f
        return min(32767.0 / peak, 10.0.pow(MAX_NORMALIZE_DB / 20.0)).toFloat()
    }

    /** [pcm] multiplied by [gain] as a copy, each sample rounded half up and clipped to 16 bits. */
    fun applyGain(pcm: ShortArray, gain: Float): ShortArray {
        val g = gain.toDouble()
        return ShortArray(pcm.size) { i ->
            val v = floor(pcm[i] * g + 0.5)
            (if (v > 32767) 32767.0 else if (v < -32768) -32768.0 else v).toInt().toShort()
        }
    }

    /**
     * Where the sound in [pcm] starts: the first frame with a sample that
     * reaches [thresholdDb] (dBFS), less [guardFrames] so the start of its
     * attack is kept, but not before 0. Null when every frame is quieter.
     */
    fun leadingSilence(pcm: ShortArray, channels: Int, guardFrames: Int, thresholdDb: Float = -48f): Int? {
        // Compared against the sample's size rather than as dB, so the two
        // ports can't differ by a rounding of log10.
        val limit = 32768.0 * PeakMeter.fromDb(thresholdDb)
        val n = frames(pcm, channels)
        for (f in 0 until n) {
            for (c in 0 until channels) {
                if (abs(pcm[f * channels + c].toInt()) >= limit) return max(0, f - guardFrames)
            }
        }
        return null
    }

    /** Stereo [pcm] mixed down to mono, each frame (l + r) shr 1. A trailing odd sample is dropped. */
    fun toMono(pcm: ShortArray): ShortArray =
        ShortArray(pcm.size / 2) { i -> ((pcm[2 * i] + pcm[2 * i + 1]) shr 1).toShort() }

    /** [length] frames of [pcm] from frame [start], as a copy. The range is clamped to the audio. */
    fun cut(pcm: ShortArray, channels: Int, start: Int, length: Int): ShortArray {
        val n = frames(pcm, channels)
        val a = start.coerceIn(0, n)
        val b = (a.toLong() + length).coerceIn(a.toLong(), n.toLong()).toInt()
        return pcm.copyOfRange(a * channels, b * channels)
    }

    /** [columns] min/max pairs across all channels, for drawing a waveform; as [SampleTrim.peaks] for a take. */
    fun peaks(pcm: ShortArray, channels: Int, columns: Int): List<Peak> {
        val n = frames(pcm, channels)
        if (n == 0 || columns <= 0) return List(max(0, columns)) { Peak(0f, 0f) }
        return List(columns) { col ->
            val from = (col.toLong() * n / columns).toInt()
            val to = max(from + 1, ((col + 1).toLong() * n / columns).toInt()).coerceAtMost(n)
            var lo = 0
            var hi = 0
            // Long columns are sampled with a stride; the shape is what matters here.
            val step = max(1, (to - from) / 256)
            var f = from
            while (f < to) {
                for (c in 0 until channels) {
                    val v = pcm[f * channels + c].toInt()
                    lo = min(lo, v)
                    hi = max(hi, v)
                }
                f += step
            }
            Peak(lo / 32768f, hi / 32767f)
        }
    }

    /** [pcm] as a 16-bit WAV file at [channels] channels and [rate] Hz. */
    fun toWavBytes(pcm: ShortArray, channels: Int, rate: Int): ByteArray {
        // The header, then the samples little-endian straight after it: one
        // array, as a 40 s take is a few megabytes.
        val header = Wav.header(pcm.size * 2L, channels, rate)
        val out = header.copyOf(header.size + pcm.size * 2)
        for (i in pcm.indices) {
            val s = pcm[i].toInt()
            out[header.size + 2 * i] = s.toByte()
            out[header.size + 2 * i + 1] = (s shr 8).toByte()
        }
        return out
    }
}
