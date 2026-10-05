package dev.arc.ep133.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.text.FeatureText
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlin.math.min

/** What [SoundPlayer.play] did. */
sealed interface PlayResult {
    /** Playing; [route] names the output Android picked ("Bluetooth (Buds)"). */
    data class Started(val route: String) : PlayResult

    data class Failed(val reason: String) : PlayResult
}

/**
 * Plays sounds on the phone (16-bit PCM, mono or stereo). [play] plays one
 * at a time: starting a sound stops the others, as lists want. [playVoice]
 * plays alongside what is playing, for Live's pads and keys (chords): the
 * same key starts over, and past [MAX_VOICES] the oldest stops; [release]
 * ends a voice when its pad or key is let go (a gate). [playing] is
 * the key of the latest sound playing, so lists can show a Stop key on the
 * right row; [playingKeys] are all of them.
 *
 * The PCM is streamed to the output from a small thread, as media players do,
 * rather than handed over as one static buffer: a whole sample can be several
 * MB, and static tracks are meant for short clips (on some phones they play
 * without being heard over Bluetooth). While a sound plays arc holds transient
 * audio focus, so other players pause or duck.
 */
class SoundPlayer(context: Context? = null) {
    companion object {
        /** What [play] accepts; anything else is not played. */
        fun canPlay(channels: Int, sampleRate: Long) = channels in 1..2 && sampleRate in 4000L..192000L

        private const val CHUNK = 16 * 1024

        /** Sounds at once; Android allows an app a few dozen tracks in all. */
        const val MAX_VOICES = 8

        /** A voice sounds at least this long, so the quickest tap is still heard. */
        const val MIN_GATE_NS = 60_000_000L

        /** A released voice fades out over this long rather than cutting off with a click. */
        private const val FADE_MS = 24L
        private const val FADE_STEPS = 6

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
    private val focus: AudioFocusRequest? = audio?.let {
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes)
            // A call or another app taking the output over stops the sound.
            .setOnAudioFocusChangeListener { change -> if (change < 0) stop() }
            .build()
    }

    /** One sound being played; the thread that feeds it owns (and releases) the track. */
    private class Playback(val key: String, val track: AudioTrack) {
        @Volatile var stopped = false
        var released = false
        val startedAt = System.nanoTime()
        /** When the voice is let go (a gate); it then fades out. */
        @Volatile var gateAt = Long.MAX_VALUE
    }

    // What is playing, oldest first.
    private val voices = LinkedHashMap<String, Playback>()
    private val _playing = MutableStateFlow<String?>(null)
    val playing: StateFlow<String?> = _playing
    private val _playingKeys = MutableStateFlow<Set<String>>(emptySet())
    val playingKeys: StateFlow<Set<String>> = _playingKeys

    private fun publish() {
        _playing.value = voices.keys.lastOrNull()
        _playingKeys.value = voices.keys.toSet()
        if (voices.isEmpty()) focus?.let { audio?.abandonAudioFocusRequest(it) }
    }

    /** Whether media volume is at zero (then nothing is heard even when the sound plays). */
    fun volumeOff(): Boolean = audio?.getStreamVolume(AudioManager.STREAM_MUSIC) == 0

    @Synchronized
    fun play(key: String, pcm: ByteArray, channels: Int, sampleRate: Int): PlayResult {
        stop()
        return start(key, pcm, channels, sampleRate)
    }

    /** Plays alongside the sounds already playing (a chord); the same [key] starts over. */
    @Synchronized
    fun playVoice(key: String, pcm: ByteArray, channels: Int, sampleRate: Int): PlayResult {
        voices[key]?.let { halt(it) }
        while (voices.size >= MAX_VOICES) halt(voices.values.first())
        return start(key, pcm, channels, sampleRate)
    }

