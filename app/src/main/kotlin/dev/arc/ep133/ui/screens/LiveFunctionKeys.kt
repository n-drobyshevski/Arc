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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/*
 * Live's function keys (an addition): PROJECT, KEYS and TEMPO as the EP-133
 * prints its two-tier keys, a dark cap with its word on the upper half and
 * the lower half filled with a colour carrying a second word, under an LED
 * and a printed label. A row over the pads (upright, and on the
 * all-groups and tablet pages), a column left of them on a phone on its side.
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

    /** PROJECT's press slid off, was taken by a scroll, or went with its key (the SAMPLE panel over it): nothing. */
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

/** A KEYS key's [ProjectHold] key and its pad's digit, by its place on the body. */
internal fun keysKey(offset: Int): String = "keys:$offset"
internal fun padDigit(offset: Int): String = PadNotes.LABELS[offset]

/** The row's keys are no wider than this (a tablet's row keeps to the start). */
private val RowKeyMax = 132.dp

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

/** The column's gaps between its keys, at most and at least. */
private val ColumnGap = 12.dp
private val ColumnGapTight = 6.dp

/** The column's smallest caps, with their LED lines and without. */
private val ColumnCapLed = 32.dp
private val ColumnCapMin = 30.dp

/** How many keys the row and the column hold: SOUND, PROJECT, KEYS and TEMPO. */
private const val KEY_COUNT = 4

/** The column's least height that keeps its LED lines (the caps at their smallest with them). */
internal val FunctionColumnLed = (ColumnCapLed + CapToLed + LedLine) * KEY_COUNT + ColumnGapTight * (KEY_COUNT - 1)

/**
 * How the column's keys fit [height]: their [cap], the [gap] between them,
 * and whether their LED lines ([led]) are kept.
 */
internal data class ColumnFit(val cap: Dp, val gap: Dp, val led: Boolean)

/**
 * The column's keys in [height], as tall as they fit (in a short window on
 * its side, or with a large display size, the keys beside it shrink too):
 * full size (about 200 dp) in room; shorter, the gaps close up, then the
 * caps shrink, then the LED lines go (a screen reader still hears what they
 * say). Under about 100 dp it is as small as it gets.
 */
internal fun columnFit(height: Dp): ColumnFit {
    val line = CapToLed + LedLine
    val gaps = KEY_COUNT - 1
    val full = (ColumnCap + line) * KEY_COUNT
    if (height >= full + ColumnGapTight * gaps) return ColumnFit(ColumnCap, ((height - full) / gaps).coerceAtMost(ColumnGap), true)
    val withLed = (height - ColumnGapTight * gaps) / KEY_COUNT - line
    if (withLed >= ColumnCapLed) return ColumnFit(withLed, ColumnGapTight, true)
    return ColumnFit(((height - ColumnGapTight * gaps) / KEY_COUNT).coerceIn(ColumnCapMin, ColumnCap), ColumnGapTight, false)
}

/** The row's height: the cap, the gap and the LED line. */
@Composable
internal fun functionRowHeight(): Dp = rowCap() + CapToLed + LedLine

@Composable
private fun rowCap(): Dp = if (LocalArcWindow.current.width >= 600.dp) RowCapWide else RowCap

/** The four keys in a row over the pads or the keys, sharing its width up to [RowKeyMax] each. */
@Composable
internal fun FunctionRow(fn: FunctionKeysUi, keys: KeysUi, actions: KeysActions, st: MirrorState, haptics: Boolean, modifier: Modifier = Modifier, hold: ProjectHold = remember { ProjectHold() }, edit: EditUi = EditUi()) {
    Row(
        modifier
            .widthIn(max = RowKeyMax * KEY_COUNT + RowGap * (KEY_COUNT - 1))
            .fillMaxWidth()
            .semantics { isTraversalGroup = true },
        horizontalArrangement = Arrangement.spacedBy(RowGap),
    ) {
        FunctionKeys(fn, keys, actions, st, haptics, column = null, Modifier.weight(1f), hold, edit)
    }
}

/**
 * The three keys in a column left of the pads or the keys, [SideFunctions]
 * wide, in the middle of its height; sized to that height ([columnFit]).
 */
@Composable
internal fun FunctionColumn(fn: FunctionKeysUi, keys: KeysUi, actions: KeysActions, st: MirrorState, haptics: Boolean, modifier: Modifier = Modifier, hold: ProjectHold = remember { ProjectHold() }, edit: EditUi = EditUi()) {
    BoxWithConstraints(modifier.width(SideFunctions).fillMaxHeight()) {
        val fit = columnFit(maxHeight)
        Column(
            Modifier
                .fillMaxSize()
                .semantics { isTraversalGroup = true },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(fit.gap, Alignment.CenterVertically),
        ) {
            FunctionKeys(fn, keys, actions, st, haptics, column = fit, Modifier.fillMaxWidth(), hold, edit)
        }
    }
}

