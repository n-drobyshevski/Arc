package dev.arc.ep133.controller

import dev.arc.ep133.features.Chain
import dev.arc.ep133.features.ChainPlay
import dev.arc.ep133.features.ProjectSeq

// ---------- CHAINS: the order the scenes play in, with the passes each plays (the CHAIN row of the SCENE panel) ----------

/**
 * The CHAIN row as the panel shows it: the project's [chain] (steps and ON), the [scene] shown (an index; ＋ adds
 * it) and, while the chain plays, where it is ([play]: the step lit and its pass; null while stopped, off, or on a
 * scene that is in no step).
 */
data class ChainUi(
    val chain: Chain = Chain.EMPTY,
    val scene: Int = 0,
    val play: ChainPlay? = null,
) {
    /** The step lit, null when none is. */
    val step: Int? get() = play?.step?.takeIf { it in chain.steps.indices }

    /** The pass the step is on, held to its passes. */
    val pass: Int get() = play?.let { minOf(it.pass, it.passes(chain)) } ?: 1

    /** Whether ＋ can add a step: not at [Chain.MAX_STEPS]. */
    val canAdd: Boolean get() = chain.steps.size < Chain.MAX_STEPS

    /** The chain has something to turn on. */
    val canTurnOn: Boolean get() = !chain.isBlank
}

/**
 * The chain playing: where it is ([play]), the global tick the pass it is on began at ([from]) and the tick the pass
 * ends at ([end]: the end of the scene's longest pattern, as a scene change under Pattern end takes over; there the
 * chain goes on to its next pass or step).
 */
internal class ChainRun(val play: ChainPlay, val from: Long, val end: Long)

/**
 * The chain's place for the scene [seq] shows when the chain is joined while playing (turned on, or the sequencer
 * edited under it): the first step that has the scene, or (the scene is in no step) one past the last, which goes on to
 * the first step when the pass ends ([ChainPlay.onSceneEnd]). Null when the chain has no steps.
 */
internal fun chainPlayFor(seq: ProjectSeq): ChainPlay? {
    val steps = seq.chain.steps
    if (steps.isEmpty()) return null
    val i = steps.indexOfFirst { it.scene == seq.scene }
    return ChainPlay(if (i >= 0) i else steps.size)
}
