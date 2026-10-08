// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/FxBus.kt
//
// The mixer's effects (an addition), as the EP-133's FX page has them: each
// group (A to D) sends some of itself to one master effect, whose return is
// added to the mix; then the punch-ins play over the whole mix, and the
// master compressor (an addition) comes last, before the mixer's clip. The
// sidechain (an addition too) ducks the groups it names whenever its source
// pad starts.
//
// The mixer owns it and calls it from its render: begin at a block's start,
// gains for each stretch between timed commands (so a timed start ducks on
// its own frame), and process at the block's end. A voice on bus g adds its
// sample times dry(g) to the mix and times send(g) to fxIn; a voice on bus -1
// just adds itself, as before FX. Per frame:
//
// - dry = duck × dry law(send), send = duck × send (raised to SEND_FX's depth
//   while that punch-in is held);
// - the dry law follows the effect: DELAY, REVERB and CHORUS keep more of the
//   dry as the send rises (1 - 0.3 send, as OS 2.5 does), DISTORTION, FILTER
//   and COMPRESSOR take it away (1 - send), and with no effect it is 1;
// - the duck: a start with VoiceShape's duckSource dips the groups in the
//   sidechain's mask from where the duck is to 0.1 (-20 dB) in 2 ms,
//   linearly, then lets them back up to 1 by the duck's length (30 + 570 x ms
//   from the start), along a curve from fast (y = 0) to slow (y = 1). Before
//   any start, after the length, or with the sidechain off it is exactly 1.
//
// Sends, the effect's knobs and the compressor's go to their new values over
// about 20 ms (a one-pole, onePoleCoef), landing exactly on them. A new
// effect type crossfades from the old one's return over 20 ms, and the old
// one is then reset. The tempo goes to the effect and the punch-ins as it is.
//
// At its defaults (no effect, no send, no punch-in, the compressor and
// sidechain off) it leaves the mix exactly as it was: every gain is exactly 1
// or 0, and process touches nothing.
//
// Web deltas:
// - Kotlin's Float math is kept with Math.fround around every single
//   operation, so the web mixer renders what the Kotlin one does, bit for bit
//   (voiceMixer.test.ts replays VoiceMixerGoldenTest's FX scenarios).
//   Arguments are taken to be floats already (fround'ed).
// - The object FxControl is a const object; the interface Effect is the same
//   (silent a getter in each effect). The companion's constants are statics.
// - Frames are numbers; "no duck running" is -Infinity (Kotlin's
//   Long.MIN_VALUE).

import { Chorus } from './chorus'
import { Compressor } from './compressor'
import { Delay } from './delay'
import { Distortion } from './distortion'
import { Filter } from './filter'
import { clamp01, lerp, onePoleCoef } from './fxMath'
import { Punch } from './punch'
import { Reverb } from './reverb'

const f = Math.fround

/**
 * What VoiceMixer.control takes (an addition): the command (FX_TYPE to
 * PUNCH) with its index and two values, as the FX page and the punch-in pads
 * send them; the effect types (NONE to COMPRESSOR, fxSettings' FX_TYPES by
 * index) and the punch-in slots (PITCH_RANDOM to DECIMATOR, the pad each is
 * on in the comment).
 */
export const FxControl = {
  /** index: the type (NONE to COMPRESSOR); x, y: its knobs, 0..1. */
  FX_TYPE: 1,
  /** x, y: the effect's knobs, 0..1. */
  FX_XY: 2,
  /** index: the group, 0..3; x: its send to the effect, 0..1. */
  SEND: 3,
  /** index: 1 on, 0 off; x: the master compressor's drive, y: its speed, 0..1. */
  COMP: 4,
  /** index: the groups ducked (bit g for group g; 0 is off); x: the duck's length, y: its shape, 0..1. */
  SIDECHAIN: 5,
  /** x: the tempo, in BPM (held to 20..300). */
  TEMPO: 6,
  /** index: the slot (PITCH_RANDOM to DECIMATOR); x: its depth, 0..1 (0 or less lets go of it). */
  PUNCH: 7,

  NONE: 0,
  DELAY: 1,
  REVERB: 2,
  DISTORTION: 3,
  CHORUS: 4,
  FILTER: 5,
  COMPRESSOR: 6,
  /** The types, NONE included. */
  TYPES: 7,

  /** '.' */
  PITCH_RANDOM: 0,
  /** '0' */
  SLICE: 1,
  /** ENTER */
  STUTTER: 2,
  /** '1' */
  BEAT_REPEAT: 3,
  /** '2' */
  TAPE_STOP: 4,
  /** '3' */
  FILTER_LFO: 5,
  /** '4' */
  LPF: 6,
  /** '5' */
  HPF: 7,
  /** '6' */
  SEND_FX: 8,
  /** '7' */
  TREMOLO: 9,
  /** '8' */
  OCTAVE_DOWN: 10,
  /** '9' */
  DECIMATOR: 11,
  SLOTS: 12,

  /** The groups with a send (A to D); a voice on bus -1 has none. */
  GROUPS: 4,
} as const

