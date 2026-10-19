package dev.arc.ep133.audio

import android.os.SystemClock

/**
 * When a finger came down, on the clock Live's latency is measured on
 * ([System.nanoTime], a press's pressedAt), from the touch event's own time
 * (an addition): Compose's PointerInputChange.uptimeMillis, which is
 * [SystemClock.uptimeMillis]'s clock. So the press-to-sound time includes
 * the input's way to the app, not only what follows the handler.
 */
object PressTime {
    /** An event older than this is not a press handled now (a clock that doesn't agree): it counts from now instead. */
    const val MAX_AGE_MS = 1000L

    /** The nanoTime of a touch event at [eventUptimeMillis]. */
    fun of(eventUptimeMillis: Long): Long = of(eventUptimeMillis, System.nanoTime(), SystemClock.uptimeMillis())

    /**
     * The same from both clocks read now: [nowNanos] less the event's age
     * ([nowUptimeMillis] − [eventUptimeMillis]). An event from the future, or
     * older than [MAX_AGE_MS], is taken as now.
     */
    fun of(eventUptimeMillis: Long, nowNanos: Long, nowUptimeMillis: Long): Long {
        val age = nowUptimeMillis - eventUptimeMillis
        return if (age in 0..MAX_AGE_MS) nowNanos - age * 1_000_000L else nowNanos
    }
}
