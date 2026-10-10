package dev.arc.ep133.ui.screens

import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
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
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.audio.PressTime
import dev.arc.ep133.controller.SceneUi
import dev.arc.ep133.features.RecState
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.features.TransportPhase
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.DisplayLine
import dev.arc.ep133.ui.components.coachClear
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/*
 * The pattern's RECORD and PLAY on Live's display line (an addition, after
 * the EP-133's own keys; "Line" in the mockup): ● RECORD and ▶ PLAY as one
 * segmented key at the line's start (one rounded border round both cells,
 * a hairline between them), on the page and, icon-only, in the top bar's
 * pill. RECORD shows its dot alone on a phone and its word too only on a
 * wide line (a tablet). The line's other keys group the same way: the
 * scene's S01 and STEP share a second key, ERASE and ↶ a third; CORRECT and
 * TAKE's badge stand alone. Each cell is a button of its own (its touch, its
 * gestures, its place in the ? guide); the group only draws the border, the
 * divider and, clipped to its shape, the cell that is filled.
 * While the pattern runs the line's words give way to its counter ("2.3 / 4",
 * and the grid while recording), a loop hairline along its foot, ERASE and ↶;
 * while it counts in, the beat as a big digit. A tap on RECORD arms,
 * a hold opens the pattern sheet ([PatternSheetContent]); held while playing
 * it records only while held, as on the device. TAKE (once REC) records
 * Live's sound from Live tools; while it runs a small badge on the line says
 * so, and a tap on it stops it. STEP sits beside them while the pattern is
 * stopped and opens the STEP panel ([StepLine], [LiveStep]); while it plays
 * with timing correct on, CORRECT is lit there and its count in the words'
 * place. The scene's S01 cell comes after PLAY and opens the SCENE panel
 * ([SceneLine], [LiveScene]); while the pattern plays the scene reads
 * "S02 · A01 B03→05 C01 D02" in the words' place, the queued group blinking.
 */

/** Bar, beat and bars, the counter's words: a beat changing recomposes the line, a frame doesn't. */
internal data class LineBeat(val bar: Int, val beat: Int, val bars: Int)

/**
 * The pattern's time for a display: where the focus group is, a beat at a
 * time ([beat]), and its [frame], the border while recording and the loop's
 * hairline, drawn a frame at a time ([patternTrack]).
 */
internal class PatternTrack(val beat: State<LineBeat?>, val frame: Modifier)

/**
 * RECORD down and not yet up, shared by RECORD and PLAY: when it went down
 * ([downAt]), whether it went to the transport yet ([sent]: stopped or
 * armed a press waits to be a tap, so a hold can open the sheet instead),
 * and whether the hold opened the sheet ([spent]). PLAY with RECORD down
 * sends the press first, then plays with no count-in, as RECORD + PLAY does.
 */
private class RecordHold {
    var downAt: Long? = null
    var sent = false
    var spent = false

    fun reset() {
        downAt = null
        sent = false
        spent = false
    }
}

/**
 * STEP on Live's display line (an addition): the STEP chip while the
 * pattern is stopped, where the page can show the STEP panel ([opens]; a tap
 * [onOpen]s it), and CORRECT lit while it plays with timing correct on
 * ([correct]; a tap turns it off, [onCorrect]), the notes it has corrected
 * in the words' place meanwhile ([status]).
 */
internal class StepLine(
    val opens: Boolean = false,
    val correct: Boolean = false,
    val status: String? = null,
    val onOpen: () -> Unit = {},
    val onCorrect: (Boolean) -> Unit = {},
    val scene: SceneLine? = null,
)

/**
 * The scene on Live's display line (an addition): its S01 chip while the
 * pattern is stopped (and while it plays with nothing worth saying), and
 * while it plays its readout ([SceneUi.worthSaying]), where the page can show
 * the SCENE panel ([opens]; a tap on either [onOpen]s it). [ui] is the scene
 * as the controller has it.
 */
internal class SceneLine(
    val ui: SceneUi = SceneUi(),
    val opens: Boolean = false,
    val onOpen: () -> Unit = {},
)

/**
 * Live's display line with the pattern's keys: RECORD and PLAY in one key (from
 * [transport]; null for none), then while the pattern is armed, counts in,
 * plays or erases its words ([PatternWords]), else [idle], the line's own;
 * and TAKE's badge while a take records ([take]). [step]: STEP's chip while
 * stopped and CORRECT's while playing ([StepLine]). [compact]: one bar tall,
 * in the top bar ([LivePill]), the keys icon-only. [still]: a picture
 * (screenshots), nothing moving.
 */
@Composable
internal fun PatternLine(
    transport: TransportUi?,
    take: TakeUi?,
    still: Boolean,
    compact: Boolean = false,
    step: StepLine? = null,
    idle: @Composable RowScope.() -> Unit,
) {
    val t = transport
    val reduce = reducedMotion()
    val track = patternTrack(t, still, corner = if (compact) 12.dp else 14.dp, inset = if (compact) 12.dp else 14.dp)
    val beat = track.beat
    val taking = take != null && take.state != RecState.Idle
    // CORRECT lit while the pattern plays with it on; STEP while it is stopped (not erasing), where the page has the panel.
    val correct = t != null && step != null && step.correct && t.phase == TransportPhase.PLAYING
    val stepping = t != null && step != null && step.opens && t.phase == TransportPhase.STOPPED && !t.erase
    // The scene, where the page has its panel: its chip while stopped (not erasing) and while playing with nothing worth
    // saying, its readout while playing with something (CORRECT keeps the line to itself).
    val scene = step?.scene?.takeIf { it.opens }
    val playing = t != null && scene != null && t.phase == TransportPhase.PLAYING && !correct
    val readout = if (playing && scene != null && scene.ui.worthSaying()) scene else null
    val stopped = t != null && scene != null && t.phase == TransportPhase.STOPPED && !t.erase
    BoxWithConstraints {
        // On a wide line (a tablet) ERASE and ↶ fit beside the line's own words too; else only while the pattern runs.
        val wide = maxWidth >= WideLine
        val chipWord = scene?.ui?.label.takeIf { stopped || playing && readout == null }
        val fit = if (t != null && t.hasWords()) lineFit(t, take.takeIf { taking }, compact, maxWidth, correct = correct, scene = chipWord, readout = readout?.ui?.let(::sceneReadout)) else LineFit(recordWord = wide && !compact)
        // While it plays the chip comes last: only where everything else fits with it.
        val sceneChip = scene != null && (stopped || playing && readout == null && fit.scene)
        val stepFit = if (t != null && stepping) stepFit(t, take.takeIf { taking }, compact, maxWidth, wide, scene = chipWord) else StepFit.NONE
        DisplayLine(track.frame, compact = compact) {
            if (t != null) {
                TransportChips(t, beat.value, compact, still || reduce, recordWord = fit.recordWord)
                // The scene and STEP share a key; each shows where it fits, the scene's first.
                SceneStepKeys(scene.takeIf { sceneChip }, step.takeIf { stepFit != StepFit.NONE }, compact, stepWord = stepFit == StepFit.WORD)
                if (t.hasWords()) {
                    EditChips(t, compact, show = fit.edit && t.phase != TransportPhase.COUNT_IN && t.phase != TransportPhase.ARMED)
                    if (correct && step != null) CorrectChip(step, compact)
                    PatternWords(t, beat.value, compact, corrected = step?.status?.takeIf { correct }, readout = readout, steady = still || reduce)
                } else {
                    if (wide) EditChips(t, compact, show = true)
                    idle()
                }
            } else {
                idle()
            }
            if (take != null && taking) TakeBadge(take, compact, still || reduce, word = fit.takeWord)
        }
    }
}

