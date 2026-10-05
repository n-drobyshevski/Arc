package dev.arc.ep133.ui.screens

import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import dev.arc.ep133.features.DeviceBrowser
import dev.arc.ep133.features.DeviceContents
import dev.arc.ep133.ui.components.DashedBox
import dev.arc.ep133.ui.components.DisplayPanel
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.PlayKey
import dev.arc.ep133.ui.components.Segmented
import dev.arc.ep133.ui.components.hatch
import dev.arc.ep133.ui.components.plateRow
import dev.arc.ep133.ui.components.Caption
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
import dev.arc.ep133.features.SampleTrim
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
 * slots and projects, one view at a time. Details are read on tap, since
 * reading every slot's metadata up front would take a while; Play reads them
 * itself when needed.
 */
@Composable
fun DeviceScreen(
    state: UiState,
    onRefresh: () -> Unit,
    onSoundDetails: (Int) -> Unit,
    onProjectSounds: (Int) -> Unit,
    onAddSamples: () -> Unit,
    /** Null on the Device tab, which has no Done key. */
    onBack: (() -> Unit)? = null,
    playing: String? = null,
    onPlay: (Int) -> Unit = {},
    onStop: () -> Unit = {},
    onPads: (Int) -> Unit = {},
    /** Where the screen starts, for screenshots: 0 sounds, 1 projects, and the open slot or project. */
    initialSection: Int = 0,
    initialOpen: Int? = null,
) {
    val c = LocalArcColors.current
    if (onBack != null) BackHandler(onBack = onBack)
    val b = state.browser
    val contents = b.contents
    var openSlot by rememberSaveable { mutableStateOf(initialOpen.takeIf { initialSection == 0 }) }
    var openProject by rememberSaveable { mutableStateOf(initialOpen.takeIf { initialSection == 1 }) }
    // 0: sounds, 1: projects.
    var section by rememberSaveable { mutableIntStateOf(initialSection) }
    var query by rememberSaveable { mutableStateOf("") }
    // Read the contents when the screen opens, and again once a reconnected device is ready
    // (or once a transfer that kept the device busy has finished).
    // Once per connection, so a read that fails is not retried in a loop (Refresh retries).
    val ready = state.device != null
    var asked by remember(ready) { mutableStateOf(false) }
    LaunchedEffect(ready, state.busy) {
        if (ready && !state.busy && contents == null && !asked) {
            asked = true
            onRefresh()
        }
    }
    val groups = remember(contents, query) {
        contents?.let { DeviceBrowser.hundreds(DeviceBrowser.findSounds(it.sounds, query)) } ?: emptyList()
    }
    val names = remember(contents) { contents?.sounds?.associate { it.slot to it.name } ?: emptyMap() }

    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        LazyColumn(
            Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.safeDrawing),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
        ) {
            item(key = "head") {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Caption(FeatureText.DEVICE_TITLE, Modifier.weight(1f), align = TextAlign.Start)
                    ArcKey(FeatureText.REFRESH, onRefresh, size = KeySize.Small, enabled = state.connected && !state.busy)
                    if (onBack != null) ArcKey(Strings.DONE, onBack, size = KeySize.Small, style = KeyStyle.Quiet)
                }
            }
            if (!state.connected) {
                item(key = "none") {
                    Box(Modifier.padding(top = 12.dp)) {
                        DashedBox {
                            Text(FeatureText.NO_DEVICE_TITLE, style = ArcType.bold, color = c.ink)
                            Text(FeatureText.NOT_CONNECTED, style = ArcType.body15, color = c.graphite)
                        }
                    }
                }
                return@LazyColumn
            }
            item(key = "panel") { StoragePanel(contents, b.reading != null, Modifier.padding(top = 12.dp)) }
            if (contents == null) return@LazyColumn
            item(key = "add") {
                ArcKey(
                    FeatureText.ADD_SAMPLES, onAddSamples, Modifier.fillMaxWidth().padding(top = 12.dp),
                    style = KeyStyle.Signal, enabled = !state.busy,
                )
            }
            item(key = "switch") {
                Segmented(
                    listOf(
                        FeatureText.sectionLabel(FeatureText.SOUNDS, contents.sounds.size),
                        FeatureText.sectionLabel(FeatureText.PROJECTS, contents.projects.size),
                    ),
                    selected = section,
                    onSelect = { section = it },
                    modifier = Modifier.padding(top = 20.dp),
                )
            }
            if (section == 0) {
                if (contents.sounds.isEmpty()) {
                    item(key = "no-sounds") { Box(Modifier.padding(top = 14.dp)) { DashedBox { Text(FeatureText.NO_SOUNDS, style = ArcType.body15, color = c.graphite) } } }
                } else {
                    item(key = "find") {
                        ArcField(
                            FeatureText.FIND_SOUND, query, { query = it },
                            Modifier.padding(top = 14.dp),
                            placeholder = FeatureText.FIND_HINT,
                            maxLength = 40,
                        )
                    }
                    if (groups.isEmpty()) {
                        item(key = "no-match") { Text(FeatureText.NO_FIND_MATCHES, style = ArcType.body15, color = c.graphite, modifier = Modifier.padding(top = 14.dp)) }
                    }
                    for ((range, list) in groups) {
                        item(key = "h${range.first}") {
                            Row(Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 8.dp)) {
                                Caption(FeatureText.range(range), Modifier.weight(1f), align = TextAlign.Start)
                                Text(list.size.toString(), style = ArcType.caps, color = c.graphite)
                            }
                        }
                        itemsIndexed(list, key = { _, e -> "s${e.slot}" }) { i, e ->
                            SoundRow(
                                e, b, first = i == 0, last = i == list.lastIndex,
                                open = openSlot == e.slot, enabled = !state.busy,
                                playing = playing == "device:${e.slot}",
                                onPlay = { onPlay(e.slot) },
                                onStop = onStop,
                                onClick = {
                                    openSlot = if (openSlot == e.slot) null else e.slot
                                    if (openSlot == e.slot && !b.details.containsKey(e.slot)) onSoundDetails(e.slot)
                                },
                            )
                        }
                    }
                }
            } else {
                if (contents.projects.isEmpty()) {
                    item(key = "no-projects") { Box(Modifier.padding(top = 14.dp)) { DashedBox { Text(FeatureText.NO_PROJECTS, style = ArcType.body15, color = c.graphite) } } }
                } else {
                    item(key = "projects") {
                        ProjectGrid(
                            contents.projects, selected = openProject, enabled = !state.busy,
                            onSelect = { p ->
                                openProject = if (openProject == p) null else p
                                if (openProject == p && !b.projectSounds.containsKey(p)) onProjectSounds(p)
                            },
                            modifier = Modifier.padding(top = 14.dp),
                        )
                    }
                    item(key = "project") {
                        val p = contents.projects.firstOrNull { it.project == openProject }
                        Box(Modifier.padding(top = 12.dp)) {
                            if (p == null) {
                                Text(FeatureText.PICK_PROJECT, style = ArcType.small, color = c.graphite)
                            } else {
                                ProjectPanel(p, b, names, onPads = { onPads(p.project) })
                            }
                        }
                    }
                }
            }
        }
    }
}

