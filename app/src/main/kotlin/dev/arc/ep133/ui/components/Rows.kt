package dev.arc.ep133.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.collapse
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.expand
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.text.SettingsText
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/*
 * The settings' row pattern, shared by Settings and Live tools: a name with a
 * one-line note on the left, the control on the right (a hardware toggle, a
 * compact Segmented, a key), rows grouped on a [GridPlate] with [PlateLine]s
 * between them. Where there is more to say, an info key opens the long note
 * under the row in a tinted tip box (the web's ui/settings rows).
 */

/** The narrowest a row's name keeps beside its control before the control moves under it. */
private val RowNameMin = 96.dp

/**
 * One settings row: [title] and [note] on the left, [control] on the right,
 * or under the name, full width, when it doesn't fit beside it (or always,
 * with [stacked]). [info] adds the info key after the name, which opens that
 * long note under the row. [modifier] goes on the whole row (a row that
 * toggles or opens something puts its click there).
 */
@Composable
fun SettingRow(
    title: String,
    modifier: Modifier = Modifier,
    note: String? = null,
    info: String? = null,
    stacked: Boolean = false,
    titleColor: Color? = null,
    control: (@Composable () -> Unit)? = null,
) {
    val c = LocalArcColors.current
    var open by rememberSaveable(title) { mutableStateOf(false) }
    Column(
        modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        val label: @Composable () -> Unit = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(title, style = ArcType.semi, color = titleColor ?: c.ink, modifier = Modifier.weight(1f, fill = false))
                    if (info != null) InfoButton(open, { open = !open }, Modifier.padding(start = 2.dp))
                }
                if (note != null) Text(note, style = ArcType.small, color = c.graphite)
            }
        }
        RowLayout(stacked, label, control)
        if (info != null) {
            AnimatedVisibility(open, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                TipBox(info, Modifier.padding(top = 10.dp))
            }
        }
    }
}

/**
 * The name and the control side by side, the control at the end at its own
 * width; when the name would get narrower than [RowNameMin] (or with
 * [stacked]), the control goes under it and may take the full width.
 */
@Composable
private fun RowLayout(stacked: Boolean, label: @Composable () -> Unit, control: (@Composable () -> Unit)?) {
    if (control == null) {
        label()
        return
    }
    Layout(contents = listOf(label, control)) { (labels, controls), constraints ->
        val w = constraints.maxWidth
        val name = labels.first()
        val ctl = controls.first()
        val gap = 12.dp.roundToPx()
        val cw = ctl.maxIntrinsicWidth(Constraints.Infinity)
        // A short name needs only its own width; a long one keeps at least the minimum.
        val nameMin = minOf(name.maxIntrinsicWidth(Constraints.Infinity), RowNameMin.roundToPx())
        if (!stacked && cw + gap + nameMin <= w) {
            val cp = ctl.measure(Constraints(maxWidth = cw))
            val np = name.measure(Constraints(maxWidth = (w - cw - gap).coerceAtLeast(0)))
            val h = maxOf(cp.height, np.height)
            layout(w, h) {
                np.placeRelative(0, (h - np.height) / 2)
                cp.placeRelative(w - cp.width, (h - cp.height) / 2)
            }
        } else {
            val np = name.measure(Constraints(maxWidth = w))
            val cp = ctl.measure(Constraints(maxWidth = w))
            val under = 10.dp.roundToPx()
            layout(w, np.height + under + cp.height) {
                np.placeRelative(0, 0)
                cp.placeRelative(0, np.height + under)
            }
        }
    }
}

/** The long note under a row: small ink on a navy tint. */
@Composable
fun TipBox(text: String, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    Text(
        text,
        style = ArcType.small,
        color = c.ink,
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(c.navy.copy(alpha = 0.1f))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    )
}

/**
 * The info key after a row's name: a ringed "i", filled navy while its long
 * note is open. Screen readers hear "More about this", expanded or collapsed.
 */
@Composable
fun InfoButton(open: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(32.dp)
            .clip(CircleShape)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = SettingsText.MORE_INFO
                if (open) {
                    collapse {
                        onClick()
                        true
                    }
                } else {
                    expand {
                        onClick()
                        true
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        InfoGlyph(filled = open)
    }
}

/** A ringed "i", drawn (filled navy when [filled]). */
@Composable
fun InfoGlyph(modifier: Modifier = Modifier, filled: Boolean = false) {
    val c = LocalArcColors.current
    Canvas(modifier.size(20.dp)) {
        val r = size.minDimension / 2
        val line = 1.5.dp.toPx()
        val ink = if (filled) c.onNavy else c.graphite
        if (filled) drawCircle(c.navy, r) else drawCircle(c.graphite, r - line / 2, style = Stroke(line))
        drawCircle(ink, 1.4.dp.toPx(), Offset(center.x, size.height * 0.3f))
        drawLine(ink, Offset(center.x, size.height * 0.45f), Offset(center.x, size.height * 0.74f), strokeWidth = 2.dp.toPx(), cap = StrokeCap.Round)
    }
}

/** A small chevron pointing to the end ("›"), turned down when [open]. */
@Composable
fun Chevron(modifier: Modifier = Modifier, open: Boolean = false, color: Color? = null) {
    val ink = color ?: LocalArcColors.current.graphite
    Canvas(modifier.size(12.dp).rotate(if (open) 90f else 0f)) {
        val w = 1.8.dp.toPx()
        drawLine(ink, Offset(size.width * 0.35f, size.height * 0.15f), Offset(size.width * 0.7f, size.height / 2), strokeWidth = w, cap = StrokeCap.Round)
        drawLine(ink, Offset(size.width * 0.7f, size.height / 2), Offset(size.width * 0.35f, size.height * 0.85f), strokeWidth = w, cap = StrokeCap.Round)
    }
}

/**
 * A hardware toggle: a small cap with an LED and ON / OFF, as the K.O. II
 * marks a mode that is on. On, it is navy, down on its edge, its LED lit
 * orange. It only draws; the row it sits in takes the tap ([SwitchRow]), and
 * passes [pressed] so the cap goes down under the finger.
 */
@Composable
fun HwToggle(on: Boolean, modifier: Modifier = Modifier, pressed: Boolean = false) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val face = if (on) c.navy else c.key
    val edge = if (on) capEdge(c.navy) else c.keyEdge
    Row(
        modifier
            .cap(face, edge, RoundedCornerShape(8.dp), capPress(on || pressed))
            .widthIn(min = 64.dp)
            .heightIn(min = 34.dp)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        Box(
            Modifier
                .size(7.dp)
                .drawBehind {
                    // A lit LED glows a little past its edge.
                    if (on) drawCircle(c.signal.copy(alpha = 0.35f), radius = size.minDimension)
                    drawCircle(if (on) c.signal else hw.ledOff)
                },
        )
        Text((if (on) SettingsText.ON else SettingsText.OFF).uppercase(), style = ArcType.capsKeySmall, color = if (on) c.onNavy else c.graphite, maxLines = 1)
    }
}

