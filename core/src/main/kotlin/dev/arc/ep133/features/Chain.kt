package dev.arc.ep133.features

/**
 * One step of a [Chain]: play the scene at index [scene] (from 0, into
 * [ProjectSeq.scenes]) for [passes] (1..[Chain.MAX_PASSES]) passes.
 */
data class ChainStep(val scene: Int, val passes: Int = 1)

/**
 * A project's chain (the spec's "Chains in Arc"): the order the scenes play
 * in, as [steps] (at most [MAX_STEPS]), and whether Arc plays it ([on]). Each
 * scene plays its passes, then the next step's scene takes over at the end of
 * the current scene's longest pattern; after the last step the chain goes
 * back to the first. A chain with no steps is never on. A [ProjectSeq] keeps
 * its chain true to its scenes (a step names a scene it has, passes held to
 * 1..8, 64 steps at most), so build one with [ProjectSeq.withChain].
 */
data class Chain(val steps: List<ChainStep> = emptyList(), val on: Boolean = false) {
    /** No steps: nothing to play, and nothing saved. */
    val isBlank: Boolean get() = steps.isEmpty()

    /** This chain for a project of [sceneCount] scenes: steps that name no scene dropped, passes held to 1..8, 64 steps at most, and off when no step is left. */
    fun held(sceneCount: Int): Chain {
        val kept = steps.filter { it.scene in 0 until sceneCount }.take(MAX_STEPS).map { it.copy(passes = it.passes.coerceIn(MIN_PASSES, MAX_PASSES)) }
        return Chain(kept, on && kept.isNotEmpty())
    }

    /** The scene at [index] gone: its steps removed, the steps of later scenes naming the one before. */
    fun withoutScene(index: Int): Chain =
        Chain(steps.filter { it.scene != index }.map { if (it.scene > index) it.copy(scene = it.scene - 1) else it }, on)

    /** A scene inserted at [index]: the steps of the scenes from there on name the one after. */
    fun withSceneInsertedAt(index: Int): Chain =
        Chain(steps.map { if (it.scene >= index) it.copy(scene = it.scene + 1) else it }, on)

    companion object {
        /** The most steps a chain holds. */
        const val MAX_STEPS = 64
        const val MIN_PASSES = 1
        const val MAX_PASSES = 8

        /** The passes a tap cycles through: x1 x2 x4 x8. */
        val PASSES = listOf(1, 2, 4, 8)

        val EMPTY = Chain()
    }
}

/**
 * The chain's edits, as the CHAIN row makes them: each is pure, taking a
 * project's sequencer and giving the new one (the very one when nothing
 * changes). They are edits of the sequencer, so the caller goes through
 * [PatternRecorder.editSeq] for them to be undone with the scenes.
 */
object ChainOps {
    /** ＋: a step for [scene] (the one showing by default) with one pass, at the end. None past [Chain.MAX_STEPS] steps, or for a scene the project doesn't have. */
    fun add(seq: ProjectSeq, scene: Int = seq.scene): ProjectSeq {
        if (seq.chain.steps.size >= Chain.MAX_STEPS || scene !in seq.scenes.indices) return seq
        return seq.withChain(seq.chain.copy(steps = seq.chain.steps + ChainStep(scene)))
    }

    /** A tap on step [index]: its passes go to the next of x1 x2 x4 x8, round to x1. A step that isn't there changes nothing. */
    fun cyclePasses(seq: ProjectSeq, index: Int): ProjectSeq {
        val step = seq.chain.steps.getOrNull(index) ?: return seq
        val next = Chain.PASSES.firstOrNull { it > step.passes } ?: Chain.PASSES.first()
        return seq.withChain(seq.chain.copy(steps = seq.chain.steps.mapIndexed { i, s -> if (i == index) s.copy(passes = next) else s }))
    }

