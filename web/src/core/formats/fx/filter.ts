// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Filter.kt
//
// The filter (the EP-133's FILTER): a state-variable filter (Svf) on the send
// bus, X a low-pass below the middle and a high-pass above it (open between),
// Y its resonance.
//
// A stub for now: it adds nothing and is always silent, so the bus skips it.
// The bus already sends it its input, its knobs and the tempo.
//
// Web deltas: none (silent is a getter).

import type { Effect } from './fxBus'

export class Filter implements Effect {
  constructor(readonly outRate: number) {}

  get silent(): boolean {
    return true
  }

  reset(): void {}

  setParams(_x: number, _y: number, _bpm: number): void {}

  process(_input: Float32Array, _out: Float32Array, _frames: number): void {}
}
