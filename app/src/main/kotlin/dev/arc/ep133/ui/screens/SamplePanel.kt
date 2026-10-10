package dev.arc.ep133.ui.screens

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.draw.drawBehind
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.Placeable
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import dev.arc.ep133.ui.components.CapDy
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

/*
 * Live's SAMPLE panel (an addition, after the EP-133's own sampler): the
 * dark display line itself grows into it, over the function keys' place
 * (their row upright, their column on its side), and the pads stay on the
 * page to record into ([SampleMorph]). The line's words fade out and
 * SAMPLE's header fades in in their place, its dark shape grows down to hold the wave strip
 * under it, and a pale plate with the controls unrolls from under that, the
 * two one rounded body; the wave fades in, then the two rows of controls one
 * after the other; the function keys fade and shrink a little away, and the
 * pads glide down to make room (on its side, the line narrows first while
 * they come aside under it, then grows down as they rise beside it). Nothing
 * shows twice: the header is the only status while the panel is open. Where the
 * line rides in the top bar (a phone on its side, [LivePill]) it can't grow
 * into the column: there the pill fades through to the header, and the panel
 * under it, headerless, unrolls in the keys' place ([SampleSlot]).
 *
 * The way in is the mic key in the top bar (Live's SAMPLE key, [ArcShell]):
 * a tap opens the panel, from KEYS too (Live goes to PADS for it), and
 * another closes it. It works the mode, and the panel follows it
 * ([MirrorScreen]). A swipe from right to left on the pads opens it too,
 * and one back closes it ([panelSwipe]); so does Back.
 *
 * The motion is one timeline, [SamplePanel.progress], run by one
 * Animatable: 0 the keys, 1 the panel unrolled, and in between how far it
 * has unrolled. It runs in [PANEL_OPEN_MS] with Material's emphasised
 * decelerate ([PanelOpenEasing]), and back in [PANEL_CLOSE_MS]
 * accelerating ([PanelCloseEasing]). The header cross-fades over its first
 * [PANEL_HEADER_MS] ([panelHeaderFade]), the line's words going before the
 * header's come ([lineShown]), and the wave and the rows fade in at their
 * own times along it ([panelFade]), so a reversal midway runs them back
 * from where they are.
 *
 * Nothing recomposes as it moves, which is what made it feel slow. The
 * timeline is read only where things lay out or draw:
 * - the growing line ([SampleMorph]) measures its height (on its side, the
 *   pads' room) from it, and places the line, the header, the wave, the
 *   plate and the keys; its body's shape is drawn from it ([MorphGeom]); the
 *   headerless slot ([SampleSlot]) measures its height (on its side the
 *   column's width, [unrollWidth]) the same way;
 * - the cross-fade, the keys' fade and shrink, and the clips and slides are
 *   graphics-layer lambdas of that placement, and every part is measured at
 *   its full size, so it doesn't lay out again as it moves;
 * - the wave and the rows of controls fade in graphics-layer lambdas
 *   ([SamplePlate], [SampleWaveStrip]);
 * - the pads ([PadsGlide]) keep the size they were laid out at while the
 *   panel moves, a layout of their own given the same room every frame and
 *   drawn scaled and moved to the room they have, and are laid out again
 *   once, where it comes to rest. One group's big pads, whose print is
 *   sized from their room ([KoDeck]), so compose again once per opening or
 *   closing, not on every frame;
 * - nothing that composes from its room is measured around the panel as it
 *   grows (the all-groups page fits the panel to the page's width, worked
 *   out ahead), and the header is laid out once at the panel's open width.
 * Only [SamplePanel.open] and [SamplePanel.moving], each changing once per
 * opening or closing, are read while composing (with whether the keys or
 * the panel show at all, through derivedStateOf). What comes out composes
 * in a frame of its own before the motion starts its clock
 * ([SamplePanel.start]), so a slow first frame doesn't skip the start of it.
 *
 * STEP's panel (an addition, after the device's step sequencing) comes out
 * of the same place on the same timeline, all of it on the dark screen: the
 * header STEP's row, the strip its controls, and no plate ([PanelKind]). The
 * SCENE panel (scenes and patterns, after the device's GROUP and MAIN) is the
 * same, taller. They never show at once; the panel says which it is.
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

/** Which panel the display line grows into: SAMPLE's, STEP's or SCENE's ([SamplePanel.kind]). */
internal enum class PanelKind { SAMPLE, STEP, SCENE }

