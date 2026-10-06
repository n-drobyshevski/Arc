package dev.arc.ep133.audio

import dev.arc.ep133.formats.Wav

/** A sound decoded and ready to play: 16-bit PCM, [channels] interleaved, at [sampleRate]. */
class PcmSound(val pcm: ShortArray, val channels: Int, val sampleRate: Int, val silent: Boolean) {
    /** What it takes in memory. */
    val bytes get() = pcm.size * 2L

    companion object {
        /** From little-endian 16-bit PCM bytes. */
        fun of(pcm: ByteArray, channels: Int, sampleRate: Int): PcmSound {
            val shorts = ShortArray(pcm.size / 2)
            java.nio.ByteBuffer.wrap(pcm).order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts)
            return PcmSound(shorts, channels.coerceIn(1, 2), sampleRate, Wav.isSilent(pcm))
        }

        /** From a WAV file's bytes. */
        fun ofWav(wav: ByteArray): PcmSound {
            val w = Wav.decode(wav)
            return of(w.pcm, w.channels, w.sampleRate.toInt())
        }
    }
}

/**
 * Decoded sounds kept for playing again at once (an addition), the least
 * recently played going first past [capBytes] (the one just put in always
 * stays). One thread only.
 */
class SoundMemory<K>(private val capBytes: Long) {
    private val map = LinkedHashMap<K, PcmSound>(16, 0.75f, true)

    /** What is kept, in bytes. */
    var bytes = 0L
        private set

    operator fun get(key: K): PcmSound? = map[key]

    fun containsKey(key: K) = map.containsKey(key)

    fun put(key: K, sound: PcmSound) {
        map.put(key, sound)?.let { bytes -= it.bytes }
        bytes += sound.bytes
        val it = map.entries.iterator()
        while (bytes > capBytes && it.hasNext()) {
            val e = it.next()
            if (e.value === sound) continue
            bytes -= e.value.bytes
            it.remove()
        }
    }

    fun remove(key: K) {
        map.remove(key)?.let { bytes -= it.bytes }
    }

    fun clear() {
        map.clear()
        bytes = 0
    }
}
