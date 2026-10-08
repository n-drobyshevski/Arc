package dev.arc.ep133.ui.screens

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableFloatState
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

// ---------- Punch-ins: FX held, the one-group pads play the twelve punch-in effects (an addition) ----------

/**
 * The punch-ins on Live's pads while FX is held ([FunctionKeysUi.fxHeld]):
 * [held] the slots down, in the order pressed (the display line names them).
 * A pad's press is [onDown] at its depth, a finger moving [onMove], the lift
 * [onUp]; several pads held together play together. None of it starts a
 * voice or goes into the pattern.
 */
class PunchUi(
    val held: Set<Int> = emptySet(),
    val onDown: (slot: Int, depth: Float) -> Unit = { _, _ -> },
    val onMove: (slot: Int, depth: Float) -> Unit = { _, _ -> },
    val onUp: (slot: Int) -> Unit = {},
    /** For screenshots: the depth a held slot's bar shows with no finger on it (a screen reader's click: all the way). */
    val depths: Map<Int, Float> = emptyMap(),
)

/** The punch-ins as the pads take them: what [PunchUi] says, and the pressures the screen has seen. */
internal class PadPunch(val ui: PunchUi, val sense: PressureSense)

/** The lightest a punch-in goes by where the finger is: the pad's foot (its top is 1). */
internal const val PUNCH_FLOOR = 0.15f

/** How far apart a device's pressures must be before they count as pressure: a constant (or a jitter round it) is none. */
internal const val PRESSURE_SPREAD = 0.05f

/** A punch-in's depth from where the finger is on its pad, [y] down a pad [height] tall: 1 at the top, [PUNCH_FLOOR] at the foot. */
internal fun yDepth(y: Float, height: Float): Float {
    if (!(height > 0f)) return 1f
    val down = (y / height).coerceIn(0f, 1f)
    return 1f - down * (1f - PUNCH_FLOOR)
}

/**
 * What the screen makes of a touch's pressure: the lowest and highest it
 * has reported. A device that reports the same pressure for every touch
 * (many do, 1.0 or the like) has none to play with, and the depth comes
 * from where the finger is ([yDepth]); once they have spread at least
 * [PRESSURE_SPREAD], a touch's pressure in that range is its depth, from
 * [PUNCH_FLOOR] to 1, as the finger presses harder or lighter.
 */
internal class PressureSense {
    private var low = Float.NaN
    private var high = Float.NaN

    /** Whether the pressures seen vary enough to play with. */
    val varies: Boolean get() = high - low >= PRESSURE_SPREAD

    /** A touch's [pressure] seen (one that isn't a number is left out). */
    fun see(pressure: Float) {
        if (!pressure.isFinite()) return
        low = if (low.isNaN()) pressure else minOf(low, pressure)
        high = if (high.isNaN()) pressure else maxOf(high, pressure)
    }

    /** A touch's depth: its [pressure] (seen first) while pressures vary, else where it is, [y] down a pad [height] tall. */
    fun depth(pressure: Float, y: Float, height: Float): Float {
        val at = level(pressure) ?: return yDepth(y, height)
        return PUNCH_FLOOR + at * (1f - PUNCH_FLOOR)
    }

    /** Where [pressure] (seen first) is in the range seen, 0..1, while pressures vary; null while they don't (no pressure to play with). */
    fun level(pressure: Float): Float? {
        see(pressure)
        if (!varies || !pressure.isFinite()) return null
        return ((pressure - low) / (high - low)).coerceIn(0f, 1f)
    }
}

/**
 * A pad while FX is held: punch-in [slot]'s name where the pad prints its
 * sound, "hold" at its foot; held ([lit], the slot down) the cap turns
 * signal orange, a thin bar at its foot as long as the depth. [u] is the
 * pad's width, as the K.O. II's body sizes it ([KoGeom]); [shape] its
 * corners. A screen reader's click puts the punch-in in (all the way) until
 * clicked again: there's no finger to hold.
 */