/** The dark panel: the storage meter, free space and what is on the device. */
@Composable
private fun StoragePanel(contents: DeviceContents?, reading: Boolean, modifier: Modifier) {
    val c = LocalArcColors.current
    Box(modifier) {
        DisplayPanel {
            val s = contents?.storage
            Meter(if (s != null && s.total != 0.0) s.used / s.total else 0.0, height = 18.dp)
            if (contents == null || s == null) {
                Text(FeatureText.READING, style = ArcType.displayHint, color = c.displayDim)
            } else {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(FeatureText.storage(s.free, s.total), style = ArcType.displaySub, color = c.displayInk, modifier = Modifier.weight(1f))
                    Text(
                        if (reading) FeatureText.READING else FeatureText.counts(contents.sounds.size, contents.projects.size),
                        style = ArcType.displaySub,
                        color = c.displayDim,
                    )
                }
            }
        }
    }
}

@Composable
internal fun SectionTitle(text: String, count: Int) {
    val c = LocalArcColors.current
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.Bottom) {
        Caption(text, Modifier.weight(1f), align = TextAlign.Start)
        Text(count.toString(), style = ArcType.caps, color = c.graphite)
    }
}

/** A flat pale plate with a pressed tint, like the backup rows; plain text when [onClick] is null. */
@Composable
internal fun Plate(onClick: (() -> Unit)?, enabled: Boolean, content: @Composable ColumnScope.() -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(c.plate)
            .background(if (pressed) c.keyEdge.copy(alpha = 0.35f) else Color.Transparent)
            // Not while the device is busy: the read it starts would be skipped.
            .then(
                if (onClick != null) {
                    Modifier.clickable(interactionSource = source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
                } else {
                    Modifier
                },
            )
            .padding(vertical = 12.dp, horizontal = 14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        content = content,
    )
}

@Composable
private fun SoundRow(
    e: SoundEntry,
    b: BrowserUi,
    first: Boolean,
    last: Boolean,
    open: Boolean,
    enabled: Boolean,
    playing: Boolean,
    onPlay: () -> Unit,
    onStop: () -> Unit,
    onClick: () -> Unit,
) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Column(
        Modifier
            .fillMaxWidth()
            .plateRow(first, last, c.plate, c.line)
            .background(if (pressed) c.keyEdge.copy(alpha = 0.35f) else Color.Transparent)
            // Not while the device is busy: the read it starts would be skipped.
            .clickable(interactionSource = source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(start = 16.dp, end = 10.dp, top = 8.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(FeatureText.slot(e.slot), style = ArcType.bold, color = c.graphite)
            OneLine(e.name, ArcType.bold, c.ink, Modifier.weight(1f))
            Text(Format.bytes(e.size), style = ArcType.small, color = c.graphite)
            // Downloads the sound (and its details if needed), then plays it on the phone.
            PlayKey(
                playing = playing,
                enabled = enabled,
                description = if (playing) FeatureText.stop(e.name) else FeatureText.play(e.name),
                onClick = { if (playing) onStop() else onPlay() },
            )
        }
        if (b.reading == "play:${e.slot}") Text(FeatureText.READING, style = ArcType.small, color = c.graphite)
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

/** The projects as tiles on one plate split by thin lines, three to a row; the picked one is navy. */
@Composable
private fun ProjectGrid(projects: List<ProjectEntry>, selected: Int?, enabled: Boolean, onSelect: (Int) -> Unit, modifier: Modifier) {
    val c = LocalArcColors.current
    GridPlate(modifier) {
        projects.chunked(3).forEachIndexed { r, row ->
            if (r > 0) PlateLine()
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                row.forEachIndexed { i, p ->
                    if (i > 0) Box(Modifier.width(1.dp).fillMaxHeight().background(c.line))
                    val on = p.project == selected
                    Column(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .background(if (on) c.navy else Color.Transparent)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                enabled = enabled,
                                role = Role.Button,
                            ) { onSelect(p.project) }
                            .semantics { this.selected = on }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        Text(FeatureText.PROJECT.uppercase(), style = ArcType.caps, color = if (on) c.onNavy else c.graphite)
                        Text(p.project.toString(), style = ArcType.statFree, color = if (on) c.onNavy else c.ink, modifier = Modifier.padding(top = 2.dp))
                        Text(Format.bytes(p.size), style = ArcType.small, color = if (on) c.onNavy else c.graphite, modifier = Modifier.align(Alignment.End))
                    }
                }
                // Keep tiles the same width on a short last row.
                repeat(3 - row.size) {
                    Box(Modifier.width(1.dp).fillMaxHeight().background(c.line))
                    Box(Modifier.weight(1f).fillMaxHeight().hatch(c.keyEdge))
                }
            }
        }
    }
}

/** The picked project: the sounds it uses, by name, and its pads. */
@Composable
private fun ProjectPanel(p: ProjectEntry, b: BrowserUi, names: Map<Int, String>, onPads: () -> Unit) {
    val c = LocalArcColors.current
    Plate(onClick = null, enabled = true) {
        Text(Strings.projectLine(p.project), style = ArcType.bold, color = c.ink)
        val slots = b.projectSounds[p.project]
        val text = when {
            slots != null -> FeatureText.projectSoundNames(slots, names)
            b.reading == "project:${p.project}" -> FeatureText.READING
            else -> FeatureText.TAP_FOR_SOUNDS
        }
        Text(text, style = ArcType.small, color = c.graphite)
        // The pads come from the same download as the sounds.
        if (b.projectPads.containsKey(p.project)) {
            ArcKey(FeatureText.PADS, onPads, Modifier.fillMaxWidth().padding(top = 6.dp), size = KeySize.Small)
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
    onTrim: (Int) -> Unit = {},
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
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    val t = item.trim
                    Text(
                        if (t != null) FeatureText.trimmed(SampleTrim.seconds(t.last + 1 - t.first, item.sampleRate)) else "",
                        style = ArcType.small, color = c.graphite, modifier = Modifier.weight(1f),
                    )
                    ArcKey(FeatureText.TRIM, { onTrim(i) }, size = KeySize.Small, enabled = !busy)
                }
            }
        }
    }
    if (dup != null) Text(FeatureText.duplicateSlot(dup), style = ArcType.small, color = c.danger)
    val ready = usable.filter { it.slot != null }
    val ok = ready.isNotEmpty() && ready.size == usable.size && dup == null && !busy
    ArcKey(FeatureText.uploadButton(if (dup == null) ready.size else 0), onUpload, Modifier.fillMaxWidth(), style = KeyStyle.Signal, enabled = ok)
    ArcKey(Strings.CANCEL, onCancel, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
}
