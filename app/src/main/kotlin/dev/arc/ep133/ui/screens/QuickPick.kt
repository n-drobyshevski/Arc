package dev.arc.ep133.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/*
 * Hold to pick, on KEYS' scale and octave words ([PickWord]'s quick): held still for
 * [QuickPick.HOLD_MS], the word's choices rise in a vertical half-circle beside the thumb, toward
 * the screen's middle, in the list's order top to bottom (the octaves high to low, so up is higher:
 * [QuickPick.option]). A small move toward one lights it (the direction from where the finger went
 * down picks, not what is under it), and letting go picks it; letting go in the dead zone under the
 * thumb keeps the choice. Ported from the prototype the
 * preset "C1 · Aim" was chosen in.
 *
 * The layout and the pick are plain numbers here so they can be tested: px, with the dp below
 * turned into them by the caller (density 1 reads them as dp). Window coordinates throughout: the
 * press point, the finger and the window's edges, so a word turned on its side opens its fan
 * upright. [QuickPickFan] draws what they give.
 */
internal object QuickPick {
    /** How long the word is held still before the fan opens; a move past the touch slop first is a flick. */
    const val HOLD_MS = 280L

    /** A row: the choices stack this far apart. */
    val GAP = 38.dp

    /** The least a row shrinks to where the window is short (a phone on its side); below that, the list. */
    val MIN_GAP = 30.dp

    /** The ring under the thumb: letting go inside it keeps the choice. */
    val DEAD = 18.dp

    /** How far the half-circle bows out at the thumb's height (the prototype's "medium"). */
    val RADIUS = 128.dp

    /** The room a chip takes beyond its point on the arc, kept on screen. */
    val CHIP_ROOM = 150.dp

    /** The least a chip sits out from the thumb, at the half-circle's ends (clear of the dead zone). */
    val MIN_DX = 40.dp

    /** The narrowest the half-circle gets, where there is little room toward the middle. */
    val MIN_RX = 56.dp

    /** The room kept between the outermost rows' middles and the window's top and foot (half a chip, and a little). */
    val EDGE = 30.dp

    /** A choice's place: [i] its index in the list, [dx] out from the press point toward the middle (never back), [dy] down from it. */
    data class Slot(val i: Int, val dx: Float, val dy: Float) {
        /** The way to it from the press point, in degrees: 0 straight out, −90 straight up, 90 straight down. */
        val angle: Float get() = Math.toDegrees(atan2(dy, dx).toDouble()).toFloat()
    }

    /**
     * An open fan: the press point ([x], [y], window px), the way it opens ([dir] 1 rightward, −1
     * leftward), the row it was laid out with ([gap]), and its [slots] in the list's order.
     */
    data class Fan(val x: Float, val y: Float, val dir: Int, val gap: Float, val slots: List<Slot>) {
        /** A chip's point on the arc, in window px: its left end's middle (its right end's, opening leftward). */
        fun at(s: Slot) = Offset(x + dir * s.dx, y + s.dy)
    }

    /**
     * The choice (its index in the list of [n]) the fan's [row] shows, top to bottom: the list's
     * order, or with [reversed] its end first (the octaves high to low, so up is higher). Its own
     * inverse, so it also gives the row a choice sits on.
     */
    fun option(row: Int, n: Int, reversed: Boolean): Int = if (reversed) n - 1 - row else row

    /** Whole rows of [gap] in [room] (a hair's grace, so a gap worked out from the room fits it). */
    private fun whole(room: Float, gap: Float): Int = if (room <= 0f) 0 else floor(room / gap + 1e-3f).toInt()

