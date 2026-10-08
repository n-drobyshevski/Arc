// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Punch.kt
//
// The punch-in effects (the EP-133's FX + pad), on the whole mix after the
// master effect: twelve slots (FxControl.PITCH_RANDOM to FxControl.DECIMATOR),
// each held at a depth 0..1 while its pad is. A slot fades in over 5 ms when
// it is pressed (an addition) and crossfades back out to what it was given
// over 5 ms when it is let go of. Any of them can be held at once; they play
// one after another, in ORDER:
//
// - the ones that replay the mix first, as they replace it: STUTTER loops the
//   last 20 to 80 ms (by the depth) before its press; BEAT_REPEAT loops the
//   last quarter, eighth, 16th or 32nd note (by the depth's quarters, held to
//   a second); TAPE_STOP slows the mix from its press to a stop over 1.5 down
//   to 0.3 s (by the depth), its pitch falling with it, then holds silence.
//   These three read a 2 s stereo history of the mix (before the punch-ins),
//   written every block (record). The loops play their slice out of the
//   history the first time round, copying it as they go, and from their copy
//   after, so they can be held for as long as wanted. Two of them held at
//   once: the later one plays over the earlier;
// - then the pitch shifters, on what comes to them: PITCH_RANDOM moves the
//   pitch to a random step each beat (1 to 12 semitones either way, the most
//   by the depth, from Lcg: the same each time); OCTAVE_DOWN an octave down,
//   mixed in by the depth. Each is a granular shifter: two heads read a 50 ms
//   line of its input, gliding through it at the new speed, each faded in
//   and out by a triangle window half a window apart from the other, so the
//   two always add up to one;
// - then the ones that work sample by sample: SLICE gates each 16th note,
//   open for 1 - 0.8 of the depth of it, with 2 ms edges; FILTER_LFO a
//   band-pass sweeping 200 Hz to 4 kHz and back once a beat (along a
//   triangle, on a square curve), its Q 1 to 8 by the depth; LPF a low-pass
//   from 20 kHz down to 80 Hz, HPF a high-pass from 20 Hz up to 6 kHz (by the
//   depth, on knobHz's curve); TREMOLO a 16th-note parabolicSine swell, down
//   to 1 - the depth; DECIMATOR holds every 1st to 16th sample and truncates
//   it to 16 down to 4 bits (by the depth).
//
// SEND_FX does nothing here: sendBoost raises every group's send to its
// depth, through the bus.
//
// The replays catch their slice, the tape its speed and the shifter its first
// step at the press; the rest follow the depth as it moves, a block at a
// time. The synced ones start their cycle at the press (the mixer has no bar
// to line them up with). What a slot plays doesn't depend on how the blocks
// are cut: the filter LFO's cutoff moves every LFO_TICK frames, and the beats
// and cycles are counted in frames. The processing order (the replays first,
// so a filter or the gate works on the loop) and the press's fade are
// additions.
//
// Web deltas:
// - Kotlin's Float math is kept with Math.fround around every single
//   operation, so it plays what the Kotlin one does, bit for bit
//   (voiceMixer.test.ts replays VoiceMixerGoldenTest's punch-in scenarios).
//   Arguments are taken to be floats already (fround'ed).
// - The slots, SEND_FX's among them, and the default tempo are written here
//   (FxControl's and FxBus's in Kotlin), since fxBus.ts imports this file.
// - active is a getter; the companion's constants are statics.

import { clamp01, knobHz, Lcg, lerp, parabolicSine, semitoneRatio, svfG, triangle, wrap01 } from './fxMath'
import { Svf } from './svf'

const f = Math.fround

/** FxControl's slots. */
const PITCH_RANDOM = 0
const SLICE = 1
const STUTTER = 2
const BEAT_REPEAT = 3
const TAPE_STOP = 4
const FILTER_LFO = 5
const LPF = 6
const HPF = 7
const SEND_FX = 8
const TREMOLO = 9
const OCTAVE_DOWN = 10
const DECIMATOR = 11
const SLOTS = 12

/** What the decimator truncates is held to this first, so it is an Int in every port. */
const BIG = f(1e9)

