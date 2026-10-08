package dev.arc.ep133.ui.screens

import androidx.compose.ui.input.pointer.PointerId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Live's cards: where a swipe let go of lands, and the peeks as they turn. */
class LiveCardsTest {
    @Test
    fun `a swipe past 30 percent of the way turns to the other card, short of it springs back`() {
        assertEquals(1f, cardTarget(from = 0f, progress = 0.3f, velocity = 0f))
        assertEquals(0f, cardTarget(from = 0f, progress = 0.29f, velocity = 0f))
        assertEquals(0f, cardTarget(from = 1f, progress = 0.7f, velocity = 0f))
        assertEquals(1f, cardTarget(from = 1f, progress = 0.71f, velocity = 0f))
    }

    @Test
    fun `a fling lands where it is flung, however short`() {
        // Right to left opens SAMPLE; left to right goes back to the pads.
        assertEquals(1f, cardTarget(from = 0f, progress = 0.05f, velocity = -1000f))
        assertEquals(0f, cardTarget(from = 1f, progress = 0.95f, velocity = 1200f))
        // Slower than a fling, the distance decides.
        assertEquals(0f, cardTarget(from = 0f, progress = 0.1f, velocity = -999f))
        // Flung back against a long drag: back it goes.
        assertEquals(0f, cardTarget(from = 0f, progress = 0.8f, velocity = 1500f))
    }

    @Test
    fun `a peek shows at rest and is gone a quarter of the way into a turn`() {
        assertEquals(1f, peekShown(0f))
        assertEquals(0.5f, peekShown(0.125f))
        assertEquals(0f, peekShown(0.25f))
        assertEquals(0f, peekShown(0.6f))
    }

    @Test
    fun `a turn dropped mid-swipe (the phone turned) leaves the cards where they rested`() {
        val finger = PointerId(1L)
        val turn = CardTurn(0f)
        turn.take(finger)
        turn.dragTo(0.4f)
        assertTrue(turn.dragging)
        assertTrue(turn.took(finger))
        assertEquals(0.4f, turn.progress)
        turn.dropped()
        // The new layout's cards can settle them again: no finger holds them.
        assertFalse(turn.dragging)
        assertFalse(turn.took(finger))
        assertEquals(0f, turn.progress)
        assertEquals(0f, turn.page)
    }
}
