package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.STEP_GATES
import dev.arc.ep133.controller.StepUi
import dev.arc.ep133.controller.snapGate
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.Timing
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.Knob
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.DarkArcColors
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlin.math.roundToInt

/*
 * STEP on Live (an addition, after the EP-133's own step sequencing: − / +
 * while stopped, RECORD + pad, SHIFT + KNOB X / Y, SHIFT + pad then − / +,
 * and SHIFT + TIMING's timing correct). A STEP chip on the stopped display
 * line ([PatternLine]) unrolls the line into the STEP panel over the
 * function keys, as SAMPLE's does ([SampleMorph], [PanelKind.STEP]), all of
 * it on the line's dark screen: the panel's RECORD (held), PLAY, the status
 * and ✕ in the line's own row ([StepHeader]); then − and + either side of
 * the strip, one bar of steps with the cursor on it, and under them VEL and
 * LEN, BAR's pages, NUDGE and CORRECT ([StepDeck]). Where the line rides in
 * the top bar, the panel comes out in the function keys' column with its
 * own header ([StepBodyFace]). The pads (or KEYS keys) on the cursor's step
 * are outlined in signal orange, the one picked for − / + ringed ([PadStep]).
 */

/**
 * STEP for Live's page (an addition): [ui] as the controller has it, and
 * [pickedWord], the note picked for − / + as the status names it ("KICK"),
 * for NUDGE's chip. The STEP chip opens the panel on Live's group
 * ([onOpen]), ✕ closes it ([onClose]), and a group shown moves it there
 * ([onGroup]). In the panel: RECORD held ([onRecordDown], [onRecordUp]),
 * PLAY ([onPlay]: the panel folds), − and + ([onMinus], [onPlus]), a step
 * of the strip tapped ([onJump]) or a bar's page ([onPage]), VEL
 * ([onVelocity], 1..127) and LEN ([onGate], ticks) and their knobs let go
 * of ([onKnobEnd]), NUDGE ([onNudge]) and CORRECT ([onCorrect]). While it
 * is open the pads and keys are its own: a press [onPadDown] or
 * [onNoteDown] (MIDI) at the touch's time and pressure (NaN: none told),
 * the lift [onPadUp] or [onNoteUp], a long press picking the note for − / +
 * ([onPadPick], [onNotePick]: false where it has none on the step). While
 * the pattern plays with CORRECT on, a pad or key held corrects its notes
 * ([onCorrectPadDown] and up, [onCorrectNoteDown] and up). [unroll] catches
 * the panel that far along its motion (screenshots).
 */
class LiveStep(
    val ui: StepUi = StepUi(),
    val pickedWord: String? = null,
    val unroll: Float? = null,
    val onOpen: (group: Int) -> Unit = {},
    val onClose: () -> Unit = {},
    val onGroup: (Int) -> Unit = {},
    val onRecordDown: () -> Unit = {},
    val onRecordUp: () -> Unit = {},
    val onPlay: () -> Unit = {},
    val onPadDown: (pad: PhysicalPad, pressedAt: Long, pressure: Float) -> Unit = { _, _, _ -> },
    val onPadUp: (pad: PhysicalPad, releasedAt: Long) -> Unit = { _, _ -> },
    val onNoteDown: (note: Int, pressedAt: Long, pressure: Float) -> Unit = { _, _, _ -> },
    val onNoteUp: (note: Int, releasedAt: Long) -> Unit = { _, _ -> },
    val onPadPick: (PhysicalPad) -> Boolean = { false },
    val onNotePick: (Int) -> Boolean = { false },
    val onMinus: () -> Unit = {},
    val onPlus: () -> Unit = {},
    val onJump: (step: Int) -> Unit = {},
    val onPage: (bar: Int) -> Unit = {},
    val onVelocity: (Int) -> Unit = {},
    val onGate: (Int) -> Unit = {},
    val onKnobEnd: () -> Unit = {},
    val onNudge: (Boolean) -> Unit = {},
    val onCorrect: (Boolean) -> Unit = {},
    val onCorrectPadDown: (pad: PhysicalPad, at: Long) -> Unit = { _, _ -> },
    val onCorrectPadUp: (pad: PhysicalPad, at: Long) -> Unit = { _, _ -> },
    val onCorrectNoteDown: (note: Int, at: Long) -> Unit = { _, _ -> },
    val onCorrectNoteUp: (note: Int, at: Long) -> Unit = { _, _ -> },
)

