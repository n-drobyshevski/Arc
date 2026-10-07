package dev.arc.ep133.ui.screens

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The function column on a phone on its side fits its five keys in the height it gets. */
class FunctionColumnTest {
    /** What the column takes: [keys] caps, their LED lines (6 + 14) when kept, the gaps between. */
    private fun ColumnFit.height(keys: Int = 5): Dp = (cap + if (led) 20.dp else 0.dp) * keys + gap * (keys - 1)

    @Test
    fun `in room the keys are full size`() {
        assertEquals(ColumnFit(38.dp, 12.dp, true), columnFit(400.dp))
        assertEquals(ColumnFit(38.dp, 12.dp, true), columnFit(338.dp))
    }

    @Test
    fun `shorter, the gaps close up, then the caps shrink, then the LED lines go`() {
        assertEquals(ColumnFit(38.dp, 9.dp, true), columnFit(326.dp))
        assertEquals(ColumnFit(38.dp, 6.dp, true), columnFit(314.dp))
        assertEquals(ColumnFit(33.dp, 6.dp, true), columnFit(289.dp))
        assertEquals(ColumnFit(28.dp, 6.dp, true), columnFit(FunctionColumnLed))
        val noLed = columnFit(240.dp)
        assertFalse(noLed.led)
        assertEquals(6.dp, noLed.gap)
        assertEquals(38.dp, noLed.cap)
        assertEquals(ColumnFit(30.dp, 6.dp, false), columnFit(174.dp))
    }

    @Test
    fun `shortest, the gaps close to their least and the caps shrink to 24 dp`() {
        // 560 x 280 and 490 x 253 on their side, under the display line.
        assertEquals(ColumnFit(28.dp, 4.dp, false), columnFit(156.dp))
        assertEquals(ColumnFit(24.dp, 4.dp, false), columnFit(136.dp))
        assertEquals(ColumnFit(24.dp, 4.dp, false), columnFit(100.dp))
    }

    @Test
    fun `the LED lines stay on a standard phone on its side`() {
        // 692 x 336 and 867 x 388 less the 56 dp top bar and the 8 dp under the keys.
        assertEquals(264.dp, FunctionColumnLed)
        assertTrue(columnFit(272.dp).led)
        assertTrue(columnFit(324.dp).led)
    }

    @Test
    fun `it never takes more than it gets, down to its smallest`() {
        var h = 136.dp
        while (h <= 360.dp) {
            val fit = columnFit(h)
            assertTrue(fit.height() <= h + 0.01.dp) { "$fit in $h" }
            h += 1.dp
        }
    }

    @Test
    fun `without SAMPLE its four keys fit as before`() {
        assertEquals(ColumnFit(38.dp, 12.dp, true), columnFit(268.dp, keys = 4))
        assertEquals(ColumnFit(33.dp, 6.dp, true), columnFit(230.dp, keys = 4))
        var h = 138.dp
        while (h <= 320.dp) {
            val fit = columnFit(h, keys = 4)
            assertTrue(fit.height(keys = 4) <= h + 0.01.dp) { "$fit in $h" }
            h += 1.dp
        }
    }
}
