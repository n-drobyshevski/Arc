package dev.arc.ep133.ui.screens

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import kotlinx.coroutines.flow.collectLatest
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.positionChangeIgnoreConsumed
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.Placeable
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.zIndex
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

/*
 * Live's SAMPLE panel (an addition, after the EP-133's own sampler): it
 * unrolls down out of SAMPLE's orange line in the function keys' place
 * (their row upright, their column on its side), and the pads stay on the
 * page to record into. Its display fades in, then its two rows of controls
 * one after the other; the function keys fade and shrink a little away, and
 * the pads glide down (or, on its side, aside) to make room.
 *
 * The way in is the SAMPLE tab ([PanelTab]) between the function keys and
 * the pads, where the panel comes from: a tap opens the panel, and a pull
 * down (across, on its side) draws it out under the finger. Open, the same
 * tab hangs under the panel and works the other way. A swipe from right to
 * left on the pads opens it too, and one back closes it ([panelSwipe]); so
 * does Back.
 *
 * The motion is one timeline, [SamplePanel.progress], run by one
 * Animatable: 0 the keys, 1 the panel unrolled, and in between how far it
 * has unrolled. A tap or a swipe runs it in [PANEL_OPEN_MS] with Material's
 * emphasised decelerate ([PanelOpenEasing]), and back in [PANEL_CLOSE_MS]
 * accelerating ([PanelCloseEasing]); a pull sets it from the finger
 * ([pullProgress]) and lets go with a spring carrying the finger's speed.
 * The display and the rows fade in at their own times along it
 * ([panelFade]), so a reversal midway runs them back from where they are;
 * once a finger has had the panel, until it next rests, they fade in as
 * they come out of the line instead, if sooner ([panelPullFade]).
 *
 * Nothing recomposes as it moves, which is what made it feel slow. The
 * timeline is read only where things lay out or draw:
 * - the slot ([SampleSlot]) measures its height (on its side the column's
 *   width, [unrollWidth]) from it, and places the keys, the panel and the tab;
 * - the keys' fade and shrink, the panel's clip and slide and the tab's fade
 *   are graphics-layer lambdas of that placement, and the panel itself is
 *   measured at its full size, so it doesn't lay out again while it unrolls;
 * - the display and the rows of controls fade in graphics-layer lambdas
 *   ([SamplePanelFace]);
 * - the pads ([PadsGlide]) keep the size they were laid out at while the
 *   panel moves, a layout of their own given the same room every frame and
 *   drawn scaled and moved to the room they have, and are laid out again
 *   once, where it comes to rest. One group's big pads, whose print is
 *   sized from their room ([KoDeck]), so compose again once per opening or
 *   closing, not on every frame;
 * - nothing that composes from its room is measured around the slot as it
 *   grows (the all-groups page fits the panel to the page's width, worked
 *   out ahead), and SAMPLE's line over the sideways column is laid out at
 *   the width the column ends at ([centredAt]).
 * The pull's progress lives in [SamplePanel] too, so a frame of it is a
 * layout pass, never a composition. Only [SamplePanel.open] and
 * [SamplePanel.moving], each changing once per opening or closing, are read
 * while composing (with whether the keys, the panel or the tab show at all,
 * through derivedStateOf). What comes out composes in a frame of its own
 * before the motion starts its clock ([SamplePanel.start]), so a slow first
 * frame doesn't skip the start of it.
 *
 * The swipe on the pads is a trigger, not a drag the panel follows: a
 * pointer handler of its own on the pads ([panelSwipe]), not a pager,
 * because a pad sounds the moment it is touched (holdToPlay takes the press
 * on the way down without consuming it). Once the finger has moved past the
 * touch slop, more across than up or down and the way that opens (or
 * closes) the panel, the swipe takes it and says so ([SamplePanel.took]),
 * and the pad under it cuts its sound short as a scroll would. Far enough
 * across, or flung, it opens or closes the panel. A move more up than across
 * is left alone, so the all-groups page still scrolls, and a knob, which
 * takes the finger from its first touch, keeps it.
 */

/**
 * Where Live's SAMPLE panel is: [progress] 0 with the function keys, 1 with
 * the panel unrolled, in between as far as it has unrolled while it opens
 * or closes, or while a finger pulls it. [open] is where it rests or is on
 * its way to; [moving], whether it is on its way or held. [fixed] holds the
 * panel where it started (screenshots): nothing moves it, and [pulled]
 * catches it under a finger.
 */
@Stable
internal class SamplePanel(start: Float, val fixed: Boolean = false, pulled: Boolean = false) {
    private val time = Animatable(start, PANEL_THRESHOLD).also { it.updateBounds(0f, 1f) }

    // Where a finger holds it, while it pulls: the timeline then follows the finger, not the Animatable.
    private var held by mutableStateOf<Float?>(null)

    // Each start, grab and go counts one: an animation a later one cut short doesn't say it has stopped.
    private var runs = 0

    /** How far along the timeline: 0 the keys, 1 the panel. Read where it lays out or draws. */
    val progress: Float get() = held ?: time.value

    /** Whether the panel rests open, or is opening. */
    var open by mutableStateOf(start >= 0.5f)
        private set

