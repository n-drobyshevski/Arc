package dev.arc.ep133.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.features.DeviceBrowser
import dev.arc.ep133.features.PadTarget
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.protocol.SoundEntry
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Format
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.ArcField
import dev.arc.ep133.ui.components.ArcIcon
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.components.PlayKey
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capEdge
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.components.plateRow
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * EDIT's pad sheet (an addition): another sound for a Live pad. The pad's cap
 * and what is on it now, then the device's sounds (found by name or slot, a
 * hundred slots at a time) each with a preview; a tap on one puts it on the
 * pad at once (the toast offers UNDO). "Upload a new sample…" loads a WAV
 * into a free slot and puts that on the pad.
 *
 * [sounds] is the device's sound list as Live read it; [playing] is the
 * player's key ("device:<slot>" while a preview plays).
 */
@Composable
fun ColumnScope.PadSheetContent(
    pad: PhysicalPad,
    target: PadTarget,
    sounds: List<SoundEntry>,
    playing: String?,
    busy: Boolean,
    onPlay: (Int) -> Unit,
    onStop: () -> Unit,
    onPick: (Int) -> Unit,
    onUpload: () -> Unit,
) {
    val c = LocalArcColors.current
    val now = target.slot
    val nowName = sounds.firstOrNull { it.slot == now }?.name
    var query by rememberSaveable { mutableStateOf("") }
    // The hundred of slots listed (its first slot): the pad's own at first.
    var shown by rememberSaveable { mutableStateOf<Int?>(null) }
    val groups = remember(sounds, query) { DeviceBrowser.hundreds(DeviceBrowser.findSounds(sounds, query)) }
    val range = groups.firstOrNull { it.first.first == shown }
        ?: groups.firstOrNull { now != null && now in it.first }
        ?: groups.firstOrNull()

    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        PadCap(pad, nowName)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(MirrorText.padTitle(pad), style = ArcType.heading, color = c.ink)
            Text(MirrorText.padSheetLine(target.project, now, nowName), style = ArcType.small, color = c.graphite)
        }
    }
    ArcField(
        null, query, { query = it },
        placeholder = MirrorText.FIND_FOR_PAD,
        maxLength = 40,
        icon = ArcIcon.SEARCH,
    )
    if (groups.isEmpty()) {
        Text(if (sounds.isEmpty()) FeatureText.NO_SOUNDS else FeatureText.NO_FIND_MATCHES, style = ArcType.body15, color = c.graphite)
    } else {
        // The hundreds as keys, the one listed navy and down; they scroll sideways when many.
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(end = 4.dp, bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for ((r, _) in groups) RangeKey(r, on = r == range?.first) { shown = r.first }
        }
        val list = range?.second.orEmpty()
        Column {
            list.forEachIndexed { i, e ->
                SoundPick(
                    e,
                    first = i == 0,
                    last = i == list.lastIndex,
                    onPad = e.slot == now,
                    playing = playing == "device:${e.slot}",
                    enabled = !busy,
                    onPlay = { onPlay(e.slot) },
                    onStop = onStop,
                    onPick = { onPick(e.slot) },
                )
            }
        }
    }
    Text(MirrorText.ASSIGN_NOTE, style = ArcType.small, color = c.graphite)
    ArcKey(MirrorText.UPLOAD_NEW, onUpload, Modifier.fillMaxWidth(), enabled = !busy, textColor = c.navy)
}

/** The pad itself, small: its label top left and the sound on it at the foot, as on the grid. */
@Composable
private fun PadCap(pad: PhysicalPad, name: String?) {
    val hw = LocalHwColors.current
    Box(
        Modifier
            .size(64.dp)
            // A picture of the pad, not a control: screen readers have the title beside it.
            .clearAndSetSemantics {}
            .cap(hw.darkFace, hw.darkEdge, RoundedCornerShape(8.dp), 0f)
            .padding(start = 8.dp, top = 6.dp, end = 6.dp, bottom = 6.dp),
    ) {
        Text(
            pad.label,
            style = ArcType.semi.copy(fontSize = if (pad.label.length > 1) 11.sp else 20.sp, lineHeight = 1.em),
            color = hw.darkInk,
            maxLines = 1,
            softWrap = false,
        )
        if (name != null) {
            Text(
                name,
                style = ArcType.tiny.copy(fontSize = 10.sp, lineHeight = 1.1.em),
                color = hw.darkDim,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.align(Alignment.BottomStart),
            )
        }
    }
}

/** A hundred of slots as a key: "100–199" over its kind of sound in the factory layout ("SNARES"); the Device tab jumps with it too. */
@Composable
internal fun RangeKey(r: IntRange, on: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val kind = FeatureText.factoryCategory(r.first)
    Column(
        Modifier
            .heightIn(min = 48.dp)
            .widthIn(min = 76.dp)
            .cap(if (on) c.navy else c.key, if (on) capEdge(c.navy) else c.keyEdge, RoundedCornerShape(10.dp), capPress(on || pressed))
            .clickable(interactionSource = source, indication = null, role = Role.Tab) { onClick() }
            .semantics { selected = on }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(FeatureText.range(r), style = ArcType.capsKeySmall, color = if (on) c.onNavy else c.ink, maxLines = 1)
        if (kind != null) Text(kind.uppercase(), style = ArcType.caps.copy(fontSize = 10.sp), color = if (on) c.onNavy.copy(alpha = 0.75f) else c.graphite, maxLines = 1)
    }
}

/**
 * One sound in the pad sheet: slot, name, size and a preview key. A tap puts
 * it on the pad; the sound on the pad now is marked ON PAD (signal tint and
 * edge) and does nothing.
 */
@Composable
private fun SoundPick(
    e: SoundEntry,
    first: Boolean,
    last: Boolean,
    onPad: Boolean,
    playing: Boolean,
    enabled: Boolean,
    onPlay: () -> Unit,
    onStop: () -> Unit,
    onPick: () -> Unit,
) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .plateRow(first, last, c.plate, c.line)
            .background(
                when {
                    onPad -> c.signal.copy(alpha = 0.16f)
                    pressed -> c.keyEdge.copy(alpha = 0.35f)
                    else -> Color.Transparent
                },
            )
            // The sound on the pad has a signal edge on its left.
            .drawBehind { if (onPad) drawRect(c.signal, size = Size(4.dp.toPx(), size.height)) }
            .clickable(interactionSource = source, indication = null, enabled = enabled && !onPad, role = Role.Button, onClick = onPick)
            .semantics(mergeDescendants = true) { if (onPad) stateDescription = MirrorText.ON_PAD },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.weight(1f).padding(start = 14.dp, end = 10.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(if (playing) c.signal else LocalHwColors.current.ledOff))
            Text(FeatureText.slot(e.slot), style = ArcType.bold, color = if (onPad) c.signal else c.graphite)
            OneLine(e.name.uppercase(), ArcType.bold, c.ink, Modifier.weight(1f))
            Text(if (onPad) MirrorText.ON_PAD.uppercase() else Format.bytes(e.size), style = ArcType.small, color = c.graphite, maxLines = 1)
            PlayKey(
                playing = playing,
                enabled = enabled,
                description = if (playing) FeatureText.stop(e.name) else FeatureText.play(e.name),
                onClick = { if (playing) onStop() else onPlay() },
            )
        }
    }
}
