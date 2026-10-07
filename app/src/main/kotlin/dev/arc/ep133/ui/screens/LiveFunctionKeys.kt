package dev.arc.ep133.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectSource
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.LocalArcWindow
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.delay

/*
 * Live's function keys (an addition): SAMPLE, SOUND, PROJECT, KEYS and TEMPO
 * as the EP-133 prints its two-tier keys, a cap with its word on the upper
 * half (dark, but SAMPLE's orange, as on the body) and the lower half filled
 * with a colour carrying a second word, under an LED and a printed label. A
 * row over the pads (upright, and on the all-groups and tablet pages), a
 * column left of them on a phone on its side.
 */

/**
 * PROJECT held, as the EP-133 picks a project: while [held], a pad or a
 * KEYS key printed 1 to 9 goes to that project
 * ([FunctionKeysUi.onSelectProject]) instead of sounding, and the others
 * ('.', 0, ENTER) stay still. Let go of PROJECT: a pick made meanwhile is
 * all it does; else a short press steps on ([FunctionKeysUi.onProject]) and
 * a long one opens the project sheet ([FunctionKeysUi.onPickProject]), once
 * the finger is off the pads' way. A press taken keeps its release too, so
 * nothing lets go of a sound it never started.
 */
@Stable
internal class ProjectHold {
    var held by mutableStateOf(false)
        private set
    private var picked = false
    private val taken = HashSet<Any>()

    fun down() {
        held = true
        picked = false
    }

    /** PROJECT let go of; [long]: held past the long-press time. */
    fun up(long: Boolean, fn: FunctionKeysUi) {
        if (!held) return
        held = false
        if (picked) return
        if (long) fn.onPickProject() else fn.onProject()
    }

    /** PROJECT's press slid off or was taken by a scroll: nothing. */
    fun cancel() {
        held = false
    }

    /** A press on [key] printed [label] (a pad's digit): true when PROJECT takes it. */
    fun press(key: Any, label: String, fn: FunctionKeysUi): Boolean {
        if (!held) return false
        taken += key
        val n = label.toIntOrNull()?.takeIf { it in 1..Device.PROJECT_COUNT } ?: return true
        picked = true
        fn.onSelectProject(n)
        return true
    }

    /** Whether [key]'s press was taken (its release and the like are PROJECT's). */
    fun took(key: Any): Boolean = key in taken

    /** [key] let go of: true when its press was taken. */
    fun release(key: Any): Boolean = taken.remove(key)
}

/**
 * Live's SAMPLE key (an addition, after the K.O. II's own): [on] while
 * SAMPLE mode is open, [recording] while a take records (its light blinks),
 * [handsFree] while a hands-free take, its count-in or its wait goes on (a
 * tap then stops it, [onStop]); otherwise a tap is [onSample], into the mode
 * or out of it. [label], the source ("RSP ST"), is printed over it. Held in
 * the mode, a pad tapped records hands-free ([onLatchPad], with when it was
 * pressed), as SHIFT + pad on the EP-133 ([SampleHold]).
 */
class SampleKeyUi(
    val on: Boolean = false,
    val recording: Boolean = false,
    val handsFree: Boolean = false,
    val label: String = "",
    val onSample: () -> Unit = {},
    val onStop: () -> Unit = {},
    val onLatchPad: (pad: PhysicalPad, pressedAt: Long) -> Unit = { _, _ -> },
) {
    /** SAMPLE tapped, or held and let go of with no pad picked: a hands-free take stops, else the mode opens or closes. */
    fun tap() = if (handsFree) onStop() else onSample()
}

/**
 * SAMPLE held, as SHIFT held with a pad records hands-free on the EP-133:
 * while [held] in the mode with no hands-free take going, the first pad
 * tapped latches a take into it ([SampleKeyUi.onLatchPad]) instead of
 * sounding; the pads after it play as ever. On the scrolling page a press
 * may still turn into a scroll, so an unsure one latches only once it is
 * kept ([kept]); one cut short ([release]) latches nothing, and SAMPLE's
 * release is a tap again. Let go of SAMPLE: a latch made meanwhile (or
 * waiting to be kept) is all it does; else, however long it was held, it is
 * a tap ([SampleKeyUi.tap]). Out of the mode, or while a hands-free take goes
 * on, the pads stay the pads'. A press taken keeps its release too, so
 * nothing lets go of a sound it never started.
 */