    /** Whether the panel is on its way, or held by a finger: the pads keep the size they were laid out at ([PadsGlide]). */
    var moving by mutableStateOf(false)
        private set

    // From a finger taking hold until the panel next rests at an end: its parts fade in as they come out ([panelPullFade]).
    private var pulling by mutableStateOf(pulled)

    /** How far the panel has unrolled (and the keys gone, the pads moved): the timeline itself. */
    val unroll: Float get() = progress

    /** How far the display has faded in. */
    val display: Float get() = fade(PANEL_DISPLAY_AT, PULL_DISPLAY_AT)

    /** How far the controls' first row (−/source/+, STEREO, LATCH) and, from [second], the second have faded in. */
    fun row(second: Boolean): Float = if (second) fade(PANEL_ROW2_AT, PULL_ROW2_AT) else fade(PANEL_ROW1_AT, PULL_ROW1_AT)

    // A part's fade at its time ([panelFade]); while a finger has had the panel, at least as far as it has come out.
    private fun fade(startMs: Int, pullAt: Float): Float {
        val p = progress
        val timed = panelFade(p, startMs)
        return if (pulling) maxOf(timed, panelPullFade(p, pullAt)) else timed
    }

    // The pointers a swipe took off the pads: their press is cut short, as a scroll's is.
    private val swiped = HashSet<PointerId>()

    /** Whether a swipe took the finger [id] (a pad's press under it then stops sounding: [holdToPlay]). */
    fun took(id: PointerId): Boolean = id in swiped

    /** A swipe takes the finger [id] off the pads. */
    fun take(id: PointerId) {
        swiped += id
    }

    /** The finger [id] lifted (or the gesture ended): its pads are theirs again. */
    fun lifted(id: PointerId) {
        swiped -= id
    }

    /** A finger takes hold of the panel where it is (stopping it, if it was on its way), for [pull]. */
    fun grab(scope: CoroutineScope) {
        if (fixed) return
        runs++
        held = progress
        moving = true
        pulling = true
        scope.launch { time.stop() }
    }

    /** The finger holding the panel has drawn it [to] along the timeline ([pullProgress]). */
    fun pull(to: Float) {
        if (fixed || held == null) return
        held = to.coerceIn(0f, 1f)
    }

    /**
     * The panel opens ([open]) or closes from wherever it is (a finger's
     * hold, too), going in [scope]: see [settle]. It is on its way at once,
     * so a press that comes before the first frame finds it going.
     */
    fun start(open: Boolean, reduce: Boolean, scope: CoroutineScope, velocity: Float? = null) {
        if (fixed) return
        this.open = open
        val run = ++runs
        moving = !reduce
        scope.launch { settle(run, open, reduce, velocity) }
    }

    /** [start], waiting for the panel to come to rest. */
    suspend fun go(open: Boolean, reduce: Boolean) {
        if (fixed) return
        this.open = open
        val run = ++runs
        moving = !reduce
        settle(run, open, reduce, null)
    }

    /**
     * The panel goes to rest, open or closed: in [PANEL_OPEN_MS] for all of
     * it opening or [PANEL_CLOSE_MS] closing ([panelSpec]); with a finger's
     * [velocity] (timeline per second), let go, on a spring that carries it
     * on; or at once with [reduce] (animations off in Android's settings).
     * From rest at an end it waits a frame before it starts, so what it
     * brings out composes before the motion takes its start time.
     */
    private suspend fun settle(run: Int, open: Boolean, reduce: Boolean, velocity: Float?) {
        if (run != runs) return
        try {
            // From rest at an end (a tap, a swipe), what comes out (the panel, or the keys going back) composes
            // first: a frame for it, before the motion takes its start time, so a slow first frame doesn't jump it.
            val fromRest = held == null && !time.isRunning && (time.value == 0f || time.value == 1f)
            held?.let { time.snapTo(it) }
            if (run != runs) return
            held = null
            val target = if (open) 1f else 0f
            if (reduce) {
                time.snapTo(target)
            } else {
                if (fromRest && time.value != target) {
                    withFrameNanos { }
                    if (run != runs) return
                }
                time.animateTo(target, panelSpec(open, abs(target - time.value), velocity), initialVelocity = velocity ?: 0f)
            }
        } finally {
            if (run == runs) {
                moving = false
                // At rest at an end, where both fades agree: taps fade the parts in at their times again.
                if (time.value == 0f || time.value == 1f) pulling = false
            }
        }
    }
}

/** How close to the end the timeline comes before it rests there: a tenth of a percent, under a pixel of the panel. */
private const val PANEL_THRESHOLD = 0.001f

/** The panel's unrolling opening, the keys going and the pads gliding with it (ms): all of the timeline. */
internal const val PANEL_OPEN_MS = 300

/** When the display (ms into the opening), and the controls' first and second rows, start fading in. */
internal const val PANEL_DISPLAY_AT = 40
internal const val PANEL_ROW1_AT = 70
internal const val PANEL_ROW2_AT = 100

/** How long the display and each row take to fade in (ms): the second row's ends with the motion. */
internal const val PANEL_FADE_MS = 200

