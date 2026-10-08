package dev.arc.ep133.controller

import dev.arc.ep133.audio.PadVoice
import dev.arc.ep133.features.ArpNote
import dev.arc.ep133.features.ArpOrder
import dev.arc.ep133.features.ArpSettings
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TimingSettings
import dev.arc.ep133.formats.VoiceShape
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The notes the arp plays as the controller keeps them: presses, releases, latch, pressure, and the plan and line from them. */
class ArpPlanTest {
    private val keysPad = PhysicalPad(0, 4)
    private val a7 = PhysicalPad(0, 9)
    private val b1 = PhysicalPad(1, 3)
    private val desk = ArpDesk()

    private fun key(semis: Int) = ArpNote(keysPad, semis)

    private fun noteKey(semis: Int) = "note:${60 + semis}"

    private fun hit(pad: PhysicalPad) = ArpNote(pad, null)

    private fun padKey(pad: PhysicalPad) = "live:${pad.group}:${pad.offset}"

    // A finger down on KEYS note [semis] at [at].
    private fun down(semis: Int, at: Long = 1L, latch: Boolean = false) = desk.press(noteKey(semis), key(semis), true, at, latch)

    @Test
    fun `presses gather in the order pressed, the first starting the run, and each finger up lets its note go`() {
        assertTrue(down(7, at = 100))
        assertFalse(down(0, at = 200))
        assertFalse(down(4, at = 300))
        assertEquals(listOf(key(7), key(0), key(4)), desk.notes)
        assertTrue(desk.keys)
        assertEquals(100L, desk.pressNanos)
        assertTrue(desk.release(noteKey(0), latch = false))
        assertEquals(listOf(key(7), key(4)), desk.notes)
        // A finger never down lets nothing go.
        assertFalse(desk.release(noteKey(11), latch = false))
        desk.release(noteKey(7), latch = false)
        desk.release(noteKey(4), latch = false)
        assertTrue(desk.notes.isEmpty())
        assertFalse(desk.anyDown)
        // Pressed again, a run of its own.
        assertTrue(down(2, at = 900))
        assertEquals(900L, desk.pressNanos)
    }

    @Test
    fun `a press a scroll may take tells its time once kept, and nothing once cut`() {
        assertTrue(desk.press(padKey(a7), hit(a7), false, 50, false, unsure = true))
        assertEquals(listOf(hit(a7)), desk.notes)
        assertEquals(50L, desk.keep(padKey(a7)))
        // Kept once: RECORD isn't started by it again.
        assertNull(desk.keep(padKey(a7)))
        desk.press(padKey(b1), hit(b1), false, 60, false, unsure = true)
        assertTrue(desk.cut(padKey(b1)))
        assertNull(desk.keep(padKey(b1)))
        // A sure press has nothing to keep.
        desk.press(padKey(b1), hit(b1), false, 70, false)
        assertNull(desk.keep(padKey(b1)))
        desk.press(padKey(keysPad), hit(keysPad), false, 80, false, unsure = true)
        desk.clear()
        assertNull(desk.keep(padKey(keysPad)))
    }

    @Test
    fun `the same note under two fingers plays once and goes with the last of them`() {
        desk.press("note:60", key(0), true, 1, false)
        desk.press("grid:60", key(0), true, 2, false)
        assertEquals(listOf(key(0)), desk.notes)
        assertFalse(desk.release("note:60", latch = false))
        assertEquals(listOf(key(0)), desk.notes)
        assertTrue(desk.release("grid:60", latch = false))
        assertTrue(desk.notes.isEmpty())
    }

    @Test
    fun `latched, the notes stay after the fingers are up, and a press after that starts a set of its own`() {
        down(0, at = 10, latch = true)
        down(4, at = 20, latch = true)
        assertFalse(desk.release(noteKey(0), latch = true))
        // A finger still down: the next press joins the set.
        assertFalse(down(7, at = 30, latch = true))
        desk.release(noteKey(4), latch = true)
        desk.release(noteKey(7), latch = true)
        assertEquals(listOf(key(0), key(4), key(7)), desk.notes)
        assertEquals(10L, desk.pressNanos)
        // Every finger up: the next press is a new set, and a new run.
        assertTrue(down(9, at = 40, latch = true))
        assertEquals(listOf(key(9)), desk.notes)
        assertEquals(40L, desk.pressNanos)
        // LATCH off: what no finger holds goes.
        assertFalse(down(2, at = 50, latch = true))
        desk.release(noteKey(9), latch = true)
        assertTrue(desk.unlatch())
        assertEquals(listOf(key(2)), desk.notes)
        assertFalse(desk.unlatch())
    }

    @Test
    fun `a scroll's press goes latched or not, and clear forgets everything`() {
        desk.press(padKey(a7), hit(a7), false, 1, true)
        desk.press(padKey(b1), hit(b1), false, 2, true)
        assertTrue(desk.cut(padKey(b1)))
        assertEquals(listOf(hit(a7)), desk.notes)
        assertFalse(desk.cut(padKey(b1)))
        assertTrue(desk.clear())
        assertTrue(desk.notes.isEmpty())
        assertFalse(desk.anyDown)
        assertFalse(desk.clear())
    }

