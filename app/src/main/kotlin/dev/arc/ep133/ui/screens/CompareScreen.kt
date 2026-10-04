package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.PakCompareUi
import dev.arc.ep133.features.ChangeKind
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/** Picks the second backup to compare with (an addition to the web version). */
@Composable
fun ColumnScope.ComparePickerContent(
    others: List<BackupRecord>,
    fmtDay: (Long) -> String,
    onPick: (BackupRecord) -> Unit,
    onCancel: () -> Unit,
) {
    val c = LocalArcColors.current
    Text(FeatureText.PICK_OTHER, style = ArcType.heading, color = c.ink)
    BackupList(others, freshId = null, fmtDay = fmtDay, onOpen = onPick)
    ArcKey(Strings.CANCEL, onCancel, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
}

/**
 * What changed between two saved backups, older to newer: sounds and
 * projects added, removed and changed, and the pads a changed project moved.
 */
@Composable
fun CompareScreen(
    old: BackupRecord,
    new: BackupRecord,
    compare: PakCompareUi?,
    fmtDay: (Long) -> String,
    onBack: () -> Unit,
) {
    val c = LocalArcColors.current
    BackHandler(onBack = onBack)
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
                    Text(FeatureText.COMPARE_BACKUPS, style = ArcType.heading, color = c.ink, modifier = Modifier.weight(1f))
                    ArcKey(Strings.DONE, onBack, size = KeySize.Small, style = KeyStyle.Quiet)
                }
            }
            item {
                Text(
                    FeatureText.compareHeader(old.title, fmtDay(old.createdAt), new.title, fmtDay(new.createdAt)),
                    style = ArcType.body15, color = c.graphite,
                )
            }
            val r = compare?.result
            when {
                compare?.error != null -> {
                    item { Text(compare.error, style = ArcType.body15, color = c.danger) }
                    return@LazyColumn
                }
                r == null -> {
                    item { Text(FeatureText.COMPARING_BACKUPS, style = ArcType.body15, color = c.graphite) }
                    return@LazyColumn
                }
                r.nothingChanged -> item { Text(FeatureText.NOTHING_CHANGED, style = ArcType.body15, color = c.ink) }
            }
            r!!
            fun sounds(kind: ChangeKind) = r.sounds.filter { it.kind == kind }
            fun projects(kind: ChangeKind) = r.projects.filter { it.kind == kind }

            section(FeatureText.SOUNDS_ADDED, sounds(ChangeKind.ADDED), { "sa${it.slot}" }) {
                Line(FeatureText.slot(it.slot), it.newName.orEmpty(), null)
            }
            section(FeatureText.SOUNDS_REMOVED, sounds(ChangeKind.REMOVED), { "sr${it.slot}" }) {
                Line(FeatureText.slot(it.slot), it.oldName.orEmpty(), null)
            }
            section(FeatureText.SOUNDS_CHANGED, sounds(ChangeKind.CHANGED), { "sc${it.slot}" }) {
                Line(FeatureText.slot(it.slot), it.newName.orEmpty(), listOf(FeatureText.soundChange(it)))
            }
            section(FeatureText.PROJECTS_ADDED, projects(ChangeKind.ADDED), { "pa${it.project}" }) {
                Line(null, Strings.projectLine(it.project), null)
            }
            section(FeatureText.PROJECTS_REMOVED, projects(ChangeKind.REMOVED), { "pr${it.project}" }) {
                Line(null, Strings.projectLine(it.project), null)
            }
            section(FeatureText.PROJECTS_CHANGED, projects(ChangeKind.CHANGED), { "pc${it.project}" }) { p ->
                val lines = if (p.padChanges.isEmpty()) {
                    listOf(FeatureText.PATTERNS_CHANGED)
                } else {
                    p.padChanges.map { pc ->
                        FeatureText.padChange(pc, pc.oldSlot?.let { compare.oldNames[it] }, pc.newSlot?.let { compare.newNames[it] })
                    }
                }
                Line(null, Strings.projectLine(p.project), lines)
            }
            val unchanged = FeatureText.unchanged(r.sameSounds, r.sameProjects)
            if (unchanged.isNotEmpty() && !r.nothingChanged) {
                item { Text(unchanged, style = ArcType.small, color = c.graphite) }
            }
        }
    }
}

private fun <T> LazyListScope.section(title: String, rows: List<T>, key: (T) -> String, row: @Composable (T) -> Unit) {
    if (rows.isEmpty()) return
    item(key = "t:$title") { SectionTitle(title, rows.size) }
    items(rows, key = key) { row(it) }
    item(key = "s:$title") { Box(Modifier.height(4.dp)) }
}

@Composable
private fun Line(slot: String?, name: String, details: List<String>?) {
    val c = LocalArcColors.current
    Plate(onClick = null, enabled = false) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (slot != null) Text(slot, style = ArcType.bold, color = c.graphite)
            OneLine(name, ArcType.bold, c.ink, Modifier.weight(1f))
        }
        details?.forEach { Text(it, style = ArcType.small, color = c.graphite) }
    }
}
