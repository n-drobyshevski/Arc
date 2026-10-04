package dev.arc.ep133.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import dev.arc.ep133.ui.theme.BaseText
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.arc.ep133.text.Combo
import dev.arc.ep133.text.ComboStep
import dev.arc.ep133.text.GuideText
import dev.arc.ep133.text.KeyAction
import dev.arc.ep133.text.KeyCap
import dev.arc.ep133.text.KeyKind
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/*
 * Key caps for the shortcut guide, drawn after the device: pale keys (SHIFT,
 * - and +), dark keys, dark square pads with their label in the corner,
 * knobs and the fader. A badge above a key says what to do with it.
 * These are the device's own colours, so they stay the same in the dark theme.
 */
private val LightFace = Color(0xFFDAD9D5)
private val LightEdge = Color(0xFFA9A8A2)
private val LightInk = Color(0xFF55575A)
private val DarkFace = Color(0xFF4A4B4D)
private val DarkEdge = Color(0xFF1E1F21)
private val DarkInk = Color(0xFFEDECE8)
private val HoldFace = Color(0xFFB8E2EE)
private val HoldInk = Color(0xFF1D6577)

private val CapText = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, fontWeight = FontWeight.Medium)
private val BadgeText = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, fontWeight = FontWeight.Bold)
private val BadgeSlot = 26.dp

/** A guide entry's keys as caps. Screen readers get [spoken] (the guide's own key text) instead. */
@Composable
fun ComboView(combo: Combo, spoken: String, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    Column(modifier.clearAndSetSemantics { contentDescription = spoken }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        combo.context?.let { Text(it, style = ArcType.small, color = c.graphite) }
        combo.options.forEachIndexed { i, option ->
            if (i > 0) Text(GuideText.OR, style = ArcType.small, color = c.graphite)
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                itemVerticalAlignment = Alignment.Bottom,
            ) {
                option.forEachIndexed { j, step ->
                    if (j > 0) Joiner(GuideText.THEN, small = true)
                    Step(step)
                }
            }
        }
    }
}

@Composable
private fun Step(step: ComboStep) {
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        val badges = step.keys.any { it.action != null }
        step.keys.forEachIndexed { i, k ->
            // "- +" sit side by side like the device's pair; other keys are joined by + or /.
            if (i > 0 && !(k.label == "+" && step.keys[i - 1].label == "-" && !step.alternatives)) {
                Joiner(if (step.alternatives) "/" else "+", small = false)
            }
            Cap(k, badgeSpace = badges)
        }
    }
}

@Composable
private fun Joiner(text: String, small: Boolean) {
    val c = LocalArcColors.current
    Box(Modifier.height(44.dp), contentAlignment = Alignment.Center) {
        Text(
            text,
            style = if (small) ArcType.small else BaseText.copy(fontSize = 28.sp, fontWeight = FontWeight.Normal),
            color = if (small) c.graphite else c.ink,
        )
    }
}

@Composable
private fun Cap(k: KeyCap, badgeSpace: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        if (badgeSpace) {
            Box(Modifier.height(BadgeSlot), contentAlignment = Alignment.TopCenter) {
                k.action?.let { Badge(it) }
            }
        }
        when (k.kind) {
            KeyKind.LIGHT -> if (k.label == "-" || k.label == "+") {
                Key(44.dp, 44.dp, LightFace, LightEdge) { Glyph(k.label, LightInk) }
            } else {
                Key(54.dp, 32.dp, LightFace, LightEdge) { Text(k.label, style = CapText, color = LightInk) }
            }
            KeyKind.DARK -> Key(if (k.label.length <= 3) 40.dp else 58.dp, 32.dp, DarkFace, DarkEdge) {
                Text(k.label, style = CapText, color = DarkInk)
            }
            KeyKind.PAD -> Key(50.dp, 50.dp, DarkFace, DarkEdge, alignment = Alignment.TopStart) {
                Text(
                    when (k.label) {
                        "pad" -> ""
                        "0-9" -> "0\u20139"
                        "1-9" -> "1\u20139"
                        else -> k.label
                    },
                    style = CapText.copy(fontSize = if (k.label == "ENTER") 10.sp else 13.sp),
                    color = DarkInk,
                    modifier = Modifier.padding(start = 7.dp, top = 5.dp),
                )
            }
            KeyKind.KNOB -> Knob(k.label.removePrefix("KNOB ").trim())
            KeyKind.FADER -> Fader()
        }
    }
}

