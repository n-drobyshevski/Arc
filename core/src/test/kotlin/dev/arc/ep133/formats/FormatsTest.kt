package dev.arc.ep133.formats

import dev.arc.ep133.testing.pad
import dev.arc.ep133.testing.tarFile
import dev.arc.ep133.util.encodeUtf8
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.ByteArrayOutputStream
import java.time.ZoneOffset
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Edge cases of the format code. Expected values come from running reference/src/formats with Node 22. */
class FormatsTest {
    private fun h(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }
    private fun ByteArray.hex() = joinToString("") { "%02x".format(it) }

    @Test
    fun `wav conversions match the JS`() {
        val cases = mapOf(
            "f32" to Triple("524946464400000057415645666d7420100000000300010044ac000010b10200040020006461746120000000000000000000003f000000bf0000803f000080bf0000c03f0000803e80d6fcbd", "0000004001c0ff7f0180ff7f002033f0", 44100L),
            "f64" to Triple("524946463c00000057415645666d742010000000030001000077010000b80b000800400064617461180000009a9999999999b93fcdccccccccccecbf0000000000000040", "cd0cce8cff7f", 96000L),
            "i24" to Triple("524946463400000057415645666d7420100000000100010080bb00008032020003001800646174610f000000000000ffff7f000080010203ffffff00", "0000ff7f018002030000", 48000L),
            "i32ext" to Triple("524946464c00000057415645666d742028000000feff02001bb70000d8b8050008002000160020000000000001000000000000000000000000000000646174611000000000000000ffffff7f0000008015cd5b07", "0000ff7f01805c07", 46875L),
        )
        for ((name, c) in cases) {
            val d = Wav.decode(h(c.first))
            assertEquals(c.second, d.pcm.hex(), name)
            assertEquals(c.third, d.sampleRate, name)
            assertNull(d.embedded, name)
        }
        assertEquals(2, Wav.decode(h(cases.getValue("i32ext").first)).channels)
    }

    @Test
    fun `wav finds settings embedded in another chunk`() {
        val w = h("524946466000000057415645666d74201000000001000100401f0000401f0000010008004c4953542d00000078787b22736f756e642e706c61796d6f6465223a226b6579222c22736f756e642e7069746368223a2d337d79790064617461050000000080ff40c800")
        val d = Wav.decode(w)
        assertEquals("01800000ff7e01c0ff47", d.pcm.hex())
        assertEquals("""{"sound.playmode":"key","sound.pitch":-3}""", JsJson.stringify(d.embedded!!))
    }

    @Test
    fun `wav errors`() {
        assertEquals("Not a WAV file", assertThrows<IllegalArgumentException> { Wav.decode(ByteArray(20)) }.message)
        val noData = h("524946460c00000057415645666d742010000000010001001bb700003f6e01000200100000")
        assertEquals("WAV file is missing audio data", assertThrows<IllegalArgumentException> { Wav.decode(noData.copyOf(36)) }.message)
        val alaw = Wav.encode(ByteArray(8), 1, 8000).also { it[20] = 6; it[34] = 8 }
        // 8-bit is converted whatever the format tag says (JS checks bits before format)
        assertEquals(16, Wav.decode(alaw).pcm.size)
        val f16 = Wav.encode(ByteArray(8), 1, 8000).also { it[20] = 3 }
        assertEquals("Unsupported WAV format (16-bit, type 3)", assertThrows<IllegalArgumentException> { Wav.decode(f16) }.message)
    }

    @Test
    fun `resample matches the JS`() {
        val src = h("0000e80318fcff7f008005006400c8002c01f9ff")
        assertEquals("0000e80318fcff7f008005006400c8002c01f9ff", Wav.resampleS16(src, 1, 48000, 46875).hex())
        assertEquals(
            "0000e80370fe8b35e0fc2e6746e36766a3b13633008005005bb35300b6e6a1008c009f00dc004c002c01f9ff",
            Wav.resampleS16(src, 2, 22050, 46875).hex(),
        )
        assertEquals("0000121d03c0af00f9ff", Wav.resampleS16(src, 1, 96000, 46875).hex())
    }

