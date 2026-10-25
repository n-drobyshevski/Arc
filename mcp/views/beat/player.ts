// Plays a card's steps: each step a scene's sections together, with a
// lookahead scheduler. A timer wakes every 25 ms and hands the synth every hit
// due in the next 120 ms, at its exact AudioContext time. Tempo changes take
// effect from the current tick on; mute and solo are read as each hit is
// scheduled, so they apply within the lookahead. Stop cuts the synth, so
// nothing already handed over plays on. Each Play builds the synth's graph of
// the card's effect lines first (Synth.begin), and each hit goes to the synth
// whole, so it plays through its pad's shaping and its group's bus.
//
// Steps: the chain's (a scene for its passes, each pass as long as the
// scene's longest pattern, every pattern starting over at each pass, as Arc
// plays a chain), looping at the end, or one scene looped by hand (passes
// Infinity: each section loops on its own length for as long as it plays, as
// a card without scenes always has). The scheduler moves from one step to the
// next at the step's last tick, on the same clock as the hits, so the change
// has no gap. New steps while playing (setSteps) either only refresh the hits
// of the same steps (swing) or are cued: a change to the scene playing now
// keeps its place and goes on from the current pass (from a scene looped by
// hand whose sections are out of step with its passes, as 3 bars and 2 bars
// are in the second pass, from the next pass), another scene starts on the
// next bar line. position() reads which step is heard now from the steps
// the scheduler started, not the one it is scheduling ahead.

import { TICKS_PER_BAR, TICKS_PER_BEAT } from '../../../web/src/core/formats/beatCard'
import type { CardFx, Hit } from './model'
import type { Synth } from './synth'

const WAKE_MS = 25
const AHEAD_S = 0.12
/** The first hit plays this long after Play, so it is never late. */
const START_S = 0.06
/** How many started steps position() remembers: more than the lookahead can hold. */
const HISTORY = 8

export interface Loop {
  /** The section's length in ticks. */
  readonly length: number
  readonly hits: readonly Hit[]
}

/** One step of what plays: a scene's sections for [passes] passes of [length] ticks. */
export interface Step {
  /** The scene, from 0 (what position() reports). */
  readonly scene: number
  readonly loops: readonly Loop[]
  /** One pass in ticks: the scene's longest pattern. */
  readonly length: number
  /** 1..8 in a chain; Infinity for a scene looped by hand, whose sections loop on their own lengths. */
  readonly passes: number
}

/** Where the audio is: the step heard now and how far into it. */
export interface Position {
  readonly scene: number
  /** The step, from 0, of [steps]. */
  readonly step: number
  readonly steps: number
  /** The pass, from 1, of [passes]; null for a scene looped by hand. */
  readonly pass: number | null
  readonly passes: number | null
  /** Ticks into the pass (since the scene started, looped by hand); negative just after Play. */
  readonly tick: number
}

/** A step the scheduler started, at [tick]. */
interface Started {
  readonly tick: number
  readonly steps: readonly Step[]
  readonly index: number
}

/** Do two lists of steps play the same scenes for the same passes (only their hits may differ)? */
function sameShape(a: readonly Step[], b: readonly Step[]): boolean {
  return (
    a.length === b.length &&
    a.every((s, i) => s.scene === b[i]!.scene && s.passes === b[i]!.passes && s.length === b[i]!.length)
  )
}

export class Player {
  private readonly synth: Synth
  private steps: readonly Step[] = []
  /** The step being scheduled, and the tick it started on. */
  private index = 0
  private stepStart = 0
  /** Steps waiting for a bar line: they take over at [at]. */
  private cued: { readonly steps: readonly Step[]; readonly from: number; readonly at: number } | null = null
  private started: Started[] = []
  private tempo = 120
  private timer: ReturnType<typeof setInterval> | null = null
  private anchorTime = 0
  private anchorTick = 0
  /** Every hit before this tick has been scheduled. */
  private doneTick = 0
  /** Whether a pad sounds right now (mute and solo). */
  audible: (pad: string) => boolean = () => true

  constructor(synth: Synth) {
    this.synth = synth
  }

  get playing(): boolean {
    return this.timer !== null
  }

  private get ctx(): AudioContext {
    return this.synth.ctx
  }

  private get ticksPerSecond(): number {
    return (this.tempo * TICKS_PER_BEAT) / 60
  }

  private tickAt(time: number): number {
    return this.anchorTick + (time - this.anchorTime) * this.ticksPerSecond
  }

  private timeAt(tick: number): number {
    return this.anchorTime + (tick - this.anchorTick) / this.ticksPerSecond
  }

  /** Where the audio is now, or null when stopped. */
  position(): Position | null {
    if (!this.playing || this.started.length === 0) return null
    const now = this.tickAt(this.ctx.currentTime)
    let at = this.started[0]!
    for (const s of this.started) if (s.tick <= now) at = s
    const step = at.steps[at.index]!
    const into = now - at.tick
    const looped = !Number.isFinite(step.passes)
    const pass = looped || into < 0 ? 0 : Math.floor(into / step.length)
    return {
      scene: step.scene,
      step: at.index,
      steps: at.steps.length,
      pass: looped ? null : pass + 1,
      passes: looped ? null : step.passes,
      tick: looped ? into : into - pass * step.length,
    }
  }

  /** Wakes the AudioContext (it starts suspended until a user gesture). */
  resume(): Promise<void> {
    return this.ctx.resume()
  }

