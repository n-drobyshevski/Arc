package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.UiState
import dev.arc.ep133.data.AppSettings
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.SettingsText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.text.ThemeChoice
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.CloseKey
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.Segmented
import dev.arc.ep133.ui.components.SwitchRow
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * The settings (an addition to the web version): theme, connecting, the
 * screen in Live, how many backups to keep, Live's pad numbering and learned
 * names, and about arc.
 */
@Composable
fun SettingsScreen(
    settings: AppSettings,
    state: UiState,
    padOrder: PadOrder,
    version: String,
    onTheme: (ThemeChoice) -> Unit,
    onAutoConnect: (Boolean) -> Unit,
    onKeepScreenOn: (Boolean) -> Unit,
    /** How many backups a new Keep value would delete now. */
    pruneCount: (Int?) -> Int,
    onKeepLast: (Int?) -> Unit,
    onPadOrder: (PadOrder) -> Unit,
    onForgetNames: () -> Unit,
    onRestoreFolder: () -> Unit,
    /** Space taken by Live's copies of the pad sounds. */
    padSoundsSize: suspend () -> Long = { 0L },
    onClearPadSounds: () -> Unit = {},
    onNoteNames: (dev.arc.ep133.features.NoteNames) -> Unit = {},
    onSource: () -> Unit,
    onFontLicence: () -> Unit,
    onDebug: () -> Unit,
    onBack: () -> Unit,
) {
    val c = LocalArcColors.current
    BackHandler(onBack = onBack)
    // The pad order is shown from here on (Live keeps its own copy).
    var order by remember(padOrder) { mutableStateOf(padOrder) }
    // A Keep value that would delete backups, waiting for the confirmation.
    var confirmKeep by rememberSaveable { mutableStateOf<Int?>(null) }
    var confirmForget by rememberSaveable { mutableStateOf(false) }
    // Read when the page opens; Clear sets it to nothing.
    var soundsSize by remember { mutableStateOf<Long?>(null) }
    androidx.compose.runtime.LaunchedEffect(Unit) { soundsSize = padSoundsSize() }

    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Caption(SettingsText.TITLE)
                CloseKey(onBack, SettingsText.CLOSE, Modifier.align(Alignment.CenterEnd))
            }

            Section(SettingsText.APPEARANCE)
            Label(SettingsText.THEME)
            Segmented(
                ThemeChoice.entries.map(SettingsText::theme),
                selected = settings.theme.ordinal,
                onSelect = { onTheme(ThemeChoice.entries[it]) },
            )

            Section(SettingsText.DEVICE)
            GridPlate {
                SwitchRow(SettingsText.AUTO_CONNECT, SettingsText.AUTO_CONNECT_NOTE, settings.autoConnect, onAutoConnect)
                PlateLine()
                SwitchRow(SettingsText.KEEP_SCREEN_ON, SettingsText.KEEP_SCREEN_ON_NOTE, settings.keepScreenOn, onKeepScreenOn)
            }

            Section(SettingsText.LIBRARY)
            val note = Strings.storageNote(state.backups.size, state.backups.sumOf { it.size }, state.spaceLeft)
            if (note.isNotEmpty()) Text(note, style = ArcType.small, color = c.graphite)
            Text(FeatureText.FOLDER_NOTE, style = ArcType.small, color = c.graphite)
            ArcKey(FeatureText.RESTORE_FOLDER, onRestoreFolder, Modifier.fillMaxWidth(), size = KeySize.Small)
            Label(SettingsText.KEEP)
            Segmented(
                SettingsText.KEEP_CHOICES.map(SettingsText::keepLabel),
                selected = SettingsText.KEEP_CHOICES.indexOf(settings.keepLast).coerceAtLeast(0),
                onSelect = { i ->
                    val keep = SettingsText.KEEP_CHOICES[i]
                    // Fewer than are saved now deletes the oldest: ask first.
                    if (keep != null && pruneCount(keep) > 0) confirmKeep = keep else onKeepLast(keep)
                },
            )
            Text(SettingsText.KEEP_NOTE, style = ArcType.small, color = c.graphite)

            Section(SettingsText.LIVE)
            Label(MirrorText.PAD_ORDER)
            Segmented(
                listOf(MirrorText.FROM_TOP, MirrorText.FROM_BOTTOM),
                selected = order.ordinal,
                onSelect = { i ->
                    order = PadOrder.entries[i]
                    onPadOrder(order)
                },
            )
            Text(MirrorText.ORDER_NOTE, style = ArcType.small, color = c.graphite)
            Label(MirrorText.NOTE_NAMES)
            Segmented(
                dev.arc.ep133.features.NoteNames.entries.map(MirrorText::noteNames),
                selected = settings.keysNames.ordinal,
                onSelect = { onNoteNames(dev.arc.ep133.features.NoteNames.entries[it]) },
            )
            Text(MirrorText.NOTE_NAMES_NOTE, style = ArcType.small, color = c.graphite)
            ArcKey(SettingsText.FORGET_NAMES, { confirmForget = true }, Modifier.fillMaxWidth(), size = KeySize.Small)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    SettingsText.padSounds(dev.arc.ep133.text.Format.bytes(soundsSize ?: 0L)),
                    style = ArcType.body15,
                    color = c.ink,
                    modifier = Modifier.weight(1f),
                )
                ArcKey(
                    SettingsText.CLEAR,
                    {
                        onClearPadSounds()
                        soundsSize = 0L
                    },
                    size = KeySize.Small,
                    enabled = (soundsSize ?: 0L) > 0L,
                )
            }
            Text(SettingsText.PAD_SOUNDS_NOTE, style = ArcType.small, color = c.graphite)

            Section(SettingsText.ABOUT)
            Text(SettingsText.version(version), style = ArcType.bold, color = c.ink)
            Text(SettingsText.LICENCE_NOTE, style = ArcType.small, color = c.graphite)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ArcKey(SettingsText.SOURCE, onSource, Modifier.weight(1f), size = KeySize.Small)
                ArcKey(SettingsText.FONT_LICENCE, onFontLicence, Modifier.weight(1f), size = KeySize.Small)
            }
            ArcKey(SettingsText.DEBUG_LOG, onDebug, Modifier.fillMaxWidth(), size = KeySize.Small, style = KeyStyle.Quiet)
        }
    }

    confirmKeep?.let { keep ->
        Confirm(
            text = SettingsText.pruneConfirm(pruneCount(keep)),
            action = SettingsText.PRUNE,
            onConfirm = {
                confirmKeep = null
                onKeepLast(keep)
            },
            onDismiss = { confirmKeep = null },
        )
    }
    if (confirmForget) {
        Confirm(
            text = SettingsText.FORGET_CONFIRM,
            action = SettingsText.FORGET,
            onConfirm = {
                confirmForget = false
                onForgetNames()
            },
            onDismiss = { confirmForget = false },
        )
    }
}

@Composable
private fun Section(text: String) {
    Caption(text, Modifier.padding(top = 18.dp), align = TextAlign.Start)
}

@Composable
private fun Label(text: String) {
    Text(text, style = ArcType.semi, color = LocalArcColors.current.ink)
}

@Composable
private fun Confirm(text: String, action: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val c = LocalArcColors.current
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = c.shell,
        text = { Text(text, style = ArcType.body15, color = c.ink) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(action, style = ArcType.bold, color = c.danger) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(Strings.CANCEL, style = ArcType.bold, color = c.graphite) } },
    )
}
