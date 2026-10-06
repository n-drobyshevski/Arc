package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed as gridItemsIndexed
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.BrowserUi
import dev.arc.ep133.controller.UiState
import dev.arc.ep133.controller.UploadDraftItem
import dev.arc.ep133.features.DeviceBrowser
import dev.arc.ep133.features.DeviceContents
import dev.arc.ep133.features.SampleTrim
import dev.arc.ep133.features.SampleUpload
import dev.arc.ep133.features.SoundDetails
import dev.arc.ep133.protocol.ProjectEntry
import dev.arc.ep133.protocol.SoundEntry
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Format
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcField
import dev.arc.ep133.ui.components.ArcIcon
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.CoachYellow
import dev.arc.ep133.ui.components.CoachYellowInk
import dev.arc.ep133.ui.components.DashedBox
import dev.arc.ep133.ui.components.DisplayPanel
import dev.arc.ep133.ui.components.EdgeTabWidth
import dev.arc.ep133.ui.components.IconBlock
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.LocalArcWindow
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.components.PlayKey
import dev.arc.ep133.ui.components.Segmented
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capEdge
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * What is on the EP-133 right now (an addition to the web version): the
 * storage, sound slots and projects. Sounds are listed as the Sample Tool's
 * library, a block per hundred of slots under an orange bar with its kind of
 * sound in the factory layout; projects are the K.O. II's pads 7 8 9 / 4 5 6 /
 * 1 2 3. A phone shows one at a time; a wide window (a tablet on its side)
 * shows both, the projects on the left and the sounds binder on the right,
 * where the sounds the picked project uses carry its badge. Details are read
 * on tap, since reading every slot's metadata up front would take a while;
 * Play reads them itself when needed.
 */
