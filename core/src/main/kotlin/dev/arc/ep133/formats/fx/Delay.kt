package dev.arc.ep133.formats.fx

import kotlin.math.abs

/**
 * The delay (the EP-133's DELAY): a tempo-synced echo of the send bus, X its
 * length (one of twelve divisions of the beat), Y its feedback.
 *
 * X picks the length from [TICKS] by twelfths of its travel: a 32nd note, a
 * 16th triplet, a 16th, an 8th triplet, a dotted 16th, an 8th, a quarter
 * triplet, a dotted 8th, a quarter, a half triplet, a dotted quarter and a
 * half. The tempo makes that frames (held to [MAX_SECONDS] and to at least
 * one); when it changes (X onto another division, or a new tempo), the read
 * head glides to the new length over 60 ms, in a straight line, its pitch
 * bending on the way as a tape's would. Y feeds 0 to 0.95 of the echo back
 * in, through a one-pole low-pass at 6 kHz (trapezoidal, so it is in tune),
 * so each repeat is a little darker than the last; the first is the input
 * as it was. Each channel echoes itself, at the same length on both (no
 * ping-pong). The echo is read between two samples with a straight line, so
 * a gliding length moves smoothly.
 *
 * The feedback glides across each block, sample by sample, from the last
 * block's value to the new one (an addition). [silent] once the line has
 * taken in nothing but silence (below 1e-6) for as long as it is: its input
 * all 0, and its echoes died away.
 *
 * Every step is one Float operation in the order written: the C++
 * (app/src/main/cpp/fx/Delay.h) and web (web/src/core/formats/fx/delay.ts)
 * ports do the same.
 */
class Delay(val outRate: Int) : Effect {
    companion object {
        /** Each length in 24ths of a beat: 1/32, 1/16T, 1/16, 1/8T, 1/16D, 1/8, 1/4T, 1/8D, 1/4, 1/2T, 1/4D, 1/2. */
        val TICKS = intArrayOf(3, 4, 6, 8, 9, 12, 16, 18, 24, 32, 36, 48)
        const val DIVISIONS = 12
        /** Seconds a 24th of a beat lasts at 1 BPM: 60 / 24. */
        const val TICK_SECONDS = 2.5f
        /** The longest echo. */
        const val MAX_SECONDS = 2
        /** The feedback at Y = 1. */
        const val FEEDBACK = 0.95f
        /** The cutoff of the low-pass in the loop. */
        const val DAMP_HZ = 6000f
        /** How long the read head takes to glide to a new length. */
        const val GLIDE_MS = 60
        /** Below this, what goes into the line counts as silence. */
        const val TAIL = 1e-6f
    }

    private val maxTime = MAX_SECONDS * outRate
    /** The line's length: the longest echo, and one more frame either side of the read. */
    private val size = maxTime + 2
    private val left = FloatArray(size)
    private val right = FloatArray(size)
    private var write = 0

    /** The loop's low-pass: G of a trapezoidal one-pole, and its state a channel. */
    private val damp = svfG(DAMP_HZ, outRate).let { it / (1f + it) }
    private var dampL = 0f
    private var dampR = 0f

    /** The echo's length in frames now and where it glides to, a frame's step and the frames to go. */
    private val glideFrames = maxOf(1, GLIDE_MS * outRate / 1000)
    private var time = 1f
    private var timeTo = 1f
    private var glideStep = 0f
    private var gliding = 0

    /** The feedback now, and where the block glides it to. */
    private var feedback = 0f
    private var feedbackTo = 0f

    /** No knobs yet since the last [reset]: the next ones are taken as they are, with no glide. */
    private var fresh = true
    /** The frames since something other than silence went into the line; nothing has since the line was cleared. */
    private var quietFrames = size
    private var clean = true

    override val silent: Boolean get() = quietFrames >= size

    override fun reset() {
        // Only what was written to needs clearing: a type change switches to a delay that never ran at no cost.
        if (!clean) {
            left.fill(0f)
            right.fill(0f)
            clean = true
        }
        write = 0
        dampL = 0f
        dampR = 0f
        gliding = 0
        fresh = true
        quietFrames = size
    }

    override fun setParams(x: Float, y: Float, bpm: Float) {
        val d = (x * DIVISIONS.toFloat()).toInt()
        val division = if (d < 0) 0 else if (d > DIVISIONS - 1) DIVISIONS - 1 else d
        val frames = TICKS[division].toFloat() * outRate.toFloat() * TICK_SECONDS / bpm
        val max = maxTime.toFloat()
        val t = if (frames > max) max else if (frames > 1f) frames else 1f
        feedbackTo = FEEDBACK * y
        if (fresh) {
            time = t
            timeTo = t
            gliding = 0
            feedback = feedbackTo
            fresh = false
        } else if (t != timeTo) {
            timeTo = t
            glideStep = (t - time) / glideFrames.toFloat()
            gliding = glideFrames
        }
    }

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {
        if (frames <= 0) return
        clean = false
        val feedbackStep = (feedbackTo - feedback) / frames.toFloat()
        var fb = feedback
        var t = time
        var w = write
        var sl = dampL
        var sr = dampR
        var zero = true
        var loud = false
        for (i in 0 until frames) {
            fb += feedbackStep
            if (gliding > 0) {
                gliding--
                t = if (gliding == 0) timeTo else t + glideStep
            }
            // The echo, between the two samples t frames back.
            val whole = t.toInt()
            val frac = t - whole.toFloat()
            var r0 = w - whole
            if (r0 < 0) r0 += size
            var r1 = r0 - 1
            if (r1 < 0) r1 += size
            val el = lerp(left[r0], left[r1], frac)
            val er = lerp(right[r0], right[r1], frac)
            // Back in through the low-pass.
            val vl = (el - sl) * damp
            val ll = vl + sl
            sl = flush(ll + vl)
            val vr = (er - sr) * damp
            val lr = vr + sr
            sr = flush(lr + vr)
            val il = input[2 * i]
            val ir = input[2 * i + 1]
            if (il != 0f || ir != 0f) zero = false
            val l = flush(il + fb * ll)
            val r = flush(ir + fb * lr)
            left[w] = l
            right[w] = r
            if (abs(l) >= TAIL || abs(r) >= TAIL) loud = true
            out[2 * i] += el
            out[2 * i + 1] += er
            w++
            if (w == size) w = 0
        }
        feedback = feedbackTo
        time = t
        write = w
        dampL = sl
        dampR = sr
        if (!zero || loud) quietFrames = 0 else if (quietFrames < size) quietFrames += frames
    }
}
