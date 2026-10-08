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

/** SAMPLE's line, card and pad lights: what they say and how they lay out. */
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
    fun `STOP stands in for LATCH during a hands-free take or what comes before one, not a held take`() {
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
    fun `the upright card keeps the pads a finger wide, giving up the big knobs, the caption, the display, then a row`() {
        // A Pixel 7's card: two rows of controls, the knobs as big as the row lets them be, the caption under it.
        val roomy = sampleCardFit(311.dp, 497.dp)
        assertEquals(SampleControls.ROWS, roomy.controls)
        assertTrue(roomy.knob > 44.dp)
        assertTrue(roomy.caption)
        assertEquals(80.dp, roomy.display)
        // A tablet's: the display grows, up to its most, and the knobs to theirs.
        assertEquals(140.dp, sampleCardFit(480.dp, 900.dp).display)
        assertEquals(56.dp, sampleCardFit(480.dp, 900.dp).knob)
        // Shorter: the knobs a key tall and no caption, the display kept.
        val short = sampleCardFit(311.dp, 445.dp)
        assertEquals(44.dp, short.knob)
        assertFalse(short.caption)
        assertEquals(80.dp, short.display)
        // A small phone's: narrow controls (STEREO left to -/+), no display (SAMPLE's line says it all).
        val small = sampleCardFit(258.dp, 400.dp)
        assertEquals(SampleControls.NARROW, small.controls)
        assertEquals(0.dp, small.display)
        // Shorter still: one row that scrolls.
        assertEquals(SampleControls.LINE, sampleCardFit(258.dp, 330.dp).controls)
        assertEquals(SampleControls.LINE, sampleCardFit(258.dp, 200.dp).controls)
    }
}
