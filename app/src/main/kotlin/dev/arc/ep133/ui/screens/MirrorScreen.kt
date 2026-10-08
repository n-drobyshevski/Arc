package dev.arc.ep133.ui.screens

import dev.arc.ep133.ui.components.EdgeTabWidth
import dev.arc.ep133.features.KeysView
import dev.arc.ep133.audio.PressTime
import androidx.compose.ui.semantics.customActions
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.runtime.mutableStateOf
import dev.arc.ep133.ui.components.SwitchRow
import dev.arc.ep133.ui.components.SettingRow
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.CaptionInfo
import dev.arc.ep133.ui.components.Disclosure
import dev.arc.ep133.ui.components.MiniPiano
import dev.arc.ep133.ui.components.SideStripWidth
import dev.arc.ep133.ui.components.SideZone
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.ui.components.CoachYellowInk
import dev.arc.ep133.ui.components.CoachYellow
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.components.coachClear
import dev.arc.ep133.ui.components.wordInk
import dev.arc.ep133.ui.components.ArcIcon
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.derivedStateOf
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.stateDescription
import dev.arc.ep133.ui.components.Segmented
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.MirrorUi
import dev.arc.ep133.controller.punchSlotForPad
import dev.arc.ep133.features.FxType
import dev.arc.ep133.features.FactorySounds
import dev.arc.ep133.features.Beat
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.PadLight
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.SampleSource
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.NoteEvent
import dev.arc.ep133.features.NoteTouches
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.Scale
import dev.arc.ep133.features.RecState
import dev.arc.ep133.features.PatternPosition
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TransportPhase
import dev.arc.ep133.features.TransportState
import dev.arc.ep133.data.TakeInfo
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.GuideText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.CapDx
import dev.arc.ep133.ui.components.CapDy
import dev.arc.ep133.ui.components.rotateVertical
import dev.arc.ep133.ui.components.GroupGlyphs
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.MutableState
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.graphics.shadow.Shadow
import dev.arc.ep133.ui.components.CloseKey
import dev.arc.ep133.ui.components.DisplayPanel
import dev.arc.ep133.ui.components.DisplayLine
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.LocalArcWindow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.systemGestures
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.findRootCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import dev.arc.ep133.features.Piano
import dev.arc.ep133.ui.components.ArcWindow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.runtime.CompositionLocalProvider
import kotlinx.coroutines.flow.StateFlow
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/*
 * Pads are drawn as the pocket operator app draws its pad grid: one pale
 * plate split by thin lines. A lit pad turns the signal orange, brighter with
 * velocity, and fades on release.
 */
private val FADE_NS = 300_000_000L

/** What the KEYS view shows: whether it is on, the key, scale and octave, and the sound it plays. */
data class KeysUi(
    val on: Boolean = false,
    val root: Int = 0,
    val scale: Scale = Scale.CHROMATIC,
    val octave: Int = 4,
    /** Solfège (DO RE MI) or letter (C D E) note names. */
    val names: NoteNames = NoteNames.SOLFEGE,
    /** The keys write their note names in their rings (off: rings and octave numbers only). */
    val showNames: Boolean = true,
    /** The sound KEYS plays, and its sample's name when known. */
    val pad: PhysicalPad? = null,
    val padName: String? = null,
    /** The MIDI notes playing on the phone (a chord), latest last; their keys are outlined. */
    val playingNotes: Set<Int> = emptySet(),
    /** The piano's white keys as chosen in Settings (Piano.CHOICES); null is Auto, the widest that fits. */
    val pianoWhites: Int? = null,
    /** Grid or piano, as picked with the view switch, for a wide window and for a tall one. */
    val viewWide: KeysView = KeysView.AUTO,
    val viewTall: KeysView = KeysView.AUTO,
    /** The notes held for the arp (MIDI), in the order pressed: outlined and numbered ([LiveArp]). */
    val arpHeld: List<Int> = emptyList(),
    /** The notes the arp sounds now: lit. */
    val arpLit: Set<Int> = emptySet(),
)

class KeysActions(
    val onMode: (Boolean) -> Unit = {},
    val onRoot: (Int) -> Unit = {},
    val onScale: (Scale) -> Unit = {},
    val onOctave: (Int) -> Unit = {},
    /**
     * A MIDI note pressed; it sounds until [onNoteUp]. A screen reader's Play
     * passes hold = false. [pressedAt] (System.nanoTime) is when the finger
     * came down, from the touch event ([PressTime]); [onNoteUp]'s releasedAt
     * when it left, as the pattern's gate takes it.
     */
    val onNote: (note: Int, hold: Boolean, pressedAt: Long) -> Unit = { _, _, _ -> },
    val onNoteUp: (note: Int, releasedAt: Long) -> Unit = { _, _ -> },
    /** A pad played on the device in the pads view becomes the KEYS sound. */
    val onSelect: (PhysicalPad) -> Unit = {},
    /** The view switch: grid or piano, remembered for a [wide] window or a tall one. */
    val onView: (wide: Boolean, view: KeysView) -> Unit = { _, _ -> },
)

/**
 * Live's function keys over the pads ([FunctionRow], [FunctionColumn]):
 * SOUND, PROJECT ([project], a tap [onProject] steps to the next one),
 * TEMPO, the phone's click: [clickOn] at the phone's tempo [bpm] (the
 * EP-133's leads while it sends MIDI clock), a tap [onClick] turns it on or
 * off and a hold [onTempo] opens the tempo sheet, and FX ([fx], the effect
 * on): a tap [onFx] opens the FX sheet, a hold [onFxHold] the punch-ins.
 * [beats] blink TEMPO's light (the click's, or the EP-133's while it is off);
 * null leaves it still.
 */
class FunctionKeysUi(
    /** SOUND held: the sheet of the pad played last (null for none); its tap is Live's EDIT ([EditUi]). */
    val onPadSound: (() -> Unit)? = null,
    val project: ProjectKeyUi = ProjectKeyUi(),
    val onProject: () -> Unit = {},
    /** PROJECT held and let go of: the project sheet. */
    val onPickProject: () -> Unit = {},
    /** PROJECT held and a pad printed 1 to 9 tapped: that project. */
    val onSelectProject: (Int) -> Unit = {},
    val clickOn: Boolean = false,
    val bpm: Int = Tempo.DEFAULT,
    val beats: StateFlow<Beat?>? = null,
    val onClick: (Boolean) -> Unit = {},
    val onTempo: () -> Unit = {},
    /** For screenshots: TEMPO's light caught lit, on a beat. */
    val beatLit: Boolean = false,
    /** The effect on, named on FX's light. */
    val fx: FxType = FxType.NONE,
    /** FX tapped: the FX sheet. */
    val onFx: () -> Unit = {},
    /** FX held down (true) and let go of (false): the pads play the punch-ins meanwhile ([fxHeld]). */
    val onFxHold: (Boolean) -> Unit = {},
    val fxHeld: Boolean = false,
)

/**
 * EDIT, the left edge tab under GUIDE (Live's pads only): while [on], a tap on
 * a pad calls [onPad] (the pad sheet, to give it another sound), and a long
 * press still plays it. A null [onEdit] hides the tab.
 */
class EditUi(
    val on: Boolean = false,
    val onEdit: ((Boolean) -> Unit)? = null,
    val onPad: (PhysicalPad) -> Unit = {},
)

/** The KEYS view switch's state: which view shows, and whether the piano has room. */
private class ViewSwitch(val piano: Boolean, val pianoEnabled: Boolean, val onPick: (KeysView) -> Unit)

/**
 * The pattern's transport on Live (an addition, after the EP-133's RECORD
 * and PLAY; null hides it): the RECORD and PLAY chips on the display line
 * ([PatternLine]), the counter while it runs, ERASE and ↶, and the pattern
 * sheet a hold on RECORD opens ([onSheet]; [PatternSheetContent]).
 */
class TransportUi(
    val phase: TransportPhase = TransportPhase.STOPPED,
    /** Pads played go into the pattern (while counting in, once it starts). */
    val recording: Boolean = false,
    /** The count-in's beat, 1 to 4, while it counts in. */
    val countIn: Int? = null,
    val timing: Timing = Timing.DEFAULT,
    /** RECORD then PLAY counts a bar in. */
    val countInOn: Boolean = true,
    val autoLength: Boolean = false,
    /** Each group's length in bars, and whether it has notes, A to D. */
    val bars: List<Int> = List(4) { Seq.DEFAULT_BARS },
    val hasNotes: List<Boolean> = List(4) { false },
    /** The group the counter follows: the one played into last. */
    val focusGroup: Int = 0,
    /** ERASE latched: a pad erases its notes instead of sounding. */
    val erase: Boolean = false,
    val canUndo: Boolean = false,
    /** Pads the pattern plays whose sounds aren't on the phone yet. */
    val missing: Int = 0,
    /** The pads with notes, dotted in ERASE. */
    val notePads: Set<PhysicalPad> = emptySet(),
    /** Where the focus group is at a System.nanoTime, null before the clock starts; read as the line draws. */
    val position: (Long) -> PatternPosition? = { null },
    /** RECORD down and up, at the touch's own times ([PressTime]). */
    val onRecordDown: (at: Long) -> Unit = {},
    val onRecordUp: (at: Long) -> Unit = {},
    /** PLAY (STOP while it runs), with RECORD held down or not. */
    val onPlay: (recordHeld: Boolean) -> Unit = {},
    /** RECORD held while stopped or armed: the pattern sheet. */
    val onSheet: () -> Unit = {},
    val onErase: (Boolean) -> Unit = {},
    val onUndo: () -> Unit = {},
    val onTiming: (Timing) -> Unit = {},
    val onCountIn: (Boolean) -> Unit = {},
    val onAutoLength: (Boolean) -> Unit = {},
    val onLength: (group: Int, bars: Int) -> Unit = { _, _ -> },
    val onDouble: (group: Int) -> Unit = {},
    /** One group's notes, or every group's (null). */
    val onClear: (group: Int?) -> Unit = {},
    /** In ERASE, a pad down and up: a tap erases its notes, a hold while playing those it passes. */
    val onErasePadDown: (pad: PhysicalPad, at: Long) -> Unit = { _, _ -> },
    val onErasePadUp: (pad: PhysicalPad, at: Long) -> Unit = { _, _ -> },
    /** In ERASE on KEYS, a key down and up, as a pad's: its note (MIDI) on the KEYS pad. */
    val onEraseNoteDown: (note: Int, at: Long) -> Unit = { _, _ -> },
    val onEraseNoteUp: (note: Int, at: Long) -> Unit = { _, _ -> },
) {
    val state: TransportState get() = TransportState(phase, recording)
}

/** TAKE (REC before RECORD was the pattern's): Live's sound recorded into a take, its [state]; [onTake] starts or stops one. */
class TakeUi(val state: RecState = RecState.Idle, val onTake: () -> Unit = {})

/** The takes in Live tools, and what their keys do. */
class TakesUi(
    val list: List<TakeInfo> = emptyList(),
    /** The key of the sound playing in the player, to show Stop on its take. */
    val playing: String? = null,
    val keyOf: (TakeInfo) -> String = { it.name },
    val fmtWhen: (Long) -> String = { "" },
    /** "To EP-133" shows only while the device is connected. */
    val connected: Boolean = false,
    val onPlay: (TakeInfo) -> Unit = {},
    val onStop: () -> Unit = {},
    val onShare: (TakeInfo) -> Unit = {},
    val onSave: (TakeInfo) -> Unit = {},
    val onToDevice: (TakeInfo) -> Unit = {},
    val onDelete: (TakeInfo) -> Unit = {},
)

/**
 * A live mirror of the EP-133 (an addition to the web version): the four
 * groups' pads light as the device plays them, with the sample on each once
 * it is known, plus play state, tempo and KEYS notes. It listens, and
 * writes only when asked: a pad's sound in EDIT, the project on PROJECT.
 *
 * [nameOf] gives the sample on a pad (null while not known); [now] is the
 * System.nanoTime of this frame, for the fade.
 */
