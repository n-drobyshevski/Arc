package dev.arc.ep133.formats.fx

import kotlin.math.abs

/**
 * The filter (the EP-133's FILTER): a state-variable filter ([Svf], one a
 * channel) on the send bus, X a low-pass below the middle and a high-pass
 * above it (open between), Y its resonance.
 *
 * Below 0.47 X is a low-pass whose cutoff rises from 60 Hz (X = 0) to
 * 20 kHz (held to 0.4 of the rate), above 0.53 a high-pass from 20 Hz up to
 * 8 kHz, both on a cubic curve ([knobHz]) so the low end gets most of the
 * travel; between, the return is the input, exactly. Y is the Q, 0.5 to 8
 * (cubic too, so the middle is a gentle 1.4).
 *
 * Moving from one of the three to another crossfades over 10 ms: each has a
 * weight that rises to 1 while it is the one X is on and falls to 0 when it
 * is not, so even a jump straight across the middle, or back before a fade
 * is over, glides. The low-pass and high-pass have a filter each, which runs
 * only while it is heard and starts from silence when it comes back in.
 * The cutoff and Q are set once a block; the filter keeps its state, so a
 * sweep does not click.
 *
 * [silent] once a block's input was all 0 and what it added was below 1e-6.
 *
 * Every step is one Float operation in the order written: the C++
 * (app/src/main/cpp/fx/Filter.h) and web (web/src/core/formats/fx/filter.ts)
 * ports do the same.
 */
class Filter(val outRate: Int) : Effect {
    companion object {
        /** Where X stops being a low-pass, and where it starts being a high-pass. */
        const val LOW_END = 0.47f
        const val HIGH_START = 0.53f
        /** How far each of them runs along X. */
        const val SPAN = 0.47f
        const val LOW_FROM = 60f
        const val LOW_TO = 20000f
        const val HIGH_FROM = 20f
        const val HIGH_TO = 8000f
        const val Q_FROM = 0.5f
        const val Q_TO = 8f
        /** How long moving from one mode to another takes. */
        const val FADE_MS = 10
        /** Below this, a block's return counts as silence. */
        const val TAIL = 1e-6f

        /** The modes, by weight. */
        private const val LOW = 0
        private const val OPEN = 1
        private const val HIGH = 2
        private const val MODES = 3
    }

    private val fadeFrames = maxOf(1, FADE_MS * outRate / 1000)
    private val step = 1f / fadeFrames.toFloat()

    private val lowL = Svf()
    private val lowR = Svf()
    private val highL = Svf()
    private val highR = Svf()

    /** Each mode's weight in the return; while [fading], they glide toward 1 for [mode] and 0 for the rest. */
    private val weights = FloatArray(MODES).also { it[OPEN] = 1f }
    private var mode = OPEN
    private var fading = false

    /** No knobs yet since the last [reset]: the next ones set the mode at once, with no fade. */
    private var fresh = true
    private var quiet = true

    override val silent: Boolean get() = quiet

    override fun reset() {
        lowL.reset()
        lowR.reset()
        highL.reset()
        highR.reset()
        fresh = true
        quiet = true
    }

    override fun setParams(x: Float, y: Float, bpm: Float) {
        val q = Q_FROM + (Q_TO - Q_FROM) * y * y * y
        val m = if (x < LOW_END) LOW else if (x > HIGH_START) HIGH else OPEN
        if (m == LOW) {
            val g = svfG(knobHz(x / SPAN, LOW_FROM, LOW_TO), outRate)
            lowL.set(g, q)
            lowR.set(g, q)
        } else if (m == HIGH) {
            val g = svfG(knobHz((x - HIGH_START) / SPAN, HIGH_FROM, HIGH_TO), outRate)
            highL.set(g, q)
            highR.set(g, q)
        }
        if (fresh) {
            weights.fill(0f)
            weights[m] = 1f
            fading = false
            fresh = false
        } else if (m != mode) {
            // Coming back in from nothing: from silence.
            if (weights[m] == 0f) {
                if (m == LOW) {
                    lowL.reset()
                    lowR.reset()
                } else if (m == HIGH) {
                    highL.reset()
                    highR.reset()
                }
            }
            fading = true
        }
        mode = m
    }

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {
        var zero = true
        var peak = 0f
        for (i in 0 until frames) {
            val l = input[2 * i]
            val r = input[2 * i + 1]
            if (l != 0f || r != 0f) zero = false
            var sl: Float
            var sr: Float
            if (!fading) {
                when (mode) {
                    LOW -> {
                        lowL.process(l)
                        lowR.process(r)
                        sl = lowL.lp
                        sr = lowR.lp
                    }
                    HIGH -> {
                        highL.process(l)
                        highR.process(r)
                        sl = highL.hp
                        sr = highR.hp
                    }
                    else -> {
                        sl = l
                        sr = r
                    }
                }
            } else {
                var done = true
                for (k in 0 until MODES) {
                    val w = weights[k]
                    val v = if (k == mode) {
                        val up = w + step
                        if (up < 1f) up else 1f
                    } else {
                        val down = w - step
                        if (down > 0f) down else 0f
                    }
                    weights[k] = v
                    if (v != (if (k == mode) 1f else 0f)) done = false
                }
                sl = weights[OPEN] * l
                sr = weights[OPEN] * r
                val wl = weights[LOW]
                if (wl > 0f) {
                    lowL.process(l)
                    lowR.process(r)
                    sl += wl * lowL.lp
                    sr += wl * lowR.lp
                }
                val wh = weights[HIGH]
                if (wh > 0f) {
                    highL.process(l)
                    highR.process(r)
                    sl += wh * highL.hp
                    sr += wh * highR.hp
                }
                fading = !done
            }
            out[2 * i] += sl
            out[2 * i + 1] += sr
            val al = abs(sl)
            val ar = abs(sr)
            if (al > peak) peak = al
            if (ar > peak) peak = ar
        }
        quiet = zero && peak < TAIL
    }
}
