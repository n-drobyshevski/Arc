package dev.arc.ep133.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Plays one sound at a time on the phone (16-bit PCM, mono or stereo).
 * Starting a sound stops the previous one. [playing] is the key of what is
 * playing, so lists can show a Stop key on the right row.
 */
class SoundPlayer {
    private var track: AudioTrack? = null
    private val _playing = MutableStateFlow<String?>(null)
    val playing: StateFlow<String?> = _playing

    @Synchronized
    fun play(key: String, pcm: ByteArray, channels: Int, sampleRate: Int) {
        stop()
        if (pcm.isEmpty() || channels !in 1..2 || sampleRate !in 4000..192000) return
        val frames = pcm.size / (2 * channels)
        val t = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(if (channels == 2) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(frames * 2 * channels)
            .build()
        t.write(pcm, 0, frames * 2 * channels)
        t.setNotificationMarkerPosition(frames)
        t.setPlaybackPositionUpdateListener(object : AudioTrack.OnPlaybackPositionUpdateListener {
            override fun onMarkerReached(track: AudioTrack) {
                finished(track)
            }

            override fun onPeriodicNotification(track: AudioTrack) = Unit
        })
        track = t
        _playing.value = key
        t.play()
    }

    @Synchronized
    private fun finished(t: AudioTrack) {
        if (track === t) stop()
    }

    @Synchronized
    fun stop() {
        track?.let {
            runCatching { it.stop() }
            it.release()
        }
        track = null
        _playing.value = null
    }
}
