package dev.arc.ep133.ui.screens

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.audio.PressTime
import dev.arc.ep133.features.ArpOrder
import dev.arc.ep133.features.ArpSettings
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TimingSettings
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.DisplayPanel
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.Knob
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.Segmented
import dev.arc.ep133.ui.components.SettingRow
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.SwitchRow
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * TIMING's settings and the arp's (an addition, after the device's TIMING:
 * KNOB X the interval, KNOB Y swing, − / + quantize or free time), and what
 * the tempo sheet's TIMING page does with them.
 */
class TimingUi(
    val timing: TimingSettings = TimingSettings(),
    val arp: ArpSettings = ArpSettings.DEFAULT,
    val onInterval: (Timing) -> Unit = {},
    val onSwing: (Int) -> Unit = {},
    val onQuantize: (Boolean) -> Unit = {},
    val onOrder: (ArpOrder) -> Unit = {},
    val onOctaves: (Int) -> Unit = {},
    val onGate: (Int) -> Unit = {},
    val onLatch: (Boolean) -> Unit = {},
    /** A light tick as a knob turns a step (Settings → Haptics). */
    val haptics: Boolean = true,
)

/** The tempo sheet's two pages. */
enum class TempoPage { TEMPO, TIMING }

/**
 * TEMPO held (an addition): the phone's click and its tempo. The tempo on
 * the display, − and + a step of 1 (held, they repeat), a big TAP pad for
 * tapping it in, and the click on or off. While the EP-133 sends MIDI clock
 * ([deviceBpm]) its tempo leads: the display shows it, and − + and TAP rest.
 * [onTap] gets when the finger came down (System.nanoTime, from the touch).
 * With [timing], TEMPO and TIMING tabs beside the title, TIMING's page
 * ([TimingPage]) the interval, swing and quantize, and the arp's settings.
 */
@Composable
fun ColumnScope.TempoSheetContent(
    bpm: Int,
    deviceBpm: Double?,
    on: Boolean,
    onOn: (Boolean) -> Unit,
    onBpm: (Int) -> Unit,
    onTap: (Long) -> Unit,
    onDone: () -> Unit,
    timing: TimingUi? = null,
    initialPage: TempoPage = TempoPage.TEMPO,
) {
    val c = LocalArcColors.current
    var page by rememberSaveable { mutableIntStateOf(initialPage.ordinal) }
    if (timing == null) {
        Text(MirrorText.TEMPO_TITLE, style = ArcType.heading, color = c.ink)
    } else {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(MirrorText.TEMPO_TITLE, style = ArcType.heading, color = c.ink, modifier = Modifier.weight(1f))
            Segmented(
                listOf(MirrorText.TEMPO_TAB, MirrorText.TIMING),
                selected = page,
                onSelect = { page = it },
                // Its own width at the end, the title keeping the rest (a compact row takes all it is given).
                modifier = Modifier.width(TabsWidth),
                compact = true,
            )
        }
        if (page == TempoPage.TIMING.ordinal) {
            TimingPage(timing)
            ArcKey(Strings.DONE, onDone, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
            return
        }
    }
    TempoPageContent(bpm, deviceBpm, on, onOn, onBpm, onTap, onDone)
}

