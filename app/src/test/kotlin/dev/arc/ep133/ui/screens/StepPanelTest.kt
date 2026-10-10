package dev.arc.ep133.ui.screens

import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.STEP_GATES
import dev.arc.ep133.controller.StepNote
import dev.arc.ep133.controller.StepUi
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.Timing
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The STEP panel: what the strip shows, what lights on the pads and keys, and the knobs' places. */
class StepPanelTest {
    @Test
    fun `the strip shows one bar of steps, the cursor's`() {
        assertEquals(16, stripSteps(Timing.SIXTEENTH))
        assertEquals(24, stripSteps(Timing.SIXTEENTH_T))
        assertEquals(32, stripSteps(Timing.THIRTY_SECOND))
        assertEquals(1, stripSteps(Timing.WHOLE))
        // Two bars at 1/16, the cursor in the second: its page's steps.
        assertEquals(16..31, stripRange(StepUi(step = 20, count = 32, page = 1, interval = Timing.SIXTEENTH)))
        assertEquals(0..15, stripRange(StepUi(count = 32, interval = Timing.SIXTEENTH)))
    }

    @Test
    fun `a little more room before each beat inside a bar`() {
        val starts = (0 until 16).filter { beatStarts(it, Timing.SIXTEENTH) }
        assertEquals(listOf(4, 8, 12), starts)
        // The bar's first step, and steps a beat or longer, have none.
        assertFalse(beatStarts(16, Timing.SIXTEENTH))
        assertFalse(beatStarts(1, Timing.QUARTER))
    }

    @Test
    fun `the pads light the notes on the step, the keys their pitches`() {
        val ui = StepUi(group = 0, lit = setOf(9 to null, 6 to null, 9 to 7))
        assertEquals(setOf(9, 6), stepLitPads(ui, 0))
        // Another group shown: nothing lights.
        assertTrue(stepLitPads(ui, 1).isEmpty())
        // KEYS on the kick: its notes by pitch (from DO4); a pad hit lights no key.
        assertEquals(setOf(67), stepLitNotes(ui, PhysicalPad(0, 9)))
        assertTrue(stepLitNotes(ui, PhysicalPad(0, 10)).isEmpty())
        assertTrue(stepLitNotes(ui, null).isEmpty())
    }

    @Test
    fun `the note picked rings its pad or its key`() {
        val pad = StepUi(group = 0, picked = StepNote(PhysicalPad(0, 9), null))
        assertEquals(9, stepPickedPad(pad, 0))
        assertNull(stepPickedPad(pad, 2))
        assertNull(stepPickedNote(pad, PhysicalPad(0, 9)))
        val key = StepUi(group = 0, picked = StepNote(PhysicalPad(0, 9), 4))
        assertEquals(64, stepPickedNote(key, PhysicalPad(0, 9)))
        assertNull(stepPickedPad(key, 0))
    }

    @Test
    fun `LEN's knob sits on the gate table`() {
        assertEquals(STEP_GATES.indexOf(24).toFloat(), gateKnob(24))
        // A length between two of them sits on the nearer.
        assertEquals(STEP_GATES.indexOf(48).toFloat(), gateKnob(50))
        assertEquals(STEP_GATES.lastIndex.toFloat(), gateKnob(384))
    }

    @Test
    fun `NUDGE and CORRECT get a row of their own on a narrow panel`() {
        assertEquals(90.dp, stepDeckHeight(StepRowMin))
        assertEquals(132.dp, stepDeckHeight(StepRowMin - 1.dp))
    }
}