/** SOUND, PROJECT, KEYS and TEMPO, each with [modifier]; [column]'s size in the column, null in the row. */
@Composable
private fun FunctionKeys(fn: FunctionKeysUi, keys: KeysUi, actions: KeysActions, st: MirrorState, haptics: Boolean, column: ColumnFit?, modifier: Modifier, hold: ProjectHold, edit: EditUi) {
    val c = LocalArcColors.current
    val ko = LocalHwColors.current.ko
    val project = fn.project
    // SOUND: Live's EDIT ([edit]) on or off (a tap on a pad then gives it another sound), its light on
    // while it is; in KEYS it goes back to the pads with EDIT on. Held, the sheet of the pad played last.
    val editOn = edit.on && !keys.on
    val onEdit = edit.onEdit
    FunctionKey(
        word = MirrorText.FN_SOUND,
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
        haptics = haptics,
        modifier = modifier.coachMark("live.sound", CoachText.EDIT, c.signal, c.onSignal),
    )
    // PROJECT: steps to the next project; held, a pad 1 to 9 picks one, or let go, the project sheet.
    // Its light is on while it is held and while the device switches.
    val projectState = MirrorText.projectKeyState(project.shown, project.source)
    FunctionKey(
        word = MirrorText.FN_PROJECT,
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
        hold = hold,
        fn = fn,
        role = Role.Button,
        column = column,
        haptics = haptics,
        modifier = modifier.coachMark("live.project", CoachText.PROJECT, c.navy, c.onNavy),
    )
    // KEYS: the mode, its light on while the pads are keys (the key doesn't latch).
    FunctionKey(
        word = MirrorText.MODE_KEYS,
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
        sub = MirrorText.FN_TEMPO_SUB,
        lower = ko.loopFace,
        lowerInk = c.onSignal,
        led = { blink.value },
        lit = fn.clickOn,
        // Whole BPM, so it fits four keys across a narrow phone (the display line keeps the tenth).
        label = if (column != null) MirrorText.tempoShort(bpm) else MirrorText.tempoValue(bpm),
        description = MirrorText.CLICK,
        state = MirrorText.clickState(fn.clickOn, bpm, following = device != null),
        toggled = fn.clickOn,
        onClick = { fn.onClick(!fn.clickOn) },
        onLongClick = fn.onTempo,
        longClickLabel = MirrorText.SET_TEMPO,
        role = Role.Switch,
        column = column,
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
 * One two-tier key: [word] on the dark cap's upper half, [sub] in [lowerInk]
 * on its [lower] half, under its LED ([led], 0..1, read in the draw) and
 * [label], in ink while [lit]. The whole key and its line take the touch;
 * a screen reader hears [description] and [state] ([toggled] for a switch).
 * [column]: the narrower, shorter key of the column on a phone on its side,
 * its cap and (when it fits) LED line as that says; null in the row.
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
    haptics: Boolean,
    modifier: Modifier,
    enabled: Boolean = true,
    toggled: Boolean? = null,
    clickLabel: String? = null,
    onLongClick: (() -> Unit)? = null,
    longClickLabel: String? = null,
    hold: ProjectHold? = null,
    fn: FunctionKeysUi? = null,
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
    val text = viewWordStyle(if (column != null) 9.5.dp else 10.5.dp, 0.08f)
    // PROJECT ([hold]): its press and release by hand, so it can be held while the pads are
    // tapped and its long press acts on release; a screen reader keeps the click and long click.
    // The gesture outlives the composition it started in: its release acts on the keys as they
    // are now (the project list read since), not as they were at the press.
    val fnNow by rememberUpdatedState(fn)
    val touch = if (hold != null && fn != null) {
        Modifier
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                awaitEachGesture {
                    val first = awaitFirstDown()
                    val press = PressInteraction.Press(first.position)
                    source.tryEmit(press)
                    hold.down()
                    val up = try {
                        waitForUpOrCancellation()
                    } catch (gone: CancellationException) {
                        // The key left the page while held (the SAMPLE panel unrolled over it): no lift
                        // will come, and PROJECT mustn't stay held, taking the pads' presses.
                        source.tryEmit(PressInteraction.Cancel(press))
                        hold.cancel()
                        throw gone
                    }
                    if (up != null) {
                        source.tryEmit(PressInteraction.Release(press))
                        hold.up(up.uptimeMillis - first.uptimeMillis >= viewConfiguration.longPressTimeoutMillis, fnNow ?: fn)
                    } else {
                        source.tryEmit(PressInteraction.Cancel(press))
                        hold.cancel()
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
            },
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
                    style = viewWordStyle(if (column != null) 9.5.dp else 11.dp),
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
                .cap(hw.darkFace, hw.darkEdge, RoundedCornerShape(8.dp), capPress(pressed && enabled), alpha = alpha)
                .clearAndSetSemantics { },
        ) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                Text(word.uppercase(), style = text, color = hw.darkInk, maxLines = 1, softWrap = false)
            }
            Box(Modifier.fillMaxWidth().weight(1f).background(lower), contentAlignment = Alignment.Center) {
                Text(sub.uppercase(), style = text, color = lowerInk, maxLines = 1, softWrap = false)
            }
        }
    }
}
