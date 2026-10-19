package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LatencyStatsTest {
    @Test
    fun `median, best and worst per engine`() {
        var s = LatencyStats()
        assertTrue(s.isEmpty)
        assertNull(s.summary("a"))
        for (ms in listOf(30.0, 10.0, 20.0)) s = s.add("a", ms)
        assertEquals(LatencySummary("a", 3, 20.0, 10.0, 30.0), s.summary("a"))
        // An even count takes the middle two's mean.
        s = s.add("a", 41.0)
        assertEquals(LatencySummary("a", 4, 25.0, 10.0, 41.0), s.summary("a"))
        s = s.add("b", 7.5)
        assertEquals(LatencySummary("b", 1, 7.5, 7.5, 7.5), s.summary("b"))
        assertEquals(4, s.summary("a")!!.count)
    }

    @Test
    fun `only the last 20 count`() {
        var s = LatencyStats()
        for (i in 1..25) s = s.add("a", i.toDouble())
        // 6..25 are left.
        assertEquals(LatencySummary("a", LatencyStats.KEEP, 15.5, 6.0, 25.0), s.summary("a"))
    }

    @Test
    fun `engines read as tried, and reset`() {
        val s = LatencyStats().add("native", 12.0).add("track", 30.0).add("native", 14.0).add("old", 60.0)
        assertEquals(listOf("native", "track", "old"), s.engines)
        assertEquals(listOf("native", "track", "old"), s.summaries().map { it.engine })
        assertEquals(listOf("native", "old"), s.reset("track").engines)
        assertEquals(s, s.reset("missing"))
        assertTrue(s.reset().isEmpty)
        assertEquals(emptyList<LatencySummary>(), s.reset().summaries())
    }

    @Test
    fun `times that can't be right are left out, and adding leaves the old value alone`() {
        val s = LatencyStats().add("a", 10.0)
        assertEquals(s, s.add("a", -1.0))
        assertEquals(s, s.add("a", Double.NaN))
        assertEquals(s, s.add("a", Double.POSITIVE_INFINITY))
        assertEquals(LatencySummary("a", 1, 0.0, 0.0, 0.0), LatencyStats().add("a", 0.0).summary("a"))
        s.add("a", 99.0)
        assertEquals(1, s.summary("a")!!.count)
    }
}