/**
 * The pads (or KEYS keys) while the STEP panel is open: those with a note
 * on the cursor's step ([lit]: pad offsets, or KEYS' MIDI notes), the one
 * [picked] for − / +, whether the panel's RECORD is held ([placing]: a pad
 * held lights up as it goes on the step), and a long press picking one
 * ([onPick], by offset or note: false where it has no note there).
 */
internal class PadStep(val lit: Set<Int>, val picked: Int?, val placing: Boolean, val onPick: (Int) -> Boolean)

/**
 * The touch's pressure as a pad or key goes down ([holdToPlay] writes it just
 * before the press; NaN for a screen reader's): a note the STEP panel's
 * RECORD + pad places takes its velocity from it, as the press happens.
 */
internal val LocalDownPressure = staticCompositionLocalOf<FloatArray?> { null }

/** The pad offsets lit on [group]'s grid for [ui]: those with a note (any pitch) on the cursor's step, while the panel is on that group. */
internal fun stepLitPads(ui: StepUi, group: Int): Set<Int> = if (ui.group != group) emptySet() else ui.lit.mapTo(HashSet()) { it.first }

/** The KEYS notes (MIDI) lit for [ui], [pad] the KEYS sound: its notes on the cursor's step, by pitch. */
internal fun stepLitNotes(ui: StepUi, pad: PhysicalPad?): Set<Int> =
    if (pad == null || ui.group != pad.group) emptySet() else ui.lit.mapNotNullTo(HashSet()) { (o, s) -> if (o == pad.offset && s != null) Keys.ROOT_NOTE + s else null }

/** The pad picked for − / + on [group]'s grid (its offset), or null. */
internal fun stepPickedPad(ui: StepUi, group: Int): Int? = ui.picked?.takeIf { it.pad.group == group && it.semitones == null }?.pad?.offset

/** The KEYS note (MIDI) picked for − / +, [pad] the KEYS sound, or null. */
internal fun stepPickedNote(ui: StepUi, pad: PhysicalPad?): Int? = ui.picked?.takeIf { it.pad == pad }?.semitones?.let { Keys.ROOT_NOTE + it }

/** How many steps the strip shows: one bar of them at [interval]. */
internal fun stripSteps(interval: Timing): Int = (Seq.TICKS_PER_BAR / interval.ticks).coerceAtLeast(1)

/** The steps the strip shows for [ui]: its page's bar of them, as many as the pattern has. */
internal fun stripRange(ui: StepUi): IntRange {
    val per = stripSteps(ui.interval)
    val first = ui.page * per
    return first until minOf(ui.count, first + per)
}

/** Whether [step] starts a beat inside a bar at [interval] (shorter than a beat): the strip leaves a little more room before it. */
internal fun beatStarts(step: Int, interval: Timing): Boolean {
    val t = step * interval.ticks
    return interval.ticks < Seq.PPQN && t % Seq.PPQN == 0 && t % Seq.TICKS_PER_BAR != 0
}

/** LEN's knob at [gate] ticks: its place among [STEP_GATES]. */
internal fun gateKnob(gate: Int): Float = STEP_GATES.indexOf(snapGate(gate)).toFloat()

/**
 * The STEP panel's controls' height under its header, [width] wide: the
 * strip's row, and the knobs' row with NUDGE and CORRECT at its end, or
 * (narrower than [StepRowMin]) the two of them a row of their own.
 */
internal fun stepDeckHeight(width: Dp): Dp =
    StepStripRow + StepGap + StepKnobRow + if (width >= StepRowMin) 0.dp else StepGap + StepLatchRow

/**
 * STEP's header (an addition), in the display line's own row as the line
 * grows into the panel ([SampleMorph]): the panel's RECORD, held to put a
 * pad on the step; ▶, which folds the panel and plays; the status ("STEP
 * 1.2.1", or what was done last in signal orange: "+ SNARE", "KICK →
 * 1.2.2"); and ✕. A narrow header ([StepHeaderNarrow]) has RECORD's light
 * without its word. A screen reader hears it as the STEP pane's title, and
 * each change once ([StepUi.said]).
 */
