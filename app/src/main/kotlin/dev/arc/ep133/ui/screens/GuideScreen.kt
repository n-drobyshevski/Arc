package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.text.GuideCombo
import dev.arc.ep133.text.GuideEntry
import dev.arc.ep133.text.GuideSection
import dev.arc.ep133.text.GuideText
import dev.arc.ep133.text.PanelKeymap
import dev.arc.ep133.ui.components.ArcField
import dev.arc.ep133.ui.components.ArcIcon
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.Chevron
import dev.arc.ep133.ui.components.CloseKey
import dev.arc.ep133.ui.components.ComboLine
import dev.arc.ep133.ui.components.KeymapSteps
import dev.arc.ep133.ui.components.KoAspect
import dev.arc.ep133.ui.components.KoPanel
import dev.arc.ep133.ui.components.LocalArcWindow
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capEdge
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * Key combinations for the EP-133 (an addition to the web version), from
 * teenage engineering's official guide: a search, one tab per section, and a
 * compact row per entry with its keys as small caps. The selected row opens
 * in place with its numbered steps, a note and the source. On a wide window
 * (a tablet on its side) the K.O. II is drawn beside the list with the
 * selected entry's keys lit; a phone keeps to the list.
 */
@Composable
fun GuideScreen(
    /** Null on the Guide tab, which has no close key. */
    onBack: (() -> Unit)? = null,
    /** The entry open at first ([entryId]), for previews. */
    initialOpen: String? = null,
) {
    val c = LocalArcColors.current
    if (onBack != null) BackHandler(onBack = onBack)
    val uri = LocalUriHandler.current
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var query by rememberSaveable { mutableStateOf("") }
    var open by rememberSaveable { mutableStateOf(initialOpen) }
    val searching = query.isNotBlank()
    val found = remember(query) { if (searching) GuideText.filter(query) else null }
    val sections = found ?: listOf(GuideText.sections[tab])
    val total = remember { GuideText.sections.sumOf { it.entries.size } }
    val keymap = remember(open) {
        GuideText.sections.firstNotNullOfOrNull { s -> s.entries.firstOrNull { entryId(s, it) == open } }?.let(PanelKeymap::of)
    }
    val window = LocalArcWindow.current
    // Room for the list and the device side by side, and for the device's height.
    val wide = window.width >= 840.dp && !window.short

    fun openUrl(url: String) {
        // No browser installed: nothing to open, so do nothing.
        runCatching { uri.openUri(url) }
    }

    val list: @Composable (Modifier) -> Unit = { modifier ->
        GuideList(
            modifier = modifier,
            query = query,
            onQuery = { query = it },
            placeholder = GuideText.searchCount(total),
            tab = if (searching) -1 else tab,
            onTab = {
                tab = it
                query = ""
            },
            counts = GuideText.sections.map { s -> if (found == null) s.entries.size else found.firstOrNull { it.title == s.title }?.entries?.size ?: 0 },
            wrapTabs = wide,
            sections = sections,
            searching = searching,
            open = open,
            onOpen = { open = if (open == it) null else it },
            onUrl = ::openUrl,
        )
    }

    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.windowInsetsPadding(WindowInsets.safeDrawing).fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
            // Header: the title centred, the close key on the right.
            Box(
                Modifier.widthIn(max = if (wide) Dp.Unspecified else 560.dp).fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Caption(GuideText.HEADER)
                if (onBack != null) CloseKey(onBack, GuideText.CLOSE, Modifier.align(Alignment.CenterEnd))
            }
            if (wide) {
                BoxWithConstraints(Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, bottom = 16.dp)) {
                    // The device as tall as the room allows, the list taking the rest up to its widest.
                    val device = minOf(maxHeight * KoAspect, maxWidth * 0.55f, 640.dp)
                    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(24.dp, Alignment.CenterHorizontally)) {
                        list(Modifier.weight(1f, fill = false).widthIn(max = 620.dp).fillMaxWidth().fillMaxHeight())
                        KoPanel(keymap, Modifier.width(device))
                    }
                }
            } else {
                list(Modifier.widthIn(max = 560.dp).fillMaxWidth().fillMaxHeight())
            }
        }
    }
}

/** The id an entry is opened by: its section and its action. */
fun entryId(section: GuideSection, entry: GuideEntry): String = section.title + ":" + entry.action

