package dev.arc.ep133.ui

import androidx.compose.ui.geometry.Rect
import dev.arc.ep133.ui.components.TourPlace
import dev.arc.ep133.ui.components.TourPlacement
import dev.arc.ep133.ui.components.placeTourCard
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Where the tour's card goes (dp). The pad grid in Live's one-group view
 * starts under the top bar and the display line (about 124dp down) and leaves
 * about 128dp below it for the mode row and the A-D keys; a compact card
 * (PAD, HEAR) is about 160dp tall, its heading alone about 70dp.
 */
class TourPlaceTest {
    private val compact = 160f
    private val head = 70f

    private fun grid(vw: Float, vh: Float, safeBottom: Float = 0f) = Rect(30f, 124f, vw - 32f, vh - safeBottom - 128f)

    private fun place(vw: Float, vh: Float, target: Rect?, card: Float = compact, safeTop: Float = 0f, safeBottom: Float = 0f) =
        placeTourCard(vw, vh, target, { card }, { head }, safeTop, safeBottom)

    /** On screen, inside the margins and the system bars. */
    private fun assertOnScreen(p: TourPlacement, vw: Float, vh: Float, safeTop: Float = 0f, safeBottom: Float = 0f) {
        assertTrue(p.card.left >= TourPlace.MARGIN - 0.01f && p.card.right <= vw - TourPlace.MARGIN + 0.01f, "$p")
        assertTrue(p.card.top >= safeTop + TourPlace.MARGIN - 0.01f && p.card.bottom <= vh - safeBottom - TourPlace.MARGIN + 0.01f, "$p")
    }

    /** Docked over the grid's bottom: the cut-out stops above the card, and at most one row of pads is covered. */
    private fun assertDockedBelow(p: TourPlacement, grid: Rect) {
        assertNotNull(p.holeClip)
        val clip = p.holeClip!!
        assertEquals(p.card.top - TourPlace.GAP, clip.bottom, 0.01f)
        assertTrue(grid.bottom - clip.bottom <= grid.height / TourPlace.PAD_ROWS + 0.01f, "$p")
    }

    @Test
    fun `393x852 docks the compact card over the last row`() {
        val g = grid(393f, 852f)
        val p = place(393f, 852f, g)
        assertOnScreen(p, 393f, 852f)
        assertEquals(361f, p.card.width, 0.01f)
        assertEquals(852f - TourPlace.MARGIN, p.card.bottom, 0.01f)
        assertFalse(p.headingOnly)
        assertDockedBelow(p, g)
    }

    @Test
    fun `360x780 docks the compact card over the last row`() {
        val g = grid(360f, 780f)
        val p = place(360f, 780f, g)
        assertOnScreen(p, 360f, 780f)
        assertEquals(328f, p.card.width, 0.01f)
        assertFalse(p.headingOnly)
        assertDockedBelow(p, g)
    }

    @Test
    fun `360x668 docks the compact card over the last row`() {
        val g = grid(360f, 668f)
        val p = place(360f, 668f, g)
        assertOnScreen(p, 360f, 668f)
        assertFalse(p.headingOnly)
        assertDockedBelow(p, g)
    }

    @Test
    fun `393x852 with a 48dp navigation bar keeps above it`() {
        val g = grid(393f, 852f, safeBottom = 48f)
        val p = place(393f, 852f, g, safeTop = 24f, safeBottom = 48f)
        assertOnScreen(p, 393f, 852f, 24f, 48f)
        assertEquals(852f - 48f - TourPlace.MARGIN, p.card.bottom, 0.01f)
        assertDockedBelow(p, g)
    }

    @Test
    fun `360x600 clips the cut-out by one row`() {
        val g = grid(360f, 600f)
        val p = place(360f, 600f, g)
        assertOnScreen(p, 360f, 600f)
        assertFalse(p.headingOnly)
        assertDockedBelow(p, g)
        assertTrue(p.holeClip!!.bottom < g.bottom)
    }

    @Test
    fun `360x600 with large text shows only the heading`() {
        val g = grid(360f, 600f)
        val p = place(360f, 600f, g, card = 260f)
        assertOnScreen(p, 360f, 600f)
        assertTrue(p.headingOnly)
        assertEquals(head, p.card.height, 0.01f)
        assertDockedBelow(p, g)
    }

    @Test
    fun `640x360 goes beside a grid that leaves room`() {
        val g = Rect(30f, 70f, 330f, 330f)
        val p = place(640f, 360f, g)
        assertOnScreen(p, 640f, 360f)
        assertTrue(p.card.left >= g.right + TourPlace.GAP - 0.01f, "$p")
        assertTrue(p.card.width >= TourPlace.MIN_SIDE_WIDTH)
        assertNull(p.holeClip)
        assertFalse(p.headingOnly)
    }

    @Test
    fun `640x360 with a wide grid shows only the heading`() {
        val g = Rect(90f, 124f, 548f, 232f)
        val p = place(640f, 360f, g)
        assertOnScreen(p, 640f, 360f)
        assertTrue(p.headingOnly)
    }

    @Test
    fun `a grid with room below gets the card below it`() {
        val g = Rect(30f, 124f, 361f, 500f)
        val p = place(393f, 852f, g)
        assertEquals(g.bottom + TourPlace.GAP, p.card.top, 0.01f)
        assertNull(p.holeClip)
    }

    @Test
    fun `a key at the top gets the card below it, clear of its tag`() {
        val key = Rect(250f, 12f, 294f, 56f)
        val p = place(393f, 852f, key, card = 300f)
        assertEquals(key.bottom + TourPlace.TAG_ROOM, p.card.top, 0.01f)
        assertNull(p.holeClip)
    }

    @Test
    fun `no target starts at 45 percent and docks when too tall`() {
        assertEquals(852f * 0.45f, place(393f, 852f, null, card = 300f).card.top, 0.01f)
        val tall = place(393f, 852f, null, card = 600f)
        assertEquals(852f - TourPlace.MARGIN, tall.card.bottom, 0.01f)
        // Taller than the screen: capped (the card scrolls).
        val capped = place(360f, 600f, null, card = 900f)
        assertEquals(600f - 2 * TourPlace.MARGIN, capped.card.height, 0.01f)
        assertOnScreen(capped, 360f, 600f)
    }

    @Test
    fun `done docks to the bottom, clear of its tags`() {
        val done = placeTourCard(393f, 852f, null, { 260f }, { head }, safeBottom = 48f, dockBottom = true)
        assertEquals(852f - 48f - TourPlace.MARGIN, done.card.bottom, 0.01f)
        assertOnScreen(done, 393f, 852f, safeBottom = 48f)
    }

    @Test
    fun `the card is never wider than 400`() {
        assertEquals(400f, place(840f, 900f, null).card.width, 0.01f)
    }
}
