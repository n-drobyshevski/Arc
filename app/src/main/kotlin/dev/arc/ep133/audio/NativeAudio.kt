package dev.arc.ep133.audio

/**
 * The calls into Live's native engine, libarc_live.so (an addition; the C++
 * is in src/main/cpp): an Oboe (AAudio) stream mixed in its own callback by
 * a port of [dev.arc.ep133.formats.VoiceMixer]. [NativeLiveOutput] is the only
 * caller, and keeps to the engine's threads: one producer at a time (load,
 * unload, start, release, releaseAt, cut, stopAll, flushTimed, control), one
 * poll thread (the rest).
 *
 * A handle is from [create] and is good until [destroy]. Sounds are copied
 * into native memory by [load] and played by slot; keys are small ints
 * ([LiveKeys]). Nothing calls back into Kotlin: [poll] and [readMix] fetch
 * what the engine reported.
 */
internal object NativeAudio {
    /** [poll]'s header: data callbacks so far, engine state, stream generation, the report count, then [RENDERED]. */
    const val HEADER = 5

    /** Where [poll]'s header has the mix frames rendered so far (as the last callback left them). */
    const val RENDERED = 4

    /** Engine states ([poll]'s second number). */
    const val CLOSED = 0
    const val RUNNING = 1
    const val RESTARTING = 2
    const val DEAD = 3

    /** Reports, after [HEADER]: STARTED key, frame, tag; KEYS n, then n keys; OUTPUT xruns, buffer frames. */
    const val STARTED = 1L
    const val KEYS = 2L
    const val OUTPUT = 3L

    /** [info]'s fields. */
    const val RATE = 0
    const val BURST = 1
    const val BUFFER = 2
    const val CAPACITY = 3
    const val EXCLUSIVE = 4
    const val MMAP = 5
    const val LOW_LATENCY = 6
    const val AAUDIO = 7
    const val DEVICE = 8
    const val INFO_SIZE = 9

    /** Stereo frames in the largest REC block [readMix] hands back. */
    const val CHUNK = 1024

    /** Sound slots ([load]). */
    const val MAX_SAMPLES = 1024

    /**
     * Whether the library loaded. It never does in the JVM unit and screenshot
     * tests, nor on an ABI the APK has no build for; Live then uses AudioTrack.
     */
    val loaded: Boolean by lazy {
        try {
            System.loadLibrary("arc_live")
            true
        } catch (_: UnsatisfiedLinkError) {
            false
        } catch (_: SecurityException) {
            false
        }
    }

    /** A new engine, no stream yet; 0 when there is no memory for one. */
    @JvmStatic external fun create(): Long

    /** Opens and starts its stream; false when there is none. */
    @JvmStatic external fun open(handle: Long): Boolean

    /** Closes the stream and lets go of the engine and its sounds. */
    @JvmStatic external fun destroy(handle: Long)

    /** The stream's set-up, by the field constants above; false while there is no stream. */
    @JvmStatic external fun info(handle: Long, out: IntArray): Boolean

    /** Copies [pcm] ([channels] interleaved) into [slot]. False when it couldn't (and [slot] stays as it was). */
    @JvmStatic external fun load(handle: Long, slot: Int, pcm: ShortArray, channels: Int): Boolean

    /** Empties [slot]; voices playing its sound play on, and its memory goes once they end. */
    @JvmStatic external fun unload(handle: Long, slot: Int): Boolean

    /**
     * Starts voice [key] on [slot]'s sound, read at [sampleRate] and [pitch]
     * times faster; [tag] comes back with STARTED. Then the voice's
     * [dev.arc.ep133.formats.VoiceShape] field by field, less its semitones
     * (in [pitch] already), the mode by its ordinal; and the mix frame it
     * starts at, [at] ([dev.arc.ep133.formats.VoiceMixer.NOW]: as soon as it can).
     */
    @JvmStatic external fun start(
        handle: Long,
        key: Int,
        slot: Int,
        sampleRate: Int,
        pitch: Double,
        tag: Long,
        gain: Float,
        pan: Int,
        start: Int,
        end: Int,
        attackMs: Int,
        releaseMs: Int,
        mode: Int,
        muteGroup: Int,
        bus: Int,
        duckSource: Boolean,
        at: Long,
    ): Boolean

    @JvmStatic external fun release(handle: Long, key: Int): Boolean

    /** Lets go of voice [key] at mix frame [at]; a [tag] other than 0 lets go of only the voices started with it. */
    @JvmStatic external fun releaseAt(handle: Long, key: Int, at: Long, tag: Long): Boolean

    @JvmStatic external fun cut(handle: Long, key: Int): Boolean

    @JvmStatic external fun stopAll(handle: Long): Boolean

    /** Drops the timed starts and releases still waiting for their frame. */
    @JvmStatic external fun flushTimed(handle: Long): Boolean

    /**
     * Sets up the mixer's FX bus ([dev.arc.ep133.formats.VoiceMixer.control]):
     * [what] is one of [dev.arc.ep133.formats.fx.FxControl]'s commands. Kept
     * when the stream reopens. The same knob's commands queued faster than the
     * audio callback takes them apply only the last.
     */
    @JvmStatic external fun control(handle: Long, what: Int, index: Int, x: Float, y: Float): Boolean

    /** REC: whether the engine hands its mix back ([readMix]). */
    @JvmStatic external fun setRecording(handle: Long, on: Boolean)

    /** The header and the reports waiting, into [out]; returns the longs written. Frees sounds no voice reads any more. */
    @JvmStatic external fun poll(handle: Long, out: LongArray): Int

    /**
     * The next REC block into [out] (room for [CHUNK] stereo frames); [header]
     * gets its first mix frame, the first voice start in it (-1: none) and the
     * rate. Returns its frames, 0 when none wait.
     */
    @JvmStatic external fun readMix(handle: Long, out: ShortArray, header: LongArray): Int

    /**
     * When mix frame out[0] is heard: out[1] ([System.nanoTime]'s clock). 1
     * from the stream's timestamp, 2 estimated, 0 for none (no stream, or
     * one reopening).
     */
    @JvmStatic external fun timestamp(handle: Long, out: LongArray): Int
}
