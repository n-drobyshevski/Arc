package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.SearchUi
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcField
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * Finds sounds by name in every saved backup (an addition to the web
 * version). Tapping a result opens that backup's contents, where it plays.
 */
@Composable
fun SearchScreen(
    search: SearchUi,
    fmtDay: (Long) -> String,
    onQuery: (String) -> Unit,
    onOpen: (BackupRecord) -> Unit,
    onBack: () -> Unit,
) {
    val c = LocalArcColors.current
    BackHandler(onBack = onBack)
    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        LazyColumn(
            Modifier
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .widthIn(max = 560.dp)
                .fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(FeatureText.SEARCH_SOUNDS, style = ArcType.heading, color = c.ink, modifier = Modifier.weight(1f))
                    ArcKey(Strings.DONE, onBack, size = KeySize.Small, style = KeyStyle.Quiet)
                }
            }
            item { ArcField(FeatureText.SEARCH, search.query, onQuery) }
            if (search.indexing) item { Text(FeatureText.INDEXING, style = ArcType.small, color = c.graphite) }
            when {
                search.query.isBlank() -> item { Text(FeatureText.SEARCH_HINT, style = ArcType.body15, color = c.graphite) }
                search.results.isEmpty() -> item { Text(FeatureText.NO_SOUND_MATCHES, style = ArcType.body15, color = c.graphite) }
            }
            for (g in search.results) {
                item(key = "g:" + g.backup.id) {
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OneLine(g.backup.title, ArcType.bold, c.ink, Modifier.weight(1f))
                        Text(fmtDay(g.backup.createdAt), style = ArcType.small, color = c.graphite)
                    }
                }
                items(g.hits, key = { "h:" + g.backup.id + ":" + it.slot }) { hit ->
                    Plate(onClick = { onOpen(g.backup) }, enabled = true) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(FeatureText.slot(hit.slot), style = ArcType.bold, color = c.graphite)
                            OneLine(hit.name, ArcType.bold, c.ink, Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}
