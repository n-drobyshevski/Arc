package dev.arc.ep133.data

import dev.arc.ep133.features.ArpOrder
import dev.arc.ep133.features.ArpSettings
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.SwitchTime
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TimingSettings
import dev.arc.ep133.text.LiveEngine
import dev.arc.ep133.text.SkinChoice
import dev.arc.ep133.text.ThemeChoice
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
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
    fun `making up for Bluetooth delay is on by default, stored like the other switches and read back from library json`() {
        assertTrue(AppSettings().makeUpDelay)
        assertEquals("true", AppSettings().values()["makeUpDelay"])
        assertEquals("false", AppSettings(makeUpDelay = false).values()["makeUpDelay"])
        assertFalse(AppSettings().withIndex(mapOf("app.makeUpDelay" to "false")).makeUpDelay)
        assertTrue(AppSettings(makeUpDelay = false).withIndex(mapOf("app.makeUpDelay" to "true")).makeUpDelay)
        // Missing or unreadable: left as it is.
        assertFalse(AppSettings(makeUpDelay = false).withIndex(emptyMap()).makeUpDelay)
        assertTrue(AppSettings().withIndex(mapOf("app.makeUpDelay" to "maybe")).makeUpDelay)
    }

    @Test
    fun `background play is on by default, stored like the other switches and read back from library json`() {
        assertTrue(AppSettings().backgroundPlay)
        assertEquals("false", AppSettings(backgroundPlay = false).values()["backgroundPlay"])
        assertFalse(AppSettings().withIndex(mapOf("app.backgroundPlay" to "false")).backgroundPlay)
        assertTrue(AppSettings().withIndex(mapOf("app.backgroundPlay" to "maybe")).backgroundPlay)
    }

    @Test
    fun `sharing the sound list is on by default, stored like the other switches and read back from library json`() {
        assertTrue(AppSettings().shareSounds)
        assertEquals("true", AppSettings().values()["shareSounds"])
        assertEquals("false", AppSettings(shareSounds = false).values()["shareSounds"])
        assertFalse(AppSettings().withIndex(mapOf("app.shareSounds" to "false")).shareSounds)
        assertTrue(AppSettings(shareSounds = false).withIndex(mapOf("app.shareSounds" to "true")).shareSounds)
        // The beat card sheet's REPLACE: off at first (a card's scenes follow the project's), kept with the rest.
        assertFalse(AppSettings().replaceScenes)
        assertEquals("true", AppSettings(replaceScenes = true).values()["replaceScenes"])
        assertTrue(AppSettings().withIndex(mapOf("app.replaceScenes" to "true")).replaceScenes)
        // Missing or unreadable: left as it is.
        assertFalse(AppSettings(shareSounds = false).withIndex(emptyMap()).shareSounds)
        assertTrue(AppSettings().withIndex(mapOf("app.shareSounds" to "maybe")).shareSounds)
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
            backgroundPlay = false,
            makeUpDelay = false,
            liveTempo = 98,
            shareSounds = false,
            claudePrompt = dev.arc.ep133.features.ClaudePrompt(dev.arc.ep133.features.PromptTask.BEAT, genre = "dub-techno", text = "a;b").encode(),
            claudePrompts = dev.arc.ep133.features.SavedPrompt.encodeAll(listOf(dev.arc.ep133.features.SavedPrompt("Dub", dev.arc.ep133.features.ClaudePrompt()))),
        )
        val index = chosen.values().mapKeys { "app." + it.key }
        assertEquals(chosen, AppSettings().withIndex(index))
    }

    @Test
    fun `a REMAKE prompt round-trips through library json, its song's separators and all`() {
        val remake = dev.arc.ep133.features.ClaudePrompt().remake("One More Time; Daft Punk\\ https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV").copy(loop = true, tempo = 123)
        val chosen = AppSettings(
            claudePrompt = remake.encode(),
            claudePrompts = dev.arc.ep133.features.SavedPrompt.encodeAll(listOf(dev.arc.ep133.features.SavedPrompt("Remake \u00B7 One More Time", remake))),
        )
        val back = AppSettings().withIndex(chosen.values().mapKeys { "app." + it.key })
        assertEquals(chosen, back)
        assertEquals(remake, dev.arc.ep133.features.ClaudePrompt.decode(back.claudePrompt))
        assertEquals(remake, dev.arc.ep133.features.SavedPrompt.decodeAll(back.claudePrompts).single().prompt)
    }

    @Test
    fun `SAMPLE's choices round-trip through library json, no threshold and Free bars too`() {
        val chosen = AppSettings(
            sampleSource = dev.arc.ep133.features.SampleSource.USB,
            sampleStereo = true,
            sampleGainMic = 6.5f,
            sampleGainRsp = -3f,
            sampleGainUsb = 30f,
            sampleThreshold = -24f,
            sampleBars = 4,
            reviewSamples = false,
            sampleNormalize = true,
            sampleTrimSilence = true,
        )
        assertEquals(chosen, AppSettings().withIndex(chosen.values().mapKeys { "app." + it.key }))
        // Back to none and Free: stored as "off" and 0, and read back as such.
        val none = chosen.copy(sampleThreshold = null, sampleBars = null)
        assertEquals("off", none.values()["sampleThreshold"])
        assertEquals("0", none.values()["sampleBars"])
        assertEquals(none, chosen.withIndex(none.values().mapKeys { "app." + it.key }))
    }

    @Test
    fun `SAMPLE starts on the mic at +12 dB, reviewing each take, and leaves out what arc doesn't offer`() {
        val d = AppSettings()
        assertEquals(dev.arc.ep133.features.SampleSource.MIC, d.sampleSource)
        assertEquals(12f, d.sampleGain(dev.arc.ep133.features.SampleSource.MIC))
        assertEquals(0f, d.sampleGain(dev.arc.ep133.features.SampleSource.RSP))
        assertEquals(-6f, d.withSampleGain(dev.arc.ep133.features.SampleSource.USB, -6f).sampleGainUsb)
        assertTrue(d.reviewSamples)
        assertNull(d.sampleThreshold)
        assertNull(d.sampleBars)
        // A level past the knob, a threshold above 0 dB, 3 bars or an unknown source: left as they are.
        val odd = mapOf("app.sampleGainMic" to "40", "app.sampleThreshold" to "6", "app.sampleBars" to "3", "app.sampleSource" to "line")
        assertEquals(d, d.withIndex(odd))
        assertEquals(-60f, sampleThresholdOf("-60.0"))
        assertNull(sampleThresholdOf("off"))
        assertNull(sampleGainOf(-13f))
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

    @Test
    fun `PATTERN starts on 1-16 with the count-in on and AUTO off, and PTN off`() {
        val d = AppSettings()
        assertEquals(dev.arc.ep133.features.Timing.SIXTEENTH, d.patternTiming)
        assertTrue(d.patternCountIn)
        assertFalse(d.patternAutoLength)
        assertFalse(d.samplePattern)
        assertEquals("1/16", d.values()["patternTiming"])
    }

    @Test
    fun `PATTERN's choices round-trip through library json, TIMING by its word`() {
        for (t in dev.arc.ep133.features.Timing.entries) {
            val chosen = AppSettings(patternCountIn = false, patternAutoLength = true, samplePattern = true).withPatternTiming(t)
            assertEquals(t, chosen.patternTiming)
            assertEquals(chosen, AppSettings().withIndex(chosen.values().mapKeys { "app." + it.key }))
        }
        assertEquals("off", AppSettings().withPatternTiming(dev.arc.ep133.features.Timing.OFF).values()["patternTiming"])
        // A grid arc doesn't offer, or a switch that isn't one: left as they are.
        val odd = mapOf("app.patternTiming" to "1/12", "app.patternCountIn" to "no", "app.samplePattern" to "1")
        assertEquals(AppSettings(), AppSettings().withIndex(odd))
    }

    @Test
    fun `TIMING starts on 1-16, straight and quantized, and patternTiming is the grid it records on`() {
        val d = AppSettings()
        assertEquals(TimingSettings(Timing.SIXTEENTH, 50, true), d.timing)
        assertEquals(Timing.SIXTEENTH, d.patternTiming)
        val free = d.withTiming(d.timing.withInterval(Timing.EIGHTH_T).withQuantize(false))
        assertEquals(Timing.EIGHTH_T, free.timingInterval)
        assertEquals(Timing.OFF, free.patternTiming)
        assertEquals("off", free.values()["patternTiming"])
        assertEquals("1/8T", free.values()["timingInterval"])
        // PATTERN's selector: OFF keeps the interval and records free; a grid is the interval, quantized.
        assertEquals(Timing.EIGHTH_T, d.withPatternTiming(Timing.EIGHTH_T).withPatternTiming(Timing.OFF).timingInterval)
        assertEquals(TimingSettings(Timing.QUARTER, 50, true), free.withPatternTiming(Timing.QUARTER).timing)
        // Swing held to 50..75.
        assertEquals(75, d.withTiming(d.timing.withSwing(90)).timingSwing)
    }

    @Test
    fun `TIMING and the arp round-trip through library json`() {
        val chosen = AppSettings(
            timingInterval = Timing.SIXTEENTH_T,
            timingSwing = 62,
            timingQuantize = false,
            arpOn = true,
            arpOrder = ArpOrder.UP_DOWN,
            arpOctaves = 3,
            arpGate = 80,
            arpLatch = true,
        )
        assertEquals(chosen, AppSettings().withIndex(chosen.values().mapKeys { "app." + it.key }))
        assertEquals("updown", chosen.values()["arpOrder"])
        assertEquals(ArpSettings(ArpOrder.UP_DOWN, 3, 80, true), chosen.arp)
        // Values arc doesn't offer are left as they are.
        val odd = mapOf("app.timingSwing" to "80", "app.arpOctaves" to "4", "app.arpGate" to "5", "app.arpOrder" to "sideways", "app.timingInterval" to "1/64")
        assertEquals(AppSettings(), AppSettings().withIndex(odd))
        // The arp's helper holds octaves and gate to their ranges.
        assertEquals(ArpSettings(ArpOrder.DOWN, 3, 10, false), AppSettings().withArp(ArpSettings(ArpOrder.DOWN, 7, 0)).arp)
    }

    @Test
    fun `the scene change setting starts Immediate, under a key of its own, and round-trips by its word`() {
        assertEquals(SwitchTime.IMMEDIATE, AppSettings().sceneSwitch)
        assertEquals("now", AppSettings().values()["sceneSwitch"])
        for (t in SwitchTime.entries) {
            val chosen = AppSettings(sceneSwitch = t)
            assertEquals(t.id, chosen.values()["sceneSwitch"])
            assertEquals(chosen, AppSettings().withIndex(chosen.values().mapKeys { "app." + it.key }))
        }
        // A word arc doesn't know, from another version: left as it is.
        assertEquals(SwitchTime.BAR, AppSettings(sceneSwitch = SwitchTime.BAR).withIndex(mapOf("app.sceneSwitch" to "song")).sceneSwitch)
    }

    @Test
    fun `the factory kit starts on the EP-133's, and round-trips by its id`() {
        assertEquals(dev.arc.ep133.features.FactoryKit.EP133, AppSettings().factoryKit)
        val chosen = AppSettings(factoryKit = dev.arc.ep133.features.FactoryKit.EP1320)
        assertEquals("ep1320", chosen.values()["factoryKit"])
        assertEquals(chosen, AppSettings().withIndex(chosen.values().mapKeys { "app." + it.key }))
        // A kit arc doesn't know, from another version: left as it is.
        assertEquals(chosen, chosen.withIndex(mapOf("app.factoryKit" to "ep9")))
    }

    @Test
    fun `the skin starts on the EP-133's, and round-trips by its name`() {
        assertEquals(SkinChoice.EP133, AppSettings().skin)
        val chosen = AppSettings(skin = SkinChoice.EP1320)
        assertEquals("EP1320", chosen.values()["skin"])
        assertEquals(chosen, AppSettings().withIndex(chosen.values().mapKeys { "app." + it.key }))
        // A skin arc doesn't know, from another version: left as it is.
        assertEquals(chosen, chosen.withIndex(mapOf("app.skin" to "OP1")))
    }

    @Test
    fun `an earlier library json's single TIMING choice gives the interval and quantize`() {
        val eighth = AppSettings().withIndex(mapOf("app.patternTiming" to "1/8"))
        assertEquals(TimingSettings(Timing.EIGHTH, 50, true), eighth.timing)
        // OFF: free time, the interval as it was.
        val off = AppSettings(timingInterval = Timing.THIRTY_SECOND).withIndex(mapOf("app.patternTiming" to "off"))
        assertEquals(TimingSettings(Timing.THIRTY_SECOND, 50, false), off.timing)
        // The new keys, when there, win.
        val both = mapOf("app.patternTiming" to "1/8", "app.timingInterval" to "1/4", "app.timingQuantize" to "true")
        assertEquals(Timing.QUARTER, AppSettings().withIndex(both).patternTiming)
    }

    @Test
    fun `every setting has a kind, and its text reads as that kind`() {
        val chosen = AppSettings(keepLast = 10, liveKeys = true, keysNames = NoteNames.LETTERS, sampleThreshold = -20f, tourSteps = "connect,~pad", tourDone = true)
        for (s in listOf(AppSettings(), chosen)) {
            val values = SettingsStore.values(s)
            assertEquals(SettingsStore.KINDS.keys, values.keys)
            for ((k, v) in values) {
                when (SettingsStore.kind(k)) {
                    SettingsStore.Kind.INT -> assertTrue(v.toIntOrNull() != null, k)
                    SettingsStore.Kind.FLOAT -> assertTrue(v.toFloatOrNull() != null, k)
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
    fun `library json's tour settings come back, garbage stays out`() {
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