@Stable
internal class SampleHold {
    var held by mutableStateOf(false)
        private set
    private var picked = false
    private val taken = HashSet<Any>()
    // Unsure presses taken for a latch, by key: the pad and when it was pressed, until kept or cut.
    private val unsure = HashMap<Any, Pair<PhysicalPad, Long>>()

    fun down() {
        held = true
        picked = false
    }

    /** SAMPLE let go of: a tap, unless a pad was latched (or taken for one) meanwhile. */
    fun up(fn: FunctionKeysUi) {
        if (!held) return
        held = false
        if (picked) return
        fn.sample?.tap()
    }

    /** SAMPLE's press slid off or was taken by a scroll: nothing. */
    fun cancel() {
        held = false
    }

    /**
     * A press on [key], the pad [pad], at [pressedAt] (System.nanoTime): true
     * when SAMPLE takes it for a latch. [unsure], on the scrolling page, the
     * latch waits for [kept].
     */
    fun press(key: Any, pad: PhysicalPad, pressedAt: Long, fn: FunctionKeysUi, unsure: Boolean = false): Boolean {
        val sample = fn.sample
        if (!held || picked || sample == null || !sample.on || sample.handsFree) return false
        taken += key
        picked = true
        if (unsure) this.unsure[key] = pad to pressedAt else sample.onLatchPad(pad, pressedAt)
        return true
    }

    /** [key]'s unsure press was a press after all: its latch now (the mode still open). True when the press was taken. */
    fun kept(key: Any, fn: FunctionKeysUi): Boolean {
        unsure.remove(key)?.let { (pad, at) -> fn.sample?.takeIf { it.on }?.onLatchPad(pad, at) }
        return key in taken
    }

    /** Whether [key]'s press was taken (its release and the like are SAMPLE's). */
    fun took(key: Any): Boolean = key in taken

    /**
     * [key] let go of, or its press cut short by a scroll: true when its
     * press was taken. One still unsure latches nothing, and SAMPLE, if still
     * held, is a tap again when let go of.
     */
    fun release(key: Any): Boolean {
        if (unsure.remove(key) != null) picked = false
        return taken.remove(key)
    }
}

/** A KEYS key's [ProjectHold] key and its pad's digit, by its place on the body. */
internal fun keysKey(offset: Int): String = "keys:$offset"
internal fun padDigit(offset: Int): String = PadNotes.LABELS[offset]

/** The row's keys are no wider than this (a tablet's row keeps to the start). */
private val RowKeyMax = 132.dp

/** Narrower than this, a row key takes the column's smaller type and TEMPO its short word. */
private val RowKeyCompact = 64.dp

/** The gap between the row's keys. */
private val RowGap = 8.dp

/** The cap's height in the row (a wide window's a little taller) and in the column. */
private val RowCap = 44.dp
private val RowCapWide = 48.dp
private val ColumnCap = 38.dp

/** Between the cap and the LED line (the cap's edge takes 3 of it), and the LED line's height. */
private val CapToLed = 6.dp
private val LedLine = 14.dp

/** The column of keys left of the pads on a phone on its side. */
internal val SideFunctions = 60.dp

/** The column's gaps between its keys: at most, closed up, and at least (its smallest caps, without LED lines). */
private val ColumnGap = 12.dp
private val ColumnGapTight = 6.dp
private val ColumnGapMin = 4.dp

/** The column's smallest caps, with their LED lines (so a phone on its side keeps them) and without. */
private val ColumnCapLed = 28.dp
private val ColumnCapMin = 24.dp

/** Without LED lines, caps this short close the gaps to [ColumnGapMin]. */
private val ColumnCapLow = 28.dp

/** The LED on SAMPLE's cap where the column has no LED lines: its size, and how far in from the cap's start (clear of the word). */
private val CapLedSize = 5.dp
private val CapLedInset = 4.dp

