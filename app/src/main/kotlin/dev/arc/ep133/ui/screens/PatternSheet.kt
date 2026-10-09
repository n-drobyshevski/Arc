package dev.arc.ep133.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.SwitchTime
import dev.arc.ep133.features.Timing
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.Segmented
import dev.arc.ep133.ui.components.SwitchRow
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * RECORD held (an addition): the pattern's settings, as [TempoSheetContent]
 * is TEMPO's. LENGTH: the four groups' lengths, one picked to change (the
 * group recorded into last first): − and + a bar (held, they repeat), the
 * lengths offered first (1, 2, 4, 8), and ×2, which copies the notes in
 * (SHIFT + + on the device). TIMING, the grid notes snap to; SCENE CHANGE,
 * when a pattern or scene picked while it plays takes over (the scene panel's
 * CHANGE chip is the same setting); the count-in and AUTO length; UNDO,
 * ERASE and CLEAR (a group's notes or every group's, asked here first).
 * Pads the pattern plays whose sounds aren't on the phone yet are counted.
 * Everything goes through [t]; [onDone] closes it.
 */
@Composable
fun ColumnScope.PatternSheetContent(t: TransportUi, onDone: () -> Unit) {
    val c = LocalArcColors.current
    var group by rememberSaveable { mutableIntStateOf(t.focusGroup.coerceIn(0, 3)) }
    // CLEAR asks first: the group picked (its number), every group (ALL), or nothing asked (null).
    var ask by rememberSaveable { mutableStateOf<Int?>(null) }
    val bars = t.bars.getOrElse(group) { Seq.DEFAULT_BARS }
    Text(MirrorText.PATTERN, style = ArcType.heading, color = c.ink)
    Caption(MirrorText.LENGTH, align = TextAlign.Start)
    Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (g in 0..3) {
            GroupLength(g, t.bars.getOrElse(g) { Seq.DEFAULT_BARS }, t.hasNotes.getOrElse(g) { false }, g == group, Modifier.weight(1f)) { group = g }
        }
    }
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LengthKey("−", MirrorText.SHORTER, enabled = bars > 1) { t.onLength(group, (bars - 1).coerceAtLeast(1)) }
        Text(
            MirrorText.groupLength(group, bars),
            style = ArcType.statFree.copy(fontSize = 24.sp, lineHeight = 1.1.em, fontFeatureSettings = "tnum"),
            color = c.ink,
            maxLines = 1,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .width(LengthWidth)
                .clearAndSetSemantics {
                    contentDescription = MirrorText.groupLengthName(group, bars)
                    liveRegion = LiveRegionMode.Polite
                },
        )
        LengthKey("+", MirrorText.LONGER, enabled = bars < Seq.MAX_BARS) { t.onLength(group, (bars + 1).coerceAtMost(Seq.MAX_BARS)) }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Segmented(
            Seq.LENGTHS.map { it.toString() },
            selected = Seq.LENGTHS.indexOf(bars),
            onSelect = { t.onLength(group, Seq.LENGTHS[it]) },
            modifier = Modifier.weight(1f),
            compact = true,
            descriptions = Seq.LENGTHS.map { MirrorText.groupLengthName(group, it) },
        )
        Box(
            Modifier.semantics(mergeDescendants = true) { contentDescription = MirrorText.DOUBLE_NAME + ", " + MirrorText.groupLengthName(group, bars) },
        ) {
            ArcKey(MirrorText.DOUBLE, { t.onDouble(group) }, size = KeySize.Small, enabled = bars * 2 <= Seq.MAX_BARS)
        }
    }
    Caption(MirrorText.TIMING, align = TextAlign.Start)
    // Off and the eight intervals are too many for one row on a phone: Off and the long ones, then the short ones.
    for (row in TimingRows) {
        Segmented(
            row.map(MirrorText::timingLabel),
            selected = row.indexOf(t.timing),
            onSelect = { t.onTiming(row[it]) },
            descriptions = row.map(MirrorText::timingName),
        )
    }
    Caption(MirrorText.SCENE_CHANGE, align = TextAlign.Start)
    Segmented(
        SwitchTime.entries.map(MirrorText::switchName),
        selected = t.switchTime.ordinal,
        onSelect = { t.onSwitchTime(SwitchTime.entries[it]) },
        descriptions = SwitchTime.entries.map(MirrorText::changeName),
    )
    Text(MirrorText.SCENE_CHANGE_NOTE, style = ArcType.small, color = c.graphite)
    GridPlate {
        SwitchRow(MirrorText.COUNT_IN, MirrorText.COUNT_IN_NOTE, t.countInOn, t.onCountIn)
        PlateLine()
        SwitchRow(MirrorText.AUTO, MirrorText.AUTO_NOTE, t.autoLength, t.onAutoLength)
    }
    if (t.missing > 0) {
        Text(MirrorText.missingPads(t.missing) + ". " + MirrorText.MISSING_NOTE, style = ArcType.small, color = c.graphite)
    }
    val asked = ask
    if (asked == null) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ArcKey(MirrorText.UNDO, t.onUndo, Modifier.weight(1f), size = KeySize.Small, enabled = t.canUndo)
            ArcKey(
                MirrorText.ERASE,
                {
                    t.onErase(!t.erase)
                    if (!t.erase) onDone()
                },
                Modifier.weight(1f),
                size = KeySize.Small,
                style = if (t.erase) KeyStyle.Signal else KeyStyle.Normal,
                enabled = t.erase || t.hasNotes.any { it },
            )
            ArcKey(
                MirrorText.CLEAR,
                { ask = group },
                Modifier.weight(1f),
                size = KeySize.Small,
                enabled = t.hasNotes.any { it },
                textColor = if (t.hasNotes.any { it }) c.signal else null,
            )
        }
    } else {
        // Asked in the sheet: this group's notes, or (CLEAR ALL) every group's, which asks again.
        val all = asked == ALL
        Text(
            MirrorText.clearAsk(if (all) null else asked),
            style = ArcType.small,
            color = c.ink,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ArcKey(
                if (all) MirrorText.CLEAR_ALL else MirrorText.CLEAR,
                {
                    t.onClear(if (all) null else asked)
                    ask = null
                },
                Modifier.weight(1f),
                size = KeySize.Small,
                style = KeyStyle.Signal,
            )
            if (!all) ArcKey(MirrorText.CLEAR_ALL, { ask = ALL }, Modifier.weight(1f), size = KeySize.Small)
            ArcKey(Strings.CANCEL, { ask = null }, Modifier.weight(1f), size = KeySize.Small)
        }
    }
    Text(MirrorText.PATTERN_NOTE, style = ArcType.small, color = c.graphite)
    ArcKey(Strings.DONE, onDone, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
}

