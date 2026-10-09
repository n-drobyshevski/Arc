package dev.arc.ep133.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Text
import androidx.compose.material3.TooltipAnchorPosition
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.arc.ep133.ui.theme.ArcType

/**
 * Small geometric icons, drawn rather than taken from an icon set, so they
 * match the pocket operator app's flat shapes (REC dot, play triangle, gear).
 */
enum class ArcIcon { DOT, RING, GEAR, HELP, REFRESH, PLUS, SEARCH, IMPORT, FOLLOW, SWAP, EXCHANGE, MIC, BLUETOOTH, CLOCK }

@Composable
fun Icon(icon: ArcIcon, color: Color, modifier: Modifier = Modifier, size: Dp = 22.dp) {
    if (icon == ArcIcon.HELP) {
        // The font's own question mark, heavier than a drawn one would be. Sized as the icon
        // it is, not as text: with large text it would outgrow its key and be cut off.
        val fontSize = with(androidx.compose.ui.platform.LocalDensity.current) { (size * 0.95f).toSp() }
        Box(modifier.size(size), contentAlignment = Alignment.Center) {
            Text("?", style = ArcType.tab.copy(fontSize = fontSize), color = color)
        }
        return
    }
    // Offscreen, so the gear's hole is cut through to whatever is behind it.
    Canvas(modifier.size(size).graphicsLayer { compositingStrategy = androidx.compose.ui.graphics.CompositingStrategy.Offscreen }) { draw(icon, color) }
}