    private fun start(key: String, pcm: ByteArray, channels: Int, sampleRate: Int): PlayResult {
        if (!canPlay(channels, sampleRate.toLong())) return PlayResult.Failed(FeatureText.unplayableFormat(channels, sampleRate))
        val frameBytes = 2 * channels
        val length = pcm.size - pcm.size % frameBytes
        if (length == 0 || Wav.isSilent(pcm)) return PlayResult.Failed(FeatureText.SILENT_SOUND)
        val mask = if (channels == 2) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO
        val minBuffer = AudioTrack.getMinBufferSize(sampleRate, mask, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuffer <= 0) return PlayResult.Failed(FeatureText.unplayableFormat(channels, sampleRate))
        val track = try {
            AudioTrack.Builder()
                .setAudioAttributes(attributes)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(mask)
                        .build(),
                )
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setBufferSizeInBytes(minBuffer * 4)
                .build()
        } catch (e: Exception) {
            return PlayResult.Failed(e.message ?: FeatureText.NO_AUDIO_OUTPUT)
        }
        if (track.state != AudioTrack.STATE_INITIALIZED) {
            track.release()
            return PlayResult.Failed(FeatureText.NO_AUDIO_OUTPUT)
        }
        // Denied focus (during a call, say) still plays: the user asked for the sound.
        focus?.let { audio?.requestAudioFocus(it) }
        val p = Playback(key, track)
        try {
            // Fill the buffer first so the output starts with sound, not an underrun.
            val first = track.write(pcm, 0, min(length, minBuffer * 4), AudioTrack.WRITE_NON_BLOCKING).coerceAtLeast(0)
            track.play()
            voices[key] = p
            publish()
            Thread({ feed(p, pcm, first, length, frameBytes) }, "arc-player").apply { isDaemon = true }.start()
        } catch (e: Exception) {
            track.release()
            if (voices.isEmpty()) focus?.let { audio?.abandonAudioFocusRequest(it) }
            return PlayResult.Failed(e.message ?: FeatureText.NO_AUDIO_OUTPUT)
        }
        val out = track.routedDevice
        return PlayResult.Started(routeName(out?.type, out?.productName?.toString()))
    }

    /** Writes the rest of the sound, waits until it has been heard, then lets go of the track. */
    private fun feed(p: Playback, pcm: ByteArray, start: Int, length: Int, frameBytes: Int) {
        val t = p.track
        var off = start
        while (!p.stopped && off < length) {
            if (gated(p)) return fadeOut(p)
            val n = t.write(pcm, off, min(CHUNK, length - off), AudioTrack.WRITE_NON_BLOCKING)
            if (n < 0) break
            if (n == 0) Thread.sleep(5) else off += n
        }
        // Wait for the last frame to play. A head that stops moving (the output went
        // away) ends the wait after two seconds.
        val frames = length / frameBytes
        var last = -1
        var still = 0
        while (!p.stopped) {
            if (gated(p)) return fadeOut(p)
            val head = runCatching { t.playbackHeadPosition }.getOrDefault(frames)
            if (head >= frames) break
            still = if (head == last) still + 1 else 0
            if (still > 100) break
            last = head
            Thread.sleep(20)
        }
        finish(p)
    }

    @Synchronized
    private fun finish(p: Playback) {
        if (voices[p.key] === p) {
            voices.remove(p.key)
            publish()
        }
        if (!p.released) {
            p.released = true
            runCatching { p.track.stop() }
            p.track.release()
        }
    }

    /**
     * Lets go of the voice [key]: it fades out now, or once it has sounded
     * [MIN_GATE_NS]. A voice that has not started yet is not affected.
     */
    @Synchronized
    fun release(key: String) {
        val p = voices[key] ?: return
        p.gateAt = maxOf(System.nanoTime(), p.startedAt + MIN_GATE_NS)
    }

    private fun gated(p: Playback) = System.nanoTime() >= p.gateAt

    /** Turns a let-go voice down in a few steps, then silences it. */
    private fun fadeOut(p: Playback) {
        for (i in FADE_STEPS - 1 downTo 0) {
            if (p.stopped) break
            runCatching { p.track.setVolume(i.toFloat() / FADE_STEPS) }
            Thread.sleep(FADE_MS / FADE_STEPS)
        }
        synchronized(this) { if (!p.stopped) halt(p) }
        finish(p)
    }

    /** Stops everything playing. */
    @Synchronized
    fun stop() {
        if (voices.isEmpty()) return
        for (p in voices.values.toList()) halt(p)
    }

    /** Silences one sound now; the feeding thread releases its track when it sees the flag. */
    private fun halt(p: Playback) {
        p.stopped = true
        if (!p.released) runCatching {
            p.track.pause()
            p.track.flush()
        }
        if (voices[p.key] === p) voices.remove(p.key)
        publish()
    }
}
