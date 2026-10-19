package dev.arc.ep133.data

import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.text.ThemeChoice
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AppSettingsTest {
    @Test
    fun `every setting has a kind, and its text reads as that kind`() {
        val chosen = AppSettings(keepLast = 10, liveKeys = true, keysNames = NoteNames.LETTERS, tourSteps = "connect,~pad", tourDone = true)
        for (s in listOf(AppSettings(), chosen)) {
            val values = SettingsStore.values(s)
            assertEquals(SettingsStore.KINDS.keys, values.keys)
            for ((k, v) in values) {
                when (SettingsStore.kind(k)) {
                    SettingsStore.Kind.INT -> assertTrue(v.toIntOrNull() != null, k)
                    SettingsStore.Kind.BOOLEAN -> assertTrue(v.toBooleanStrictOrNull() != null, k)
                    SettingsStore.Kind.STRING -> {}
                }
            }
        }
        assertEquals(SettingsStore.Kind.STRING, SettingsStore.kind("tourSteps"))
        assertEquals(SettingsStore.Kind.BOOLEAN, SettingsStore.kind("tourDone"))
        assertThrows(IllegalArgumentException::class.java) { SettingsStore.kind("nonsense") }
    }

    @Test
    fun `library json's settings come back, garbage stays out`() {
        val cur = AppSettings(tourSteps = "connect")
        val back = SettingsStore.readIndex(
            cur,
            mapOf(
                "app.theme" to "DARK",
                "app.tourSteps" to "connect,pad,~backup",
                "app.tourDone" to "true",
                "app.guideSeen" to "true",
            ),
        )
        assertEquals(ThemeChoice.DARK, back.theme)
        assertEquals("connect,pad,~backup", back.tourSteps)
        assertTrue(back.tourDone)
        assertTrue(back.guideSeen)
        // Unreadable values leave the current ones.
        val garbage = SettingsStore.readIndex(
            cur,
            mapOf("app.theme" to "PURPLE", "app.tourSteps" to "pad,nonsense", "app.tourDone" to "yes", "app.keysRoot" to "40"),
        )
        assertEquals(cur, garbage)
        // Nothing there: nothing changes.
        assertEquals(cur, SettingsStore.readIndex(cur, emptyMap()))
    }
}
