package dev.arc.ep133.ui.screens

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.Layout
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
import androidx.compose.ui.unit.sp
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.components.rotateVertical
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlin.math.abs
import kotlin.math.roundToInt

/*
 * Live's SAMPLE panel (an addition, after the EP-133's own sampler): a swipe
 * from right to left on the pads unrolls the panel down out of SAMPLE's
 * orange line, in the function keys' place (their row upright, their column
 * on its side), and the pads stay on the page to record into. Its display
 * fades in, then its two rows of controls one after the other; the function
 * keys fade and shrink a little away, and the pads glide down (or, on its
 * side, aside) to make room. A swipe back, Back, or the handle under the
 * panel rolls it back up.
 *
 * The motion is one timeline, [SamplePanel.progress], run by one Animatable
 * at a steady pace: each part takes its own eased share of it ([panelPhase]),
 * as the CSS transitions it was drawn with each have their delay. The
 * panel's height (or width) is read from it while laying out, so the panel
 * and the page around it move on every frame without recomposing: the slot
 * ([SampleSlot]) and the widths around it ([unrollWidth]) measure from the
 * timeline, and the fades, the clip and the keys' shrink are graphics-layer
 * lambdas. On the all-groups page, whose pads keep their size, nothing
 * recomposes at all; one group's big pads, whose print is sized from the
 * room they are given ([KoDeck]), are composed again as they resize.
 * Closing runs the same timeline back, faster and slowing to a stop
 * ([PanelCloseEasing]).
 *
 * The swipe is a trigger, not a drag the panel follows: a pointer handler
 * of its own on the pads ([panelSwipe]), not a pager, because a pad sounds
 * the moment it is touched (holdToPlay takes the press on the way down
 * without consuming it). Once the finger has moved past the touch slop, more
 * across than up or down and the way that opens (or closes) the panel, the
 * swipe takes it and says so ([SamplePanel.took]), and the pad under it cuts
 * its sound short as a scroll would. Far enough across, or flung, it opens
 * or closes the panel. A move more up than across is left alone, so the
 * all-groups page still scrolls, and a knob, which takes the finger from its
 * first touch, keeps it.
 */

/**
 * Where Live's SAMPLE panel is: [progress] 0 with the function keys, 1 with
 * the panel unrolled, in between along the motion's timeline while it opens
 * or closes. [open] is where it rests or is on its way to. [fixed] holds the
 * panel where it started (screenshots): nothing moves it.
 */
@Stable
internal class SamplePanel(start: Float, val fixed: Boolean = false) {
    private val time = Animatable(start)

    /** How far along the timeline: 0 the keys, 1 the panel. Read where it lays out or draws. */
    val progress: Float get() = time.value

    /** Whether the panel rests open, or is opening. */
    var open by mutableStateOf(start >= 0.5f)
        private set

    /** How far the panel has unrolled (and the keys gone, the pads moved): 0 to 1, eased. */
    val unroll: Float get() = panelPhase(progress, 0)

    /** How far the display has faded in. */
    val display: Float get() = panelPhase(progress, PANEL_DISPLAY_AT)

    /** How far the controls' first row (−/source/+, STEREO, LATCH) and, from [second], the second have faded in. */
    fun row(second: Boolean): Float = panelPhase(progress, if (second) PANEL_ROW2_AT else PANEL_ROW1_AT)

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
     * The panel opens ([open]) or closes from wherever it is: along the
     * timeline at a steady pace, [PANEL_OPEN_MS] for all of it opening and
     * [PANEL_CLOSE_MS] closing, or at once with [reduce] (animations off in
     * Android's settings).
     */
    suspend fun go(open: Boolean, reduce: Boolean) {
        if (fixed) return
        this.open = open
        val target = if (open) 1f else 0f
        if (reduce) {
            time.snapTo(target)
            return
        }
        val left = abs(target - time.value)
        time.animateTo(target, tween((left * if (open) PANEL_OPEN_MS else PANEL_CLOSE_MS).roundToInt(), easing = if (open) LinearEasing else PanelCloseEasing))
    }
}

/** How long each part of the panel's motion takes (ms), the panel itself, the keys and the pads with it. */
internal const val PANEL_STEP_MS = 450

/** When the display (ms into the motion), and the controls' first and second rows, start fading in. */
internal const val PANEL_DISPLAY_AT = 120
internal const val PANEL_ROW1_AT = 200
internal const val PANEL_ROW2_AT = 270

/** The whole motion opening, to the second row's end (ms). */
internal const val PANEL_OPEN_MS = PANEL_ROW2_AT + PANEL_STEP_MS

/** The same motion run back, closing: quicker, the panel being put away. */
internal const val PANEL_CLOSE_MS = 480

/**
 * The pace the timeline runs back at, closing: slowing to a stop. Each
 * part's ease, run backwards, ends at its quickest, so at a steady pace the
 * panel would shut the last of the way in a frame or two; slowing down
 * instead, it settles into the line.
 */
internal val PanelCloseEasing: Easing = LinearOutSlowInEasing

/** The motion's ease, the CSS it was drawn with: cubic-bezier(.2, .8, .2, 1). */
private val PanelEasing = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)