/** The timeline run back, closing (ms): quicker, the panel being put away. */
internal const val PANEL_CLOSE_MS = 240

/** Material's emphasised decelerate, cubic-bezier(.05, .7, .1, 1): its control points. */
private const val OPEN_X1 = 0.05f
private const val OPEN_Y1 = 0.7f
private const val OPEN_X2 = 0.1f

/** The pace opening: Material's emphasised decelerate, off at once and settling slowly into place. */
internal val PanelOpenEasing = CubicBezierEasing(OPEN_X1, OPEN_Y1, OPEN_X2, 1f)

/**
 * The pace closing: Material's standard accelerate, cubic-bezier(.3, 0, 1,
 * 1). The panel moves little at first, while its controls (which live at
 * the top of the timeline) fade, then gathers speed into the line. Not the
 * emphasised accelerate, (.3, 0, .8, .15): that ends so fast the panel
 * would shut its last quarter in one frame, where it shows going into the
 * line rather than off the screen.
 */
internal val PanelCloseEasing = CubicBezierEasing(0.3f, 0f, 1f, 1f)

/** How the display and the rows fade in over their [PANEL_FADE_MS]: at once, then settling. */
private val FadeEasing = LinearOutSlowInEasing

/**
 * How the timeline goes to rest: [open] or closed with [left] of it to go,
 * at the pace of a tap; or, a finger letting go at [velocity] (timeline per
 * second), on a spring without a bounce that carries that speed on.
 */
internal fun panelSpec(open: Boolean, left: Float, velocity: Float?): AnimationSpec<Float> = when {
    velocity != null -> spring(Spring.DampingRatioNoBouncy, Spring.StiffnessMediumLow, PANEL_THRESHOLD)
    open -> tween((left * PANEL_OPEN_MS).roundToInt(), easing = PanelOpenEasing)
    else -> tween((left * PANEL_CLOSE_MS).roundToInt(), easing = PanelCloseEasing)
}

/**
 * How far into the opening (ms, of [PANEL_OPEN_MS]) the timeline is at
 * [progress]: [PanelOpenEasing] run backwards, so the parts that fade in at
 * their own times do so on time while it opens, and at the same places
 * along it whatever moves it (a finger, closing, a spring).
 */
internal fun panelTime(progress: Float): Float {
    if (progress <= 0f) return 0f
    if (progress >= 1f) return PANEL_OPEN_MS.toFloat()
    // The curve's own parameter where it reaches [progress] (it rises all the way), then its time there.
    var lo = 0f
    var hi = 1f
    repeat(24) {
        val mid = (lo + hi) / 2f
        if (bezier(OPEN_Y1, 1f, mid) < progress) lo = mid else hi = mid
    }
    return bezier(OPEN_X1, OPEN_X2, (lo + hi) / 2f) * PANEL_OPEN_MS
}

/** A cubic Bézier from 0 to 1 through the control values [a] and [b], at [s]. */
private fun bezier(a: Float, b: Float, s: Float): Float {
    val r = 1f - s
    return 3f * r * r * s * a + 3f * r * s * s * b + s * s * s
}

/**
 * How far a part of the panel starting [startMs] into the opening has faded
 * in at [progress] along the timeline: 0 before it starts, then over
 * [PANEL_FADE_MS] to 1.
 */
internal fun panelFade(progress: Float, startMs: Int): Float =
    FadeEasing.transform(((panelTime(progress) - startMs) / PANEL_FADE_MS).coerceIn(0f, 1f))

/**
 * Where along the timeline the display, and the controls' first and second
 * rows, start fading in under a finger: about where each starts to come out
 * of the line, the panel unrolling from its top.
 */
internal const val PULL_DISPLAY_AT = 0.1f
internal const val PULL_ROW1_AT = 0.35f
internal const val PULL_ROW2_AT = 0.55f

/** How much of the timeline each part takes to fade in under a finger: in by the time it is nearly all out. */
internal const val PULL_FADE = 0.35f

/**
 * How far a part starting [at] along the timeline has faded in at
 * [progress] while a finger draws the panel out (or puts it back): over
 * [PULL_FADE] of the way, so it comes out with the panel rather than all at
 * once near the end, as it would by its time ([panelFade]): Material's
 * emphasised decelerate goes most of the way in the first frames, so by
 * time the display would start only 70% of the way out.
 */
internal fun panelPullFade(progress: Float, at: Float): Float =
    FadeEasing.transform(((progress - at) / PULL_FADE).coerceIn(0f, 1f))

/** How far across the pads (of their width) a swipe has to go to open or close the panel, if not flung. */
internal const val PANEL_SWIPE_AT = 0.3f

/** A fling faster than this (dp per second) the way that opens or closes the panel does so, however short. */
internal const val PANEL_FLING = 1000f

/**
 * Whether a swipe opens (or closes) the panel: [travel] across the pads
 * (of their width) and [velocity] (dp per second) the way it goes, both
 * negative the other way. Past [PANEL_SWIPE_AT] it does, or flung past
 * [PANEL_FLING].
 */
internal fun swipeLands(travel: Float, velocity: Float): Boolean = travel >= PANEL_SWIPE_AT || velocity >= PANEL_FLING

