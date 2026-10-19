// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Reverb.kt
//
// The reverb (the EP-133's REVERB): a small Freeverb of the send bus, X its
// size (the combs' feedback), Y its tone, dark to bright.
//
// Jezar's Freeverb, at half its size: a channel has four damped comb filters
// side by side, then two all-pass filters in a row, where Freeverb has eight
// and four. The lines are Freeverb's first four combs (1116, 1188, 1277 and
// 1356 frames) and last two all-passes (556 and 441), scaled from 44.1 kHz
// to the mixer's rate in whole frames, the right channel's 23 frames longer
// so the two sides differ. Both channels hear the input summed to mono
// (times 0.015, Freeverb's gain), and each returns its own side, twice as
// loud as Freeverb's default wet to make up for the combs it lacks.
//
// X is the combs' feedback, 0.7 to 0.98 (Freeverb's room size). Below the
// middle Y darkens the tail: the combs' damping (a one-pole low-pass in each
// loop) rises from Freeverb's default 0.2 at the middle to 0.8 at Y = 0.
// Above it Y brightens the return instead: a high shelf above about 3 kHz
// (the return plus its top end, from a trapezoidal one-pole), up to 2.5
// times (+8 dB) at Y = 1.
//
// The feedback and damping are set once a block (in the loops, a step is
// smoothed by the loops themselves); the shelf's gain glides across each
// block, sample by sample (an addition). silent once its input has been all
// 0, and what it added below 1e-6, for as long as the longest line and its
// all-passes are: the whole tail has gone through by then.
//
// Web deltas:
// - Kotlin's Float math is kept with Math.fround around every single
//   operation, so it renders what the Kotlin one does, bit for bit
//   (voiceMixer.test.ts replays VoiceMixerGoldenTest's FX scenarios).
//   Arguments are taken to be floats already (fround'ed).
// - silent is a getter; the companion's constants are statics.

import type { Effect } from './fxBus'
import { flush, svfG } from './fxMath'

const f = Math.fround

/** A channel's lines: its combs, then its all-passes. */
const LINES = 6
const COMB_COUNT = 4

export class Reverb implements Effect {
  /** Freeverb's comb and all-pass lengths at 44.1 kHz, and how much longer the right channel's are. */
  static readonly COMBS: readonly number[] = [1116, 1188, 1277, 1356]
  static readonly ALLPASSES: readonly number[] = [556, 441]
  static readonly SPREAD = 23
  static readonly BASE_RATE = 44100
  /** The input's gain into the combs (Freeverb's fixed gain). */
  static readonly INPUT = f(0.015)
  /** The combs' feedback at X = 0, and what X = 1 adds to it. */
  static readonly ROOM = f(0.7)
  static readonly ROOM_RANGE = f(0.28)
  /** The combs' damping from the middle of Y up, and at Y = 0. */
  static readonly DAMP = f(0.2)
  static readonly DAMP_DARK = f(0.8)
  /** The all-passes' feedback. */
  static readonly ALLPASS = 0.5
  /** The return's gain. */
  static readonly WET = 2
  /** Where the bright shelf starts, and how much of the top end it adds at Y = 1. */
  static readonly SHELF_HZ = 3000
  static readonly SHELF = 1.5
  /** Below this, the return counts as silence. */
  static readonly TAIL = f(1e-6)

  /** Each line's length, where it starts in lines and where it is now; by channel, then line. */
  private readonly lengths = new Int32Array(2 * LINES)
  private readonly starts = new Int32Array(2 * LINES)
  private readonly positions = new Int32Array(2 * LINES)
  private readonly lines: Float32Array

  /** Each comb's low-pass state, by channel, then comb. */
  private readonly stores = new Float32Array(2 * COMB_COUNT)

  /** The frames a tail takes to go through: the right channel's longest comb and its all-passes. */
  private readonly span: number

  /** The shelf's one-pole: its G and its state a channel. */
  private readonly shelfG: number
  private readonly shelfStates = new Float32Array(2)

  private feedback = Reverb.ROOM
  private damp1 = Reverb.DAMP
  private damp2 = f(1 - Reverb.DAMP)

  /** How much of the top end the shelf adds now, and where the block glides it to. */
  private shelf = 0
  private shelfTo = 0

  /** No knobs yet since the last reset: the next ones are taken as they are, with no glide. */
  private fresh = true
  /** The frames since its input or its return was other than silence; nothing has been since the lines were cleared. */
  private quietFrames: number
  private clean = true