    @Test
    fun `tar slots follow the JS regex exactly`() {
        val t = tarFile(
            listOf(
                "./pads/a/p01" to pad(5), "pads/b/p12" to pad(1000), "x/pads/c/p3" to pad(300), "pads/p04" to pad(7),
                "pads/a/p05x" to pad(8), "PADS/a/p06" to pad(9), "pads/a/p07" to byteArrayOf(0, 1), "pads/d/p02" to pad(0),
                "pads/a\u0085b/p09" to pad(44),
            ),
        )
        assertEquals(listOf(5, 44, 300), Tar.slotsUsedByProject(t))
        assertEquals(
            listOf("pads/a/p01", "pads/b/p12", "x/pads/c/p3", "pads/p04", "pads/a/p05x", "PADS/a/p06", "pads/a/p07", "pads/d/p02", "pads/aÂ\u0085b/p09"),
            Tar.read(t).keys.toList(),
        )
    }

    @Test
    fun `tar with a negative size stops instead of looping`() {
        val t = tarFile(listOf("pads/a/p01" to pad(5), "pads/a/p02" to pad(6)))
        // Second header's size field becomes "-1000" (octal), which would move backwards.
        encodeUtf8("-1000\u0000\u0000\u0000\u0000\u0000\u0000").copyInto(t, 1024 + 124)
        assertEquals(listOf(5), Tar.slotsUsedByProject(t))
    }

    @Test
    fun `zip writer uses the pak layout`() {
        val big = ByteArray(5000) { 7 }
        val zip = Zip.write(
            listOf(ZipEntryData("/meta.json", encodeUtf8("{}")), ZipEntryData("/projects/P01.tar", big)),
            dateMs = 1_791_119_124_116L,
            zone = ZoneOffset.UTC,
        )
        // Local header 1: signature, version 20, flags 0x0800, method 0 (stored, too small), DOS time 0x68AC, date 0x5D44
        assertEquals("504b0304" + "1400" + "0008" + "0000" + "ac68" + "445d", zip.copyOfRange(0, 14).hex())
        val files = Zip.read(zip)
        assertArrayEquals(big, files["projects/P01.tar"])
        // The second entry is deflated (method 8).
        val second = 30 + "/meta.json".length + 2
        assertEquals(8, zip[second + 8].toInt())
    }

    @Test
    fun `zip reader accepts zips from other tools`() {
        // ZipOutputStream writes data descriptors (flag 0x08) and different local headers.
        val bos = ByteArrayOutputStream()
        ZipOutputStream(bos).use { z ->
            z.putNextEntry(ZipEntry("sounds/"))
            z.closeEntry()
            z.putNextEntry(ZipEntry("sounds/001 kick.wav").apply { extra = ByteArray(8) { 1 } })
            z.write(ByteArray(3000) { (it % 13).toByte() })
            z.closeEntry()
            z.putNextEntry(ZipEntry("/meta.json"))
            z.write(encodeUtf8("{\"a\":1}"))
            z.closeEntry()
            z.setComment("comment")
        }
        val files = Zip.read(bos.toByteArray())
        assertEquals(listOf("sounds/001 kick.wav", "meta.json"), files.keys.toList())
        assertArrayEquals(ByteArray(3000) { (it % 13).toByte() }, files["sounds/001 kick.wav"])
        assertEquals("Not a .pak / zip file", assertThrows<IllegalArgumentException> { Zip.read(ByteArray(100)) }.message)
    }

    @Test
    fun `dos time uses local time`() {
        assertEquals(0x68AC to 0x5D44, Zip.dosTime(1_791_119_124_116L, ZoneOffset.UTC))
        assertEquals((0x68AC + (2 shl 11)) to 0x5D44, Zip.dosTime(1_791_119_124_116L, ZoneOffset.ofHours(2)))
    }
}
