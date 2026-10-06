package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.collapse
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.expand
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.arc.ep133.audio.LiveEngineInfo
import dev.arc.ep133.audio.LiveLatency
import dev.arc.ep133.features.LatencySummary
import dev.arc.ep133.protocol.TrafficLog
import dev.arc.ep133.text.LatencyText
import dev.arc.ep133.text.LiveEngine
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.ArcWindow
import dev.arc.ep133.ui.components.Chevron
import dev.arc.ep133.ui.components.ChoiceRow
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.LocalArcWindow
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.Segmented
import dev.arc.ep133.ui.components.SettingRow
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import dev.arc.ep133.util.toHex
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * The latency test on the debug screen (an addition): Live's times by engine
 * ([LiveLatency]), the engine choice, and Reset. [open] unfolds it in the
 * log's place.
 */
class LatencyUi(
    val state: LiveLatency.State = LiveLatency.State(),
    val engine: LiveEngine = LiveEngine.AUTO,
    val onEngine: (LiveEngine) -> Unit = {},
    val onReset: () -> Unit = {},
    val open: Boolean = false,
    val onOpen: (Boolean) -> Unit = {},
)

/**
 * Hidden debug screen (long-press the section tag, or Settings > Debug log):
 * every SysEx message in and out, for diagnosing the first runs on real
 * hardware. Export gives the full bytes as a text file.
 *
 * Above the log, the latency test ([latency]) folds out in the log's place:
 * pick an engine, play in Live, come back and compare.
 */
@Composable
fun DebugScreen(
    log: TrafficLog,
    onShare: () -> Unit,
    onSave: () -> Unit,
    onCopy: () -> Unit,
    latency: LatencyUi = LatencyUi(),
    onBack: () -> Unit,
) {
    val c = LocalArcColors.current
    BackHandler(onBack = onBack)
    val version by log.version.collectAsState()
    val entries = remember(version) { log.snapshot() }
    var logging by remember { mutableStateOf(log.enabled) }
    val listState = rememberLazyListState()
    // On a phone on its side only the title and Done stay above the log; the latency row, the
    // switch and the keys are the list's first row and scroll away with it, or the log would get a
    // few lines. Upright they all stay above the log's dark plate.
    val window = LocalArcWindow.current
    val short = window.short
    val rowsAbove = if (short) 1 else 0
    // Opened, or the window changed (the phone turned): at the newest entry. Upright each new
    // entry scrolls to it; on its side only while the list is at the end, so reading further
    // up (or reaching the keys) isn't cut short.
    var shownIn by remember { mutableStateOf<ArcWindow?>(null) }
    LaunchedEffect(entries.size, window, latency.open) {
        // The latency test in the log's place: the newest entry once it folds away.
        if (entries.isEmpty() || latency.open) return@LaunchedEffect
        if (!short || shownIn != window || !listState.canScrollForward) listState.scrollToItem(rowsAbove + entries.size - 1)
        shownIn = window
    }
    val fmt = remember { DateTimeFormatter.ofPattern("HH:mm:ss.SSS").withZone(ZoneId.systemDefault()) }
    val title: @Composable () -> Unit = {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(Strings.DEBUG_TITLE, style = ArcType.heading, color = c.ink)
            ArcKey(Strings.DONE, onBack, size = KeySize.Small, style = KeyStyle.Quiet)
        }
    }
    val controls: @Composable () -> Unit = {
        ChoiceRow(Strings.DEBUG_TOGGLE, logging, {
            logging = !logging
            log.enabled = logging
        }, radio = false, trailing = "${entries.size}")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ArcKey(Strings.DEBUG_SHARE, onShare, Modifier.weight(1f), size = KeySize.Small)
            ArcKey(Strings.DEBUG_SAVE, onSave, Modifier.weight(1f), size = KeySize.Small)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ArcKey(Strings.DEBUG_COPY, onCopy, Modifier.weight(1f), size = KeySize.Small)
            ArcKey(Strings.DEBUG_CLEAR, { log.clear() }, Modifier.weight(1f), size = KeySize.Small)
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(c.shell)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        title()
        if (latency.open) {
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                LatencyHeader(latency)
                LatencyPanel(latency)
            }
        } else {
            if (!short) {
                LatencyHeader(latency)
                controls()
            }
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .then(if (short) Modifier else Modifier.clip(RoundedCornerShape(12.dp)).background(c.display).padding(10.dp)),
                verticalArrangement = Arrangement.spacedBy(if (short) 0.dp else 6.dp),
            ) {
                if (short) {
                    item(key = "head") {
                        Column(Modifier.padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            LatencyHeader(latency)
                            controls()
                        }
                    }
                }
                if (entries.isEmpty()) {
                    item {
                        Text(
                            Strings.DEBUG_EMPTY, style = ArcType.small, color = c.displayDim,
                            modifier = if (short) Modifier.logRow(true, true, c.display) else Modifier,
                        )
                    }
                }
                itemsIndexed(entries) { i, e ->
                    val time = fmt.format(Instant.ofEpochMilli(e.time))
                    val head = when (e.dir) {
                        TrafficLog.Dir.OUT -> "OUT"
                        TrafficLog.Dir.IN -> "IN "
                        TrafficLog.Dir.NOTE -> "-- "
                    }
                    val body = if (e.dir == TrafficLog.Dir.NOTE) e.note.orEmpty() else {
                        val shown = if (e.bytes.size > 64) e.bytes.copyOf(64).toHex() + " … (+${e.bytes.size - 64})" else e.bytes.toHex()
                        TrafficLog.describe(e.bytes) + "\n" + shown
                    }
                    Text(
                        "$time $head $body",
                        color = if (e.dir == TrafficLog.Dir.OUT) c.displayInk else if (e.dir == TrafficLog.Dir.IN) c.displayInk.copy(alpha = 0.8f) else c.signal,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        lineHeight = 15.sp,
                        modifier = if (short) Modifier.logRow(i == 0, i == entries.lastIndex, c.display) else Modifier,
                    )
                }
            }
        }
    }
}

