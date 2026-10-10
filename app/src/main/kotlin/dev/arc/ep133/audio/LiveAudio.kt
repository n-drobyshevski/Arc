package dev.arc.ep133.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTimestamp
import android.media.AudioTrack
import dev.arc.ep133.features.RecState
import dev.arc.ep133.features.TakeRecorder
import dev.arc.ep133.formats.VoiceMixer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
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
 *
 * REC ([arm]) records the mix into a take: from the first sound after it (or
 * the EP-133 starting to play, [transportStarted]) to [stopRecording], Live
 * closing, [TakeRecorder.MAX_SECONDS], or the device stopping when its PLAY
 * started the take ([transportStopped]). [onTake] gets
 * the file (null when nothing was played or it couldn't be written), and
 * whether the limit stopped it, on the take's writer thread.
 */
class LiveAudio(
    context: Context,
    private val onStarted: (key: String, latencyMs: Double, route: AudioDeviceInfo?) -> Unit = { _, _, _ -> },
    private val onTake: (file: File?, seconds: Double, limit: Boolean, error: String?) -> Unit = { _, _, _, _ -> },
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

    private class Take(val recorder: TakeRecorder, val writer: TakeWriter) {
        @Volatile var limit = false
    }

    private val _rec = MutableStateFlow<RecState>(RecState.Idle)
    /** The REC key's state. */
    val rec: StateFlow<RecState> = _rec
    // A take armed but not yet picked up by the audio thread, and a stop asked for.
    @Volatile private var armed: Take? = null
    @Volatile private var stopAsked = false
    // The device's PLAY and STOP (MIDI clock), passed to the take on the audio thread.
    @Volatile private var transportStartAsked = false
    @Volatile private var transportStopAsked = false

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
        _rec.value = RecState.Idle
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

    /**
     * Arms REC: the next sound starts a take, written to [file]. Opens the
     * output first if Live hasn't. False when there is no output.
     */
    @Synchronized
    fun arm(file: File): Boolean {
        if (_rec.value != RecState.Idle) return true
        if (stream == null && !open()) return false
        val s = stream ?: return false
        val rate = s.track.sampleRate
        lateinit var take: Take
        take = Take(
            TakeRecorder(rate),
            TakeWriter(file, rate) { f, frames, error -> onTake(f, frames.toDouble() / rate, take.limit, error) },
        )
        take.recorder.arm()
        stopAsked = false
        armed = take
        _rec.value = RecState.Armed
        return true
    }

    /** Stops the take: what was recorded is saved (nothing, if nothing was played). */
    fun stopRecording() {
        if (_rec.value != RecState.Idle) stopAsked = true
    }

    /** The EP-133 started playing (MIDI Start or Continue): an armed take starts now. */
    fun transportStarted() {
        if (_rec.value == RecState.Armed) transportStartAsked = true
    }

    /** The EP-133 stopped (MIDI Stop): a take its PLAY started ends. */
    fun transportStopped() {
        if (_rec.value != RecState.Idle) transportStopAsked = true
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
        var take: Take? = null
        try {
            while (s.running) {
                armed?.let {
                    armed = null
                    take?.let { t -> end(t) }
                    take = it
                }
                if (transportStartAsked) {
                    transportStartAsked = false
                    take?.recorder?.transportStart()
                }
                if (transportStopAsked) {
                    transportStopAsked = false
                    if (take?.recorder?.byTransport == true) stopAsked = true
                }
                if (stopAsked) {
                    stopAsked = false
                    take?.let { end(it) }
                    take = null
                    if (armed == null) _rec.value = RecState.Idle
                }
                val at = s.mixer.frame
                s.mixer.render(out, s.burst)
                val started = s.mixer.started.toList()
                take?.let { t ->
                    val k = t.recorder.onBurst(out, s.burst, at, started.minOfOrNull { it.frame })
                    if (k != null) t.writer.write(out, k.from, k.frames)
                    if (k?.last == true) {
                        t.limit = true
                        end(t)
                        take = null
                        _rec.value = RecState.Idle
                    } else if (t.recorder.state == TakeRecorder.State.RECORDING) {
                        val now = RecState.Recording(t.recorder.seconds)
                        if (s.running && _rec.value != now) _rec.value = now
                    }
                }
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
            // Live closing ends the take; it is saved like any other.
            take?.let { end(it) }
            armed?.let {
                armed = null
                end(it)
            }
            runCatching {
                s.track.pause()
                s.track.flush()
            }
            s.track.release()
        }
    }

    /** Ends [t]: its writer keeps what was recorded up to the last sound. */
    private fun end(t: Take) {
        t.writer.finish(t.recorder.stop())
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
