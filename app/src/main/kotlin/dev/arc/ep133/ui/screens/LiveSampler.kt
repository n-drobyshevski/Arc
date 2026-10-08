package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.SAMPLE_TAP_NS
import dev.arc.ep133.controller.SampleUiState
import dev.arc.ep133.data.SAMPLE_BARS
import dev.arc.ep133.data.SAMPLE_GAINS
import dev.arc.ep133.data.SAMPLE_GAIN_MIC
import dev.arc.ep133.features.Peak
import dev.arc.ep133.features.PeakMeter
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.SampleInput
import dev.arc.ep133.features.SamplePhase
import dev.arc.ep133.features.SampleSource
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.CapDx
import dev.arc.ep133.ui.components.CapDy
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.DisplayLine
import dev.arc.ep133.ui.components.Knob
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LightArcColors
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin
import kotlin.math.roundToInt

/*
 * SAMPLE mode on Live (an addition, after the EP-133's own sampler): the
 * SAMPLE card beside the pads card, reached with a swipe ([LiveCards]),
 * with its display (the source, the input's meter, the take's time and its
 * wave), the sampler's controls (−/+ for the source, STEREO, LATCH or STOP,
 * KNOB X the input's level, KNOB Y the threshold, BARS) and the group's
 * pads lit as the K.O. II lights them in the mode, empty pads blinking and
 * those with a sound lit; and, while it is open, the display line lit
 * orange with the source, the meter and what happens next.
 */

/**
 * SAMPLE mode for Live's page (an addition): its [state] as the controller
 * has it, and the input's [level] (0..1 across −60..0 dBFS) and [clip],
 * both read as the meter draws; [lastTake], the last take's waveform, for
 * the display while nothing records. A swipe to the SAMPLE card opens the
 * mode ([onOpen]), one back to the pads (or Back) leaves it ([onClose]);
 * while a sheet is open over Live ([sheetOpen]: the review, say) Back is
 * the sheet's.
 * The card's −/+ step the source ([onSource]), STEREO records in stereo or
 * mono ([onStereo]), the knobs set the level ([onGain], dB) and the
 * threshold ([onThreshold], dBFS, null for none), BARS a hands-free take's
 * length ([onBars], null for Free), LATCH whether a tap records hands-free
 * ([onLatch]), and STOP, in LATCH's place while a hands-free take goes on,
 * stops it ([onStop]).
 *
 * In the mode a pad held records into it: [onPadDown] at the touch's time
 * (unsure on the scrolling page, which [onPadKept] or [onPadCut] settles),
 * [onPadUp] at the lift's. A screen reader's click on a pad latches a
 * hands-free take, or stops it ([onLatchPad]). [still] keeps the lights and
 * the meter from moving, and [turn] catches the cards that far into a turn
 * (0 the pads, 1 SAMPLE; screenshots).
 */
class SampleUi(
    val state: SampleUiState = SampleUiState(),
    val level: () -> Float = { 0f },
    val clip: () -> Boolean = { false },
    val lastTake: List<Peak>? = null,
    val still: Boolean = false,
    val turn: Float? = null,
    val sheetOpen: Boolean = false,
    val onOpen: () -> Unit = {},
    val onClose: () -> Unit = {},
    val onStop: () -> Unit = {},
    val onSource: (step: Int) -> Unit = {},
    val onStereo: (Boolean) -> Unit = {},
    val onGain: (Float) -> Unit = {},
    val onThreshold: (Float?) -> Unit = {},
    val onBars: (Int?) -> Unit = {},
    val onLatch: (Boolean) -> Unit = {},
    val onPadDown: (pad: PhysicalPad, pressedAt: Long, unsure: Boolean) -> Unit = { _, _, _ -> },
    val onPadUp: (pad: PhysicalPad, releasedAt: Long) -> Unit = { _, _ -> },
    val onPadKept: (PhysicalPad) -> Unit = {},
    val onPadCut: (PhysicalPad) -> Unit = {},
    val onLatchPad: (PhysicalPad) -> Unit = {},
)

/**
 * A pad's light in SAMPLE mode: blinking while [EMPTY], lit with a sound on
 * it ([FILLED]), lit up while a take into it [WAITING]s (for sound, the
 * count-in or PLAY) and while it [RECORDING]s. A screen reader hears which.
 */
internal enum class SampleLed { EMPTY, FILLED, WAITING, RECORDING }

/** The pad a take goes into while it waits, counts in or records; null otherwise. */
internal fun SamplePhase.takePad(): PhysicalPad? = when (this) {
    is SamplePhase.Waiting -> pad
    is SamplePhase.WaitingForPlay -> pad
    is SamplePhase.CountIn -> pad
    is SamplePhase.Recording -> pad
    else -> null
}

/**
 * Whether [phase] is a hands-free take going on (latched, recording or
 * waiting for sound), or the count-in or wait for PLAY before one: LATCH
 * reads STOP and stops it. A held take, waiting or recording, isn't.
 */
internal fun handsFreeTake(phase: SamplePhase): Boolean = when (phase) {
    is SamplePhase.Waiting -> phase.latched
    is SamplePhase.WaitingForPlay, is SamplePhase.CountIn -> true
    is SamplePhase.Recording -> phase.latched
    else -> false
}

/** [pad]'s light in [phase]: the take's pad lit up (recording, or waiting to), else [filled] (it has a sound) or empty. */
internal fun sampleLed(pad: PhysicalPad, phase: SamplePhase, filled: Boolean): SampleLed = when {
    phase.takePad() == pad -> if (phase is SamplePhase.Recording) SampleLed.RECORDING else SampleLed.WAITING
    filled -> SampleLed.FILLED
    else -> SampleLed.EMPTY
}