@Composable
fun MirrorScreen(
    mirror: MirrorUi?,
    nameOf: (PhysicalPad) -> String?,
    /** Null on the Live tab, which has no close key. */
    onBack: (() -> Unit)? = null,
    /** A fixed time for screenshots; normally the screen's frame clock drives the fade. */
    fixedNow: Long? = null,
    /** One group at a time, large, with A–D keys to switch (like the pocket operator app's grid). */
    oneGroup: Boolean = false,
    onOneGroup: (Boolean) -> Unit = {},
    /** In that view, switch to the group of the pad just played. */
    follow: Boolean = true,
    onFollow: (Boolean) -> Unit = {},
    initialGroup: Int = 0,
    /** For screenshots: start with the tools panel open. */
    initialToolsOpen: Boolean = false,
    /** For screenshots: start with the offline note unfolded. */
    initialNoteOpen: Boolean = false,
    /** Not connected: download the factory sounds (FactorySounds); null when they are in the library. */
    onGetFactory: (() -> Unit)? = null,
    /** Pad changes made offline, in arc only: how many, for Live tools' row with [onResetPads]. */
    offlinePads: Int = 0,
    onResetPads: () -> Unit = {},
    /**
     * Pressing a pad plays its sample on the phone until [onPadUp] (hold is
     * false for a screen reader's Play, which plays to the end); null leaves
     * the pads still. [unsure]: a press on the scrolling all-groups page,
     * which [onPadKept] or [onPadCut] settles. [pressedAt] (System.nanoTime):
     * when the finger came down, from the touch event ([PressTime]).
     */
    onPad: ((pad: PhysicalPad, hold: Boolean, unsure: Boolean, pressedAt: Long) -> Unit)? = null,
    /** The unsure press on a pad was a press after all (no scroll within [PRESS_DELAY_MS], or a lift inside it). */
    onPadKept: (PhysicalPad) -> Unit = {},
    /** The finger left the pad, at [releasedAt] (System.nanoTime, from the touch event): the pattern's gate ends there. */
    onPadUp: (pad: PhysicalPad, releasedAt: Long) -> Unit = { _, _ -> },
    /**
     * The press on a pad of the scrolling page turned into a scroll: its sound
     * is cut short, rather than let go of ([onPadUp]).
     */
    onPadCut: (PhysicalPad) -> Unit = { onPadUp(it, System.nanoTime()) },
    /** The pads whose samples are playing on the phone (several at once for a chord), ringed. */
    playingPads: Set<PhysicalPad> = emptySet(),
    /**
     * The voices sounding on the phone, collected here where the rings are
     * drawn, so a voice starting or ending recomposes Live rather than the
     * whole app. When given, it sets [playingPads] and the KEYS notes outlined.
     */
    voices: StateFlow<Set<String>>? = null,
    /** KEYS: the pads become notes of one sound, like the EP-133's KEYS mode. */
    keys: KeysUi = KeysUi(),
    keysActions: KeysActions = KeysActions(),
    /**
     * The piano's notes while it shows (KEYS on a phone on its side), null
     * otherwise: the display line in the top bar names a device note it doesn't reach.
     */
    onPianoRange: (IntRange?) -> Unit = {},
    /** RECORD and PLAY: the pads played into a pattern that plays on the phone (null hides them). */
    transport: TransportUi? = null,
    /** TAKE: records what is played on the phone into a take, from Live tools (null hides it, and the takes). */
    take: TakeUi? = null,
    takes: TakesUi = TakesUi(),
    /** EDIT: tapping a pad gives it another sound. */
    edit: EditUi = EditUi(),
    /** A light tick as a pad or key goes down (Settings → Haptics). */
    haptics: Boolean = true,
    /** Live's sound goes to Bluetooth or a hearing aid ([LiveAudio.wireless]): the display line says it plays late. */
    wireless: Boolean = false,
    /** PROJECT, KEYS and TEMPO over the pads (KEYS is the mode word's place, but on the short sideways piano). */
    functions: FunctionKeysUi = FunctionKeysUi(),
    /**
     * The punch-ins (an addition): while FX is held ([FunctionKeysUi.fxHeld])
     * the one-group pads play them instead of their sounds, and the display
     * line names those held.
     */
    punch: PunchUi = PunchUi(),
    /**
     * SAMPLE (an addition; null for none): on the Live tab in PADS, the
     * SAMPLE panel the mic key in the top bar (or a swipe on the pads) opens:
     * the display line grows into it over the function keys' place, its row
     * SAMPLE's header ([SampleMorph]). While it is open SAMPLE mode is on: a
     * pad held records into it, and the pads light as the EP-133's do in the
     * mode.
     */
    sample: SampleUi? = null,
    /**
     * Where SAMPLE's header in the top bar ([LivePill]) finds the panel's
     * cross-fade, so it follows the panel under a finger or a reversal: how
     * far along it is (read as it draws), given while Live shows, null once
     * it doesn't.
     */
    onSampleHeader: ((() -> Float)?) -> Unit = {},
    /**
     * ARP / RPT and LATCH (an addition; null hides them): on the pads' plate
     * under KEYS / PADS ([ModeStrip]), over the piano, and in the tools
     * beside the four groups. While it is on the keys and pads report their
     * pressure, the notes it holds are outlined and those it sounds lit, and
     * the display line says what it plays.
     */
    arp: LiveArp? = null,
) {
    val sounding = voices?.collectAsStateWithLifecycle()?.value
    // The pads held for note repeat are ringed too, and those it sounds lit.
    val arpPads = arp?.heldPads.orEmpty()
    val ringed = (if (sounding == null) playingPads else remember(sounding) { LiveVoices.pads(sounding) }).let { if (arpPads.isEmpty()) it else it + arpPads }
    val arpLitPads = if (sounding == null) emptySet() else remember(sounding) { LiveVoices.arpPads(sounding) }
    val keysNow = arpKeys(soundingKeys(keys, sounding), arp, sounding)
    // The arp's line on the display; the pressure of a held key or pad, while it is on.
    val arpLine = arp?.ui?.line
    val notePressure = arp?.takeIf { it.ui.on }?.onNotePressure
    val padPressure = arp?.takeIf { it.ui.on }?.onPadPressure
    val c = LocalArcColors.current
    val window = LocalArcWindow.current
    // The SAMPLE panel in the function keys' place: on the Live tab, in PADS.
    val panelOn = sample != null && onBack == null && !keys.on
    // SAMPLE mode, the panel open: the display line grown into it, its header saying what goes on, the pads recording.
    val sampling = panelOn && sample?.state?.on == true
    // ERASE latched: a pad erases its notes (SAMPLE's pads record instead).
    val erasing = transport?.erase == true && !sampling
    // EDIT works on the pads only, and only on the Live tab (where the tab is); SAMPLE's pads record, ERASE's erase, instead.
    val editing = edit.on && edit.onEdit != null && !keys.on && onBack == null && !sampling && !erasing
    val onEdit = if (editing) edit.onPad else null
    // FX held: the one-group pads are the punch-ins (PADS on the Live tab, not while SAMPLE's record), their touches
    // the punch-ins' alone. The pressures seen stay with the screen, so a device's pressure is learned once.
    val pressure = remember { PressureSense() }
    val padPunch = if (functions.fxHeld && !keys.on && onBack == null && !sampling) PadPunch(punch, pressure) else null
    // The display line names the punch-ins held, over EDIT's line too.
    val punchHeld = punch.held.takeIf { padPunch != null }.orEmpty()
    // PROJECT held: the pads printed 1 to 9 pick a project instead of sounding, the rest stay still (ProjectHold).
    val hold = remember { ProjectHold() }
    // SOUND is EDIT's key: Live's EDIT where it works (the Live tab), none elsewhere.
    val editKey = if (edit.onEdit != null && onBack == null) edit else EditUi()
    // KEYS / PADS printed on the pads' plate (KoDeck): a tap shows the other mode.
    val modeStrip: @Composable (Modifier, Dp) -> Unit = { m, size -> ModeStrip(keys.on, keysActions.onMode, haptics, size, m, arp) }
    // The pads whose press went to SAMPLE (held to record, or played beside a take): their kept,
    // release and cut go there too, even if the mode closed meanwhile; the rest stay the player's.
    val samplePressed = remember { HashSet<PhysicalPad>() }
    // The pads whose press went to ERASE, held; and the unsure ones of the scrolling page, by when they went
    // down, which erase once kept (a scroll erases nothing).
    val eraseHeld = remember { HashSet<PhysicalPad>() }
    val eraseUnsure = remember { HashMap<PhysicalPad, Long>() }
    // The order a press goes: PROJECT held, SAMPLE, ERASE, then (EDIT's long press too) play.
    val padPress = onPad?.let { f ->
        { pad: PhysicalPad, h: Boolean, unsure: Boolean, at: Long ->
            if (!hold.press(pad, pad.label, functions)) {
                // A screen reader's Play (no finger to hold) plays the pad, in the mode too.
                if (sampling && h) {
                    samplePressed += pad
                    sample?.onPadDown(pad, at, unsure)
                } else if (erasing && transport != null) {
                    when {
                        // A screen reader's click: a tap.
                        !h -> {
                            transport.onErasePadDown(pad, at)
                            transport.onErasePadUp(pad, at)
                        }
                        unsure -> eraseUnsure[pad] = at
                        else -> {
                            eraseHeld += pad
                            transport.onErasePadDown(pad, at)
                        }
                    }
                } else {
                    f(pad, h, unsure, at)
                }
            }
        }
    }
    val padKept = { pad: PhysicalPad ->
        if (!hold.took(pad)) {
            val erasedAt = eraseUnsure.remove(pad)
            when {
                erasedAt != null -> {
                    eraseHeld += pad
                    transport?.onErasePadDown(pad, erasedAt)
                }
                pad in samplePressed -> sample?.onPadKept(pad)
                else -> onPadKept(pad)
            }
        }
    }
    val padUp = { pad: PhysicalPad, at: Long ->
        if (!hold.release(pad)) {
            when {
                samplePressed.remove(pad) -> sample?.onPadUp(pad, at)
                eraseHeld.remove(pad) -> transport?.onErasePadUp(pad, at)
                eraseUnsure.remove(pad) != null -> Unit
                else -> onPadUp(pad, at)
            }
        }
    }
    val padCut = { pad: PhysicalPad ->
        if (!hold.release(pad)) {
            when {
                samplePressed.remove(pad) -> sample?.onPadCut(pad)
                eraseHeld.remove(pad) -> transport?.onErasePadUp(pad, System.nanoTime())
                eraseUnsure.remove(pad) != null -> Unit
                else -> onPadCut(pad)
            }
        }
    }
    // ERASE on KEYS: a key erases its note instead of sounding.
    val keysPlay = if (erasing && keys.on && transport != null) {
        remember(keysActions, transport) {
            KeysActions(
                onMode = keysActions.onMode,
                onRoot = keysActions.onRoot,
                onScale = keysActions.onScale,
                onOctave = keysActions.onOctave,
                onNote = { note, h, at ->
                    transport.onEraseNoteDown(note, at)
                    // A screen reader's click: a tap.
                    if (!h) transport.onEraseNoteUp(note, at)
                },
                // A key held from before ERASE went on still lets go of its note (a lift of one that never sounded is nothing).
                onNoteUp = { note, at ->
                    transport.onEraseNoteUp(note, at)
                    keysActions.onNoteUp(note, at)
                },
                onSelect = keysActions.onSelect,
                onView = keysActions.onView,
            )
        }
    } else {
        keysActions
    }
    // ERASE's dots: the pads with notes.
    val eraseDots = if (erasing) transport?.notePads else null
    PatternHaptics(transport, haptics)
    // In the mode the pads light as the EP-133's do: the empty ones blink together (one transition,
    // read as they draw), those with a sound stay lit, the take's lights up.
    val padSampling = if (sampling && sample != null) {
        val still = fixedNow != null || sample.still
        val blink = if (still) {
            null
        } else {
            androidx.compose.animation.core.rememberInfiniteTransition(label = "sample").animateFloat(
                1f,
                0.15f,
                androidx.compose.animation.core.infiniteRepeatable(
                    androidx.compose.animation.core.tween(SAMPLE_BLINK_MS.toInt()),
                    androidx.compose.animation.core.RepeatMode.Reverse,
                ),
                label = "sample",
            )
        }
        val phase = sample.state.phase
        PadSampling(led = { pad -> sampleLed(pad, phase, nameOf(pad) != null) }, blink = blink, onLatch = sample.onLatchPad)
    } else {
        null
    }
    if (sampling && sample != null) SampleHaptics(sample.state, haptics, held = { it in samplePressed }, bpm = mirror?.state?.bpm ?: functions.bpm.toDouble())
    // The SAMPLE panel, wherever the layout below puts the function keys.
    val panel = remember { SamplePanel(sample?.unroll ?: if (sampling) 1f else 0f, fixed = sample?.unroll != null) }
    val panelScope = androidx.compose.runtime.rememberCoroutineScope()
    val reduceMotion = reducedMotion()
    val feel = LocalHapticFeedback.current
    // A swipe or Back: the panel unrolls or rolls up with a tick, and the mode follows.
    val openPanel = {
        if (sample != null && !panel.open) {
            if (haptics) feel.performHapticFeedback(HapticFeedbackType.SegmentTick)
            panel.start(true, reduceMotion, panelScope)
            sample.onOpen()
        }
    }
    val closePanel = {
        if (sample != null && panel.open) {
            if (haptics) feel.performHapticFeedback(HapticFeedbackType.SegmentTick)
            panel.start(false, reduceMotion, panelScope)
            sample.onClose()
        }
    }
    // The mode turned off another way (the mic key in the top bar, a sheet), or KEYS, which has no panel: it rolls
    // up (at once for KEYS, off the page). Turned on another way (the mic key, from KEYS too), it unrolls. A swipe
    // or Back has set it going already.
    LaunchedEffect(sampling, panelOn) {
        when {
            !panelOn -> if (panel.open) panel.go(false, reduce = true)
            sampling != panel.open -> panel.go(sampling, reduceMotion)
        }
    }
    val stillSample = fixedNow != null || sample?.still == true
    // The top bar's line takes its cross-fade from the panel's own timeline, while there is one.
    val sampleHeader by rememberUpdatedState(onSampleHeader)
    DisposableEffect(panel) {
        sampleHeader { panel.header }
        onDispose { sampleHeader(null) }
    }
    // The USB note's room under the panel's controls, while USB is the source ([usbNoteRoom]).
    val usbNote = usbNoteRoom(sample?.state?.input?.source == SampleSource.USB)
    val editPad = onEdit?.let { f ->
        { pad: PhysicalPad ->
            if (hold.press(pad, pad.label, functions)) hold.release(pad) else f(pad)
            Unit
        }
    }
    if (onBack != null) BackHandler(onBack = onBack)
    val st = mirror?.state ?: MirrorState()
    // The fade runs on the frame clock while a released pad is fading, and stops after.
    val fading = fixedNow == null && (st.pads.values.any { it.offAt != null } || keys.on && st.notes.values.any { it.offAt != null })
    var frame by remember { mutableLongStateOf(System.nanoTime()) }
    LaunchedEffect(fading) {
        while (fading) withFrameNanos { frame = System.nanoTime() }
    }
    // Read where it is used: the piano reads it while drawing, so a fade only redraws the keys.
    val clock = { fixedNow ?: if (fading) frame else System.nanoTime() }
    // The secondary controls live in a side panel, opened from the strip on the right.
    var toolsOpen by rememberSaveable { mutableStateOf(initialToolsOpen) }
    // The group shown in the one-group view; Follow switches it to the group just played.
    var group by rememberSaveable { mutableIntStateOf(initialGroup) }
    val hitGroup = st.lastHit?.pad?.group
    LaunchedEffect(hitGroup, st.lastHit, follow, oneGroup) {
        if (oneGroup && follow && hitGroup != null) group = hitGroup
    }
    // In the pads view, the pad just played on the device is the sound KEYS will play.
    LaunchedEffect(st.lastHit, keys.on) {
        if (!keys.on) st.lastHit?.pad?.let(keysActions.onSelect)
    }
    // On its side Live has a layout of its own, the controls in a row over the keys or pads
    // (the grid stays where no piano fits). In a short window the display line sits in the
    // top bar instead ([LivePill]).
    val sideways = window.landscape
    val inBar = onBack == null && liveInBar(window)
    val (startGutter, endGutter) = gutters(sideways)
    val reportRange by androidx.compose.runtime.rememberUpdatedState(onPianoRange)
    DisposableEffect(Unit) { onDispose { reportRange(null) } }
    BoxWithConstraints(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        // The room the page gets between its gutters (the bars above and below are already off),
        // less the display line when it is on the page.
        val safe = WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal).asPaddingValues()
        val roomW = maxWidth - safe.calculateLeftPadding(LayoutDirection.Ltr) - safe.calculateRightPadding(LayoutDirection.Ltr) - startGutter - endGutter
        val roomH = maxHeight - (if (inBar) 0.dp else DisplayLineHeight + 10.dp) - SidewaysBottom - ControlsRow
        // KEYS plays on the piano where it fits and the view switch (or, on Auto, a wide window)
        // says so. A portrait phone has no switch: there it is always the grid.
        // Only the short sideways piano goes without the function keys; elsewhere their row is over it.
        val pianoFunctions = !window.short
        val pianoH = if (pianoFunctions) minOf(roomH - functionRowHeight() - 10.dp, PianoMaxTablet) else roomH
        val fits = if (keys.on) pianoRange(keys.octave, roomW, pianoH, keys.pianoWhites) else null
        val view = if (sideways) keys.viewWide else keys.viewTall
        val piano = fits?.takeIf { Piano.showsPiano(view, sideways, window.width.value, room = true) }
        val viewSwitch = if (keys.on && Piano.switchShown(sideways, window.width.value)) {
            ViewSwitch(piano != null, fits != null) { keysActions.onView(sideways, it) }
        } else {
            null
        }
        LaunchedEffect(piano) { reportRange(piano) }
        // Four groups side by side while their pads keep 40 dp both ways (rows no taller than
        // square pads). Off the height: each group's caption (a 1.2 em line and its gap) and the
        // plate's three lines; off the width, the three gaps and each plate's two lines.
        // On its side the function keys are a column left of the pads, not a row over them, and
        // the height keeps that column's LED lines too (columnFit).
        val caption = with(LocalDensity.current) { ArcType.caps.fontSize.toDp() * 1.2f } + 8.dp
        val padW = ((roomW - SideFunctions - SideControlsGap - 42.dp) / 4 - 2.dp) / 3
        val allGroupsSideways = sideways && minOf((roomH + ControlsRow - caption - 3.dp) / 4, padW) >= 40.dp &&
            roomH + ControlsRow >= FunctionColumnLed
        // Back rolls the SAMPLE panel up (Live tools, open over it, close first: their Back comes later). Not
        // while a sheet is open over Live: its Back was there first, so this one would win.
        BackHandler(enabled = panelOn && sample?.sheetOpen != true && panel.open) { closePanel() }
        // The pads hear of a finger the SAMPLE panel's swipe took ([holdToPlay]).
        CompositionLocalProvider(LocalSamplePanel provides panel) {
            SideZone(
                open = toolsOpen,
                onOpen = { toolsOpen = true },
                onClose = { toolsOpen = false },
                title = MirrorText.TOOLS,
                panel = {
                    FactoryRow(mirror, onGetFactory)
                    OfflinePadsRow(offlinePads, onResetPads)
                    if (keys.on) {
                        KeysPanel(keys, keysActions, piano = piano != null)
                        if (take != null) TakesSection(takes, take)
                    } else {
                        GridPlate {
                            SettingRow(MirrorText.VIEW, stacked = true) {
                                Segmented(
                                    listOf(MirrorText.ALL_GROUPS, MirrorText.ONE_GROUP),
                                    selected = if (oneGroup) 1 else 0,
                                    onSelect = { onOneGroup(it == 1) },
                                    compact = true,
                                )
                            }
                            if (oneGroup) {
                                PlateLine()
                                SwitchRow(MirrorText.FOLLOW, MirrorText.FOLLOW_NOTE, follow, onFollow)
                            } else {
                                // The four groups have no one plate to print KEYS / PADS on (ModeStrip): the mode is here.
                                PlateLine()
                                SettingRow(MirrorText.MODE, stacked = true) {
                                    Segmented(
                                        listOf(MirrorText.MODE_PADS, MirrorText.MODE_KEYS),
                                        selected = 0,
                                        onSelect = { if (it == 1) keysActions.onMode(true) },
                                        compact = true,
                                    )
                                }
                                // Nor ARP / RPT and LATCH: note repeat is here too.
                                if (arp != null) {
                                    PlateLine()
                                    SwitchRow(MirrorText.RPT_NAME, null, arp.ui.on, arp.onOn)
                                    if (arp.ui.on) {
                                        PlateLine()
                                        SwitchRow(MirrorText.LATCH, MirrorText.ARP_LATCH_NOTE, arp.ui.latch, arp.onLatch)
                                    }
                                }
                            }
                        }
                        KeysMonitor(st, keys.names)
                        if (take != null) TakesSection(takes, take)
                        Notes(st, mirror, tapToPlay = onPad != null, sideways = sideways)
                    }
                },
                // On its side the strip keeps to the edge's upper part, clear of where the white keys are struck.
                stripAlignment = if (sideways) Alignment.TopEnd else Alignment.CenterEnd,
                stripHeight = if (sideways) 0.4f else 0.5f,
            ) {
                // Sideways: no width cap, and down to the bottom edge with only a small margin, so
                // nothing but the keys is under a finger striking low.
                val sidewaysColumn = Modifier
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .fillMaxSize()
                    .padding(start = startGutter, end = endGutter, bottom = SidewaysBottom)
                // The display line on the page (not in the top bar). With the SAMPLE panel it grows into the panel, its
                // words giving way to SAMPLE's header in place ([SampleMorph]); the line itself stays the pads' own.
                val padsLine: @Composable () -> Unit = {
                    if (editing && punchHeld.isEmpty() && arpLine == null) EditLine() else DisplayStrip(st, mirror, transport, take, still = fixedNow != null, wireless = wireless, punch = punchHeld, arp = arpLine)
                }
                val sampleNow = sample ?: SampleUi()
                // The display line growing into the SAMPLE panel over the function keys, upright ([SampleMorph]): laid out as
                // [fit], [gap] between the line and the keys closed, the line's [corner]s.
                val lineMorph: @Composable (Modifier, SamplePanelFit, Dp, Dp, @Composable () -> Unit, @Composable () -> Unit) -> Unit = { m, fit, gap, corner, line, fnKeys ->
                    SampleMorph(
                        panel, gap, corner, fit.wave, m,
                        line = line,
                        keys = fnKeys,
                        header = { SampleHeader(sampleNow, stillSample) },
                        strip = { SampleWaveStrip(sampleNow, panel, stillSample, fit.wave) },
                        plate = { SamplePlate(sampleNow, panel, fit, haptics) },
                    )
                }
                // The display line growing down the sideways column's left into the panel, [side] as the column has it, the
                // pads beside it ([SampleMorph]).
                val sideMorph: @Composable (Modifier, MorphSide, Dp, @Composable () -> Unit, @Composable () -> Unit) -> Unit = { m, side, height, fnKeys, padsGlide ->
                    val wave = sideWave(height - BodyHeader, side.panel, usbNote)
                    SampleMorph(
                        panel, 10.dp, BodyCorner, wave, m, side = side,
                        line = padsLine,
                        keys = fnKeys,
                        header = { SampleHeader(sampleNow, stillSample) },
                        strip = { SampleWaveStrip(sampleNow, panel, stillSample, wave) },
                        plate = { SamplePlate(sampleNow, panel, null, haptics) },
                        pads = padsGlide,
                    )
                }
                // The function keys' place, the display line in the top bar: the keys, or the SAMPLE panel unrolled there
                // without a header (the top bar's line is its header, [LivePill]) ([fit] upright, null on its side, where
                // it is [side] wide), as far along as [panel] is.
                val functionSlot: @Composable (Modifier, SamplePanelFit?, Dp?, @Composable () -> Unit) -> Unit = { m, fit, side, fnKeys ->
                    if (sample == null || !panelOn) {
                        Box(m) { fnKeys() }
                    } else {
                        SampleSlot(panel, m, sideways = side, keys = fnKeys) {
                            SampleBodyFace(sample, panel, fit, haptics, stillSample)
                        }
                    }
                }
                // The pads' swipe that opens and closes the panel, the pads under it hearing of a finger it took (not
                // while they are the punch-ins: a finger moving there sets a punch-in's depth).
                val swipe = if (panelOn && padPunch == null) panelSwipe(panel, openPanel, closePanel) else Modifier
                if (piano != null) {
                    Column(sidewaysColumn) {
                        if (!inBar) {
                            KeysDisplay(st, mirror, keysNow, transport, take, still = fixedNow != null, pianoRange = piano, arp = arpLine)
                            Spacer(Modifier.height(10.dp))
                        }
                        // A tablet's function keys, then the row over the piano and the piano; upright
                        // they sit right under the display line, as on the web. The short sideways
                        // piano goes without them, for the keys' height. With no plate round the
                        // piano, the row starts with the mode word.
                        if (pianoFunctions) {
                            FunctionRow(functions, keys, keysActions, st, haptics, hold = hold, edit = editKey)
                            Spacer(Modifier.height(10.dp))
                        }
                        Column(Modifier.weight(1f, fill = false)) {
                            ModeRow(keys, keysActions, landscape = true, viewSwitch = viewSwitch, arp = arp)
                            // The rest of the room; on a tablet no taller than a hand spans.
                            // The arp's notes, held and sounding, are down on the piano as the phone's own are.
                            val pianoKeys = if (keysNow.arpHeld.isEmpty() && keysNow.arpLit.isEmpty()) keysNow else keysNow.copy(playingNotes = keysNow.playingNotes + keysNow.arpHeld + keysNow.arpLit)
                            PianoKeyboard(
                                piano, st, pianoKeys, clock, keysPlay,
                                Modifier
                                    .fillMaxWidth()
                                    .weight(1f, fill = false)
                                    .then(if (window.short) Modifier else Modifier.heightIn(max = PianoMaxTablet))
                                    .coachMark("live.keys", CoachText.PIANO, CoachYellow, CoachYellowInk),
                                haptics = haptics,
                                pressure = notePressure,
                            )
                        }
                    }
                } else if (sideways && !keys.on && oneGroup) {
                    val now = clock()
                    BoxWithConstraints(sidewaysColumn, contentAlignment = Alignment.TopCenter) {
                        // The K.O. II's body as big as the room under the display line, the function
                        // keys a column on its left (the group keys are the body's own first column).
                        val gridH = maxHeight - (if (inBar) 0.dp else DisplayLineHeight + 10.dp)
                        val k = KoGeom.fit(maxWidth - SideFunctions - SideControlsGap, gridH, 4)
                        val bodyW = k.width(4)
                        val columnW = minOf(maxWidth, SideFunctions + SideControlsGap + bodyW)
                        val body: @Composable (Modifier) -> Unit = { m ->
                            Group(
                                group, st, nameOf, now,
                                m.coachMark("live.pads", CoachText.PADS, CoachYellow, CoachYellowInk),
                                big = true,
                                onPad = padPress,
                                onPadKept = padKept,
                                onPadUp = padUp,
                                onPadCut = padCut,
                                playingPads = ringed,
                                onEdit = editPad,
                                haptics = haptics,
                                onSelectGroup = { group = it },
                                sampling = padSampling,
                                erase = eraseDots,
                                mode = modeStrip,
                                punch = padPunch,
                                arpLit = arpLitPads,
                                onPadPressure = padPressure,
                            )
                        }
                        val fnColumn: @Composable () -> Unit = { FunctionColumn(functions, keys, keysActions, st, haptics, hold = hold, edit = editKey) }
                        if (!panelOn) {
                            Column(Modifier.width(columnW).fillMaxHeight()) {
                                if (!inBar) {
                                    padsLine()
                                    Spacer(Modifier.height(10.dp))
                                }
                                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(SideControlsGap)) {
                                    fnColumn()
                                    body(Modifier.width(bodyW).fillMaxHeight())
                                }
                            }
                        } else if (!inBar) {
                            // The display line grows down the column's left into the panel, as wide as the body (as tall as
                            // the room, from the top) leaves it; the body glides from beside the keys to beside it ([PadsGlide]).
                            val deckW = koDeckWidth(maxHeight, 4)
                            val sideW = sidePanelWidth(maxWidth - SideControlsGap, deckW)
                            val openW = minOf(maxWidth, sideW + SideControlsGap + deckW)
                            sideMorph(Modifier.fillMaxSize(), MorphSide(columnW, openW, sideW, SideControlsGap), maxHeight, fnColumn) {
                                PadsGlide(panel, Modifier.fillMaxSize().then(swipe), scaleOf = { w, h -> koUnit(w, h, 4) }) {
                                    body(Modifier.fillMaxSize())
                                }
                            }
                        } else {
                            // The panel in the column's place, as wide as the body (as tall as the room lets it be)
                            // leaves it; the column widens to it as it unrolls and the body narrows, gliding ([PadsGlide]).
                            val deckW = koDeckWidth(gridH, 4)
                            val sideW = sidePanelWidth(maxWidth - SideControlsGap, deckW)
                            val openW = minOf(maxWidth, sideW + SideControlsGap + deckW)
                            Column(Modifier.unrollWidth(panel, columnW, openW).fillMaxHeight()) {
                                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(SideControlsGap)) {
                                    functionSlot(Modifier.fillMaxHeight(), null, sideW, fnColumn)
                                    PadsGlide(panel, Modifier.weight(1f).fillMaxHeight().then(swipe), scaleOf = { w, h -> koUnit(w, h, 4) }) {
                                        body(Modifier.fillMaxSize())
                                    }
                                }
                            }
                        }
                    }
                } else if (sideways && !keys.on && allGroupsSideways) {
                    val now = clock()
                    // The function keys on the left, then all four in one row, filling the height:
                    // nothing to scroll, so a press plays at once.
                    val fnColumn: @Composable () -> Unit = { FunctionColumn(functions, keys, keysActions, st, haptics, hold = hold, edit = editKey) }
                    val groups: @Composable (Modifier) -> Unit = { m ->
                        Row(m, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            for (g in 0..3) Group(g, st, nameOf, now, Modifier.weight(1f).fillMaxHeight(), fill = true, onPad = padPress, onPadKept = padKept, onPadUp = padUp, onPadCut = padCut, playingPads = ringed, onEdit = editPad, haptics = haptics, sampling = padSampling, erase = eraseDots, arpLit = arpLitPads, onPadPressure = padPressure)
                        }
                    }
                    if (panelOn && !inBar) {
                        // The display line grows down the left into the panel, the groups keeping at least three fifths of
                        // the room (their pads, narrower, no taller than wide) and gliding to it from their top left.
                        val sideW = sidePanelWidth(roomW, roomW * 0.6f)
                        val padOpen = ((roomW - sideW - SideControlsGap - 42.dp) / 4 - 2.dp) / 3
                        val height = roomH + ControlsRow + DisplayLineHeight + 10.dp
                        val side = MorphSide(null, null, sideW, SideControlsGap, padsClosed = caption + 3.dp + padW * 4, padsOpen = caption + 3.dp + padOpen * 4)
                        Box(sidewaysColumn) {
                            sideMorph(Modifier.fillMaxSize(), side, height, fnColumn) {
                                PadsGlide(panel, Modifier.fillMaxSize().then(swipe), centred = false, scaleOf = { w, _ -> w.toFloat() }) { groups(Modifier) }
                            }
                        }
                    } else Column(sidewaysColumn) {
                        if (!inBar) {
                            padsLine()
                            Spacer(Modifier.height(10.dp))
                        }
                        if (!panelOn) {
                            Row(Modifier.fillMaxWidth().weight(1f, fill = false), horizontalArrangement = Arrangement.spacedBy(SideControlsGap)) {
                                fnColumn()
                                groups(Modifier.weight(1f).heightIn(max = caption + 3.dp + padW * 4))
                            }
                        } else {
                            // The panel in the column's place, the groups keeping at least three fifths of the room (their
                            // pads, narrower, no taller than wide), gliding to it from their top left ([PadsGlide]).
                            val sideW = sidePanelWidth(roomW, roomW * 0.6f)
                            val padOpen = ((roomW - sideW - SideControlsGap - 42.dp) / 4 - 2.dp) / 3
                            Row(Modifier.fillMaxWidth().weight(1f, fill = false), horizontalArrangement = Arrangement.spacedBy(SideControlsGap)) {
                                functionSlot(Modifier.fillMaxHeight(), null, sideW, fnColumn)
                                PadsGlide(
                                    panel,
                                    Modifier.weight(1f)
                                        .unrollMaxHeight(panel, caption + 3.dp + padW * 4, caption + 3.dp + padOpen * 4)
                                        .then(swipe),
                                    centred = false,
                                    scaleOf = { w, _ -> w.toFloat() },
                                ) { groups(Modifier) }
                            }
                        }
                    }
                } else if (oneGroup || keys.on) {
                    val now = clock()
                    // One group (or the keys) fills the screen without scrolling: the display line, the grid
                    // (its rows share whatever height is left) and the group keys.
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                        Column(
                            Modifier
                                .windowInsetsPadding(WindowInsets.safeDrawing)
                                // Not much wider than a phone, so a tablet's pads don't turn into long bars.
                                .then(if (sideways) Modifier else Modifier.widthIn(max = 520.dp))
                                .fillMaxSize()
                                .padding(start = startGutter, end = endGutter, top = 4.dp, bottom = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            if (onBack != null) {
                                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                    Caption(MirrorText.TITLE)
                                    CloseKey(onBack, dev.arc.ep133.text.GuideText.CLOSE, Modifier.align(Alignment.CenterEnd))
                                }
                            }
                            if (keys.on && sideways) {
                                // On its side: the keys on the K.O. II's body as big as the room, the function
                                // keys and the view switch (turned) on their left, the scale and the octave
                                // on their right.
                                if (!inBar) KeysDisplay(st, mirror, keysNow, transport, take, still = fixedNow != null, arp = arpLine)
                                BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
                                    val columns = SideFunctions + SidePicks + if (viewSwitch != null) SideLead else 0.dp
                                    val gaps = if (viewSwitch != null) 3 else 2
                                    val roomy = KoGeom.fit(maxWidth - columns - SideGap * gaps, maxHeight, 3)
                                    // Short of width (a narrow window), the columns close up before the keys' words clip.
                                    val gap = if (roomy.u < KeysTightU) SideGapTight else SideGap
                                    val k = KoGeom.fit(maxWidth - columns - gap * gaps, maxHeight, 3)
                                    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(gap, Alignment.CenterHorizontally)) {
                                        FunctionColumn(functions, keys, keysActions, st, haptics, hold = hold, edit = editKey)
                                        if (viewSwitch != null) SidewaysKeysLead(viewSwitch)
                                        KeysGrid(
                                            st, keysNow, now, keysPlay,
                                            Modifier.width(k.width(3)).fillMaxHeight()
                                                .coachMark("live.keys", CoachText.PADS, CoachYellow, CoachYellowInk),
                                            haptics = haptics,
                                            hold = hold,
                                            functions = functions,
                                            mode = modeStrip,
                                            pressure = notePressure,
                                        )
                                        SidewaysKeysPicks(keys, keysActions)
                                    }
                                }
                            } else if (keys.on) {
                                if (!inBar) KeysDisplay(st, mirror, keysNow, transport, take, still = fixedNow != null, arp = arpLine)
                                FunctionRow(functions, keys, keysActions, st, haptics, hold = hold, edit = editKey)
                                KeysGrid(
                                    st, keysNow, now, keysPlay,
                                    Modifier.fillMaxWidth().weight(1f).coachMark("live.keys", CoachText.PADS, CoachYellow, CoachYellowInk),
                                    haptics = haptics,
                                    hold = hold,
                                    functions = functions,
                                    mode = modeStrip,
                                    pressure = notePressure,
                                )
                                ModeRow(keys, keysActions, viewSwitch = viewSwitch, mode = false)
                            } else {
                                if (!inBar && !panelOn) padsLine()
                                val fnRow: @Composable () -> Unit = { FunctionRow(functions, keys, keysActions, st, haptics, hold = hold, edit = editKey) }
                                val body: @Composable (Modifier) -> Unit = { m ->
                                    Group(
                                        group, st, nameOf, now,
                                        m.coachMark("live.pads", CoachText.PADS, CoachYellow, CoachYellowInk),
                                        big = true,
                                        onPad = padPress,
                                        onPadKept = padKept,
                                        onPadUp = padUp,
                                        onPadCut = padCut,
                                        playingPads = ringed,
                                        onEdit = editPad,
                                        haptics = haptics,
                                        sampling = padSampling,
                                        erase = eraseDots,
                                        mode = modeStrip,
                                        punch = padPunch,
                                        arpLit = arpLitPads,
                                        onPadPressure = padPressure,
                                    )
                                }
                                if (!panelOn) {
                                    fnRow()
                                    body(Modifier.fillMaxWidth().weight(1f))
                                } else {
                                    // The display line grows into the panel over the function keys, laid out for the room it
                                    // shares with the pads; the pads take what it leaves, gliding to it ([PadsGlide]).
                                    BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
                                        val fit = samplePanelFit(maxWidth, maxHeight - 10.dp, usbNote)
                                        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                            lineMorph(Modifier.fillMaxWidth(), fit, 10.dp, BodyCorner, padsLine, fnRow)
                                            PadsGlide(panel, Modifier.fillMaxWidth().weight(1f).then(swipe), scaleOf = { w, h -> koUnit(w, h, 3) }) {
                                                body(Modifier.fillMaxSize())
                                            }
                                        }
                                    }
                                }
                                GroupKeys(group, st, now, onSelect = { group = it })
                            }
                        }
                    }
                } else {
                    val now = clock()
                    val page = rememberScrollState()
                    // The panel opening on the page scrolled down to the pads (a swipe on the lower groups): the page
                    // goes back up with it, so the display grows into it in sight.
                    if (panelOn) {
                        LaunchedEffect(panel.open) {
                            if (panel.open && page.value > 0) {
                                if (reduceMotion) page.scrollTo(0) else page.animateScrollTo(0)
                            }
                        }
                    }
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                        Column(
                            Modifier
                                .windowInsetsPadding(WindowInsets.safeDrawing)
                                .widthIn(max = AllGroupsMaxWidth)
                                .fillMaxWidth()
                                .verticalScroll(page)
                                .padding(start = startGutter, end = endGutter, top = 4.dp, bottom = 24.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                Caption(MirrorText.TITLE)
                                if (onBack != null) CloseKey(onBack, dev.arc.ep133.text.GuideText.CLOSE, Modifier.align(Alignment.CenterEnd))
                            }
                            // Whether the offline note is unfolded, kept here: the display leaves while the SAMPLE panel is
                            // open in its place, and comes back as it was.
                            var noteOpen by rememberSaveable { mutableStateOf(initialNoteOpen) }
                            val line: @Composable () -> Unit = {
                                if (editing && arpLine == null) {
                                    EditLine()
                                } else {
                                    Display(st, mirror, transport, take, still = fixedNow != null, compact = sideways, noteOpen = noteOpen, onNote = { noteOpen = it }, wireless = wireless, onGetFactory = onGetFactory, arp = arpLine)
                                }
                            }
                            val fnRow: @Composable () -> Unit = { FunctionRow(functions, keys, keysActions, st, haptics, hold = hold, edit = editKey) }
                            // The panel's fit to the page's width between its gutters, its wave always there (the page scrolls):
                            // worked out here rather than measured around the panel, which grows as it unrolls (that would
                            // compose it again on every frame).
                            val pageW = minOf(AllGroupsMaxWidth, roomW + startGutter + endGutter) - startGutter - endGutter
                            if (!panelOn) {
                                if (!inBar) line()
                                fnRow()
                            } else if (!inBar) {
                                // The display grows into the panel over the function keys.
                                lineMorph(Modifier.fillMaxWidth(), samplePanelFit(pageW, null), 12.dp, if (editing) BodyCorner else DisplayCorner, line, fnRow)
                            } else {
                                // The line in the top bar: the panel in the function keys' place without a header.
                                functionSlot(Modifier.fillMaxWidth(), samplePanelFit(pageW, null), null, fnRow)
                            }
                            val grid: @Composable (Modifier) -> Unit = { m ->
                                BoxWithConstraints(m.fillMaxWidth()) {
                                    // Four groups in a row when there is room, two by two on a phone.
                                    val perRow = if (maxWidth >= 640.dp) 4 else 2
                                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                        for (row in (0..3).chunked(perRow)) {
                                            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                                for (g in row) Group(g, st, nameOf, now, Modifier.weight(1f), onPad = padPress, onPadKept = padKept, onPadUp = padUp, onPadCut = padCut, playingPads = ringed, onEdit = editPad, haptics = haptics, sampling = padSampling, erase = eraseDots, arpLit = arpLitPads, onPadPressure = padPressure)
                                            }
                                        }
                                    }
                                }
                            }
                            // The pads keep their size as the panel opens over them: they only move down.
                            grid(swipe)
                        }
                    }
                }
            }
        }
    }
}

