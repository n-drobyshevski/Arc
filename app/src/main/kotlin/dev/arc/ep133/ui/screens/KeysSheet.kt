package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.features.KeyMark
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.Scale
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.LocalArcWindow
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capEdge
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/** Which of KEYS' words opened the sheet: its section is scrolled into view. */
enum class KeysSheetPart { SCALE, KEY, OCTAVE }

/**
 * The twelve semitones up from a scale's root, as its row in the KEYS sheet draws them as dots:
 * the root, the scale's other notes, and the notes outside it.
 */
internal fun scaleDots(scale: Scale): List<KeyMark> = List(12) { i ->
    when {
        i == 0 -> KeyMark.ROOT
        i in scale.intervals -> KeyMark.IN
        else -> KeyMark.OUT
    }
}

/**
 * The KEYS sheet, which a tap on KEYS' scale, key or octave word opens ([part]: that one's section in
 * view): under SCALE and a close ✕, a row for each scale with its twelve notes as dots (the root
 * orange, its other notes filled, the rest rings), the current one navy; then KEY, the twelve notes
 * as caps in two rows of six; then OCTAVE, caps 0 to 8. A tap applies at once, with a tick under the
 * finger ([haptics], Live's), and the sheet stays open to change another; ✕ ([onDone]), a swipe
 * down, Back or the scrim close it. On a phone on its side (a short window) the scales take two
 * columns, and the keys and octaves sit side by side.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ColumnScope.KeysSheetContent(
    keys: KeysUi,
    actions: KeysActions,
    onDone: () -> Unit,
    part: KeysSheetPart = KeysSheetPart.SCALE,
    haptics: Boolean = true,
) {
    val short = LocalArcWindow.current.short
    val feel = LocalHapticFeedback.current
    val tick = { if (haptics) feel.performHapticFeedback(HapticFeedbackType.SegmentTick) }
    val keyAt = remember { BringIntoViewRequester() }
    val octaveAt = remember { BringIntoViewRequester() }
    LaunchedEffect(part) {
        // Once the sheet is laid out, so the scroll knows where the section is.
        withFrameNanos { }
        when (part) {
            KeysSheetPart.KEY -> keyAt.bringIntoView()
            KeysSheetPart.OCTAVE -> octaveAt.bringIntoView()
            KeysSheetPart.SCALE -> Unit
        }
    }
    val rowHeight = if (short) 40.dp else 42.dp
    val capHeight = if (short) 40.dp else 44.dp
    Column(
        Modifier
            // The caption sits closer under the grip than the sheet's spacing: the ✕'s touch area reaches up into it.
            .layout { measurable, constraints ->
                val p = measurable.measure(constraints)
                val lift = HeaderLift.roundToPx()
                layout(p.width, p.height - lift) { p.place(0, -lift) }
            }
            .fillMaxWidth(),
    ) {
        Row(Modifier.fillMaxWidth().height(44.dp), verticalAlignment = Alignment.CenterVertically) {
            Caption(MirrorText.SCALE, Modifier.weight(1f))
            CloseCross(onDone)
        }
        val scales = Scale.entries
        val pick: (Scale) -> Unit = { s ->
            tick()
            if (s != keys.scale) actions.onScale(s)
        }
        if (short) {
            // Column by column, in order: the first half on the left.
            val tall = (scales.size + 1) / 2
            Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                for (col in scales.chunked(tall)) {
                    Column(Modifier.weight(1f)) {
                        for (s in col) ScaleRow(s, s == keys.scale, rowHeight) { pick(s) }
                    }
                }
            }
        } else {
            Column(Modifier.fillMaxWidth().selectableGroup()) {
                for (s in scales) ScaleRow(s, s == keys.scale, rowHeight) { pick(s) }
            }
        }
        Spacer(Modifier.height(if (short) 10.dp else 14.dp))
        val key: @Composable (Modifier) -> Unit = { modifier ->
            Column(modifier.bringIntoViewRequester(keyAt)) {
                Caption(MirrorText.KEY, Modifier.padding(vertical = 8.dp))
                Column(Modifier.fillMaxWidth().selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (row in (0..11).chunked(6)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            for (pc in row) {
                                PickCap(
                                    Keys.name(pc, keys.names),
                                    MirrorText.keyWord(pc, keys.names),
                                    on = pc == keys.root,
                                    height = capHeight,
                                    modifier = Modifier.weight(1f),
                                ) {
                                    tick()
                                    if (pc != keys.root) actions.onRoot(pc)
                                }
                            }
                        }
                    }
                }
            }
        }
        val octave: @Composable (Modifier) -> Unit = { modifier ->
            Column(modifier.bringIntoViewRequester(octaveAt)) {
                Caption(MirrorText.OCTAVE, Modifier.padding(vertical = 8.dp))
                Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(if (short) 5.dp else 6.dp)) {
                    for (n in Keys.MIN_OCTAVE..Keys.MAX_OCTAVE) {
                        PickCap(n.toString(), MirrorText.octaveCap(n), on = n == keys.octave, height = capHeight, modifier = Modifier.weight(1f)) {
                            tick()
                            if (n != keys.octave) actions.onOctave(n)
                        }
                    }
                }
            }
        }
        if (short) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                key(Modifier.weight(1f))
                octave(Modifier.weight(1f))
            }
        } else {
            key(Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            octave(Modifier.fillMaxWidth())
        }
        // Room for the caps' edges under the last row.
        Spacer(Modifier.height(4.dp))
    }
}

/** How far the sheet's head is pulled up into the room under the grip. */
private val HeaderLift = 10.dp

