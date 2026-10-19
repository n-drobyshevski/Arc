package dev.arc.ep133.audio

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The debug screen's latency test, fed as Live's output reports. */
class LiveLatencyTest {
    private val native = LiveEngineInfo("AAudio exclusive (MMAP), 96-frame bursts", 48000, 96, 192)
    private val track = LiveEngineInfo("AudioTrack low-latency path, 192-frame bursts", 48000, 192, 384)

    @Test
    fun `presses go under the engine that played them`() {
        val t = LiveLatency()
        t.opened(native)
        t.heard(native.label, 20.0)
        t.heard(native.label, 30.0)
        t.opened(track)
        t.heard(track.label, 40.0)
        // A late report from the engine before still counts for it.
        t.heard(native.label, 25.0)
        val s = t.state.value
        assertEquals(track.label, s.inUse)
        assertEquals(listOf(native.label, track.label), s.engines)
        assertEquals(3, s.stats.summary(native.label)?.count)
        assertEquals(25.0, s.stats.summary(native.label)?.median)
        assertEquals(40.0, s.stats.summary(track.label)?.best)
    }

    @Test
    fun `an engine opened without presses has a row, and keeps its place when it opens again`() {
        val t = LiveLatency()
        t.opened(native)
        t.opened(track)
        // Its buffer grew after the output ran dry: the estimate follows, the row stays first.
        t.opened(native.copy(buffer = 288))
        val s = t.state.value
        assertEquals(listOf(native.label, track.label), s.engines)
        assertEquals(288, s.outputs[native.label]?.buffer)
        assertEquals(native.label, s.inUse)
        assertNull(s.stats.summary(track.label))
    }

    @Test
    fun `reset forgets the times, not the engines`() {
        val t = LiveLatency()
        t.opened(native)
        t.heard(native.label, 20.0)
        t.reset()
        val s = t.state.value
        assertTrue(s.stats.isEmpty)
        assertEquals(listOf(native.label), s.engines)
    }
}
