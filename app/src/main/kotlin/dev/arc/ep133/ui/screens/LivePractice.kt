package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.PracticeFrame
import dev.arc.ep133.controller.PracticeUi
import dev.arc.ep133.features.Practice
import dev.arc.ep133.features.PracticeSpec
import dev.arc.ep133.features.Seq
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.PracticeText
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlin.math.ceil

/*
 * PRACTICE on Live (an addition): play along with a pattern. The display line grows into its panel as it does into
 * STEP's ([PanelKind.PRACTICE], [SampleMorph]): its header names what is practised with ▶ or ■ and how it goes
 * ([PracticeHeader]); under it the lane, each pad played a row and its next hits coming in from the right to the orange
 * line, and the keys WAIT, the speed, the bars looped and the backing ([PracticeDeck]). After a stop the lane gives way
 * to how it went. Meanwhile Live's pads light ahead of each hit ([PadCue]): ringed with the beats to go, filled orange
 * when it is time.
 */

/**
 * PRACTICE for Live's page: [ui] as the controller has it, [frame] for the lane and the pads at a time (the counts as
 * they are then), [running] while the transport plays. ▶ ([onPlay]) starts it over from a bar counted in, ■
 * ([onStop]) stops it with the counts kept, ✕ ([onClose]) ends it; the keys change its [PracticeSpec] ([onChange]).
 * [unroll] catches the panel that far along its motion (screenshots).
 */
class LivePractice(
    val ui: PracticeUi,
    val frame: (Long) -> PracticeFrame? = { null },
    val running: Boolean = false,
    val unroll: Float? = null,
    val onPlay: () -> Unit = {},
    val onStop: () -> Unit = {},
    val onClose: () -> Unit = {},
    val onChange: ((PracticeSpec) -> PracticeSpec) -> Unit = {},
)

/** A pad lit by practice: its next hit [beats] away (1..4), or [now], time to play it. */
internal data class PadCue(val beats: Int, val now: Boolean)

/** Each pad's cue in [frame] ([PadCue]): ringed with the beats to go up to a bar ahead, filled from a 32nd before its hit. */
internal fun padCues(frame: PracticeFrame?, waiting: Set<Int>?): Map<Int, PadCue> {
    if (frame == null) return emptyMap()
    if (waiting != null) return waiting.associateWith { PadCue(0, now = true) }
    val out = HashMap<Int, PadCue>()
    for ((t, d) in frame.upcoming) {
        if (t.offset in out) continue
        val beats = ceil(d / Seq.PPQN).toInt()
        when {
            d <= Seq.PPQN / 8.0 -> out[t.offset] = PadCue(0, now = true)
            beats <= CUE_BEATS -> out[t.offset] = PadCue(beats, now = false)
        }
    }
    return out
}

/** The beats ahead a pad is ringed. */
private const val CUE_BEATS = 4

/** The panel's controls' height under its header: the lane and the keys' row. */
internal fun practiceDeckHeight(@Suppress("UNUSED_PARAMETER") width: Dp): Dp = LaneHeight + PracticeGap + KeysRow

/**
 * PRACTICE's header, in the display line's own row as the line grows into the panel: ▶ or ■, "PRACTICE A · 01", how it
 * goes ("12/14 ON TIME", WAIT's step) and ✕. A screen reader hears the pane's title, and the counts as they change.
 */
@Composable
internal fun PracticeHeader(practice: LivePractice, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    val ui = practice.ui
    var counts by remember { mutableStateOf(ui.counts) }
    LaunchedEffect(practice.running, ui) {
        counts = ui.counts
        while (practice.running) withFrameNanos { now -> practice.frame(now)?.let { counts = it.counts } }
    }
    val status = when {
        ui.spec.wait -> PracticeText.waitStep(ui.waitStep, ui.waitSteps)
        counts.hits > 0 -> PracticeText.onTime(counts.onTime, counts.hits)
        else -> PracticeText.READY
    }
    Row(
        modifier.fillMaxSize().padding(horizontal = WaveSide).semantics { paneTitle = PracticeText.PANE },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (!ui.spec.wait) PlayStopChip(practice.running, if (practice.running) practice.onStop else practice.onPlay)
        Text(
            PracticeText.head(ui.place).uppercase(),
            style = ArcType.displaySub,
            color = c.signal,
            maxLines = 1,
            softWrap = false,
        )
        BasicText(
            status.uppercase(),
            style = ArcType.displayHead.copy(color = c.displayInk, textAlign = TextAlign.End, fontFeatureSettings = "tnum"),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            autoSize = TextAutoSize.StepBased(minFontSize = 11.sp, maxFontSize = ArcType.displayHead.fontSize, stepSize = 0.5.sp),
            modifier = Modifier.weight(1f).clearAndSetSemantics {
                contentDescription = if (counts.hits > 0) PracticeText.said(counts.onTime, counts.hits) else status
                liveRegion = LiveRegionMode.Polite
            },
        )
        Box(
            Modifier
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = practice.onClose)
                .semantics { contentDescription = PracticeText.CLOSE }
                .size(32.dp, 40.dp),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.size(10.dp)) {
                val w = 1.8.dp.toPx()
                drawLine(c.displayDim, Offset(0f, 0f), Offset(size.width, size.height), strokeWidth = w)
                drawLine(c.displayDim, Offset(size.width, 0f), Offset(0f, size.height), strokeWidth = w)
            }
        }
    }
}

