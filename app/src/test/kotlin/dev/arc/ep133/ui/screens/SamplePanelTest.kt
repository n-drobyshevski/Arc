package dev.arc.ep133.ui.screens

import androidx.compose.animation.core.TweenSpec
import androidx.compose.runtime.MonotonicFrameClock
import androidx.compose.ui.input.pointer.PointerId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.coroutines.resume

/** The SAMPLE panel: its motion's timeline, and a swipe on the pads. */
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

    /** The timeline [ms] into a tap's opening. */
    private fun opened(ms: Int): Float = PanelOpenEasing.transform(ms.toFloat() / PANEL_OPEN_MS)

    @Test
    fun `the panel unrolls in 300 ms, the display fading in from 40, the rows from 70 and 100, all done by 320`() {
        assertEquals(300, PANEL_OPEN_MS)
        assertEquals(240, PANEL_CLOSE_MS)
        // The time along the opening is the easing run backwards.
        for (ms in 0..PANEL_OPEN_MS step 5) assertEquals(ms.toFloat(), panelTime(opened(ms)), 1.5f, "at $ms ms")
        assertEquals(0f, panelTime(0f))
        assertEquals(300f, panelTime(1f))
        // Emphasised decelerate: off at once, most of the way at a sixth of the time.
        assertTrue(opened(16) > 0.3f)
        assertTrue(opened(50) > 0.6f)
        // Each part waits for its start, then takes 200 ms.
        for (start in listOf(PANEL_DISPLAY_AT, PANEL_ROW1_AT, PANEL_ROW2_AT)) {
            assertEquals(0f, panelFade(0f, start))
            assertEquals(0f, panelFade(opened(start - 3), start), "before $start")
            assertTrue(panelFade(opened(start + 10), start) > 0f, "after $start")
            assertTrue(panelFade(opened(start + PANEL_FADE_MS - 10), start) < 1f)
            assertEquals(1f, panelFade(opened(start + PANEL_FADE_MS), start), 1e-3f)
            assertEquals(1f, panelFade(1f, start))
        }
        assertEquals(40, PANEL_DISPLAY_AT)
        assertEquals(70, PANEL_ROW1_AT)
        assertEquals(100, PANEL_ROW2_AT)
        assertTrue(PANEL_ROW2_AT + PANEL_FADE_MS <= 320)
        // In order, at any moment of it.
        val mid = opened(120)
        assertTrue(mid > panelFade(mid, PANEL_DISPLAY_AT))
        assertTrue(panelFade(mid, PANEL_DISPLAY_AT) > panelFade(mid, PANEL_ROW1_AT))
        assertTrue(panelFade(mid, PANEL_ROW1_AT) > panelFade(mid, PANEL_ROW2_AT))
    }

    @Test
    fun `the line cross-fades into SAMPLE's header in place over the opening's first 120 ms, and back closing`() {
        assertEquals(120, PANEL_HEADER_MS)
        assertEquals(0f, panelHeaderFade(0f))
        assertEquals(0.5f, panelHeaderFade(opened(60)), 0.02f)
        assertEquals(1f, panelHeaderFade(opened(PANEL_HEADER_MS)), 1e-3f)
        assertEquals(1f, panelHeaderFade(1f))
        // The header is in before the wave strip and the rows are much out: it leads them.
        val early = opened(80)
        assertTrue(panelHeaderFade(early) > panelFade(early, PANEL_DISPLAY_AT))
        // Closing, it holds while the controls fade and comes back to the line at the end, the line whole at rest.
        val closed = { ms: Float -> 1f - PanelCloseEasing.transform((ms / PANEL_CLOSE_MS).coerceIn(0f, 1f)) }
        assertEquals(1f, panelHeaderFade(closed(40f)), 1e-3f)
        assertEquals(0f, panelHeaderFade(closed(PANEL_CLOSE_MS.toFloat())))
        assertEquals(panelHeaderFade(0.2f), SamplePanel(0.2f, fixed = true).header)
        assertEquals(1f, SamplePanel(1f, fixed = true).header)
        assertEquals(0f, SamplePanel(0f, fixed = true).header)
    }

    @Test
    fun `the line's words go before the header's come, never over each other in the row`() {
        // At rest: the line alone, closed; the header alone, open.
        assertEquals(1f, lineShown(0f))
        assertEquals(0f, headerShown(0f))
        assertEquals(0f, lineShown(1f))
        assertEquals(1f, headerShown(1f))
        // The line half gone a quarter of the way through (30 ms into the opening), gone by the middle (60 ms).
        assertEquals(0.5f, lineShown(0.25f), 1e-6f)
        assertEquals(0f, lineShown(0.5f))
        assertEquals(0f, headerShown(0.5f))
        // The header half in three quarters of the way through (90 ms), in at the end.
        assertEquals(0.5f, headerShown(0.75f), 1e-6f)
        for (i in 0..20) {
            val f = i / 20f
            assertTrue(lineShown(f) == 0f || headerShown(f) == 0f)
        }
    }

    @Test
    fun `on its side the line narrows first and grows down after, never both at once`() {
        // The timeline [ms] into a tap's opening.
        val opened = { ms: Float -> PanelOpenEasing.transform((ms / PANEL_OPEN_MS).coerceIn(0f, 1f)) }
        assertEquals(0f, morphAcross(0f))
        assertEquals(0f, morphDown(0f))
        assertEquals(1f, morphAcross(1f))
        assertEquals(1f, morphDown(1f))
        // Halfway through its narrowing it hasn't started down (the pads, aside under it, still clear of its foot).
        assertTrue(morphAcross(opened(SIDE_ACROSS_MS / 2f)) in 0.1f..0.99f)
        assertEquals(0f, morphDown(opened(SIDE_ACROSS_MS / 2f)))
        // Down on its way only once it is as narrow as the panel (the pads beside it, clear of its side).
        for (i in 0..300) {
            val p = i / 300f
            assertTrue(morphDown(p) == 0f || morphAcross(p) == 1f, "at $p")
        }
        assertTrue(morphDown(opened(200f)) > 0.5f)
        // Each goes one way only.
        for (i in 1..300) {
            assertTrue(morphAcross(i / 300f) >= morphAcross((i - 1) / 300f))
            assertTrue(morphDown(i / 300f) >= morphDown((i - 1) / 300f))
        }
    }

    @Test
    fun `closing, the controls fade first and quickly, then the panel rolls up without a jump`() {
        // The timeline [ms] into a tap's closing, from all the way open.
        val closed = { ms: Float -> 1f - PanelCloseEasing.transform((ms / PANEL_CLOSE_MS).coerceIn(0f, 1f)) }
        // By 80 ms both rows are gone, the panel still three quarters there.
        assertEquals(0f, panelFade(closed(80f), PANEL_ROW1_AT))
        assertEquals(0f, panelFade(closed(80f), PANEL_ROW2_AT))
        assertTrue(closed(80f) > 0.75f)
        // By 120 ms the display too, the panel still more than half there.
        assertEquals(0f, panelFade(closed(120f), PANEL_DISPLAY_AT))
        assertTrue(closed(120f) > 0.5f)
        // No frame moves it more than an eighth of the way, the last included.
        var ms = 0f
        while (ms < PANEL_CLOSE_MS) {
            assertTrue(closed(ms) - closed(ms + 16f) < 0.125f, "at $ms ms")
            ms += 4f
        }
        assertEquals(0f, closed(PANEL_CLOSE_MS.toFloat()))
    }

    @Test
    fun `the timeline runs for what is left of it, at its pace each way`() {
        val open = panelSpec(open = true, left = 1f) as TweenSpec
        assertEquals(300, open.durationMillis)
        assertEquals(PanelOpenEasing, open.easing)
        assertEquals(150, (panelSpec(open = true, left = 0.5f) as TweenSpec).durationMillis)
        val close = panelSpec(open = false, left = 1f) as TweenSpec
        assertEquals(240, close.durationMillis)
        assertEquals(PanelCloseEasing, close.easing)
        // Turned back midway, only what is left.
        assertEquals(60, (panelSpec(open = false, left = 0.25f) as TweenSpec).durationMillis)
    }

    /** A frame clock the test runs by hand, a frame at a time. */
    private class Frames : MonotonicFrameClock {
        private val waiting = mutableListOf<(Long) -> Unit>()

        override suspend fun <R> withFrameNanos(onFrame: (frameTimeNanos: Long) -> R): R = suspendCancellableCoroutine { c ->
            waiting += { t -> c.resume(onFrame(t)) }
        }

        fun frame(ms: Long) {
            val now = waiting.toList()
            waiting.clear()
            now.forEach { it(ms * 1_000_000L) }
        }
    }

    @Test
    fun `from rest the motion waits a frame for what it brings out to compose, then starts its clock`() {
        val frames = Frames()
        val scope = CoroutineScope(Dispatchers.Unconfined + frames)
        val panel = SamplePanel(0f)
        panel.start(open = true, reduce = false, scope = scope)
        assertTrue(panel.moving)
        // The panel composes in this frame, however long it takes: the motion hasn't started.
        frames.frame(0)
        assertEquals(0f, panel.progress)
        // A slow first frame later, the motion takes its start time here, at 0.
        frames.frame(80)
        assertEquals(0f, panel.progress)
        // From then on at its pace: 16 ms in, a little under half way.
        frames.frame(96)
        assertEquals(opened(16), panel.progress, 0.02f)
        // Turned back on its way, it doesn't wait again: the next frame already goes back.
        val at = panel.progress
        panel.start(open = false, reduce = false, scope = scope)
        frames.frame(112)
        frames.frame(128)
        assertTrue(panel.progress < at)
        assertFalse(panel.open)
    }

    @Test
    fun `the panel opens or closes from where it is, and holds still for a screenshot`() {
        val shut = SamplePanel(0f)
        assertFalse(shut.open)
        assertFalse(shut.moving)
        assertEquals(0f, shut.unroll)
        assertTrue(SamplePanel(1f).open)
        val caught = SamplePanel(0.45f, fixed = true)
        assertEquals(0.45f, caught.progress)
        assertTrue(caught.unroll > caught.display)
        assertTrue(caught.display >= caught.row(second = false))
        assertTrue(caught.row(second = false) >= caught.row(second = true))
        // Nothing moves it.
        val scope = CoroutineScope(Dispatchers.Unconfined)
        caught.start(open = true, reduce = true, scope = scope)
        assertEquals(0.45f, caught.progress)
        assertFalse(caught.moving)
    }

    @Test
    fun `with animations off it opens and closes at once, all of it in or out`() {
        val scope = CoroutineScope(Dispatchers.Unconfined)
        val panel = SamplePanel(0f)
        panel.start(open = true, reduce = true, scope = scope)
        assertTrue(panel.open)
        assertFalse(panel.moving)
        assertEquals(1f, panel.progress)
        assertEquals(1f, panel.header)
        assertEquals(1f, panel.display)
        assertEquals(1f, panel.row(second = true))
        panel.start(open = false, reduce = true, scope = scope)
        assertFalse(panel.open)
        assertFalse(panel.moving)
        assertEquals(0f, panel.progress)
        assertEquals(0f, panel.header)
        assertEquals(0f, panel.display)
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
}
