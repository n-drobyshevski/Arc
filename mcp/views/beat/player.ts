// Plays a card's sections together, each looping on its own length, with a
// lookahead scheduler: a timer wakes every 25 ms and hands the synth every hit
// due in the next 120 ms, at its exact AudioContext time. Tempo changes take
// effect from the current tick on; mute and solo are read as each hit is
// scheduled, so they apply within the lookahead. Stop cuts the synth, so
// nothing already handed over plays on. Each Play builds the synth's graph of
// the card's effect lines first (Synth.begin), and each hit goes to the synth
// whole, so it plays through its pad's shaping and its group's bus.

import { TICKS_PER_BEAT } from '../../../web/src/core/formats/beatCard'
import type { CardFx, Hit } from './model'
import type { Synth } from './synth'

const WAKE_MS = 25
const AHEAD_S = 0.12
/** The first hit plays this long after Play, so it is never late. */
const START_S = 0.06

export interface Loop {
  /** The section's length in ticks. */
  readonly length: number
  readonly hits: readonly Hit[]
}

export class Player {
  private readonly synth: Synth
  private loops: readonly Loop[] = []
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

  /** The tick playing now (negative just after Play), or null when stopped. */
  now(): number | null {
    return this.playing ? this.tickAt(this.ctx.currentTime) : null
  }

  /** Wakes the AudioContext (it starts suspended until a user gesture). */
  resume(): Promise<void> {
    return this.ctx.resume()
  }

  setLoops(loops: readonly Loop[]): void {
    this.loops = loops
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
    this.synth.begin()
    this.pump()
    this.timer = setInterval(() => this.pump(), WAKE_MS)
  }

  stop(): void {
    if (this.timer === null) return
    clearInterval(this.timer)
    this.timer = null
    this.synth.cut()
  }

  private pump(): void {
    const end = this.tickAt(this.ctx.currentTime + AHEAD_S)
    if (end <= this.doneTick) return
    for (const loop of this.loops) {
      if (loop.length <= 0) continue
      for (let start = Math.floor(this.doneTick / loop.length) * loop.length; start < end; start += loop.length) {
        for (const hit of loop.hits) {
          const tick = start + hit.tick
          if (tick < this.doneTick || tick >= end || !this.audible(hit.pad)) continue
          const time = Math.max(this.ctx.currentTime, this.timeAt(tick))
          this.synth.play(hit, time, hit.gate / this.ticksPerSecond)
        }
      }
    }
    this.doneTick = end
  }
}