/** ▶ (start over) or ■ (stop), on the dark line. */
@Composable
private fun PlayStopChip(running: Boolean, onClick: () -> Unit) {
    LineChip(
        Modifier
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = if (running) PracticeText.STOP else PracticeText.PLAY },
        lit = running,
        filled = false,
        compact = false,
    ) { ink ->
        Canvas(Modifier.size(10.dp)) {
            if (running) {
                drawRect(ink)
            } else {
                drawPath(
                    Path().apply {
                        moveTo(size.width * 0.15f, 0f)
                        lineTo(size.width, size.height / 2)
                        lineTo(size.width * 0.15f, size.height)
                        close()
                    },
                    ink,
                )
            }
        }
    }
}

/**
 * PRACTICE's controls under its header: the lane (or, stopped after playing, how it went: the share in time, the counts
 * and the pad most often off), then WAIT, the speed (50, 75, 100%), the bars looped (all, 1, 2, 4) and BACKING (the rest
 * of the scene underneath). The rows fade in as [panel] unrolls.
 */
@Composable
internal fun PracticeDeck(practice: LivePractice, panel: SamplePanel, modifier: Modifier = Modifier) {
    val ui = practice.ui
    Column(modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(PracticeGap)) {
        Box(Modifier.fadeIn { panel.row(false) }.fillMaxWidth().height(LaneHeight)) {
            if (!practice.running && !ui.spec.wait && ui.counts.hits > 0) Result(ui) else Lane(practice)
        }
        Row(
            Modifier.fadeIn { panel.row(true) }.fillMaxWidth().height(KeysRow),
            horizontalArrangement = Arrangement.spacedBy(PracticeGap),
        ) {
            val s = ui.spec
            PracticeKey(PracticeText.WAIT, null, s.wait, PracticeText.WAIT_NAME, Modifier.weight(1f)) { practice.onChange { it.copy(wait = !it.wait) } }
            PracticeKey(PracticeText.speed(s.speed), "${ui.bpm}", true, PracticeText.speedName(s.speed, ui.bpm), Modifier.weight(1f), latch = false) {
                practice.onChange { it.copy(speed = PracticeSpec.SPEEDS[(PracticeSpec.SPEEDS.indexOf(it.speed) + 1) % PracticeSpec.SPEEDS.size]) }
            }
            PracticeKey(PracticeText.loop(s.bars), null, true, PracticeText.loopName(s.bars), Modifier.weight(1f), latch = false) {
                practice.onChange { it.copy(bars = LOOPS[(LOOPS.indexOf(it.bars) + 1) % LOOPS.size]) }
            }
            PracticeKey(PracticeText.BACKING, null, s.backing, PracticeText.BACKING_NAME, Modifier.weight(1f)) { practice.onChange { it.copy(backing = !it.backing) } }
        }
    }
}

/** The bars LOOP steps through: the whole pattern, then its first 1, 2 and 4. */
private val LOOPS = listOf(null, 1, 2, 4)

/**
 * The lane: a row for each pad played, named, its hits not yet played as marks coming in from the right (accents
 * orange) to the orange line, the beats as hairlines; a bar ahead. In WAIT the line stands at the step waited for.
 */
