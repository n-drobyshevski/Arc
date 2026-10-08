package dev.arc.ep133.formats.fx

import kotlin.math.abs

/**
 * The reverb (the EP-133's REVERB): a small Freeverb of the send bus, X its
 * size (the combs' feedback), Y its tone, dark to bright.
 *
 * Jezar's Freeverb, at half its size: a channel has four damped comb filters
 * side by side, then two all-pass filters in a row, where Freeverb has eight
 * and four. The lines are Freeverb's first four combs (1116, 1188, 1277 and
 * 1356 frames) and last two all-passes (556 and 441), scaled from 44.1 kHz
 * to the mixer's rate in whole frames, the right channel's 23 frames longer
 * so the two sides differ. Both channels hear the input summed to mono
 * (times 0.015, Freeverb's gain), and each returns its own side, twice as
 * loud as Freeverb's default wet to make up for the combs it lacks.
 *
 * X is the combs' feedback, 0.7 to 0.98 (Freeverb's room size). Below the
 * middle Y darkens the tail: the combs' damping (a one-pole low-pass in each
 * loop) rises from Freeverb's default 0.2 at the middle to 0.8 at Y = 0.
 * Above it Y brightens the return instead: a high shelf above about 3 kHz
 * (the return plus its top end, from a trapezoidal one-pole), up to 2.5
 * times (+8 dB) at Y = 1.
 *
 * The feedback and damping are set once a block (in the loops, a step is
 * smoothed by the loops themselves); the shelf's gain glides across each
 * block, sample by sample (an addition). [silent] once its input has been
 * all 0, and what it added below 1e-6, for as long as the longest line and
 * its all-passes are: the whole tail has gone through by then.
 *
 * Every step is one Float operation in the order written: the C++
 * (app/src/main/cpp/fx/Reverb.h) and web (web/src/core/formats/fx/reverb.ts)
 * ports do the same.
 */
class Reverb(val outRate: Int) : Effect {
    companion object {
        /** Freeverb's comb and all-pass lengths at 44.1 kHz, and how much longer the right channel's are. */
        val COMBS = intArrayOf(1116, 1188, 1277, 1356)
        val ALLPASSES = intArrayOf(556, 441)
        const val SPREAD = 23
        const val BASE_RATE = 44100
        /** The input's gain into the combs (Freeverb's fixed gain). */
        const val INPUT = 0.015f
        /** The combs' feedback at X = 0, and what X = 1 adds to it. */
        const val ROOM = 0.7f
        const val ROOM_RANGE = 0.28f
        /** The combs' damping from the middle of Y up, and at Y = 0. */
        const val DAMP = 0.2f
        const val DAMP_DARK = 0.8f
        /** The all-passes' feedback. */
        const val ALLPASS = 0.5f
        /** The return's gain. */
        const val WET = 2f
        /** Where the bright shelf starts, and how much of the top end it adds at Y = 1. */
        const val SHELF_HZ = 3000f
        const val SHELF = 1.5f
        /** Below this, the return counts as silence. */
        const val TAIL = 1e-6f

        /** A channel's lines: its combs, then its all-passes. */
        private const val LINES = 6
        private const val COMB_COUNT = 4
    }

    /** Each line's length, where it starts in [lines] and where it is now; by channel, then line. */
    private val lengths = IntArray(2 * LINES) {
        val base = if (it % LINES < COMB_COUNT) COMBS[it % LINES] else ALLPASSES[it % LINES - COMB_COUNT]
        maxOf(1, (base + SPREAD * (it / LINES)) * outRate / BASE_RATE)
    }
    private val starts = IntArray(2 * LINES).also { for (i in 1 until it.size) it[i] = it[i - 1] + lengths[i - 1] }
    private val lines = FloatArray(starts[2 * LINES - 1] + lengths[2 * LINES - 1])
    private val positions = IntArray(2 * LINES)

    /** Each comb's low-pass state, by channel, then comb. */
    private val stores = FloatArray(2 * COMB_COUNT)

    /** The frames a tail takes to go through: the right channel's longest comb and its all-passes. */
    private val span = lengths[LINES + COMB_COUNT - 1] + lengths[LINES + COMB_COUNT] + lengths[LINES + COMB_COUNT + 1]

    /** The shelf's one-pole: its G and its state a channel. */
    private val shelfG = svfG(SHELF_HZ, outRate).let { it / (1f + it) }
    private val shelfStates = FloatArray(2)

    private var feedback = ROOM
    private var damp1 = DAMP
    private var damp2 = 1f - DAMP

    /** How much of the top end the shelf adds now, and where the block glides it to. */
    private var shelf = 0f
    private var shelfTo = 0f

    /** No knobs yet since the last [reset]: the next ones are taken as they are, with no glide. */
    private var fresh = true
    /** The frames since its input or its return was other than silence; nothing has been since the lines were cleared. */
    private var quietFrames = span
    private var clean = true

    override val silent: Boolean get() = quietFrames >= span

    override fun reset() {
        // Only what was written to needs clearing: a type change switches to a reverb that never ran at no cost.
        if (!clean) {
            lines.fill(0f)
            clean = true
        }
        positions.fill(0)
        stores.fill(0f)
        shelfStates.fill(0f)
        fresh = true
        quietFrames = span
    }

    override fun setParams(x: Float, y: Float, bpm: Float) {
        feedback = ROOM + ROOM_RANGE * x
        val damp: Float
        if (y < 0.5f) {
            damp = DAMP + (DAMP_DARK - DAMP) * ((0.5f - y) * 2f)
            shelfTo = 0f
        } else {
            damp = DAMP
            shelfTo = SHELF * ((y - 0.5f) * 2f)
        }
        damp1 = damp
        damp2 = 1f - damp
        if (fresh) {
            shelf = shelfTo
            fresh = false
        }
    }

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {
        if (frames <= 0) return
        clean = false
        val shelfStep = (shelfTo - shelf) / frames.toFloat()
        var k = shelf
        var zero = true
        var peak = 0f
        for (i in 0 until frames) {
            k += shelfStep
            val il = input[2 * i]
            val ir = input[2 * i + 1]
            if (il != 0f || ir != 0f) zero = false
            val mono = (il + ir) * INPUT
            for (c in 0 until 2) {
                // The combs, side by side.
                var acc = 0f
                for (j in 0 until COMB_COUNT) {
                    val line = c * LINES + j
                    val at = starts[line] + positions[line]
                    val o = lines[at]
                    val s = flush(o * damp2 + stores[c * COMB_COUNT + j] * damp1)
                    stores[c * COMB_COUNT + j] = s
                    lines[at] = flush(mono + s * feedback)
                    if (++positions[line] == lengths[line]) positions[line] = 0
                    acc += o
                }
                // The all-passes, in a row.
                for (j in COMB_COUNT until LINES) {
                    val line = c * LINES + j
                    val at = starts[line] + positions[line]
                    val b = lines[at]
                    lines[at] = flush(acc + b * ALLPASS)
                    if (++positions[line] == lengths[line]) positions[line] = 0
                    acc = b - acc
                }
                // The shelf: the return plus k times its top end.
                val wet = acc * WET
                val v = (wet - shelfStates[c]) * shelfG
                val low = v + shelfStates[c]
                shelfStates[c] = flush(low + v)
                val o = wet + k * (wet - low)
                out[2 * i + c] += o
                val a = abs(o)
                if (a > peak) peak = a
            }
        }
        shelf = shelfTo
        if (!zero || peak >= TAIL) quietFrames = 0 else if (quietFrames < span) quietFrames += frames
    }
}
