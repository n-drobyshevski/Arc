package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.arc.ep133.features.PadSettings
import dev.arc.ep133.features.Peak
import dev.arc.ep133.features.PlayMode
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.Knob
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.components.describe
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/** The EP-133's SOUND EDIT pages arc edits (TIME and the root note are the sample's, for every pad on it). */
enum class EditPage { SOUND, TRIM, ENV, MIDI, MUTE }

/** Columns of the TRIM page's waveform. */
internal const val TRIM_COLUMNS = 96

/**
 * A pad's sound settings as the EP-133's SOUND EDIT shows them (an
 * addition): one row of knobs, PITCH and LEVEL always there (white, as the
 * device's AMP and PTC are always at hand), then X (orange) and Y (black)
 * for the page picked under them: SOUND (play mode, pan), TRIM (start,
 * length, over the sound's waveform, the part kept lit), ENV (attack,
 * release; release is greyed in ONESHOT, which plays to the end), MIDI
 * (channel) and MUTE (the mute group). Each turn goes to [onChange] at once;
 * [onDone] hears the finger lift.
 *
 * TRIM needs the sound's length ([frames], at [sampleRate]); without it its
 * knobs rest. [peaks] ([TRIM_COLUMNS] of them) draw the waveform. With
 * [enabled] false (the pad being read) every knob rests. [initialPage]
 * is the page shown first.
 */
