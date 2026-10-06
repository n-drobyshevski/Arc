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
}
