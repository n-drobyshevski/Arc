package dev.arc.ep133.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.SampleReview
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.Knob
import dev.arc.ep133.ui.components.LocalArcWindow
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.PlayKey
import dev.arc.ep133.ui.components.SwitchRow
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * SAMPLE's review sheet after a take (an addition: the EP-133 puts a take
 * straight on its pad, as Settings' Review samples off does here). The pad,
 * the length kept and the source under the title; the take's waveform with
 * the part kept lit; KNOB X START (orange) and KNOB Y LENGTH (black) pick
 * that part ([onTrim], in frames), and the play key plays it as KEEP would
 * put it on the pad ([onPlay], [onStop]; [playing] while it sounds).
 * Normalize ([onNormalize]) raises it to 0 dB and Trim silence
 * ([onTrimSilence]) starts it where the sound does. Connected, − and + step
 * the slot it goes into over the free ones ([onSlot]); offline the slot is
 * picked when the EP-133 connects. KEEP puts it on the pad ([onKeep]), RETAKE
 * records the pad again ([onRetake]), DISCARD lets it go ([onDiscard], with
 * UNDO on the toast). With [haptics] the knobs tick.
 *
 * On a phone on its side the sheet is two columns, so it fits the height
 * without scrolling: the take on the left, the choices and keys on the
 * right. The knobs take the finger from its first touch, so the sheet never
 * scrolls under them.
 */
@Composable
fun ColumnScope.SampleReviewSheetContent(
    review: SampleReview,
    playing: Boolean,
    haptics: Boolean,
    onTrim: (start: Int, length: Int) -> Unit,
    onNormalize: (Boolean) -> Unit,
    onTrimSilence: (Boolean) -> Unit,
    onSlot: (step: Int) -> Unit,
    onPlay: () -> Unit,
    onStop: () -> Unit,
    onRetake: () -> Unit,
    onKeep: () -> Unit,
    onDiscard: () -> Unit,
) {
    val c = LocalArcColors.current
    val r = review
    val line = MirrorText.reviewLine(r.pad, r.length.toDouble() / r.rate.coerceAtLeast(1), r.input.source, r.input.stereo)
    val take: @Composable () -> Unit = {
        TakeWave(r)
        TrimKnobs(r, playing, haptics, onTrim, onPlay, onStop)
    }
    val choices: @Composable (compact: Boolean) -> Unit = { compact ->
        GridPlate {
            SwitchRow(MirrorText.NORMALIZE, MirrorText.NORMALIZE_NOTE, r.normalize, onNormalize)
            PlateLine()
            SwitchRow(MirrorText.TRIM_SILENCE, MirrorText.TRIM_SILENCE_NOTE, r.trimSilence, onTrimSilence)
        }
        SlotPicker(r, onSlot, compact)
    }
    if (LocalArcWindow.current.short) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(MirrorText.REVIEW_TITLE, style = ArcType.heading, color = c.ink)
                    OneLine(line, ArcType.small, c.graphite)
                }
                take()
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                choices(true)
                ReviewKeys(onRetake, onKeep, onDiscard, KeySize.Small)
            }
        }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(MirrorText.REVIEW_TITLE, style = ArcType.heading, color = c.ink)
        Text(line, style = ArcType.small, color = c.graphite)
    }
    take()
    choices(false)
    ReviewKeys(onRetake, onKeep, onDiscard, KeySize.Normal)
}

/** The take's waveform, [ReviewWave] tall, the part kept lit; a screen reader hears where it runs. */
@Composable
private fun TakeWave(r: SampleReview) {
    val rate = r.rate.coerceAtLeast(1).toDouble()
    TrimWave(
        r.peaks, r.frames.toLong(), r.start.toLong(), (r.start + r.length).toLong(),
        FeatureText.selection(r.start / rate, (r.start + r.length) / rate),
        height = ReviewWave,
    )
}

/**
 * KNOB X START and KNOB Y LENGTH over the take, as EDIT's TRIM page has
 * them (a turn of START keeps the length, as far as the take allows), and
 * the play key for the part kept.
 */
