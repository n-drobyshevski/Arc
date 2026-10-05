package dev.arc.ep133.ui.screens

import dev.arc.ep133.ui.components.EdgeTabWidth
import androidx.compose.runtime.mutableStateOf
import dev.arc.ep133.ui.components.SwitchRow
import dev.arc.ep133.ui.components.SideStripWidth
import dev.arc.ep133.ui.components.SideZone
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.ui.components.TextToggle
import dev.arc.ep133.ui.components.CoachYellowInk
import dev.arc.ep133.ui.components.CoachYellow
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.components.ArcIcon
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.MirrorUi
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.PadLight
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.NoteEvent
import dev.arc.ep133.features.NoteTouches
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.Scale
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.PlateLine
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
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.findRootCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import dev.arc.ep133.features.Piano
import dev.arc.ep133.ui.components.ArcWindow
import kotlinx.coroutines.delay
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/*
 * Pads are drawn as the pocket operator app draws its pad grid: one pale
 * plate split by thin lines. A lit pad turns the signal orange, brighter with
 * velocity, and fades on release.
 */
private val KeyBlack = Color(0xFF1E1F21)
private val KeyWhite = Color(0xFFF3F2EE)
private val FADE_NS = 300_000_000L

/** What the KEYS view shows: whether it is on, the key, scale and octave, and the sound it plays. */
data class KeysUi(
    val on: Boolean = false,
    val root: Int = 0,
    val scale: Scale = Scale.CHROMATIC,
    val octave: Int = 4,
    /** Solfège (DO RE MI) or letter (C D E) note names. */
    val names: NoteNames = NoteNames.SOLFEGE,
    /** The sound KEYS plays, and its sample's name when known. */
    val pad: PhysicalPad? = null,
    val padName: String? = null,
    /** The MIDI notes playing on the phone (a chord), latest last; their keys are outlined. */
    val playingNotes: Set<Int> = emptySet(),
)

class KeysActions(
    val onMode: (Boolean) -> Unit = {},
    val onRoot: (Int) -> Unit = {},
    val onScale: (Scale) -> Unit = {},
    val onOctave: (Int) -> Unit = {},
    /** A MIDI note pressed; it sounds until [onNoteUp]. A screen reader's Play passes hold = false. */
    val onNote: (note: Int, hold: Boolean) -> Unit = { _, _ -> },
    val onNoteUp: (note: Int) -> Unit = {},
    /** A pad played on the device in the pads view becomes the KEYS sound. */
    val onSelect: (PhysicalPad) -> Unit = {},
)

/**
 * A live mirror of the EP-133 (an addition to the web version): the four
 * groups' pads light as the device plays them, with the sample on each once
 * it is known, plus play state, tempo and KEYS notes. It only listens.
 *
 * [nameOf] gives the sample on a pad (null while not known); [now] is the
 * System.nanoTime of this frame, for the fade.
 */