/** A loop's own copy of its slice (capacity frames at most), and where it is in it. */
class Loop {
  readonly copy: Float32Array
  length = 1
  /** The history frame the slice starts at. */
  from = 0
  at = 0
  /** Still going round the first time: reading the history. */
  first = true

  constructor(readonly capacity: number) {
    this.copy = new Float32Array(capacity * 2)
  }

  /** A slice [frames] long (held to 1..capacity), ending at history frame [s]. */
  start(frames: number, s: number, historySize: number): void {
    const n = Math.trunc(frames)
    this.length = n > this.capacity ? this.capacity : n > 1 ? n : 1
    this.from = s - this.length
    if (this.from < 0) this.from += historySize
    this.at = 0
    this.first = true
  }
}

/**
 * A granular pitch shifter, stereo: two heads read a line of its input window
 * long (50 ms), each delayA and delayB behind what was just written, the delay
 * growing by 1 - ratio a frame (so they read at the ratio's speed), and
 * starting over (at 0 going down, at the window's share going up) as its
 * triangle window closes; the two windows are half a window apart.
 */
class Shifter {
  readonly window: number
  private readonly half: number
  private readonly most: number
  private readonly gainStep: number
  /** The line: the window, and one more frame either side of the read. */
  private readonly size: number
  private readonly left: Float32Array
  private readonly right: Float32Array
  private write = 0
  /** Where head A is in its window (head B half a window on). */
  private grain = 0
  private delayA = 0
  private delayB = 0
  private ratio = 1
  /** Where a head's delay starts over. */
  private restart = 0
  outL = 0
  outR = 0

  constructor(rate: number) {
    this.window = Math.max(1, Math.trunc((rate * Punch.GRAIN_MS) / 2000)) * 2
    this.half = this.window / 2
    this.most = this.window
    this.gainStep = f(2 / this.window)
    this.size = this.window + 2
    this.left = new Float32Array(this.size)
    this.right = new Float32Array(this.size)
  }

  /** At [ratio], the line filled with the history before frame [s], head A's window opening. */
  start(ratio: number, history: Float32Array, s: number, historySize: number): void {
    this.retune(ratio)
    const { left, right, size } = this
    let k = s - size
    if (k < 0) k += historySize
    for (let j = 0; j < size; j++) {
      left[j] = history[2 * k]!
      right[j] = history[2 * k + 1]!
      k++
      if (k === historySize) k = 0
    }
    this.write = 0
    this.grain = 0
    this.delayA = this.restart
    this.delayB = this.inLine(f(this.restart + f(this.half * f(1 - this.ratio))))
  }

  /** A new speed: the heads glide on from where they are. */
  retune(ratio: number): void {
    this.ratio = ratio
    this.restart = ratio > 1 ? this.inLine(f(f(ratio - 1) * this.most)) : 0
  }

  /** Takes in a frame: outL and outR are then the shifted one. */
  frame(l: number, r: number): void {
    const { left, right, size, window, half, gainStep, write, grain } = this
    left[write] = l
    right[write] = r
    const gA = f((grain < half ? grain : window - grain) * gainStep)
    let kb = grain + half
    if (kb >= window) kb -= window
    const gB = f((kb < half ? kb : window - kb) * gainStep)
    const wa = Math.trunc(this.delayA)
    const fa = f(this.delayA - wa)
    let a0 = write - wa
    if (a0 < 0) a0 += size
    let a1 = a0 - 1
    if (a1 < 0) a1 += size
    const wb = Math.trunc(this.delayB)
    const fb = f(this.delayB - wb)
    let b0 = write - wb
    if (b0 < 0) b0 += size
    let b1 = b0 - 1
    if (b1 < 0) b1 += size
    this.outL = f(f(lerp(left[a0]!, left[a1]!, fa) * gA) + f(lerp(left[b0]!, left[b1]!, fb) * gB))
    this.outR = f(f(lerp(right[a0]!, right[a1]!, fa) * gA) + f(lerp(right[b0]!, right[b1]!, fb) * gB))
    const glide = f(1 - this.ratio)
    this.delayA = this.inLine(f(this.delayA + glide))
    this.delayB = this.inLine(f(this.delayB + glide))
    this.write = write + 1 === size ? 0 : write + 1
    let g = grain + 1
    if (g === window) g = 0
    this.grain = g
    // A head starts over as its window closes (its gain 0).
    if (g === 0) this.delayA = this.restart
    else if (g === half) this.delayB = this.restart
  }

