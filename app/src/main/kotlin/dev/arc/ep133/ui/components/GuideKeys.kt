package dev.arc.ep133.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.text.Combo
import dev.arc.ep133.text.GuideCombo
import dev.arc.ep133.text.GuideKeymap
import dev.arc.ep133.text.GuideText
import dev.arc.ep133.text.KeyAction
import dev.arc.ep133.text.KeymapStep
import dev.arc.ep133.text.PanelKey
import dev.arc.ep133.text.PanelKeymap
import dev.arc.ep133.text.StepKind
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.BaseText
import dev.arc.ep133.ui.theme.LocalArcColors

/*
 * Key caps for the shortcut guide, drawn after the device and small enough to
 * sit in a line of text: pale keys (SHIFT, - and +, the group keys, ERASE),
 * dark keys and pads, and the orange ones (KNOB X, RECORD). A tag before a
 * key says what to do with it (HOLD, TYPE, TURN). These are the device's own
 * colours, so they stay the same in the dark theme.
 */
private val LightFace = Color(0xFFDAD9D5)
private val LightEdge = Color(0xFFA9A8A2)
private val LightInk = Color(0xFF55575A)
private val DarkFace = Color(0xFF4A4B4D)
private val DarkEdge = Color(0xFF1E1F21)
private val DarkInk = Color(0xFFEDECE8)
internal val HoldFace = Color(0xFFB8E2EE)
internal val HoldInk = Color(0xFF1D6577)

private val CapText = BaseText.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.04.em, lineHeight = 1.2.em)
private val TagText = BaseText.copy(fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.06.em, lineHeight = 1.2.em)
private val BadgeText = BaseText.copy(fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.04.em, lineHeight = 1.em)

private val LIGHT_KEYS = setOf("SHIFT", "-", "+", "A", "B", "C", "D", "A-D", "ERASE")
private val SIGNAL_KEYS = setOf("KNOB X", "RECORD")

/** A key name as its cap prints it: any pad is PAD, ranges get an en dash, minus a real minus. */
private fun capText(label: String): String = when (label) {
    "pad" -> "PAD"
    "0-9" -> "0–9"
    "1-9" -> "1–9"
    "A-D" -> "A–D"
    "-" -> "−"
    else -> label
}

/**
 * A guide entry's combo as one line of small caps: the mode it starts in (or
 * its situation) first, keys pressed together joined by +, steps by an arrow,
 * separate ways by "or". Screen readers get [spoken] (the guide's own key text) instead.
 */
@Composable
fun ComboLine(combo: Combo, keymap: GuideKeymap, spoken: String, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    FlowRow(
        modifier.clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        val mode = keymap.mode
        val context = combo.context
        if (mode != null) {
            Tag(GuideText.modeTag(mode), c.navy.copy(alpha = 0.12f), c.navy)
        } else if (context != null) {
            Tag(context, c.graphite.copy(alpha = 0.12f), c.graphite)
        }
        combo.options.forEachIndexed { i, option ->
            if (i > 0) Text(GuideText.OR, style = ArcType.tiny, color = c.graphite)
            option.forEachIndexed { j, step ->
                if (j > 0) Arrow()
                step.keys.forEachIndexed { n, k ->
                    // "- +" sit side by side like the device's pair; other keys are joined by + or /.
                    if (n > 0 && !(k.label == "+" && step.keys[n - 1].label == "-" && !step.alternatives)) {
                        Joiner(if (step.alternatives) "/" else "+")
                    }
                    // A tag stays on the line with its key.
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        k.action?.let { ActionTag(it) }
                        MiniCap(k.label)
                    }
                }
            }
        }
    }
}

/**
 * The expanded entry's numbered steps (the combo's first way, as the K.O. II
 * illustration numbers them): a badge, what to do, and the keys to do it on.
 */
@Composable
fun KeymapSteps(keymap: GuideKeymap, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    FlowRow(
        modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        keymap.steps.forEachIndexed { i, step ->
            if (i > 0) Arrow()
            val labels = stepLabels(step)
            val spoken = GuideText.step(i + 1) + ": " + GuideText.stepWord(step.kind) +
                if (step.kind == StepKind.TYPE) "" else " " + labels.joinToString(if (step.either) " / " else " + ") { capText(it) }
            Row(
                Modifier.clearAndSetSemantics { contentDescription = spoken },
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StepBadge(i + 1, step.kind)
                Text(GuideText.stepWord(step.kind), style = ArcType.tiny, color = c.graphite)
                // Typing names its keys already ("on the pads").
                if (step.kind != StepKind.TYPE) labels.forEachIndexed { n, label ->
                    if (n > 0 && !(label == "+" && labels[n - 1] == "-" && !step.either)) Joiner(if (step.either) "/" else "+")
                    MiniCap(label)
                }
            }
        }
    }
}

