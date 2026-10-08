package dev.arc.ep133.ui.screens

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
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
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

/*
 * Live's two cards (an addition, after the pocket operator app's pages): the
 * pads card and, beside it, the SAMPLE card. A swipe from right to left on
 * the pads turns the pads card away and brings the SAMPLE card in; one from
 * left to right, or Back, turns it back. The cards tilt a little as they go,
 * as the app's do, and a sliver of the other card peeks in at the edge.
 *
 * The swipe is a pointer handler of its own on the cards' parent rather
 * than a HorizontalPager: a pad sounds the moment it is touched (holdToPlay
 * takes the press on the way down without consuming it), and a pager would
 * either hold that press back until it knew the move wasn't a swipe or take
 * the finger without the pad knowing. Here the pad sounds at once; once the
 * finger has moved past the touch slop, more across than up or down, the
 * swipe takes it and says so ([CardTurn.took]), and the pad cuts its sound
 * short as a scroll would. A move more up than across is left alone, so the
 * all-groups page still scrolls, and a knob, which takes the finger from its
 * first touch, keeps it.
 */

/**
 * Where Live's two cards are: [progress] 0 with the pads card in front, 1
 * with the SAMPLE card, in between while a finger turns them or they settle.
 * [page] is the card a turn rests on, or is on its way to. [fixed] holds the
 * cards where they started (screenshots): nothing turns them.
 */
@Stable
internal class CardTurn(start: Float, val fixed: Boolean = false) {
    private val settling = Animatable(start)
    private var drag by mutableFloatStateOf(start)

    /** Whether a finger is turning the cards now. */
    var dragging by mutableStateOf(false)
        private set

    /** The card the cards rest on, or are settling on: 0 the pads, 1 SAMPLE. */
    var page by mutableFloatStateOf(if (start >= 0.5f) 1f else 0f)
        private set

    /** How far the turn is: 0 the pads card, 1 the SAMPLE card. Read where it draws. */
    val progress: Float get() = if (dragging) drag else settling.value

    // The pointers a swipe took off the pads: their press is cut short, as a scroll's is.
    private val swiped = HashSet<PointerId>()

    /** Whether a swipe took the finger [id] (a pad's press under it then stops sounding: [holdToPlay]). */
    fun took(id: PointerId): Boolean = id in swiped

    /** A finger ([id]) starts turning the cards from where they are now. */
    fun take(id: PointerId) {
        drag = settling.value
        dragging = true
        swiped += id
    }

    /** The finger turned the cards to [p]. */
    fun dragTo(p: Float) {
        drag = p.coerceIn(0f, 1f)
    }

    /** The finger [id] lifted (or the gesture ended): its pads are theirs again. */
    fun lifted(id: PointerId) {
        swiped -= id
    }

    /**
     * The cards left the screen under a finger (the phone turned, and the
     * other layout's cards took over): the turn is over without landing,
     * the cards back where they rested, so the new cards' [settle] can
     * move them again.
     */
    fun dropped() {
        dragging = false
        swiped.clear()
    }

    /**
     * The cards settle on [target] (0 the pads, 1 SAMPLE), from where the
     * finger left them, at [velocity] (turns per second): a spring, or at
     * once with [reduce] (animations off in Android's settings).
     */
    suspend fun settle(target: Float, velocity: Float = 0f, reduce: Boolean = false) {
        if (fixed) return
        page = target
        if (dragging) {
            settling.snapTo(drag)
            dragging = false
        }
        if (reduce) {
            settling.snapTo(target)
        } else {
            settling.animateTo(target, spring(dampingRatio = CARD_DAMPING, stiffness = Spring.StiffnessMediumLow), initialVelocity = velocity)
        }
    }
}

/** How far across a turn has to go to land on the other card (of the cards' width), if not flung. */
internal const val CARD_TURN_AT = 0.3f

/** A fling faster than this (dp per second) lands on the card it flings towards, however short. */
internal const val CARD_FLING = 1000f

/** How far the cards tilt (degrees) and shrink at the height of a turn. */
private const val CARD_TILT = 4f
private const val CARD_SHRINK = 0.04f

/** The settling spring's damping: a touch of overshoot, as a card laid down has. */
private const val CARD_DAMPING = 0.85f

