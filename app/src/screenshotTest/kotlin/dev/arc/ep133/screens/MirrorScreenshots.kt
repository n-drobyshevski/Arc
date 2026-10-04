package dev.arc.ep133.screens

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.android.tools.screenshot.PreviewTest
import dev.arc.ep133.controller.DeviceSummary
import dev.arc.ep133.controller.MirrorUi
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
import dev.arc.ep133.ui.screens.MainScreen
import dev.arc.ep133.ui.screens.MirrorScreen
import dev.arc.ep133.ui.theme.ArcTheme

/*
 * Screens drawn from fixed sample states (no device), for screenshots.
 * The sound names are made up for the picture.
 */

private val names = mapOf(
    PhysicalPad(0, 9) to "kick", PhysicalPad(0, 10) to "kick 2", PhysicalPad(0, 11) to "snare",
    PhysicalPad(0, 6) to "hat closed", PhysicalPad(0, 7) to "hat open", PhysicalPad(0, 8) to "clap",
    PhysicalPad(0, 3) to "rim", PhysicalPad(0, 4) to "tom low", PhysicalPad(0, 0) to "perc",
    PhysicalPad(1, 9) to "bass c1", PhysicalPad(1, 10) to "bass d1", PhysicalPad(2, 4) to "vox chop",
    PhysicalPad(3, 9) to "stab", PhysicalPad(3, 3) to "riser",
)

private const val NOW = 10_000_000_000L

private val playing = MirrorState(
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

@Composable
private fun Live(state: MirrorState, loading: Boolean = false, dark: Boolean = false) {
    ArcTheme(dark = dark) {
        MirrorScreen(
            mirror = MirrorUi(state, loading = loading),
            nameOf = { if (state.learned.isEmpty()) null else names[it] },
            now = NOW,
            onPadOrder = {},
            onBack = {},
        )
    }
}

@PreviewTest
@Preview(name = "Live playing", widthDp = 393, heightDp = 1180, showBackground = true)
@Composable
fun LivePlayingPreview() = Live(playing)

@PreviewTest
@Preview(name = "Live playing dark", widthDp = 393, heightDp = 1180, showBackground = true)
@Composable
fun LivePlayingDarkPreview() = Live(playing, dark = true)

@PreviewTest
@Preview(name = "Live first open", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun LiveFirstOpenPreview() = Live(MirrorState(activeProject = 3, lastHit = Hit(PhysicalPad(0, 0), 36, 1, 96, null, null), pads = mapOf(PhysicalPad(0, 0) to PadLight(96, 1, NOW))))

@PreviewTest
@Preview(name = "Live tablet", widthDp = 840, heightDp = 900, showBackground = true)
@Composable
fun LiveTabletPreview() = Live(playing)

@PreviewTest
@Preview(name = "Main connected", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun MainConnectedPreview() {
    val device = BackupDevice("EP-133", "TE032AS001", "", "2.5.1")
    fun backup(id: String, title: String, at: Long, sounds: Int, projects: Int) = BackupRecord(
        id, title, "", at, "device", null, device, sounds, projects, (1..projects).toList(), (1..sounds).toList(), emptyMap(), 48_000_000L,
    )
    ArcTheme(dark = false) {
        MainScreen(
            state = UiState(
                connected = true,
                device = DeviceSummary(DeviceInfo("EP-133", "TE032AS001", "2.5.1", "", ""), Storage(64e6, 21e6, 43e6), 212, 6),
                backups = listOf(
                    backup("1", "Before the gig", 1_791_000_000_000L, 212, 6),
                    backup("2", "Backup Oct 2", 1_790_700_000_000L, 198, 5),
                ),
                libraryLoaded = true,
            ),
            fmtDay = { if (it > 1_790_900_000_000L) "Oct 4, 2026" else "Oct 2, 2026" },
            onConnect = {}, onBackup = {}, onImport = {}, onOpen = {}, onDebug = {},
        )
    }
}

@PreviewTest
@Preview(name = "Main empty after reinstall", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun MainEmptyPreview() {
    ArcTheme(dark = false) {
        MainScreen(
            state = UiState(libraryLoaded = true),
            fmtDay = { "" },
            onConnect = {}, onBackup = {}, onImport = {}, onOpen = {}, onDebug = {},
        )
    }
}
