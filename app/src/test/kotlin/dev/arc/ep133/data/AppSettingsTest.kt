package dev.arc.ep133.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AppSettingsTest {
    @Test
    fun `haptic feedback is on by default and stored like the other switches`() {
        assertTrue(AppSettings().haptics)
        assertEquals("true", AppSettings().values()["haptics"])
        assertEquals("false", AppSettings(haptics = false).values()["haptics"])
    }

    @Test
    fun `library json gives haptic feedback back, and leaves it alone when missing or unreadable`() {
        assertFalse(AppSettings().withIndex(mapOf("app.haptics" to "false")).haptics)
        assertTrue(AppSettings(haptics = false).withIndex(mapOf("app.haptics" to "true")).haptics)
        assertFalse(AppSettings(haptics = false).withIndex(emptyMap()).haptics)
        assertTrue(AppSettings().withIndex(mapOf("app.haptics" to "yes")).haptics)
    }

    @Test
    fun `every setting round-trips through library json`() {
        val chosen = AppSettings(
            autoConnect = false,
            keepLast = 10,
            liveOneGroup = true,
            keysRoot = 4,
            keysOctave = 3,
            keysShowNames = false,
            pianoWhites = dev.arc.ep133.features.Piano.CHOICES.filterNotNull().first(),
            haptics = false,
        )
        val index = chosen.values().mapKeys { "app." + it.key }
        assertEquals(chosen, AppSettings().withIndex(index))
    }
}
