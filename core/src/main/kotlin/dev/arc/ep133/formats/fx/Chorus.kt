package dev.arc.ep133.formats.fx

/**
 * The chorus (the EP-133's CHORUS): two moving taps on a short delay of the
 * send bus, X their rate, Y their depth and feedback.
 *
 * A stub for now: it adds nothing and is always [silent], so the bus skips
 * it. The bus already sends it its input, its knobs and the tempo.
 */
class Chorus(val outRate: Int) : Effect {
    override val silent: Boolean get() = true

    override fun reset() {}

    override fun setParams(x: Float, y: Float, bpm: Float) {}

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {}
}