@Composable
internal fun StepHeader(step: LiveStep, haptics: Boolean, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    val ui = step.ui
    BoxWithConstraints(modifier.fillMaxSize().semantics { paneTitle = MirrorText.STEP_NAME }) {
        val narrow = maxWidth < StepHeaderNarrow
        Row(
            Modifier.fillMaxSize().padding(horizontal = WaveSide),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StepRecordChip(step, haptics, word = !narrow)
            StepPlayChip(step)
            val status = ui.status
            val said = spoken(ui.said ?: status ?: MirrorText.stepSpoken(ui.label, 0))
            BasicText(
                (status ?: MirrorText.stepStatus(ui.label)).uppercase(),
                style = ArcType.displayHead.copy(color = if (status != null) c.signal else c.displayInk, textAlign = TextAlign.End, fontFeatureSettings = "tnum"),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                autoSize = TextAutoSize.StepBased(minFontSize = StepStatusMin, maxFontSize = ArcType.displayHead.fontSize, stepSize = 0.5.sp),
                modifier = Modifier.weight(1f).clearAndSetSemantics {
                    contentDescription = said
                    liveRegion = LiveRegionMode.Polite
                },
            )
            StepClose(step)
        }
    }
}

/** The smallest type the header's status takes, where it is long or the header narrow. */
private val StepStatusMin = 11.sp

/** A header narrower than this (a small phone's, the panel on its side) has RECORD's light without its word. */
private val StepHeaderNarrow = 280.dp

/**
 * The panel's RECORD (not the transport's): held, a pad or key tapped goes
 * on the cursor's step; the chip filled signal orange meanwhile. A screen
 * reader's click holds it until the next one.
 */
@Composable
private fun StepRecordChip(step: LiveStep, haptics: Boolean, word: Boolean) {
    val c = LocalArcColors.current
    val ui by rememberUpdatedState(step)
    val held = step.ui.recordHeld
    val tick by rememberUpdatedState(if (haptics) LocalHapticFeedback.current else null)
    val gesture = Modifier
        .pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown().consume()
                ui.onRecordDown()
                tick?.performHapticFeedback(HapticFeedbackType.KeyboardTap)
                try {
                    waitForUpOrCancellation()
                } finally {
                    ui.onRecordUp()
                }
            }
        }
        .semantics(mergeDescendants = true) {
            role = Role.Switch
            contentDescription = MirrorText.RECORD
            stateDescription = MirrorText.onOff(held) + ". " + MirrorText.STEP_RECORD_NOTE
            onClick {
                if (held) ui.onRecordUp() else ui.onRecordDown()
                true
            }
        }
    LineChip(gesture, lit = held, filled = held, compact = false) { ink ->
        Canvas(Modifier.size(10.dp)) { drawCircle(if (held) c.onSignal else c.signal) }
        if (word) Text(MirrorText.RECORD.uppercase(), style = ArcType.displaySub, color = ink, maxLines = 1, softWrap = false)
    }
}

/** The panel's ▶: the panel folds and the pattern plays from bar 1. */
@Composable
private fun StepPlayChip(step: LiveStep) {
    LineChip(
        Modifier
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = step.onPlay)
            .semantics(mergeDescendants = true) { contentDescription = MirrorText.PLAY },
        lit = false,
        filled = false,
        compact = false,
    ) { ink ->
        Canvas(Modifier.size(10.dp)) {
            val p = Path().apply {
                moveTo(size.width * 0.15f, 0f)
                lineTo(size.width, size.height / 2)
                lineTo(size.width * 0.15f, size.height)
                close()
            }
            drawPath(p, ink)
        }
    }
}

/** ✕ at the header's end: the panel rolls up into the line. */
@Composable
private fun StepClose(step: LiveStep) {
    val c = LocalArcColors.current
    Box(
        Modifier
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = step.onClose)
            .semantics { contentDescription = MirrorText.CLOSE_STEP }
            .size(32.dp, 40.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(10.dp)) {
            val w = 1.8.dp.toPx()
            drawLine(c.displayDim, Offset(0f, 0f), Offset(size.width, size.height), strokeWidth = w)
            drawLine(c.displayDim, Offset(size.width, 0f), Offset(0f, size.height), strokeWidth = w)
        }
    }
}