/** From this wide the line keeps ERASE and ↶ while the pattern is stopped, and RECORD its word. */
private val WideLine = 520.dp

/**
 * What fits on the line beside the pattern's words: ERASE and ↶ ([edit]),
 * RECORD's word ([recordWord]; only a wide line has it at all) and TAKE's
 * ([takeWord]), given up in that order where the line is short (a phone,
 * large text), so the counter is never cut; and the scene's cell ([scene])
 * while the pattern plays, there only where all the rest fits with it.
 */
private class LineFit(val edit: Boolean = true, val recordWord: Boolean = true, val takeWord: Boolean = true, val scene: Boolean = false)

/**
 * The line's keys and words measured as they are drawn ([compact]: the top
 * bar's, in less padding): a word's width, a standalone chip's from its glyph
 * and word, a cell's the same in a group's padding, and a group's from its
 * cells (a hairline between them, the border shared, no gap inside).
 */
private class ChipSizes(private val measurer: TextMeasurer, private val density: Density, private val compact: Boolean) {
    private val pad = (if (compact) 7.dp else 8.dp) * 2 + 2.dp
    private val cellPad = (if (compact) CellPadCompact else CellPad) * 2

    fun text(s: String, style: TextStyle): Dp = with(density) { measurer.measure(s, style, maxLines = 1, softWrap = false).size.width.toDp() }

    /** A standalone chip: its glyph (and the gap after it) and its word, in its padding and border; never narrower than its touch. */
    fun chip(glyph: Dp, word: Dp): Dp = maxOf(32.dp, glyph + (if (glyph > 0.dp && word > 0.dp) 6.dp else 0.dp) + word + pad)

    /** A cell of a group: as [chip], in the cell's padding; the border is the group's. */
    fun cell(glyph: Dp, word: Dp): Dp = maxOf(32.dp, glyph + (if (glyph > 0.dp && word > 0.dp) 6.dp else 0.dp) + word + cellPad)

    /** A group of two cells ([first], [second]; 0 for one not shown): their widths and a [GroupDivider] between them if both show; 0 for none. */
    fun group(first: Dp, second: Dp = 0.dp): Dp = first + second + if (first > 0.dp && second > 0.dp) GroupDivider else 0.dp

    /** RECORD and PLAY, RECORD with its [word] or its dot alone. */
    fun transport(word: Boolean): Dp = group(cell(DotWidth, if (word) text(MirrorText.RECORD.uppercase(), ArcType.displaySub) else 0.dp), cell(DotWidth, 0.dp))

    /** The scene's cell, for its [label] (0 for none). */
    fun scene(label: String?): Dp = if (label != null) cell(0.dp, text(label, SceneStyle)) else 0.dp

    /** ERASE and ↶, each where shown. */
    fun edit(erase: Boolean, undo: Boolean): Dp = group(
        if (erase) cell(0.dp, text(MirrorText.ERASE.uppercase(), ArcType.displaySub)) else 0.dp,
        if (undo) cell(UndoWidth, 0.dp) else 0.dp,
    )

    /** STEP's cell, with its word or as its glyph. */
    fun step(word: Boolean): Dp = cell(if (word) 0.dp else StepGlyphWidth, if (word) text(MirrorText.STEP.uppercase(), ArcType.displaySub) else 0.dp)
}

/** Whether [items] (0 for one not shown) fit on a line [width] wide, [padding] inside either end, the line's 10 dp between them. */
private fun lineFits(items: List<Dp>, width: Dp, padding: Dp): Boolean {
    val shown = items.filter { it > 0.dp }
    return padding * 2 + shown.fold(0.dp) { a, b -> a + b } + 10.dp * (shown.size - 1) <= width
}

/**
 * [LineFit] for [t]'s words (and [take]'s badge, while it records; and
 * CORRECT's chip, [correct], which always stays; and the scene's cell,
 * [scene] its word, when it has one; and the scene's readout, [readout] its
 * parts, while the pattern plays, which keeps the room it needs before the
 * keys beside it give way, and shortens itself where they have) on a line
 * [width] wide, [padding] inside either end: the keys and the words measured as they are drawn, the
 * counter at its widest for the pattern's length so it doesn't flip from
 * bar to bar.
 */
