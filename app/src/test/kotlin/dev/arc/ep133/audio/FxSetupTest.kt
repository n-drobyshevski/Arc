package dev.arc.ep133.audio

import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.VoiceShape
import dev.arc.ep133.formats.fx.FxControl
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The FX settings Live keeps for its next output, and what replaying them does to a mixer. */
class FxSetupTest {
    private data class Sent(val what: Int, val index: Int, val x: Float, val y: Float)

    private fun FxSetup.sent(): List<Sent> = buildList { replay { w, i, x, y -> add(Sent(w, i, x, y)) } }

    @Test
    fun `nothing sent, nothing replayed`() {
        assertEquals(emptyList<Sent>(), FxSetup().sent())
    }

    @Test
    fun `each setting's last value, the effect first`() {
        val fx = FxSetup()
        fx.record(FxControl.TEMPO, 0, 140f, 0f)
        fx.record(FxControl.SEND, 2, 0.3f, 0f)
        fx.record(FxControl.SEND, 2, 0.6f, 0f)
        fx.record(FxControl.SEND, 0, 0.1f, 0f)
        fx.record(FxControl.FX_TYPE, FxControl.DELAY, 0.2f, 0.4f)
        fx.record(FxControl.COMP, 1, 0.7f, 0.1f)
        fx.record(FxControl.SIDECHAIN, 0b0110, 0.3f, 0.5f)
        fx.record(FxControl.SIDECHAIN, 0, 0.3f, 0.5f)
        assertEquals(
            listOf(
                Sent(FxControl.FX_TYPE, FxControl.DELAY, 0.2f, 0.4f),
                Sent(FxControl.SEND, 0, 0.1f, 0f),
                Sent(FxControl.SEND, 2, 0.6f, 0f),
                Sent(FxControl.COMP, 1, 0.7f, 0.1f),
                Sent(FxControl.SIDECHAIN, 0, 0.3f, 0.5f),
                Sent(FxControl.TEMPO, 0, 140f, 0f),
            ),
            fx.sent(),
        )
    }

    @Test
    fun `a drag moves the effect's knobs, a new type brings its own`() {
        val fx = FxSetup()
        // Knobs before any type: the effect is still none.
        fx.record(FxControl.FX_XY, 0, 0.9f, 0.8f)
        assertEquals(listOf(Sent(FxControl.FX_TYPE, FxControl.NONE, 0.9f, 0.8f)), fx.sent())
        fx.record(FxControl.FX_TYPE, FxControl.REVERB, 0.5f, 0.5f)
        fx.record(FxControl.FX_XY, 0, 0.25f, 0.75f)
        assertEquals(listOf(Sent(FxControl.FX_TYPE, FxControl.REVERB, 0.25f, 0.75f)), fx.sent())
        // The type's own knobs win over the older drag.
        fx.record(FxControl.FX_TYPE, FxControl.CHORUS, 0.1f, 0.2f)
        assertEquals(listOf(Sent(FxControl.FX_TYPE, FxControl.CHORUS, 0.1f, 0.2f)), fx.sent())
    }

    @Test
    fun `punch-ins and unknown commands aren't kept`() {
        val fx = FxSetup()
        fx.record(FxControl.PUNCH, FxControl.STUTTER, 1f, 0f)
        fx.record(FxControl.SEND, 4, 1f, 0f)
        fx.record(FxControl.SEND, -1, 1f, 0f)
        fx.record(99, 0, 1f, 1f)
        assertEquals(emptyList<Sent>(), fx.sent())
    }

    @Test
    fun `a mixer given the replay plays as one given the settings as they ended`() {
        val history = listOf(
            Sent(FxControl.FX_TYPE, FxControl.DISTORTION, 0.8f, 0.5f),
            Sent(FxControl.SEND, 1, 0.4f, 0f),
            Sent(FxControl.FX_XY, 0, 0.6f, 0.3f),
            Sent(FxControl.SEND, 1, 0.9f, 0f),
            Sent(FxControl.COMP, 1, 0.5f, 0.5f),
            Sent(FxControl.PUNCH, FxControl.DECIMATOR, 1f, 0f),
        )
        val fx = FxSetup()
        for (c in history) fx.record(c.what, c.index, c.x, c.y)
        val replayed = VoiceMixer(48000)
        fx.replay(replayed::control)
        val settled = VoiceMixer(48000)
        settled.control(FxControl.FX_TYPE, FxControl.DISTORTION, 0.6f, 0.3f)
        settled.control(FxControl.SEND, 1, 0.9f, 0f)
        settled.control(FxControl.COMP, 1, 0.5f, 0.5f)
        val dry = VoiceMixer(48000)
        val pcm = ShortArray(4800) { if (it % 40 < 20) 12000 else -12000 }
        val outs = listOf(replayed, settled, dry).map { m ->
            m.start("a", pcm, 1, 48000, 0, 0L, VoiceShape(bus = 1))
            ShortArray(2 * 2048).also { m.render(it, 2048) }
        }
        assertTrue(outs[0].contentEquals(outs[1]))
        assertFalse(outs[0].contentEquals(outs[2]))
    }
}
