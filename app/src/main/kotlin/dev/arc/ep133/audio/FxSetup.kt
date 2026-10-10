package dev.arc.ep133.audio

import dev.arc.ep133.formats.fx.FxControl

/**
 * The FX bus's settings as last sent to Live's output (an addition), so an
 * output opened afresh (Live back on screen, the native engine given out) or
 * a native stream reopened gets them all again, as [LiveAudio] sends them.
 *
 * One value per setting, the last one sent: the effect (its type and knobs,
 * [FxControl.FX_TYPE] and [FxControl.FX_XY] together, so a type change's own
 * knobs aren't undone by an older drag), each group's send, the compressor,
 * the sidechain and the tempo. Punch-ins aren't kept: one lasts only while
 * it is held, and a new output starts with none. Nothing sent, nothing
 * replayed, so a mixer at its defaults stays at them.
 *
 * Not thread-safe: its owner holds a lock around it.
 */
internal class FxSetup {
    private companion object {
        // Where each setting is kept: the effect, the four sends, the compressor, the sidechain, the tempo.
        const val EFFECT = 0
        const val SENDS = 1
        const val COMP = SENDS + FxControl.GROUPS
        const val SIDECHAIN = COMP + 1
        const val TEMPO = SIDECHAIN + 1
        const val SLOTS = TEMPO + 1
    }

    private val what = IntArray(SLOTS)
    private val index = IntArray(SLOTS)
    private val x = FloatArray(SLOTS)
    private val y = FloatArray(SLOTS)
    private val kept = BooleanArray(SLOTS)

    init {
        // The effect's knobs before any type is chosen: the mixer's own.
        what[EFFECT] = FxControl.FX_TYPE
        index[EFFECT] = FxControl.NONE
        x[EFFECT] = 0.5f
        y[EFFECT] = 0.5f
    }

    /** Keeps [FxControl] command [what] (its [index], [x] and [y]) as the latest of its setting; a punch-in isn't kept. */
    fun record(what: Int, index: Int, x: Float, y: Float) {
        when (what) {
            FxControl.FX_TYPE -> keep(EFFECT, what, index, x, y)
            // The effect stays as it is; only its knobs move.
            FxControl.FX_XY -> keep(EFFECT, FxControl.FX_TYPE, this.index[EFFECT], x, y)
            FxControl.SEND -> if (index in 0 until FxControl.GROUPS) keep(SENDS + index, what, index, x, y)
            FxControl.COMP -> keep(COMP, what, index, x, y)
            FxControl.SIDECHAIN -> keep(SIDECHAIN, what, index, x, y)
            FxControl.TEMPO -> keep(TEMPO, what, index, x, y)
        }
    }

    /** Hands every setting kept to [send], as the commands that set it: the effect first, the tempo last. */
    fun replay(send: (what: Int, index: Int, x: Float, y: Float) -> Unit) {
        for (s in 0 until SLOTS) if (kept[s]) send(what[s], index[s], x[s], y[s])
    }

    private fun keep(slot: Int, what: Int, index: Int, x: Float, y: Float) {
        this.what[slot] = what
        this.index[slot] = index
        this.x[slot] = x
        this.y[slot] = y
        kept[slot] = true
    }
}
