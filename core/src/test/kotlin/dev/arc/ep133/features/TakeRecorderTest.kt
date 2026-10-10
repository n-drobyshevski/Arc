package dev.arc.ep133.features

import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.Wav
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class TakeRecorderTest {
    private fun burst(frames: Int, v: Short = 0) = ShortArray(frames * 2) { v }

    @Test
    fun `nothing is recorded until armed, and armed waits for the first sound`() {
        val r = TakeRecorder(1000)
        assertNull(r.onBurst(burst(16, 5), 16, 0, 0))
        r.arm()
        assertEquals(TakeRecorder.State.ARMED, r.state)
        assertNull(r.onBurst(burst(16), 16, 16, null))
        assertNull(r.onBurst(burst(16), 16, 32, null))
        assertEquals(0L, r.frames)
    }

    @Test
    fun `the take starts at the frame the first sound starts`() {
        val r = TakeRecorder(1000)
        r.arm()
        val k = r.onBurst(burst(16, 7), 16, 64, 70)!!
        assertEquals(6, k.from)
        assertEquals(10, k.frames)
        assertEquals(TakeRecorder.State.RECORDING, r.state)
        // From then on every burst is kept whole, silent or not.
        val k2 = r.onBurst(burst(16), 16, 80, null)!!
        assertEquals(0, k2.from)
        assertEquals(16, k2.frames)
        assertEquals(26L, r.frames)
    }

    @Test
    fun `silence after the last sound is left out`() {
        val r = TakeRecorder(1000)
        r.arm()
        val out = burst(8)
        out[2 * 2] = 100 // frame 2 left
        out[2 * 4 + 1] = -3 // frame 4 right
        r.onBurst(out, 8, 0, 0)
        r.onBurst(burst(8), 8, 8, null)
        assertEquals(16L, r.frames)
        assertEquals(5L, r.stop())
        assertEquals(TakeRecorder.State.IDLE, r.state)
    }

    @Test
    fun `stopping before anything played keeps nothing`() {
        val r = TakeRecorder(1000)
        r.arm()
        r.onBurst(burst(8), 8, 0, null)
        assertEquals(0L, r.stop())
        // And it can be armed again.
        r.arm()
        assertEquals(TakeRecorder.State.ARMED, r.state)
    }

    @Test
    fun `a take stops by itself at the limit`() {
        val r = TakeRecorder(1000, maxFrames = 20)
        r.arm()
        assertFalse(r.onBurst(burst(16, 1), 16, 0, 0)!!.last)
        val k = r.onBurst(burst(16, 1), 16, 16, null)!!
        assertEquals(4, k.frames)
        assertTrue(k.last)
        assertEquals(TakeRecorder.State.IDLE, r.state)
        assertEquals(20L, r.audible)
        assertNull(r.onBurst(burst(16, 1), 16, 32, null))
        assertEquals(600, TakeRecorder.MAX_SECONDS)
    }

    @Test
    fun `the device starting to play starts an armed take at the next burst`() {
        val r = TakeRecorder(1000)
        r.transportStart() // Not armed: nothing happens.
        r.arm()
        assertNull(r.onBurst(burst(8), 8, 0, null))
        r.transportStart()
        assertEquals(TakeRecorder.State.ARMED, r.state)
        // The whole burst is kept, silent as it is, so the take lines up with the device.
        val k = r.onBurst(burst(8), 8, 8, null)!!
        assertEquals(0, k.from)
        assertEquals(8, k.frames)
        assertTrue(r.byTransport)
        val out = burst(8)
        out[2 * 3] = 9
        r.onBurst(out, 8, 16, 18)
        // The silence in front is kept, the silence after the last sound isn't.
        assertEquals(12L, r.stop())
    }

    @Test
    fun `a take started by a sound doesn't follow the device`() {
        val r = TakeRecorder(1000)
        r.arm()
        r.onBurst(burst(8, 1), 8, 0, 0)
        r.transportStart()
        assertFalse(r.byTransport)
        // A start that came too late for its take is forgotten once it stops.
        r.stop()
        r.arm()
        assertNull(r.onBurst(burst(8), 8, 8, null))
        assertFalse(r.byTransport)
    }

    @Test
    fun `seconds count the recorded frames`() {
        val r = TakeRecorder(10)
        r.arm()
        repeat(3) { r.onBurst(burst(10, 1), 10, it * 10L, if (it == 0) 0 else null) }
        assertEquals(3, r.seconds)
    }

    @Test
    fun `recording the mixer from the first press`() {
        val m = VoiceMixer(1000)
        val r = TakeRecorder(1000)
        val out = ShortArray(32)
        r.arm()
        m.render(out, 16)
        assertNull(r.onBurst(out, 16, m.frame - 16, m.started.minOfOrNull { it.frame }))
        m.start("a", ShortArray(20) { 500 }, 1, 1000)
        m.render(out, 16)
        val k = r.onBurst(out, 16, m.frame - 16, m.started.minOfOrNull { it.frame })!!
        assertEquals(0, k.from)
        assertEquals(500, out[0].toInt())
        m.render(out, 16)
        r.onBurst(out, 16, m.frame - 16, m.started.minOfOrNull { it.frame })
        // The sound's 20 frames, then silence that isn't kept.
        assertEquals(20L, r.stop())
    }

    @Test
    fun `armed at a frame, the take starts there, sound or not`() {
        val r = TakeRecorder(1000)
        r.armAt(40)
        // A sound before the frame doesn't start it.
        assertNull(r.onBurst(burst(16, 5), 16, 16, 20))
        assertEquals(TakeRecorder.State.ARMED, r.state)
        val k = r.onBurst(burst(16), 16, 32, null)!!
        assertEquals(8, k.from)
        assertEquals(8, k.frames)
        assertEquals(TakeRecorder.State.RECORDING, r.state)
    }

    @Test
    fun `armed at a frame already gone, the take starts with the next burst`() {
        val r = TakeRecorder(1000)
        r.arm()
        r.armAt(10)
        val k = r.onBurst(burst(16), 16, 32, null)!!
        assertEquals(0, k.from)
        assertEquals(16, k.frames)
    }

    @Test
    fun `stopped at a frame, the take keeps the silence up to it`() {
        val r = TakeRecorder(1000)
        r.armAt(8)
        val out = burst(16)
        out[2 * 9] = 100 // frame 9: the take's second
        r.onBurst(out, 16, 0, null)
        r.stopAt(40)
        assertFalse(r.onBurst(burst(16), 16, 16, null)!!.last)
        val k = r.onBurst(burst(16), 16, 32, null)!!
        assertEquals(0, k.from)
        assertEquals(8, k.frames)
        assertTrue(k.last)
        assertEquals(TakeRecorder.State.IDLE, r.state)
        // Frames 8 to 40, silent or not.
        assertEquals(32L, r.frames)
        assertEquals(32L, r.stop())
    }

    @Test
    fun `a take armed and stopped at frames is exactly the frames between`() {
        val r = TakeRecorder(1000)
        r.armAt(100)
        r.stopAt(110)
        assertNull(r.onBurst(burst(64), 64, 0, null))
        val k = r.onBurst(burst(64), 64, 64, null)!!
        assertEquals(36, k.from)
        assertEquals(10, k.frames)
        assertTrue(k.last)
        assertEquals(10L, r.stop())
    }

    @Test
    fun `stopped at a frame already recorded past, the take ends there`() {
        val r = TakeRecorder(1000)
        r.armAt(0)
        r.onBurst(burst(16, 1), 16, 0, null)
        r.stopAt(10)
        // Stopped before the next burst: what was recorded up to the frame.
        assertEquals(10L, r.stop())
        r.armAt(100)
        r.onBurst(burst(16), 16, 100, null)
        r.stopAt(104)
        val k = r.onBurst(burst(16), 16, 116, null)!!
        assertEquals(0, k.frames)
        assertTrue(k.last)
        assertEquals(4L, r.stop())
    }

    @Test
    fun `stopped before its stop frame, the take keeps all it recorded, silence too`() {
        val r = TakeRecorder(1000)
        r.armAt(0)
        val out = burst(16)
        out[2 * 2] = 100
        r.onBurst(out, 16, 0, null)
        r.stopAt(1000)
        assertFalse(r.onBurst(burst(16), 16, 16, null)!!.last)
        // Only frame 2 sounds, yet the take was locked to frames: all 32 are kept.
        assertEquals(3L, r.audible)
        assertEquals(32L, r.stop())
        assertEquals(TakeRecorder.State.IDLE, r.state)
    }

    @Test
    fun `a take already recording isn't armed again at a frame`() {
        val r = TakeRecorder(1000)
        r.arm()
        r.onBurst(burst(16, 3), 16, 0, 0)
        r.armAt(100)
        assertEquals(TakeRecorder.State.RECORDING, r.state)
        assertEquals(16, r.onBurst(burst(16, 3), 16, 16, null)!!.frames)
        assertEquals(32L, r.frames)
    }

    @Test
    fun `a plain arm after a take locked to frames waits for a sound and has no stop frame`() {
        val r = TakeRecorder(1000)
        r.armAt(0)
        r.stopAt(8)
        assertTrue(r.onBurst(burst(16), 16, 0, null)!!.last)
        r.arm()
        assertNull(r.onBurst(burst(16), 16, 16, null))
        val k = r.onBurst(burst(16, 4), 16, 32, 40)!!
        assertEquals(8, k.from)
        assertFalse(k.last)
        assertFalse(r.onBurst(burst(16, 4), 16, 48, null)!!.last)
        assertEquals(24L, r.stop())
    }

    @Test
    fun `a header for audio written as it is recorded`() {
        val h = Wav.header(4000, 2, 48000)
        assertEquals(44, h.size)
        val bb = ByteBuffer.wrap(h).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(36 + 4000, bb.getInt(4))
        assertEquals(2, bb.getShort(22).toInt())
        assertEquals(48000, bb.getInt(24))
        assertEquals(48000 * 4, bb.getInt(28))
        assertEquals(4000, bb.getInt(40))
        val pcm = ByteArray(4000) { it.toByte() }
        assertTrue((h + pcm).contentEquals(Wav.encode(pcm, 2, 48000)))
        val w = Wav.decode(h + pcm)
        assertEquals(2, w.channels)
        assertEquals(48000L, w.sampleRate)
    }
}