/**
 * How far a part of the panel's motion starting [startMs] in has gone at
 * [progress] along the timeline (of [PANEL_OPEN_MS]): 0 before it starts,
 * then eased over [PANEL_STEP_MS] to 1.
 */
internal fun panelPhase(progress: Float, startMs: Int): Float =
    PanelEasing.transform(((progress * PANEL_OPEN_MS - startMs) / PANEL_STEP_MS).coerceIn(0f, 1f))

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

/** How far up the panel starts unrolling, at SAMPLE's line. */
private val UnrollFrom = 38.dp

/** The function keys going: how much they shrink, and how far they sink. */
private const val KEYS_SHRINK = 0.06f
private val KeysSink = 6.dp

/** The handle's row under the panel, and the width a finger finds it in. */
internal val HandleRow = 20.dp
private val HandleWidth = 96.dp

/** How far the handle's row reaches down into the gap under the slot upright, so the pads sit closer under the panel. */
private val HandleTuck = 10.dp

/** The handle's bar. */
private val HandleBarWidth = 36.dp
private val HandleBarHeight = 4.dp

/** How far up the handle goes before the panel rolls up, and a flick up that does it however short (dp per second). */
private val HandleLift = 16.dp
private const val HANDLE_FLING = 600f

/** The panel's corners as it unrolls: its face's ([SamplePanelFace]). */
private val UnrollCorner = 18.dp

/**
 * The function keys' place on Live's page, holding the [keys] or the SAMPLE
 * panel ([face]) with its handle under it, as far along as [panel] is (see
 * the notes at the top). Upright the slot is as tall as the keys, the panel
 * and its handle (which reaches [HandleTuck] down into the gap under it),
 * or in between; [sideways] (the panel's width on its side)
 * it takes the column's height and is as wide as the keys' column or the
 * panel. The panel unrolls from its top, clipped to the slot so it comes
 * out from under SAMPLE's line; the keys fade, shrink and sink as it does.
 * The handle ([onClose]) fades in with the controls' second row; without
 * [handle] (a column too short for it and the controls) there is none, and
 * Back or a swipe close the panel.
 */
