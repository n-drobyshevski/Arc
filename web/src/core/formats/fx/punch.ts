// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Punch.kt
//
// The punch-in effects (the EP-133's FX + pad), on the whole mix after the
// master effect: twelve slots (FxControl.PITCH_RANDOM to FxControl.DECIMATOR),
// each held at a depth 0..1 while its pad is, and crossfaded back out over
// 5 ms when it is let go of. The ones that replay the mix (stutter, beat
// repeat, tape stop, the pitch shifters) read a 2 s stereo history of it,
// written every block (record).
//
// A stub for now: no slot processes (active stays false and process leaves
// the mix alone), but the depths are kept, so sendBoost (SEND_FX's, which
// only raises every group's send) already works.
//
// Web deltas:
// - The slot count, SEND_FX's slot and the default tempo are written here
//   (FxControl's and FxBus's in Kotlin), since fxBus.ts imports this file.
// - active is a getter.

import { clamp01 } from './fxMath'

/** FxControl.SLOTS and FxControl.SEND_FX. */
const SLOTS = 12
const SEND_FX = 8

export class Punch {
  private readonly depths = new Float32Array(SLOTS)
  private bpm = 120

  constructor(readonly outRate: number) {}

  /** Whether a slot is held or still fading out: the bus calls process only then. */
  get active(): boolean {
    return false
  }

  /** Holds [slot] at [depth] (0..1); 0 lets go of it. */
  set(slot: number, depth: number): void {
    if (!(slot >= 0 && slot < SLOTS)) return
    this.depths[slot] = clamp01(depth)
  }

  /** The tempo the synced slots follow, in BPM. */
  setTempo(bpm: number): void {
    this.bpm = bpm
  }

  /** The tempo set last. */
  get tempo(): number {
    return this.bpm
  }

  /** SEND_FX's depth: every group's send is at least this while it is held. */
  sendBoost(): number {
    return this.depths[SEND_FX]!
  }

  /** Writes [mix] (stereo, interleaved, [frames] long, before the punch-ins) into the history; every block. */
  record(_mix: Float32Array, _frames: number): void {}

  /** Plays the held slots over [mix] (stereo, interleaved, [frames] long), in place. */
  process(_mix: Float32Array, _frames: number): void {}

  /** Every slot let go of at once, the history silent. */
  reset(): void {
    this.depths.fill(0)
  }
}