/** How far a pull on the tab has to draw the panel out (or in), of the way, to open (or close) it when let go. */
internal const val PULL_LANDS = 0.35f

/** A flick of the tab faster than this (dp per second) opens or closes the panel the way it goes, however short. */
internal const val PULL_FLING = 600f

/**
 * Where a pull on the tab puts the timeline: [from] where it is, the finger
 * gone on [distance] (px, down or, on its side, across; negative back) over
 * [reach], how far the tab goes from one end to the other (so it stays
 * under the finger).
 */
internal fun pullProgress(from: Float, distance: Float, reach: Float): Float =
    if (reach <= 0f) from else (from + distance / reach).coerceIn(0f, 1f)

/**
 * Whether a pull let go opens (or closes) the panel: [travel] how far it
 * is the way that does (0..1 of the timeline from where the panel rested)
 * and [velocity] (dp per second) the finger's that way, negative back. A
 * flick past [PULL_FLING] goes its own way; slower, past [PULL_LANDS] it
 * does, and short of it the panel springs back.
 */
internal fun pullLands(travel: Float, velocity: Float): Boolean = when {
    velocity >= PULL_FLING -> true
    velocity <= -PULL_FLING -> false
    else -> travel >= PULL_LANDS
}

/**
 * Whether a finger on the tab past the touch slop pulls the panel: gone
 * [along] (px, down or across on its side, the way that opens it) more
 * than [cross], and a way the panel, at [progress], can go. Up from closed
 * or down from open is left to the page, which scrolls.
 */
internal fun pullTakes(along: Float, cross: Float, progress: Float): Boolean =
    abs(along) >= abs(cross) && !(along < 0f && progress <= 0f) && !(along > 0f && progress >= 1f)

/**
 * Whether a pull let go leaves the panel open: taken hold of [from] along
 * the timeline, let go [to], the finger going at [velocity] (dp per second,
 * the way that opens it; negative back). It counts from the end it was
 * nearer when the finger took hold, so a panel caught on its way (to
 * either end) goes where the finger takes it ([pullLands]), not where it
 * was going.
 */
internal fun pullOpens(from: Float, to: Float, velocity: Float): Boolean {
    val wasOpen = from >= 0.5f
    val lands = if (wasOpen) pullLands(1f - to, -velocity) else pullLands(to, velocity)
    return wasOpen != lands
}

/** Whether Android's animations are off (Settings, animator duration scale 0): the panel then opens and closes at once. */
@Composable
internal fun reducedMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false)
    }
}

/**
 * The swipe on Live's pads (see the notes at the top): right to left while
 * the panel is closed calls [onOpen], left to right while it is open
 * [onClose], once the finger has gone [PANEL_SWIPE_AT] of the way across or
 * flung. A finger the swipe takes is [panel]'s ([SamplePanel.took]) until it
 * lifts.
 */
@Composable
internal fun panelSwipe(panel: SamplePanel, onOpen: () -> Unit, onClose: () -> Unit): Modifier {
    val opened by rememberUpdatedState(onOpen)
    val closed by rememberUpdatedState(onClose)
    return Modifier.pointerInput(panel) {
        if (panel.fixed) return@pointerInput
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            // The way that does something: leftwards opens, rightwards closes.
            val opening = !panel.open
            val way = if (opening) -1f else 1f
            val width = size.width.toFloat().coerceAtLeast(1f)
            val tracker = VelocityTracker()
            tracker.addPosition(down.uptimeMillis, down.position)
            var claimed = false
            var fired = false
            var moved = Offset.Zero
            val fire = {
                fired = true
                if (opening) opened() else closed()
            }
            try {
                while (true) {
                    val ch = awaitPointerEvent(PointerEventPass.Main).changes.firstOrNull { it.id == down.id } ?: break
                    tracker.addPosition(ch.uptimeMillis, ch.position)
                    if (claimed) {
                        ch.consume()
                        val travel = (ch.position.x - down.position.x) * way / width
                        if (!ch.pressed) {
                            if (!fired && swipeLands(travel, tracker.calculateVelocity().x * way / density)) fire()
                            break
                        }
                        // Far enough: it goes now, not at the lift.
                        if (!fired && swipeLands(travel, 0f)) fire()
                        continue
                    }
                    // Lifted, or a knob or a scroll took the finger first.
                    if (!ch.pressed || ch.isConsumed) break
                    moved += ch.positionChange()
                    if (moved.getDistance() <= viewConfiguration.touchSlop) continue
                    // Past the slop: more across than up or down, and the way that does something, it is a swipe.
                    if (abs(moved.x) <= abs(moved.y) || moved.x * way <= 0f) break
                    claimed = true
                    panel.take(down.id)
                    ch.consume()
                }
            } finally {
                panel.lifted(down.id)
            }
        }
    }
}

/** The SAMPLE panel, for the pads under it: a press a swipe takes is cut short ([holdToPlay]). */
internal val LocalSamplePanel = staticCompositionLocalOf<SamplePanel?> { null }

/** How far up the panel starts unrolling, at SAMPLE's line. */
private val UnrollFrom = 38.dp

