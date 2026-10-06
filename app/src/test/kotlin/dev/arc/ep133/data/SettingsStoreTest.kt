package dev.arc.ep133.data

import android.content.SharedPreferences
import dev.arc.ep133.text.LiveEngine
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The settings as kept in the preferences, on an in-memory stand-in for them. */
class SettingsStoreTest {
    @Test
    fun `the engine choice is kept in the preferences, and comes back with them`() {
        val prefs = MemoryPrefs()
        val store = SettingsStore(prefs)
        assertEquals(LiveEngine.AUTO, store.settings.value.liveEngine)
        store.update { it.copy(liveEngine = LiveEngine.TRACK_OLD) }
        assertEquals(LiveEngine.TRACK_OLD, store.settings.value.liveEngine)
        assertEquals("TRACK_OLD", prefs.getString(LIVE_ENGINE, null))
        // The app starting again reads it back.
        assertEquals(LiveEngine.TRACK_OLD, SettingsStore(prefs).settings.value.liveEngine)
        // Not copied into library.json.
        assertTrue(store.toIndex().isEmpty())
    }

    @Test
    fun `back to Auto, nothing is kept`() {
        val prefs = MemoryPrefs()
        val store = SettingsStore(prefs)
        store.update { it.copy(liveEngine = LiveEngine.TRACK) }
        store.update { it.copy(liveEngine = LiveEngine.AUTO) }
        assertFalse(prefs.contains(LIVE_ENGINE))
        assertEquals(LiveEngine.AUTO, SettingsStore(prefs).settings.value.liveEngine)
    }

    @Test
    fun `the other settings still go to library json beside it`() {
        val store = SettingsStore(MemoryPrefs())
        store.update { it.copy(haptics = false, liveEngine = LiveEngine.TRACK) }
        assertEquals(mapOf("app.haptics" to "false"), store.toIndex())
    }

    /** SharedPreferences in a map: enough for [SettingsStore]. */
    private class MemoryPrefs : SharedPreferences {
        val map = HashMap<String, Any?>()

        override fun getAll(): Map<String, *> = map
        override fun getString(key: String, defValue: String?) = map[key] as? String ?: defValue
        override fun getStringSet(key: String, defValues: Set<String>?): Set<String>? {
            @Suppress("UNCHECKED_CAST")
            return map[key] as? Set<String> ?: defValues
        }
        override fun getInt(key: String, defValue: Int) = map[key] as? Int ?: defValue
        override fun getLong(key: String, defValue: Long) = map[key] as? Long ?: defValue
        override fun getFloat(key: String, defValue: Float) = map[key] as? Float ?: defValue
        override fun getBoolean(key: String, defValue: Boolean) = map[key] as? Boolean ?: defValue
        override fun contains(key: String) = key in map
        override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}
        override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}

        override fun edit(): SharedPreferences.Editor = object : SharedPreferences.Editor {
            private val puts = HashMap<String, Any?>()
            private val removes = HashSet<String>()
            private var clear = false

            override fun putString(key: String, value: String?) = apply { puts[key] = value }
            override fun putStringSet(key: String, values: Set<String>?) = apply { puts[key] = values }
            override fun putInt(key: String, value: Int) = apply { puts[key] = value }
            override fun putLong(key: String, value: Long) = apply { puts[key] = value }
            override fun putFloat(key: String, value: Float) = apply { puts[key] = value }
            override fun putBoolean(key: String, value: Boolean) = apply { puts[key] = value }
            override fun remove(key: String) = apply { removes += key }
            override fun clear() = apply { clear = true }
            override fun commit(): Boolean {
                if (clear) map.clear()
                removes.forEach(map::remove)
                map.putAll(puts)
                return true
            }
            override fun apply() {
                commit()
            }
        }
    }
}
