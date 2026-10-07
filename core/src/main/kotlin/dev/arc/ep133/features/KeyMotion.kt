package dev.arc.ep133.features

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * How a key cap moves, after the K.O. II's own keys: mechanical switches,
 * not rubber pads. A press goes straight down and stops hard at the bottom
 * ([PRESS_MS], at an even speed, no easing into the stop); a strike stays
 * down at least [MIN_DOWN_MS], so the quickest tap still shows the key
 * bottomed out; let go, the switch's spring throws the cap back up a little
 * past its rest and it settles (a damped spring, [DAMPING] and [STIFFNESS]).
 *
 * The position is 0 (up) to 1 (down, on its edge); the spring takes it a
 * little below 0 on the way back (the face lifts off its edge).
 * Android steps a [Key] each frame for every cap (Cap.kt capPress) and each
 * piano key; the web runs the same numbers as CSS transitions (theme/cap.css),
 * the spring sampled from [release] (keyMotion.ts springCss).
 */
object KeyMotion {
    /** From up to fully down. */
    const val PRESS_MS = 24f

    /** The shortest time a pressed key stays down, from its press. */
    const val MIN_DOWN_MS = 50f

    /** The switch spring's damping ratio: under 1, so it overshoots (16%) before it settles. */
    const val DAMPING = 0.5f

    /** Its stiffness, in 1/s² (Compose's spring stiffness): back at rest in about 48 ms. */
    const val STIFFNESS = 2500f

    /** How long the web's release transition runs: the spring settled to under 1% of the travel. */
    const val RELEASE_MS = 200

    /** One key's motion: [pos] (0 up, 1 down), its speed in travels per second, and how long it's been down. */
    class Key(var pos: Float = 0f, var vel: Float = 0f, var downMs: Float = -1f) {
        /** Whether it's at rest (up, or down and held). */
        val still: Boolean get() = vel == 0f && (pos == 0f || pos == 1f)
    }

    /**
     * Moves [key] on by [dtMs] while [down] (a finger on it, or its note
     * sounding); returns whether it still moves. A key let go before
     * [MIN_DOWN_MS] stays down until then.
     */
    fun step(key: Key, down: Boolean, dtMs: Float): Boolean {
        // No time passed (a frame stamped before the press or release it follows): nothing moves, but
        // a key not yet where it's going still has to get there, or it would stay stuck (down, after a release).
        if (dtMs <= 0f) return !key.still || key.pos != (if (down || key.downMs in 0f..<MIN_DOWN_MS) 1f else 0f)
        if (down && key.downMs < 0f) key.downMs = 0f
        val held = down || key.downMs in 0f..<MIN_DOWN_MS
        if (held) {
            key.downMs += dtMs
            key.pos = min(1f, maxOf(0f, key.pos) + dtMs / PRESS_MS)
            key.vel = 0f
            // Still waiting out its shortest stay: it moves (on its own) until then.
            return key.pos < 1f || !down
        }
        key.downMs = -1f
        // The spring, exactly from where it is (any frame length; no steps to drift).
        val w = sqrt(STIFFNESS)
        val zw = DAMPING * w
        val wd = w * sqrt(1 - DAMPING * DAMPING)
        val t = dtMs / 1000f
        val x0 = key.pos
        val b = (key.vel + zw * x0) / wd
        val e = exp(-zw * t)
        val c = cos(wd * t)
        val s = sin(wd * t)
        key.pos = e * (x0 * c + b * s)
        key.vel = e * ((b * wd - zw * x0) * c - (x0 * wd + zw * b) * s)
        // At rest once it's off by less than a hundredth of a pixel and all but still.
        if (abs(key.pos) < 0.003f && abs(key.vel) < 0.3f) {
            key.pos = 0f
            key.vel = 0f
            return false
        }
        return true
    }

    /**
     * The release from fully down, as the fraction of the way back up at [t]
     * (0..1 of [RELEASE_MS]): the damped spring's exact curve, past 1 where
     * it overshoots.
     */
    fun release(t: Double): Double {
        val w = sqrt(STIFFNESS.toDouble())
        val z = DAMPING.toDouble()
        val wd = w * sqrt(1 - z * z)
        val s = t * RELEASE_MS / 1000.0
        return 1 - exp(-z * w * s) * (cos(wd * s) + z * w / wd * sin(wd * s))
    }
}