/** [keys] with the notes [sounding] on the phone outlined; without that (screenshots), [keys] as given. */
@Composable
private fun soundingKeys(keys: KeysUi, sounding: Set<String>?): KeysUi {
    if (sounding == null) return keys
    val notes = remember(sounding, keys.pad) { LiveVoices.notes(sounding, keys.pad) }
    return remember(keys, notes) { keys.copy(playingNotes = notes) }
}

/**
 * [keys] with the arp's notes: those [arp] holds (outlined, numbered) and
 * those [sounding] on the phone it plays now (lit); without [sounding]
 * (screenshots), the lit ones as [keys] gives them.
 */
@Composable
private fun arpKeys(keys: KeysUi, arp: LiveArp?, sounding: Set<String>?): KeysUi {
    val held = arp?.heldNotes.orEmpty()
    val lit = if (sounding == null) keys.arpLit else remember(sounding, keys.pad) { LiveVoices.arpNotes(sounding, keys.pad) }
    if (held.isEmpty() && lit == keys.arpLit) return keys
    return remember(keys, held, lit) { keys.copy(arpHeld = held, arpLit = lit) }
}

/** The controls row's height over the keys (its words' touch height). */
private val ControlsRow = 44.dp

/** The display line's height, on the page when it isn't in the top bar. */
private val DisplayLineHeight = 48.dp