/** A key face with a darker bottom edge, like ArcKey. */
@Composable
private fun Key(w: Dp, h: Dp, face: Color, edge: Color, alignment: Alignment = Alignment.Center, content: @Composable () -> Unit) {
    Box(
        Modifier
            .size(w, h + 3.dp)
            .drawBehind {
                val r = CornerRadius(6.dp.toPx())
                drawRoundRect(edge, topLeft = Offset(2.dp.toPx(), 3.dp.toPx()), size = Size(size.width - 2.dp.toPx(), size.height - 3.dp.toPx()), cornerRadius = r)
                drawRoundRect(face, size = Size(size.width - 2.dp.toPx(), size.height - 3.dp.toPx()), cornerRadius = r)
            },
    ) {
        Box(Modifier.size(w - 2.dp, h), contentAlignment = alignment) { content() }
    }
}

/** - and + drawn as strokes, so they line up whatever the font. */
@Composable
private fun Glyph(label: String, color: Color) {
    Canvas(Modifier.size(18.dp)) {
        val w = 2.dp.toPx()
        val mid = size.height / 2
        drawLine(color, Offset(0f, mid), Offset(size.width, mid), strokeWidth = w, cap = StrokeCap.Round)
        if (label == "+") drawLine(color, Offset(size.width / 2, 0f), Offset(size.width / 2, size.height), strokeWidth = w, cap = StrokeCap.Round)
    }
}

@Composable
private fun Knob(axis: String) {
    Box(
        Modifier
            .size(42.dp)
            .drawBehind {
                drawCircle(DarkEdge, center = Offset(size.width / 2 + 1.dp.toPx(), size.height / 2 + 2.dp.toPx()), radius = size.minDimension / 2 - 2.dp.toPx())
                drawCircle(DarkFace, radius = size.minDimension / 2 - 2.dp.toPx())
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(axis, style = CapText.copy(fontSize = 14.sp, fontWeight = FontWeight.Bold), color = DarkInk)
    }
}

@Composable
private fun Fader() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.width(22.dp).height(50.dp).clip(RoundedCornerShape(11.dp)).background(DarkEdge),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(18.dp, 10.dp).clip(RoundedCornerShape(3.dp)).background(LightFace))
        }
    }
}

@Composable
private fun Badge(action: KeyAction) {
    val c = LocalArcColors.current
    val (face, ink) = when (action) {
        KeyAction.HOLD -> HoldFace to HoldInk
        KeyAction.DIAL -> c.signal to c.onSignal
        else -> LightFace to LightInk
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            GuideText.badge(action),
            style = BadgeText,
            color = ink,
            modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(face).padding(horizontal = 6.dp, vertical = 2.dp),
        )
        // The small arrow from the badge down to its key.
        Canvas(Modifier.size(8.dp, 7.dp)) {
            val w = 1.5.dp.toPx()
            val x = size.width / 2
            drawLine(face, Offset(x, 0f), Offset(x, size.height), strokeWidth = w)
            drawLine(face, Offset(x - 3.dp.toPx(), size.height - 3.dp.toPx()), Offset(x, size.height), strokeWidth = w, cap = StrokeCap.Round)
            drawLine(face, Offset(x + 3.dp.toPx(), size.height - 3.dp.toPx()), Offset(x, size.height), strokeWidth = w, cap = StrokeCap.Round)
        }
    }
}

/** A square grey key with a cross, for closing the guide; it presses down like the other keys. */
@Composable
fun CloseKey(onClick: () -> Unit, description: String, modifier: Modifier = Modifier) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier
            .size(46.dp, 49.dp)
            .clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description }
            .drawBehind {
                val r = CornerRadius(8.dp.toPx())
                val drop = if (pressed) 3.dp.toPx() else 0f
                val face = Size(size.width, size.height - 3.dp.toPx())
                if (!pressed) drawRoundRect(CloseEdge, topLeft = Offset(0f, 3.dp.toPx()), size = face, cornerRadius = r)
                drawRoundRect(CloseFace, topLeft = Offset(0f, drop), size = face, cornerRadius = r)
                val inset = 15.dp.toPx()
                val top = drop + inset
                val bottom = drop + face.height - inset
                val w = 2.5.dp.toPx()
                drawLine(DarkInk, Offset(inset, top), Offset(size.width - inset, bottom), strokeWidth = w, cap = StrokeCap.Round)
                drawLine(DarkInk, Offset(size.width - inset, top), Offset(inset, bottom), strokeWidth = w, cap = StrokeCap.Round)
            },
    )
}

private val CloseFace = Color(0xFF8C8D8F)
private val CloseEdge = Color(0xFF5E5F61)
