package dev.arc.ep133.ui.screens

import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.SampleUiState
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.SamplePhase
import dev.arc.ep133.text.MirrorText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** SAMPLE's line, strip and pad lights: what they say and how they lay out. */
class LiveSamplerTest {
    private val pad = PhysicalPad(0, 2)
    private val other = PhysicalPad(1, 9)

    @Test
    fun `the line says what a pad does, the wait, the count-in, the time and the upload`() {
        val s = SampleUiState(on = true)
        assertEquals(MirrorText.SAMPLE_READY, sampleStatus(s))
        assertEquals(MirrorText.SAMPLE_READY_LATCH, sampleStatus(s.copy(latch = true)))
        assertEquals(MirrorText.diskLow(12), sampleStatus(s.copy(lowSpace = true, maxSeconds = 12, latch = true)))
        assertEquals(MirrorText.SAMPLE_WAITING, sampleStatus(s.copy(phase = SamplePhase.Waiting(pad))))
        assertEquals(MirrorText.WAITING_FOR_PLAY, sampleStatus(s.copy(phase = SamplePhase.WaitingForPlay(pad))))
        assertEquals(MirrorText.countIn(3), sampleStatus(s.copy(phase = SamplePhase.CountIn(pad, 3))))
        assertEquals("0:04 / 0:20", sampleStatus(s.copy(phase = SamplePhase.Recording(pad, 4, 20, false))))
        assertEquals(MirrorText.sampleUploading(pad, 40), sampleStatus(s.copy(phase = SamplePhase.Uploading(pad, 40))))
    }

    @Test
    fun `a screen reader hears the take's pad, not its running time`() {
        val s = SampleUiState(on = true, phase = SamplePhase.Recording(pad, 4, 20, false))
        assertEquals(MirrorText.padTitle(pad) + ", " + MirrorText.REC, sampleSpoken(s))
        assertEquals(MirrorText.SAMPLE_READY, sampleSpoken(s.copy(phase = SamplePhase.Ready)))
    }

    @Test
    fun `a screen reader hears an upload once, not each share of it`() {
        val s = SampleUiState(on = true)
        assertEquals(MirrorText.padTitle(pad) + ": uploading", sampleSpoken(s.copy(phase = SamplePhase.Uploading(pad, 12))))
        assertEquals(sampleSpoken(s.copy(phase = SamplePhase.Uploading(pad, 12))), sampleSpoken(s.copy(phase = SamplePhase.Uploading(pad, 27))))
        assertEquals(MirrorText.padTitle(pad) + ": uploading, 12%", sampleStatus(s.copy(phase = SamplePhase.Uploading(pad, 12))))
    }

    @Test
    fun `a tap on SAMPLE stops a hands-free take or what comes before one, not a held take`() {
        assertTrue(handsFreeTake(SamplePhase.Waiting(pad, latched = true)))
        assertFalse(handsFreeTake(SamplePhase.Waiting(pad, latched = false)))
        assertTrue(handsFreeTake(SamplePhase.CountIn(pad, 2)))
        assertTrue(handsFreeTake(SamplePhase.WaitingForPlay(pad)))
        assertTrue(handsFreeTake(SamplePhase.Recording(pad, 3, 20, latched = true)))
        assertFalse(handsFreeTake(SamplePhase.Recording(pad, 3, 20, latched = false)))
        assertFalse(handsFreeTake(SamplePhase.Ready))
        assertFalse(handsFreeTake(SamplePhase.Uploading(pad, 5)))
    }

    @Test
    fun `the take's pad lights up, the others show whether they have a sound`() {
        val rec = SamplePhase.Recording(pad, 1, 20, false)
        assertEquals(SampleLed.RECORDING, sampleLed(pad, rec, filled = true))
        assertEquals(SampleLed.FILLED, sampleLed(other, rec, filled = true))
        assertEquals(SampleLed.EMPTY, sampleLed(other, rec, filled = false))
        // Counting in, or waiting for sound or PLAY: lit, and heard as waiting rather than recording.
        assertEquals(SampleLed.WAITING, sampleLed(pad, SamplePhase.CountIn(pad, 1), filled = false))
        assertEquals(SampleLed.WAITING, sampleLed(pad, SamplePhase.Waiting(pad), filled = true))
        assertEquals(SampleLed.WAITING, sampleLed(pad, SamplePhase.WaitingForPlay(pad), filled = false))
        assertEquals(SampleLed.EMPTY, sampleLed(pad, SamplePhase.Uploading(pad, 10), filled = false))
        assertNull(SamplePhase.Ready.takePad())
    }

    @Test
    fun `knob Y is Off at its left end, then whole dB from -60 to 0`() {
        assertNull(thresholdOfKnob(THRESHOLD_OFF))
        assertNull(thresholdOfKnob(THRESHOLD_OFF + 0.4f))
        assertEquals(-60f, thresholdOfKnob(-60.4f))
        assertEquals(-24f, thresholdOfKnob(-23.7f))
        assertEquals(0f, thresholdOfKnob(0f))
        assertEquals(THRESHOLD_OFF, thresholdKnob(null))
        assertEquals(-12f, thresholdKnob(-12f))
    }

    @Test
    fun `BARS steps Free, 1, 2, 4, 8, 16 and round`() {
        val seen = mutableListOf<Int?>(null)
        repeat(6) { seen += nextBars(seen.last()) }
        assertEquals(listOf(null, 1, 2, 4, 8, 16, null), seen)
        assertEquals(1, nextBars(3))
    }

    @Test
    fun `a take stops by itself held at the limit, at its longest, or after its bars`() {
        assertTrue(autoStopped(SamplePhase.Recording(pad, 7, 20, false), held = true, bars = null, bpm = 120.0))
        assertFalse(autoStopped(SamplePhase.Recording(pad, 7, 20, false), held = false, bars = null, bpm = 120.0))
        assertTrue(autoStopped(SamplePhase.Recording(pad, 19, 20, true), held = false, bars = null, bpm = 120.0))
        // 2 bars at 120 BPM: 4 s, last seen at 3.
        assertTrue(autoStopped(SamplePhase.Recording(pad, 3, 20, true), held = false, bars = 2, bpm = 120.0))
        assertFalse(autoStopped(SamplePhase.Recording(pad, 1, 20, true), held = false, bars = 2, bpm = 120.0))
    }

    @Test
    fun `the strip is a line when wide, a row on a phone, two rows on a small one`() {
        assertEquals(StripLayout.LINE, stripLayout(801.dp))
        assertEquals(StripLayout.LINE, stripLayout(626.dp))
        assertEquals(StripLayout.ROW, stripLayout(354.dp))
        assertEquals(StripLayout.TWO_ROWS, stripLayout(302.dp))
        // Two rows of keys are as tall as the row's tier of knobs, so a small phone's pads keep as much.
        assertEquals(samplerStripHeight(354.dp, usb = false), samplerStripHeight(302.dp, usb = false))
        // A key tall: no less than the touch takes.
        assertEquals(44.dp, samplerStripHeight(626.dp, usb = false))
        assertTrue(samplerStripHeight(354.dp, usb = true) > samplerStripHeight(354.dp, usb = false))
    }
}