/**
 * STEP's controls on the panel's dark screen, under its header (or under
 * the header in its own body, [StepBodyFace]): − and + either side of the
 * strip ([StepStrip]); then KNOB X VEL and KNOB Y LEN (every note on the
 * cursor's step: velocity, and length snapped from a tick to a bar; off on
 * an empty step), BAR's pages under a longer pattern, and NUDGE and CORRECT,
 * at the row's end or (narrower than [StepRowMin]) a row of their own. The
 * rows fade and slide in as [panel] unrolls, one after the other. The knobs
 * hold the finger from its first touch, so nothing under them scrolls or
 * closes the panel.
 */
@Composable
internal fun StepDeck(step: LiveStep, panel: SamplePanel, haptics: Boolean, modifier: Modifier = Modifier) {
    val ui = step.ui
    BoxWithConstraints(modifier.fillMaxSize()) {
        val wide = maxWidth >= StepRowMin
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(StepGap)) {
            Row(
                Modifier.fadeIn { panel.row(false) }.fillMaxWidth().height(StepStripRow),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(StepGap),
            ) {
                StepKey("−", MirrorText.PREV_STEP, haptics, step.onMinus)
                StepStrip(ui, step.onJump, Modifier.weight(1f))
                StepKey("+", MirrorText.NEXT_STEP, haptics, step.onPlus)
            }
            Row(
                Modifier.fadeIn { panel.row(true) }.fillMaxWidth().height(StepKnobRow),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(StepGap),
            ) {
                StepKnobs(step, haptics)
                BarPages(ui, step.onPage, Modifier.weight(1f))
                if (wide) {
                    Column(Modifier.width(StepLatchWidth), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        NudgeLatch(step, Modifier.fillMaxWidth().weight(1f))
                        CorrectLatch(step, Modifier.fillMaxWidth().weight(1f))
                    }
                }
            }
            if (!wide) {
                Row(
                    Modifier.fadeIn { panel.row(true) }.fillMaxWidth().height(StepLatchRow),
                    horizontalArrangement = Arrangement.spacedBy(StepGap),
                ) {
                    NudgeLatch(step, Modifier.weight(1f).fillMaxHeight())
                    CorrectLatch(step, Modifier.weight(1f).fillMaxHeight())
                }
            }
        }
    }
}

/**
 * The STEP panel where the display line can't grow into it (in the top bar,
 * a phone on its side): at the top of the function keys' column
 * ([SampleSlot]), one dark rounded body with its own header ([StepHeader])
 * over the controls ([StepDeck]), as tall as they are (no taller than the
 * column).
 */
@Composable
internal fun StepBodyFace(step: LiveStep, panel: SamplePanel, haptics: Boolean, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    BoxWithConstraints(modifier.fillMaxSize()) {
        val deck = stepDeckHeight(maxWidth - WaveSide * 2)
        Column(Modifier.fillMaxWidth().heightIn(max = maxHeight).clip(RoundedCornerShape(BodyCorner)).background(c.display)) {
            Box(Modifier.fillMaxWidth().height(BodyHeader)) { StepHeader(step, haptics) }
            StepDeck(step, panel, haptics, Modifier.weight(1f, fill = false).height(deck + WaveFoot).padding(start = WaveSide, end = WaveSide, bottom = WaveFoot))
        }
    }
}

/**
 * The strip: one bar of steps at TIMING's interval ([stripRange]), each a
 * cell, a dot on those with notes, the cursor's cell signal orange; a
 * little more room before each beat. A tap on a cell moves the cursor there
 * ([onJump]); every cell takes the touch across its share of the strip, gaps
 * and all. A screen reader hears each as "Step 1.2.1, has notes", the
 * cursor's selected.
 */
@Composable
private fun StepStrip(ui: StepUi, onJump: (Int) -> Unit, modifier: Modifier) {
    val c = LocalArcColors.current
    val range = stripRange(ui)
    // Tighter between the cells of a long bar (1/32, triplets), so even 32 keep a width of their own.
    val gap = if (range.count() > 16) 1.dp else 2.dp
    val cell = lerp(c.display, c.displayDim, CellShade)
    Row(modifier.fillMaxHeight(), verticalAlignment = Alignment.CenterVertically) {
        for (s in range) {
            val on = s == ui.step
            val notes = ui.occupied.getOrElse(s) { false }
            val beat = beatStarts(s, ui.interval)
            Canvas(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { onJump(s) }
                    .semantics {
                        contentDescription = MirrorText.stepCell(MirrorText.stepLabel(s, ui.interval), notes)
                        selected = on
                    },
            ) {
                val left = (gap / 2 + if (beat) BeatGap else 0.dp).toPx()
                val right = (gap / 2).toPx()
                val h = CellHeight.toPx()
                val top = (size.height - h) / 2f
                val w = (size.width - left - right).coerceAtLeast(1f)
                val r = CornerRadius(2.dp.toPx())
                if (on) drawRoundRect(c.signal.copy(alpha = 0.35f), Offset(left - 2.dp.toPx(), top - 2.dp.toPx()), Size(w + 4.dp.toPx(), h + 4.dp.toPx()), CornerRadius(3.dp.toPx()))
                drawRoundRect(if (on) c.signal else cell, Offset(left, top), Size(w, h), r)
                if (notes) drawCircle(if (on) c.onSignal else c.displayInk, radius = minOf(2.dp.toPx(), w / 2f), center = Offset(left + w / 2f, size.height / 2f))
            }
        }
    }
}