  /** A delay held to the line. */
  private inLine(d: number): number {
    return d < 0 ? 0 : d > this.most ? this.most : d
  }
}

export class Punch {
  /** The slots in the order they play. */
  static readonly ORDER: readonly number[] = [
    STUTTER, BEAT_REPEAT, TAPE_STOP, PITCH_RANDOM, OCTAVE_DOWN, SLICE, FILTER_LFO, LPF, HPF, TREMOLO, DECIMATOR,
  ]
  /** How much of the mix the history keeps. */
  static readonly HISTORY_SECONDS = 2
  /** A slot's fade in and out. */
  static readonly FADE_MS = 5
  /** The stutter's loop at depth 0, and what depth 1 adds to it. */
  static readonly STUTTER_MS = 20
  static readonly STUTTER_MS_RANGE = 60
  /** The beat repeat's longest loop. */
  static readonly REPEAT_SECONDS = 1
  /** The tape's stop at depth 0, and what depth 1 takes off it. */
  static readonly TAPE_SECONDS = 1.5
  static readonly TAPE_SECONDS_RANGE = f(1.2)
  /** The pitch shifters' window. */
  static readonly GRAIN_MS = 50
  /** The pitch shifter's seed: its steps are the same each time. */
  static readonly SEED = 133
  /** How much of each 16th the slice's gate closes at depth 1, and its edges. */
  static readonly SLICE_CLOSE = f(0.8)
  static readonly SLICE_EDGE_MS = 2
  /** The filter LFO's sweep, its Q at depth 0 and what depth 1 adds, and the frames between cutoffs. */
  static readonly LFO_FROM = 200
  static readonly LFO_TO = 4000
  static readonly LFO_Q = 1
  static readonly LFO_Q_RANGE = 7
  static readonly LFO_TICK = 16
  /** The low-pass's cutoff at depth 1 and 0, the high-pass's at 0 and 1, both at Q 1/√2. */
  static readonly LPF_FROM = 80
  static readonly LPF_TO = 20000
  static readonly HPF_FROM = 20
  static readonly HPF_TO = 6000
  static readonly BUTTERWORTH = f(0.70710677)
  /** The decimator's hold at depth 1 (less the one frame at 0), and the bits it takes off. */
  static readonly DECIMATE_HOLD = 15
  static readonly DECIMATE_BITS = 12

  /** The history: the mix before the punch-ins, stereo, the next block going in at head. */
  private readonly historySize: number
  private readonly history: Float32Array
  private head = 0

  private readonly depths = new Float32Array(SLOTS)
  private readonly held: boolean[] = new Array<boolean>(SLOTS).fill(false)
  /** Pressed from silence: it starts at the next process. */
  private readonly fresh: boolean[] = new Array<boolean>(SLOTS).fill(false)
  /** Each slot's fade, 0 (out) to fadeFrames (all in). */
  private readonly ramps = new Int32Array(SLOTS)
  private readonly fadeFrames: number
  private readonly fadeStep: number
  private bpm = 120

  private readonly stutter: Loop
  private readonly repeat: Loop

  private tapeAt = 0
  private tapeFrames = 1
  private tapeStep = 1
  private tapeLag = 0

  private readonly pitch: Shifter
  private readonly octave: Shifter
  private lcg = new Lcg(Punch.SEED)
  private beatAt = 0

  private readonly sliceEdge: number
  private slicePhase = 0

  private readonly lfoL = new Svf()
  private readonly lfoR = new Svf()
  private lfoPhase = 0
  private lfoTick = 0
  private lfoGain = 1

  private readonly lpL = new Svf()
  private readonly lpR = new Svf()
  private readonly hpL = new Svf()
  private readonly hpR = new Svf()

  private tremoloPhase = 0

