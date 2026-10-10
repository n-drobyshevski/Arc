package dev.arc.ep133.ui.screens

import dev.arc.ep133.features.PhysicalPad
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class LiveVoicesTest {
    private val voices = linkedSetOf("note:64", "live:0:3", "note:60", "live:2:11", "live:x:1", "other", "note:")

    @Test
    fun `pads to ring`() {
        assertEquals(setOf(PhysicalPad(0, 3), PhysicalPad(2, 11)), LiveVoices.pads(voices))
    }

    @Test
    fun `notes to outline, latest last`() {
        assertEquals(listOf(64, 60), LiveVoices.notes(voices).toList())
    }

    // The pattern's KEYS notes: "seq:<group>:<offset>:<midi>".
    private val pattern = linkedSetOf("seq:1:4:62", "note:64", "seq:1:4:67", "seq:0:2:60", "seq:1:4", "seq:1:x:60", "seq:1:4:x")

    @Test
    fun `a pattern's notes ring their pads`() {
        assertEquals(setOf(PhysicalPad(1, 4), PhysicalPad(0, 2)), LiveVoices.pads(pattern))
    }

    @Test
    fun `a pattern's notes on the KEYS pad are outlined, others not`() {
        assertEquals(listOf(62, 64, 67), LiveVoices.notes(pattern, PhysicalPad(1, 4)).toList())
        assertEquals(listOf(64), LiveVoices.notes(pattern).toList())
        assertEquals(listOf(64, 60), LiveVoices.notes(pattern, PhysicalPad(0, 2)).toList())
    }

    // The arp's voices: "arp:<group>:<offset>:<semitones>", "n" for a pad hit.
    private val arp = linkedSetOf("arp:1:4:5", "arp:1:4:-12", "arp:0:9:n", "arp:2:3:7", "arp:1:4", "arp:1:x:2", "arp:0:1:x", "note:64")

    @Test
    fun `the arp's voices ring and light their pads`() {
        val pads = setOf(PhysicalPad(1, 4), PhysicalPad(0, 9), PhysicalPad(2, 3))
        assertEquals(pads, LiveVoices.arpPads(arp))
        assertEquals(pads, LiveVoices.pads(arp))
    }

    @Test
    fun `the arp's notes on the KEYS pad light, from the root note`() {
        assertEquals(setOf(65, 48), LiveVoices.arpNotes(arp, PhysicalPad(1, 4)))
        assertEquals(emptySet<Int>(), LiveVoices.arpNotes(arp, PhysicalPad(0, 9)))
        assertEquals(emptySet<Int>(), LiveVoices.arpNotes(arp, null))
        // They aren't the phone's own notes: nothing outlined for them.
        assertEquals(listOf(64), LiveVoices.notes(arp, PhysicalPad(1, 4)).toList())
    }
}