@OptIn(ExperimentalFoundationApi::class)
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
    /** Also for screenshots: the open sound on a wide window, where a project can be picked as well. */
    initialSlot: Int? = null,
) {
    val c = LocalArcColors.current
    val window = LocalArcWindow.current
    if (onBack != null) BackHandler(onBack = onBack)
    val b = state.browser
    val contents = b.contents
    var openSlot by rememberSaveable { mutableStateOf(initialSlot ?: initialOpen.takeIf { initialSection == 0 }) }
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
    val names = remember(contents) { contents?.sounds?.associate { it.slot to it.name } ?: emptyMap() }
    val pickSound: (Int) -> Unit = { slot ->
        openSlot = if (openSlot == slot) null else slot
        if (openSlot == slot && !b.details.containsKey(slot)) onSoundDetails(slot)
    }
    val pickProject: (Int) -> Unit = { p ->
        openProject = if (openProject == p) null else p
        if (openProject == p && !b.projectSounds.containsKey(p)) onProjectSounds(p)
    }
    val head: @Composable () -> Unit = {
        // The caption with its tools as icons: read again, and add samples (orange, the main action).
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Caption(FeatureText.DEVICE_TITLE, Modifier.weight(1f), align = TextAlign.Start)
            IconBlock(
                ArcIcon.REFRESH, CoachText.REFRESH, c.tabOff, c.navy, onRefresh,
                Modifier.coachMark("device.refresh", CoachText.REFRESH, c.navy, c.onNavy),
                enabled = state.connected && !state.busy,
            )
            if (contents != null) {
                IconBlock(
                    ArcIcon.PLUS, CoachText.ADD_SAMPLES, c.signal, c.onSignal, onAddSamples,
                    Modifier.coachMark("device.add", CoachText.ADD_SAMPLES, c.signal, c.onSignal),
                    enabled = !state.busy,
                )
            }
            if (onBack != null) ArcKey(Strings.DONE, onBack, size = KeySize.Small, style = KeyStyle.Quiet)
        }
    }
    val sounds = SoundsUi(
        b = b, openSlot = openSlot, enabled = !state.busy, playing = playing,
        onPlay = onPlay, onStop = onStop, onOpen = pickSound,
    )

    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        if (window.width >= WideWidth && !window.short) {
            WideDevice(
                state, contents, head, sounds, names, query, { query = it },
                openProject = openProject, onProject = pickProject, onPads = onPads,
            )
            return@Box
        }
        val list = rememberLazyListState()
        val scope = rememberCoroutineScope()
        val groups = remember(contents, query) {
            contents?.let { DeviceBrowser.hundreds(DeviceBrowser.findSounds(it.sounds, query)) } ?: emptyList()
        }
        // The range keys stay pinned while the list scrolls; the one whose block is in view is down.
        val jumps = section == 0 && groups.size > 1
        var keysHeight by remember { mutableIntStateOf(0) }
        val inView by remember(groups) { derivedStateOf { rangeInView(list) } }
        // Where each block's bar sits in the list: the items above the first block
        // (head, panel, switch, find and the range keys), then a bar and its rows per block.
        val bars = remember(groups, jumps) {
            var at = if (jumps) 5 else 4
            groups.associate { (r, l) -> r.first to at.also { at += 1 + l.size } }
        }
        LazyColumn(
            Modifier
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .widthIn(max = 560.dp)
                .fillMaxWidth(),
            state = list,
            // The left gutter keeps clear of the guide tab on the edge.
            contentPadding = PaddingValues(start = EdgeTabWidth + 8.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
        ) {
            item(key = "head") { head() }
            if (!state.connected) {
                item(key = "none") { Box(Modifier.padding(top = 12.dp)) { NoDevice() } }
                return@LazyColumn
            }
            item(key = "panel") { StoragePanel(contents, b.reading != null, Modifier.padding(top = 12.dp)) }
            if (contents == null) return@LazyColumn
            item(key = "switch") {
                Segmented(
                    listOf(
                        FeatureText.sectionLabel(FeatureText.SOUNDS, contents.sounds.size),
                        FeatureText.sectionLabel(FeatureText.PROJECTS, contents.projects.size),
                    ),
                    selected = section,
                    onSelect = { section = it },
                    modifier = Modifier
                        .padding(top = 14.dp)
                        .coachMark("device.switch", CoachText.SOUNDS_PROJECTS, CoachYellow, CoachYellowInk),
                )
            }
            if (section == 0) {
                if (contents.sounds.isEmpty()) {
                    item(key = "no-sounds") { Box(Modifier.padding(top = 14.dp)) { DashedBox { Text(FeatureText.NO_SOUNDS, style = ArcType.body15, color = c.graphite) } } }
                    return@LazyColumn
                }
                item(key = "find") { FindField(query, { query = it }, Modifier.padding(top = 14.dp)) }
                if (groups.isEmpty()) {
                    item(key = "no-match") { Text(FeatureText.NO_FIND_MATCHES, style = ArcType.body15, color = c.graphite, modifier = Modifier.padding(top = 14.dp)) }
                }
                if (jumps) {
                    stickyHeader(key = "ranges") {
                        RangeKeys(
                            groups.map { it.first }, on = inView ?: groups.first().first.first,
                            onPick = { first ->
                                val at = bars[first] ?: return@RangeKeys
                                scope.launch {
                                    list.animateScrollToItem(at)
                                    // Out from under the pinned keys.
                                    list.animateScrollBy(-keysHeight.toFloat())
                                }
                            },
                            modifier = Modifier.onSizeChanged { keysHeight = it.height },
                        )
                    }
                }
                for ((gi, group) in groups.withIndex()) {
                    val (range, rows) = group
                    item(key = "h${range.first}") { LibraryBar(range, rows.size, Modifier.padding(top = if (gi == 0 && !jumps) 14.dp else 10.dp)) }
                    itemsIndexed(rows, key = { _, e -> "s${e.slot}" }) { i, e ->
                        // The guide overlay points at the first row's play key.
                        sounds.Line(e, last = i == rows.lastIndex, mark = gi == 0 && i == 0)
                    }
                }
            } else {
                if (contents.projects.isEmpty()) {
                    item(key = "no-projects") { Box(Modifier.padding(top = 14.dp)) { DashedBox { Text(FeatureText.NO_PROJECTS, style = ArcType.body15, color = c.graphite) } } }
                    return@LazyColumn
                }
                item(key = "projects") {
                    ProjectPads(contents.projects, openProject, enabled = !state.busy, onSelect = pickProject, modifier = Modifier.padding(top = 14.dp))
                }
                item(key = "project") {
                    val p = contents.projects.firstOrNull { it.project == openProject }
                    Box(Modifier.padding(top = 12.dp)) {
                        if (p == null) {
                            Text(FeatureText.PICK_PROJECT, style = ArcType.small, color = c.graphite)
                        } else {
                            ProjectPanel(p, b, names, chips = true, onPads = { onPads(p.project) })
                        }
                    }
                }
            }
        }
    }
}

