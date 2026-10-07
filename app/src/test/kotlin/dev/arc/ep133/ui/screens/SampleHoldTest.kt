package dev.arc.ep133.ui.screens

import dev.arc.ep133.features.PhysicalPad
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** SAMPLE held: in the mode a pad latches a hands-free take, and a hold with no pad is a tap. */
class SampleHoldTest {
    private val calls = mutableListOf<String>()

    private fun fn(on: Boolean = true, handsFree: Boolean = false) = FunctionKeysUi(
        sample = SampleKeyUi(
            on = on,
            handsFree = handsFree,
            onSample = { calls += "sample" },
            onStop = { calls += "stop" },
            onLatchPad = { pad, at -> calls += "latch ${pad.label} at $at" },
        ),
    )

    @Test
    fun `a tap or a hold with no pad opens or closes the mode, a cancel does nothing`() {
        val hold = SampleHold()
        val fn = fn()
        hold.down()
        hold.up(fn)
        hold.down()
        hold.cancel()
        hold.up(fn)
        assertEquals(listOf("sample"), calls)
        assertFalse(hold.held)
    }

    @Test
    fun `held in the mode, a pad latches a take into it and the release adds nothing`() {
        val hold = SampleHold()
        val fn = fn()
        val pad7 = PhysicalPad(0, 9)
        // Not held: the pad is the pad's.
        assertFalse(hold.press(pad7, pad7, 5L, fn))
        hold.down()
        assertTrue(hold.held)
        assertTrue(hold.press(pad7, pad7, 42L, fn))
        assertTrue(hold.took(pad7))
        hold.up(fn)
        assertEquals(listOf("latch 7 at 42"), calls)
        // The pad let go of after SAMPLE: still SAMPLE's, once.
        assertTrue(hold.release(pad7))
        assertFalse(hold.release(pad7))
    }

    @Test
    fun `after the latch, the pads played while it is still held sound as ever`() {
        val hold = SampleHold()
        val fn = fn()
        val pad7 = PhysicalPad(0, 9)
        val pad8 = PhysicalPad(0, 10)
        hold.down()
        assertTrue(hold.press(pad7, pad7, 1L, fn))
        assertFalse(hold.press(pad8, pad8, 2L, fn))
        assertFalse(hold.took(pad8))
        hold.up(fn)
        assertEquals(listOf("latch 7 at 1"), calls)
    }

    @Test
    fun `during a hands-free take a tap stops it and a pad held with SAMPLE plays`() {
        val hold = SampleHold()
        val fn = fn(handsFree = true)
        val pad = PhysicalPad(2, 4)
        hold.down()
        assertFalse(hold.press(pad, pad, 1L, fn))
        hold.up(fn)
        assertEquals(listOf("stop"), calls)
    }

    @Test
    fun `out of the mode a pad held with SAMPLE plays, and the release opens the mode`() {
        val hold = SampleHold()
        val fn = fn(on = false)
        val pad = PhysicalPad(1, 0)
        hold.down()
        assertFalse(hold.press(pad, pad, 1L, fn))
        hold.up(fn)
        assertEquals(listOf("sample"), calls)
    }

    @Test
    fun `without the key nothing is taken`() {
        val hold = SampleHold()
        val pad = PhysicalPad(0, 0)
        hold.down()
        assertFalse(hold.press(pad, pad, 1L, FunctionKeysUi()))
        hold.up(FunctionKeysUi())
        assertTrue(calls.isEmpty())
    }

    @Test
    fun `an unsure press latches only once kept`() {
        val hold = SampleHold()
        val fn = fn()
        val pad = PhysicalPad(0, 9)
        hold.down()
        assertTrue(hold.press(pad, pad, 7L, fn, unsure = true))
        assertTrue(calls.isEmpty())
        assertTrue(hold.kept(pad, fn))
        assertEquals(listOf("latch 7 at 7"), calls)
        // Kept, it is as any latch: SAMPLE's release adds nothing, the pad's lift is SAMPLE's.
        hold.up(fn)
        assertTrue(hold.release(pad))
        assertEquals(listOf("latch 7 at 7"), calls)
    }

    @Test
    fun `an unsure press that turns into a scroll latches nothing, and SAMPLE's release is a tap again`() {
        val hold = SampleHold()
        val fn = fn()
        val pad = PhysicalPad(0, 9)
        hold.down()
        assertTrue(hold.press(pad, pad, 7L, fn, unsure = true))
        // The scroll cuts it: the press stays SAMPLE's (nothing sounds), but nothing latches.
        assertTrue(hold.release(pad))
        assertFalse(hold.kept(pad, fn))
        hold.up(fn)
        assertEquals(listOf("sample"), calls)
    }

    @Test
    fun `an unsure press kept after the mode closed latches nothing`() {
        val hold = SampleHold()
        val pad = PhysicalPad(0, 9)
        hold.down()
        assertTrue(hold.press(pad, pad, 7L, fn(), unsure = true))
        hold.kept(pad, fn(on = false))
        assertTrue(calls.isEmpty())
    }
}
