// PunchTest.kt's cases, on the web port.
import { describe, expect, it } from 'vitest'
import { Punch } from '../../../../src/core/formats/fx/punch'
import { noise, rate, sine } from './toneHelpers'

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

/**
 * [input] through [punch] in blocks of 96 as the bus plays it (recorded every block, processed while a
 * slot is active), [controls] called with each block's first frame before it.
 */
function play(input: Float32Array, controls: (p: Punch, at: number) => void, punch = new Punch(rate)): Float32Array {
  const out = input.slice()
  const frames = input.length / 2
  for (let at = 0; at < frames; at += 96) {
    const n = Math.min(96, frames - at)
    controls(punch, at)
    const block = out.subarray(at * 2, (at + n) * 2)
    punch.record(block, n)
    if (punch.active) punch.process(block, n)
  }
  return out
}

/** [slot] pressed at [depth] on the block starting at frame [press]. */
function pressAt(slot: number, depth: number, press = 0): (p: Punch, at: number) => void {
  return (p, at) => {
    if (at === press) p.set(slot, depth)
  }
}

/** [frames] stereo frames of [v] throughout. */
function steady(frames: number, v = 1000): Float32Array {
  return new Float32Array(frames * 2).fill(v)
}

/** How often the left channel crosses 0 going up between frames [from] and [to]. */
function crossings(out: Float32Array, from: number, to: number): number {
  let n = 0
  for (let i = from + 1; i < to; i++) if (out[2 * i - 2]! < 0 && out[2 * i]! >= 0) n++
  return n
}

/** The left channel's RMS between frames [from] and [to]. */
function rms(out: Float32Array, from: number, to: number): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += out[2 * i]! * out[2 * i]!
  return Math.sqrt(sum / (to - from))
}

/** The biggest step of the left channel from one frame to the next, between frames [from] and [to]. */
function maxStep(out: Float32Array, from: number, to: number): number {
  let step = 0
  for (let i = from + 1; i < to; i++) step = Math.max(step, Math.abs(out[2 * i]! - out[2 * i - 2]!))
  return step
}

/** The first frame from [from] until [to] whose left sample isn't [want] (by frame), or -1. */
function firstOff(out: Float32Array, from: number, to: number, want: (i: number) => number): number {
  for (let i = from; i < to; i++) if (out[2 * i] !== want(i)) return i
  return -1
}