/** From this window width (and not short) the projects and the sounds show side by side. */
private val WideWidth = 840.dp

/** The hundred of slots [slot] is in, by its first slot (1 for 1–99). */
private fun hundredOf(slot: Int) = if (slot < 100) 1 else slot / 100 * 100

/** The range whose block is at the top of the list, under the pinned range keys; null above the blocks. */
private fun rangeInView(list: LazyListState): Int? {
    val items = list.layoutInfo.visibleItemsInfo
    val keys = items.firstOrNull { it.key == "ranges" }
    val top = keys?.let { it.offset + it.size } ?: list.layoutInfo.viewportStartOffset
    for (item in items) {
        if (item.offset + item.size <= top) continue
        val k = item.key as? String ?: continue
        when {
            k.startsWith("h") -> return k.drop(1).toIntOrNull()
            k.startsWith("s") -> return k.drop(1).toIntOrNull()?.let(::hundredOf)
        }
    }
    return null
}

@Composable
private fun NoDevice() {
    val c = LocalArcColors.current
    DashedBox {
        Text(FeatureText.NO_DEVICE_TITLE, style = ArcType.bold, color = c.ink)
        Text(FeatureText.NOT_CONNECTED, style = ArcType.body15, color = c.graphite)
    }
}

/** The find field: the search glass and "Name or slot number". */
@Composable
private fun FindField(query: String, onQuery: (String) -> Unit, modifier: Modifier = Modifier, background: Color? = null) {
    ArcField(
        null, query, onQuery,
        modifier.semantics { contentDescription = FeatureText.FIND_SOUND },
        placeholder = FeatureText.FIND_HINT,
        maxLength = 40,
        background = background,
        icon = ArcIcon.SEARCH,
    )
}

/**
 * The wide layout: on the left the head, the storage, the projects as pads
 * and the picked project's card; on the right the sounds binder, its range
 * tabs on its right edge. Nothing to switch between.
 */
