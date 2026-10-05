package dev.arc.ep133.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlin.math.abs
import kotlin.math.roundToInt

/** The pocket operator app's yellow tip tags, for hints that aren't one key. */
val CoachYellow = Color(0xFFD4A300)
val CoachYellowInk = Color(0xFF1E1F21)

/** A control the guide overlay points at: where it is on screen and its coloured tag. */
data class Mark(val bounds: Rect, val label: String, val face: Color, val ink: Color)

/** The marks on screen now, by id; controls add themselves with [coachMark]. */
class CoachMarks {
    val marks = mutableStateMapOf<String, Mark>()
}

val LocalCoachMarks = staticCompositionLocalOf<CoachMarks?> { null }

/** Registers this control for the guide overlay (a no-op where there is no overlay). */
fun Modifier.coachMark(id: String, label: String, face: Color, ink: Color): Modifier = composed {
    val reg = LocalCoachMarks.current
    if (reg == null) {
        this
    } else {
        DisposableEffect(reg, id) { onDispose { reg.marks.remove(id) } }
        onGloballyPositioned { coords ->
            val m = Mark(coords.boundsInRoot(), label, face, ink)
            if (reg.marks[id] != m) reg.marks[id] = m
        }
    }
}

/**
 * The guide overlay, after the pocket operator app's tutorial: the page fades,
 * and every marked control gets a coloured tag with an arrow pointing at it.
 * Tags above the middle of the screen hang below their control and the others
 * stand above it; neighbours on one line take turns at two heights so they
 * don't overlap. Tap anywhere to close.
 *
 * Everything is drawn, not composed: the marks are known once the screen has
 * been laid out, which is before drawing, so the overlay is complete in its
 * first frame.
 */
