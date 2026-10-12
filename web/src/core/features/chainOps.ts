// Port of the ChainOps object in core/src/main/kotlin/dev/arc/ep133/features/Chain.kt
//
// The chain's edits, as the CHAIN row makes them. Apart from chain.ts because
// they need ProjectSeq's values, and pattern.ts needs chain.ts's at load.

import { Chain, chainStep } from './chain'
import { ProjectSeq } from './pattern'

/** ＋: a step for [scene] (the one showing by default) with one pass, at the end. None past 64 steps, or for a scene the project doesn't have. */
function add(seq: ProjectSeq, scene: number = seq.scene): ProjectSeq {
  if (seq.chain.steps.length >= Chain.MAX_STEPS || scene < 0 || scene >= seq.scenes.length) return seq
  return ProjectSeq.withChain(seq, { steps: [...seq.chain.steps, chainStep(scene)], on: seq.chain.on })
}

/** A tap on step [index]: its passes go to the next of x1 x2 x4 x8, round to x1. A step that isn't there changes nothing. */
function cyclePasses(seq: ProjectSeq, index: number): ProjectSeq {
  const step = seq.chain.steps[index]
  if (step === undefined) return seq
  const next = Chain.PASSES.find((p) => p > step.passes) ?? Chain.PASSES[0]!
  return ProjectSeq.withChain(seq, { steps: seq.chain.steps.map((s, i) => (i === index ? { scene: s.scene, passes: next } : s)), on: seq.chain.on })
}

/** The screen reader's "Fewer passes" on step [index]: its passes go to the one before of x1 x2 x4 x8, round to x8. A step that isn't there changes nothing. */
function fewerPasses(seq: ProjectSeq, index: number): ProjectSeq {
  const step = seq.chain.steps[index]
  if (step === undefined) return seq
  const before = [...Chain.PASSES].reverse().find((p) => p < step.passes) ?? Chain.PASSES[Chain.PASSES.length - 1]!
  return ProjectSeq.withChain(seq, { steps: seq.chain.steps.map((s, i) => (i === index ? { scene: s.scene, passes: before } : s)), on: seq.chain.on })
}

/** A long press on step [index]: it goes. The chain turns off when its last step goes. */
function remove(seq: ProjectSeq, index: number): ProjectSeq {
  if (index < 0 || index >= seq.chain.steps.length) return seq
  return ProjectSeq.withChain(seq, { steps: seq.chain.steps.filter((_, i) => i !== index), on: seq.chain.on })
}

/** ON: the chain on or off; it can't be on with no steps. */
function setOn(seq: ProjectSeq, on: boolean): ProjectSeq {
  return ProjectSeq.withChain(seq, { steps: seq.chain.steps, on })
}

/** Every step gone, and the chain off. */
function clear(seq: ProjectSeq): ProjectSeq {
  return ProjectSeq.withChain(seq, Chain.EMPTY)
}

/** Choosing a scene by hand turns the chain off: the very sequencer when it was off already. */
function handPicked(seq: ProjectSeq): ProjectSeq {
  return seq.chain.on ? setOn(seq, false) : seq
}

/**
 * The chain's edits, as the CHAIN row makes them: each is pure, taking a
 * project's sequencer and giving the new one (the very one when nothing
 * changes). They are edits of the sequencer, so the caller goes through
 * PatternRecorder.editSeq for them to be undone with the scenes.
 */
export const ChainOps = { add, cyclePasses, fewerPasses, remove, setOn, clear, handPicked } as const

