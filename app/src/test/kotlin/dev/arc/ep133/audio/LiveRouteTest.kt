package dev.arc.ep133.audio

import android.media.AudioDeviceInfo
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Which of Live's routes count as wireless, so the display line says the sound plays late. */
class LiveRouteTest {
    @Test
    fun `Bluetooth and hearing aids are wireless`() {
        for (type in listOf(
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER,
            AudioDeviceInfo.TYPE_BLE_BROADCAST, AudioDeviceInfo.TYPE_HEARING_AID,
        )) {
            assertTrue(LiveAudio.isWireless(type), "type $type")
        }
    }

    @Test
    fun `wired, USB, the speaker and no route are not`() {
        for (type in listOf(
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_HDMI,
        )) {
            assertFalse(LiveAudio.isWireless(type), "type $type")
        }
        assertFalse(LiveAudio.isWireless(null))
    }
}
