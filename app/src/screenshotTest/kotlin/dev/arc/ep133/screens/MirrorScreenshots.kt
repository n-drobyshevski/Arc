package dev.arc.ep133.screens

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.android.tools.screenshot.PreviewTest
import dev.arc.ep133.controller.MirrorUi
import dev.arc.ep133.controller.UiState
import dev.arc.ep133.features.Hit
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.PadLight
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.protocol.Storage
import dev.arc.ep133.ui.screens.MainScreen
import dev.arc.ep133.ui.screens.SettingsScreen
import dev.arc.ep133.data.AppSettings
import dev.arc.ep133.ui.screens.DeviceScreen
import dev.arc.ep133.ui.screens.PadsSheetContent
import dev.arc.ep133.ui.components.ArcSheet
import dev.arc.ep133.ui.components.Tab
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
 * Screens drawn from fixed sample states (no device), for screenshots; the
 * shared samples are in ScreenshotFixtures.kt.
 */

@Composable
private fun Live(state: MirrorState, loading: Boolean = false, dark: Boolean = false, oneGroup: Boolean = false, guide: Boolean = false, tools: Boolean = false, offline: String? = null, noteOpen: Boolean = false, playingPads: Set<PhysicalPad> = emptySet(), keys: dev.arc.ep133.ui.screens.KeysUi = dev.arc.ep133.ui.screens.KeysUi(), rec: dev.arc.ep133.features.RecState = dev.arc.ep133.features.RecState.Idle, takes: List<dev.arc.ep133.data.TakeInfo> = emptyList()) {
    Framed(Tab.LIVE, connected = offline == null, dark = dark, guide = guide) {
        MirrorScreen(
            mirror = MirrorUi(state, loading = loading, offline = offline),
            nameOf = { if (state.learned.isEmpty()) null else names[it] },
            onPadOrder = {},
            fixedNow = NOW,
            oneGroup = oneGroup,
            // The last hit (A 7) is in group A; B is sounding too.
            follow = true,
            initialToolsOpen = tools,
            initialNoteOpen = noteOpen,
            onPad = if (playingPads.isNotEmpty()) ({ _, _ -> }) else null,
            playingPads = playingPads,
            keys = keys,
            rec = dev.arc.ep133.ui.screens.RecUi(rec) {},
            takes = dev.arc.ep133.ui.screens.TakesUi(
                list = takes,
                playing = takes.firstOrNull()?.name,
                fmtWhen = { if (it == TAKE_AT) "Oct 5, 2:23 PM" else "Oct 4, 9:41 PM" },
                connected = offline == null,
            ),
        )
    }
}

