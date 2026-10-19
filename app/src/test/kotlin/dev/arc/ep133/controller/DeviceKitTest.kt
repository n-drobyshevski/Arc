package dev.arc.ep133.controller

import dev.arc.ep133.features.BeatCards
import dev.arc.ep133.features.CardSound
import dev.arc.ep133.features.FactoryKit
import dev.arc.ep133.features.FactorySounds
import dev.arc.ep133.features.SoundSource
import dev.arc.ep133.features.SoundStatus
import dev.arc.ep133.protocol.SoundEntry
import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.BackupRecord
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The kit a share names and a card's sounds are read by: the device's own, told by its slots, never the one Live plays
 * offline. An EP-133 with its own sounds and only the EP-40's pack saved (Live on that kit) is the EP-133's kit, its
 * unnamed sounds left unnamed, and a card's EP-40 sounds are uploaded from the pack, not put on by their slots.
 */
class DeviceKitTest {
    private fun pack(kit: FactoryKit, slots: List<Int>) = BackupRecord(kit.id, kit.id, "", 1L, kit.source, null, BackupDevice(), slots.size, 0, emptyList(), slots, emptyMap(), 0)

    // The EP-133's sounds: slots 1..60 and 100..160, unnamed as the device lists them; the EP-40's pack has 1..55, 100..164, 200..244, 600..628.
    private val ep133Slots = (1..60) + (100..160)
    private val ep40Slots = (1..55) + (100..164) + (200..244) + (600..628)
    private val device = ep133Slots.map { SoundEntry(it, it.toString().padStart(3, '0') + ".pcm", 1L) }
    private val ep40Names = ep40Slots.associateWith { if (it == 53) "mpc kick" else if (it == 234) "mpc hh" else "ep40 $it" }

    @Test
    fun `an EP-133 with its own sounds is not the EP-40 kit Live plays`() {
        val backups = listOf(pack(FactoryKit.EP40, ep40Slots))
        val connected = MirrorUi(loading = false, sounds = device)
        val k = deviceKitOf(connected, backups, mapOf(FactoryKit.EP40 to ep40Names), sku = null, active = FactoryKit.EP40)
        assertEquals(FactoryKit.EP133, k.kit)
        assertNull(k.names)
        // Its own pack saved too: named by it.
        val ep133Names = ep133Slots.associateWith { "kick $it" }
        val both = deviceKitOf(connected, backups + pack(FactoryKit.EP133, ep133Slots), mapOf(FactoryKit.EP40 to ep40Names, FactoryKit.EP133 to ep133Names), null, FactoryKit.EP40)
        assertEquals(FactoryKit.EP133, both.kit)
        assertEquals("kick 53", both.names?.get(53))
        // An EP-133 the EP-40's pack was put on: that kit.
        val riddim = MirrorUi(loading = false, sounds = ep40Slots.map { SoundEntry(it, "x", 1L) })
        assertEquals(FactoryKit.EP40, deviceKitOf(riddim, backups, mapOf(FactoryKit.EP40 to ep40Names), null, FactoryKit.EP133).kit)
        // Live playing the pack offline (nothing read): the pack's kit and names.
        val offline = MirrorUi(loading = false, offline = "Factory", offlineSounds = OfflineSounds(SoundSource.FACTORY, null, emptyList(), emptySet()))
        assertEquals(FactoryKit.EP40, deviceKitOf(offline, backups, mapOf(FactoryKit.EP40 to ep40Names), null, FactoryKit.EP40).kit)
        assertEquals("mpc kick", deviceKitOf(offline, backups, mapOf(FactoryKit.EP40 to ep40Names), null, FactoryKit.EP40).names?.get(53))
    }

    @Test
    fun `another kit's sound is not put on by its slot, and a pack that has it can upload it`() {
        val packs = mapOf(FactoryKit.EP40 to ep40Names)
        val card = BeatCards.read("ARC BEAT 1\n[A] bars 1\nsound A7 53 mpc kick\nsound A4 234 mpc hh\nsound A9 154 my snare\nA7 kick | X... .... .... .... |\nA4 hat | x.x. x.x. x.x. x.x. |\nA9 sn | .... X... .... X... |\n").card!!
        val available = device.associate { it.slot to it.name }
        val picks = BeatCards.resolveSounds(card, available, foreignTo(packs, FactoryKit.EP133)) { null }.associateBy { it.pad.offset }
        // 53 holds the EP-133's own (unnamed) kick: not the card's mpc kick.
        assertEquals(SoundStatus.MISSING, picks.getValue(9).status)
        assertEquals(SoundStatus.MISSING, picks.getValue(6).status)
        // A name no pack has, on an unnamed slot, is still used by its slot.
        assertEquals(SoundStatus.CHANGE, picks.getValue(11).status)
        assertTrue(picks.getValue(11).unverified)
        val ui = soundsUi(card, SoundSet("the EP-133", available), { null }, { null }, offline = false, project = 1, packs = packs, deviceKit = FactoryKit.EP133)!!
        val kick = ui.rows.first { it.pad.offset == 9 }
        assertEquals(53, kick.fromPack?.slot)
        assertEquals(FactoryKit.EP40, kick.fromPack?.kit)
        assertTrue(kick.changes)
        // Offline it can't be uploaded: no tick, the row says to connect.
        val off = soundsUi(card, SoundSet("the last read", available), { null }, { null }, offline = true, project = 1, packs = packs, deviceKit = FactoryKit.EP133)!!
        assertFalse(off.rows.first { it.pad.offset == 9 }.changes)
        assertEquals(234, packSoundOf(CardSound(9, "MPC HH"), packs)?.slot)
        assertNull(packSoundOf(CardSound(9, "009.pcm"), packs))
        assertFalse(foreignTo(packs, FactoryKit.EP40)(CardSound(53, "mpc kick")))
        assertTrue(FactorySounds.unnamed(53, available.getValue(53)))
    }
}
