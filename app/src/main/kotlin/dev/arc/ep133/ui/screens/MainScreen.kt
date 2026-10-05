package dev.arc.ep133.ui.screens

import dev.arc.ep133.ui.components.EdgeTabWidth
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.ui.components.CoachYellowInk
import dev.arc.ep133.ui.components.CoachYellow
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.components.ArcIcon
import dev.arc.ep133.ui.components.IconBlock
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.rememberTextMeasurer
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.UiState
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Format
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.text.NavText
import dev.arc.ep133.ui.components.DashedBox
import dev.arc.ep133.ui.components.DisplayPanel
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.Meter
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.components.describe
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.BaseText
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * The Backups tab (index.html .app): the device panel and the library. The
 * header's keys live in the top bar now.
 */
@Composable
fun MainScreen(
    state: UiState,
    fmtDay: (Long) -> String,
    onBackup: () -> Unit,
    onImport: () -> Unit,
    onOpen: (BackupRecord) -> Unit,
    onSearch: () -> Unit = {},
    onRestoreFolder: () -> Unit = {},
) {
    val c = LocalArcColors.current
    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .windowInsetsPadding(WindowInsets.safeDrawing)
                // The left gutter keeps clear of the guide tab on the edge.
                .padding(start = EdgeTabWidth + 8.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Caption(NavText.DEVICE_CAPTION)
            DevicePanel(state)

            // The top bar's Back up block does this too; the big key stays until the first backup.
            if (state.backups.isEmpty()) {
                ArcKey(
                    Strings.BACK_UP,
                    onBackup,
                    modifier = Modifier.fillMaxWidth(),
                    style = KeyStyle.Signal,
                    size = KeySize.Wide,
                    enabled = state.midiSupported && state.device != null && !state.busy,
                )
            }

            Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // The caption with its tools as icons (named on long-press and in the guide overlay).
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Caption(Strings.BACKUPS, Modifier.weight(1f), align = androidx.compose.ui.text.style.TextAlign.Start)
                    // Addition to the web version: find sounds across backups.
                    if (state.backups.isNotEmpty()) {
                        IconBlock(
                            ArcIcon.SEARCH, CoachText.SEARCH, c.tabOff, c.navy, onSearch,
                            Modifier.coachMark("backups.search", CoachText.SEARCH, c.navy, c.onNavy),
                        )
                    }
                    IconBlock(
                        ArcIcon.IMPORT, CoachText.IMPORT, c.tabOff, c.navy, onImport,
                        Modifier.coachMark("backups.import", CoachText.IMPORT, c.navy, c.onNavy),
                    )
                }
                if (state.backups.isNotEmpty()) {
                    BackupList(state.backups, state.freshId, fmtDay, onOpen, Modifier.coachMark("backups.open", CoachText.OPEN_BACKUP, CoachYellow, CoachYellowInk))
                } else if (state.libraryLoaded) {
                    // #empty starts hidden and only shows once the library has loaded.
                    DashedBox {
                        Text(Strings.EMPTY_TITLE, style = ArcType.bold, color = c.ink)
                        Text(Strings.EMPTY_TEXT, style = BaseText, color = c.graphite)
                    }
                    // Addition: a reinstalled arc can read its library back from Documents/arc.
                    Text(FeatureText.RESTORE_HINT, style = ArcType.small, color = c.graphite)
                    ArcKey(FeatureText.RESTORE_FOLDER, onRestoreFolder, modifier = Modifier.fillMaxWidth())
                }
                val totalSize = state.backups.sumOf { it.size }
                val note = Strings.storageNote(state.backups.size, totalSize, state.spaceLeft)
                if (note.isNotEmpty()) Text(note, style = ArcType.tiny, color = c.graphite)
                if (state.backups.isNotEmpty()) {
                    Text(FeatureText.FOLDER_NOTE, style = ArcType.tiny, color = c.graphite)
                    // Until the folder is picked, a reinstalled arc can still bring older backups back.
                    if (!state.folderPicked) ArcKey(FeatureText.RESTORE_FOLDER, onRestoreFolder, size = KeySize.Small, style = KeyStyle.Quiet)
                }
            }

            Text(Strings.FOOTER, style = ArcType.tiny, color = c.graphite, modifier = Modifier.padding(vertical = 8.dp, horizontal = 2.dp))
        }
    }
}

