package dev.arc.ep133.formats.fx

/**
 * The delay (the EP-133's DELAY): a tempo-synced echo of the send bus, X its
 * length (one of twelve divisions of the beat), Y its feedback.
 *
 * A stub for now: it adds nothing and is always [silent], so the bus skips
 * it. The bus already sends it its input, its knobs and the tempo.
 */
class Delay(val outRate: Int) : Effect {
    override val silent: Boolean get() = true

    override fun reset() {}

    override fun setParams(x: Float, y: Float, bpm: Float) {}

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {}
}
