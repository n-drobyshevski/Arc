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
import dev.arc.ep133.ui.components.LateKey
import dev.arc.ep133.ui.components.SampleKey
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
import dev.arc.ep133.ui.screens.TempoPage
import dev.arc.ep133.ui.screens.TimingUi
import dev.arc.ep133.ui.screens.LiveArp
import dev.arc.ep133.ui.screens.LiveScene
import dev.arc.ep133.ui.screens.LiveStep
import dev.arc.ep133.controller.ClipMode
import dev.arc.ep133.controller.ClipUi
import dev.arc.ep133.controller.PadStage
import dev.arc.ep133.controller.SceneGroupUi
import dev.arc.ep133.controller.SceneUi
import dev.arc.ep133.features.SwitchTime
import dev.arc.ep133.controller.StepNote
import dev.arc.ep133.controller.StepUi
import dev.arc.ep133.controller.ArpUi
import dev.arc.ep133.features.ArpNote
import dev.arc.ep133.features.ArpOrder
import dev.arc.ep133.features.ArpSettings
import dev.arc.ep133.features.TimingSettings
import dev.arc.ep133.ui.screens.PatternSheetContent
import dev.arc.ep133.ui.screens.FxPage
import dev.arc.ep133.ui.screens.FxSheetContent
import dev.arc.ep133.ui.screens.FxUi
import dev.arc.ep133.ui.screens.PunchUi
import dev.arc.ep133.features.Comp
import dev.arc.ep133.features.FxSettings
import dev.arc.ep133.features.FxType
import dev.arc.ep133.features.Sidechain
import dev.arc.ep133.ui.screens.TakeUi
import dev.arc.ep133.ui.screens.TransportUi
import dev.arc.ep133.features.PatternPosition
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TransportPhase
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
    /** Live's mic key in the top bar, as MainActivity has it on Live (here unlit unless given). */
    sample: SampleKey? = if (tab == Tab.LIVE) SampleKey(false) {} else null,
    /** Live's Bluetooth key in the top bar, while the sound goes to Bluetooth. */
    late: LateKey? = null,
    /** The connection key's ring part-way, as while it is held. */
    holdProgress: Float = 0f,
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
                        connected = connected, canConnect = true,
                        onConnect = {}, onDisconnect = {}, onHint = {}, haptics = false, onDebug = {}, onSettings = {}, onHelp = {},
                        guideOpen = guideOpen, onGuide = {},
                        guide = { GuideScreen(onBack = {}) },
                        middle = pill.takeIf { tab == Tab.LIVE && liveInBar(LocalArcWindow.current) },
                        initialMenuOpen = menu,
                        sample = sample,
                        late = late,
                        holdProgress = holdProgress,
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
private fun Live(state: MirrorState, loading: Boolean = false, dark: Boolean = false, oneGroup: Boolean = false, guide: Boolean = false, tools: Boolean = false, offline: String? = null, noteOpen: Boolean = false, playingPads: Set<PhysicalPad> = emptySet(), keys: dev.arc.ep133.ui.screens.KeysUi = dev.arc.ep133.ui.screens.KeysUi(), rec: dev.arc.ep133.features.RecState = dev.arc.ep133.features.RecState.Idle, takes: List<dev.arc.ep133.data.TakeInfo> = emptyList(), piano: IntRange? = null, toast: String? = null, barMiddle: DpRect? = null, edit: Boolean? = null, toastAction: String? = null, wireless: Boolean = false, error: String? = null, getFactory: Boolean = false, offlineProjects: List<Int> = emptyList(), clickOn: Boolean = false, sample: SampleUiState? = null, unroll: Float? = null, lastTake: Boolean = false, transport: TransportUi? = null, ptn: Boolean = false, fx: FxType = FxType.NONE, punch: PunchUi? = null, arp: LiveArp? = null, voices: Set<String>? = null, step: LiveStep? = null, scene: LiveScene? = null, holdProgress: Float = 0f) {
    val mirror = MirrorUi(state, loading = loading, error = error, offline = offline, offlineProjects = offlineProjects)
    // PROJECT as MainActivity works it out; TEMPO's light caught on a beat while the click is on; FX named on its light,
    // held while [punch] gives the punch-ins.
    val functions = FunctionKeysUi(project = projectKeyOf(mirror, busy = false), clickOn = clickOn, beatLit = clickOn, fx = fx, fxHeld = punch != null)
    // The SAMPLE panel, as MainActivity has it: the meter caught at a level, its threshold tick where the
    // knob has it, the last take's wave where [lastTake]. Without [sample], the panel closed, as the app has it in
    // PADS: the mic key in the top bar unlit, and nothing on the page.
    val sampleUi = SampleUi(sample ?: SampleUiState(), level = { 0.62f }, lastTake = if (lastTake) takePeaks else null, still = true, unroll = unroll, hasPattern = ptn, pattern = ptn)
    // TAKE in Live tools, its badge on the line while [rec] records.
    val takeUi = TakeUi(rec) {}
    // The piano's notes, for the display line in the bar to name a device note past them. The
    // piano reports them a frame late, after the screenshot, so [piano] gives them up front.
    var pianoRange by remember { mutableStateOf(piano) }
    // The voices sounding, as the phone reports them ([voices]: the arp's steps lit); null leaves the rings as given.
    val voiceFlow = remember(voices) { voices?.let { kotlinx.coroutines.flow.MutableStateFlow(it) } }
    // STEP, as MainActivity always has it with the pattern's transport: its chip on the stopped line, the panel where [step] opens it.
    val stepUi = step ?: transport?.let { LiveStep() }
    // SCENES, as MainActivity always has it with the pattern's transport: its chip on the stopped line, the panel where [scene] opens it.
    val sceneUi = scene ?: transport?.let { LiveScene(still = true) }
    Framed(
        Tab.LIVE, connected = offline == null && error == null, dark = dark, guide = guide,
        pill = { LivePill(mirror, keys, transport, takeUi, still = true, pianoRange = pianoRange, editing = edit == true, sample = sampleUi, punch = punch?.held.orEmpty(), arp = arp?.ui?.line, voices = voiceFlow, step = stepUi, scene = sceneUi, sceneOpens = oneGroup && !keys.on) }, toast = toast, barMiddle = barMiddle,
        toastAction = toastAction,
        sample = SampleKey(sampleUi.state.on && !keys.on) {},
        late = LateKey {}.takeIf { wireless },
        holdProgress = holdProgress,
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
            transport = transport,
            take = takeUi,
            takes = dev.arc.ep133.ui.screens.TakesUi(
                list = takes,
                playing = takes.firstOrNull()?.name,
                fmtWhen = { if (it == TAKE_AT) "Oct 5, 2:23 PM" else "Oct 4, 9:41 PM" },
                connected = offline == null,
            ),
            // EDIT, SOUND's key, as on the Live tab: on where [edit] says so.
            edit = dev.arc.ep133.ui.screens.EditUi(on = edit == true, onEdit = {}),
            functions = functions,
            punch = punch ?: PunchUi(),
            sample = sampleUi,
            voices = voiceFlow,
            arp = arp,
            step = stepUi,
            scene = sceneUi,
            onSettings = {},
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

// All four groups have no plate to print KEYS / PADS on: the mode is in the tools.
@PreviewTest
@Preview(name = "Live all groups tools", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveAllGroupsToolsPreview() = Live(playing, tools = true)

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

// Live's sound goes to Bluetooth, and no pad has been hit on the device yet: the top bar keeps the
// Bluetooth key (the Bluetooth glyph and a clock, in amber) before the connection key; the line says "Press a pad".
private val wirelessState = playing.copy(lastHit = null)

@PreviewTest
@Preview(name = "Live bluetooth", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveBluetoothPreview() = Live(wirelessState, oneGroup = true, wireless = true)

@PreviewTest
@Preview(name = "Live bluetooth all groups", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun LiveBluetoothAllPreview() = Live(wirelessState, wireless = true)

@PreviewTest
@Preview(name = "Live bluetooth dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveBluetoothDarkPreview() = Live(playing, dark = true, oneGroup = true, wireless = true, transport = patternUi(canUndo = true))

// A 360 dp phone: the tag, the four keys and what is left between them.
@PreviewTest
@Preview(name = "Live bluetooth 360", widthDp = 360, heightDp = 740, showBackground = true)
@Composable
fun LiveBluetooth360Preview() = Live(wirelessState, oneGroup = true, wireless = true, transport = patternUi(canUndo = true))

// The ? overlay tags the key too.
@PreviewTest
@Preview(name = "Guide overlay Live bluetooth", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun GuideOverlayLiveBluetoothPreview() = Live(playing, oneGroup = true, guide = true, wireless = true)

// A tap on the key: the sentence it reads, as a toast.
@PreviewTest
@Preview(name = "Live bluetooth toast", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveBluetoothToastPreview() = Live(playing, oneGroup = true, wireless = true, transport = patternUi(canUndo = true), toast = MirrorText.wirelessMadeUp(180))

// The connection key held while connected: a ring fills round its edge over a second, then the EP-133 disconnects.
// A tap only shows "Hold to disconnect".
@PreviewTest
@Preview(name = "Top bar disconnect hold", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun TopBarDisconnectHoldPreview() = Live(playing, oneGroup = true, holdProgress = 0.6f)

@PreviewTest
@Preview(name = "Top bar disconnect hold dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun TopBarDisconnectHoldDarkPreview() = Live(playing, dark = true, oneGroup = true, holdProgress = 0.6f)

@PreviewTest
@Preview(name = "Top bar disconnect hold 360 bluetooth", widthDp = 360, heightDp = 740, showBackground = true)
@Composable
fun TopBarDisconnectHold360Preview() = Live(wirelessState, oneGroup = true, wireless = true, holdProgress = 0.3f, toast = dev.arc.ep133.text.NavText.HOLD_TO_DISCONNECT)

// On its side the line sits in the top bar beside the key, its chips glyphs alone.
@PreviewTest
@Preview(name = "Live bluetooth sideways small", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LiveBluetoothSidewaysSmallPreview() = Live(playing, oneGroup = true, wireless = true, transport = patternUi())

// KEYS: the line has its mode word and the note, the key stays in the bar.
@PreviewTest
@Preview(name = "Live bluetooth keys", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveBluetoothKeysPreview() = Live(keysPlaying, keys = keysUi, wireless = true, transport = patternUi(canUndo = true))

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

// The same with the sound on Bluetooth: the key rides in the top bar beside the line.
@PreviewTest
@Preview(name = "Live bluetooth keys sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveBluetoothKeysSidewaysPreview() = Live(sideways, keys = chord, piano = 48..72, wireless = true, transport = patternUi(canUndo = true))

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

// TEMPO held, its TIMING tab: 1/16 swung to 56%, quantized; the arp as played over one octave, gate 50%, latched.
@PreviewTest
@Preview(name = "Tempo sheet timing", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TempoSheetTimingPreview() = TempoSheet(deviceBpm = null, timing = timingUi)

// At 1/8T swing rests, saying where it plays; free time, the arp up and down over two octaves.
@PreviewTest
@Preview(name = "Tempo sheet timing dark", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TempoSheetTimingDarkPreview() = TempoSheet(
    deviceBpm = null,
    timing = TimingUi(TimingSettings(Timing.EIGHTH_T, 56, quantize = false), ArpSettings(ArpOrder.UP_DOWN, octaves = 2, gate = 80)),
    dark = true,
)

private val timingUi = TimingUi(TimingSettings(Timing.SIXTEENTH, 56, quantize = true), ArpSettings(latch = true))

@Composable
private fun TempoSheet(deviceBpm: Double?, timing: TimingUi? = null, dark: Boolean = false) {
    Framed(Tab.LIVE, dark = dark) {
        MirrorScreen(mirror = MirrorUi(lastRead, loading = false), nameOf = { names[it] }, fixedNow = NOW, oneGroup = true)
        ArcSheet(visible = true, onDismiss = {}) {
            TempoSheetContent(
                bpm = 98, deviceBpm = deviceBpm, on = true, onOn = {}, onBpm = {}, onTap = {}, onDone = {},
                timing = timing,
                initialPage = if (timing != null) TempoPage.TIMING else TempoPage.TEMPO,
            )
        }
    }
}

// ARP on KEYS: DO, FA and LA held in that order (outlined and numbered), FA sounding now (lit), and the
// display line saying what plays. ARP lit on the plate under KEYS / PADS, LATCH ready under it.
private val arpHeld = listOf(ArpNote(PhysicalPad(0, 9), 0), ArpNote(PhysicalPad(0, 9), 5), ArpNote(PhysicalPad(0, 9), 9))
private val keysArp = LiveArp(
    ArpUi(
        on = true, held = arpHeld, keys = true, sounding = true,
        line = dev.arc.ep133.text.MirrorText.arpLine(false, false, Timing.SIXTEENTH, arpHeld, dev.arc.ep133.features.NoteNames.SOLFEGE),
    ),
)
private val arpState = playing.copy(notes = emptyMap())

@PreviewTest
@Preview(name = "Live keys arp", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveKeysArpPreview() = Live(arpState, keys = keysUi.copy(playingNotes = emptySet()), arp = keysArp, voices = setOf("arp:0:9:5"))

// On its side, the grid picked: the plate's margin holds the switches as upright; the line rides in the top bar.
@PreviewTest
@Preview(name = "Live keys arp sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveKeysArpSidewaysPreview() = Live(
    arpState, keys = keysUi.copy(playingNotes = emptySet(), viewWide = dev.arc.ep133.features.KeysView.PADS),
    arp = keysArp, voices = setOf("arp:0:9:5"),
)

// On its side over the piano, latched: ARP and LATCH after the view words, the held notes down.
@PreviewTest
@Preview(name = "Live keys arp sideways piano", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveKeysArpSidewaysPianoPreview() = Live(
    arpState, keys = chord.copy(playingNotes = emptySet()), piano = 48..72,
    arp = LiveArp(
        ArpUi(
            on = true, latch = true, held = arpHeld, keys = true, sounding = true, settings = ArpSettings(latch = true),
            line = dev.arc.ep133.text.MirrorText.arpLine(false, true, Timing.SIXTEENTH, arpHeld, dev.arc.ep133.features.NoteNames.SOLFEGE),
        ),
    ),
    voices = setOf("arp:0:9:5"),
)

// RPT on PADS: A 7 and A 1 held, both sounding on the step (lit), the line saying so.
private val rptHeld = listOf(ArpNote(PhysicalPad(0, 9), null), ArpNote(PhysicalPad(0, 3), null))

@PreviewTest
@Preview(name = "Live pads repeat", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LivePadsRepeatPreview() = Live(
    arpState.copy(pads = emptyMap()), oneGroup = true,
    arp = LiveArp(
        ArpUi(
            on = true, held = rptHeld, keys = false, sounding = true,
            line = dev.arc.ep133.text.MirrorText.arpLine(true, false, Timing.SIXTEENTH, rptHeld, dev.arc.ep133.features.NoteNames.SOLFEGE),
        ),
    ),
    voices = setOf("arp:0:9:n", "arp:0:3:n"),
)

// FX, the fourth function key: the effect on named on its light.
@PreviewTest
@Preview(name = "Live fx key", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveFxKeyPreview() = Live(playing, oneGroup = true, fx = FxType.DELAY)

@PreviewTest
@Preview(name = "Live fx key small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LiveFxKeySmallPreview() = Live(playing, oneGroup = true, clickOn = true, fx = FxType.DISTORTION)

// On its side the column has four keys: FX's light gives the effect's three letters.
@PreviewTest
@Preview(name = "Live fx key sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveFxKeySidewaysPreview() = Live(playing, oneGroup = true, fx = FxType.REVERB)

@PreviewTest
@Preview(name = "Live fx key sideways small", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LiveFxKeySidewaysSmallPreview() = Live(playing, oneGroup = true, fx = FxType.COMPRESSOR)

// FX held: the pads are the punch-ins, REPEAT and then LPF held (their bars a third of the way: the finger low on
// the pad), the display line naming them and FX's upper half lit.
@PreviewTest
@Preview(name = "Live punch-in held", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LivePunchHeldPreview() = Live(playing, oneGroup = true, fx = FxType.DELAY, punch = PunchUi(held = linkedSetOf(3, 6), depths = mapOf(3 to 0.3f, 6 to 0.35f)))

// FX tapped: the FX sheet over Live. A delay on at 1/8D with its feedback at 38%, A (the pad played last's group,
// in signal) and D sending to it; on OUTPUT the compressor and a sidechain from A 7 ducking B and C.
private val fxDelay = FxSettings(
    type = FxType.DELAY, x = 0.625f, y = 0.4f,
    sends = listOf(0.62f, 0.2f, 0f, 0.35f),
    comp = Comp(on = true, x = 0.6f, y = 0.3f),
    sidechain = Sidechain(on = true, group = 0, pad = 9, dests = 0b0110, x = 0.26f, y = 0.7f),
)

@PreviewTest
@Preview(name = "Fx sheet effect", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun FxSheetEffectPreview() = FxSheet(FxPage.EFFECT, fxDelay)

@PreviewTest
@Preview(name = "Fx sheet effect small dark", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun FxSheetEffectSmallDarkPreview() = FxSheet(FxPage.EFFECT, fxDelay.copy(type = FxType.FILTER, x = 0.3f, y = 0.55f), dark = true)

// No effect on: the pad rests, dimmed, and says what to do.
@PreviewTest
@Preview(name = "Fx sheet effect off", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun FxSheetEffectOffPreview() = FxSheet(FxPage.EFFECT, FxSettings.DEFAULT)

// SOURCE offers the pad played last (B 1 here).
@PreviewTest
@Preview(name = "Fx sheet output", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun FxSheetOutputPreview() = FxSheet(FxPage.OUTPUT, fxDelay, selected = PhysicalPad(1, 3))

@PreviewTest
@Preview(name = "Fx sheet output small dark", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun FxSheetOutputSmallDarkPreview() = FxSheet(FxPage.OUTPUT, fxDelay, dark = true, selected = PhysicalPad(1, 3))

@Composable
private fun FxSheet(page: FxPage, settings: FxSettings, dark: Boolean = false, selected: PhysicalPad = PhysicalPad(0, 9)) {
    Framed(Tab.LIVE, dark = dark) {
        MirrorScreen(mirror = MirrorUi(playing, loading = false), nameOf = { names[it] }, fixedNow = NOW, oneGroup = true, functions = FunctionKeysUi(fx = settings.type))
        ArcSheet(visible = true, onDismiss = {}) {
            FxSheetContent(FxUi(settings, bpm = 122f, selected = selected, nameOf = { names[it] }), onDone = {}, initialPage = page)
        }
    }
}

// The pattern's RECORD and PLAY on the display line (Variant 1, "Line"), against made-up transport states: groups A
// and B have notes, A is 4 bars, B 2. Stopped, the line is as it was with the two chips first.
private fun patternUi(
    phase: TransportPhase = TransportPhase.STOPPED,
    recording: Boolean = false,
    countIn: Int? = null,
    at: PatternPosition? = null,
    erase: Boolean = false,
    canUndo: Boolean = false,
    missing: Int = 0,
    switchTime: SwitchTime = SwitchTime.DEFAULT,
) = TransportUi(
    phase = phase,
    recording = recording,
    countIn = countIn,
    timing = Timing.SIXTEENTH,
    switchTime = switchTime,
    bars = listOf(4, 2, 1, 1),
    hasNotes = listOf(true, true, false, false),
    focusGroup = 0,
    erase = erase,
    canUndo = canUndo,
    missing = missing,
    notePads = setOf(PhysicalPad(0, 9), PhysicalPad(0, 10), PhysicalPad(0, 6), PhysicalPad(0, 7), PhysicalPad(0, 3)),
    position = { at },
)

// The pads the pattern is playing, ringed as the phone's voices are.
private val patternPads = setOf(PhysicalPad(0, 9), PhysicalPad(0, 6))

@PreviewTest
@Preview(name = "Live pattern stopped", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LivePatternStoppedPreview() = Live(playing, oneGroup = true, transport = patternUi(canUndo = true))

// RECORD tapped: its light blinks (caught lit), and the line says what PLAY does.
@PreviewTest
@Preview(name = "Live pattern armed", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LivePatternArmedPreview() = Live(playing, oneGroup = true, transport = patternUi(TransportPhase.ARMED))

// RECORD then PLAY: the click counts a bar in, beat 3 of 4 big on the line.
@PreviewTest
@Preview(name = "Live pattern count-in", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LivePatternCountInPreview() = Live(playing, oneGroup = true, clickOn = true, transport = patternUi(TransportPhase.COUNT_IN, recording = true, countIn = 3))

// Recording, bar 2 beat 3 of A's 4 bars at 1/16: RECORD lit, the line framed in signal, its hairline 3/8 along.
@PreviewTest
@Preview(name = "Live pattern recording", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LivePatternRecordingPreview() = Live(
    playing, oneGroup = true, playingPads = patternPads,
    transport = patternUi(TransportPhase.PLAYING, recording = true, at = PatternPosition(2, 3, 4, 0.375f), canUndo = true),
)

@PreviewTest
@Preview(name = "Live pattern recording dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LivePatternRecordingDarkPreview() = Live(
    playing, dark = true, oneGroup = true, playingPads = patternPads,
    transport = patternUi(TransportPhase.PLAYING, recording = true, at = PatternPosition(2, 3, 4, 0.375f), canUndo = true),
)

@PreviewTest
@Preview(name = "Live pattern recording small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LivePatternRecordingSmallPreview() = Live(
    playing, oneGroup = true, playingPads = patternPads,
    transport = patternUi(TransportPhase.PLAYING, recording = true, at = PatternPosition(2, 3, 4, 0.375f), canUndo = true),
)

// Playing: PLAY reads ■, ERASE and ↶ on the line, the counter and its hairline in the display's ink; a take
// records too, its badge on the line.
@PreviewTest
@Preview(name = "Live pattern playing", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LivePatternPlayingPreview() = Live(
    playing, oneGroup = true, playingPads = patternPads, rec = dev.arc.ep133.features.RecState.Recording(12),
    transport = patternUi(TransportPhase.PLAYING, at = PatternPosition(1, 2, 4, 0.0625f), canUndo = true),
)

// ERASE latched while it plays: the pads with notes dotted, the rest dimmed.
@PreviewTest
@Preview(name = "Live pattern erase", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LivePatternErasePreview() = Live(
    playing, oneGroup = true,
    transport = patternUi(TransportPhase.PLAYING, at = PatternPosition(1, 4, 4, 0.1875f), erase = true, canUndo = true),
)

// The all-groups display: the counter in its big line, the chips at its end.
@PreviewTest
@Preview(name = "Live pattern all groups", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun LivePatternAllGroupsPreview() = Live(
    playing, playingPads = patternPads,
    transport = patternUi(TransportPhase.PLAYING, recording = true, at = PatternPosition(2, 3, 4, 0.375f), canUndo = true),
)

// KEYS: the same chips before the KEYS line.
@PreviewTest
@Preview(name = "Live pattern keys", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LivePatternKeysPreview() = Live(keysPlaying, keys = keysUi, transport = patternUi(TransportPhase.ARMED))

// On its side the line rides in the top bar: the chips icon-only.
@PreviewTest
@Preview(name = "Live pattern sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LivePatternSidewaysPreview() = Live(
    playing, oneGroup = true, playingPads = patternPads,
    transport = patternUi(TransportPhase.PLAYING, recording = true, at = PatternPosition(2, 3, 4, 0.375f), canUndo = true),
)

@PreviewTest
@Preview(name = "Live pattern sideways small", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LivePatternSidewaysSmallPreview() = Live(playing, oneGroup = true, rec = dev.arc.ep133.features.RecState.Recording(12), transport = patternUi(TransportPhase.ARMED))

// The narrowest phone at its tightest: playing in ERASE with a take recording and something to undo. RECORD's word,
// ↶ and TAKE's word give way; ERASE (on) and the counter stay whole.
@PreviewTest
@Preview(name = "Live pattern erase small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LivePatternEraseSmallPreview() = Live(
    playing, oneGroup = true, rec = dev.arc.ep133.features.RecState.Recording(72),
    transport = patternUi(TransportPhase.PLAYING, at = PatternPosition(3, 4, 4, 0.6875f), erase = true, canUndo = true),
)

// A tablet upright: the line keeps to the pads' width, so while stopped it keeps its own words whole and ERASE and ↶
// wait for the pattern to run (or the sheet).
@PreviewTest
@Preview(name = "Live pattern tablet", widthDp = 840, heightDp = 900, showBackground = true)
@Composable
fun LivePatternTabletPreview() = Live(playing, oneGroup = true, transport = patternUi(canUndo = true))

// KEYS on a tablet's piano: the chips on the KEYS line, the counter in its words' place.
@PreviewTest
@Preview(name = "Live pattern tablet piano", widthDp = 800, heightDp = 1232, showBackground = true)
@Composable
fun LivePatternTabletPianoPreview() = Live(
    sideways, keys = chord.copy(viewTall = dev.arc.ep133.features.KeysView.PIANO),
    transport = patternUi(TransportPhase.PLAYING, recording = true, at = PatternPosition(2, 3, 4, 0.375f), canUndo = true),
)

// KEYS on its side: the KEYS line in the top bar, the chips icon-only.
@PreviewTest
@Preview(name = "Live pattern keys sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LivePatternKeysSidewaysPreview() = Live(
    sideways, keys = chord, piano = 48..72,
    transport = patternUi(TransportPhase.PLAYING, at = PatternPosition(1, 2, 4, 0.0625f), canUndo = true),
)

// RECORD held: the pattern sheet over Live, group A picked; two pads not loaded yet.
// STEP (layout A): the STEP chip on the stopped line unrolls the line into the STEP panel over the function keys, all on its
// dark screen. A 2-bar pattern at 1/16, the cursor on 1.2.1 with the kick and the closed hat on it: RECORD held and the snare
// tapped onto the step too ("+ SNARE"), the three pads lit on the grid, VEL and LEN at the first note's, BAR 1 of 2.
private val stepOccupied = List(32) { it in setOf(0, 2, 4, 6, 8, 10, 11, 12, 14, 16, 20, 24, 28) }
private val stepPanel = StepUi(
    open = true,
    group = 0,
    step = 4,
    count = 32,
    label = "1.2.1",
    bars = 2,
    page = 0,
    occupied = stepOccupied,
    lit = setOf(9 to null, 6 to null, 11 to null),
    velocity = 96,
    gate = 24,
    recordHeld = true,
    status = MirrorText.stepPlaced("SNARE"),
    interval = Timing.SIXTEENTH,
)

@PreviewTest
@Preview(name = "Live step panel", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveStepPanelPreview() = Live(lastRead, oneGroup = true, transport = patternUi(canUndo = true), step = LiveStep(stepPanel))

@PreviewTest
@Preview(name = "Live step panel dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveStepPanelDarkPreview() = Live(lastRead, dark = true, oneGroup = true, transport = patternUi(canUndo = true), step = LiveStep(stepPanel))

// NUDGE: the kick long-pressed (ringed, NUDGE at its foot and on the chip), then +: it moved to 1.2.2 and the cursor followed.
@PreviewTest
@Preview(name = "Live step nudge", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveStepNudgePreview() = Live(
    lastRead, oneGroup = true, transport = patternUi(canUndo = true),
    step = LiveStep(
        stepPanel.copy(
            step = 5, label = "1.2.2", occupied = List(32) { it in setOf(0, 2, 5, 6, 8, 10, 11, 12, 14, 16, 20, 24, 28) }, lit = setOf(9 to null),
            recordHeld = false, picked = StepNote(PhysicalPad(0, 9), null), status = MirrorText.stepNudged("KICK", "1.2.2"),
        ),
        pickedWord = "KICK",
    ),
)

// CORRECT on: a tap on the closed hat put its notes on the grid.
@PreviewTest
@Preview(name = "Live step correct", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveStepCorrectPreview() = Live(
    lastRead, oneGroup = true, transport = patternUi(canUndo = true),
    step = LiveStep(stepPanel.copy(lit = setOf(9 to null, 6 to null), recordHeld = false, correct = true, status = MirrorText.correctedLine(5))),
)

// A small phone: NUDGE and CORRECT a row of their own under the knobs; nothing said last, the status is the cursor.
@PreviewTest
@Preview(name = "Live step panel small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LiveStepPanelSmallPreview() = Live(lastRead, oneGroup = true, transport = patternUi(canUndo = true), step = LiveStep(stepPanel.copy(recordHeld = false, status = null)))

// KEYS: the KEYS sound's notes on the step light their keys (DO and SOL), the panel the same.
@PreviewTest
@Preview(name = "Live step keys", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveStepKeysPreview() = Live(
    keysPlaying.copy(notes = emptyMap()), keys = keysUi.copy(playingNotes = emptySet()), transport = patternUi(canUndo = true),
    step = LiveStep(stepPanel.copy(lit = setOf(9 to 0, 9 to 7), velocity = 110, gate = 48, recordHeld = false, status = null)),
)

// On its side, the line in the top bar: the panel in the function keys' column with its own header, the pads beside it.
@PreviewTest
@Preview(name = "Live step panel sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveStepPanelSidewaysPreview() = Live(lastRead, oneGroup = true, transport = patternUi(canUndo = true), step = LiveStep(stepPanel.copy(recordHeld = false, status = null)))

// On its side, the line on the page: it grows down the column's left into the panel, the pads beside it from the top.
@PreviewTest
@Preview(name = "Live step panel side line", widthDp = 560, heightDp = 280, showBackground = true)
@Composable
fun LiveStepPanelSideLinePreview() = Live(lastRead, oneGroup = true, transport = patternUi(canUndo = true), step = LiveStep(stepPanel.copy(recordHeld = false, status = null)))

// STEP on the all-groups page: its chip in the pattern's row under the big line; the display grows into the panel over the
// function keys, the four groups under it. Group A is the one it edits (its caption in signal orange, the kick, the closed hat
// and the snare lit on its pads).
@PreviewTest
@Preview(name = "Live step all groups", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveStepAllGroupsPreview() = Live(lastRead, transport = patternUi(canUndo = true), step = LiveStep(stepPanel.copy(recordHeld = false, status = null)))

@PreviewTest
@Preview(name = "Live step all groups dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveStepAllGroupsDarkPreview() = Live(lastRead, dark = true, transport = patternUi(canUndo = true), step = LiveStep(stepPanel))

// A small phone: the chip among RECORD, PLAY, ERASE and undo in the row, and the panel's latches in a row of their own.
@PreviewTest
@Preview(name = "Live step all groups small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LiveStepAllGroupsSmallPreview() = Live(lastRead, transport = patternUi(canUndo = true), step = LiveStep(stepPanel.copy(recordHeld = false, status = null)))

// The panel closed, the chip waiting in the row.
@PreviewTest
@Preview(name = "Live step all groups chip", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveStepAllGroupsChipPreview() = Live(lastRead, transport = patternUi(canUndo = true))

// On its side, the four groups in a row: the line in the top bar, the panel in the function keys' column.
@PreviewTest
@Preview(name = "Live step all groups sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveStepAllGroupsSidewaysPreview() = Live(lastRead, transport = patternUi(canUndo = true), step = LiveStep(stepPanel.copy(recordHeld = false, status = null)))

// The piano on a tablet, upright: the KEYS line grows into the panel over the function keys, the piano under it; the notes on
// the step (DO and SOL) outlined on its keys.
@PreviewTest
@Preview(name = "Live step piano upright", widthDp = 800, heightDp = 1232, showBackground = true)
@Composable
fun LiveStepPianoUprightPreview() = Live(
    keysPlaying.copy(notes = emptyMap()), keys = chord.copy(viewTall = dev.arc.ep133.features.KeysView.PIANO, playingNotes = emptySet()), transport = patternUi(canUndo = true),
    step = LiveStep(stepPanel.copy(lit = setOf(9 to 0, 9 to 7), velocity = 110, gate = 48, recordHeld = false, status = null)),
)

// The piano on a phone on its side: no function keys over it, so the panel is a column left of the keys (its own header), the
// piano narrower beside it; RECORD held, a key tapped onto the step ("+ KICK"), DO and SOL outlined, the key held lit.
@PreviewTest
@Preview(name = "Live step piano sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveStepPianoSidewaysPreview() = Live(
    sideways, keys = chord.copy(playingNotes = emptySet()), piano = 48..72, transport = patternUi(canUndo = true),
    step = LiveStep(stepPanel.copy(lit = setOf(9 to 0, 9 to 7), velocity = 110, gate = 48, status = MirrorText.stepPlaced("KICK"))),
)

@PreviewTest
@Preview(name = "Live step piano sideways dark", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveStepPianoSidewaysDarkPreview() = Live(
    sideways, dark = true, keys = chord.copy(playingNotes = emptySet()), piano = 48..72, transport = patternUi(canUndo = true),
    step = LiveStep(stepPanel.copy(lit = setOf(9 to 0, 9 to 7), velocity = 110, gate = 48, recordHeld = false, status = null)),
)

// The piano on a phone on its side with a key picked for NUDGE (ringed), the line in the top bar: the panel in a column left of the keys, wide enough for BAR's pages.
@PreviewTest
@Preview(name = "Live step piano side line", widthDp = 640, heightDp = 360, showBackground = true)
@Composable
fun LiveStepPianoSideLinePreview() = Live(
    sideways, keys = chord.copy(playingNotes = emptySet(), scale = dev.arc.ep133.features.Scale.MAJOR), piano = 48..60, transport = patternUi(canUndo = true),
    step = LiveStep(
        stepPanel.copy(lit = setOf(9 to 0, 9 to -5), picked = StepNote(PhysicalPad(0, 9), -5), recordHeld = false, status = MirrorText.stepNudged("SO", "1.2.2")),
        pickedWord = "SO",
    ),
)

// KEYS' grid on its side: the panel in the function keys' column (the view words and the picks keep theirs), the keys narrower beside it.
@PreviewTest
@Preview(name = "Live step keys sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveStepKeysSidewaysPreview() = Live(
    sideways, keys = chord.copy(playingNotes = emptySet(), viewWide = dev.arc.ep133.features.KeysView.PADS), transport = patternUi(canUndo = true),
    step = LiveStep(stepPanel.copy(lit = setOf(9 to 0, 9 to 7), velocity = 110, gate = 48, recordHeld = false, status = null)),
)

@PreviewTest
@Preview(name = "Live step keys sideways dark", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveStepKeysSidewaysDarkPreview() = Live(
    sideways, dark = true, keys = chord.copy(playingNotes = emptySet(), viewWide = dev.arc.ep133.features.KeysView.PADS), transport = patternUi(canUndo = true),
    step = LiveStep(stepPanel.copy(lit = setOf(9 to 0, 9 to 7), velocity = 110, gate = 48, recordHeld = false, status = null)),
)

// PLAY folded the panel; CORRECT stays lit on the line, and the snare held as it plays has put 3 notes on the grid.
@PreviewTest
@Preview(name = "Live step correct playing", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveStepCorrectPlayingPreview() = Live(
    playing, oneGroup = true, voices = emptySet(),
    transport = patternUi(TransportPhase.PLAYING, at = PatternPosition(1, 3, 2, 0.25f), canUndo = true),
    step = LiveStep(StepUi(correct = true, status = MirrorText.correctedLine(3))),
)

@PreviewTest
@Preview(name = "Live step correct playing dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveStepCorrectPlayingDarkPreview() = Live(
    playing, dark = true, oneGroup = true, voices = emptySet(),
    transport = patternUi(TransportPhase.PLAYING, at = PatternPosition(1, 3, 2, 0.25f), canUndo = true),
    step = LiveStep(StepUi(correct = true, status = MirrorText.correctedLine(3))),
)

// SCENES (layout B): the S02 chip after PLAY on the stopped line unrolls the line into the SCENE panel over the function keys,
// all on its dark screen: ▶, the scene's − and + and the status in the line's own row, the four groups' columns, COMMIT, CLR,
// CHANGE and the CLIP row. Project here: scene 2 of 3 = A01 B03 C01 D02; B has notes in 01-03, 05, 06, 09 and 12, and is 4 bars.
private val sceneGroups = listOf(
    SceneGroupUi(1, null, setOf(1, 2, 4), 3, 2),
    SceneGroupUi(3, null, setOf(1, 2, 3, 5, 6, 9, 12), 4, 4),
    SceneGroupUi(1, null, setOf(1, 3), 2, 1),
    SceneGroupUi(2, null, setOf(1, 2), 3, 1),
)
private val scenePanel = SceneUi(open = true, index = 1, count = 3, label = "S02", group = 0, groups = sceneGroups, switchTime = SwitchTime.BAR)

// Open while stopped: nothing said yet, so the status is where the scene is.
@PreviewTest
@Preview(name = "Live scene panel", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveScenePanelPreview() = Live(lastRead, oneGroup = true, transport = patternUi(canUndo = true), scene = LiveScene(scenePanel, still = true))

@PreviewTest
@Preview(name = "Live scene panel dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveScenePanelDarkPreview() = Live(lastRead, dark = true, oneGroup = true, transport = patternUi(canUndo = true), scene = LiveScene(scenePanel, still = true))

// Playing with B waiting for pattern 5 at the bar's end: its number reads 03→05 (blinking, caught lit), the column and the group
// key outlined in signal orange; ■ stops it, and the panel stays open with the pads playable under it.
private val sceneQueued = scenePanel.copy(
    groups = sceneGroups.mapIndexed { g, c -> if (g == 1) c.copy(queued = 5) else c },
    status = MirrorText.queuedLine(MirrorText.groupMove(1, 5), SwitchTime.BAR),
)

@PreviewTest
@Preview(name = "Live scene panel playing", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveScenePanelPlayingPreview() = Live(
    playing, oneGroup = true, playingPads = patternPads, voices = emptySet(),
    transport = patternUi(TransportPhase.PLAYING, at = PatternPosition(2, 3, 4, 0.375f), canUndo = true),
    scene = LiveScene(sceneQueued.copy(group = 1), running = true, still = true),
)

// The 1–99 grid over the pads, from B's number: patterns with notes filled, the one playing orange, the next free one outlined.
@PreviewTest
@Preview(name = "Live scene grid", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSceneGridPreview() = Live(
    lastRead, oneGroup = true, transport = patternUi(canUndo = true),
    scene = LiveScene(scenePanel.copy(group = 1, gridGroup = 1, status = MirrorText.gridStatus(1)), still = true),
)

@PreviewTest
@Preview(name = "Live scene grid dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSceneGridDarkPreview() = Live(
    lastRead, dark = true, oneGroup = true, transport = patternUi(canUndo = true),
    scene = LiveScene(scenePanel.copy(group = 1, gridGroup = 1, status = MirrorText.gridStatus(1)), still = true),
)

// COMMIT: S03 made after S02, with copies of the patterns in free slots (A03 B04 C02 D03).
@PreviewTest
@Preview(name = "Live scene commit", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSceneCommitPreview() = Live(
    lastRead, oneGroup = true, transport = patternUi(canUndo = true),
    scene = LiveScene(
        scenePanel.copy(
            index = 2, count = 4, label = "S03",
            groups = listOf(3, 4, 2, 3).mapIndexed { g, n -> SceneGroupUi(n, null, sceneGroups[g].filled + n, n + 1, sceneGroups[g].bars) },
            status = MirrorText.sceneCommitted(2),
        ),
        still = true,
    ),
)

// CLR held: the key fills over its 2 s, caught a little over half way.
@PreviewTest
@Preview(name = "Live scene clear hold", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSceneClearHoldPreview() = Live(lastRead, oneGroup = true, transport = patternUi(canUndo = true), scene = LiveScene(scenePanel, holding = 0.55f, still = true))

// DEL: S05 is empty (and not the only scene), so the held key reads DEL.
@PreviewTest
@Preview(name = "Live scene delete hold", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSceneDeleteHoldPreview() = Live(
    lastRead, oneGroup = true, transport = patternUi(canUndo = true),
    scene = LiveScene(
        scenePanel.copy(
            index = 4, count = 5, label = "S05", canDelete = true,
            groups = listOf(7, 7, 2, 3).map { SceneGroupUi(it, null, emptySet(), it + 1, 1) },
        ),
        holding = 0.55f,
        still = true,
    ),
)

// CLIP · BAR: the focused group's bar pages (A is 2 bars), bar 2 copied.
@PreviewTest
@Preview(name = "Live scene bar copy", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSceneBarCopyPreview() = Live(
    lastRead, oneGroup = true, transport = patternUi(canUndo = true),
    scene = LiveScene(
        scenePanel.copy(clipMode = ClipMode.BAR, bar = 1, clip = ClipUi(ClipMode.BAR, "bar 2"), status = MirrorText.clipCopied("A bar 2")),
        still = true,
    ),
)

// CLIP · PAD: COPY waits for a pad (the pads take the tap, none plays) ...
@PreviewTest
@Preview(name = "Live scene pad copy", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveScenePadCopyPreview() = Live(
    lastRead, oneGroup = true, transport = patternUi(canUndo = true),
    scene = LiveScene(scenePanel.copy(clipMode = ClipMode.PAD, padStage = PadStage.SOURCE, status = MirrorText.PAD_TAP_SOURCE), still = true),
)

// ... and, with the kick copied, PASTE waits for the pad to paste onto (it may be in another group: C is shown).
@PreviewTest
@Preview(name = "Live scene pad paste", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveScenePadPastePreview() = Live(
    lastRead, oneGroup = true, transport = patternUi(canUndo = true),
    scene = LiveScene(
        scenePanel.copy(
            group = 2, clipMode = ClipMode.PAD, padStage = PadStage.TARGET, clip = ClipUi(ClipMode.PAD, "KICK"),
            status = MirrorText.padTapTarget("KICK"),
        ),
        still = true,
    ),
)

// A small phone: the panel and the pads under it.
@PreviewTest
@Preview(name = "Live scene panel small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun LiveScenePanelSmallPreview() = Live(lastRead, oneGroup = true, transport = patternUi(canUndo = true), scene = LiveScene(sceneQueued, still = true))

// KEYS: the panel over the keys' grid, the group's keys under it.
@PreviewTest
@Preview(name = "Live scene keys", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSceneKeysPreview() = Live(
    keysPlaying.copy(notes = emptyMap()), keys = keysUi.copy(playingNotes = emptySet()), transport = patternUi(canUndo = true),
    scene = LiveScene(scenePanel, still = true),
)

// On its side, the line in the top bar: the panel in the function keys' column with its own header, the pads beside it.
@PreviewTest
@Preview(name = "Live scene panel sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveScenePanelSidewaysPreview() = Live(lastRead, oneGroup = true, transport = patternUi(canUndo = true), scene = LiveScene(scenePanel, still = true))

// A small phone on its side, and a tablet.
@PreviewTest
@Preview(name = "Live scene panel sideways small", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LiveScenePanelSidewaysSmallPreview() = Live(lastRead, oneGroup = true, transport = patternUi(canUndo = true), scene = LiveScene(sceneQueued, still = true))

@PreviewTest
@Preview(name = "Live scene panel tablet", widthDp = 840, heightDp = 900, showBackground = true)
@Composable
fun LiveScenePanelTabletPreview() = Live(lastRead, oneGroup = true, transport = patternUi(canUndo = true), scene = LiveScene(scenePanel, still = true))

// Folded while it plays: the line reads the scene (B waiting for 5, blinking, caught lit) with the counter after it.
@PreviewTest
@Preview(name = "Live scene line playing", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSceneLinePlayingPreview() = Live(
    playing, oneGroup = true, playingPads = patternPads, voices = emptySet(),
    transport = patternUi(TransportPhase.PLAYING, at = PatternPosition(2, 3, 4, 0.375f)),
    scene = LiveScene(sceneQueued.copy(open = false), still = true),
)

@PreviewTest
@Preview(name = "Live scene line playing dark", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSceneLinePlayingDarkPreview() = Live(
    playing, dark = true, oneGroup = true, playingPads = patternPads, voices = emptySet(),
    transport = patternUi(TransportPhase.PLAYING, at = PatternPosition(2, 3, 4, 0.375f)),
    scene = LiveScene(sceneQueued.copy(open = false), still = true),
)

// The same in the top bar on its side.
@PreviewTest
@Preview(name = "Live scene line sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveSceneLineSidewaysPreview() = Live(
    playing, oneGroup = true, voices = emptySet(),
    transport = patternUi(TransportPhase.PLAYING, at = PatternPosition(2, 3, 4, 0.375f)),
    scene = LiveScene(sceneQueued.copy(open = false), still = true),
)

// Stopped, past the default: the S02 chip after ▶, the tempo and the hit staying.
@PreviewTest
@Preview(name = "Live scene line stopped", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSceneLineStoppedPreview() = Live(playing, oneGroup = true, transport = patternUi(canUndo = true), scene = LiveScene(scenePanel.copy(open = false), still = true))

@PreviewTest
@Preview(name = "Pattern sheet", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun PatternSheetPreview() = PatternSheet()

@PreviewTest
@Preview(name = "Pattern sheet dark", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun PatternSheetDarkPreview() = PatternSheet(dark = true)

@Composable
private fun PatternSheet(dark: Boolean = false) {
    val t = patternUi(canUndo = true, missing = 2, switchTime = SwitchTime.BAR)
    Framed(Tab.LIVE, dark = dark) {
        MirrorScreen(mirror = MirrorUi(lastRead, loading = false), nameOf = { names[it] }, fixedNow = NOW, oneGroup = true, transport = t, step = LiveStep())
        ArcSheet(visible = true, onDismiss = {}) {
            PatternSheetContent(t, onDone = {})
        }
    }
}

// Live tools' takes: the TAKE key, lit while a take records, its time on it.
@PreviewTest
@Preview(name = "Live tools take recording", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveToolsTakeRecordingPreview() = Live(lastRead, oneGroup = true, tools = true, offline = "Last seen Oct 5, 2:02 PM", takes = someTakes, rec = dev.arc.ep133.features.RecState.Recording(12))

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

// The display line grown into the SAMPLE panel over the function keys' place, the mic key in the top bar lit (it
// closes the panel, as Back or a swipe back does): the line's row now SAMPLE's header (its orange light, the source,
// the meter and what to do), the wave strip under it on the same dark screen, the controls on the pale plate below;
// the page's pads under it at the page's own gap, the empty pads' rings blinking (caught on), those with a sound
// ringed, the take's pad lit.
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

// Resampling the phone's sound in stereo into an empty pad, 4 s of 20: a small phone's panel, the wave strip just fitting
// over pads a finger wide (any shorter and it goes, the header still saying it all).
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

// The project has notes: BARS steps on from 16 to PTN, a take as long as the pattern.
@PreviewTest
@Preview(name = "Live sample panel bars ptn", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSamplePanelPtnPreview() = Live(lastRead, oneGroup = true, sample = sampleReady.copy(latch = true, bars = 16), ptn = true)

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

// The EP-133 short of space: takes stop sooner, and the header says so.
@PreviewTest
@Preview(name = "Live sample panel low space", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun LiveSamplePanelLowSpacePreview() = Live(lastRead, oneGroup = true, sample = sampleReady.copy(lowSpace = true, maxSeconds = 12))

// On its side, the line in the top bar: SAMPLE's header in the pill, the panel under it in the function keys' column
// without a header of its own (the wave strip and the controls), widened, the pads beside it.
@PreviewTest
@Preview(name = "Live sample panel sideways", widthDp = 867, heightDp = 388, showBackground = true)
@Composable
fun LiveSamplePanelSidewaysPreview() = Live(lastRead, oneGroup = true, sample = sampleReady.copy(phase = SamplePhase.Recording(PhysicalPad(0, 2), 7, 40, true), latch = true))

@PreviewTest
@Preview(name = "Live sample panel bar", widthDp = 692, heightDp = 336, showBackground = true)
@Composable
fun LiveSamplePanelBarPreview() = Live(lastRead, oneGroup = true, sample = sampleReady, lastTake = true)

// On its side, too narrow for the line in the top bar: the line grows down the column's left into the panel, the pads
// beside it from the top.
@PreviewTest
@Preview(name = "Live sample panel side line", widthDp = 560, heightDp = 280, showBackground = true)
@Composable
fun LiveSamplePanelSideLinePreview() = Live(lastRead, oneGroup = true, sample = sampleReady, lastTake = true)

@PreviewTest
@Preview(name = "Live sample panel short", widthDp = 490, heightDp = 253, showBackground = true)
@Composable
fun LiveSamplePanelShortPreview() = Live(lastRead, oneGroup = true, sample = sampleReady)

@PreviewTest
@Preview(name = "Live sample panel tablet", widthDp = 840, heightDp = 900, showBackground = true)
@Composable
fun LiveSamplePanelTabletPreview() = Live(lastRead, sample = sampleReady, lastTake = true)

// Caught 90 ms into the 300 of a tap's opening (87% of the way, Material's emphasised decelerate being quick off
// the mark): the line's words gone and SAMPLE's header half in, in their place, the dark screen grown most of the
// way down with the wave strip coming in, the plate unrolling from under it with its first row coming, the function
// keys fading, the pads gliding down.
@PreviewTest
@Preview(name = "Live sample unroll", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun LiveSampleUnrollPreview() = Live(lastRead, oneGroup = true, sample = sampleReady, unroll = 0.867f)

// On its side, the line on the page, caught growing down: narrowed to the panel's width first, the pads come aside
// under it, now rising beside it, never under it; the header in, the function keys fading under the plate.
@PreviewTest
@Preview(name = "Live sample side unroll", widthDp = 560, heightDp = 280, showBackground = true)
@Composable
fun LiveSampleSideUnrollPreview() = Live(lastRead, oneGroup = true, sample = sampleReady, unroll = 0.95f)

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
    // On its side the line rides in the top bar, as on Live; the mic key lit, the panel open under the sheet.
    Framed(Tab.LIVE, dark = dark, pill = { LivePill(mirror, dev.arc.ep133.ui.screens.KeysUi(), still = true, sample = sample) }, sample = SampleKey(true) {}) {
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
private val SmallBarMiddle = DpRect(97.dp, 6.dp, 451.dp, 50.dp)

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

// A 360 dp phone: the BACKUPS caption row holds Back up, search and import.
@PreviewTest
@Preview(name = "Main connected narrow", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun MainConnectedNarrowPreview() = Main(connectedState)

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

// Settings ends the list, under a thin rule, on any section.
@PreviewTest
@Preview(name = "Section menu settings", widthDp = 412, heightDp = 843, showBackground = true)
@Composable
fun SectionMenuSettingsPreview() {
    Framed(Tab.BACKUPS, menu = true) {
        MainScreen(state = connectedState, fmtDay = { "" }, onBackup = {}, onImport = {}, onOpen = {})
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
