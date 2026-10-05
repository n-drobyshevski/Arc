package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.text.GuideCombo
import dev.arc.ep133.text.GuideEntry
import dev.arc.ep133.text.GuideText
import dev.arc.ep133.ui.components.ArcField
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.CloseKey
import dev.arc.ep133.ui.components.PlateRadius
import dev.arc.ep133.ui.components.ComboView
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * Key combinations for the EP-133 (an addition to the web version), from
 * teenage engineering's official guide, laid out like a printed guide: one
 * tab per section, each entry's keys drawn as caps with what they do below.
 * Tap an entry for the guide's own wording, a note and the source.
 */
@Composable
fun GuideScreen(
    /** Null on the Guide tab, which has no close key. */
    onBack: (() -> Unit)? = null,
) {
    val c = LocalArcColors.current
    if (onBack != null) BackHandler(onBack = onBack)
    val uri = LocalUriHandler.current
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var query by rememberSaveable { mutableStateOf("") }
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    val searching = query.isNotBlank()
    val sections = remember(query, tab) {
        if (searching) GuideText.filter(query) else listOf(GuideText.sections[tab])
    }
    val list = rememberLazyListState()
    // A new tab starts at its top.
    LaunchedEffect(tab) { list.scrollToItem(0) }

    fun openUrl(url: String) {
        // No browser installed: nothing to open, so do nothing.
        runCatching { uri.openUri(url) }
    }

    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .widthIn(max = 560.dp)
                .fillMaxWidth(),
        ) {
            // Header: the title centred, the close key on the right.
            Box(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 12.dp), contentAlignment = Alignment.Center) {
                Caption(GuideText.HEADER)
                if (onBack != null) CloseKey(onBack, GuideText.CLOSE, Modifier.align(Alignment.CenterEnd))
            }
            // The page: tabs on top, entries below, on the pale key colour.
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp)
                    .clip(RoundedCornerShape(topStart = PlateRadius, topEnd = PlateRadius))
                    .background(c.key),
            ) {
                Tabs(selected = if (searching) -1 else tab, onSelect = {
                    tab = it
                    query = ""
                })
                LazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
                    item(key = "search") {
                        ArcField(GuideText.SEARCH, query, { query = it }, Modifier.padding(horizontal = 20.dp, vertical = 12.dp), background = c.shell)
                    }
                    if (sections.isEmpty()) {
                        item(key = "none") {
                            Text(GuideText.NO_MATCHES, style = ArcType.body15, color = c.graphite, modifier = Modifier.padding(20.dp))
                        }
                    }
                    for (s in sections) {
                        if (searching) {
                            item(key = "t:" + s.title) {
                                Text(
                                    GuideText.tab(s), style = ArcType.small.copy(fontFamily = FontFamily.Monospace), color = c.graphite,
                                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 16.dp),
                                )
                            }
                        }
                        items(s.entries, key = { "e:" + s.title + ":" + it.action }) { e ->
                            val id = s.title + ":" + e.action
                            Entry(e, open = open == id, onClick = { open = if (open == id) null else id }, onSource = { openUrl(e.source) })
                        }
                    }
                    item(key = "footer") {
                        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(GuideText.INTRO, style = ArcType.small, color = c.graphite)
                            Text(GuideText.CHECK_NOTE, style = ArcType.small, color = c.graphite)
                            ArcKey(GuideText.OPEN_OFFICIAL, { openUrl(GuideText.OFFICIAL_URL) }, Modifier.fillMaxWidth())
                        }
                    }
                }
            }
        }
    }
}

/** One tab per section; the selected one is a navy block, like the tabs along the bottom. */
@Composable
private fun Tabs(selected: Int, onSelect: (Int) -> Unit) {
    val c = LocalArcColors.current
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            GuideText.sections.forEachIndexed { i, s ->
                val on = i == selected
                Text(
                    GuideText.tab(s),
                    style = ArcType.small.copy(fontFamily = FontFamily.Monospace, fontSize = 14.sp, letterSpacing = 0.04.em),
                    color = if (on) c.onNavy else c.graphite,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (on) c.navy else Color.Transparent)
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Tab) { onSelect(i) }
                        .semantics { this.selected = on }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.line))
    }
}

@Composable
private fun Entry(e: GuideEntry, open: Boolean, onClick: () -> Unit, onSource: () -> Unit) {
    val c = LocalArcColors.current
    val combo = remember(e.combo) { e.combo?.let(GuideCombo::parse) }
    Column {
        Column(
            Modifier
                .fillMaxWidth()
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClick)
                .padding(horizontal = 20.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (combo != null) {
                ComboView(combo, spoken = e.keys)
            } else {
                // Not drawable as keys (power-up and setup steps): the guide's words instead.
                Text(e.keys, style = ArcType.body15.copy(fontFamily = FontFamily.Monospace), color = c.ink)
            }
            Text(e.action, style = ArcType.body15.copy(fontSize = 18.sp), color = c.graphite)
            if (open) {
                if (combo != null) Text(e.keys, style = ArcType.small.copy(fontFamily = FontFamily.Monospace), color = c.graphite)
                e.note?.let { Text(it, style = ArcType.small, color = c.graphite) }
                Text(
                    GuideText.SOURCE,
                    style = ArcType.small.copy(textDecoration = TextDecoration.Underline),
                    color = c.graphite,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onSource)
                        .padding(vertical = 4.dp),
                )
            }
        }
        Box(Modifier.padding(horizontal = 20.dp).fillMaxWidth().height(1.dp).background(c.keyEdge.copy(alpha = 0.7f)))
    }
}
