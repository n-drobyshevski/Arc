package dev.arc.ep133.text

import dev.arc.ep133.features.LatencyStats
import dev.arc.ep133.text.Format.plural
import dev.arc.ep133.util.jsToFixed

/**
 * Which output Live plays through on Android, a debug choice for comparing
 * latency (an addition): the native engine (falling back to AudioTrack, as
 * normal), AudioTrack rendering each burst just in time, or AudioTrack as it
 * was before the latency work (render, then a blocking write, no pacing,
 * tagged as media). The old way is the output only: touch input stays
 * unbuffered while Live is shown, as it is now.
 */
enum class LiveEngine { AUTO, TRACK, TRACK_OLD }

/** The same choice on the web: the AudioContext's latencyHint, 0 (now) or 'interactive' (before). */
enum class WebLatencyHint { ZERO, INTERACTIVE }

/**
 * The latency test in the debug screen (an addition): the audio engine
 * choice, and a row per engine tried this session with its press-to-sound
 * times ([LatencyStats]) and what its output says it should take.
 */
object LatencyText {
    const val TITLE = "Latency"
    const val HOW_TO = "Pick an engine, tap one pad ${LatencyStats.KEEP} times in Live, then compare."
    /** What the numbers measure. */
    const val MEASURES = "From the touch to the first sound leaving the output. Bluetooth adds its own delay on top."
    const val NO_PRESSES = "No presses yet."
    const val RESET = "Reset"
    /** The row of the engine Live plays through now. */
    const val IN_USE = "In use"

    const val ENGINE = "Audio engine"
    const val ENGINE_NOTE = "For testing. Live reopens its output when this changes."
    fun engine(e: LiveEngine) = when (e) {
        LiveEngine.AUTO -> "Auto"
        LiveEngine.TRACK -> "AudioTrack"
        LiveEngine.TRACK_OLD -> "AudioTrack, old"
    }
    /** Each choice's one-line note. */
    fun engineNote(e: LiveEngine) = when (e) {
        LiveEngine.AUTO -> "The native engine (AAudio), AudioTrack where it won't open."
        LiveEngine.TRACK -> "Each burst rendered just before the output needs it."
        LiveEngine.TRACK_OLD -> "Render, then a blocking write, as media, as before the latency work. Touch input stays as now."
    }
    fun hint(h: WebLatencyHint) = when (h) {
        WebLatencyHint.ZERO -> "latencyHint 0"
        WebLatencyHint.INTERACTIVE -> "latencyHint 'interactive'"
    }
    fun hintNote(h: WebLatencyHint) = when (h) {
        WebLatencyHint.ZERO -> "The smallest buffer the browser allows."
        WebLatencyHint.INTERACTIVE -> "The browser's usual buffer, as before the latency work."
    }

    // The engine on each row, as it opened. These are also the rows' keys in LatencyStats,
    // so they leave out what changes while it plays (a buffer grown after xruns).
    /** The native stream's mode, from its set-up. */
    fun nativeMode(aaudio: Boolean, exclusive: Boolean, mmap: Boolean) = when {
        !aaudio -> "OpenSL ES"
        exclusive -> "AAudio exclusive (MMAP)"
        mmap -> "AAudio shared (MMAP)"
        else -> "AAudio shared"
    }
    /** "AAudio exclusive (MMAP), 96-frame bursts". */
    fun nativeEngine(mode: String, burst: Int, lowLatency: Boolean = true) =
        "$mode, $burst-frame bursts" + if (lowLatency) "" else ", normal path"
    /** "AudioTrack low-latency path, 192-frame bursts", or "AudioTrack, old, low-latency path, 192-frame bursts". */
    fun trackEngine(fast: Boolean, burst: Int, old: Boolean = false) =
        (if (old) "${engine(LiveEngine.TRACK_OLD)}, " else "AudioTrack ") +
            (if (fast) "low-latency path" else "normal path") + ", $burst-frame bursts"
    /**
     * "latencyHint 0, 48000 Hz". The delay the browser reports drifts (and often reads 0 just
     * after a start), so it is left to [webEstimate].
     */
    fun webEngine(h: WebLatencyHint, rate: Int) = "${hint(h)}, $rate Hz"

    /** "median 31 ms · best 24 · worst 48 · 20 presses". */
    fun stats(median: Double, best: Double, worst: Double, count: Int) =
        "median ${whole(median)} ms · best ${whole(best)} · worst ${whole(worst)} · ${plural(count, "press", "presses")}"
    /** The same, spelt out for screen readers. */
    fun statsDescription(median: Double, best: Double, worst: Double, count: Int) =
        "Median ${whole(median)} milliseconds, best ${whole(best)}, worst ${whole(worst)}, over ${plural(count, "press", "presses")}"

    /**
     * What the Android output's buffer alone should take: "Estimate: 192 frames ÷ 48000 Hz
     * = 4.0 ms buffer, 96-frame bursts (2.0 ms)".
     */
    fun estimate(bufferFrames: Int, burstFrames: Int, rate: Int) =
        "Estimate: $bufferFrames frames ÷ $rate Hz = ${frames(bufferFrames, rate)} ms buffer, " +
            "$burstFrames-frame bursts (${frames(burstFrames, rate)} ms)"
    /** The web's: "Estimate: base 5.3 ms + output 21.0 ms = 26.3 ms", or the base alone where the output isn't reported. */
    fun webEstimate(baseMs: Double, outputMs: Double?) =
        if (outputMs == null) "Estimate: base ${ms(baseMs)} ms (output delay not reported)"
        else "Estimate: base ${ms(baseMs)} ms + output ${ms(outputMs)} ms = ${ms(baseMs + outputMs)} ms"

    private fun whole(ms: Double) = jsToFixed(ms, 0)
    private fun ms(ms: Double) = jsToFixed(ms, 1)
    private fun frames(n: Int, rate: Int) = if (rate > 0) ms(n * 1000.0 / rate) else "?"
}