/**
 * An effect on the send bus. Levels are the mixer's (16-bit scale floats, as
 * its mix is); buffers are stereo, interleaved.
 */
export interface Effect {
  /** True when its tail has died away (below 1e-6) and its input was silent for a whole block: the bus may skip it. */
  readonly silent: boolean
  /** Back to silence, its tail dropped. */
  reset(): void
  /** Its knobs [x] and [y] (0..1, smoothed) and the tempo, at most once a block, before process. */
  setParams(x: number, y: number, bpm: number): void
  /** Adds its return for [frames] frames of [input] into [out]. */
  process(input: Float32Array, out: Float32Array, frames: number): void
}

const GROUPS = FxControl.GROUPS

/** No duck running. */
const IDLE = Number.NEGATIVE_INFINITY

export class FxBus {
  /** How long the sends and knobs take to reach a new value, about. */
  static readonly SMOOTH_MS = 20
  /** A smoothed value this close to its target lands on it. */
  static readonly SNAP = f(1e-6)
  /** A new effect type fades in over this long, the old one out. */
  static readonly CROSSFADE_MS = 20
  /** The duck's floor: -20 dB. */
  static readonly DUCK_FLOOR = f(0.1)
  /** How long the duck takes to reach its floor. */
  static readonly DUCK_DIP_MS = 2
  /** The duck's length at x = 0, and what x = 1 adds to it. */
  static readonly DUCK_MS = 30
  static readonly DUCK_MS_RANGE = 570
  static readonly BPM_DEFAULT = 120
  static readonly BPM_MIN = 20
  static readonly BPM_MAX = 300

  private readonly delay: Delay
  private readonly reverb: Reverb
  private readonly distortion: Distortion
  private readonly chorus: Chorus
  private readonly filter: Filter
  private readonly compressorFx: Compressor
  private readonly compressor: Compressor
  private readonly punch: Punch
  /** By type; NONE has none. */
  private readonly effects: readonly (Effect | null)[]

  private readonly smoothK: number
  private readonly fadeFrames: number
  private readonly dip: number

  private type: number = FxControl.NONE
  private fxX = f(0.5)
  private fxY = f(0.5)
  private fxXTo = f(0.5)
  private fxYTo = f(0.5)
  /** The type fading out, and the frames of the fade still to go (0: none). */
  private oldType: number = FxControl.NONE
  private fade = 0

  private readonly sends = new Float32Array(GROUPS)
  private readonly sendsTo = new Float32Array(GROUPS)

  private compOn = false
  private compX = f(0.5)
  private compY = f(0.5)
  private compXTo = f(0.5)
  private compYTo = f(0.5)

  private dests = 0
  private duckX = f(0.3)
  private duckY = f(0.5)
  private duckLength: number
  private duckAt = IDLE
  private duckFrom = 1

  private bpm = FxBus.BPM_DEFAULT

  private input = new Float32Array(0)
  private dryGains: Float32Array[] = []
  private sendGains: Float32Array[] = []
  private readonly dryOn: boolean[] = [false, false, false, false]
  private readonly sendOn: boolean[] = [false, false, false, false]
  private fadeOld = new Float32Array(0)
  private fadeNew = new Float32Array(0)
  private frames = 0
  /** How much of fxIn may be other than 0; whether anything was sent this block. */
  private dirty = 0
  private sent = false

  constructor(readonly outRate: number) {
    this.delay = new Delay(outRate)
    this.reverb = new Reverb(outRate)
    this.distortion = new Distortion(outRate)
    this.chorus = new Chorus(outRate)
    this.filter = new Filter(outRate)
    this.compressorFx = new Compressor(outRate)
    this.compressor = new Compressor(outRate)
    this.punch = new Punch(outRate)
    this.effects = [null, this.delay, this.reverb, this.distortion, this.chorus, this.filter, this.compressorFx]
    this.smoothK = onePoleCoef(FxBus.SMOOTH_MS, outRate)
    this.fadeFrames = Math.max(1, Math.trunc((FxBus.CROSSFADE_MS * outRate) / 1000))
    this.dip = Math.max(1, Math.trunc((FxBus.DUCK_DIP_MS * outRate) / 1000))
    this.duckLength = this.lengthOf(this.duckX)
  }

  /** The send bus's input for the block: what the voices send, stereo, interleaved. */
  get fxIn(): Float32Array {
    return this.input
  }