/** Caps shorter than this take the smallest type, so a half's word stays inside it. */
private val ColumnCapSmallType = 28.dp

/** How many keys the row and the column hold: SAMPLE, SOUND, PROJECT, KEYS and TEMPO. */
private const val KEY_COUNT = 5

/** The column's least height that keeps its LED lines (the caps at their smallest with them). */
internal val FunctionColumnLed = (ColumnCapLed + CapToLed + LedLine) * KEY_COUNT + ColumnGapTight * (KEY_COUNT - 1)

/** How many keys show: all of them, or without SAMPLE where [FunctionKeysUi.sample] hides it. */
private fun keyCount(fn: FunctionKeysUi): Int = if (fn.sample != null) KEY_COUNT else KEY_COUNT - 1

/**
 * How the column's keys fit [height]: their [cap], the [gap] between them,
 * and whether their LED lines ([led]) are kept.
 */
internal data class ColumnFit(val cap: Dp, val gap: Dp, val led: Boolean)

/**
 * The column's [keys] in [height], as tall as they fit (in a short window on
 * its side, or with a large display size, the keys beside it shrink too):
 * full size (about 310 dp for five) in room; shorter, the gaps close up,
 * then the caps shrink, then the LED lines go (a screen reader still hears
 * what they say), then the caps shrink again with the gaps at their least.
 * Under about 136 dp for five it is as small as it gets.
 */
internal fun columnFit(height: Dp, keys: Int = KEY_COUNT): ColumnFit {
    val line = CapToLed + LedLine
    val gaps = keys - 1
    val full = (ColumnCap + line) * keys
    if (height >= full + ColumnGapTight * gaps) return ColumnFit(ColumnCap, ((height - full) / gaps).coerceAtMost(ColumnGap), true)
    val withLed = (height - ColumnGapTight * gaps) / keys - line
    if (withLed >= ColumnCapLed) return ColumnFit(withLed, ColumnGapTight, true)
    val bare = (height - ColumnGapTight * gaps) / keys
    if (bare >= ColumnCapLow) return ColumnFit(bare.coerceAtMost(ColumnCap), ColumnGapTight, false)
    return ColumnFit(((height - ColumnGapMin * gaps) / keys).coerceIn(ColumnCapMin, ColumnCap), ColumnGapMin, false)
}

/** The row's height: the cap, the gap and the LED line. */
@Composable
internal fun functionRowHeight(): Dp = rowCap() + CapToLed + LedLine

@Composable
private fun rowCap(): Dp = if (LocalArcWindow.current.width >= 600.dp) RowCapWide else RowCap

/**
 * The keys in a row over the pads or the keys, sharing its width up to
 * [RowKeyMax] each; under [RowKeyCompact] each (five across a phone), their
 * words in the column's smaller type.
 */
@Composable
internal fun FunctionRow(
    fn: FunctionKeysUi,
    keys: KeysUi,
    actions: KeysActions,
    st: MirrorState,
    haptics: Boolean,
    modifier: Modifier = Modifier,
    hold: ProjectHold = remember { ProjectHold() },
    edit: EditUi = EditUi(),
    sampleHold: SampleHold = remember { SampleHold() },
) {
    val count = keyCount(fn)
    BoxWithConstraints(modifier.widthIn(max = RowKeyMax * count + RowGap * (count - 1)).fillMaxWidth()) {
        val compact = (maxWidth - RowGap * (count - 1)) / count < RowKeyCompact
        Row(
            Modifier
                .fillMaxWidth()
                .semantics { isTraversalGroup = true },
            horizontalArrangement = Arrangement.spacedBy(RowGap),
        ) {
            FunctionKeys(fn, keys, actions, st, haptics, column = null, small = compact, Modifier.weight(1f), hold, edit, sampleHold)
        }
    }
}

/**
 * The keys in a column left of the pads or the keys, [SideFunctions] wide,
 * in the middle of its height; sized to that height ([columnFit]).
 */