/**
 * The pads in SAMPLE mode, as [MirrorScreen] hands them down: each pad's
 * light ([led]), the empty pads' shared blink ([blink], 0..1, read as they
 * draw; null holds it lit), and a screen reader's click ([onLatch]).
 */
internal class PadSampling(
    val led: (PhysicalPad) -> SampleLed,
    val blink: State<Float>?,
    val onLatch: (PhysicalPad) -> Unit,
)

/**
 * What SAMPLE's line says next: what a pad does (held, or tapped with LATCH
 * on), that the EP-133 has little room, the wait for sound or PLAY, the
 * count-in's beat, the take's time against its longest, or the upload.
 */
internal fun sampleStatus(s: SampleUiState): String = when (val p = s.phase) {
    SamplePhase.Ready -> when {
        s.lowSpace -> MirrorText.diskLow(s.maxSeconds)
        s.latch -> MirrorText.SAMPLE_READY_LATCH
        else -> MirrorText.SAMPLE_READY
    }
    is SamplePhase.Waiting -> MirrorText.SAMPLE_WAITING
    is SamplePhase.WaitingForPlay -> MirrorText.WAITING_FOR_PLAY
    is SamplePhase.CountIn -> MirrorText.countIn(p.beat)
    is SamplePhase.Recording -> MirrorText.sampleTime(p.seconds, p.max)
    is SamplePhase.Uploading -> MirrorText.sampleUploading(p.pad, p.percent)
}

/**
 * [sampleStatus] as a screen reader hears it: while a take records, its pad
 * and REC rather than the time, and while one uploads, its pad without the
 * share sent, so the line isn't read out every second.
 */
internal fun sampleSpoken(s: SampleUiState): String = when (val p = s.phase) {
    is SamplePhase.Recording -> MirrorText.padTitle(p.pad) + ", " + MirrorText.REC
    is SamplePhase.Waiting -> MirrorText.padTitle(p.pad) + ", " + MirrorText.SAMPLE_WAITING
    is SamplePhase.Uploading -> MirrorText.sampleUploading(p.pad)
    else -> sampleStatus(s)
}

/** KNOB Y's leftmost place: no threshold ("Off"), one dB under the lowest. */
internal const val THRESHOLD_OFF = -61f

/** KNOB Y's place for a threshold in dBFS ([db] null: Off). */
internal fun thresholdKnob(db: Float?): Float = db ?: THRESHOLD_OFF

/** The threshold at KNOB Y's place [v]: Off at the left end, else −60..0 dBFS in whole dB. */
internal fun thresholdOfKnob(v: Float): Float? = if (v < THRESHOLD_OFF + 0.5f) null else v.roundToInt().toFloat().coerceIn(-60f, 0f)

/** BARS' next choice from [bars]: Free, 1, 2, 4, 8, 16, then Free again. */
internal fun nextBars(bars: Int?): Int? {
    val choices = listOf<Int?>(null) + SAMPLE_BARS
    // One that isn't a choice counts as Free.
    return choices[(choices.indexOf(bars).coerceAtLeast(0) + 1) % choices.size]
}

/**
 * Whether a take that recorded as [last] and then ended stopped by itself
 * rather than by a hand: its pad still [held] (it hit the limit), its time
 * at the longest a take can be, or a hands-free take of [bars] bars at
 * [bpm] that ran its length.
 */
internal fun autoStopped(last: SamplePhase.Recording, held: Boolean, bars: Int?, bpm: Double): Boolean {
    if (held) return true
    if (last.seconds >= last.max - 1) return true
    if (!last.latched || bars == null || bpm <= 0.0) return false
    val length = floor(bars * Tempo.BEATS_PER_BAR * 60.0 / bpm).toInt()
    return last.seconds >= length - 1
}

/** How the SAMPLE card lays out its controls. */
internal enum class SampleControls {
    /** −/source/+, STEREO and LATCH a row of keys; the knobs (their names and values beside them) and BARS under them. */
    ROWS,

    /**
     * Narrower: −/source/+ and LATCH a row (no STEREO: −/+ step through
     * the stereo inputs too, as the device's do), the knobs and BARS a row.
     */
    NARROW,

    /** Shortest: all of them one row a key tall that scrolls sideways (the knobs still take the finger). */
    LINE,
}

/**
 * How the SAMPLE card shares its height upright ([sampleCardFit]): the
 * display's height (0: none, SAMPLE's line over the card saying it all),
 * the knobs' size, how the controls lie, and whether the card's SAMPLE
 * caption has room under it.
 */
internal data class SampleCardFit(val display: Dp, val knob: Dp, val controls: SampleControls, val caption: Boolean)

/** The card's bare deck of pads [u] wide: [KO_BARE_HIGH] pads high, and the caps' edge. */
private fun deckHeight(u: Dp): Dp = u * KO_BARE_HIGH + CapDy + 2.dp

/** How tall the controls are laid out as [controls], their knobs [knob]. */
private fun controlsHeight(controls: SampleControls, knob: Dp): Dp = when (controls) {
    SampleControls.ROWS, SampleControls.NARROW -> SampleKeyHeight + ControlGap + maxOf(knob, SampleKeyHeight)
    SampleControls.LINE -> SampleKeyHeight
}

/**
 * The upright SAMPLE card in a [height] tall room, its face (inside the
 * padding) [width] wide: two rows of controls ([SampleControls.NARROW]
 * under [ControlsRowsMin]), the knobs as big as the row lets them be, up
 * to [CardKnob]; the display what the pads leave of it once they have
 * [PadsWant] wide pads, from [DisplayMin] to [DisplayMax]. Where the pads
 * would come out under [PadsMin], the knobs come down to a key's height,
 * then the caption goes, then the display (SAMPLE's line over the card
 * still says what it did), then the controls go into one row.
 */
