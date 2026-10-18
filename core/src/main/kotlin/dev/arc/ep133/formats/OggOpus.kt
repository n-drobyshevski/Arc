package dev.arc.ep133.formats

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Ogg Opus files (RFC 7845) around an encoder's raw Opus packets (an
 * addition), for a take shared as a voice message: Telegram sends an .ogg it
 * can open as Opus as a voice message. A voice message is mono at 48 kHz
 * ([voicePcm]); the platform's encoder makes the packets, this wraps them.
 */
object OggOpus {
    /** Opus always runs at 48 kHz: granule positions count its samples. */
    const val RATE = 48_000

    /** The mime type a voice message is shared as (Telegram looks for codecs=opus). */
    const val MIME = "audio/ogg; codecs=opus"

    /** The encoder's lookahead at 48 kHz when it doesn't say (libopus's, as opusenc writes it). */
    const val DEFAULT_PRE_SKIP = 312

    /** The packets a page holds at most (one second of 20 ms frames). */
    private const val PAGE_PACKETS = 50

    /** [pcm] (interleaved s16le, [channels] at [rate]) as a voice message's: mono at [RATE]. */
    fun voicePcm(pcm: ByteArray, channels: Int, rate: Int): ByteArray {
        val src = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN)
        val frames = if (channels > 0) pcm.size / (2 * channels) else 0
        val mono = ByteArray(frames * 2)
        val out = ByteBuffer.wrap(mono).order(ByteOrder.LITTLE_ENDIAN)
        for (f in 0 until frames) {
            var sum = 0
            for (c in 0 until channels) sum += src.getShort((f * channels + c) * 2)
            out.putShort(f * 2, Math.floorDiv(sum, channels).toShort())
        }
        return if (frames == 0) mono else Wav.resampleS16(mono, 1, rate.toLong(), RATE.toLong())
    }

    /** The samples (at 48 kHz) one Opus packet holds, from its TOC byte (RFC 6716, 3.1); 0 for an empty one. */
    fun packetSamples(packet: ByteArray): Int {
        if (packet.isEmpty()) return 0
        val toc = packet[0].toInt() and 0xFF
        val config = toc shr 3
        // In units of 2.5 ms (120 samples).
        val unit = when {
            config < 12 -> intArrayOf(4, 8, 16, 24)[config % 4]
            config < 16 -> intArrayOf(4, 8)[config % 2]
            else -> intArrayOf(1, 2, 4, 8)[config % 4]
        }
        val frames = when (toc and 3) {
            0 -> 1
            1, 2 -> 2
            else -> if (packet.size > 1) packet[1].toInt() and 0x3F else 0
        }
        return frames * unit * 120
    }

    /** The pre-skip an encoder's codec config gives (an OpusHead in it), else [DEFAULT_PRE_SKIP]. */
    fun preSkipOf(config: ByteArray?): Int {
        if (config == null) return DEFAULT_PRE_SKIP
        val at = indexOf(config, "OpusHead".toByteArray(Charsets.US_ASCII))
        if (at < 0 || at + 12 > config.size) return DEFAULT_PRE_SKIP
        return (config[at + 10].toInt() and 0xFF) or ((config[at + 11].toInt() and 0xFF) shl 8)
    }

    /** The identification header: [channels] (mapping family 0), [preSkip], and the [inputRate] the audio had. */
    fun head(channels: Int, preSkip: Int, inputRate: Int): ByteArray {
        val b = ByteBuffer.allocate(19).order(ByteOrder.LITTLE_ENDIAN)
        b.put("OpusHead".toByteArray(Charsets.US_ASCII))
        b.put(1)
        b.put(channels.toByte())
        b.putShort(preSkip.toShort())
        b.putInt(inputRate)
        b.putShort(0)
        b.put(0)
        return b.array()
    }

    /** The comment header: [vendor] and no comments. */
    fun tags(vendor: String): ByteArray {
        val v = vendor.toByteArray(Charsets.UTF_8)
        val b = ByteBuffer.allocate(8 + 4 + v.size + 4).order(ByteOrder.LITTLE_ENDIAN)
        b.put("OpusTags".toByteArray(Charsets.US_ASCII))
        b.putInt(v.size)
        b.put(v)
        b.putInt(0)
        return b.array()
    }

    /**
     * The file: the two headers, then [packets] about a second to a page.
     * [samples] is the audio's length at 48 kHz, so the last page cuts the
     * encoder's padding off (a page never claims more than its packets hold);
     * [serial] names the stream.
     */
    fun file(packets: List<ByteArray>, channels: Int, preSkip: Int, inputRate: Int, samples: Long, serial: Int = 0x41524331, vendor: String = "arc"): ByteArray {
        val out = ByteArrayOutputStream()
        var seq = 0
        out.write(page(listOf(head(channels, preSkip, inputRate)), 0L, serial, seq++, FLAG_BOS))
        out.write(page(listOf(tags(vendor)), 0L, serial, seq++, 0))
        val end = preSkip + samples
        var granule = 0L
        val chunks = packets.chunked(PAGE_PACKETS)
        if (chunks.isEmpty()) out.write(page(emptyList(), end, serial, seq, FLAG_EOS))
        chunks.forEachIndexed { i, chunk ->
            granule += chunk.sumOf { packetSamples(it).toLong() }
            val last = i == chunks.lastIndex
            out.write(page(chunk, minOf(granule, end), serial, seq++, if (last) FLAG_EOS else 0))
        }
        return out.toByteArray()
    }

    private const val FLAG_BOS = 0x02
    private const val FLAG_EOS = 0x04

    /** One page of whole [packets] (255 lacing values at most, which a second of voice never nears). */
    fun page(packets: List<ByteArray>, granule: Long, serial: Int, seq: Int, flags: Int): ByteArray {
        val lacing = ByteArrayOutputStream()
        for (p in packets) {
            repeat(p.size / 255) { lacing.write(255) }
            lacing.write(p.size % 255)
        }
        val segments = lacing.toByteArray()
        require(segments.size <= 255) { "too many packets for one page" }
        val body = packets.sumOf { it.size }
        val b = ByteBuffer.allocate(27 + segments.size + body).order(ByteOrder.LITTLE_ENDIAN)
        b.put("OggS".toByteArray(Charsets.US_ASCII))
        b.put(0)
        b.put(flags.toByte())
        b.putLong(granule)
        b.putInt(serial)
        b.putInt(seq)
        b.putInt(0)
        b.put(segments.size.toByte())
        b.put(segments)
        for (p in packets) b.put(p)
        val bytes = b.array()
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putInt(22, crc(bytes))
        return bytes
    }

    /** Ogg's CRC-32: polynomial 0x04C11DB7, not reflected, starting at 0. */
    fun crc(data: ByteArray): Int {
        var c = 0
        for (byte in data) c = (c shl 8) xor CRC_TABLE[((c ushr 24) xor (byte.toInt() and 0xFF)) and 0xFF]
        return c
    }

    private val CRC_TABLE = IntArray(256) { i ->
        var r = i shl 24
        repeat(8) { r = if (r and 0x80000000.toInt() != 0) (r shl 1) xor 0x04C11DB7 else r shl 1 }
        r
    }

    private fun indexOf(hay: ByteArray, needle: ByteArray): Int {
        outer@ for (i in 0..hay.size - needle.size) {
            for (j in needle.indices) if (hay[i + j] != needle[j]) continue@outer
            return i
        }
        return -1
    }
}
