package dev.arc.ep133.text

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class LatencyTextTest {
    @Test
    fun `choices`() {
        assertEquals(listOf("Auto", "AudioTrack", "AudioTrack, old"), LiveEngine.entries.map { LatencyText.engine(it) })
        assertEquals(listOf("latencyHint 0", "latencyHint 'interactive'"), WebLatencyHint.entries.map { LatencyText.hint(it) })
        assertEquals("Pick an engine, tap one pad 20 times in Live, then compare.", LatencyText.HOW_TO)
    }

    @Test
    fun `engine rows`() {
        assertEquals(
            listOf("OpenSL ES", "AAudio exclusive (MMAP)", "AAudio shared (MMAP)", "AAudio shared"),
            listOf(
                LatencyText.nativeMode(aaudio = false, exclusive = false, mmap = false),
                LatencyText.nativeMode(aaudio = true, exclusive = true, mmap = true),
                LatencyText.nativeMode(aaudio = true, exclusive = false, mmap = true),
                LatencyText.nativeMode(aaudio = true, exclusive = false, mmap = false),
            ),
        )
        assertEquals("AAudio exclusive (MMAP), 96-frame bursts", LatencyText.nativeEngine("AAudio exclusive (MMAP)", 96))
        assertEquals("AAudio shared, 240-frame bursts, normal path", LatencyText.nativeEngine("AAudio shared", 240, lowLatency = false))
        assertEquals("AudioTrack low-latency path, 192-frame bursts", LatencyText.trackEngine(true, 192))
        assertEquals("AudioTrack normal path, 960-frame bursts", LatencyText.trackEngine(false, 960))
        assertEquals("AudioTrack, old, low-latency path, 192-frame bursts", LatencyText.trackEngine(true, 192, old = true))
        assertEquals("latencyHint 0, 48000 Hz", LatencyText.webEngine(WebLatencyHint.ZERO, 48000))
        assertEquals("latencyHint 'interactive', 44100 Hz", LatencyText.webEngine(WebLatencyHint.INTERACTIVE, 44100))
    }

    @Test
    fun `numbers and estimates`() {
        assertEquals("median 31 ms · best 24 · worst 48 · 20 presses", LatencyText.stats(30.5, 24.2, 47.6, 20))
        assertEquals("median 9 ms · best 9 · worst 9 · 1 press", LatencyText.stats(9.0, 9.0, 9.0, 1))
        assertEquals("Median 31 milliseconds, best 24, worst 48, over 2 presses", LatencyText.statsDescription(30.5, 24.2, 47.6, 2))
        assertEquals(
            "Estimate: 192 frames ÷ 48000 Hz = 4.0 ms buffer, 96-frame bursts (2.0 ms)",
            LatencyText.estimate(192, 96, 48000),
        )
        assertEquals("Estimate: base 5.3 ms + output 21.0 ms = 26.3 ms", LatencyText.webEstimate(5.3, 21.0))
        assertEquals("Estimate: base 5.3 ms (output delay not reported)", LatencyText.webEstimate(5.3, null))
    }
}
