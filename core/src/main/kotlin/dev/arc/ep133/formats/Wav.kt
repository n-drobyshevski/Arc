package dev.arc.ep133.formats

import dev.arc.ep133.util.decodeWindows1252
import dev.arc.ep133.util.jsRound
import dev.arc.ep133.util.latin1
import dev.arc.ep133.util.toUint16
import dev.arc.ep133.util.toUint32
import kotlinx.serialization.json.JsonObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** Decoded audio. [pcm] is always signed 16-bit little-endian, interleaved. */
class DecodedWav(val pcm: ByteArray, val channels: Int, val sampleRate: Long, val embedded: JsonObject?)

/** Minimal WAV read/write for 16-bit PCM, with conversion from other common formats (wav.js). */
object Wav {
    /**
     * [channels] and [sampleRate] are JS numbers; the header fields get the
     * same integer conversions DataView applies (ToUint16 / ToUint32).
     */
    fun encode(pcm: ByteArray, channels: Double, sampleRate: Double): ByteArray {
        val out = ByteArray(44 + pcm.size)
        val bb = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
        ascii(out, "RIFF", 0)
        bb.putInt(4, toUint32(36.0 + pcm.size).toInt())
        ascii(out, "WAVE", 8)
        ascii(out, "fmt ", 12)
        bb.putInt(16, 16)
        bb.putShort(20, 1)
        bb.putShort(22, toUint16(channels).toShort())
        bb.putInt(24, toUint32(sampleRate).toInt())
        bb.putInt(28, toUint32(sampleRate * channels * 2).toInt())
        bb.putShort(32, toUint16(channels * 2).toShort())
        bb.putShort(34, 16)
        ascii(out, "data", 36)
        bb.putInt(40, pcm.size)
        pcm.copyInto(out, 44)
        return out
    }

    /** Whether s16le PCM holds no sound at all: every sample is 0, or there are no samples. */
    fun isSilent(pcm: ByteArray): Boolean {
        var i = 0
        while (i + 1 < pcm.size) {
            if (pcm[i].toInt() != 0 || pcm[i + 1].toInt() != 0) return false
            i += 2
        }
        return true
    }

    fun encode(pcm: ByteArray, channels: Int, sampleRate: Int): ByteArray =
        encode(pcm, channels.toDouble(), sampleRate.toDouble())

    private fun ascii(out: ByteArray, s: String, at: Int) {
        for (i in s.indices) out[at + i] = s[i].code.toByte()
    }

    /** The first {...} found in a chunk, if it parses as a JSON object (or array). */
    private fun findJsonSettings(bytes: ByteArray): JsonObject? {
        val text = decodeWindows1252(bytes)
        val start = text.indexOf('{')
        val end = text.lastIndexOf('}')
        if (start < 0 || end <= start) return null
        // `obj && typeof obj === 'object'` also accepts arrays, but an array can
        // never pass the "sound." / "envelope." key test in decode(), so only
        // objects matter.
        return JsJson.parseOrNull(text.substring(start, end + 1)) as? JsonObject
    }

    fun decode(wav: ByteArray): DecodedWav {
        val bb = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)
        fun tag(at: Int) = if (at + 4 <= wav.size) latin1(wav, at, at + 4) else ""
        fun need(at: Int, n: Int) {
            if (at < 0 || at + n > wav.size) throw IllegalArgumentException(DATAVIEW_RANGE)
        }
        fun u16(at: Int): Int { need(at, 2); return bb.getShort(at).toInt() and 0xFFFF }
        fun u32(at: Int): Long { need(at, 4); return bb.getInt(at).toLong() and 0xFFFFFFFFL }

