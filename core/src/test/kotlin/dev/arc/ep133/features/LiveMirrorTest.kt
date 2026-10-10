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
    fun `project labels`() {
        assertEquals("Project 3", MirrorText.project(3))
        assertEquals("P3", MirrorText.projectShort(3))
        assertEquals("P12", MirrorText.projectShort(12))
    }

    @Test
    fun `forgetting learned pads drops their names and saves the empty map`() {
        val saved = ArrayList<Map<Int, Int>>()
        val m = mirror(learned = mapOf(0 to 10), saved = saved)
        m.onMidi(MidiEvent.NoteOn(1, 36, 90, 5 * ms))
        assertEquals("kick", m.snapshot(6 * ms).lastHit!!.name)
        m.forgetLearned()
        val s = m.snapshot(7 * ms)
        assertTrue(s.learned.isEmpty())
        assertEquals(null, s.lastHit!!.name)
        assertEquals(listOf(emptyMap<Int, Int>()), saved)
        // Nothing learned: nothing to save again.
        m.forgetLearned()
        assertEquals(1, saved.size)
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

    @Test
    fun `two pads of one group close together are not linked`() {
        val saved = ArrayList<Map<Int, Int>>()
        val m = mirror(saved = saved)
        // '7' and '1' in group A 5 ms apart (a flam, or a sequenced note during a press), then one push.
        m.onMidi(MidiEvent.NoteOn(1, 45, 100, 0))
        m.onMidi(MidiEvent.NoteOn(1, 39, 100, 5 * ms))
        m.onPadPush(PadFid(1, 0, 1), 20 * ms)
        assertTrue(m.snapshot(30 * ms).learned.isEmpty())
        assertTrue(saved.isEmpty())
        // A clean press afterwards links as usual.
        m.onMidi(MidiEvent.NoteOn(1, 45, 100, 1000 * ms))
        m.onPadPush(PadFid(1, 0, 1), 1010 * ms)
        assertEquals(mapOf(9 to 1), m.snapshot(1020 * ms).learned)
    }

    @Test
    fun `a pad number belongs to one key, and a relink renames the last hit`() {
        val saved = ArrayList<Map<Int, Int>>()
        // A wrong link from before: '8' (offset 10) said to be p01, and '7' said to be p10.
        val m = mirror(learned = mapOf(10 to 1, 9 to 10), saved = saved)
        m.onMidi(MidiEvent.NoteOn(1, 45, 100, 0)) // '7', named from the old link (p10 = slot 1)
        assertEquals("kick", m.snapshot(1).lastHit!!.name)
        m.onPadPush(PadFid(1, 0, 1), 10 * ms) // the device says '7' is p01
        val s = m.snapshot(20 * ms)
        assertEquals(mapOf(9 to 1), s.learned) // '8' no longer claims p01
        assertEquals(listOf(mapOf(9 to 1)), saved)
        assertEquals("snare", s.lastHit!!.name) // p01 = slot 5
    }

    @Test
    fun `while another project's pads load, hits get no name`() {
        val m = mirror(learned = mapOf(0 to 10))
        m.onMidi(MidiEvent.NoteOn(1, 37, 100, 0))
        m.onPadPush(PadFid(2, 0, 11), 10 * ms) // the device is on project 2 now
        m.onMidi(MidiEvent.NoteOn(1, 36, 100, 2000 * ms))
        assertNull(m.snapshot(2001 * ms).lastHit!!.name)
        // Project 2's pads arrive: the last hit is named from them.
        m.setProject(2, listOf(PadGroup("a", mapOf(10 to 20))))
        assertEquals("bass", m.snapshot(2002 * ms).lastHit!!.name)
    }

    @Test
    fun `a pause in the clock starts a fresh tempo`() {
        val m = mirror()
        val tick = 500 * ms / 24
        for (i in 0..47) m.onMidi(MidiEvent.Clock(i * tick))
        // 10 s pause, then Continue-less clocks at 120 BPM again.
        val t0 = 47 * tick + 10_000 * ms
        for (i in 0..30) m.onMidi(MidiEvent.Clock(t0 + i * tick))
        assertEquals(120.0, m.snapshot(t0 + 30 * tick).bpm!!, 0.01)
        // Continue also starts afresh.
        m.onMidi(MidiEvent.Continue(t0 + 31 * tick))
        assertNull(m.snapshot(t0 + 31 * tick).bpm)
    }
    @Test
    fun `the last read is saved and names pads again without the device`() {
        val json = mirror().saved(1_700_000_000_000L).toJson()
        val back = LiveSnapshot.fromJson(json)!!
        assertEquals(1_700_000_000_000L, back.savedAt)
        assertEquals(1, back.activeProject)
        assertEquals(listOf(PadGroup("a", mapOf(1 to 5, 10 to 1)), PadGroup("b", mapOf(1 to 20))), back.groups)
        assertEquals(mapOf(1 to "kick", 5 to "snare", 20 to "bass"), back.names)
        // A fresh mirror (no device) with the learned links names the pads from it.
        val offline = LiveMirror(learned = mapOf(9 to 10, 0 to 1)).apply { load(back) }
        assertEquals("kick", offline.nameOf(PhysicalPad(0, 9)))
        assertEquals("bass", offline.nameOf(PhysicalPad(1, 0)))
        assertEquals(1, offline.snapshot(0).activeProject)
    }

    // ---------- offline pad changes ----------

    @Test
    fun `offline changes name and fill their own pad, in their project only`() {
        val m = mirror(learned = mapOf(9 to 1, 0 to 10))
        // Pad '7' of A and of B both hold the device's slot 5 (snare).
        m.setProject(1, listOf(PadGroup("a", mapOf(1 to 5, 10 to 1)), PadGroup("b", mapOf(1 to 5))))
        val a7 = PhysicalPad(0, 9)
        val b7 = PhysicalPad(1, 9)
        val aDot = PhysicalPad(0, 0)
        m.onMidi(MidiEvent.NoteOn(1, 45, 100, 0))
        assertEquals("snare", m.snapshot(1).lastHit!!.name)
        // The factory pack's 5 is another sound, put on A '7' only; the device's 20 on A '.'.
        m.setLocal(
            OfflinePads.EMPTY
                .put(OfflinePad(1, 0, 1, 5, "vox", SoundSource.FACTORY))
                .put(OfflinePad(1, 0, 10, 20, "bass", SoundSource.DEVICE)),
        )
        assertEquals(5, m.slotOf(a7))
        assertEquals("vox", m.nameOf(a7))
        assertEquals("vox", m.snapshot(2).lastHit!!.name) // the display follows
        assertEquals("snare", m.nameOf(b7)) // the same device slot on another pad: unchanged
        assertEquals(PadSample(5, "vox", true), m.sampleOf(a7))
        assertEquals(PadSample(5, "snare", false), m.sampleOf(b7))
        assertEquals(SoundSource.FACTORY, m.localOf(a7)!!.source)
        assertNull(m.localOf(b7))
        assertEquals("bass", m.nameOf(aDot))
        assertEquals(PadTarget(1, 0, 10, 20), m.target(aDot))
        assertEquals(1, m.slotAt(0, 10)) // the read's own slot
        // What is saved stays the device read.
        val saved = m.saved(0)
        assertEquals(listOf(PadGroup("a", mapOf(1 to 5, 10 to 1)), PadGroup("b", mapOf(1 to 5))), saved.groups)
        assertEquals(mapOf(1 to "kick", 5 to "snare", 20 to "bass"), saved.names)
        // On another project the changes don't apply.
        m.setProject(2, listOf(PadGroup("a", mapOf(1 to 20))))
        assertNull(m.localOf(a7))
        assertEquals("bass", m.nameOf(a7))
        // Back, and cleared: the read's sounds again.
        m.setProject(1, listOf(PadGroup("a", mapOf(1 to 5, 10 to 1)), PadGroup("b", mapOf(1 to 5))))
        assertEquals("vox", m.nameOf(a7))
        m.setLocal(OfflinePads.EMPTY)
        assertEquals("snare", m.nameOf(a7))
        assertEquals("snare", m.snapshot(3).lastHit!!.name)
        assertEquals(PadTarget(1, 0, 10, 1), m.target(aDot))
    }

    @Test
    fun `a pad changed before it was pressed shows its change`() {
        // Nothing learned: no names, but a write would go to the top numbering ('7' = p01).
        val m = mirror()
        val a7 = PhysicalPad(0, 9)
        assertNull(m.nameOf(a7))
        m.setLocal(OfflinePads.EMPTY.put(OfflinePad(1, 0, 1, 343, "kick", SoundSource.FACTORY)))
        assertEquals("kick", m.nameOf(a7))
        assertEquals(PadTarget(1, 0, 1, 343), m.target(a7))
        assertNull(m.nameOf(PhysicalPad(1, 9))) // group B's '7' has no change
        assertNull(m.nameOf(PhysicalPad(0, 0)))
    }

    @Test
    fun `pad samples list each sound once, the changes over the read`() {
        val m = mirror()
        assertEquals(listOf(PadSample(1, "kick", false), PadSample(5, "snare", false), PadSample(20, "bass", false)), m.padSamples())
        m.setProject(1, listOf(PadGroup("a", mapOf(1 to 5, 10 to 1)), PadGroup("b", mapOf(1 to 5, 2 to 99))))
        // 99 has no name: nothing to load.
        assertEquals(listOf(PadSample(1, "kick", false), PadSample(5, "snare", false)), m.padSamples())
        m.setLocal(
            OfflinePads.EMPTY
                .put(OfflinePad(1, 0, 1, 5, "vox", SoundSource.FACTORY))
                .put(OfflinePad(1, 0, 10, 20, "bass", SoundSource.DEVICE))
                .put(OfflinePad(1, 2, 3, 30, "hat", SoundSource.DEVICE)) // a pad the read has no record of
                .put(OfflinePad(2, 0, 1, 40, "other", SoundSource.DEVICE)), // another project's
        )
        assertEquals(
            listOf(PadSample(5, "snare", false), PadSample(5, "vox", true), PadSample(20, "bass", false), PadSample(30, "hat", false)),
            m.padSamples(),
        )
    }

    @Test
    fun `a sample recorded offline plays from its file and has no slot yet`() {
        val m = mirror(learned = mapOf(9 to 1))
        val a7 = PhysicalPad(0, 9)
        // A '7' held the device's snare (slot 5); a recording replaces it.
        m.setLocal(OfflinePads.EMPTY.put(OfflinePad(1, 0, 1, 0, "mic 1007-142301", SoundSource.RECORDED, "rec-1.wav")))
        assertEquals(PadSample(0, "mic 1007-142301", false, "rec-1.wav"), m.sampleOf(a7))
        assertEquals("mic 1007-142301", m.nameOf(a7))
        // Slot 0 is a placeholder: the pad has no slot until the upload gives it one.
        assertNull(m.slotOf(a7))
        assertEquals(PadTarget(1, 0, 1, null), m.target(a7))
        assertEquals(
            listOf(PadSample(0, "mic 1007-142301", false, "rec-1.wav"), PadSample(1, "kick", false), PadSample(20, "bass", false)),
            m.padSamples(),
        )
    }

    @Test
    fun `an empty pad survives the round trip, and junk reads as nothing`() {
        val s = LiveSnapshot(5, null, listOf(PadGroup("c", mapOf(3 to null))), emptyMap())
        assertEquals(s, LiveSnapshot.fromJson(s.toJson()))
        assertNull(LiveSnapshot.fromJson("not json"))
        assertNull(LiveSnapshot.fromJson("""{"v":2,"savedAt":1}"""))
    }
}