@Composable
internal fun FunctionColumn(
    fn: FunctionKeysUi,
    keys: KeysUi,
    actions: KeysActions,
    st: MirrorState,
    haptics: Boolean,
    modifier: Modifier = Modifier,
    hold: ProjectHold = remember { ProjectHold() },
    edit: EditUi = EditUi(),
    sampleHold: SampleHold = remember { SampleHold() },
) {
    BoxWithConstraints(modifier.width(SideFunctions).fillMaxHeight()) {
        val fit = columnFit(maxHeight, keyCount(fn))
        Column(
            Modifier
                .fillMaxSize()
                .semantics { isTraversalGroup = true },
            horizontalAlignment = Alignment.CenterHorizontally,
            // No gaps between the keys: each key's touch reaches half way across the gap ([FunctionKeys]).
            verticalArrangement = Arrangement.Center,
        ) {
            FunctionKeys(fn, keys, actions, st, haptics, column = fit, small = true, Modifier.fillMaxWidth(), hold, edit, sampleHold)
        }
    }
}

/**
 * SAMPLE (where [FunctionKeysUi.sample] has it), SOUND, PROJECT, KEYS and
 * TEMPO, each with [modifier]; [column]'s size in the column, null in the
 * row; [small]: the column's type (and TEMPO's short word), in the column
 * and in a narrow row.
 */