@Composable
private fun lineFit(t: TransportUi, take: TakeUi?, compact: Boolean, width: Dp, padding: Dp = if (compact) 12.dp else 14.dp, correct: Boolean = false, scene: String? = null, readout: List<String>? = null): LineFit {
    val sizes = ChipSizes(rememberTextMeasurer(), LocalDensity.current, compact)
    val text = sizes::text
    val chip = sizes::chip
    val numbers = ArcType.displaySub.copy(fontFeatureSettings = "tnum")
    val bars = t.bars.getOrElse(t.focusGroup) { Seq.DEFAULT_BARS }
    val words = when (t.phase) {
        TransportPhase.PLAYING -> text(
            if (t.recording) MirrorText.patternRecording(bars, Tempo.BEATS_PER_BAR, bars, t.timing) else MirrorText.patternPosition(bars, Tempo.BEATS_PER_BAR, bars),
            numbers,
        )
        TransportPhase.COUNT_IN -> 40.dp + 10.dp + text(MirrorText.countInOf(Tempo.BEATS_PER_BAR), numbers)
        // The hints shorten to fit.
        else -> 64.dp
    }
    val takeStyle = ArcType.displaySub.copy(fontSize = 12.sp, fontFeatureSettings = "tnum")
    val recording = take?.state as? RecState.Recording
    fun takeChip(word: Boolean): Dp = when {
        take == null -> 0.dp
        recording != null -> chip(8.dp, text((if (word) MirrorText.takeBadge(recording.seconds.toDouble()) else MirrorText.takeLength(recording.seconds.toDouble())).uppercase(), takeStyle))
        else -> chip(8.dp, if (word) text(MirrorText.TAKE.uppercase(), takeStyle) else 0.dp)
    }
    val editing = t.phase == TransportPhase.PLAYING || t.phase == TransportPhase.STOPPED || t.erase
    val hasErase = editing && (t.erase || t.hasNotes.any { it })
    val edit = sizes.edit(hasErase, editing && t.canUndo)
    val erase = if (t.erase) sizes.edit(true, false) else 0.dp
    // RECORD's word only where the line is wide; a phone has its dot.
    val wordy = !compact && width >= WideLine
    val record = sizes.transport(wordy)
    val recordDot = sizes.transport(false)
    // CORRECT beside the keys while it is lit (it stays: it is what turns timing correct off while playing).
    val correctChip = if (correct) chip(0.dp, text(MirrorText.CORRECT.uppercase(), ArcType.displaySub)) else 0.dp
    val sceneKey = sizes.scene(scene)
    // The readout in full, its parts and the gaps between them.
    val sceneWords = if (readout != null) readout.fold(0.dp) { a, w -> a + text(w, ReadoutStyle) } + ReadoutGap * (readout.size - 1) else 0.dp
    fun fits(items: List<Dp>): Boolean = lineFits(items, width, padding)
    val rest = listOf(correctChip, words, takeChip(true), sceneWords)
    val wordsAndEdit = listOf(record, edit) + rest
    val wordsAndErase = listOf(record, erase) + rest
    val dotAndErase = listOf(recordDot, erase) + rest
    // The cell while it plays comes last: it is there where the line has room left over for it.
    fun roomy(items: List<Dp>): Boolean = fits(items + sceneKey)
    return when {
        fits(wordsAndEdit) -> LineFit(recordWord = wordy, scene = roomy(wordsAndEdit))
        fits(wordsAndErase) -> LineFit(edit = false, recordWord = wordy, scene = roomy(wordsAndErase))
        fits(dotAndErase) -> LineFit(edit = false, recordWord = false, scene = roomy(dotAndErase))
        else -> LineFit(edit = false, recordWord = false, takeWord = false)
    }
}

/** How STEP's cell shows on the stopped line: with its word, as its glyph alone, or not at all. */
private enum class StepFit { WORD, GLYPH, NONE }

/**
 * How STEP's cell fits on the stopped line [width] wide beside RECORD and
 * PLAY, ERASE and ↶ ([wide]: on the line while stopped, and RECORD with its
 * word), the scene's cell ([scene] its word, when it has one, in a key with
 * STEP's) and [take]'s badge while it records: with its word on a wide line
 * while the line's own words keep [IdleRoomy] (the tempo and the hit), else
 * its glyph alone (a phone's line and [compact]: always) while they keep
 * [IdleMin], else not at all.
 */
@Composable
private fun stepFit(t: TransportUi, take: TakeUi?, compact: Boolean, width: Dp, wide: Boolean, padding: Dp = if (compact) 12.dp else 14.dp, scene: String? = null): StepFit {
    val sizes = ChipSizes(rememberTextMeasurer(), LocalDensity.current, compact)
    val chips = listOf(
        sizes.transport(wide && !compact),
        sizes.edit(wide && t.hasNotes.any { it }, wide && t.canUndo),
        take?.let { sizes.chip(8.dp, sizes.text(MirrorText.TAKE.uppercase(), ArcType.displaySub.copy(fontSize = 12.sp, fontFeatureSettings = "tnum"))) } ?: 0.dp,
    )
    val sceneKey = sizes.scene(scene)
    return when {
        !compact && wide && lineFits(chips + sizes.group(sceneKey, sizes.step(word = true)) + IdleRoomy, width, padding) -> StepFit.WORD
        lineFits(chips + sizes.group(sceneKey, sizes.step(word = false)) + IdleMin, width, padding) -> StepFit.GLYPH
        else -> StepFit.NONE
    }
}

/**
 * How STEP's cell fits in the all-groups display's pattern row [width] wide
 * ([stepFit]'s for a row with no words of its own while stopped): after RECORD
 * (its word where [fit] has it) and PLAY, with ERASE and ↶ ([edit], where they
 * show): with its word, else its glyph, else not at all.
 */
@Composable
private fun stepRowFit(t: TransportUi, width: Dp, fit: LineFit, edit: Boolean): StepFit {
    val sizes = ChipSizes(rememberTextMeasurer(), LocalDensity.current, compact = false)
    val chips = listOf(
        sizes.transport(fit.recordWord),
        sizes.edit(edit && (t.erase || t.hasNotes.any { it }), edit && t.canUndo),
    )
    return when {
        lineFits(chips + sizes.step(word = true), width, 0.dp) -> StepFit.WORD
        lineFits(chips + sizes.step(word = false), width, 0.dp) -> StepFit.GLYPH
        else -> StepFit.NONE
    }
}

/** The room the stopped line keeps for its own words beside STEP's cell: with its word, and at least, with its glyph. */
private val IdleRoomy = 140.dp
private val IdleMin = 64.dp

/**
 * [t]'s time on a display whose [corner]s round its frame, the hairline
 * [inset] from either end: the counter's beat, and the frame drawn from the
 * loop's progress as it draws, smooth, or a beat at a time with reduced
 * motion (and in a [still] picture). None without [t].
 */
