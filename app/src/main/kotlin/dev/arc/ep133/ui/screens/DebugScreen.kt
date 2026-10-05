package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.arc.ep133.protocol.TrafficLog
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.ChoiceRow
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.LocalArcWindow
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import dev.arc.ep133.util.toHex
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Hidden debug screen (long-press the wordmark): every SysEx message in and
 * out, for diagnosing the first runs on real hardware. Export gives the full
 * bytes as a text file.
 */
@Composable
fun DebugScreen(log: TrafficLog, onShare: () -> Unit, onSave: () -> Unit, onCopy: () -> Unit, onBack: () -> Unit) {
    val c = LocalArcColors.current
    BackHandler(onBack = onBack)
    val version by log.version.collectAsState()
    val entries = remember(version) { log.snapshot() }
    var logging by remember { mutableStateOf(log.enabled) }
    val listState = rememberLazyListState()
    // On a phone on its side the header is the list's first row and scrolls away with the log,
    // which would otherwise get a few lines; upright it stays above the log's dark plate.
    val short = LocalArcWindow.current.short
    val rowsAbove = if (short) 1 else 0
    LaunchedEffect(entries.size) { if (entries.isNotEmpty()) listState.scrollToItem(rowsAbove + entries.size - 1) }
    val fmt = remember { DateTimeFormatter.ofPattern("HH:mm:ss.SSS").withZone(ZoneId.systemDefault()) }
    val header: @Composable () -> Unit = {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(Strings.DEBUG_TITLE, style = ArcType.heading, color = c.ink)
            ArcKey(Strings.DONE, onBack, size = KeySize.Small, style = KeyStyle.Quiet)
        }
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
        if (!short) header()
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
                    Column(Modifier.padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { header() }
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
