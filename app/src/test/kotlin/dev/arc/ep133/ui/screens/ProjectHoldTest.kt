package dev.arc.ep133.ui.screens

import dev.arc.ep133.features.PhysicalPad
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** PROJECT held: a pad printed 1 to 9 picks a project, and the release decides the rest. */
class ProjectHoldTest {
    private val calls = mutableListOf<String>()
    private val fn = FunctionKeysUi(
        onProject = { calls += "next" },
        onPickProject = { calls += "sheet" },
        onSelectProject = { calls += "project $it" },
    )

    @Test
    fun `a tap steps on, a long hold opens the sheet, a cancel does nothing`() {
        val hold = ProjectHold()
        hold.down()
        hold.up(long = false, fn)
        hold.down()
        hold.up(long = true, fn)
        hold.down()
        hold.cancel()
        hold.up(long = false, fn)
        assertEquals(listOf("next", "sheet"), calls)
        assertFalse(hold.held)
    }

    @Test
    fun `held, a pad printed 1 to 9 picks that project and the release adds nothing`() {
        val hold = ProjectHold()
        val pad7 = PhysicalPad(0, 9)
        assertEquals("7", pad7.label)
        // Not held: the pad is the pad's.
        assertFalse(hold.press(pad7, pad7.label, fn))
        hold.down()
        assertTrue(hold.held)
        assertTrue(hold.press(pad7, pad7.label, fn))
        assertTrue(hold.took(pad7))
        hold.up(long = true, fn)
        assertEquals(listOf("project 7"), calls)
        // The pad let go of after PROJECT: still PROJECT's, once.
        assertTrue(hold.release(pad7))
        assertFalse(hold.release(pad7))
    }

    @Test
    fun `held, the dot, 0 and ENTER stay still and don't count as a pick`() {
        val hold = ProjectHold()
        hold.down()
        for (offset in 0..2) {
            val pad = PhysicalPad(1, offset)
            assertTrue(hold.press(pad, pad.label, fn), pad.label)
            hold.release(pad)
        }
        hold.up(long = false, fn)
        assertEquals(listOf("next"), calls)
    }

    @Test
    fun `a KEYS key picks by the digit of the pad in its place`() {
        val hold = ProjectHold()
        hold.down()
        assertTrue(hold.press(keysKey(3), padDigit(3), fn))
        hold.up(long = false, fn)
        assertEquals(listOf("project 1"), calls)
        assertTrue(hold.release(keysKey(3)))
    }
}
