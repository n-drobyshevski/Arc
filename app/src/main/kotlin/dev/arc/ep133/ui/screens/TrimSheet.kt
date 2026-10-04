package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.UploadDraftItem
import dev.arc.ep133.features.SampleTrim
import dev.arc.ep133.formats.DecodedWav
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.components.describe
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

private const val COLUMNS = 160
const val TRIM_PLAY_KEY = "trim"

/**
 * Trim a picked file before it is uploaded (an addition to the web version):
 * a waveform, a range for start and end, and a way to hear the selection.
 * Nothing is cut until the upload; [onDone] gets the frames to keep, or null
 * for the whole file.
 */
@Composable
fun ColumnScope.TrimSheetContent(
    item: UploadDraftItem,
    playing: String?,
    onPlay: (pcm: ByteArray, channels: Int, sampleRate: Int) -> Unit,
    onStop: () -> Unit,
    onDone: (IntRange?) -> Unit,
    onCancel: () -> Unit,
) {
    val c = LocalArcColors.current
    Text(FeatureText.TRIM, style = ArcType.heading, color = c.ink)
    OneLine(item.name, ArcType.bold, c.graphite)
    val wav by produceState<DecodedWav?>(null, item.wav) {
        value = item.wav?.let { bytes -> withContext(Dispatchers.Default) { runCatching { Wav.decode(bytes) }.getOrNull() } }
    }
    val w = wav
    if (w == null) {
        Text(FeatureText.OPENING, style = ArcType.small, color = c.graphite)
        ArcKey(Strings.CANCEL, onCancel, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
        return
    }
    val n = SampleTrim.frames(w.pcm, w.channels)
    val peaks = remember(w) { SampleTrim.peaks(w.pcm, w.channels, COLUMNS) }
    // Start and end (exclusive) in frames, kept across rotation.
    var startState by rememberSaveable(item.fileName) { mutableIntStateOf(item.trim?.first ?: 0) }
    var endState by rememberSaveable(item.fileName) { mutableIntStateOf(item.trim?.let { it.last + 1 } ?: n) }
    val start = startState.coerceIn(0, n)
    val end = endState.coerceIn(start, n)
    val rate = w.sampleRate
    val startS = SampleTrim.seconds(start, rate)
    val endS = SampleTrim.seconds(end, rate)

    Canvas(
        Modifier
            .fillMaxWidth()
            .height(96.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(c.display)
            .describe(FeatureText.selection(startS, endS)),
    ) {
        val colW = size.width / COLUMNS
        val mid = size.height / 2
        val half = size.height / 2 - 6.dp.toPx()
        for ((i, p) in peaks.withIndex()) {
            val frame = ((i + 0.5) * n / COLUMNS).toInt()
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
    RangeSlider(
        value = start.toFloat()..end.toFloat(),
        onValueChange = { r ->
            startState = r.start.roundToInt().coerceIn(0, n)
            endState = r.endInclusive.roundToInt().coerceIn(startState, n)
        },
        valueRange = 0f..n.coerceAtLeast(1).toFloat(),
        colors = SliderDefaults.colors(
            thumbColor = c.signal,
            activeTrackColor = c.signal,
            inactiveTrackColor = c.keyEdge,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
    Text(FeatureText.selection(startS, endS), style = ArcType.small, color = c.graphite)
    val empty = end - start < 1
    Row(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        val isPlaying = playing == TRIM_PLAY_KEY
        ArcKey(
            if (isPlaying) FeatureText.STOP else FeatureText.PLAY_SELECTION,
            { if (isPlaying) onStop() else onPlay(SampleTrim.cut(w.pcm, w.channels, start, end), w.channels, rate.toInt()) },
            Modifier.weight(1f),
            enabled = isPlaying || !empty,
        )
        ArcKey(
            FeatureText.RESET,
            {
                startState = 0
                endState = n
            },
            Modifier.weight(1f),
        )
    }
    ArcKey(
        Strings.DONE,
        { onDone(if (start == 0 && end == n) null else start until end) },
        Modifier.fillMaxWidth(),
        style = KeyStyle.Signal,
        enabled = !empty,
    )
    ArcKey(Strings.CANCEL, onCancel, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
}
