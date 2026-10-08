// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Chorus.kt
//
// The chorus (the EP-133's CHORUS): two moving taps on a short delay of the
// send bus, X their rate, Y their depth and feedback.
//
// A stub for now: it adds nothing and is always silent, so the bus skips it.
// The bus already sends it its input, its knobs and the tempo.
//
// Web deltas: none (silent is a getter).

import type { Effect } from './fxBus'

export class Chorus implements Effect {
  constructor(readonly outRate: number) {}

  get silent(): boolean {
    return true
  }

  reset(): void {}

  setParams(_x: number, _y: number, _bpm: number): void {}

  process(_input: Float32Array, _out: Float32Array, _frames: number): void {}
}
