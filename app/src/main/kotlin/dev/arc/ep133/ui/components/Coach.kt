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

    /** Controls with no tag of their own that tags still keep off ([coachClear]), by id. */
    val clear = mutableStateMapOf<String, Rect>()
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

/** Keeps the guide overlay's tags off this control, which has no tag of its own (the octave's − and +). */
fun Modifier.coachClear(id: String): Modifier = composed {
    val reg = LocalCoachMarks.current
    if (reg == null) {
        this
    } else {
        DisposableEffect(reg, id) { onDispose { reg.clear.remove(id) } }
        onGloballyPositioned { coords ->
            val b = coords.boundsInRoot()
            if (reg.clear[id] != b) reg.clear[id] = b
        }
    }
}

/**
 * The guide overlay, after the pocket operator app's tutorial: the page fades,
 * and every marked control gets a coloured tag with an arrow pointing at it.
 * Tags above the middle of the screen hang below their control and the others
 * stand above it; neighbours on one line take turns at two heights so they
 * don't overlap. In a short window (a phone on its side, the top bar's tags
 * crowding the row of words under it) no tag sits on another control or on
 * another tag's arrow: it goes to the other side of its control, beside it or
 * further out. Tap anywhere to close.
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
    val short = LocalArcWindow.current.short
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
            // In a short window, the controls a tag must leave in view: every marked one but the tall
            // areas (their tags sit in them) and the edge tabs (their own tags sit on them), and the
            // ones with no tag ([coachClear]). Upright there is room enough that the tags keep their
            // places as they were.
            val controls = if (short) list.filter { !tall(it) && edge(it) == 0 } else emptyList()
            val inset = 1.dp.toPx()
            val untagged = if (short) marks.clear.values.map { it.deflate(inset) } else emptyList()
            fun onControls(r: Rect, own: Mark) = controls.count { it !== own && it.bounds.deflate(inset).overlaps(r) } + untagged.count { it.overlaps(r) }
            /** Whether the arrow from [tail] to [tip] (down, up or across) runs over [r]. */
            fun crosses(tip: Offset, tail: Offset, r: Rect): Boolean = if (tip.x == tail.x) {
                tip.x in r.left..r.right && r.top < maxOf(tip.y, tail.y) && r.bottom > minOf(tip.y, tail.y)
            } else {
                tip.y in r.top..r.bottom && r.left < maxOf(tip.x, tail.x) && r.right > minOf(tip.x, tail.x)
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
                // With room for the hook above it, so other tags keep clear; neither covers a control
                // (on a phone on its side, the hook would otherwise reach up into the top bar).
                fun room(top: Float) = Rect(left, top - hookRoom, left + w, top + h)
                fun clear(top: Float) = placed.none { it.rect.inflate(clearance).overlaps(room(top)) } && onControls(room(top), m) == 0
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
                // Where the arrow meets the control: its middle, or (see below) towards one end.
                var x = m.bounds.center.x
                var left = (x - w / 2).coerceIn(margin, size.width - margin - w)
                // On a tag placed, or (in a short window) on its arrow.
                val arrowRoom = 3.dp.toPx()
                fun hits(r: Rect) = placed.any {
                    it.rect.inflate(clearance).overlaps(r) || short && it.tip != null && it.tail != null && crosses(it.tip, it.tail, r.inflate(arrowRoom))
                }
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
                // The arrows of the other controls above or below this place that run (or, their tags
                // not placed yet, may run) across it.
                fun lines(r: Rect) = controls.count { n ->
                    val p = placed.firstOrNull { it.m === n }
                    n !== m && n.bounds.center.x in r.left - clearance..r.right + clearance && (n.bounds.bottom <= r.top || n.bounds.top >= r.bottom) &&
                        (p?.tip == null || p.tail == null || crosses(p.tip, p.tail, r.inflate(clearance)))
                }
                val step = 2.dp.toPx()
                var from = maxOf(margin, x - w + padX)
                var to = minOf(size.width - margin - w, x - padX)
                fun aim(at: Float) {
                    x = at
                    left = (x - w / 2).coerceIn(margin, size.width - margin - w)
                    from = maxOf(margin, x - w + padX)
                    to = minOf(size.width - margin - w, x - padX)
                }
                // Pushed further out, below or above the control, until it clears the tags placed and
                // the other controls (sliding sideways off them where it still meets its arrow).
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
                        val onControl = onControls(rect, m) > 0
                        // (In a short window a tag also slides off another tag before going further out.)
                        if (covered.isNotEmpty() || edgeTag || onControl || short && blocked) {
                            val slid = (1..((to - from) / step).toInt()).asSequence()
                                .flatMap { sequenceOf(left - it * step, left + it * step) }
                                .filter { it in from..to }
                                .map { Rect(Offset(it, top), Size(w, h)) }
                            val off = slid.firstOrNull { under(it).isEmpty() && !hits(it) && onControls(it, m) == 0 }
                                ?: slid.takeIf { edgeTag && !onControl }?.firstOrNull { !hits(it) && under(it).size <= covered.size && onControls(it, m) == 0 }
                            if (off != null) {
                                rect = off
                                blocked = false
                            } else if (covered.isNotEmpty() || onControl) {
                                blocked = true
                            }
                        }
                        if (!blocked || ++tries > 8) break
                        reach += h + clearance
                    }
                    // In a short window, slid off the line another control's arrow runs down (or up)
                    // where it can, so that arrow needn't cross it.
                    if (short && !hits(rect) && lines(rect) > 0) {
                        val top = rect.top
                        val fewer = (1..((to - from) / step).toInt()).asSequence()
                            .flatMap { sequenceOf(rect.left - it * step, rect.left + it * step) }
                            .filter { it in from..to }
                            .map { Rect(Offset(it, top), Size(w, h)) }
                            .filter { lines(it) < lines(rect) && under(it).size <= under(rect).size && !hits(it) && onControls(it, m) == 0 }
                            .firstOrNull()
                        if (fewer != null) rect = fewer
                    }
                    return rect
                }
                // Where the tag goes, and its arrow: from the tag's edge to just off the control's.
                class Spot(val rect: Rect, val tip: Offset, val tail: Offset)
                fun vertical(below: Boolean): Spot {
                    val r = out(below)
                    return if (below) Spot(r, Offset(x, m.bounds.bottom + tipGap), Offset(x, r.top)) else Spot(r, Offset(x, m.bounds.top - tipGap), Offset(x, r.bottom))
                }
                // Beside the control, level with it, the arrow pointing across.
                fun beside(right: Boolean): Spot {
                    val y = m.bounds.center.y
                    val r = Rect(Offset(if (right) m.bounds.right + gap else m.bounds.left - gap - w, y - h / 2), Size(w, h))
                    return if (right) Spot(r, Offset(m.bounds.right + tipGap, y), Offset(r.left, y)) else Spot(r, Offset(m.bounds.left - tipGap, y), Offset(r.right, y))
                }
                // How badly a place fits: off the screen, on another tag or control, its arrow across
                // other tags or controls, over where other arrows point, and (a little) a long arrow.
                fun misfit(s: Spot): Float {
                    val r = s.rect
                    val crossed = placed.count { crosses(s.tip, s.tail, it.rect) } +
                        controls.count { it !== m && crosses(s.tip, s.tail, it.bounds.deflate(inset)) } + untagged.count { crosses(s.tip, s.tail, it) }
                    val off = r.top < margin || r.bottom > size.height - margin || r.left < margin || r.right > size.width - margin
                    return (if (off) 1000f else 0f) + (if (hits(r)) 100f else 0f) + 100f * onControls(r, m) + 10f * (crossed + under(r).size + lines(r)) +
                        (abs(s.tail.x - s.tip.x) + abs(s.tail.y - s.tip.y)) / size.height
                }
                // Below a control in the top half, above one in the bottom half; in a short window (its
                // top bar crowded with tags) the other side, or beside the control (the side with more
                // room first), where that fits better.
                val below = m.bounds.center.y < size.height / 2
                var spot = vertical(below)
                if (short) {
                    var fit = misfit(spot)
                    val right = x < size.width / 2
                    for (other in listOf(vertical(!below), beside(right), beside(!right))) {
                        val f = misfit(other)
                        if (f + 5f < fit) {
                            spot = other
                            fit = f
                        }
                    }
                    // Or its arrow meets the control towards one end, so the tag can hang clear of the
                    // arrow of a control just over or under it (the section tag over the row of words).
                    val end = 12.dp.toPx()
                    if (m.bounds.width > 4 * end) {
                        for (at in listOf(m.bounds.right - end, m.bounds.left + end)) {
                            aim(at)
                            val other = vertical(below)
                            val f = misfit(other)
                            if (f + 5f < fit) {
                                spot = other
                                fit = f
                            }
                        }
                    }
                }
                placed += Placed(m, text, spot.rect, spot.tip, spot.tail)
            }
            // The tags beside their controls first (in [order]), then the edge tabs' tags around
            // them, then the tall areas' tags in whatever room is left. An edge tab's tag that finds
            // no room that way (a short window) goes first instead, and the others make way for it.
            fun layout(order: List<Mark>) {
                val early = HashSet<Mark>()
                while (true) {
                    placed.clear()
                    sides.clear()
                    for (m in list) if (m in early) placeSide(m, edge(m))
                    for (m in order) placeTag(m)
                    val cramped = list.filter { edge(it) != 0 && it !in early && !placeSide(it, edge(it)) }
                    for (m in list) if (edge(m) == 0 && tall(m)) placeTag(m)
                    if (cramped.isEmpty()) break
                    early += cramped
                }
            }
            fun crossings(p: Placed): Int {
                val tip = p.tip ?: return 0
                val tail = p.tail ?: return 0
                return placed.count { it !== p && crosses(tip, tail, it.rect) }
            }
            // How well the tags fit together: none off the screen or on a control, no arrow across
            // another tag, and short arrows.
            fun score(): Float = placed.sumOf { p ->
                val r = p.rect
                val off = r.top < 0f || r.bottom > size.height || r.left < 0f || r.right > size.width
                val arrow = if (p.tip != null && p.tail != null) abs(p.tail.x - p.tip.x) + abs(p.tail.y - p.tip.y) else 0f
                ((if (off) 1000f else 0f) + 100f * onControls(r, p.m) + 10f * crossings(p) + arrow / size.height).toDouble()
            }.toFloat()
            var order = list.filter { edge(it) == 0 && !tall(it) }
            layout(order)
            // In a short window, top to bottom can leave an arrow running across another tag: the tags
            // either side of such a crossing are tried earlier or later in turn, and the best order kept.
            if (short) {
                var best = score()
                for (pass in 0 until 4) {
                    val involved = placed.filter { p -> crossings(p) > 0 || placed.any { crossings(it) > 0 && it.tip != null && it.tail != null && crosses(it.tip, it.tail, p.rect) } }
                        .map { it.m }.filter { it in order }
                    var bestOrder: List<Mark>? = null
                    for (m in involved) {
                        val i = order.indexOf(m)
                        for (j in order.indices) {
                            if (j == i) continue
                            val tried = order.toMutableList().apply { removeAt(i); add(j, m) }
                            layout(tried)
                            val fit = score()
                            if (fit < best - 1f) {
                                best = fit
                                bestOrder = tried
                            }
                        }
                    }
                    order = bestOrder ?: break
                    layout(order)
                }
                layout(order)
            }
            val head = 7.dp.toPx()
            for (p in placed) {
                val tip = p.tip ?: continue
                val tail = p.tail ?: continue
                drawLine(p.m.face, tail, tip, 2.dp.toPx())
                drawPath(
                    Path().apply {
                        moveTo(tip.x, tip.y)
                        if (tip.x == tail.x) {
                            val dir = if (tail.y > tip.y) -1f else 1f
                            lineTo(tip.x - head, tip.y - dir * head * 1.2f)
                            lineTo(tip.x + head, tip.y - dir * head * 1.2f)
                        } else {
                            // Beside its control, pointing across.
                            val dir = if (tail.x > tip.x) -1f else 1f
                            lineTo(tip.x - dir * head * 1.2f, tip.y - head)
                            lineTo(tip.x - dir * head * 1.2f, tip.y + head)
                        }
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

