package dev.arc.ep133.ui.screens

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The function column on a phone on its side fits the height it gets. */
class FunctionColumnTest {
    /** What the column takes: three caps, their LED lines (6 + 14) when kept, two gaps. */
    private fun ColumnFit.height(): Dp = (cap + if (led) 20.dp else 0.dp) * 3 + gap * 2

    @Test
    fun `in room the keys are full size`() {
        assertEquals(ColumnFit(38.dp, 12.dp, true), columnFit(300.dp))
        assertEquals(ColumnFit(38.dp, 12.dp, true), columnFit(198.dp))
    }

    @Test
    fun `shorter, the gaps close up, then the caps shrink, then the LED lines go`() {
        assertEquals(ColumnFit(38.dp, 9.dp, true), columnFit(192.dp))
        assertEquals(ColumnFit(38.dp, 6.dp, true), columnFit(186.dp))
        assertEquals(ColumnFit(33.dp, 6.dp, true), columnFit(171.dp))
        assertEquals(ColumnFit(32.dp, 6.dp, true), columnFit(FunctionColumnLed))
        val noLed = columnFit(140.dp)
        assertFalse(noLed.led)
        assertEquals(6.dp, noLed.gap)
        assertEquals(38.dp, noLed.cap)
        assertEquals(ColumnFit(30.dp, 6.dp, false), columnFit(102.dp))
    }

    @Test
    fun `it never takes more than it gets, down to its smallest`() {
        var h = 102.dp
        while (h <= 320.dp) {
            val fit = columnFit(h)
            assertTrue(fit.height() <= h + 0.01.dp) { "$fit in $h" }
            h += 1.dp
        }
    }
}
