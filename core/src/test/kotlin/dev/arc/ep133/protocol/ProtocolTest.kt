package dev.arc.ep133.protocol

import dev.arc.ep133.formats.Crc32
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.formats.Zip
import dev.arc.ep133.formats.ZipEntryData
import dev.arc.ep133.testing.hex
import dev.arc.ep133.testing.s16
import dev.arc.ep133.util.decodeUtf8
import dev.arc.ep133.util.encodeUtf8
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.random.Random

/** Port of reference/test/protocol.test.js. */
class ProtocolTest {
    @Test
    fun `pack7 round-trips arbitrary bytes`() {
        val rnd = Random(133)
        for (len in listOf(0, 1, 6, 7, 8, 13, 14, 15, 433, 1000)) {
            val data = ByteArray(len) { rnd.nextInt(256).toByte() }
            val packed = Packed7.pack(data)
            assertTrue(packed.all { it >= 0 }, "packed bytes are 7-bit")
            assertArrayEquals(data, Packed7.unpack(packed))
        }
    }

    @Test
    fun `encodes the same frames the official Sample Tool sends`() {
        // Captured by wmealing/KO2-SYSEX: GREET with request id 0x0B94 and FILE INIT with 0x0B95.
        assertArrayEquals(
            hex("F0 00 20 76 33 40 77 14 01 F7"),
            FrameCodec.encodeRequest(0x33, (0x17 shl 7) or 0x14, 1),
        )
        assertArrayEquals(
            hex("F0 00 20 76 33 40 77 15 05 00 01 01 00 40 00 00 F7"),
            FrameCodec.encodeRequest(0x33, (0x17 shl 7) or 0x15, 5, byteArrayOf(1, 1, 0x00, 0x40, 0x00, 0x00)),
        )
        assertArrayEquals(
            hex("F0 00 20 76 33 40 77 18 05 00 04 00 01 00 00 F7"),
            FrameCodec.encodeRequest(0x33, (0x17 shl 7) or 0x18, 5, byteArrayOf(4, 0, 1, 0, 0)),
        )
    }

    @Test
    fun `decodes a real GREET reply`() {
        val raw = hex(
            "F0 00 20 76 33 40 37 14 01 00 00 70 72 6F 64 75 63 74 00 3A 45 50 2D 31 33 33 00 3B 6D 6F 64 65 3A 6E 00 6F 72 6D 61 6C 3B 73 00 6B 75 3A 54 45 30 33 00 32 41 53 30 30 31 3B 00 6F 73 5F 76 65 72 73 00 69 6F 6E 3A 31 2E 31 00 2E 32 3B 73 77 5F 76 00 65 72 73 69 6F 6E 3A 00 31 2E 31 2E 32 3B 62 00 6C 5F 76 65 72 73 69 00 6F 6E 3A 31 30 30 30 00 2E 30 2E 31 30 3B 73 00 65 72 69 61 6C 3A 45 00 33 50 54 56 32 4A 54 F7",
        )
        val f = FrameCodec.decodeFrame(raw)!!
        assertFalse(f.isRequest)
        assertEquals((0x17 shl 7) or 0x14, f.requestId)
        assertEquals(0, f.status)
        val g = FrameCodec.parseGreet(decodeUtf8(f.payload))
        assertEquals("EP-133", g["product"])
        assertEquals("TE032AS001", g["sku"])
        assertEquals("1.1.2", g["os_version"])
        assertEquals("E3PTV2JT", g["serial"])
    }

    @Test
    fun `decodes a real identity reply`() {
        val id = FrameCodec.parseIdentity(hex("F0 7E 33 06 02 00 20 76 20 00 01 00 00 00 00 00 F7"))
        assertEquals(Identity(deviceId = 0x33, sku = "TE032AS001"), id)
    }

    @Test
    fun `decodes a real root LIST reply into sounds and projects`() {
        val raw = hex(
            "F0 00 20 76 33 40 37 16 05 00 08 00 00 03 68 0E 00 00 00 00 00 73 6F 75 6E 64 08 73 00 07 50 0E 00 00 00 00 00 70 72 6F 6A 65 00 63 74 73 00 F7",
        )
        val f = FrameCodec.decodeFrame(raw)!!
        val entries = Fs.parseListPage(f.payload)
        assertEquals(
            listOf(Triple(1000, "sounds", true), Triple(2000, "projects", true)),
            entries.map { Triple(it.node, it.name, it.isDir) },
        )
    }

    @Test
    fun `crc32 matches the standard check value`() {
        assertEquals(0xCBF43926L, Crc32.of(encodeUtf8("123456789")))
    }

    @Test
    fun `wav encode decode and resample`() {
        val pcm = s16(0, 1000, -1000, 32767, -32768, 5)
        val wav = Wav.encode(pcm, channels = 2, sampleRate = 46875)
        val back = Wav.decode(wav)
        assertEquals(2, back.channels)
        assertEquals(46875L, back.sampleRate)
        assertArrayEquals(pcm, back.pcm)
        val up = Wav.resampleS16(ByteArray(4800 * 2), 1, 48000, 46875)
        assertEquals(4688, up.size / 2)
    }

    @Test
    fun `zip round-trip with stored and deflated entries`() {
        val big = ByteArray(5000) { 7 }
        val rnd = Random(7)
        val rand = ByteArray(3000) { rnd.nextInt(256).toByte() }
        val zip = Zip.write(
            listOf(
                ZipEntryData("/meta.json", encodeUtf8("{\"a\":1}")),
                ZipEntryData("/sounds/001 kick.wav", rand),
                ZipEntryData("/projects/P01.tar", big),
            ),
            dateMs = 1_791_119_124_116L,
        )
        val files = Zip.read(zip)
        assertEquals(listOf("meta.json", "sounds/001 kick.wav", "projects/P01.tar"), files.keys.toList())
        assertArrayEquals(rand, files["sounds/001 kick.wav"])
        assertArrayEquals(big, files["projects/P01.tar"])
    }
}
