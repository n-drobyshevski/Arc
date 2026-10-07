package dev.arc.ep133.controller

import dev.arc.ep133.features.PadSettings
import dev.arc.ep133.features.PlayMode
import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.VoiceMode
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** A pad's EP-133 settings, as the phone plays them. */
class VoiceShapeTest {
    @Test
    fun `the settings carry over - pitch, level, pan, trim, envelope ticks, mute group by pad group`() {
        val s = PadSettings(pitch = -2.5, level = 50, pan = -8, mode = PlayMode.KEY, start = 100, end = 900, attack = 3, release = 40, muteGroup = true)
        val v = voiceShape(s, group = 2)
        assertEquals(-2.5, v.semitones)
        assertEquals(0.5f, v.gain)
        assertEquals(-8, v.pan)
        assertEquals(100, v.start)
        assertEquals(900, v.end)
        assertEquals(3 * PadSettings.ENV_MS_PER_TICK, v.attackMs)
        assertEquals(40 * PadSettings.ENV_MS_PER_TICK, v.releaseMs)
        assertEquals(VoiceMode.KEY, v.mode)
        assertEquals(3, v.muteGroup)
    }

    @Test
    fun `the defaults play the whole sample once, and release never fades quicker than a pad always has`() {
        val v = voiceShape(PadSettings.DEFAULT.copy(release = 0), group = 0)
        assertEquals(VoiceMode.ONESHOT, v.mode)
        assertEquals(0, v.start)
        assertEquals(Int.MAX_VALUE, v.end)
        assertEquals(VoiceMixer.FADE_MS, v.releaseMs)
        assertEquals(0, v.muteGroup)
    }

    @Test
    fun `KEYS plays LEGATO as held notes, each note being its own voice`() {
        val s = PadSettings.DEFAULT.withMode(PlayMode.LEGATO)
        assertEquals(VoiceMode.LEGATO, voiceShape(s, 0).mode)
        assertEquals(VoiceMode.GATE, voiceShape(s, 0, keys = true).mode)
    }
}
