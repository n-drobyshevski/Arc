package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.arc.ep133.backup.PakExport
import dev.arc.ep133.backup.PakSound
import dev.arc.ep133.controller.ContentsUi
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Format
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * What is inside a saved backup (an addition to the web version): its sounds,
 * which play on the phone and export as WAV files, and its projects, which
 * export as their own .pak with the sounds they use. No device needed.
 */
@Composable
fun ContentsScreen(
    b: BackupRecord,
    contents: ContentsUi?,
    playing: String?,
    onPlay: (Int) -> Unit,
    onStop: () -> Unit,
    onShareWav: (PakSound) -> Unit,
    onSaveWav: (PakSound) -> Unit,
    onShareProject: (Int) -> Unit,
    onSaveProject: (Int) -> Unit,
    onBack: () -> Unit,
    onPads: (Int) -> Unit = {},
) {
    val c = LocalArcColors.current
    BackHandler(onBack = onBack)
    var openSlot by rememberSaveable { mutableStateOf<Int?>(null) }
    var openProject by rememberSaveable { mutableStateOf<Int?>(null) }
    val pak = contents?.pak

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
                    OneLine(b.title, ArcType.heading, c.ink, Modifier.weight(1f))
                    ArcKey(Strings.DONE, onBack, size = KeySize.Small, style = KeyStyle.Quiet)
                }
            }
            when {
                contents?.error != null -> {
                    item { Text(contents.error, style = ArcType.body15, color = c.danger) }
                    return@LazyColumn
                }
                pak == null -> {
                    item { Text(FeatureText.OPENING, style = ArcType.body15, color = c.graphite) }
                    return@LazyColumn
                }
            }
            val sounds = pak.sounds.values.sortedBy { it.slot }
            item { SectionTitle(FeatureText.SOUNDS, sounds.size) }
            if (sounds.isEmpty()) item { Text(FeatureText.NO_SOUNDS_IN_BACKUP, style = ArcType.body15, color = c.graphite) }
            items(sounds, key = { "s${it.slot}" }) { snd ->
                val key = "backup:${b.id}:${snd.slot}"
                val isPlaying = playing == key
                val open = openSlot == snd.slot
                Plate(onClick = { openSlot = if (open) null else snd.slot }, enabled = true) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(FeatureText.slot(snd.slot), style = ArcType.bold, color = c.graphite)
                        OneLine(snd.name, ArcType.bold, c.ink, Modifier.weight(1f))
                        val d = contents.durations[snd.slot]
                        Text(if (d != null) FeatureText.duration(d) else Format.bytes(snd.wav.size.toDouble()), style = ArcType.small, color = c.graphite)
                        ArcKey(
                            if (isPlaying) FeatureText.STOP else FeatureText.PLAY,
                            { if (isPlaying) onStop() else onPlay(snd.slot) },
                            size = KeySize.Small,
                            enabled = d != null,
                        )
                    }
                    if (open) {
                        Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            ArcKey(FeatureText.SHARE_WAV, { onShareWav(snd) }, Modifier.weight(1f), size = KeySize.Small)
                            ArcKey(FeatureText.SAVE_WAV, { onSaveWav(snd) }, Modifier.weight(1f), size = KeySize.Small)
                        }
                    }
                }
            }
            item { Box(Modifier.height(6.dp)) }
            val projects = pak.projects.keys.sorted()
            item { SectionTitle(FeatureText.PROJECTS, projects.size) }
            if (projects.isEmpty()) {
                item { Text(FeatureText.NO_PROJECTS_IN_BACKUP, style = ArcType.body15, color = c.graphite) }
            } else {
                item { Text(FeatureText.EXPORT_HINT, style = ArcType.small, color = c.graphite) }
            }
            items(projects, key = { "p$it" }) { n ->
                val open = openProject == n
                Plate(onClick = { openProject = if (open) null else n }, enabled = true) {
                    Text(Strings.projectLine(n), style = ArcType.bold, color = c.ink)
                    val slots = runCatching { PakExport.projectSlots(pak, n) }.getOrDefault(emptyList())
                    Text(FeatureText.projectUses(slots), style = ArcType.small, color = c.graphite)
                    if (open) {
                        ArcKey(FeatureText.PADS, { onPads(n) }, Modifier.fillMaxWidth().padding(top = 6.dp), size = KeySize.Small)
                        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            ArcKey(FeatureText.SHARE_PROJECT, { onShareProject(n) }, Modifier.weight(1f), size = KeySize.Small)
                            ArcKey(FeatureText.SAVE_PROJECT, { onSaveProject(n) }, Modifier.weight(1f), size = KeySize.Small)
                        }
                    }
                }
            }
        }
    }
}
