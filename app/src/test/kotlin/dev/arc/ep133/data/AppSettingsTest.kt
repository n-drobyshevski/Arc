package dev.arc.ep133.data

import dev.arc.ep133.text.LiveEngine
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
            liveOneGroup = false,
            keysRoot = 4,
            keysOctave = 3,
            keysShowNames = false,
            pianoWhites = dev.arc.ep133.features.Piano.CHOICES.filterNotNull().first(),
            haptics = false,
            liveTempo = 98,
        )
        val index = chosen.values().mapKeys { "app." + it.key }
        assertEquals(chosen, AppSettings().withIndex(index))
    }

    @Test
    fun `the click's tempo starts at 120 and library json gives back only one arc offers`() {
        assertEquals(120, AppSettings().liveTempo)
        assertEquals("120", AppSettings().values()["liveTempo"])
        assertEquals(98, AppSettings().withIndex(mapOf("app.liveTempo" to "98")).liveTempo)
        assertEquals(240, AppSettings().withIndex(mapOf("app.liveTempo" to "240")).liveTempo)
        // Out of 40..240, or not a number: left as it is.
        assertEquals(98, AppSettings(liveTempo = 98).withIndex(mapOf("app.liveTempo" to "39")).liveTempo)
        assertEquals(98, AppSettings(liveTempo = 98).withIndex(mapOf("app.liveTempo" to "241")).liveTempo)
        assertEquals(98, AppSettings(liveTempo = 98).withIndex(mapOf("app.liveTempo" to "fast")).liveTempo)
        assertEquals(98, AppSettings(liveTempo = 98).withIndex(emptyMap()).liveTempo)
    }

    @Test
    fun `the engine choice is Auto by default and stays out of library json`() {
        assertEquals(LiveEngine.AUTO, AppSettings().liveEngine)
        val chosen = AppSettings(liveEngine = LiveEngine.TRACK_OLD)
        assertFalse(chosen.values().keys.any { it.contains("ngine") })
        assertEquals(AppSettings().values(), chosen.values())
        // library.json from another phone leaves this phone's choice alone.
        assertEquals(LiveEngine.TRACK_OLD, chosen.withIndex(mapOf("app.liveEngine" to "AUTO")).liveEngine)
    }

    @Test
    fun `the engine choice is read back by name, anything else is Auto`() {
        for (e in LiveEngine.entries) assertEquals(e, liveEngineOf(e.name))
        assertEquals(LiveEngine.AUTO, liveEngineOf(null))
        assertEquals(LiveEngine.AUTO, liveEngineOf("track"))
        assertEquals("liveEngine", LIVE_ENGINE)
    }
}