    /**
     * The rows' offsets down from the thumb ([n] choices, [gap] apart, in the list's order): the last
     * sits as low as [roomBelow] allows (whole rows: the thumb stays level with a row), never more
     * than half the list below the thumb, so the stack is lifted where its foot doesn't fit. Where
     * its head wouldn't fit in [roomAbove] (a word high on the screen), it comes down as far as the
     * room below allows instead.
     */
    fun rows(n: Int, roomBelow: Float, gap: Float, roomAbove: Float = Float.POSITIVE_INFINITY): List<Float> {
        if (n <= 0) return emptyList()
        val fits = min(whole(roomBelow, gap), n - 1)
        var below = min(fits, (n - 1) / 2)
        val head = if (roomAbove == Float.POSITIVE_INFINITY) n - 1 else whole(roomAbove, gap)
        if (n - 1 - below > head) below = min(fits, n - 1 - head)
        val at = n - 1 - below
        return List(n) { (it - at) * gap }
    }

    /**
     * The row for [n] choices between [roomAbove] and [roomBelow] the thumb: [gap], or as much less
     * as the stack needs to fit (a phone on its side), down to [minGap]; null where even that doesn't
     * fit, and the hold opens the ordinary list instead.
     */
    fun fit(n: Int, roomAbove: Float, roomBelow: Float, gap: Float, minGap: Float): Float? {
        if (n <= 1) return gap
        if (whole(roomAbove, gap) + whole(roomBelow, gap) >= n - 1) return gap
        // The widest row any split of the n − 1 rows (some above the thumb, the rest below) allows.
        var best = 0f
        for (below in 0..n - 1) {
            val above = n - 1 - below
            val up = if (above == 0) Float.POSITIVE_INFINITY else roomAbove / above
            val down = if (below == 0) Float.POSITIVE_INFINITY else roomBelow / below
            best = max(best, min(up, down))
        }
        val g = min(gap, best)
        return g.takeIf { it >= minGap }
    }

    /**
     * The rows ([rows]' offsets, [gap] apart) on a half-ellipse round the thumb: as tall as the rows
     * need (ry, the farthest row's offset and half a row), [rx] wide. Each row sits out
     * rx·√(1 − (dy/ry)²), and never less than [minDx], so the ends stay clear of the thumb.
     */
    fun place(rows: List<Float>, rx: Float, gap: Float, minDx: Float): List<Slot> {
        if (rows.isEmpty()) return emptyList()
        val ry = rows.maxOf { abs(it) } + gap / 2
        return rows.mapIndexed { i, dy ->
            val t = dy / ry
            Slot(i, max(minDx, rx * sqrt(max(0f, 1f - t * t))), dy)
        }
    }

    /**
     * The choice the finger points at, [dx] out (toward the middle) and [dy] down from the press
     * point: null inside [dead] (letting go keeps the choice), else the slot whose way from the press
     * point is nearest the finger's. A pull back past the thumb reads as straight up or straight
     * down, so the ends are a pull back away too.
     */
    fun pick(dx: Float, dy: Float, slots: List<Slot>, dead: Float): Slot? {
        if (slots.isEmpty() || dx * dx + dy * dy <= dead * dead) return null
        val a = if (dx < 0f) {
            if (dy < 0f) -90f else 90f
        } else {
            Math.toDegrees(atan2(dy, max(dx, 0.0001f)).toDouble()).toFloat()
        }
        return slots.minBy { abs(it.angle - a) }
    }

    /**
     * The fan for [n] choices held at ([x], [y]) in a window whose safe area is [window] (px, at
     * [density]): toward the window's middle, the rows fitted between the safe top and foot, the
     * half-circle as wide as [RADIUS] and the room toward the middle less a chip's ([CHIP_ROOM])
     * allow. Null where the rows don't fit even at [MIN_GAP]: the hold opens the ordinary list.
     */
    fun fan(n: Int, x: Float, y: Float, window: Rect, density: Float): Fan? {
        if (n <= 0) return null
        val edge = EDGE.value * density
        val above = y - window.top - edge
        val below = window.bottom - y - edge
        val gap = fit(n, above, below, GAP.value * density, MIN_GAP.value * density) ?: return null
        val dir = if (x - window.left < window.width / 2) 1 else -1
        val room = (if (dir > 0) window.right - x else x - window.left) - CHIP_ROOM.value * density
        val rx = max(MIN_RX.value * density, min(RADIUS.value * density, room))
        return Fan(x, y, dir, gap, place(rows(n, below, gap, above), rx, gap, MIN_DX.value * density))
    }
}

