package dev.arc.ep133.controller

import dev.arc.ep133.audio.PadVoice
import dev.arc.ep133.audio.PcmSound
import dev.arc.ep133.features.Pattern
import dev.arc.ep133.features.PatternNote
import dev.arc.ep133.features.PatternRecorder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectPatterns
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TransportPhase
import dev.arc.ep133.features.TransportState
import dev.arc.ep133.features.barFrames
import dev.arc.ep133.formats.VoiceShape
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** What the controller hands the pattern sequencer, and how PATTERN shows. */
class PatternPlanTest {
    private val a1 = PhysicalPad(0, 1)
    private val b5 = PhysicalPad(1, 5)
    private val c0 = PhysicalPad(2, 0)
    private val sound = PcmSound(ShortArray(8), 2, 44_100, false)
    private val keysShape = VoiceShape(gain = 0.5f)

    private fun shape(pad: PhysicalPad, keys: Boolean) = if (keys) keysShape else VoiceShape(pan = pad.offset)

    @Test
    fun `each pad in memory gets its voice, shaped as a press and as a KEYS note`() {
        val (voices, missing) = patternVoices(setOf(a1, b5), { if (it == a1) sound else null }, ::shape)
        val v = voices.getValue(a1)
        assertSame(sound.pcm, v.pcm)
        assertEquals(2, v.channels)
        assertEquals(44_100, v.rate)
        assertEquals(VoiceShape(pan = 1), v.shape)
        assertEquals(keysShape, v.keysShape)
        assertEquals(setOf(a1), voices.keys)
        assertEquals(setOf(b5), missing)
    }

    @Test
    fun `an empty pad plays nothing and isn't missing`() {
        val (voices, missing) = patternVoices(setOf(a1, b5, c0), { null }, ::shape) { it != c0 }
        assertTrue(voices.isEmpty())
        assertEquals(setOf(a1, b5), missing)
    }

    @Test
    fun `voices made again from the same sounds and shapes are the same plan, another sound or shape isn't`() {
        val memory = { _: PhysicalPad -> sound }
        val first = patternVoices(setOf(a1, b5), memory, ::shape).first
        assertTrue(sameVoices(first, patternVoices(setOf(a1, b5), memory, ::shape).first))
        assertFalse(sameVoices(first, patternVoices(setOf(a1), memory, ::shape).first))
        // The same samples copied are another sound to the sequencer: only the very array is the same.
        val copy = PcmSound(sound.pcm.copyOf(), 2, 44_100, false)
        assertFalse(sameVoices(first, patternVoices(setOf(a1, b5), { copy }, ::shape).first))
        val turned = first + (a1 to PadVoice(sound.pcm, 2, 44_100, VoiceShape(pan = 9), keysShape))
        assertFalse(sameVoices(first, turned))
        assertTrue(sameVoices(emptyMap(), emptyMap()))
    }

    @Test
    fun `the tempo is the EP-133's to 0,1 BPM while it sends its clock, else the phone's`() {
        assertEquals(98.0, patternBpm(null, 98))
        assertEquals(123.5, patternBpm(123.46, 98))
        assertEquals(124.0, patternBpm(123.96, 98))
        assertEquals(98.0, patternBpm(0.0, 98))
        // The phone's kept tempo is always one TEMPO offers.
        assertEquals(240.0, patternBpm(null, 999))
    }

    @Test
    fun `the count-in counts the bar before tick 0, 1 to 4 as each beat is heard`() {
        assertNull(countInBeat(-Seq.TICKS_PER_BAR - 1.0))
        assertEquals(1, countInBeat(-Seq.TICKS_PER_BAR.toDouble()))
        assertEquals(1, countInBeat(-Seq.TICKS_PER_BAR + 95.9))
        assertEquals(2, countInBeat(-Seq.TICKS_PER_BAR + 96.0))
        assertEquals(4, countInBeat(-0.1))
        assertNull(countInBeat(0.0))
        assertNull(countInBeat(500.0))
    }