/** How far a strip cell (and − and +) is from the display's dark toward its dim ink. */
private const val CellShade = 0.3f

/** A strip cell's height, and the room more before a beat's first. */
private val CellHeight = 22.dp
private val BeatGap = 3.dp

/** − or + beside the strip: a cap a shade off the screen's dark, a tick as it goes down. */
@Composable
private fun StepKey(glyph: String, description: String, haptics: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val tick = if (haptics) LocalHapticFeedback.current else null
    LaunchedEffect(pressed) {
        if (pressed) tick?.performHapticFeedback(HapticFeedbackType.KeyboardTap)
    }
    val face = lerp(c.display, c.displayDim, CellShade)
    Box(
        Modifier
            .size(StepKeyWidth, StepKeyHeight)
            .cap(face, lerp(c.display, Color.Black, 0.6f), RoundedCornerShape(7.dp), capPress(pressed))
            .clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Text(glyph, style = ArcType.word.copy(fontSize = 20.sp, lineHeight = 1.em), color = c.displayInk)
    }
}

/**
 * KNOB X VEL (orange) and KNOB Y LEN (white): every note on the cursor's
 * step, its velocity 1..127 and its length through [STEP_GATES] ("1/16",
 * "3/16", "1 bar"); off (dimmed, "—") on an empty step. A double tap puts
 * back a placed note's own: 127, and one interval. A turn is one UNDO step
 * ([LiveStep.onKnobEnd] as the finger lifts). Their words in the dark
 * theme's inks, to read on the screen in both.
 */
@Composable
private fun StepKnobs(step: LiveStep, haptics: Boolean) {
    val ui = step.ui
    val ko = LocalHwColors.current.ko
    val vel = ui.velocity
    val gate = ui.gate
    CompositionLocalProvider(LocalArcColors provides DarkArcColors) {
        val velWords = vel?.toString() ?: MirrorText.NO_VALUE
        Knob(
            MirrorText.VEL, (vel ?: MAX_VELOCITY).toFloat(), 1f..MAX_VELOCITY.toFloat(), velWords, { step.onVelocity(it.roundToInt()) },
            default = MAX_VELOCITY.toFloat(),
            colors = ko.knobOrange,
            enabled = vel != null,
            haptics = haptics,
            description = MirrorText.knobDescription(MirrorText.VELOCITY, velWords),
            size = StepKnob,
            inline = true,
            compact = true,
            onDone = step.onKnobEnd,
        )
        val lenWords = gate?.let(MirrorText::gateLabel) ?: MirrorText.NO_VALUE
        Knob(
            MirrorText.LEN, gateKnob(gate ?: ui.interval.ticks), 0f..STEP_GATES.lastIndex.toFloat(), lenWords,
            { step.onGate(STEP_GATES[it.roundToInt().coerceIn(0, STEP_GATES.lastIndex)]) },
            default = gateKnob(ui.interval.ticks),
            colors = ko.knobWhite,
            enabled = gate != null,
            haptics = haptics,
            description = MirrorText.knobDescription(MirrorText.NOTE_LENGTH, lenWords),
            size = StepKnob,
            inline = true,
            compact = true,
            onDone = step.onKnobEnd,
        )
    }
}

/**
 * BAR and a page key per bar of a pattern longer than one ([StepUi.bars]),
 * the one the strip shows lit; a tap puts the cursor on that bar's first
 * step. Past what fits, the pages scroll sideways, the one shown kept in
 * sight. Nothing for a one-bar pattern.
 */