  /** Takes one of FxControl's commands. */
  control(what: number, index: number, x: number, y: number): void {
    switch (what) {
      case FxControl.FX_TYPE: {
        const t = index >= 0 && index < FxControl.TYPES ? index : FxControl.NONE
        this.fxXTo = clamp01(x)
        this.fxYTo = clamp01(y)
        if (t === this.type) return
        // A new effect starts at its knobs; the one fading out (if any) goes at once.
        if (this.fade > 0) this.effects[this.oldType]?.reset()
        this.oldType = this.type
        this.type = t
        this.fade = this.fadeFrames
        this.fxX = this.fxXTo
        this.fxY = this.fxYTo
        this.effects[t]?.reset()
        return
      }
      case FxControl.FX_XY:
        this.fxXTo = clamp01(x)
        this.fxYTo = clamp01(y)
        return
      case FxControl.SEND:
        if (index >= 0 && index < GROUPS) this.sendsTo[index] = clamp01(x)
        return
      case FxControl.COMP: {
        // Switched on: from silence, not from where it was left.
        const on = index !== 0
        if (on && !this.compOn) this.compressor.reset()
        this.compOn = on
        this.compXTo = clamp01(x)
        this.compYTo = clamp01(y)
        return
      }
      case FxControl.SIDECHAIN:
        this.dests = index & ((1 << GROUPS) - 1)
        this.duckX = clamp01(x)
        this.duckY = clamp01(y)
        this.duckLength = this.lengthOf(this.duckX)
        return
      case FxControl.TEMPO:
        this.bpm = x > FxBus.BPM_MIN ? (x < FxBus.BPM_MAX ? x : FxBus.BPM_MAX) : FxBus.BPM_MIN
        this.punch.setTempo(this.bpm)
        return
      case FxControl.PUNCH:
        this.punch.set(index, x)
        return
    }
  }

  /** A duck source starts at output frame [at]: the duck dips from where it is now. */
  trigger(at: number): void {
    this.duckFrom = this.duck(at)
    this.duckAt = at
  }

  /** A block of [frames] frames starts: fxIn cleared, the buffers grown if need be. */
  begin(frames: number): void {
    this.frames = frames
    const n = frames * 2
    if (this.input.length < n) {
      this.input = new Float32Array(n)
      this.fadeOld = new Float32Array(n)
      this.fadeNew = new Float32Array(n)
      this.dryGains = []
      this.sendGains = []
      for (let g = 0; g < GROUPS; g++) {
        this.dryGains.push(new Float32Array(frames))
        this.sendGains.push(new Float32Array(frames))
      }
      this.dirty = 0
    }
    if (this.dirty > 0) this.input.fill(0, 0, this.dirty)
    this.dirty = 0
    this.sent = false
  }

  /**
   * Works out each group's gains for the block's frames [offset] until
   * [offset] + [frames] (output frame [at] at [offset]): read them with dry
   * and send.
   */
  gains(offset: number, frames: number, at: number): void {
    if (this.duckAt !== IDLE && at - this.duckAt >= this.duckLength) this.duckAt = IDLE
    const boost = this.punch.sendBoost()
    let live = boost > 0
    const sends = this.sends
    const sendsTo = this.sendsTo
    for (let g = 0; g < GROUPS; g++) {
      this.dryOn[g] = false
      this.sendOn[g] = false
      if (sends[g] !== 0 || sendsTo[g] !== 0) live = true
    }
    const ducking = this.dests !== 0 && this.duckAt !== IDLE
    if (!live && !ducking) return
    for (let i = 0; i < frames; i++) {
      const d = ducking ? this.duck(at + i) : 1
      for (let g = 0; g < GROUPS; g++) {
        const s0 = this.smooth(sends[g]!, sendsTo[g]!)
        sends[g] = s0
        const s = boost > s0 ? boost : s0
        const gd = ((this.dests >> g) & 1) !== 0 ? d : 1
        const dry = f(gd * this.dryLaw(s))
        const send = f(gd * s)
        this.dryGains[g]![offset + i] = dry
        this.sendGains[g]![offset + i] = send
        if (dry !== 1) this.dryOn[g] = true
        if (send !== 0) this.sendOn[g] = true
      }
    }
    for (let g = 0; g < GROUPS; g++) {
      if (this.sendOn[g]) {
        this.sent = true
        this.dirty = this.frames * 2
      }
    }
  }

  /** Group [bus]'s dry gains for the last gains, by block frame; null when they are all exactly 1. */
  dry(bus: number): Float32Array | null {
    return this.dryOn[bus] ? this.dryGains[bus]! : null
  }

  /** Group [bus]'s send gains for the last gains, by block frame; null when they are all exactly 0. */
  send(bus: number): Float32Array | null {
    return this.sendOn[bus] ? this.sendGains[bus]! : null
  }