/**
 * Where Live's SAMPLE panel is: [progress] 0 with the function keys, 1 with
 * the panel unrolled, in between as far as it has unrolled while it opens
 * or closes. [open] is where it rests or is on its way to; [moving],
 * whether it is on its way. [fixed] holds the panel where it started
 * (screenshots): nothing moves it. [kind] is which panel it is, SAMPLE's
 * STEP's or SCENE's, from [start]'s too.
 */
@Stable
internal class SamplePanel(start: Float, val fixed: Boolean = false, kind: PanelKind = PanelKind.SAMPLE) {
    private val time = Animatable(start, PANEL_THRESHOLD).also { it.updateBounds(0f, 1f) }

    /** Which panel comes out: set while it is closed (or before it opens), so what shows doesn't change as it moves. */
    var kind by mutableStateOf(kind)

    // Each start and go counts one: an animation a later one cut short doesn't say it has stopped.
    private var runs = 0

    /** How far along the timeline: 0 the keys, 1 the panel. Read where it lays out or draws. */
    val progress: Float get() = time.value

    /** Whether the panel rests open, or is opening. */
    var open by mutableStateOf(start >= 0.5f)
        private set

    /** Whether the panel is on its way: the pads keep the size they were laid out at ([PadsGlide]). */
    var moving by mutableStateOf(false)
        private set

    /** How far the panel has unrolled (and the keys gone, the pads moved): the timeline itself. */
    val unroll: Float get() = progress

    /** How far the display line has cross-faded, in place, into SAMPLE's header ([panelHeaderFade]). */
    val header: Float get() = panelHeaderFade(progress)

    /** How far the wave strip under the header has faded in. */
    val display: Float get() = panelFade(progress, PANEL_DISPLAY_AT)

    /** How far the controls' first row (−/source/+, STEREO, LATCH) and, from [second], the second have faded in. */
    fun row(second: Boolean): Float = panelFade(progress, if (second) PANEL_ROW2_AT else PANEL_ROW1_AT)

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

    /**
     * The panel opens ([open]) or closes from wherever it is, going in
     * [scope]: see [settle]. It is on its way at once, so a press that comes
     * before the first frame finds it going.
     */
    fun start(open: Boolean, reduce: Boolean, scope: CoroutineScope) {
        if (fixed) return
        this.open = open
        val run = ++runs
        moving = !reduce
        scope.launch { settle(run, open, reduce) }
    }

    /** [start], waiting for the panel to come to rest. */
    suspend fun go(open: Boolean, reduce: Boolean) {
        if (fixed) return
        this.open = open
        val run = ++runs
        moving = !reduce
        settle(run, open, reduce)
    }

    /**
     * The panel goes to rest, open or closed: in [PANEL_OPEN_MS] for all of
     * it opening or [PANEL_CLOSE_MS] closing ([panelSpec]), or at once with
     * [reduce] (animations off in Android's settings). From rest at an end it
     * waits a frame before it starts, so what it brings out composes before
     * the motion takes its start time.
     */
    private suspend fun settle(run: Int, open: Boolean, reduce: Boolean) {
        if (run != runs) return
        try {
            // From rest at an end (a tap, a swipe), what comes out (the panel, or the keys going back) composes
            // first: a frame for it, before the motion takes its start time, so a slow first frame doesn't jump it.
            val fromRest = !time.isRunning && (time.value == 0f || time.value == 1f)
            val target = if (open) 1f else 0f
            if (reduce) {
                time.snapTo(target)
            } else {
                if (fromRest && time.value != target) {
                    withFrameNanos { }
                    if (run != runs) return
                }
                time.animateTo(target, panelSpec(open, abs(target - time.value)))
            }
        } finally {
            if (run == runs) moving = false
        }
    }
}

/** How close to the end the timeline comes before it rests there: a tenth of a percent, under a pixel of the panel. */
private const val PANEL_THRESHOLD = 0.001f

/** The panel's unrolling opening, the keys going and the pads gliding with it (ms): all of the timeline. */
internal const val PANEL_OPEN_MS = 300

/** How long the display line takes to cross-fade into SAMPLE's header at the start of the opening (ms). */
internal const val PANEL_HEADER_MS = 120

/** When the wave strip (ms into the opening), and the controls' first and second rows, start fading in. */
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

