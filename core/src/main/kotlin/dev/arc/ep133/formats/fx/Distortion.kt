package dev.arc.ep133.formats.fx

/**
 * The distortion (the EP-133's DISTORTION): the send bus driven into a soft
 * clip, X the drive, Y its colour (low-pass to high-pass, open in the middle).
 *
 * A stub for now: it adds nothing and is always [silent], so the bus skips
 * it. The bus already sends it its input, its knobs and the tempo.
 */
class Distortion(val outRate: Int) : Effect {
    override val silent: Boolean get() = true

    override fun reset() {}

    override fun setParams(x: Float, y: Float, bpm: Float) {}

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {}
}
