package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.BrowserUi
import dev.arc.ep133.controller.UiState
import dev.arc.ep133.controller.UploadDraftItem
import dev.arc.ep133.features.SampleUpload
import dev.arc.ep133.features.SoundDetails
import dev.arc.ep133.protocol.ProjectEntry
import dev.arc.ep133.protocol.SoundEntry
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Format
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcField
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.Meter
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * What is on the EP-133 right now (an addition to the web version): sound
 * slots and projects. Details are read on tap, since reading every slot's
 * metadata up front would take a while.
 */
@Composable
fun DeviceScreen(
    state: UiState,
    onRefresh: () -> Unit,
    onSoundDetails: (Int) -> Unit,
    onProjectSounds: (Int) -> Unit,
    onAddSamples: () -> Unit,
    onBack: () -> Unit,
) {
    val c = LocalArcColors.current
    BackHandler(onBack = onBack)
    val b = state.browser
    val contents = b.contents
    var openSlot by rememberSaveable { mutableStateOf<Int?>(null) }
    var openProject by rememberSaveable { mutableStateOf<Int?>(null) }
    // Read the contents when the screen opens, and again once a reconnected device is ready.
    val ready = state.device != null
    LaunchedEffect(ready) { if (ready && contents == null) onRefresh() }

    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        LazyColumn(
            Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.safeDrawing),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(FeatureText.DEVICE_TITLE, style = ArcType.heading, color = c.ink, modifier = Modifier.weight(1f))
                    ArcKey(FeatureText.REFRESH, onRefresh, size = KeySize.Small, enabled = state.connected && !state.busy)
                    ArcKey(Strings.DONE, onBack, size = KeySize.Small, style = KeyStyle.Quiet)
                }
            }
            if (!state.connected) {
                item { Text(FeatureText.NOT_CONNECTED, style = ArcType.body15, color = c.graphite) }
                return@LazyColumn
            }
            if (contents == null) {
                item { Text(FeatureText.READING, style = ArcType.body15, color = c.graphite) }
                return@LazyColumn
            }
            item {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(c.display)
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    val s = contents.storage
                    Meter(if (s.total != 0.0) s.used / s.total else 0.0, height = 16.dp)
                    Text(FeatureText.storage(s.free, s.total), style = ArcType.displaySub, color = c.displayDim)
                }
            }
            item {
                ArcKey(
                    FeatureText.ADD_SAMPLES, onAddSamples, Modifier.fillMaxWidth(),
                    style = KeyStyle.Signal, enabled = !state.busy,
                )
            }
            item { SectionTitle(FeatureText.SOUNDS, contents.sounds.size) }
            if (contents.sounds.isEmpty()) item { Text(FeatureText.NO_SOUNDS, style = ArcType.body15, color = c.graphite) }
            items(contents.sounds, key = { "s${it.slot}" }) { e ->
                SoundRow(
                    e, b, open = openSlot == e.slot, enabled = !state.busy,
                    onClick = {
                        openSlot = if (openSlot == e.slot) null else e.slot
                        if (openSlot == e.slot && !b.details.containsKey(e.slot)) onSoundDetails(e.slot)
                    },
                )
            }
            item { Box(Modifier.height(6.dp)) }
            item { SectionTitle(FeatureText.PROJECTS, contents.projects.size) }
            if (contents.projects.isEmpty()) item { Text(FeatureText.NO_PROJECTS, style = ArcType.body15, color = c.graphite) }
            items(contents.projects, key = { "p${it.project}" }) { p ->
                ProjectRow(
                    p, b, open = openProject == p.project, enabled = !state.busy,
                    onClick = {
                        openProject = if (openProject == p.project) null else p.project
                        if (openProject == p.project && !b.projectSounds.containsKey(p.project)) onProjectSounds(p.project)
                    },
                )
            }
        }
    }
}

@Composable
internal fun SectionTitle(text: String, count: Int) {
    val c = LocalArcColors.current
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.Bottom) {
        Text(text, style = ArcType.heading, color = c.ink, modifier = Modifier.weight(1f))
        Text(count.toString(), style = ArcType.small, color = c.graphite)
    }
}