describe('Punch', () => {
  it('leaves the mix alone with nothing held, bit for bit, and SEND_FX only raises the sends', () => {
    const input = noise(9600, 7, 20000)
    const punch = new Punch(rate)
    expect(punch.active).toBe(false)
    expect(play(input, () => {}, punch)).toEqual(input)
    // Called anyway: nothing.
    const block = input.slice()
    punch.process(block, 4800)
    expect(block).toEqual(input)
    // SEND_FX held: still nothing here.
    punch.set(SEND_FX, Math.fround(0.6))
    expect(punch.active).toBe(false)
    expect(punch.sendBoost()).toBe(Math.fround(0.6))
    punch.set(SEND_FX, 0)
    expect(punch.sendBoost()).toBe(0)
    // Out of range: ignored.
    punch.set(12, 1)
    punch.set(-1, 1)
    expect(punch.active).toBe(false)
    // Pressed and let go of before a block: nothing either.
    punch.set(LPF, 0.5)
    punch.set(LPF, 0)
    expect(punch.active).toBe(false)
    expect(play(input, () => {}, punch)).toEqual(input)
  })

  it('loops the last 16th before its press with BEAT_REPEAT at 120 BPM', () => {
    const input = noise(96000, 11, 10000)
    // Pressed at 0.5 s with depth 0.6 (the third quarter): a 16th, 6000 frames.
    const press = 24000
    const out = play(input, pressAt(BEAT_REPEAT, Math.fround(0.6), press))
    expect(firstOff(out, 0, press, (i) => input[2 * i]!)).toBe(-1)
    // Past its 5 ms fade in, the slice before the press, over and over.
    expect(firstOff(out, press + 240, 96000, (i) => input[2 * (press - 6000 + ((i - press) % 6000))]!)).toBe(-1)
    // The other quarters: a quarter, an eighth and a 32nd note.
    for (const [depth, period] of [
      [0.1, 24000],
      [0.3, 12000],
      [0.9, 3000],
    ] as const) {
      const o = play(input, pressAt(BEAT_REPEAT, Math.fround(depth), press))
      expect(firstOff(o, press + 240, 96000 - period, (i) => o[2 * (i + period)]!), `depth ${depth}`).toBe(-1)
    }
  })

  it('loops the last 20 to 80 ms before its press with STUTTER', () => {
    const input = noise(48000, 5, 10000)
    const press = 9600
    for (const [depth, period] of [
      [0.01, 988],
      [0.5, 2400],
      [1, 3840],
    ] as const) {
      const out = play(input, pressAt(STUTTER, Math.fround(depth), press))
      expect(firstOff(out, press + 240, 48000, (i) => input[2 * (press - period + ((i - press) % period))]!), `depth ${depth}`).toBe(-1)
    }
  })

  it('slows to a stop over its time with TAPE_STOP, then holds silence', () => {
    const input = sine(1000, 10000, 96000)
    // Depth 0.5: 1.5 - 0.6 = 0.9 s, 43200 frames.
    const press = 4800
    const out = play(input, pressAt(TAPE_STOP, 0.5, press))
    // It starts where the mix is, so there is no jump, then falls in pitch.
    expect(maxStep(out, press - 10, press + 2000)).toBeLessThan(1400)
    const early = crossings(out, press, press + 4800)
    const late = crossings(out, press + 28800, press + 33600)
    expect(early).toBeGreaterThanOrEqual(85)
    expect(early).toBeLessThanOrEqual(100)
    expect(late).toBeGreaterThanOrEqual(20)
    expect(late).toBeLessThanOrEqual(45)
    expect(rms(out, press + 38000, press + 43000)).toBeGreaterThan(100)
    for (let i = press + 43200; i < 96000; i++) {
      if (out[2 * i] !== 0 || out[2 * i + 1] !== 0) expect.fail(`frame ${i}`)
    }
  })

  it('gates each 16th with SLICE, open for less of it the deeper it goes', () => {
    const input = steady(48000)
    // 120 BPM: a 16th is 6000 frames; depth 0.5 leaves 0.6 of it open, 3600 frames, with 96-frame edges.
    const press = 960
    const out = play(input, pressAt(SLICE, 0.5, press))
    // From the second 16th (the first fades in): open, the edges ramping, then shut.
    for (let cycle = 1; cycle < 7; cycle++) {
      const at = press + cycle * 6000
      if (at + 6000 > 48000) break
      expect(Math.abs(out[2 * at]!)).toBeLessThan(0.5)
      expect(firstOff(out, at + 100, at + 3498, () => 1000)).toBe(-1)
      expect(firstOff(out, at + 3602, at + 5998, () => 0)).toBe(-1)
      expect(out[2 * (at + 48)]).toBeGreaterThan(400)
      expect(out[2 * (at + 48)]).toBeLessThan(600)
      expect(out[2 * (at + 3552)]).toBeGreaterThan(400)
      expect(out[2 * (at + 3552)]).toBeLessThan(600)
    }
    // Depth 1: open for a fifth.
    const deep = play(input, pressAt(SLICE, 1, press))
    expect(firstOff(deep, press + 1202, press + 5998, () => 0)).toBe(-1)
    expect(deep[2 * (press + 600)]).toBe(1000)
  })

  it('takes the top off with LPF and the bottom with HPF', () => {
    const high = sine(5000, 10000, 24000)
    const low = sine(100, 10000, 24000)
    // LPF at depth 0.8: about 240 Hz.
    const d8 = Math.fround(0.8)
    expect(rms(play(high, pressAt(LPF, d8)), 4800, 24000)).toBeLessThan(0.01 * rms(high, 4800, 24000))
    expect(rms(play(low, pressAt(LPF, d8)), 4800, 24000)).toBeGreaterThan(0.9 * rms(low, 4800, 24000))
    // HPF at depth 0.6: about 1300 Hz.
    const d6 = Math.fround(0.6)
    expect(rms(play(low, pressAt(HPF, d6)), 4800, 24000)).toBeLessThan(0.01 * rms(low, 4800, 24000))
    expect(rms(play(high, pressAt(HPF, d6)), 4800, 24000)).toBeGreaterThan(0.9 * rms(high, 4800, 24000))
    // Barely pressed, the low-pass is near 20 kHz (held to 0.4 of the rate): the 5 kHz tone passes.
    expect(rms(play(high, pressAt(LPF, Math.fround(0.01))), 4800, 24000)).toBeGreaterThan(0.95 * rms(high, 4800, 24000))
  })

  it('sweeps a band-pass once a beat with FILTER_LFO, and swells each 16th with TREMOLO', () => {
    const tone = sine(1500, 10000, 72000)
    const out = play(tone, pressAt(FILTER_LFO, Math.fround(0.6)))
    // 1.5 kHz rings out as the band sweeps over it, and hardly passes at the sweep's bottom (each
    // beat's start), the same each beat.
    const levels = Array.from({ length: 50 }, (_, b) => rms(out, 24000 + b * 480, 24000 + (b + 1) * 480))
    expect(Math.max(...levels)).toBeGreaterThan(10 * Math.min(...levels))
    expect(levels[0]).toBeLessThan(0.2 * Math.max(...levels))
    for (let i = 24000; i < 48000; i++) {
      if (Math.abs(out[2 * i]! - out[2 * (i + 24000)]!) > 100) expect.fail(`frame ${i}`)
    }
    const trem = play(steady(24000), pressAt(TREMOLO, Math.fround(0.7)))
    let lo = 1000
    for (let i = 240; i < 24000; i++) {
      if (trem[2 * i]! > 1000 || trem[2 * i]! < 299) expect.fail(`frame ${i}`)
      lo = Math.min(lo, trem[2 * i]!)
    }
    expect(lo).toBeLessThan(310)
    // A cycle a 16th: the same 6000 frames on.
    for (let i = 240; i < 18000; i++) {
      if (Math.abs(trem[2 * i]! - trem[2 * (i + 6000)]!) > 1) expect.fail(`frame ${i}`)
    }
  })

  it('holds samples and truncates them to fewer bits with DECIMATOR', () => {
    const input = noise(9600, 3, 20000)
    // Depth 0.5: every 8th sample held, 6 bits off (multiples of 64).
    const out = play(input, pressAt(DECIMATOR, 0.5))
    expect(firstOff(out, 240, 9600, (i) => Math.trunc(input[2 * (i - (i % 8))]! / 64) * 64)).toBe(-1)
    // Depth 1: every 16th, 12 bits off.
    const deep = play(input, pressAt(DECIMATOR, 1))
    expect(firstOff(deep, 240, 9600, (i) => Math.trunc(input[2 * (i - (i % 16))]! / 4096) * 4096)).toBe(-1)
  })

  it('halves the pitch with OCTAVE_DOWN, mixed in by its depth', () => {
    const tone = sine(400, 10000, 48000)
    const out = play(tone, pressAt(OCTAVE_DOWN, 1))
    // 0.9 s of 400 Hz: 360 crossings; an octave down, 180.
    const ups = crossings(out, 4800, 48000)
    expect(ups).toBeGreaterThanOrEqual(165)
    expect(ups).toBeLessThanOrEqual(195)
    expect(rms(out, 4800, 48000)).toBeGreaterThan(0.5 * rms(tone, 4800, 48000))
    // Half: both at once.
    const dry = rms(tone, 4800, 48000)
    const half = rms(play(tone, pressAt(OCTAVE_DOWN, 0.5)), 4800, 48000)
    expect(half).toBeGreaterThan(0.4 * dry)
    expect(half).toBeLessThan(1.2 * dry)
  })

  it('moves the pitch each beat with PITCH_RANDOM, the same way each time', () => {
    const tone = sine(400, 10000, 144000)
    const out = play(tone, pressAt(PITCH_RANDOM, 1))
    expect(play(tone, pressAt(PITCH_RANDOM, 1))).toEqual(out)
    // Each beat (24000 frames) its own step, none of them the tone's own pitch (160 crossings in 0.4 s).
    const rates = Array.from({ length: 6 }, (_, b) => crossings(out, b * 24000 + 2400, b * 24000 + 21600))
    for (const r of rates) expect(Math.abs(r - 160), `${rates}`).toBeGreaterThan(4)
    expect(new Set(rates).size).toBeGreaterThanOrEqual(3)
    // At depth 0: a semitone up or down. (A pure tone's pitch through 50 ms grains lands on a multiple
    // of 40 Hz, the half window's rate: 360 or 440 Hz here, 144 or 176 crossings.)
    const near = play(tone, pressAt(PITCH_RANDOM, Math.fround(0.01)))
    for (let b = 0; b < 6; b++) {
      const r = Math.abs(crossings(near, b * 24000 + 2400, b * 24000 + 21600) - 160)
      expect(r, `beat ${b}`).toBeGreaterThanOrEqual(4)
      expect(r, `beat ${b}`).toBeLessThanOrEqual(20)
    }
  })

  it('crossfades back without a step when a slot is let go of, and stops', () => {
    const tone = sine(200, 10000, 48000)
    const punch = new Punch(rate)
    // Stopped, then let go of: back from silence to the tone over 5 ms.
    const out = play(
      tone,
      (p, at) => {
        if (at === 0) p.set(TAPE_STOP, 1)
        if (at === 24000) p.set(TAPE_STOP, 0)
      },
      punch,
    )
    expect(firstOff(out, 14400, 24000, () => 0)).toBe(-1)
    // The tone moves up to 262 a frame; the fade adds a 240th of the level.
    expect(maxStep(out, 23900, 24400)).toBeLessThan(320)
    expect(firstOff(out, 24240, 48000, (i) => tone[2 * i]!)).toBe(-1)
    expect(punch.active).toBe(false)
    // A loop let go of, the same.
    const loop = play(tone, (p, at) => {
      if (at === 9600) p.set(BEAT_REPEAT, 1)
      if (at === 19200) p.set(BEAT_REPEAT, 0)
    })
    expect(maxStep(loop, 19100, 19600)).toBeLessThan(320)
    expect(firstOff(loop, 19440, 48000, (i) => tone[2 * i]!)).toBe(-1)
  })

  it('combines slots, the replays first', () => {
    const input = noise(48000, 21, 10000)
    const press = 9600
    // The repeat's loop, gated by the slice: where the gate is shut, silence; where it is open, the loop.
    const out = play(input, (p, at) => {
      if (at === press) {
        p.set(BEAT_REPEAT, Math.fround(0.6))
        p.set(SLICE, 0.5)
      }
    })
    expect(firstOff(out, press + 240, press + 3498, (i) => input[2 * (press - 6000 + (i - press))]!)).toBe(-1)
    for (let i = press + 3602; i < press + 5998; i++) if (out[2 * i] !== 0) expect.fail(`frame ${i}`)
    // Reset: every slot let go of at once.
    const punch = new Punch(rate)
    punch.set(LPF, 1)
    punch.set(SEND_FX, 1)
    expect(punch.active).toBe(true)
    punch.reset()
    expect(punch.active).toBe(false)
    expect(punch.sendBoost()).toBe(0)
  })
})