/** A section's name over its choices, in small spaced capitals; a heading for screen readers. */
@Composable
private fun Caption(text: String, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    Text(
        text.uppercase(),
        style = ArcType.caps.copy(fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.14.em),
        color = c.graphite,
        maxLines = 1,
        modifier = modifier.semantics { heading() },
    )
}

/** The sheet's ✕: a small cross at the caption's end, a touch target its full 44 dp. */
@Composable
private fun CloseCross(onClick: () -> Unit) {
    val c = LocalArcColors.current
    Box(
        Modifier
            // The cross lines up with the rows' dots; its touch area reaches into the sheet's margin.
            .offset(x = 12.dp)
            .size(44.dp)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = MirrorText.CLOSE_KEYS_SHEET },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(10.dp)) {
            val w = 1.8.dp.toPx()
            drawLine(c.graphite, Offset.Zero, Offset(size.width, size.height), strokeWidth = w, cap = StrokeCap.Round)
            drawLine(c.graphite, Offset(size.width, 0f), Offset(0f, size.height), strokeWidth = w, cap = StrokeCap.Round)
        }
    }
}

/** A scale's row: its name and its twelve notes as dots ([ScaleDots]); navy while it is the scale. */
@Composable
private fun ScaleRow(scale: Scale, on: Boolean, height: Dp, onPick: () -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val shape = RoundedCornerShape(10.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .height(height)
            .background(
                when {
                    on -> c.navy
                    pressed -> c.key
                    else -> Color.Transparent
                },
                shape,
            )
            .selectable(on, interactionSource = source, indication = null, role = Role.RadioButton, onClick = onPick)
            .semantics { contentDescription = MirrorText.scaleRow(scale) }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            MirrorText.scaleName(scale).uppercase(),
            style = ArcType.key.copy(fontSize = 16.sp, letterSpacing = 0.02.em),
            color = if (on) c.onNavy else c.navy,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).clearAndSetSemantics { },
        )
        Spacer(Modifier.width(12.dp))
        ScaleDots(scale, on)
    }
}

/** The dots' size and the room between them. */
private val DotSize = 8.dp
private val DotGap = 4.dp

/**
 * A scale's twelve semitones from its root ([scaleDots]): the root a signal-orange dot, its other
 * notes filled navy, the rest navy rings; on a navy row ([on]) the filled ones turn the row's ink and
 * the rings fade. Decorative: the row says how many notes.
 */
@Composable
private fun ScaleDots(scale: Scale, on: Boolean) {
    val c = LocalArcColors.current
    val marks = remember(scale) { scaleDots(scale) }
    val fill = if (on) c.onNavy else c.navy
    val ring = if (on) c.onNavy.copy(alpha = 0.5f) else c.graphite
    Canvas(Modifier.size(DotSize * 12 + DotGap * 11, DotSize).clearAndSetSemantics { }) {
        val d = DotSize.toPx()
        val step = d + DotGap.toPx()
        val stroke = 1.5.dp.toPx()
        marks.forEachIndexed { i, mark ->
            val center = Offset(i * step + d / 2, size.height / 2)
            when (mark) {
                KeyMark.ROOT -> drawCircle(c.signal, d / 2, center)
                KeyMark.IN -> drawCircle(fill, d / 2, center)
                KeyMark.OUT -> drawCircle(ring, (d - stroke) / 2, center, style = Stroke(stroke))
            }
        }
    }
}

/** A key or an octave as a pale cap with its edge ([cap]); navy while it is the one picked. */
@Composable
private fun PickCap(label: String, description: String, on: Boolean, height: Dp, modifier: Modifier, onPick: () -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier
            .height(height)
            .cap(if (on) c.navy else c.key, if (on) capEdge(c.navy) else c.keyEdge, RoundedCornerShape(10.dp), capPress(pressed))
            .selectable(on, interactionSource = source, indication = null, role = Role.RadioButton, onClick = onPick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = ArcType.key.copy(fontSize = 16.sp),
            color = if (on) c.onNavy else c.navy,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}
