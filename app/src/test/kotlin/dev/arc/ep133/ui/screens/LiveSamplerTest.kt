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

/** SAMPLE's header, panel and pad lights: what they say and how they lay out. */
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
    fun `the upright panel keeps the pads a finger wide, giving up its wave, the big knobs, then a row`() {
        // A Pixel 7's (the room from the display line's top): two rows of controls, the knobs at their biggest, the
        // wave strip under the header.
        val roomy = samplePanelFit(353.dp, 680.dp)
        assertEquals(SampleControls.ROWS, roomy.controls)
        assertEquals(56.dp, roomy.knob)
        assertEquals(52.dp, roomy.wave)
        // The scrolling page always has room for the wave.
        assertEquals(52.dp, samplePanelFit(353.dp, null).wave)
        // Shorter, the wave goes first (the header still says what goes on), then the knobs come down to a key's
        // height, then the controls go into one row.
        assertEquals(52.dp, samplePanelFit(353.dp, 508.dp).wave)
        assertEquals(0.dp, samplePanelFit(353.dp, 507.dp).wave)
        assertEquals(56.dp, samplePanelFit(353.dp, 507.dp).knob)
        assertEquals(44.dp, samplePanelFit(353.dp, 445.dp).knob)
        assertEquals(SampleControls.LINE, samplePanelFit(353.dp, 433.dp).controls)
        // A narrow page's: STEREO left to -/+, and the wave where there is room for it.
        val small = samplePanelFit(301.dp, 496.dp)
        assertEquals(SampleControls.NARROW, small.controls)
        assertEquals(52.dp, small.wave)
        assertTrue(small.knob > 30.dp)
        assertEquals(0.dp, samplePanelFit(301.dp, 495.dp).wave)
        // Its height open: the line's row (the header), the wave and the dark room under it, the plate's padding,
        // the two rows and its lip.
        assertEquals(48.dp + 52.dp + 10.dp + 12.dp * 2 + 44.dp + 6.dp + 56.dp + 3.dp, panelHeight(roomy))
        assertEquals(panelHeight(roomy) - 62.dp, panelHeight(roomy.copy(wave = 0.dp)))
    }

    @Test
    fun `the USB note under the controls counts against the pads' room`() {
        // Room for the wave over the pads, but not with the note's two lines under the controls as well.
        assertEquals(52.dp, samplePanelFit(353.dp, 520.dp).wave)
        assertEquals(0.dp, samplePanelFit(353.dp, 520.dp, note = 36.dp).wave)
        assertEquals(panelHeight(samplePanelFit(353.dp, null)) + 36.dp, panelHeight(samplePanelFit(353.dp, null), note = 36.dp))
    }

    @Test
    fun `on its side the wave strip takes what the plate leaves, and goes where that is too little`() {
        // 300 wide: two rows of key-tall controls, the plate's padding and its lip.
        assertEquals(12.dp * 2 + 3.dp + 44.dp + 6.dp + 44.dp, sidePanelHeight(300.dp))
        assertEquals(52.dp, sideWave(sidePanelHeight(300.dp) + 62.dp, 300.dp))
        assertEquals(0.dp, sideWave(sidePanelHeight(300.dp) + 61.dp, 300.dp))
        // A taller column: the wave takes all the room over the plate's least height, nothing empty under the controls.
        assertEquals(130.dp, sideWave(sidePanelHeight(300.dp) + 140.dp, 300.dp))
    }

    @Test
    fun `on its side the USB note under the controls keeps its room on the plate, out of the wave's`() {
        assertEquals(sidePanelHeight(300.dp) + 36.dp, sidePanelHeight(300.dp, note = 36.dp))
        // The same column: the wave gives the note its room, and goes where what is left is too little.
        assertEquals(94.dp, sideWave(sidePanelHeight(300.dp) + 140.dp, 300.dp, note = 36.dp))
        assertEquals(0.dp, sideWave(sidePanelHeight(300.dp) + 62.dp, 300.dp, note = 36.dp))
    }

    @Test
    fun `on its side the panel takes what the pads leave, within its least and most`() {
        assertEquals(380.dp, sidePanelWidth(800.dp, 310.dp))
        assertEquals(300.dp, sidePanelWidth(600.dp, 300.dp))
        assertEquals(240.dp, sidePanelWidth(450.dp, 300.dp))
    }
}
