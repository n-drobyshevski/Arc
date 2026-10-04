package dev.arc.ep133.features

import dev.arc.ep133.protocol.Frame
import dev.arc.ep133.protocol.MidiEvent
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.testing.MockEP133
import dev.arc.ep133.util.encodeUtf8
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class PadPushTest {
    private fun frame(command: Int, payload: ByteArray) = Frame(0x33, true, false, -1, command, -1, payload)

    private fun event(json: String, code: Int = 0x03, node: Int = 3200) =
        byteArrayOf(code.toByte(), (node shr 8).toByte(), node.toByte()) + encodeUtf8(json) + byteArrayOf(0)

    @Test
    fun `pad file ids split into project, group and pad`() {
        assertEquals(PadFid(1, 0, 10), PadPush.fid(3210)) // group A '.' in project 1 (kmorrill's example)
        assertEquals(PadFid(7, 3, 2), PadPush.fid(9502)) // ep133-krate's capture: project 7, group D, '8'
        assertEquals(PadFid(1, 3, 12), PadPush.fid(3512))
        assertNull(PadPush.fid(3200)) // a group dir, not a pad
        assertNull(PadPush.fid(3213))
        assertNull(PadPush.fid(3610)) // no group E
        assertNull(PadPush.fid(2000))
    }

    @Test
    fun `a metadata event with an active pad, and what is not one`() {
        assertEquals(PadFid(1, 0, 10), PadPush.parse(frame(5, event("""{"active":3210}"""))))
        assertEquals(PadFid(2, 1, 1), PadPush.parse(frame(5, event("""{"active":4301,"x":1}""", node = 4300))))
        // Without the trailing 0 too.
        assertEquals(PadFid(1, 0, 3), PadPush.parse(frame(5, event("""{"active":3203}""").dropLast(1).toByteArray())))
        assertNull(PadPush.parse(frame(1, event("""{"active":3210}"""))))
        assertNull(PadPush.parse(frame(5, event("""{"active":3210}""", code = 0x08))))
        assertNull(PadPush.parse(frame(5, event("""{"name":"kick"}"""))))
        assertNull(PadPush.parse(frame(5, event("""{"active":"3210"}"""))))
        assertNull(PadPush.parse(frame(5, event("""{"active":3210.5}"""))))
        assertNull(PadPush.parse(frame(5, event("not json"))))
        assertNull(PadPush.parse(frame(5, byteArrayOf(3))))
    }

    @Test
    fun `pushes reach the mirror through the session, request- or reply-shaped`() = runTest {
        val dev = MockEP133()
        val s = Session(dev.transport(this), StandardTestDispatcher(testScheduler))
        s.handshake()
        val got = ArrayList<PadFid>()
        val off = s.onPush { f -> PadPush.parse(f)?.let(got::add) }
        dev.pushPadActive(1, 0, 10)
        dev.pushPadActive(1, 2, 4, replyShaped = true)
        advanceUntilIdle()
        assertEquals(listOf(PadFid(1, 0, 10), PadFid(1, 2, 4)), got)
        // The session still works after a stray reply.
        s.handshake()
        off()
        dev.pushPadActive(1, 1, 1)
        advanceUntilIdle()
        assertEquals(2, got.size)
        s.close()
    }

    @Test
    fun `bottom-up pad order names pads without learning`() {
        val m = LiveMirror(padOrder = PadOrder.FROM_BOTTOM)
        // Counted from the bottom, '.' (offset 0) is p01 and '7' (offset 9) is p10.
        m.setProject(1, listOf(PadGroup("a", mapOf(1 to 5, 10 to 1))))
        m.setNames(mapOf(1 to "kick", 5 to "snare"))
        m.onMidi(MidiEvent.NoteOn(1, 36, 100, 0))
        assertEquals("snare", m.snapshot(1).lastHit!!.name)
        m.onMidi(MidiEvent.NoteOn(1, 45, 100, 2))
        assertEquals("kick", m.snapshot(3).lastHit!!.name)
        m.setPadOrder(PadOrder.FROM_TOP)
        // From the top, nothing is learned yet: no name.
        m.onMidi(MidiEvent.NoteOn(1, 36, 100, 4))
        assertNull(m.snapshot(5).lastHit!!.name)
        assertEquals(PadOrder.FROM_TOP, m.snapshot(5).padOrder)
    }
}
