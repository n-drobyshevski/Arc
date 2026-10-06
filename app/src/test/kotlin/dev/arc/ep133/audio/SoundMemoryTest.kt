package dev.arc.ep133.audio

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SoundMemoryTest {
    private fun sound(samples: Int) = PcmSound(ShortArray(samples), 1, 46875, silent = false)

    @Test
    fun `the least recently played go first past the cap, the newest always stays`() {
        val m = SoundMemory<String>(capBytes = 1000)
        val a = sound(200)
        val b = sound(200)
        m.put("a", a)
        m.put("b", b)
        assertEquals(800, m.bytes)
        // Played again: "a" is now the most recent.
        assertSame(a, m["a"])
        m.put("c", sound(200))
        assertNull(m["b"])
        assertSame(a, m["a"])
        assertEquals(800, m.bytes)
        // One larger than the cap still stays, alone.
        val big = sound(800)
        m.put("big", big)
        assertSame(big, m["big"])
        assertFalse(m.containsKey("a"))
        assertEquals(1600, m.bytes)
    }

    @Test
    fun `listing what is kept leaves the order of play alone`() {
        val m = SoundMemory<String>(capBytes = 1000)
        val a = sound(200)
        val b = sound(200)
        m.put("a", a)
        m.put("b", b)
        assertEquals(listOf(a, b), m.sounds())
        // Listing isn't playing: "a" is still the oldest and goes first.
        m.put("c", sound(200))
        assertNull(m["a"])
        assertSame(b, m["b"])
    }

    @Test
    fun `removing by key drops only the matching sounds`() {
        val m = SoundMemory<String>(capBytes = 1000)
        val take = sound(100)
        m.put("pad:device:5:kick", sound(200))
        m.put("take:one", take)
        m.put("pad:factory:343:bass", sound(200))
        m.removeAll { it.startsWith("pad:") }
        assertEquals(listOf(take), m.sounds())
        assertEquals(200, m.bytes)
    }

    @Test
    fun `replacing, removing and clearing keep the count right`() {
        val m = SoundMemory<String>(capBytes = 10_000)
        m.put("a", sound(100))
        m.put("a", sound(300))
        assertEquals(600, m.bytes)
        m.remove("a")
        m.remove("nothing")
        assertEquals(0, m.bytes)
        m.put("b", sound(10))
        m.clear()
        assertEquals(0, m.bytes)
        assertNull(m["b"])
    }

    @Test
    fun `decoding reads little-endian PCM and notes silence`() {
        val s = PcmSound.of(byteArrayOf(1, 0, 0xFF.toByte(), 0x7F), 3, 48000)
        assertEquals(listOf<Short>(1, 0x7FFF), s.pcm.toList())
        assertEquals(2, s.channels)
        assertFalse(s.silent)
        assertTrue(PcmSound.of(ByteArray(8), 1, 48000).silent)
    }
}