internal fun sampleCardFit(width: Dp, height: Dp): SampleCardFit {
    val narrow = width < ControlsRowsMin
    val rows = if (narrow) SampleControls.NARROW else SampleControls.ROWS
    val bars = if (narrow) BarsNarrow else BarsWidth
    val knobWide = ((width - bars - ControlGap * 2) / 2 - KnobText).coerceIn(KnobInline, CardKnob)
    val knobKey = minOf(knobWide, SampleKeyHeight)
    val tries = listOf(
        SampleCardFit(DisplayMin, knobWide, rows, caption = true),
        SampleCardFit(DisplayMin, knobKey, rows, caption = true),
        SampleCardFit(DisplayMin, knobKey, rows, caption = false),
        SampleCardFit(0.dp, knobKey, rows, caption = false),
        SampleCardFit(0.dp, KnobInline, SampleControls.LINE, caption = false),
    )
    for (t in tries) {
        val rest = sampleFace(height, t.caption) - controlsHeight(t.controls, t.knob) - CardGap
        val display = if (t.display == 0.dp) 0.dp else (rest - CardGap - deckHeight(PadsWant)).coerceIn(DisplayMin, DisplayMax)
        val pads = rest - if (display == 0.dp) 0.dp else display + CardGap
        if (pads >= deckHeight(PadsMin) || t === tries.last()) return t.copy(display = display)
    }
    return tries.last()
}

/** The card's face height in a [height] tall room: less the caption under it ([caption]), the padding and the caps' edge. */
private fun sampleFace(height: Dp, caption: Boolean): Dp = height - (if (caption) CaptionRow else 0.dp) - CardPadding * 2 - CapDy

/** The SAMPLE card's face: its corners, padding, and the gap between its display, controls and pads. */
private val CardCorner = 18.dp
private val CardPadding = 12.dp
private val CardGap = 10.dp

/** The SAMPLE caption under the upright card: its line and the gap over it. */
private val CaptionRow = 24.dp

/** The display's height upright: at least (its line and a line of wave), and at most. */
private val DisplayMin = 80.dp
private val DisplayMax = 140.dp

/** The pads' width the upright display gives way to, and the least the card keeps them at (about a finger's). */
private val PadsWant = 64.dp
private val PadsMin = 40.dp

/** The knobs at their biggest, as on the pad sheet; and the name ("THRESH") and value beside an inline one, with its gap. */
private val CardKnob = 56.dp
private val KnobText = 60.dp

/** BARS in the narrow controls, its choice alone on it ("FREE", "2 BARS"). */
private val BarsNarrow = 68.dp

/** Narrower than this, the controls leave STEREO to −/+ ([SampleControls.NARROW]). */
private val ControlsRowsMin = 308.dp

/** LATCH (and STOP in its place) keeps this width, so the row doesn't shift as it changes. */
private val LatchWidth = 72.dp

/** On its side, the controls' column: at least and at most this wide, and its display's least and most height. */
private val SideColumnMin = 240.dp
private val SideColumnMax = 380.dp
private val SideDisplayMin = 80.dp
private val SideDisplayMax = 140.dp

/** The display's corners, padding and the gap between its line and its wave. */
private val DisplayCorner = 14.dp
private val DisplayPadding = 12.dp

/** The input's level history on the display while recording: how many bars, each this long apart. */
private const val SCOPE_POINTS = 64
private const val SCOPE_STEP_NS = 40_000_000L

/** How long the empty pads' rings stay on, then off, in SAMPLE mode. */
internal const val SAMPLE_BLINK_MS = 450L

/**
 * The SAMPLE card (an addition, after the pocket operator app's pages): the
 * K.O. II's pale face holding the sampler. Upright: a display ([SampleDisplay])
 * over the controls (−/source/+, STEREO, LATCH or STOP, KNOB X LEVEL, KNOB Y
 * THRESH and BARS) over the current group's twelve [pads], with a SAMPLE
 * caption under it where there is room ([sampleCardFit]). On its side
 * ([sideways]): the display and the controls a column on the left (it
 * scrolls in a short window; the knobs keep the finger), the pads on the
 * right. [onClose], the pads card's sliver at its left edge ([PadsPeek]):
 * a tap goes back to the pads. [still] keeps the display from moving
 * (screenshots).
 */
@Composable
internal fun SampleCard(
    ui: SampleUi,
    sideways: Boolean,
    haptics: Boolean,
    still: Boolean,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    pads: @Composable (Modifier) -> Unit,
) {
    BoxWithConstraints(modifier) {
        val fit = if (sideways) null else sampleCardFit(maxWidth - PeekRoom - CardPadding * 2 - CapDx, maxHeight)
        Column {
            Row(Modifier.fillMaxWidth().weight(1f)) {
                PadsPeek(onClose, Modifier.width(PeekWidth).fillMaxHeight())
                Spacer(Modifier.width(PeekGap))
                CardFace(Modifier.weight(1f).fillMaxHeight()) {
                    if (fit != null) {
                        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(CardGap)) {
                            if (fit.display > 0.dp) SampleDisplay(ui, still, Modifier.fillMaxWidth().height(fit.display))
                            SampleControls(ui, haptics, fit.controls, fit.knob)
                            pads(Modifier.fillMaxWidth().weight(1f))
                        }
                    } else {
                        SidewaysFace(ui, haptics, still, pads)
                    }
                }
            }
            if (fit?.caption == true) {
                Caption(MirrorText.SAMPLE_TAG, Modifier.padding(start = PeekRoom, top = CaptionRow - CaptionLine))
            }
        }
    }
}

/** The caption's own line, the rest of [CaptionRow] its gap. */
private val CaptionLine = 17.dp

/**
 * The SAMPLE card on its side: the display and the controls a column on the
 * left, as wide as the pads leave ([SideColumnMin] to [SideColumnMax]; it
 * scrolls when short), the caption under them, the pads on the right. Too
 * short for the display over the controls, the display and caption go
 * (SAMPLE's line, in the top bar or over the card, says it all).
 */
