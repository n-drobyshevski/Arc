package dev.arc.ep133.formats

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class VoiceMixerTest {
    // 1000 Hz output: one frame per millisecond, so gates and fades are easy to count.
    private fun mixer(max: Int = VoiceMixer.MAX_VOICES) = VoiceMixer(1000, max)

    private fun render(m: VoiceMixer, frames: Int): ShortArray = ShortArray(frames * 2).also { m.render(it, frames) }

    private fun left(out: ShortArray) = out.filterIndexed { i, _ -> i % 2 == 0 }.map { it.toInt() }

    private fun steady(n: Int, v: Short = 1000) = ShortArray(n) { v }

    @Test
    fun `a mono sound plays on both sides at its own rate`() {
        val m = mixer()
        m.start("a", shortArrayOf(0, 100, 200, 300), 1, 1000)
        val out = render(m, 6)
        assertEquals(listOf(0, 0, 100, 100, 200, 200, 300, 300, 0, 0, 0, 0), out.map { it.toInt() })
        assertEquals(emptySet<String>(), m.keys)
    }

    @Test
    fun `a sound at another rate is read faster or slower`() {
        val m = mixer()
        // 2000 Hz into 1000 Hz: every other frame.
        m.start("a", shortArrayOf(0, 100, 200, 300, 400), 1, 2000)
        assertEquals(listOf(0, 200, 400, 0), left(render(m, 4)))
        // 500 Hz: in between, by linear interpolation.
        m.start("b", shortArrayOf(0, 100, 200), 1, 500)
        assertEquals(listOf(0, 50, 100, 150, 200, 0), left(render(m, 6)))
    }

    @Test
    fun `an octave up is twice as fast, as KEYS plays it`() {
        val m = mixer()
        m.start("k", shortArrayOf(0, 100, 200, 300, 400, 500, 600, 700, 800), 1, 1000, semitones = 12)
        assertEquals(listOf(0, 200, 400, 600, 800, 0), left(render(m, 6)))
        assertEquals(2.0, VoiceMixer.pitchRatio(12), 1e-9)
        assertEquals(0.5, VoiceMixer.pitchRatio(-12), 1e-9)
    }

    @Test
    fun `stereo frames stay together`() {
        val m = mixer()
        m.start("s", shortArrayOf(1, -1, 2, -2), 2, 1000)
        assertEquals(listOf(1, -1, 2, -2, 0, 0), render(m, 3).map { it.toInt() })
    }

    @Test
    fun `a held voice sounds until released, then fades out`() {
        val m = mixer()
        m.start("a", steady(1000), 1, 1000)
        render(m, 100)
        assertEquals(setOf("a"), m.keys)
        m.release("a")
        val out = left(render(m, 40))
        assertEquals(1000, out[0])
        // Down over the fade, then silent.
        assertTrue(out[VoiceMixer.FADE_MS / 2] in 400..600)
        assertEquals(0, out[VoiceMixer.FADE_MS + 1])
        assertEquals(emptySet<String>(), m.keys)
    }

    @Test
    fun `the quickest tap still sounds for the minimum gate`() {
        val m = mixer()
        m.start("a", steady(1000), 1, 1000)
        m.release("a")
        val out = left(render(m, 200))
        assertEquals(1000, out[VoiceMixer.MIN_GATE_MS - 1])
        assertEquals(0, out[VoiceMixer.MIN_GATE_MS + VoiceMixer.FADE_MS + 1])
    }

    @Test
    fun `voices add up, as a chord`() {
        val m = mixer()
        m.start("a", steady(10, 1000), 1, 1000)
        m.start("b", steady(10, 2000), 1, 1000)
        assertEquals(3000, left(render(m, 1))[0])
        assertEquals(setOf("a", "b"), m.keys)
        // And clip rather than wrap around.
        m.start("c", steady(10, 32000), 1, 1000)
        assertEquals(32767, left(render(m, 1))[0])
    }

    @Test
    fun `the same key starts over and the old one is cut short without a click`() {
        val m = mixer()
        m.start("a", steady(1000, 1000), 1, 1000)
        render(m, 10)
        m.start("a", steady(1000, 1000), 1, 1000)
        val out = left(render(m, 10))
        // The old voice fades over CHOKE_MS while the new one plays: never above the two together.
        assertTrue(out[0] in 1000..2000)
        assertEquals(1000, out[VoiceMixer.CHOKE_MS + 1])
        assertEquals(setOf("a"), m.keys)
    }

    @Test
    fun `past the voice limit the oldest is cut`() {
        val m = mixer(max = 2)
        m.start("a", steady(100), 1, 1000)
        m.start("b", steady(100), 1, 1000)
        m.start("c", steady(100), 1, 1000)
        render(m, 1)
        assertEquals(setOf("b", "c"), m.keys)
    }

    @Test
    fun `stop fades everything out`() {
        val m = mixer()
        m.start("a", steady(1000), 1, 1000)
        m.start("b", steady(1000), 1, 1000)
        render(m, 5)
        m.stopAll()
        val out = left(render(m, 10))
        assertEquals(0, out[VoiceMixer.CHOKE_MS + 1])
        assertEquals(emptySet<String>(), m.keys)
    }

    @Test
    fun `a new voice reports the frame it starts at, with its tag`() {
        val m = mixer()
        render(m, 64)
        m.start("a", steady(10), 1, 1000, tag = 42)
        render(m, 16)
        assertEquals(listOf(VoiceMixer.Started("a", 42, 64)), m.started)
        render(m, 16)
        assertTrue(m.started.isEmpty())
    }

    @Test
    fun `a release of a key not playing does nothing`() {
        val m = mixer()
        m.release("nothing")
        m.start("a", steady(10), 1, 1000)
        assertEquals(1000, left(render(m, 1))[0])
    }
}
