package dev.arc.ep133.protocol

import dev.arc.ep133.testing.hex
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.ZoneOffset

class MidiPartsTest {
    private val greetReply = hex(
        "F0 00 20 76 33 40 37 14 01 00 00 70 72 6F 64 75 63 74 00 3A 45 50 2D 31 33 33 00 3B 6D 6F 64 65 3A 6E 00 6F 72 6D 61 6C 3B 73 00 6B 75 3A 54 45 30 33 00 32 41 53 30 30 31 3B 00 6F 73 5F 76 65 72 73 00 69 6F 6E 3A 31 2E 31 00 2E 32 3B 73 77 5F 76 00 65 72 73 69 6F 6E 3A 00 31 2E 31 2E 32 3B 62 00 6C 5F 76 65 72 73 69 00 6F 6E 3A 31 30 30 30 00 2E 30 2E 31 30 3B 73 00 65 72 69 61 6C 3A 45 00 33 50 54 56 32 4A 54 F7",
    )

    @Test
    fun `a reply split at any point is reassembled`() {
        for (cut in 1 until greetReply.size) {
            val got = ArrayList<ByteArray>()
            val a = SysexAssembler { got.add(it) }
            a.feed(greetReply, 0, cut)
            assertEquals(0, got.size)
            a.feed(greetReply, cut, greetReply.size - cut)
            assertEquals(1, got.size)
            assertArrayEquals(greetReply, got[0])
        }
    }

    @Test
    fun `a reply delivered one byte at a time with realtime bytes in between`() {
        val got = ArrayList<ByteArray>()
        val a = SysexAssembler { got.add(it) }
        for ((i, b) in greetReply.withIndex()) {
            a.feed(byteArrayOf(b))
            if (i % 10 == 3) a.feed(byteArrayOf(0xF8.toByte(), 0xFE.toByte()))
        }
        assertEquals(1, got.size)
        assertArrayEquals(greetReply, got[0])
    }

    @Test
    fun `several messages in one chunk, other messages dropped`() {
        val got = ArrayList<ByteArray>()
        val a = SysexAssembler { got.add(it) }
        a.feed(hex("90 3C 7F F0 7E 33 06 02 F7 80 3C 00 F0 01 02 F7"))
        assertEquals(listOf("F0 7E 33 06 02 F7", "F0 01 02 F7"), got.map { m -> m.joinToString(" ") { "%02X".format(it) } })
    }

    @Test
    fun `a status byte aborts a sysex and F0 restarts one`() {
        val got = ArrayList<ByteArray>()
        val a = SysexAssembler { got.add(it) }
        a.feed(hex("F0 00 20 90 3C F7 F0 00 F0 11 22 F7"))
        assertEquals(listOf("F0 11 22 F7"), got.map { m -> m.joinToString(" ") { "%02X".format(it) } })
    }

    @Test
    fun `oversized sysex is discarded`() {
        val got = ArrayList<ByteArray>()
        val a = SysexAssembler(maxSize = 8) { got.add(it) }
        a.feed(hex("F0 01 02 03 04 05 06 07 08 09 F7 F0 05 F7"))
        assertEquals(1, got.size)
        assertEquals(3, got[0].size)
    }

    @Test
    fun `EP-133 port names`() {
        for (n in listOf("EP-133", "EP133 MIDI", "ep 1320", "teenage engineering EP-40", "K.O. II", "KO II", "ko\u00A0ii", "K.OII")) {
            assertTrue(PortMatch.matches(n), n)
        }
        for (n in listOf("OP-1", "EP-13", "Kontakt", "KoſII", null)) assertFalse(PortMatch.matches(n), n.toString())
        assertEquals("EP-133", PortMatch.pick(listOf("OP-Z", "EP-133", "EP-40")) { it })
        assertEquals("Some synth", PortMatch.pick(listOf("Some synth")) { it })
        assertNull(PortMatch.pick(listOf("a", "b")) { it })
    }

    @Test
    fun `traffic log export and eviction`() {
        var t = 1_791_119_124_116L
        val log = TrafficLog(capacity = 3) { t++ }
        log.out(FrameCodec.encodeRequest(0x33, 0xB94, 1))
        log.inbound(greetReply)
        log.inbound(hex("F0 7E 33 06 02 00 20 76 20 00 01 00 00 00 00 00 F7"))
        log.out(FrameCodec.encodeRequest(0x33, 5, 5, byteArrayOf(4, 0, 0, 3, 0xE8.toByte())))
        assertEquals(3, log.size)
        val text = log.export(listOf("device: EP-133"), ZoneOffset.UTC)
        val lines = text.lines()
        assertEquals("arc SysEx log", lines[0])
        assertEquals("device: EP-133", lines[1])
        assertEquals("(1 older messages not kept)", lines[2])
        assertTrue(lines[4].startsWith("2026-10-04 13:05:24.117  IN   [139] GREET id=2964 status=0  F0 00 20 76"), lines[4])
        assertTrue(lines[5].contains("IN   [17] identity reply  F0 7E 33"), lines[5])
        assertTrue(lines[6].endsWith("OUT  [16] FILE list id=5  F0 00 20 76 33 40 60 05 05 10 04 00 00 03 68 F7"), lines[6])
    }
}
