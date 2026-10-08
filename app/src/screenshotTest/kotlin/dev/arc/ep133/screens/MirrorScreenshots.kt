package dev.arc.ep133.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
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
import dev.arc.ep133.ui.screens.PadSheetContent
import dev.arc.ep133.ui.components.ArcFrame
import dev.arc.ep133.ui.components.CoachHost
import dev.arc.ep133.ui.components.ArcSheet
import dev.arc.ep133.ui.components.Tab
import dev.arc.ep133.ui.components.ArcShell
import dev.arc.ep133.ui.components.ArcToast
import dev.arc.ep133.ui.components.BarSlot
import dev.arc.ep133.ui.components.LocalArcWindow
import dev.arc.ep133.ui.components.LocalBarSlot
import dev.arc.ep133.controller.UploadDraftItem
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.screens.LivePill
import dev.arc.ep133.ui.screens.TrimSheetContent
import dev.arc.ep133.ui.screens.liveInBar
import dev.arc.ep133.ui.screens.GuideScreen
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
import dev.arc.ep133.ui.screens.FunctionKeysUi
import dev.arc.ep133.ui.screens.SampleUi
import dev.arc.ep133.controller.SampleUiState
import dev.arc.ep133.features.SampleInput
import dev.arc.ep133.features.SamplePhase
import dev.arc.ep133.features.SampleSource
import dev.arc.ep133.ui.screens.ProjectSheetContent
import dev.arc.ep133.ui.screens.SampleReviewSheetContent
import dev.arc.ep133.ui.screens.TempoSheetContent
import dev.arc.ep133.ui.screens.projectChoicesOf
import dev.arc.ep133.ui.screens.projectKeyOf
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

/**
 * A section as the app shows it: the top bar with its section tag, and the guide tab on the left edge.
 * On a phone on its side Live's display line ([pill]) rides in the top bar, as MainActivity puts it.
 */
@Composable
private fun Framed(
    tab: Tab,
    connected: Boolean = true,
    dark: Boolean = false,
    guide: Boolean = false,
    menu: Boolean = false,
    guideOpen: Boolean = false,
    pill: (@Composable BoxScope.() -> Unit)? = null,
    /** A toast showing, and (in a short window) where the bar's middle is: the bar reports it a frame late. */
    toast: String? = null,
    barMiddle: DpRect? = null,
    /** The toast's action key ("UNDO"). */
    toastAction: String? = null,
    content: @Composable () -> Unit,
) {
    ArcTheme(dark = dark) {
        val density = LocalDensity.current
        val slot = LocalBarSlot.current
        val placed = remember(barMiddle) {
            barMiddle?.let { m -> BarSlot().apply { bounds = with(density) { Rect(m.left.toPx(), m.top.toPx(), m.right.toPx(), m.bottom.toPx()) } } }
        }
        CompositionLocalProvider(LocalBarSlot provides (placed ?: slot)) {
            Box(Modifier.fillMaxSize()) {
                CoachHost(visible = guide, onDismiss = {}) {
                    ArcShell(
                        tab = tab, onTab = {},
                        connected = connected, canConnect = true, canBackup = connected,
                        onBackup = {}, onConnect = {}, onDebug = {}, onSettings = {}, onHelp = {},
                        guideOpen = guideOpen, onGuide = {},
                        guide = { GuideScreen(onBack = {}) },
                        middle = pill.takeIf { tab == Tab.LIVE && liveInBar(LocalArcWindow.current) },
                        initialMenuOpen = menu,
                        content = content,
                    )
                }
                ArcToast(
                    id = toast?.let { 1L }, text = toast.orEmpty(), error = false, onTimeout = {}, modifier = Modifier.align(Alignment.BottomCenter),
                    action = toastAction, onAction = toastAction?.let { { } },
                )
            }
        }
    }
}