/** How the timeline goes to rest: [open] or closed with [left] of it to go, at the pace of a whole opening or closing. */
internal fun panelSpec(open: Boolean, left: Float): AnimationSpec<Float> =
    if (open) tween((left * PANEL_OPEN_MS).roundToInt(), easing = PanelOpenEasing) else tween((left * PANEL_CLOSE_MS).roundToInt(), easing = PanelCloseEasing)

/**
 * How far into the opening (ms, of [PANEL_OPEN_MS]) the timeline is at
 * [progress]: [PanelOpenEasing] run backwards, so the parts that fade in at
 * their own times do so on time while it opens, and at the same places
 * along it closing, or reversed midway.
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
 * How far the display line has cross-faded into SAMPLE's header at
 * [progress] along the timeline: evenly over the first [PANEL_HEADER_MS] of
 * the opening, so the line's words give way to the header's in place before
 * the panel is much out, and come back over the end of the closing.
 */
internal fun panelHeaderFade(progress: Float): Float = (panelTime(progress) / PANEL_HEADER_MS).coerceIn(0f, 1f)

/**
 * How much of the display line's words shows at [fade] along its cross-fade
 * into SAMPLE's header ([panelHeaderFade]): all of them, gone by its middle,
 * so they and the header's are never over each other in the same row (a
 * fade through).
 */
internal fun lineShown(fade: Float): Float = (1f - fade * 2f).coerceIn(0f, 1f)

/** How much of SAMPLE's header shows at [fade] along the cross-fade: none until its middle, then all of it ([lineShown]). */
internal fun headerShown(fade: Float): Float = (fade * 2f - 1f).coerceIn(0f, 1f)

/**
 * How far the display line on its side has narrowed to the panel's width at
 * [progress] along the timeline, the pads coming aside under it as it does
 * ([SampleMorph]): over the opening's first [SIDE_ACROSS_MS], at the
 * opening's own pace, before it grows down ([morphDown]); so the two never
 * cross.
 */
internal fun morphAcross(progress: Float): Float =
    PanelOpenEasing.transform((panelTime(progress) / SIDE_ACROSS_MS).coerceIn(0f, 1f)).coerceIn(0f, 1f)

/**
 * How far the display line on its side has grown down into the panel at
 * [progress], the pads rising beside it ([SampleMorph]): not at all until it
 * has narrowed ([morphAcross]), then over the rest of the opening, at its
 * pace.
 */
internal fun morphDown(progress: Float): Float =
    PanelOpenEasing.transform(((panelTime(progress) - SIDE_ACROSS_MS) / (PANEL_OPEN_MS - SIDE_ACROSS_MS)).coerceIn(0f, 1f)).coerceIn(0f, 1f)

/** How long the line on its side takes to narrow to the panel's width, at the start of the opening, before it grows down (ms). */
internal const val SIDE_ACROSS_MS = 90

/**
 * How far a part of the panel starting [startMs] into the opening has faded
 * in at [progress] along the timeline: 0 before it starts, then over
 * [PANEL_FADE_MS] to 1.
 */
internal fun panelFade(progress: Float, startMs: Int): Float =
    FadeEasing.transform(((panelTime(progress) - startMs) / PANEL_FADE_MS).coerceIn(0f, 1f))

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

/** How far up the panel starts unrolling: from under the top bar, or (the plate) from under the screen's foot. */
private val UnrollFrom = 38.dp

/** The function keys going: how much they shrink, and how far they sink. */
private const val KEYS_SHRINK = 0.06f
private val KeysSink = 6.dp

/** The panel's corners as it unrolls: its face's ([SampleBodyFace]). */
private val UnrollCorner = BodyCorner

/**
 * The function keys' place on Live's page, where the display line rides in
 * the top bar and so can't grow into the panel ([SampleMorph]), holding the
 * [keys] or the headerless SAMPLE panel ([face], [SampleBodyFace]), as far
 * along as [panel] is (see the notes at the top). Closed, it is the keys and
 * nothing else. Upright the slot is as tall as the keys or the panel;
 * [sideways] (the panel's width on its side) it takes the column's height
 * and is as wide as the keys' column or the panel. The panel unrolls from
 * its top, clipped to the slot so it comes out from under the top bar; the
 * keys fade, shrink and sink as it does.
 */