@Composable
fun MirrorScreen(
    mirror: MirrorUi?,
    nameOf: (PhysicalPad) -> String?,
    onPadOrder: (PadOrder) -> Unit,
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
    /**
     * Pressing a pad plays its sample on the phone until [onPadUp] (hold is
     * false for a screen reader's Play, which plays to the end); null leaves
     * the pads still.
     */
    onPad: ((pad: PhysicalPad, hold: Boolean) -> Unit)? = null,
    onPadUp: (PhysicalPad) -> Unit = {},
    /** The pads whose samples are playing on the phone (several at once for a chord), ringed. */
    playingPads: Set<PhysicalPad> = emptySet(),
    /** KEYS: the pads become notes of one sound, like the EP-133's KEYS mode. */
    keys: KeysUi = KeysUi(),
    keysActions: KeysActions = KeysActions(),
    /**
     * The piano's notes while it shows (KEYS on a phone on its side), null
     * otherwise: the display line in the top bar names a device note it doesn't reach.
     */
    onPianoRange: (IntRange?) -> Unit = {},
) {
    val c = LocalArcColors.current
    val window = LocalArcWindow.current
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
        val roomH = maxHeight - (if (inBar) 0.dp else DisplayLine + 10.dp) - SidewaysBottom - ControlsRow
        val piano = if (sideways && keys.on) pianoRange(keys.octave, roomW, if (window.short) roomH else minOf(roomH, PianoMaxTablet)) else null
        LaunchedEffect(piano) { reportRange(piano) }
        // Four groups side by side while their pad rows keep 40 dp, and no taller than square
        // pads. Off the height first: each group's caption (a 1.2 em line and its gap) and the
        // plate's three lines; off the width, the three gaps and each plate's two lines.
        val caption = with(LocalDensity.current) { ArcType.caps.fontSize.toDp() * 1.2f } + 8.dp
        val allGroupsSideways = sideways && (roomH - caption - 3.dp) / 4 >= 40.dp
        val padW = ((roomW - 42.dp) / 4 - 2.dp) / 3
        SideZone(
            open = toolsOpen,
            onOpen = { toolsOpen = true },
            onClose = { toolsOpen = false },
            title = MirrorText.TOOLS,
            panel = {
                if (keys.on) {
                    KeysPanel(keys, keysActions, piano = piano != null)
                } else {
                Caption(MirrorText.VIEW, align = androidx.compose.ui.text.style.TextAlign.Start)
                TextToggle(
                    listOf(MirrorText.ALL_GROUPS, MirrorText.ONE_GROUP),
                    selected = if (oneGroup) 1 else 0,
                    onSelect = { onOneGroup(it == 1) },
                )
                if (oneGroup) {
                    GridPlate { SwitchRow(MirrorText.FOLLOW, MirrorText.FOLLOW_NOTE, follow, onFollow) }
                }
                if (st.lastKeysNote != null) KeysStrip(st)
                Notes(st, mirror, onPadOrder, tapToPlay = onPad != null, sideways = sideways)
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
            if (piano != null) {
                Column(sidewaysColumn) {
                    if (!inBar) {
                        KeysDisplay(st, mirror, keys, pianoRange = piano)
                        Spacer(Modifier.height(10.dp))
                    }
                    ModeRow(keys, keysActions, landscape = true)
                    // The rest of the room; on a tablet no taller than a hand spans.
                    PianoKeyboard(
                        piano, st, keys, clock, keysActions,
                        Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false)
                            .then(if (window.short) Modifier else Modifier.heightIn(max = PianoMaxTablet))
                            .coachMark("live.keys", CoachText.PIANO, CoachYellow, CoachYellowInk),
                    )
                }
            } else if (sideways && !keys.on && oneGroup) {
                val now = clock()
                BoxWithConstraints(sidewaysColumn, contentAlignment = Alignment.TopCenter) {
                    // The grid as tall as the room and at most 1.4 times as wide, the group keys
                    // in a column on its right; the row above lines up with the grid.
                    val gridH = maxHeight - (if (inBar) 0.dp else DisplayLine + 10.dp) - ControlsRow
                    val gridW = minOf(gridH * 1.4f, maxWidth - GroupColumn - 12.dp)
                    Column(Modifier.width(gridW + 12.dp + GroupColumn).fillMaxHeight()) {
                        if (!inBar) {
                            DisplayStrip(st, mirror)
                            Spacer(Modifier.height(10.dp))
                        }
                        ModeRow(keys, keysActions, landscape = true, oneGroup = true, onOneGroup = onOneGroup)
                        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Group(
                                group, st, nameOf, now,
                                Modifier.width(gridW).fillMaxHeight().coachMark("live.pads", CoachText.PADS, CoachYellow, CoachYellowInk),
                                big = true,
                                onPad = onPad,
                                onPadUp = onPadUp,
                                playingPads = playingPads,
                            )
                            GroupKeys(group, st, now, onSelect = { group = it }, Modifier.width(GroupColumn).fillMaxHeight(), vertical = true)
                        }
                    }
                }
            } else if (sideways && !keys.on && allGroupsSideways) {
                val now = clock()
                Column(sidewaysColumn) {
                    if (!inBar) {
                        DisplayStrip(st, mirror)
                        Spacer(Modifier.height(10.dp))
                    }
                    ModeRow(keys, keysActions, landscape = true, onOneGroup = onOneGroup)
                    // All four in one row, filling the height: nothing to scroll, so a press plays at once.
                    Row(
                        Modifier.fillMaxWidth().weight(1f, fill = false).heightIn(max = caption + 3.dp + padW * 4),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        for (g in 0..3) Group(g, st, nameOf, now, Modifier.weight(1f).fillMaxHeight(), fill = true, onPad = onPad, onPadUp = onPadUp, playingPads = playingPads)
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
                        if (keys.on) {
                            if (!inBar) KeysDisplay(st, mirror, keys)
                            KeysGrid(
                                st, keys, now, keysActions,
                                Modifier.fillMaxWidth().weight(1f).coachMark("live.keys", CoachText.PADS, CoachYellow, CoachYellowInk),
                            )
                            ModeRow(keys, keysActions)
                        } else {
                            if (!inBar) DisplayStrip(st, mirror)
                            Group(
                                group, st, nameOf, now,
                                Modifier.fillMaxWidth().weight(1f).coachMark("live.pads", CoachText.PADS, CoachYellow, CoachYellowInk),
                                big = true,
                                onPad = onPad,
                                onPadUp = onPadUp,
                                playingPads = playingPads,
                            )
                            ModeRow(keys, keysActions)
                            GroupKeys(group, st, now, onSelect = { group = it })
                        }
                    }
                }
            } else {
                val now = clock()
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                    Column(
                        Modifier
                            .windowInsetsPadding(WindowInsets.safeDrawing)
                            .widthIn(max = 720.dp)
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState())
                            .padding(start = startGutter, end = endGutter, top = 4.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            Caption(MirrorText.TITLE)
                            if (onBack != null) CloseKey(onBack, dev.arc.ep133.text.GuideText.CLOSE, Modifier.align(Alignment.CenterEnd))
                        }
                        if (!inBar) Display(st, mirror, compact = sideways, initialNoteOpen = initialNoteOpen)
                        ModeRow(keys, keysActions)
                        BoxWithConstraints(Modifier.fillMaxWidth()) {
                            // Four groups in a row when there is room, two by two on a phone.
                            val perRow = if (maxWidth >= 640.dp) 4 else 2
                            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                for (row in (0..3).chunked(perRow)) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                        for (g in row) Group(g, st, nameOf, now, Modifier.weight(1f), onPad = onPad, onPadUp = onPadUp, playingPads = playingPads)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** The controls row's height over the keys (its words' touch height). */
private val ControlsRow = 44.dp

/** The display line's height, on the page when it isn't in the top bar. */
private val DisplayLine = 48.dp

/** What is left under the keys or pads on a phone on its side. */
private val SidewaysBottom = 8.dp

/** A tablet's piano is no taller than this. */
private val PianoMaxTablet = 340.dp

/** The group keys' column beside the one-group grid, on its side. */
private val GroupColumn = 72.dp

/** The piano's notes in a [width] × [height] room at [octave], or null where the grid stays: under 8 white keys, or under 120 dp tall. */
private fun pianoRange(octave: Int, width: Dp, height: Dp): IntRange? {
    val whites = Piano.whitesFor(width.value)
    return if (whites == 0 || height < 120.dp) null else Piano.range(octave, whites)
}

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

/** Whether Live's display line sits in the top bar ([LivePill]): a short window wider than tall, a phone on its side. */
internal fun liveInBar(window: ArcWindow): Boolean = window.landscape && window.short

/**
 * Live's display line in the top bar's middle, on a phone on its side: the
 * KEYS line or the pads' one-line display, one bar tall. [pianoRange] is the
 * piano's notes, to name a device note it doesn't reach.
 */
@Composable
internal fun LivePill(mirror: MirrorUi?, keys: KeysUi, pianoRange: IntRange? = null) {
    val st = mirror?.state ?: MirrorState()
    if (keys.on) KeysDisplay(st, mirror, keys, compact = true, pianoRange = pianoRange) else DisplayStrip(st, mirror, compact = true)
}

/**
 * [text] as a display line's polite live region says it: at most once a
 * second, so a run of notes or hits is read where it ends, not one by one.
 */
@Composable
private fun spoken(text: String): String {
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
 * The one-group view's display as a single dark line: play state, tempo and
 * project on the left, the pad just played on the right. [compact]: one bar
 * tall, in the top bar ([LivePill]).
 */
@Composable
private fun DisplayStrip(st: MirrorState, mirror: MirrorUi?, compact: Boolean = false) {
    val c = LocalArcColors.current
    val hit = st.lastHit
    val main = when {
        mirror?.error != null -> mirror.error
        mirror?.loading == true && hit == null -> MirrorText.READING
        hit != null -> MirrorText.hit(hit)
        mirror?.offline != null -> mirror.offline
        else -> MirrorText.WAITING
    }
    val transport = when (st.playing) {
        true -> MirrorText.PLAYING
        false -> MirrorText.STOPPED
        null -> if (mirror?.offline != null) MirrorText.OFFLINE else null
    }
    val said = spoken(listOfNotNull(transport, st.bpm?.let(MirrorText::bpm), st.activeProject?.let(MirrorText::project), main).joinToString(", "))
    DisplayLine(
        Modifier.clearAndSetSemantics {
            contentDescription = said
            liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite
        },
        compact,
    ) {
        when (st.playing) {
            true -> Text("\u25B6", style = ArcType.displaySub, color = c.displayInk)
            false -> Text("\u25A0", style = ArcType.displaySub, color = c.displayDim)
            null -> if (mirror?.offline != null) Text(MirrorText.OFFLINE, style = ArcType.displaySub, color = c.displayDim, maxLines = 1)
        }
        st.bpm?.let { Text(MirrorText.bpm(it), style = ArcType.displaySub, color = c.displayInk, maxLines = 1) }
        st.activeProject?.let { Text(MirrorText.projectShort(it), style = ArcType.displaySub, color = c.displayDim, maxLines = 1) }
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

@Composable
private fun Display(st: MirrorState, mirror: MirrorUi?, compact: Boolean = false, initialNoteOpen: Boolean = false) {
    val c = LocalArcColors.current
    val offline = mirror?.offline != null && st.playing == null
    // Why it is offline stays folded under the word until asked for, so the pads keep the room.
    var noteOpen by rememberSaveable { mutableStateOf(initialNoteOpen) }
    DisplayPanel {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (offline) {
                Row(
                    Modifier
                        .weight(1f)
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { noteOpen = !noteOpen }
                        .semantics { stateDescription = if (noteOpen) MirrorText.NOTE_SHOWN else MirrorText.NOTE_HIDDEN },
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(MirrorText.OFFLINE, style = ArcType.displayHead, color = c.displayInk)
                    Text(if (noteOpen) "\u25B4" else "\u25BE", style = ArcType.displaySub, color = c.displayDim)
                }
            } else {
                val transport = when (st.playing) {
                    true -> "\u25B6 " + MirrorText.PLAYING
                    false -> "\u25A0 " + MirrorText.STOPPED
                    null -> ""
                }
                Text(transport, style = ArcType.displayHead, color = c.displayInk, modifier = Modifier.weight(1f))
            }
            st.bpm?.let { Text(MirrorText.bpm(it), style = ArcType.displaySub, color = c.displayInk) }
            st.activeProject?.let { Text(MirrorText.project(it), style = ArcType.displaySub, color = c.displayDim) }
        }
        val hit = st.lastHit
        Text(
            when {
                mirror?.error != null -> mirror.error
                mirror?.loading == true && hit == null -> MirrorText.READING
                hit != null -> MirrorText.hit(hit)
                mirror?.offline != null -> mirror.offline
                else -> MirrorText.WAITING
            },
            // The offline line ("Last seen Oct 5, 2:02 PM") is longer than a hit; it fits a phone a size down.
            style = ArcType.statFree.copy(fontSize = if (compact || mirror?.offline != null && hit == null) 22.sp else 26.sp),
            color = c.displayInk,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        // The one-group view keeps to one screen; the all-groups view explains clock out.
        when {
            compact -> Unit
            offline -> androidx.compose.animation.AnimatedVisibility(
                noteOpen,
                enter = androidx.compose.animation.expandVertically() + androidx.compose.animation.fadeIn(),
                exit = androidx.compose.animation.shrinkVertically() + androidx.compose.animation.fadeOut(),
            ) {
                Text(MirrorText.OFFLINE_NOTE, style = ArcType.displayHint, color = c.displayDim)
            }
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
    onPad: ((pad: PhysicalPad, hold: Boolean) -> Unit)? = null,
    onPadUp: (PhysicalPad) -> Unit = {},
    playingPads: Set<PhysicalPad> = emptySet(),
) {
    val c = LocalArcColors.current
    val lit = st.pads.filterKeys { it.group == group }
    val groupGlow = lit.values.maxOfOrNull { glow(it, now) } ?: 0f
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // The caption turns orange while one of the group's pads sounds (the big grid's
        // group shows on its key below instead).
        if (!big) Caption(MirrorText.GROUP + " " + ('A' + group), color = lerp(c.graphite, c.signal, groupGlow))
        GridPlate(if (fill) Modifier.weight(1f) else Modifier) {
            PadNotes.ROWS.forEachIndexed { r, rowOffsets ->
                if (r > 0) PlateLine()
                // The big grid's rows share the height left on screen; the small ones are square.
                Row(if (fill) Modifier.weight(1f) else Modifier.height(IntrinsicSize.Min)) {
                    rowOffsets.forEachIndexed { i, o ->
                        if (i > 0) Box(Modifier.width(1.dp).fillMaxHeight().background(c.line))
                        val pad = PhysicalPad(group, o)
                        Pad(
                            pad, lit[pad], nameOf(pad), now,
                            Modifier.weight(1f).then(if (fill) Modifier.fillMaxHeight() else Modifier.aspectRatio(1f)),
                            big,
                            onPress = onPad?.let { f -> { hold: Boolean -> f(pad, hold) } },
                            onRelease = { onPadUp(pad) },
                            playing = pad in playingPads,
                            // Only the all-groups page scrolls.
                            inScroll = !fill,
                        )
                    }
                }
            }
        }
    }
}

/**
 * The group keys under the single grid: navy for the group shown, lit orange
 * while one of a group's pads sounds. [vertical]: a column beside the grid, on
 * a phone on its side.
 */
@Composable
private fun GroupKeys(group: Int, st: MirrorState, now: Long, onSelect: (Int) -> Unit, modifier: Modifier = Modifier, vertical: Boolean = false) {
    if (vertical) {
        Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (g in 0..3) GroupKey(g, group, st, now, onSelect, Modifier.fillMaxWidth().weight(1f).heightIn(min = 44.dp))
        }
    } else {
        Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (g in 0..3) GroupKey(g, group, st, now, onSelect, Modifier.weight(1f).heightIn(min = 52.dp))
        }
    }
}

@Composable
private fun GroupKey(g: Int, group: Int, st: MirrorState, now: Long, onSelect: (Int) -> Unit, modifier: Modifier) {
    val c = LocalArcColors.current
    val markA = if (g == 0) Modifier.coachMark("live.groups", CoachText.GROUPS, c.navy, c.onNavy) else Modifier
    val on = g == group
    val sounding = st.pads.filterKeys { it.group == g }.values.maxOfOrNull { glow(it, now) } ?: 0f
    val face = if (on) c.navy else lerp(c.tabOff, c.signal, sounding)
    val ink = if (on) c.onNavy else if (sounding > 0.3f) c.onSignal else c.onTabOff
    Box(
        modifier
            .then(markA)
            .clip(RoundedCornerShape(10.dp))
            .background(face)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Tab) { onSelect(g) }
            .semantics {
                selected = on
                contentDescription = MirrorText.GROUP + " " + MirrorText.groupKey(g)
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(MirrorText.groupKey(g), style = ArcType.tab.copy(fontSize = 22.sp), color = ink)
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
    onPress: ((hold: Boolean) -> Unit)? = null,
    onRelease: () -> Unit = {},
    playing: Boolean = false,
    inScroll: Boolean = !big,
) {
    val c = LocalArcColors.current
    val g = light?.let { glow(it, now) } ?: 0f
    val ink = if (g > 0.3f) c.onSignal else c.ink
    Box(
        modifier
            .background(lerp(c.plate, c.signal, g))
            // Playing on the phone: a signal-orange ring inside the pad.
            .then(if (playing) Modifier.border(2.dp, c.signal) else Modifier)
            // The big grid doesn't scroll: it plays on touch-down. The all-groups page
            // scrolls, so there a drag across the pads must not play them.
            .then(if (onPress == null) Modifier else holdToPlay(onPress, onRelease, inScroll = inScroll))
            .semantics { contentDescription = "${pad.groupLetter} ${pad.label}" + (name?.let { ", $it" } ?: "") }
            .padding(if (big) PaddingValues(10.dp) else PaddingValues(start = 6.dp, top = 5.dp, end = 7.dp, bottom = 5.dp)),
    ) {
        if (name != null) {
            Text(
                name,
                style = ArcType.tiny.copy(fontSize = if (big) 14.sp else 10.sp, lineHeight = 1.1.em),
                color = if (g > 0.3f) c.onSignal else c.graphite,
                maxLines = if (big) 3 else 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.align(Alignment.TopStart),
            )
        }
        // The key's own label in the corner, like the pocket operator app's pad numbers.
        Text(
            pad.label,
            style = ArcType.semi.copy(
                fontSize = when {
                    big -> if (pad.label.length > 1) 15.sp else 28.sp
                    else -> if (pad.label.length > 1) 10.sp else 15.sp
                },
                lineHeight = 1.em,
                letterSpacing = 0.04.em,
            ),
            color = ink,
            modifier = Modifier.align(Alignment.BottomEnd),
        )
    }
}

/** Two octaves around the last note outside the pads, with held notes lit. */
@Composable
private fun KeysStrip(st: MirrorState) {
    val c = LocalArcColors.current
    val last = st.lastKeysNote ?: return
    val start = ((last / 12) * 12 - 12).coerceIn(0, 103)
    val black = setOf(1, 3, 6, 8, 10)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            MirrorText.KEYS + " \u00B7 " + PadNotes.noteName(last) + (st.keysHeld[last]?.let { " \u00B7 " + MirrorText.channel(it) } ?: ""),
            style = ArcType.small,
            color = c.graphite,
        )
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(56.dp)
                .semantics { contentDescription = MirrorText.KEYS + " " + PadNotes.noteName(last) },
        ) {
            val whites = (start until start + 25).filter { it % 12 !in black }
            val w = size.width / whites.size
            whites.forEachIndexed { i, n ->
                val on = st.keysHeld.containsKey(n)
                drawRoundRect(
                    if (on) c.signal else KeyWhite,
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
                    if (on) c.signal else KeyBlack,
                    topLeft = Offset(leftWhites * w - w * 0.3f, 0f),
                    size = Size(w * 0.6f, size.height * 0.6f),
                    cornerRadius = CornerRadius(2.dp.toPx()),
                )
            }
        }
    }
}

@Composable
private fun Notes(st: MirrorState, mirror: MirrorUi?, onPadOrder: (PadOrder) -> Unit, tapToPlay: Boolean = false, sideways: Boolean = false) {
    val c = LocalArcColors.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (tapToPlay) Text(MirrorText.TAP_NOTE, style = ArcType.small, color = c.graphite)
        // Pads that play on the phone mean keys that do too, and sideways they are a piano.
        if (tapToPlay && !sideways) Text(MirrorText.PIANO_HINT, style = ArcType.small, color = c.graphite)
        if (mirror?.offline != null) Text(MirrorText.OFFLINE_NOTE, style = ArcType.small, color = c.graphite)
        // On its side the display is one line (in the top bar), so what clock out is for is told here.
        if (sideways && mirror?.offline == null && st.playing == null && st.bpm == null) {
            Text(MirrorText.NO_TRANSPORT, style = ArcType.small, color = c.graphite)
        }
        if (st.padOrder == PadOrder.FROM_TOP) {
            Text(MirrorText.LEARN_NOTE, style = ArcType.small, color = c.graphite)
            if (!st.pushesSeen && st.learned.isEmpty() && st.lastHit?.pad != null && mirror?.loading == false) {
                Text(MirrorText.NO_PUSHES, style = ArcType.small, color = c.graphite)
            }
        }
        Caption(MirrorText.PAD_ORDER, Modifier.padding(top = 8.dp), align = androidx.compose.ui.text.style.TextAlign.Start)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            for ((order, label) in listOf(PadOrder.FROM_TOP to MirrorText.FROM_TOP, PadOrder.FROM_BOTTOM to MirrorText.FROM_BOTTOM)) {
                ArcKey(
                    label,
                    { onPadOrder(order) },
                    Modifier.weight(1f),
                    size = KeySize.Small,
                    style = if (st.padOrder == order) KeyStyle.Navy else KeyStyle.Normal,
                )
            }
        }
        Text(MirrorText.ORDER_NOTE, style = ArcType.small, color = c.graphite)
        Text(MirrorText.COMMUNITY_NOTE, style = ArcType.small, color = c.graphite)
        Text(MirrorText.LISTEN_ONLY, style = ArcType.small, color = c.graphite)
    }
}

/**
 * The row right under the grid, as the PO app's DRUMS / KEYPAD: one word for
 * the mode that a tap switches (PADS ⇄ KEYS), and in KEYS the scale and the
 * octave, a tap on either of which lists the choices. [landscape]: the row
 * over the keys or pads on a phone on its side ([SidewaysRow]).
 */
@Composable
private fun ModeRow(
    keys: KeysUi,
    actions: KeysActions,
    landscape: Boolean = false,
    oneGroup: Boolean = false,
    onOneGroup: (Boolean) -> Unit = {},
) {
    if (landscape) {
        SidewaysRow(keys, actions, oneGroup, onOneGroup)
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
        ModeWord(keys, actions, top = true)
        if (keys.on) {
            PickWord(
                label = MirrorText.scaleName(keys.scale),
                options = Scale.entries,
                selected = keys.scale,
                name = MirrorText::scaleName,
                onPick = actions.onScale,
                description = MirrorText.scaleChoice(keys.scale),
                mark = Modifier.coachMark("live.scale", CoachText.SCALE, c.navy, c.onNavy),
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
            )
        }
    }
}

/** PADS ⇄ KEYS: the word for the mode shown, which a tap switches. */
@Composable
private fun ModeWord(keys: KeysUi, actions: KeysActions, top: Boolean) {
    val c = LocalArcColors.current
    dev.arc.ep133.ui.components.WordButton(
        if (keys.on) MirrorText.MODE_KEYS else MirrorText.MODE_PADS,
        { actions.onMode(!keys.on) },
        Modifier.coachMark("live.mode", CoachText.MODE, c.navy, c.onNavy),
        mark = true,
        description = MirrorText.modeSwitch(keys.on),
        top = top,
    )
}

/**
 * The mode row on a phone on its side, over the keys: the mode, the scale
 * and the key at the start, the octave between − and + at the end (in PADS,
 * the mode and the view). Short of room (large text), the key word drops its
 * KEY, then the scale shortens to its code; − and + keep their size.
 */
@Composable
private fun SidewaysRow(keys: KeysUi, actions: KeysActions, oneGroup: Boolean, onOneGroup: (Boolean) -> Unit) {
    val c = LocalArcColors.current
    if (!keys.on) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WordGap)) {
            ModeWord(keys, actions, top = false)
            dev.arc.ep133.ui.components.WordButton(
                if (oneGroup) MirrorText.ONE_GROUP else MirrorText.ALL_GROUPS,
                { onOneGroup(!oneGroup) },
                Modifier.coachMark("live.view", CoachText.VIEW, c.navy, c.onNavy),
                mark = true,
                description = MirrorText.viewSwitch(oneGroup),
            )
        }
        return
    }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val measurer = rememberTextMeasurer()
        val density = LocalDensity.current
        fun width(text: String) = with(density) {
            measurer.measure(text.uppercase(), ArcType.word, maxLines = 1, softWrap = false).size.width.toDp()
        }
        val pick = " \u25BE"
        val scaleName = MirrorText.scaleName(keys.scale)
        // Everything but the scale and key words: the mode word and its mark, the octave
        // word between − and +, and the gaps (the one before − at its narrowest).
        val fixed = width(MirrorText.MODE_KEYS) + 18.dp + width(MirrorText.octave(keys.octave) + pick) + StepWidth * 2 + WordGap * 3
        val key = MirrorText.keyWord(keys.root, keys.names).takeIf {
            fixed + width(scaleName + pick) + width(it + pick) <= maxWidth
        } ?: Keys.name(keys.root, keys.names)
        val scale = scaleName.takeIf { fixed + width(it + pick) + width(key + pick) <= maxWidth } ?: MirrorText.scaleCode(keys.scale)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            ModeWord(keys, actions, top = false)
            Spacer(Modifier.width(WordGap))
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
            StepWord("\u2212", MirrorText.OCTAVE_DOWN, enabled = keys.octave > Keys.MIN_OCTAVE) { actions.onOctave(keys.octave - 1) }
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
            StepWord("+", MirrorText.OCTAVE_UP, enabled = keys.octave < Keys.MAX_OCTAVE) { actions.onOctave(keys.octave + 1) }
        }
    }
}