/** The function keys going: how much they shrink, and how far they sink. */
private const val KEYS_SHRINK = 0.06f
private val KeysSink = 6.dp

/**
 * The SAMPLE tab's row, under the keys or the panel. Upright it adds nothing
 * to the slot: it hangs into the gap under it and the top of the pads' room
 * ([PadsClear]), so the pads stay where they were before the tab.
 */
internal val TabRow = 16.dp

/**
 * How far down the pads' room (10 dp under the slot, upright) the tab
 * reaches, with 3 dp of air under it: the big grid's body keeps below it
 * ([koCut]), which one group's pads, with room above them, already do.
 */
internal val PadsClear = 8.dp

/** The width a finger finds the tab in (its height grows to a finger's as Compose's own touch targets do). */
private val TabTouchWidth = 112.dp

/** The tab's face, its edge below, its corners, the gap and side padding around its word, and its dot. */
private val TabFace = 9.5.dp
private val TabEdge = 1.5.dp
private val TabEdgeX = 1.dp
private val TabCorner = 5.dp
private val TabPadding = 7.dp
private val TabGap = 4.dp
private val TabDot = 4.dp

/**
 * How far the tab's edge sits above the foot of its row: upright, the pads
 * are that far below it, and the keys' own edge (3 dp under them) as far
 * above its face.
 */
private val TabLift = 1.dp

/** The tab's word, printed as the function keys' words are, and its letter spacing (em). */
private val TabWord = 7.5.dp
private const val TAB_WORD_SPACING = 0.12f

/** The panel's corners as it unrolls: its face's ([SamplePanelFace]). */
private val UnrollCorner = 18.dp

/**
 * The function keys' place on Live's page, holding the [keys] or the SAMPLE
 * panel ([face]), with the SAMPLE tab ([PanelTab]) under them, as far along
 * as [panel] is (see the notes at the top). Upright the slot is as tall as
 * the keys or the panel, the tab's row hanging under it into the gap below
 * (drawn over what is there, and found by a finger first); open, the slot
 * holds [openRoom] more of it, where what comes below can't have the tab
 * over it. [sideways] (the
 * panel's width on its side) it takes the column's height, the tab's row at
 * its foot, and is as wide as the keys' column or the panel; the keys keep
 * the column's height where the room they leave empty at their foot
 * ([foot], px for a column so many px tall) holds the tab, so they don't
 * move for it, and else give up only what it lacks. The panel unrolls from
 * its top, clipped to the slot so it comes out from under SAMPLE's line;
 * the keys fade, shrink and sink as it does, and the tab goes down with it
 * (across, on its side). The tab opens the panel ([onOpen]) and closes it
 * ([onClose]), with the timeline per second a finger let go of it at, or
 * null for a tap; what a finger leaves going (a spring back, the panel let
 * go of when the tab leaves the page) goes on in [scope], which outlives
 * the slot (it moves when the phone turns). [reach] is the panel's open height upright, its width on
 * its side; a pull goes as far as the tab does from one end to the other
 * (from under the keys to under the panel), so the tab stays under the
 * finger. Without [handle] (a column too short for the tab under the panel
 * and its controls) the tab fades as the panel comes out and is
 * gone once it is all out, and Back or a swipe close it.
 */