@Composable
private fun SidewaysFace(ui: SampleUi, haptics: Boolean, still: Boolean, pads: @Composable (Modifier) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        // The pads as big as the height lets them be, four across with the group keys; the column the rest.
        val u = (maxHeight - CapDy - 2.dp) / KO_BARE_HIGH
        val deckW = u * (4 * KO_BARE_WIDE - 0.215f) + CapDx + 2.dp
        val column = (maxWidth - CardGap - deckW).coerceIn(SideColumnMin, SideColumnMax)
        val controls = if (column >= ControlsRowsMin) SampleControls.ROWS else SampleControls.NARROW
        val bars = if (controls == SampleControls.NARROW) BarsNarrow else BarsWidth
        val knob = minOf(((column - bars - ControlGap * 2) / 2 - KnobText).coerceAtLeast(KnobInline), SampleKeyHeight)
        val room = maxHeight - controlsHeight(controls, knob) - CardGap * 2 - CaptionLine
        val display = if (room < SideDisplayMin) 0.dp else room.coerceAtMost(SideDisplayMax)
        Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(CardGap)) {
            Column(
                Modifier.width(column).fillMaxHeight().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(CardGap),
            ) {
                if (display > 0.dp) SampleDisplay(ui, still, Modifier.fillMaxWidth().height(display))
                SampleControls(ui, haptics, controls, knob)
                // On the card's pale face in both themes.
                if (display > 0.dp) Caption(MirrorText.SAMPLE_TAG, color = LightArcColors.graphite)
            }
            pads(Modifier.weight(1f).fillMaxHeight())
        }
    }
}

/** The SAMPLE card's face: the K.O. II's pale body, its edge below and to the right, as the pads card's. */
@Composable
private fun CardFace(modifier: Modifier, content: @Composable BoxScope.() -> Unit) {
    val ko = LocalHwColors.current.ko
    Box(
        modifier
            .drawBehind {
                drawRoundRect(ko.edge, topLeft = Offset(CapDx.toPx(), CapDy.toPx()), size = Size(size.width - CapDx.toPx(), size.height - CapDy.toPx()), cornerRadius = CornerRadius(CardCorner.toPx()))
            }
            .padding(end = CapDx, bottom = CapDy)
            .clip(RoundedCornerShape(CardCorner))
            .background(ko.body)
            .padding(CardPadding),
        content = content,
    )
}

/**
 * The SAMPLE card's display, dark as the device's: the source's chip, the
 * input's meter (its threshold's mark and clip light in orange) and the
 * take's time against its longest (or the wait, the count-in, the upload, or
 * "Disk low"); under them the wave ([SampleWave]). A screen reader hears the
 * source and what goes on, once (SAMPLE's line above says it as it changes).
 */
@Composable
private fun SampleDisplay(ui: SampleUi, still: Boolean, modifier: Modifier) {
    val c = LocalArcColors.current
    val s = ui.state
    val status = when {
        s.phase != SamplePhase.Ready -> sampleStatus(s)
        s.lowSpace -> MirrorText.diskLow(s.maxSeconds)
        else -> MirrorText.sampleTime(0, s.maxSeconds)
    }
    Column(
        modifier
            .clip(RoundedCornerShape(DisplayCorner))
            .background(c.display)
            .clearAndSetSemantics { contentDescription = MirrorText.SAMPLE_TAG + ", " + MirrorText.sourceName(s.input.source, s.input.stereo) }
            .padding(DisplayPadding),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                MirrorText.sourceShort(s.input.source, s.input.stereo).uppercase(),
                style = ArcType.displaySub,
                color = c.displayInk,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier
                    .border(1.dp, c.displayDim, RoundedCornerShape(6.dp))
                    .padding(horizontal = 6.dp, vertical = 1.dp),
            )
            SampleMeter(
                ui.level,
                ui.clip,
                mark = s.thresholdDb?.let(PeakMeter::markOf),
                still = still,
                ink = c.displayInk,
                accent = c.signal,
                modifier = Modifier.size(MeterWidth, MeterHeight),
            )
            BasicText(
                status,
                style = ArcType.displaySub.copy(color = c.displayInk, textAlign = TextAlign.End),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                autoSize = TextAutoSize.StepBased(minFontSize = StatusMin, maxFontSize = ArcType.displaySub.fontSize, stepSize = 0.5.sp),
                modifier = Modifier.weight(1f),
            )
        }
        SampleWave(ui, still, Modifier.fillMaxWidth().weight(1f))
    }
}

/**
 * The display's wave: the input's level these last seconds while a take
 * records or waits to (orange once it records), the last take's waveform
 * while nothing does, or before the first take what a pad does.
 */
