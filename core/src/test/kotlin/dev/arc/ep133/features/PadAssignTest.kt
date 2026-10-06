package dev.arc.ep133.features

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.protocol.DeviceError
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.testing.DemoData
import dev.arc.ep133.testing.MockEP133
import dev.arc.ep133.testing.noise
import dev.arc.ep133.text.MirrorText
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** Live's EDIT: a pad's sound set with a METADATA SET of {"sym": slot} on its pad file (community notes). */
class PadAssignTest {
    private suspend fun TestScope.connect(dev: MockEP133): Session {
        val s = Session(dev.transport(this), StandardTestDispatcher(testScheduler))
        s.handshake()
        return s
    }

    @Test
    fun `pad file ids and the patch`() {
        assertEquals(3210, PadPush.node(PadFid(1, 0, 10)))
        assertEquals(9502, PadPush.node(PadFid(7, 3, 2)))
        for (id in listOf(3201, 3312, 4405, 101512)) assertEquals(id, PadPush.node(PadPush.fid(id)!!))
        assertThrows<IllegalArgumentException> { PadPush.node(PadFid(1, 4, 1)) }
        assertThrows<IllegalArgumentException> { PadPush.node(PadFid(1, 0, 13)) }
        assertEquals("""{"sym":140}""", JsJson.stringify(Device.padPatch(140)))
        assertThrows<IllegalArgumentException> { Device.padPatch(0) }
        assertThrows<IllegalArgumentException> { Device.padPatch(1000) }
        // Counted from the top: 7 8 9 are 1 2 3 ... '.', 0, ENTER are 10, 11, 12.
        assertEquals(listOf(10, 11, 12, 7, 8, 9, 4, 5, 6, 1, 2, 3), (0..11).map(PadPush::topNumber))
    }

    @Test
    fun `assigning writes sym on the pad file, and the project's records follow`() = runTest {
        val dev = DemoData.device()
        val s = connect(dev)
        // Project 1, group B, pad 2 (demo: slot 2 "snare").
        assertEquals(2, ProjectPads.read(Device.readProject(s, 1)).first { it.name == "b" }.pads[2])
        Device.assignPad(s, 1, 1, 2, 110)
        assertEquals(3302 to """{"sym":110}""", dev.metaWrites.last())
        assertEquals(110, ProjectPads.read(Device.readProject(s, 1)).first { it.name == "b" }.pads[2])
        // A pad with no record yet gets one.
        Device.assignPad(s, 1, 3, 12, 7)
        assertEquals(7, ProjectPads.read(Device.readProject(s, 1)).first { it.name == "d" }.pads[12])
        // No such project: the device refuses.
        assertThrows<DeviceError> { Device.assignPad(s, 9, 0, 1, 1) }
        s.close()
    }

    @Test
    fun `the mirror names the target, follows an assignment, and undo puts the old slot back`() {
        val m = LiveMirror(learned = mapOf(9 to 1)).apply {
            setProject(1, listOf(PadGroup("a", mapOf(1 to 5, 10 to 1))))
            setNames(mapOf(1 to "kick", 5 to "snare", 140 to "vox chop"))
        }
        val seven = PhysicalPad(0, 9)
        val dot = PhysicalPad(0, 0)
        assertEquals(PadTarget(1, 0, 1, 5), m.target(seven))
        // '.' isn't learned: from the top it is p10, kmorrill's numbering.
        assertEquals(PadTarget(1, 0, 10, 1), m.target(dot))
        val before = m.target(seven)!!
        m.assigned(before, 140)
        assertEquals("vox chop", m.nameOf(seven))
        assertEquals(PadTarget(1, 0, 1, 140), m.target(seven))
        assertEquals(listOf(PadGroup("a", mapOf(1 to 140, 10 to 1))), m.saved(0).groups)
        // UNDO.
        m.assigned(before, before.slot)
        assertEquals("snare", m.nameOf(seven))
        // A new group gets a layout of its own.
        m.assigned(PadTarget(1, 2, 4, null), 5)
        assertEquals(mapOf(4 to 5), m.saved(0).groups.first { it.name == "c" }.pads)
        // Another project now: an assignment for the old one is ignored.
        m.setProject(2, emptyList())
        m.assigned(before, 1)
        assertEquals(emptyList<PadGroup>(), m.saved(0).groups)
        // Counted from the bottom, '.' is p01.
        m.setPadOrder(PadOrder.FROM_BOTTOM)
        assertEquals(1, m.padNumber(dot))
        assertEquals(10, m.padNumber(seven))
    }

    @Test
    fun `no target while the project is unknown or not read yet`() {
        val m = LiveMirror()
        assertNull(m.target(PhysicalPad(0, 0)))
        m.setProject(1, listOf(PadGroup("a", mapOf(1 to 5))))
        m.onPadPush(PadFid(2, 0, 1), 0)
        assertNull(m.target(PhysicalPad(0, 9)))
        m.setProject(2, emptyList())
        assertEquals(PadTarget(2, 0, 1, null), m.target(PhysicalPad(0, 9)))
    }

    @Test
    fun `an upload goes into the first free slot, then onto the pad`() = runTest {
        val dev = DemoData.device()
        val s = connect(dev)
        val occupied = Device.listSounds(s).map { it.slot }.toSet()
        val wav = Wav.encode(noise(2000 * 2), 1, 46875)
        val slot = SampleUpload.uploadToPad(s, "vox take.wav", wav, occupied, PadTarget(2, 0, 1, 4))
        // Demo slots are 1..8 and 108..111: 9 is the first free one.
        assertEquals(9, slot)
        assertEquals("vox take", dev.sounds[9]!!.name)
        assertEquals(9, ProjectPads.read(Device.readProject(s, 2)).first { it.name == "a" }.pads[1])
        val full = (1..999).toSet()
        val e = assertThrows<UploadError> { SampleUpload.uploadToPad(s, "x.wav", wav, full, PadTarget(2, 0, 1, 9)) }
        assertEquals(MirrorText.NO_FREE_SLOT, e.message)
        s.close()
    }
}
