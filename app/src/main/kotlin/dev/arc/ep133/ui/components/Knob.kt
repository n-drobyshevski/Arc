package dev.arc.ep133.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/** How far a knob turns: from 135° left of straight up to 135° right, as the EP-133's do. */
private const val SWEEP = 270f

/** A drag across this much turns a knob through its whole range. */
private val FULL_TURN = 220.dp

/** Slower than this (dp per millisecond), a drag turns by [fineStep] instead of [step]. */
private const val FINE_SPEED = 0.12f

/**
 * A knob drawn as the K.O. II's (an addition): a skirt and a raised cap in
 * one of the device's knob colours ([colors], skirt, skirt edge, cap, cap
 * edge, as [KoColors] has them), a mark on the cap where it points, and the
 * part of the range turned through lit in signal orange around it (from the
 * middle when [bipolar], as pan and pitch are). Its [label] is printed above
 * and its value ([readout]) below.
 *
 * A drag up or to the right turns it up, [FULL_TURN] for the whole range:
 * by [step] at a normal speed, by [fineStep] when slow, so a value can be set
 * exactly. A double tap puts it back to [default]. [onChange] hears each new
 * value, [onDone] the finger lifting. With [haptics], each step ticks.
 * Screen readers hear it as a range they can set ([description], [readout]).
 * [enabled] false dims it and stops it turning.
 */
@Composable
fun Knob(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    readout: String,
    onChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    default: Float = range.start,
    step: Float = 1f,
    fineStep: Float = step,
    bipolar: Boolean = false,
    colors: List<Color> = LocalHwColors.current.ko.knobBlack,
    enabled: Boolean = true,
    haptics: Boolean = false,
    description: String = label,
    size: Dp = 56.dp,
    onDone: () -> Unit = {},
) {
    val c = LocalArcColors.current
    val tick = if (haptics) LocalHapticFeedback.current else null
    val current by rememberUpdatedState(value)
    val change by rememberUpdatedState(onChange)
    val done by rememberUpdatedState(onDone)
    val span = (range.endInclusive - range.start).coerceAtLeast(Float.MIN_VALUE)
    fun snap(v: Float, by: Float): Float {
        val s = if (by > 0f) range.start + ((v - range.start) / by).roundToInt() * by else v
        return s.coerceIn(range.start, range.endInclusive)
    }
    fun set(v: Float) {
        if (v == current) return
        tick?.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        change(v)
    }
    // The value under the finger, unrounded, so slow steps add up.
    val raw = remember { floatArrayOf(0f) }
    Column(
        modifier.alpha(if (enabled) 1f else 0.4f),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(label.uppercase(), style = ArcType.caps.copy(fontSize = 11.sp), color = c.graphite, maxLines = 1, textAlign = TextAlign.Center)
        Canvas(
            Modifier
                .size(size)
                .semantics {
                    contentDescription = description
                    stateDescription = readout
                    progressBarRangeInfo = ProgressBarRangeInfo(value, range, if (step > 0f) (span / step).roundToInt() - 1 else 0)
                    if (enabled) {
                        setProgress { v ->
                            set(snap(v, step))
                            done()
                            true
                        }
                    } else {
                        disabled()
                    }
                }
                .pointerInput(enabled, range, step, fineStep) {
                    if (!enabled) return@pointerInput
                    val perPx = span / FULL_TURN.toPx()
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        raw[0] = current
                        var lastTime = down.uptimeMillis
                        var moved = false
                        while (true) {
                            val e = awaitPointerEvent(PointerEventPass.Main)
                            val ch = e.changes.firstOrNull { it.id == down.id } ?: break
                            if (!ch.pressed) break
                            val d = ch.positionChange()
                            val px = d.x - d.y
                            if (px != 0f) {
                                moved = true
                                ch.consume()
                                val dt = (ch.uptimeMillis - lastTime).coerceAtLeast(1L)
                                lastTime = ch.uptimeMillis
                                val speed = abs(px).toDp().value / dt
                                raw[0] = (raw[0] + px * perPx).coerceIn(range.start, range.endInclusive)
                                set(snap(raw[0], if (speed < FINE_SPEED) fineStep else step))
                            }
                        }
                        if (moved) done()
                    }
                }
                .pointerInput(enabled, default) {
                    if (!enabled) return@pointerInput
                    detectTapGestures(onDoubleTap = {
                        set(default)
                        done()
                    })
                },
        ) {
            val (skirt, skirtEdge, cap, capEdge) = colors
            val r = this.size.minDimension / 2f
            val mid = Offset(this.size.width / 2f, this.size.height / 2f)
            val arcW = 3.dp.toPx()
            val ring = r - arcW / 2f
            val ringTopLeft = Offset(mid.x - ring, mid.y - ring)
            val ringSize = Size(ring * 2f, ring * 2f)
            // The track, then the part turned through.
            drawArc(c.keyEdge, 135f, SWEEP, false, ringTopLeft, ringSize, style = Stroke(arcW, cap = StrokeCap.Round))
            val at = ((value - range.start) / span).coerceIn(0f, 1f)
            val from = if (bipolar) ((0f - range.start) / span).coerceIn(0f, 1f) else 0f
            val a0 = 135f + SWEEP * minOf(from, at)
            val sweep = SWEEP * abs(at - from)
            if (sweep > 0f) drawArc(c.signal, a0, sweep, false, ringTopLeft, ringSize, style = Stroke(arcW, cap = StrokeCap.Round))
            val sr = r - arcW - 3.dp.toPx()
            drawCircle(skirtEdge, sr, mid + Offset(1.5f, 2.5f))
            drawCircle(skirt, sr, mid)
            val cr = sr * 0.62f
            drawCircle(capEdge, cr, mid + Offset(1f, 1.5f))
            drawCircle(cap, cr, mid + Offset(-0.5f, -1f))
            // The mark: where the knob points.
            val angle = Math.toRadians((135f + SWEEP * at).toDouble())
            val dir = Offset(cos(angle).toFloat(), sin(angle).toFloat())
            drawLine(
                if (cap.luminance() > 0.5f) Color(0xFF1E1F21) else Color(0xFFEDECE8),
                mid + dir * (cr * 0.25f),
                mid + dir * (sr - 2.dp.toPx()),
                strokeWidth = 2.5.dp.toPx(),
                cap = StrokeCap.Round,
            )
        }
        Text(readout, style = ArcType.bold.copy(fontSize = 14.sp), color = c.ink, maxLines = 1, textAlign = TextAlign.Center)
    }
}

/** The perceived lightness of a colour, 0 to 1, enough to pick a mark that shows. */
private fun Color.luminance(): Float = 0.299f * red + 0.587f * green + 0.114f * blue