@Composable
private fun SampleWave(ui: SampleUi, still: Boolean, modifier: Modifier) {
    val c = LocalArcColors.current
    val s = ui.state
    val p = s.phase
    val peaks = ui.lastTake
    when {
        p.takePad() != null -> SampleScope(ui.level, still, if (p is SamplePhase.Recording) c.signal else c.displayDim, modifier)
        peaks != null && peaks.isNotEmpty() -> Canvas(modifier.clearAndSetSemantics { }) {
            val mid = size.height / 2f
            val w = size.width / peaks.size
            val ink = c.displayInk.copy(alpha = 0.8f)
            peaks.forEachIndexed { i, pk ->
                val top = mid - pk.max.coerceIn(-1f, 1f) * mid
                val bottom = mid - pk.min.coerceIn(-1f, 1f) * mid
                drawRect(ink, topLeft = Offset(i * w + w * 0.15f, top), size = Size(w * 0.7f, (bottom - top).coerceAtLeast(1.dp.toPx())))
            }
        }
        else -> Box(modifier, contentAlignment = Alignment.Center) {
            Text(if (s.latch) MirrorText.SAMPLE_READY_LATCH else MirrorText.SAMPLE_READY, style = ArcType.displaySub, color = c.displayDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * The input's level these last seconds, as bars from the middle in [color],
 * the newest on the right: a level read every [SCOPE_STEP_NS] into a small
 * ring as the frames go by, drawn without recomposing. [still] (screenshots)
 * draws one made-up stretch of sound at the level read once.
 */
@Composable
private fun SampleScope(level: () -> Float, still: Boolean, color: Color, modifier: Modifier) {
    val ring = remember(still) {
        FloatArray(SCOPE_POINTS) { i -> if (still) level() * (0.3f + 0.7f * abs(sin(i * 0.37f) * cos(i * 0.11f))) else 0f }
    }
    val head = remember { intArrayOf(0) }
    val frame = remember { mutableLongStateOf(0L) }
    LaunchedEffect(still) {
        if (still) return@LaunchedEffect
        var last = 0L
        while (true) {
            withFrameNanos { t ->
                if (t - last >= SCOPE_STEP_NS) {
                    last = t
                    ring[head[0]] = level().coerceIn(0f, 1f)
                    head[0] = (head[0] + 1) % SCOPE_POINTS
                    frame.longValue = t
                }
            }
        }
    }
    Canvas(modifier.clearAndSetSemantics { }) {
        frame.longValue
        val w = size.width / SCOPE_POINTS
        val mid = size.height / 2f
        for (i in 0 until SCOPE_POINTS) {
            val v = ring[(head[0] + i) % SCOPE_POINTS]
            val h = (v * size.height).coerceAtLeast(1.dp.toPx())
            drawRect(color, topLeft = Offset(i * w + w * 0.2f, mid - h / 2f), size = Size(w * 0.6f, h))
        }
    }
}

/** A control's height (and the source window's): the least a key takes the touch at here. */
private val SampleKeyHeight = 44.dp

/** The gap between the controls. */
private val ControlGap = 6.dp

/** The knobs at their smallest, beside their names and values in a row a key tall. */
private val KnobInline = 30.dp

/** − and + are this wide (square, so a thumb finds them); the source window at least this wide, and where it fills a row. */
private val StepKeyWidth = 44.dp
private val SourceWidth = 60.dp
private val SourceWidthFill = 44.dp

/** The source's window filling a wide row (a tablet's card) stops here, the rest a gap before STEREO. */
private val SourceWidthMax = 128.dp

/** The smallest type the source window takes where it fills a narrow row. */
private val SourceTypeMin = 11.sp

/** BARS' width beside the knobs. */
private val BarsWidth = 80.dp

/** The meter's width on the line and the display, in the top bar, and its height. */
private val MeterWidth = 72.dp
private val MeterWidthCompact = 52.dp
private val MeterHeight = 14.dp

/** The meter's segments. */
private const val METER_SEGMENTS = 16

/** Narrower than this, SAMPLE's line leaves out its SAMPLE tag (the line's colour says it). */
private val LineTagWidth = 420.dp

/** The smallest type SAMPLE's line (and the display's) takes for a long status. */
private val StatusMin = 11.sp


/**
 * The display line while the SAMPLE card is open, lit signal orange as
 * EDIT's is: SAMPLE and the source ("RSP ST"), the input's meter, and what
 * happens next ([sampleStatus]) on one line, its type smaller where it is
 * long; a polite live region at most once a second. [compact]: one bar
 * tall, in the top bar ([LivePill]).
 */
@Composable
internal fun SampleLine(ui: SampleUi, modifier: Modifier = Modifier, compact: Boolean = false, still: Boolean = ui.still) {
    val c = LocalArcColors.current
    val s = ui.state
    val ink = c.onSignal
    val status = sampleStatus(s)
    val said = spoken(sampleSpoken(s))
    BoxWithConstraints(modifier) {
        val tag = !compact && maxWidth >= LineTagWidth
        DisplayLine(compact = compact, color = c.signal) {
            Row(
                Modifier.clearAndSetSemantics { contentDescription = MirrorText.SAMPLE_TAG + ", " + MirrorText.sourceName(s.input.source, s.input.stereo) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (tag) Text(MirrorText.SAMPLE_TAG.uppercase(), style = ArcType.displaySub, color = ink.copy(alpha = 0.8f), maxLines = 1)
                Text(
                    MirrorText.sourceShort(s.input.source, s.input.stereo).uppercase(),
                    style = ArcType.displaySub,
                    color = ink,
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier
                        .border(1.dp, ink.copy(alpha = 0.6f), RoundedCornerShape(6.dp))
                        .padding(horizontal = 6.dp, vertical = 1.dp),
                )
            }
            SampleMeter(
                ui.level,
                ui.clip,
                mark = s.thresholdDb?.let(PeakMeter::markOf),
                still = still,
                ink = ink,
                accent = c.display,
                modifier = Modifier.size(if (compact) MeterWidthCompact else MeterWidth, MeterHeight),
            )
            // One line, as the display's: a long one ("Disk low: room for 12 s") in smaller type, never a second line.
            val style = if (compact) ArcType.displaySub else ArcType.displayHead
            BasicText(
                status,
                style = style.copy(color = ink, textAlign = TextAlign.End),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                autoSize = TextAutoSize.StepBased(minFontSize = StatusMin, maxFontSize = style.fontSize, stepSize = 0.5.sp),
                modifier = Modifier.weight(1f).clearAndSetSemantics {
                    contentDescription = said
                    liveRegion = LiveRegionMode.Polite
                },
            )
        }
    }
}

/**
 * The input's meter, on SAMPLE's line and the card's display: [METER_SEGMENTS]
 * segments in [ink] lit up to [level] (0..1, read as it draws), a tick in
 * [accent] at the threshold ([mark], the same scale; null for none) and a
 * light at the end that comes on in [accent] when the input [clip]s. Each
 * frame redraws it, and nothing else ([still]: it is drawn once). A screen
 * reader hears it as the input level, and "Clipping" while the clip light
 * is on.
 */
@Composable
private fun SampleMeter(level: () -> Float, clip: () -> Boolean, mark: Float?, still: Boolean, ink: Color, accent: Color, modifier: Modifier) {
    val dark = accent
    // A frame's tick, read only in the draw below, so the meter redraws without recomposing.
    val frame = remember { mutableLongStateOf(0L) }
    // The clip light for screen readers: written each frame, so only a change recomposes.
    val clipping = remember { mutableStateOf(clip()) }
    LaunchedEffect(still) {
        if (!still) {
            while (true) {
                withFrameNanos {
                    frame.longValue = it
                    clipping.value = clip()
                }
            }
        }
    }
    val clipped = clipping.value
    Canvas(
        modifier.clearAndSetSemantics {
            contentDescription = MirrorText.INPUT_LEVEL
            if (clipped) stateDescription = MirrorText.CLIPPING
        },
    ) {
        frame.longValue
        val v = level().coerceIn(0f, 1f)
        val gap = 2.dp.toPx()
        val light = size.height * 0.55f
        val w = size.width - light - gap * 2
        val seg = (w - gap * (METER_SEGMENTS - 1)) / METER_SEGMENTS
        val lit = floor(v * METER_SEGMENTS + 0.5f).toInt()
        val r = CornerRadius(1.5.dp.toPx())
        for (i in 0 until METER_SEGMENTS) {
            drawRoundRect(
                if (i < lit) ink else ink.copy(alpha = 0.3f),
                topLeft = Offset(i * (seg + gap), 0f),
                size = Size(seg, size.height),
                cornerRadius = r,
            )
        }
        if (mark != null) {
            val x = (mark.coerceIn(0f, 1f) * w).coerceIn(1.dp.toPx(), w - 1.dp.toPx())
            drawLine(dark, Offset(x, -2.dp.toPx()), Offset(x, size.height + 2.dp.toPx()), strokeWidth = 2.dp.toPx())
        }
        drawCircle(
            if (clip()) dark else ink.copy(alpha = 0.3f),
            radius = light / 2,
            center = Offset(size.width - light / 2, size.height / 2),
        )
    }
}

/**
 * The SAMPLE card's controls, as the K.O. II's dark keys and knobs on its
 * face: − and + either side of the source's window (the device's −/+),
 * STEREO, LATCH (STOP while a hands-free take goes on), KNOB X LEVEL
 * (orange, the input's gain), KNOB Y THRESH (black, Off at its left end,
 * then −60 to 0 dB) [knob] big, and BARS (a tap steps Free, 1, 2, 4, 8, 16),
 * laid out as [layout] says. The USB source adds a line saying it is
 * experimental. The knobs hold the finger from its first touch, so nothing
 * under them scrolls or turns the card.
 */
@Composable
private fun SampleControls(ui: SampleUi, haptics: Boolean, layout: SampleControls, knob: Dp) {
    // The card's face is the K.O. II's pale body in both themes: the knobs' words and the USB note in
    // the light theme's inks, so they read on it in the dark one too.
    CompositionLocalProvider(LocalArcColors provides LightArcColors) { ControlsOnFace(ui, haptics, layout, knob) }
}

/** [SampleControls], in the inks of the card's face. */
@Composable
private fun ControlsOnFace(ui: SampleUi, haptics: Boolean, layout: SampleControls, knob: Dp) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ControlGap)) {
        when (layout) {
            SampleControls.ROWS -> {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
                    SourceKeys(ui, haptics, Modifier.weight(1f), fill = true)
                    StereoKey(ui, haptics)
                    LatchKey(ui, haptics, Modifier.width(LatchWidth))
                }
                KnobRow(ui, haptics, knob)
            }
            SampleControls.NARROW -> {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
                    SourceKeys(ui, haptics, Modifier.weight(1f), fill = true)
                    LatchKey(ui, haptics, Modifier.width(BarsNarrow))
                }
                KnobRow(ui, haptics, knob, narrow = true)
            }
            SampleControls.LINE -> Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(ControlGap),
            ) {
                SourceKeys(ui, haptics)
                StereoKey(ui, haptics)
                LatchKey(ui, haptics, Modifier.width(LatchWidth))
                LevelKnob(ui, haptics, inline = true, size = KnobInline)
                ThresholdKnob(ui, haptics, inline = true, size = KnobInline)
                BarsKey(ui, haptics, Modifier.width(BarsWidth))
            }
        }
        if (ui.state.input.source == SampleSource.USB) UsbNote()
    }
}