/** The search, the section tabs and the entries, with the footer under them. */
@Composable
private fun GuideList(
    modifier: Modifier,
    query: String,
    onQuery: (String) -> Unit,
    placeholder: String,
    tab: Int,
    onTab: (Int) -> Unit,
    counts: List<Int>,
    wrapTabs: Boolean,
    sections: List<GuideSection>,
    searching: Boolean,
    open: String?,
    onOpen: (String) -> Unit,
    onUrl: (String) -> Unit,
) {
    val c = LocalArcColors.current
    val state = rememberLazyListState()
    // A new tab starts at its top.
    LaunchedEffect(tab) { state.scrollToItem(0) }
    Column(modifier) {
        ArcField(null, query, onQuery, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), placeholder = placeholder, background = c.key, icon = ArcIcon.SEARCH)
        Tabs(tab, counts, wrapTabs, onTab)
        LazyColumn(state = state, modifier = Modifier.fillMaxSize()) {
            if (sections.isEmpty()) {
                item(key = "none") {
                    Text(GuideText.NO_MATCHES, style = ArcType.body15, color = c.graphite, modifier = Modifier.padding(20.dp))
                }
            }
            for (s in sections) {
                if (searching) {
                    item(key = "t:" + s.title) {
                        Caption(GuideText.tab(s), align = TextAlign.Start, modifier = Modifier.padding(start = 30.dp, end = 30.dp, top = 16.dp, bottom = 4.dp))
                    }
                }
                val ids = s.entries.map { entryId(s, it) }
                s.entries.forEachIndexed { i, e ->
                    val id = ids[i]
                    item(key = "e:$id") {
                        // A thin rule between rows, left out around the open one.
                        val rule = i > 0 && open != id && open != ids[i - 1]
                        Entry(e, open = open == id, rule = rule, onClick = { onOpen(id) }, onSource = { onUrl(e.source) })
                    }
                }
            }
            item(key = "footer") {
                Column(Modifier.padding(horizontal = 30.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(GuideText.INTRO, style = ArcType.small, color = c.graphite)
                    Text(GuideText.CHECK_NOTE, style = ArcType.small, color = c.graphite)
                    ArcKey(GuideText.OPEN_OFFICIAL, { onUrl(GuideText.OFFICIAL_URL) }, Modifier.fillMaxWidth())
                }
            }
        }
    }
}

/**
 * One cap per section with its count (the matches while searching); the
 * selected one is navy and down. In a row that scrolls on a phone, wrapped
 * on a wide window.
 */
@Composable
private fun Tabs(selected: Int, counts: List<Int>, wrap: Boolean, onSelect: (Int) -> Unit) {
    val tabs: @Composable () -> Unit = {
        GuideText.sections.forEachIndexed { i, s ->
            SectionTab(GuideText.tab(s), counts[i], i == selected) { onSelect(i) }
        }
    }
    val m = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 8.dp)
    if (wrap) {
        FlowRow(m, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { tabs() }
    } else {
        Row(Modifier.horizontalScroll(rememberScrollState()).then(m), horizontalArrangement = Arrangement.spacedBy(6.dp)) { tabs() }
    }
}

@Composable
private fun SectionTab(label: String, count: Int, on: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val face = if (on) c.navy else c.key
    val ink = if (on) c.onNavy else c.graphite
    Row(
        Modifier
            .padding(end = 2.dp, bottom = 3.dp)
            .cap(face, if (on) capEdge(face) else c.keyEdge, RoundedCornerShape(8.dp), capPress(on || pressed))
            .clickable(interactionSource = source, indication = null, role = Role.Tab, onClick = onClick)
            .semantics { this.selected = on }
            .padding(horizontal = 11.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Text(label, style = ArcType.capsKeySmall.copy(fontSize = 12.sp, fontWeight = FontWeight.ExtraBold), color = ink, maxLines = 1)
        Text(count.toString(), style = ArcType.capsKeySmall.copy(fontSize = 11.sp), color = ink.copy(alpha = 0.6f), maxLines = 1)
    }
}

/**
 * An entry: what it does, then its keys as small caps. Open, it sits on a
 * plate with a signal bar on its left and adds its numbered steps, the note
 * and the source.
 */
@Composable
private fun Entry(e: GuideEntry, open: Boolean, rule: Boolean, onClick: () -> Unit, onSource: () -> Unit) {
    val c = LocalArcColors.current
    val combo = remember(e.combo) { e.combo?.let(GuideCombo::parse) }
    val keymap = remember(e.combo) { PanelKeymap.of(e) }
    val shape = RoundedCornerShape(12.dp)
    Column(
        Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .drawBehind {
                if (rule) drawRect(c.keyEdge.copy(alpha = 0.7f), topLeft = Offset(14.dp.toPx(), 0f), size = Size(size.width - 28.dp.toPx(), 1.dp.toPx()))
            }
            .then(
                if (open) {
                    Modifier.clip(shape).background(c.plate).drawBehind { drawRect(c.signal, size = Size(3.dp.toPx(), size.height)) }
                } else Modifier,
            )
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClick)
            .semantics { selected = open }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(e.action, style = ArcType.body15.copy(fontWeight = FontWeight.SemiBold, lineHeight = 1.35.em), color = c.ink)
        if (combo != null && keymap != null) {
            ComboLine(combo, keymap, spoken = e.keys)
        } else {
            // Not drawable as keys (power-up and setup steps): the guide's words instead.
            Text(e.keys, style = ArcType.tiny, color = c.graphite)
        }
        if (open) {
            if (keymap != null && keymap.steps.isNotEmpty()) KeymapSteps(keymap, Modifier.padding(top = 4.dp))
            e.note?.let { Text(it, style = ArcType.tiny.copy(lineHeight = 1.5.em), color = c.graphite) }
            Row(
                Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onSource)
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(GuideText.SOURCE.uppercase(), style = ArcType.capsKeySmall.copy(fontSize = 12.sp, fontWeight = FontWeight.ExtraBold), color = c.navy)
                Chevron(color = c.navy)
            }
        }
    }
}
