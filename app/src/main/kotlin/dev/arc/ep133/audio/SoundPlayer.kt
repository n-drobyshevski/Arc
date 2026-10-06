package dev.arc.ep133.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.text.FeatureText
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.concurrent.Executors

/** What [SoundPlayer.play] did. */
sealed interface PlayResult {
    /** Playing; [route] names the output Android picked ("Bluetooth (Buds)"). */
    data class Started(val route: String) : PlayResult

    data class Failed(val reason: String) : PlayResult
}

/**
 * Plays sounds on the phone (16-bit PCM, mono or stereo), one at a time:
 * starting a sound stops the one before, as lists want. [playing] is the key
 * of the sound playing, so lists can show a Stop key on the right row. Live's
 * pads and keys play through [LiveAudio] instead.
 *
 * Its output works as Live's does ([BurstOutput]): one low-latency stream at
 * the phone's own rate, opened by the first sound and kept while sounds
 * follow, let go of after [IDLE_NS] without one. A sound is a single
 * [VoiceMixer] voice on it, read at its own rate (converted as it is mixed)
 * straight from memory, so a several-MB sample needs no buffer of its own and
 * a replay starts within a burst. While a sound plays arc holds transient
 * audio focus, so other players pause or duck; it is asked for off the UI thread.
 */
class SoundPlayer(context: Context? = null) {
    companion object {
        /** What [play] accepts; anything else is not played. */
        fun canPlay(channels: Int, sampleRate: Long) = channels in 1..2 && sampleRate in 4000L..192000L

        /** Nothing played for this long: the output is let go of, until the next sound. */
        private const val IDLE_NS = 5_000_000_000L

        @android.annotation.SuppressLint("InlinedApi")
        fun isBluetooth(type: Int): Boolean = type in setOf(
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
            AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER, AudioDeviceInfo.TYPE_BLE_BROADCAST,
        )

        /**
         * A short name for where the sound goes. Newer device types are plain
         * numbers on older Android versions, where they simply never occur.
         */
        @android.annotation.SuppressLint("InlinedApi")
        fun routeName(type: Int?, product: String?): String {
            val kind = when (type) {
                null -> "default output"
                AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER, AudioDeviceInfo.TYPE_BLE_BROADCAST,
                -> "Bluetooth"
                AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET -> "headphones"
                AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_ACCESSORY -> "USB"
                AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> "phone speaker"
                AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
                AudioDeviceInfo.TYPE_HDMI, AudioDeviceInfo.TYPE_HDMI_ARC, AudioDeviceInfo.TYPE_HDMI_EARC -> "HDMI"
                else -> "output type $type"
            }
            return if (product.isNullOrBlank()) kind else "$kind ($product)"
        }
    }

