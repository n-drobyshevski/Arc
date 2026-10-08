package dev.arc.ep133.formats.fx

/**
 * The punch-in effects (the EP-133's FX + pad), on the whole mix after the
 * master effect: twelve slots ([FxControl.PITCH_RANDOM] to
 * [FxControl.DECIMATOR]), each held at a depth 0..1 while its pad is, and
 * crossfaded back out over 5 ms when it is let go of. The ones that replay
 * the mix (stutter, beat repeat, tape stop, the pitch shifters) read a 2 s
 * stereo history of it, written every block ([record]).
 *
 * A stub for now: no slot processes ([active] stays false and [process]
 * leaves the mix alone), but the depths are kept, so [sendBoost] (SEND_FX's,
 * which only raises every group's send) already works.
 */
class Punch(val outRate: Int) {
    private val depths = FloatArray(FxControl.SLOTS)
    private var bpm = FxBus.BPM_DEFAULT

    /** Whether a slot is held or still fading out: the bus calls [process] only then. */
    val active: Boolean get() = false

    /** Holds [slot] at [depth] (0..1); 0 lets go of it. */
    fun set(slot: Int, depth: Float) {
        if (slot !in 0 until FxControl.SLOTS) return
        depths[slot] = clamp01(depth)
    }

    /** The tempo the synced slots follow, in BPM. */
    fun setTempo(bpm: Float) {
        this.bpm = bpm
    }

    /** SEND_FX's depth: every group's send is at least this while it is held. */
    fun sendBoost(): Float = depths[FxControl.SEND_FX]

    /** Writes [mix] (stereo, interleaved, [frames] long, before the punch-ins) into the history; every block. */
    fun record(mix: FloatArray, frames: Int) {}

    /** Plays the held slots over [mix] (stereo, interleaved, [frames] long), in place. */
    fun process(mix: FloatArray, frames: Int) {}

    /** Every slot let go of at once, the history silent. */
    fun reset() {
        depths.fill(0f)
    }
}