/** The tempo sheet's TEMPO page: the tempo, − TAP +, and the click. */
@Composable
private fun ColumnScope.TempoPageContent(
    bpm: Int,
    deviceBpm: Double?,
    on: Boolean,
    onOn: (Boolean) -> Unit,
    onBpm: (Int) -> Unit,
    onTap: (Long) -> Unit,
    onDone: () -> Unit,
) {
    val c = LocalArcColors.current
    val following = deviceBpm != null
    val shown = deviceBpm?.let(Tempo::round) ?: bpm
    DisplayPanel(
        Modifier.semantics(mergeDescendants = true) {
            contentDescription = MirrorText.tempoValue(shown)
            liveRegion = LiveRegionMode.Polite
            progressBarRangeInfo = ProgressBarRangeInfo(shown.toFloat(), Tempo.MIN.toFloat()..Tempo.MAX.toFloat(), Tempo.MAX - Tempo.MIN - 1)
            if (!following) {
                setProgress { v ->
                    onBpm(Tempo.round(v.toDouble()))
                    true
                }
            }
        },
    ) {
        Text(
            MirrorText.tempoValue(shown),
            style = ArcType.statFree.copy(fontSize = 48.sp, lineHeight = 1.1.em),
            color = c.displayInk,
            maxLines = 1,
            modifier = Modifier.fillMaxWidth().clearAndSetSemantics { },
            textAlign = TextAlign.Center,
        )
    }
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RepeatKey("−", MirrorText.SLOWER, enabled = !following && bpm > Tempo.MIN) { onBpm(bpm - 1) }
        TapPad(enabled = !following, onTap = onTap)
        RepeatKey("+", MirrorText.FASTER, enabled = !following && bpm < Tempo.MAX) { onBpm(bpm + 1) }
    }
    if (following) Text(MirrorText.FOLLOWING, style = ArcType.small, color = c.graphite)
    GridPlate {
        SwitchRow(MirrorText.CLICK, null, on, onOn)
    }
    ArcKey(Strings.DONE, onDone, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
}

/** INTERVAL's eight choices in two rows of four. */
private val IntervalRows: List<List<Timing>> = Timing.intervals.chunked(4)

/** TEMPO and TIMING beside the title. */
private val TabsWidth = 200.dp

/**
 * TIMING (an addition, after the device's TIMING page): INTERVAL, the step
 * the arp and note repeat play at and the grid recording snaps to; how
 * recording takes it (QUANTIZE or FREE TIME) and SWING (at 1/8 and 1/16
 * only, else resting with a note saying so); then the arp's ORDER (KEYS
 * only: note repeat plays every pad held at once), OCTAVES, GATE and LATCH.
 */
@Composable
private fun ColumnScope.TimingPage(ui: TimingUi) {
    val c = LocalArcColors.current
    val t = ui.timing
    val a = ui.arp
    Caption(MirrorText.INTERVAL, align = TextAlign.Start)
    for (row in IntervalRows) {
        Segmented(
            row.map(MirrorText::timingLabel),
            selected = row.indexOf(t.interval),
            onSelect = { ui.onInterval(row[it]) },
            descriptions = row.map(MirrorText::intervalName),
        )
    }
    GridPlate {
        SettingRow(MirrorText.RECORD, note = MirrorText.QUANTIZE_NOTE) {
            Segmented(
                listOf(MirrorText.QUANTIZE, MirrorText.FREE_TIME),
                selected = if (t.quantize) 0 else 1,
                onSelect = { ui.onQuantize(it == 0) },
                compact = true,
            )
        }
        PlateLine()
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val swing = MirrorText.percent(t.swing)
            Knob(
                MirrorText.SWING, t.swing.toFloat(), TimingSettings.SWING_MIN.toFloat()..TimingSettings.SWING_MAX.toFloat(), swing,
                onChange = { ui.onSwing(it.roundToInt()) },
                default = TimingSettings.SWING_MIN.toFloat(),
                enabled = t.interval.swings,
                haptics = ui.haptics,
                description = MirrorText.knobDescription(MirrorText.SWING, swing),
            )
            Text(
                if (t.interval.swings) MirrorText.TIMING_NOTE else MirrorText.SWING_NOTE,
                style = ArcType.small,
                color = if (t.interval.swings) c.graphite else c.signal,
                modifier = Modifier.weight(1f),
            )
        }
    }
    Caption(MirrorText.ARP_SECTION, align = TextAlign.Start)
    GridPlate {
        // Note repeat plays every pad held on each step: the order is the arp's (KEYS) alone.
        SettingRow(MirrorText.ORDER, stacked = true) {
            Segmented(
                ArpOrder.entries.map(MirrorText::arpOrderName),
                selected = ArpOrder.entries.indexOf(a.order),
                onSelect = { ui.onOrder(ArpOrder.entries[it]) },
                modifier = Modifier.fillMaxWidth(),
                compact = true,
                descriptions = ArpOrder.entries.map(MirrorText::arpOrderSpoken),
            )
        }
        PlateLine()
        SettingRow(MirrorText.OCTAVES) {
            Segmented(
                (ArpSettings.MIN_OCTAVES..ArpSettings.MAX_OCTAVES).map { it.toString() },
                selected = a.octaves - ArpSettings.MIN_OCTAVES,
                onSelect = { ui.onOctaves(ArpSettings.MIN_OCTAVES + it) },
                modifier = Modifier.width(OctavesWidth),
                compact = true,
            )
        }
        PlateLine()
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val gate = MirrorText.percent(a.gate)
            Knob(
                MirrorText.GATE, a.gate.toFloat(), ArpSettings.MIN_GATE.toFloat()..ArpSettings.MAX_GATE.toFloat(), gate,
                onChange = { ui.onGate(it.roundToInt()) },
                default = ArpSettings.DEFAULT.gate.toFloat(),
                step = 5f,
                fineStep = 1f,
                haptics = ui.haptics,
                description = MirrorText.knobDescription(MirrorText.GATE, gate),
            )
            Text(MirrorText.GATE_NOTE, style = ArcType.small, color = c.graphite, modifier = Modifier.weight(1f))
        }
        PlateLine()
        SwitchRow(MirrorText.LATCH, MirrorText.ARP_LATCH_NOTE, a.latch, ui.onLatch)
    }
}