@Composable
fun ColumnScope.PadEditPages(
    settings: PadSettings,
    onChange: (PadSettings) -> Unit,
    onDone: () -> Unit,
    frames: Long?,
    sampleRate: Int,
    peaks: List<Peak>?,
    haptics: Boolean,
    enabled: Boolean = true,
    initialPage: EditPage = EditPage.SOUND,
) {
    val ko = LocalHwColors.current.ko
    var page by rememberSaveable { mutableStateOf(initialPage) }
    val s = settings
    val oneshot = s.mode == PlayMode.ONESHOT
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
        Knob(
            MirrorText.PITCH, s.pitch.toFloat(), -PadSettings.PITCH_MAX.toFloat()..PadSettings.PITCH_MAX.toFloat(),
            MirrorText.pitchLabel(s.pitch),
            onChange = { onChange(s.copy(pitch = it.toDouble())) },
            Modifier.weight(1f),
            default = 0f, step = 1f, fineStep = 0.1f, bipolar = true, colors = ko.knobWhite,
            enabled = enabled, haptics = haptics,
            description = MirrorText.knobDescription(MirrorText.PITCH, MirrorText.pitchLabel(s.pitch)), onDone = onDone,
        )
        Knob(
            MirrorText.LEVEL, s.level.toFloat(), 0f..PadSettings.LEVEL_MAX.toFloat(),
            MirrorText.levelLabel(s.level),
            onChange = { onChange(s.copy(level = it.toInt())) },
            Modifier.weight(1f),
            default = PadSettings.DEFAULT.level.toFloat(), step = 2f, fineStep = 1f, colors = ko.knobWhite,
            enabled = enabled, haptics = haptics,
            description = MirrorText.knobDescription(MirrorText.LEVEL, MirrorText.levelLabel(s.level)), onDone = onDone,
        )
        when (page) {
            EditPage.SOUND -> {
                val modes = PlayMode.entries
                XKnob(MirrorText.MODE, s.mode.ordinal.toFloat(), 0f..(modes.size - 1).toFloat(), MirrorText.modeLabel(s.mode), enabled, haptics, onDone, default = 0f) {
                    onChange(s.withMode(modes[it.toInt().coerceIn(0, modes.lastIndex)]))
                }
                YKnob(MirrorText.PAN, s.pan.toFloat(), -PadSettings.PAN_MAX.toFloat()..PadSettings.PAN_MAX.toFloat(), MirrorText.panLabel(s.pan), enabled, haptics, onDone, default = 0f, bipolar = true) {
                    onChange(s.copy(pan = it.toInt()))
                }
            }
            EditPage.TRIM -> {
                val n = frames?.takeIf { it > 1 }
                val start = s.start.coerceIn(0L, (n ?: 1L) - 1)
                val length = n?.let { s.length(it) } ?: 0L
                val coarse = n?.let { maxOf(1f, (it / 400).toFloat()) } ?: 1f
                val fine = n?.let { maxOf(1f, (it / 4000).toFloat()) } ?: 1f
                XKnob(
                    MirrorText.START, start.toFloat(), 0f..((n ?: 2L) - 1).toFloat(),
                    if (n != null) MirrorText.secondsLabel(start, sampleRate.toDouble()) else MirrorText.NO_VALUE,
                    enabled && n != null, haptics, onDone, default = 0f, step = coarse, fineStep = fine,
                ) { v ->
                    val newStart = v.toLong()
                    // The length stays, as far as the sound allows.
                    val end = s.end?.let { e -> (newStart + (e - s.start)).coerceAtMost(n ?: e) }
                    onChange(s.copy(start = newStart, end = end).clamped(n))
                }
                YKnob(
                    MirrorText.LENGTH, length.toFloat(), 1f..maxOf(1L, (n ?: 2L) - start).toFloat(),
                    if (n != null) MirrorText.secondsLabel(length, sampleRate.toDouble()) else MirrorText.NO_VALUE,
                    enabled && n != null, haptics, onDone, default = maxOf(1L, (n ?: 2L) - start).toFloat(), step = coarse, fineStep = fine,
                ) { v ->
                    val end = start + v.toLong()
                    onChange(s.copy(end = if (n != null && end >= n) null else end).clamped(n))
                }
            }
            EditPage.ENV -> {
                XKnob(MirrorText.ATTACK, s.attack.toFloat(), 0f..PadSettings.ENV_MAX.toFloat(), MirrorText.envLabel(s.attack), enabled, haptics, onDone, default = 0f, step = 5f, fineStep = 1f) {
                    onChange(s.copy(attack = it.toInt()))
                }
                YKnob(
                    MirrorText.RELEASE, s.release.toFloat(), 0f..PadSettings.ENV_MAX.toFloat(), MirrorText.envLabel(s.release),
                    enabled && !oneshot, haptics, onDone, default = PadSettings.KEY_RELEASE.toFloat(), step = 5f, fineStep = 1f,
                ) {
                    onChange(s.copy(release = it.toInt()))
                }
            }
            EditPage.MIDI -> {
                XKnob(MirrorText.CHANNEL, s.midiChannel.toFloat(), 0f..(PadSettings.CHANNELS - 1).toFloat(), MirrorText.channelLabel(s.midiChannel), enabled, haptics, onDone, default = 0f) {
                    onChange(s.copy(midiChannel = it.toInt()))
                }
                Box(Modifier.weight(1f))
            }
            EditPage.MUTE -> {
                XKnob(MirrorText.MUTE_GROUP, if (s.muteGroup) 1f else 0f, 0f..1f, MirrorText.onOff(s.muteGroup), enabled, haptics, onDone, default = 0f) {
                    onChange(s.copy(muteGroup = it >= 0.5f))
                }
                Box(Modifier.weight(1f))
            }
        }
    }
    if (page == EditPage.TRIM && peaks != null && frames != null && frames > 1) TrimWave(peaks, frames, s)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (p in EditPage.entries) PageKey(p, on = p == page, Modifier.weight(1f)) { page = p }
    }
    val note = when {
        page == EditPage.ENV && oneshot -> MirrorText.ONESHOT_RELEASE
        page == EditPage.MUTE -> MirrorText.MUTE_NOTE
        else -> null
    }
    if (note != null) Text(note, style = ArcType.small, color = LocalArcColors.current.graphite)
}

