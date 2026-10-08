package dev.arc.ep133.formats.fx

/**
 * The compressor: a feed-forward, stereo-linked peak compressor, 4:1 above
 * -18 dBFS, X its input drive (with make-up gain) and Y its speed (attack and
 * release, fast to slow). The bus has two: the EP-133's COMPRESSOR effect on
 * the send bus ([process], as every [Effect]), and the master compressor
 * after everything (an addition, [processInPlace]).
 *
 * A stub for now: it adds nothing, leaves the master alone and is always
 * [silent]. The bus already sends it its input and its knobs.
 */
class Compressor(val outRate: Int) : Effect {
    override val silent: Boolean get() = true

    override fun reset() {}

    override fun setParams(x: Float, y: Float, bpm: Float) {}

    override fun process(input: FloatArray, out: FloatArray, frames: Int) {}

    /** Compresses [mix] (stereo, interleaved, [frames] long) in place: the master compressor. */
    fun processInPlace(mix: FloatArray, frames: Int) {}
}
