package dev.arc.ep133.ui.screens

import androidx.compose.animation.core.SpringSpec
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

/** The SAMPLE panel: its motion's timeline, a drag on its handle and when it lands, and a swipe on the pads. */
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
        // Under a finger it comes with the first of the drag, as the line's own row is the first out.
        val pulled = SamplePanel(0.2f, fixed = true, pulled = true)
        assertEquals(maxOf(panelHeaderFade(0.2f), panelPullFade(0.2f, PULL_HEADER_AT)), pulled.header)
        assertEquals(0f, PULL_HEADER_AT)
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
    fun `on its side the handle stays under the finger as the foot goes, and still moves while the line narrows`() {
        // While it narrows the foot is still: the finger takes the panel along at the foot's whole way.
        assertEquals(300f, morphReach(0.05f, 300f))
        // Growing down, the finger goes as far as the foot does for a step of the timeline.
        val p = 0.95f
        val step = 0.001f
        val foot = (morphDown(p + step) - morphDown(p - step)) * 300f
        assertEquals(foot / (2 * step), morphReach(p, 300f), morphReach(p, 300f) * 0.05f)
        assertTrue(morphReach(p, 300f) >= 300f)
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
    fun `a tap runs the timeline for what is left of it, a finger let go springs on`() {
        assertEquals(300, (panelSpec(open = true, left = 1f, velocity = null) as TweenSpec).durationMillis)
        assertEquals(150, (panelSpec(open = true, left = 0.5f, velocity = null) as TweenSpec).durationMillis)
        assertEquals(240, (panelSpec(open = false, left = 1f, velocity = null) as TweenSpec).durationMillis)
        val spring = panelSpec(open = true, left = 0.4f, velocity = 2f) as SpringSpec
        // No bounce, medium-low stiffness.
        assertEquals(1f, spring.dampingRatio)
        assertEquals(400f, spring.stiffness)
    }

    @Test
    fun `a drag on the handle moves the panel as far as the finger goes, of the handle's way`() {
        // Up, from open.
        assertEquals(0.75f, pullProgress(from = 1f, distance = -100f, reach = 400f))
        assertEquals(0.5f, pullProgress(from = 0.75f, distance = -100f, reach = 400f))
        // Back down, drawing it out again.
        assertEquals(0.75f, pullProgress(from = 0.5f, distance = 100f, reach = 400f))
        // Never past either end.
        assertEquals(1f, pullProgress(from = 0.5f, distance = 900f, reach = 400f))
        assertEquals(0f, pullProgress(from = 0f, distance = -50f, reach = 400f))
        // No panel measured yet: it stays.
        assertEquals(0.3f, pullProgress(from = 0.3f, distance = 100f, reach = 0f))
    }

    @Test
    fun `let go past 35 percent, or flicked over 600 dp a second, it lands, else it springs back`() {
        assertTrue(pullLands(travel = 0.35f, velocity = 0f))
        assertFalse(pullLands(travel = 0.34f, velocity = 0f))
        // A flick its way lands however short; one back springs back however far.
        assertTrue(pullLands(travel = 0.05f, velocity = 600f))
        assertFalse(pullLands(travel = 0.9f, velocity = -600f))
        // Slower, where it is decides.
        assertFalse(pullLands(travel = 0.2f, velocity = 599f))
        assertTrue(pullLands(travel = 0.5f, velocity = -599f))
    }

    @Test
    fun `let go, a pull counts from the end it was nearer when caught, not where the panel was going`() {
        // From rest: past 35 percent it lands, short of it it springs back; a flick goes its own way.
        assertTrue(pullOpens(from = 0f, to = 0.35f, velocity = 0f))
        assertFalse(pullOpens(from = 0f, to = 0.3f, velocity = 0f))
        assertTrue(pullOpens(from = 0f, to = 0.1f, velocity = 600f))
        assertFalse(pullOpens(from = 1f, to = 0.6f, velocity = 0f))
        assertTrue(pullOpens(from = 1f, to = 0.7f, velocity = 0f))
        assertTrue(pullOpens(from = 1f, to = 0.2f, velocity = 600f))
        // Caught closing at 0.7 and pulled up to 0.5, let go slowly: it closes, as the finger took it.
        assertFalse(pullOpens(from = 0.7f, to = 0.5f, velocity = -100f))
        // Caught opening at 0.3 and pulled down to 0.45: it opens.
        assertTrue(pullOpens(from = 0.3f, to = 0.45f, velocity = 100f))
        // Caught closing at 0.7 and pushed back down to 0.95: open again.
        assertTrue(pullOpens(from = 0.7f, to = 0.95f, velocity = 0f))
    }

    @Test
    fun `the handle takes a drag only the way the panel can go, and leaves the rest to the page`() {
        // Up on the open panel's handle: a drag; down on it: the page's scroll.
        assertTrue(pullTakes(along = -12f, cross = 3f, progress = 1f))
        assertFalse(pullTakes(along = 12f, cross = 3f, progress = 1f))
        // At the closed end (before it rests and the handle goes): only down, drawing it out again.
        assertTrue(pullTakes(along = 12f, cross = 3f, progress = 0f))
        assertFalse(pullTakes(along = -12f, cross = 3f, progress = 0f))
        // More across than along: neither.
        assertFalse(pullTakes(along = 5f, cross = 12f, progress = 0f))
        // Caught on its way: either way.
        assertTrue(pullTakes(along = -12f, cross = 0f, progress = 0.4f))
        assertTrue(pullTakes(along = 12f, cross = 0f, progress = 0.4f))
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
        // Caught and let go on its way, it doesn't wait again.
        panel.grab(scope)
        panel.pull(0.5f)
        panel.start(open = true, reduce = false, scope = scope, velocity = 0f)
        frames.frame(112)
        frames.frame(128)
        assertTrue(panel.progress > 0.5f)
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
        caught.grab(scope)
        caught.pull(0.9f)
        caught.start(open = true, reduce = true, scope = scope)
        assertEquals(0.45f, caught.progress)
        assertFalse(caught.moving)
    }

    @Test
    fun `a finger holds the panel where it pulls it, and it rests where it is let go to`() {
        val scope = CoroutineScope(Dispatchers.Unconfined)
        val panel = SamplePanel(0f)
        // Not held: a pull does nothing.
        panel.pull(0.5f)
        assertEquals(0f, panel.progress)
        panel.grab(scope)
        assertTrue(panel.moving)
        panel.pull(0.3f)
        assertEquals(0.3f, panel.progress)
        assertEquals(0.3f, panel.unroll)
        assertFalse(panel.open)
        panel.pull(1.4f)
        assertEquals(1f, panel.progress)
        // Let go (animations off: at once), it opens and rests.
        panel.start(open = true, reduce = true, scope = scope)
        assertTrue(panel.open)
        assertEquals(1f, panel.progress)
        assertFalse(panel.moving)
        // Held again from open and let go short: back to open.
        panel.grab(scope)
        panel.pull(0.8f)
        panel.start(open = panel.open, reduce = true, scope = scope)
        assertEquals(1f, panel.progress)
        assertFalse(panel.moving)
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
    fun `under a finger the parts fade in as they come out, not only at their times`() {
        assertEquals(0f, panelPullFade(0.1f, PULL_DISPLAY_AT))
        assertEquals(1f, panelPullFade(PULL_DISPLAY_AT + PULL_FADE, PULL_DISPLAY_AT))
        // Each in before it is all the way out, one after the other.
        assertTrue(PULL_DISPLAY_AT < PULL_ROW1_AT && PULL_ROW1_AT < PULL_ROW2_AT)
        assertTrue(PULL_ROW2_AT + PULL_FADE < 1f)
        // A third of the way out by its time the display hasn't started; under a finger it is half in.
        assertEquals(0f, panelFade(0.3f, PANEL_DISPLAY_AT))
        assertTrue(panelPullFade(0.3f, PULL_DISPLAY_AT) > 0.5f)
        val tapped = SamplePanel(0.3f, fixed = true)
        val pulled = SamplePanel(0.3f, fixed = true, pulled = true)
        assertEquals(0f, tapped.display)
        assertEquals(panelPullFade(0.3f, PULL_DISPLAY_AT), pulled.display)
        assertEquals(0f, pulled.row(second = true))
        // A panel a finger has: the display comes out with it.
        val panel = SamplePanel(0f)
        val scope = CoroutineScope(Dispatchers.Unconfined)
        panel.grab(scope)
        panel.pull(0.5f)
        assertTrue(panel.display > panelFade(0.5f, PANEL_DISPLAY_AT))
        assertTrue(panel.row(second = false) > 0f)
        // Let go to open, it rests there with all of it in.
        panel.start(open = true, reduce = true, scope = scope)
        assertEquals(1f, panel.display)
        assertEquals(1f, panel.row(second = true))
    }
}
