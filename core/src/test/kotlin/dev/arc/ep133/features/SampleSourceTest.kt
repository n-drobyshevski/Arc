package dev.arc.ep133.features

import dev.arc.ep133.protocol.Device
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.ZoneOffset

class SampleSourceTest {
    private val mic = SampleInput(SampleSource.MIC, false)
    private val micSt = SampleInput(SampleSource.MIC, true)
    private val rsp = SampleInput(SampleSource.RSP, false)
    private val rspSt = SampleInput(SampleSource.RSP, true)
    private val usb = SampleInput(SampleSource.USB, false)
    private val usbSt = SampleInput(SampleSource.USB, true)

    @Test
    fun `sources by their words, in the device's order`() {
        assertEquals(listOf(mic, micSt, rsp, rspSt, usb, usbSt), SampleInput.ORDER)
        assertEquals("rsp", SampleSource.RSP.id)
        assertEquals(SampleSource.USB, SampleSource.of("usb"))
        assertNull(SampleSource.of("line"))
    }

    @Test
    fun `minus and plus wrap round both ways`() {
        val all = SampleInput.ORDER
        assertEquals(micSt, SampleInput.cycle(all, mic, 1))
        assertEquals(usbSt, SampleInput.cycle(all, mic, -1))
        assertEquals(mic, SampleInput.cycle(all, usbSt, 1))
        assertEquals(rsp, SampleInput.cycle(all, mic, 2))
        assertEquals(mic, SampleInput.cycle(all, mic, 6)) // once round
        assertEquals(rspSt, SampleInput.cycle(all, rspSt, 0))
    }

    @Test
    fun `inputs that aren't there are skipped`() {
        // No USB plugged in, and a phone with one mic.
        val some = listOf(mic, rsp, rspSt)
        assertEquals(rsp, SampleInput.cycle(some, mic, 1))
        assertEquals(rspSt, SampleInput.cycle(some, mic, -1))
        assertEquals(mic, SampleInput.cycle(some, rspSt, 1))
        assertEquals(rspSt, SampleInput.cycle(some, mic, 2))
        // USB went away while picked: the next press lands on the next one there.
        assertEquals(mic, SampleInput.cycle(some, usb, 1))
        assertEquals(rspSt, SampleInput.cycle(some, usb, -1))
        assertEquals(mic, SampleInput.cycle(some, usbSt, 0))
        // Nothing offered: it stays.
        assertEquals(usb, SampleInput.cycle(emptyList(), usb, 1))
    }

    @Test
    fun `limits per channel count`() {
        assertEquals(20, SampleLimits.maxSeconds(true))
        assertEquals(40, SampleLimits.maxSeconds(false))
        assertEquals(960_000, SampleLimits.maxFrames(true, 48_000))
        assertEquals(1_920_000, SampleLimits.maxFrames(false, 48_000))
        // 48 kHz goes onto the device at 46875 Hz; 44.1 kHz stays as it is.
        assertEquals(3_750_000L, SampleLimits.deviceBytes(960_000, 48_000, 2))
        assertEquals(3_750_000L, SampleLimits.deviceBytes(1_920_000, 48_000, 1))
        assertEquals(88_200L, SampleLimits.deviceBytes(44_100, 44_100, 1))
    }

    @Test
    fun `low space is a full take that won't fit`() {
        // 20 s stereo and 40 s mono are both 3 750 000 bytes on the device.
        assertFalse(SampleLimits.lowSpace(3_750_000.0, true))
        assertTrue(SampleLimits.lowSpace(3_749_999.0, true))
        assertFalse(SampleLimits.lowSpace(3_750_000.0, false))
        assertTrue(SampleLimits.lowSpace(3_749_999.0, false))
        assertTrue(SampleLimits.lowSpace(0.0, true))
        assertFalse(SampleLimits.lowSpace(null, true)) // not known yet
    }

    @Test
    fun `the frames that fit in the space left`() {
        assertEquals(960_000, SampleLimits.framesThatFit(3_750_000.0, 2, 48_000))
        assertEquals(500, SampleLimits.framesThatFit(1_000.0, 1, 44_100))
        // 250 frames on the device are 256 at 48 kHz, rounded down.
        assertEquals(256, SampleLimits.framesThatFit(1_001.0, 2, 48_000))
        assertEquals(0, SampleLimits.framesThatFit(-5.0, 1, 48_000))
        assertNull(SampleLimits.framesThatFit(null, 2, 48_000))
    }

    @Test
    fun `a recording's name says where and when, in 20 characters`() {
        val at = 1_791_382_981_000L // 2026-10-07 14:23:01 UTC
        assertEquals("mic 1007-142301", SampleName.of(SampleSource.MIC, at, ZoneOffset.UTC))
        assertEquals("rsp 1007-092301", SampleName.of(SampleSource.RSP, at, ZoneOffset.ofHours(-5)))
        assertEquals("usb 1008-002301", SampleName.of(SampleSource.USB, at, ZoneOffset.ofHours(10)))
        for (s in SampleSource.entries) assertTrue(SampleName.of(s, at, ZoneOffset.UTC).length <= Device.MAX_SOUND_NAME)
        // As an upload cleans it: unchanged.
        assertEquals("mic 1007-142301", Device.cleanSoundName(SampleName.of(SampleSource.MIC, at, ZoneOffset.UTC)))
    }

    @Test
    fun `bars as frames, rounded half up`() {
        assertEquals(96_000L, barFrames(1, 120.0, 48_000))
        assertEquals(256_000L, barFrames(2, 90.0, 48_000))
        // 11 520 000 / 133.3 = 86 421.6
        assertEquals(86_422L, barFrames(1, 133.3, 48_000))
        assertEquals(79_400L, barFrames(1, 133.3, 44_100))
        assertEquals(1_536_000L, barFrames(16, 120.0, 48_000))
    }
}