  private decimateAt = 0
  private decimateL = 0
  private decimateR = 0

  constructor(readonly outRate: number) {
    this.historySize = Punch.HISTORY_SECONDS * outRate
    this.history = new Float32Array(this.historySize * 2)
    this.fadeFrames = Math.max(1, Math.trunc((Punch.FADE_MS * outRate) / 1000))
    this.fadeStep = f(1 / this.fadeFrames)
    this.stutter = new Loop(Math.trunc(((Punch.STUTTER_MS + Punch.STUTTER_MS_RANGE) * outRate) / 1000) + 1)
    this.repeat = new Loop(Punch.REPEAT_SECONDS * outRate)
    this.pitch = new Shifter(outRate)
    this.octave = new Shifter(outRate)
    this.sliceEdge = Math.max(1, Math.trunc((Punch.SLICE_EDGE_MS * outRate) / 1000))
  }

  /** Whether a slot is held or still fading out: the bus calls process only then. */
  get active(): boolean {
    for (const slot of Punch.ORDER) if (this.held[slot] || this.ramps[slot]! > 0) return true
    return false
  }

  /** Holds [slot] at [depth] (0..1); 0 lets go of it. */
  set(slot: number, depth: number): void {
    if (!(slot >= 0 && slot < SLOTS)) return
    const d = clamp01(depth)
    if (d > 0) {
      if (!this.held[slot] && this.ramps[slot] === 0) this.fresh[slot] = true
      this.held[slot] = true
      this.depths[slot] = d
    } else {
      // The depth stays, for the fade out.
      this.held[slot] = false
    }
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
    return this.held[SEND_FX] ? this.depths[SEND_FX]! : 0
  }

  /** Writes [mix] (stereo, interleaved, [frames] long, before the punch-ins) into the history; every block. */
  record(mix: Float32Array, frames: number): void {
    let from = 0
    let left = frames
    while (left > 0) {
      const n = Math.min(left, this.historySize - this.head)
      this.history.set(mix.subarray(from * 2, (from + n) * 2), this.head * 2)
      this.head += n
      if (this.head === this.historySize) this.head = 0
      from += n
      left -= n
    }
  }

  /** Plays the held slots over [mix] (stereo, interleaved, [frames] long, just recorded), in place. */
  process(mix: Float32Array, frames: number): void {
    if (frames <= 0) return
    // The history's frame for the block's first.
    let s = (this.head - frames) % this.historySize
    if (s < 0) s += this.historySize
    for (const slot of Punch.ORDER) {
      const on = this.held[slot]!
      const r0 = this.ramps[slot]!
      if (!on && r0 === 0) continue
      if (this.fresh[slot]) {
        this.start(slot, s)
        this.fresh[slot] = false
      }
      // Let go of: until its fade is out.
      const n = on ? frames : Math.min(frames, r0 - 1)
      switch (slot) {
        case STUTTER:
          this.loop(this.stutter, mix, n, on, r0)
          break
        case BEAT_REPEAT:
          this.loop(this.repeat, mix, n, on, r0)
          break
        case TAPE_STOP:
          this.tape(mix, n, s, on, r0)
          break
        case PITCH_RANDOM:
          this.pitchRandom(mix, n, on, r0)
          break
        case OCTAVE_DOWN:
          this.octaveDown(mix, n, on, r0)
          break
        case SLICE:
          this.slice(mix, n, on, r0)
          break
        case FILTER_LFO:
          this.filterLfo(mix, n, on, r0)
          break
        case LPF:
          this.pass(this.lpL, this.lpR, false, mix, n, on, r0)
          break
        case HPF:
          this.pass(this.hpL, this.hpR, true, mix, n, on, r0)
          break
        case TREMOLO:
          this.tremolo(mix, n, on, r0)
          break
        case DECIMATOR:
          this.decimate(mix, n, on, r0)
          break
      }
      this.ramps[slot] = on ? Math.min(this.fadeFrames, r0 + frames) : Math.max(0, r0 - frames)
    }
  }