    /** The screen reader's "Fewer passes" on step [index]: its passes go to the one before of x1 x2 x4 x8, round to x8. A step that isn't there changes nothing. */
    fun fewerPasses(seq: ProjectSeq, index: Int): ProjectSeq {
        val step = seq.chain.steps.getOrNull(index) ?: return seq
        val before = Chain.PASSES.lastOrNull { it < step.passes } ?: Chain.PASSES.last()
        return seq.withChain(seq.chain.copy(steps = seq.chain.steps.mapIndexed { i, s -> if (i == index) s.copy(passes = before) else s }))
    }

    /** A long press on step [index]: it goes. The chain turns off when its last step goes. */
    fun remove(seq: ProjectSeq, index: Int): ProjectSeq {
        if (index !in seq.chain.steps.indices) return seq
        return seq.withChain(seq.chain.copy(steps = seq.chain.steps.filterIndexed { i, _ -> i != index }))
    }

    /** ON: the chain on or off; it can't be on with no steps. */
    fun setOn(seq: ProjectSeq, on: Boolean): ProjectSeq = seq.withChain(seq.chain.copy(on = on))

    /** Every step gone, and the chain off. */
    fun clear(seq: ProjectSeq): ProjectSeq = seq.withChain(Chain.EMPTY)

    /** Choosing a scene by hand turns the chain off: [ProjectSeq.chain] with `on` false (the very one when it was off). */
    fun handPicked(seq: ProjectSeq): ProjectSeq = if (seq.chain.on) setOn(seq, false) else seq
}

/**
 * Where a playing chain is: step [step] (an index into [Chain.steps]), on its
 * pass [pass] (from 1; the readout "PASS n/m" is [pass] of the step's
 * passes). Pure: the scheduler holds one while the chain is on, starts it with
 * [start] when playing starts or the chain is turned on, and calls
 * [onSceneEnd] each time the current scene's longest pattern ends.
 */
data class ChainPlay(val step: Int, val pass: Int = 1) {
    /** The scene step [step] plays, or null when the chain has no such step. */
    fun scene(chain: Chain): Int? = chain.steps.getOrNull(step)?.scene

    /** The passes of the step, or 1 when the chain has no such step. */
    fun passes(chain: Chain): Int = chain.steps.getOrNull(step)?.passes ?: 1

    /**
     * The current scene's longest pattern has ended (a pass is over): the
     * next pass of the same step while it has passes left, else the next
     * step, and the first again after the last. [ChainAdvance.scene] is the
     * scene to switch to, null when the next pass plays the scene already
     * playing (the next pass of the step, or the next step naming the same
     * scene). A chain edited while playing is read as it stands: a step that
     * is no longer there starts the chain over, and a pass past the step's
     * passes counts as its last. Null when the chain has no steps.
     */
    fun onSceneEnd(chain: Chain): ChainAdvance? {
        val steps = chain.steps
        if (steps.isEmpty()) return null
        val here = steps.getOrNull(step)
        if (here == null) return ChainAdvance(ChainPlay(0), steps[0].scene)
        if (pass < here.passes) return ChainAdvance(ChainPlay(step, pass + 1), null)
        val next = (step + 1) % steps.size
        return ChainAdvance(ChainPlay(next), steps[next].scene.takeIf { it != here.scene })
    }

    companion object {
        /**
         * Playing starts (or the chain is turned on) with [currentScene] showing: the
         * first step that has that scene, else the first step, on its first
         * pass. Null when the chain has no steps. Whether the chain is on is the caller's
         * to check; when the state is step 0 and the scene showing isn't that step's, the
         * scheduler switches to [scene] first.
         */
        fun start(seq: ProjectSeq, currentScene: Int = seq.scene): ChainPlay? {
            val steps = seq.chain.steps
            if (steps.isEmpty()) return null
            return ChainPlay(steps.indexOfFirst { it.scene == currentScene }.coerceAtLeast(0))
        }
    }
}

/** What [ChainPlay.onSceneEnd] decided: the [play] state from now on, and the [scene] to switch to (null: stay on the scene playing). */
data class ChainAdvance(val play: ChainPlay, val scene: Int?)