    @Test
    fun `KEYS notes and pad hits don't arp together, one of the other kind starts a set of its own`() {
        down(0, at = 1)
        down(4, at = 2)
        assertTrue(desk.press(padKey(a7), hit(a7), false, 3, false))
        assertFalse(desk.keys)
        assertEquals(listOf(hit(a7)), desk.notes)
        assertEquals(3L, desk.pressNanos)
        // The KEYS fingers' release lets nothing of the pads' go.
        assertFalse(desk.release(noteKey(0), latch = false))
        assertEquals(listOf(hit(a7)), desk.notes)
        assertFalse(desk.press(padKey(b1), hit(b1), false, 4, false))
        assertEquals(listOf(hit(a7), hit(b1)), desk.notes)
    }

    @Test
    fun `pressure is velocity only once the phone shows it tells pressure`() {
        assertEquals(1, pressureVelocity(0f))
        assertEquals(64, pressureVelocity(0.5f))
        assertEquals(127, pressureVelocity(1f))
        assertEquals(127, pressureVelocity(3f))
        down(0)
        // The same pressure every touch (many phones): none to play with.
        assertFalse(desk.pressure(noteKey(0), 1f))
        assertFalse(desk.pressure(noteKey(0), 1f))
        assertEquals(127, desk.notes.single().velocity)
        // Pressures that spread: light is soft, hard is loud.
        assertTrue(desk.pressure(noteKey(0), 0.2f))
        assertEquals(1, desk.notes.single().velocity)
        assertTrue(desk.pressure(noteKey(0), 0.6f))
        assertEquals(pressureVelocity(0.5f), desk.notes.single().velocity)
        assertFalse(desk.pressure(noteKey(0), 0.6f))
        // A finger not down changes nothing, though its pressure is seen.
        assertFalse(desk.pressure(noteKey(5), 0.9f))
        // Latched and up, the note keeps the velocity it had.
        desk.release(noteKey(0), latch = true)
        assertEquals(64, desk.notes.single().velocity)
    }

    @Test
    fun `the plan is the notes on their voices at the settings, null with none`() {
        val timing = TimingSettings(Timing.EIGHTH, 60)
        val arp = ArpSettings(ArpOrder.UP, 2, 75, false)
        val voice = PadVoice(ShortArray(4), 1, 44_100, VoiceShape.DEFAULT, VoiceShape(gain = 0.5f))
        val voices = mapOf(keysPad to voice)
        assertNull(desk.plan(voices, timing, arp, 120.0))
        down(4, at = 0x1_0000_0002L)
        down(0, at = 5)
        val p = desk.plan(voices, timing, arp, 97.5)!!
        assertEquals(listOf(key(4), key(0)), p.notes)
        assertSame(voices, p.voices)
        assertTrue(p.keys)
        assertEquals(timing, p.timing)
        assertEquals(arp, p.settings)
        assertEquals(97.5, p.bpm)
        assertEquals(0x1_0000_0002L, p.pressNanos)
        // The run's own seed, the same for every plan of it.
        assertEquals(3, p.seed)
        assertEquals(p.seed, desk.plan(voices, timing, arp, 120.0)!!.seed)
        desk.clear()
        down(4, at = 77)
        assertNotEquals(p.seed, desk.plan(voices, timing, arp, 120.0)!!.seed)
    }

    @Test
    fun `Live shows the notes, and the display line while the arp plays`() {
        val timing = TimingSettings()
        val off = desk.ui(false, ArpSettings.DEFAULT, timing, NoteNames.SOLFEGE)
        assertFalse(off.on)
        assertFalse(off.sounding)
        assertNull(off.line)
        down(5)
        down(9)
        down(0)
        val on = desk.ui(true, ArpSettings.DEFAULT, timing, NoteNames.SOLFEGE)
        assertTrue(on.on && on.sounding && on.keys)
        assertEquals(listOf(key(5), key(9), key(0)), on.held)
        assertEquals("ARP · 1/16 · FA LA DO", on.line)
        // Off with notes held: nothing plays, no line.
        assertNull(desk.ui(false, ArpSettings.DEFAULT, timing, NoteNames.SOLFEGE).line)
        desk.clear()
        desk.press(padKey(a7), hit(a7), false, 1, true)
        desk.press(padKey(b1), hit(b1), false, 2, true)
        val latched = ArpSettings.DEFAULT.withLatch(true)
        val rpt = desk.ui(true, latched, TimingSettings(Timing.THIRTY_SECOND), NoteNames.LETTERS)
        assertTrue(rpt.latch)
        assertFalse(rpt.keys)
        assertEquals("REPEAT ∞ · 1/32 · A 7, B 1", rpt.line)
    }
}