/** The room between the words of the row over the keys. */
private val WordGap = 24.dp

/** − and + are this wide, however tight the row. */
private val StepWidth = 48.dp

/** − or + by the octave word: one octave down or up, greyed (and disabled) at either end. */
@Composable
private fun StepWord(glyph: String, description: String, enabled: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    Box(
        Modifier
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
        Text(glyph, style = ArcType.word.copy(fontSize = 22.sp, lineHeight = 1.em), color = if (enabled) c.graphite else c.graphite.copy(alpha = 0.45f))
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
 * plays on the right. [compact]: one bar tall, in the top bar ([LivePill]),
 * where the mode word is right under it. A device note past the piano's ends
 * ([pianoRange]) is named as such: there's no key to light for it.
 */
@Composable
private fun KeysDisplay(st: MirrorState, mirror: MirrorUi?, keys: KeysUi, compact: Boolean = false, pianoRange: IntRange? = null) {
    val c = LocalArcColors.current
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
    DisplayLine(
        Modifier.clearAndSetSemantics {
            contentDescription = said
            liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite
        },
        compact,
    ) {
        if (!compact) Text(MirrorText.MODE_KEYS.uppercase(), style = ArcType.displaySub, color = c.displayDim, maxLines = 1)
        noteText?.let { Text(it, style = ArcType.displaySub, color = c.displayInk, maxLines = 1) }
        offline?.let { Text(it, style = ArcType.displaySub, color = c.displayDim, maxLines = 1) }
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

/**
 * The 12 pads as keys, in the keypad's layout: each shows its note in a ring,
 * orange on the scale's root (the first key of each octave of it) and navy on
 * the rest, as the piano marks them. Notes from the device light their key;
 * the notes playing on the phone are outlined in signal orange.
 */
@Composable
private fun KeysGrid(st: MirrorState, keys: KeysUi, now: Long, actions: KeysActions, modifier: Modifier) {
    val c = LocalArcColors.current
    val notes = Keys.notes(keys.root, keys.scale, keys.octave)
    // Each key is a finger of its own, holding the note it had when pressed: a new key,
    // scale or octave under a held key still lets go of the note that sounds.
    val touches = remember { NoteTouches() }
    fun play(events: List<NoteEvent>) = events.forEach { e ->
        when (e) {
            is NoteEvent.Press -> actions.onNote(e.note, true)
            is NoteEvent.Release -> actions.onNoteUp(e.note)
        }
    }
    // How lit each key is: the brightest device note that falls on it.
    val lit = HashMap<Int, Float>()
    for ((n, l) in st.notes) {
        val k = Keys.keyFor(n, notes) ?: continue
        lit[k] = maxOf(lit[k] ?: 0f, glow(l, now))
    }
    GridPlate(modifier) {
        PadNotes.ROWS.forEachIndexed { r, rowOffsets ->
            if (r > 0) PlateLine()
            Row(Modifier.weight(1f)) {
                rowOffsets.forEachIndexed { i, k ->
                    if (i > 0) Box(Modifier.width(1.dp).fillMaxHeight().background(c.line))
                    val note = notes[k]
                    val g = lit[k] ?: 0f
                    val ring = if (k % keys.scale.intervals.size == 0) c.signal else c.navy
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .background(lerp(c.plate, c.signal, g))
                            .then(if (note in keys.playingNotes) Modifier.border(2.dp, c.signal) else Modifier)
                            .then(
                                holdToPlay(
                                    // A screen reader's Play sounds the note to its end: no finger to keep count of.
                                    { hold -> if (hold) play(touches.down(k.toLong(), notes[k])) else actions.onNote(notes[k], false) },
                                    { play(touches.up(k.toLong())) },
                                ),
                            )
                            .semantics { contentDescription = MirrorText.noteName(note, keys.names) },
                        contentAlignment = Alignment.Center,
                    ) {
                        val ink = if (g > 0.3f) c.onSignal else c.ink
                        Canvas(Modifier.fillMaxSize().padding(8.dp)) {
                            val d = minOf(size.width, size.height)
                            val stroke = d * 0.09f
                            drawCircle(
                                color = if (g > 0.3f) c.onSignal else ring,
                                radius = d / 2 - stroke / 2,
                                style = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke),
                            )
                        }
                        Text(Keys.name(note, keys.names), style = ArcType.semi.copy(fontSize = 22.sp, letterSpacing = 0.02.em), color = ink, maxLines = 1)
                        Text(
                            Keys.octaveOf(note).toString(),
                            style = ArcType.tiny.copy(fontSize = 11.sp),
                            color = if (g > 0.3f) c.onSignal else c.graphite,
                            modifier = Modifier.align(Alignment.BottomEnd).padding(end = 6.dp, bottom = 4.dp),
                        )
                    }
                }
            }
        }
    }
}

/** The KEYS tools: the key (fixed-do names) and the scale. [piano]: the piano is showing, and its legend rows with it. */
@Composable
private fun KeysPanel(keys: KeysUi, actions: KeysActions, piano: Boolean = false) {
    val c = LocalArcColors.current
    Caption(MirrorText.KEY, align = androidx.compose.ui.text.style.TextAlign.Start)
    for (row in (0..11).chunked(6)) {
        Segmented(row.map { Keys.name(it, keys.names) }, selected = row.indexOf(keys.root), onSelect = { actions.onRoot(row[it]) })
    }
    Text(MirrorText.KEYS_NOTE, style = ArcType.small, color = c.graphite)
    // Sideways already, the piano is there (or there's no room for one).
    if (!LocalArcWindow.current.landscape) Text(MirrorText.PIANO_HINT, style = ArcType.small, color = c.graphite)
    KeysLegend(piano)
}

/**
 * What the keys' colours mean, each with a small key drawn as the grid draws
 * it. One legend for the grid and the piano; the [piano] adds the keys only
 * it has (those outside the scale) and its octave numbers.
 */
@Composable
private fun KeysLegend(piano: Boolean = false) {
    val c = LocalArcColors.current
    // With the piano showing, its white key is the plate, so the dimmed one stands out against it.
    val face = if (piano) c.pianoWhite else c.plate
    Caption(MirrorText.LEGEND, align = androidx.compose.ui.text.style.TextAlign.Start)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        LegendRow(MirrorText.LEGEND_ROOT) { LegendKey(ring = if (piano) c.pianoRoot() else c.signal, fill = face) }
        LegendRow(MirrorText.LEGEND_IN_SCALE) { LegendKey(ring = c.navy, fill = face) }
        if (piano) {
            LegendRow(MirrorText.LEGEND_OUT) { LegendKey(ring = null, fill = c.keyOut) }
            LegendRow(MirrorText.LEGEND_C) { LegendKey(ring = null, fill = face, digit = "4") }
        }
        LegendRow(MirrorText.LEGEND_DEVICE) { LegendKey(ring = c.onSignal, fill = c.signal) }
        LegendRow(MirrorText.LEGEND_PHONE) { LegendKey(ring = c.navy, fill = face, outline = true) }
    }
}

@Composable
private fun LegendRow(text: String, keys: @Composable () -> Unit) {
    val c = LocalArcColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        // One key in miniature a row, so the words line up.
        keys()
        Text(text, style = ArcType.small, color = c.graphite, modifier = Modifier.weight(1f))
    }
}

