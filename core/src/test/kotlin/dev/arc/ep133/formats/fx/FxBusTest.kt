package dev.arc.ep133.formats.fx

import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.VoiceShape
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.random.Random

class FxBusTest {
    private fun steady(n: Int, v: Short = 1000) = ShortArray(n) { v }

    private fun render(m: VoiceMixer, frames: Int): ShortArray = ShortArray(frames * 2).also { m.render(it, frames) }

    private fun left(out: ShortArray) = out.filterIndexed { i, _ -> i % 2 == 0 }.map { it.toInt() }

    /**
     * Random presses on random buses, the same for each mixer from the same
     * [seed]; [extra] adds controls between renders, with numbers of its own.
     */
    private fun play(m: VoiceMixer, seed: Int, extra: (VoiceMixer, Random) -> Unit = { _, _ -> }): List<Short> {
        val random = Random(seed)
        val own = Random(seed + 1000)
        val sounds = List(4) { ShortArray(200 + random.nextInt(4000)) { (random.nextInt(65536) - 32768).toShort() } }
        val out = ArrayList<Short>()
        repeat(300) {
            val key = "k${random.nextInt(6)}"
            when (random.nextInt(10)) {
                in 0..3 -> m.start(
                    key, sounds[random.nextInt(sounds.size)], 1 + random.nextInt(2) / 2, 44100, random.nextInt(-12, 13),
                    shape = VoiceShape(bus = random.nextInt(-1, 4), duckSource = random.nextInt(4) == 0, gain = random.nextFloat()),
                    at = if (random.nextBoolean()) VoiceMixer.NOW else m.frame + random.nextInt(0, 400),
                )
                in 4..5 -> m.release(key)
                else -> {
                    extra(m, own)
                    out += render(m, 1 + random.nextInt(300)).toList()
                }
            }
        }
        return out
    }

    @Test
    fun `at its defaults the bus leaves the mix exactly as it was`() {
        val plain = play(VoiceMixer(48000), 1)
        // Every control at its default value, again and again: not a sample changes.
        val controlled = play(VoiceMixer(48000), 1) { m, r ->
            m.control(FxControl.FX_TYPE, FxControl.NONE, 0.5f, 0.5f)
            m.control(FxControl.SEND, r.nextInt(4), 0f, 0f)
            m.control(FxControl.COMP, 0, 0.5f, 0.5f)
            m.control(FxControl.SIDECHAIN, 0, r.nextFloat(), r.nextFloat())
            m.control(FxControl.TEMPO, 0, 20f + r.nextFloat() * 280f, 0f)
            m.control(FxControl.PUNCH, r.nextInt(FxControl.SLOTS), 0f, 0f)
            m.control(FxControl.FX_XY, 0, r.nextFloat(), r.nextFloat())
        }
        assertEquals(plain, controlled)
        // And the bus itself: begin, gains and process leave a mix alone.
        val bus = FxBus(44100)
        val random = Random(2)
        val mix = FloatArray(512) { random.nextFloat() * 65536f - 32768f }
        val copy = mix.copyOf()
        bus.begin(256)
        bus.gains(0, 100, 0)
        bus.gains(100, 156, 100)
        for (g in 0 until FxControl.GROUPS) {
            assertNull(bus.dry(g))
            assertNull(bus.send(g))
        }
        bus.process(mix, 256)
        assertArrayEquals(copy, mix)
    }

    @Test
    fun `sends with no effect leave the dry whole`() {
        val plain = play(VoiceMixer(44100), 3)
        val sent = play(VoiceMixer(44100), 3) { m, r -> m.control(FxControl.SEND, r.nextInt(4), r.nextFloat(), 0f) }
        assertEquals(plain, sent)
    }

    @Test
    fun `the dry law follows the effect`() {
        fun dryAt(type: Int, send: Float): Float? {
            val bus = FxBus(1000)
            bus.control(FxControl.FX_TYPE, type, 0.5f, 0.5f)
            bus.control(FxControl.SEND, 2, send, 0f)
            // 20 ms at 1000 Hz is 20 frames: two seconds is long enough to land.
            bus.begin(2000)
            bus.gains(0, 2000, 0)
            assertEquals(send, bus.send(2)!![1999])
            assertNull(bus.send(1))
            return bus.dry(2)?.get(1999)
        }
        assertEquals(1f - 0.3f * 0.5f, dryAt(FxControl.DELAY, 0.5f))
        assertEquals(1f - 0.3f * 0.5f, dryAt(FxControl.REVERB, 0.5f))
        assertEquals(1f - 0.3f * 1f, dryAt(FxControl.CHORUS, 1f))
        assertEquals(1f - 0.4f, dryAt(FxControl.DISTORTION, 0.4f))
        assertEquals(0f, dryAt(FxControl.FILTER, 1f))
        assertEquals(1f - 0.25f, dryAt(FxControl.COMPRESSOR, 0.25f))
        // No effect: the dry is whole (1 throughout, so none to read).
        assertNull(dryAt(FxControl.NONE, 0.8f))
    }

