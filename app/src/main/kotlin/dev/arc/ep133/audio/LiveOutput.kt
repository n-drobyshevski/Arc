package dev.arc.ep133.audio

import android.media.AudioDeviceInfo

/**
 * One of the outputs [LiveAudio] plays Live through (an addition): the native
 * engine ([NativeLiveOutput], Oboe and AAudio) when it loads and works, else
 * AudioTrack ([TrackLiveOutput]). Each has a thread of its own that tells
 * LiveAudio what happens through a [LiveListener].
 *
 * [prepare], [start], [release], [cut], [stopAll] and [recordFromNow] may be
 * called from any thread; [close] ends the thread (it lets go of the output as
 * it ends).
 */
internal interface LiveOutput {
    /** The output's sample rate (the mix's frames are counted at it). */
    val rate: Int

    /** How it is set up, for the debug log: "48000 Hz, 96-frame bursts, AAudio exclusive (MMAP)". */
    val description: String

    /** Where it goes now. */
    val route: AudioDeviceInfo?

    /**
     * Gets [pcm] ready for a [start], so that start finds it rather than
     * copying it: the native output copies it into the engine's memory now,
     * AudioTrack plays from the array and needs nothing. It may take a few
     * milliseconds, so not on the main thread.
     */
    fun prepare(pcm: ShortArray, channels: Int) {}

    /**
     * Plays [pcm] (16-bit, [channels] interleaved, at [sampleRate]) as voice
     * [key], [semitones] from its own pitch, until [release]; [tag] is the
     * press's time (System.nanoTime). False when it can't be played.
     */
    fun start(key: String, pcm: ShortArray, channels: Int, sampleRate: Int, semitones: Int, tag: Long): Boolean

    fun release(key: String)

    fun cut(key: String)

    fun stopAll()

    /** REC was just armed: the mix is to be handed over from now on, even before the thread notices. */
    fun recordFromNow()

    fun close()
}

/** What an output's thread tells [LiveAudio]; every call on that one thread. */
internal interface LiveListener {
    /** Before each block of mix is read: REC armed or stopped meanwhile is picked up. */
    fun beforeBlock()

    /** Whether the mix is wanted (REC armed, or a take going). */
    val recording: Boolean

    /** A block of the mix: [frames] stereo frames in [out], the first at mix frame [at] and [rate]; [firstStart] the first voice start in it. */
    fun mixed(out: ShortArray, frames: Int, at: Long, firstStart: Long?, rate: Int)

    /** A voice was heard [latencyMs] after its press, through [route]. */
    fun started(key: String, latencyMs: Double, route: AudioDeviceInfo?)

    /** The output goes to [route] now (routed anew, or reopened on another device); it may repeat the route it opened on. */
    fun routed(route: AudioDeviceInfo?)

    /** The keys sounding, after each block: the same set object until they change. */
    fun keys(keys: Set<String>)

    /** The output is set up differently now (it reopened on another route, or tuned its buffer). */
    fun changed(description: String)

    /** The thread is ending: a take still going is saved. */
    fun ended()

    /** The native engine gave out (dead, or stalled), after [ended]: Live carries on through AudioTrack. */
    fun gaveOut()
}

/**
 * Which engine Live's output opens on (an addition): native while the library
 * loads, until it fails [MAX_OPEN_FAILURES] opens in a row or once gives out
 * while playing (its stream dead or stalled, as an emulator's may be); from
 * then on, for the rest of the app's run, AudioTrack.
 */
internal class EngineChoice(private val nativeLoads: () -> Boolean) {
    companion object {
        const val MAX_OPEN_FAILURES = 2
    }

    private var openFailures = 0
    private var gaveOut = false

    /** Whether the next output should be the native one. */
    @Synchronized
    fun native(): Boolean = !gaveOut && openFailures < MAX_OPEN_FAILURES && nativeLoads()

    /** A native open worked, or didn't (the AudioTrack output is opened instead). */
    @Synchronized
    fun opened(ok: Boolean) {
        openFailures = if (ok) 0 else openFailures + 1
    }

    /** The native engine gave out while playing: AudioTrack from now on. */
    @Synchronized
    fun gaveOut() {
        gaveOut = true
    }
}

/**
 * Whether a native stream that should be playing has stopped calling back
 * (an addition): its callback count unchanged for [limitNanos] while
 * running. A stream reopening doesn't count.
 */
internal class StallWatch(private val limitNanos: Long) {
    private var last = -1L
    private var since = 0L

    fun stalled(callbacks: Long, running: Boolean, now: Long): Boolean {
        if (!running || callbacks != last) {
            last = callbacks
            since = now
            return false
        }
        return now - since > limitNanos
    }
}