/** The page's X knob (orange), a quarter of the row. */
@Composable
private fun androidx.compose.foundation.layout.RowScope.XKnob(
    label: String, value: Float, range: ClosedFloatingPointRange<Float>, readout: String,
    enabled: Boolean, haptics: Boolean, onDone: () -> Unit,
    default: Float, step: Float = 1f, fineStep: Float = step, bipolar: Boolean = false, onChange: (Float) -> Unit,
) = Knob(
    label, value, range, readout, onChange, Modifier.weight(1f),
    default = default, step = step, fineStep = fineStep, bipolar = bipolar, colors = LocalHwColors.current.ko.knobOrange,
    enabled = enabled, haptics = haptics, description = MirrorText.knobDescription(label, readout), onDone = onDone,
)

/** The page's Y knob (black), a quarter of the row. */
@Composable
private fun androidx.compose.foundation.layout.RowScope.YKnob(
    label: String, value: Float, range: ClosedFloatingPointRange<Float>, readout: String,
    enabled: Boolean, haptics: Boolean, onDone: () -> Unit,
    default: Float, step: Float = 1f, fineStep: Float = step, bipolar: Boolean = false, onChange: (Float) -> Unit,
) = Knob(
    label, value, range, readout, onChange, Modifier.weight(1f),
    default = default, step = step, fineStep = fineStep, bipolar = bipolar, colors = LocalHwColors.current.ko.knobBlack,
    enabled = enabled, haptics = haptics, description = MirrorText.knobDescription(label, readout), onDone = onDone,
)

/** TRIM's waveform: the sound across, the part the pad plays (start to end) lit. */
@Composable
private fun TrimWave(peaks: List<Peak>, frames: Long, s: PadSettings) {
    val c = LocalArcColors.current
    val start = s.start
    val end = s.end ?: frames
    Canvas(
        Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(c.display)
            .describe(MirrorText.trimDescription(s.start, s.length(frames))),
    ) {
        val colW = size.width / peaks.size
        val mid = size.height / 2
        val half = size.height / 2 - 4.dp.toPx()
        for ((i, p) in peaks.withIndex()) {
            val frame = ((i + 0.5) * frames / peaks.size).toLong()
            val inside = frame in start until end
            val top = mid - p.max * half
            val bottom = mid - p.min * half
            drawRect(
                if (inside) c.signal else c.displayDim.copy(alpha = 0.5f),
                topLeft = Offset(i * colW + colW * 0.15f, top),
                size = Size(colW * 0.7f, (bottom - top).coerceAtLeast(1f)),
            )
        }
    }
}

/** A page key: a dark cap with the page's name, orange while it is the page shown. */
@Composable
private fun PageKey(p: EditPage, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier
            .heightIn(min = 44.dp)
            .cap(if (on) c.signal else hw.darkFace, if (on) c.signalEdge else hw.darkEdge, RoundedCornerShape(8.dp), capPress(on || pressed))
            .selectable(selected = on, role = Role.Tab, interactionSource = source, indication = null, onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            MirrorText.pageName(p.ordinal).uppercase(),
            style = ArcType.capsKeySmall.copy(fontSize = 12.sp),
            color = if (on) c.onSignal else hw.darkInk,
            maxLines = 1,
        )
    }
}

/** [TRIM_COLUMNS] min/max pairs of 16-bit [pcm] ([channels] interleaved), for the TRIM page's waveform. */
internal fun trimPeaks(pcm: ShortArray, channels: Int): List<Peak> {
    val n = pcm.size / channels.coerceAtLeast(1)
    if (n == 0) return List(TRIM_COLUMNS) { Peak(0f, 0f) }
    return List(TRIM_COLUMNS) { col ->
        val from = (col.toLong() * n / TRIM_COLUMNS).toInt()
        val to = maxOf(from + 1, ((col + 1).toLong() * n / TRIM_COLUMNS).toInt()).coerceAtMost(n)
        var lo = 0
        var hi = 0
        // Long columns are sampled with a stride; the shape is what matters here.
        val step = maxOf(1, (to - from) / 256)
        var f = from
        while (f < to) {
            for (ch in 0 until channels) {
                val v = pcm[f * channels + ch].toInt()
                if (v < lo) lo = v
                if (v > hi) hi = v
            }
            f += step
        }
        Peak(lo / 32768f, hi / 32767f)
    }
}