@Composable
private fun WideDevice(
    state: UiState,
    contents: DeviceContents?,
    head: @Composable () -> Unit,
    sounds: SoundsUi,
    names: Map<Int, String>,
    query: String,
    onQuery: (String) -> Unit,
    openProject: Int?,
    onProject: (Int) -> Unit,
    onPads: (Int) -> Unit,
) {
    val c = LocalArcColors.current
    val b = state.browser
    Row(
        Modifier
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .widthIn(max = 1360.dp)
            .fillMaxSize()
            .padding(start = EdgeTabWidth + 8.dp, end = 16.dp, top = 4.dp, bottom = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Column(
            Modifier.width(380.dp).fillMaxHeight().verticalScroll(rememberScrollState()).padding(bottom = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            head()
            if (!state.connected) {
                NoDevice()
                return@Column
            }
            StoragePanel(contents, b.reading != null, Modifier)
            if (contents == null) return@Column
            Caption(FeatureText.PROJECTS, Modifier.padding(top = 4.dp, start = 2.dp), align = TextAlign.Start)
            if (contents.projects.isEmpty()) {
                DashedBox { Text(FeatureText.NO_PROJECTS, style = ArcType.body15, color = c.graphite) }
            } else {
                ProjectPads(contents.projects, openProject, enabled = !state.busy, onSelect = onProject, small = true)
                val p = contents.projects.firstOrNull { it.project == openProject }
                if (p == null) {
                    Text(FeatureText.PICK_PROJECT, style = ArcType.small, color = c.graphite)
                } else {
                    ProjectPanel(p, b, names, chips = false, onPads = { onPads(p.project) })
                }
            }
        }
        if (state.connected && contents != null) {
            SoundsBinder(contents, sounds, query, onQuery, openProject?.takeIf { p -> contents.projects.any { it.project == p } }, Modifier.weight(1f).fillMaxHeight())
        }
    }
}

/**
 * The sounds binder: the orange bar ("Sounds · 12 · 2.1 MB"), the find field
 * and (with a project picked and read) All / In P3, then the library blocks
 * in as many columns as fit; the range tabs on its right edge jump to a block.
 */
@Composable
private fun SoundsBinder(
    contents: DeviceContents,
    sounds: SoundsUi,
    query: String,
    onQuery: (String) -> Unit,
    project: Int?,
    modifier: Modifier,
) {
    val c = LocalArcColors.current
    val b = sounds.b
    // The sounds the picked project uses, once its download is in.
    val used = remember(project, b.projectSounds) { project?.let { b.projectSounds[it] }?.toSet() }
    var onlyUsed by rememberSaveable { mutableStateOf(false) }
    val filter = onlyUsed && used != null
    val groups = remember(contents, query, used, filter) {
        val all = DeviceBrowser.findSounds(contents.sounds, query)
        DeviceBrowser.hundreds(if (filter) all.filter { it.slot in used } else all)
    }
    val grid = rememberLazyStaggeredGridState()
    val scope = rememberCoroutineScope()
    val inView by remember(groups) { derivedStateOf { groups.getOrNull(grid.firstVisibleItemIndex)?.first?.first } }
    Row(modifier) {
        Column(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .clip(RoundedCornerShape(18.dp))
                .background(c.key),
        ) {
            Row(
                Modifier.fillMaxWidth().background(c.signal).heightIn(min = 44.dp).padding(horizontal = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(FeatureText.SOUNDS.uppercase(), style = ArcType.caps, color = c.onSignal, modifier = Modifier.weight(1f))
                Text(FeatureText.soundsTotal(contents.sounds.size, contents.sounds.sumOf { it.size }.toDouble()), style = ArcType.caps, color = c.onSignal)
            }
            if (contents.sounds.isEmpty()) {
                Box(Modifier.padding(16.dp)) { DashedBox { Text(FeatureText.NO_SOUNDS, style = ArcType.body15, color = c.graphite) } }
                return@Column
            }
            Row(
                Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // On the pale sheet, a field the page's colour.
                FindField(query, onQuery, Modifier.weight(1f), background = c.shell)
                if (project != null && used != null) {
                    Segmented(
                        listOf(
                            FeatureText.sectionLabel(FeatureText.ALL, contents.sounds.size),
                            FeatureText.inProject(project, contents.sounds.count { it.slot in used }),
                        ),
                        selected = if (filter) 1 else 0,
                        onSelect = { onlyUsed = it == 1 },
                        // As wide as its labels: given the row's width it would take it all from the field.
                        modifier = Modifier.width(IntrinsicSize.Max),
                        compact = true,
                    )
                }
            }
            if (groups.isEmpty()) {
                Text(FeatureText.NO_FIND_MATCHES, style = ArcType.body15, color = c.graphite, modifier = Modifier.padding(16.dp))
                return@Column
            }
            LazyVerticalStaggeredGrid(
                columns = StaggeredGridCells.Adaptive(330.dp),
                state = grid,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(14.dp),
                verticalItemSpacing = 14.dp,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                gridItemsIndexed(groups, key = { _, g -> "b${g.first.first}" }) { gi, (range, rows) ->
                    Column {
                        LibraryBar(range, rows.size)
                        rows.forEachIndexed { i, e ->
                            sounds.Line(e, last = i == rows.lastIndex, mark = gi == 0 && i == 0, badge = if (used != null && e.slot in used) project else null)
                        }
                    }
                }
            }
        }
        // The binder's tabs, one per block, on the sheet's right edge.
        Column(
            Modifier.padding(top = 56.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            groups.forEachIndexed { i, (r, _) ->
                BinderTab(r, on = r.first == (inView ?: groups.first().first.first)) { scope.launch { grid.animateScrollToItem(i) } }
            }
        }
    }
}

/** A binder tab: a range ("100–199" over "SNARES") on a cap rounded on its outer side; the one in view is navy and down. */
@Composable
private fun BinderTab(r: IntRange, on: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val kind = FeatureText.factoryCategory(r.first)
    Column(
        Modifier
            .width(80.dp)
            .heightIn(min = 48.dp)
            .cap(if (on) c.navy else c.tabOff, capEdge(if (on) c.navy else c.tabOff), RoundedCornerShape(topEnd = 10.dp, bottomEnd = 10.dp), capPress(on || pressed))
            .clickable(interactionSource = source, indication = null, role = Role.Tab, onClick = onClick)
            .semantics { selected = on }
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(FeatureText.range(r), style = ArcType.capsKeySmall.copy(fontSize = 12.sp), color = if (on) c.onNavy else c.onTabOff, maxLines = 1)
        if (kind != null) Text(kind.uppercase(), style = ArcType.caps.copy(fontSize = 10.sp), color = if (on) c.onNavy.copy(alpha = 0.75f) else c.onTabOff, maxLines = 1)
    }
}

/** The range keys pinned over the phone's list: a key per hundred of slots, scrolling sideways when many. */
@Composable
private fun RangeKeys(ranges: List<IntRange>, on: Int, onPick: (Int) -> Unit, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    Row(
        modifier
            .fillMaxWidth()
            .background(c.shell)
            .horizontalScroll(rememberScrollState())
            .padding(top = 12.dp, bottom = 8.dp, end = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        for (r in ranges) RangeKey(r, on = r.first == on) { onPick(r.first) }
    }
}

/**
 * The dark panel: the free space in large type ("20 MB free of 61 MB"), the
 * meter split into sounds, projects and free, and its legend with the counts.
 */
@Composable
private fun StoragePanel(contents: DeviceContents?, reading: Boolean, modifier: Modifier) {
    val c = LocalArcColors.current
    Box(modifier) {
        DisplayPanel {
            val s = contents?.storage
            if (contents == null || s == null || s.total == 0.0) {
                StorageMeter(0.0, 0.0)
                Text(FeatureText.READING, style = ArcType.displayHint, color = c.displayDim)
                return@DisplayPanel
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(Format.bytes(s.free), style = ArcType.statNum.copy(fontSize = 34.sp), color = c.displayInk)
                Text(FeatureText.freeOf(s.total), style = ArcType.displaySub, color = c.displayDim, modifier = Modifier.weight(1f).padding(bottom = 2.dp))
                if (reading) Text(FeatureText.READING, style = ArcType.displaySub, color = c.displayDim, modifier = Modifier.padding(bottom = 2.dp))
            }
            val projects = contents.projects.sumOf { it.size }.toDouble()
            StorageMeter(s.used / s.total, projects / s.total)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                LegendItem(c.displayInk, FeatureText.sectionLabel(FeatureText.SOUNDS, contents.sounds.size))
                LegendItem(c.signal, FeatureText.sectionLabel(FeatureText.PROJECTS, contents.projects.size))
                LegendItem(c.segmentOff, FeatureText.FREE)
            }
        }
    }
}

/**
 * The 24-segment meter split in two: [used] of the space lit, the last
 * [projects] of it orange (the projects), the rest pale (the sounds, and the
 * little the device keeps for itself).
 */
@Composable
private fun StorageMeter(used: Double, projects: Double, segments: Int = 24) {
    val c = LocalArcColors.current
    fun lit(f: Double) = if (f > 0) (f.coerceIn(0.0, 1.0) * segments).roundToInt().coerceAtLeast(1) else 0
    val all = lit(used)
    val orange = lit(projects).coerceAtMost(all)
    Row(Modifier.fillMaxWidth().height(18.dp).clearAndSetSemantics {}, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        for (i in 0 until segments) {
            val color = when {
                i >= all -> c.segmentOff
                i >= all - orange -> c.signal
                else -> c.displayInk
            }
            Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(color))
        }
    }
}

@Composable
private fun LegendItem(color: Color, text: String) {
    val c = LocalArcColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(2.dp)).background(color))
        Text(text, style = ArcType.small, color = c.displayDim)
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

/** A library block's bar, as the Sample Tool's: the range, its kind of sound in the factory layout (small) and the count. */
@Composable
private fun LibraryBar(range: IntRange, count: Int, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    val kind = FeatureText.factoryCategory(range.first)
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp))
            .background(c.signal)
            .heightIn(min = 40.dp)
            .padding(horizontal = 14.dp)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(FeatureText.range(range), style = ArcType.caps.copy(fontWeight = FontWeight.ExtraBold), color = c.onSignal)
        Text(kind?.uppercase().orEmpty(), style = ArcType.caps, color = c.onSignal.copy(alpha = 0.75f), modifier = Modifier.weight(1f), maxLines = 1)
        Text(count.toString(), style = ArcType.caps, color = c.onSignal)
    }
}

