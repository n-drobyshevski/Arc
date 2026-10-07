package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import dev.arc.ep133.features.PeakMeter
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.SampleInput
import dev.arc.ep133.features.SamplePhase
import dev.arc.ep133.features.SampleSource
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.DisplayLine
import dev.arc.ep133.ui.components.Knob
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.delay
import kotlin.math.floor
import kotlin.math.roundToInt

/*
 * SAMPLE mode on Live (an addition, after the EP-133's own sampler): the
 * display line lit orange with the source, the input's meter and what
 * happens next; the strip of the sampler's controls under it (−/+ for the
 * source, KNOB X the input's level, KNOB Y the threshold, BARS and LATCH);
 * and the pads' lights while the mode is open, empty pads blinking and those
 * with a sound lit, as the K.O. II shows them.
 */

/**
 * SAMPLE mode for Live's page (an addition): its [state] as the controller
 * has it, and the input's [level] (0..1 across −60..0 dBFS) and [clip],
 * both read as the meter draws. The strip's −/+ step the source
 * ([onSource]), STEREO records in stereo or mono ([onStereo]), the knobs set
 * the level ([onGain], dB) and the threshold ([onThreshold], dBFS, null for
 * none), BARS a hands-free take's length ([onBars], null for Free) and LATCH
 * whether a tap records hands-free ([onLatch]).
 *
 * In the mode a pad held records into it: [onPadDown] at the touch's time
 * (unsure on the scrolling page, which [onPadKept] or [onPadCut] settles),
 * [onPadUp] at the lift's. A screen reader's click on a pad latches a
 * hands-free take, or stops it ([onLatchPad]). [still] keeps the lights and
 * the meter from moving (screenshots).
 */
class SampleUi(
    val state: SampleUiState = SampleUiState(),
    val level: () -> Float = { 0f },
    val clip: () -> Boolean = { false },
    val still: Boolean = false,
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
 * waiting for sound), or the count-in or wait for PLAY before one: a tap on
 * SAMPLE stops it. A held take, waiting or recording, isn't.
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

/** How SAMPLE's strip lays its controls out in a given width. */
internal enum class StripLayout {
    /** One row a key tall, the knobs' names and values beside them. */
    LINE,

    /** One row, the source over STEREO, then the knobs, then BARS over LATCH. */
    ROW,

    /** The source, STEREO and LATCH a row of keys; the knobs (their names and values beside them) and BARS under them. */
    TWO_ROWS,
}

/** The strip's layout in [width]. */
internal fun stripLayout(width: Dp): StripLayout = when {
    width >= StripLineWidth -> StripLayout.LINE
    width >= StripRowWidth -> StripLayout.ROW
    else -> StripLayout.TWO_ROWS
}

/** The strip's height in [width], with the USB note under it when the source is [usb]. */
internal fun samplerStripHeight(width: Dp, usb: Boolean): Dp = when (stripLayout(width)) {
    StripLayout.LINE -> StripKeyHeight
    StripLayout.ROW -> StripTier
    StripLayout.TWO_ROWS -> StripKeyHeight * 2 + StripGap
} + if (usb) UsbNoteHeight else 0.dp

/**
 * How much taller SAMPLE's head ([SamplerHead]) is than the display line it
 * stands in for, in a page [roomW] wide: the strip and its gap, less the
 * line where the two share a row ([sideways]). [inBar]: the line is in the
 * top bar.
 */
internal fun samplerHeadExtra(ui: SampleUi, roomW: Dp, inBar: Boolean, sideways: Boolean): Dp {
    val usb = ui.state.input.source == SampleSource.USB
    return when {
        inBar -> samplerStripHeight(roomW, usb) + HeadGap
        sideways && roomW >= SharedRowWidth -> (samplerStripHeight(roomW - SampleLineMin - HeadGap, usb) - LineHeight).coerceAtLeast(0.dp)
        // The strip a row a key tall beside the line, the USB note under both.
        sideways -> if (usb) UsbNoteHeight else 0.dp
        else -> samplerStripHeight(roomW, usb) + HeadGap
    }
}

