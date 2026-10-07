package dev.arc.ep133.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTimestamp
import android.media.AudioTrack
import dev.arc.ep133.features.Beat
import dev.arc.ep133.features.BeatGrid
import java.util.concurrent.locks.LockSupport

/**
 * The TEMPO key's click (an addition): a small mono AudioTrack of its own,
 * open while the click is on, beside Live's output rather than a voice in
 * its mix, so REC never records it and the mixers stay as they are. A
 * thread at audio priority writes it a burst at a time, blocking, into a
 * buffer of [BUFFER_BURSTS] bursts: silence with each click ([ClickTrack])
 * laid in at the frame [ClickScheduler] gives it, from the output's
 * timestamp. So the clicks are sample-accurate wherever the bursts fall.
 *
 * [bpm] may change while it runs (from the next beat). [grid] is asked for
 * the device's beats before each burst (null: run free); [onBeat] gets each
 * click as it is scheduled, with when it will be heard, on the thread;
 * [onEnded] is told, on it too, when the output fails rather than [close]
 * ending it.
 * [LiveAudio] owns it and its audio focus.
 */
internal class MetronomeOutput private constructor(
    private val track: AudioTrack,
    private val burst: Int,
    bpm: Int,
    private val grid: (now: Long) -> BeatGrid?,
    private val onBeat: (Beat) -> Unit,
    private val onEnded: (MetronomeOutput) -> Unit,
) {
    companion object {
        /** The buffer, in bursts: room for the thread to be late a little without a gap. */
        const val BUFFER_BURSTS = 4

        /** Opens and starts the click at [bpm]; null when the phone gives no output. */
        fun open(
            audio: AudioManager?,
            attributes: AudioAttributes,
            bpm: Int,
            grid: (now: Long) -> BeatGrid?,
            onBeat: (Beat) -> Unit,
            onEnded: (MetronomeOutput) -> Unit,
        ): MetronomeOutput? {
            val rate = audio?.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull() ?: 48000
            val burst = audio?.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER)?.toIntOrNull()?.takeIf { it > 0 } ?: 256
            val mask = AudioFormat.CHANNEL_OUT_MONO
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
                    .setBufferSizeInBytes(maxOf(minBuffer, burst * BUFFER_BURSTS * 2))
                    .build()
            }.getOrNull() ?: return null
            if (track.state != AudioTrack.STATE_INITIALIZED) {
                track.release()
                return null
            }
            // Bursts on the fast path; a phone that doesn't grant it keeps its usual buffer.
            if (track.performanceMode == AudioTrack.PERFORMANCE_MODE_LOW_LATENCY) track.setBufferSizeInFrames(burst * BUFFER_BURSTS)
            runCatching { track.play() }.onFailure {
                track.release()
                return null
            }
            return MetronomeOutput(track, burst, bpm, grid, onBeat, onEnded).apply { thread.start() }
        }
    }

    /** The phone's tempo, for a free run. */
    @Volatile var bpm: Int = bpm

    @Volatile private var running = true
    private val thread = Thread({ run() }, "arc-click").apply { isDaemon = true }

    /** Stops the click; the thread lets go of the track as it ends, within a burst. */
    fun close() {
        running = false
    }

    private fun run() {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
        val rate = track.sampleRate
        val scheduler = ClickScheduler(rate)
        val sound = ClickTrack(rate)
        val out = ShortArray(burst)
        val ts = AudioTimestamp()
        var written = 0L
        try {
            while (running) {
                val now = System.nanoTime()
                // No timestamp yet (just opened): the play head, now.
                val stamped = track.getTimestamp(ts)
                val stampFrame = if (stamped) ts.framePosition else track.playbackHeadPosition.toLong() and 0xFFFFFFFFL
                val stampNanos = if (stamped) ts.nanoTime else now
                val clicks = scheduler.block(written, burst, bpm, grid(now), stampFrame, stampNanos)
                sound.fill(out, burst, clicks)
                for (i in clicks.indices) onBeat(clicks[i].beat)
                var off = 0
                while (off < burst && running) {
                    val n = track.write(out, off, burst - off, AudioTrack.WRITE_BLOCKING)
                    if (n < 0) return
                    // Nothing taken (not playing): wait a little, never spin.
                    if (n == 0) LockSupport.parkNanos(1_000_000L)
                    off += n
                }
                written += burst
            }
        } finally {
            runCatching {
                track.pause()
                track.flush()
            }
            track.release()
            if (running) onEnded(this)
        }
    }
}