@Composable
internal fun SampleSlot(
    panel: SamplePanel,
    modifier: Modifier = Modifier,
    sideways: Dp? = null,
    keys: @Composable () -> Unit,
    face: @Composable () -> Unit,
) {
    // Each there while it shows, or is about to: the panel from the moment it opens, the keys from the moment it
    // closes. derivedStateOf: composition hears of the timeline only as these change.
    val showFace by remember(panel) { derivedStateOf { panel.open || panel.progress > 0f } }
    val showKeys by remember(panel) { derivedStateOf { !panel.open || panel.progress < 1f } }
    Layout(
        content = {
            if (showKeys) Box(Modifier.layoutId(SLOT_KEYS)) { keys() }
            // The pane's title is the header's, in the top bar ([SamplePillLine]).
            if (showFace) Box(Modifier.layoutId(SLOT_FACE)) { face() }
        },
        modifier = modifier,
    ) { measurables, constraints ->
        val m = panel.unroll
        val keysM = measurables.firstOrNull { it.layoutId == SLOT_KEYS }
        val faceM = measurables.firstOrNull { it.layoutId == SLOT_FACE }
        val keysP: Placeable?
        val faceP: Placeable?
        val w: Int
        val h: Int
        if (sideways == null) {
            val loose = constraints.copy(minHeight = 0)
            keysP = keysM?.measure(loose)
            // The panel at its own width (a tablet's keeps to the start).
            faceP = faceM?.measure(loose.copy(minWidth = 0))
            w = if (constraints.hasBoundedWidth) constraints.maxWidth else maxOf(keysP?.width ?: 0, faceP?.width ?: 0)
            h = lerpPx(keysP?.height ?: 0, faceP?.height ?: 0, m)
        } else {
            val open = sideways.roundToPx()
            h = constraints.maxHeight
            keysP = keysM?.measure(Constraints(maxWidth = constraints.maxWidth, maxHeight = h))
            faceP = faceM?.measure(Constraints.fixed(open, h))
            w = lerpPx(keysP?.width ?: 0, open, m)
        }
        val keysW = keysP?.width ?: w
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
        }
    }
}

/**
 * Where the display line and its panel go on Live's page on its side, the
 * line on the page ([SampleMorph]): closed, the line [closed] wide (null: the
 * room's) over the function keys' column and the pads beside it, [gap] apart;
 * open, the panel [panel] wide down the left from the line's top, and the
 * pads beside it from the top, all [open] wide (null: the room's). The
 * pads are no taller than [padsClosed] and [padsOpen] (all four groups' pads
 * no taller than wide), where given.
 */
internal class MorphSide(
    val closed: Dp?,
    val open: Dp?,
    val panel: Dp,
    val gap: Dp,
    val padsClosed: Dp? = null,
    val padsOpen: Dp? = null,
)

/**
 * The display line growing into the SAMPLE panel (an addition): the line's
 * own rounded dark shape grows down in place, its words ([line]) giving way
 * to SAMPLE's [header] in the line's row over the first [PANEL_HEADER_MS]
 * (the one fading out, then the other in: [lineShown]);
 * under the header, on the same dark screen, the wave [strip] ([wave] tall,
 * none where 0); then a pale plate with the controls ([plate]) unrolls from
 * under the screen, its outer corners the line's ([corner]) and the screen's
 * lower corners squaring off to meet it, so the two are one body (the
 * device's screen over its keys), with a lip under it. The function [keys]
 * under the line ([gap] under it) fade, shrink and sink away as it comes, as
 * far along as [panel] is.
 *
 * Upright the body is the page's width and grows in height from the line's
 * to the panel's; the pads come after, gliding ([PadsGlide]). On its [side] (the line on the page) the [pads] are inside this layout, and
 * the two take turns so that neither is ever over the other: first the line
 * narrows to the panel's width as the pads come aside, under it, to beside
 * where the panel will be ([morphAcross]); then it grows down the left of
 * the column as the pads rise beside it to the top ([morphDown]).
 *
 * All of it is one timeline read as it lays out and draws: the body's shape
 * is drawn from it ([MorphGeom]), the parts are placed from it, and their
 * fades and clips are graphics-layer lambdas. Each part is measured at a size
 * that doesn't change as it moves, so nothing measures again but the room
 * (the slot's height, the pads' room on its side), and nothing recomposes.
 */
