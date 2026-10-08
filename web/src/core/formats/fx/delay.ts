// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Delay.kt
//
// The delay (the EP-133's DELAY): a tempo-synced echo of the send bus, X its
// length (one of twelve divisions of the beat), Y its feedback.
//
// A stub for now: it adds nothing and is always silent, so the bus skips it.
// The bus already sends it its input, its knobs and the tempo.
//
// Web deltas: none (silent is a getter).

import type { Effect } from './fxBus'

export class Delay implements Effect {
  constructor(readonly outRate: number) {}

  get silent(): boolean {
    return true
  }

  reset(): void {}

  setParams(_x: number, _y: number, _bpm: number): void {}

  process(_input: Float32Array, _out: Float32Array, _frames: number): void {}
}