@Composable
internal fun SampleSlot(
    panel: SamplePanel,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    sideways: Dp? = null,
    handle: Boolean = true,
    keys: @Composable () -> Unit,
    face: @Composable () -> Unit,
) {
    // Each there while it shows, or is about to: the panel from the moment it opens, the keys from the moment it closes.
    val showFace by remember(panel) { derivedStateOf { panel.open || panel.progress > 0f } }
    val showKeys by remember(panel) { derivedStateOf { !panel.open || panel.progress < 1f } }
    Layout(
        content = {
            if (showKeys) Box(Modifier.layoutId(SLOT_KEYS)) { keys() }
            if (showFace) {
                Box(Modifier.layoutId(SLOT_FACE).semantics { paneTitle = MirrorText.SAMPLE_TAG }) { face() }
                if (handle) Box(Modifier.layoutId(SLOT_HANDLE)) { PanelHandle(onClose) }
            }
        },
        modifier = modifier,
    ) { measurables, constraints ->
        val m = panel.unroll
        val handleH = if (handle) HandleRow.roundToPx() else 0
        val keysM = measurables.firstOrNull { it.layoutId == SLOT_KEYS }
        val faceM = measurables.firstOrNull { it.layoutId == SLOT_FACE }
        val handleM = measurables.firstOrNull { it.layoutId == SLOT_HANDLE }
        val keysP: androidx.compose.ui.layout.Placeable?
        val faceP: androidx.compose.ui.layout.Placeable?
        val w: Int
        val h: Int
        if (sideways == null) {
            val loose = constraints.copy(minHeight = 0)
            keysP = keysM?.measure(loose)
            // The panel at its own width (a tablet's keeps to the start), its handle centred under it.
            faceP = faceM?.measure(loose.copy(minWidth = 0))
            w = if (constraints.hasBoundedWidth) constraints.maxWidth else maxOf(keysP?.width ?: 0, faceP?.width ?: 0)
            // The handle's row partly in the gap under the slot, past its bottom (nothing there clips it).
            val tuck = if (handle) HandleTuck.roundToPx() else 0
            h = lerpPx(keysP?.height ?: 0, (faceP?.height ?: 0) + handleH - tuck, m)
        } else {
            val open = sideways.roundToPx()
            h = constraints.maxHeight
            keysP = keysM?.measure(constraints.copy(minWidth = 0))
            faceP = faceM?.measure(Constraints.fixed(open, (h - handleH).coerceAtLeast(0)))
            w = lerpPx(keysP?.width ?: 0, open, m)
        }
        val faceW = faceP?.width ?: w
        val handleP = handleM?.measure(Constraints(maxWidth = faceW, maxHeight = handleH))
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
                    shape = UnrollShape(top = drop, bottom = faceP.height * u, right = (if (sideways == null) faceP.width else lerpPx(keysP?.width ?: 0, faceP.width, u)).toFloat(), corner = UnrollCorner.toPx())
                } else {
                    clip = false
                }
            }
            handleP?.placeWithLayer((faceW - handleP.width) / 2, faceP?.height ?: 0) {
                alpha = panel.row(second = true)
            }
        }
    }
}

private const val SLOT_KEYS = "keys"
private const val SLOT_FACE = "face"
private const val SLOT_HANDLE = "handle"

/** [a] to [b] at [f] (0..1), in whole pixels. */
private fun lerpPx(a: Int, b: Int, f: Float): Int = (a + (b - a) * f).roundToInt()

/**
 * The part of the unrolling panel that shows, in its layer's own pixels:
 * from [top] down to [bottom] (nothing where that is none), [right] wide,
 * its lower corners rounded [corner], as the panel's own are.
 */
private class UnrollShape(val top: Float, val bottom: Float, val right: Float, val corner: Float) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        if (bottom <= top || right <= 0f) return Outline.Rectangle(androidx.compose.ui.geometry.Rect.Zero)
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
 * The handle under the SAMPLE panel: a short bar a tap, or a drag up past
 * [HandleLift] (or a flick up), rolls the panel back up with ([onClose]). A
 * screen reader hears it as the button [MirrorText.CLOSE_SAMPLE].
 */
@Composable
private fun PanelHandle(onClose: () -> Unit) {
    val c = LocalArcColors.current
    val close by rememberUpdatedState(onClose)
    Box(
        Modifier
            .size(HandleWidth, HandleRow)
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown()
                    val tracker = VelocityTracker()
                    tracker.addPosition(down.uptimeMillis, down.position)
                    var moved = false
                    while (true) {
                        val ch = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
                        tracker.addPosition(ch.uptimeMillis, ch.position)
                        if (!ch.pressed) {
                            // A tap, or a flick up.
                            if (!moved || -tracker.calculateVelocity().y / density >= HANDLE_FLING) close()
                            break
                        }
                        val d = ch.position - down.position
                        if (d.getDistance() > viewConfiguration.touchSlop) moved = true
                        if (moved) ch.consume()
                        if (-d.y >= HandleLift.toPx()) {
                            close()
                            break
                        }
                    }
                }
            }
            .clearAndSetSemantics {
                role = Role.Button
                contentDescription = MirrorText.CLOSE_SAMPLE
                onClick { close(); true }
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(HandleBarWidth, HandleBarHeight)) {
            drawRoundRect(c.graphite.copy(alpha = 0.45f), cornerRadius = CornerRadius(size.height / 2f))
        }
    }
}

/** The sliver of the SAMPLE panel at the pads' right edge, and the gap before it. */
internal val PeekWidth = 10.dp
internal val PeekGap = 6.dp

/** All the room the peek takes beside the pads. */
internal val PeekRoom = PeekWidth + PeekGap

/** A peek shorter than this has no room for SAMPLE printed down it: the orange mark alone. */
private val PeekWordHeight = 96.dp

