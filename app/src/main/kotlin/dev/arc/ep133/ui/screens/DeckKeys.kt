package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capEdge
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * The keys under a page's glass (an addition: Live tools' Takes and Claude
 * pages, as the device's display): caps with a drawn glyph over a word, in
 * one row where each gets [KeyMin], else two rows of half each.
 */
@Composable
internal fun DeckStrip(keys: List<@Composable RowScope.() -> Unit>) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val perRow = if (maxWidth >= KeyMin * keys.size + KeyGap * (keys.size - 1)) keys.size else (keys.size + 1) / 2
        Column(verticalArrangement = Arrangement.spacedBy(KeyGap + 3.dp)) {
            for (row in keys.chunked(perRow)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(KeyGap)) { row.forEach { it() } }
            }
        }
    }
}

/** The narrowest a key of the strip gets; under it the strip takes two rows. */
private val KeyMin = 48.dp
private val KeyGap = 7.dp

internal enum class DeckStyle { NORMAL, SIGNAL, NAVY }

internal enum class DeckGlyph { DOT, PLAY, STOP, SHARE, TRIM, DUP, START, END, RESET, DONE, SAVE, SEND, DELETE, SCENE, PATTERN, CHAIN, PASTE, EDIT, NEXT }

/**
 * The answers to a question on the glass (an addition: the Claude page's prompt words): [keys] in rows of
 * [columns], the last row's gaps left empty so each key keeps its width.
 */