    @Test
    fun `a take's ticks are frames at the input's rate, rounded as bars are`() {
        assertEquals(barFrames(1, 120.0, 48_000), ticksToFrames(Seq.TICKS_PER_BAR.toLong(), 120.0, 48_000))
        assertEquals(barFrames(3, 97.3, 44_100), ticksToFrames(3L * Seq.TICKS_PER_BAR, 97.3, 44_100))
        assertEquals(0L, ticksToFrames(0, 120.0, 48_000))
    }

    @Test
    fun `the line shows each group's length and notes, the pads with notes and the transport`() {
        val p = ProjectPatterns()
            .with(0, Pattern(2, listOf(PatternNote(0, 1, 24), PatternNote(96, 1, 24, semitones = 3))))
            // A note past the end (the length made shorter) still has a dot: ERASE takes it too.
            .with(1, Pattern(1, listOf(PatternNote(Seq.TICKS_PER_BAR + 10, 5, 24))))
            .with(3, Pattern(8))
        val ui = patternShown(PatternUiState(focusGroup = 3, erase = true), p, TransportState(TransportPhase.PLAYING, recording = true), canUndo = true)
        assertEquals(listOf(2, 1, 1, 8), ui.bars)
        assertEquals(listOf(true, true, false, false), ui.hasNotes)
        assertEquals(setOf(a1, b5), ui.notePads)
        assertEquals(TransportPhase.PLAYING, ui.phase)
        assertTrue(ui.recording)
        assertTrue(ui.canUndo)
        assertTrue(ui.running)
        assertTrue(ui.anyNotes)
        // What the controller holds stays as it was.
        assertEquals(3, ui.focusGroup)
        assertTrue(ui.erase)
    }

    @Test
    fun `the count-in's beat goes once the transport counts no more`() {
        val counting = PatternUiState(phase = TransportPhase.COUNT_IN, countIn = 3)
        val p = ProjectPatterns()
        assertEquals(3, patternShown(counting, p, TransportState(TransportPhase.COUNT_IN, recording = true), false).countIn)
        assertNull(patternShown(counting, p, TransportState(TransportPhase.PLAYING, recording = true), false).countIn)
        assertNull(patternShown(counting, p, TransportState(), false).countIn)
        assertFalse(patternShown(counting, p, TransportState(TransportPhase.ARMED), false).running)
        assertFalse(PatternUiState().anyNotes)
    }

    @Test
    fun `a press that was no press after all takes its note back out, and only it`() {
        val kept = PatternNote(0, 1, 24, id = 4)
        val p = ProjectPatterns().with(1, Pattern(1, listOf(kept, PatternNote(96, 5, 24, id = 7))))
        val out = withoutNote(p, 7)
        assertEquals(listOf(kept), out.group(1).notes)
        assertSame(p, withoutNote(p, 9))
        assertSame(p, withoutNote(p, 0))
    }

    @Test
    fun `notes still held as recording stops end there, not a grid step on`() {
        val r = PatternRecorder()
        val start = r.punchIn(ProjectPatterns(), fromStop = true, autoLength = false)
        val held = r.noteOn(start, PhysicalPad(0, 3), null, 96.0, 96.0, Timing.SIXTEENTH)
        val let = r.noteOn(held.patterns, PhysicalPad(0, 4), 2, 192.0, 192.0, Timing.SIXTEENTH)
        // Recorded with a step's gate until let go of.
        assertEquals(listOf(24, 24), let.patterns.group(0).notes.map { it.gate })
        val out = heldNotesEnded(let.patterns, r, listOf(held.id, let.id), 300.0)
        assertEquals(listOf(204, 108), out.group(0).notes.map { it.gate })
        assertSame(let.patterns, heldNotesEnded(let.patterns, r, emptyList(), 300.0))
    }
}
