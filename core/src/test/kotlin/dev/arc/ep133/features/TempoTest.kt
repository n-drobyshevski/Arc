package dev.arc.ep133.features

import dev.arc.ep133.protocol.MidiEvent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs

class TempoTest {
    private val ms = 1_000_000L

    @Test
    fun `tempo limits`() {
        assertEquals(40, Tempo.clamp(12))
        assertEquals(240, Tempo.clamp(300))
        assertEquals(133, Tempo.clamp(133))
        assertEquals(121, Tempo.round(120.5))
        assertEquals(120, Tempo.round(120.49))
        assertEquals(240, Tempo.round(1e12))
    }

    @Test
    fun `tap tempo averages the last intervals`() {
        val t = TapTempo()
        assertNull(t.tap(0))
        assertEquals(120, t.tap(500 * ms))
        assertEquals(120, t.tap(1000 * ms))
        assertEquals(120, t.tap(1500 * ms))
        // Up to four intervals: 500, 500, 500, 560 → 515 ms → 116.5 → 117.
        assertEquals(117, t.tap(2060 * ms))
    }

    @Test
    fun `a long pause starts again, and so does a changed mind`() {
        val t = TapTempo()
        t.tap(0)
        t.tap(500 * ms)
        assertNull(t.tap(2600 * ms))
        assertEquals(100, t.tap(3200 * ms))
        // 1000 ms after 600 ms ones: more than half off, so from the tap before it.
        t.reset()
        t.tap(0)
        t.tap(600 * ms)
        t.tap(1200 * ms)
        assertEquals(60, t.tap(2200 * ms))
        assertEquals(60, t.tap(3200 * ms))
        // A tap at the same moment is a new run.
        assertNull(t.tap(3200 * ms))
    }

    @Test
    fun `tap tempo clamps`() {
        val fast = TapTempo()
        fast.tap(0)
        assertEquals(Tempo.MAX, fast.tap(100 * ms))
        val slow = TapTempo()
        slow.tap(0)
        assertEquals(Tempo.MIN, slow.tap(1900 * ms))
    }

    /** MINSTD, the same numbers in the web twin: jitter in −1..1 ms. */
    private class Jitter(private var state: Long = 1) {
        fun next(): Long {
            state = state * 48271 % 2147483647
            return Math.round((state.toDouble() / 2147483647 * 2 - 1) * 1_000_000)
        }
    }

    private val tick120 = 500e6 / 24

    @Test
    fun `the clock's tempo and beats come through jitter`() {
        val f = ClockFollow()
        val t0 = 10_000 * ms
        val j = Jitter()
        assertNull(f.onMidi(MidiEvent.Start(t0 - ms)))
        val beats = ArrayList<Beat>()
        var last = 0L
        for (i in 0 until 200) {
            last = t0 + Math.round(i * tick120) + j.next()
            f.onMidi(MidiEvent.Clock(last))?.let(beats::add)
        }
        // Start: clock 0 is beat 0, a bar's first; every 24th clock a beat.
        assertEquals((0L..8L).toList(), beats.map { it.index })
        assertEquals(listOf(0L, 4L, 8L), beats.filter { it.accent }.map { it.index })
        val g = f.grid(last + ms)!!
        assertTrue(abs(g.periodNs - 500e6) / 500e6 < 0.001, "period ${g.periodNs}")
        assertTrue(abs(g.bpm - 120) < 0.12)
        assertTrue(g.barKnown)
        assertEquals(8L, g.beatIndex)
        // The fitted beats sit on the device's, inside the jitter (further out, a little less so).
        for (k in listOf(8L, 9L)) assertTrue(abs(g.at(k) - (t0 + k * 500 * ms)) < ms, "beat $k at ${g.at(k)}")
        assertTrue(abs(g.at(12) - (t0 + 12 * 500 * ms)) < 3 * ms)
        assertEquals(8L, g.indexFrom(t0 + 8 * 500 * ms - 5 * ms))
        assertEquals(9L, g.indexFrom(t0 + 8 * 500 * ms + 5 * ms))
        assertEquals(Beat(12, g.at(12), true), g.beat(12))
        assertFalse(g.accent(13))
    }