  /** Every slot let go of at once, the history silent. */
  reset(): void {
    this.depths.fill(0)
    this.held.fill(false)
    this.fresh.fill(false)
    this.ramps.fill(0)
    this.history.fill(0)
    this.head = 0
    this.lcg = new Lcg(Punch.SEED)
  }

  /** [slot] pressed from silence, the block's first frame at history frame [s]: its state from the start. */
  private start(slot: number, s: number): void {
    const d = this.depths[slot]!
    const rate = this.outRate
    switch (slot) {
      case STUTTER:
        this.stutter.start(f(f(f(Punch.STUTTER_MS + f(Punch.STUTTER_MS_RANGE * d)) * rate) / 1000), s, this.historySize)
        break
      case BEAT_REPEAT: {
        const q = Math.trunc(f(d * 4))
        const division = 1 << (q > 3 ? 3 : q)
        this.repeat.start(f(f(f(rate * 60) / this.bpm) / division), s, this.historySize)
        break
      }
      case TAPE_STOP: {
        const t = Math.trunc(f(f(Punch.TAPE_SECONDS - f(Punch.TAPE_SECONDS_RANGE * d)) * rate))
        this.tapeFrames = t > 1 ? t : 1
        this.tapeStep = f(1 / this.tapeFrames)
        this.tapeAt = 0
        this.tapeLag = 0
        break
      }
      case PITCH_RANDOM:
        this.pitch.start(this.randomStep(d), this.history, s, this.historySize)
        this.beatAt = 0
        break
      case OCTAVE_DOWN:
        this.octave.start(0.5, this.history, s, this.historySize)
        break
      case SLICE:
        this.slicePhase = 0
        break
      case FILTER_LFO:
        // From the bottom of the sweep.
        this.lfoPhase = 0.75
        this.lfoTick = 0
        this.lfoL.reset()
        this.lfoR.reset()
        break
      case LPF:
        this.lpL.reset()
        this.lpR.reset()
        break
      case HPF:
        this.hpL.reset()
        this.hpR.reset()
        break
      case TREMOLO:
        // From the top of the swell.
        this.tremoloPhase = 0.25
        break
      case DECIMATOR:
        this.decimateAt = 0
        break
    }
  }

  /** A slot's fade at its block's frame [i]: in by a frame each while [on], out by one each after. */
  private rampAt(on: boolean, r0: number, i: number): number {
    if (!on) return r0 - i - 1
    const r = r0 + i + 1
    return r < this.fadeFrames ? r : this.fadeFrames
  }

  /** [x] (what came to a slot) toward [p] (what it makes of it) by its fade [r]. */
  private wet(x: number, p: number, r: number): number {
    if (r >= this.fadeFrames) return p
    return f(x + f(f(p - x) * f(r * this.fadeStep)))
  }

  /** A loop's slice over [n] frames of [mix]: out of the history the first time round, copied as it goes. */
  private loop(loop: Loop, mix: Float32Array, n: number, on: boolean, r0: number): void {
    const h = this.history
    const historySize = this.historySize
    const copy = loop.copy
    let at = loop.at
    let first = loop.first
    for (let i = 0; i < n; i++) {
      const r = this.rampAt(on, r0, i)
      if (first) {
        let k = loop.from + at
        if (k >= historySize) k -= historySize
        copy[2 * at] = h[2 * k]!
        copy[2 * at + 1] = h[2 * k + 1]!
      }
      mix[2 * i] = this.wet(mix[2 * i]!, copy[2 * at]!, r)
      mix[2 * i + 1] = this.wet(mix[2 * i + 1]!, copy[2 * at + 1]!, r)
      at++
      if (at === loop.length) {
        at = 0
        first = false
      }
    }
    loop.at = at
    loop.first = first
  }