@Composable
private fun FunctionKeys(
    fn: FunctionKeysUi,
    keys: KeysUi,
    actions: KeysActions,
    st: MirrorState,
    haptics: Boolean,
    column: ColumnFit?,
    small: Boolean,
    modifier: Modifier,
    hold: ProjectHold,
    edit: EditUi,
    sampleHold: SampleHold,
) {
    val c = LocalArcColors.current
    val ko = LocalHwColors.current.ko
    val project = fn.project
    // In the column the keys sit [ColumnFit.gap] apart, and each takes the touch half way across the
    // gaps either side of it, so a short cap's neighbour is never a near miss away.
    val first = if (fn.sample != null) 0 else 1
    val reach = { index: Int ->
        if (column == null) {
            PaddingValues()
        } else {
            PaddingValues(top = if (index == first) 0.dp else column.gap / 2, bottom = if (index == KEY_COUNT - 1) 0.dp else column.gap / 2)
        }
    }
    // SAMPLE, first as on the K.O. II's body: a tap opens or closes SAMPLE mode (or stops a hands-free
    // take); held, a pad latches a hands-free take ([SampleHold]). Its light is on in the mode and
    // blinks while a take records; over it, the source.
    fn.sample?.let { sample ->
        val blink = sampleBlink(sample.recording)
        FunctionKey(
            word = MirrorText.FN_SAMPLE,
            reach = reach(0),
            capLed = true,
            sub = MirrorText.FN_SAMPLE_SUB,
            face = c.signal,
            edge = c.signalEdge,
            ink = c.onSignal,
            lower = ko.lightFace,
            lowerInk = ko.tierInk,
            led = { if (!sample.on) 0f else if (sample.recording) blink.floatValue else 1f },
            lit = sample.on,
            label = sample.label,
            description = MirrorText.FN_SAMPLE,
            state = MirrorText.sampleKeyState(sample.on, sample.recording, sample.handsFree),
            onClick = sample::tap,
            held = HeldKey(sampleHold::down, { sampleHold.up(fn) }, sampleHold::cancel),
            role = Role.Button,
            column = column,
            small = small,
            haptics = haptics,
            modifier = modifier.coachMark("live.sample", CoachText.SAMPLE, c.signal, c.onSignal),
        )
    }
    // SOUND: Live's EDIT ([edit]) on or off (a tap on a pad then gives it another sound), its light on
    // while it is; in KEYS it goes back to the pads with EDIT on. Held, the sheet of the pad played last.
    val editOn = edit.on && !keys.on
    val onEdit = edit.onEdit
    FunctionKey(
        word = MirrorText.FN_SOUND,
        reach = reach(1),
        sub = MirrorText.EDIT_TAB,
        lower = ko.lightFace,
        lowerInk = ko.tierInk,
        led = { if (editOn) 1f else 0f },
        lit = editOn,
        label = if (editOn) MirrorText.EDIT_TAB else MirrorText.MODE_PADS,
        description = MirrorText.FN_SOUND,
        state = null,
        enabled = onEdit != null,
        toggled = editOn,
        onClick = {
            if (onEdit != null) {
                if (keys.on) actions.onMode(false)
                onEdit(keys.on || !editOn)
            }
        },
        onLongClick = fn.onPadSound,
        longClickLabel = MirrorText.SOUND_SHEET,
        role = Role.Switch,
        column = column,
        small = small,
        haptics = haptics,
        modifier = modifier.coachMark("live.sound", CoachText.EDIT, c.signal, c.onSignal),
    )
    // PROJECT: steps to the next project; held, a pad 1 to 9 picks one, or let go, the project sheet.
    // Its light is on while it is held and while the device switches.
    val projectState = MirrorText.projectKeyState(project.shown, project.source)
    FunctionKey(
        word = MirrorText.FN_PROJECT,
        reach = reach(2),
        sub = MirrorText.FN_PROJECT_SUB,
        lower = ko.lightFace,
        lowerInk = ko.tierInk,
        led = { if (project.switching || hold.held) 1f else 0f },
        lit = project.switching || hold.held,
        label = project.shown?.let(MirrorText::projectShort) ?: "–",
        description = MirrorText.FN_PROJECT,
        // Greyed out without a device or the factory pack: why, after the project shown.
        state = if (!project.enabled && (project.source != ProjectSource.DEVICE || project.shown == null)) {
            projectState + ". " + MirrorText.PROJECT_UNAVAILABLE
        } else {
            projectState
        },
        enabled = project.enabled,
        onClick = fn.onProject,
        clickLabel = MirrorText.PROJECT_NEXT,
        onLongClick = fn.onPickProject,
        longClickLabel = MirrorText.PICK_PROJECT,
        held = HeldKey(hold::down, { long -> hold.up(long, fn) }, hold::cancel),
        role = Role.Button,
        column = column,
        small = small,
        haptics = haptics,
        modifier = modifier.coachMark("live.project", CoachText.PROJECT, c.navy, c.onNavy),
    )
    // KEYS: the mode, its light on while the pads are keys (the key doesn't latch).
    FunctionKey(
        word = MirrorText.MODE_KEYS,
        reach = reach(3),
        sub = MirrorText.MODE_PADS,
        lower = c.signal,
        lowerInk = c.onSignal,
        led = { if (keys.on) 1f else 0f },
        lit = keys.on,
        label = if (keys.on) MirrorText.MODE_KEYS else MirrorText.MODE_PADS,
        description = MirrorText.MODE_KEYS,
        state = null,
        toggled = keys.on,
        onClick = { actions.onMode(!keys.on) },
        role = Role.Switch,
        column = column,
        small = small,
        haptics = haptics,
        modifier = modifier.coachMark("live.mode", CoachText.MODE, c.navy, c.onNavy),
    )
    // TEMPO: a tap turns the click on or off, a hold opens the tempo sheet. While the
    // EP-133 sends MIDI clock its tempo is the one shown (and the one the click follows).
    val device = st.bpm
    val bpm = device?.let(Tempo::round) ?: fn.bpm
    val blink = beatBlink(fn)
    FunctionKey(
        word = MirrorText.FN_TEMPO,
        reach = reach(4),
        sub = MirrorText.FN_TEMPO_SUB,
        lower = ko.loopFace,
        lowerInk = c.onSignal,
        led = { blink.value },
        lit = fn.clickOn,
        // Whole BPM, so it fits five keys across a narrow phone (the display line keeps the tenth).
        label = if (small) MirrorText.tempoShort(bpm) else MirrorText.tempoValue(bpm),
        description = MirrorText.CLICK,
        state = MirrorText.clickState(fn.clickOn, bpm, following = device != null),
        toggled = fn.clickOn,
        onClick = { fn.onClick(!fn.clickOn) },
        onLongClick = fn.onTempo,
        longClickLabel = MirrorText.SET_TEMPO,
        role = Role.Switch,
        column = column,
        small = small,
        haptics = haptics,
        modifier = modifier.coachMark("live.tempo", CoachText.TEMPO, c.navy, c.onNavy),
    )
}