@Composable
internal fun SampleMorph(
    panel: SamplePanel,
    gap: Dp,
    corner: Dp,
    wave: Dp,
    modifier: Modifier = Modifier,
    side: MorphSide? = null,
    line: @Composable () -> Unit,
    keys: @Composable () -> Unit,
    header: @Composable () -> Unit,
    strip: @Composable () -> Unit,
    plate: @Composable () -> Unit,
    pads: @Composable () -> Unit = {},
) {
    val showFace by remember(panel) { derivedStateOf { panel.open || panel.progress > 0f } }
    val showKeys by remember(panel) { derivedStateOf { !panel.open || panel.progress < 1f } }
    val g = remember { MorphGeom() }
    val dark = LocalArcColors.current.display
    val ko = LocalHwColors.current.ko
    Layout(
        content = {
            if (showKeys) Box(Modifier.layoutId(MORPH_KEYS)) { keys() }
            if (side != null) Box(Modifier.layoutId(MORPH_PADS)) { pads() }
            // The body's shape, over the keys going: drawn from the timeline, nothing in it.
            if (showFace) Box(Modifier.layoutId(MORPH_BODY).drawBehind { g.draw(this, panel.unroll, dark, ko.body, ko.edge) })
            if (showKeys) Box(Modifier.layoutId(MORPH_LINE)) { line() }
            if (showFace) {
                Box(Modifier.layoutId(MORPH_HEADER)) { header() }
                if (wave > 0.dp) Box(Modifier.layoutId(MORPH_STRIP)) { strip() }
                Box(Modifier.layoutId(MORPH_PLATE)) { plate() }
            }
        },
        modifier = modifier,
    ) { measurables, constraints ->
        val u = panel.unroll
        val m = { id: String -> measurables.firstOrNull { it.layoutId == id } }
        val gapPx = gap.roundToPx()
        val headerPx = BodyHeader.roundToPx()
        val wavePx = wave.roundToPx()
        val sidePx = WaveSide.roundToPx()
        val lip = CapDy.roundToPx()
        val screenOpen = headerPx + if (wavePx > 0) wavePx + WaveFoot.roundToPx() else 0
        g.side = side != null
        g.corner = corner.toPx()
        g.lip = lip.toFloat()
        g.screenOpen = screenOpen.toFloat()
        val lineP: Placeable?
        val keysP: Placeable?
        val plateP: Placeable?
        val padsP: Placeable?
        val w: Int
        val h: Int
        val padsAt: IntOffset
        if (side == null) {
            w = constraints.maxWidth
            val across = Constraints(minWidth = w, maxWidth = w)
            lineP = m(MORPH_LINE)?.measure(across)
            keysP = m(MORPH_KEYS)?.measure(across)
            plateP = m(MORPH_PLATE)?.measure(across)
            if (lineP != null) g.line = lineP.height.toFloat() else if (g.line == 0f) g.line = headerPx.toFloat()
            if (keysP != null) g.keys = keysP.height
            if (plateP != null) g.plate = plateP.height
            g.closedW = w.toFloat()
            g.openW = w.toFloat()
            g.bodyOpenW = w.toFloat()
            g.room = w.toFloat()
            g.openBottom = screenOpen + g.plate.toFloat()
            val closedH = g.line.roundToInt() + gapPx + g.keys
            val openH = screenOpen + g.plate + lip
            h = lerpPx(closedH, openH, u)
            padsP = null
            padsAt = IntOffset.Zero
        } else {
            w = constraints.maxWidth
            h = constraints.maxHeight
            val closedW = side.closed?.roundToPx()?.coerceAtMost(w) ?: w
            val openW = side.open?.roundToPx()?.coerceAtMost(w) ?: w
            val panelW = side.panel.roundToPx().coerceAtMost(openW)
            val padsGap = side.gap.roundToPx()
            lineP = m(MORPH_LINE)?.measure(Constraints(minWidth = closedW, maxWidth = closedW))
            // Open from the start (the line not yet laid out), the header's row stands in for it.
            if (lineP != null) g.line = lineP.height.toFloat() else if (g.line == 0f) g.line = headerPx.toFloat()
            val under = (h - g.line.roundToInt() - gapPx).coerceAtLeast(0)
            keysP = m(MORPH_KEYS)?.measure(Constraints(maxWidth = closedW, maxHeight = under))
            if (keysP != null) g.keys = keysP.width
            g.closedW = closedW.toFloat()
            g.openW = openW.toFloat()
            g.bodyOpenW = panelW.toFloat()
            g.room = w.toFloat()
            g.openBottom = (h - lip).toFloat()
            plateP = m(MORPH_PLATE)?.measure(Constraints.fixed(panelW, (h - lip - screenOpen).coerceAtLeast(0)))
            // The pads' room: beside the keys under the line, closed; beside the panel from the top, open.
            val fromX = g.keys + padsGap
            val toX = panelW + padsGap
            val fromH = side.padsClosed?.roundToPx()?.let { minOf(it, under) } ?: under
            val toH = side.padsOpen?.roundToPx()?.let { minOf(it, h) } ?: h
            // Aside under the line as it narrows, then up beside it as it grows down: clear of it all the way.
            val across = g.across(u)
            val down = g.down(u)
            val pw = lerpPx(closedW - fromX, openW - toX, across).coerceAtLeast(0)
            val ph = lerpPx(fromH, toH, down).coerceAtLeast(0)
            padsP = m(MORPH_PADS)?.measure(Constraints.fixed(pw, ph))
            padsAt = IntOffset(lerpPx(fromX, toX, across), lerpPx(g.line.roundToInt() + gapPx, 0, down))
        }
        val x0 = g.x0(u).roundToInt()
        val headerP = m(MORPH_HEADER)?.measure(Constraints.fixed(g.bodyOpenW.roundToInt(), headerPx))
        val stripP = m(MORPH_STRIP)?.measure(Constraints.fixed((g.bodyOpenW.roundToInt() - sidePx * 2).coerceAtLeast(0), wavePx))
        val bodyP = m(MORPH_BODY)?.measure(Constraints.fixed(w, h))
        layout(w, h) {
            keysP?.placeWithLayer(x0, g.line.roundToInt() + gapPx) {
                val k = panel.unroll
                alpha = 1f - k
                scaleX = 1f - KEYS_SHRINK * k
                scaleY = scaleX
                translationY = KeysSink.toPx() * k
            }
            padsP?.place(x0 + padsAt.x, padsAt.y)
            bodyP?.place(0, 0)
            lineP?.placeWithLayer(x0, 0) {
                val k = panel.unroll
                alpha = lineShown(panel.header)
                // Within the body's shape as it changes (narrowing on its side, shorter than a tall line).
                clip = k > 0f
                if (k > 0f) shape = g.screenShape(k)
            }
            headerP?.placeWithLayer(x0, 0) {
                // In place: over the middle of the line's row as it fades in, then up into its own row as the line grows.
                val k = panel.unroll
                alpha = headerShown(panel.header)
                translationY = (g.line - headerPx) / 2f * (1f - g.down(k))
            }
            stripP?.placeWithLayer(x0 + sidePx, headerPx) {
                // As much of it as the screen has grown down to.
                clip = true
                shape = ClipRect(top = -headerPx.toFloat(), bottom = g.screen(panel.unroll) - headerPx)
            }
            plateP?.placeWithLayer(x0, 0) {
                // Out from under the screen's foot, a little slide with it, cut off at the body's foot.
                val k = panel.unroll
                val screen = g.screen(k)
                val top = screen - UnrollFrom.toPx() * (1f - g.down(k))
                translationY = top
                clip = k < 1f
                if (k < 1f) shape = UnrollShape(top = screen - top, bottom = g.bottom(k) - top, right = g.bodyW(k), corner = g.corner)
            }
        }
    }
}

