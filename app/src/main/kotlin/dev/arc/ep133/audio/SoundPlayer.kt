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
 * Plays one sound at a time on the phone (16-bit PCM, mono or stereo).
 * Starting a sound stops the previous one. [playing] is the key of what is
 * playing, so lists can show a Stop key on the right row.
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
    private class Playback(val track: AudioTrack) {
        @Volatile var stopped = false
        var released = false
    }

    private var current: Playback? = null
    private val _playing = MutableStateFlow<String?>(null)
    val playing: StateFlow<String?> = _playing

    /** Whether media volume is at zero (then nothing is heard even when the sound plays). */
    fun volumeOff(): Boolean = audio?.getStreamVolume(AudioManager.STREAM_MUSIC) == 0

    @Synchronized
    fun play(key: String, pcm: ByteArray, channels: Int, sampleRate: Int): PlayResult {
        stop()
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
        val p = Playback(track)
        try {
            // Fill the buffer first so the output starts with sound, not an underrun.
            val first = track.write(pcm, 0, min(length, minBuffer * 4), AudioTrack.WRITE_NON_BLOCKING).coerceAtLeast(0)
            track.play()
            current = p
            _playing.value = key
            Thread({ feed(p, pcm, first, length, frameBytes) }, "arc-player").apply { isDaemon = true }.start()
        } catch (e: Exception) {
            track.release()
            focus?.let { audio?.abandonAudioFocusRequest(it) }
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
        if (current === p) {
            current = null
            _playing.value = null
            focus?.let { audio?.abandonAudioFocusRequest(it) }
        }
        if (!p.released) {
            p.released = true
            runCatching { p.track.stop() }
            p.track.release()
        }
    }

    @Synchronized
    fun stop() {
        val p = current ?: return
        p.stopped = true
        // Silence now; the feeding thread releases the track when it sees the flag.
        if (!p.released) runCatching {
            p.track.pause()
            p.track.flush()
        }
        current = null
        _playing.value = null
        focus?.let { audio?.abandonAudioFocusRequest(it) }
    }
}
