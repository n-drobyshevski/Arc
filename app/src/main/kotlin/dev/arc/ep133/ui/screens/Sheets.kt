package dev.arc.ep133.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Spacer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.DiffUi
import dev.arc.ep133.controller.TaskUi
import dev.arc.ep133.features.DiffResult
import dev.arc.ep133.features.ProjectState
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.LibraryRules
import dev.arc.ep133.text.RestoreSelection
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcField
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.ChoiceRow
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.ProgressMeter
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/** The two-column action grid of a sheet; signal and quiet keys span both columns. */
@Composable
private fun Actions(content: ActionsScope.() -> Unit) {
    val scope = ActionsScope().apply(content)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        var pending: (@Composable (Modifier) -> Unit)? = null
        for ((wide, key) in scope.keys) {
            if (wide) {
                pending?.let { p -> Row(Modifier.fillMaxWidth()) { p(Modifier.weight(1f)) } }
                pending = null
                key(Modifier.fillMaxWidth())
            } else if (pending == null) {
                pending = key
            } else {
                val first = pending
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    first(Modifier.weight(1f))
                    key(Modifier.weight(1f))
                }
                pending = null
            }
        }
        pending?.let { p -> Row(Modifier.fillMaxWidth()) { p(Modifier.weight(1f)) } }
    }
}

private class ActionsScope {
    val keys = ArrayList<Pair<Boolean, @Composable (Modifier) -> Unit>>()
    fun wide(k: @Composable (Modifier) -> Unit) = keys.add(true to k)
    fun half(k: @Composable (Modifier) -> Unit) = keys.add(false to k)
}

/** The detail sheet's body (`#detail-sheet`). Title and notes are saved when the sheet closes. */
@Composable
fun ColumnScope.DetailSheetContent(
    b: BackupRecord,
    title: String,
    onTitle: (String) -> Unit,
    notes: String,
    onNotes: (String) -> Unit,
    madeText: String,
    canRestore: Boolean,
    connected: Boolean,
    onRestore: () -> Unit,
    onShare: () -> Unit,
    onSave: () -> Unit,
    onDelete: () -> Unit,
    onDone: () -> Unit,
    onContents: () -> Unit = {},
) {
    val c = LocalArcColors.current
    ArcField(Strings.NAME, title, onTitle, maxLength = 80)
    // Facts: grid-template-columns: auto 1fr, so the label column is as wide as the widest label.
    val facts = LibraryRules.facts(b, madeText)
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val labelWidth = with(density) { facts.maxOfOrNull { measurer.measure(it.first, ArcType.body15).size.width }?.toDp() ?: 0.dp }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for ((k, v) in facts) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(k, style = ArcType.body15, color = c.graphite, modifier = Modifier.width(labelWidth))
                Text(v, style = ArcType.body15.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = c.ink, modifier = Modifier.weight(1f))
            }
        }
    }
    if (b.projects.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (n in b.projects) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(c.key)
                        .padding(vertical = 10.dp, horizontal = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(Strings.projectLine(n), style = ArcType.body15.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink)
                    Text(LibraryRules.projectSoundsDetail(b, n), style = ArcType.body15, color = c.graphite)
                }
            }
        }
    }
    ArcField(Strings.NOTES, notes, onNotes, singleLine = false, minLines = 3, placeholder = Strings.NOTES_PLACEHOLDER)
    Actions {
        wide { m ->
            ArcKey(
                if (connected) Strings.RESTORE_TO_DEVICE else Strings.CONNECT_TO_RESTORE,
                onRestore, m, style = KeyStyle.Signal, enabled = canRestore,
            )
        }
        half { m -> ArcKey(Strings.SHARE, onShare, m) }
        half { m -> ArcKey(Strings.SAVE_PAK, onSave, m) }
        // Addition to the web version: play and export what is inside.
        wide { m -> ArcKey(FeatureText.CONTENTS, onContents, m) }
        wide { m -> ArcKey(Strings.DELETE, onDelete, m, style = KeyStyle.Quiet, textColor = c.danger) }
    }
    Text(
        Strings.DONE,
        style = ArcType.bold,
        color = c.graphite,
        modifier = Modifier
            .align(Alignment.CenterHorizontally)
            .clip(RoundedCornerShape(8.dp))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onDone)
            .semantics { contentDescription = Strings.CLOSE }
            .padding(vertical = 8.dp, horizontal = 16.dp),
    )
}

@Composable
fun DeleteDialog(title: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val c = LocalArcColors.current
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = c.shell,
        text = { Text(Strings.deleteConfirm(title), style = ArcType.body15, color = c.ink) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(Strings.DELETE, style = ArcType.bold, color = c.danger) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(Strings.CANCEL, style = ArcType.bold, color = c.graphite) } },
    )
}