/**
 * The open fan ([QuickPick.fan]) over the window: a scrim, the dead-zone ring at the press point,
 * the faint dashed guide through the chips, and while a choice is lit a line from the press point to
 * the [finger] (window px, read as it moves). The chips are pale caps named by [names], [current]
 * ringed in signal orange, [lit] navy and a little larger. It fills its parent, which sits at the
 * window's top left (a Popup the window's size, or a screenshot's frame). [fade]: a short fade in
 * (off under reduced motion, and in a still).
 */
@Composable
internal fun QuickPickFan(
    fan: QuickPick.Fan,
    names: List<String>,
    current: Int,
    lit: Int?,
    modifier: Modifier = Modifier,
    finger: () -> Offset? = { null },
    fade: Boolean = true,
) {
    val c = LocalArcColors.current
    val shown = remember { Animatable(if (fade) 0f else 1f) }
    if (fade) LaunchedEffect(Unit) { shown.animateTo(1f, tween(120, easing = LinearOutSlowInEasing)) }
    // Only a picture: TalkBack has the word's own Next and Previous, and the list.
    Box(modifier.fillMaxSize().clearAndSetSemantics {}.graphicsLayer { alpha = shown.value }) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(c.shell.copy(alpha = 0.6f))
            val centre = Offset(fan.x, fan.y)
            val guide = Path()
            fan.slots.forEachIndexed { k, s ->
                val p = fan.at(s)
                if (k == 0) guide.moveTo(p.x, p.y) else guide.lineTo(p.x, p.y)
            }
            drawPath(
                guide, c.signal.copy(alpha = 0.55f),
                style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 5.dp.toPx()))),
            )
            val dead = QuickPick.DEAD.toPx()
            drawCircle(c.signal.copy(alpha = 0.14f), dead, centre)
            drawCircle(c.signal.copy(alpha = 0.8f), dead, centre, style = Stroke(1.5.dp.toPx()))
            if (lit != null) finger()?.let { drawLine(c.signal.copy(alpha = 0.8f), centre, it, 2.dp.toPx(), StrokeCap.Round) }
        }
        val shape = RoundedCornerShape(50)
        Layout(
            content = {
                for (s in fan.slots) {
                    val on = s.i == lit
                    Box(
                        Modifier
                            // Lit: a little larger, grown from its end at the arc.
                            .graphicsLayer {
                                val k = if (on) 1.14f else 1f
                                scaleX = k
                                scaleY = k
                                transformOrigin = TransformOrigin(if (fan.dir > 0) 0f else 1f, 0.5f)
                            }
                            .cap(
                                face = if (on) c.navy else c.key,
                                edge = if (on) lerp(c.navy, Color.Black, 0.45f) else c.keyEdge,
                                shape = shape,
                                press = 0f,
                            )
                            .then(if (s.i == current) Modifier.border(2.dp, c.signal, shape) else Modifier)
                            .padding(horizontal = 13.dp, vertical = 7.dp),
                    ) {
                        Text(
                            names[s.i].uppercase(),
                            style = ArcType.capsKey.copy(fontSize = 15.sp, letterSpacing = 0.02.em),
                            color = if (on) c.onNavy else c.navy,
                            maxLines = 1,
                        )
                    }
                }
            },
        ) { measurables, constraints ->
            val chips = measurables.map { it.measure(Constraints()) }
            layout(constraints.maxWidth, constraints.maxHeight) {
                // Each chip's middle level with its row, its near end on the arc.
                chips.forEachIndexed { k, p ->
                    val at = fan.at(fan.slots[k])
                    val left = if (fan.dir > 0) at.x else at.x - p.width
                    p.place(left.toInt(), (at.y - p.height / 2f).toInt())
                }
            }
        }
    }
}