/** What every sound row needs, so the phone's list and the binder draw them alike. */
private class SoundsUi(
    val b: BrowserUi,
    val openSlot: Int?,
    val enabled: Boolean,
    val playing: String?,
    val onPlay: (Int) -> Unit,
    val onStop: () -> Unit,
    val onOpen: (Int) -> Unit,
) {
    @Composable
    fun Line(e: SoundEntry, last: Boolean, mark: Boolean = false, badge: Int? = null) = SoundRow(
        e, b, last = last, mark = mark, badge = badge,
        open = openSlot == e.slot, enabled = enabled,
        playing = playing == "device:${e.slot}",
        onPlay = { onPlay(e.slot) },
        onStop = onStop,
        onClick = { onOpen(e.slot) },
    )
}

/**
 * One sound in a library block, dense: an LED (lit while it plays), the slot,
 * the name in capitals, [badge]'s project ("P3") when it uses the sound, the
 * size and a round play key. The open one is tinted with an orange rule on
 * its left and unfolds its details as chips.
 */
@Composable
private fun SoundRow(
    e: SoundEntry,
    b: BrowserUi,
    last: Boolean,
    mark: Boolean = false,
    badge: Int? = null,
    open: Boolean,
    enabled: Boolean,
    playing: Boolean,
    onPlay: () -> Unit,
    onStop: () -> Unit,
    onClick: () -> Unit,
) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = if (last) 14.dp else 0.dp, bottomEnd = if (last) 14.dp else 0.dp))
            .background(c.plate)
            .background(
                when {
                    open -> c.signal.copy(alpha = 0.16f)
                    pressed -> c.keyEdge.copy(alpha = 0.35f)
                    else -> Color.Transparent
                },
            )
            .drawBehind {
                // A faint line between rows, and the open row's orange rule.
                drawRect(c.line.copy(alpha = 0.12f), size = Size(size.width, 1.dp.toPx()))
                if (open) drawRect(c.signal, size = Size(4.dp.toPx(), size.height))
            }
            // Not while the device is busy: the read it starts would be skipped.
            .clickable(interactionSource = source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { selected = open }
            .padding(start = 14.dp, end = 8.dp, top = 3.dp, bottom = 3.dp),
    ) {
        Row(Modifier.heightIn(min = 46.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(if (playing) c.signal else hw.ledOff))
            Text(FeatureText.slot(e.slot), style = ArcType.bold, color = if (open) c.signal else c.graphite)
            OneLine(e.name.uppercase(), ArcType.bold, c.ink, Modifier.weight(1f))
            if (badge != null) ProjectBadge(badge)
            Text(Format.bytes(e.size), style = ArcType.small, color = c.graphite, maxLines = 1)
            // Downloads the sound (and its details if needed), then plays it on the phone.
            PlayKey(
                playing = playing,
                enabled = enabled,
                description = if (playing) FeatureText.stop(e.name) else FeatureText.play(e.name),
                onClick = { if (playing) onStop() else onPlay() },
                modifier = if (mark) Modifier.coachMark("device.play", CoachText.PLAY, CoachYellow, CoachYellowInk) else Modifier,
            )
        }
        val note = when {
            b.reading == "play:${e.slot}" -> FeatureText.READING
            !open || b.details[e.slot] != null -> null
            b.reading == "slot:${e.slot}" -> FeatureText.READING
            else -> FeatureText.TAP_FOR_DETAILS
        }
        if (note != null) Text(note, style = ArcType.small, color = c.graphite, modifier = Modifier.padding(start = 18.dp, bottom = 8.dp))
        if (open) b.details[e.slot]?.let { DetailChips(it) }
    }
}