/** The pill numbering a step, in the hold colour for a held key and signal orange otherwise. */
@Composable
fun StepBadge(n: Int, kind: StepKind) {
    val c = LocalArcColors.current
    val hold = kind == StepKind.HOLD
    Box(
        Modifier
            .heightIn(min = 22.dp)
            .widthIn(min = 22.dp)
            .clip(RoundedCornerShape(11.dp))
            .background(if (hold) HoldFace else c.signal)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(n.toString(), style = BadgeText, color = if (hold) HoldInk else c.onSignal)
    }
}

/** A step's panel keys as key names: a whole set (any pad, the digits, the groups) as one. */
private fun stepLabels(step: KeymapStep): List<String> {
    val sets = listOf(PanelKey.PADS to "pad", PanelKey.DIGITS to "0-9", PanelKey.DIGITS.drop(1) to "1-9", PanelKey.GROUPS to "A-D")
    var rest = step.keys
    val named = ArrayList<Pair<Int, String>>()
    for ((set, name) in sets) {
        if (rest.containsAll(set)) {
            named += step.keys.indexOf(set.first()) to name
            rest = rest - set.toSet()
        }
    }
    for (k in rest) named += step.keys.indexOf(k) to (KeyNames[k] ?: GuideText.panelLabel(k).uppercase())
    return named.sortedBy { it.first }.map { it.second }
}

/** Each panel key's name in the combo notation ("KNOB X", "-"), for keys the notation names one by one. */
private val KeyNames: Map<PanelKey, String> by lazy {
    GuideCombo.KEY_NAMES.mapNotNull { n -> runCatching { PanelKeymap.keysFor(n) }.getOrNull()?.singleOrNull()?.let { it to n } }.toMap()
}

/** A small key cap in the device's colours, with the flat edge of every key in the app. */
@Composable
private fun MiniCap(label: String) {
    val c = LocalArcColors.current
    val (face, edge, ink) = when (label) {
        in SIGNAL_KEYS -> Triple(c.signal, c.signalEdge, c.onSignal)
        in LIGHT_KEYS -> Triple(LightFace, LightEdge, LightInk)
        else -> Triple(DarkFace, DarkEdge, DarkInk)
    }
    Box(
        Modifier
            .padding(end = RoundCapDx, bottom = RoundCapDy)
            .cap(face, edge, RoundedCornerShape(5.dp), 0f, dx = RoundCapDx, dy = RoundCapDy)
            .widthIn(min = 22.dp)
            .padding(horizontal = 7.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(capText(label), style = CapText, color = ink)
    }
}

/** HOLD, TYPE, TURN, MOVE or 2× before a key. */
@Composable
private fun ActionTag(action: KeyAction) {
    val c = LocalArcColors.current
    val (face, ink) = when (action) {
        KeyAction.HOLD -> HoldFace to HoldInk
        KeyAction.DIAL -> c.signal to c.onSignal
        else -> LightFace to LightInk
    }
    Tag(GuideText.tag(action), face, ink)
}

@Composable
private fun Tag(text: String, face: Color, ink: Color) {
    Text(text, style = TagText, color = ink, modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(face).padding(horizontal = 5.dp, vertical = 2.dp))
}

@Composable
private fun Joiner(text: String) {
    Text(text, style = ArcType.tiny, color = LocalArcColors.current.graphite)
}

/** The arrow between steps, drawn so it lines up whatever the font. */
@Composable
private fun Arrow() {
    val ink = LocalArcColors.current.graphite
    Canvas(Modifier.size(12.dp, 10.dp)) {
        val w = 1.4.dp.toPx()
        val y = size.height / 2
        drawLine(ink, Offset(0f, y), Offset(size.width, y), strokeWidth = w, cap = StrokeCap.Round)
        drawLine(ink, Offset(size.width - 4.dp.toPx(), y - 3.5.dp.toPx()), Offset(size.width, y), strokeWidth = w, cap = StrokeCap.Round)
        drawLine(ink, Offset(size.width - 4.dp.toPx(), y + 3.5.dp.toPx()), Offset(size.width, y), strokeWidth = w, cap = StrokeCap.Round)
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
