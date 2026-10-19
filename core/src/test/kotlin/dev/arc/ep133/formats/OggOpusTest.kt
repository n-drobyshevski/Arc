package dev.arc.ep133.formats

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** A take as a voice message: Ogg Opus pages around the encoder's packets (web/test/core/oggOpus.test.ts mirrors it). */
class OggOpusTest {
    private fun h(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }
    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    // ffmpeg's (libopus) first page of a mono file: OpusHead with a pre-skip of 312, BOS.
    private val FFMPEG_HEAD_PAGE = "4f67675300020000000000000000e7d1e06b000000009c69c70a01134f707573486561640101380180bb0000000000"

    @Test
    fun `the head page is byte for byte libopus's, its CRC included`() {
        val head = OggOpus.head(1, 312, 48_000)
        assertEquals("4f707573486561640101380180bb0000000000", hex(head))
        assertEquals(FFMPEG_HEAD_PAGE, hex(OggOpus.page(listOf(head), 0L, 0x6be0d1e7, 0, 0x02)))
    }

    @Test
    fun `a packet's samples come from its TOC byte`() {
        // CELT 20 ms, one frame; SILK 60 ms; hybrid 10 ms, two frames; CELT 2.5 ms, code 3 with 4 frames.
        assertEquals(960, OggOpus.packetSamples(byteArrayOf(0xF8.toByte(), 1)))
        assertEquals(2880, OggOpus.packetSamples(byteArrayOf(0x18, 1)))
        assertEquals(960, OggOpus.packetSamples(byteArrayOf(0x61, 1)))
        assertEquals(480, OggOpus.packetSamples(byteArrayOf(0x83.toByte(), 4)))
        assertEquals(0, OggOpus.packetSamples(ByteArray(0)))
    }

    @Test
    fun `the pre-skip comes from an OpusHead in the encoder's config, else libopus's`() {
        assertEquals(120, OggOpus.preSkipOf(OggOpus.head(1, 120, 48_000)))
        assertEquals(OggOpus.DEFAULT_PRE_SKIP, OggOpus.preSkipOf(h("00010203")))
        assertEquals(OggOpus.DEFAULT_PRE_SKIP, OggOpus.preSkipOf(null))
    }

    @Test
    fun `a file is head, tags, then pages of a second, the last cut to the audio's length`() {
        val packet = byteArrayOf(0xF8.toByte()) + ByteArray(300) { it.toByte() }
        val packets = List(120) { packet }
        val file = OggOpus.file(packets, 1, 312, 44_100, samples = 114_000)
        val pages = pages(file)
        assertEquals(5, pages.size)
        assertEquals(listOf(0x02, 0, 0, 0, 0x04), pages.map { it.flags })
        assertEquals(listOf(0L, 0L, 48_000L, 96_000L, 114_312L), pages.map { it.granule })
        assertEquals(listOf(0, 1, 2, 3, 4), pages.map { it.seq })
        // A 301-byte packet laces as 255 + 46.
        assertEquals(listOf(255, 46), pages[2].lacing.take(2))
        assertEquals(100, pages[2].lacing.size)
        assertEquals("OpusTags", String(pages[1].body, 0, 8, Charsets.US_ASCII))
        for (p in pages) assertEquals(p.crc, p.recomputed)
    }

    @Test
    fun `no packets still make a file that ends`() {
        val pages = pages(OggOpus.file(emptyList(), 1, 312, 48_000, samples = 0))
        assertEquals(listOf(0x02, 0, 0x04), pages.map { it.flags })
        assertEquals(312L, pages.last().granule)
    }

    @Test
    fun `a voice message is mono at 48 kHz`() {
        // Two stereo frames at 48 kHz: the channels averaged.
        val stereo = s16(1000, 3000, -1000, -2001)
        assertArrayEquals(s16(2000, -1501), OggOpus.voicePcm(stereo, 2, 48_000))
        // 24 kHz doubles the frames.
        assertEquals(8, OggOpus.voicePcm(s16(0, 100, 200, 300), 1, 24_000).size / 2)
        assertEquals(0, OggOpus.voicePcm(ByteArray(0), 2, 44_100).size)
    }

    private fun s16(vararg v: Int): ByteArray {
        val b = ByteBuffer.allocate(v.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        v.forEach { b.putShort(it.toShort()) }
        return b.array()
    }

    private class Page(val flags: Int, val granule: Long, val seq: Int, val crc: Int, val recomputed: Int, val lacing: List<Int>, val body: ByteArray)

    private fun pages(file: ByteArray): List<Page> {
        val out = mutableListOf<Page>()
        var i = 0
        while (i < file.size) {
            val bb = ByteBuffer.wrap(file, i, file.size - i).order(ByteOrder.LITTLE_ENDIAN)
            assertEquals("OggS", String(file, i, 4, Charsets.US_ASCII))
            val n = file[i + 26].toInt() and 0xFF
            val lacing = (0 until n).map { file[i + 27 + it].toInt() and 0xFF }
            val len = 27 + n + lacing.sum()
            val bytes = file.copyOfRange(i, i + len)
            val crc = bb.getInt(i + 22)
            ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putInt(22, 0)
            out += Page(file[i + 5].toInt(), bb.getLong(i + 6), bb.getInt(i + 18), crc, OggOpus.crc(bytes), lacing, bytes.copyOfRange(27 + n, len))
            i += len
        }
        return out
    }
}