/** KNOB X and KNOB Y, [knob] big, their names and values beside them, then BARS ([narrow]: its choice alone). */
@Composable
private fun KnobRow(ui: SampleUi, haptics: Boolean, knob: Dp, narrow: Boolean = false) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = SampleKeyHeight),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ControlGap),
    ) {
        LevelKnob(ui, haptics, Modifier.weight(1f), inline = true, size = knob)
        ThresholdKnob(ui, haptics, Modifier.weight(1f), inline = true, size = knob)
        BarsKey(ui, haptics, Modifier.width(if (narrow) BarsNarrow else BarsWidth), short = narrow)
    }
}

/** The line under the SAMPLE card's controls saying USB sampling is experimental, in two lines of small type. */
@Composable
private fun UsbNote() {
    val c = LocalArcColors.current
    Text(MirrorText.USB_EXPERIMENTAL, style = ArcType.tiny.copy(fontSize = 12.sp, lineHeight = 1.25.em), color = c.graphite, maxLines = 2, overflow = TextOverflow.Ellipsis)
}

/**
 * − and + either side of the source's window: the input [step] places on
 * ([SampleUi.onSource]); the window says it ("RSP ST") and a screen reader
 * hears it spelt out as it changes. [fill]: the window takes the width
 * [modifier] gives, rather than its own.
 */