@Composable
internal fun patternTrack(t: TransportUi?, still: Boolean, corner: Dp, inset: Dp): PatternTrack {
    val c = LocalArcColors.current
    val reduce = reducedMotion()
    val now = patternNow(t?.phase == TransportPhase.PLAYING || t?.phase == TransportPhase.COUNT_IN, still)
    val beat = patternBeat(t, now)
    val position by rememberUpdatedState(t?.position)
    val fraction: () -> Float? = {
        if (reduce || still) {
            beat.value?.let { ((it.bar - 1) * Tempo.BEATS_PER_BAR + it.beat - 1f) / (it.bars * Tempo.BEATS_PER_BAR) }
        } else {
            position?.invoke(now.value)?.fraction
        }
    }
    val frame = if (t == null) {
        Modifier
    } else {
        Modifier.patternFrame(
            recording = t.recording && t.phase == TransportPhase.PLAYING,
            running = t.phase == TransportPhase.PLAYING,
            fraction = fraction,
            corner = corner,
            inset = inset,
            signal = c.signal,
            ink = c.displayInk,
        )
    }
    return PatternTrack(beat, frame)
}

/**
 * The frame time while the pattern runs (counts in or plays), for the
 * counter and the hairline: read as they draw or by a derived beat, so a
 * frame only redraws. [still] (screenshots) keeps it at its first value.
 */
@Composable
private fun patternNow(running: Boolean, still: Boolean): State<Long> {
    val now = remember { mutableLongStateOf(System.nanoTime()) }
    LaunchedEffect(running, still) {
        if (running && !still) while (true) withFrameNanos { now.longValue = System.nanoTime() }
    }
    return now
}

/** Where the focus group is, a beat at a time (null while stopped or armed, or before the clock starts). */
@Composable
private fun patternBeat(t: TransportUi?, now: State<Long>): State<LineBeat?> {
    val ui by rememberUpdatedState(t)
    return remember {
        derivedStateOf {
            val u = ui ?: return@derivedStateOf null
            if (u.phase != TransportPhase.PLAYING && u.phase != TransportPhase.COUNT_IN) return@derivedStateOf null
            u.position(now.value)?.let { LineBeat(it.bar, it.beat, it.bars) }
        }
    }
}

/**
 * The line's frame while the pattern plays: a 1.5 dp signal border inside
 * its [corner]s while [recording], and the loop's hairline 2 dp tall along
 * its foot, [inset] from either end ([fraction] of the way, read as it
 * draws): signal while recording, the display's ink while playing.
 */
private fun Modifier.patternFrame(
    recording: Boolean,
    running: Boolean,
    fraction: () -> Float?,
    corner: Dp,
    inset: Dp,
    signal: Color,
    ink: Color,
): Modifier = drawWithContent {
    drawContent()
    if (recording) {
        val w = 1.5.dp.toPx()
        drawRoundRect(
            signal,
            topLeft = Offset(w / 2, w / 2),
            size = Size(size.width - w, size.height - w),
            cornerRadius = CornerRadius(corner.toPx() - w / 2),
            style = Stroke(w),
        )
    }
    if (!running) return@drawWithContent
    val f = fraction() ?: return@drawWithContent
    val h = 2.dp.toPx()
    val x = inset.toPx()
    val y = size.height - 3.dp.toPx() - h
    val length = size.width - x * 2
    drawRoundRect(ink.copy(alpha = 0.12f), Offset(x, y), Size(length, h), CornerRadius(h / 2))
    drawRoundRect(if (recording) signal else ink, Offset(x, y), Size(length * f.coerceIn(0f, 1f), h), CornerRadius(h / 2))
}

/** RECORD is lit while it records (the pattern plays with it on), and armed while it waits for PLAY or counts a recording in. */
private fun TransportUi.recordLive(): Boolean = recording && phase == TransportPhase.PLAYING
private fun TransportUi.recordArmed(): Boolean = phase == TransportPhase.ARMED || phase == TransportPhase.COUNT_IN && recording

/**
 * ● RECORD and ▶ PLAY as one segmented key ([compact]: their glyphs alone;
 * RECORD's word [recordWord] only where the line has room for it). RECORD:
 * dim while off, its light blinking while armed (and while a recording
 * counts in), its cell filled signal while it records. PLAY: ▶ while
 * stopped, ■ while the pattern runs (a tap stops it). The key's border is
 * signal while RECORD is armed or records, else the display's ink while the
 * pattern runs. [steady] keeps the light from blinking (screenshots, reduced
 * motion).
 */
@Composable
private fun TransportChips(t: TransportUi, beat: LineBeat?, compact: Boolean, steady: Boolean, recordWord: Boolean = true) {
    val c = LocalArcColors.current
    val hold = remember { RecordHold() }
    val running = t.phase == TransportPhase.PLAYING || t.phase == TransportPhase.COUNT_IN
    val border = groupBorder(signal = t.recordLive() || t.recordArmed(), lit = c.displayInk.takeIf { running })
    LineGroup(border) {
        RecordChip(t, hold, compact, steady, word = recordWord && !compact)
        GroupDivide(border)
        PlayChip(t, hold, beat, compact)
    }
}