@Composable
private fun BarPages(ui: StepUi, onPage: (Int) -> Unit, modifier: Modifier) {
    if (ui.bars <= 1) {
        Spacer(modifier)
        return
    }
    val c = LocalArcColors.current
    val scroll = rememberScrollState()
    val density = LocalDensity.current
    LaunchedEffect(ui.page) {
        with(density) { scroll.animateScrollTo(((ui.page - 1).coerceAtLeast(0) * PageKeyWidth.toPx()).roundToInt()) }
    }
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(MirrorText.BAR.uppercase(), style = viewWordStyle(9.dp, 0.1f), color = c.displayDim, maxLines = 1, softWrap = false, modifier = Modifier.clearAndSetSemantics { })
        Row(Modifier.horizontalScroll(scroll)) {
            for (b in 0 until ui.bars) {
                val on = b == ui.page
                Box(
                    Modifier
                        .size(PageKeyWidth, StepKnobRow)
                        .selectable(selected = on, role = Role.Tab, interactionSource = remember { MutableInteractionSource() }, indication = null) { onPage(b) }
                        .semantics { contentDescription = MirrorText.barPage(b + 1) },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier
                            .size(20.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .then(if (on) Modifier.background(c.displayInk) else Modifier.border(1.dp, c.displayDim, RoundedCornerShape(4.dp))),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            (b + 1).toString(),
                            style = ArcType.tiny.copy(fontSize = 11.sp, lineHeight = 1.em, fontFeatureSettings = "tnum"),
                            color = if (on) c.display else c.displayInk,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/** NUDGE, lit while it waits for a pad or one is picked, and then named with it: "NUDGE · KICK". */
@Composable
private fun NudgeLatch(step: LiveStep, modifier: Modifier) {
    val on = step.ui.nudgePick || step.ui.picked != null
    val word = step.pickedWord.takeIf { step.ui.picked != null }
    StepLatch(MirrorText.nudgeChip(word), on, MirrorText.NUDGE, MirrorText.NUDGE_NOTE, modifier) { step.onNudge(!on) }
}

/** CORRECT, lit while timing correct is on: a pad tapped puts its notes on the grid (and, held while playing, as they pass). */
@Composable
private fun CorrectLatch(step: LiveStep, modifier: Modifier) {
    val on = step.ui.correct
    StepLatch(MirrorText.CORRECT, on, MirrorText.CORRECT, MirrorText.CORRECT_NOTE, modifier) { step.onCorrect(!on) }
}

/**
 * One of the panel's latches, as a chip on the line: a thin dim border
 * while off, filled signal orange while [on]; [word] on it, upper-cased.
 * A switch for screen readers ([description], then what it does, [note]).
 */
@Composable
private fun StepLatch(word: String, on: Boolean, description: String, note: String, modifier: Modifier, onToggle: () -> Unit) {
    val c = LocalArcColors.current
    val shape = RoundedCornerShape(6.dp)
    Box(
        modifier
            .toggleable(value = on, interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Switch) { onToggle() }
            .semantics {
                contentDescription = description
                stateDescription = MirrorText.onOff(on) + ". " + note
            }
            .padding(vertical = 1.dp)
            .then(if (on) Modifier.background(c.signal, shape) else Modifier)
            .border(1.dp, if (on) c.signal else c.displayDim.copy(alpha = 0.5f), shape)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            word.uppercase(),
            style = viewWordStyle(10.dp, 0.08f),
            color = if (on) c.onSignal else c.displayInk,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

/** A note's loudest velocity, as MIDI has it: VEL's top, and a placed note's own. */
private const val MAX_VELOCITY = 127

/** The strip's row (− and + its height), the knobs' row and the latches' row of their own, and the room between rows. */
private val StepStripRow = 40.dp
private val StepKnobRow = 44.dp
private val StepLatchRow = 36.dp
private val StepGap = 6.dp

/** − and + beside the strip. */
private val StepKeyWidth = 40.dp
private val StepKeyHeight = 34.dp

/** The knobs, and NUDGE and CORRECT one over the other at the knobs' row's end. */
private val StepKnob = 28.dp
private val StepLatchWidth = 92.dp

/** A bar's page key's width to touch. */
private val PageKeyWidth = 26.dp

/** From this wide the knobs' row has room for NUDGE and CORRECT at its end. */
internal val StepRowMin = 316.dp
