package dev.arc.ep133.formats.fx

/**
 * A state-variable filter (an addition), one channel: the topology-preserving
 * (trapezoidal) form from Zavalishin's "The Art of VA Filter Design", in
 * Simper's arrangement, so it stays stable and in tune right up to the cutoff
 * cap and while the cutoff moves. Each [process] gives the low-pass, band-pass
 * and high-pass of the same sample at once ([lp], [bp], [hp]); the filter
 * effect, the distortion's colour and the filter punch-ins pick one, or morph
 * between them.
 *
 * [tune] sets the cutoff (held to 0.4 of the rate by [svfG]) and the Q
 * (k = 1 / Q, so Q 0.5 is the gentlest and Q 8 rings); it keeps the state, so
 * a cutoff can sweep without a click. The two integrators are flushed below
 * [DENORMAL], so a tail decays to exactly 0.
 *
 * Every step is one Float operation in the order written: the C++
 * (app/src/main/cpp/fx/Svf.h) and web (web/src/core/formats/fx/svf.ts) ports
 * do the same, and FxMathGoldenTest's svf vectors hold them to it.
 */
class Svf {
    private var a1 = 1f
    private var a2 = 0f
    private var a3 = 0f
    private var k = 2f
    private var ic1 = 0f
    private var ic2 = 0f

    /** The last sample's low-pass. */
    var lp = 0f
        private set

    /** The last sample's band-pass. */
    var bp = 0f
        private set

    /** The last sample's high-pass. */
    var hp = 0f
        private set

    /** A cutoff of [hz] at [rate] and a resonance of [q] (above 0; 0.5 to 8 in use). */
    fun tune(hz: Float, q: Float, rate: Int) = set(svfG(hz, rate), q)

    /** The same with g worked out already (FxMath's [svfG]), for a caller that keeps it. */
    fun set(g: Float, q: Float) {
        k = 1f / q
        a1 = 1f / (1f + g * (g + k))
        a2 = g * a1
        a3 = g * a2
    }

    /** Filters [x]: [lp], [bp] and [hp] are then its outputs. */
    fun process(x: Float) {
        val v3 = x - ic2
        val v1 = a1 * ic1 + a2 * v3
        val v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = flush(2f * v1 - ic1)
        ic2 = flush(2f * v2 - ic2)
        lp = v2
        bp = v1
        hp = x - k * v1 - v2
    }

    /** Back to silence; the tuning stays. */
    fun reset() {
        ic1 = 0f
        ic2 = 0f
        lp = 0f
        bp = 0f
        hp = 0f
    }
}
