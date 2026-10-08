package dev.arc.ep133.formats.fx

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * The distortion (the EP-133's DISTORTION): the send bus driven into a soft
 * clip, X the drive, Y its colour (low-pass to high-pass, open in the middle).
 *
 * X drives the input 1 to 40 times (1 + 39 x², on the clip's scale, where
 * the mixer's full scale is 1) into [softClip], and brings what comes out
 * back down by 1 / sqrt(drive): a harder drive is denser more than it is
 * louder. Y colours the clip with a state-variable filter ([Svf], one a
 * channel): below the middle a low-pass that closes from 16 kHz down to
 * 200 Hz, above it a high-pass that opens from 20 Hz up to 6 kHz, its
 * resonance rising toward either end (Q 0.7 to 2.5). The filter fades in
 * over the first quarter of the way from the middle, so the middle is the
 * clip alone, exactly, and crossing it does not click: the filter starts
 * from silence, and from none of it heard, each time it comes in or changes
 * side.
 *
 * The drive, its make-up and how much of the filter is heard glide across
 * each block, sample by sample, from the last block's values to the new ones
 * (an addition); the filter's cutoff and Q are set once a block. [silent]
 * once a block's input was all 0 and what it added was below 1e-6.
 *
 * Every step is one Float operation in the order written: the C++
 * (app/src/main/cpp/fx/Distortion.h) and web
 * (web/src/core/formats/fx/distortion.ts) ports do the same.
 */
class Distortion(val outRate: Int) : Effect {
    companion object {
        /** The mixer's full scale: the clip's 1. */
        const val SCALE = 32768f
        /** The low-pass's cutoff at the middle and at Y = 0. */
        const val LOW_TOP = 16000f
        const val LOW_BOTTOM = 200f
        /** The high-pass's cutoff at the middle and at Y = 1. */
        const val HIGH_BOTTOM = 20f
        const val HIGH_TOP = 6000f
        /** The colour's Q at the middle, and what either end adds to it. */
        const val Q_OPEN = 0.7f
        const val Q_RANGE = 1.8f
        /** How fast the colour fades in away from the middle: fully in a quarter of the way to an end. */
        const val FADE_IN = 4f
        /** Below this, a block's return counts as silence. */
        const val TAIL = 1e-6f
    }

    private val left = Svf()
    private val right = Svf()

    /** The drive and make-up (on the mixer's scale) now, and where the block glides them to. */
    private var gainIn = 1f / SCALE
    private var gainOut = SCALE
    private var gainInTo = 1f / SCALE
    private var gainOutTo = SCALE

    /** How much of the filter is heard (0: none, the clip alone) now and by the block's end, and which side it is on. */
    private var colour = 0f
    private var colourTo = 0f
    private var colourLow = false

    /** No knobs yet since the last [reset]: the next ones are taken as they are, with no glide. */
    private var fresh = true
    private var quiet = true

    override val silent: Boolean get() = quiet

    override fun reset() {
        left.reset()
        right.reset()
        colour = 0f
        colourTo = 0f
        fresh = true
        quiet = true
    }

    override fun setParams(x: Float, y: Float, bpm: Float) {
        val drive = 1f + 39f * x * x
        gainInTo = drive / SCALE
        gainOutTo = SCALE / sqrt(drive)
        val t = abs(y - 0.5f) * 2f
        val low = y < 0.5f
        val fade = FADE_IN * t
        val mix = if (fade < 1f) fade else 1f
        if (mix > 0f) {
            val hz = if (low) knobHz(1f - t, LOW_BOTTOM, LOW_TOP) else knobHz(t, HIGH_BOTTOM, HIGH_TOP)
            val g = svfG(hz, outRate)
            val q = Q_OPEN + Q_RANGE * t * t
            // Coming in, or over to the other side: from silence, and faded in from none (near the
            // middle either side is close to the clip alone, so going back to none is no step).
            if (colourTo == 0f || low != colourLow) {
                left.reset()
                right.reset()
                colour = 0f
            }
            left.set(g, q)
            right.set(g, q)
        }
        colourTo = mix
        colourLow = low
        if (fresh) {
            gainIn = gainInTo
            gainOut = gainOutTo
            colour = colourTo
            fresh = false
        }
    }

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {
        if (frames <= 0) return
        val n = frames.toFloat()
        val inStep = (gainInTo - gainIn) / n
        val outStep = (gainOutTo - gainOut) / n
        val colourStep = (colourTo - colour) / n
        var gi = gainIn
        var go = gainOut
        var c = colour
        val filtered = colour > 0f || colourTo > 0f
        var zero = true
        var peak = 0f
        for (i in 0 until frames) {
            gi += inStep
            go += outStep
            c += colourStep
            val l = input[2 * i]
            val r = input[2 * i + 1]
            if (l != 0f || r != 0f) zero = false
            var wl = softClip(l * gi) * go
            var wr = softClip(r * gi) * go
            if (filtered) {
                left.process(wl)
                right.process(wr)
                wl = lerp(wl, if (colourLow) left.lp else left.hp, c)
                wr = lerp(wr, if (colourLow) right.lp else right.hp, c)
            }
            out[2 * i] += wl
            out[2 * i + 1] += wr
            val al = abs(wl)
            val ar = abs(wr)
            if (al > peak) peak = al
            if (ar > peak) peak = ar
        }
        gainIn = gainInTo
        gainOut = gainOutTo
        colour = colourTo
        quiet = zero && peak < TAIL
    }
}