/** The latency test's row: its name and how-to, and a chevron; a tap folds it out or away. */
@Composable
private fun LatencyHeader(ui: LatencyUi) {
    GridPlate {
        SettingRow(
            LatencyText.TITLE,
            Modifier
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { ui.onOpen(!ui.open) }
                .semantics {
                    if (ui.open) {
                        collapse {
                            ui.onOpen(false)
                            true
                        }
                    } else {
                        expand {
                            ui.onOpen(true)
                            true
                        }
                    }
                },
            note = LatencyText.HOW_TO,
        ) { Chevron(Modifier.padding(horizontal = 6.dp), open = ui.open) }
    }
}

/**
 * The latency test folded out: the engine choice, a row per engine tried
 * this session (its times, and what its buffer alone should take), what the
 * times measure, and Reset.
 */
@Composable
internal fun LatencyPanel(ui: LatencyUi) {
    val c = LocalArcColors.current
    val st = ui.state
    GridPlate {
        SettingRow(LatencyText.ENGINE, note = LatencyText.ENGINE_NOTE, stacked = true) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Segmented(
                    LiveEngine.entries.map(LatencyText::engine),
                    selected = ui.engine.ordinal,
                    onSelect = { ui.onEngine(LiveEngine.entries[it]) },
                    modifier = Modifier.fillMaxWidth(),
                    compact = true,
                )
                Text(LatencyText.engineNote(ui.engine), style = ArcType.small, color = c.graphite)
            }
        }
    }
    GridPlate {
        val engines = st.engines
        if (engines.isEmpty()) SettingRow(LatencyText.NO_PRESSES)
        engines.forEachIndexed { i, label ->
            if (i > 0) PlateLine()
            EngineRow(label, st.stats.summary(label), st.outputs[label], inUse = label == st.inUse)
        }
    }
    Text(LatencyText.MEASURES, style = ArcType.small, color = c.graphite)
    ArcKey(LatencyText.RESET, ui.onReset, size = KeySize.Small, enabled = !st.stats.isEmpty)
}

/** One engine's row: its name ([inUse]: the one Live plays through), its times, and the estimate from its [output]. */
@Composable
private fun EngineRow(label: String, summary: LatencySummary?, output: LiveEngineInfo?, inUse: Boolean) {
    val c = LocalArcColors.current
    Column(
        Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {}
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(label, style = ArcType.semi, color = c.ink, modifier = Modifier.weight(1f))
            if (inUse) Text(LatencyText.IN_USE.uppercase(), style = ArcType.caps, color = c.signal)
        }
        if (summary == null) {
            Text(LatencyText.NO_PRESSES, style = ArcType.small, color = c.graphite)
        } else {
            Text(
                LatencyText.stats(summary.median, summary.best, summary.worst, summary.count),
                style = ArcType.statLabel,
                color = c.ink,
                modifier = Modifier.semantics {
                    contentDescription = LatencyText.statsDescription(summary.median, summary.best, summary.worst, summary.count)
                },
            )
        }
        if (output != null) Text(LatencyText.estimate(output.buffer, output.burst, output.rate), style = ArcType.small, color = c.graphite)
    }
}

/**
 * One row of the log's dark plate drawn row by row (under the header in a
 * short window): rounded at its ends, with the plate's padding and gaps.
 */
private fun Modifier.logRow(first: Boolean, last: Boolean, plate: Color): Modifier {
    val r = 12.dp
    return fillMaxWidth()
        .clip(RoundedCornerShape(topStart = if (first) r else 0.dp, topEnd = if (first) r else 0.dp, bottomStart = if (last) r else 0.dp, bottomEnd = if (last) r else 0.dp))
        .background(plate)
        .padding(start = 10.dp, end = 10.dp, top = if (first) 10.dp else 3.dp, bottom = if (last) 10.dp else 3.dp)
}
