package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.data.TakeInfo
import dev.arc.ep133.features.Peak
import dev.arc.ep133.features.TakeTrim
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.max

private const val COLUMNS = 120

/**
 * TRIM on the Takes page (an addition): the glass shows the take's wave with
 * two orange handles, the part between them lit, how long it is large and its
 * edges, and a playhead while it plays. Drag a handle, or tap START or END
 * while the part plays to cut there. Under it PLAY (the part), START, END,
 * RESET (the whole take) and DONE, which keeps the part with the take
 * ([TakesUi.onSetTrim]): nothing is cut from its file.
 */
@Composable
internal fun TakeTrimDeck(t: TakesUi, info: TakeInfo, n: Int, onClose: () -> Unit) {
    val c = LocalArcColors.current
    val sound by produceState(t.trimSound, info.name) { if (t.trimSound == null) value = t.loadSound(info) }
    val peaks by produceState<List<Peak>?>(t.trimSound?.let { TakeTrim.peaks(it.pcm, it.channels, COLUMNS) }, sound) {
        sound?.let { s -> value = withContext(Dispatchers.Default) { TakeTrim.peaks(s.pcm, s.channels, COLUMNS) } }
    }
    val frames = info.frames
    val rate = max(1, info.rate)
    val least = minOf(TakeTrim.minFrames(rate), frames)
    var startState by rememberSaveable(info.name) { mutableLongStateOf(info.trim?.start ?: 0L) }
    var endState by rememberSaveable(info.name) { mutableLongStateOf(info.trim?.end ?: frames) }
    val start = startState.coerceIn(0, frames - least)
    val end = endState.coerceIn(start + least, frames)
    fun secs(f: Long) = f.toDouble() / rate

    // The playhead: where the part has got to since PLAY, by the clock.
    val playing = t.playing == t.trimKeyOf(info)
    var playFrom by remember { mutableLongStateOf(0L) }
    var playAt by remember { mutableLongStateOf(0L) }
    var head by remember { mutableStateOf<Long?>(null) }
    LaunchedEffect(playing, playAt) {
        head = null
        if (!playing) return@LaunchedEffect
        while (true) withFrameNanos { now -> head = (playFrom + (now - playAt) * rate / 1_000_000_000L).coerceIn(0, frames) }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(c.display)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(Modifier.fillMaxWidth().heightIn(min = 24.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("✂ " + MirrorText.TRIM_HEAD.uppercase(), style = TrimHead, color = c.signal)
            Text(" " + MirrorText.takeNumber(n), style = TrimHead, color = c.displayDim, modifier = Modifier.weight(1f))
            Text(MirrorText.takeLength(info.seconds), style = TrimHead, color = c.displayDim)
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.clearAndSetSemantics {}) {
            Text(MirrorText.takeLength(secs(end - start)), style = ArcType.statNum.copy(fontSize = 26.sp), color = c.displayInk)
            Text(MirrorText.trimSpan(secs(start), secs(end)), style = TrimHead, color = c.displayDim, modifier = Modifier.padding(bottom = 4.dp))
        }
        val p = peaks
        if (p == null) {
            Box(Modifier.fillMaxWidth().height(76.dp), contentAlignment = Alignment.Center) {
                Text(FeatureText.OPENING.uppercase(), style = TrimHead, color = c.displayDim)
            }
        } else {
            val step = max(1L, rate / 2L)
            Canvas(
                Modifier
                    .fillMaxWidth()
                    .height(76.dp)
                    .semantics {
                        contentDescription = MirrorText.trimDescription(n, secs(start), secs(end))
                        customActions = listOf(
                            CustomAccessibilityAction(MirrorText.TRIM_START_LATER) { startState = (start + step).coerceAtMost(end - least); true },
                            CustomAccessibilityAction(MirrorText.TRIM_START_EARLIER) { startState = (start - step).coerceAtLeast(0); true },
                            CustomAccessibilityAction(MirrorText.TRIM_END_LATER) { endState = (end + step).coerceAtMost(frames); true },
                            CustomAccessibilityAction(MirrorText.TRIM_END_EARLIER) { endState = (end - step).coerceAtLeast(start + least); true },
                        )
                    }
                    .pointerInput(frames, rate) {
                        // The handle nearer the finger follows it, sideways (up and down still scroll the page).
                        var moving = 0
                        fun at(x: Float) = (x / size.width * frames).toLong().coerceIn(0, frames)
                        fun move(x: Float) {
                            val f = at(x)
                            if (moving < 0) startState = f.coerceAtMost(endState - least) else endState = f.coerceAtLeast(startState + least)
                        }
                        detectHorizontalDragGestures(
                            onDragStart = { o ->
                                val f = at(o.x)
                                moving = if (abs(f - startState) <= abs(f - endState)) -1 else 1
                                move(o.x)
                            },
                            onHorizontalDrag = { change, _ -> move(change.position.x) },
                        )
                    }
                    .pointerInput(frames, rate) {
                        // A tap moves the nearer handle there.
                        detectTapGestures { o ->
                            val f = (o.x / size.width * frames).toLong().coerceIn(0, frames)
                            if (abs(f - startState) <= abs(f - endState)) startState = f.coerceAtMost(endState - least) else endState = f.coerceAtLeast(startState + least)
                        }
                    },
            ) {
                val knob = 7.dp.toPx()
                val waveH = size.height - knob * 2
                val colW = size.width / COLUMNS
                val mid = waveH / 2
                val half = waveH / 2 - 2.dp.toPx()
                for ((i, pk) in p.withIndex()) {
                    val frame = ((i + 0.5) * frames / COLUMNS).toLong()
                    val top = mid - pk.max * half
                    val bottom = mid - pk.min * half
                    drawRect(
                        if (frame in start until end) c.signal else c.displayDim.copy(alpha = 0.5f),
                        topLeft = Offset(i * colW + colW * 0.15f, top),
                        size = Size(colW * 0.7f, (bottom - top).coerceAtLeast(1f)),
                    )
                }
                val w = 3.dp.toPx()
                for (edge in listOf(start, end)) {
                    val x = (edge.toFloat() / frames * size.width).coerceIn(w / 2, size.width - w / 2)
                    drawRect(c.signal, Offset(x - w / 2, 0f), Size(w, size.height - knob))
                    drawCircle(c.signal, knob, Offset(x, size.height - knob))
                }
                head?.let { h ->
                    val x = h.toFloat() / frames * size.width
                    drawRect(c.displayInk, Offset(x - 1.dp.toPx(), 0f), Size(2.dp.toPx(), waveH))
                }
            }
        }
        Row(Modifier.fillMaxWidth().clearAndSetSemantics {}, verticalAlignment = Alignment.CenterVertically) {
            Text(MirrorText.TRIM_DRAG.uppercase(), style = TrimHead.copy(fontSize = 11.sp), color = c.displayDim, modifier = Modifier.weight(1f))
            head?.let { Text("▶ " + MirrorText.trimTime(secs(it)), style = TrimHead.copy(fontSize = 11.sp), color = c.displayInk) }
        }
    }
    Text(MirrorText.TRIM_TAP_HINT, style = ArcType.tiny, color = c.graphite, modifier = Modifier.padding(horizontal = 4.dp))

    val keys = listOf<@Composable RowScope.() -> Unit>(
        {
            DeckKey(
                if (playing) DeckGlyph.STOP else DeckGlyph.PLAY,
                if (playing) FeatureText.STOP else FeatureText.PLAY,
                if (playing) FeatureText.STOP else FeatureText.PLAY_SELECTION,
                {
                    if (playing) {
                        t.onStop()
                    } else {
                        playFrom = start
                        playAt = System.nanoTime()
                        t.onTrimPlay(info, start, end)
                    }
                },
                style = if (playing) DeckStyle.NAVY else DeckStyle.NORMAL,
                enabled = playing || sound != null,
            )
        },
        {
            DeckKey(
                DeckGlyph.START, MirrorText.TRIM_START, MirrorText.trimMark(MirrorText.TRIM_START, playing),
                { head?.let { startState = it.coerceAtMost(end - least) } },
                enabled = playing,
            )
        },
        {
            DeckKey(
                DeckGlyph.END, MirrorText.TRIM_END, MirrorText.trimMark(MirrorText.TRIM_END, playing),
                {
                    head?.let { endState = it.coerceAtLeast(start + least) }
                    t.onStop()
                },
                enabled = playing,
            )
        },
        {
            DeckKey(
                DeckGlyph.RESET, MirrorText.TRIM_RESET, MirrorText.TRIM_RESET,
                {
                    startState = 0
                    endState = frames
                },
                enabled = start != 0L || end != frames,
            )
        },
        {
            DeckKey(
                DeckGlyph.DONE, MirrorText.TRIM_DONE, MirrorText.TRIM_DONE,
                {
                    if (playing) t.onStop()
                    t.onSetTrim(info, TakeTrim.of(start, end, frames, rate))
                    onClose()
                },
                style = DeckStyle.SIGNAL,
            )
        },
    )
    DeckStrip(keys)
}

private val TrimHead = ArcType.displaySub.copy(fontSize = 13.sp, letterSpacing = 0.08.em)
