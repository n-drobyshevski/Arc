package dev.arc.ep133.audio

import android.media.AudioDeviceInfo
import android.media.MediaRecorder
import dev.arc.ep133.audio.UsbAudioInputs.Candidate
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Which input SAMPLE opens: the USB device it picks, the rate and the source it records with. */
class SampleInputsTest {
    private val mic = Candidate(AudioDeviceInfo.TYPE_BUILTIN_MIC, true, "Pixel")
    private val headset = Candidate(AudioDeviceInfo.TYPE_USB_HEADSET, true, "USB-C headset")
    private val ep = Candidate(AudioDeviceInfo.TYPE_USB_DEVICE, true, "EP-133")
    private val epOut = Candidate(AudioDeviceInfo.TYPE_USB_DEVICE, false, "EP-133")

    @Test
    fun `the EP-133 comes first among USB inputs`() {
        assertEquals(2, UsbAudioInputs.pick(listOf(mic, headset, ep)))
        assertEquals(1, UsbAudioInputs.pick(listOf(mic, Candidate(AudioDeviceInfo.TYPE_USB_DEVICE, true, "ep-133 k.o. ii"))))
        assertEquals(1, UsbAudioInputs.pick(listOf(headset, Candidate(AudioDeviceInfo.TYPE_USB_HEADSET, true, "K.O. II"))))
    }

    @Test
    fun `any USB input will do without one, and no other kind`() {
        assertEquals(1, UsbAudioInputs.pick(listOf(mic, headset)))
        assertNull(UsbAudioInputs.pick(listOf(mic)))
        assertNull(UsbAudioInputs.pick(emptyList()))
        // Its output side isn't an input.
        assertNull(UsbAudioInputs.pick(listOf(mic, epOut)))
    }

    @Test
    fun `a device listing no channel counts takes stereo`() {
        assertTrue(UsbAudioInputs.stereo(intArrayOf()))
        assertTrue(UsbAudioInputs.stereo(intArrayOf(1, 2)))
        assertFalse(UsbAudioInputs.stereo(intArrayOf(1)))
    }

    @Test
    fun `USB records at its best rate up to 48 kHz`() {
        assertEquals(48000, InputCapture.bestRate(intArrayOf()))
        assertEquals(48000, InputCapture.bestRate(intArrayOf(44100, 48000, 96000)))
        assertEquals(46875, InputCapture.bestRate(intArrayOf(46875)))
        assertEquals(44100, InputCapture.bestRate(intArrayOf(96000, 44100)))
        assertEquals(88200, InputCapture.bestRate(intArrayOf(192000, 88200)))
        assertEquals(48000, InputCapture.rateFor(null))
    }

    @Test
    fun `the rawest source comes first`() {
        assertEquals(
            listOf(MediaRecorder.AudioSource.UNPROCESSED, MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC),
            InputCapture.sources(unprocessed = true),
        )
        assertEquals(listOf(MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC), InputCapture.sources(unprocessed = false))
    }
}
