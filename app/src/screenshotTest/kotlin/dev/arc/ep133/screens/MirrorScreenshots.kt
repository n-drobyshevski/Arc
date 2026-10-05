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
import dev.arc.ep133.ui.screens.SettingsScreen
import dev.arc.ep133.data.AppSettings
import dev.arc.ep133.ui.screens.DeviceScreen
import dev.arc.ep133.ui.screens.PadsSheetContent
import dev.arc.ep133.ui.components.ArcFrame
import dev.arc.ep133.ui.components.ArcSheet
import dev.arc.ep133.ui.components.Tab
import dev.arc.ep133.ui.components.TabBar
import dev.arc.ep133.ui.components.TopBar
import dev.arc.ep133.controller.BrowserUi
import dev.arc.ep133.features.DeviceContents
import dev.arc.ep133.features.PadGroup
import dev.arc.ep133.features.SoundDetails
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import dev.arc.ep133.protocol.ProjectEntry
import dev.arc.ep133.protocol.SoundEntry
import dev.arc.ep133.text.FeatureText
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

/** A tab inside the top bar and the tab bar, as the app shows it. */
@Composable
private fun Framed(tab: Tab, connected: Boolean = true, dark: Boolean = false, content: @Composable () -> Unit) {
    ArcTheme(dark = dark) {
        ArcFrame(
            top = { TopBar(connected = connected, canConnect = true, canBackup = connected, onBackup = {}, onConnect = {}, onDebug = {}) },
            bottom = { TabBar(tab) {} },
        ) { content() }
    }
}

@Composable
private fun Live(state: MirrorState, loading: Boolean = false, dark: Boolean = false) {
    Framed(Tab.LIVE, dark = dark) {
        MirrorScreen(
            mirror = MirrorUi(state, loading = loading),
            nameOf = { if (state.learned.isEmpty()) null else names[it] },
            onPadOrder = {},
            fixedNow = NOW,
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

private val device = BackupDevice("EP-133", "TE032AS001", "", "2.5.1")

private fun backup(id: String, title: String, at: Long, sounds: Int, projects: Int) = BackupRecord(
    id, title, "", at, "device", null, device, sounds, projects, (1..projects).toList(), (1..sounds).toList(), emptyMap(), 48_000_000L,
)

private val connectedState = UiState(
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

@Composable
private fun Main(state: UiState, dark: Boolean = false) {
    Framed(Tab.BACKUPS, connected = state.connected, dark = dark) {
        MainScreen(
            state = state,
            fmtDay = { if (it > 1_790_900_000_000L) "Oct 4, 2026" else if (it > 1_790_500_000_000L) "Oct 2, 2026" else "Sep 25, 2026" },
            onBackup = {}, onImport = {}, onOpen = {},
        )
    }
}

@PreviewTest
@Preview(name = "Main connected", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun MainConnectedPreview() = Main(connectedState)

@PreviewTest
@Preview(name = "Main connected dark", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun MainConnectedDarkPreview() = Main(connectedState, dark = true)

@PreviewTest
@Preview(name = "Main empty after reinstall", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun MainEmptyPreview() = Main(UiState(libraryLoaded = true))

private val deviceSounds = listOf(
    1 to "kick", 2 to "kick 2", 3 to "snare", 4 to "hat closed", 5 to "hat open", 6 to "clap", 7 to "rim",
    101 to "bass c1", 102 to "bass d1", 140 to "vox chop", 205 to "stab", 206 to "riser",
).map { (slot, n) -> SoundEntry(slot, n, 120_000L + slot * 900L) }

private val deviceState = connectedState.copy(
    browser = BrowserUi(
        contents = DeviceContents(
            Storage(64e6, 21e6, 43e6),
            deviceSounds,
            listOf(1, 2, 3, 5, 7).map { ProjectEntry(it, 0, "", 180_000L + it * 60_000L) },
        ),
        details = mapOf(
            2 to SoundDetails(2, "kick 2", 1.0, 46875.0, JsonObject(mapOf("sound.playmode" to JsonPrimitive("oneshot"))), 0x1A2B3C4DL),
        ),
        projectSounds = mapOf(3 to listOf(1, 3, 4, 6, 101, 140, 300)),
        projectPads = mapOf(3 to listOf(PadGroup("A", mapOf(1 to 1)))),
    ),
)

@Composable
private fun Device(section: Int = 0, open: Int? = null, playing: String? = null, connected: Boolean = true, dark: Boolean = false) {
    val state = if (connected) deviceState else UiState(libraryLoaded = true)
    Framed(Tab.DEVICE, connected = connected, dark = dark) {
        DeviceScreen(
            state = state, onRefresh = {}, onSoundDetails = {}, onProjectSounds = {}, onAddSamples = {},
            playing = playing, initialSection = section, initialOpen = open,
        )
    }
}

@PreviewTest
@Preview(name = "Device tab", widthDp = 393, heightDp = 1180, showBackground = true)
@Composable
fun DeviceTabPreview() = Device(open = 2, playing = "device:3")

@PreviewTest
@Preview(name = "Device tab dark", widthDp = 393, heightDp = 1180, showBackground = true)
@Composable
fun DeviceTabDarkPreview() = Device(open = 2, playing = "device:3", dark = true)

@PreviewTest
@Preview(name = "Device projects", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun DeviceProjectsPreview() = Device(section = 1, open = 3)

@PreviewTest
@Preview(name = "Device disconnected", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun DeviceDisconnectedPreview() = Device(connected = false)

@PreviewTest
@Preview(name = "Pads sheet", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun PadsSheetPreview() {
    val pads = (1..12).associateWith { p -> if (p <= 8) p else if (p == 10) 40 else null }
    Framed(Tab.BACKUPS) {
        MainScreen(state = connectedState, fmtDay = { "" }, onBackup = {}, onImport = {}, onOpen = {})
        ArcSheet(visible = true, onDismiss = {}) {
            PadsSheetContent(
                title = FeatureText.padsTitle(3),
                groups = listOf(PadGroup("A", pads)),
                nameOf = { slot -> listOf("kick", "kick 2", "snare", "hat closed", "hat open", "clap", "rim", "tom low").getOrNull(slot - 1) },
                playingSlot = 3,
                onPad = {},
                onDone = {},
            )
        }
    }
}

@Composable
private fun Settings(dark: Boolean) {
    ArcTheme(dark = dark) {
        SettingsScreen(
            settings = AppSettings(keepLast = 10),
            state = connectedState,
            padOrder = PadOrder.FROM_TOP,
            version = "1.0",
            onTheme = {}, onAutoConnect = {}, onKeepScreenOn = {}, pruneCount = { 0 }, onKeepLast = {},
            onPadOrder = {}, onForgetNames = {}, onRestoreFolder = {}, onSource = {}, onFontLicence = {}, onDebug = {}, onBack = {},
        )
    }
}

@PreviewTest
@Preview(name = "Settings", widthDp = 393, heightDp = 1500, showBackground = true)
@Composable
fun SettingsPreview() = Settings(dark = false)

@PreviewTest
@Preview(name = "Settings dark", widthDp = 393, heightDp = 1500, showBackground = true)
@Composable
fun SettingsDarkPreview() = Settings(dark = true)