@Composable
private fun RecordChip(t: TransportUi, hold: RecordHold, compact: Boolean, steady: Boolean, word: Boolean) {
    val c = LocalArcColors.current
    val ui by rememberUpdatedState(t)
    val live = t.recordLive()
    val armed = t.recordArmed()
    val blink = if (armed && !steady) {
        androidx.compose.animation.core.rememberInfiniteTransition(label = "record").animateFloat(
            1f,
            0.15f,
            androidx.compose.animation.core.infiniteRepeatable(
                androidx.compose.animation.core.tween(RECORD_BLINK_MS),
                androidx.compose.animation.core.RepeatMode.Reverse,
            ),
            label = "record",
        )
    } else {
        null
    }
    val gesture = Modifier
        .pointerInput(hold) {
            awaitEachGesture {
                val down = awaitFirstDown()
                down.consume()
                val at = PressTime.of(down.uptimeMillis)
                // Stopped or armed, a hold opens the sheet: the press waits to be a tap. Running, it goes at once
                // (a hold records while held).
                val waits = ui.phase == TransportPhase.STOPPED || ui.phase == TransportPhase.ARMED
                hold.downAt = at
                hold.sent = !waits
                if (!waits) ui.onRecordDown(at)
                var up: PointerInputChange? = null
                var ended = false
                try {
                    if (waits) {
                        ended = withTimeoutOrNull(viewConfiguration.longPressTimeoutMillis) {
                            up = waitForUpOrCancellation()
                            true
                        } ?: false
                        // Held (and PLAY not pressed meanwhile): the sheet, and the press is spent.
                        if (!ended && !hold.sent) {
                            hold.spent = true
                            ui.onSheet()
                        }
                    }
                    if (!ended) up = waitForUpOrCancellation()
                } finally {
                    val upAt = up?.let { PressTime.of(it.uptimeMillis) } ?: System.nanoTime()
                    when {
                        hold.spent -> Unit
                        // A tap; a press taken away before its lift is nothing.
                        !hold.sent -> if (up != null) {
                            ui.onRecordDown(at)
                            ui.onRecordUp(upAt)
                        }
                        else -> ui.onRecordUp(upAt)
                    }
                    hold.reset()
                }
            }
        }
        .semantics(mergeDescendants = true) {
            role = Role.Button
            contentDescription = MirrorText.recordDescription(t.state)
            onClick {
                val now = System.nanoTime()
                ui.onRecordDown(now)
                ui.onRecordUp(now)
                true
            }
            onLongClick(label = MirrorText.RECORD_HOLD) {
                ui.onSheet()
                true
            }
        }
    LineCell(
        gesture.then(if (compact) Modifier.coachClear("live.record") else Modifier.coachMark("live.record", CoachText.RECORD, c.signal, c.onSignal)),
        lit = live || armed,
        filled = live,
        compact = compact,
    ) { ink ->
        Canvas(Modifier.size(10.dp)) {
            drawCircle(
                when {
                    live -> c.onSignal
                    armed -> c.signal.copy(alpha = blink?.value ?: 1f)
                    else -> c.displayDim
                },
            )
        }
        if (word) Text(MirrorText.RECORD.uppercase(), style = ArcType.displaySub, color = ink, maxLines = 1, softWrap = false)
    }
}

/** RECORD's blink while armed, each way. */
private const val RECORD_BLINK_MS = 450

@Composable
private fun PlayChip(t: TransportUi, hold: RecordHold, beat: LineBeat?, compact: Boolean) {
    val ui by rememberUpdatedState(t)
    val running = t.phase == TransportPhase.PLAYING || t.phase == TransportPhase.COUNT_IN
    // With RECORD down (waiting to be a tap), it goes first: RECORD + PLAY starts recording at once.
    val play = {
        val held = hold.downAt
        if (held != null && !hold.sent) {
            hold.sent = true
            ui.onRecordDown(held)
        }
        ui.onPlay(held != null)
    }
    val gesture = Modifier
        .pointerInput(hold) {
            awaitEachGesture {
                awaitFirstDown().consume()
                play()
                waitForUpOrCancellation()
            }
        }
        .semantics(mergeDescendants = true) {
            role = Role.Button
            contentDescription = MirrorText.playDescription(t.state, beat?.bar ?: 1, beat?.bars ?: t.bars.getOrElse(t.focusGroup) { 1 })
            onClick {
                ui.onPlay(false)
                true
            }
        }
        .coachClear("live.play")
    LineCell(gesture, lit = running, filled = false, compact = compact) { ink ->
        Canvas(Modifier.size(10.dp)) {
            if (running) {
                val s = size.width * 0.8f
                drawRect(ink, topLeft = Offset((size.width - s) / 2, (size.height - s) / 2), size = Size(s, s))
            } else {
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
}

/**
 * ERASE (a latch: while on a pad erases its notes) and ↶ (undo) as one
 * segmented key, on the line where they fit ([show]): ERASE while the
 * project has notes, and always while on (so it can go off); ↶ while there is
 * something to undo. With only one of them the key is that one cell. Its
 * border is signal while ERASE is on.
 */
@Composable
private fun EditChips(t: TransportUi, compact: Boolean, show: Boolean) {
    val c = LocalArcColors.current
    val erase = t.erase || show && t.hasNotes.any { it }
    val undo = t.canUndo && show
    if (!erase && !undo) return
    val border = groupBorder(signal = t.erase)
    LineGroup(border) {
        if (erase) {
            LineCell(
                Modifier
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { t.onErase(!t.erase) }
                    .semantics(mergeDescendants = true) {
                        contentDescription = MirrorText.ERASE
                        stateDescription = MirrorText.onOff(t.erase)
                    }
                    .then(if (compact) Modifier.coachClear("live.erase") else Modifier.coachMark("live.erase", CoachText.ERASE, c.signal, c.onSignal)),
                lit = t.erase,
                filled = false,
                compact = compact,
            ) { ink ->
                Text(MirrorText.ERASE.uppercase(), style = ArcType.displaySub, color = ink, maxLines = 1, softWrap = false)
            }
        }
        if (erase && undo) GroupDivide(border)
        if (undo) {
            LineCell(
                Modifier
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = t.onUndo)
                    .semantics(mergeDescendants = true) { contentDescription = MirrorText.UNDO },
                lit = false,
                filled = false,
                compact = compact,
            ) { ink -> UndoGlyph(ink) }
        }
    }
}

/**
 * The scene's cell and STEP's as one segmented key, each where it shows
 * ([scene], [step]; with one the key is that cell, with neither nothing):
 * the scene's brighter, so the key's border is the display's brighter dim
 * with it, the dim border without.
 */
@Composable
private fun SceneStepKeys(scene: SceneLine?, step: StepLine?, compact: Boolean, stepWord: Boolean) {
    if (scene == null && step == null) return
    val c = LocalArcColors.current
    val border = groupBorder(signal = false, lit = c.displayDim.takeIf { scene != null })
    LineGroup(border) {
        if (scene != null) SceneChip(scene, compact)
        if (scene != null && step != null) GroupDivide(border)
        if (step != null) StepChip(step, compact, word = stepWord)
    }
}

/**
 * STEP's cell ([word]: its word, else its glyph), on the stopped line where
 * the page can show the panel: a tap opens the STEP panel over the function
 * keys.
 */
@Composable
private fun StepChip(step: StepLine, compact: Boolean, word: Boolean) {
    val c = LocalArcColors.current
    LineCell(
        Modifier
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = step.onOpen)
            .semantics(mergeDescendants = true) { contentDescription = MirrorText.STEP_NAME }
            .then(if (compact) Modifier.coachClear("live.step") else Modifier.coachMark("live.step", CoachText.STEP, c.signal, c.onSignal)),
        lit = false,
        filled = false,
        compact = compact,
    ) { ink ->
        if (word) Text(MirrorText.STEP.uppercase(), style = ArcType.displaySub, color = ink, maxLines = 1, softWrap = false) else StepGlyph(ink)
    }
}

/** STEP's glyph: three steps of a strip, the middle one the cursor's signal orange. */
@Composable
internal fun StepGlyph(color: Color) {
    val c = LocalArcColors.current
    Canvas(Modifier.size(StepGlyphWidth, 10.dp)) {
        val w = size.width / 3f
        val r = CornerRadius(1.dp.toPx())
        for (i in 0..2) {
            drawRoundRect(if (i == 1) c.signal else color, Offset(i * w + 1.dp.toPx() / 2, 0f), Size(w - 1.dp.toPx(), size.height), r)
        }
    }
}

/** STEP's glyph's width. */
private val StepGlyphWidth = 14.dp

/**
 * The scene's cell ("S01"), on the line where the page can show the SCENE
 * panel: a tap opens it. Its word (and its key's border, [SceneStepKeys]) a
 * shade brighter than the dim cells', as it says something.
 */
@Composable
private fun SceneChip(scene: SceneLine, compact: Boolean) {
    val c = LocalArcColors.current
    LineCell(
        Modifier
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = scene.onOpen)
            .semantics(mergeDescendants = true) { contentDescription = MirrorText.sceneChipName(scene.ui.index, scene.ui.count) }
            .then(if (compact) Modifier.coachClear("live.scene") else Modifier.coachMark("live.scene", CoachText.SCENE, c.signal, c.onSignal)),
        lit = true,
        filled = false,
        compact = compact,
    ) { ink ->
        Text(scene.ui.label, style = SceneStyle, color = ink, maxLines = 1, softWrap = false)
    }
}