  /** The tape: the history read further and further behind, slower and slower, then silence. */
  private tape(mix: Float32Array, n: number, s: number, on: boolean, r0: number): void {
    const h = this.history
    const historySize = this.historySize
    let cur = s
    let at = this.tapeAt
    let lag = this.tapeLag
    for (let i = 0; i < n; i++) {
      const r = this.rampAt(on, r0, i)
      let l = 0
      let rr = 0
      if (at < this.tapeFrames) {
        // Between the two samples lag frames back; the lag grows by at / tapeFrames a frame.
        const whole = Math.trunc(lag)
        const frac = f(lag - whole)
        let k0 = cur - whole
        if (k0 < 0) k0 += historySize
        let k1 = k0 - 1
        if (k1 < 0) k1 += historySize
        l = lerp(h[2 * k0]!, h[2 * k1]!, frac)
        rr = lerp(h[2 * k0 + 1]!, h[2 * k1 + 1]!, frac)
        at++
        lag = f(lag + f(at * this.tapeStep))
      }
      mix[2 * i] = this.wet(mix[2 * i]!, l, r)
      mix[2 * i + 1] = this.wet(mix[2 * i + 1]!, rr, r)
      cur++
      if (cur === historySize) cur = 0
    }
    this.tapeAt = at
    this.tapeLag = lag
  }

  /** A random step of 1 to 1 + 11 [d] semitones, up or down, as a speed. */
  private randomStep(d: number): number {
    const most = Math.trunc(f(1 + f(11 * d)))
    let k = Math.trunc(f(this.lcg.unit() * (2 * most)))
    if (k > 2 * most - 1) k = 2 * most - 1
    let n = k - most
    if (n >= 0) n++
    return semitoneRatio(n)
  }

  private pitchRandom(mix: Float32Array, n: number, on: boolean, r0: number): void {
    const d = this.depths[PITCH_RANDOM]!
    const b = Math.trunc(f(f(this.outRate * 60) / this.bpm))
    const beat = b > 1 ? b : 1
    const pitch = this.pitch
    for (let i = 0; i < n; i++) {
      const r = this.rampAt(on, r0, i)
      const l = mix[2 * i]!
      const rr = mix[2 * i + 1]!
      pitch.frame(l, rr)
      mix[2 * i] = this.wet(l, pitch.outL, r)
      mix[2 * i + 1] = this.wet(rr, pitch.outR, r)
      this.beatAt++
      if (this.beatAt >= beat) {
        this.beatAt = 0
        pitch.retune(this.randomStep(d))
      }
    }
  }

  private octaveDown(mix: Float32Array, n: number, on: boolean, r0: number): void {
    const d = this.depths[OCTAVE_DOWN]!
    const octave = this.octave
    for (let i = 0; i < n; i++) {
      const r = this.rampAt(on, r0, i)
      const amount = r >= this.fadeFrames ? d : f(d * f(r * this.fadeStep))
      const l = mix[2 * i]!
      const rr = mix[2 * i + 1]!
      octave.frame(l, rr)
      mix[2 * i] = f(l + f(f(octave.outL - l) * amount))
      mix[2 * i + 1] = f(rr + f(f(octave.outR - rr) * amount))
    }
  }

  private slice(mix: Float32Array, n: number, on: boolean, r0: number): void {
    const d = this.depths[SLICE]!
    // A 16th note's share of a cycle a frame, how much of it is open, and 1 over an edge's share.
    const inc = f(this.bpm / f(15 * this.outRate))
    const open = f(1 - f(Punch.SLICE_CLOSE * d))
    const sharp = f(1 / f(this.sliceEdge * inc))
    let p = this.slicePhase
    for (let i = 0; i < n; i++) {
      const r = this.rampAt(on, r0, i)
      const up = f(p * sharp)
      const down = f(f(open - p) * sharp)
      const e = up < down ? up : down
      const g = e > 1 ? 1 : e > 0 ? e : 0
      const l = mix[2 * i]!
      const rr = mix[2 * i + 1]!
      mix[2 * i] = this.wet(l, f(l * g), r)
      mix[2 * i + 1] = this.wet(rr, f(rr * g), r)
      p = wrap01(f(p + inc))
    }
    this.slicePhase = p
  }

