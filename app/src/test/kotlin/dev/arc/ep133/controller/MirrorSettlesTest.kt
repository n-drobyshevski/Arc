package dev.arc.ep133.controller

import dev.arc.ep133.features.LiveMirror
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.PadLight
import dev.arc.ep133.features.PhysicalPad
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

class MirrorSettlesTest {
    private val ms = 1_000_000L

    @Test
    fun `nothing fading and no tempo sleeps until the device sends something`() {
        assertNull(mirrorSettlesIn(MirrorState(), 0))
        // A pad still held changes only when it is let go of.
        assertNull(mirrorSettlesIn(MirrorState(pads = mapOf(PhysicalPad(0, 0) to PadLight(100, 0, 0))), 0))
    }

    @Test
    fun `a released pad or note wakes it just past its fade`() {
        val now = 500 * ms
        val pads = mapOf(PhysicalPad(0, 0) to PadLight(100, 0, 0, offAt = 400 * ms))
        val notes = mapOf(60 to PadLight(100, 0, 0, offAt = 300 * ms))
        assertEquals((400 * ms + LiveMirror.FADE_NS - now) / ms + 5, mirrorSettlesIn(MirrorState(pads = pads), now))
        assertEquals((300 * ms + LiveMirror.FADE_NS - now) / ms + 5, mirrorSettlesIn(MirrorState(pads = pads, notes = notes), now))
        // Overdue: at once.
        assertEquals(1L, mirrorSettlesIn(MirrorState(pads = pads), 10_000 * ms))
    }

    @Test
    fun `a tempo showing is looked at again a few times a second`() {
        assertEquals(250L, mirrorSettlesIn(MirrorState(bpm = 120.0), 0))
        val pads = mapOf(PhysicalPad(0, 0) to PadLight(100, 0, 0, offAt = 0))
        assertEquals(250L, mirrorSettlesIn(MirrorState(pads = pads, bpm = 120.0), 0))
    }

    @Test
    fun `a tempo that wobbles below the display's precision keeps the state shown`() {
        val shown = MirrorState(bpm = 120.01)
        assertSame(shown, shownMirror(shown, MirrorState(bpm = 120.04)))
        // Another tenth, or anything else changed, is a new state.
        val faster = MirrorState(bpm = 120.16)
        assertSame(faster, shownMirror(shown, faster))
        val hit = MirrorState(bpm = 120.02, pads = mapOf(PhysicalPad(0, 0) to PadLight(100, 0, 0)))
        assertSame(hit, shownMirror(shown, hit))
        val stopped = MirrorState()
        assertSame(stopped, shownMirror(shown, stopped))
        assertSame(shown, shownMirror(null, shown))
    }
}
