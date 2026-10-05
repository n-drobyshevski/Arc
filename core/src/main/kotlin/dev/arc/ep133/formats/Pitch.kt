package dev.arc.ep133.formats

import kotlin.math.pow

/** Repitching for Live's KEYS (an addition). */
object Pitch {
    /**
     * Plays signed 16-bit little-endian [pcm] [semitones] higher (or lower),
     * as a sampler does: by reading it faster or slower, so it also gets
     * shorter or longer. Linear interpolation between frames.
     */
    fun shift(pcm: ByteArray, channels: Int, semitones: Int): ByteArray {
        if (semitones == 0 || channels < 1) return pcm
        val frameBytes = 2 * channels
        val inFrames = pcm.size / frameBytes
        if (inFrames < 2) return pcm
        val ratio = 2.0.pow(semitones / 12.0)
        val outFrames = ((inFrames - 1) / ratio).toInt() + 1
        val out = ByteArray(outFrames * frameBytes)
        fun sample(frame: Int, ch: Int): Int {
            val at = frame * frameBytes + ch * 2
            return (pcm[at].toInt() and 0xFF) or (pcm[at + 1].toInt() shl 8)
        }
        for (j in 0 until outFrames) {
            val pos = j * ratio
            val i0 = pos.toInt().coerceAtMost(inFrames - 1)
            val i1 = (i0 + 1).coerceAtMost(inFrames - 1)
            val frac = pos - i0
            for (ch in 0 until channels) {
                val v = (sample(i0, ch) * (1 - frac) + sample(i1, ch) * frac).toInt().coerceIn(-32768, 32767)
                val at = j * frameBytes + ch * 2
                out[at] = v.toByte()
                out[at + 1] = (v shr 8).toByte()
            }
        }
        return out
    }
}
