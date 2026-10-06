package dev.arc.ep133.audio

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The Kotlin side of Live's native engine that runs without it: keys, sounds, the choice of engine. */
class LiveEngineTest {
    @Test
    fun `keys keep their numbers`() {
        val keys = LiveKeys()
        val a = keys.id("live:1:0")
        val b = keys.id("note:60")
        assertEquals(a, keys.id("live:1:0"))
        assertTrue(a != b)
        assertEquals("note:60", keys.name(b))
        assertNull(keys.name(99))
        // Many keys: all still found both ways.
        val ids = (0 until 300).map { keys.id("note:$it") }
        assertEquals(ids, (0 until 300).map { keys.id("note:$it") })
        assertEquals("note:299", keys.name(ids.last()))
    }

    @Test
    fun `the library never loads in JVM tests, so Live uses AudioTrack`() {
        assertFalse(NativeAudio.loaded)
        assertFalse(EngineChoice { NativeAudio.loaded }.native())
    }

    @Test
    fun `native is tried until two opens fail in a row`() {
        val choice = EngineChoice { true }
        assertTrue(choice.native())
        choice.opened(false)
        assertTrue(choice.native())
        // One that works starts the count again.
        choice.opened(true)
        choice.opened(false)
        assertTrue(choice.native())
        choice.opened(false)
        assertFalse(choice.native())
    }

    @Test
    fun `native that gave out isn't tried again`() {
        val choice = EngineChoice { true }
        choice.opened(true)
        choice.gaveOut()
        assertFalse(choice.native())
    }

    @Test
    fun `a stream stalls when its callbacks stop while it should play`() {
        val watch = StallWatch(limitNanos = 100)
        assertFalse(watch.stalled(callbacks = 0, running = true, now = 0))
        assertFalse(watch.stalled(5, true, 50))
        assertFalse(watch.stalled(5, true, 150))
        assertTrue(watch.stalled(5, true, 151))
        // Moving again, or reopening, starts the count over.
        assertFalse(watch.stalled(6, true, 160))
        assertFalse(watch.stalled(6, false, 1000))
        assertFalse(watch.stalled(6, true, 1050))
        assertTrue(watch.stalled(6, true, 1101))
    }

    private class FakeEngine {
        val loaded = HashMap<Int, ShortArray>()
        var refuse = false

        fun load(slot: Int, pcm: ShortArray, @Suppress("UNUSED_PARAMETER") channels: Int): Boolean {
            if (refuse) return false
            loaded[slot] = pcm
            return true
        }

        fun unload(slot: Int) {
            loaded.remove(slot)
        }
    }

    private fun samples(engine: FakeEngine, capBytes: Long = 1000, slots: Int = 4) =
        NativeSamples(capBytes, slots, engine::load, engine::unload)

    @Test
    fun `a sound is copied once and found again by its array`() {
        val engine = FakeEngine()
        val s = samples(engine)
        val a = ShortArray(10)
        val slot = s.slot(a, 1)
        assertEquals(slot, s.slot(a, 1))
        assertEquals(1, engine.loaded.size)
        // Equal contents in another array are another sound; so is the same array as stereo.
        val b = ShortArray(10)
        assertTrue(s.slot(b, 1) != slot)
        assertTrue(s.slot(a, 2) != slot)
        assertEquals(3, s.size)
        assertEquals(60, s.bytes)
    }

    @Test
    fun `past the cap the least recently played goes first`() {
        val engine = FakeEngine()
        val s = samples(engine, capBytes = 100)
        val a = ShortArray(20)
        val b = ShortArray(20)
        val c = ShortArray(20)
        val slotA = s.slot(a, 1)!!
        val slotB = s.slot(b, 1)!!
        // a played again: b is now the oldest.
        s.slot(a, 1)
        s.slot(c, 1)
        assertEquals(setOf(slotA, s.slot(c, 1)), engine.loaded.keys)
        assertFalse(slotB in engine.loaded.keys)
        assertEquals(80, s.bytes)
        // One bigger than the cap still goes in, alone.
        val big = ShortArray(100)
        val slotBig = s.slot(big, 1)
        assertEquals(setOf(slotBig), engine.loaded.keys)
        assertEquals(1, s.size)
    }

    @Test
    fun `out of slots the oldest goes, and a refused copy gives its slot back`() {
        val engine = FakeEngine()
        val s = samples(engine, capBytes = 1_000_000, slots = 2)
        val a = ShortArray(1)
        val b = ShortArray(1)
        s.slot(a, 1)
        s.slot(b, 1)
        val c = ShortArray(1)
        assertEquals(engine.loaded.keys, setOf(s.slot(b, 1), s.slot(c, 1)))
        engine.refuse = true
        assertNull(s.slot(ShortArray(1), 1))
        engine.refuse = false
        assertTrue(s.slot(ShortArray(1), 1) != null)
    }

    @Test
    fun `the debug line says which engine and mode`() {
        fun info(exclusive: Int, mmap: Int, low: Int = 1, aaudio: Int = 1) = IntArray(NativeAudio.INFO_SIZE).also {
            it[NativeAudio.RATE] = 48000
            it[NativeAudio.BURST] = 96
            it[NativeAudio.BUFFER] = 192
            it[NativeAudio.EXCLUSIVE] = exclusive
            it[NativeAudio.MMAP] = mmap
            it[NativeAudio.LOW_LATENCY] = low
            it[NativeAudio.AAUDIO] = aaudio
        }
        assertEquals("48000 Hz, 96-frame bursts, AAudio exclusive (MMAP)", NativeLiveOutput.describe(info(1, 1), 0, 192))
        assertEquals("48000 Hz, 96-frame bursts, AAudio shared (MMAP)", NativeLiveOutput.describe(info(0, 1), 0, 192))
        assertEquals("48000 Hz, 96-frame bursts, AAudio shared", NativeLiveOutput.describe(info(0, 0), 0, 192))
        assertEquals(
            "48000 Hz, 96-frame bursts, AAudio shared, normal path (no low-latency output), 2 xruns, 384-frame buffer",
            NativeLiveOutput.describe(info(0, 0, low = 0), 2, 384),
        )
    }
}
