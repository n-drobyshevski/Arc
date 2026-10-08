package dev.arc.ep133.formats.fx

/**
 * The reverb (the EP-133's REVERB): a small Freeverb of the send bus, X its
 * size (the combs' feedback), Y its tone, dark to bright.
 *
 * A stub for now: it adds nothing and is always [silent], so the bus skips
 * it. The bus already sends it its input, its knobs and the tempo.
 */
class Reverb(val outRate: Int) : Effect {
    override val silent: Boolean get() = true

    override fun reset() {}

    override fun setParams(x: Float, y: Float, bpm: Float) {}

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {}
}
