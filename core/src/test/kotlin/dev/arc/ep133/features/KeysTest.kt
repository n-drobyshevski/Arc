package dev.arc.ep133.features

import dev.arc.ep133.formats.Pitch
import dev.arc.ep133.protocol.MidiEvent
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class KeysTest {
    @Test
    fun `twelve notes per scale, continuing up an octave`() {
        assertEquals((60..71).toList(), Keys.notes(0, Scale.CHROMATIC, 4))
        assertEquals(listOf(60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79), Keys.notes(0, Scale.MAJOR, 4))
        // A minor pentatonic from LA3.
        assertEquals(listOf(57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84), Keys.notes(9, Scale.MINOR_PENTATONIC, 3))
        // Stays inside MIDI.
        assertTrue(Keys.notes(11, Scale.MINOR_PENTATONIC, 9).all { it in 0..127 })
    }

    @Test
    fun `fixed-do names and octaves`() {
        assertEquals(listOf("DO", "DI", "RE", "MI", "SI", "TI"), listOf(60, 61, 62, 64, 68, 71).map(Keys::solfege))
        assertEquals(4, Keys.octaveOf(60))
        assertEquals(2, Keys.octaveOf(36))
    }

    @Test
    fun `a device note lights its key, or one with its name`() {
        val keys = Keys.notes(0, Scale.MAJOR, 4)
        assertEquals(2, Keys.keyFor(64, keys))
        assertEquals(2, Keys.keyFor(52, keys)) // MI3: the MI on the grid
        assertNull(Keys.keyFor(61, keys)) // DI isn't in C major
    }

    private fun pcm(vararg v: Int) = ByteArray(v.size * 2).also { b ->
        v.forEachIndexed { i, x -> b[2 * i] = x.toByte(); b[2 * i + 1] = (x shr 8).toByte() }
    }

    @Test
    fun `an octave up is half as long, an octave down twice, and zero is unchanged`() {
        val src = pcm(0, 100, 200, 300, 400, 500, 600, 700, 800)
        assertArrayEquals(src, Pitch.shift(src, 1, 0))
        assertArrayEquals(pcm(0, 200, 400, 600, 800), Pitch.shift(src, 1, 12))
        assertEquals(17 * 2, Pitch.shift(src, 1, -12).size)
        // Stereo frames stay together.
        assertArrayEquals(pcm(1, -1, 3, -3), Pitch.shift(pcm(1, -1, 2, -2, 3, -3), 2, 12))
    }

    @Test
    fun `the mirror keeps every note for KEYS, and they fade like pads`() {
        val m = LiveMirror()
        m.onMidi(MidiEvent.NoteOn(1, 64, 90, 0))
        m.onMidi(MidiEvent.NoteOn(1, 40, 80, 0)) // a pad note counts too
        var s = m.snapshot(1)
        assertEquals(setOf(64, 40), s.notes.keys)
        assertEquals(40, s.lastNote)
        m.onMidi(MidiEvent.NoteOff(1, 64, 10))
        s = m.snapshot(11)
        assertEquals(10L, s.notes[64]!!.offAt)
        assertNull(m.snapshot(10 + LiveMirror.FADE_NS + 1).notes[64])
        m.onMidi(MidiEvent.Stop(20))
        assertEquals(20L, m.snapshot(21).notes[40]!!.offAt)
    }
}
