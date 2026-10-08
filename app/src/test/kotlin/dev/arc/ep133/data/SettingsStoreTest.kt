package dev.arc.ep133.data

import android.content.SharedPreferences
import dev.arc.ep133.features.ArpOrder
import dev.arc.ep133.features.ArpSettings
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TimingSettings
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

    @Test
    fun `the click's tempo is kept as a number once chosen, and read back clamped`() {
        val prefs = MemoryPrefs()
        val store = SettingsStore(prefs)
        assertEquals(120, store.settings.value.liveTempo)
        // The default isn't kept.
        assertFalse(prefs.contains("liveTempo"))
        store.update { it.copy(liveTempo = 98) }
        assertEquals(98, prefs.getInt("liveTempo", 0))
        assertEquals(98, SettingsStore(prefs).settings.value.liveTempo)
        assertEquals(mapOf("app.liveTempo" to "98"), store.toIndex())
        // A stored tempo out of range (an older or edited file) comes back clamped.
        prefs.edit().putInt("liveTempo", 400).apply()
        assertEquals(240, SettingsStore(prefs).settings.value.liveTempo)
    }

    @Test
    fun `SAMPLE's level, threshold and bars are kept as chosen, and none comes back as none`() {
        val prefs = MemoryPrefs()
        val store = SettingsStore(prefs)
        store.update { it.copy(sampleGainMic = 18f, sampleThreshold = -30f, sampleBars = 2, sampleSource = dev.arc.ep133.features.SampleSource.RSP) }
        assertEquals(18f, prefs.getFloat("sampleGainMic", 0f))
        assertEquals("-30.0", prefs.getString("sampleThreshold", null))
        assertEquals(2, prefs.getInt("sampleBars", 0))
        val back = SettingsStore(prefs).settings.value
        assertEquals(18f, back.sampleGainMic)
        assertEquals(-30f, back.sampleThreshold)
        assertEquals(2, back.sampleBars)
        assertEquals(dev.arc.ep133.features.SampleSource.RSP, back.sampleSource)
        // The defaults weren't kept.
        assertFalse(prefs.contains("sampleGainRsp"))
        store.update { it.copy(sampleThreshold = null, sampleBars = null) }
        assertEquals(null, SettingsStore(prefs).settings.value.sampleThreshold)
        assertEquals(null, SettingsStore(prefs).settings.value.sampleBars)
    }

    @Test
    fun `an earlier version's TIMING is read as the interval and quantize, and kept with them once changed`() {
        val prefs = MemoryPrefs()
        prefs.edit().putString("patternTiming", "1/8").apply()
        val store = SettingsStore(prefs)
        assertEquals(TimingSettings(Timing.EIGHTH, 50, true), store.settings.value.timing)
        // Free time: the interval goes in beside "off", so it isn't lost.
        store.update { it.withTiming(it.timing.withQuantize(false)) }
        assertEquals("off", prefs.getString("patternTiming", null))
        assertEquals("1/8", prefs.getString("timingInterval", null))
        assertEquals(TimingSettings(Timing.EIGHTH, 50, false), SettingsStore(prefs).settings.value.timing)
        // OFF from an earlier version: free time on 1/16.
        val old = MemoryPrefs()
        old.edit().putString("patternTiming", "off").apply()
        assertEquals(TimingSettings(Timing.SIXTEENTH, 50, false), SettingsStore(old).settings.value.timing)
        // Nothing kept: 1/16, quantized, and nothing written.
        val fresh = MemoryPrefs()
        assertEquals(TimingSettings.DEFAULT, SettingsStore(fresh).settings.value.timing)
        assertTrue(SettingsStore(fresh).toIndex().isEmpty())
    }

    @Test
    fun `the arp's settings are kept as chosen and read back in range`() {
        val prefs = MemoryPrefs()
        val store = SettingsStore(prefs)
        store.update { it.copy(arpOn = true, timingSwing = 66).withArp(ArpSettings(ArpOrder.RANDOM, 2, 30, true)) }
        assertEquals("random", prefs.getString("arpOrder", null))
        assertEquals(2, prefs.getInt("arpOctaves", 0))
        assertEquals(30, prefs.getInt("arpGate", 0))
        assertEquals(66, prefs.getInt("timingSwing", 0))
        val back = SettingsStore(prefs).settings.value
        assertTrue(back.arpOn)
        assertEquals(ArpSettings(ArpOrder.RANDOM, 2, 30, true), back.arp)
        assertEquals(66, back.timingSwing)
        prefs.edit().putInt("arpGate", 500).putInt("timingSwing", 20).apply()
        assertEquals(50, SettingsStore(prefs).settings.value.arpGate)
        assertEquals(50, SettingsStore(prefs).settings.value.timingSwing)
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