@Composable
private fun TrimKnobs(
    r: SampleReview,
    playing: Boolean,
    haptics: Boolean,
    onTrim: (start: Int, length: Int) -> Unit,
    onPlay: () -> Unit,
    onStop: () -> Unit,
) {
    val ko = LocalHwColors.current.ko
    val n = r.frames
    val rate = r.rate.toDouble()
    // Coarse and fine steps, as TRIM's: 400 turns across the take, or 4000 slowly.
    val coarse = maxOf(1f, (n / 400).toFloat())
    val fine = maxOf(1f, (n / 4000).toFloat())
    val room = maxOf(1, n - r.start)
    val startShown = MirrorText.secondsLabel(r.start.toLong(), rate)
    val lengthShown = MirrorText.secondsLabel(r.length.toLong(), rate)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Knob(
            MirrorText.START, r.start.toFloat(), 0f..maxOf(0, n - 1).toFloat(), startShown,
            onChange = { onTrim(it.toInt(), r.length) },
            Modifier.weight(1f),
            default = 0f, step = coarse, fineStep = fine, colors = ko.knobOrange,
            enabled = n > 1, haptics = haptics,
            description = MirrorText.knobDescription(MirrorText.START, startShown),
        )
        Knob(
            MirrorText.LENGTH, r.length.toFloat(), 1f..room.toFloat(), lengthShown,
            onChange = { onTrim(r.start, it.toInt()) },
            Modifier.weight(1f),
            default = room.toFloat(), step = coarse, fineStep = fine, colors = ko.knobBlack,
            enabled = n > 1, haptics = haptics,
            description = MirrorText.knobDescription(MirrorText.LENGTH, lengthShown),
        )
        Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
            PlayKey(
                playing = playing,
                enabled = r.length > 0,
                description = if (playing) FeatureText.STOP else FeatureText.PLAY_SELECTION,
                onClick = { if (playing) onStop() else onPlay() },
            )
        }
    }
}

/**
 * The slot KEEP puts the take into: − and + either side of it, stepping
 * over the free slots ([onSlot]); "No free slot" when the EP-133 is full.
 * Offline the slot is picked when it connects, and the line says so.
 * [compact]: smaller type, for a column of a sheet on its side.
 */
@Composable
private fun SlotPicker(r: SampleReview, onSlot: (step: Int) -> Unit, compact: Boolean) {
    val c = LocalArcColors.current
    if (r.offline) {
        Text(MirrorText.SLOT_WHEN_CONNECTED, style = ArcType.small, color = c.graphite)
        return
    }
    val slot = r.slot
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SlotKey("\u2212", MirrorText.PREV_SLOT, SlotKeySize, enabled = slot != null) { onSlot(-1) }
        // One line between the keys, in smaller type where it is long ("Slot 214, the next free one" in a column).
        val style = if (compact) ArcType.small.copy(fontWeight = FontWeight.Bold) else ArcType.bold
        BasicText(
            slot?.let { MirrorText.slotLine(it, it == r.nextFree) } ?: MirrorText.NO_FREE_SLOT,
            style = style.copy(color = if (slot != null) c.ink else c.graphite, textAlign = TextAlign.Center),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            autoSize = TextAutoSize.StepBased(minFontSize = SlotTypeMin, maxFontSize = style.fontSize, stepSize = 0.5.sp),
            modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
        )
        SlotKey("+", MirrorText.NEXT_SLOT, SlotKeySize, enabled = slot != null) { onSlot(1) }
    }
}

/** − or + beside the slot: a pale key [size] square, its [glyph] on it, heard as [description]; greyed when not [enabled]. */
@Composable
private fun SlotKey(glyph: String, description: String, size: Dp, enabled: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        Modifier
            .size(size)
            .cap(c.key, c.keyEdge, RoundedCornerShape(8.dp), capPress(pressed && enabled), alpha = if (enabled) 1f else 0.45f)
            .clickable(interactionSource = source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Text(glyph, style = ArcType.word.copy(fontSize = 22.sp, lineHeight = 1.em), color = c.ink)
    }
}

/** KEEP (orange, the full width), then RETAKE and DISCARD side by side, quiet: [size] keys. */
@Composable
private fun ReviewKeys(onRetake: () -> Unit, onKeep: () -> Unit, onDiscard: () -> Unit, size: KeySize) {
    ArcKey(MirrorText.KEEP, onKeep, Modifier.fillMaxWidth(), style = KeyStyle.Signal, size = size)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        ArcKey(MirrorText.RETAKE, onRetake, Modifier.weight(1f), style = KeyStyle.Quiet, size = size)
        ArcKey(MirrorText.DISCARD, onDiscard, Modifier.weight(1f), style = KeyStyle.Quiet, size = size)
    }
}

/** The take's waveform on the review sheet. */
private val ReviewWave: Dp = 64.dp

/** The smallest type the slot's line takes where it is long. */
private val SlotTypeMin = 11.sp

/** The slot's − and +, in a column of the sheet on its side too: the least a key takes the touch at. */
private val SlotKeySize: Dp = 44.dp