    @Test
    fun `a send glides to its new value and lands on it`() {
        val bus = FxBus(48000)
        bus.control(FxControl.SEND, 0, 1f, 0f)
        bus.begin(24000)
        bus.gains(0, 24000, 0)
        val send = bus.send(0)!!
        // Moving, not jumping, and rising all the way.
        assertTrue(send[0] > 0f && send[0] < 0.01f) { "${send[0]}" }
        for (i in 1 until 24000) assertTrue(send[i] >= send[i - 1])
        // About 20 ms: most of the way there by then, nearly all by 100 ms, exactly there by 500 ms.
        assertTrue(send[960] > 0.6f) { "${send[960]}" }
        assertTrue(send[4800] > 0.99f) { "${send[4800]}" }
        assertEquals(1f, send[23999])
    }

    @Test
    fun `the duck reaches its floor in 2 ms and is back by its length`() {
        val rate = 48000
        val bus = FxBus(rate)
        // Groups A and C, the shortest duck (30 ms), the fast curve.
        bus.control(FxControl.SIDECHAIN, 0b0101, 0f, 0f)
        bus.begin(4000)
        bus.gains(0, 100, 0)
        assertNull(bus.dry(0))
        bus.trigger(100)
        bus.gains(100, 3900, 100)
        val a = bus.dry(0)!!
        assertNull(bus.dry(1))
        assertNotNull(bus.dry(2))
        assertNull(bus.dry(3))
        val dip = 2 * rate / 1000
        val length = 30 * rate / 1000
        assertEquals(1f, a[100])
        for (i in 101..100 + dip) assertTrue(a[i] < a[i - 1])
        assertEquals(0.1f, a[100 + dip])
        for (i in 101 + dip until 100 + length) assertTrue(a[i] >= a[i - 1] && a[i] <= 1f) { "frame $i: ${a[i]}" }
        assertTrue(a[100 + length / 2] < 1f)
        assertEquals(1f, a[100 + length])
        assertEquals(1f, a[3999])
        // Its sends duck with it: none here, so nothing to read.
        assertNull(bus.send(0))
    }

    @Test
    fun `a duck while ducking dips from where it is, and the longest lasts 600 ms`() {
        val rate = 1000
        val bus = FxBus(rate)
        bus.control(FxControl.SIDECHAIN, 0b0001, 1f, 0.5f)
        bus.begin(1000)
        bus.trigger(0)
        bus.gains(0, 10, 0)
        val first = bus.dry(0)!![9]
        bus.trigger(10)
        bus.gains(10, 990, 10)
        val a = bus.dry(0)!!
        assertEquals(first, a[9])
        assertTrue(first > 0.1f && first < 1f)
        // It starts from the duck's level then, not from 1.
        assertEquals(bus.dry(0)!![10], a[10])
        assertTrue(a[10] < 1f && a[10] > 0.1f)
        assertEquals(0.1f, a[12])
        assertTrue(a[609] < 1f)
        assertEquals(1f, a[610])
    }

    @Test
    fun `a silent source still ducks, on its own frame inside a render`() {
        val m = VoiceMixer(1000)
        m.control(FxControl.SIDECHAIN, 0b0010, 0f, 0f)
        m.start("bass", steady(1000), 1, 1000, shape = VoiceShape(bus = 1))
        m.start("other", steady(1000, 500), 1, 1000, shape = VoiceShape(bus = 2))
        // An empty sound, timed: nothing plays, nothing starts, but the duck does.
        m.start("kick", ShortArray(0), 1, 1000, shape = VoiceShape(duckSource = true), at = 10)
        val out = left(render(m, 50))
        assertTrue(m.started.none { it.key == "kick" })
        for (i in 0..10) assertEquals(1500, out[i], "frame $i")
        // 2 ms to the floor: bass at a tenth, the other group untouched.
        assertEquals(100 + 500, out[12])
        assertTrue(out[20] in 601 until 1500)
        // Back at 30 ms.
        assertEquals(1500, out[40])
    }

    @Test
    fun `a duck needs the sidechain on and its group in the mask`() {
        val m = VoiceMixer(1000)
        m.start("bass", steady(1000), 1, 1000, shape = VoiceShape(bus = 0))
        m.start("kick", ShortArray(0), 1, 1000, shape = VoiceShape(duckSource = true))
        assertEquals(List(20) { 1000 }, left(render(m, 20)))
        m.control(FxControl.SIDECHAIN, 0b1110, 0f, 0f)
        m.start("kick", ShortArray(0), 1, 1000, shape = VoiceShape(duckSource = true))
        assertEquals(List(20) { 1000 }, left(render(m, 20)))
        // Bus -1 is never ducked.
        m.control(FxControl.SIDECHAIN, 0b1111, 0f, 0f)
        m.start("free", steady(1000, 300), 1, 1000)
        m.start("kick", ShortArray(0), 1, 1000, shape = VoiceShape(duckSource = true))
        val out = left(render(m, 20))
        assertEquals(100 + 300, out[2])
    }

    @Test
    fun `a voice on a bus with a send and an effect loses dry by the law`() {
        val m = VoiceMixer(1000)
        m.control(FxControl.FX_TYPE, FxControl.DISTORTION, 0.5f, 0.5f)
        m.control(FxControl.SEND, 3, 0.75f, 0f)
        m.start("a", steady(1000), 1, 1000, shape = VoiceShape(bus = 3))
        m.start("b", steady(1000, 100), 1, 1000)
        val out = left(render(m, 200))
        // The send glides up: the dry glides down to a quarter (the stub effect adds nothing back).
        assertTrue(out[1] in 1000 until 1100)
        assertEquals(250 + 100, out[199])
    }
}
