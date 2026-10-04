package dev.arc.ep133.features

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.isJsNumber
import dev.arc.ep133.formats.numberOrNull
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlin.math.max
import kotlin.math.min

/** Min/max of one waveform column, both in -1..1. */
data class Peak(val min: Float, val max: Float)

/**
 * Trimming and drawing audio on the phone (an addition to the web version).
 * PCM is signed 16-bit little-endian, interleaved, as everywhere else in arc.
 */
object SampleTrim {
    fun frames(pcm: ByteArray, channels: Int): Int = if (channels <= 0) 0 else pcm.size / (2 * channels)

    /** Frames [start, end) of [pcm]. The range is clamped to the audio. */
    fun cut(pcm: ByteArray, channels: Int, start: Int, end: Int): ByteArray {
        val n = frames(pcm, channels)
        val a = start.coerceIn(0, n)
        val b = end.coerceIn(a, n)
        val bytesPerFrame = 2 * channels
        return pcm.copyOfRange(a * bytesPerFrame, b * bytesPerFrame)
    }

    /**
     * Loop points are frame positions, so they move with the start of the
     * trim and are clamped into the trimmed length. A loop start past the end
     * (or a loop end before the start) means the loop was trimmed away; like
     * device.js's out-of-range rule, that point then falls back to the whole
     * sample (0 or the last frame) instead of collapsing to one frame.
     * Other settings are kept.
     */
    fun shiftLoops(settings: JsonObject, start: Int, length: Int): JsonObject {
        val out = LinkedHashMap<String, JsonElement>(settings)
        val last = max(0, length - 1).toDouble()
        val ls = settings["sound.loopstart"]?.takeIf { it.isJsNumber }?.numberOrNull?.minus(start)
        val le = settings["sound.loopend"]?.takeIf { it.isJsNumber }?.numberOrNull?.minus(start)
        if (ls != null) out["sound.loopstart"] = JsJson.number((if (ls > last) 0.0 else ls).coerceIn(0.0, last))
        if (le != null) out["sound.loopend"] = JsJson.number((if (le < 0) last else le).coerceIn(0.0, last))
        return JsonObject(out)
    }

    /** [columns] min/max pairs across all channels, for drawing a waveform. */
    fun peaks(pcm: ByteArray, channels: Int, columns: Int): List<Peak> {
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
                    val i = (f * channels + c) * 2
                    val v = (pcm[i].toInt() and 0xFF) or (pcm[i + 1].toInt() shl 8)
                    lo = min(lo, v)
                    hi = max(hi, v)
                }
                f += step
            }
            Peak(lo / 32768f, hi / 32767f)
        }
    }

    /** Frame position to seconds. */
    fun seconds(frame: Int, sampleRate: Long): Double = if (sampleRate <= 0) 0.0 else frame.toDouble() / sampleRate

}