@Composable
private fun SourceKeys(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier, fill: Boolean = false) {
    val c = LocalArcColors.current
    val input = ui.state.input
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ControlGap)) {
        SampleKey(MirrorText.PREV_SOURCE, haptics, Modifier.width(StepKeyWidth), onClick = { ui.onSource(-1) }) { ink ->
            Text("−", style = ArcType.word.copy(fontSize = 20.sp, lineHeight = 1.em), color = ink)
        }
        Box(
            Modifier
                // Its own width but where it fills (a weight in a row scrolling sideways would leave it none),
                // and then no wider than SourceWidthMax: the rest of a wide row is a gap after +.
                .then(
                    if (fill) {
                        Modifier.weight(1f, fill = false).widthIn(min = SourceWidthFill, max = SourceWidthMax).fillMaxWidth()
                    } else {
                        Modifier.widthIn(min = SourceWidth)
                    },
                )
                .height(SampleKeyHeight)
                .clip(RoundedCornerShape(6.dp))
                .background(c.display)
                .clearAndSetSemantics {
                    contentDescription = MirrorText.sourceName(input.source, input.stereo)
                    liveRegion = LiveRegionMode.Polite
                }
                .padding(horizontal = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            // Filling a narrow row, smaller type where "RSP ST" would not fit.
            BasicText(
                MirrorText.sourceShort(input.source, input.stereo).uppercase(),
                style = ArcType.displaySub.copy(color = c.displayInk),
                maxLines = 1,
                softWrap = false,
                autoSize = if (fill) TextAutoSize.StepBased(minFontSize = SourceTypeMin, maxFontSize = ArcType.displaySub.fontSize, stepSize = 0.5.sp) else null,
            )
        }
        SampleKey(MirrorText.NEXT_SOURCE, haptics, Modifier.width(StepKeyWidth), onClick = { ui.onSource(1) }) { ink ->
            Text("+", style = ArcType.word.copy(fontSize = 20.sp, lineHeight = 1.em), color = ink)
        }
    }
}

/** STEREO, its light on while the input records in stereo; greyed where the source has only mono (or only stereo). */
@Composable
private fun StereoKey(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier) {
    val s = ui.state
    val stereo = s.input.stereo
    SampleKey(
        MirrorText.STEREO, haptics, modifier,
        role = Role.Switch,
        toggled = stereo,
        enabled = SampleInput(s.input.source, !stereo) in s.inputs,
        onClick = { ui.onStereo(!stereo) },
    ) { ink ->
        SampleKeyLed(stereo)
        SampleKeyWord(MirrorText.STEREO, ink)
    }
}

/** KNOB X, LEVEL, [size] big: the input's gain, −12 to +30 dB; a double tap puts back the source's own (the mic's +12). */
@Composable
private fun LevelKnob(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier, inline: Boolean = false, size: Dp = KnobInline) {
    val s = ui.state
    val readout = MirrorText.gainReadout(s.gainDb.roundToInt())
    Knob(
        MirrorText.LEVEL, s.gainDb, SAMPLE_GAINS, readout, ui.onGain, modifier,
        default = if (s.input.source == SampleSource.MIC) SAMPLE_GAIN_MIC else 0f,
        colors = LocalHwColors.current.ko.knobOrange,
        haptics = haptics,
        description = MirrorText.knobDescription(MirrorText.LEVEL, readout),
        size = size,
        inline = inline,
    )
}

/** KNOB Y, THRESH, [size] big: Off at its left end (a take starts at the press), then −60 to 0 dB a take waits for. */
@Composable
private fun ThresholdKnob(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier, inline: Boolean = false, size: Dp = KnobInline) {
    val db = ui.state.thresholdDb
    val readout = MirrorText.thresholdReadout(db?.roundToInt())
    Knob(
        MirrorText.THRESHOLD, thresholdKnob(db), THRESHOLD_OFF..0f, readout, { ui.onThreshold(thresholdOfKnob(it)) }, modifier,
        default = THRESHOLD_OFF,
        colors = LocalHwColors.current.ko.knobBlack,
        haptics = haptics,
        description = MirrorText.knobDescription(MirrorText.THRESHOLD_NAME, readout),
        size = size,
        inline = inline,
    )
}

/** BARS and its choice ("FREE", "2 BARS"; [short]: the choice alone); a tap steps to the next ([nextBars]). */
@Composable
private fun BarsKey(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier, short: Boolean = false) {
    val bars = ui.state.bars
    val choice = MirrorText.barsChoice(bars)
    SampleKey(MirrorText.knobDescription(MirrorText.BARS, choice), haptics, modifier, onClick = { ui.onBars(nextBars(bars)) }) { ink ->
        // "2 BARS" says it already; Free says what is free.
        if (bars == null && !short) SampleKeyWord(MirrorText.BARS, ink.copy(alpha = 0.65f))
        SampleKeyWord(choice, ink)
    }
}

/**
 * LATCH, its light on while a tap on a pad records hands-free (for one hand,
 * or a screen reader); while a hands-free take goes on, or counts in or
 * waits for one ([handsFreeTake]), it reads STOP, lit, and stops it.
 */
@Composable
private fun LatchKey(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier) {
    if (handsFreeTake(ui.state.phase)) {
        SampleKey(MirrorText.STOP_RECORDING, haptics, modifier, onClick = ui.onStop) { ink ->
            SampleKeyLed(true)
            SampleKeyWord(FeatureText.STOP, ink)
        }
        return
    }
    val latch = ui.state.latch
    SampleKey(MirrorText.LATCH, haptics, modifier, role = Role.Switch, toggled = latch, note = MirrorText.LATCH_NOTE.takeIf { latch }, onClick = { ui.onLatch(!latch) }) { ink ->
        SampleKeyLed(latch)
        SampleKeyWord(MirrorText.LATCH, ink)
    }
}