private const val MORPH_KEYS = "keys"
private const val MORPH_PADS = "pads"
private const val MORPH_BODY = "body"
private const val MORPH_LINE = "line"
private const val MORPH_HEADER = "header"
private const val MORPH_STRIP = "strip"
private const val MORPH_PLATE = "plate"

/**
 * The growing line's measures as last laid out, px ([SampleMorph]), and its
 * shape at a point on the timeline, worked out where it draws: the room's
 * width, the column's closed and open, the body's open; the line's height,
 * the screen's open (header and wave strip), the body's foot open, the lip,
 * the corners; the keys' height (on its side, width) and the plate's height;
 * and whether it lies on its [side],
 * where it narrows first and grows down after ([morphAcross], [morphDown]).
 */
private class MorphGeom {
    var side = false
    var room = 0f
    var closedW = 0f
    var openW = 0f
    var bodyOpenW = 0f
    var line = 0f
    var screenOpen = 0f
    var openBottom = 0f
    var lip = 0f
    var corner = 0f
    var keys = 0
    var plate = 0

    /** How far across it (and the pads beside it) has gone at [u]: all of the timeline upright, its first leg on its side. */
    fun across(u: Float): Float = if (side) morphAcross(u) else u

    /** How far down it (and the pads beside it) has gone at [u]: all of the timeline upright, its second leg on its side. */
    fun down(u: Float): Float = if (side) morphDown(u) else u