@Composable
internal fun SampleSlot(
    panel: SamplePanel,
    onOpen: (velocity: Float?) -> Unit,
    onClose: (velocity: Float?) -> Unit,
    reach: Dp,
    scope: CoroutineScope,
    modifier: Modifier = Modifier,
    sideways: Dp? = null,
    handle: Boolean = true,
    foot: Density.(height: Int) -> Int = { 0 },
    openRoom: Dp = 0.dp,
    keys: @Composable () -> Unit,
    face: @Composable () -> Unit,
) {
    // Each there while it shows, or is about to: the panel from the moment it opens (or a finger draws it out), the
    // keys from the moment it closes. derivedStateOf: composition hears of the timeline only as these change.
    val showFace by remember(panel) { derivedStateOf { panel.open || panel.progress > 0f } }
    val showKeys by remember(panel) { derivedStateOf { !panel.open || panel.progress < 1f } }
    // Without a handle, the tab until the panel is all the way out, fading as it comes.
    val showTab by remember(panel, handle) { derivedStateOf { handle || !panel.open || panel.progress < 1f } }
    // The keys' extent the tab starts from (their height, on its side their width), as last laid out.
    val keysAt = remember { KeysExtent() }
    val across = sideways != null
    Layout(
        content = {
            if (showKeys) Box(Modifier.layoutId(SLOT_KEYS)) { keys() }
            if (showFace) Box(Modifier.layoutId(SLOT_FACE).semantics { paneTitle = MirrorText.SAMPLE_TAG }) { face() }
            if (showTab) {
                Box(Modifier.layoutId(SLOT_TAB)) {
                    // Upright from under the keys to under the panel; on its side from the column's middle to the panel's.
                    PanelTab(panel, { if (across) (reach.toPx() - keysAt.px) / 2f else reach.toPx() - keysAt.px }, across, scope, onOpen, onClose)
                }
            }
        },
        // Over what comes after it, where the tab hangs into the pads' room.
        modifier = modifier.zIndex(1f),
    ) { measurables, constraints ->
        val m = panel.unroll
        val row = TabRow.roundToPx()
        val keysM = measurables.firstOrNull { it.layoutId == SLOT_KEYS }
        val faceM = measurables.firstOrNull { it.layoutId == SLOT_FACE }
        val tabM = measurables.firstOrNull { it.layoutId == SLOT_TAB }
        val keysP: Placeable?
        val faceP: Placeable?
        val w: Int
        val h: Int
        val tabY: Int
        if (sideways == null) {
            val loose = constraints.copy(minHeight = 0)
            keysP = keysM?.measure(loose)
            // The panel at its own width (a tablet's keeps to the start), the tab centred under it.
            faceP = faceM?.measure(loose.copy(minWidth = 0))
            w = if (constraints.hasBoundedWidth) constraints.maxWidth else maxOf(keysP?.width ?: 0, faceP?.width ?: 0)
            // Under the keys or the panel, the tab's row in the gap under the slot, past its bottom (nothing there clips it).
            tabY = lerpPx(keysP?.height ?: 0, faceP?.height ?: 0, m)
            h = tabY + lerpPx(0, openRoom.roundToPx(), m)
        } else {
            val open = sideways.roundToPx()
            h = constraints.maxHeight
            tabY = h - row
            // As little as the keys can give up for the tab: none where their own foot holds it.
            var lo = 0
            var hi = row
            while (lo < hi) {
                val cut = (lo + hi) / 2
                if (cut + foot(h - cut) >= row) hi = cut else lo = cut + 1
            }
            keysP = keysM?.measure(Constraints(maxWidth = constraints.maxWidth, maxHeight = (h - lo).coerceAtLeast(0)))
            faceP = faceM?.measure(Constraints.fixed(open, (if (handle) tabY else h).coerceAtLeast(0)))
            w = lerpPx(keysP?.width ?: 0, open, m)
        }
        val keysW = keysP?.width ?: w
        val faceW = faceP?.width ?: w
        if (keysP != null) keysAt.px = (if (sideways == null) keysP.height else keysP.width).toFloat()
        val tabP = tabM?.measure(Constraints())
        layout(w, h) {
            keysP?.placeWithLayer(0, 0) {
                val u = panel.unroll
                alpha = 1f - u
                scaleX = 1f - KEYS_SHRINK * u
                scaleY = scaleX
                translationY = KeysSink.toPx() * u
            }
            faceP?.placeWithLayer(0, 0) {
                val u = panel.unroll
                val drop = UnrollFrom.toPx() * (1f - u)
                translationY = -drop
                if (u < 1f) {
                    // Unrolled as far as [u] down from its top, and none of it above the slot (under the line):
                    // the layer's own top is [drop] above the slot's. On its side, no wider than the slot so far.
                    clip = true
                    shape = UnrollShape(top = drop, bottom = faceP.height * u, right = (if (sideways == null) faceP.width else lerpPx(keysW, faceP.width, u)).toFloat(), corner = UnrollCorner.toPx())
                } else {
                    clip = false
                }
            }
            // Centred under the keys, then under the panel as it unrolls; with no room for it under the panel, it fades.
            tabP?.placeWithLayer(lerpPx(keysW, faceW, m) / 2 - tabP.width / 2, tabY) {
                alpha = if (handle) 1f else 1f - panel.unroll
            }
        }
    }
}

/** How tall (on its side, wide) the function keys were last laid out, px: where the tab starts from. */
private class KeysExtent {
    var px = 0f
}

private const val SLOT_KEYS = "keys"
private const val SLOT_FACE = "face"
private const val SLOT_TAB = "tab"

/** [a] to [b] at [f] (0..1), in whole pixels. */
private fun lerpPx(a: Int, b: Int, f: Float): Int = (a + (b - a) * f).roundToInt()

/**
 * The part of the unrolling panel that shows, in its layer's own pixels:
 * from [top] down to [bottom] (nothing where that is none), [right] wide,
 * its lower corners rounded [corner], as the panel's own are.
 */
private class UnrollShape(val top: Float, val bottom: Float, val right: Float, val corner: Float) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        if (bottom <= top || right <= 0f) return Outline.Rectangle(Rect.Zero)
        val r = CornerRadius(corner)
        return Outline.Generic(
            Path().apply {
                addRoundRect(RoundRect(0f, top, right, bottom, topLeftCornerRadius = CornerRadius.Zero, topRightCornerRadius = CornerRadius.Zero, bottomRightCornerRadius = r, bottomLeftCornerRadius = r))
            },
        )
    }
}

/**
 * [this] laid out [width] wide whatever room it is given, and over its
 * middle: the same room every frame while the room around it changes, so
 * the parts in it (a line's words, fitted to its width) aren't measured
 * again.
 */
internal fun Modifier.centredAt(width: Dp): Modifier = layout { measurable, constraints ->
    val w = width.roundToPx()
    val p = measurable.measure(constraints.copy(minWidth = w, maxWidth = w))
    val room = if (constraints.hasBoundedWidth) constraints.maxWidth else w
    layout(room, p.height) { p.place((room - w) / 2, 0) }
}

