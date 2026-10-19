package dev.arc.ep133.screens

import androidx.compose.runtime.Composable
import dev.arc.ep133.controller.DeviceSummary
import dev.arc.ep133.controller.UiState
import dev.arc.ep133.features.Hit
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.PadLight
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.protocol.DeviceInfo
import dev.arc.ep133.protocol.Storage
import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.ui.components.ArcShell
import dev.arc.ep133.ui.components.CoachHost
import dev.arc.ep133.ui.components.Tab
import dev.arc.ep133.ui.screens.GuideScreen
import dev.arc.ep133.ui.theme.ArcTheme

/*
 * Sample states shared by the screenshot files (no device). The sound names
 * are made up for the picture.
 */

internal val names = mapOf(
    PhysicalPad(0, 9) to "kick", PhysicalPad(0, 10) to "kick 2", PhysicalPad(0, 11) to "snare",
    PhysicalPad(0, 6) to "hat closed", PhysicalPad(0, 7) to "hat open", PhysicalPad(0, 8) to "clap",
    PhysicalPad(0, 3) to "rim", PhysicalPad(0, 4) to "tom low", PhysicalPad(0, 0) to "perc",
    PhysicalPad(1, 9) to "bass c1", PhysicalPad(1, 10) to "bass d1", PhysicalPad(2, 4) to "vox chop",
    PhysicalPad(3, 9) to "stab", PhysicalPad(3, 3) to "riser",
)

internal const val NOW = 10_000_000_000L

internal val playing = MirrorState(
    pads = mapOf(
        PhysicalPad(0, 9) to PadLight(124, 1, NOW - 20_000_000),
        PhysicalPad(0, 6) to PadLight(70, 1, NOW - 90_000_000, offAt = NOW - 120_000_000),
        PhysicalPad(1, 9) to PadLight(100, 1, NOW - 10_000_000),
        PhysicalPad(2, 4) to PadLight(90, 1, NOW - 200_000_000, offAt = NOW - 60_000_000),
    ),
    keysHeld = mapOf(74 to 1, 77 to 1),
    lastKeysNote = 77,
    lastHit = Hit(PhysicalPad(0, 9), 45, 1, 124, 1, "kick"),
    playing = true,
    bpm = 122.0,
    activeProject = 3,
    learned = (0..11).associateWith { it + 1 },
    pushesSeen = true,
    padOrder = PadOrder.FROM_TOP,
)

// Not connected: the pads and names as arc last read them, nothing lit.
internal val lastRead = MirrorState(activeProject = 3, learned = (0..11).associateWith { it + 1 })

/** A section as the app shows it: the top bar with its section tag, and the guide tab on the left edge. */
@Composable
internal fun Framed(
    tab: Tab,
    connected: Boolean = true,
    dark: Boolean = false,
    guide: Boolean = false,
    menu: Boolean = false,
    guideOpen: Boolean = false,
    content: @Composable () -> Unit,
) {
    ArcTheme(dark = dark) {
        CoachHost(visible = guide, onDismiss = {}) {
            ArcShell(
                tab = tab, onTab = {},
                connected = connected, canConnect = true, canBackup = connected,
                onBackup = {}, onConnect = {}, onDebug = {}, onSettings = {}, onHelp = {},
                guideOpen = guideOpen, onGuide = {},
                guide = { GuideScreen(onBack = {}) },
                initialMenuOpen = menu,
                content = content,
            )
        }
    }
}

internal val device = BackupDevice("EP-133", "TE032AS001", "", "2.5.1")

internal fun backup(id: String, title: String, at: Long, sounds: Int, projects: Int) = BackupRecord(
    id, title, "", at, "device", null, device, sounds, projects, (1..projects).toList(), (1..sounds).toList(), emptyMap(), 48_000_000L,
)

internal val connectedState = UiState(
    connected = true,
    device = DeviceSummary(DeviceInfo("EP-133", "TE032AS001", "2.5.1", "", ""), Storage(64e6, 21e6, 43e6), 212, 6),
    backups = listOf(
        backup("1", "Before the gig", 1_791_000_000_000L, 212, 6),
        backup("2", "Backup Oct 2", 1_790_700_000_000L, 198, 5),
        backup("3", "Jam with Ana", 1_790_100_000_000L, 187, 4),
    ),
    freshId = "1",
    libraryLoaded = true,
)