/** The page's display line, as tall as SAMPLE's line is. */
private val LineHeight = 48.dp

/** Between SAMPLE's line and its strip. */
private val HeadGap = 10.dp

/**
 * On its side and at least this wide, SAMPLE's line and strip share one row,
 * the strip laid out as its width says; narrower (a short window on its
 * side), the line keeps [SampleLineShort] and the strip scrolls beside it.
 */
private val SharedRowWidth = 640.dp

/** SAMPLE's line keeps at least this much of a row it shares with the strip. */
private val SampleLineMin = 280.dp

/** SAMPLE's line in a short window on its side, the strip scrolling beside it. */
private val SampleLineShort = 210.dp

/** At least this wide, the strip is one row a key tall ([StripLayout.LINE]). */
private val StripLineWidth = 620.dp

/** At least this wide, the strip is one row ([StripLayout.ROW]); narrower, two. */
private val StripRowWidth = 340.dp

/** The row ([StripLayout.ROW]) is no wider than a phone's, its knobs kept close on a wide page. */
private val StripRowMax = 520.dp

/** A strip key's height (and the source window's): the least a key takes the touch at here. */
private val StripKeyHeight = 44.dp

/** The gap between the strip's controls, and in the line, where every dp counts. */
private val StripGap = 6.dp
private val StripGapLine = 4.dp

/** The strip's tier of knobs: a name, the knob and its value, as tall as two keys one over the other. */
private val StripTier = StripKeyHeight * 2 + StripGap

/** The knobs' size, in the row and in the line. */
private val StripKnob = 40.dp
private val StripKnobInline = 30.dp

/** − and + are this wide (square, so a thumb finds them); the source window at least this wide, and where it fills a row. */
private val StepKeyWidth = 44.dp
private val SourceWidth = 60.dp
private val SourceWidthFill = 44.dp

/** The smallest type the source window takes where it fills a narrow row. */
private val SourceTypeMin = 11.sp

/** The column of BARS and LATCH in the row (and their width in two rows). */
private val StripModes = 80.dp

/** The USB note under the strip: two lines of small type. */
private val UsbNoteHeight = 36.dp

/** The meter's width on the page and in the top bar, and its height. */
private val MeterWidth = 72.dp
private val MeterWidthCompact = 52.dp
private val MeterHeight = 14.dp

/** The meter's segments. */
private const val METER_SEGMENTS = 16

/** Narrower than this, SAMPLE's line leaves out its SAMPLE tag (the line's colour says it). */
private val LineTagWidth = 420.dp

/** The smallest type SAMPLE's line takes for a long status. */
private val StatusMin = 11.sp

/**
 * SAMPLE's head at the top of Live's page: its line ([SampleLine]) and the
 * strip ([SamplerStrip]) under it. On its side ([sideways]) the two share
 * one row, so the pads keep their height: [SharedRowWidth] wide or more the
 * strip as its width lays it out, narrower a row a key tall that scrolls
 * sideways beside a shorter line (its knobs still take the finger from the
 * first touch, so a drag on one turns it). [inBar], the line is in the top
 * bar ([LivePill]) and only the strip is here.
 */
@Composable
internal fun SamplerHead(ui: SampleUi, inBar: Boolean, sideways: Boolean, haptics: Boolean, still: Boolean) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val roomW = maxWidth
        when {
            inBar -> SamplerStrip(ui, haptics)
            sideways && roomW >= SharedRowWidth -> Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(HeadGap),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SampleLine(ui, Modifier.weight(1f), still = still)
                SamplerStrip(ui, haptics, Modifier.widthIn(max = roomW - SampleLineMin - HeadGap))
            }
            sideways -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(HeadGap), verticalAlignment = Alignment.CenterVertically) {
                    SampleLine(ui, Modifier.width(SampleLineShort), still = still, narrow = true)
                    SamplerStrip(ui, haptics, Modifier.weight(1f).horizontalScroll(rememberScrollState()), note = false)
                }
                if (ui.state.input.source == SampleSource.USB) UsbNote()
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(HeadGap)) {
                SampleLine(ui, still = still)
                SamplerStrip(ui, haptics)
            }
        }
    }
}

