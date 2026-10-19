package dev.arc.ep133.audio

import android.media.MediaCodec
import android.media.MediaCodecList
import android.media.MediaFormat
import dev.arc.ep133.formats.OggOpus
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.text.MirrorText
import java.io.IOException

/**
 * A take as a voice message (an addition): its WAV made mono at 48 kHz
 * ([OggOpus.voicePcm]), encoded to Opus by the phone's own encoder (Android
 * 10 has one) and wrapped as Ogg Opus, which Telegram sends as a voice
 * message. Blocking: call it off the main thread.
 */
object VoiceNote {
    /** Voice messages' bitrate: plenty for mono music at 48 kHz. */
    private const val BITRATE = 64_000
    private const val TIMEOUT_US = 10_000L

    /** [wav] as an Ogg Opus voice message. Throws IOException when the phone has no Opus encoder or it fails. */
    fun encode(wav: ByteArray): ByteArray {
        val w = Wav.decode(wav)
        val pcm = OggOpus.voicePcm(w.pcm, w.channels, w.sampleRate.toInt())
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, OggOpus.RATE, 1).apply {
            setInteger(MediaFormat.KEY_BIT_RATE, BITRATE)
        }
        val name = MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(format)
            ?: throw IOException(MirrorText.NO_VOICE_ENCODER)
        val codec = try {
            MediaCodec.createByCodecName(name).apply { configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE) }
        } catch (e: Exception) {
            throw IOException(MirrorText.NO_VOICE_ENCODER, e)
        }
        val packets = ArrayList<ByteArray>()
        // The encoder's config (an OpusHead among it, for the pre-skip), from its format and its config buffers.
        val config = java.io.ByteArrayOutputStream()
        try {
            codec.start()
            val info = MediaCodec.BufferInfo()
            var fed = 0
            var inputDone = false
            var outputDone = false
            while (!outputDone) {
                if (!inputDone) {
                    val i = codec.dequeueInputBuffer(TIMEOUT_US)
                    if (i >= 0) {
                        val buf = codec.getInputBuffer(i) ?: throw IOException(MirrorText.VOICE_FAILED)
                        buf.clear()
                        // Whole samples only.
                        val n = minOf(buf.remaining() and 1.inv(), pcm.size - fed)
                        buf.put(pcm, fed, n)
                        val us = fed / 2 * 1_000_000L / OggOpus.RATE
                        fed += n
                        inputDone = fed >= pcm.size
                        codec.queueInputBuffer(i, 0, n, us, if (inputDone) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0)
                    }
                }
                val o = codec.dequeueOutputBuffer(info, TIMEOUT_US)
                when {
                    o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED ->
                        codec.outputFormat.getByteBuffer("csd-0")?.let { b -> config.write(ByteArray(b.remaining()).also { b.duplicate().get(it) }) }
                    o >= 0 -> {
                        val buf = codec.getOutputBuffer(o)
                        if (buf != null && info.size > 0) {
                            val bytes = ByteArray(info.size)
                            buf.position(info.offset)
                            buf.get(bytes)
                            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) config.write(bytes) else packets += bytes
                        }
                        codec.releaseOutputBuffer(o, false)
                        outputDone = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                    }
                }
            }
        } catch (e: IOException) {
            throw e
        } catch (e: Exception) {
            throw IOException(MirrorText.VOICE_FAILED, e)
        } finally {
            runCatching { codec.stop() }
            codec.release()
        }
        return OggOpus.file(packets, 1, OggOpus.preSkipOf(config.toByteArray()), w.sampleRate.toInt(), samples = pcm.size / 2L)
    }
}
