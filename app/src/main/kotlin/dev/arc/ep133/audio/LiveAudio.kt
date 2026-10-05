package dev.arc.ep133.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTimestamp
import android.media.AudioTrack
import dev.arc.ep133.formats.VoiceMixer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.concurrent.Executors

/**
 * Live's sound output (an addition): one low-latency stream, open while Live
 * is on screen, that [VoiceMixer] fills with the pads and keys being played.
 * A press only adds a voice, so it is heard after one or two of the output's
 * buffers (a few milliseconds each) rather than after a new track is set up.
 *
 * The stream runs at the phone's own sample rate with Android's low-latency
 * mode, which is what lets it take the fast mixer path; the EP-133's 46875 Hz
 * sounds are converted as they are mixed. It starts with a buffer of two
 * bursts and grows by one whenever the output runs dry.
 *
 * [onStarted] gets each voice's latency: from the press ([VoiceMixer.start]'s
 * tag, System.nanoTime) to when its first frame leaves the output, and where
 * the output goes. It is called on the audio thread.
 */
class LiveAudio(
    context: Context,
    private val onStarted: (key: String, latencyMs: Double, route: AudioDeviceInfo?) -> Unit = { _, _, _ -> },
) {
    private val audio = context.getSystemService(AudioManager::class.java)
    private val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
    // Focus is asked for when something sounds and let go once all is quiet, off the
    // UI and audio threads: a press must not wait for it.
    private val focusThread = Executors.newSingleThreadExecutor { r -> Thread(r, "arc-focus").apply { isDaemon = true } }
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes)
        // A call or another app taking the output over stops the sounds.
        .setOnAudioFocusChangeListener { change -> if (change < 0) stopAll() }
        .build()
    @Volatile private var focused = false

    private val _keys = MutableStateFlow<Set<String>>(emptySet())
    /** The voices sounding (pad and key ids), for the rings. */
    val keys: StateFlow<Set<String>> = _keys

    private class Stream(val track: AudioTrack, val mixer: VoiceMixer, val burst: Int) {
        @Volatile var running = true
        lateinit var thread: Thread
    }

    @Volatile private var stream: Stream? = null

    /** How the output was set up, for the debug log: "48000 Hz, 192-frame bursts, low-latency path". */
    var description = ""
        private set

    /** Opens the output (Live came on screen); nothing is heard until a voice starts. */
    @Synchronized
    fun open(): Boolean {
        if (stream != null) return true
        val rate = audio.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull() ?: 48000
        val burst = audio.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER)?.toIntOrNull()?.takeIf { it > 0 } ?: 256
        val mask = AudioFormat.CHANNEL_OUT_STEREO
        val minBuffer = AudioTrack.getMinBufferSize(rate, mask, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuffer <= 0) return false
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
        }.getOrNull() ?: return false
        if (track.state != AudioTrack.STATE_INITIALIZED) {
            track.release()
            return false
        }
        // Two bursts on the fast path; a phone that doesn't grant it gets its usual buffer.
        val fast = track.performanceMode == AudioTrack.PERFORMANCE_MODE_LOW_LATENCY
        track.setBufferSizeInFrames(if (fast) burst * 2 else minBuffer / 4)
        description = "${track.sampleRate} Hz, $burst-frame bursts, " + if (fast) "low-latency path" else "normal path (no low-latency output)"
        val s = Stream(track, VoiceMixer(track.sampleRate), burst)
        stream = s
        track.play()
        s.thread = Thread({ run(s) }, "arc-live-audio").apply {
            isDaemon = true
            start()
        }
        return true
    }

    /** Closes the output (Live left the screen); what was sounding stops. */
    fun close() {
        val s = synchronized(this) { stream.also { stream = null } } ?: return
        s.running = false
        _keys.value = emptySet()
        letGoOfFocus()
    }

    /**
     * Plays [pcm] as voice [key] ([semitones] from its own pitch) until
     * [release]; [pressedAt] (System.nanoTime) is when the finger came down.
     * Opens the output first if Live hasn't. False when there is no output.
     */
    fun play(key: String, pcm: ShortArray, channels: Int, sampleRate: Int, semitones: Int, pressedAt: Long): Boolean {
        if (stream == null && !open()) return false
        val s = stream ?: return false
        s.mixer.start(key, pcm, channels, sampleRate, semitones, pressedAt)
        if (!focused) {
            focused = true
            focusThread.execute { audio.requestAudioFocus(focus) }
        }
        return true
    }

    fun release(key: String) {
        stream?.mixer?.release(key)
    }

    fun stopAll() {
        stream?.mixer?.stopAll()
    }

    /** Where the output goes now, once it is open. */
    fun route(): AudioDeviceInfo? = stream?.track?.routedDevice

    private fun letGoOfFocus() {
        if (!focused) return
        focused = false
        focusThread.execute { audio.abandonAudioFocusRequest(focus) }
    }

    private fun run(s: Stream) {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
        val out = ShortArray(s.burst * 2)
        val ts = AudioTimestamp()
        var underruns = 0
        var quietSince = 0L
        try {
            while (s.running) {
                s.mixer.render(out, s.burst)
                val started = s.mixer.started.toList()
                if (s.track.write(out, 0, out.size, AudioTrack.WRITE_BLOCKING) < 0) break
                if (started.isNotEmpty()) report(s, started, ts)
                val keys = s.mixer.keys
                if (s.running && keys != _keys.value) _keys.value = keys
                // Quiet for two seconds: other apps may have the output back.
                if (keys.isEmpty()) {
                    if (quietSince == 0L) quietSince = System.nanoTime()
                    if (focused && System.nanoTime() - quietSince > 2_000_000_000L) letGoOfFocus()
                } else {
                    quietSince = 0L
                }
                // The output ran dry: a burst more of buffer, while there is room.
                val u = s.track.underrunCount
                if (u > underruns) {
                    underruns = u
                    val size = s.track.bufferSizeInFrames
                    if (size + s.burst <= s.track.bufferCapacityInFrames) s.track.setBufferSizeInFrames(size + s.burst)
                }
            }
        } finally {
            runCatching {
                s.track.pause()
                s.track.flush()
            }
            s.track.release()
        }
    }

    /** When each new voice's first frame is heard, from the output's timestamp. */
    private fun report(s: Stream, started: List<VoiceMixer.Started>, ts: AudioTimestamp) {
        val rate = s.track.sampleRate.toDouble()
        val now = System.nanoTime()
        val (atNanos, atFrame) = if (s.track.getTimestamp(ts)) {
            ts.nanoTime to ts.framePosition
        } else {
            // No timestamp yet (the output just opened): what is written but not played.
            now to s.track.playbackHeadPosition.toLong()
        }
        val route = s.track.routedDevice
        for (v in started) {
            if (v.tag == 0L) continue
            val heardAt = atNanos + ((v.frame - atFrame) / rate * 1e9).toLong()
            onStarted(v.key, (heardAt - v.tag) / 1e6, route)
        }
    }
}