@Composable
internal fun KeyGrid(keys: List<@Composable RowScope.() -> Unit>, columns: Int = 4) {
    Column(verticalArrangement = Arrangement.spacedBy(KeyGap + 3.dp)) {
        for (row in keys.chunked(columns)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(KeyGap)) {
                row.forEach { it() }
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/**
 * A key with a word on it instead of a glyph (an answer: "Dub" over "118-126"): navy when it is the one picked
 * ([selected], read as such) or a part that is in ([checked], read as on or off).
 */
@Composable
internal fun RowScope.WordKey(
    label: String,
    description: String,
    onClick: () -> Unit,
    sub: String? = null,
    selected: Boolean? = null,
    checked: Boolean? = null,
    enabled: Boolean = true,
) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val on = selected == true || checked == true
    val (face, ink, edge) = if (on) Triple(c.navy, c.onNavy, capEdge(c.navy)) else Triple(c.key, c.ink, c.keyEdge)
    Column(
        Modifier
            .weight(1f)
            .padding(bottom = 3.dp)
            .heightIn(min = 52.dp)
            .cap(face, edge, RoundedCornerShape(8.dp), capPress(pressed && enabled), alpha = if (enabled) 1f else 0.45f)
            .clickable(interactionSource = source, indication = null, enabled = enabled, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                role = if (checked != null) Role.Checkbox else if (selected != null) Role.RadioButton else Role.Button
                selected?.let { this.selected = it }
                checked?.let { stateDescription = MirrorText.onOff(it) }
            }
            .padding(horizontal = 3.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
    ) {
        // One word shrinks to fit rather than break; two or more may take two lines.
        Text(
            label.uppercase(),
            style = ArcType.capsKeySmall.copy(fontSize = 11.sp, lineHeight = 13.sp),
            color = ink,
            maxLines = if (' ' in label.trim()) 2 else 1,
            softWrap = ' ' in label.trim(),
            textAlign = TextAlign.Center,
            autoSize = TextAutoSize.StepBased(minFontSize = 8.sp, maxFontSize = 11.sp, stepSize = 0.5.sp),
        )
        sub?.let { Text(it, style = ArcType.capsKeySmall.copy(fontSize = 9.sp, lineHeight = 11.sp), color = if (on) c.onNavy.copy(alpha = 0.75f) else c.signal, maxLines = 3, textAlign = TextAlign.Center) }
    }
}

/**
 * A key of the strip: a cap with [glyph] over its [label], read as
 * [description]. With [selected] it is one of a set of choices (read as
 * selected or not), with [checked] a switch (read as on or off); [onLongClick]
 * adds a hold (PASTE's: open a card file).
 */
@Composable
internal fun RowScope.DeckKey(
    glyph: DeckGlyph,
    label: String,
    description: String,
    onClick: () -> Unit,
    style: DeckStyle = DeckStyle.NORMAL,
    enabled: Boolean = true,
    glyphColor: Color? = null,
    selected: Boolean? = null,
    checked: Boolean? = null,
    /** A long press, and its name for screen readers (an action of the key's). */
    onLongClick: (() -> Unit)? = null,
    longClickLabel: String? = null,
) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val (face, ink, edge) = when (style) {
        DeckStyle.NORMAL -> Triple(c.key, c.ink, c.keyEdge)
        DeckStyle.SIGNAL -> Triple(c.signal, c.onSignal, c.signalEdge)
        DeckStyle.NAVY -> Triple(c.navy, c.onNavy, capEdge(c.navy))
    }
    Column(
        Modifier
            .weight(1f)
            .padding(bottom = 3.dp)
            .heightIn(min = 56.dp)
            .cap(face, edge, RoundedCornerShape(8.dp), capPress(pressed && enabled), alpha = if (enabled) 1f else 0.45f)
            .combinedClickable(
                interactionSource = source,
                indication = null,
                enabled = enabled,
                onLongClickLabel = longClickLabel,
                onLongClick = onLongClick,
                onClick = onClick,
            )
            .semantics(mergeDescendants = true) {
                contentDescription = description
                role = when {
                    selected != null -> Role.RadioButton
                    checked != null -> Role.Switch
                    else -> Role.Button
                }
                selected?.let { this.selected = it }
                checked?.let { stateDescription = MirrorText.onOff(it) }
            }
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        Canvas(Modifier.size(18.dp)) { drawGlyph(glyph, glyphColor ?: ink) }
        Text(label.uppercase(), style = ArcType.capsKeySmall.copy(fontSize = 11.sp), color = ink, maxLines = 1)
    }
}

internal fun DrawScope.drawGlyph(glyph: DeckGlyph, color: Color) {
    val w = size.minDimension
    val s = w * 0.12f
    fun line(a: Offset, b: Offset) = drawLine(color, a, b, s, StrokeCap.Round)
    when (glyph) {
        DeckGlyph.DOT -> drawCircle(color, radius = w * 0.3f)
        DeckGlyph.PLAY -> drawPath(
            Path().apply {
                moveTo(w * 0.22f, w * 0.12f)
                lineTo(w * 0.88f, w * 0.5f)
                lineTo(w * 0.22f, w * 0.88f)
                close()
            },
            color,
        )
        DeckGlyph.STOP -> drawRect(color, Offset(w * 0.2f, w * 0.2f), Size(w * 0.6f, w * 0.6f))
        DeckGlyph.SHARE -> {
            line(Offset(w * 0.22f, w * 0.78f), Offset(w * 0.78f, w * 0.22f))
            line(Offset(w * 0.38f, w * 0.22f), Offset(w * 0.78f, w * 0.22f))
            line(Offset(w * 0.78f, w * 0.22f), Offset(w * 0.78f, w * 0.62f))
        }
        // Scissors: two blades crossing above two rings.
        DeckGlyph.TRIM -> {
            line(Offset(w * 0.3f, w * 0.12f), Offset(w * 0.62f, w * 0.62f))
            line(Offset(w * 0.7f, w * 0.12f), Offset(w * 0.38f, w * 0.62f))
            drawCircle(color, w * 0.14f, Offset(w * 0.28f, w * 0.76f), style = Stroke(s))
            drawCircle(color, w * 0.14f, Offset(w * 0.72f, w * 0.76f), style = Stroke(s))
        }
        // Two sheets, one over the other.
        DeckGlyph.DUP -> {
            drawRoundRect(color, Offset(w * 0.12f, w * 0.12f), Size(w * 0.5f, w * 0.5f), CornerRadius(w * 0.07f), style = Stroke(s))
            drawRoundRect(color, Offset(w * 0.38f, w * 0.38f), Size(w * 0.5f, w * 0.5f), CornerRadius(w * 0.07f))
        }
        // A bracket opening right, and one closing.
        DeckGlyph.START, DeckGlyph.END -> {
            val (x0, x1) = if (glyph == DeckGlyph.START) w * 0.32f to w * 0.62f else w * 0.68f to w * 0.38f
            line(Offset(x0, w * 0.12f), Offset(x0, w * 0.88f))
            line(Offset(x0, w * 0.12f), Offset(x1, w * 0.12f))
            line(Offset(x0, w * 0.88f), Offset(x1, w * 0.88f))
        }
        // A ring nearly closed, with its arrow's head.
        DeckGlyph.RESET -> {
            drawArc(color, -60f, 290f, false, Offset(w * 0.18f, w * 0.18f), Size(w * 0.64f, w * 0.64f), style = Stroke(s, cap = StrokeCap.Round))
            line(Offset(w * 0.66f, w * 0.06f), Offset(w * 0.68f, w * 0.26f))
            line(Offset(w * 0.68f, w * 0.26f), Offset(w * 0.86f, w * 0.18f))
        }
        DeckGlyph.DONE -> {
            line(Offset(w * 0.16f, w * 0.52f), Offset(w * 0.4f, w * 0.76f))
            line(Offset(w * 0.4f, w * 0.76f), Offset(w * 0.86f, w * 0.26f))
        }
        DeckGlyph.SAVE -> {
            line(Offset(w * 0.5f, w * 0.1f), Offset(w * 0.5f, w * 0.66f))
            line(Offset(w * 0.26f, w * 0.44f), Offset(w * 0.5f, w * 0.68f))
            line(Offset(w * 0.74f, w * 0.44f), Offset(w * 0.5f, w * 0.68f))
            line(Offset(w * 0.18f, w * 0.9f), Offset(w * 0.82f, w * 0.9f))
        }
        DeckGlyph.SEND -> {
            line(Offset(w * 0.12f, w * 0.5f), Offset(w * 0.86f, w * 0.5f))
            line(Offset(w * 0.56f, w * 0.22f), Offset(w * 0.86f, w * 0.5f))
            line(Offset(w * 0.56f, w * 0.78f), Offset(w * 0.86f, w * 0.5f))
        }
        DeckGlyph.DELETE -> {
            line(Offset(w * 0.24f, w * 0.24f), Offset(w * 0.76f, w * 0.76f))
            line(Offset(w * 0.76f, w * 0.24f), Offset(w * 0.24f, w * 0.76f))
        }
        // Four groups' rows of steps.
        DeckGlyph.SCENE -> for (r in 0 until 4) {
            drawRoundRect(color, Offset(w * 0.1f, w * (0.12f + r * 0.21f)), Size(w * 0.8f, w * 0.13f), CornerRadius(w * 0.04f))
        }
        // One group's steps.
        DeckGlyph.PATTERN -> for (i in 0 until 4) {
            drawRoundRect(color, Offset(w * (0.06f + i * 0.23f), w * 0.4f), Size(w * 0.17f, w * 0.2f), CornerRadius(w * 0.04f))
        }
        // Scenes linked in a row.
        DeckGlyph.CHAIN -> {
            line(Offset(w * 0.2f, w * 0.5f), Offset(w * 0.8f, w * 0.5f))
            for (x in listOf(0.16f, 0.5f, 0.84f)) drawCircle(color, radius = w * 0.13f, center = Offset(w * x, w * 0.5f))
        }
        // A pencil, its point down to the left.
        DeckGlyph.EDIT -> {
            line(Offset(w * 0.2f, w * 0.66f), Offset(w * 0.64f, w * 0.22f))
            line(Offset(w * 0.34f, w * 0.8f), Offset(w * 0.78f, w * 0.36f))
            line(Offset(w * 0.64f, w * 0.22f), Offset(w * 0.78f, w * 0.36f))
            line(Offset(w * 0.2f, w * 0.66f), Offset(w * 0.12f, w * 0.88f))
            line(Offset(w * 0.12f, w * 0.88f), Offset(w * 0.34f, w * 0.8f))
        }
        DeckGlyph.NEXT -> {
            line(Offset(w * 0.36f, w * 0.18f), Offset(w * 0.68f, w * 0.5f))
            line(Offset(w * 0.68f, w * 0.5f), Offset(w * 0.36f, w * 0.82f))
        }
        // A clipboard.
        DeckGlyph.PASTE -> {
            drawRoundRect(color, Offset(w * 0.2f, w * 0.18f), Size(w * 0.6f, w * 0.72f), CornerRadius(w * 0.08f), style = Stroke(s))
            drawRoundRect(color, Offset(w * 0.36f, w * 0.08f), Size(w * 0.28f, w * 0.18f), CornerRadius(w * 0.05f))
            line(Offset(w * 0.34f, w * 0.5f), Offset(w * 0.66f, w * 0.5f))
            line(Offset(w * 0.34f, w * 0.68f), Offset(w * 0.58f, w * 0.68f))
        }
    }
}
