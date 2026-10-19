package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class OfflinePadSettingsTest {
    private val pitched = OfflinePadSetting(1, 0, 5, 12, PadSettings(pitch = 1.5, level = 80, mode = PlayMode.KEY, release = 15), PadSettings.DEFAULT)
    private val trimmed = OfflinePadSetting(
        1, 1, 2, 140,
        PadSettings(start = 100, end = 4000, pan = -8, muteGroup = true, midiChannel = 9, timeMode = "bpm"),
        PadSettings(pan = 3),
        frames = 4800,
    )

    @Test
    fun `one change per pad, the latest last, and a drop takes it back`() {
        var p = OfflinePadSettings.EMPTY.put(pitched).put(trimmed)
        assertEquals(2, p.size)
        assertEquals(pitched, p.at(1, 0, 5))
        assertNull(p.at(2, 0, 5)) // another project's pad
        assertNull(p.at(1, 1, 5)) // another group's
        // New settings on the same pad replace its change and move it last.
        val louder = pitched.copy(settings = pitched.settings.copy(level = 100))
        p = p.put(louder)
        assertEquals(listOf(trimmed, louder), p.list)
        p = p.drop(1, 0, 5)
        assertEquals(listOf(trimmed), p.list)
        assertEquals(p, p.drop(1, 0, 5)) // nothing there: no change
    }

    @Test
    fun `a later turn on the same sound keeps the first turn's base, another sound starts over`() {
        val first = OfflinePadSettings.EMPTY.put(trimmed)
        // The sheet showed the first turn's settings by then; that base is not kept.
        val again = trimmed.copy(settings = trimmed.settings.copy(level = 50), base = trimmed.settings, frames = 5000)
        val p = first.put(again)
        assertEquals(listOf(again.copy(base = trimmed.base)), p.list)
        assertEquals(5000L, p.at(1, 1, 2)!!.frames)
        // Another sound on the pad: the whole entry is the new one.
        val other = OfflinePadSetting(1, 1, 2, 141, PadSettings(level = 20), PadSettings(level = 90))
        assertEquals(listOf(other), p.put(other).list)
        assertNull(p.put(other).at(1, 1, 2)!!.frames)
    }

    @Test
    fun `byPad gives each changed pad's settings`() {
        val p = OfflinePadSettings.EMPTY.put(pitched).put(trimmed)
        assertEquals(
            mapOf(Triple(1, 0, 5) to pitched.settings, Triple(1, 1, 2) to trimmed.settings),
            p.byPad(),
        )
        assertEquals(listOf(Triple(1, 0, 5), Triple(1, 1, 2)), p.byPad().keys.toList())
        assertEquals(emptyMap<Triple<Int, Int, Int>, PadSettings>(), OfflinePadSettings.EMPTY.byPad())
    }

    @Test
    fun `the changes survive the round trip, and junk reads as nothing`() {
        val p = OfflinePadSettings.EMPTY.put(pitched).put(trimmed)
        assertEquals(
            """{"v":1,"pads":[{"project":1,"group":0,"pad":5,"slot":12,"settings":{"pitch":1.5,"level":80,"pan":0,"mode":"key","start":0,""" +
                """"attack":0,"release":15,"muteGroup":false,"midiChannel":0,"timeMode":"off"},""" +
                """"base":{"pitch":0,"level":100,"pan":0,"mode":"oneshot","start":0,""" +
                """"attack":0,"release":255,"muteGroup":false,"midiChannel":0,"timeMode":"off"}},""" +
                """{"project":1,"group":1,"pad":2,"slot":140,"settings":{"pitch":0,"level":100,"pan":-8,"mode":"oneshot","start":100,"end":4000,""" +
                """"attack":0,"release":255,"muteGroup":true,"midiChannel":9,"timeMode":"bpm"},""" +
                """"base":{"pitch":0,"level":100,"pan":3,"mode":"oneshot","start":0,""" +
                """"attack":0,"release":255,"muteGroup":false,"midiChannel":0,"timeMode":"off"},"frames":4800}]}""",
            p.toJson(),
        )
        assertEquals(p, OfflinePadSettings.fromJson(p.toJson()))
        assertEquals(OfflinePadSettings.EMPTY, OfflinePadSettings.fromJson(OfflinePadSettings.EMPTY.toJson()))
        assertNull(OfflinePadSettings.fromJson("not json"))
        assertNull(OfflinePadSettings.fromJson("[]"))
        assertNull(OfflinePadSettings.fromJson("""{"v":2,"pads":[]}"""))
        assertEquals(OfflinePadSettings.EMPTY, OfflinePadSettings.fromJson("""{"v":1}"""))
    }

    @Test
    fun `entries it can't read are skipped, and settings it can't read are the defaults, clamped`() {
        val text = """{"v":1,"pads":[
            {"project":1,"group":0,"pad":5,"slot":12,"settings":{"pitch":1.5,"level":80,"mode":"key","release":15},"base":{}},
            {"project":1,"group":4,"pad":6,"slot":12,"settings":{}},
            {"project":0,"group":0,"pad":6,"slot":12,"settings":{}},
            {"project":1,"group":0,"pad":"6","slot":12,"settings":{}},
            {"project":1,"group":0,"pad":6,"slot":12},
            {"project":1,"group":0,"pad":6,"slot":12,"settings":[]},
            {"project":1,"group":0,"pad":7,"settings":{}},
            {"project":1,"group":0,"pad":7,"slot":"12","settings":{}},
            {"project":1,"group":0,"pad":7,"slot":0,"settings":{}},
            {"project":1,"group":0,"pad":7,"slot":1000,"settings":{}},
            7, null,
            {"project":1,"group":1,"pad":3,"slot":9,"settings":{"pitch":"x","level":300,"mode":"loop","end":-4},"frames":"10"},
            {"project":1,"group":2,"pad":4,"slot":9,"settings":{"level":60},"base":[],"frames":0}
        ]}"""
        val p = OfflinePadSettings.fromJson(text)!!
        assertEquals(
            listOf(
                pitched,
                // No base: the settings; frames unreadable: unknown.
                OfflinePadSetting(1, 1, 3, 9, PadSettings(level = 100, end = 1), PadSettings(level = 100, end = 1)),
                OfflinePadSetting(1, 2, 4, 9, PadSettings(level = 60), PadSettings(level = 60)),
            ),
            p.list,
        )
    }
}
