package dev.arc.ep133.ui.screens

import dev.arc.ep133.controller.punchSlotForPad
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.text.MirrorText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** FX held: what each pad punches in, and how deep a touch goes. */
class PunchPadsTest {
    private fun near(expected: Float, actual: Float) = assertEquals(expected, actual, 1e-6f)

    @Test
    fun `each pad shows its punch-in where its label is`() {
        // By the label printed on the pad, as the EP-133's punch-ins are.
        val shown = PadNotes.LABELS.indices.associate { o -> PadNotes.LABELS[o] to MirrorText.punchName(punchSlotForPad(o)).uppercase() }
        assertEquals(
            mapOf(
                "7" to "TREMOLO", "8" to "OCT ↓", "9" to "DECIMATE",
                "4" to "LPF", "5" to "HPF", "6" to "SEND FX",
                "1" to "REPEAT", "2" to "TAPE STOP", "3" to "FILTER LFO",
                "." to "PITCH RND", "0" to "SLICE", "ENTER" to "STUTTER",
            ),
            shown,
        )
    }

    @Test
    fun `with no pressure the depth is how high up the pad the finger is`() {
        near(1f, yDepth(0f, 200f))
        near(PUNCH_FLOOR, yDepth(200f, 200f))
        near(1f - 0.5f * (1f - PUNCH_FLOOR), yDepth(100f, 200f))
        // Slid off the pad, it stays at the ends; a pad with no height yet is all the way.
        near(1f, yDepth(-40f, 200f))
        near(PUNCH_FLOOR, yDepth(260f, 200f))
        near(1f, yDepth(10f, 0f))
    }

    @Test
    fun `a pressure that never changes is no pressure`() {
        val sense = PressureSense()
        // Many devices report 1.0 for every touch: the depth stays the finger's place.
        repeat(5) { near(yDepth(50f, 200f), sense.depth(1f, 50f, 200f)) }
        assertFalse(sense.varies)
        // A jitter round one value isn't pressure either.
        sense.see(1.02f)
        sense.see(0.99f)
        assertFalse(sense.varies)
        // Nor is a pressure that isn't a number.
        sense.see(Float.NaN)
        near(yDepth(150f, 200f), sense.depth(Float.NaN, 150f, 200f))
        assertFalse(sense.varies)
    }

    @Test
    fun `pressures that vary set the depth within the range seen`() {
        val sense = PressureSense()
        near(yDepth(20f, 200f), sense.depth(0.3f, 20f, 200f))
        // Spread past PRESSURE_SPREAD: from now on the pressure is the depth, wherever the finger is.
        near(1f, sense.depth(0.7f, 180f, 200f))
        assertTrue(sense.varies)
        near(PUNCH_FLOOR, sense.depth(0.3f, 0f, 200f))
        near(PUNCH_FLOOR + 0.5f * (1f - PUNCH_FLOOR), sense.depth(0.5f, 0f, 200f))
        // A harder press than any yet is all the way, and widens the range for the next.
        near(1f, sense.depth(1.1f, 0f, 200f))
        near(PUNCH_FLOOR + 0.5f * (1f - PUNCH_FLOOR), sense.depth(0.7f, 0f, 200f))
    }
}