/** OCTAVES' three keys. */
private val OctavesWidth = 150.dp

/** How long − or + is held before it repeats, and then how often. */
private const val REPEAT_AFTER_MS = 400L
private const val REPEAT_EVERY_MS = 80L

/**
 * − or + on the tempo sheet: a step on the press, then, held, a step every
 * [REPEAT_EVERY_MS] after [REPEAT_AFTER_MS]. Greyed out (and still) at
 * either end, and while the EP-133's tempo leads.
 */
@Composable
private fun RepeatKey(glyph: String, description: String, enabled: Boolean, onStep: () -> Unit) {
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

/**
 * The tempo sheet's TAP pad, grey as TEMPO's lower half: each press is a
 * tap, timed from the touch event itself ([PressTime]) rather than from when
 * the app handles it. A screen reader's tap counts from then.
 */
@Composable
private fun TapPad(enabled: Boolean, onTap: (Long) -> Unit) {
    val c = LocalArcColors.current
    val ko = LocalHwColors.current.ko
    val tap by rememberUpdatedState(onTap)
    var down by remember { mutableStateOf(false) }
    Box(
        Modifier
            .size(TapSize)
            .cap(ko.loopFace, ko.greyEdge, RoundedCornerShape(14.dp), capPress(down && enabled), alpha = if (enabled) 1f else 0.45f)
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                awaitEachGesture {
                    val first = awaitFirstDown()
                    first.consume()
                    tap(PressTime.of(first.uptimeMillis))
                    down = true
                    try {
                        waitForUpOrCancellation()
                    } finally {
                        down = false
                    }
                }
            }
            .semantics {
                role = Role.Button
                contentDescription = MirrorText.TAP_TEMPO
                if (enabled) {
                    onClick {
                        tap(System.nanoTime())
                        true
                    }
                } else {
                    disabled()
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(MirrorText.FN_TEMPO_SUB.uppercase(), style = ArcType.capsKeyWide.copy(fontSize = 20.sp), color = c.onSignal)
    }
}

/** − and +, and the TAP pad. */
private val StepKey: Dp = 56.dp
private val TapSize: Dp = 96.dp
