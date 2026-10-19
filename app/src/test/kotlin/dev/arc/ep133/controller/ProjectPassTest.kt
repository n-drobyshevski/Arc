package dev.arc.ep133.controller

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** PROJECT's switch loop: taps during a pass pile up, and the newest is written and read. */
class ProjectPassTest {
    private val next = dev.arc.ep133.features.ProjectStep::next

    @Test
    fun `a pass with no tap meanwhile is the last`() = runBlocking {
        val written = ArrayList<Int>()
        val r = passOnNewest({ 2 }) { want -> written += want; "read $want" }
        assertEquals("read 2", r)
        assertEquals(listOf(2), written)
    }

    @Test
    fun `a tap during the last read still gets its pass`() = runBlocking {
        // Live on P1, a tap: target 2. The pass writes 2, reads it back, and a tap lands
        // while it reads P2's pads: target 3, which must be written, not dropped.
        var target: Int? = 2
        val written = ArrayList<Int>()
        val r = passOnNewest({ target }) { want ->
            written += want
            if (want == 2) target = next(target) // during the pad read
            "read $want"
        }
        assertEquals("read 3", r)
        assertEquals(listOf(2, 3), written)
    }

    @Test
    fun `taps pile up and a cut-short pass goes again`() = runBlocking {
        var target: Int? = 8
        val written = ArrayList<Int>()
        val r = passOnNewest({ target }) { want ->
            written += want
            if (want == 8) {
                // Two taps during the write: 9, then round to 1. The pass sees and stops short.
                target = next(next(target))
                null
            } else {
                "read $want"
            }
        }
        assertEquals("read 1", r)
        assertEquals(listOf(8, 1), written)
    }

    @Test
    fun `nothing once the target is gone`() = runBlocking {
        var target: Int? = 4
        // The mirror closed meanwhile: the target goes.
        assertNull(passOnNewest({ target }) { target = null; "read 4" })
        assertNull(passOnNewest({ null }) { "never" })
    }
}
