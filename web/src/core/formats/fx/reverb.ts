// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Reverb.kt
//
// The reverb (the EP-133's REVERB): a small Freeverb of the send bus, X its
// size (the combs' feedback), Y its tone, dark to bright.
//
// A stub for now: it adds nothing and is always silent, so the bus skips it.
// The bus already sends it its input, its knobs and the tempo.
//
// Web deltas: none (silent is a getter).

import type { Effect } from './fxBus'

export class Reverb implements Effect {
  constructor(readonly outRate: number) {}

  get silent(): boolean {
    return true
  }

  reset(): void {}

  setParams(_x: number, _y: number, _bpm: number): void {}

  process(_input: Float32Array, _out: Float32Array, _frames: number): void {}
}