    @Test
    fun `Stop holds the count and Continue goes on from it`() {
        val f = ClockFollow()
        var t = 0L
        fun clock() = f.onMidi(MidiEvent.Clock(t)).also { t += 20 * ms }
        f.onMidi(MidiEvent.Start(t))
        repeat(30) { clock() } // ticks 0..29
        f.onMidi(MidiEvent.Stop(t))
        // Clocks while stopped count nothing: no beats, the tempo stays.
        repeat(30) { assertNull(clock()) }
        val stopped = f.grid(t)!!
        assertFalse(stopped.barKnown)
        assertEquals(480e6, stopped.periodNs, 1.0)
        f.onMidi(MidiEvent.Continue(t))
        // Ticks 30..47, then 48: beat 2, not a bar's first.
        repeat(18) { assertNull(clock()) }
        assertEquals(2L, clock()!!.index)
    }

    @Test
    fun `no tempo under 25 clocks or once they stop`() {
        val f = ClockFollow()
        f.onMidi(MidiEvent.Start(0))
        var t = 0L
        repeat(24) {
            f.onMidi(MidiEvent.Clock(t))
            t += 20 * ms
        }
        assertNull(f.grid(t))
        f.onMidi(MidiEvent.Clock(t))
        assertNotNull(f.grid(t))
        assertNull(f.grid(t + 2100 * ms))
        f.reset()
        assertNull(f.grid(t))
    }

    @Test
    fun `opened mid-play, the tempo follows and the bar waits for a Start`() {
        val f = ClockFollow()
        var t = 0L
        val beats = ArrayList<Beat>()
        repeat(60) {
            f.onMidi(MidiEvent.Clock(t))?.let(beats::add)
            t += 20 * ms
        }
        assertEquals(listOf(0L, 1L, 2L), beats.map { it.index })
        assertTrue(beats.none { it.accent })
        val g = f.grid(t)!!
        assertFalse(g.barKnown)
        assertEquals(480e6, g.periodNs, 1.0)
        f.onMidi(MidiEvent.Start(t))
        val first = f.onMidi(MidiEvent.Clock(t))!!
        assertEquals(Beat(0, t, true), first)
    }

    @Test
    fun `a Start holds the tempo, so the grid is the device's from the first clock after it`() {
        val f = ClockFollow()
        val tick90 = 60e9 / 90 / 24
        repeat(72) { f.onMidi(MidiEvent.Clock(Math.round(it * tick90))) }
        f.onMidi(MidiEvent.Stop(2000 * ms))
        // A second with no clock (some devices send none while stopped), then Start.
        val s = 3000 * ms
        f.onMidi(MidiEvent.Start(s))
        assertNull(f.grid(s))
        assertEquals(Beat(0, s, true), f.onMidi(MidiEvent.Clock(s)))
        val g = f.grid(s)!!
        assertEquals(0L, g.beatIndex)
        assertEquals(s, g.anchor)
        assertTrue(g.barKnown)
        assertEquals(60e9 / 90, g.periodNs, 1000.0)
        // Laid through the clocks since, until there are enough to fit.
        for (i in 1 until 12) f.onMidi(MidiEvent.Clock(s + Math.round(i * tick90)))
        assertEquals((s + Math.round(60e9 / 90)).toDouble(), f.grid(s + 300 * ms)!!.at(1).toDouble(), 1000.0)
        // Continue holds it too; reset forgets it.
        f.onMidi(MidiEvent.Continue(s + 400 * ms))
        f.onMidi(MidiEvent.Clock(s + 400 * ms))
        assertEquals(60e9 / 90, f.grid(s + 400 * ms)!!.periodNs, 1000.0)
        f.reset()
        f.onMidi(MidiEvent.Start(s + 500 * ms))
        f.onMidi(MidiEvent.Clock(s + 500 * ms))
        assertNull(f.grid(s + 500 * ms))
    }
}
