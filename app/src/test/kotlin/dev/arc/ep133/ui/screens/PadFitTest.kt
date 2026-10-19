package dev.arc.ep133.ui.screens

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.arc.ep133.ui.components.CapDy
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The big grid's pads fill the room they get; upright, they grow taller into the height the body leaves. */
class PadFitTest {
    private fun assertDp(expected: Dp, actual: Dp, what: String = "") = assertEquals(expected.value, actual.value, 0.01f, what)

    /** A tall phone's room for the upright grid: 380 dp wide (412 less the gutters), plenty high. */
    private val tallW = 380.dp

    @Test
    fun `on a tall phone the pads grow taller, not wider`() {
        val flat = padFit(tallW, 560.dp, 3)
        val grown = padFit(tallW, 560.dp, 3, tall = true)
        assertDp(flat.width, grown.width, "width")
        assertTrue(grown.height > flat.height) { "$flat -> $grown" }
        // The 46 dp the body left over, shared by the four rows.
        assertDp(flat.height + (560.dp - CapDy - 2.dp - flat.body) / 4, grown.height)
        // And it takes all of it.
        assertDp(560.dp - CapDy - 2.dp, grown.body)
    }

    @Test
    fun `on a small phone the pads stay as they are`() {
        // 360 x 640: the body's room is short, and the height is what limits the pads.
        val room = 372.dp
        val flat = padFit(328.dp, room, 3)
        assertDp((room - CapDy - 2.dp) / 5.72f, flat.width)
        assertEquals(flat, padFit(328.dp, room, 3, tall = true))
        // Without a flat's worth of room to spare, nothing grows however the width allows.
        assertEquals(padFit(300.dp, 300.dp, 3), padFit(300.dp, 300.dp, 3, tall = true))
    }

    @Test
    fun `sideways, and without tall, the pads are 1,08 times as wide as high`() {
        var h = 100.dp
        while (h <= 1200.dp) {
            val fit = padFit(tallW, h, 3)
            assertDp(fit.width / 1.08f, fit.height, "in $h")
            val four = padFit(tallW, h, 4)
            assertDp(four.width / 1.08f, four.height, "four columns in $h")
            h += 20.dp
        }
    }

    @Test
    fun `a pad is never more than 1,15 times as high as wide`() {
        // Far more room than the pads can use: they stop at the cap and the rest is left round the body.
        val fit = padFit(tallW, 1400.dp, 3, tall = true)
        assertDp(fit.width * KoPadTallest, fit.height)
        assertEquals(1.15f, KoPadTallest)
        var h = 100.dp
        while (h <= 1400.dp) {
            val f = padFit(tallW, h, 3, tall = true)
            assertTrue(f.height <= f.width * KoPadTallest + 0.01.dp) { "$f in $h" }
            h += 10.dp
        }
    }

    @Test
    fun `the body never takes more than the room`() {
        for (w in listOf(300.dp, 328.dp, 380.dp, 488.dp)) {
            var h = 150.dp
            while (h <= 1400.dp) {
                for (tall in listOf(false, true)) {
                    val fit = padFit(w, h, 3, tall)
                    assertTrue(fit.body <= h - CapDy - 2.dp + 0.01.dp) { "$fit in $w x $h (tall $tall)" }
                }
                h += 7.dp
            }
        }
    }

    @Test
    fun `growing in more room never makes a pad smaller`() {
        var last = 0.dp
        var h = 150.dp
        while (h <= 1400.dp) {
            val f = padFit(tallW, h, 3, tall = true)
            assertTrue(f.height >= last - 0.01.dp) { "$f in $h" }
            last = f.height
            h += 5.dp
        }
    }

    @Test
    fun `the widest pad is 170 dp`() {
        assertDp(170.dp, padFit(2000.dp, 2000.dp, 3).width)
        assertDp(170.dp, padFit(2000.dp, 2000.dp, 3, tall = true).width)
    }
}