/**
 * The scene on the line while the pattern plays, in the words' place, as
 * far as the counter beside it leaves room: "S02 · A01 B03→05 C01 D02" (a
 * group's number waiting for its bar or pattern end after an arrow, blinking
 * unless [steady]), else "S02" alone, else nothing. A tap opens the SCENE
 * panel; a screen reader hears the scene and each change waiting.
 */
@Composable
private fun SceneReadout(scene: SceneLine, steady: Boolean, modifier: Modifier) {
    val c = LocalArcColors.current
    val ui = scene.ui
    val blink = queueBlink(steady)
    val style = ReadoutStyle
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val parts = sceneReadout(ui)
    BoxWithConstraints(
        modifier
            .heightIn(min = 40.dp)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = scene.onOpen)
            .semantics(mergeDescendants = true) { contentDescription = sceneSaid(ui) }
            .coachMark("live.scene", CoachText.SCENE, c.signal, c.onSignal),
        contentAlignment = Alignment.CenterEnd,
    ) {
        fun width(texts: List<String>): Dp = with(density) { texts.sumOf { measurer.measure(it, style, maxLines = 1, softWrap = false).size.width }.toDp() } + ReadoutGap * (texts.size - 1)
        val shown = when {
            width(parts) <= maxWidth -> parts
            width(parts.take(1)) <= maxWidth -> parts.take(1)
            else -> emptyList()
        }
        Row(horizontalArrangement = Arrangement.spacedBy(ReadoutGap), verticalAlignment = Alignment.CenterVertically) {
            shown.forEachIndexed { i, part ->
                val group = i - 2
                val queued = group in 0..3 && ui.groups[group].queued != null
                Text(
                    part,
                    style = style,
                    color = when {
                        i == 0 -> c.displayInk
                        queued -> lerp(c.signal, c.displayInk, 0.35f)
                        i == 1 -> c.displayDim
                        else -> c.displayInk
                    },
                    maxLines = 1,
                    softWrap = false,
                    modifier = if (queued) Modifier.graphicsLayer { alpha = blink.value } else Modifier,
                )
            }
        }
    }
}

/** The scene cell's print. */
private val SceneStyle = ArcType.displaySub.copy(fontFeatureSettings = "tnum")

/** The room between the readout's parts, and the readout's print: a size under the line's words, so the scene fits beside the counter. */
private val ReadoutGap = 5.dp
private val ReadoutStyle = ArcType.displaySub.copy(fontSize = 12.sp, fontFeatureSettings = "tnum")

/**
 * CORRECT, lit on the line while the pattern plays with timing correct on
 * (a pad held corrects its notes as they pass): a tap turns it off.
 */
@Composable
private fun CorrectChip(step: StepLine, compact: Boolean) {
    LineChip(
        Modifier
            .coachClear("live.correct")
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Switch) { step.onCorrect(false) }
            .semantics(mergeDescendants = true) {
                contentDescription = MirrorText.CORRECT
                stateDescription = MirrorText.onOff(true) + ". " + MirrorText.CORRECT_NOTE
            },
        lit = true,
        filled = true,
        compact = compact,
    ) { ink ->
        Text(MirrorText.CORRECT.uppercase(), style = ArcType.displaySub, color = ink, maxLines = 1, softWrap = false)
    }
}

/** ↶, drawn: three quarters of a ring with an arrowhead at its start. */
@Composable
internal fun UndoGlyph(color: Color, size: Dp = 12.dp) {
    Canvas(Modifier.size(size)) {
        val w = this.size.width
        val stroke = w * 0.14f
        val r = w * 0.36f
        drawArc(
            color,
            startAngle = 180f,
            sweepAngle = 250f,
            useCenter = false,
            topLeft = Offset(w / 2 - r, w / 2 - r + w * 0.06f),
            size = Size(r * 2, r * 2),
            style = Stroke(stroke, cap = StrokeCap.Round),
        )
        val tip = Offset(w / 2 - r, w / 2 + w * 0.06f)
        val head = Path().apply {
            moveTo(tip.x - w * 0.2f, tip.y - w * 0.14f)
            lineTo(tip.x, tip.y + w * 0.16f)
            lineTo(tip.x + w * 0.2f, tip.y - w * 0.14f)
            close()
        }
        drawPath(head, color)
    }
}