/**
 * [content] with a [peek] of the SAMPLE panel beside it on the right, as
 * tall as the content, which gets the width less [PeekRoom] (the all-groups
 * pages' grids fill it; the big grid's body keeps its own). With [share],
 * only that share of it (0..1, read while measuring, so nothing recomposes
 * for it): the all-groups page gives it back to its pads as the panel
 * unrolls and the peek fades, the peek then past the row's edge, unseen.
 */
@Composable
internal fun PeekRow(peek: @Composable () -> Unit, modifier: Modifier = Modifier, share: (() -> Float)? = null, content: @Composable () -> Unit) {
    Layout(content = { Box { content() }; Box { peek() } }, modifier = modifier) { measurables, constraints ->
        val room = (PeekRoom.toPx() * (share?.invoke() ?: 1f)).roundToInt()
        val c = measurables[0].measure(constraints.copy(minWidth = 0, maxWidth = (constraints.maxWidth - room).coerceAtLeast(0)))
        val p = measurables[1].measure(Constraints.fixed(PeekWidth.roundToPx(), c.height))
        layout(c.width + room, c.height) {
            c.place(0, 0)
            p.place(c.width + PeekGap.roundToPx(), 0)
        }
    }
}

/**
 * The SAMPLE panel's sliver at the pads' right edge (an addition, after the
 * pocket operator app's next page peeking in): a pale face, its orange mark
 * and, where it is tall enough, SAMPLE printed down it. A tap opens the
 * panel ([onOpen]), as the swipe does; a screen reader hears
 * [MirrorText.OPEN_SAMPLE]. It fades as the panel opens and is gone while
 * the panel is open. The first-run guide points at it.
 */
@Composable
internal fun SamplePeek(onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    val ko = LocalHwColors.current.ko
    val panel = LocalSamplePanel.current
    val open = panel?.open == true
    Box(
        modifier
            .graphicsLayer { alpha = peekShown(panel?.progress ?: 0f) }
            .coachMark("live.sample", CoachText.SAMPLE, c.signal, c.onSignal)
            .then(
                if (open) {
                    Modifier.clearAndSetSemantics { }
                } else {
                    Modifier
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onOpen)
                        .clearAndSetSemantics {
                            role = Role.Button
                            contentDescription = MirrorText.OPEN_SAMPLE
                            onClick { onOpen(); true }
                        }
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.matchParentSize()) {
            val r = CornerRadius(PeekCorner.toPx())
            val edge = 2.dp.toPx()
            drawRoundRect(ko.edge, topLeft = Offset(edge * 0.6f, edge), size = Size(size.width - edge * 0.6f, size.height - edge), cornerRadius = r)
            drawRoundRect(ko.body, size = Size(size.width - edge * 0.6f, size.height - edge), cornerRadius = r)
            // The mark: SAMPLE's orange, a short bar low on the sliver.
            val markW = 3.dp.toPx()
            val markH = 14.dp.toPx()
            drawRoundRect(
                c.signal,
                topLeft = Offset((size.width - edge * 0.6f - markW) / 2f, size.height * 0.72f - markH / 2f),
                size = Size(markW, markH),
                cornerRadius = CornerRadius(markW / 2f),
            )
        }
        PeekWord(MirrorText.SAMPLE_TAG)
    }
}

/**
 * How much of the peek shows [away] into the panel's motion (0 closed, 1
 * open): all of it closed, gone by [PEEK_FADE] of the way.
 */
internal fun peekShown(away: Float): Float = (1f - away / PEEK_FADE).coerceIn(0f, 1f)

/** How far into the panel's motion the peek has faded out. */
private const val PEEK_FADE = 0.25f

/** The sliver's rounded corners. */
private val PeekCorner = 6.dp

/** [word] printed down the peek, read from the bottom up, where the peek is tall enough. */
@Composable
private fun PeekWord(word: String) {
    val ko = LocalHwColors.current.ko
    BoxWithConstraints(Modifier.fillMaxSize().clearAndSetSemantics { }) {
        if (maxHeight < PeekWordHeight) return@BoxWithConstraints
        Text(
            word.uppercase(),
            style = ArcType.semi.copy(fontSize = 7.sp, lineHeight = 1.em, letterSpacing = 0.12.em),
            color = ko.label,
            maxLines = 1,
            softWrap = false,
            // Above the mark, a third of the way down.
            modifier = Modifier.align(BiasAlignment(0f, -0.3f)).rotateVertical(),
        )
    }
}
