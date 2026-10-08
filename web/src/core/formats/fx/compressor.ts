// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Compressor.kt
//
// The compressor: a feed-forward, stereo-linked peak compressor, 4:1 above
// -18 dBFS, X its input drive (with make-up gain) and Y its speed (attack and
// release, fast to slow). The bus has two: the EP-133's COMPRESSOR effect on
// the send bus (process, as every Effect), and the master compressor after
// everything (an addition, processInPlace).
//
// A stub for now: it adds nothing and is always silent, so the bus skips it.
// The bus already sends it its input, its knobs and the tempo.
//
// Web deltas: none (silent is a getter).

import type { Effect } from './fxBus'

export class Compressor implements Effect {
  constructor(readonly outRate: number) {}

  get silent(): boolean {
    return true
  }

  reset(): void {}

  setParams(_x: number, _y: number, _bpm: number): void {}

  process(_input: Float32Array, _out: Float32Array, _frames: number): void {}

  /** Compresses [mix] (stereo, interleaved, [frames] long) in place: the master compressor. */
  processInPlace(_mix: Float32Array, _frames: number): void {}
}