  /**
   * The block's end, before the mixer's clip: the effect's return added to
   * [mix] ([frames] stereo frames), then the punch-ins, then the master
   * compressor. Each is skipped when it has nothing to do.
   */
  process(mix: Float32Array, frames: number): void {
    const x = this.fxX
    const y = this.fxY
    this.fxX = this.glide(this.fxX, this.fxXTo, frames)
    this.fxY = this.glide(this.fxY, this.fxYTo, frames)
    const cx = this.compX
    const cy = this.compY
    this.compX = this.glide(this.compX, this.compXTo, frames)
    this.compY = this.glide(this.compY, this.compYTo, frames)
    const effect = this.effects[this.type] ?? null
    if (this.fade > 0) {
      this.crossfade(mix, frames, effect, x, y)
    } else if (effect !== null && (this.sent || !effect.silent)) {
      effect.setParams(x, y, this.bpm)
      effect.process(this.input, mix, frames)
    }
    this.punch.record(mix, frames)
    if (this.punch.active) this.punch.process(mix, frames)
    if (this.compOn) {
      this.compressor.setParams(cx, cy, this.bpm)
      this.compressor.processInPlace(mix, frames)
    }
  }

  /** The old effect's return fading out under the new one's, by the frame; the old one reset once it is gone. */
  private crossfade(mix: Float32Array, frames: number, effect: Effect | null, x: number, y: number): void {
    const n = frames * 2
    const fadeOld = this.fadeOld
    const fadeNew = this.fadeNew
    fadeOld.fill(0, 0, n)
    fadeNew.fill(0, 0, n)
    const old = this.effects[this.oldType] ?? null
    old?.process(this.input, fadeOld, frames)
    if (effect !== null) {
      effect.setParams(x, y, this.bpm)
      effect.process(this.input, fadeNew, frames)
    }
    for (let i = 0; i < frames; i++) {
      let a = 0
      let b = 1
      if (this.fade > 0) {
        b = f((this.fadeFrames - this.fade) / this.fadeFrames)
        a = f(1 - b)
        this.fade--
      }
      mix[2 * i] = mix[2 * i]! + f(f(fadeOld[2 * i]! * a) + f(fadeNew[2 * i]! * b))
      mix[2 * i + 1] = mix[2 * i + 1]! + f(f(fadeOld[2 * i + 1]! * a) + f(fadeNew[2 * i + 1]! * b))
    }
    if (this.fade === 0) {
      old?.reset()
      this.oldType = FxControl.NONE
    }
  }

  /** The duck's gain at output frame [at] (before the sidechain's mask). */
  private duck(at: number): number {
    if (this.duckAt === IDLE) return 1
    const t = at - this.duckAt
    const dip = this.dip
    if (t < dip) return lerp(this.duckFrom, FxBus.DUCK_FLOOR, f(t / dip))
    if (t >= this.duckLength) return 1
    const u = f((t - dip) / (this.duckLength - dip))
    const v = f(1 - u)
    const fast = f(1 - f(f(v * v) * v))
    const slow = f(f(u * u) * u)
    return f(FxBus.DUCK_FLOOR + f(f(1 - FxBus.DUCK_FLOOR) * lerp(fast, slow, this.duckY)))
  }

  /** The duck's length in frames for an [x] of 0..1, longer than its dip. */
  private lengthOf(x: number): number {
    const ms = f(FxBus.DUCK_MS + f(FxBus.DUCK_MS_RANGE * x))
    return Math.max(this.dip + 1, Math.trunc(f(f(ms * this.outRate) / 1000)))
  }

  /** How much of the dry a group keeps at send [s], by the effect. */
  private dryLaw(s: number): number {
    switch (this.type) {
      case FxControl.DELAY:
      case FxControl.REVERB:
      case FxControl.CHORUS:
        return f(1 - f(f(0.3) * s))
      case FxControl.DISTORTION:
      case FxControl.FILTER:
      case FxControl.COMPRESSOR:
        return f(1 - s)
      default:
        return 1
    }
  }

  /**
   * One frame of the one-pole from [cur] toward [target], landing on it once
   * within SNAP, or once a step no longer moves it (in Float a slow one-pole
   * stalls short of its target, about 3e-5 off at 48 kHz).
   */
  private smooth(cur: number, target: number): number {
    const d = f(target - cur)
    if (Math.abs(d) < FxBus.SNAP) return target
    const next = f(cur + f(this.smoothK * d))
    return next === cur ? target : next
  }

  /** [frames] frames of smooth. */
  private glide(cur: number, target: number, frames: number): number {
    let c = cur
    for (let i = 0; i < frames; i++) {
      if (c === target) break
      c = this.smooth(c, target)
    }
    return c
  }
}
