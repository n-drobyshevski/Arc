package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import dev.arc.ep133.text.GuideEntry
import dev.arc.ep133.text.GuideText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcField
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * Key combinations for the EP-133 (an addition to the web version), from
 * teenage engineering's official guide. Tap an entry for its note and source.
 */
@Composable
fun GuideScreen(onBack: () -> Unit) {
    val c = LocalArcColors.current
    BackHandler(onBack = onBack)
    val uri = LocalUriHandler.current
    var query by rememberSaveable { mutableStateOf("") }
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    val sections = remember(query) { GuideText.filter(query) }

    fun openUrl(url: String) {
        // No browser installed: nothing to open, so do nothing.
        runCatching { uri.openUri(url) }
    }

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
                    Text(GuideText.TITLE, style = ArcType.heading, color = c.ink, modifier = Modifier.weight(1f))
                    ArcKey(Strings.DONE, onBack, size = KeySize.Small, style = KeyStyle.Quiet)
                }
            }
            item { Text(GuideText.INTRO, style = ArcType.body15, color = c.graphite) }
            item { Text(GuideText.CHECK_NOTE, style = ArcType.small, color = c.graphite) }
            item { ArcKey(GuideText.OPEN_OFFICIAL, { openUrl(GuideText.OFFICIAL_URL) }, Modifier.fillMaxWidth()) }
            item { ArcField(GuideText.SEARCH, query, { query = it }) }
            if (sections.isEmpty()) item { Text(GuideText.NO_MATCHES, style = ArcType.body15, color = c.graphite) }
            for (s in sections) {
                item(key = "t:" + s.title) { SectionTitle(s.title, s.entries.size) }
                items(s.entries, key = { "e:" + s.title + ":" + it.action }) { e ->
                    val id = s.title + ":" + e.action
                    GuideRow(e, open = open == id, onClick = { open = if (open == id) null else id }, onSource = { openUrl(e.source) })
                }
            }
        }
    }
}

@Composable
private fun GuideRow(e: GuideEntry, open: Boolean, onClick: () -> Unit, onSource: () -> Unit) {
    val c = LocalArcColors.current
    Plate(onClick, enabled = true) {
        Text(e.action, style = ArcType.bold, color = c.ink)
        // The keys on the dark display colours, like the device's own screen.
        Text(
            e.keys,
            style = ArcType.small,
            color = c.displayInk,
            modifier = Modifier
                .padding(top = 2.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(c.display)
                .padding(vertical = 4.dp, horizontal = 8.dp),
        )
        if (open) {
            e.note?.let { Text(it, style = ArcType.small, color = c.graphite, modifier = Modifier.padding(top = 4.dp)) }
            Text(
                GuideText.SOURCE,
                style = ArcType.small.copy(textDecoration = TextDecoration.Underline),
                color = c.graphite,
                modifier = Modifier
                    .padding(top = 2.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onSource)
                    .padding(vertical = 4.dp),
            )
        }
    }
}