/** The all-groups display's corners ([DisplayPanel]'s): the SAMPLE panel grows from them ([SampleMorph]). */
private val DisplayCorner = 22.dp

/** What is left under the keys or pads on a phone on its side. */
private val SidewaysBottom = 8.dp

/** A tablet's piano is no taller than this. */
private val PianoMaxTablet = 340.dp

/** How wide the all-groups page goes, its gutters in it: a tablet's four groups in a row, not stretched further. */
private val AllGroupsMaxWidth = 720.dp

/**
 * The piano's notes in a [width] × [height] room at [octave], [choice] white
 * keys (or fewer, where they don't fit; null for as many as fit), or null
 * where the grid stays: under 8 white keys, or under 120 dp tall.
 */
private fun pianoRange(octave: Int, width: Dp, height: Dp, choice: Int?): IntRange? {
    val whites = Piano.whitesFor(width.value, choice)
    return if (whites == 0 || height.value < Piano.MIN_HEIGHT) null else Piano.range(octave, whites)
}

/**
 * The width Live's piano gets on its side in [window]: the long side less the
 * narrowest gutters. Settings greys out the piano sizes it can't hold.
 */
internal fun sidewaysRoom(window: ArcWindow): Dp = maxOf(window.width, window.height) - (EdgeTabWidth + 8.dp) - (SideStripWidth + 12.dp)

/**
 * The page's side gutters inside the safe area: room for the GUIDE tab and
 * the tools strip. On its side they are a little wider, and never narrower
 * than Android's back swipe at that edge, so a swipe doesn't start on a key.
 */
@Composable
private fun gutters(sideways: Boolean): Pair<Dp, Dp> {
    if (!sideways) return EdgeTabWidth + 8.dp to SideStripWidth + 4.dp
    val density = LocalDensity.current
    val direction = LocalLayoutDirection.current
    val swipe = WindowInsets.systemGestures.exclude(WindowInsets.safeDrawing)
    val left = with(density) { swipe.getLeft(density, direction).toDp() }
    val right = with(density) { swipe.getRight(density, direction).toDp() }
    val (start, end) = if (direction == LayoutDirection.Ltr) left to right else right to left
    return maxOf(EdgeTabWidth + 8.dp, start) to maxOf(SideStripWidth + 12.dp, end)
}

/**
 * Whether Live's display line sits in the top bar ([LivePill]): a short
 * window wider than tall, a phone on its side, with room in the bar's middle
 * for the line to read (not a narrow split screen: there it stays on the page).
 */
internal fun liveInBar(window: ArcWindow): Boolean = window.landscape && window.short && window.width >= LivePillWindow

/** The narrowest window whose top bar takes Live's display line: its middle is still about 200 dp. */
private val LivePillWindow = 600.dp

/**
 * Live's display line in the top bar's middle, on a phone on its side: the
 * KEYS line, SAMPLE's or the pads' one-line display, one bar tall. [pianoRange] is the
 * piano's notes, to name a device note it doesn't reach; [wireless] as
 * [MirrorScreen] takes it.
 */
@Composable
internal fun LivePill(
    mirror: MirrorUi?,
    keys: KeysUi,
    /** RECORD and PLAY, icon-only on the line, and TAKE's badge, as [MirrorScreen] takes them. */
    transport: TransportUi? = null,
    take: TakeUi? = null,
    still: Boolean = false,
    pianoRange: IntRange? = null,
    editing: Boolean = false,
    /** The voices sounding on the phone, as [MirrorScreen] takes them: the note playing is named. */
    voices: StateFlow<Set<String>>? = null,
    wireless: Boolean = false,
    /** SAMPLE mode: while it is on, its header ([SamplePillLine]), the line cross-fading into it. */
    sample: SampleUi? = null,
    /** The punch-ins held, in the order pressed ([PunchUi.held]): the line names them, over EDIT's too. */
    punch: Set<Int> = emptySet(),
    /** The arp's line while it plays ([dev.arc.ep133.controller.ArpUi.line]): over EDIT's, under the punch-ins'. */
    arp: String? = null,
    /**
     * How far the SAMPLE panel under it has cross-faded its header in
     * ([SamplePanel.header], read as it draws), while Live shows it
     * ([MirrorScreen]'s onSampleHeader): the pill follows it, a finger's drag
     * and a reversal too. Null, it fades on its own as the mode turns on or off.
     */
    header: (() -> Float)? = null,
) {
    val st = mirror?.state ?: MirrorState()
    val keysNow = soundingKeys(keys, voices?.collectAsStateWithLifecycle()?.value)
    val line: @Composable () -> Unit = {
        when {
            keys.on -> KeysDisplay(st, mirror, keysNow, transport, take, still, compact = true, pianoRange = pianoRange, arp = arp)
            editing && punch.isEmpty() && arp == null -> EditLine(compact = true)
            else -> DisplayStrip(st, mirror, transport, take, still, compact = true, wireless = wireless, punch = punch, arp = arp)
        }
    }
    val sampleNow = sample ?: SampleUi()
    // SAMPLE's header takes the line's place in the pill as the panel opens in the column under it, the line fading
    // out and then the header in over the panel's first [PANEL_HEADER_MS] (and back as it closes; [lineShown]): as far
    // along as the panel is, where Live gives it; one or the other alone while neither moves.
    val on = sample != null && sample.state.on
    val fade = remember { Animatable(if (on) 1f else 0f) }
    val reduce = reducedMotion() || still || sampleNow.still
    LaunchedEffect(on) {
        val to = if (on) 1f else 0f
        if (reduce) fade.snapTo(to) else fade.animateTo(to, tween(PANEL_HEADER_MS, easing = LinearEasing))
    }
    val panelFade = header.takeIf { sample != null }
    val shown: () -> Float = panelFade ?: { fade.value }
    val resting by remember(shown) { derivedStateOf { shown().takeIf { it == 0f || it == 1f } } }
    when (resting) {
        0f -> line()
        1f -> SamplePillLine(sampleNow, still = still || sampleNow.still)
        else -> Box(Modifier.fillMaxWidth()) {
            Box(Modifier.graphicsLayer { alpha = lineShown(shown()) }) { line() }
            Box(Modifier.graphicsLayer { alpha = headerShown(shown()) }) { SamplePillLine(sampleNow, still = still || sampleNow.still) }
        }
    }
}

/**
 * The display line while EDIT is on, lit signal orange: "EDIT  Tap a pad to
 * change its sound". [compact]: one bar tall, in the top bar ([LivePill]).
 */