/**
 * TEMPO's light, 0..1: on each of [FunctionKeysUi.beats] it lights when the
 * beat is heard (or was clocked) and fades in 110 ms, 220 on a bar's first
 * beat. Read in the draw, so a blink doesn't recompose. A beat already well
 * past (the flow's last one, on coming back) doesn't blink.
 */
@Composable
private fun beatBlink(fn: FunctionKeysUi): Animatable<Float, *> {
    val level = remember { Animatable(if (fn.beatLit) 1f else 0f) }
    val beats = fn.beats
    LaunchedEffect(beats) {
        beats?.collect { b ->
            if (b == null) return@collect
            val wait = (b.at - System.nanoTime()) / 1_000_000
            if (wait < -STALE_BEAT_MS) return@collect
            if (wait > 0) delay(wait)
            level.snapTo(1f)
            level.animateTo(0f, tween(if (b.accent) 220 else 110))
        }
    }
    return level
}

private const val STALE_BEAT_MS = 100L

/**
 * SAMPLE's light while a take [recording]s: 1 and 0 in turn every
 * [SAMPLE_BLINK_MS], read in the draw so a blink doesn't recompose; 1
 * otherwise (and as a take starts, so a screenshot catches it lit).
 */
@Composable
private fun sampleBlink(recording: Boolean): androidx.compose.runtime.MutableFloatState {
    val level = remember { mutableFloatStateOf(1f) }
    LaunchedEffect(recording) {
        level.floatValue = 1f
        while (recording) {
            delay(SAMPLE_BLINK_MS)
            level.floatValue = 1f - level.floatValue
        }
    }
    return level
}

/** How long SAMPLE's light stays on, then off, while a take records. */
internal const val SAMPLE_BLINK_MS = 450L

/**
 * A key held while the pads are tapped ([ProjectHold], [SampleHold]): its
 * press and release go to [down], [up] (whether it was held past the
 * long-press time) and [cancel] by hand, not through a click.
 */
private class HeldKey(val down: () -> Unit, val up: (long: Boolean) -> Unit, val cancel: () -> Unit)

