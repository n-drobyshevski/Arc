package dev.arc.ep133.controller

import dev.arc.ep133.features.LiveSnapshot
import dev.arc.ep133.features.OfflinePad
import dev.arc.ep133.features.OfflinePads
import dev.arc.ep133.features.PadGroup
import dev.arc.ep133.features.PadTarget
import dev.arc.ep133.features.SoundSource
import dev.arc.ep133.protocol.SoundEntry
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** The controller's offline EDIT rules: the lists offered, what a pick keeps, and what reconnecting writes. */
class OfflineEditTest {
    private val read = LiveSnapshot(1L, 1, listOf(PadGroup("a", mapOf(1 to 5))), mapOf(5 to "kick", 1 to "snare", 343 to "343.pcm"))
    private val pack = LiveSnapshot(2L, 1, listOf(PadGroup("a", mapOf(1 to 1))), mapOf(343 to "bass", 1 to "kick"))

    @Test
    fun `the lists are the read's and the pack's by slot, sizes unknown`() {
        val s = offlineSoundsOf(read, pack, setOf(1))
        assertEquals(SoundSource.DEVICE, s.base)
        assertEquals(listOf(SoundEntry(1, "snare", 0), SoundEntry(5, "kick", 0), SoundEntry(343, "343.pcm", 0)), s.device)
        assertEquals(listOf(SoundEntry(1, "kick", 0), SoundEntry(343, "bass", 0)), s.factory)
        assertEquals(setOf(1), s.unavailable)
    }

    @Test
    fun `never read shows the factory list, no pack only the device's`() {
        val factoryOnly = offlineSoundsOf(null, pack, emptySet())
        assertEquals(SoundSource.FACTORY, factoryOnly.base)
        assertNull(factoryOnly.device)
        val deviceOnly = offlineSoundsOf(read, null, emptySet())
        assertEquals(SoundSource.DEVICE, deviceOnly.base)
        assertNull(deviceOnly.factory)
    }

    @Test
    fun `a factory project shown over a last read lists the pack's sounds first, both still offered`() {
        // PROJECT stepped from the last read to one of the pack's projects.
        val s = offlineSoundsOf(read, pack, setOf(1), base = SoundSource.FACTORY)
        assertEquals(SoundSource.FACTORY, s.base)
        assertEquals(offlineSoundsOf(read, pack, setOf(1)).device, s.device)
        assertEquals(offlineSoundsOf(read, pack, setOf(1)).factory, s.factory)
        // And back to the last read.
        assertEquals(SoundSource.DEVICE, offlineSoundsOf(read, pack, setOf(1), base = SoundSource.DEVICE).base)
        // Any of the pack's projects gives the same list: each has every sound's name.
        assertEquals(s.factory, offlineSoundsOf(read, pack.copy(activeProject = 3, groups = emptyList()), setOf(1), SoundSource.FACTORY).factory)
    }

    @Test
    fun `a pick needs a listed row arc can play`() {
        val s = offlineSoundsOf(read, pack, setOf(1))
        assertEquals(SoundEntry(5, "kick", 0), s.pick(5, SoundSource.DEVICE))
        // Dimmed: no copy, backup or pack sound.
        assertNull(s.pick(1, SoundSource.DEVICE))
        // The factory sounds always play from the pack.
        assertEquals(SoundEntry(1, "kick", 0), s.pick(1, SoundSource.FACTORY))
        assertNull(s.pick(7, SoundSource.DEVICE))
        assertNull(offlineSoundsOf(read, null, emptySet()).pick(343, SoundSource.FACTORY))
    }

    @Test
    fun `the pad's own sound in the read is taken back even when arc can't play it`() {
        val s = offlineSoundsOf(read, pack, setOf(1))
        assertEquals(SoundEntry(1, "snare", 0), s.pick(1, SoundSource.DEVICE, readSlot = 1))
        assertNull(s.pick(1, SoundSource.DEVICE, readSlot = 5))
        // Back to it: the pad's change goes.
        val t = PadTarget(1, 0, 1, 343)
        val put = offlineAssign(OfflinePads.EMPTY, t, 343, "bass", SoundSource.FACTORY, readSlot = 1)
        assertEquals(OfflinePads.EMPTY, offlineAssign(put, t, 1, "snare", SoundSource.DEVICE, readSlot = 1))
    }