        if (wav.size < 12 || tag(0) != "RIFF" || tag(8) != "WAVE") throw IllegalArgumentException("Not a WAV file")
        var format = -1
        var channels = 0
        var sampleRate = 0L
        var bits = 0
        var haveFmt = false
        var data: ByteArray? = null
        var embedded: JsonObject? = null
        var i = 12
        while (i + 8 <= wav.size) {
            val id = tag(i)
            val size = min(u32(i + 4), (wav.size - i - 8).toLong()).toInt()
            val body = wav.copyOfRange(i + 8, i + 8 + size)
            if (id == "fmt ") {
                format = u16(i + 8)
                channels = u16(i + 10)
                sampleRate = u32(i + 12)
                bits = u16(i + 22)
                haveFmt = true
                // WAVE_FORMAT_EXTENSIBLE: the real format is the first field of the sub-format GUID.
                if (format == 0xFFFE && size >= 26) format = u16(i + 32)
            } else if (id == "data") {
                data = body
            } else if (embedded == null && size < 64 * 1024) {
                val obj = findJsonSettings(body)
                if (obj != null && obj.keys.any { it.startsWith("sound.") || it.startsWith("envelope.") }) embedded = obj
            }
            i += 8 + size + (size and 1)
        }
        if (!haveFmt || data == null) throw IllegalArgumentException("WAV file is missing audio data")
        // Deviation (agreed): a 0-channel header would make resampling loop
        // forever in the JS; reject it up front.
        if (channels == 0) throw IllegalArgumentException("WAV file has no audio channels")
        return DecodedWav(toS16(data, format, bits), channels, sampleRate, embedded)
    }

    private fun toS16(data: ByteArray, format: Int, bits: Int): ByteArray {
        if (format == 1 && bits == 16) return data.copyOf(data.size - (data.size % 2))
        // Deviation: 0 bits would divide by zero (JS throws a RangeError); report it as unsupported.
        if (bits == 0) throw IllegalArgumentException("Unsupported WAV format ($bits-bit, type $format)")
        val bytesPer = bits / 8.0
        val n = floor(data.size / bytesPer).toInt()
        val out = ByteArray(n * 2)
        val dv = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
        for (s in 0 until n) {
            val at = floor(s * bytesPer).toInt()
            val v: Double = when {
                format == 3 && bits == 32 -> dv.getFloat(at).toDouble()
                format == 3 && bits == 64 -> dv.getDouble(at)
                bits == 8 -> ((data[at].toInt() and 0xFF) - 128) / 128.0
                bits == 24 -> {
                    val raw = (data[at].toInt() and 0xFF) or ((data[at + 1].toInt() and 0xFF) shl 8) or ((data[at + 2].toInt() and 0xFF) shl 16)
                    ((raw shl 8) shr 8) / 8388608.0
                }
                bits == 32 -> dv.getInt(at) / 2147483648.0
                else -> throw IllegalArgumentException("Unsupported WAV format ($bits-bit, type $format)")
            }
            val r = max(-32768.0, min(32767.0, jsRound(v * 32767)))
            // NaN stores as 0 in an Int16Array.
            val sample = if (r.isNaN()) 0 else r.toInt()
            out[2 * s] = sample.toByte()
            out[2 * s + 1] = (sample shr 8).toByte()
        }
        return out
    }

    /** Linear resample of interleaved s16le (`resampleS16`). */
    fun resampleS16(pcm: ByteArray, channels: Int, from: Long, to: Long): ByteArray {
        if (from == to) return pcm
        val sb = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        val srcLen = pcm.size / 2
        val src = ShortArray(srcLen).also { sb.get(it) }
        val srcFrames = srcLen / channels
        val dstFrames = max(1.0, jsRound(srcFrames.toDouble() * to / from)).toInt()
        val dst = ShortArray(dstFrames * channels)
        val ratio = (srcFrames - 1).toDouble() / max(1, dstFrames - 1)
        for (i in 0 until dstFrames) {
            val pos = i * ratio
            val i0 = floor(pos).toInt()
            val i1 = min(srcFrames - 1, i0 + 1)
            val t = pos - i0
            for (c in 0 until channels) {
                val ai = i0 * channels + c
                val bi = i1 * channels + c
                // An out-of-range read is undefined in JS and stores as 0.
                if (ai !in 0 until srcLen || bi !in 0 until srcLen) {
                    dst[i * channels + c] = 0
                    continue
                }
                val a = src[ai].toDouble()
                val b = src[bi].toDouble()
                dst[i * channels + c] = jsRound(a + (b - a) * t).toInt().toShort()
            }
        }
        val out = ByteArray(dst.size * 2)
        ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(dst)
        return out
    }
}