private fun DrawScope.draw(icon: ArcIcon, color: Color) {
    val w = size.minDimension
    val stroke = w * 0.11f
    val c = center
    when (icon) {
        ArcIcon.HELP -> Unit // drawn as text
        ArcIcon.DOT -> drawCircle(color, radius = w * 0.36f)
        ArcIcon.RING -> drawCircle(color, radius = w * 0.32f, style = Stroke(stroke))
        ArcIcon.GEAR -> {
            val outer = w / 2
            for (i in 0 until 8) {
                rotate(i * 45f, c) {
                    drawRoundRect(
                        color,
                        topLeft = Offset(c.x - outer * 0.17f, c.y - outer),
                        size = Size(outer * 0.34f, outer * 0.5f),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(outer * 0.06f),
                    )
                }
            }
            drawCircle(color, radius = outer * 0.72f)
            drawCircle(Color.Transparent, radius = outer * 0.32f, blendMode = androidx.compose.ui.graphics.BlendMode.Clear)
        }
        ArcIcon.REFRESH -> {
            val r = w * 0.34f
            drawArc(color, 40f, 290f, false, topLeft = Offset(c.x - r, c.y - r), size = Size(2 * r, 2 * r), style = Stroke(stroke, cap = StrokeCap.Round))
            // The arrowhead at the arc's end (top right).
            val tip = Offset(c.x + r * 0.77f, c.y - r * 0.64f)
            val head = Path().apply {
                moveTo(tip.x + w * 0.14f, tip.y - w * 0.02f)
                lineTo(tip.x - w * 0.02f, tip.y + w * 0.16f)
                lineTo(tip.x - w * 0.10f, tip.y - w * 0.12f)
                close()
            }
            drawPath(head, color)
        }
        ArcIcon.PLUS -> {
            val l = w * 0.36f
            drawLine(color, Offset(c.x - l, c.y), Offset(c.x + l, c.y), stroke * 1.3f, StrokeCap.Round)
            drawLine(color, Offset(c.x, c.y - l), Offset(c.x, c.y + l), stroke * 1.3f, StrokeCap.Round)
        }
        ArcIcon.SEARCH -> {
            val r = w * 0.26f
            val o = Offset(c.x - w * 0.08f, c.y - w * 0.08f)
            drawCircle(color, radius = r, center = o, style = Stroke(stroke))
            drawLine(color, Offset(o.x + r * 0.72f, o.y + r * 0.72f), Offset(c.x + w * 0.38f, c.y + w * 0.38f), stroke * 1.2f, StrokeCap.Round)
        }
        ArcIcon.IMPORT -> {
            // An arrow down into a tray.
            val top = w * 0.1f
            val mid = c.y + w * 0.08f
            drawLine(color, Offset(c.x, top), Offset(c.x, mid), stroke, StrokeCap.Round)
            drawLine(color, Offset(c.x - w * 0.18f, mid - w * 0.18f), Offset(c.x, mid), stroke, StrokeCap.Round)
            drawLine(color, Offset(c.x + w * 0.18f, mid - w * 0.18f), Offset(c.x, mid), stroke, StrokeCap.Round)
            val tray = Path().apply {
                moveTo(w * 0.12f, w * 0.62f)
                lineTo(w * 0.12f, w * 0.88f)
                lineTo(w * 0.88f, w * 0.88f)
                lineTo(w * 0.88f, w * 0.62f)
            }
            drawPath(tray, color, style = Stroke(stroke, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
        }
        ArcIcon.SWAP -> {
            // Two overlapping squares, the PO app's mark beside its chosen mode (DRUMS / KEYPAD).
            val side = w * 0.5f
            val line = Stroke(w * 0.08f)
            drawRect(color, topLeft = Offset(w * 0.1f, w * 0.1f), size = Size(side, side), style = line)
            drawRect(color, topLeft = Offset(w * 0.4f, w * 0.4f), size = Size(side, side), style = line)
        }
        ArcIcon.EXCHANGE -> {
            // ⇄, the EDIT badge on a pad: an arrow right over an arrow left.
            val l = w * 0.16f
            val r = w * 0.84f
            val head = w * 0.16f
            for ((y, right) in listOf(w * 0.34f to true, w * 0.66f to false)) {
                drawLine(color, Offset(l, y), Offset(r, y), stroke, StrokeCap.Round)
                val tip = if (right) r else l
                val back = if (right) tip - head else tip + head
                drawLine(color, Offset(tip, y), Offset(back, y - head), stroke, StrokeCap.Round)
                drawLine(color, Offset(tip, y), Offset(back, y + head), stroke, StrokeCap.Round)
            }
        }
        ArcIcon.MIC -> {
            // A microphone (Live's SAMPLE key): a capsule body in a U-shaped holder on a stem.
            val body = w * 0.3f
            drawRoundRect(
                color,
                topLeft = Offset(c.x - body / 2, w * 0.08f),
                size = Size(body, w * 0.48f),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(body / 2),
            )
            val r = w * 0.25f
            val holder = w * 0.42f
            drawArc(color, 0f, 180f, false, topLeft = Offset(c.x - r, holder - r), size = Size(2 * r, 2 * r), style = Stroke(stroke, cap = StrokeCap.Round))
            drawLine(color, Offset(c.x, holder + r), Offset(c.x, w * 0.9f), stroke, StrokeCap.Round)
        }
        ArcIcon.BLUETOOTH -> {
            // The rune: a spine with two arrowheads on its right, crossed by the strokes from its left.
            val x = c.x
            val rune = Path().apply {
                moveTo(w * 0.24f, w * 0.68f)
                lineTo(w * 0.76f, w * 0.30f)
                lineTo(x, w * 0.08f)
                lineTo(x, w * 0.92f)
                lineTo(w * 0.76f, w * 0.70f)
                lineTo(w * 0.24f, w * 0.32f)
            }
            drawPath(rune, color, style = Stroke(stroke * 1.1f, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
        }
        ArcIcon.CLOCK -> {
            // A face with its two hands: late.
            drawCircle(color, radius = w * 0.4f, style = Stroke(stroke))
            val hands = Path().apply {
                moveTo(c.x, c.y - w * 0.22f)
                lineTo(c.x, c.y)
                lineTo(c.x + w * 0.16f, c.y + w * 0.1f)
            }
            drawPath(hands, color, style = Stroke(stroke, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
        }
        ArcIcon.FOLLOW -> {
            // A target: follow the group being played.
            drawCircle(color, radius = w * 0.38f, style = Stroke(stroke))
            drawCircle(color, radius = w * 0.14f)
        }
    }
}

/**
 * A square (or round) icon key, drawn as a cap (see [cap]) whose face travels
 * onto its edge while pressed. Long-press shows its name; screen readers read
 * [label] (or [description], where the key says more than its name), then
 * [state] where it has one (a key that is on or off). [beside]: a second icon
 * after [icon], the same size. The touch area stays at least 44dp even when
 * the face is drawn smaller.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IconBlock(
    icon: ArcIcon,
    label: String,
    face: Color,
    ink: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    size: Dp = 44.dp,
    iconSize: Dp = 22.dp,
    round: Boolean = false,
    state: String? = null,
    beside: ArcIcon? = null,
    description: String = label,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    TooltipBox(
        positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Below),
        tooltip = { PlainTooltip { Text(label.uppercase(), style = ArcType.capsKeySmall) } },
        state = rememberTooltipState(),
    ) {
        Box(
            modifier
                .size(size)
                .cap(
                    face, capEdge(face),
                    if (round) androidx.compose.foundation.shape.CircleShape else RoundedCornerShape(8.dp),
                    capPress(pressed && enabled),
                    dx = if (round) RoundCapDx else CapDx,
                    dy = if (round) RoundCapDy else CapDy,
                    alpha = if (enabled) 1f else 0.4f,
                )
                .clickable(interactionSource = source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
                .semantics {
                    contentDescription = description
                    if (state != null) stateDescription = state
                },
            contentAlignment = Alignment.Center,
        ) {
            if (beside == null) {
                Icon(icon, ink, size = iconSize)
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(icon, ink, size = iconSize)
                    Icon(beside, ink, size = iconSize)
                }
            }
        }
    }
}