/** CLEAR's question for every group, where a group's number would be. */
private const val ALL = -1

/**
 * A group's length in the sheet: its letter over its bars ("2 bars"), a dot
 * when it has notes; a tap picks it for − +, the lengths and ×2.
 */
@Composable
private fun GroupLength(group: Int, bars: Int, notes: Boolean, picked: Boolean, modifier: Modifier, onPick: () -> Unit) {
    val c = LocalArcColors.current
    val shape = RoundedCornerShape(10.dp)
    Column(
        modifier
            .cap(if (picked) c.navy else c.key, if (picked) c.navy else c.keyEdge, shape, capPress(picked))
            .selectable(selected = picked, role = Role.Tab, interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onPick)
            .semantics(mergeDescendants = true) {
                contentDescription = MirrorText.groupLengthName(group, bars) + if (notes) MirrorText.PAD_HAS_NOTES else ""
            }
            .heightIn(min = 52.dp)
            .padding(vertical = 7.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
    ) {
        val ink = if (picked) c.onNavy else c.ink
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(MirrorText.groupKey(group), style = ArcType.capsKey, color = ink)
            if (notes) Box(Modifier.size(5.dp).clip(CircleShape).background(c.signal))
        }
        Text(
            MirrorText.barsChoice(bars),
            style = ArcType.tiny.copy(fontFeatureSettings = "tnum"),
            color = if (picked) c.onNavy.copy(alpha = 0.8f) else c.graphite,
            maxLines = 1,
        )
    }
}

/** How long − or + is held before it repeats, and then how often. */
private const val REPEAT_AFTER_MS = 400L
private const val REPEAT_EVERY_MS = 80L

/**
 * − or + by a group's length: a bar on the press, then, held, a bar every
 * [REPEAT_EVERY_MS] after [REPEAT_AFTER_MS], as the tempo sheet's keys do.
 * Greyed out (and still) at either end.
 */
@Composable
private fun LengthKey(glyph: String, description: String, enabled: Boolean, onStep: () -> Unit) {
    val c = LocalArcColors.current
    val step by rememberUpdatedState(onStep)
    var down by remember { mutableStateOf(false) }
    Box(
        Modifier
            .size(StepKey)
            .cap(c.key, c.keyEdge, RoundedCornerShape(8.dp), capPress(down && enabled), alpha = if (enabled) 1f else 0.45f)
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                coroutineScope {
                    awaitEachGesture {
                        awaitFirstDown().consume()
                        down = true
                        step()
                        val repeat = launch {
                            delay(REPEAT_AFTER_MS)
                            while (true) {
                                step()
                                delay(REPEAT_EVERY_MS)
                            }
                        }
                        try {
                            waitForUpOrCancellation()
                        } finally {
                            repeat.cancel()
                            down = false
                        }
                    }
                }
            }
            .semantics {
                role = Role.Button
                contentDescription = description
                if (enabled) {
                    onClick {
                        step()
                        true
                    }
                } else {
                    disabled()
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(glyph, style = ArcType.word.copy(fontSize = 26.sp, lineHeight = 1.em), color = c.ink)
    }
}

/** TIMING's choices in two rows: Off to 1/4, then 1/8 to 1/32. */
private val TimingRows: List<List<Timing>> = Timing.entries.let { listOf(it.take(4), it.drop(4)) }

/** − and +, and the length between them. */
private val StepKey: Dp = 52.dp
private val LengthWidth: Dp = 150.dp