/** The restore sheet (`#restore-sheet`). */
@Composable
fun ColumnScope.RestoreSheetContent(
    b: BackupRecord,
    onRestore: (RestoreSelection) -> Unit,
    onCancel: () -> Unit,
    diff: DiffUi? = null,
    canCompare: Boolean = false,
    onCompare: (RestoreSelection) -> Unit = {},
) {
    val c = LocalArcColors.current
    var everything by rememberSaveable(b.id) { mutableStateOf(true) }
    var other by rememberSaveable(b.id) { mutableStateOf(false) }
    // Saved across rotation; the sheet resets to defaults each time it opens (openRestore).
    var picked by rememberSaveable(b.id) { mutableStateOf(b.projects.toList()) }
    // Checked projects in display order.
    val sel = LibraryRules.restoreSelection(b, everything, b.projects.filter { it in picked }, other)

    Text(Strings.RESTORE_TO_DEVICE, style = ArcType.heading, color = c.ink)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ChoiceRow(Strings.EVERYTHING, everything, { everything = true }, radio = true)
        ChoiceRow(Strings.PICK_PROJECTS, !everything, { everything = false }, radio = true)
    }
    Column(
        Modifier.padding(start = 4.dp).alpha(if (everything) 0.45f else 1f),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // #restore-projects is a plain block: its rows stack without gaps.
        Column {
            for (n in b.projects) {
                ChoiceRow(
                    Strings.projectLine(n),
                    n in picked,
                    { picked = if (n in picked) picked - n else picked + n },
                    radio = false,
                    enabled = !everything,
                    trailing = LibraryRules.projectSoundsRestore(b, n),
                )
            }
        }
        ChoiceRow(Strings.ALSO_OTHER_SOUNDS, other, { other = !other }, radio = false, enabled = !everything)
    }
    val warning = LibraryRules.restoreWarning(sel)
    // An empty <p> takes no height.
    if (warning.isNotEmpty()) Text(warning, style = ArcType.small, color = c.graphite) else Spacer(Modifier)
    // Addition to the web version: what this restore would change on the device.
    // A result only shows while it matches the current selection.
    val shown = diff?.takeIf { it.backupId == b.id && it.selection == sel }
    if (shown != null) DiffResultView(shown.result)
    Actions {
        wide { m -> ArcKey(LibraryRules.restoreButton(sel), { onRestore(sel) }, m, style = KeyStyle.Signal, enabled = LibraryRules.canRestore(sel)) }
        if (canCompare && shown == null) {
            wide { m -> ArcKey(FeatureText.COMPARE, { onCompare(sel) }, m, enabled = LibraryRules.canRestore(sel)) }
        }
        wide { m -> ArcKey(Strings.CANCEL, onCancel, m, style = KeyStyle.Quiet) }
    }
}

@Composable
private fun DiffResultView(r: DiffResult) {
    val c = LocalArcColors.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(c.key)
            .padding(vertical = 12.dp, horizontal = 14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(FeatureText.diffSummary(r), style = ArcType.semi, color = c.ink)
        for (d in r.sounds.filter { !it.unchanged }) {
            Column {
                Text("Sound ${FeatureText.slot(d.slot)}, ${d.backupName}", style = ArcType.small.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink)
                Text(FeatureText.soundState(d), style = ArcType.small, color = c.graphite)
            }
        }
        for (p in r.projects.filter { it.state != ProjectState.SAME }) {
            Column {
                Text(Strings.projectLine(p.project), style = ArcType.small.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.ink)
                Text(FeatureText.projectState(p.state), style = ArcType.small, color = c.graphite)
            }
        }
        val untouched = FeatureText.untouched(r)
        if (untouched.isNotEmpty()) Text(untouched, style = ArcType.small, color = c.graphite)
    }
}

/** The progress sheet (`#progress-sheet`). It cannot be dismissed; Cancel stops after the current item. */
@Composable
fun ColumnScope.ProgressSheetContent(task: TaskUi, onCancel: () -> Unit) {
    val c = LocalArcColors.current
    Text(task.title, style = ArcType.heading, color = c.ink)
    ProgressMeter(task.fraction)
    Text(
        task.label,
        style = ArcType.bold,
        color = c.ink,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.heightIn(min = 24.dp),
    )
    Text(Strings.KEEP_SCREEN_ON, style = ArcType.small, color = c.graphite)
    ArcKey(Strings.CANCEL, onCancel, Modifier.fillMaxWidth(), style = KeyStyle.Quiet, enabled = !task.cancelling)
}