@Composable
fun CoachOverlay(marks: CoachMarks, visible: Boolean, onDismiss: () -> Unit) {
    val c = LocalArcColors.current
    val measurer = rememberTextMeasurer()
    val tagStyle = ArcType.capsKeySmall
    val hintStyle = ArcType.caps.copy(color = c.graphite)
    // The edges of the safe area: on its side, a phone's navigation bar or cutout comes first.
    val safe = WindowInsets.safeDrawing
    AnimatedVisibility(visible, enter = fadeIn(), exit = fadeOut()) {
        Canvas(
            Modifier
                .fillMaxSize()
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismiss)
                .semantics { contentDescription = CoachText.CLOSE_HINT },
        ) {
            drawRect(c.shell.copy(alpha = 0.86f))
            val gap = 10.dp.toPx()
            val step = 40.dp.toPx()
            val margin = 8.dp.toPx()
            val padX = 9.dp.toPx()
            val padY = 6.dp.toPx()
            val short = size.height < 480.dp.toPx()
            // Tall areas go last: their tags sit in their middle and make way for the others.
            val tall = { m: Mark -> m.bounds.height > size.height * 0.25f }
            val list = marks.marks.values.sortedWith(compareBy<Mark>({ tall(it) }, { it.bounds.center.y }, { it.bounds.center.x }))
            fun tag(m: Mark): androidx.compose.ui.text.TextLayoutResult = measurer.measure(
                m.label.uppercase(),
                tagStyle.copy(color = m.ink),
                constraints = androidx.compose.ui.unit.Constraints(maxWidth = 170.dp.roundToPx()),
            )
            // Place every tag first: next to its control, pushed further out until it
            // clears the tags already placed. Then arrows, then tags on top of them.
            class Placed(val m: Mark, val text: androidx.compose.ui.text.TextLayoutResult, val rect: Rect, val tip: Offset?, val tail: Offset?)
            val placed = ArrayList<Placed>()
            val clearance = 6.dp.toPx()
            // A narrow control on the screen's edge (the GUIDE tab, the more-tools strip)
            // gets the PO tutorial's side tag: a vertical tab on that edge, its word
            // turned, with a hooked arrow above pointing at the edge.
            val edgeSlack = 2.dp.toPx()
            val safeLeft = safe.getLeft(this, layoutDirection).toFloat()
            val safeRight = size.width - safe.getRight(this, layoutDirection)
            fun edge(m: Mark): Int = when {
                m.bounds.width > 48.dp.toPx() || m.bounds.height < m.bounds.width * 2 -> 0
                m.bounds.left <= safeLeft + edgeSlack -> -1
                m.bounds.right >= safeRight - edgeSlack -> 1
                else -> 0
            }
            class Side(val m: Mark, val text: androidx.compose.ui.text.TextLayoutResult, val rect: Rect, val side: Int)
            val sides = ArrayList<Side>()
            val hookRoom = 30.dp.toPx()
            /** Whether the tag found room clear of the tags already placed. */
            fun placeSide(m: Mark, side: Int): Boolean {
                val text = measurer.measure(m.label.uppercase(), tagStyle.copy(color = m.ink))
                val w = text.size.height + 2 * padY
                val h = text.size.width + 2 * padX
                val lo = margin + 40.dp.toPx()
                val hi = size.height - margin - h
                val left = if (side < 0) safeLeft else safeRight - w
                // With room for the hook above it, so other tags keep clear.
                fun room(top: Float) = Rect(left, top - hookRoom, left + w, top + h)
                fun clear(top: Float) = placed.none { it.rect.inflate(clearance).overlaps(room(top)) }
                val centred = (m.bounds.center.y - h / 2).coerceIn(lo, hi)
                // On a phone on its side the edge controls sit high, where the top bar's tags
                // hang: the side tag slides down clear of them while its hook (26 dp over the
                // tag) still meets the control, or up while the tag still runs beside it.
                val step = 4.dp.toPx()
                val reach = 12.dp.toPx()
                val top = if (clear(centred)) {
                    centred
                } else {
                    generateSequence(centred) { it + step }
                        .takeWhile { it <= hi && it - 26.dp.toPx() <= m.bounds.bottom - reach }
                        .firstOrNull(::clear)
                        ?: generateSequence(centred) { it - step }
                            .takeWhile { it >= lo && it + h >= m.bounds.top + reach }
                            .firstOrNull(::clear)
                }
                sides += Side(m, text, Rect(Offset(left, top ?: centred), Size(w, h)), side)
                placed += Placed(m, text, room(top ?: centred), null, null)
                return top != null
            }
            fun placeTag(m: Mark) {
                val text = tag(m)
                val w = text.size.width + 2 * padX
                val h = text.size.height + 2 * padY
                // A tall area (the pad grid, the side strip) gets its tag in its middle, with no
                // arrow; kept on screen, so a strip at the edge still shows its whole tag.
                if (tall(m)) {
                    val left = (m.bounds.center.x - w / 2).coerceIn(margin, size.width - margin - w)
                    var rect = Rect(Offset(left, m.bounds.center.y - h / 2), Size(w, h))
                    var tries = 0
                    while (placed.any { it.rect.inflate(clearance).overlaps(rect) } && tries++ < 8) {
                        rect = rect.translate(0f, h + clearance)
                    }
                    placed += Placed(m, text, rect, null, null)
                    return
                }
                val x = m.bounds.center.x
                val left = (x - w / 2).coerceIn(margin, size.width - margin - w)
                fun hits(r: Rect) = placed.any { it.rect.inflate(clearance).overlaps(r) }
                fun hitsSide(r: Rect) = sides.any { s -> placed.any { it.m === s.m && it.rect.inflate(clearance).overlaps(r) } }
                // In a short window (a phone on its side) the top bar's tags hang over the row of
                // words under it, and a tag there would hide where another control's arrow points
                // (just under or over it): the tag slides sideways off that point if it can and
                // still meet its own arrow, or else hangs lower. (A control its own arrow runs over
                // anyway doesn't count.) It slides off an edge tab's tag too, rather than hang far
                // below it.
                val tipGap = 2.dp.toPx()
                fun under(r: Rect) = if (!short) emptyList() else list.filter {
                    val b = it.bounds
                    it !== m && !tall(it) && edge(it) == 0 && x !in b.left..b.right &&
                        (r.inflate(clearance).contains(Offset(b.center.x, b.bottom + tipGap)) || r.inflate(clearance).contains(Offset(b.center.x, b.top - tipGap)))
                }
                val step = 2.dp.toPx()
                val from = maxOf(margin, x - w + padX)
                val to = minOf(size.width - margin - w, x - padX)
                // Pushed further out, below or above the control, until it clears the tags placed.
                fun out(below: Boolean): Rect {
                    var reach = gap
                    var rect: Rect
                    var tries = 0
                    while (true) {
                        val top = if (below) m.bounds.bottom + reach else m.bounds.top - reach - h
                        rect = Rect(Offset(left, top), Size(w, h))
                        var blocked = hits(rect)
                        val covered = under(rect)
                        val edgeTag = hitsSide(rect)
                        if (covered.isNotEmpty() || edgeTag) {
                            val slid = (1..((to - from) / step).toInt()).asSequence()
                                .flatMap { sequenceOf(left - it * step, left + it * step) }
                                .filter { it in from..to }
                                .map { Rect(Offset(it, top), Size(w, h)) }
                            val off = slid.firstOrNull { under(it).isEmpty() && !hits(it) }
                                ?: slid.takeIf { edgeTag }?.firstOrNull { !hits(it) && under(it).size <= covered.size }
                            if (off != null) {
                                rect = off
                                blocked = false
                            } else if (covered.isNotEmpty()) {
                                blocked = true
                            }
                        }
                        if (!blocked || ++tries > 8) break
                        reach += h + clearance
                    }
                    return rect
                }
                // How badly a place fits: off the screen, on another tag, its arrow across other
                // tags, over where other arrows point, and (a little) a long arrow.
                fun misfit(r: Rect, below: Boolean): Float {
                    val tipY = if (below) m.bounds.bottom + tipGap else m.bounds.top - tipGap
                    val tailY = if (below) r.top else r.bottom
                    val crossed = placed.count {
                        x in it.rect.left..it.rect.right && it.rect.top < maxOf(tipY, tailY) && it.rect.bottom > minOf(tipY, tailY)
                    }
                    val off = r.top < margin || r.bottom > size.height - margin
                    return (if (off) 1000f else 0f) + (if (hits(r)) 100f else 0f) + 10f * (crossed + under(r).size) +
                        abs(tailY - tipY) / size.height
                }
                // Below a control in the top half, above one in the bottom half; in a short window
                // (its top bar crowded with tags) the other way where that fits better.
                var below = m.bounds.center.y < size.height / 2
                var rect = out(below)
                if (short) {
                    val other = out(!below)
                    if (misfit(other, !below) + 5f < misfit(rect, below)) {
                        rect = other
                        below = !below
                    }
                }
                val tip = if (below) Offset(x, m.bounds.bottom + tipGap) else Offset(x, m.bounds.top - tipGap)
                val tail = if (below) Offset(x, rect.top) else Offset(x, rect.bottom)
                placed += Placed(m, text, rect, tip, tail)
            }
            // The tags beside their controls first, then the edge tabs' tags around them, then
            // the tall areas' tags in whatever room is left. An edge tab's tag that finds no
            // room that way (a short window) goes first instead, and the others make way for it.
            val early = HashSet<Mark>()
            while (true) {
                placed.clear()
                sides.clear()
                for (m in list) if (m in early) placeSide(m, edge(m))
                for (m in list) if (edge(m) == 0 && !tall(m)) placeTag(m)
                val cramped = list.filter { edge(it) != 0 && it !in early && !placeSide(it, edge(it)) }
                for (m in list) if (edge(m) == 0 && tall(m)) placeTag(m)
                if (cramped.isEmpty()) break
                early += cramped
            }
            val head = 7.dp.toPx()
            for (p in placed) {
                val tip = p.tip ?: continue
                val tail = p.tail ?: continue
                drawLine(p.m.face, tail, tip, 2.dp.toPx())
                val dir = if (tail.y > tip.y) -1f else 1f
                drawPath(
                    Path().apply {
                        moveTo(tip.x, tip.y)
                        lineTo(tip.x - head, tip.y - dir * head * 1.2f)
                        lineTo(tip.x + head, tip.y - dir * head * 1.2f)
                        close()
                    },
                    p.m.face,
                )
            }
            for (p in placed) {
                if (sides.any { it.m === p.m }) continue
                drawRoundRect(p.m.face, p.rect.topLeft, p.rect.size, CornerRadius(6.dp.toPx()))
                drawText(p.text, topLeft = Offset(p.rect.left + padX, p.rect.top + padY))
            }
            for (sd in sides) {
                val r = sd.rect
                val radius = 8.dp.toPx()
                // Square on the screen's edge, rounded on the inner side, like the tab itself.
                drawPath(
                    Path().apply {
                        addRoundRect(
                            androidx.compose.ui.geometry.RoundRect(
                                r,
                                topLeft = CornerRadius(if (sd.side < 0) 0f else radius),
                                bottomLeft = CornerRadius(if (sd.side < 0) 0f else radius),
                                topRight = CornerRadius(if (sd.side < 0) radius else 0f),
                                bottomRight = CornerRadius(if (sd.side < 0) radius else 0f),
                            ),
                        )
                    },
                    sd.m.face,
                )
                // The word reads bottom to top on the left edge, top to bottom on the right.
                rotate(if (sd.side < 0) -90f else 90f, r.center) {
                    drawText(sd.text, topLeft = Offset(r.center.x - sd.text.size.width / 2f, r.center.y - sd.text.size.height / 2f))
                }
                // The hook above: up from the tab's inner side, then across to an arrowhead at the edge.
                val stroke = 3.dp.toPx()
                val inner = if (sd.side < 0) r.right - 6.dp.toPx() else r.left + 6.dp.toPx()
                val outer = if (sd.side < 0) safeLeft + 6.dp.toPx() else safeRight - 6.dp.toPx()
                val bottom = r.top - 8.dp.toPx()
                val bend = bottom - 18.dp.toPx()
                val turn = 6.dp.toPx()
                val dir = if (sd.side < 0) -1f else 1f
                drawPath(
                    Path().apply {
                        moveTo(inner, bottom)
                        lineTo(inner, bend + turn)
                        quadraticTo(inner, bend, inner + dir * turn, bend)
                        lineTo(outer - dir * 7.dp.toPx(), bend)
                    },
                    sd.m.face,
                    style = androidx.compose.ui.graphics.drawscope.Stroke(stroke, cap = androidx.compose.ui.graphics.StrokeCap.Round),
                )
                val h = 7.dp.toPx()
                drawPath(
                    Path().apply {
                        moveTo(outer, bend)
                        lineTo(outer - dir * h * 1.3f, bend - h)
                        lineTo(outer - dir * h * 1.3f, bend + h)
                        close()
                    },
                    sd.m.face,
                )
            }
            val hint = measurer.measure(CoachText.CLOSE_HINT.uppercase(), hintStyle)
            // Below the middle, clear of a tag in the middle of the pad grid. Where a tag is there
            // anyway (a short window), in the middle of the tallest gap between the tags instead.
            val hintLeft = (size.width - hint.size.width) / 2
            var hintTop = size.height * 0.72f
            val tags = placed.map { it.rect.inflate(clearance) }
            if (tags.any { it.overlaps(Rect(Offset(hintLeft, hintTop), Size(hint.size.width.toFloat(), hint.size.height.toFloat()))) }) {
                val top = safe.getTop(this) + margin
                val bottom = size.height - safe.getBottom(this) - margin
                var from = top
                var best = top to top
                for (r in tags.filter { it.left < hintLeft + hint.size.width && it.right > hintLeft }.sortedBy { it.top }) {
                    val to = r.top.coerceAtMost(bottom)
                    if (to - from > best.second - best.first) best = from to to
                    from = maxOf(from, r.bottom)
                }
                if (bottom - from > best.second - best.first) best = from to bottom
                if (best.second - best.first >= hint.size.height) hintTop = (best.first + best.second - hint.size.height) / 2
            }
            drawText(hint, topLeft = Offset(hintLeft, hintTop))
        }
    }
}

/** Holds the marks for a screen and shows the overlay over [content]. */
@Composable
fun CoachHost(visible: Boolean, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val marks = remember { CoachMarks() }
    androidx.compose.runtime.CompositionLocalProvider(LocalCoachMarks provides marks) {
        Box(Modifier.fillMaxSize()) {
            content()
            CoachOverlay(marks, visible, onDismiss)
        }
    }
}

