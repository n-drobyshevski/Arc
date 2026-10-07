package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class OfflinePadSettingsTest {
    private val pitched = OfflinePadSetting(1, 0, 5, PadSettings(pitch = 1.5, level = 80, mode = PlayMode.KEY, release = 15))
    private val trimmed = OfflinePadSetting(1, 1, 2, PadSettings(start = 100, end = 4000, pan = -8, muteGroup = true, midiChannel = 9, timeMode = "bpm"))

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
    fun `the changes survive the round trip, and junk reads as nothing`() {
        val p = OfflinePadSettings.EMPTY.put(pitched).put(trimmed)
        assertEquals(
            """{"v":1,"pads":[{"project":1,"group":0,"pad":5,"settings":{"pitch":1.5,"level":80,"pan":0,"mode":"key","start":0,""" +
                """"attack":0,"release":15,"muteGroup":false,"midiChannel":0,"timeMode":"off"}},""" +
                """{"project":1,"group":1,"pad":2,"settings":{"pitch":0,"level":100,"pan":-8,"mode":"oneshot","start":100,"end":4000,""" +
                """"attack":0,"release":255,"muteGroup":true,"midiChannel":9,"timeMode":"bpm"}}]}""",
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
            {"project":1,"group":0,"pad":5,"settings":{"pitch":1.5,"level":80,"mode":"key","release":15}},
            {"project":1,"group":4,"pad":6,"settings":{}},
            {"project":0,"group":0,"pad":6,"settings":{}},
            {"project":1,"group":0,"pad":"6","settings":{}},
            {"project":1,"group":0,"pad":6},
            {"project":1,"group":0,"pad":6,"settings":[]},
            7, null,
            {"project":1,"group":1,"pad":3,"settings":{"pitch":"x","level":300,"mode":"loop","end":-4}}
        ]}"""
        val p = OfflinePadSettings.fromJson(text)!!
        assertEquals(listOf(pitched, OfflinePadSetting(1, 1, 3, PadSettings(level = 100, end = 1))), p.list)
    }
}
