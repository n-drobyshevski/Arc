package dev.arc.ep133.formats

import dev.arc.ep133.text.FeatureText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SilenceTest {
    @Test
    fun `silent only when every sample is zero`() {
        assertTrue(Wav.isSilent(ByteArray(0)))
        assertTrue(Wav.isSilent(ByteArray(64)))
        // One sample of 1 (low byte), then one of -256 (high byte only).
        assertFalse(Wav.isSilent(ByteArray(64).also { it[10] = 1 }))
        assertFalse(Wav.isSilent(ByteArray(64).also { it[11] = -1 }))
        // A trailing odd byte is not a sample.
        assertTrue(Wav.isSilent(ByteArray(5).also { it[4] = 7 }))
    }

    @Test
    fun `play note for the debug log`() {
        assertEquals("play backup:x:3: 46875 Hz, 1 ch, 0.52 s -> Bluetooth (Buds)", FeatureText.playNote("backup:x:3", 46875, 1, 0.5249, "Bluetooth (Buds)"))
        assertEquals("play trim: 44100 Hz, 2 ch, 2 s -> phone speaker", FeatureText.playNote("trim", 44100, 2, 2.0, "phone speaker"))
    }
}