  constructor(readonly outRate: number) {
    let total = 0
    for (let i = 0; i < 2 * LINES; i++) {
      const base = i % LINES < COMB_COUNT ? Reverb.COMBS[i % LINES]! : Reverb.ALLPASSES[(i % LINES) - COMB_COUNT]!
      this.lengths[i] = Math.max(1, Math.trunc(((base + Reverb.SPREAD * Math.trunc(i / LINES)) * outRate) / Reverb.BASE_RATE))
      this.starts[i] = total
      total += this.lengths[i]!
    }
    this.lines = new Float32Array(total)
    const l = this.lengths
    this.span = l[LINES + COMB_COUNT - 1]! + l[LINES + COMB_COUNT]! + l[LINES + COMB_COUNT + 1]!
    const g = svfG(Reverb.SHELF_HZ, outRate)
    this.shelfG = f(g / f(1 + g))
    this.quietFrames = this.span
  }

  get silent(): boolean {
    return this.quietFrames >= this.span
  }

  reset(): void {
    // Only what was written to needs clearing: a type change switches to a reverb that never ran at no cost.
    if (!this.clean) {
      this.lines.fill(0)
      this.clean = true
    }
    this.positions.fill(0)
    this.stores.fill(0)
    this.shelfStates.fill(0)
    this.fresh = true
    this.quietFrames = this.span
  }

  setParams(x: number, y: number, _bpm: number): void {
    this.feedback = f(Reverb.ROOM + f(Reverb.ROOM_RANGE * x))
    let damp: number
    if (y < 0.5) {
      damp = f(Reverb.DAMP + f(f(Reverb.DAMP_DARK - Reverb.DAMP) * f(f(0.5 - y) * 2)))
      this.shelfTo = 0
    } else {
      damp = Reverb.DAMP
      this.shelfTo = f(Reverb.SHELF * f(f(y - 0.5) * 2))
    }
    this.damp1 = damp
    this.damp2 = f(1 - damp)
    if (this.fresh) {
      this.shelf = this.shelfTo
      this.fresh = false
    }
  }

  process(input: Float32Array, out: Float32Array, frames: number): void {
    if (frames <= 0) return
    this.clean = false
    const shelfStep = f(f(this.shelfTo - this.shelf) / frames)
    const { lines, lengths, starts, positions, stores, shelfStates, shelfG, feedback, damp1, damp2 } = this
    const { INPUT, ALLPASS, WET } = Reverb
    let k = this.shelf
    let zero = true
    let peak = 0
    for (let i = 0; i < frames; i++) {
      k = f(k + shelfStep)
      const il = input[2 * i]!
      const ir = input[2 * i + 1]!
      if (il !== 0 || ir !== 0) zero = false
      const mono = f(f(il + ir) * INPUT)
      for (let c = 0; c < 2; c++) {
        // The combs, side by side.
        let acc = 0
        for (let j = 0; j < COMB_COUNT; j++) {
          const line = c * LINES + j
          const at = starts[line]! + positions[line]!
          const o = lines[at]!
          const s = flush(f(f(o * damp2) + f(stores[c * COMB_COUNT + j]! * damp1)))
          stores[c * COMB_COUNT + j] = s
          lines[at] = flush(f(mono + f(s * feedback)))
          const next = positions[line]! + 1
          positions[line] = next === lengths[line]! ? 0 : next
          acc = f(acc + o)
        }
        // The all-passes, in a row.
        for (let j = COMB_COUNT; j < LINES; j++) {
          const line = c * LINES + j
          const at = starts[line]! + positions[line]!
          const b = lines[at]!
          lines[at] = flush(f(acc + f(b * ALLPASS)))
          const next = positions[line]! + 1
          positions[line] = next === lengths[line]! ? 0 : next
          acc = f(b - acc)
        }
        // The shelf: the return plus k times its top end.
        const wet = f(acc * WET)
        const v = f(f(wet - shelfStates[c]!) * shelfG)
        const low = f(v + shelfStates[c]!)
        shelfStates[c] = flush(f(low + v))
        const o = f(wet + f(k * f(wet - low)))
        out[2 * i + c] = out[2 * i + c]! + o
        const a = Math.abs(o)
        if (a > peak) peak = a
      }
    }
    this.shelf = this.shelfTo
    if (!zero || peak >= Reverb.TAIL) this.quietFrames = 0
    else if (this.quietFrames < this.span) this.quietFrames += frames
  }
}
