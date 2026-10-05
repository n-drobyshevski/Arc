package dev.arc.ep133.features

import dev.arc.ep133.protocol.SoundEntry
import dev.arc.ep133.text.FeatureText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class DeviceListTest {
    private val sounds = listOf(
        SoundEntry(212, "Vox Chop", 1L),
        SoundEntry(1, "kick", 1L),
        SoundEntry(12, "snare 12", 1L),
        SoundEntry(120, "hat", 1L),
        SoundEntry(99, "clap", 1L),
    )

    @Test
    fun `finds by name ignoring case, or by slot number`() {
        assertEquals(listOf(212), DeviceBrowser.findSounds(sounds, "vox").map { it.slot })
        // "12" matches slot 12 and the name "snare 12"; not slot 120 or 212.
        assertEquals(listOf(12), DeviceBrowser.findSounds(sounds, "12").map { it.slot })
        assertEquals(listOf(12), DeviceBrowser.findSounds(sounds, "012").map { it.slot })
        assertEquals(listOf(120), DeviceBrowser.findSounds(sounds, " 120 ").map { it.slot })
        assertEquals(sounds, DeviceBrowser.findSounds(sounds, "  "))
        assertEquals(emptyList<SoundEntry>(), DeviceBrowser.findSounds(sounds, "bass"))
    }

    @Test
    fun `groups sounds by hundreds of slots in slot order`() {
        val groups = DeviceBrowser.hundreds(sounds)
        assertEquals(listOf(1..99, 100..199, 200..299), groups.map { it.first })
        assertEquals(listOf(listOf(1, 12, 99), listOf(120), listOf(212)), groups.map { g -> g.second.map { it.slot } })
        assertEquals("001\u2013099", FeatureText.range(groups[0].first))
        assertEquals("200\u2013299", FeatureText.range(groups[2].first))
    }

    @Test
    fun `labels for the device panel and project sounds`() {
        assertEquals("212 sounds \u00B7 1 project", FeatureText.counts(212, 1))
        assertEquals("1 sound \u00B7 6 projects", FeatureText.counts(1, 6))
        assertEquals("001\u00A0kick \u00B7 040", FeatureText.projectSoundNames(listOf(1, 40), mapOf(1 to "kick")))
        assertEquals("Uses no sounds", FeatureText.projectSoundNames(emptyList(), emptyMap()))
        assertEquals("Sounds 212", FeatureText.sectionLabel(FeatureText.SOUNDS, 212))
    }
}