  /**
   * What plays, from step [from]. Stopped, it is where the next Play starts.
   * Playing, the same steps with new hits play on in place; other steps are
   * cued (see the header).
   */
  setSteps(steps: readonly Step[], from = 0): void {
    const start = Math.max(0, Math.min(from, steps.length - 1))
    if (!this.playing) {
      this.steps = steps
      this.index = start
      return
    }
    if (this.cued === null && sameShape(this.steps, steps)) {
      this.steps = steps
      return
    }
    this.cued = null
    const now = this.steps[this.index]
    const next = steps[start]
    if (now !== undefined && next !== undefined && now.scene === next.scene && now.length === next.length) {
      // The scene playing goes on: the new step starts with the pass playing now.
      const into = Math.max(0, this.doneTick - this.stepStart)
      const pass = Math.floor(into / now.length) * now.length
      // Looped by hand, each section loops on its own length from the step's start: a pass of the
      // new step (every pattern starting over) only lines up with them where all of them start over.
      // Where they don't, the new step waits for the next pass, where the longest one starts over.
      const inPhase = Number.isFinite(now.passes) || now.loops.every((l) => l.length <= 0 || pass % l.length === 0)
      if (inPhase) this.begin(steps, start, this.stepStart + pass)
      else this.cued = { steps, from: start, at: this.stepStart + Math.ceil(into / now.length) * now.length }
      return
    }
    this.cued = { steps, from: start, at: Math.ceil(this.doneTick / TICKS_PER_BAR) * TICKS_PER_BAR }
  }

  /** Sections looped together, each on its own length, as one scene looped by hand. */
  setLoops(loops: readonly Loop[]): void {
    const length = Math.max(TICKS_PER_BAR, ...loops.map((l) => l.length))
    this.setSteps([{ scene: 0, loops, length, passes: Infinity }])
  }

  /** The card's effect lines (see Synth.setFx). */
  setFx(fx: CardFx): void {
    this.synth.setFx(fx)
  }

  /** The FX switch (see Synth.setFxOn). */
  setFxOn(on: boolean): void {
    this.synth.setFxOn(on)
  }

  setTempo(bpm: number): void {
    if (this.playing) {
      // Keep the place: the tick playing now stays where it is.
      const now = this.ctx.currentTime
      this.anchorTick = this.tickAt(now)
      this.anchorTime = now
    }
    this.tempo = bpm
  }

  start(): void {
    if (this.playing) return
    this.anchorTime = this.ctx.currentTime + START_S
    this.anchorTick = 0
    this.doneTick = 0
    this.started = []
    this.begin(this.steps, this.index, 0)
    this.synth.begin()
    this.pump()
    this.timer = setInterval(() => this.pump(), WAKE_MS)
  }

  stop(): void {
    if (this.timer === null) return
    clearInterval(this.timer)
    this.timer = null
    this.synth.cut()
    // What was cued is what the next Play plays.
    if (this.cued !== null) {
      this.steps = this.cued.steps
      this.index = this.cued.from
      this.cued = null
    }
    this.started = []
  }

  /** Step [index] of [steps] starts at [tick]. */
  private begin(steps: readonly Step[], index: number, tick: number): void {
    this.steps = steps
    this.index = index
    this.stepStart = tick
    // A step that takes over the one started on the same tick replaces it.
    while (this.started.length > 0 && this.started.at(-1)!.tick >= tick) this.started.pop()
    this.started.push({ tick, steps, index })
    if (this.started.length > HISTORY) this.started.shift()
  }

  private pump(): void {
    const end = this.tickAt(this.ctx.currentTime + AHEAD_S)
    while (this.doneTick < end) {
      const step = this.steps[this.index]
      if (step === undefined || step.length <= 0) {
        this.doneTick = end
        return
      }
      const stepEnd = this.stepStart + step.length * step.passes
      const cueAt = this.cued?.at ?? Infinity
      // Never back: a step that is already over hands over at once.
      const until = Math.max(this.doneTick, Math.min(end, stepEnd, cueAt))
      this.schedule(step, this.doneTick, until)
      this.doneTick = until
      if (this.cued !== null && until >= cueAt) {
        const { steps, from, at } = this.cued
        this.cued = null
        this.begin(steps, from, at)
      } else if (until >= stepEnd) {
        this.begin(this.steps, (this.index + 1) % this.steps.length, stepEnd)
      }
    }
  }

  /** Hands the synth every hit of [step] from tick [from] up to [to]. */
  private schedule(step: Step, from: number, to: number): void {
    const looped = !Number.isFinite(step.passes)
    // Looped by hand, the step is one pass that never ends.
    const passLength = looped ? Infinity : step.length
    let passStart = looped ? this.stepStart : this.stepStart + Math.floor((from - this.stepStart) / passLength) * passLength
    for (; passStart < to; passStart += passLength) {
      const passEnd = passStart + passLength
      for (const loop of step.loops) {
        if (loop.length <= 0) continue
        const first = passStart + Math.max(0, Math.floor((from - passStart) / loop.length)) * loop.length
        for (let start = first; start < to && start < passEnd; start += loop.length) {
          for (const hit of loop.hits) {
            const tick = start + hit.tick
            if (tick < from || tick >= to || tick >= passEnd || !this.audible(hit.pad)) continue
            const time = Math.max(this.ctx.currentTime, this.timeAt(tick))
            // A note held past the pass ends with it, as the next pass starts over.
            const gate = Math.min(hit.gate, passEnd - tick)
            this.synth.play(hit, time, gate / this.ticksPerSecond)
          }
        }
      }
      if (looped) break
    }
  }
}
