// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Distortion.kt
//
// The distortion (the EP-133's DISTORTION): the send bus driven into a soft
// clip, X the drive, Y its colour (low-pass to high-pass, open in the middle).
//
// A stub for now: it adds nothing and is always silent, so the bus skips it.
// The bus already sends it its input, its knobs and the tempo.
//
// Web deltas: none (silent is a getter).

import type { Effect } from './fxBus'

export class Distortion implements Effect {
  constructor(readonly outRate: number) {}

  get silent(): boolean {
    return true
  }

  reset(): void {}

  setParams(_x: number, _y: number, _bpm: number): void {}

  process(_input: Float32Array, _out: Float32Array, _frames: number): void {}
}