    private val audio = context?.getSystemService(AudioManager::class.java)
    private val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
    // Focus (and the volume watch) are asked for and let go of here, off the UI and audio threads.
    private val focusThread = Executors.newSingleThreadExecutor { r -> Thread(r, "arc-player-focus").apply { isDaemon = true } }
    private val focus: AudioFocusRequest? = audio?.let {
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes)
            // A call or another app taking the output over stops the sound.
            .setOnAudioFocusChangeListener { change -> if (change < 0) stop() }
            .build()
    }
    private var focused = false

    /** Whether media volume is at zero, kept up to date while this output (or Live, which shares it) is open. */
    val volume = VolumeWatch(context)

    /** The open output and the thread that feeds it (and releases it). */
    private class Stream(val output: BurstOutput, val mixer: VoiceMixer) {
        @Volatile var running = true
    }

    private var stream: Stream? = null
    // Bumped by every play and stop: the output's thread shows what it plays only when no newer one waits.
    @Volatile private var requests = 0L
    private val _playing = MutableStateFlow<String?>(null)
    val playing: StateFlow<String?> = _playing

    /** Whether media volume is at zero (then nothing is heard even when the sound plays). */
    fun volumeOff(): Boolean = volume.off

    @Synchronized
    fun play(key: String, pcm: ByteArray, channels: Int, sampleRate: Int): PlayResult {
        if (!canPlay(channels, sampleRate.toLong())) {
            stop()
            return PlayResult.Failed(FeatureText.unplayableFormat(channels, sampleRate))
        }
        return play(key, PcmSound.of(pcm, channels, sampleRate))
    }

    /** Plays a sound already decoded (kept for replays). */
    @Synchronized
    fun play(key: String, sound: PcmSound): PlayResult {
        stop()
        if (!canPlay(sound.channels, sound.sampleRate.toLong())) return PlayResult.Failed(FeatureText.unplayableFormat(sound.channels, sound.sampleRate))
        if (sound.pcm.size < sound.channels || sound.silent) return PlayResult.Failed(FeatureText.SILENT_SOUND)
        val s = stream ?: open() ?: return PlayResult.Failed(FeatureText.NO_AUDIO_OUTPUT)
        s.mixer.start(key, sound.pcm, sound.channels, sound.sampleRate)
        requests++
        _playing.value = key
        // Denied focus (during a call, say) still plays: the user asked for the sound.
        if (!focused && focus != null) {
            focused = true
            focusThread.execute { audio?.requestAudioFocus(focus) }
        }
        val out = s.output.route
        return PlayResult.Started(routeName(out?.type, out?.productName?.toString()))
    }

    /** Stops everything playing. */
    @Synchronized
    fun stop() {
        if (_playing.value == null) return
        stream?.mixer?.stopAll()
        requests++
        _playing.value = null
        letGoOfFocus()
    }

    private fun letGoOfFocus() {
        if (!focused || focus == null) return
        focused = false
        focusThread.execute { audio?.abandonAudioFocusRequest(focus) }
    }

    /** Opens the output and starts its thread; null when the phone gives none. Under the lock. */
    private fun open(): Stream? {
        val output = BurstOutput.open(audio, attributes) ?: return null
        val s = Stream(output, VoiceMixer(output.rate, maxVoices = 1))
        stream = s
        // Off the caller's (main) thread too: watching asks another process. Posted in order with
        // the stops below, so the starts and stops stay paired; until it is read, [volumeOff] asks.
        focusThread.execute { volume.start() }
        Thread({ run(s) }, "arc-player").apply { isDaemon = true }.start()
        return s
    }

    /** Mixes and writes each burst just in time, and shows when the sound has ended. */
    private fun run(s: Stream) {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
        val o = s.output
        val out = ShortArray(o.burst * 2)
        var shown: Set<String>? = null
        var shownRequest = -1L
        var quietSince = 0L
        try {
            while (s.running) {
                if (!o.ready()) continue
                val request = requests
                s.mixer.render(out, o.burst)
                if (!o.write(out)) break
                val keys = s.mixer.keys
                if (keys !== shown || request != shownRequest) {
                    shown = keys
                    shownRequest = request
                    ended(keys, request)
                }
                if (keys.isEmpty()) {
                    val now = System.nanoTime()
                    if (quietSince == 0L) quietSince = now
                    if (now - quietSince > IDLE_NS && closeIfIdle(s, request)) break
                } else {
                    quietSince = 0L
                }
                o.adjust()
            }
        } finally {
            o.release()
            synchronized(this) {
                // The output failed: nothing plays any more.
                if (stream === s) {
                    stream = null
                    focusThread.execute { volume.stop() }
                    _playing.value = null
                    letGoOfFocus()
                }
            }
        }
    }

    /** What the burst mixed after [request] sounds; once nothing does, the sound is over. */
    @Synchronized
    private fun ended(keys: Set<String>, request: Long) {
        // A play or stop since then shows itself.
        if (request != requests || keys.isNotEmpty() || _playing.value == null) return
        _playing.value = null
        letGoOfFocus()
    }

    /** Lets go of the output when nothing was played since [request]; false when something was. */
    @Synchronized
    private fun closeIfIdle(s: Stream, request: Long): Boolean {
        if (request != requests || stream !== s) return false
        stream = null
        s.running = false
        // Off the audio thread: letting go of the broadcasts asks another process.
        focusThread.execute { volume.stop() }
        return true
    }
}