/** The gap between the two cards while they turn. */
private val CardGap = 16.dp

/** The sliver of the other card at a card's edge, and the gap before it. */
internal val PeekWidth = 10.dp
internal val PeekGap = 6.dp

/** All the room the peek takes beside a card. */
internal val PeekRoom = PeekWidth + PeekGap

/** A peek shorter than this has no room for SAMPLE printed down it: the orange mark alone. */
private val PeekWordHeight = 96.dp

/**
 * The card a turn let go of lands on: begun from [from] (0 the pads, 1
 * SAMPLE), at [progress], the finger leaving at [velocity] dp per second
 * (positive to the right). A fling past [CARD_FLING] goes the way it is
 * flung; otherwise past [CARD_TURN_AT] of the way it turns, short of it it
 * springs back.
 */
internal fun cardTarget(from: Float, progress: Float, velocity: Float): Float = when {
    velocity <= -CARD_FLING -> 1f
    velocity >= CARD_FLING -> 0f
    from < 0.5f -> if (progress >= CARD_TURN_AT) 1f else 0f
    else -> if (progress <= 1f - CARD_TURN_AT) 0f else 1f
}

/** Whether Android's animations are off (Settings, animator duration scale 0): the cards then snap, without the tilt. */
@Composable
internal fun reducedMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false)
    }
}

/**
 * Live's pads card ([pads]) and the SAMPLE card ([sample]) in one place, as
 * [turn] has them (see the notes at the top). A swipe that lands on SAMPLE
 * settles the cards there and calls [onOpen], one back [onClose], with a
 * light tick ([haptics]): the two only change the mode, the swipe having
 * set the cards going at the finger's speed. [open] (SAMPLE mode as the
 * controller has it) turning on or off settles the cards on its card, so
 * leaving the mode another way (Back, KEYS, the tab) turns them back.
 *
 * The SAMPLE card is as big as the pads card, or [sampleMin] tall where
 * the pads card's height is its own (the scrolling page, its grid taller or
 * shorter than the screen left); between the two the height follows the
 * turn. It is only there while it shows. Screen readers turn the cards
 * with the peeks, buttons named [MirrorText.OPEN_SAMPLE] and
 * [MirrorText.CLOSE_SAMPLE] ([SamplePeek], [PadsPeek]); the SAMPLE card is
 * announced by its title as it opens.
 */