/**
 * A key in miniature: its plate (lit orange, or dimmed, as [fill] says), its
 * ring if it has one, the phone's outline, and an octave [digit] in the corner.
 */
@Composable
private fun LegendKey(ring: Color?, fill: Color? = null, outline: Boolean = false, digit: String? = null) {
    val c = LocalArcColors.current
    Box(
        Modifier
            .size(26.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(fill ?: c.plate)
            .then(if (outline) Modifier.border(2.dp, c.signal, RoundedCornerShape(4.dp)) else Modifier)
            .padding(if (digit != null) 3.dp else 5.dp),
    ) {
        if (ring != null) {
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
 * make a chord. [inScroll]: in a scrolling page the press waits a moment, and
 * a drag that starts then is a scroll that plays nothing. Screen readers get a
 * plain Play action, which plays the whole sound.
 */
@Composable
private fun holdToPlay(onPress: (hold: Boolean) -> Unit, onRelease: () -> Unit, inScroll: Boolean = false): Modifier {
    val press by androidx.compose.runtime.rememberUpdatedState(onPress)
    val release by androidx.compose.runtime.rememberUpdatedState(onRelease)
    return Modifier
        .pointerInput(inScroll) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                var lifted = false
                if (inScroll) {
                    var drag = false
                    withTimeoutOrNull(PRESS_DELAY_MS) {
                        while (!lifted && !drag) {
                            // The Final pass sees what the scroll above took.
                            val ch = awaitPointerEvent(PointerEventPass.Final).changes.firstOrNull { it.id == down.id }
                            when {
                                ch == null -> drag = true
                                ch.changedToUp() -> lifted = true
                                ch.isConsumed || (ch.position - down.position).getDistance() > viewConfiguration.touchSlop -> drag = true
                            }
                        }
                    }
                    if (drag) return@awaitEachGesture
                }
                press(true)
                try {
                    while (!lifted) {
                        val ch = awaitPointerEvent(PointerEventPass.Final).changes.firstOrNull { it.id == down.id } ?: break
                        // Lifted, or a scroll took the finger over.
                        if (!ch.pressed || inScroll && ch.isConsumed) break
                    }
                } finally {
                    // Also when the pad leaves the screen with the finger still on it.
                    release()
                }
            }
        }
        .semantics {
            role = Role.Button
            onClick(label = MirrorText.PLAY) {
                press(false)
                true
            }
        }
}

/** How long a press in a scrolling page waits to tell a tap from a scroll (as Compose's own press feedback does). */
private const val PRESS_DELAY_MS = 64L