  private filterLfo(mix: Float32Array, n: number, on: boolean, r0: number): void {
    const q = f(Punch.LFO_Q + f(Punch.LFO_Q_RANGE * this.depths[FILTER_LFO]!))
    const inc = f(this.bpm / f(60 * this.outRate))
    const { lfoL, lfoR } = this
    let p = this.lfoPhase
    let tick = this.lfoTick
    for (let i = 0; i < n; i++) {
      const r = this.rampAt(on, r0, i)
      if (tick === 0) {
        const u = f(0.5 + f(0.5 * triangle(p)))
        const g = svfG(f(Punch.LFO_FROM + f((Punch.LFO_TO - Punch.LFO_FROM) * f(u * u))), this.outRate)
        lfoL.set(g, q)
        lfoR.set(g, q)
        // The band-pass at 1 in its middle.
        this.lfoGain = f(1 / q)
      }
      tick++
      if (tick === Punch.LFO_TICK) tick = 0
      const l = mix[2 * i]!
      const rr = mix[2 * i + 1]!
      lfoL.process(l)
      lfoR.process(rr)
      mix[2 * i] = this.wet(l, f(lfoL.bp * this.lfoGain), r)
      mix[2 * i + 1] = this.wet(rr, f(lfoR.bp * this.lfoGain), r)
      p = wrap01(f(p + inc))
    }
    this.lfoPhase = p
    this.lfoTick = tick
  }

  /** The low-pass ([high] false) or the high-pass. */
  private pass(left: Svf, right: Svf, high: boolean, mix: Float32Array, n: number, on: boolean, r0: number): void {
    const hz = high
      ? knobHz(this.depths[HPF]!, Punch.HPF_FROM, Punch.HPF_TO)
      : knobHz(f(1 - this.depths[LPF]!), Punch.LPF_FROM, Punch.LPF_TO)
    const g = svfG(hz, this.outRate)
    left.set(g, Punch.BUTTERWORTH)
    right.set(g, Punch.BUTTERWORTH)
    for (let i = 0; i < n; i++) {
      const r = this.rampAt(on, r0, i)
      const l = mix[2 * i]!
      const rr = mix[2 * i + 1]!
      left.process(l)
      right.process(rr)
      mix[2 * i] = this.wet(l, high ? left.hp : left.lp, r)
      mix[2 * i + 1] = this.wet(rr, high ? right.hp : right.lp, r)
    }
  }

  private tremolo(mix: Float32Array, n: number, on: boolean, r0: number): void {
    const d = this.depths[TREMOLO]!
    const inc = f(this.bpm / f(15 * this.outRate))
    let p = this.tremoloPhase
    for (let i = 0; i < n; i++) {
      const r = this.rampAt(on, r0, i)
      const g = f(1 - f(d * f(0.5 - f(0.5 * parabolicSine(p)))))
      const l = mix[2 * i]!
      const rr = mix[2 * i + 1]!
      mix[2 * i] = this.wet(l, f(l * g), r)
      mix[2 * i + 1] = this.wet(rr, f(rr * g), r)
      p = wrap01(f(p + inc))
    }
    this.tremoloPhase = p
  }

  private decimate(mix: Float32Array, n: number, on: boolean, r0: number): void {
    const d = this.depths[DECIMATOR]!
    const hold = Math.trunc(f(1 + f(Punch.DECIMATE_HOLD * d)))
    // A power of two: dividing by it is exact.
    const step = 1 << Math.trunc(f(Punch.DECIMATE_BITS * d))
    const inv = f(1 / step)
    let at = this.decimateAt
    let hl = this.decimateL
    let hr = this.decimateR
    for (let i = 0; i < n; i++) {
      const r = this.rampAt(on, r0, i)
      const l = mix[2 * i]!
      const rr = mix[2 * i + 1]!
      if (at === 0) {
        hl = quantise(l, step, inv)
        hr = quantise(rr, step, inv)
      }
      at++
      if (at >= hold) at = 0
      mix[2 * i] = this.wet(l, hl, r)
      mix[2 * i + 1] = this.wet(rr, hr, r)
    }
    this.decimateAt = at
    this.decimateL = hl
    this.decimateR = hr
  }
}

/** [x] truncated (toward 0) to a multiple of [step]. */
function quantise(x: number, step: number, inv: number): number {
  const q = f(x * inv)
  const c = q > BIG ? BIG : q < -BIG ? -BIG : q
  return f(Math.trunc(c) * step)
}