/**
 * [this] as wide as [panel] has it: [closed] with the function keys, [open]
 * with the panel, in between as it unrolls (read while measuring, so
 * nothing recomposes for it); within what the parent allows.
 */
internal fun Modifier.unrollWidth(panel: SamplePanel, closed: Dp, open: Dp): Modifier = layout { measurable, constraints ->
    val w = lerpPx(closed.roundToPx(), open.roundToPx(), panel.unroll).coerceIn(constraints.minWidth, constraints.maxWidth)
    val p = measurable.measure(constraints.copy(minWidth = w, maxWidth = w))
    layout(p.width, p.height) { p.place(0, 0) }
}

/** [this] no taller than [panel] has it: [closed] with the function keys, [open] with the panel, in between as it unrolls. */
internal fun Modifier.unrollMaxHeight(panel: SamplePanel, closed: Dp, open: Dp): Modifier = layout { measurable, constraints ->
    val h = lerpPx(closed.roundToPx(), open.roundToPx(), panel.unroll).coerceIn(constraints.minHeight, constraints.maxHeight)
    val p = measurable.measure(constraints.copy(maxHeight = h))
    layout(p.width, p.height) { p.place(0, 0) }
}

/**
 * The pads ([content]) while the SAMPLE panel moves: laid out once, for the
 * room they have where [panel] last rested, and drawn scaled and moved to
 * the room they have each frame, then laid out again, once, where it comes
 * to rest. So one group's big pads, whose print is sized from the room they
 * are given, compose once per opening or closing rather than on every
 * frame, while the room around them ([modifier]) follows the timeline as
 * cheap layout: the pads are a layout of their own under this one, given
 * the same room every frame, so they aren't measured again either.
 * [scaleOf] is how big the pads are in a room so many pixels wide and high
 * (one group's pad width, [koUnit]; the all-groups row's width): the
 * drawing is scaled by its share between the two rooms, around their
 * middles where [centred] (the big grid sits in the middle of its room),
 * else from their top left. A finger finds each pad where it is drawn.
 *
 * Not all of the pads grow and shrink with their room (their words and
 * LEDs keep to a smallest and largest size, a caption and the gaps between
 * groups are fixed), so where the panel rests the pads laid out again
 * differ a little from their last scaled frame. So they stay as they are
 * until a picture of that frame is taken (a frame or two, the same place
 * either way), which then lies over them as laid out again and fades in
 * [PADS_SETTLE_MS]: they settle rather than jump.
 */
@Composable
internal fun PadsGlide(panel: SamplePanel, modifier: Modifier, centred: Boolean = true, scaleOf: Density.(w: Int, h: Int) -> Float, content: @Composable () -> Unit) {
    val rest = remember(panel) { RestRoom() }
    // The pads as drawn while the panel moves; once it rests, a picture of their last frame over them, fading.
    val drawn = rememberGraphicsLayer()
    var still by remember(panel) { mutableStateOf<ImageBitmap?>(null) }
    val over = remember(panel) { Animatable(0f) }
    LaunchedEffect(panel) {
        snapshotFlow { panel.moving }.collectLatest { moving ->
            if (moving) {
                // Kept where they are until a picture of them is taken, after it rests.
                rest.held = true
                still = null
            } else if (rest.held) {
                still = runCatching { drawn.toImageBitmap() }.getOrNull()
                over.snapTo(1f)
                rest.held = false
                over.animateTo(0f, tween(PADS_SETTLE_MS))
                still = null
            }
        }
    }
    Layout(
        content = content,
        modifier = modifier.drawWithContent {
            val picture = still
            if (picture == null) {
                drawn.record { this@drawWithContent.drawContent() }
                drawLayer(drawn)
            } else {
                drawContent()
                drawImage(picture, alpha = over.value)
            }
        },
    ) { measurables, constraints ->
        // The room where the panel rests: taken as it lays out there, kept while it moves (and until the picture).
        if (!(panel.moving || rest.held) || rest.constraints == null) rest.constraints = constraints
        val at = rest.constraints ?: constraints
        val p = measurables.first().measure(at)
        val w = if (constraints.hasBoundedWidth) constraints.maxWidth else p.width
        val h = if (constraints.hasBoundedHeight) constraints.maxHeight else p.height
        val from = scaleOf(p.width, p.height)
        val s = if (at == constraints || from <= 0f) 1f else scaleOf(w, h) / from
        layout(w, h) {
            p.placeWithLayer(0, 0) {
                scaleX = s
                scaleY = s
                if (centred) {
                    transformOrigin = TransformOrigin.Center
                    translationX = (w - p.width) / 2f
                    translationY = (h - p.height) / 2f
                } else {
                    transformOrigin = TransformOrigin(0f, 0f)
                }
            }
        }
    }
}

/** How long the picture of the pads' last scaled frame takes to fade off them, laid out again where the panel rests ([PadsGlide]). */
private const val PADS_SETTLE_MS = 120

/**
 * The room the pads were last laid out in while the panel rested, and
 * whether they are held there, the panel having moved, until a picture of
 * them is taken ([PadsGlide]).
 */