@PreviewTest
// Pixel 7: 412 x 915 dp, less the status bar and three-button navigation (24 + 48).
@Preview(name = "Live one group", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveOneGroupPreview() = Live(playing, oneGroup = true)

@PreviewTest
@Preview(name = "Live one group dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveOneGroupDarkPreview() = Live(playing, dark = true, oneGroup = true)

@PreviewTest
@Preview(name = "Live tools open", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveToolsOpenPreview() = Live(playing, oneGroup = true, tools = true)

// A smaller phone (360 x 740 dp, less the bars): still one screen, the pads just get shorter.
@PreviewTest
@Preview(name = "Live one group small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LiveOneGroupSmallPreview() = Live(playing, oneGroup = true)

@PreviewTest
@Preview(name = "Live offline", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveOfflinePreview() = Live(lastRead, oneGroup = true, offline = "Last seen Oct 5, 2:02 PM")

@PreviewTest
@Preview(name = "Live offline all groups", widthDp = 393, heightDp = 1180, showBackground = true)
@Composable
fun LiveOfflineAllPreview() = Live(lastRead, offline = "Last seen Oct 5, 2:02 PM")

// Offline, a tapped pad plays its sample on the phone: ringed while it plays.
@PreviewTest
@Preview(name = "Live offline pad playing", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveOfflinePlayingPreview() = Live(lastRead, oneGroup = true, offline = "Last seen Oct 5, 2:02 PM", playingPads = setOf(PhysicalPad(0, 9), PhysicalPad(0, 6), PhysicalPad(0, 3)))

// KEYS: the kick played as notes, C major from octave 4. The device holds MI4 and SO5
// (lit); the phone plays LA4 (ringed).
private val keysPlaying = playing.copy(
    notes = mapOf(64 to PadLight(110, 1, NOW - 20_000_000), 79 to PadLight(80, 1, NOW - 200_000_000, offAt = NOW - 100_000_000)),
    lastNote = 64,
)
private val keysUi = dev.arc.ep133.ui.screens.KeysUi(
    on = true,
    scale = dev.arc.ep133.features.Scale.MAJOR,
    pad = PhysicalPad(0, 9),
    padName = "kick",
    playingKeys = linkedSetOf(3, 5, 7),
)

@PreviewTest
@Preview(name = "Live keys", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveKeysPreview() = Live(keysPlaying, keys = keysUi)

@PreviewTest
@Preview(name = "Live keys dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveKeysDarkPreview() = Live(keysPlaying, dark = true, keys = keysUi)

@PreviewTest
@Preview(name = "Live keys small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LiveKeysSmallPreview() = Live(keysPlaying, keys = keysUi.copy(scale = dev.arc.ep133.features.Scale.MINOR_PENTATONIC))

@PreviewTest
@Preview(name = "Live keys tools", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveKeysToolsPreview() = Live(keysPlaying, keys = keysUi, tools = true)

@PreviewTest
@Preview(name = "Live keys letters", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveKeysLettersPreview() = Live(keysPlaying, keys = keysUi.copy(root = 9, scale = dev.arc.ep133.features.Scale.MINOR, names = dev.arc.ep133.features.NoteNames.LETTERS), tools = true)

@PreviewTest
@Preview(name = "Live keys letters grid", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveKeysLettersGridPreview() = Live(keysPlaying, keys = keysUi.copy(root = 9, scale = dev.arc.ep133.features.Scale.MINOR, names = dev.arc.ep133.features.NoteNames.LETTERS))

// Tapping "Offline" unfolds why.
private const val TAKE_AT = 1_791_200_000_000L

private val someTakes = listOf(
    dev.arc.ep133.data.TakeInfo("take-20261005-142301.wav", TAKE_AT, 12.4, 2_380_844),
    dev.arc.ep133.data.TakeInfo("take-20261004-214102.wav", TAKE_AT - 60_000_000, 73.0, 14_016_044),
)

@PreviewTest
@Preview(name = "Live rec armed", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveRecArmedPreview() = Live(playing, oneGroup = true, rec = dev.arc.ep133.features.RecState.Armed)

@PreviewTest
@Preview(name = "Live recording keys", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LiveRecordingKeysPreview() = Live(keysPlaying, keys = keysUi, rec = dev.arc.ep133.features.RecState.Recording(12))

@PreviewTest
@Preview(name = "Live tools takes", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveToolsTakesPreview() = Live(lastRead, oneGroup = true, tools = true, offline = "Last seen Oct 5, 2:02 PM", takes = someTakes)

@PreviewTest
@Preview(name = "Live offline note open", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun LiveOfflineNotePreview() = Live(lastRead, offline = "Last seen Oct 5, 2:02 PM", noteOpen = true)

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

@Composable
private fun Main(state: UiState, dark: Boolean = false, guide: Boolean = false) {
    Framed(Tab.BACKUPS, connected = state.connected, dark = dark, guide = guide) {
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
private fun Device(section: Int = 0, open: Int? = null, playing: String? = null, connected: Boolean = true, dark: Boolean = false, guide: Boolean = false) {
    val state = if (connected) deviceState else UiState(libraryLoaded = true)
    Framed(Tab.DEVICE, connected = connected, dark = dark, guide = guide) {
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
@Preview(name = "Settings", widthDp = 393, heightDp = 1700, showBackground = true)
@Composable
fun SettingsPreview() = Settings(dark = false)

@PreviewTest
@Preview(name = "Settings dark", widthDp = 393, heightDp = 1700, showBackground = true)
@Composable
fun SettingsDarkPreview() = Settings(dark = true)

// The guide overlay (the ? key, and once on the first start), on each tab with tools.

@PreviewTest
@Preview(name = "Guide overlay Backups", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun GuideOverlayBackupsPreview() = Main(connectedState, guide = true)

@PreviewTest
@Preview(name = "Guide overlay Live", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun GuideOverlayLivePreview() = Live(playing, oneGroup = true, guide = true)

@PreviewTest
@Preview(name = "Guide overlay Device", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun GuideOverlayDevicePreview() = Device(guide = true)

// Sections without the bottom bar: the section list open, and the guide slid in from its edge tab.

@PreviewTest
@Preview(name = "Section list open", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun SectionListPreview() {
    Framed(Tab.LIVE, menu = true) {
        MirrorScreen(mirror = MirrorUi(playing), nameOf = { names[it] }, onPadOrder = {}, fixedNow = NOW, oneGroup = true)
    }
}

@PreviewTest
@Preview(name = "Guide open from the edge", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun GuideFromEdgePreview() {
    Framed(Tab.BACKUPS, guideOpen = true) {
        MainScreen(state = connectedState, fmtDay = { "" }, onBackup = {}, onImport = {}, onOpen = {})
    }
}
