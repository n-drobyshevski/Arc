package dev.arc.ep133.ui.screens

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** A hit or a sound's name on two lines breaks at a separator, not inside a word. */
class TwoLinesTest {
    @Test
    fun `breaks at the separator that evens the lines out`() {
        assertEquals("A 7\nkick", twoLines("A 7 · kick"))
        // Even, the later: the sound's name stays whole.
        assertEquals("A 7 · 001 kick\n124", twoLines("A 7 · 001 kick · 124"))
        assertEquals("A 7\nthe long sound name · 9", twoLines("A 7 · the long sound name · 9"))
    }

    @Test
    fun `without a separator it is left alone`() {
        assertEquals("Press a pad", twoLines("Press a pad"))
    }
}