    /** The body's left edge at [u]: the column's, centred in the room as it widens or narrows. */
    fun x0(u: Float): Float = (room - lerpF(closedW, openW, across(u))) / 2f

    /** The body's width at [u]: the line's, to the panel's. */
    fun bodyW(u: Float): Float = lerpF(closedW, bodyOpenW, across(u))

    /** The dark screen's height at [u]: the line's, to the header's and the wave strip's. */
    fun screen(u: Float): Float = lerpF(line, screenOpen, down(u))

    /** The body's foot at [u]: the line's, to under the plate. */
    fun bottom(u: Float): Float = lerpF(line, openBottom, down(u))

    /** How round the screen's lower corners are at [u]: the line's, squaring off as the plate comes out under them. */
    fun screenFoot(u: Float): Float = corner * (1f - ((bottom(u) - screen(u)) / corner.coerceAtLeast(1f)).coerceIn(0f, 1f))

    /** The screen's shape at [u], in the line's own pixels (it sits at the body's left edge). */
    fun screenShape(u: Float): Shape = BodyShape(bodyW(u), screen(u), corner, screenFoot(u))

    private val path = Path()

    /**
     * The body at [u], in [scope] (the room's pixels): nothing closed; else the
     * plate in [body] tucked under the screen's foot, its lip in [edge] under
     * it, and the screen in [dark] over them, its top corners the line's.
     */
    fun draw(scope: DrawScope, u: Float, dark: Color, body: Color, edge: Color) {
        if (u <= 0f) return
        val x = x0(u)
        val w = bodyW(u)
        val screen = screen(u)
        val foot = bottom(u)
        val r = CornerRadius(corner)
        if (foot > screen) {
            val top = (screen - corner).coerceAtLeast(0f)
            path.reset()
            path.addRoundRect(RoundRect(x, top + lip, x + w, foot + lip, CornerRadius.Zero, CornerRadius.Zero, r, r))
            scope.drawPath(path, edge)
            path.reset()
            path.addRoundRect(RoundRect(x, top, x + w, foot, CornerRadius.Zero, CornerRadius.Zero, r, r))
            scope.drawPath(path, body)
        }
        val f = CornerRadius(screenFoot(u))
        path.reset()
        path.addRoundRect(RoundRect(x, 0f, x + w, screen, r, r, f, f))
        scope.drawPath(path, dark)
    }
}

/** [a] to [b] at [f] (0..1). */
private fun lerpF(a: Float, b: Float, f: Float): Float = a + (b - a) * f

/** A rounded rectangle from the top left, [width] by [height], its top corners [top] and lower ones [foot] round. */
private class BodyShape(val width: Float, val height: Float, val top: Float, val foot: Float) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        if (width <= 0f || height <= 0f) return Outline.Rectangle(Rect.Zero)
        val t = CornerRadius(top)
        val f = CornerRadius(foot)
        return Outline.Rounded(RoundRect(0f, 0f, width, height, t, t, f, f))
    }
}

/** Everything from [top] down to [bottom], however wide, in the layer's own pixels. */
private class ClipRect(val top: Float, val bottom: Float) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline =
        if (bottom <= top) Outline.Rectangle(Rect.Zero) else Outline.Rectangle(Rect(0f, top, size.width, bottom))
}

private const val SLOT_KEYS = "keys"
private const val SLOT_FACE = "face"

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
 * [scaleYOf]: the same for the pads' height, where it doesn't follow their
 * width (the upright grid's pads grow taller into spare height, [koBody]);
 * null scales the height as the width.
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
internal fun PadsGlide(panel: SamplePanel, modifier: Modifier, centred: Boolean = true, scaleOf: Density.(w: Int, h: Int) -> Float, scaleYOf: (Density.(w: Int, h: Int) -> Float)? = null, content: @Composable () -> Unit) {
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
        val fromY = scaleYOf?.invoke(this, p.width, p.height) ?: 0f
        val sy = if (scaleYOf == null || at == constraints || fromY <= 0f) s else scaleYOf(this, w, h) / fromY
        layout(w, h) {
            p.placeWithLayer(0, 0) {
                scaleX = s
                scaleY = sy
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
