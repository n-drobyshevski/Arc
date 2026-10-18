package dev.arc.ep133.controller

import dev.arc.ep133.features.FactoryKit
import dev.arc.ep133.features.FactorySounds
import dev.arc.ep133.features.LiveSnapshot
import dev.arc.ep133.features.OfflinePad
import dev.arc.ep133.features.OfflinePads
import dev.arc.ep133.features.PadGroup
import dev.arc.ep133.features.PadTarget
import dev.arc.ep133.features.SoundSource
import dev.arc.ep133.protocol.SoundEntry
import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.BackupRecord
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The controller's offline EDIT rules: the lists offered, what a pick keeps, what reconnecting writes, and which factory kit plays. */
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

    // ---------- the factory kits (the EP-133's and the EP-1320's) ----------

    private fun rec(id: String, createdAt: Long, source: String) = BackupRecord(
        id, id, "", createdAt, source, null, BackupDevice(), 0, 0, emptyList(), emptyList(), emptyMap(), 0,
    )

    private val ep133Pack = rec("f", 1L, FactorySounds.SOURCE)
    private val medievalPack = rec("m", 2L, FactoryKit.EP1320.source)
    private val medievalBackup = rec("b", 3L, "device")

    @Test
    fun `Live plays the kit chosen while its pack is saved, else the EP-133's`() {
        val both = listOf(ep133Pack, medievalPack, medievalBackup)
        assertEquals(FactoryKit.EP1320, activeKitOf(FactoryKit.EP1320, both))
        assertEquals(FactoryKit.EP133, activeKitOf(FactoryKit.EP133, both))
        // The Medieval's copy deleted: back to the EP-133's, not to nothing.
        assertEquals(FactoryKit.EP133, activeKitOf(FactoryKit.EP1320, listOf(ep133Pack, medievalBackup)))
        // The EP-133's alone saved never hides behind the chosen one.
        assertEquals(FactoryKit.EP1320, activeKitOf(FactoryKit.EP1320, listOf(medievalPack)))
        assertTrue(kitsSaved(both))
        assertFalse(kitsSaved(listOf(ep133Pack, medievalBackup)))
    }

    @Test
    fun `connecting a Medieval picks its kit when its pack is saved`() {
        val both = listOf(ep133Pack, medievalPack)
        assertEquals(FactoryKit.EP1320, kitOnConnect("TE032AS005", FactoryKit.EP133, both))
        assertEquals(FactoryKit.EP133, kitOnConnect("TE032AS001", FactoryKit.EP1320, both))
        // Already the kit, no pack for it, or a device with no kit: nothing changes.
        assertNull(kitOnConnect("TE032AS005", FactoryKit.EP1320, both))
        assertNull(kitOnConnect("TE032AS005", FactoryKit.EP133, listOf(ep133Pack)))
        assertNull(kitOnConnect("TE032AS003", FactoryKit.EP133, both))
    }

    @Test
    fun `a sound the device lists unnamed plays from the connected device's kit, offline the active one`() {
        assertEquals(FactoryKit.EP1320, unnamedKit("TE032AS005", FactoryKit.EP133))
        assertEquals(FactoryKit.EP133, unnamedKit("TE032AS001", FactoryKit.EP1320))
        assertEquals(FactoryKit.EP1320, unnamedKit(null, FactoryKit.EP1320))
        assertEquals(FactoryKit.EP133, unnamedKit("TE032AS003", FactoryKit.EP133))
    }

    @Test
    fun `the two packs' sounds of one slot and name are kept apart in memory`() {
        assertEquals("5:kick", padMemoryKey(5, " Kick "))
        assertEquals("pack:f:5:kick", padMemoryKey(5, "kick", ep133Pack.id))
        assertNotEquals(padMemoryKey(5, "kick", ep133Pack.id), padMemoryKey(5, "kick", medievalPack.id))
        assertNotEquals(padMemoryKey(5, "kick"), padMemoryKey(5, "kick", medievalPack.id))
    }

    @Test
    fun `a factory sound picked offline keeps the kit shown, any other sound the EP-133's`() {
        val t = PadTarget(1, 0, 1, 343)
        val put = offlineAssign(OfflinePads.EMPTY, t, 343, "lute", SoundSource.FACTORY, readSlot = 5, kit = FactoryKit.EP1320)
        assertEquals(listOf(OfflinePad(1, 0, 1, 343, "lute", SoundSource.FACTORY, kit = FactoryKit.EP1320)), put.list)
        val device = offlineAssign(OfflinePads.EMPTY, t, 1, "snare", SoundSource.DEVICE, readSlot = 5, kit = FactoryKit.EP1320)
        assertEquals(FactoryKit.EP133, device.list.single().kit)
    }

    @Test
    fun `a new copy of a kit replaces that kit's earlier ones, never the other kit's or the backup`() {
        val newer = rec("m2", 9L, FactoryKit.EP1320.source)
        val all = listOf(ep133Pack, medievalPack, medievalBackup, newer)
        assertEquals(listOf(medievalPack), olderKitCopies(all, FactoryKit.EP1320, newer.id))
        assertEquals(emptyList<BackupRecord>(), olderKitCopies(all, FactoryKit.EP133, ep133Pack.id))
    }

    // ---------- the EP-40 Riddim's kit, a third ----------

    private val riddimPack = rec("r", 4L, FactoryKit.EP40.source)

    @Test
    fun `the chosen kit's pack gone, Live plays the first saved of the EP-133's, the EP-40's and the EP-1320's`() {
        val all = listOf(ep133Pack, riddimPack, medievalPack, medievalBackup)
        assertEquals(FactoryKit.EP40, activeKitOf(FactoryKit.EP40, all))
        assertEquals(FactoryKit.EP40, activeKitOf(FactoryKit.EP1320, listOf(riddimPack, medievalBackup)))
        assertEquals(FactoryKit.EP40, activeKitOf(FactoryKit.EP133, listOf(riddimPack, medievalPack)))
        assertEquals(FactoryKit.EP1320, activeKitOf(FactoryKit.EP40, listOf(medievalPack)))
        assertEquals(FactoryKit.EP133, activeKitOf(FactoryKit.EP40, listOf(ep133Pack, medievalPack)))
        // None saved: the EP-133's, whose sounds Live offers to get.
        assertEquals(FactoryKit.EP133, activeKitOf(FactoryKit.EP40, listOf(medievalBackup)))
    }

    @Test
    fun `the kit switch offers only the saved kits, in order, once two are saved`() {
        assertEquals(FactoryKit.SHOWN, savedKits(listOf(medievalPack, riddimPack, ep133Pack)))
        assertEquals(listOf(FactoryKit.EP40, FactoryKit.EP1320), savedKits(listOf(medievalPack, riddimPack, medievalBackup)))
        assertEquals(listOf(FactoryKit.EP133, FactoryKit.EP40), savedKits(listOf(riddimPack, ep133Pack)))
        assertTrue(kitsSaved(listOf(riddimPack, medievalPack)))
        assertFalse(kitsSaved(listOf(riddimPack, medievalBackup)))
        assertEquals(emptyList<FactoryKit>(), savedKits(listOf(medievalBackup)))
    }

    @Test
    fun `connecting an EP-40 picks its kit when its pack is saved`() {
        val all = listOf(ep133Pack, riddimPack, medievalPack)
        assertEquals(FactoryKit.EP40, kitOnConnect("TE032AS006", FactoryKit.EP133, all))
        assertEquals(FactoryKit.EP40, kitOnConnect("TE032AS006", FactoryKit.EP1320, all))
        assertNull(kitOnConnect("TE032AS006", FactoryKit.EP40, all))
        assertNull(kitOnConnect("TE032AS006", FactoryKit.EP133, listOf(ep133Pack, medievalPack)))
        // Its unnamed sounds ("335.pcm") play from its own pack while it is connected.
        assertEquals(FactoryKit.EP40, unnamedKit("TE032AS006", FactoryKit.EP133))
    }

    @Test
    fun `a new EP-40 pack replaces only the EP-40's earlier one`() {
        val newer = rec("r2", 9L, FactoryKit.EP40.source)
        val all = listOf(ep133Pack, riddimPack, medievalPack, newer)
        assertEquals(listOf(riddimPack), olderKitCopies(all, FactoryKit.EP40, newer.id))
    }
}