@Composable
private fun Lane(practice: LivePractice) {
    val c = LocalArcColors.current
    val ui = practice.ui
    var frame by remember(ui) { mutableStateOf(practice.frame(System.nanoTime())) }
    LaunchedEffect(practice.running, ui) {
        while (practice.running) withFrameNanos { now -> frame = practice.frame(now) }
    }
    val rows = ui.pads.take(MAX_ROWS)
    Row(Modifier.fillMaxSize().clearAndSetSemantics { contentDescription = if (ui.spec.wait) PracticeText.WAIT_HINT else PracticeText.START_HINT }) {
        // A name to each row, centred on the row's marks.
        Column(Modifier.width(LabelWidth).fillMaxHeight()) {
            for (o in rows) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
                    Text(
                        (ui.names[o] ?: "").uppercase(),
                        style = ArcType.displaySub.copy(fontSize = 10.sp, letterSpacing = 0.04.em),
                        color = c.displayDim,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Canvas(Modifier.weight(1f).fillMaxHeight()) {
            val f = frame
            val head = size.width * HEAD_AT
            val span = size.width - head
            val ahead = Seq.TICKS_PER_BAR.toDouble()
            fun x(d: Double) = (head + d / ahead * span).toFloat()
            val tick = f?.tick ?: 0.0
            // The beats' hairlines, moving with the beat.
            var b = Math.floorDiv(tick.toLong(), Seq.PPQN.toLong()) * Seq.PPQN
            while (b <= tick + ahead) {
                val bx = x(b - tick)
                if (bx >= 0f) drawRect(c.segmentOff, Offset(bx, 0f), Size(1.dp.toPx(), size.height))
                b += Seq.PPQN
            }
            val rowH = size.height / rows.size.coerceAtLeast(1)
            val mark = minOf(rowH * 0.55f, 9.dp.toPx())
            f?.upcoming?.forEach { (t, d) ->
                val r = rows.indexOf(t.offset)
                if (r < 0) return@forEach
                val cx = x(d)
                if (cx < 0f || cx > size.width) return@forEach
                drawRoundRect(
                    if (t.velocity >= ACCENT) c.signal else c.displayInk,
                    Offset(cx - mark / 2, rowH * r + (rowH - mark) / 2),
                    Size(mark, mark),
                    CornerRadius(2.dp.toPx()),
                )
            }
            drawRect(c.signal, Offset(head - 1.dp.toPx(), 0f), Size(2.dp.toPx(), size.height))
        }
    }
}

/** Stopped after playing: the share in time large, the counts, the pad most often off in orange. */
@Composable
private fun Result(ui: PracticeUi) {
    val c = LocalArcColors.current
    val n = ui.counts
    Column(Modifier.fillMaxSize().semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically)) {
        Text(PracticeText.result(n.percent).uppercase(), style = ArcType.displayHead.copy(fontSize = 24.sp), color = c.displayInk, maxLines = 1)
        Text(
            (PracticeText.counts(n.hits, n.onTime, n.early, n.late, n.missed, n.extra) + " · " + PracticeText.passes(n.passes)).uppercase(),
            style = ArcType.displaySub.copy(fontSize = 11.sp),
            color = c.displayDim,
            maxLines = 2,
        )
        ui.worst?.let { (pad, mark) ->
            Text(PracticeText.worst(ui.names[pad] ?: "", mark).uppercase(), style = ArcType.displaySub.copy(fontSize = 11.sp), color = c.signal, maxLines = 1)
        }
    }
}

/**
 * A key on the panel's dark screen: its [word] (and [sub] under it); a latch ([latch]: WAIT, BACKING) filled orange
 * while [on], a stepping key (the speed, the loop) outlined.
 */
@Composable
private fun PracticeKey(word: String, sub: String?, on: Boolean, description: String, modifier: Modifier, latch: Boolean = true, onClick: () -> Unit) {
    val c = LocalArcColors.current
    val shape = RoundedCornerShape(7.dp)
    val filled = latch && on
    Column(
        modifier
            .fillMaxHeight()
            .clip(shape)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = if (latch) Role.Switch else Role.Button, onClick = onClick)
            .semantics {
                contentDescription = description
                if (latch) stateDescription = MirrorText.onOff(on)
            }
            .then(if (filled) Modifier.background(c.signal, shape) else Modifier)
            .border(1.dp, if (filled) c.signal else c.displayDim.copy(alpha = 0.5f), shape)
            .padding(horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(word.uppercase(), style = ArcType.displaySub.copy(fontSize = 12.sp, letterSpacing = 0.06.em), color = if (filled) c.onSignal else c.displayInk, maxLines = 1)
        sub?.let { Text(it, style = ArcType.displaySub.copy(fontSize = 9.sp), color = if (filled) c.onSignal else c.displayDim, maxLines = 1) }
    }
}

/**
 * The PRACTICE panel where the display line can't grow into it (in the top bar, a phone on its side): at the top of the
 * function keys' column, one dark body with its own header over the controls, as STEP's ([StepBodyFace]).
 */
@Composable
internal fun PracticeBodyFace(practice: LivePractice, panel: SamplePanel, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    BoxWithConstraints(modifier.fillMaxSize()) {
        val deck = practiceDeckHeight(maxWidth - WaveSide * 2)
        Column(Modifier.fillMaxWidth().heightIn(max = maxHeight).clip(RoundedCornerShape(BodyCorner)).background(c.display)) {
            Box(Modifier.fillMaxWidth().height(BodyHeader)) { PracticeHeader(practice) }
            PracticeDeck(practice, panel, Modifier.weight(1f, fill = false).height(deck + WaveFoot).padding(start = WaveSide, end = WaveSide, bottom = WaveFoot))
        }
    }
}

private val LaneHeight = 96.dp
private val KeysRow = 40.dp
private val PracticeGap = 6.dp
private val LabelWidth = 52.dp

/** The lane shows this many pads; more share the last row's room unshown. */
private const val MAX_ROWS = 6

/** Where the orange line stands across the lane. */
private const val HEAD_AT = 0.12f

/** A hit this hard is an accent, drawn orange. */
private const val ACCENT = 114