/**
 * The display line in SAMPLE mode, lit signal orange as EDIT's is: SAMPLE
 * and the source ("RSP ST"), the input's meter, and what happens next
 * ([sampleStatus]) on one line, its type smaller where it is long; a polite
 * live region at most once a second. [compact]: one bar tall, in the top bar
 * ([LivePill]). [narrow]: beside the strip in a short window, the source left
 * to the strip's window and the meter shorter.
 */
@Composable
internal fun SampleLine(ui: SampleUi, modifier: Modifier = Modifier, compact: Boolean = false, still: Boolean = ui.still, narrow: Boolean = false) {
    val c = LocalArcColors.current
    val s = ui.state
    val ink = c.onSignal
    val status = sampleStatus(s)
    val said = spoken(sampleSpoken(s))
    BoxWithConstraints(modifier) {
        val tag = !compact && maxWidth >= LineTagWidth
        DisplayLine(compact = compact, color = c.signal) {
            // Narrow, nothing here (the strip's window says the source), and no gap for it either.
            if (!narrow) Row(
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
                modifier = Modifier.size(if (compact || narrow) MeterWidthCompact else MeterWidth, MeterHeight),
            )
            // One line, as the display's: a long one ("Disk low: room for 12 s") in smaller type, never a second line.
            val style = if (compact || narrow) ArcType.displaySub else ArcType.displayHead
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
 * The input's meter on SAMPLE's line: [METER_SEGMENTS] segments lit up to
 * [level] (0..1, read as it draws), a tick at the threshold ([mark], the
 * same scale; null for none) and a light at the end that comes on when the
 * input [clip]s. Each frame redraws it, and nothing else ([still]: it is
 * drawn once). A screen reader hears it as the input level, and "Clipping"
 * while the clip light is on.
 */
@Composable
private fun SampleMeter(level: () -> Float, clip: () -> Boolean, mark: Float?, still: Boolean, modifier: Modifier) {
    val c = LocalArcColors.current
    val ink = c.onSignal
    val dark = c.display
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
 * SAMPLE's controls under its line, as the K.O. II's dark keys and knobs
 * with their words printed on them: − and + either side of the source's
 * window (the device's −/+), STEREO, KNOB X LEVEL (orange, the input's gain)
 * and KNOB Y THRESH (black, Off at its left end, then −60 to 0 dB), BARS (a
 * tap steps Free, 1, 2, 4, 8, 16) and LATCH. The USB source adds a line
 * saying it is experimental ([note]; false where the head puts it). Laid out
 * by the width it gets ([stripLayout]; scrolling sideways, a row a key
 * tall). The knobs hold the finger from its first touch, so the page under
 * them never scrolls.
 */
@Composable
internal fun SamplerStrip(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier, note: Boolean = true) {
    BoxWithConstraints(modifier) {
        val layout = stripLayout(maxWidth)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            when (layout) {
                StripLayout.LINE -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(StripGapLine)) {
                    SourceKeys(ui, haptics)
                    StereoKey(ui, haptics)
                    LevelKnob(ui, haptics, inline = true)
                    ThresholdKnob(ui, haptics, inline = true)
                    BarsKey(ui, haptics)
                    LatchKey(ui, haptics)
                }
                StripLayout.ROW -> Row(Modifier.widthIn(max = StripRowMax).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(StripGap)) {
                    Column(Modifier.width(StepKeyWidth * 2 + SourceWidth + StripGap * 2), verticalArrangement = Arrangement.spacedBy(StripGap)) {
                        SourceKeys(ui, haptics, Modifier.fillMaxWidth())
                        StereoKey(ui, haptics, Modifier.fillMaxWidth())
                    }
                    LevelKnob(ui, haptics, Modifier.weight(1f))
                    ThresholdKnob(ui, haptics, Modifier.weight(1f))
                    Modes(ui, haptics)
                }
                // Two rows of keys, as tall together as the row's tier: the knobs beside their names and values.
                StripLayout.TWO_ROWS -> Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(StripGap)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(StripGap)) {
                        // LATCH as wide as its word, so the source window keeps room between − and +.
                        SourceKeys(ui, haptics, Modifier.weight(1f), fill = true)
                        StereoKey(ui, haptics)
                        LatchKey(ui, haptics)
                    }
                    Row(Modifier.fillMaxWidth().height(StripKeyHeight), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(StripGap)) {
                        LevelKnob(ui, haptics, Modifier.weight(1f), inline = true)
                        ThresholdKnob(ui, haptics, Modifier.weight(1f), inline = true)
                        BarsKey(ui, haptics, Modifier.width(StripModes))
                    }
                }
            }
            if (note && ui.state.input.source == SampleSource.USB) UsbNote()
        }
    }
}