@Composable
private fun Live(state: MirrorState, loading: Boolean = false, dark: Boolean = false, oneGroup: Boolean = false, guide: Boolean = false, tools: Boolean = false, offline: String? = null, noteOpen: Boolean = false, playingPads: Set<PhysicalPad> = emptySet(), keys: dev.arc.ep133.ui.screens.KeysUi = dev.arc.ep133.ui.screens.KeysUi(), rec: dev.arc.ep133.features.RecState = dev.arc.ep133.features.RecState.Idle, takes: List<dev.arc.ep133.data.TakeInfo> = emptyList(), piano: IntRange? = null, toast: String? = null, barMiddle: DpRect? = null, edit: Boolean? = null, toastAction: String? = null, wireless: Boolean = false, error: String? = null, getFactory: Boolean = false, offlineProjects: List<Int> = emptyList(), clickOn: Boolean = false, sample: SampleUiState? = null, unroll: Float? = null, lastTake: Boolean = false, tab: Boolean = true, pulled: Boolean = false) {
    val mirror = MirrorUi(state, loading = loading, error = error, offline = offline, offlineProjects = offlineProjects)
    // PROJECT as MainActivity works it out; TEMPO's light caught on a beat while the click is on.
    val functions = FunctionKeysUi(project = projectKeyOf(mirror, busy = false), clickOn = clickOn, beatLit = clickOn)
    // The SAMPLE panel, as MainActivity has it: the meter caught at a level, its threshold tick where the
    // knob has it, the last take's wave where [lastTake]. Without [sample], the panel closed, its tab under the
    // function keys as the app has it in PADS; without [tab] either, none (as before SAMPLE).
    val sampleUi = (sample ?: SampleUiState().takeIf { tab })?.let {
        SampleUi(it, level = { 0.62f }, lastTake = if (lastTake) takePeaks else null, still = true, unroll = unroll, pulled = pulled)
    }
    val recUi = dev.arc.ep133.ui.screens.RecUi(rec) {}
    // The piano's notes, for the display line in the bar to name a device note past them. The
    // piano reports them a frame late, after the screenshot, so [piano] gives them up front.
    var pianoRange by remember { mutableStateOf(piano) }
    Framed(
        Tab.LIVE, connected = offline == null && error == null, dark = dark, guide = guide,
        pill = { LivePill(mirror, keys, recUi, still = true, pianoRange = pianoRange, editing = edit == true, wireless = wireless, sample = sampleUi) }, toast = toast, barMiddle = barMiddle,
        toastAction = toastAction,
    ) {
        MirrorScreen(
            mirror = mirror,
            nameOf = { if (state.learned.isEmpty()) null else names[it] },
            fixedNow = NOW,
            oneGroup = oneGroup,
            // The last hit (A 7) is in group A; B is sounding too.
            follow = true,
            initialToolsOpen = tools,
            initialNoteOpen = noteOpen,
            onGetFactory = if (getFactory) ({}) else null,
            onPad = if (playingPads.isNotEmpty()) ({ _, _, _, _ -> }) else null,
            playingPads = playingPads,
            keys = keys,
            onPianoRange = { pianoRange = it },
            rec = recUi,
            takes = dev.arc.ep133.ui.screens.TakesUi(
                list = takes,
                playing = takes.firstOrNull()?.name,
                fmtWhen = { if (it == TAKE_AT) "Oct 5, 2:23 PM" else "Oct 4, 9:41 PM" },
                connected = offline == null,
            ),
            // EDIT, SOUND's key, as on the Live tab: on where [edit] says so.
            edit = dev.arc.ep133.ui.screens.EditUi(on = edit == true, onEdit = {}),
            wireless = wireless,
            functions = functions,
            sample = sampleUi,
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

// Not connected: the pads and names as arc last read them, nothing lit.
private val lastRead = MirrorState(activeProject = 3, learned = (0..11).associateWith { it + 1 })

@PreviewTest
@Preview(name = "Live offline", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveOfflinePreview() = Live(lastRead, oneGroup = true, offline = "Last seen Oct 5, 2:02 PM")

@PreviewTest
@Preview(name = "Live offline all groups", widthDp = 393, heightDp = 1180, showBackground = true)
@Composable
fun LiveOfflineAllPreview() = Live(lastRead, offline = "Last seen Oct 5, 2:02 PM")

// Offline, a tapped pad plays its sample on the phone: ringed while it plays.
// Never read, not connected: the factory sounds to get, on the display and first in the tools.
@PreviewTest
@Preview(name = "Live get factory sounds", widthDp = 393, heightDp = 1180, showBackground = true)
@Composable
fun LiveGetFactoryPreview() = Live(MirrorState(), error = dev.arc.ep133.text.MirrorText.NOT_CONNECTED, getFactory = true)

@PreviewTest
@Preview(name = "Live get factory sounds tools", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveGetFactoryToolsPreview() = Live(MirrorState(), oneGroup = true, tools = true, error = dev.arc.ep133.text.MirrorText.NOT_CONNECTED, getFactory = true)

// The factory sounds' project 1, shown before any read, its note unfolded.
@PreviewTest
@Preview(name = "Live factory sounds", widthDp = 393, heightDp = 1180, showBackground = true)
@Composable
fun LiveFactoryPreview() = Live(lastRead.copy(activeProject = 1), offline = dev.arc.ep133.text.MirrorText.FACTORY, noteOpen = true)

@PreviewTest
@Preview(name = "Live offline pad playing", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveOfflinePlayingPreview() = Live(lastRead, oneGroup = true, offline = "Last seen Oct 5, 2:02 PM", playingPads = setOf(PhysicalPad(0, 9), PhysicalPad(0, 6), PhysicalPad(0, 3)))

// Live's sound goes to Bluetooth, and no pad has been hit on the device yet: the display
// line says the sound plays late (a size down on the all-groups display).
private val wirelessState = playing.copy(lastHit = null)

@PreviewTest
@Preview(name = "Live bluetooth", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveBluetoothPreview() = Live(wirelessState, oneGroup = true, wireless = true)

@PreviewTest
@Preview(name = "Live bluetooth all groups", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun LiveBluetoothAllPreview() = Live(wirelessState, wireless = true)

// KEYS: the kick played as notes, C major from octave 4. The device holds MI4 and SO5
// (lit); the phone plays FA4, LA4 and DO5 (outlined).
private val keysPlaying = playing.copy(
    notes = mapOf(64 to PadLight(110, 1, NOW - 20_000_000), 79 to PadLight(80, 1, NOW - 200_000_000, offAt = NOW - 100_000_000)),
    lastNote = 64,
)
private val keysUi = dev.arc.ep133.ui.screens.KeysUi(
    on = true,
    scale = dev.arc.ep133.features.Scale.MAJOR,
    pad = PhysicalPad(0, 9),
    padName = "kick",
    playingNotes = linkedSetOf(65, 69, 72),
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

// On its side (Pixel 7 at 915 x 412 dp, less the status bar and the three-button bar at the
// side: 24 and 48). KEYS is a piano from DO3 to DO5 at OCT 4, 15 white keys. The device holds
// MI4 (lit) and DO6, past the keys' right end (an orange tick there); the phone plays LA3, DO4
// and SO4 (outlined). The display line rides in the top bar.
private val sideways = playing.copy(
    notes = mapOf(64 to PadLight(110, 1, NOW - 20_000_000), 84 to PadLight(96, 1, NOW - 40_000_000)),
    lastNote = 84,
)
private val chord = keysUi.copy(scale = dev.arc.ep133.features.Scale.CHROMATIC, playingNotes = linkedSetOf(57, 60, 67))

@PreviewTest
@Preview(name = "Live keys sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveKeysSidewaysPreview() = Live(sideways, keys = chord, piano = 48..72)

// Nothing playing on the phone: the display line names the device's DO6, past the keys.
@PreviewTest
@Preview(name = "Live keys sideways E major", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveKeysSidewaysEMajorPreview() = Live(sideways, keys = keysUi.copy(root = 4, playingNotes = emptySet()), piano = 48..72)

@PreviewTest
@Preview(name = "Live keys sideways dark", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveKeysSidewaysDarkPreview() = Live(sideways, dark = true, keys = chord.copy(root = 9, scale = dev.arc.ep133.features.Scale.MINOR_PENTATONIC), piano = 48..72)

// Settings → Key labels off: rings and octave numbers only, the display line still names the note.
@PreviewTest
@Preview(name = "Live keys sideways no names", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveKeysSidewaysNoNamesPreview() = Live(sideways, keys = chord.copy(showNames = false), piano = 48..72)

@PreviewTest
@Preview(name = "Live keys sideways letters", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveKeysSidewaysLettersPreview() = Live(sideways, keys = keysUi.copy(root = 9, scale = dev.arc.ep133.features.Scale.MINOR, names = dev.arc.ep133.features.NoteNames.LETTERS, playingNotes = emptySet()), piano = 48..72)

@PreviewTest
@Preview(name = "Live keys sideways tools", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveKeysSidewaysToolsPreview() = Live(sideways, keys = chord, tools = true, piano = 48..72)

@PreviewTest
@Preview(name = "Live one group sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveOneGroupSidewaysPreview() = Live(playing, oneGroup = true)

@PreviewTest
@Preview(name = "Live all groups sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveAllGroupsSidewaysPreview() = Live(playing)

@PreviewTest
@Preview(name = "Guide overlay Live sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun GuideOverlayLiveSidewaysPreview() = Live(sideways, keys = chord, guide = true, piano = 48..72)

// Gesture navigation: the bar's 20 dp at the bottom instead of 48 at the side. Only the window's
// size: previews have no system bars, so the gutters stay at their least here, as with the
// three-button bar (the back-swipe edges are a device check, README step 22).
@PreviewTest
@Preview(name = "Live keys gesture nav", widthDp = 915, heightDp = 368, showBackground = true)
@Composable
fun LiveKeysGestureNavPreview() = Live(sideways, keys = chord, piano = 48..72)

// A 360 x 740 dp phone on its side: 12 white keys, DO3 to SO4, so the device's MI4 is the
// one lit key and DO6 is past the end.
@PreviewTest
@Preview(name = "Live keys sideways small", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LiveKeysSidewaysSmallPreview() = Live(sideways, keys = chord.copy(scale = dev.arc.ep133.features.Scale.MAJOR), piano = 48..67)

// A toast over the bar's middle, never over the keys: two lines, then an ellipsis until tapped.
@PreviewTest
@Preview(name = "Live toast sideways small", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LiveToastSidewaysSmallPreview() = Live(
    sideways, keys = chord.copy(scale = dev.arc.ep133.features.Scale.MAJOR), piano = 48..67,
    toast = MirrorText.BLUETOOTH_DELAY, barMiddle = SmallBarMiddle,
)

@PreviewTest
@Preview(name = "Live one group sideways small", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LiveOneGroupSidewaysSmallPreview() = Live(playing, oneGroup = true)

@PreviewTest
@Preview(name = "Guide overlay Live sideways small", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun GuideOverlayLiveSidewaysSmallPreview() = Live(sideways, keys = chord.copy(scale = dev.arc.ep133.features.Scale.MAJOR), guide = true, piano = 48..67)

@PreviewTest
@Preview(name = "Live keys sideways small font 2", widthDp = 692, heightDp = 336, fontScale = 2f, showBackground = true)
@Composable
fun LiveKeysSidewaysSmallFontPreview() = Live(sideways, keys = chord.copy(scale = dev.arc.ep133.features.Scale.MAJOR), piano = 48..67)

// A 360 x 640 dp phone on its side (592 x 336 less the bars) at font scale 2, with a long
// scale: one octave of keys, the display line on the page (the bar's middle is too narrow for
// it), and the row over the keys drops the key word's KEY, then shortens the scale to its code;
// − and + keep their size.
@PreviewTest
@Preview(name = "Live keys sideways narrow font 2", widthDp = 592, heightDp = 336, fontScale = 2f, showBackground = true)
@Composable
fun LiveKeysSidewaysNarrowFontPreview() = Live(sideways, keys = chord.copy(root = 9, scale = dev.arc.ep133.features.Scale.MINOR_PENTATONIC), piano = 48..60)

// A tablet on its side is tall enough for the display line on the page and the full bar; the
// piano stops at a hand's span.
@PreviewTest
@Preview(name = "Live keys tablet", widthDp = 1280, heightDp = 752, showBackground = true)
@Composable
fun LiveKeysTabletPreview() = Live(sideways, keys = chord)

// Live tools beside the piano: the legend's piano rows (a dimmed key, the C with its octave).
@PreviewTest
@Preview(name = "Live keys tablet tools", widthDp = 1280, heightDp = 752, showBackground = true)
@Composable
fun LiveKeysTabletToolsPreview() = Live(sideways, keys = chord.copy(root = 9, scale = dev.arc.ep133.features.Scale.MINOR), tools = true)

// The KEYS view switch on a portrait tablet: the piano picked for a tall window, in the
// middle of the room under the display line.
@PreviewTest
@Preview(name = "Live keys tablet upright piano", widthDp = 800, heightDp = 1232, showBackground = true)
@Composable
fun LiveKeysTabletUprightPianoPreview() = Live(sideways, keys = chord.copy(viewTall = dev.arc.ep133.features.KeysView.PIANO))

// The same tablet on Auto: the grid, with the switch after the KEYS word.
@PreviewTest
@Preview(name = "Live keys tablet upright grid", widthDp = 800, heightDp = 1232, showBackground = true)
@Composable
fun LiveKeysTabletUprightGridPreview() = Live(keysPlaying, keys = keysUi)

// On its side with the grid picked: the upright row under the grid, the switch's grid key down.
@PreviewTest
@Preview(name = "Live keys sideways grid picked", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveKeysSidewaysGridPreview() = Live(sideways, keys = chord.copy(viewWide = dev.arc.ep133.features.KeysView.PADS))

// EDIT: the tab under GUIDE, off, then on (the display line, the pads' outlines and badges).
@PreviewTest
@Preview(name = "Live edit tab", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveEditTabPreview() = Live(playing, oneGroup = true, edit = false)

@PreviewTest
@Preview(name = "Live edit on", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveEditOnPreview() = Live(lastRead, oneGroup = true, edit = true)

@PreviewTest
@Preview(name = "Live edit on dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveEditOnDarkPreview() = Live(lastRead, dark = true, oneGroup = true, edit = true)

@PreviewTest
@Preview(name = "Live edit on all groups", widthDp = 393, heightDp = 1180, showBackground = true)
@Composable
fun LiveEditAllPreview() = Live(lastRead, edit = true)

@PreviewTest
@Preview(name = "Live edit on sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveEditSidewaysPreview() = Live(lastRead, oneGroup = true, edit = true)

// After a pad got another sound: the toast with UNDO.
@PreviewTest
@Preview(name = "Live edit undo toast", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveEditUndoPreview() = Live(lastRead, oneGroup = true, edit = true, toast = MirrorText.assigned(PhysicalPad(0, 7), "vox chop"), toastAction = MirrorText.UNDO)

private val padSounds = listOf(
    SoundEntry(1, "kick", 234_000), SoundEntry(2, "kick 2", 241_000), SoundEntry(101, "snare 2", 206_000),
    SoundEntry(102, "rim", 207_000), SoundEntry(140, "vox chop", 240_000), SoundEntry(201, "hat closed", 98_000),
    SoundEntry(202, "hat open", 180_000), SoundEntry(310, "clap", 120_000),
)

// EDIT's pad sheet for A 8: the sound on it (101 snare 2) marked ON PAD, a preview playing.
@PreviewTest
@Preview(name = "Live pad sheet", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun LivePadSheetPreview() {
    Framed(Tab.LIVE) {
        MirrorScreen(mirror = MirrorUi(lastRead, loading = false), nameOf = { names[it] }, fixedNow = NOW, oneGroup = true)
        ArcSheet(visible = true, onDismiss = {}) {
            PadSheetContent(
                pad = PhysicalPad(0, 7),
                target = dev.arc.ep133.features.PadTarget(1, 0, 2, 101),
                sounds = padSounds,
                playing = "device:140",
                busy = false,
                onPlay = { _, _ -> }, onStop = {}, onPick = { _, _ -> }, onUpload = {},
            )
        }
    }
}

// EDIT's pad settings: the EP-133's SOUND EDIT pages over the sounds, folded away.
private val editPcm = ShortArray(46875) { i -> (kotlin.math.sin(i * 0.05) * 30000 * kotlin.math.exp(-i / 9000.0)).toInt().toShort() }
private val editState = dev.arc.ep133.controller.PadEditState(
    pad = PhysicalPad(0, 7),
    target = dev.arc.ep133.features.PadTarget(1, 0, 2, 101),
    settings = dev.arc.ep133.features.PadSettings(pitch = -2.5, level = 82, pan = -6, mode = dev.arc.ep133.features.PlayMode.KEY, start = 4000, end = 30000, attack = 12, release = 40),
    frames = editPcm.size.toLong(),
    peaks = dev.arc.ep133.ui.screens.trimPeaks(editPcm, 1),
)

@Composable
private fun PadSettingsSheet(page: dev.arc.ep133.ui.screens.EditPage, dark: Boolean = false, edit: dev.arc.ep133.controller.PadEditState = editState, offline: Boolean = false) {
    Framed(Tab.LIVE, dark = dark) {
        MirrorScreen(mirror = MirrorUi(lastRead, loading = false), nameOf = { names[it] }, fixedNow = NOW, oneGroup = true)
        ArcSheet(visible = true, onDismiss = {}) {
            PadSheetContent(
                pad = PhysicalPad(0, 7),
                target = edit.target,
                sounds = padSounds,
                playing = null,
                busy = false,
                onPlay = { _, _ -> }, onStop = {}, onPick = { _, _ -> }, onUpload = if (offline) null else ({}),
                offline = offline,
                edit = edit,
                editPage = page,
            )
        }
    }
}

@PreviewTest
@Preview(name = "Pad settings sound", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun PadSettingsSoundPreview() = PadSettingsSheet(dev.arc.ep133.ui.screens.EditPage.SOUND)

@PreviewTest
@Preview(name = "Pad settings trim small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun PadSettingsTrimSmallPreview() = PadSettingsSheet(dev.arc.ep133.ui.screens.EditPage.TRIM)

@PreviewTest
@Preview(name = "Pad settings env dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun PadSettingsEnvDarkPreview() = PadSettingsSheet(dev.arc.ep133.ui.screens.EditPage.ENV, dark = true)

// Oneshot plays to the end: release rests, and the page says why.
@PreviewTest
@Preview(name = "Pad settings env oneshot", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun PadSettingsEnvOneshotPreview() = PadSettingsSheet(
    dev.arc.ep133.ui.screens.EditPage.ENV,
    edit = editState.copy(settings = dev.arc.ep133.features.PadSettings.DEFAULT),
)

// Offline: the settings change in arc only; the device is still being asked for nothing.
@PreviewTest
@Preview(name = "Pad settings offline mute", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun PadSettingsOfflineMutePreview() = PadSettingsSheet(
    dev.arc.ep133.ui.screens.EditPage.MUTE,
    edit = editState.copy(offline = true, settings = editState.settings.copy(muteGroup = true)),
    offline = true,
)

// The function keys: the click on, TEMPO's light caught on a beat and its label the EP-133's
// tempo (it sends MIDI clock, which the click follows).
@PreviewTest
@Preview(name = "Live click on", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveClickOnPreview() = Live(playing, oneGroup = true, clickOn = true)

@PreviewTest
@Preview(name = "Live click on dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveClickOnDarkPreview() = Live(playing, dark = true, oneGroup = true, clickOn = true)

// Offline from the last read with no factory pack saved: nothing to step to, PROJECT greyed out.
@PreviewTest
@Preview(name = "Live offline project greyed", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LiveOfflineProjectGreyedPreview() = Live(lastRead, oneGroup = true, offline = "Last seen Oct 5, 2:02 PM")

// Offline with the factory pack: PROJECT stepped on to its project 3, the note naming it.
@PreviewTest
@Preview(name = "Live factory project 3", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun LiveFactoryProject3Preview() = Live(
    lastRead.copy(activeProject = 3), offline = MirrorText.FACTORY, noteOpen = true, offlineProjects = listOf(1, 2, 3, 4, 5),
)

@PreviewTest
@Preview(name = "Live click on sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveClickOnSidewaysPreview() = Live(playing, oneGroup = true, clickOn = true)

@PreviewTest
@Preview(name = "Live all groups sideways small", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LiveAllGroupsSidewaysSmallPreview() = Live(playing)

@PreviewTest
@Preview(name = "Live keys sideways grid small", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LiveKeysSidewaysGridSmallPreview() = Live(sideways, keys = chord.copy(viewWide = dev.arc.ep133.features.KeysView.PADS))

// A short window on its side (a phone with a large display size): the function column closes
// up its gaps and shrinks its caps; shorter still, it drops the LED lines.
@PreviewTest
@Preview(name = "Live one group sideways short", widthDp = 560, heightDp = 280, showBackground = true)
@Composable
fun LiveOneGroupSidewaysShortPreview() = Live(playing, oneGroup = true, clickOn = true)

@PreviewTest
@Preview(name = "Live one group sideways shortest", widthDp = 490, heightDp = 253, showBackground = true)
@Composable
fun LiveOneGroupSidewaysShortestPreview() = Live(playing, oneGroup = true)

@PreviewTest
@Preview(name = "Live keys sideways grid short", widthDp = 560, heightDp = 280, showBackground = true)
@Composable
fun LiveKeysSidewaysGridShortPreview() = Live(sideways, keys = chord.copy(viewWide = dev.arc.ep133.features.KeysView.PADS))

// TEMPO held: the tempo sheet over Live, the click on at the phone's tempo.
@PreviewTest
@Preview(name = "Tempo sheet", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TempoSheetPreview() = TempoSheet(deviceBpm = null)

// While the EP-133 sends MIDI clock its tempo leads: − + and TAP rest.
@PreviewTest
@Preview(name = "Tempo sheet following", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TempoSheetFollowingPreview() = TempoSheet(deviceBpm = 122.0)

@Composable
private fun TempoSheet(deviceBpm: Double?) {
    Framed(Tab.LIVE) {
        MirrorScreen(mirror = MirrorUi(lastRead, loading = false), nameOf = { names[it] }, fixedNow = NOW, oneGroup = true)
        ArcSheet(visible = true, onDismiss = {}) {
            TempoSheetContent(bpm = 98, deviceBpm = deviceBpm, on = true, onOn = {}, onBpm = {}, onTap = {}, onDone = {})
        }
    }
}

// PROJECT held: projects 1 to 9 in the keypad's order, the one shown orange.
@PreviewTest
@Preview(name = "Project sheet", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun ProjectSheetPreview() = ProjectSheet(MirrorUi(lastRead, loading = false))

// Offline with the factory pack: only the views arc has can be picked.
@PreviewTest
@Preview(name = "Project sheet offline", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun ProjectSheetOfflinePreview() = ProjectSheet(
    MirrorUi(lastRead.copy(activeProject = 1), loading = false, offline = MirrorText.FACTORY, offlineProjects = listOf(1, 2, 3, 4, 5)),
)

@Composable
private fun ProjectSheet(mirror: MirrorUi) {
    Framed(Tab.LIVE) {
        MirrorScreen(mirror = mirror, nameOf = { names[it] }, fixedNow = NOW, oneGroup = true)
        ArcSheet(visible = true, onDismiss = {}) {
            ProjectSheetContent(choices = projectChoicesOf(mirror, busy = false), onPick = {}, onDone = {})
        }
    }
}

// The SAMPLE panel, unrolled in the function keys' place, its tab hanging under it: the line above lit
// orange with the source, the meter and what to do; the panel's display and controls; the page's pads,
// the empty pads' rings blinking (caught on), those with a sound ringed, the take's pad lit.
private val mic = SampleInput(SampleSource.MIC, false)
private val rspSt = SampleInput(SampleSource.RSP, true)
private val inputs = listOf(mic, SampleInput(SampleSource.RSP, false), rspSt)
private val sampleReady = SampleUiState(on = true, input = mic, inputs = inputs, gainDb = 12f, thresholdDb = -24f, maxSeconds = 40)

@PreviewTest
@Preview(name = "Live sample panel", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSamplePanelPreview() = Live(lastRead, oneGroup = true, sample = sampleReady)

// The last take's wave on the display.
@PreviewTest
@Preview(name = "Live sample panel dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSamplePanelDarkPreview() = Live(lastRead, dark = true, oneGroup = true, sample = sampleReady, lastTake = true)

// A pad held with the threshold set: the take waits for sound.
@PreviewTest
@Preview(name = "Live sample panel waiting", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSamplePanelWaitingPreview() = Live(lastRead, oneGroup = true, sample = sampleReady.copy(phase = SamplePhase.Waiting(PhysicalPad(0, 2))))

// Resampling the phone's sound in stereo into an empty pad, 4 s of 20: a small phone's panel, without its display.
@PreviewTest
@Preview(name = "Live sample panel recording small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LiveSamplePanelRecordingSmallPreview() = Live(
    lastRead, oneGroup = true,
    sample = sampleReady.copy(input = rspSt, gainDb = 0f, thresholdDb = null, maxSeconds = 20, phase = SamplePhase.Recording(PhysicalPad(0, 2), 4, 20, false)),
)

// LATCH on, two bars: the click counts in, and LATCH reads STOP.
@PreviewTest
@Preview(name = "Live sample panel count-in", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun LiveSamplePanelCountInPreview() = Live(
    lastRead, oneGroup = true, clickOn = true,
    sample = sampleReady.copy(latch = true, bars = 2, thresholdDb = null, phase = SamplePhase.CountIn(PhysicalPad(0, 5), 3)),
)

// On the all-groups page: the panel over the four groups, which keep their size and record too.
@PreviewTest
@Preview(name = "Live sample panel all groups", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSamplePanelAllGroupsPreview() = Live(lastRead, sample = sampleReady)

// The EP-133 over USB: the panel says it's experimental.
@PreviewTest
@Preview(name = "Live sample panel usb", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSamplePanelUsbPreview() = Live(
    lastRead, oneGroup = true,
    sample = sampleReady.copy(input = SampleInput(SampleSource.USB, true), inputs = inputs + SampleInput(SampleSource.USB, false) + SampleInput(SampleSource.USB, true), gainDb = 0f, usb = true),
)

// The EP-133 short of space: takes stop sooner, and the display says so.
@PreviewTest
@Preview(name = "Live sample panel low space", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun LiveSamplePanelLowSpacePreview() = Live(lastRead, oneGroup = true, sample = sampleReady.copy(lowSpace = true, maxSeconds = 12))

// On its side: the line in the top bar; the panel in the function keys' column, widened, the pads beside it.
@PreviewTest
@Preview(name = "Live sample panel sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveSamplePanelSidewaysPreview() = Live(lastRead, oneGroup = true, sample = sampleReady.copy(phase = SamplePhase.Recording(PhysicalPad(0, 2), 7, 40, true), latch = true))

@PreviewTest
@Preview(name = "Live sample panel bar", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LiveSamplePanelBarPreview() = Live(lastRead, oneGroup = true, sample = sampleReady, lastTake = true)

@PreviewTest
@Preview(name = "Live sample panel short", widthDp = 490, heightDp = 253, showBackground = true)
@Composable
fun LiveSamplePanelShortPreview() = Live(lastRead, oneGroup = true, sample = sampleReady)

@PreviewTest
@Preview(name = "Live sample panel tablet", widthDp = 840, heightDp = 900, showBackground = true)
@Composable
fun LiveSamplePanelTabletPreview() = Live(lastRead, sample = sampleReady, lastTake = true)

// Caught 135 ms into the 300 of a tap's opening (45%; 94% of the way down, Material's emphasised decelerate
// being quick off the mark): the panel nearly unrolled out of the line, its tab gone down with it, the display
// most of the way in and the controls' rows coming after it, the function keys fading, the pads gliding down.
@PreviewTest
@Preview(name = "Live sample unroll", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSampleUnrollPreview() = Live(lastRead, oneGroup = true, sample = sampleReady, unroll = 0.936f)

// The tab pulled 30% of the way down: the tab under the finger, the panel out of the line as far, its display
// fading in as it comes out, the keys going and the pads moved down as far.
@PreviewTest
@Preview(name = "Live sample pull", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSamplePullPreview() = Live(lastRead, oneGroup = true, sample = sampleReady, unroll = 0.3f, pulled = true)

// SAMPLE's review sheet after a take into A 3: 4 s of RSP ST, a breath of silence before a decaying
// chord, trimmed to where the sound starts and short of its tail; the next free slot after 1 to 213.
private const val REVIEW_RATE = 48_000
private val reviewPcm = ShortArray(REVIEW_RATE * 4 * 2) { i ->
    val f = i / 2 - REVIEW_RATE * 3 / 10
    if (f < 0) {
        0
    } else {
        val t = f.toDouble() / REVIEW_RATE
        val v = (kotlin.math.sin(t * 2 * Math.PI * 220) + 0.6 * kotlin.math.sin(t * 2 * Math.PI * (if (i % 2 == 0) 330.0 else 277.0))) * 16000 * kotlin.math.exp(-t * 1.1)
        v.toInt()
    }.toShort()
}

/** The take's wave, as the SAMPLE panel's display draws the last one. */
private val takePeaks by lazy { dev.arc.ep133.features.SampleEdit.peaks(reviewPcm, 2, dev.arc.ep133.controller.REVIEW_COLUMNS) }

private fun reviewOf(occupied: Set<Int>?): dev.arc.ep133.controller.SampleReview {
    val r = dev.arc.ep133.controller.sampleReviewOf(
        PhysicalPad(0, 2), rspSt, reviewPcm, 2, REVIEW_RATE, dev.arc.ep133.features.SampleCapture.End.STOPPED, latched = false,
        name = "rsp 1007-142301", normalize = true, trimSilence = true, occupied = occupied,
    )
    return dev.arc.ep133.controller.trimReview(r, r.start, r.length - REVIEW_RATE / 2).copy(trimSilence = true)
}

@Composable
private fun SampleSheet(review: dev.arc.ep133.controller.SampleReview, dark: Boolean = false, playing: Boolean = false) {
    val mirror = MirrorUi(lastRead, loading = false)
    val sample = SampleUi(sampleReady.copy(input = rspSt, gainDb = 0f), still = true)
    // On its side the line rides in the top bar, as on Live.
    Framed(Tab.LIVE, dark = dark, pill = { LivePill(mirror, dev.arc.ep133.ui.screens.KeysUi(), still = true, sample = sample) }) {
        MirrorScreen(
            mirror = mirror, nameOf = { names[it] }, fixedNow = NOW, oneGroup = true,
            sample = sample,
        )
        ArcSheet(visible = true, onDismiss = {}) {
            SampleReviewSheetContent(
                review = review, playing = playing, haptics = false,
                onTrim = { _, _ -> }, onNormalize = {}, onTrimSilence = {}, onSlot = {},
                onPlay = {}, onStop = {}, onRetake = {}, onKeep = {}, onDiscard = {},
            )
        }
    }
}

@PreviewTest
@Preview(name = "Sample review", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun SampleReviewPreview() = SampleSheet(reviewOf((1..213).toSet()))

@PreviewTest
@Preview(name = "Sample review dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun SampleReviewDarkPreview() = SampleSheet(reviewOf((1..213).toSet()), dark = true, playing = true)

@PreviewTest
@Preview(name = "Sample review small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun SampleReviewSmallPreview() = SampleSheet(reviewOf((1..213).toSet()))

// On its side: the take on the left, the choices and keys on the right.
@PreviewTest
@Preview(name = "Sample review sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun SampleReviewSidewaysPreview() = SampleSheet(reviewOf((1..213).toSet()))

// Offline: the slot is picked when the EP-133 connects.
@PreviewTest
@Preview(name = "Sample review offline", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun SampleReviewOfflinePreview() = SampleSheet(reviewOf(null))

// Wider than tall but short of 8 white keys: the grid stays.
@PreviewTest
@Preview(name = "Live keys grid fallback", widthDp = 400, heightDp = 360, showBackground = true)
@Composable
fun LiveKeysGridFallbackPreview() = Live(sideways, keys = chord)

/**
 * The 692 dp bar's middle, between the LIVE tag and the icons, where the display line is:
 * measured off a render, since the bar reports it a frame after a screenshot is taken. So the
 * toast preview checks the toast's look and fit in that place, not that the bar reports it
 * (a device check).
 */
private val SmallBarMiddle = DpRect(101.dp, 6.dp, 455.dp, 50.dp)

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

// On its side, the device is one line, so the backups show without scrolling.
@PreviewTest
@Preview(name = "Main connected sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun MainConnectedSidewaysPreview() = Main(connectedState)

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
private fun Device(section: Int = 0, open: Int? = null, playing: String? = null, connected: Boolean = true, dark: Boolean = false, guide: Boolean = false, slot: Int? = null) {
    val state = if (connected) deviceState else UiState(libraryLoaded = true)
    Framed(Tab.DEVICE, connected = connected, dark = dark, guide = guide) {
        DeviceScreen(
            state = state, onRefresh = {}, onSoundDetails = {}, onProjectSounds = {}, onAddSamples = {},
            playing = playing, initialSection = section, initialOpen = open, initialSlot = slot,
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

// A tablet on its side: the projects and the sounds binder side by side, project 3's sounds badged.
@PreviewTest
@Preview(name = "Device wide", widthDp = 1280, heightDp = 800, showBackground = true)
@Composable
fun DeviceWidePreview() = Device(section = 1, open = 3, slot = 2, playing = "device:3")

@PreviewTest
@Preview(name = "Device wide dark", widthDp = 1280, heightDp = 800, showBackground = true)
@Composable
fun DeviceWideDarkPreview() = Device(section = 1, open = 3, slot = 2, playing = "device:3", dark = true)

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

// Half a second of a made-up kick (a falling sine, fading out), as a picked file to trim.
private val kickWav: ByteArray = run {
    val rate = 46875
    val n = rate / 2
    val pcm = ByteArray(n * 2)
    var phase = 0.0
    for (i in 0 until n) {
        val t = i.toDouble() / rate
        phase += 2 * Math.PI * (45 + 120 * Math.exp(-t * 30)) / rate
        val v = (Math.sin(phase) * Math.exp(-t * 7) * 30_000).toInt()
        pcm[i * 2] = v.toByte()
        pcm[i * 2 + 1] = (v shr 8).toByte()
    }
    dev.arc.ep133.formats.Wav.encode(pcm, 1, rate)
}

// On its side the trim sheet is two columns, so it fits without scrolling.
@PreviewTest
@Preview(name = "Trim sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun TrimSidewaysPreview() {
    Framed(Tab.DEVICE) {
        DeviceScreen(state = deviceState, onRefresh = {}, onSoundDetails = {}, onProjectSounds = {}, onAddSamples = {})
        ArcSheet(visible = true, onDismiss = {}) {
            TrimSheetContent(
                item = UploadDraftItem("kick 808.wav", "kick 808", 8, kickWav, null, trim = 2_000 until 18_000, sampleRate = 46875),
                playing = null,
                onPlay = { _, _, _ -> },
                onStop = {},
                onDone = {},
                onCancel = {},
                decoded = dev.arc.ep133.formats.Wav.decode(kickWav),
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
            onGetFactory = {},
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

@PreviewTest
@Preview(name = "Settings sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun SettingsSidewaysPreview() = Settings(dark = false)

// A tablet: the sections listed on the left, the plates beside them.
@PreviewTest
@Preview(name = "Settings tablet", widthDp = 1280, heightDp = 800, showBackground = true)
@Composable
fun SettingsTabletPreview() = Settings(dark = false)

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
        MirrorScreen(mirror = MirrorUi(playing), nameOf = { names[it] }, fixedNow = NOW, oneGroup = true)
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
