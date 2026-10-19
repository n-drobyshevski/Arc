package dev.arc.ep133.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.ArpUi
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.components.rotateVertical
import dev.arc.ep133.ui.theme.LocalArcColors

// ---------- ARP / RPT and LATCH on the pads' plate (an addition: the device's TIMING + pads) ----------

/**
 * The arp and note repeat on Live ([ArpUi], the controller's): ARP (RPT in
 * PADS) switched with [onOn] and LATCH with [onLatch], and the pressure of
 * a held note ([onNotePressure], a KEYS note's MIDI) or pad
 * ([onPadPressure]), the touch's own, while the arp is on: on a phone that
 * tells pressure it is the note's velocity.
 */
class LiveArp(
    val ui: ArpUi = ArpUi(),
    val onOn: (Boolean) -> Unit = {},
    val onLatch: (Boolean) -> Unit = {},
    val onNotePressure: (note: Int, pressure: Float) -> Unit = { _, _ -> },
    val onPadPressure: (pad: PhysicalPad, pressure: Float) -> Unit = { _, _ -> },
) {
    /** The KEYS notes held for the arp (MIDI), in the order pressed: outlined on the keys, numbered. */
    val heldNotes: List<Int>
        get() = if (ui.on && ui.keys) ui.held.mapNotNull { n -> n.semitones?.let { Keys.ROOT_NOTE + it } }.distinct() else emptyList()

    /** The pads held for note repeat: ringed. */
    val heldPads: Set<PhysicalPad>
        get() = if (ui.on && !ui.keys) ui.held.filter { it.semitones == null }.mapTo(HashSet()) { it.pad } else emptySet()
}

/**
 * ARP (RPT in PADS: [repeat]) and LATCH, one over the other, in the lower
 * half of the pads' plate's right margin ([ModeStrip]): small upright
 * switches, ARP lit signal orange while on, LATCH filled navy while on and
 * greyed out while ARP is off. Each takes half of [modifier]'s height and
 * all its width to touch, with a tick when [haptics].
 */
@Composable
internal fun ArpStripSwitches(arp: LiveArp, repeat: Boolean, haptics: Boolean, size: Dp, modifier: Modifier) {
    val c = LocalArcColors.current
    val ui = arp.ui
    Column(modifier.coachMark("live.arp", CoachText.ARP, c.navy, c.onNavy), horizontalAlignment = Alignment.CenterHorizontally) {
        StripSwitch(
            word = if (repeat) MirrorText.RPT else MirrorText.ARP,
            on = ui.on,
            enabled = true,
            fill = c.signal,
            ink = c.onSignal,
            description = if (repeat) MirrorText.RPT_NAME else MirrorText.ARP_NAME,
            state = MirrorText.onOff(ui.on),
            size = size,
            haptics = haptics,
            modifier = Modifier.weight(1f),
            onToggle = arp.onOn,
        )
        StripSwitch(
            word = MirrorText.LATCH,
            on = ui.on && ui.latch,
            enabled = ui.on,
            fill = c.navy,
            ink = c.onNavy,
            description = MirrorText.LATCH,
            state = if (ui.on) MirrorText.onOff(ui.latch) else MirrorText.arpFirst(repeat),
            size = size,
            haptics = haptics,
            modifier = Modifier.weight(1f),
            onToggle = arp.onLatch,
        )
    }
}

/** One of [ArpStripSwitches]: [word] turned to read upward in a pill, [fill]ed with it in [ink] while [on]. */
@Composable
private fun StripSwitch(
    word: String,
    on: Boolean,
    enabled: Boolean,
    fill: Color,
    ink: Color,
    description: String,
    state: String,
    size: Dp,
    haptics: Boolean,
    modifier: Modifier,
    onToggle: (Boolean) -> Unit,
) {
    val ko = LocalHwColors.current.ko
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val tick = if (haptics) LocalHapticFeedback.current else null
    LaunchedEffect(pressed) {
        if (pressed) tick?.performHapticFeedback(HapticFeedbackType.KeyboardTap)
    }
    val shape = RoundedCornerShape(50)
    Box(
        modifier
            .fillMaxWidth()
            .toggleable(value = on, enabled = enabled, interactionSource = source, indication = null, role = Role.Switch) { onToggle(it) }
            .semantics {
                contentDescription = description
                stateDescription = state
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .alpha(if (enabled) 1f else 0.45f)
                .then(if (on && fill.alpha > 0f) Modifier.dropShadow(shape, Shadow(radius = 6.dp, color = fill.copy(alpha = 0.5f))) else Modifier)
                .clip(shape)
                .then(if (on) Modifier.background(fill) else Modifier.border(1.5.dp, ko.label.copy(alpha = 0.6f), shape))
                .padding(horizontal = 2.dp, vertical = 7.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                word.uppercase(),
                style = viewWordStyle(size * 0.95f, 0.1f),
                color = if (on) ink else ko.label,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier.rotateVertical(),
            )
        }
    }
}

/**
 * ARP (RPT: [repeat]) and LATCH in the row over the piano, where no plate
 * prints them: each word after its LED, lit while on, as the view words
 * are; LATCH greyed out while ARP is off.
 */
@Composable
internal fun ArpRowWords(arp: LiveArp, repeat: Boolean, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    val ui = arp.ui
    Row(modifier.coachMark("live.arp", CoachText.ARP, c.navy, c.onNavy), horizontalArrangement = Arrangement.spacedBy(ArpWordGap)) {
        ArpWord(if (repeat) MirrorText.RPT else MirrorText.ARP, ui.on, true, if (repeat) MirrorText.RPT_NAME else MirrorText.ARP_NAME, MirrorText.onOff(ui.on), arp.onOn)
        ArpWord(MirrorText.LATCH, ui.on && ui.latch, ui.on, MirrorText.LATCH, if (ui.on) MirrorText.onOff(ui.latch) else MirrorText.arpFirst(repeat), arp.onLatch)
    }
}

/** The room between ARP and LATCH over the piano. */
internal val ArpWordGap = 4.dp

/** One of [ArpRowWords]: its LED, lit while [on], and the word, 44 dp high to touch. */
@Composable
private fun ArpWord(word: String, on: Boolean, enabled: Boolean, description: String, state: String, onToggle: (Boolean) -> Unit) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    Row(
        Modifier
            .clip(RoundedCornerShape(6.dp))
            .toggleable(value = on, enabled = enabled, interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Switch) { onToggle(it) }
            .semantics {
                contentDescription = description
                stateDescription = state
            }
            .heightIn(min = 44.dp)
            .padding(horizontal = 2.dp)
            .alpha(if (enabled) 1f else 0.45f),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(
            Modifier
                .size(6.dp)
                .then(if (on) Modifier.dropShadow(CircleShape, Shadow(radius = 6.dp, color = c.signal)) else Modifier)
                .clip(CircleShape)
                .background(if (on) c.signal else hw.ledOff),
        )
        Text(word.uppercase(), style = viewWordStyle(), color = if (on) c.ink else c.graphite, maxLines = 1, softWrap = false)
    }
}
