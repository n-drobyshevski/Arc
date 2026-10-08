package dev.arc.ep133.ui.screens

import androidx.compose.ui.input.pointer.PointerId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The SAMPLE panel: when a swipe opens or closes it, its motion's timeline, and the peek as it opens. */
class SamplePanelTest {
    @Test
    fun `a swipe 30 percent of the way across, or flung, opens or closes the panel`() {
        assertTrue(swipeLands(travel = 0.3f, velocity = 0f))
        assertFalse(swipeLands(travel = 0.29f, velocity = 0f))
        // Flung the way that does something, however short.
        assertTrue(swipeLands(travel = 0.05f, velocity = 1000f))
        assertFalse(swipeLands(travel = 0.1f, velocity = 999f))
        // Flung back the other way: nothing.
        assertFalse(swipeLands(travel = 0.2f, velocity = -1500f))
    }

    @Test
    fun `the panel unrolls in 450 ms, the display from 120, the rows from 200 and 270`() {
        assertEquals(720, PANEL_OPEN_MS)
        val at = { ms: Int -> ms.toFloat() / PANEL_OPEN_MS }
        // Nothing has moved at the start; all of it has at the end.
        for (start in listOf(0, PANEL_DISPLAY_AT, PANEL_ROW1_AT, PANEL_ROW2_AT)) {
            assertEquals(0f, panelPhase(0f, start))
            assertEquals(1f, panelPhase(1f, start), 1e-4f)
        }
        // The panel itself is done at 450 ms, the second row still fading in.
        assertEquals(1f, panelPhase(at(450), 0), 1e-4f)
        assertTrue(panelPhase(at(450), PANEL_ROW2_AT) < 1f)
        // Each part waits for its start.
        assertEquals(0f, panelPhase(at(120), PANEL_DISPLAY_AT))
        assertTrue(panelPhase(at(121), PANEL_DISPLAY_AT) > 0f)
        assertEquals(0f, panelPhase(at(200), PANEL_ROW1_AT))
        assertEquals(0f, panelPhase(at(270), PANEL_ROW2_AT))
        // Eased out: well past halfway at half its time.
        assertTrue(panelPhase(at(225), 0) > 0.8f)
        // In order, at any moment.
        val mid = at(300)
        assertTrue(panelPhase(mid, 0) > panelPhase(mid, PANEL_DISPLAY_AT))
        assertTrue(panelPhase(mid, PANEL_DISPLAY_AT) > panelPhase(mid, PANEL_ROW1_AT))
        assertTrue(panelPhase(mid, PANEL_ROW1_AT) > panelPhase(mid, PANEL_ROW2_AT))
    }

    @Test
    fun `closing, the panel rolls up slowing to a stop rather than shutting in the last frames`() {
        val frame = 16f / PANEL_CLOSE_MS
        val unroll = { f: Float -> panelPhase(1f - PanelCloseEasing.transform(f.coerceAtMost(1f)), 0) }
        // The controls go first: the second row is gone while the panel is still nearly all there.
        val early = 1f - PanelCloseEasing.transform(0.35f)
        assertEquals(0f, panelPhase(early, PANEL_ROW2_AT))
        assertTrue(panelPhase(early, 0) > 0.9f)
        // No frame moves it more than a tenth of the way, and the last hardly at all.
        var f = 0f
        while (f < 1f) {
            assertTrue(unroll(f) - unroll(f + frame) < 0.1f, "at $f")
            f += frame
        }
        assertTrue(unroll(1f - frame) < 0.01f)
        assertEquals(0f, unroll(1f))
    }

    @Test
    fun `the panel opens or closes from where it is, and holds still for a screenshot`() {
        val shut = SamplePanel(0f)
        assertFalse(shut.open)
        assertEquals(0f, shut.unroll)
        assertTrue(SamplePanel(1f).open)
        val caught = SamplePanel(0.45f, fixed = true)
        assertEquals(0.45f, caught.progress)
        assertTrue(caught.unroll > caught.display)
        assertTrue(caught.row(second = false) > caught.row(second = true))
    }

    @Test
    fun `a finger the swipe takes is the swipe's until it lifts`() {
        val finger = PointerId(1L)
        val panel = SamplePanel(0f)
        assertFalse(panel.took(finger))
        panel.take(finger)
        assertTrue(panel.took(finger))
        panel.lifted(finger)
        assertFalse(panel.took(finger))
    }

    @Test
    fun `the peek shows while the panel is closed and is gone a quarter of the way into opening`() {
        assertEquals(1f, peekShown(0f))
        assertEquals(0.5f, peekShown(0.125f))
        assertEquals(0f, peekShown(0.25f))
        assertEquals(0f, peekShown(0.6f))
    }
}