    @Test
    fun `picking the read's own sound drops the pad's change, anything else is put on it`() {
        val t = PadTarget(1, 0, 1, 343)
        val put = offlineAssign(OfflinePads.EMPTY, t, 343, "bass", SoundSource.FACTORY, readSlot = 5)
        assertEquals(listOf(OfflinePad(1, 0, 1, 343, "bass", SoundSource.FACTORY)), put.list)
        // The factory sound in the read's own slot is still a change: the device may hold another sound there.
        assertEquals(1, offlineAssign(OfflinePads.EMPTY, t, 5, "kick", SoundSource.FACTORY, readSlot = 5).size)
        assertEquals(OfflinePads.EMPTY, offlineAssign(put, t, 5, "kick", SoundSource.DEVICE, readSlot = 5))
        val other = offlineAssign(put, t, 1, "snare", SoundSource.DEVICE, readSlot = 5)
        assertEquals(listOf(OfflinePad(1, 0, 1, 1, "snare", SoundSource.DEVICE)), other.list)
    }

    @Test
    fun `reconnecting writes what fits, counts what is there already and skips the rest`() {
        val names = mapOf(5 to "kick", 343 to "343.pcm", 1 to "snare")
        val factory = OfflinePad(1, 0, 1, 343, "bass", SoundSource.FACTORY)
        // Unnamed on the device: the factory sound is still there.
        assertEquals(OfflineStep.Write(PadTarget(1, 0, 1, 5), 343), offlineStep(factory, 1, names, readSlot = 5))
        assertEquals(OfflineStep.Done, offlineStep(factory, 1, names, readSlot = 343))
        // Another project active, another sound in that slot, or none.
        assertEquals(OfflineStep.Skip, offlineStep(factory, 2, names, readSlot = 5))
        assertEquals(OfflineStep.Skip, offlineStep(factory.copy(slot = 1, name = "kick"), 1, names, readSlot = 5))
        assertEquals(OfflineStep.Skip, offlineStep(factory.copy(slot = 9), 1, names, readSlot = 5))
        val device = OfflinePad(1, 0, 1, 1, "Snare.wav", SoundSource.DEVICE)
        assertEquals(OfflineStep.Write(PadTarget(1, 0, 1, null), 1), offlineStep(device, 1, names, readSlot = null))
    }

    @Test
    fun `a recording uploads onto its pad in its own project, whatever the pad and slots hold`() {
        val names = mapOf(5 to "kick")
        val rec = OfflinePad(1, 0, 1, 0, "mic 1007-142301", SoundSource.RECORDED, "smp-20261007-142301.wav")
        assertEquals(OfflineStep.Upload(PadTarget(1, 0, 1, 5)), offlineStep(rec, 1, names, readSlot = 5))
        // An empty pad, and a device with no sounds at all.
        assertEquals(OfflineStep.Upload(PadTarget(1, 0, 1, null)), offlineStep(rec, 1, emptyMap(), readSlot = null))
        // Its slot 0 is no slot: never "there already".
        assertEquals(OfflineStep.Upload(PadTarget(1, 0, 1, 0)), offlineStep(rec, 1, names, readSlot = 0))
        // Another project active: skipped (and the recording goes to Takes).
        assertEquals(OfflineStep.Skip, offlineStep(rec, 2, names, readSlot = 5))
    }

    @Test
    fun `a connected mirror shows only the recordings on their way up`() {
        val up = OfflinePad(1, 0, 1, 0, "mic 1007-142301", SoundSource.RECORDED, "smp-a.wav")
        val waiting = OfflinePad(1, 1, 2, 0, "rsp 1007-142400", SoundSource.RECORDED, "smp-b.wav")
        val change = OfflinePad(1, 2, 3, 5, "kick", SoundSource.DEVICE)
        val pads = OfflinePads(listOf(up, waiting, change))
        assertEquals(listOf(up), connectedLocal(pads, setOf("smp-a.wav")).list)
        assertEquals(OfflinePads.EMPTY, connectedLocal(pads, emptySet()))
    }
}
