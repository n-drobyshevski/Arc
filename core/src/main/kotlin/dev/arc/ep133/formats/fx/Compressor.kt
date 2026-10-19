package dev.arc.ep133.formats.fx

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * The compressor: a feed-forward, stereo-linked peak compressor, 4:1 above
 * -18 dBFS, X its input drive (with make-up gain) and Y its speed (attack and
 * release, fast to slow). The bus has two: the EP-133's COMPRESSOR effect on
 * the send bus ([process], as every [Effect]), and the master compressor
 * after everything (an addition, [processInPlace]).
 *
 * X drives the input 1 to 8 times (1 + 7 x²) and makes it up by
 * 1 / sqrt(drive) on the way out, so a harder drive is pushed further into
 * the compressor while what is below the threshold comes up by sqrt(drive).
 * The envelope follows the louder channel's peak (the two channels are
 * compressed alike) with a one-pole ([onePoleCoef]) that rises at the attack
 * and falls at the release; above the threshold the gain is
 * (threshold / envelope)^(3/4), the 4:1 slope, worked out as
 * q³ with q = sqrt(sqrt(threshold / envelope)). Y picks one of eight
 * attack and release pairs, from 0.5 ms / 40 ms to 30 ms / 600 ms.
 *
 * The drive and make-up glide across each block, sample by sample, from the
 * last block's values to the new ones (an addition). With no tail of its
 * own (its return is its input times a gain), it is [silent] once a block's
 * input was all 0 and the envelope is below the threshold: skipped blocks
 * then leave the envelope where it was, which changes nothing until a peak
 * takes it over the threshold again.
 *
 * Every step is one Float operation in the order written: the C++
 * (app/src/main/cpp/fx/Compressor.h) and web
 * (web/src/core/formats/fx/compressor.ts) ports do the same.
 */
class Compressor(val outRate: Int) : Effect {
    companion object {
        /** -18 dBFS on the mixer's scale: 0.1259 × 32768, to the nearest half (exact in Float). */
        const val THRESHOLD = 4125.5f
        /** The speeds Y picks from, fast to slow: attack and release, in ms. */
        val ATTACK_MS = floatArrayOf(0.5f, 1f, 2f, 4f, 7f, 12f, 20f, 30f)
        val RELEASE_MS = floatArrayOf(40f, 60f, 90f, 130f, 190f, 280f, 420f, 600f)
        const val SPEEDS = 8
    }

    private val attacks = FloatArray(SPEEDS) { onePoleCoef(ATTACK_MS[it], outRate) }
    private val releases = FloatArray(SPEEDS) { onePoleCoef(RELEASE_MS[it], outRate) }
    private var attack = attacks[SPEEDS / 2]
    private var release = releases[SPEEDS / 2]

    /** The drive and make-up now, and where the block glides them to. */
    private var drive = 1f
    private var makeup = 1f
    private var driveTo = 1f
    private var makeupTo = 1f
    private var env = 0f

    /** No knobs yet since the last [reset]: the next ones are taken as they are, with no glide. */
    private var fresh = true
    private var quiet = true

    override val silent: Boolean get() = quiet && env < THRESHOLD

    override fun reset() {
        env = 0f
        fresh = true
        quiet = true
    }

    override fun setParams(x: Float, y: Float, bpm: Float) {
        driveTo = 1f + 7f * x * x
        makeupTo = 1f / sqrt(driveTo)
        if (fresh) {
            drive = driveTo
            makeup = makeupTo
            fresh = false
        }
        val s = (y * SPEEDS.toFloat()).toInt()
        val speed = if (s < 0) 0 else if (s > SPEEDS - 1) SPEEDS - 1 else s
        attack = attacks[speed]
        release = releases[speed]
    }

    override fun process(input: FloatArray, out: FloatArray, frames: Int) = run(input, out, frames, add = true)

    /** Compresses [mix] (stereo, interleaved, [frames] long) in place: the master compressor. */
    fun processInPlace(mix: FloatArray, frames: Int) = run(mix, mix, frames, add = false)

    /** [input] compressed into [out]: added to it, or in place of it. */
    private fun run(input: FloatArray, out: FloatArray, frames: Int, add: Boolean) {
        if (frames <= 0) return
        val n = frames.toFloat()
        val driveStep = (driveTo - drive) / n
        val makeupStep = (makeupTo - makeup) / n
        var d = drive
        var m = makeup
        var e = env
        var zero = true
        for (i in 0 until frames) {
            d += driveStep
            m += makeupStep
            val l = input[2 * i]
            val r = input[2 * i + 1]
            if (l != 0f || r != 0f) zero = false
            val dl = l * d
            val dr = r * d
            val al = abs(dl)
            val ar = abs(dr)
            val p = if (al > ar) al else ar
            e = flush(e + (if (p > e) attack else release) * (p - e))
            var g = m
            if (e > THRESHOLD) {
                val q = sqrt(sqrt(THRESHOLD / e))
                g = q * q * q * m
            }
            if (add) {
                out[2 * i] += dl * g
                out[2 * i + 1] += dr * g
            } else {
                out[2 * i] = dl * g
                out[2 * i + 1] = dr * g
            }
        }
        drive = driveTo
        makeup = makeupTo
        env = e
        quiet = zero
    }
}