/**
 * One two-tier key: [word] in [ink] on the cap's upper half ([face], with
 * [edge] for its side: dark unless given), [sub] in [lowerInk] on its
 * [lower] half, under its LED ([led], 0..1, read in the draw) and [label],
 * in ink while [lit]. The whole key and its line take the touch; a screen
 * reader hears [description] and [state] ([toggled] for a switch). [column]:
 * the narrower, shorter key of the column on a phone on its side, its cap
 * and (when it fits) LED line as that says; null in the row. [small]: the
 * column's smaller type (smaller again on its shortest caps). [held]: a key held while the pads are tapped, its
 * press and release by hand. [reach]: how far past the key its touch goes
 * (half the column's gaps). [capLed]: where the column has no room for the
 * LED line, the LED goes on the cap's lower half instead (SAMPLE's, which
 * says a take records).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FunctionKey(
    word: String,
    sub: String,
    lower: Color,
    lowerInk: Color,
    led: () -> Float,
    lit: Boolean,
    label: String,
    description: String,
    state: String?,
    onClick: () -> Unit,
    role: Role,
    column: ColumnFit?,
    small: Boolean,
    haptics: Boolean,
    modifier: Modifier,
    face: Color = LocalHwColors.current.darkFace,
    edge: Color = LocalHwColors.current.darkEdge,
    ink: Color = LocalHwColors.current.darkInk,
    enabled: Boolean = true,
    toggled: Boolean? = null,
    clickLabel: String? = null,
    onLongClick: (() -> Unit)? = null,
    longClickLabel: String? = null,
    held: HeldKey? = null,
    reach: PaddingValues = PaddingValues(),
    capLed: Boolean = false,
) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val tick = if (haptics) LocalHapticFeedback.current else null
    LaunchedEffect(pressed) {
        if (pressed) tick?.performHapticFeedback(HapticFeedbackType.KeyboardTap)
    }
    val alpha = if (enabled) 1f else 0.45f
    val text = viewWordStyle(if (column != null && column.cap < ColumnCapSmallType) 8.5.dp else if (small) 9.5.dp else 10.5.dp, 0.08f)
    // PROJECT and SAMPLE ([held]): their press and release by hand, so they can be held while the
    // pads are tapped and act on release; a screen reader keeps the click and long click.
    // The gesture outlives the composition it started in: it acts on the key as it is now (a tap on
    // SAMPLE stops a hands-free take that began since), not as it was then.
    val heldNow by rememberUpdatedState(held)
    val touch = if (held != null) {
        Modifier
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                awaitEachGesture {
                    val first = awaitFirstDown()
                    val press = PressInteraction.Press(first.position)
                    source.tryEmit(press)
                    heldNow?.down()
                    val up = waitForUpOrCancellation()
                    if (up != null) {
                        source.tryEmit(PressInteraction.Release(press))
                        heldNow?.up(up.uptimeMillis - first.uptimeMillis >= viewConfiguration.longPressTimeoutMillis)
                    } else {
                        source.tryEmit(PressInteraction.Cancel(press))
                        heldNow?.cancel()
                    }
                }
            }
            .semantics {
                this.role = role
                if (enabled) {
                    onClick(clickLabel) {
                        onClick()
                        true
                    }
                    if (onLongClick != null) {
                        onLongClick(longClickLabel) {
                            onLongClick()
                            true
                        }
                    }
                } else {
                    disabled()
                }
            }
    } else {
        Modifier.combinedClickable(
            interactionSource = source,
            indication = null,
            enabled = enabled,
            role = role,
            onClickLabel = clickLabel,
            onLongClickLabel = longClickLabel,
            onLongClick = onLongClick,
            onClick = onClick,
        )
    }
    Column(
        modifier
            .then(touch)
            .semantics {
                contentDescription = description
                state?.let { stateDescription = it }
                toggled?.let { toggleableState = ToggleableState(it) }
            }
            .padding(reach),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(CapToLed),
    ) {
        // Too short for the LED lines: the caps alone.
        if (column?.led != false) {
            Row(
                Modifier.heightIn(min = LedLine).padding(horizontal = 2.dp).clearAndSetSemantics { },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                val on = c.signal
                val off = hw.ledOff
                // The LED and a soft light around it, drawn from [led] each frame it changes.
                Canvas(Modifier.size(6.dp)) {
                    val v = led().coerceIn(0f, 1f)
                    if (v > 0f) drawCircle(on.copy(alpha = 0.35f * v), radius = size.minDimension * 1.1f)
                    drawCircle(lerp(off, on, v), radius = size.minDimension / 2)
                }
                Text(
                    label.uppercase(),
                    style = viewWordStyle(if (small) 9.5.dp else 11.dp),
                    color = (if (lit) c.ink else c.graphite).copy(alpha = alpha),
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
        Column(
            Modifier
                .fillMaxWidth()
                .height(column?.cap ?: rowCap())
                .cap(face, edge, RoundedCornerShape(8.dp), capPress(pressed && enabled), alpha = alpha)
                .clearAndSetSemantics { },
        ) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                Text(word.uppercase(), style = text, color = ink, maxLines = 1, softWrap = false)
            }
            Box(Modifier.fillMaxWidth().weight(1f).background(lower), contentAlignment = Alignment.Center) {
                Text(sub.uppercase(), style = text, color = lowerInk, maxLines = 1, softWrap = false)
                // No LED line: the LED at the start of the lower half, pale as the body it sits on in the line.
                if (capLed && column?.led == false) {
                    val on = c.signal
                    Canvas(Modifier.align(Alignment.CenterStart).padding(start = CapLedInset).size(CapLedSize)) {
                        drawCircle(lerp(hw.ledOff, on, led().coerceIn(0f, 1f)), radius = size.minDimension / 2)
                    }
                }
            }
        }
    }
}