@Composable
private fun DevicePanel(state: UiState) {
    val c = LocalArcColors.current
    val d = state.device
    val title: String
    val sub: String
    val hint: String?
    var fraction = 0.0
    var meterText = ""
    when {
        !state.midiSupported -> {
            title = Strings.NO_MIDI_TITLE
            sub = ""
            hint = Strings.NO_MIDI_HINT
        }
        d == null -> {
            title = if (state.connected) Strings.READING_DEVICE else Strings.NO_DEVICE
            sub = ""
            hint = if (state.connected) Strings.ONE_MOMENT else Strings.PLUG_IN_HINT
        }
        else -> {
            title = d.info.product.ifEmpty { "EP-133" }
            sub = Strings.osVersion(d.info.osVersion)
            hint = null
            fraction = if (d.storage.total != 0.0) d.storage.used / d.storage.total else 0.0
            meterText = Strings.meterDescription(d.storage.used, d.storage.total)
        }
    }
    DisplayPanel {
        // .display-head: space-between, aligned on the text baseline
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = ArcType.displayHead, color = c.displayInk, modifier = Modifier.weight(1f).alignByBaseline())
            if (sub.isNotEmpty()) Text(sub, style = ArcType.displaySub, color = c.displayDim, modifier = Modifier.alignByBaseline())
        }
        Meter(fraction, modifier = Modifier.describe(meterText))
        if (hint != null) {
            // .display-hint { max-width: 34ch }: 34 widths of "0" in this font and size
            val measurer = rememberTextMeasurer()
            val density = LocalDensity.current
            val maxW = with(density) { (measurer.measure("0", ArcType.displayHint).size.width * 34).toDp() }
            Text(hint, style = ArcType.displayHint, color = c.displayDim, modifier = Modifier.widthIn(max = maxW))
        } else if (d != null) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.Bottom) {
                Stat(d.sounds.toString(), Strings.soundsLabel(d.sounds))
                Stat(d.projects.toString(), Strings.projectsLabel(d.projects))
                if (d.storage.total != 0.0) {
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                        Text(Format.bytes(d.storage.free), style = ArcType.statFree, color = c.displayInk, textAlign = TextAlign.End)
                        Text(Strings.FREE, style = ArcType.statLabel, color = c.displayDim)
                    }
                }
            }
        }
    }
}

@Composable
private fun Stat(num: String, label: String) {
    val c = LocalArcColors.current
    Column {
        Text(num, style = ArcType.statNum, color = c.displayInk)
        Text(label, style = ArcType.statLabel, color = c.displayDim)
    }
}

@Composable
internal fun BackupList(list: List<BackupRecord>, freshId: String?, fmtDay: (Long) -> String, onOpen: (BackupRecord) -> Unit, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    GridPlate(modifier) {
        list.forEachIndexed { i, b ->
            if (i > 0) PlateLine()
            // .backup-row:active { background: key-edge at 25% } instead of a ripple
            val source = remember { MutableInteractionSource() }
            val pressed by source.collectIsPressedAsState()
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(if (pressed) c.keyEdge.copy(alpha = 0.35f) else Color.Transparent)
                    .clickable(interactionSource = source, indication = null, role = Role.Button) { onOpen(b) }
                    .padding(vertical = 14.dp, horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                        if (b.id == freshId) {
                            Box(Modifier.padding(end = 8.dp).size(7.dp).clip(CircleShape).background(c.signal))
                        }
                        OneLine(b.title, ArcType.bold, c.ink)
                    }
                    Text(fmtDay(b.createdAt), style = ArcType.small, color = c.graphite)
                }
                Text(Strings.backupRowMeta(b.soundCount, b.projectCount, b.size), style = ArcType.small, color = c.graphite)
            }
        }
    }
}
