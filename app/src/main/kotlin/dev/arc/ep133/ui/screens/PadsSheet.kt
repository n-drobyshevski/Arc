package dev.arc.ep133.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import dev.arc.ep133.features.PadGroup
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * Which sound sits on each pad of a project (an addition to the web version).
 * Pads are laid out by their number in the project file, three to a row; how
 * those numbers map to the pads on the device is not known, and the note says so.
 */
@Composable
fun ColumnScope.PadsSheetContent(
    title: String,
    groups: List<PadGroup>,
    nameOf: (Int) -> String?,
    playingSlot: Int?,
    onPad: ((Int) -> Unit)?,
    onDone: () -> Unit,
) {
    val c = LocalArcColors.current
    Text(title, style = ArcType.heading, color = c.ink)
    Text(FeatureText.PADS_NOTE, style = ArcType.small, color = c.graphite)
    if (groups.isEmpty()) Text(FeatureText.NO_PADS, style = ArcType.body15, color = c.graphite)
    for (g in groups) {
        Text(FeatureText.group(g.name), style = ArcType.bold, color = c.ink, modifier = Modifier.padding(top = 6.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (row in g.pads.entries.toList().chunked(3)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((pad, slot) in row) {
                        PadCell(
                            pad = pad,
                            slot = slot,
                            name = slot?.let(nameOf),
                            playing = slot != null && slot == playingSlot,
                            onClick = if (slot != null && onPad != null) ({ onPad(slot) }) else null,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    // Keep cells the same width on a short last row.
                    repeat(3 - row.size) { Box(Modifier.weight(1f)) }
                }
            }
        }
    }
    ArcKey(Strings.DONE, onDone, Modifier.fillMaxWidth().padding(top = 6.dp), style = KeyStyle.Quiet)
}

@Composable
private fun PadCell(pad: Int, slot: Int?, name: String?, playing: Boolean, onClick: (() -> Unit)?, modifier: Modifier) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val base = if (slot == null) c.shell else c.key
    Column(
        modifier
            .drawBehind {
                if (slot != null) {
                    drawRoundRect(c.keyEdge, topLeft = Offset(0f, 3.dp.toPx()), size = size, cornerRadius = CornerRadius(10.dp.toPx()))
                }
            }
            .clip(RoundedCornerShape(10.dp))
            .background(if (playing) c.signal else base)
            .background(if (pressed) c.keyEdge.copy(alpha = 0.25f) else Color.Transparent)
            .then(
                if (onClick != null) {
                    Modifier.clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onClick)
                } else {
                    Modifier
                },
            )
            .padding(vertical = 8.dp, horizontal = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        val ink = if (playing) c.onSignal else c.ink
        val dim = if (playing) c.onSignal.copy(alpha = 0.8f) else c.graphite
        Text(pad.toString(), style = ArcType.small, color = dim)
        if (slot == null) {
            OneLine(FeatureText.EMPTY_PAD, ArcType.small, dim)
        } else {
            OneLine(name ?: FeatureText.slot(slot), ArcType.bold, ink)
            Text(FeatureText.slot(slot), style = ArcType.small, color = dim)
        }
    }
}