/** A setting that is on or off: its name and note, and a [HwToggle]; the whole row switches it. */
@Composable
fun SwitchRow(title: String, note: String?, on: Boolean, onChange: (Boolean) -> Unit, info: String? = null) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    SettingRow(
        title,
        Modifier
            .clickable(interactionSource = source, indication = null, role = Role.Switch) { onChange(!on) }
            .semantics { stateDescription = if (on) SettingsText.ON else SettingsText.OFF },
        note = note,
        info = info,
    ) { HwToggle(on, pressed = pressed) }
}

/** A row that opens something (a page, a link): its name, and a chevron at the end. */
@Composable
fun LinkRow(title: String, onClick: () -> Unit, note: String? = null) {
    SettingRow(
        title,
        Modifier.clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClick),
        note = note,
    ) { Chevron(Modifier.padding(horizontal = 6.dp)) }
}

/**
 * A plate that folds its long notes away: a ringed "i", [title] and a
 * chevron; a tap unfolds [content] under it.
 */
@Composable
fun Disclosure(title: String, modifier: Modifier = Modifier, initiallyOpen: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    val c = LocalArcColors.current
    var open by rememberSaveable(title) { mutableStateOf(initiallyOpen) }
    GridPlate(modifier) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { open = !open }
                .semantics {
                    if (open) {
                        collapse {
                            open = false
                            true
                        }
                    } else {
                        expand {
                            open = true
                            true
                        }
                    }
                }
                .heightIn(min = 52.dp)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            InfoGlyph()
            Text(title, style = ArcType.semi, color = c.ink, modifier = Modifier.weight(1f))
            Chevron(open = open)
        }
        AnimatedVisibility(open, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
        }
    }
}

/** The black keys of an octave, by pitch class. */
private val BlackKeys = setOf(1, 3, 6, 8, 10)

/**
 * One octave of piano keys to pick KEYS' key (its root): each a cap with its
 * name at its foot, the chosen one navy and down. A radio group for screen
 * readers, each key read by its name.
 */
@Composable
fun MiniPiano(root: Int, names: NoteNames, onRoot: (Int) -> Unit, modifier: Modifier = Modifier, height: Dp = 92.dp) {
    val c = LocalArcColors.current
    BoxWithConstraints(modifier.fillMaxWidth().height(height).selectableGroup()) {
        val white = maxWidth / 7
        val shape = RoundedCornerShape(bottomStart = 6.dp, bottomEnd = 6.dp)
        // The whites first, so the blacks sit over them.
        var seen = 0
        val blacks = mutableListOf<Pair<Int, Int>>()
        for (pc in 0..11) {
            if (pc in BlackKeys) {
                blacks += pc to seen
                continue
            }
            PickerKey(
                pc, root == pc, names, onRoot, shape,
                face = c.pianoWhite, edge = c.keyOut, ink = c.ink,
                modifier = Modifier.offset(x = white * seen + 2.dp).width(white - 4.dp).fillMaxHeight(),
            )
            seen++
        }
        for ((pc, left) in blacks) {
            PickerKey(
                pc, root == pc, names, onRoot, shape,
                face = c.pianoBlack, edge = c.keyOutBlack, ink = c.onPianoBlack,
                modifier = Modifier.offset(x = white * left - white * 0.35f).width(white * 0.7f).fillMaxHeight(0.58f),
            )
        }
    }
}

@Composable
private fun PickerKey(
    pc: Int,
    on: Boolean,
    names: NoteNames,
    onRoot: (Int) -> Unit,
    shape: RoundedCornerShape,
    face: Color,
    edge: Color,
    ink: Color,
    modifier: Modifier,
) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier
            .cap(if (on) c.navy else face, if (on) capEdge(c.navy) else edge, shape, capPress(on || pressed))
            .selectable(on, interactionSource = source, indication = null, role = Role.RadioButton) { onRoot(pc) }
            .padding(bottom = 7.dp),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Text(
            Keys.name(pc, names),
            style = ArcType.capsKeySmall.copy(fontSize = if (pc in BlackKeys) ArcType.tiny.fontSize * 0.8f else ArcType.tiny.fontSize * 0.85f),
            color = if (on) c.onNavy else ink,
            maxLines = 1,
            softWrap = false,
            textAlign = TextAlign.Center,
        )
    }
}
