package dev.arc.ep133.formats.fx

/**
 * The filter (the EP-133's FILTER): a state-variable filter ([Svf]) on the
 * send bus, X a low-pass below the middle and a high-pass above it (open
 * between), Y its resonance.
 *
 * A stub for now: it adds nothing and is always [silent], so the bus skips
 * it. The bus already sends it its input, its knobs and the tempo.
 */
class Filter(val outRate: Int) : Effect {
    override val silent: Boolean get() = true

    override fun reset() {}

    override fun setParams(x: Float, y: Float, bpm: Float) {}

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {}
}
