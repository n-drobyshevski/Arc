// Port of core/src/main/kotlin/dev/arc/ep133/features/Chain.kt
//
// A project's chain (the spec's "Chains in Arc"): the order the scenes play in,
// as steps of (scene, passes), and the pure functions of the CHAIN row and of
// the scheduler's advance. Pure.
//
// Web deltas:
// - ChainStep, Chain, ChainPlay and ChainAdvance are plain readonly interfaces
//   built by `chainStep()`, `chain()`, `chainPlay()` and `chainAdvance()` with
//   the Kotlin defaults; their members are functions on the `Chain` and
//   `ChainPlay` const objects (`c.held(n)` is `Chain.held(c, n)`,
//   `p.onSceneEnd(c)` is `ChainPlay.onSceneEnd(p, c)`).
// - ProjectSeq's own chain helpers (withChain, withSceneRemoved,
//   withSceneInserted) are on the ProjectSeq object in pattern.ts. The CHAIN
//   row's edits (ChainOps) are in chainOps.ts, as they need ProjectSeq's
//   values and pattern.ts needs this file's at load.

import type { ProjectSeq } from './pattern'

/**
 * One step of a Chain: play the scene at index [scene] (from 0, into
 * ProjectSeq.scenes) for [passes] (1..Chain.MAX_PASSES) passes.
 */
export interface ChainStep {
  readonly scene: number
  readonly passes: number
}

export function chainStep(scene: number, passes = 1): ChainStep {
  return { scene, passes }
}

/**
 * A project's chain: the order the scenes play in, as [steps] (at most 64), and
 * whether Arc plays it ([on]). Each scene plays its passes, then the next
 * step's scene takes over at the end of the current scene's longest pattern;
 * after the last step the chain goes back to the first. A chain with no steps
 * is never on. A ProjectSeq keeps its chain true to its scenes (a step names a
 * scene it has, passes held to 1..8, 64 steps at most), so build one with
 * ProjectSeq.withChain.
 */
export interface Chain {
  readonly steps: readonly ChainStep[]
  readonly on: boolean
}

export function chain(steps: readonly ChainStep[] = [], on = false): Chain {
  return { steps, on }
}

const MAX_STEPS = 64
const MIN_PASSES = 1
const MAX_PASSES = 8
const EMPTY: Chain = chain()

/** No steps: nothing to play, and nothing saved. */
function isBlank(c: Chain): boolean {
  return c.steps.length === 0
}

/** [c] for a project of [sceneCount] scenes: steps that name no scene dropped, passes held to 1..8, 64 steps at most, and off when no step is left. */
function held(c: Chain, sceneCount: number): Chain {
  const kept = c.steps
    .filter((s) => s.scene >= 0 && s.scene < sceneCount)
    .slice(0, MAX_STEPS)
    .map((s) => ({ scene: s.scene, passes: Math.min(Math.max(s.passes, MIN_PASSES), MAX_PASSES) }))
  return { steps: kept, on: c.on && kept.length > 0 }
}

/** The scene at [index] gone: its steps removed, the steps of later scenes naming the one before. */
function withoutScene(c: Chain, index: number): Chain {
  return { steps: c.steps.filter((s) => s.scene !== index).map((s) => (s.scene > index ? { scene: s.scene - 1, passes: s.passes } : s)), on: c.on }
}

/** A scene inserted at [index]: the steps of the scenes from there on name the one after. */
function withSceneInsertedAt(c: Chain, index: number): Chain {
  return { steps: c.steps.map((s) => (s.scene >= index ? { scene: s.scene + 1, passes: s.passes } : s)), on: c.on }
}

/** Whether [a] and [b] are the same chain (Kotlin's data class equals). */
function sameChain(a: Chain, b: Chain): boolean {
  return a === b || (a.on === b.on && a.steps.length === b.steps.length && a.steps.every((s, i) => s.scene === b.steps[i]!.scene && s.passes === b.steps[i]!.passes))
}

/** The Kotlin `Chain`'s members and companion. */
export const Chain = {
  MAX_STEPS,
  MIN_PASSES,
  MAX_PASSES,
  /** The passes a tap cycles through: x1 x2 x4 x8. */
  PASSES: Object.freeze([1, 2, 4, 8]) as readonly number[],
  EMPTY,
  isBlank,
  held,
  withoutScene,
  withSceneInsertedAt,
  same: sameChain,
} as const

/**
 * Where a playing chain is: step [step] (an index into Chain.steps), on its
 * pass [pass] (from 1; the readout "PASS n/m" is [pass] of the step's passes).
 * The scheduler holds one while the chain is on, starts it with
 * ChainPlay.start when playing starts or the chain is turned on, and calls
 * ChainPlay.onSceneEnd each time the current scene's longest pattern ends.
 */
export interface ChainPlay {
  readonly step: number
  readonly pass: number
}

export function chainPlay(step: number, pass = 1): ChainPlay {
  return { step, pass }
}

/** What ChainPlay.onSceneEnd decided: the [play] state from now on, and the [scene] to switch to (null: stay on the scene playing). */
export interface ChainAdvance {
  readonly play: ChainPlay
  readonly scene: number | null
}

/** The scene step [p].step plays, or null when the chain has no such step. */
function playScene(p: ChainPlay, c: Chain): number | null {
  return c.steps[p.step]?.scene ?? null
}

/** The passes of the step, or 1 when the chain has no such step. */
function playPasses(p: ChainPlay, c: Chain): number {
  return c.steps[p.step]?.passes ?? 1
}

/**
 * The current scene's longest pattern has ended (a pass is over): the next
 * pass of the same step while it has passes left, else the next step, and the
 * first again after the last. ChainAdvance.scene is the scene to switch to,
 * null when the next pass plays the scene already playing (the next pass of
 * the step, or the next step naming the same scene). A chain edited while
 * playing is read as it stands: a step that is no longer there starts the
 * chain over, and a pass past the step's passes counts as its last. Null when
 * the chain has no steps.
 */
function onSceneEnd(p: ChainPlay, c: Chain): ChainAdvance | null {
  const steps = c.steps
  if (steps.length === 0) return null
  const here = steps[p.step]
  if (here === undefined) return { play: chainPlay(0), scene: steps[0]!.scene }
  if (p.pass < here.passes) return { play: chainPlay(p.step, p.pass + 1), scene: null }
  const next = (p.step + 1) % steps.length
  const scene = steps[next]!.scene
  return { play: chainPlay(next), scene: scene !== here.scene ? scene : null }
}

/**
 * Playing starts (or the chain is turned on) with [currentScene] showing: the
 * first step that has that scene, else the first step, on its first pass. Null
 * when the chain has no steps. Whether the chain is on is the caller's to
 * check; when the state is step 0 and the scene showing isn't that step's, the
 * scheduler switches to ChainPlay.scene first.
 */
function start(seq: ProjectSeq, currentScene: number = seq.scene): ChainPlay | null {
  const steps = seq.chain.steps
  if (steps.length === 0) return null
  return chainPlay(Math.max(0, steps.findIndex((s) => s.scene === currentScene)))
}

/** The Kotlin `ChainPlay`'s members and companion. */
export const ChainPlay = { scene: playScene, passes: playPasses, onSceneEnd, start } as const