/** "P3" on a sound the picked project uses. */
@Composable
private fun ProjectBadge(project: Int) {
    val c = LocalArcColors.current
    Text(
        FeatureText.projectBadge(project),
        style = ArcType.caps.copy(fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.04.em),
        color = c.onSignal,
        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(c.signal).padding(horizontal = 5.dp, vertical = 1.dp),
    )
}

/** An open sound's details as chips: channels, rate, each setting ("Play mode oneshot") and the checksum. */
@Composable
private fun DetailChips(d: SoundDetails) {
    val chips = buildList {
        add(null to FeatureText.channels(d.channels))
        add(null to FeatureText.sampleRate(d.sampleRate))
        for ((k, v) in d.settings) add(FeatureText.settingLabel(k) to FeatureText.settingValue(v))
        add("CRC32" to (d.crc?.let { "%08X".format(it) } ?: FeatureText.NO_CHECKSUM))
    }
    FlowRow(
        Modifier.padding(start = 18.dp, top = 2.dp, bottom = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        for ((k, v) in chips) DetailChip(k, v)
    }
}

/** A pill: a grey label (if any) and its value in bold, or a value alone in grey. */
@Composable
private fun DetailChip(label: String?, value: String) {
    val c = LocalArcColors.current
    Row(
        Modifier.clip(CircleShape).background(c.key).padding(horizontal = 12.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (label == null) {
            Text(value, style = ArcType.small, color = c.graphite)
        } else {
            Text(label, style = ArcType.small, color = c.graphite)
            Text(value, style = ArcType.small.copy(fontWeight = FontWeight.Bold), color = c.ink)
        }
    }
}

/** The project slots in the order of the K.O. II's pads. */
private val PadOrder = listOf(7, 8, 9, 4, 5, 6, 1, 2, 3)

/**
 * The nine project slots as the K.O. II's pads, 7 8 9 / 4 5 6 / 1 2 3, in the
 * grey body: dark keys with their size for the projects there, outlined
 * "empty" keys for the rest, and the picked one orange and held down.
 * [small]: the wide layout's narrower column.
 */
@Composable
private fun ProjectPads(
    projects: List<ProjectEntry>,
    selected: Int?,
    enabled: Boolean,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    small: Boolean = false,
) {
    val hw = LocalHwColors.current
    val byNumber = projects.associateBy { it.project }
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(hw.body)
            .padding(start = 12.dp, top = 12.dp, end = 14.dp, bottom = 15.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        for (row in PadOrder.chunked(3)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (n in row) {
                    ProjectKey(n, byNumber[n], on = n == selected, enabled = enabled, height = if (small) 72.dp else 88.dp, onClick = { onSelect(n) }, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

/** One project slot as a pad: its number top left, its size (or "empty") at the foot. */
@Composable
private fun ProjectKey(n: Int, p: ProjectEntry?, on: Boolean, enabled: Boolean, height: Dp, onClick: () -> Unit, modifier: Modifier) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val shape = RoundedCornerShape(8.dp)
    val (ink, dim) = when {
        p == null -> c.graphite to c.graphite
        on -> c.onSignal to c.onSignal
        else -> hw.darkInk to hw.darkDim
    }
    Column(
        modifier
            .height(height)
            .then(
                if (p == null) {
                    // An empty slot is only its outline: nothing to open.
                    Modifier.border(1.5.dp, c.graphite.copy(alpha = 0.55f), shape)
                } else {
                    Modifier
                        .cap(if (on) c.signal else hw.darkFace, if (on) c.signalEdge else hw.darkEdge, shape, capPress(on || pressed && enabled), alpha = if (enabled || on) 1f else 0.6f)
                        // Not while the device is busy: the read it starts would be skipped.
                        .clickable(interactionSource = source, indication = null, enabled = enabled, onClick = onClick)
                },
            )
            .clearAndSetSemantics {
                contentDescription = Strings.projectLine(n)
                stateDescription = p?.let { Format.bytes(it.size) } ?: FeatureText.EMPTY_PROJECT
                if (p != null) {
                    role = Role.Button
                    selected = on
                    if (enabled) onClick { onClick(); true }
                }
            }
            .padding(start = 10.dp, end = 8.dp, top = 6.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(n.toString(), style = ArcType.semi.copy(fontSize = if (height < 80.dp) 22.sp else 28.sp, lineHeight = 1.2.em), color = ink)
        Text(p?.let { Format.bytes(it.size) } ?: FeatureText.EMPTY_PROJECT, style = if (height < 80.dp) ArcType.tiny else ArcType.small, color = dim, maxLines = 1)
    }
}

/**
 * The picked project: "Project 3" and its size and sound count, the sounds it
 * uses as chips (slot and name; [chips], on the phone, where no list beside it
 * shows them), and its pads.
 */
@Composable
private fun ProjectPanel(p: ProjectEntry, b: BrowserUi, names: Map<Int, String>, chips: Boolean, onPads: () -> Unit) {
    val c = LocalArcColors.current
    val slots = b.projectSounds[p.project]
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(PanelCorner))
            .background(c.plate)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            Text(Strings.projectLine(p.project), style = ArcType.heading, color = c.ink)
            Text(
                if (slots != null) FeatureText.projectSummary(p.size, slots.size) else Format.bytes(p.size),
                style = ArcType.small, color = c.graphite,
            )
        }
        when {
            slots != null && chips -> FlowRow(
                horizontalArrangement = Arrangement.spacedBy(18.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                if (slots.isEmpty()) Text(FeatureText.projectSoundNames(slots, names), style = ArcType.small, color = c.graphite)
                for (s in slots) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(FeatureText.slot(s), style = ArcType.small.copy(fontWeight = FontWeight.Bold), color = c.ink)
                        names[s]?.let { Text(it, style = ArcType.small, color = c.graphite) }
                    }
                }
            }
            slots != null -> {}
            b.reading == "project:${p.project}" -> Text(FeatureText.READING, style = ArcType.small, color = c.graphite)
            else -> Text(FeatureText.TAP_FOR_SOUNDS, style = ArcType.small, color = c.graphite)
        }
        // The pads come from the same download as the sounds.
        if (b.projectPads.containsKey(p.project)) {
            ArcKey(FeatureText.PADS, onPads, Modifier.fillMaxWidth().padding(top = 4.dp), size = KeySize.Small)
        }
    }
}

private val PanelCorner = 18.dp

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