/** A pale key-coloured plate with a flat pressed tint, like the backup rows. */
@Composable
internal fun Plate(onClick: () -> Unit, enabled: Boolean, content: @Composable ColumnScope.() -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Column(
        Modifier
            .fillMaxWidth()
            .drawBehind {
                drawRoundRect(c.keyEdge, topLeft = Offset(0f, 3.dp.toPx()), size = size, cornerRadius = CornerRadius(12.dp.toPx()))
            }
            .clip(RoundedCornerShape(12.dp))
            .background(c.key)
            .background(if (pressed) c.keyEdge.copy(alpha = 0.25f) else Color.Transparent)
            // Not while the device is busy: the read it starts would be skipped.
            .clickable(interactionSource = source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(vertical = 12.dp, horizontal = 14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        content = content,
    )
}

@Composable
private fun SoundRow(e: SoundEntry, b: BrowserUi, open: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    Plate(onClick, enabled) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(FeatureText.slot(e.slot), style = ArcType.bold, color = c.graphite)
            OneLine(e.name, ArcType.bold, c.ink, Modifier.weight(1f))
            Text(Format.bytes(e.size), style = ArcType.small, color = c.graphite)
        }
        if (open) {
            val d = b.details[e.slot]
            when {
                d != null -> Details(d)
                b.reading == "slot:${e.slot}" -> Text(FeatureText.READING, style = ArcType.small, color = c.graphite)
                else -> Text(FeatureText.TAP_FOR_DETAILS, style = ArcType.small, color = c.graphite)
            }
        }
    }
}

@Composable
private fun Details(d: SoundDetails) {
    val c = LocalArcColors.current
    val rows = buildList {
        add(FeatureText.channels(d.channels) to FeatureText.sampleRate(d.sampleRate))
        for ((k, v) in d.settings) add(FeatureText.settingLabel(k) to FeatureText.settingValue(v))
        add("CRC32" to (d.crc?.let { "%08X".format(it) } ?: FeatureText.NO_CHECKSUM))
    }
    Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        for ((k, v) in rows) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(k, style = ArcType.small, color = c.graphite, modifier = Modifier.width(96.dp))
                Text(v, style = ArcType.small.copy(fontWeight = FontWeight.SemiBold), color = c.ink)
            }
        }
    }
}

@Composable
private fun ProjectRow(p: ProjectEntry, b: BrowserUi, open: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    Plate(onClick, enabled) {
        Text(Strings.projectLine(p.project), style = ArcType.bold, color = c.ink)
        if (open) {
            val slots = b.projectSounds[p.project]
            val text = when {
                slots != null -> FeatureText.projectUses(slots)
                b.reading == "project:${p.project}" -> FeatureText.READING
                else -> FeatureText.TAP_FOR_SOUNDS
            }
            Text(text, style = ArcType.small, color = c.graphite)
        }
    }
}

/** The upload sheet: one row per picked file, with its target slot. */
@Composable
fun ColumnScope.UploadSheetContent(
    draft: List<UploadDraftItem>,
    occupied: Map<Int, String>,
    busy: Boolean,
    onSlot: (Int, Int?) -> Unit,
    onUpload: () -> Unit,
    onCancel: () -> Unit,
) {
    val c = LocalArcColors.current
    Text(FeatureText.UPLOAD_TITLE, style = ArcType.heading, color = c.ink)
    Text(FeatureText.UPLOAD_HINT, style = ArcType.small, color = c.graphite)
    val usable = draft.filter { it.wav != null }
    val slots = usable.mapNotNull { it.slot }
    val dup = slots.groupBy { it }.entries.firstOrNull { it.value.size > 1 }?.key
    for ((i, item) in draft.withIndex()) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(c.key)
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            OneLine(item.name, ArcType.bold, c.ink)
            if (item.name != item.fileName) OneLine(item.fileName, ArcType.small, c.graphite)
            if (item.error != null) {
                Text(FeatureText.unusable(item.error), style = ArcType.small, color = c.danger)
            } else {
                // The field keeps what is typed; the slot is only set when it is a valid number.
                var text by rememberSaveable(i, item.fileName) { mutableStateOf(item.slot?.toString().orEmpty()) }
                ArcField(
                    FeatureText.SLOT,
                    text,
                    { v ->
                        val digits = v.filter { it.isDigit() }.take(3)
                        text = digits
                        onSlot(i, digits.toIntOrNull()?.takeIf { it in SampleUpload.FIRST_SLOT..SampleUpload.LAST_SLOT })
                    },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                val note = when {
                    item.slot == null -> FeatureText.NO_FREE_SLOT
                    occupied.containsKey(item.slot) -> FeatureText.replaces(occupied.getValue(item.slot))
                    else -> ""
                }
                if (note.isNotEmpty()) Text(note, style = ArcType.small, color = c.graphite)
            }
        }
    }
    if (dup != null) Text(FeatureText.duplicateSlot(dup), style = ArcType.small, color = c.danger)
    val ready = usable.filter { it.slot != null }
    val ok = ready.isNotEmpty() && ready.size == usable.size && dup == null && !busy
    ArcKey(FeatureText.uploadButton(if (dup == null) ready.size else 0), onUpload, Modifier.fillMaxWidth(), style = KeyStyle.Signal, enabled = ok)
    ArcKey(Strings.CANCEL, onCancel, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
}
