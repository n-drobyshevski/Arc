// ReverbTest.kt's cases, on the web port.
import { describe, expect, it } from 'vitest'
import { Lcg } from '../../../../src/core/formats/fx/fxMath'
import { Reverb } from '../../../../src/core/formats/fx/reverb'
import { rate, run } from './toneHelpers'

const f = Math.fround

const through = (input: Float32Array, x: number, y: number, fx = new Reverb(rate)) => run(input, fx, () => [x, y])

/** A tenth of a second of noise at ±16000 (each channel its own), then silence until [frames]. */
function burst(frames: number, seed = 7): Float32Array {
  const lcg = new Lcg(seed)
  return Float32Array.from({ length: frames * 2 }, (_, i) => (i < 9600 ? f(f(f(lcg.unit() * 2) - 1) * 16000) : 0))
}

/** The RMS of both channels from frame [from] until [to]. */
function rms(out: Float32Array, from: number, to: number): number {
  let sum = 0
  for (let i = from * 2; i < to * 2; i++) sum += out[i]! * out[i]!
  return Math.sqrt(sum / ((to - from) * 2))
}

/** How much top end the left channel has from [from] until [to]: the RMS of its step a frame, over its RMS. */
function brightness(out: Float32Array, from: number, to: number): number {
  let sum = 0
  let level = 0
  for (let i = from; i < to; i++) {
    const d = out[2 * i]! - out[2 * i - 2]!
    sum += d * d
    level += out[2 * i]! * out[2 * i]!
  }
  return Math.sqrt(sum / level)
}

describe('Reverb', () => {
  it('rings longer the larger X is', () => {
    const input = burst(96000)
    // Half a second to a second after the burst.
    const tail = (x: number) => rms(through(input, x, 0.5), 33600, 57600)
    const small = tail(0)
    const mid = tail(0.5)
    const large = tail(1)
    expect(mid).toBeGreaterThan(3 * small)
    expect(large).toBeGreaterThan(3 * mid)
    // While the burst plays, it is a reverb of about the level it is fed.
    const playing = rms(through(input, 0.5, 0.5), 4800, 9600)
    expect(playing).toBeGreaterThan(1000)
    expect(playing).toBeLessThan(16000)
  })

  it('darkens the tail with Y below the middle and brightens it above', () => {
    const input = burst(48000)
    const tone = (y: number) => brightness(through(input, 0.6, y), 14400, 33600)
    const dark = tone(0)
    const open = tone(0.5)
    const bright = tone(1)
    expect(dark).toBeLessThan(0.6 * open)
    expect(bright).toBeGreaterThan(1.15 * open)
  })

  it('differs between the two sides', () => {
    const out = through(burst(48000), 0.5, 0.5)
    let same = 0
    let all = 0
    for (let i = 9600; i < 48000; i++) {
      const d = out[2 * i]! - out[2 * i + 1]!
      same += d * d
      all += out[2 * i]! * out[2 * i]!
    }
    expect(same).toBeGreaterThan(0.5 * all)
  })

  it('is silent until it hears something, and again once its tail is gone', () => {
    const fx = new Reverb(rate)
    expect(fx.silent).toBe(true)
    fx.setParams(1, 0.5, 120)
    fx.process(burst(96), new Float32Array(192), 96)
    expect(fx.silent).toBe(false)
    const zeros = new Float32Array(192)
    let blocks = 0
    while (!fx.silent) {
      fx.setParams(1, 0.5, 120)
      fx.process(zeros, new Float32Array(192), 96)
      blocks++
      expect(blocks).toBeLessThan(100000)
    }
    // The longest size rings for a while: more than a second.
    expect(blocks).toBeGreaterThan(500)
    const out = new Float32Array(192)
    fx.process(zeros, out, 96)
    expect(out.every((v) => Math.abs(v) < 1e-5)).toBe(true)
    // Reset: from silence.
    fx.process(burst(96), new Float32Array(192), 96)
    fx.reset()
    expect(fx.silent).toBe(true)
    fx.setParams(0.5, 0.5, 120)
    for (let b = 0; b < 100; b++) {
      const o = new Float32Array(192)
      fx.process(zeros, o, 96)
      expect(o.every((v) => v === 0)).toBe(true)
    }
  })

  it('scales its lines to the rate, even a slow one', () => {
    // At 1000 Hz the lines are a few frames long: it still rings and dies away.
    const input = new Float32Array(4000)
    input[0] = 10000
    const out = through(input, 0.5, 0.5, new Reverb(1000))
    expect(rms(out, 0, 200)).toBeGreaterThan(1)
    expect(out.every((v) => Number.isFinite(v))).toBe(true)
  })
})