/** The line under the strip saying USB sampling is experimental, in two lines of small type. */
@Composable
private fun UsbNote() {
    val c = LocalArcColors.current
    Text(MirrorText.USB_EXPERIMENTAL, style = ArcType.tiny.copy(fontSize = 12.sp, lineHeight = 1.25.em), color = c.graphite, maxLines = 2, overflow = TextOverflow.Ellipsis)
}

/** BARS over LATCH, a column [StripModes] wide. */
@Composable
private fun Modes(ui: SampleUi, haptics: Boolean) {
    Column(Modifier.width(StripModes), verticalArrangement = Arrangement.spacedBy(StripGap)) {
        BarsKey(ui, haptics, Modifier.fillMaxWidth())
        LatchKey(ui, haptics, Modifier.fillMaxWidth())
    }
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
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(StripGap)) {
        StripKey(MirrorText.PREV_SOURCE, haptics, Modifier.width(StepKeyWidth), onClick = { ui.onSource(-1) }) { ink ->
            Text("−", style = ArcType.word.copy(fontSize = 20.sp, lineHeight = 1.em), color = ink)
        }
        Box(
            Modifier
                // Its own width but where it fills (a weight in a row scrolling sideways would leave it none).
                .then(if (fill) Modifier.weight(1f) else Modifier)
                .widthIn(min = if (fill) SourceWidthFill else SourceWidth)
                .height(StripKeyHeight)
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
        StripKey(MirrorText.NEXT_SOURCE, haptics, Modifier.width(StepKeyWidth), onClick = { ui.onSource(1) }) { ink ->
            Text("+", style = ArcType.word.copy(fontSize = 20.sp, lineHeight = 1.em), color = ink)
        }
    }
}

/** STEREO, its light on while the input records in stereo; greyed where the source has only mono (or only stereo). */
@Composable
private fun StereoKey(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier) {
    val s = ui.state
    val stereo = s.input.stereo
    StripKey(
        MirrorText.STEREO, haptics, modifier,
        role = Role.Switch,
        toggled = stereo,
        enabled = SampleInput(s.input.source, !stereo) in s.inputs,
        onClick = { ui.onStereo(!stereo) },
    ) { ink ->
        StripLed(stereo)
        StripWord(MirrorText.STEREO, ink)
    }
}

/** KNOB X, LEVEL: the input's gain, −12 to +30 dB; a double tap puts back the source's own (the mic's +12). */
@Composable
private fun LevelKnob(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier, inline: Boolean = false) {
    val s = ui.state
    val readout = MirrorText.gainReadout(s.gainDb.roundToInt())
    Knob(
        MirrorText.LEVEL, s.gainDb, SAMPLE_GAINS, readout, ui.onGain, modifier,
        default = if (s.input.source == SampleSource.MIC) SAMPLE_GAIN_MIC else 0f,
        colors = LocalHwColors.current.ko.knobOrange,
        haptics = haptics,
        description = MirrorText.knobDescription(MirrorText.LEVEL, readout),
        size = if (inline) StripKnobInline else StripKnob,
        inline = inline,
    )
}