/**
 * The line's words while the pattern is on: armed, what PLAY will do;
 * counting in, the beat big ("3 / 4"); playing, the counter at the end
 * ("2.3 / 4", the grid too while recording), or in signal orange the notes
 * CORRECT has put on the grid while it is held ([corrected]: "3
 * corrected"); erasing while stopped, what a pad does. Read as one polite
 * live region that changes with the transport only, not on every beat (the
 * count at most once a second).
 */
@Composable
private fun RowScope.PatternWords(t: TransportUi, beat: LineBeat?, compact: Boolean, corrected: String? = null, readout: SceneLine? = null, steady: Boolean = true) {
    val c = LocalArcColors.current
    val count = corrected?.let { spoken(it) }
    val said = MirrorText.transportAnnouncement(t.state) + (if (t.erase) ", " + MirrorText.ERASE_NOTE else "") + (count?.let { ", $it" } ?: "")
    val live = Modifier.clearAndSetSemantics {
        contentDescription = said
        liveRegion = LiveRegionMode.Polite
    }
    // The scene's readout is a button of its own, so the words' live region is the counter alone beside it.
    Row(
        Modifier.weight(1f).then(if (readout == null) live else Modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val numbers = ArcType.displaySub.copy(fontFeatureSettings = "tnum")
        when (t.phase) {
            TransportPhase.ARMED -> Text(
                MirrorText.patternArmed(t.timing),
                style = ArcType.displaySub,
                color = c.displayDim,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1f),
            )
            TransportPhase.COUNT_IN -> {
                Text(
                    (t.countIn ?: 1).toString(),
                    style = ArcType.statFree.copy(fontSize = if (compact) 24.sp else 28.sp, lineHeight = 1.em, fontFeatureSettings = "tnum"),
                    color = c.signal,
                    maxLines = 1,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
                Text(MirrorText.countInOf(Tempo.BEATS_PER_BAR), style = numbers, color = c.displayInk, maxLines = 1)
            }
            TransportPhase.PLAYING -> if (corrected != null) {
                Text(
                    corrected.uppercase(),
                    style = ArcType.displaySub,
                    color = c.signal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.End,
                    modifier = Modifier.weight(1f),
                )
            } else {
                if (readout != null) SceneReadout(readout, steady, Modifier.weight(1f)) else Box(Modifier.weight(1f))
                val b = beat ?: LineBeat(1, 1, t.bars.getOrElse(t.focusGroup) { 1 })
                Text(
                    if (t.recording) MirrorText.patternRecording(b.bar, b.beat, b.bars, t.timing) else MirrorText.patternPosition(b.bar, b.beat, b.bars),
                    style = numbers,
                    color = c.displayInk,
                    maxLines = 1,
                    softWrap = false,
                    modifier = if (readout != null) live else Modifier,
                )
            }
            TransportPhase.STOPPED -> Text(
                MirrorText.ERASE_NOTE,
                style = ArcType.displaySub,
                color = c.displayDim,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/** Whether the pattern has words for the line (armed, counting in, playing, or erasing). */
internal fun TransportUi.hasWords(): Boolean = phase != TransportPhase.STOPPED || erase

/**
 * The pattern's row in the all-groups display ([Display]): RECORD and PLAY,
 * STEP's cell while it is stopped (the panel opens on the group last
 * selected or pressed: [LiveStep]), ERASE and ↶ where they fit, CORRECT while it
 * plays with timing correct on ([step]), and its words while it has some, as
 * on the line ([PatternLine]); [beatState] from the display's [patternTrack].
 * The row is there while stopped too, so the pads don't move as the pattern
 * starts.
 */
@Composable
internal fun PatternRow(t: TransportUi, beatState: State<LineBeat?>, still: Boolean, step: StepLine? = null) {
    BoxWithConstraints {
        // Read here, so a beat recomposes the row, not the whole display.
        val beat = beatState.value
        val correct = step != null && step.correct && t.phase == TransportPhase.PLAYING
        val fit = lineFit(t, null, compact = false, width = maxWidth, padding = 0.dp, correct = correct)
        val stepping = step != null && step.opens && t.phase == TransportPhase.STOPPED && !t.erase
        val edit = fit.edit && t.phase != TransportPhase.COUNT_IN && t.phase != TransportPhase.ARMED
        val stepFit = if (stepping) stepRowFit(t, maxWidth, fit, edit) else StepFit.NONE
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TransportChips(t, beat, compact = false, steady = still || reducedMotion(), recordWord = fit.recordWord)
            SceneStepKeys(scene = null, step.takeIf { stepFit != StepFit.NONE }, compact = false, stepWord = stepFit == StepFit.WORD)
            EditChips(t, compact = false, show = edit)
            if (correct && step != null) CorrectChip(step, compact = false)
            if (t.hasWords()) PatternWords(t, beat, compact = false, corrected = step?.status?.takeIf { correct }) else Box(Modifier.weight(1f))
        }
    }
}

/**
 * A standalone chip on the dark line (CORRECT, TAKE's badge, and the STEP
 * and SCENE panels' own): a thin border, dim while off, [lit] in signal
 * (or [litColor]), the chip [filled] signal while recording; [content] gets
 * its ink. As tall as the line to touch, however small it looks. The line's
 * keys are cells of a [LineGroup] instead ([LineCell]).
 */
@Composable
internal fun LineChip(
    modifier: Modifier,
    lit: Boolean,
    filled: Boolean,
    compact: Boolean,
    litColor: Color? = null,
    content: @Composable RowScope.(ink: Color) -> Unit,
) {
    val c = LocalArcColors.current
    val ink = when {
        filled -> c.onSignal
        lit -> c.displayInk
        else -> c.displayDim
    }
    val shape = RoundedCornerShape(8.dp)
    Box(modifier.heightIn(min = 40.dp).widthIn(min = 32.dp), contentAlignment = Alignment.Center) {
        Row(
            Modifier
                .then(if (filled) Modifier.background(c.signal, shape) else Modifier)
                .border(1.dp, if (filled || lit) litColor ?: c.signal else c.displayDim.copy(alpha = 0.5f), shape)
                .padding(horizontal = if (compact) 7.dp else 8.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) { content(ink) }
    }
}

/** A group's look: 32 dp tall inside the 40 dp touch row, its corners 9 dp, a 1 dp hairline between its cells. */
private val GroupHeight = 32.dp
private val GroupCorner = 9.dp
private val GroupDivider = 1.dp

/** A cell's padding either side of its content, and its glyphs' widths. */
private val CellPad = 10.dp
private val CellPadCompact = 7.dp
private val DotWidth = 10.dp
private val UndoWidth = 12.dp

/**
 * A segmented key's border: [signal] where a cell is lit signal (or filled),
 * else [lit], the ink of the brightest other cell, else the dim border the
 * line's chips have.
 */
@Composable
private fun groupBorder(signal: Boolean, lit: Color? = null): Color {
    val c = LocalArcColors.current
    return when {
        signal -> c.signal
        lit != null -> lit
        else -> c.displayDim.copy(alpha = 0.5f)
    }
}

/**
 * Cells ([LineCell]) in one key on the dark line: a single rounded [border]
 * round them, [GroupDivide]d from each other by a hairline of the same
 * colour. The key draws only itself: its cells keep their own touch, gestures
 * and semantics, and one filled signal (RECORD recording) fills just its cell,
 * clipped to the key's shape on its outer side. [GroupHeight] tall in the
 * middle of the cells' 40 dp touch row.
 */
@Composable
private fun LineGroup(border: Color, content: @Composable RowScope.() -> Unit) {
    Row(
        Modifier.drawWithContent {
            val h = GroupHeight.toPx()
            val top = (size.height - h) / 2
            val r = GroupCorner.toPx()
            val w = 1.dp.toPx()
            clipPath(Path().apply { addRoundRect(RoundRect(0f, top, size.width, top + h, CornerRadius(r))) }) {
                this@drawWithContent.drawContent()
            }
            drawRoundRect(border, Offset(w / 2, top + w / 2), Size(size.width - w, h - w), CornerRadius(r - w / 2), style = Stroke(w))
        },
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/** The hairline between two cells of a [LineGroup], in the group's [border] colour. */
@Composable
private fun GroupDivide(border: Color) {
    Box(Modifier.width(GroupDivider).height(GroupHeight).background(border))
}

/**
 * A key of the line, a cell of a [LineGroup] (which draws its border): at
 * least 40 dp tall and 32 dp wide to touch, its content in 10 dp of padding
 * (7 dp [compact]), [lit] in brighter ink, [filled] signal across the cell
 * with the ink on it; [content] gets its ink.
 */
@Composable
private fun LineCell(
    modifier: Modifier,
    lit: Boolean,
    filled: Boolean,
    compact: Boolean,
    content: @Composable RowScope.(ink: Color) -> Unit,
) {
    val c = LocalArcColors.current
    val ink = when {
        filled -> c.onSignal
        lit -> c.displayInk
        else -> c.displayDim
    }
    Box(
        modifier
            .heightIn(min = 40.dp)
            .widthIn(min = 32.dp)
            .then(if (filled) Modifier.background(c.signal) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier.padding(horizontal = if (compact) CellPadCompact else CellPad),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) { content(ink) }
    }
}

/**
 * TAKE's badge on the line while a take records ("● TAKE 0:12"; armed,
 * waiting for sound, the light blinks): a tap stops it (or calls it off).
 */
@Composable
internal fun TakeBadge(take: TakeUi, compact: Boolean, steady: Boolean, word: Boolean = true) {
    val c = LocalArcColors.current
    val recording = take.state as? RecState.Recording
    val blink = if (recording == null && !steady) {
        androidx.compose.animation.core.rememberInfiniteTransition(label = "take").animateFloat(
            1f,
            0.15f,
            androidx.compose.animation.core.infiniteRepeatable(
                androidx.compose.animation.core.tween(RECORD_BLINK_MS),
                androidx.compose.animation.core.RepeatMode.Reverse,
            ),
            label = "take",
        )
    } else {
        null
    }
    LineChip(
        Modifier
            .coachClear("live.take")
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = take.onTake)
            .semantics(mergeDescendants = true) { contentDescription = MirrorText.takeDescription(take.state) },
        lit = true,
        filled = false,
        compact = compact,
    ) { ink ->
        Canvas(Modifier.size(8.dp)) { drawCircle(c.signal.copy(alpha = blink?.value ?: 1f)) }
        // Short of room, the time alone (or, waiting, the light).
        val label = when {
            recording != null -> if (word) MirrorText.takeBadge(recording.seconds.toDouble()) else MirrorText.takeLength(recording.seconds.toDouble())
            word -> MirrorText.TAKE
            else -> null
        }
        if (label != null) {
            Text(
                label.uppercase(),
                style = ArcType.displaySub.copy(fontSize = 12.sp, fontFeatureSettings = "tnum"),
                color = ink,
                maxLines = 1,
                softWrap = false,
            )
        }
    }
}

/**
 * A light tick on each beat of the count-in ([TransportUi.countIn]), as
 * SAMPLE's count-in ticks ([SampleHaptics]); only where Settings → Haptics
 * is on.
 */
@Composable
internal fun PatternHaptics(t: TransportUi?, haptics: Boolean) {
    val feel = LocalHapticFeedback.current
    val beat = t?.countIn?.takeIf { t.phase == TransportPhase.COUNT_IN }
    LaunchedEffect(beat, haptics) {
        if (haptics && beat != null) feel.performHapticFeedback(HapticFeedbackType.KeyboardTap)
    }
}

/**
 * A pad in ERASE ([dot] non-null): with notes ([dot] true) a small signal
 * dot in its top right corner; without, dimmed, there being nothing to erase.
 */
internal fun Modifier.eraseDot(dot: Boolean?, color: Color): Modifier = when (dot) {
    null -> this
    false -> alpha(0.45f)
    true -> drawWithContent {
        drawContent()
        val r = (size.minDimension * 0.045f).coerceIn(3.dp.toPx(), 5.dp.toPx())
        drawCircle(color, radius = r, center = Offset(size.width - r - 7.dp.toPx(), r + 7.dp.toPx()))
    }
}