private class RestRoom {
    var constraints: Constraints? = null
    var held by mutableStateOf(false)
}

/**
 * The SAMPLE tab, under the function keys or, open, the panel (an addition,
 * after a drawer's pull tab): a small dark cap in the keys' print, SAMPLE's
 * orange dot and its word. A tap opens the panel ([onOpen]), or closes it
 * ([onClose]) when open. A pull down ([across] on its side: to the right)
 * draws it out under the finger, [reach] (px, how far the tab goes from
 * end to end, as it is laid out now) for all of it ([pullProgress]); one
 * up (to the left) puts it back. One the way the panel can't go (up from
 * closed, down from open) is left to the page, which scrolls. Let go, it
 * opens or closes on a spring carrying the finger's speed, or springs back
 * to the end it was nearer when the finger took hold ([pullOpens]); what
 * it leaves going runs in [scope]. A screen reader hears it as the button [MirrorText.OPEN_SAMPLE], or
 * [MirrorText.CLOSE_SAMPLE] while the panel is open. The first-run guide
 * points at it.
 */
@Composable
private fun PanelTab(panel: SamplePanel, reach: Density.() -> Float, across: Boolean, scope: CoroutineScope, onOpen: (Float?) -> Unit, onClose: (Float?) -> Unit) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val open = panel.open
    val opened by rememberUpdatedState(onOpen)
    val closed by rememberUpdatedState(onClose)
    val span by rememberUpdatedState(reach)
    val reduce = reducedMotion()
    Box(
        Modifier
            .size(TabTouchWidth, TabRow)
            .pointerInput(panel, across, scope) {
                if (panel.fixed) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown()
                    val tracker = VelocityTracker()
                    tracker.addPosition(down.uptimeMillis, down.position)
                    var pulling = false
                    var settled = false
                    var from = 0f
                    // How far the finger has gone, summed from each move: the tab goes with the panel, so where the
                    // finger is on it says little of how far it has gone.
                    var moved = Offset.Zero
                    try {
                        while (true) {
                            val ch = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
                            val step = ch.positionChangeIgnoreConsumed()
                            moved += step
                            tracker.addPosition(ch.uptimeMillis, down.position + moved)
                            if (!ch.pressed) {
                                if (pulling) {
                                    // Let go: on to the end the finger takes it to, or back, at the finger's speed.
                                    val v = tracker.calculateVelocity().let { if (across) it.x else it.y }
                                    val reachPx = span(this)
                                    val perSecond = if (reachPx > 0f) v / reachPx else 0f
                                    val opens = pullOpens(from, panel.progress, v / density)
                                    when {
                                        // Already on its way there (caught going), or springing back: no change of mode.
                                        opens == panel.open -> panel.start(opens, reduce, scope, perSecond)
                                        opens -> opened(perSecond)
                                        else -> closed(perSecond)
                                    }
                                    settled = true
                                } else if (!ch.isConsumed) {
                                    // A tap.
                                    ch.consume()
                                    if (panel.open) closed(null) else opened(null)
                                }
                                break
                            }
                            if (!pulling) {
                                if (moved.getDistance() <= viewConfiguration.touchSlop) continue
                                val along = if (across) moved.x else moved.y
                                // Past the slop more crosswise than the way the panel comes, or the way it can't go
                                // (up from closed, down from open): neither a pull nor a tap, and the page scrolls.
                                if (!pullTakes(along, if (across) moved.y else moved.x, panel.progress)) break
                                pulling = true
                                from = panel.progress
                                panel.grab(scope)
                                ch.consume()
                                continue
                            }
                            ch.consume()
                            // As far as the finger went, of the tab's way from end to end as it is now laid out.
                            panel.pull(pullProgress(panel.progress, if (across) step.x else step.y, span(this)))
                        }
                    } finally {
                        // The gesture ended without a lift (another took the finger, or the tab left the page): the
                        // panel goes back to rest, in a scope that outlives the tab.
                        if (pulling && !settled) panel.start(panel.open, reduce, scope)
                    }
                }
            }
            .clearAndSetSemantics {
                role = Role.Button
                contentDescription = if (open) MirrorText.CLOSE_SAMPLE else MirrorText.OPEN_SAMPLE
                onClick {
                    if (open) closed(null) else opened(null)
                    true
                }
            },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Row(
            Modifier
                .padding(bottom = TabLift)
                .coachMark("live.sample", CoachText.SAMPLE, c.signal, c.onSignal)
                .padding(end = TabEdgeX, bottom = TabEdge)
                .height(TabFace)
                .cap(hw.darkFace, hw.darkEdge, RoundedCornerShape(TabCorner), press = 0f, dx = TabEdgeX, dy = TabEdge)
                .padding(horizontal = TabPadding),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TabGap),
        ) {
            Canvas(Modifier.size(TabDot)) { drawCircle(c.signal) }
            Text(
                MirrorText.SAMPLE_TAG.uppercase(),
                style = viewWordStyle(TabWord, TAB_WORD_SPACING).copy(lineHeight = 1.em),
                color = hw.darkInk,
                maxLines = 1,
                softWrap = false,
            )
        }
    }
}
