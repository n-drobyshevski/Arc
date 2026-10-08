package dev.arc.ep133.formats.fx

import kotlin.math.abs

/**
 * The chorus (the EP-133's CHORUS): two moving taps on a short delay of the
 * send bus, X their rate, Y their depth and feedback.
 *
 * The input, summed to mono, goes into a line about 25 ms long; the left
 * channel's return is read from it at one tap and the right's at another,
 * each 15 ms back give or take up to 10 ms, swung by a triangle LFO, the
 * right's a quarter of a cycle behind the left's, so the two sides move
 * apart. A tap is read between two samples with a straight line, so it
 * moves smoothly. X is the LFOs' rate, 0.05 to 5 Hz on a cubic curve
 * ([knobHz]). Y is how far they swing, from a quarter of the 10 ms at
 * Y = 0 (so it still moves) to all of it at Y = 1, and how much of the two
 * taps (their mean) is fed back into the line, 0 to 0.7.
 *
 * The swing and feedback glide across each block, sample by sample, from
 * the last block's values to the new ones (an addition); the rate is set
 * once a block. [silent] once the line has taken in nothing but silence
 * (below 1e-6) for as long as it is: its input all 0, and what it fed back
 * died away.
 *
 * Every step is one Float operation in the order written: the C++
 * (app/src/main/cpp/fx/Chorus.h) and web (web/src/core/formats/fx/chorus.ts)
 * ports do the same.
 */
class Chorus(val outRate: Int) : Effect {
    companion object {
        /** Where the taps sit, and how far either way they swing at most. */
        const val CENTRE_MS = 15f
        const val SWING_MS = 10f
        /** The LFOs' rate at X = 0 and X = 1. */
        const val RATE_FROM = 0.05f
        const val RATE_TO = 5f
        /** How much of the swing Y = 0 keeps. */
        const val DEPTH_FROM = 0.25f
        /** The feedback at Y = 1. */
        const val FEEDBACK = 0.7f
        /** The line's length: past the farthest tap, with room for the frame after it. */
        const val LINE_MS = 26
        /** Below this, what goes into the line counts as silence. */
        const val TAIL = 1e-6f
    }

    private val size = LINE_MS * outRate / 1000 + 3
    private val line = FloatArray(size)
    private var write = 0

    private val centre = CENTRE_MS * outRate.toFloat() / 1000f
    private val swingMax = SWING_MS * outRate.toFloat() / 1000f

    /** The LFOs' phase (the left's; the right's is a quarter on) and its step a frame. */
    private var phase = 0f
    private var step = 0f

    /** The swing (in frames) and feedback now, and where the block glides them to. */
    private var swing = 0f
    private var swingTo = 0f
    private var feedback = 0f
    private var feedbackTo = 0f

    /** No knobs yet since the last [reset]: the next ones are taken as they are, with no glide. */
    private var fresh = true
    /** The frames since something other than silence went into the line. */
    private var quietFrames = size

    override val silent: Boolean get() = quietFrames >= size

    override fun reset() {
        line.fill(0f)
        write = 0
        phase = 0f
        fresh = true
        quietFrames = size
    }

    override fun setParams(x: Float, y: Float, bpm: Float) {
        step = knobHz(x, RATE_FROM, RATE_TO) / outRate.toFloat()
        swingTo = swingMax * (DEPTH_FROM + (1f - DEPTH_FROM) * y)
        feedbackTo = FEEDBACK * y
        if (fresh) {
            swing = swingTo
            feedback = feedbackTo
            fresh = false
        }
    }

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {
        if (frames <= 0) return
        val n = frames.toFloat()
        val swingStep = (swingTo - swing) / n
        val feedbackStep = (feedbackTo - feedback) / n
        var sw = swing
        var fb = feedback
        var p = phase
        var w = write
        var zero = true
        var loud = false
        for (i in 0 until frames) {
            sw += swingStep
            fb += feedbackStep
            val a = tap(w, centre + sw * triangle(p))
            val b = tap(w, centre + sw * triangle(wrap01(p + 0.25f)))
            p = wrap01(p + step)
            val il = input[2 * i]
            val ir = input[2 * i + 1]
            if (il != 0f || ir != 0f) zero = false
            val v = flush((il + ir) * 0.5f + fb * ((a + b) * 0.5f))
            line[w] = v
            if (abs(v) >= TAIL) loud = true
            out[2 * i] += a
            out[2 * i + 1] += b
            w++
            if (w == size) w = 0
        }
        swing = swingTo
        feedback = feedbackTo
        phase = p
        write = w
        if (!zero || loud) quietFrames = 0 else if (quietFrames < size) quietFrames += frames
    }

    /** The line [t] frames before [w], between the two samples either side. */
    private fun tap(w: Int, t: Float): Float {
        val whole = t.toInt()
        val frac = t - whole.toFloat()
        var r0 = w - whole
        if (r0 < 0) r0 += size
        var r1 = r0 - 1
        if (r1 < 0) r1 += size
        return lerp(line[r0], line[r1], frac)
    }
}