/** KNOB Y, THRESH: Off at its left end (a take starts at the press), then −60 to 0 dB a take waits for. */
@Composable
private fun ThresholdKnob(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier, inline: Boolean = false) {
    val db = ui.state.thresholdDb
    val readout = MirrorText.thresholdReadout(db?.roundToInt())
    Knob(
        MirrorText.THRESHOLD, thresholdKnob(db), THRESHOLD_OFF..0f, readout, { ui.onThreshold(thresholdOfKnob(it)) }, modifier,
        default = THRESHOLD_OFF,
        colors = LocalHwColors.current.ko.knobBlack,
        haptics = haptics,
        description = MirrorText.knobDescription(MirrorText.THRESHOLD_NAME, readout),
        size = if (inline) StripKnobInline else StripKnob,
        inline = inline,
    )
}

/** BARS and its choice ("FREE", "2 BARS"); a tap steps to the next ([nextBars]). */
@Composable
private fun BarsKey(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier) {
    val bars = ui.state.bars
    val choice = MirrorText.barsChoice(bars)
    StripKey(MirrorText.knobDescription(MirrorText.BARS, choice), haptics, modifier, onClick = { ui.onBars(nextBars(bars)) }) { ink ->
        // "2 BARS" says it already; Free says what is free.
        if (bars == null) StripWord(MirrorText.BARS, ink.copy(alpha = 0.65f))
        StripWord(choice, ink)
    }
}

/** LATCH, its light on while a tap on a pad records hands-free (for one hand, or a screen reader). */
@Composable
private fun LatchKey(ui: SampleUi, haptics: Boolean, modifier: Modifier = Modifier) {
    val latch = ui.state.latch
    StripKey(MirrorText.LATCH, haptics, modifier, role = Role.Switch, toggled = latch, onClick = { ui.onLatch(!latch) }) { ink ->
        StripLed(latch)
        StripWord(MirrorText.LATCH, ink)
    }
}

/** A word on a strip key, in the function keys' print. */
@Composable
private fun StripWord(word: String, ink: Color) {
    Text(word.uppercase(), style = viewWordStyle(10.5.dp, 0.08f), color = ink, maxLines = 1, softWrap = false)
}

/** A strip key's LED, lit while [on]. */
@Composable
private fun StripLed(on: Boolean) {
    val c = LocalArcColors.current
    val off = LocalHwColors.current.ledOff
    Canvas(Modifier.size(6.dp)) {
        if (on) drawCircle(c.signal.copy(alpha = 0.35f), radius = size.minDimension * 1.1f)
        drawCircle(if (on) c.signal else off, radius = size.minDimension / 2)
    }
}

/**
 * One of the strip's keys: a dark cap, down while pressed, with [content]
 * on it (handed the cap's ink); a light tick as it goes down ([haptics]). A screen
 * reader hears [description], and [toggled] for a switch ([role]).
 * [enabled] false dims its word and light, the cap staying put as a key with
 * nothing to do does on the EP-133.
 */
@Composable
private fun StripKey(
    description: String,
    haptics: Boolean,
    modifier: Modifier = Modifier,
    role: Role = Role.Button,
    toggled: Boolean? = null,
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
            .height(StripKeyHeight)
            .widthIn(min = StepKeyWidth)
            .cap(hw.darkFace, hw.darkEdge, RoundedCornerShape(8.dp), capPress(pressed && enabled))
            .clickable(interactionSource = source, indication = null, enabled = enabled, role = role, onClick = onClick)
            .semantics {
                contentDescription = description
                toggled?.let {
                    toggleableState = ToggleableState(it)
                    stateDescription = MirrorText.onOff(it)
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

/**
 * A pad's ring in SAMPLE mode: [led]'s, drawn over the cap ([blink] read as it
 * draws). Without [blink] (a still picture) an empty pad's ring is drawn halfway
 * through its blink, so it still reads apart from a pad with a sound.
 */
/** An empty pad's ring in a still picture: between the blink's 1 and 0.15. */
private const val STILL_BLINK = 0.4f

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