@Composable
internal fun LiveCards(
    turn: CardTurn,
    open: Boolean,
    onOpen: () -> Unit,
    onClose: () -> Unit,
    haptics: Boolean,
    modifier: Modifier = Modifier,
    sampleMin: Dp? = null,
    pads: @Composable () -> Unit,
    sample: @Composable () -> Unit,
) {
    val reduce = reducedMotion()
    val scope = rememberCoroutineScope()
    val feel = LocalHapticFeedback.current
    val opened by rememberUpdatedState(onOpen)
    val closed by rememberUpdatedState(onClose)
    val tick by rememberUpdatedState(haptics)
    LaunchedEffect(turn, open) {
        if (!turn.dragging && turn.page != (if (open) 1f else 0f)) turn.settle(if (open) 1f else 0f, reduce = reduce)
    }
    // Gone mid-turn (the phone turned: the other layout has cards of its own), the turn is dropped, so
    // the new cards aren't left waiting on a finger that is no longer theirs.
    DisposableEffect(turn) {
        onDispose { turn.dropped() }
    }
    // The SAMPLE card is there only while some of it shows. The pads card stays (its height is the
    // cards'), but isn't placed while the SAMPLE card covers it, so it neither draws nor takes a touch.
    val showSample by remember(turn) { derivedStateOf { turn.dragging || turn.progress > 0f } }
    val showPads by remember(turn) { derivedStateOf { turn.dragging || turn.progress < 1f } }
    val tilt = if (reduce) 0f else CARD_TILT
    val shrink = if (reduce) 0f else CARD_SHRINK
    // A turn landing on a card it didn't start from: the mode follows, with a tick.
    val land = { from: Float, target: Float ->
        if (target != from) {
            if (tick) feel.performHapticFeedback(HapticFeedbackType.SegmentTick)
            if (target == 1f) opened() else closed()
        }
    }
    Layout(
        content = {
            Box(Modifier.layoutId(PADS_CARD)) { CompositionLocalProvider(LocalCardTurn provides turn) { pads() } }
            if (showSample) {
                Box(
                    Modifier
                        .layoutId(SAMPLE_CARD)
                        .semantics { paneTitle = MirrorText.SAMPLE_TAG },
                ) { CompositionLocalProvider(LocalCardTurn provides turn) { sample() } }
            }
        },
        modifier = modifier.pointerInput(turn, reduce) {
            if (turn.fixed) return@pointerInput
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                val from = turn.page
                val width = size.width.toFloat().coerceAtLeast(1f)
                val tracker = VelocityTracker()
                tracker.addPosition(down.uptimeMillis, down.position)
                var claimed = false
                var landed = false
                var moved = Offset.Zero
                var startX = 0f
                var startP = from
                try {
                    while (true) {
                        val ch = awaitPointerEvent(PointerEventPass.Main).changes.firstOrNull { it.id == down.id } ?: break
                        tracker.addPosition(ch.uptimeMillis, ch.position)
                        if (claimed) {
                            ch.consume()
                            if (!ch.pressed) {
                                val v = tracker.calculateVelocity().x
                                val target = cardTarget(from, turn.progress, v / density)
                                landed = true
                                scope.launch { turn.settle(target, velocity = -v / width, reduce = reduce) }
                                land(from, target)
                                break
                            }
                            turn.dragTo(startP - (ch.position.x - startX) / width)
                            continue
                        }
                        // Lifted, or a knob or a scroll took the finger first.
                        if (!ch.pressed || ch.isConsumed) break
                        moved += ch.positionChange()
                        if (moved.getDistance() <= viewConfiguration.touchSlop) continue
                        // Past the slop: more across than up or down, and towards the other card, it is a turn.
                        val p = turn.progress
                        val towards = when {
                            p <= 0f -> moved.x < 0f
                            p >= 1f -> moved.x > 0f
                            else -> true
                        }
                        if (abs(moved.x) <= abs(moved.y) || !towards) break
                        claimed = true
                        turn.take(down.id)
                        startX = ch.position.x
                        startP = turn.progress
                        ch.consume()
                    }
                } finally {
                    // The finger went another way (the cards left the screen): they settle on the nearer card.
                    if (claimed && !landed) {
                        val target = if (turn.progress >= 0.5f) 1f else 0f
                        scope.launch { turn.settle(target, reduce = reduce) }
                        land(from, target)
                    }
                    turn.lifted(down.id)
                }
            }
        },
    ) { measurables, constraints ->
        val padsM = measurables.first { it.layoutId == PADS_CARD }
        val sampleM = measurables.firstOrNull { it.layoutId == SAMPLE_CARD }
        val padsP = padsM.measure(constraints)
        val w = if (constraints.hasBoundedWidth) constraints.maxWidth else padsP.width
        val h0 = padsP.height
        val h1 = (sampleMin?.roundToPx() ?: h0).coerceAtMost(if (constraints.hasBoundedHeight) constraints.maxHeight else Int.MAX_VALUE)
        val sampleP = sampleM?.measure(Constraints.fixed(w, h1))
        // Another height than the pads card's (the scrolling page): the height follows the turn.
        val h = if (sampleP == null || h1 == h0) h0 else (h0 + (h1 - h0) * turn.progress).roundToInt()
        val gap = CardGap.toPx()
        layout(w, h) {
            if (showPads) {
                padsP.placeWithLayer(0, 0) {
                    val p = turn.progress
                    translationX = -p * (w + gap)
                    rotationZ = -tilt * p
                    scaleX = 1f - shrink * p
                    scaleY = scaleX
                    transformOrigin = TransformOrigin(0.5f, 1f)
                }
            }
            sampleP?.placeWithLayer(0, 0) {
                val q = 1f - turn.progress
                translationX = q * (w + gap)
                rotationZ = tilt * q
                scaleX = 1f - shrink * q
                scaleY = scaleX
                transformOrigin = TransformOrigin(0.5f, 1f)
            }
        }
    }
}

/** The cards' turn, for the pads on them: a press a swipe takes is cut short ([holdToPlay]). */
internal val LocalCardTurn = staticCompositionLocalOf<CardTurn?> { null }

