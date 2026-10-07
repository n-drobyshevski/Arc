package dev.arc.ep133.audio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The TEMPO key's click (an addition): a short sine blip, 1.6 kHz on a beat
 * and 2.4 kHz on a bar's first beat. It rises in [ATTACK_S] (raised cosine,
 * so no step to snap), decays with a [DECAY_S] time constant and ends in a
 * [FADE_S] fade to exactly zero, [LENGTH_S] in all, peaking near [PEAK_DBFS].
 * Rendered once per sample rate ([ClickTrack]), mono 16-bit.
 */
internal object ClickSound {
    const val FREQ = 1600.0
    const val ACCENT_FREQ = 2400.0
    const val ATTACK_S = 0.001
    const val DECAY_S = 0.007
    const val LENGTH_S = 0.030
    const val FADE_S = 0.002
    const val PEAK_DBFS = -7.0

    /** The envelope's top, as a 16-bit sample. */
    val peak: Double = 32767.0 * 10.0.pow(PEAK_DBFS / 20)

    /** The click at [rate] Hz, accented or not. */
    fun render(rate: Int, accent: Boolean): ShortArray {
        val n = (LENGTH_S * rate).roundToInt()
        val attack = ATTACK_S * rate
        val fade = FADE_S * rate
        val w = 2 * PI * (if (accent) ACCENT_FREQ else FREQ) / rate
        return ShortArray(n) { i ->
            val rise = if (i < attack) 0.5 * (1 - cos(PI * i / attack)) else 1.0
            val decay = if (i < attack) 1.0 else exp(-(i - attack) / (DECAY_S * rate))
            // The last sample is the fade's end: zero.
            val left = (n - 1 - i).toDouble()
            val end = if (left < fade) 0.5 * (1 - cos(PI * left / fade)) else 1.0
            (peak * rise * decay * end * sin(w * i)).roundToInt().toShort()
        }
    }
}

/**
 * Lays clicks into a click stream's blocks (an addition), for
 * [MetronomeOutput]: silence, and each [ClickScheduler.Click] from its
 * frame on, carried into the next block when it runs past this one's end.
 * A click that starts while another still sounds cuts it (they are far
 * apart: [ClickScheduler.MIN_GAP]). Allocates nothing per block.
 */
internal class ClickTrack(rate: Int) {
    private val plain = ClickSound.render(rate, accent = false)
    private val accented = ClickSound.render(rate, accent = true)
    // The click sounding and how far into it, across blocks.
    private var sound: ShortArray? = null
    private var pos = 0

    /** Fills [out]'s first [frames] (mono) with [clicks], which are in order and inside the block. */
    fun fill(out: ShortArray, frames: Int, clicks: List<ClickScheduler.Click>) {
        var c = 0
        for (i in 0 until frames) {
            while (c < clicks.size && clicks[c].offset <= i) {
                sound = if (clicks[c].beat.accent) accented else plain
                pos = 0
                c++
            }
            val s = sound
            if (s == null) {
                out[i] = 0
                continue
            }
            out[i] = s[pos++]
            if (pos >= s.size) sound = null
        }
    }
}
