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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
            val list = marks.marks.values.sortedWith(compareBy({ it.bounds.center.y }, { it.bounds.center.x }))
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
            for (m in list) {
                val text = tag(m)
                val w = text.size.width + 2 * padX
                val h = text.size.height + 2 * padY
                // A large area (the pad grid) gets its tag in its middle, with no arrow.
                if (m.bounds.height > size.height * 0.25f) {
                    placed += Placed(m, text, Rect(Offset(m.bounds.center.x - w / 2, m.bounds.center.y - h / 2), Size(w, h)), null, null)
                    continue
                }
                val below = m.bounds.center.y < size.height / 2
                val x = m.bounds.center.x
                val left = (x - w / 2).coerceIn(margin, size.width - margin - w)
                var reach = gap
                var rect: Rect
                var tries = 0
                while (true) {
                    val top = if (below) m.bounds.bottom + reach else m.bounds.top - reach - h
                    rect = Rect(Offset(left, top), Size(w, h))
                    val hit = placed.any { it.rect.inflate(clearance).overlaps(rect) }
                    if (!hit || ++tries > 8) break
                    reach += h + clearance
                }
                val tip = if (below) Offset(x, m.bounds.bottom + 2.dp.toPx()) else Offset(x, m.bounds.top - 2.dp.toPx())
                val tail = if (below) Offset(x, rect.top) else Offset(x, rect.bottom)
                placed += Placed(m, text, rect, tip, tail)
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
                drawRoundRect(p.m.face, p.rect.topLeft, p.rect.size, CornerRadius(6.dp.toPx()))
                drawText(p.text, topLeft = Offset(p.rect.left + padX, p.rect.top + padY))
            }
            val hint = measurer.measure(CoachText.CLOSE_HINT.uppercase(), hintStyle)
            // Below the middle, clear of a tag in the middle of the pad grid.
            drawText(hint, topLeft = Offset((size.width - hint.size.width) / 2, size.height * 0.62f))
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