/** A word on one of the SAMPLE card's keys, in the function keys' print. */
@Composable
private fun SampleKeyWord(word: String, ink: Color) {
    Text(word.uppercase(), style = viewWordStyle(10.5.dp, 0.08f), color = ink, maxLines = 1, softWrap = false)
}

/** A SAMPLE card key's LED, lit while [on]. */
@Composable
private fun SampleKeyLed(on: Boolean) {
    val c = LocalArcColors.current
    val off = LocalHwColors.current.ledOff
    Canvas(Modifier.size(6.dp)) {
        if (on) drawCircle(c.signal.copy(alpha = 0.35f), radius = size.minDimension * 1.1f)
        drawCircle(if (on) c.signal else off, radius = size.minDimension / 2)
    }
}

/**
 * One of the SAMPLE card's keys: a dark cap, down while pressed, with [content]
 * on it (handed the cap's ink); a light tick as it goes down ([haptics]). A screen
 * reader hears [description], and [toggled] for a switch ([role]), with
 * [note] after its state where given (what LATCH on does).
 * [enabled] false dims its word and light, the cap staying put as a key with
 * nothing to do does on the EP-133.
 */
@Composable
private fun SampleKey(
    description: String,
    haptics: Boolean,
    modifier: Modifier = Modifier,
    role: Role = Role.Button,
    toggled: Boolean? = null,
    note: String? = null,
    enabled: Boolean = true,
    onClick: () -> Unit,
    content: @Composable RowScope.(ink: Color) -> Unit,
) {
    val hw = LocalHwColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val tick = if (haptics) LocalHapticFeedback.current else null
    LaunchedEffect(pressed) {
        if (pressed) tick?.performHapticFeedback(HapticFeedbackType.KeyboardTap)
    }
    Box(
        modifier
            .height(SampleKeyHeight)
            .widthIn(min = StepKeyWidth)
            .cap(hw.darkFace, hw.darkEdge, RoundedCornerShape(8.dp), capPress(pressed && enabled))
            .clickable(interactionSource = source, indication = null, enabled = enabled, role = role, onClick = onClick)
            .semantics {
                contentDescription = description
                toggled?.let {
                    toggleableState = ToggleableState(it)
                    stateDescription = note?.let { n -> "${MirrorText.onOff(it)}. $n" } ?: MirrorText.onOff(it)
                }
            }
            .padding(horizontal = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier.clearAndSetSemantics { },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) { content(if (enabled) hw.darkInk else hw.darkDim) }
    }
}

/**
 * SAMPLE's haptics on Live's page ([haptics]: Settings → Haptics): a tick on
 * each count-in beat, a long press as a take starts recording and as one
 * stops by itself ([autoStopped]; [held] says whether a pad's finger is
 * still down, [bpm] the tempo its bars run at). A held take's long press
 * waits until it has lasted past a tap ([SAMPLE_TAP_NS]) with its pad still
 * held, so a tap that only plays the pad (or a scroll that starts on one)
 * gets the key's tick alone; a hands-free take's comes at once.
 */
@Composable
internal fun SampleHaptics(state: SampleUiState, haptics: Boolean, held: (PhysicalPad) -> Boolean, bpm: Double) {
    val feel = LocalHapticFeedback.current
    val last = remember { arrayOf<SamplePhase>(SamplePhase.Ready) }
    val phase = state.phase
    val heldNow by rememberUpdatedState(held)
    LaunchedEffect(phase) {
        val before = last[0]
        last[0] = phase
        if (!haptics) return@LaunchedEffect
        when {
            phase is SamplePhase.CountIn && before != phase -> feel.performHapticFeedback(HapticFeedbackType.KeyboardTap)
            before is SamplePhase.Recording && phase !is SamplePhase.Recording && autoStopped(before, heldNow(before.pad), state.bars, bpm) ->
                feel.performHapticFeedback(HapticFeedbackType.LongPress)
        }
    }
    // The take recording, by its pad and whether it is hands-free: its seconds ticking on don't start it again.
    val take = (phase as? SamplePhase.Recording)?.let { it.pad to it.latched }
    LaunchedEffect(take, haptics) {
        val (pad, latched) = take ?: return@LaunchedEffect
        if (!haptics) return@LaunchedEffect
        if (!latched) {
            // Thrown away as a tap or a scroll meanwhile, the take ends and this with it.
            delay(SAMPLE_TAP_NS / 1_000_000L)
            if (!heldNow(pad)) return@LaunchedEffect
        }
        feel.performHapticFeedback(HapticFeedbackType.LongPress)
    }
}

/** An empty pad's ring in a still picture: between the blink's 1 and 0.15. */
private const val STILL_BLINK = 0.4f

/**
 * A pad's ring in SAMPLE mode: [led]'s, drawn over the cap ([blink] read as it
 * draws). Without [blink] (a still picture) an empty pad's ring is drawn halfway
 * through its blink, so it still reads apart from a pad with a sound.
 */
internal fun Modifier.sampleRing(led: SampleLed?, blink: State<Float>?, color: Color, shape: androidx.compose.ui.graphics.Shape): Modifier =
    if (led == null || led == SampleLed.RECORDING || led == SampleLed.WAITING) {
        this
    } else {
        drawWithContent {
            drawContent()
            val a = if (led == SampleLed.EMPTY) blink?.value ?: STILL_BLINK else 1f
            // Twice the ring's width: the cap's clip keeps the inner half.
            drawOutline(shape.createOutline(size, layoutDirection, this), color, alpha = a, style = androidx.compose.ui.graphics.drawscope.Stroke(4.dp.toPx()))
        }
    }