@Composable
private fun EditLine(compact: Boolean = false) {
    val c = LocalArcColors.current
    DisplayLine(
        Modifier.clearAndSetSemantics {
            contentDescription = MirrorText.EDIT_TAB + ", " + MirrorText.EDIT_LINE
            liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite
        },
        compact = compact,
        color = c.signal,
    ) {
        Text(MirrorText.EDIT_TAB, style = ArcType.displaySub, color = c.onSignal.copy(alpha = 0.8f), maxLines = 1)
        Text(
            MirrorText.EDIT_LINE,
            style = if (compact) ArcType.displaySub else ArcType.displayHead,
            color = c.onSignal,
            maxLines = if (compact) 1 else 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}

/**
 * [text] as a display line's polite live region says it: at most once a
 * second, so a run of notes or hits is read where it ends, not one by one.
 */
@Composable
internal fun spoken(text: String): String {
    var said by remember { mutableStateOf(text) }
    var saidAt by remember { mutableLongStateOf(0L) }
    LaunchedEffect(text) {
        delay(saidAt + SPOKEN_MS - android.os.SystemClock.uptimeMillis())
        said = text
        saidAt = android.os.SystemClock.uptimeMillis()
    }
    return said
}

private const val SPOKEN_MS = 1000L

/**
 * The display's main line: the error, "Reading…", the hit, that Live's sound
 * plays late ([wireless]: it goes to Bluetooth), offline the time of the last
 * read ("Last seen Oct 5, 2:02 PM"), or "Press a pad". A device hit hides the
 * note while it shows.
 */
private fun displayLine(st: MirrorState, mirror: MirrorUi?, wireless: Boolean): String {
    val hit = st.lastHit
    return when {
        mirror?.error != null -> mirror.error
        mirror?.loading == true && hit == null -> MirrorText.READING
        hit != null -> MirrorText.hit(hit)
        wireless -> MirrorText.WIRELESS_DELAY
        mirror?.offline != null -> mirror.offline
        else -> MirrorText.WAITING
    }
}

/** The offline line ("Last seen …") and the late note are longer than a hit: the all-groups display draws them a size down (22 for 26). */
private fun displayLineSmall(st: MirrorState, mirror: MirrorUi?, wireless: Boolean): Boolean = when {
    st.lastHit != null -> false
    mirror?.offline != null -> true
    else -> wireless && mirror?.error == null && mirror?.loading != true
}

/**
 * The one-group view's display as a single dark line: play state, tempo and
 * project on the left, the pad just played (or that the sound plays late) on
 * the right; the pattern's RECORD and PLAY first, its words in their place
 * while it is on ([PatternLine]). While punch-ins are held ([punch], FX held)
 * it names them instead, in signal orange: "PUNCH · REPEAT + LPF"; while
 * the arp plays ([arp]), what it plays: "REPEAT · 1/16 · A 7".
 * [compact]: one bar tall, in the top bar ([LivePill]).
 */
@Composable
private fun DisplayStrip(
    st: MirrorState,
    mirror: MirrorUi?,
    transport: TransportUi?,
    take: TakeUi?,
    still: Boolean,
    compact: Boolean = false,
    wireless: Boolean = false,
    punch: Set<Int> = emptySet(),
    arp: String? = null,
) {
    val c = LocalArcColors.current
    if (punch.isNotEmpty() || arp != null) {
        val line = if (punch.isNotEmpty()) MirrorText.punchLine(punch) else arp.orEmpty()
        PatternLine(transport, take, still, compact) {
            SpokenLine(spoken(if (punch.isNotEmpty()) MirrorText.punchSpoken(punch) else line)) {
                Text(line, style = ArcType.displayHead, color = c.signal, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            }
        }
        return
    }
    val main = displayLine(st, mirror, wireless)
    val played = when (st.playing) {
        true -> MirrorText.PLAYING
        false -> MirrorText.STOPPED
        null -> if (mirror?.offline != null) MirrorText.OFFLINE else null
    }
    val said = spoken(listOfNotNull(played, st.bpm?.let(MirrorText::bpm), st.activeProject?.let(MirrorText::project), main).joinToString(", "))
    PatternLine(transport, take, still, compact) {
        SpokenLine(said) {
            // Offline and the project are only said: the top bar and the PROJECT key show them.
            when (st.playing) {
                true -> Text("\u25B6", style = ArcType.displaySub, color = c.displayInk)
                false -> Text("\u25A0", style = ArcType.displaySub, color = c.displayDim)
                null -> Unit
            }
            st.bpm?.let { Text(MirrorText.bpm(it), style = ArcType.displaySub, color = c.displayInk, maxLines = 1) }
            Text(
                main,
                style = ArcType.displayHead,
                color = c.displayInk,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = androidx.compose.ui.text.style.TextAlign.End,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/**
 * The words of a display line, read as one polite live region ([said]). The
 * pattern's chips sit beside it, not in it, so a screen reader keeps them as
 * buttons.
 */
@Composable
private fun RowScope.SpokenLine(said: String, content: @Composable RowScope.() -> Unit) {
    Row(
        Modifier.weight(1f).clearAndSetSemantics {
            contentDescription = said
            liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite
        },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

/** Not connected (nothing read, or offline from the last read): the factory sounds to get, first in the tools. */
@Composable
private fun FactoryRow(mirror: MirrorUi?, onGetFactory: (() -> Unit)?) {
    if (onGetFactory == null || mirror?.error != MirrorText.NOT_CONNECTED && mirror?.offline == null) return
    GridPlate {
        SettingRow(FeatureText.FACTORY_SOUNDS, note = FeatureText.FACTORY_NOTE) {
            ArcKey(FeatureText.GET, onGetFactory, size = KeySize.Small, style = KeyStyle.Quiet)
        }
    }
}

/** Pads changed offline, in arc only: how many, and the key that puts the device's sounds back on them. */
@Composable
private fun OfflinePadsRow(count: Int, onReset: () -> Unit) {
    if (count == 0) return
    GridPlate {
        SettingRow(MirrorText.OFFLINE_PADS, note = MirrorText.offlinePadsNote(count)) {
            ArcKey(MirrorText.RESET_PADS, onReset, size = KeySize.Small, style = KeyStyle.Quiet)
        }
    }
}

/**
 * The all-groups page's display. Offline, why it is stays folded under the
 * word until asked for, so the pads keep the room: [noteOpen] whether it is
 * unfolded, [onNote] a tap on the word asking for it (or folding it again).
 * The pattern has a row of its own under the big line ([PatternRow]);
 * TAKE's badge ends the top line while a take records.
 */
@Composable
private fun Display(
    st: MirrorState,
    mirror: MirrorUi?,
    transport: TransportUi?,
    take: TakeUi?,
    still: Boolean,
    compact: Boolean = false,
    noteOpen: Boolean = false,
    onNote: (Boolean) -> Unit = {},
    wireless: Boolean = false,
    onGetFactory: (() -> Unit)? = null,
    /** While the arp plays: what it plays, in signal orange in the big line's place. */
    arp: String? = null,
) {
    val c = LocalArcColors.current
    val offline = mirror?.offline != null && st.playing == null
    val getFactory = onGetFactory.takeIf { mirror?.error == MirrorText.NOT_CONNECTED }
    val track = patternTrack(transport, still, corner = DisplayCorner, inset = 18.dp)
    DisplayPanel(track.frame) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (offline) {
                Row(
                    Modifier
                        .weight(1f)
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { onNote(!noteOpen) }
                        .semantics { stateDescription = if (noteOpen) MirrorText.NOTE_SHOWN else MirrorText.NOTE_HIDDEN },
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(MirrorText.OFFLINE, style = ArcType.displayHead, color = c.displayInk)
                    Text(if (noteOpen) "\u25B4" else "\u25BE", style = ArcType.displaySub, color = c.displayDim)
                }
            } else {
                // The device's own ▶/■ gives way while the pattern runs, so only PLAY's chip reads as one.
                val glyph = transport?.phase.let { it == null || it == TransportPhase.STOPPED || it == TransportPhase.ARMED }
                val played = when (st.playing) {
                    true -> (if (glyph) "\u25B6 " else "") + MirrorText.PLAYING
                    false -> (if (glyph) "\u25A0 " else "") + MirrorText.STOPPED
                    null -> ""
                }
                Text(played, style = ArcType.displayHead, color = c.displayInk, modifier = Modifier.weight(1f))
            }
            st.bpm?.let { Text(MirrorText.bpm(it), style = ArcType.displaySub, color = c.displayInk) }
            st.activeProject?.let { Text(MirrorText.project(it), style = ArcType.displaySub, color = c.displayDim) }
            if (take != null && take.state != RecState.Idle) TakeBadge(take, compact = false, steady = still)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                arp ?: displayLine(st, mirror, wireless),
                // The offline line ("Last seen Oct 5, 2:02 PM"), the late note and the arp's fit a phone a size down.
                style = ArcType.statFree.copy(fontSize = if (compact || arp != null || displayLineSmall(st, mirror, wireless)) 22.sp else 26.sp),
                color = if (arp != null) c.signal else c.displayInk,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        if (transport != null) PatternRow(transport, track.beat, still)
        // The one-group view keeps to one screen; the all-groups view explains clock out.
        when {
            compact -> Unit
            offline -> androidx.compose.animation.AnimatedVisibility(
                noteOpen,
                enter = androidx.compose.animation.expandVertically() + androidx.compose.animation.fadeIn(),
                exit = androidx.compose.animation.shrinkVertically() + androidx.compose.animation.fadeOut(),
            ) {
                Text(MirrorText.offlineNote(mirror.offline, st.activeProject ?: FactorySounds.PROJECT), style = ArcType.displayHint, color = c.displayDim)
            }
            // Never read: the factory sounds to get.
            getFactory != null -> Text(
                MirrorText.GET_FACTORY,
                style = ArcType.displayHint.copy(textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline),
                color = c.displayInk,
                modifier = Modifier.clickable(role = Role.Button, onClick = getFactory),
            )
            st.playing == null && st.bpm == null -> Text(MirrorText.NO_TRANSPORT, style = ArcType.displayHint, color = c.displayDim)
        }
    }
}

@Composable
private fun Group(
    group: Int,
    st: MirrorState,
    nameOf: (PhysicalPad) -> String?,
    now: Long,
    modifier: Modifier,
    big: Boolean = false,
    /** The rows share the group's height (the big grid, and all four side by side on a phone on its side). */
    fill: Boolean = big,
    onPad: ((pad: PhysicalPad, hold: Boolean, unsure: Boolean, pressedAt: Long) -> Unit)? = null,
    onPadKept: (PhysicalPad) -> Unit = {},
    /** A pad let go of, at [releasedAt] (System.nanoTime, the lift's own time: [PressTime]). */
    onPadUp: (pad: PhysicalPad, releasedAt: Long) -> Unit = { _, _ -> },
    onPadCut: (PhysicalPad) -> Unit = { onPadUp(it, System.nanoTime()) },
    playingPads: Set<PhysicalPad> = emptySet(),
    /** EDIT is on: a tap gives the pad another sound. */
    onEdit: ((PhysicalPad) -> Unit)? = null,
    haptics: Boolean = false,
    /** The big grid on a phone on its side: the group keys a column left of the pads, on the body. */
    onSelectGroup: ((Int) -> Unit)? = null,
    /** SAMPLE mode: the pads' lights, and a screen reader's click latching a take. */
    sampling: PadSampling? = null,
    /** ERASE: the pads with notes, dotted (the rest dimmed); null out of it. */
    erase: Set<PhysicalPad>? = null,
    /** The big grid: KEYS / PADS in its plate's right margin (KoDeck). */
    mode: (@Composable (Modifier, Dp) -> Unit)? = null,
    /** FX held (the big grid only): the pads are the punch-ins ([PunchPad]); null for their sounds. */
    punch: PadPunch? = null,
    /** The pads the arp sounds now: lit. */
    arpLit: Set<PhysicalPad> = emptySet(),
    /** While the arp is on: a held pad's pressure, the touch's own. */
    onPadPressure: ((PhysicalPad, Float) -> Unit)? = null,
) {
    val c = LocalArcColors.current
    val lit = st.pads.filterKeys { it.group == group }
    val groupGlow = lit.values.maxOfOrNull { glow(it, now) } ?: 0f
    if (big) {
        val pad: @Composable (PhysicalPad, KoGeom) -> Unit = { pad, k ->
            val slot = punchSlotForPad(pad.offset)
            if (punch != null && slot >= 0) {
                PunchPad(slot, slot in punch.ui.held, punch.ui, punch.sense, Modifier.size(k.u, k.h), k.u, k.keyShape, haptics = haptics)
            } else {
                Pad(
                    pad, lit[pad], nameOf(pad), now,
                    Modifier.size(k.u, k.h),
                    big = true,
                    onPress = onPad?.let { f -> { hold: Boolean, unsure: Boolean, at: Long -> f(pad, hold, unsure, at) } },
                    onKept = { onPadKept(pad) },
                    onRelease = { at -> onPadUp(pad, at) },
                    onCut = { onPadCut(pad) },
                    playing = pad in playingPads,
                    inScroll = false,
                    onEdit = onEdit?.let { f -> { f(pad) } },
                    haptics = haptics,
                    ko = k,
                    sampleLed = sampling?.led?.invoke(pad),
                    blink = sampling?.blink,
                    onLatch = sampling?.onLatch?.let { f -> { f(pad) } },
                    noteDot = erase?.let { pad in it },
                    arpLit = pad in arpLit,
                    onPressure = onPadPressure?.let { f -> { p: Float -> f(pad, p) } },
                )
            }
        }
        val groupKeys: (@Composable (KoGeom) -> Unit)? = onSelectGroup?.let { select ->
            { k -> for (g in 0..3) GroupKey(g, group, st, now, select, Modifier.width(k.u), keyMin = 0.dp, ko = k) }
        }
        KoDeck(modifier, groupKeys, mode) { o, k -> pad(PhysicalPad(group, o), k) }
        return
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // The caption turns orange while one of the group's pads sounds (the big grid's
        // group shows on its key instead).
        Caption(MirrorText.GROUP + " " + ('A' + group), color = lerp(c.graphite, c.signal, groupGlow))
        Deck(if (fill) Modifier.weight(1f) else Modifier) { gap ->
            PadNotes.ROWS.forEach { rowOffsets ->
                // Side by side on a phone on its side, the rows share the height; else the pads are square.
                Row(if (fill) Modifier.weight(1f) else Modifier, horizontalArrangement = Arrangement.spacedBy(gap)) {
                    rowOffsets.forEach { o ->
                        val pad = PhysicalPad(group, o)
                        Pad(
                            pad, lit[pad], nameOf(pad), now,
                            Modifier.weight(1f).then(if (fill) Modifier.fillMaxHeight() else Modifier.aspectRatio(1f)),
                            onPress = onPad?.let { f -> { hold: Boolean, unsure: Boolean, at: Long -> f(pad, hold, unsure, at) } },
                            onKept = { onPadKept(pad) },
                            onRelease = { at -> onPadUp(pad, at) },
                            onCut = { onPadCut(pad) },
                            playing = pad in playingPads,
                            // Only the all-groups page scrolls.
                            inScroll = !fill,
                            onEdit = onEdit?.let { f -> { f(pad) } },
                            haptics = haptics,
                            sampleLed = sampling?.led?.invoke(pad),
                            blink = sampling?.blink,
                            onLatch = sampling?.onLatch?.let { f -> { f(pad) } },
                            noteDot = erase?.let { pad in it },
                            arpLit = pad in arpLit,
                            onPressure = onPadPressure?.let { f -> { p: Float -> f(pad, p) } },
                        )
                    }
                }
            }
        }
    }
}

/**
 * The device's body around a small grid's pads (the big grid is KoDeck): the
 * pads are caps sitting in it, as on the K.O. II, 6 apart. The padding leaves
 * room on the right and below for the caps' edges. [content] gets the gap.
 */
@Composable
private fun Deck(modifier: Modifier, content: @Composable ColumnScope.(gap: Dp) -> Unit) {
    val hw = LocalHwColors.current
    val gap = 6.dp
    val inset = 8.dp
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            // The K.O. II's own body, as the Guide draws it, in both themes.
            .background(hw.ko.body)
            .padding(start = inset, top = inset, end = inset + CapDx, bottom = inset + CapDy),
        verticalArrangement = Arrangement.spacedBy(gap),
    ) { content(gap) }
}

/**
 * The big grid drawn as the Guide draws the K.O. II (KoPanel, a 560-wide
 * device whose pad column is 64.9 wide): every length a share of [u], one
 * pad's width. A pad is 1.08 times as wide as high; over each row of pads a
 * line of the words printed on the body; the body's edge offset down and right.
 */
private class KoGeom(val u: Dp) {
    /** The printed line over a row, and the gaps around it. */
    val line = u * 0.215f
    val gy = u * 0.077f
    val gx = u * 0.215f
    /** A pad's height. */
    val h = u / 1.08f
    val keyShape = RoundedCornerShape(maxOf(6.dp, u * 0.092f))
    val led = (u * 0.085f).coerceIn(5.dp, 7.dp)

    companion object {
        /**
         * As big as [w] x [h] lets the body be, with [cols] columns (pads and
         * group keys): wide, 2 x 0.277 + the gaps + the edge + the mode strip
         * ([ModeStripWidth]); high, 0.215 + four rows of (0.215 + 0.077 +
         * 0.926) + three gaps + 0.31 + the edge.
         */
        fun fit(w: Dp, h: Dp, cols: Int) = KoGeom(
            minOf((w - CapDx - 2.dp - ModeStripWidth) / (cols * 1.215f + 0.401f), (h - CapDy - 2.dp) / 5.72f, 170.dp).coerceAtLeast(0.dp),
        )
    }

    /** The body's width with [cols] columns, its edge and mode strip in it. */
    fun width(cols: Int): Dp = u * (cols * 1.215f + 0.401f) + CapDx + 2.dp + ModeStripWidth
}

/** The big grid's pad width in a [w] x [h] room with [cols] columns ([KoGeom.fit]). */
internal fun koPadWidth(w: Dp, h: Dp, cols: Int): Dp = KoGeom.fit(w, h, cols).u

/**
 * The big grid's pad width (px) in a room [w] x [h] px with [cols] columns
 * ([KoGeom.fit]): how big it is, for [PadsGlide].
 */
internal fun Density.koUnit(w: Int, h: Int, cols: Int): Float = KoGeom.fit(w.toDp(), h.toDp(), cols).u.toPx()

/** How wide the big grid's body is with [cols] columns, as tall as [h] lets it be ([KoGeom.fit]) whatever the width. */
internal fun koDeckWidth(h: Dp, cols: Int): Dp = KoGeom.fit(Dp.Infinity, h, cols).width(cols)

/**
 * Twelve keys on the K.O. II's body (a group's pads, or KEYS' notes), as big
 * as [modifier]'s room lets it be and in its middle; [key] draws the key at
 * each pad offset, [k.u] by [k.h]. [groupKeys]: a column left of them, as the
 * device's group keys are (a phone on its side). [mode]: KEYS / PADS in the
 * body's right margin ([ModeStrip]), given that margin, the keys' height, and
 * its words' size. The LEDs before the printed words stay unlit: on the
 * device they mark the knobs' pages, not the pads.
 * While the SAMPLE panel moves, the room it is given stays as it was and the
 * drawing glides instead ([PadsGlide]), so this lays out (and its keys
 * compose) once per opening or closing, not on every frame.
 */
@Composable
private fun KoDeck(
    modifier: Modifier,
    groupKeys: (@Composable (KoGeom) -> Unit)?,
    mode: (@Composable (Modifier, Dp) -> Unit)?,
    key: @Composable (offset: Int, k: KoGeom) -> Unit,
) {
    val ko = LocalHwColors.current.ko
    BoxWithConstraints(modifier, contentAlignment = Alignment.Center) {
        val k = KoGeom.fit(maxWidth, maxHeight, if (groupKeys != null) 4 else 3)
        val radius = k.u * 0.277f
        val body = Modifier
            .drawBehind {
                drawRoundRect(
                    ko.edge,
                    topLeft = Offset((k.u * 0.062f).toPx(), (k.u * 0.092f).toPx()),
                    size = size,
                    cornerRadius = CornerRadius(radius.toPx()),
                )
            }
            .clip(RoundedCornerShape(radius))
            .background(ko.body)
        // The right margin is the mode strip's wider: the keys keep clear of it, their edge out of its touch.
        val margin = k.u * 0.277f + ModeStripWidth
        Box(body) {
            KoBody(k, Modifier.padding(start = k.u * 0.277f, top = k.u * 0.215f, end = margin + CapDx, bottom = k.u * 0.31f + CapDy), groupKeys, key)
            if (mode != null) {
                Box(Modifier.matchParentSize().padding(top = k.u * 0.215f, bottom = k.u * 0.31f + CapDy), contentAlignment = Alignment.CenterEnd) {
                    mode(Modifier.width(margin).fillMaxHeight(), (k.u * 0.11f).coerceIn(8.dp, 10.dp))
                }
            }
        }
    }
}

/** KoDeck's body (its plate, [body] the room round its keys) with the group keys and the twelve keys on it, as [k] sizes them. */
@Composable
private fun KoBody(k: KoGeom, body: Modifier, groupKeys: (@Composable (KoGeom) -> Unit)?, key: @Composable (offset: Int, k: KoGeom) -> Unit) {
    Row(
        body,
        horizontalArrangement = Arrangement.spacedBy(k.gx),
    ) {
        if (groupKeys != null) {
            Column(verticalArrangement = Arrangement.spacedBy(k.gy)) { groupKeys(k) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(k.gy)) {
            PadNotes.ROWS.forEachIndexed { r, offsets ->
                Row(Modifier.height(k.line).clearAndSetSemantics { }, horizontalArrangement = Arrangement.spacedBy(k.gx)) {
                    for (word in GuideText.LED_ROWS[r]) PrintedWord(word, k)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(k.gx)) {
                    for (o in offsets) key(o, k)
                }
            }
        }
    }
}

/** A word printed on the body over a pad, after its unlit LED a fifth of the way in. */
@Composable
private fun PrintedWord(word: String, k: KoGeom) {
    val ko = LocalHwColors.current.ko
    val size = with(LocalDensity.current) { (k.u * 0.135f).coerceIn(7.dp, 11.dp).toSp() }
    Row(
        Modifier.width(k.u).fillMaxHeight().padding(start = k.u * 0.2f),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(k.u * 0.12f),
    ) {
        Box(Modifier.size(k.led).clip(CircleShape).background(ko.ledOff))
        Text(
            word.uppercase(),
            style = ArcType.semi.copy(fontSize = size, lineHeight = 1.em, letterSpacing = 0.06.em),
            color = ko.label,
            maxLines = 1,
            softWrap = false,
        )
    }
}

/** A group key's glyph (KoPanel's GroupGlyphs) in a [size] box. */
@Composable
private fun GroupGlyph(g: Int, color: Color, size: Dp) {
    Canvas(Modifier.size(size)) {
        val s = this.size.width / 12f
        for (l in GroupGlyphs[g]) {
            drawLine(color.copy(alpha = color.alpha * 0.8f), Offset(l[0] * s, l[1] * s), Offset(l[2] * s, l[3] * s), strokeWidth = 1.2f * s, cap = StrokeCap.Round)
        }
    }
}

/** A light around a lit pad or key: [g] 0..1. */
internal fun Modifier.litGlow(g: Float, color: Color, shape: androidx.compose.ui.graphics.Shape): Modifier =
    if (g <= 0f) this else dropShadow(shape, Shadow(radius = 18.dp * g, color = color.copy(alpha = 0.6f * g)))

/**
 * The group keys under the single grid, pale caps under LEDs as on the K.O. II:
 * the group shown stays down with its LED lit; a group lights orange while one
 * of its pads sounds. (On a phone on its side they are on the deck: KoDeck.)
 */
@Composable
private fun GroupKeys(group: Int, st: MirrorState, now: Long, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (g in 0..3) GroupKey(g, group, st, now, onSelect, Modifier.weight(1f), keyMin = 52.dp)
    }
}

/**
 * A group key as the K.O. II prints it: pale, its letter in the top left
 * corner and its function's glyph under it, under its LED. [ko]: on the
 * deck's body (a phone on its side), pad-sized, the LED on the printed line.
 */
@Composable
private fun GroupKey(g: Int, group: Int, st: MirrorState, now: Long, onSelect: (Int) -> Unit, modifier: Modifier, keyMin: Dp, ko: KoGeom? = null) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val markA = if (g == 0) Modifier.coachMark("live.groups", CoachText.GROUPS, c.navy, c.onNavy) else Modifier
    val on = g == group
    val sounding = st.pads.filterKeys { it.group == g }.values.maxOfOrNull { glow(it, now) } ?: 0f
    val face = lerp(hw.ko.lightFace, c.signal, sounding)
    val edge = lerp(hw.ko.lightEdge, c.signalEdge, sounding)
    val ink = if (sounding > 0.3f) c.onSignal else if (on) hw.ko.darkFace else hw.ko.lightInk
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val density = LocalDensity.current
    val letter = with(density) { (ko?.let { (it.u * 0.277f).coerceIn(15.dp, 34.dp) } ?: 20.dp).toSp() }
    val led: @Composable () -> Unit = {
        Box(
            Modifier
                .size(ko?.led ?: 6.dp)
                .then(if (on) Modifier.dropShadow(CircleShape, Shadow(radius = 6.dp, color = c.signal)) else Modifier)
                .clip(CircleShape)
                .background(if (on) c.signal else lerp(hw.ledOff, c.signal, sounding)),
        )
    }
    // The LED, then the key under it.
    Column(
        modifier,
        horizontalAlignment = if (ko != null) Alignment.Start else Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(ko?.gy ?: 6.dp),
    ) {
        if (ko != null) {
            Box(Modifier.height(ko.line).padding(start = ko.u * 0.2f), contentAlignment = Alignment.CenterStart) { led() }
        } else {
            led()
        }
        val shape = ko?.keyShape ?: RoundedCornerShape(10.dp)
        Column(
            Modifier
                .fillMaxWidth()
                .then(if (ko != null) Modifier.height(ko.h) else Modifier.heightIn(min = keyMin))
                .then(markA)
                .cap(face, edge, shape, capPress(on || pressed))
                .clickable(interactionSource = source, indication = null, role = Role.Tab) { onSelect(g) }
                .semantics {
                    selected = on
                    contentDescription = MirrorText.GROUP + " " + MirrorText.groupKey(g)
                }
                .then(
                    if (ko != null) Modifier.padding(start = ko.u * 0.1f, top = ko.u * 0.06f, end = ko.u * 0.1f, bottom = ko.u * 0.16f)
                    else Modifier.padding(start = 8.dp, top = 5.dp, end = 8.dp, bottom = 7.dp),
                ),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(MirrorText.groupKey(g), style = ArcType.semi.copy(fontSize = letter, fontWeight = FontWeight.Medium, lineHeight = 1.em), color = ink)
            GroupGlyph(g, ink, ko?.let { (it.u * 0.185f).coerceIn(10.dp, 18.dp) } ?: 12.dp)
        }
    }
}

/** 0..1: how lit a pad (or a key) is now. Velocity sets the brightness; release fades it out. */
internal fun glow(l: PadLight, now: Long): Float {
    val strength = 0.45f + 0.55f * (l.velocity.coerceIn(1, 127) / 127f)
    val off = l.offAt ?: return strength
    val left = 1f - ((now - off).toFloat() / FADE_NS)
    return (strength * left).coerceIn(0f, 1f)
}

@Composable
private fun Pad(
    pad: PhysicalPad,
    light: PadLight?,
    name: String?,
    now: Long,
    modifier: Modifier,
    big: Boolean = false,
    onPress: ((hold: Boolean, unsure: Boolean, pressedAt: Long) -> Unit)? = null,
    onKept: () -> Unit = {},
    /** Let go of at [releasedAt] (System.nanoTime: [PressTime]). */
    onRelease: (releasedAt: Long) -> Unit = {},
    onCut: () -> Unit = { onRelease(System.nanoTime()) },
    playing: Boolean = false,
    inScroll: Boolean = !big,
    onEdit: (() -> Unit)? = null,
    haptics: Boolean = false,
    /** The big grid's K.O. II geometry: the digit, padding and corners from its pad width. */
    ko: KoGeom? = null,
    /**
     * SAMPLE mode's light ([SampleLed], null out of it): a ring, blinking
     * with [blink] while the pad is empty, steady with a sound on it; the
     * take's pad lit up, and heard as recording or waiting to. A screen
     * reader's click is [onLatch] there (a hands-free take, or its end or
     * cancel), and a pad with a sound keeps a Play action.
     */
    sampleLed: SampleLed? = null,
    blink: androidx.compose.runtime.State<Float>? = null,
    onLatch: (() -> Unit)? = null,
    /** ERASE ([eraseDot]): true with notes to erase, false without; null out of it. */
    noteDot: Boolean? = null,
    /** The arp sounds it now: lit, as a hit lights it. */
    arpLit: Boolean = false,
    /** While the arp is on: the held pad's pressure, the touch's own. */
    onPressure: ((Float) -> Unit)? = null,
) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val density = LocalDensity.current
    val g = if (sampleLed == SampleLed.RECORDING || sampleLed == SampleLed.WAITING || arpLit) 1f else light?.let { glow(it, now) } ?: 0f
    val ink = if (g > 0.3f) c.onSignal else hw.darkInk
    val wide = pad.label.length > 1
    val labelStyle = ArcType.semi.copy(
        // ENTER on a small pad: 9sp and tighter, so it fits on one line. The K.O. II's
        // digit: plain, a little over a quarter of the pad's width.
        fontSize = when {
            ko != null -> with(density) { (if (wide) (ko.u * 0.15f).coerceIn(10.dp, 15.dp) else (ko.u * 0.277f).coerceIn(15.dp, 34.dp)).toSp() }
            big -> if (wide) 15.sp else 28.sp
            else -> if (wide) 9.sp else 15.sp
        },
        fontWeight = if (ko != null && !wide) FontWeight.Medium else FontWeight.SemiBold,
        lineHeight = 1.em,
        letterSpacing = if (!big && wide) 0.em else 0.04.em,
    )
    val nameStyle = ArcType.tiny.copy(
        fontSize = ko?.let { with(density) { (it.u * 0.13f).coerceIn(10.dp, 14.dp).toSp() } } ?: if (big) 14.sp else 10.sp,
        lineHeight = 1.1.em,
    )
    val nameColor = if (g > 0.3f) c.onSignal else hw.darkDim
    // The key's own label top left, where the K.O. II prints it, and the sample at the
    // bottom, stacked, so a long name shortens rather than running into the label.
    // [room]: a big pad's height inside its padding.
    val content: @Composable BoxScope.(room: Dp?) -> Unit = { room ->
        val label: @Composable () -> Unit = {
            if (pad.label == ".") {
                // The dot key's label is a dot, as the K.O. II prints it, where a digit's foot would be.
                val em = with(density) { labelStyle.fontSize.toDp() }
                Box(Modifier.padding(start = em * 0.1f, top = em * 0.5f).size(em * 0.24f).clip(CircleShape).background(ink))
            } else {
                Text(pad.label, style = labelStyle, color = ink, maxLines = 1, softWrap = false)
            }
        }
        if (ko != null) {
            // The K.O. II's pads keep their proportions, so even a small one is stacked: the
            // name in the lines left under the digit (at least one; the cap clips the rest).
            // In SAMPLE mode the name also keeps clear of the face's foot, the cap's edge shorter
            // than the room, where the ring is drawn: up to three lines, and with no room for one
            // (small pads under the SAMPLE panel) none rather than half of one under the ring. A
            // screen reader still hears it.
            val ringed = sampleLed != null
            val left = room?.let { it - (if (ringed) CapDy * 2 else 0.dp) - with(density) { labelStyle.fontSize.toDp() } } ?: 0.dp
            val fit = with(density) { (left / (nameStyle.fontSize.toDp() * 1.1f)).toInt() }
            val lines = if (ringed) fit.coerceAtMost(3) else fit.coerceIn(1, 3)
            Column(Modifier.fillMaxSize()) {
                label()
                Spacer(Modifier.weight(1f))
                if (name != null && (room == null || lines >= 1)) Text(name, style = nameStyle, color = nameColor, maxLines = lines.coerceAtLeast(1), overflow = TextOverflow.Ellipsis)
            }
        } else {
            Column(Modifier.fillMaxSize()) {
                label()
                Spacer(Modifier.weight(1f))
                if (name != null) {
                    Text(name, style = nameStyle, color = nameColor, maxLines = if (big) 3 else 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
    val shape = ko?.keyShape ?: RoundedCornerShape(if (big) 8.dp else 6.dp)
    val held = remember { mutableStateOf(false) }
    val box = modifier
        // A dark cap in the K.O. II's own colours (the Guide's, in both themes), lit orange
        // (its edge with it, and a light around it), down while held.
        .litGlow(g, c.signal, shape)
        .cap(lerp(hw.ko.darkFace, c.signal, g), lerp(hw.ko.darkEdge, c.signalEdge, g), shape, capPress(held.value))
        // SAMPLE mode: the empty pads' ring blinks, the filled pads' stays (drawn, so a blink only redraws).
        .sampleRing(sampleLed, blink, c.signal, shape)
        // Playing on the phone, or EDIT on: a signal-orange ring inside the pad.
        .then(if (playing || onEdit != null) Modifier.border(2.dp, c.signal, shape) else Modifier)
        // ERASE: a dot on a pad with notes (pale on a lit pad), the rest dimmed.
        .eraseDot(noteDot, if (g > 0.3f) c.onSignal else c.signal)
        .then(
            when {
                // EDIT: a tap opens the pad sheet; held, it still plays.
                onEdit != null -> tapToEdit(onEdit, onPress, { onRelease(System.nanoTime()) }, held = held, haptics = haptics)
                // SAMPLE mode: held, it records (its press and lift go to the sampler, above); a screen
                // reader can't hold, so its click latches a hands-free take, and Play plays a filled pad.
                onPress != null && sampleLed != null && onLatch != null -> holdToPlay(
                    onPress, onRelease, onKept = onKept, onCut = onCut, inScroll = inScroll, held = held, haptics = haptics,
                    clickLabel = when (sampleLed) {
                        SampleLed.RECORDING -> MirrorText.STOP_RECORDING
                        SampleLed.WAITING -> MirrorText.CANCEL_RECORDING
                        else -> MirrorText.RECORD_HANDS_FREE
                    },
                    onClick = onLatch,
                    playAction = name != null,
                )
                // Both play on touch-down. The all-groups page scrolls, so there a press that
                // turns into a drag across the pads is cut short.
                // ERASE: a screen reader's click erases the pad's notes instead of playing it.
                onPress != null -> holdToPlay(
                    onPress, onRelease, onKept = onKept, onCut = onCut, inScroll = inScroll, held = held, haptics = haptics,
                    clickLabel = if (noteDot != null) MirrorText.ERASE else MirrorText.PLAY,
                    onPressure = onPressure,
                )
                else -> Modifier
            },
        )
        .semantics {
            contentDescription = "${pad.groupLetter} ${pad.label}" + (name?.let { ", $it" } ?: "") +
                when (sampleLed) {
                    null -> ""
                    SampleLed.RECORDING -> MirrorText.PAD_RECORDING
                    SampleLed.WAITING -> MirrorText.PAD_WAITING
                    else -> MirrorText.padSampleState(name != null)
                } +
                if (noteDot == true) MirrorText.PAD_HAS_NOTES else ""
        }
        .padding(
            when {
                ko != null -> PaddingValues(horizontal = ko.u * 0.1f, vertical = ko.u * 0.06f)
                big -> PaddingValues(10.dp)
                else -> PaddingValues(start = 6.dp, top = 5.dp, end = 7.dp, bottom = 5.dp)
            },
        )
    // EDIT's ⇄ badge in the top right corner, over the name if it must.
    val badge: @Composable BoxScope.() -> Unit = {
        if (onEdit != null) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .size(if (big) 24.dp else 14.dp)
                    .clip(RoundedCornerShape(if (big) 6.dp else 4.dp))
                    .background(c.signal),
                contentAlignment = Alignment.Center,
            ) {
                dev.arc.ep133.ui.components.Icon(ArcIcon.EXCHANGE, c.onSignal, size = if (big) 18.dp else 11.dp)
            }
        }
    }
    if (big) {
        BoxWithConstraints(box) {
            content(maxHeight)
            badge()
        }
    } else {
        Box(box) {
            content(null)
            badge()
        }
    }
}

/**
 * The last note sent outside the pads (the EP-133's own KEYS mode), in a small
 * display: "KEYS · MI4" and its channel while held, over two octaves around
 * it with the held notes lit.
 */
@Composable
private fun KeysMonitor(st: MirrorState, names: NoteNames) {
    val c = LocalArcColors.current
    val last = st.lastKeysNote ?: return
    val start = ((last / 12) * 12 - 12).coerceIn(0, 103)
    val black = setOf(1, 3, 6, 8, 10)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(c.display)
            .padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(MirrorText.lastNote(last, names).uppercase(), style = ArcType.displaySub, color = c.displayInk, modifier = Modifier.weight(1f))
            st.keysHeld[last]?.let { Text(MirrorText.channel(it), style = ArcType.displaySub, color = c.displayDim) }
        }
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(54.dp)
                .semantics { contentDescription = MirrorText.KEYS + " " + MirrorText.noteName(last, names) },
        ) {
            val whites = (start until start + 25).filter { it % 12 !in black }
            val w = size.width / whites.size
            whites.forEachIndexed { i, n ->
                val on = st.keysHeld.containsKey(n)
                drawRoundRect(
                    if (on) c.signal else c.pianoWhite,
                    topLeft = Offset(i * w + 1, 0f),
                    size = Size(w - 2, size.height),
                    cornerRadius = CornerRadius(3.dp.toPx()),
                )
            }
            for (n in start until start + 25) {
                if (n % 12 !in black) continue
                val leftWhites = whites.count { it < n }
                val on = st.keysHeld.containsKey(n)
                drawRoundRect(
                    if (on) c.signal else c.pianoBlack,
                    topLeft = Offset(leftWhites * w - w * 0.3f, 0f),
                    size = Size(w * 0.6f, size.height * 0.6f),
                    cornerRadius = CornerRadius(2.dp.toPx()),
                )
            }
        }
    }
}

/**
 * The pads' notes: the missing clock in the open on its side (the display
 * can't say it there), and the rest (offline, no pad messages, how Live
 * reads the EP-133) folded away.
 */
@Composable
private fun Notes(st: MirrorState, mirror: MirrorUi?, tapToPlay: Boolean = false, sideways: Boolean = false) {
    val c = LocalArcColors.current
    val learning = st.padOrder == PadOrder.FROM_TOP
    // On its side the display is one line (in the top bar), so what clock out is for is told here.
    if (sideways && mirror?.offline == null && st.playing == null && st.bpm == null) {
        Text(MirrorText.NO_TRANSPORT, style = ArcType.small, color = c.graphite)
    }
    Disclosure(MirrorText.HOW_LIVE_READS) {
        if (tapToPlay) Text(MirrorText.TAP_NOTE, style = ArcType.small, color = c.graphite)
        // Pads that play on the phone mean keys that do too, and sideways they are a piano.
        if (tapToPlay && !sideways) Text(MirrorText.PIANO_HINT, style = ArcType.small, color = c.graphite)
        // Offline the display line says so too, with this note under a tap.
        if (mirror?.offline != null) Text(MirrorText.offlineNote(mirror.offline, st.activeProject ?: FactorySounds.PROJECT), style = ArcType.small, color = c.graphite)
        if (learning) Text(MirrorText.LEARN_NOTE, style = ArcType.small, color = c.graphite)
        if (learning && !st.pushesSeen && st.learned.isEmpty() && st.lastHit?.pad != null && mirror?.loading == false) {
            Text(MirrorText.NO_PUSHES, style = ArcType.small, color = c.graphite)
        }
        Text(MirrorText.COMMUNITY_NOTE, style = ArcType.small, color = c.graphite)
        Text(MirrorText.LISTEN_ONLY, style = ArcType.small, color = c.graphite)
    }
}

/**
 * The row right under the grid, as the PO app's DRUMS / KEYPAD: in KEYS the
 * scale and the octave, a tap on either of which lists the choices, after
 * the view switch where there is one. [mode]: one word for the mode first,
 * which a tap switches (PADS ⇄ KEYS), where no plate prints it ([ModeStrip]):
 * the piano. [landscape]: the row over the piano ([SidewaysRow]).
 */
@Composable
private fun ModeRow(
    keys: KeysUi,
    actions: KeysActions,
    landscape: Boolean = false,
    /** KEYS' grid ⇄ piano switch, after the mode word; null where it isn't offered. */
    viewSwitch: ViewSwitch? = null,
    mode: Boolean = true,
    /** ARP and LATCH over the piano, after the view switch ([ArpRowWords]); null for none. */
    arp: LiveArp? = null,
) {
    if (landscape) {
        SidewaysRow(keys, actions, viewSwitch, mode, arp)
        return
    }
    val c = LocalArcColors.current
    Row(
        // Spread across the row: mode at the start, octave at the end, scale between.
        // Pulled up close under the grid, as the PO's DRUMS / KEYPAD; the words keep
        // their full touch height, only the gap above them shrinks.
        Modifier
            .layout { measurable, constraints ->
                val p = measurable.measure(constraints)
                val lift = 4.dp.roundToPx()
                layout(p.width, p.height - lift) { p.place(0, -lift) }
            }
            .fillMaxWidth()
            .padding(horizontal = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (viewSwitch != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwitchGap)) {
                if (mode) ModeWord(keys, actions, top = false)
                KeysViewSwitch(viewSwitch)
            }
        } else if (mode) {
            ModeWord(keys, actions, top = true)
        }
        if (keys.on) {
            PickWord(
                label = MirrorText.scaleName(keys.scale),
                options = Scale.entries,
                selected = keys.scale,
                name = MirrorText::scaleName,
                onPick = actions.onScale,
                description = MirrorText.scaleChoice(keys.scale),
                mark = Modifier.coachMark("live.scale", CoachText.SCALE, c.navy, c.onNavy),
                // With the switch's caps in the row, the words keep to its middle.
                top = viewSwitch == null,
            )
            PickWord(
                label = MirrorText.octave(keys.octave),
                options = (Keys.MIN_OCTAVE..Keys.MAX_OCTAVE).toList(),
                selected = keys.octave,
                name = MirrorText::octave,
                onPick = actions.onOctave,
                description = MirrorText.octaveChoice(keys.octave),
                mark = Modifier.coachMark("live.octave", CoachText.OCTAVE, c.navy, c.onNavy),
                // At the row's end: the list opens leftward, staying on screen.
                alignEnd = true,
                top = viewSwitch == null,
            )
        }
    }
}

/** PADS ⇄ KEYS: the word for the mode shown, which a tap switches. */
@Composable
private fun ModeWord(keys: KeysUi, actions: KeysActions, top: Boolean, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    dev.arc.ep133.ui.components.WordButton(
        if (keys.on) MirrorText.MODE_KEYS else MirrorText.MODE_PADS,
        { actions.onMode(!keys.on) },
        modifier.coachMark("live.mode", CoachText.MODE, c.navy, c.onNavy),
        mark = true,
        description = MirrorText.modeSwitch(keys.on),
        top = top,
    )
}

/**
 * The mode row over the piano: the mode ([mode]), ARP and LATCH ([arp]),
 * the scale and the key at the start, the octave between − and + at the
 * end. Short of room (large text), the key word drops its KEY, then the
 * scale shortens to its code; − and + keep their size.
 */
@Composable
private fun SidewaysRow(keys: KeysUi, actions: KeysActions, viewSwitch: ViewSwitch?, mode: Boolean, arp: LiveArp? = null) {
    val c = LocalArcColors.current
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val measurer = rememberTextMeasurer()
        val density = LocalDensity.current
        fun width(text: String, style: androidx.compose.ui.text.TextStyle = ArcType.word) = with(density) {
            measurer.measure(text.uppercase(), style, maxLines = 1, softWrap = false).size.width.toDp()
        }
        val viewStyle = viewWordStyle()
        val pick = " \u25BE"
        val scaleName = MirrorText.scaleName(keys.scale)
        // Everything but the scale and key words: the mode word and its mark, the octave
        // word between − and +, and the gaps (the one before − at its narrowest).
        val fixed = (if (mode) width(MirrorText.MODE_KEYS) + 18.dp + WordGap else 0.dp) + width(MirrorText.octave(keys.octave) + pick) + StepWidth * 2 + WordGap * 2 +
            // The view words: each its LED, the gap after it and its 2 dp either side.
            (if (viewSwitch != null) (if (mode) SwitchGap else 0.dp) + width(MirrorText.VIEW_PADS, viewStyle) + width(MirrorText.VIEW_PIANO, viewStyle) + (6.dp + 5.dp + 4.dp) * 2 + ViewWordGap + (if (mode) 0.dp else WordGap) else 0.dp) +
            // ARP and LATCH, as the view words, after their gap.
            (if (arp != null) WordGap + width(MirrorText.ARP, viewStyle) + width(MirrorText.LATCH, viewStyle) + (6.dp + 5.dp + 4.dp) * 2 + ArpWordGap else 0.dp)
        val key = MirrorText.keyWord(keys.root, keys.names).takeIf {
            fixed + width(scaleName + pick) + width(it + pick) <= maxWidth
        } ?: Keys.name(keys.root, keys.names)
        val scale = scaleName.takeIf { fixed + width(it + pick) + width(key + pick) <= maxWidth } ?: MirrorText.scaleCode(keys.scale)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (mode) ModeWord(keys, actions, top = false)
            if (viewSwitch != null) {
                if (mode) Spacer(Modifier.width(SwitchGap))
                KeysViewSwitch(viewSwitch)
            }
            if (arp != null) {
                if (mode || viewSwitch != null) Spacer(Modifier.width(WordGap))
                ArpRowWords(arp, repeat = !keys.on)
            }
            if (mode || viewSwitch != null || arp != null) Spacer(Modifier.width(WordGap))
            PickWord(
                label = scale,
                options = Scale.entries,
                selected = keys.scale,
                name = MirrorText::scaleName,
                onPick = actions.onScale,
                description = MirrorText.scaleChoice(keys.scale),
                mark = Modifier.coachMark("live.scale", CoachText.SCALE, c.navy, c.onNavy),
                top = false,
            )
            Spacer(Modifier.width(WordGap))
            // The key, which upright is in the tools: twelve names in two rows of six, as there.
            PickWord(
                label = key,
                options = (0..11).toList(),
                selected = keys.root,
                name = { Keys.name(it, keys.names) },
                onPick = actions.onRoot,
                description = MirrorText.keyChoice(keys.root, keys.names),
                mark = Modifier.coachMark("live.key", CoachText.KEY, c.navy, c.onNavy),
                columns = 6,
                top = false,
            )
            Spacer(Modifier.weight(1f).widthIn(min = WordGap))
            StepWord("\u2212", MirrorText.OCTAVE_DOWN, "live.down", enabled = keys.octave > Keys.MIN_OCTAVE) { actions.onOctave(keys.octave - 1) }
            PickWord(
                label = MirrorText.octave(keys.octave),
                options = (Keys.MIN_OCTAVE..Keys.MAX_OCTAVE).toList(),
                selected = keys.octave,
                name = MirrorText::octave,
                onPick = actions.onOctave,
                description = MirrorText.octaveChoice(keys.octave),
                mark = Modifier.coachMark("live.octave", CoachText.OCTAVE, c.navy, c.onNavy),
                alignEnd = true,
                top = false,
            )
            StepWord("+", MirrorText.OCTAVE_UP, "live.up", enabled = keys.octave < Keys.MAX_OCTAVE) { actions.onOctave(keys.octave + 1) }
        }
    }
}

/** The room between the words of the row over the keys. */
private val WordGap = 24.dp

/** The room between the function keys' column and the pads on a phone on its side. */
private val SideControlsGap = 12.dp

/** The KEYS view switch, [SwitchGap] after the mode word; its words' gap. */
private val SwitchGap = 8.dp
private val ViewWordGap = 4.dp

/**
 * KEYS on the grid or the piano: no caps, the two words printed as on the
 * K.O. II's body, each after its LED, the LED of the view shown lit and its
 * word in ink, the other grey. A tap on a word shows that view. The piano's
 * word is greyed out where no piano fits (fewer than 8 white keys, or under
 * 120 dp tall). [vertical]: one word over the other, each turned as the mode
 * word is (the column beside the keys on a phone on its side).
 */
@Composable
private fun KeysViewSwitch(ui: ViewSwitch, vertical: Boolean = false) {
    val c = LocalArcColors.current
    val group = Modifier
        .coachMark("live.keysView", CoachText.KEYS_VIEW, c.navy, c.onNavy)
        .semantics { contentDescription = MirrorText.KEYS_VIEW }
        .selectableGroup()
    val turn = if (vertical) Modifier.rotateVertical() else Modifier
    val pads: @Composable () -> Unit = {
        ViewWord(MirrorText.VIEW_PADS, on = !ui.piano, enabled = true, MirrorText.keysView(false), turn) { ui.onPick(KeysView.PADS) }
    }
    val piano: @Composable () -> Unit = {
        ViewWord(
            MirrorText.VIEW_PIANO, on = ui.piano, enabled = ui.pianoEnabled,
            if (ui.pianoEnabled) MirrorText.keysView(true) else MirrorText.keysView(true) + ". " + MirrorText.PIANO_NO_ROOM,
            turn,
        ) { ui.onPick(KeysView.PIANO) }
    }
    if (vertical) {
        Column(group, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) { pads(); piano() }
    } else {
        Row(group, horizontalArrangement = Arrangement.spacedBy(ViewWordGap)) { pads(); piano() }
    }
}

/** One word of [KeysViewSwitch]: its LED, lit while it is the view shown, and the word, 44 dp high to touch ([modifier]: turned). */
@Composable
private fun ViewWord(word: String, on: Boolean, enabled: Boolean, description: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    Row(
        modifier
            .clip(RoundedCornerShape(6.dp))
            .selectable(selected = on, enabled = enabled, role = Role.RadioButton, interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick)
            .semantics { contentDescription = description }
            .heightIn(min = 44.dp)
            .padding(horizontal = 2.dp)
            .alpha(if (enabled) 1f else 0.45f),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(
            Modifier
                .size(6.dp)
                .then(if (on) Modifier.dropShadow(CircleShape, Shadow(radius = 6.dp, color = c.signal)) else Modifier)
                .clip(CircleShape)
                .background(if (on) c.signal else hw.ledOff),
        )
        Text(word.uppercase(), style = viewWordStyle(), color = if (on) c.ink else c.graphite, maxLines = 1, softWrap = false)
    }
}

/** The view words' print: 11 dp ([size]) whatever the font size, as the words printed on the body are. */
@Composable
internal fun viewWordStyle(size: Dp = 11.dp, spacing: Float = 0.07f): androidx.compose.ui.text.TextStyle =
    ArcType.capsKeySmall.copy(fontSize = with(LocalDensity.current) { size.toSp() }, fontWeight = FontWeight.Bold, letterSpacing = spacing.em)

/**
 * KEYS' grid on a phone on its side: the view words, turned, a column
 * between the function keys and the keys.
 */
@Composable
private fun SidewaysKeysLead(viewSwitch: ViewSwitch) {
    Column(
        Modifier.width(SideLead).fillMaxHeight(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        KeysViewSwitch(viewSwitch, vertical = true)
    }
}

/**
 * KEYS' grid on a phone on its side: the scale and the octave, turned as the
 * mode word is, a column right of the keys.
 */
@Composable
private fun SidewaysKeysPicks(keys: KeysUi, actions: KeysActions) {
    val c = LocalArcColors.current
    Column(
        Modifier.width(SidePicks).fillMaxHeight(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        PickWord(
            label = MirrorText.scaleName(keys.scale),
            options = Scale.entries,
            selected = keys.scale,
            name = MirrorText::scaleName,
            onPick = actions.onScale,
            description = MirrorText.scaleChoice(keys.scale),
            mark = Modifier.rotateVertical().coachMark("live.scale", CoachText.SCALE, c.navy, c.onNavy),
            alignEnd = true,
            top = false,
        )
        PickWord(
            label = MirrorText.octave(keys.octave),
            options = (Keys.MIN_OCTAVE..Keys.MAX_OCTAVE).toList(),
            selected = keys.octave,
            name = MirrorText::octave,
            onPick = actions.onOctave,
            description = MirrorText.octaveChoice(keys.octave),
            mark = Modifier.rotateVertical().coachMark("live.octave", CoachText.OCTAVE, c.navy, c.onNavy),
            alignEnd = true,
            top = false,
        )
    }
}

/** KEYS' columns either side of the grid on a phone on its side (the view words', the picks'), and the room between them and it. */
private val SideLead = 44.dp
private val SidePicks = 44.dp
private val SideGap = 12.dp
private val SideGapTight = 6.dp

/** Under this pad width the keys' printed words and octave numbers start to clip. */
private val KeysTightU = 38.dp

/** − and + are this wide, however tight the row. */
private val StepWidth = 48.dp

/** − or + by the octave word: one octave down or up, greyed (and disabled) at either end. [id]: the guide overlay's tags keep off it. */
@Composable
private fun StepWord(glyph: String, description: String, id: String, enabled: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    Box(
        Modifier
            .coachClear(id)
            .clip(RoundedCornerShape(6.dp))
            .clickable(
                enabled = enabled,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics(mergeDescendants = true) { contentDescription = description }
            .widthIn(min = StepWidth)
            .heightIn(min = 44.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(glyph, style = ArcType.word.copy(fontSize = 22.sp, lineHeight = 1.em), color = c.wordInk(dim = !enabled))
    }
}

/**
 * A word showing a choice ("MAJOR ▾"); a tap lists the choices over the keys,
 * the chosen one marked. The list opens toward the side with more room: up
 * from a row under the grid, down from one over the piano. On a phone on its
 * side the choices fill as many columns as that room needs ([columns] makes a
 * fixed grid instead); a list that still doesn't fit scrolls.
 */
@Composable
private fun <T> PickWord(
    label: String,
    options: List<T>,
    selected: T,
    name: (T) -> String,
    onPick: (T) -> Unit,
    description: String,
    mark: Modifier = Modifier,
    /** At the row's end: the list lines up with the word's end, staying on screen. */
    alignEnd: Boolean = false,
    /** A grid this many choices wide, filled row by row (the keys' two rows of six). */
    columns: Int? = null,
    /** The word at the top of its touch area, hugging the grid above. */
    top: Boolean = true,
) {
    val c = LocalArcColors.current
    val window = LocalArcWindow.current
    // Turning the phone closes the list: the word it hangs from moves.
    var open by remember(window.landscape) { mutableStateOf(false) }
    // Where the word is, read when the list opens.
    val anchor = remember { arrayOfNulls<androidx.compose.ui.layout.LayoutCoordinates>(1) }
    Box(Modifier.onGloballyPositioned { anchor[0] = it }) {
        dev.arc.ep133.ui.components.WordButton("$label \u25BE", { open = true }, mark, description = description, top = top)
        if (open) {
            val density = LocalDensity.current
            val safe = WindowInsets.safeDrawing
            val at = anchor[0]?.takeIf { it.isAttached }
            val bounds = at?.boundsInRoot() ?: androidx.compose.ui.geometry.Rect.Zero
            val bottom = (at?.findRootCoordinates()?.size?.height ?: 0) - safe.getBottom(density)
            // The room over the word (the list ends at its foot) and under it (the list starts at its top).
            val above = bounds.bottom - safe.getTop(density)
            val below = bottom - bounds.top
            val up = above >= below
            val room = (with(density) { maxOf(above, below).toDp() } - ListPadding * 2 - 8.dp).coerceAtLeast(PickRow)
            val perColumn = (room / PickRow).toInt().coerceAtLeast(1)
            val wide = columns ?: if (window.landscape) (options.size + perColumn - 1) / perColumn else 1
            androidx.compose.ui.window.Popup(
                alignment = when {
                    up -> if (alignEnd) Alignment.BottomEnd else Alignment.BottomStart
                    else -> if (alignEnd) Alignment.TopEnd else Alignment.TopStart
                },
                onDismissRequest = { open = false },
                properties = androidx.compose.ui.window.PopupProperties(focusable = true),
            ) {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(14.dp))
                        .background(c.shell)
                        .border(1.dp, c.line, RoundedCornerShape(14.dp))
                        .heightIn(max = room + ListPadding * 2)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = ListPadding),
                ) {
                    val choice: @Composable (T, Modifier) -> Unit = { o, modifier ->
                        val on = o == selected
                        dev.arc.ep133.ui.components.WordButton(
                            name(o),
                            {
                                onPick(o)
                                open = false
                            },
                            modifier.semantics { this.selected = on },
                            mark = on,
                            dim = !on,
                        )
                    }
                    if (columns != null) {
                        // Row by row, in order, in cells of one width so the columns line up.
                        Column {
                            for (row in options.chunked(columns)) {
                                Row { for (o in row) choice(o, Modifier.widthIn(min = 52.dp)) }
                            }
                        }
                    } else {
                        // Column by column, in order, as even as they go.
                        val tall = (options.size + wide - 1) / wide
                        Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                            for (col in options.chunked(tall)) {
                                Column { for (o in col) choice(o, Modifier) }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** A choice's row in a [PickWord] list (a word's touch height). */
private val PickRow = 44.dp
private val ListPadding = 8.dp

/**
 * The KEYS display line: KEYS and the last note on the left, the sound it
 * plays on the right, after the pattern's RECORD and PLAY, its words in
 * their place while it is on ([PatternLine]). [compact]: one bar tall, in the top bar ([LivePill]),
 * where the mode word is right under it. A device note past the piano's ends
 * ([pianoRange]) is named as such: there's no key to light for it.
 */
@Composable
private fun KeysDisplay(
    st: MirrorState,
    mirror: MirrorUi?,
    keys: KeysUi,
    transport: TransportUi?,
    take: TakeUi?,
    still: Boolean,
    compact: Boolean = false,
    pianoRange: IntRange? = null,
    /** While the arp plays: what it plays, in signal orange in place of the note and the sound. */
    arp: String? = null,
) {
    val c = LocalArcColors.current
    if (arp != null) {
        PatternLine(transport, take, still, compact) {
            SpokenLine(spoken(arp)) {
                Text(arp, style = ArcType.displayHead, color = c.signal, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            }
        }
        return
    }
    val note = keys.playingNotes.lastOrNull() ?: st.lastNote
    val noteText = note?.let { n ->
        if (pianoRange != null && n !in pianoRange && n !in keys.playingNotes) {
            MirrorText.outOfRange(n, keys.names, below = n < pianoRange.first)
        } else {
            MirrorText.noteName(n, keys.names)
        }
    }
    val offline = if (mirror?.offline != null) MirrorText.OFFLINE else null
    val sound = keys.pad?.let { MirrorText.keysSound(it, keys.padName) } ?: MirrorText.NO_SOUND
    val said = spoken(listOfNotNull(MirrorText.MODE_KEYS, noteText, offline, sound).joinToString(", "))
    // In the bar the note takes at most half the line, so a long one ("DO6, above the keys")
    // never squeezes out the sound's name.
    BoxWithConstraints {
        val noteMax = if (compact) maxWidth / 2 else Dp.Unspecified
        PatternLine(transport, take, still, compact) {
            SpokenLine(said) {
                if (!compact) Text(MirrorText.MODE_KEYS.uppercase(), style = ArcType.displaySub, color = c.displayDim, maxLines = 1)
                noteText?.let {
                    Text(it, style = ArcType.displaySub, color = c.displayInk, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = noteMax))
                }
                Text(
                    sound,
                    style = ArcType.displayHead,
                    color = c.displayInk,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = androidx.compose.ui.text.style.TextAlign.End,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/**
 * The 12 pads as keys, in the keypad's layout and drawn as the pads are (the
 * K.O. II's body, KoDeck): each shows its note (or a ring) where a pad prints
 * its digit, orange on the scale's root (the first key of each octave of it)
 * and pale on the rest, as the piano marks them, and its octave under it.
 * Notes from the device light their key; the notes playing on the phone are
 * outlined in signal orange.
 */
@Composable
private fun KeysGrid(
    st: MirrorState,
    keys: KeysUi,
    now: Long,
    actions: KeysActions,
    modifier: Modifier,
    haptics: Boolean = false,
    /** PROJECT held: a key where a pad prints 1 to 9 picks that project instead (ProjectHold). */
    hold: ProjectHold? = null,
    functions: FunctionKeysUi = FunctionKeysUi(),
    /** KEYS / PADS in the plate's right margin (KoDeck). */
    mode: (@Composable (Modifier, Dp) -> Unit)? = null,
    /** While the arp is on: a held key's pressure, the touch's own, for the note it pressed. */
    pressure: ((note: Int, pressure: Float) -> Unit)? = null,
) {
    val c = LocalArcColors.current
    val notes = Keys.notes(keys.root, keys.scale, keys.octave)
    // Each key is a finger of its own, holding the note it had when pressed: a new key,
    // scale or octave under a held key still lets go of the note that sounds.
    val touches = remember { NoteTouches() }
    // [at]: when the finger came down or left, for the presses and releases among [events].
    fun play(events: List<NoteEvent>, at: Long = System.nanoTime()) = events.forEach { e ->
        when (e) {
            is NoteEvent.Press -> actions.onNote(e.note, true, at)
            is NoteEvent.Release -> actions.onNoteUp(e.note, at)
        }
    }
    // How lit each key is: the brightest device note that falls on it.
    val lit = HashMap<Int, Float>()
    for ((n, l) in st.notes) {
        val k = Keys.keyFor(n, notes) ?: continue
        lit[k] = maxOf(lit[k] ?: 0f, glow(l, now))
    }
    // The keys on the K.O. II's body as the pads are (KoDeck): each note where a pad prints
    // its digit, its octave where a pad shows its sample.
    val hw = LocalHwColors.current
    val density = LocalDensity.current
    KoDeck(modifier, groupKeys = null, mode) { o, k ->
        val note = notes[o]
        // The note the arp sounds now lights its key as a device note does.
        val g = if (note in keys.arpLit) 1f else lit[o] ?: 0f
        // Held for the arp: outlined, and numbered in the order pressed.
        val order = keys.arpHeld.indexOf(note) + 1
        // Dark caps: the root orange, the scale's other notes pale (navy would sink into
        // the cap). A named key shows its name in that colour, without the ring.
        val root = o % keys.scale.intervals.size == 0
        val ring = if (root) c.signal else hw.ring
        val held = remember { mutableStateOf(false) }
        // The note the finger pressed, whose pressure it reports (a new key or octave under it keeps it).
        val pressed = remember { intArrayOf(note) }
        val nameSize = with(density) { (k.u * 0.277f).coerceIn(15.dp, 34.dp) }
        Column(
            Modifier
                .size(k.u, k.h)
                .litGlow(g, c.signal, k.keyShape)
                .cap(lerp(hw.ko.darkFace, c.signal, g), lerp(hw.ko.darkEdge, c.signalEdge, g), k.keyShape, capPress(held.value))
                .then(if (note in keys.playingNotes || order > 0) Modifier.border(2.dp, c.signal, k.keyShape) else Modifier)
                .then(
                    holdToPlay(
                        // A screen reader's Play sounds the note to its end: no finger to keep count of.
                        { holding, _, at ->
                            when {
                                hold?.press(keysKey(o), padDigit(o), functions) == true -> {}
                                holding -> {
                                    pressed[0] = notes[o]
                                    play(touches.down(o.toLong(), notes[o]), at)
                                }
                                else -> actions.onNote(notes[o], false, at)
                            }
                        },
                        { at -> if (hold?.release(keysKey(o)) != true) play(touches.up(o.toLong()), at) },
                        held = held,
                        haptics = haptics,
                        onPressure = pressure?.let { f -> { p: Float -> f(pressed[0], p) } },
                    ),
                )
                .semantics { contentDescription = MirrorText.noteName(note, keys.names) }
                .padding(horizontal = k.u * 0.1f, vertical = k.u * 0.06f),
        ) {
            val ink = if (g > 0.3f) c.onSignal else if (root) c.signal else hw.darkInk
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            if (!keys.showNames) {
                // Unnamed: a ring the digit's height, where the digit would be.
                Canvas(Modifier.padding(top = nameSize * 0.12f).size(nameSize * 0.8f)) {
                    val stroke = size.width * 0.14f
                    drawCircle(
                        color = if (g > 0.3f) c.onSignal else ring,
                        radius = size.width / 2 - stroke / 2,
                        style = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke),
                    )
                }
            } else {
                Text(
                    Keys.name(note, keys.names),
                    style = ArcType.semi.copy(fontSize = with(density) { nameSize.toSp() }, fontWeight = FontWeight.Medium, lineHeight = 1.em, letterSpacing = 0.02.em),
                    color = ink,
                    maxLines = 1,
                    softWrap = false,
                )
            }
            if (order > 0) {
                Spacer(Modifier.weight(1f))
                Text(
                    order.toString(),
                    style = ArcType.tiny.copy(fontSize = with(density) { (k.u * 0.12f).coerceIn(9.dp, 13.dp).toSp() }, lineHeight = 1.em, fontWeight = FontWeight.SemiBold),
                    color = if (g > 0.3f) c.onSignal else c.signal,
                    maxLines = 1,
                    modifier = Modifier.clearAndSetSemantics { },
                )
            }
            }
            Spacer(Modifier.weight(1f))
            Text(
                Keys.octaveOf(note).toString(),
                style = ArcType.tiny.copy(fontSize = with(density) { (k.u * 0.13f).coerceIn(10.dp, 14.dp).toSp() }, lineHeight = 1.1.em),
                color = if (g > 0.3f) c.onSignal else hw.darkDim,
            )
        }
    }
}

/**
 * The KEYS tools: the key picked on one octave of piano keys, what the keys'
 * colours mean as compact chips, and how Keys works folded away. [piano]: the
 * piano is showing, so the chips are the piano's.
 */
@Composable
private fun KeysPanel(keys: KeysUi, actions: KeysActions, piano: Boolean = false) {
    val c = LocalArcColors.current
    GridPlate {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(MirrorText.KEY, style = ArcType.semi, color = c.ink)
                Text(MirrorText.KEY_HINT, style = ArcType.small, color = c.graphite, modifier = Modifier.padding(bottom = 1.dp))
            }
            MiniPiano(keys.root, keys.names, actions.onRoot)
        }
    }
    GridPlate {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(MirrorText.LEGEND, style = ArcType.semi, color = c.ink)
            KeysChips(piano, named = keys.showNames)
        }
    }
    Disclosure(MirrorText.HOW_KEYS_WORKS) {
        Text(MirrorText.KEYS_NOTE, style = ArcType.small, color = c.graphite)
        // Sideways already, the piano is there (or there's no room for one).
        if (!LocalArcWindow.current.landscape) Text(MirrorText.PIANO_HINT, style = ArcType.small, color = c.graphite)
    }
}

/**
 * What the keys' colours mean, as chips: a key in miniature and a short word
 * each, read out in full by screen readers. The [piano] has a bar for its
 * root (the grid a ring, or its name in orange when [named]) and dims the keys
 * outside the scale, which the grid doesn't show.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun KeysChips(piano: Boolean, named: Boolean) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val face = if (piano) c.pianoWhite else hw.darkFace
    androidx.compose.foundation.layout.FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Chip(MirrorText.CHIP_DEVICE, MirrorText.LEGEND_DEVICE) { LegendKey(ring = null, fill = c.signal, side = ChipKey) }
        Chip(MirrorText.CHIP_PHONE, MirrorText.LEGEND_PHONE) {
            LegendKey(ring = null, fill = face, outline = if (piano) c.pianoSignal else c.signal, side = ChipKey)
        }
        if (piano) {
            Chip(MirrorText.CHIP_ROOT, MirrorText.LEGEND_ROOT_BAR) { LegendKey(ring = null, fill = face, bar = c.rootOn(face), side = ChipKey) }
            Chip(MirrorText.CHIP_OUT, MirrorText.LEGEND_OUT) { LegendKey(ring = null, fill = c.keyOut, side = ChipKey) }
        } else {
            Chip(MirrorText.CHIP_ROOT, if (named) MirrorText.LEGEND_ROOT_NAMED else MirrorText.LEGEND_ROOT) { LegendKey(ring = c.signal, fill = face, side = ChipKey) }
        }
    }
}

/** A legend key in a chip. */
private val ChipKey = 16.dp

@Composable
private fun Chip(text: String, description: String, key: @Composable () -> Unit) {
    val c = LocalArcColors.current
    Row(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(c.shell)
            .clearAndSetSemantics { contentDescription = description }
            .padding(start = 6.dp, end = 12.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        key()
        Text(text, style = ArcType.tiny, color = c.graphite, maxLines = 1)
    }
}

/**
 * A key in miniature: its face (lit orange, or dimmed, as [fill] says), its
 * ring if it has one (or, with a [name], that name in the ring's colour; [bare],
 * neither), a root's [bar] at its foot, the phone's outline, and an octave
 * [digit] in the corner.
 */
@Composable
private fun LegendKey(
    ring: Color?,
    fill: Color? = null,
    outline: Color? = null,
    digit: String? = null,
    name: String? = null,
    bar: Color? = null,
    bare: Boolean = false,
    side: Dp = 26.dp,
) {
    val c = LocalArcColors.current
    val scale = side / 26.dp
    Box(
        Modifier
            .size(side)
            .clip(RoundedCornerShape(4.dp * scale))
            .background(fill ?: LocalHwColors.current.darkFace)
            .then(if (outline != null) Modifier.border(2.dp, outline, RoundedCornerShape(4.dp * scale)) else Modifier)
            .padding((if (digit != null) 3.dp else 5.dp) * scale),
    ) {
        if (bar != null) {
            Box(Modifier.align(Alignment.BottomCenter).size(width = 10.dp * scale, height = 2.dp).clip(RoundedCornerShape(1.dp)).background(bar))
        }
        if (bare) {
            // Nothing in the middle.
        } else if (ring != null && name != null) {
            Text(name, style = ArcType.semi.copy(fontSize = 9.sp, lineHeight = 1.em), color = ring, maxLines = 1, softWrap = false, modifier = Modifier.align(Alignment.Center))
        } else if (ring != null) {
            Canvas(Modifier.fillMaxSize()) {
                val stroke = size.minDimension * 0.14f
                drawCircle(ring, radius = size.minDimension / 2 - stroke / 2, style = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke))
            }
        }
        if (digit != null) {
            Text(digit, style = ArcType.tiny.copy(fontSize = 10.sp, lineHeight = 1.em), color = c.ink, modifier = Modifier.align(Alignment.BottomEnd))
        }
    }
}

/**
 * Sounds while held, as an instrument in gate mode does: [onPress] on
 * touch-down, [onRelease] when the finger lifts (or the gesture is taken
 * over). Each finger is its own press, so several pads or keys held together
 * make a chord. [inScroll]: in a scrolling page the press still plays at
 * once, and a drag that starts within [PRESS_DELAY_MS] (or the scroll taking
 * the finger then) is a scroll after all: [onCut] ends the sound in a few
 * milliseconds instead. Such a press is handed on unsure, and [onKept] says
 * when it was a press after all (the window closed, or the finger lifted
 * inside it). Screen readers get a plain Play action, which plays
 * the whole sound. [held] is true while a finger holds it (the cap stays
 * down). [haptics]: a light tick once the press is handed on (a cut keeps it).
 * The press's time is the touch-down event's ([PressTime]), so Live's
 * latency counts from the touch itself; the release's is the lift's
 * (SAMPLE stops a take at it), or now when the gesture ended otherwise.
 * [onClick] stands in for a screen reader's click (labelled [clickLabel]),
 * and [playAction] then keeps Play as an action of its own (SAMPLE mode).
 * A swipe on the pads that takes the finger to open or close the SAMPLE
 * panel ([SamplePanel.took]) cuts the press short ([onCut]), on any page. [onKept], [onRelease] and [onCut]
 * are those of the touch-down: the pad pressed hears its whole press, even
 * if by the lift the cap shows another pad (the group switched under it).
 */
@Composable
private fun holdToPlay(
    onPress: (hold: Boolean, unsure: Boolean, pressedAt: Long) -> Unit,
    onRelease: (releasedAt: Long) -> Unit,
    onKept: () -> Unit = {},
    onCut: () -> Unit = { onRelease(System.nanoTime()) },
    inScroll: Boolean = false,
    held: MutableState<Boolean>? = null,
    haptics: Boolean = false,
    clickLabel: String = MirrorText.PLAY,
    onClick: (() -> Unit)? = null,
    playAction: Boolean = false,
    /** While the arp is on: the held finger's pressure as it goes down and as it changes (null: not asked). */
    onPressure: ((Float) -> Unit)? = null,
): Modifier {
    val press by androidx.compose.runtime.rememberUpdatedState(onPress)
    val pressure by androidx.compose.runtime.rememberUpdatedState(onPressure)
    val release by androidx.compose.runtime.rememberUpdatedState(onRelease)
    val cut by androidx.compose.runtime.rememberUpdatedState(onCut)
    val kept by androidx.compose.runtime.rememberUpdatedState(onKept)
    val click by androidx.compose.runtime.rememberUpdatedState(onClick)
    val tick by androidx.compose.runtime.rememberUpdatedState(if (haptics) LocalHapticFeedback.current else null)
    // The SAMPLE panel's swipe ([panelSwipe]): one that takes the finger cuts the press short, as a scroll does.
    val swipe = LocalSamplePanel.current
    return Modifier
        .pointerInput(inScroll, swipe) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                // The pad pressed hears the rest of its press, even if the cap shows another pad by the
                // lift (Follow, or another finger's group key, switched the group under it).
                val pressRelease = release
                val pressCut = cut
                val pressKept = kept
                press(true, inScroll, PressTime.of(down.uptimeMillis))
                pressure?.invoke(down.pressure)
                tick?.performHapticFeedback(HapticFeedbackType.KeyboardTap)
                held?.value = true
                var scrolled = false
                var unsure = inScroll
                // When the finger lifted (the event's own time), if it did.
                var upAt: Long? = null
                try {
                    var lifted = false
                    if (inScroll) {
                        withTimeoutOrNull(PRESS_DELAY_MS) {
                            while (!lifted && !scrolled) {
                                // The Final pass sees what the scroll above took.
                                val ch = awaitPointerEvent(PointerEventPass.Final).changes.firstOrNull { it.id == down.id }
                                when {
                                    ch == null -> scrolled = true
                                    ch.changedToUp() -> {
                                        lifted = true
                                        upAt = ch.uptimeMillis
                                    }
                                    ch.isConsumed || (ch.position - down.position).getDistance() > viewConfiguration.touchSlop -> scrolled = true
                                }
                            }
                        }
                        if (!scrolled) {
                            unsure = false
                            pressKept()
                        }
                    }
                    while (!lifted && !scrolled) {
                        val ch = awaitPointerEvent(PointerEventPass.Final).changes.firstOrNull { it.id == down.id } ?: break
                        // Lifted, or a scroll took the finger over.
                        if (!ch.pressed) {
                            upAt = ch.uptimeMillis
                            break
                        }
                        pressure?.invoke(ch.pressure)
                        if (ch.isConsumed && swipe?.took(down.id) == true) {
                            scrolled = true
                            break
                        }
                        if (inScroll && ch.isConsumed) break
                    }
                } finally {
                    // Also when the pad leaves the screen with the finger still on it.
                    held?.value = false
                    if (scrolled) {
                        pressCut()
                    } else {
                        // Ended inside the window some other way (the pad left the screen): kept, then let go of.
                        if (unsure) pressKept()
                        pressRelease(upAt?.let(PressTime::of) ?: System.nanoTime())
                    }
                }
            }
        }
        .semantics {
            role = Role.Button
            onClick(label = clickLabel) {
                click?.invoke() ?: press(false, false, System.nanoTime())
                true
            }
            if (playAction) {
                customActions = listOf(
                    androidx.compose.ui.semantics.CustomAccessibilityAction(MirrorText.PLAY) {
                        press(false, false, System.nanoTime())
                        true
                    },
                )
            }
        }
}

/** How long a press in a scrolling page may still turn out to be a scroll (as Compose's own press feedback waits). */
private const val PRESS_DELAY_MS = 64L

/**
 * A pad while EDIT is on: a tap calls [onTap] (the pad sheet); held past a
 * long press it plays, as [holdToPlay] does, until the finger lifts ([onPress]
 * null: it doesn't play), with the same tick when [haptics]. A drag (a scroll)
 * does neither. Screen readers get the tap as the pad's click and Play as an
 * action of its own. The press's time is when the hold became a long press
 * (the touch-down event's time and the timeout, [PressTime]).
 */
@Composable
private fun tapToEdit(
    onTap: () -> Unit,
    onPress: ((hold: Boolean, unsure: Boolean, pressedAt: Long) -> Unit)?,
    onRelease: () -> Unit,
    held: MutableState<Boolean>,
    haptics: Boolean = false,
): Modifier {
    val tap by androidx.compose.runtime.rememberUpdatedState(onTap)
    val press by androidx.compose.runtime.rememberUpdatedState(onPress)
    val release by androidx.compose.runtime.rememberUpdatedState(onRelease)
    val tick by androidx.compose.runtime.rememberUpdatedState(if (haptics) LocalHapticFeedback.current else null)
    return Modifier
        .pointerInput(Unit) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                // Down at once, so a tap shows on the cap too.
                held.value = true
                try {
                    var lifted = false
                    var moved = false
                    withTimeoutOrNull(viewConfiguration.longPressTimeoutMillis) {
                        while (!lifted && !moved) {
                            val ch = awaitPointerEvent(PointerEventPass.Final).changes.firstOrNull { it.id == down.id }
                            when {
                                ch == null -> moved = true
                                ch.changedToUp() -> lifted = true
                                ch.isConsumed || (ch.position - down.position).getDistance() > viewConfiguration.touchSlop -> moved = true
                            }
                        }
                    }
                    if (lifted) {
                        tap()
                        return@awaitEachGesture
                    }
                    val play = press
                    if (moved || play == null) return@awaitEachGesture
                    play(true, false, PressTime.of(down.uptimeMillis + viewConfiguration.longPressTimeoutMillis))
                    tick?.performHapticFeedback(HapticFeedbackType.KeyboardTap)
                    try {
                        while (true) {
                            val ch = awaitPointerEvent(PointerEventPass.Final).changes.firstOrNull { it.id == down.id } ?: break
                            if (!ch.pressed || ch.isConsumed) break
                        }
                    } finally {
                        release()
                    }
                } finally {
                    held.value = false
                }
            }
        }
        .semantics {
            role = Role.Button
            onClick(label = MirrorText.EDIT_LINE) {
                tap()
                true
            }
            if (press != null) {
                customActions = listOf(
                    androidx.compose.ui.semantics.CustomAccessibilityAction(MirrorText.PLAY) {
                        press?.invoke(false, false, System.nanoTime())
                        true
                    },
                )
            }
        }
}

/**
 * Live tools' takes: the TAKE key, which starts a take (it records from the
 * first sound) and stops it, its time on it while it records; then the
 * takes, each of which plays, and unfolds to share, save, send to the EP-133
 * or delete. How to record and what a take holds wait behind the info key
 * after TAKES.
 */
@Composable
private fun TakesSection(t: TakesUi, take: TakeUi) {
    val c = LocalArcColors.current
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    var confirm by rememberSaveable { mutableStateOf<String?>(null) }
    CaptionInfo(MirrorText.TAKES, listOf(MirrorText.TAKES_HINT, MirrorText.TAKES_NOTE))
    val recording = take.state as? RecState.Recording
    ArcKey(
        "\u25CF " + (recording?.let { MirrorText.takeBadge(it.seconds.toDouble()) } ?: MirrorText.TAKE),
        take.onTake,
        Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                contentDescription = MirrorText.takeDescription(take.state)
                stateDescription = MirrorText.onOff(take.state != RecState.Idle)
            },
        style = if (take.state != RecState.Idle) KeyStyle.Signal else KeyStyle.Normal,
        size = KeySize.Small,
    )
    for (take in t.list) {
        val playing = t.playing == t.keyOf(take)
        val unfolded = open == take.name
        Plate(onClick = { open = if (unfolded) null else take.name; confirm = null }, enabled = true) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    dev.arc.ep133.ui.components.OneLine(t.fmtWhen(take.createdAt), ArcType.bold, c.ink)
                    Text(MirrorText.takeLength(take.seconds), style = ArcType.small, color = c.graphite)
                }
                ArcKey(
                    if (playing) dev.arc.ep133.text.FeatureText.STOP else dev.arc.ep133.text.FeatureText.PLAY,
                    { if (playing) t.onStop() else t.onPlay(take) },
                    size = KeySize.Small,
                )
            }
            if (unfolded) {
                if (confirm == take.name) {
                    Text(MirrorText.DELETE_TAKE, style = ArcType.small, color = c.graphite, modifier = Modifier.padding(top = 6.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ArcKey(dev.arc.ep133.text.Strings.DELETE, {
                            confirm = null
                            open = null
                            t.onDelete(take)
                        }, Modifier.weight(1f), size = KeySize.Small, style = KeyStyle.Signal)
                        ArcKey(dev.arc.ep133.text.Strings.CANCEL, { confirm = null }, Modifier.weight(1f), size = KeySize.Small)
                    }
                } else {
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ArcKey(dev.arc.ep133.text.FeatureText.SHARE_WAV, { t.onShare(take) }, Modifier.weight(1f), size = KeySize.Small)
                        ArcKey(dev.arc.ep133.text.FeatureText.SAVE_WAV, { t.onSave(take) }, Modifier.weight(1f), size = KeySize.Small)
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (t.connected) ArcKey(MirrorText.TO_DEVICE, { t.onToDevice(take) }, Modifier.weight(1f), size = KeySize.Small)
                        ArcKey(dev.arc.ep133.text.Strings.DELETE, { confirm = take.name }, Modifier.weight(1f), size = KeySize.Small)
                    }
                }
            }
        }
    }
}