private const val PADS_CARD = "pads"
private const val SAMPLE_CARD = "sample"

/**
 * [content] with a [peek] of the other card beside it on the right, as tall
 * as the content, which gets the width less [PeekRoom] (the all-groups
 * pages' grids fill it; the big grid's body keeps its own).
 */
@Composable
internal fun PeekRow(peek: @Composable () -> Unit, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Layout(content = { Box { content() }; Box { peek() } }, modifier = modifier) { measurables, constraints ->
        val room = PeekRoom.roundToPx()
        val c = measurables[0].measure(constraints.copy(minWidth = 0, maxWidth = (constraints.maxWidth - room).coerceAtLeast(0)))
        val p = measurables[1].measure(Constraints.fixed(PeekWidth.roundToPx(), c.height))
        layout(c.width + room, c.height) {
            c.place(0, 0)
            p.place(c.width + PeekGap.roundToPx(), 0)
        }
    }
}

/**
 * The SAMPLE card's sliver at the pads card's right edge (an addition, after
 * the pocket operator app's next card peeking in): the card's pale face, its
 * orange mark and, where it is tall enough, SAMPLE printed down it. A tap
 * opens it ([onOpen]), as the swipe does; a screen reader hears
 * [MirrorText.OPEN_SAMPLE]. The first-run guide points at it.
 */
@Composable
internal fun SamplePeek(onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    val ko = LocalHwColors.current.ko
    val turn = LocalCardTurn.current
    Box(
        modifier
            .graphicsLayer { alpha = peekShown(turn?.progress ?: 0f) }
            .coachMark("live.sample", CoachText.SAMPLE, c.signal, c.onSignal)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onOpen)
            .clearAndSetSemantics {
                role = Role.Button
                contentDescription = MirrorText.OPEN_SAMPLE
                onClick { onOpen(); true }
            },
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
 * The pads card's sliver at the SAMPLE card's left edge: the pads card's
 * face with the edges of its dark pads. A tap turns back to it ([onClose]);
 * a screen reader hears [MirrorText.CLOSE_SAMPLE].
 */
@Composable
internal fun PadsPeek(onClose: () -> Unit, modifier: Modifier = Modifier) {
    val ko = LocalHwColors.current.ko
    val turn = LocalCardTurn.current
    Box(
        modifier
            .graphicsLayer { alpha = peekShown(1f - (turn?.progress ?: 1f)) }
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose)
            .clearAndSetSemantics {
                role = Role.Button
                contentDescription = MirrorText.CLOSE_SAMPLE
                onClick { onClose(); true }
            },
    ) {
        Canvas(Modifier.matchParentSize()) {
            val r = CornerRadius(PeekCorner.toPx())
            val edge = 2.dp.toPx()
            drawRoundRect(ko.edge, topLeft = Offset(edge * 0.6f, edge), size = Size(size.width - edge * 0.6f, size.height - edge), cornerRadius = r)
            drawRoundRect(ko.body, size = Size(size.width - edge * 0.6f, size.height - edge), cornerRadius = r)
            // Four rows of pads, their right ends showing.
            val top = size.height * 0.12f
            val step = (size.height * 0.8f) / 4f
            val padH = step * 0.62f
            for (row in 0 until 4) {
                drawRoundRect(
                    ko.darkFace,
                    topLeft = Offset(0f, top + row * step + (step - padH)),
                    size = Size(size.width * 0.55f, padH),
                    cornerRadius = CornerRadius(2.dp.toPx()),
                )
            }
        }
    }
}

/**
 * How much of a peek shows [away] into a turn from its own card (0 resting
 * there, 1 at the other): all of it at rest, gone by [PEEK_FADE] of the way,
 * so mid-turn the two cards pass without the slivers between them.
 */
internal fun peekShown(away: Float): Float = (1f - away / PEEK_FADE).coerceIn(0f, 1f)

/** How far into a turn the peeks have faded out. */
private const val PEEK_FADE = 0.25f

/** A sliver's rounded corners. */
private val PeekCorner = 6.dp

/** [word] printed down a peek, read from the bottom up, where the peek is tall enough. */
@Composable
private fun PeekWord(word: String) {
    val ko = LocalHwColors.current.ko
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize().clearAndSetSemantics { }) {
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
