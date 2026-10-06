package dev.arc.ep133.audio

import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import java.util.concurrent.locks.LockSupport

/**
 * A stereo 16-bit output at the phone's own sample rate, in Android's
 * low-latency mode, written one burst at a time from the thread that owns it
 * (an addition, shared by [SoundPlayer] and Live's AudioTrack output,
 * [TrackLiveOutput]).
 *
 * It starts with a buffer of two bursts on the fast path (the phone's usual
 * one otherwise), grows by a burst whenever the output runs dry and shrinks
 * back after a quiet while ([OutputPacer]). The owner calls [ready] until it
 * says a burst is due, renders that burst, and hands it to [write]: so the
 * burst is made just before the output needs it, not made and then held in a
 * blocking write for a burst. Where the play head can't be trusted it falls
 * back to that blocking write. Neither allocates.
 *
 * [old] (Live's debug choice, for the latency test) writes every burst the
 * way it was before this pacing: rendered as soon as the last write
 * returned, then a blocking write, the buffer only growing.
 */
internal class BurstOutput private constructor(
    val track: AudioTrack,
    val burst: Int,
    /** Whether Android granted the low-latency (fast mixer) path. */
    val fast: Boolean,
    private val capacity: Int,
    initial: Int,
    val old: Boolean,
) {
    companion object {
        /** Opens and starts an output ([old]: blocking writes, as before the pacing); null when the phone gives none. */
        fun open(audio: AudioManager?, attributes: AudioAttributes, old: Boolean = false): BurstOutput? {
            val rate = audio?.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull() ?: 48000
            val burst = audio?.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER)?.toIntOrNull()?.takeIf { it > 0 } ?: 256
            val mask = AudioFormat.CHANNEL_OUT_STEREO
            val minBuffer = AudioTrack.getMinBufferSize(rate, mask, AudioFormat.ENCODING_PCM_16BIT)
            if (minBuffer <= 0) return null
            val track = runCatching {
                AudioTrack.Builder()
                    .setAudioAttributes(attributes)
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(rate)
                            .setChannelMask(mask)
                            .build(),
                    )
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
                    // Room to grow into when the output runs dry; what is used is set below.
                    .setBufferSizeInBytes(maxOf(minBuffer, burst * 8 * 4))
                    .build()
            }.getOrNull() ?: return null
            if (track.state != AudioTrack.STATE_INITIALIZED) {
                track.release()
                return null
            }
            // Two bursts on the fast path; a phone that doesn't grant it gets its usual buffer.
            val fast = track.performanceMode == AudioTrack.PERFORMANCE_MODE_LOW_LATENCY
            val size = track.setBufferSizeInFrames(if (fast) burst * 2 else minBuffer / 4)
            val out = BurstOutput(track, burst, fast, track.bufferCapacityInFrames, if (size > 0) size else track.bufferSizeInFrames, old)
            runCatching { track.play() }.onFailure {
                track.release()
                return null
            }
            return out
        }
    }

    val rate = track.sampleRate

    /**
     * How it was set up, for the debug log: "48000 Hz, 192-frame bursts,
     * AudioTrack low-latency path"; "…, AudioTrack, old, low-latency path" when [old].
     */
    val description = "$rate Hz, $burst-frame bursts, AudioTrack" + (if (old) ", old, " else " ") +
        if (fast) "low-latency path" else "normal path (no low-latency output)"

    private val pacer = OutputPacer(burst, rate, floor = if (fast) burst * 2 else initial, old = old)

    /** The buffer size in use, in frames: only this class sets it (the owning thread). */
    var size = initial
        private set
    // Whether the burst [ready] let through is to be written blocking.
    private var blockNext = false

    /**
     * Where the output goes, kept up to date by Android (reading it from the
     * track asks the audio service, which the audio thread mustn't wait for).
     */
    @Volatile
    var route: AudioDeviceInfo? = null
        private set

    // Called on the opening thread's looper, or the main one.
    private val routing = android.media.AudioRouting.OnRoutingChangedListener { r -> route = r.routedDevice }

    init {
        track.addOnRoutingChangedListener(routing, null)
        route = track.routedDevice
    }

    /** Whether a burst is due now; when not, it has waited a little and the caller asks again. */
    fun ready(): Boolean {
        val wait = pacer.next(track.playbackHeadPosition, size, System.nanoTime())
        if (wait > 0) {
            LockSupport.parkNanos(wait)
            return false
        }
        blockNext = wait == OutputPacer.BLOCK
        return true
    }

    /**
     * Writes the burst [out] ([burst] stereo frames) in full. When the output
     * takes only part of it, the rest follows in small waits, blocking once
     * the head has stood still a while. False when the output failed.
     */
    fun write(out: ShortArray): Boolean {
        val total = burst * 2
        var off = 0
        var block = blockNext
        var since = 0L
        while (off < total) {
            val n = track.write(out, off, total - off, if (block) AudioTrack.WRITE_BLOCKING else AudioTrack.WRITE_NON_BLOCKING)
            if (n < 0) return false
            off += n
            pacer.wrote(n / 2)
            if (off >= total) break
            if (n > 0) {
                since = 0L
                continue
            }
            // Nothing taken: wait a little, never spin; still nothing after a while, block (as before).
            val now = System.nanoTime()
            if (since == 0L) since = now
            if (now - since > pacer.stallNanos) block = true
            LockSupport.parkNanos(pacer.burstNanos / 8)
        }
        return true
    }

    /** After each burst: a burst more of buffer when the output ran dry, a burst less after a quiet while. */
    fun adjust() {
        val want = pacer.resize(size, capacity, track.underrunCount, System.nanoTime())
        if (want != size) {
            val set = track.setBufferSizeInFrames(want)
            if (set > 0) size = set
        }
    }

    /** Stops and lets go of the track (the owning thread, as it ends). */
    fun release() {
        track.removeOnRoutingChangedListener(routing)
        runCatching {
            track.pause()
            track.flush()
        }
        track.release()
    }
}
