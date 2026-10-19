package dev.arc.ep133.audio

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** A touch event's time (uptime milliseconds) on Live's press clock (nanoTime). */
class PressTimeTest {
    private val now = 5_000_000_000_000L

    @Test
    fun `an event is as much before now on nanoTime as it is on uptime`() {
        // Handled 12 ms after the touch: the press was 12 ms ago.
        assertEquals(now - 12_000_000L, PressTime.of(eventUptimeMillis = 88_000, nowNanos = now, nowUptimeMillis = 88_012))
        assertEquals(now, PressTime.of(88_012, now, 88_012))
        assertEquals(now - PressTime.MAX_AGE_MS * 1_000_000L, PressTime.of(88_000, now, 88_000 + PressTime.MAX_AGE_MS))
    }

    @Test
    fun `an event from the future, or too old to be this press, counts from now`() {
        assertEquals(now, PressTime.of(88_013, now, 88_012))
        assertEquals(now, PressTime.of(88_000, now, 88_001 + PressTime.MAX_AGE_MS))
        assertEquals(now, PressTime.of(0, now, 88_012))
    }
}