@Composable
internal fun PunchPad(
    slot: Int,
    lit: Boolean,
    punch: PunchUi,
    sense: PressureSense,
    modifier: Modifier,
    u: Dp,
    shape: Shape,
    haptics: Boolean = false,
) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val density = LocalDensity.current
    val held = remember { mutableStateOf(false) }
    // The last finger's depth (-1: none, or a screen reader's click), read as the bar draws. It stays past the lift,
    // so the bar doesn't jump to [shown] in the frame before the slot is let go of.
    val finger = remember { mutableFloatStateOf(-1f) }
    val shown = punch.depths[slot] ?: 1f
    val g = if (lit) 1f else 0f
    val ink = if (lit) c.onSignal else hw.darkInk
    val nameStyle = ArcType.semi.copy(
        fontSize = with(density) { (u * 0.15f).coerceIn(10.dp, 15.dp).toSp() },
        fontWeight = FontWeight.SemiBold,
        lineHeight = 1.1.em,
        letterSpacing = 0.04.em,
    )
    val footStyle = ArcType.tiny.copy(fontSize = with(density) { (u * 0.13f).coerceIn(10.dp, 14.dp).toSp() }, lineHeight = 1.1.em)
    val bar = (u * 0.045f).coerceIn(3.dp, 5.dp)
    Column(
        modifier
            .litGlow(g, c.signal, shape)
            .cap(lerp(hw.ko.darkFace, c.signal, g), lerp(hw.ko.darkEdge, c.signalEdge, g), shape, capPress(held.value))
            .then(holdToPunch(slot, punch, sense, held, finger, haptics))
            .semantics {
                role = Role.Button
                contentDescription = MirrorText.punchDescription(slot)
                if (lit) stateDescription = MirrorText.PUNCHED_IN
                onClick(label = if (lit) MirrorText.PUNCH_OUT else MirrorText.PUNCH_IN) {
                    if (lit) {
                        punch.onUp(slot)
                    } else {
                        finger.floatValue = -1f
                        punch.onDown(slot, 1f)
                    }
                    true
                }
            }
            .padding(horizontal = u * 0.1f, vertical = u * 0.06f),
    ) {
        Text(MirrorText.punchName(slot).uppercase(), style = nameStyle, color = ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.weight(1f))
        if (lit) {
            // The depth: a pale track, filled as far as the finger presses (drawn, so a move only redraws it).
            Box(
                Modifier
                    .fillMaxWidth(0.85f)
                    .padding(bottom = u * 0.04f)
                    .height(bar)
                    .drawBehind {
                        val r = CornerRadius(size.height / 2)
                        val d = finger.floatValue.takeIf { it >= 0f } ?: shown
                        drawRoundRect(c.onSignal.copy(alpha = 0.3f), cornerRadius = r)
                        drawRoundRect(c.onSignal, size = Size(size.width * d.coerceIn(0f, 1f), size.height), cornerRadius = r)
                    },
            )
        } else {
            Text(MirrorText.PUNCH_HOLD, style = footStyle, color = hw.darkDim, maxLines = 1)
        }
    }
}

/**
 * A punch-in pad's touch: [PunchUi.onDown] as the finger comes down, at
 * its depth ([PressureSense]: its pressure where the device has one to
 * give, else how high up the pad it is), [PunchUi.onMove] as that changes,
 * and [PunchUi.onUp] at the lift (or the pad leaving the screen: FX let go
 * of, and the pads back to their sounds). Each finger is its own press.
 * [held] keeps the cap down, [finger] the depth for its bar.
 */
@Composable
private fun holdToPunch(
    slot: Int,
    punch: PunchUi,
    sense: PressureSense,
    held: MutableState<Boolean>,
    finger: MutableFloatState,
    haptics: Boolean,
): Modifier {
    val ui by rememberUpdatedState(punch)
    val tick by rememberUpdatedState(if (haptics) LocalHapticFeedback.current else null)
    return Modifier.pointerInput(slot, sense) {
        fun depthOf(ch: PointerInputChange) = sense.depth(ch.pressure, ch.position.y, size.height.toFloat())
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            // The pad pressed hears its whole press, whatever the screen shows by the lift.
            val press = ui
            var depth = depthOf(down)
            press.onDown(slot, depth)
            tick?.performHapticFeedback(HapticFeedbackType.KeyboardTap)
            held.value = true
            finger.floatValue = depth
            try {
                while (true) {
                    val ch = awaitPointerEvent(PointerEventPass.Final).changes.firstOrNull { it.id == down.id } ?: break
                    if (!ch.pressed) break
                    val d = depthOf(ch)
                    if (d != depth) {
                        depth = d
                        finger.floatValue = d
                        press.onMove(slot, d)
                    }
                }
            } finally {
                held.value = false
                press.onUp(slot)
            }
        }
    }
}
