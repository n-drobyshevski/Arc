package dev.arc.ep133.ui.components

import android.os.SystemClock
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.runtime.Composable
import androidx.compose.runtime.FloatState
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.role
import dev.arc.ep133.ui.screens.reducedMotion
import kotlinx.coroutines.delay

/** How long the connection key is held to disconnect. */
internal const val HOLD_MS = 1000L

/** How a finger leaving a [KeyTimer] ended it. */
internal enum class HoldEnd {
    /** There was no finger down (it was cancelled, or the hold already ended). */
    NONE,

    /** Let go before the hold was up: a tap. */
    TAP,

    /** Let go after the hold was up, and nothing has acted on it yet ([KeyTimer.due] would have): the caller does. */
    HELD,

    /** Let go after the hold was up and [KeyTimer.due] had already said so: nothing is left to do. */
    DONE,
}

/**
 * The timing of a key that is held rather than tapped (the connection key
 * while connected), with the clock passed in so it can be tested: the
 * finger comes [down] at a time; [progress] says how far it is to [holdMs];
 * [due] says, once, that it got there; [up] says whether it was a tap, a
 * hold, or already acted on; [cancel] (the finger sliding off the key, or
 * taken by a scroll) forgets it. Letting go early never acts.
 */
internal class KeyTimer(private val holdMs: Long = HOLD_MS) {
    private var downAt = -1L
    private var fired = false

    /** Whether a finger is down. */
    val down: Boolean get() = downAt >= 0

    fun down(now: Long) {
        downAt = now
        fired = false
    }

    /** How far the hold has got, 0 to 1 (1 once it is up, until the finger leaves). */
    fun progress(now: Long): Float = if (downAt < 0) 0f else ((now - downAt).toFloat() / holdMs).coerceIn(0f, 1f)

    /** True once per hold, at the first call at or after [holdMs]. */
    fun due(now: Long): Boolean {
        if (downAt < 0 || fired || now - downAt < holdMs) return false
        fired = true
        return true
    }

    fun up(now: Long): HoldEnd {
        if (downAt < 0) return HoldEnd.NONE
        val held = now - downAt >= holdMs
        val acted = fired
        cancel()
        return when {
            !held -> HoldEnd.TAP
            acted -> HoldEnd.DONE
            else -> HoldEnd.HELD
        }
    }

    fun cancel() {
        downAt = -1L
        fired = false
    }
}

/**
 * What holding an [IconBlock] does: [onHold] after [HOLD_MS] with the finger
 * down, its ring filling round the key's edge meanwhile; a tap is the key's
 * own onClick. A screen reader reaches [onHold] as the action [label]
 * (Android's custom action, and a long click), without the timed hold.
 * [haptics]: a light tick for the tap and a confirm for the hold.
 */
@Immutable
data class KeyHold(val label: String, val haptics: Boolean, val onHold: () -> Unit)

/** A held key's touch ([modifier]) and the ring it has filled so far ([ring], 0 to 1; 0 with no finger down): read where it is drawn, so filling it recomposes nothing. */
@Stable
internal class HeldKey(val modifier: Modifier, val ring: FloatState)

/**
 * The touch of a key held to act ([hold]), feeding [source] the presses so the
 * key goes down under the finger as any key does. A tap calls [onTap]; the
 * finger down for [HOLD_MS] calls [KeyHold.onHold] at once (not on lifting) and the
 * lift after it does nothing. Slid off the key, it is cancelled. With animations off
 * ([reducedMotion]) the ring does not fill: the hold still completes.
 */
@Composable
internal fun rememberHeldKey(hold: KeyHold, enabled: Boolean, source: MutableInteractionSource, onTap: () -> Unit): HeldKey {
    val timer = remember { KeyTimer() }
    var down by remember { mutableStateOf(false) }
    val ring = remember { mutableFloatStateOf(0f) }
    val feel = LocalHapticFeedback.current
    val still = reducedMotion()
    val spec by rememberUpdatedState(hold)
    val tap by rememberUpdatedState(onTap)
    fun tick(type: HapticFeedbackType) {
        if (spec.haptics) feel.performHapticFeedback(type)
    }
    LaunchedEffect(down, still) {
        if (!down) {
            ring.floatValue = 0f
            return@LaunchedEffect
        }
        while (true) {
            val now = SystemClock.uptimeMillis()
            if (timer.due(now)) {
                ring.floatValue = 1f
                tick(HapticFeedbackType.Confirm)
                spec.onHold()
                return@LaunchedEffect
            }
            if (still) {
                delay(50)
            } else {
                withFrameNanos { }
                ring.floatValue = timer.progress(SystemClock.uptimeMillis())
            }
        }
    }
    val touch = Modifier.pointerInput(enabled) {
        if (!enabled) return@pointerInput
        awaitEachGesture {
            val first = awaitFirstDown()
            val press = PressInteraction.Press(first.position)
            source.tryEmit(press)
            timer.down(SystemClock.uptimeMillis())
            down = true
            val up = waitForUpOrCancellation()
            down = false
            if (up == null) {
                timer.cancel()
                source.tryEmit(PressInteraction.Cancel(press))
            } else {
                up.consume()
                source.tryEmit(PressInteraction.Release(press))
                when (timer.up(SystemClock.uptimeMillis())) {
                    HoldEnd.TAP -> {
                        tick(HapticFeedbackType.SegmentTick)
                        tap()
                    }
                    HoldEnd.HELD -> {
                        tick(HapticFeedbackType.Confirm)
                        spec.onHold()
                    }
                    HoldEnd.DONE, HoldEnd.NONE -> {}
                }
            }
        }
    }
    return remember(touch) { HeldKey(touch, ring) }
}

/** The semantics of a key held to act: a click, and [KeyHold.label] as a long click and a custom action. */
internal fun SemanticsPropertyReceiver.heldKeyActions(hold: KeyHold, enabled: Boolean, onTap: () -> Unit) {
    role = Role.Button
    if (!enabled) {
        disabled()
        return
    }
    onClick { onTap(); true }
    onLongClick(hold.label) { hold.onHold(); true }
    customActions = listOf(CustomAccessibilityAction(hold.label) { hold.onHold(); true })
}

/**
 * The outline of a [w] x [h] key with corners of radius [r], [inset] in from
 * its edge, starting at the top middle and running clockwise: the ring a held key
 * fills is a stretch of it.
 */
internal fun edgePath(w: Float, h: Float, r: Float, inset: Float): Path {
    val left = inset
    val top = inset
    val right = w - inset
    val bottom = h - inset
    val rr = (r - inset).coerceIn(0f, minOf(right - left, bottom - top) / 2f)
    val d = rr * 2f
    return Path().apply {
        moveTo((left + right) / 2f, top)
        lineTo(right - rr, top)
        arcTo(Rect(Offset(right - d, top), Size(d, d)), -90f, 90f, false)
        lineTo(right, bottom - rr)
        arcTo(Rect(Offset(right - d, bottom - d), Size(d, d)), 0f, 90f, false)
        lineTo(left + rr, bottom)
        arcTo(Rect(Offset(left, bottom - d), Size(d, d)), 90f, 90f, false)
        lineTo(left, top + rr)
        arcTo(Rect(Offset(left, top), Size(d, d)), 180f, 90f, false)
        close()
    }
}
