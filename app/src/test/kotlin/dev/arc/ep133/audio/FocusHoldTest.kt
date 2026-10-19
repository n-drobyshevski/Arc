package dev.arc.ep133.audio

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** One audio focus request for Live's voices and its click. */
class FocusHoldTest {
    private val s = 1_000_000_000L

    @Test
    fun `asked for once, let go of after two quiet seconds`() {
        val h = FocusHold<String>()
        assertEquals("game", h.sound("game"))
        assertNull(h.sound("game"))
        assertNull(h.quiet(silent = false, now = 0))
        assertNull(h.quiet(silent = true, now = 1 * s))
        assertNull(h.quiet(silent = true, now = 3 * s))
        assertEquals("game", h.quiet(silent = true, now = 3 * s + 1))
        assertFalse(h.holding)
        assertNull(h.quiet(silent = true, now = 9 * s))
    }

    @Test
    fun `a new voice counts the quiet afresh`() {
        val h = FocusHold<String>()
        h.sound("game")
        h.quiet(true, 0)
        h.sound("game")
        // The voice isn't in the output's keys yet: the quiet starts again here.
        assertNull(h.quiet(true, 2 * s + 1))
        assertEquals("game", h.quiet(true, 4 * s + 2))
    }

    @Test
    fun `the click keeps it, and shares the voices' request`() {
        val h = FocusHold<String>()
        assertEquals("game", h.clickOn("game"))
        assertNull(h.sound("game"))
        assertNull(h.quiet(true, 0))
        assertNull(h.quiet(true, 60 * s))
        assertNull(h.idle())
        assertTrue(h.holding)
        // Off: two more quiet seconds from then.
        h.clickOff()
        assertNull(h.quiet(true, 61 * s))
        assertEquals("game", h.quiet(true, 63 * s + 1))
    }

    @Test
    fun `the click on while a voice holds it asks nothing more`() {
        val h = FocusHold<String>()
        h.sound("game")
        assertNull(h.clickOn("game"))
    }

    @Test
    fun `Live's output closing lets go at once unless the click is on`() {
        val h = FocusHold<String>()
        h.sound("game")
        assertEquals("game", h.idle())
        assertNull(h.idle())
        h.clickOn("game")
        assertNull(h.idle())
        h.clickOff()
        assertEquals("game", h.idle())
    }

    @Test
    fun `asks and let-gos are handed on under its lock, in the order decided`() {
        val done = ArrayList<String>()
        lateinit var h: FocusHold<String>
        h = FocusHold(
            ask = { assertTrue(Thread.holdsLock(h)); done += "ask $it" },
            letGo = { assertTrue(Thread.holdsLock(h)); done += "let go $it" },
        )
        h.sound("game")
        assertNull(h.sound("game"))
        // Quiet two seconds, then the click goes on: let go, then ask again; never the other way round.
        h.quiet(true, 0)
        h.quiet(true, 2 * s + 1)
        h.clickOn("game")
        h.lost()
        assertNull(h.idle())
        assertEquals(listOf("ask game", "let go game", "ask game", "let go game"), done)
    }

    @Test
    fun `focus taken lets go, turns the click off and asks again on the next sound`() {
        val h = FocusHold<String>()
        h.clickOn("game")
        assertEquals("game", h.lost())
        assertFalse(h.holding)
        assertEquals("game", h.sound("game"))
        assertNull(h.quiet(true, 0))
        assertEquals("game", h.quiet(true, 2 * s + 1))
    }
}
