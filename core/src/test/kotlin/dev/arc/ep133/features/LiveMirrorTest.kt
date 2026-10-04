package dev.arc.ep133.features

import dev.arc.ep133.protocol.MidiEvent
import dev.arc.ep133.protocol.MidiInput
import dev.arc.ep133.text.MirrorText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LiveMirrorTest {
    private fun parse(vararg bytes: Int, time: Long = 7L): List<MidiEvent> {
        val out = ArrayList<MidiEvent>()
        MidiInput { out.add(it) }.feed(ByteArray(bytes.size) { bytes[it].toByte() }, time = time)
        return out
    }

    // ---------- MIDI input ----------

    @Test
    fun `notes, running status and velocity zero`() {
        assertEquals(
            listOf(
                MidiEvent.NoteOn(1, 36, 100, 7),
                MidiEvent.NoteOn(1, 37, 90, 7), // running status
                MidiEvent.NoteOff(1, 36, 7), // velocity 0
                MidiEvent.NoteOff(2, 48, 7),
                MidiEvent.ControlChange(16, 12, 64, 7),
            ),
            parse(0x90, 36, 100, 37, 90, 36, 0, 0x81, 48, 0, 0xBF, 12, 64),
        )
    }

    @Test
    fun `real-time bytes anywhere, SysEx and other messages skipped`() {
        assertEquals(
            listOf(
                MidiEvent.Start(7),
                MidiEvent.Clock(7), // inside a note message
                MidiEvent.NoteOn(1, 40, 64, 7),
                MidiEvent.Clock(7), // inside a SysEx
                MidiEvent.Stop(7),
                MidiEvent.NoteOn(1, 41, 1, 7),
            ),
            parse(
                0xFA, 0x90, 40, 0xF8, 64,
                0xF0, 0x00, 0x20, 0xF8, 0x76, 0x33, 0xF7,
                // program change, channel pressure and song position: parsed for length, dropped
                0xC0, 5, 0xD0, 9, 0xF2, 1, 2,
                // a stray data byte after system common has no status to belong to
                10,
                0xFC, 0xFE, 0x90, 41, 1,
            ),
        )
        // A note interrupted by SysEx is abandoned rather than finished with SysEx bytes.
        assertEquals(emptyList<MidiEvent>(), parse(0x90, 40, 0xF0, 1, 2, 0xF7, 3))
    }

    @Test
    fun `fed in pieces, as USB packets arrive`() {
        val out = ArrayList<MidiEvent>()
        val p = MidiInput { out.add(it) }
        p.feed(byteArrayOf(0x92.toByte(), 60), time = 1)
        p.feed(byteArrayOf(127, 61), time = 2)
        p.feed(byteArrayOf(5), time = 3)
        assertEquals(listOf(MidiEvent.NoteOn(3, 60, 127, 2), MidiEvent.NoteOn(3, 61, 5, 3)), out)
    }

    // ---------- note map ----------

    @Test
    fun `the official note map`() {
        assertEquals(PhysicalPad(0, 0), PadNotes.pad(36))
        assertEquals(".", PadNotes.pad(36)!!.label)
        assertEquals("ENTER", PadNotes.pad(38)!!.label)
        assertEquals("1", PadNotes.pad(39)!!.label)
        assertEquals("9", PadNotes.pad(47)!!.label)
        assertEquals(PhysicalPad(3, 11), PadNotes.pad(83))
        assertEquals('D', PadNotes.pad(83)!!.groupLetter)
        assertNull(PadNotes.pad(35))
        assertNull(PadNotes.pad(84))
        for (n in 36..83) assertEquals(n, PadNotes.note(PadNotes.pad(n)!!))
        // The keypad top row is 7 8 9 and the bottom row . 0 ENTER.
        assertEquals(listOf("7", "8", "9"), PadNotes.ROWS[0].map { PadNotes.LABELS[it] })
        assertEquals(listOf(".", "0", "ENTER"), PadNotes.ROWS[3].map { PadNotes.LABELS[it] })
        assertEquals((0..11).toList(), PadNotes.ROWS.flatten().sorted())
        assertEquals("C2", PadNotes.noteName(36))
        assertEquals("C4", PadNotes.noteName(60))
        assertEquals("C#-1", PadNotes.noteName(1))
    }

    // ---------- mirror ----------

    private val ms = 1_000_000L

    private fun mirror(learned: Map<Int, Int> = emptyMap(), saved: MutableList<Map<Int, Int>> = ArrayList()) =
        LiveMirror(learned, onLearned = { saved.add(it) }).apply {
            // Group A: p01 holds slot 5, p10 slot 1. Group B: p01 slot 20.
            setProject(1, listOf(PadGroup("a", mapOf(1 to 5, 10 to 1)), PadGroup("b", mapOf(1 to 20))))
            setNames(mapOf(1 to "kick", 5 to "snare", 20 to "bass"))
        }

    @Test
    fun `a pad lights and names nothing until it is learned`() {
        val m = mirror()
        m.onMidi(MidiEvent.NoteOn(1, 36, 100, 10 * ms))
        val s = m.snapshot(11 * ms)
        assertEquals(PadLight(100, 1, 10 * ms), s.pads[PhysicalPad(0, 0)])
        assertEquals(Hit(PhysicalPad(0, 0), 36, 1, 100, null, null), s.lastHit)
        assertTrue(s.learned.isEmpty())
        assertEquals("A . \u00B7 100", MirrorText.hit(s.lastHit!!))
    }

    @Test
    fun `a note and a push together link the pad, in either order, and are kept`() {
        val saved = ArrayList<Map<Int, Int>>()
        val m = mirror(saved = saved)
        // Pad '.' (offset 0) is p10 in the project file; the push comes 40 ms after the note.
        m.onMidi(MidiEvent.NoteOn(1, 36, 100, 10 * ms))
        m.onPadPush(PadFid(1, 0, 10), 50 * ms)
        var s = m.snapshot(60 * ms)
        assertEquals(mapOf(0 to 10), s.learned)
        assertEquals(listOf(mapOf(0 to 10)), saved)
        assertEquals(Hit(PhysicalPad(0, 0), 36, 1, 100, 1, "kick"), s.lastHit)
        assertEquals("A . \u00B7 001 kick \u00B7 100", MirrorText.hit(s.lastHit!!))
        // Push first, then the note, in group B: offset 9 ('7') is p01.
        m.onPadPush(PadFid(1, 1, 1), 100 * ms)
        m.onMidi(MidiEvent.NoteOn(1, 57, 80, 120 * ms))
        s = m.snapshot(130 * ms)
        assertEquals(mapOf(0 to 10, 9 to 1), s.learned)
        assertEquals("bass", s.lastHit!!.name)
        // The same link holds in another group: group A pad '7' is p01 = slot 5.
        m.onMidi(MidiEvent.NoteOn(1, 45, 70, 2000 * ms))
        assertEquals("snare", m.snapshot(2001 * ms).lastHit!!.name)
    }

    @Test
    fun `sequenced notes use what was learned, and far-apart events do not link`() {
        val m = mirror(learned = mapOf(0 to 10))
        m.onMidi(MidiEvent.NoteOn(1, 36, 90, 5 * ms))
        assertEquals("kick", m.snapshot(6 * ms).lastHit!!.name)
        // A push 400 ms after a note (a sequenced note, then a later press elsewhere) is no pair.
        m.onMidi(MidiEvent.NoteOn(1, 37, 90, 1000 * ms))
        m.onPadPush(PadFid(1, 0, 4), 1400 * ms)
        assertEquals(mapOf(0 to 10), m.snapshot(1500 * ms).learned)
        // A push for another group is no pair either.
        m.onMidi(MidiEvent.NoteOn(1, 38, 90, 3000 * ms))
        m.onPadPush(PadFid(1, 2, 4), 3001 * ms)
        assertEquals(mapOf(0 to 10), m.snapshot(3002 * ms).learned)
        assertTrue(m.snapshot(3002 * ms).pushesSeen)
    }

    @Test
    fun `another project's layout changes the names`() {
        val m = mirror(learned = mapOf(0 to 10))
        m.setProject(2, listOf(PadGroup("a", mapOf(10 to 20))))
        m.onMidi(MidiEvent.NoteOn(1, 36, 90, 5 * ms))
        val s = m.snapshot(6 * ms)
        assertEquals(2, s.activeProject)
        assertEquals("bass", s.lastHit!!.name)
    }

    @Test
    fun `release, fade and keys notes`() {
        val m = mirror()
        m.onMidi(MidiEvent.NoteOn(1, 40, 64, 0))
        m.onMidi(MidiEvent.NoteOff(1, 40, 100 * ms))
        assertEquals(100 * ms, m.snapshot(200 * ms).pads[PhysicalPad(0, 4)]!!.offAt)
        assertTrue(m.snapshot(100 * ms + LiveMirror.FADE_NS + 1).pads.isEmpty())
        // Notes outside 36-83 (KEYS mode) are held on the keys strip.
        m.onMidi(MidiEvent.NoteOn(3, 90, 50, 0))
        var s = m.snapshot(1)
        assertEquals(mapOf(90 to 3), s.keysHeld)
        assertEquals(90, s.lastKeysNote)
        assertEquals("F#6 \u00B7 ch 3 \u00B7 50", MirrorText.hit(s.lastHit!!))
        m.onMidi(MidiEvent.NoteOff(3, 90, 2))
        s = m.snapshot(3)
        assertTrue(s.keysHeld.isEmpty())
        assertEquals(90, s.lastKeysNote)
    }

    @Test
    fun `transport and tempo from clock`() {
        val m = mirror()
        assertNull(m.snapshot(0).playing)
        m.onMidi(MidiEvent.Start(0))
        // 120 BPM: 24 clocks per beat, a beat every 500 ms.
        val tick = 500 * ms / 24
        for (i in 0..47) m.onMidi(MidiEvent.Clock(i * tick))
        val s = m.snapshot(47 * tick)
        assertEquals(true, s.playing)
        assertEquals(120.0, s.bpm!!, 0.01)
        assertEquals("120.0 BPM", MirrorText.bpm(s.bpm!!))
        // Too few clocks, or none for 2 s: no tempo.
        assertNull(m.snapshot(47 * tick + LiveMirror.CLOCK_TIMEOUT_NS + 1).bpm)
        m.onMidi(MidiEvent.NoteOn(1, 36, 1, 0))
        m.onMidi(MidiEvent.Stop(10))
        val stopped = m.snapshot(11)
        assertEquals(false, stopped.playing)
        // Stop releases held pads, so a lost note-off can't leave one lit.
        assertEquals(10L, stopped.pads[PhysicalPad(0, 0)]!!.offAt)
        m.onMidi(MidiEvent.Start(20))
        m.onMidi(MidiEvent.Clock(21))
        assertNull(m.snapshot(22).bpm)
    }
}
