// ChorusTest.kt's cases, on the web port.
import { describe, expect, it } from 'vitest'
import { Chorus } from '../../../../src/core/formats/fx/chorus'
import { Lcg } from '../../../../src/core/formats/fx/fxMath'
import { rate, run, sine } from './toneHelpers'

const f = Math.fround

const through = (input: Float32Array, x: number, y: number, fx = new Chorus(rate)) => run(input, fx, () => [x, y])

/** [frames] stereo frames of a 1 kHz sine (48 frames a cycle) at [level], both channels alike. */
const tone = (frames: number, level: number) => sine(1000, level, frames)

/** The most a channel differs from itself one cycle (48 frames) on, from frame [from]. */
function drift(out: Float32Array, from: number, channel = 0): number {
  let most = 0
  for (let i = from; i < out.length / 2 - 48; i++) most = Math.max(most, Math.abs(out[2 * (i + 48) + channel]! - out[2 * i + channel]!))
  return most
}

/** The most of the left channel's level from frame [from] until [to]. */
function peak(out: Float32Array, from: number, to: number): number {
  let most = 0
  for (let i = from; i < to; i++) most = Math.max(most, Math.abs(out[2 * i]!))
  return most
}

describe('Chorus', () => {
  it('moves its taps, so a steady tone comes back bent, not as a still comb', () => {
    const level = 10000
    const out = through(tone(96000, level), 0.6, 0.5)
    // A still delay of a steady tone repeats every cycle; a moving one does not.
    expect(drift(out, 4800)).toBeGreaterThan(0.05 * level)
    expect(drift(out, 4800, 1)).toBeGreaterThan(0.05 * level)
    // The two sides move a quarter of a cycle apart.
    let apart = 0
    for (let i = 4800; i < 96000; i++) apart = Math.max(apart, Math.abs(out[2 * i]! - out[2 * i + 1]!))
    expect(apart).toBeGreaterThan(0.05 * level)
    // Y = 0 still moves (a quarter of the swing), with less to it.
    const shallow = through(tone(96000, level), 0.6, 0)
    expect(drift(shallow, 4800)).toBeGreaterThan(0.01 * level)
    expect(drift(shallow, 4800)).toBeLessThan(drift(out, 4800))
  })

  it('moves its taps as fast as X says', () => {
    const level = 10000
    // Over a tenth of a second, a slow LFO hardly moves; a fast one goes through half a cycle.
    const slow = through(tone(9600, level), 0.1, 1)
    const fast = through(tone(9600, level), 1, 1)
    expect(drift(fast, 4800)).toBeGreaterThan(4 * drift(slow, 4800))
  })

  it('stays bounded at the most feedback', () => {
    const lcg = new Lcg(11)
    const noise = Float32Array.from({ length: 96000 * 2 }, () => f(f(f(lcg.unit() * 2) - 1) * 30000))
    const out = through(noise, 1, 1)
    // Fed back 0.7 of the taps' mean, the line holds at most 1 / 0.3 of the input.
    expect(out.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThan(30000 / 0.3)
    expect(out.every((v) => Number.isFinite(v))).toBe(true)
    // A steady tone settles: its last half second is no louder than the half second before.
    const ring = through(tone(96000, 10000), 1, 1)
    expect(peak(ring, 72000, 96000)).toBeLessThan(peak(ring, 48000, 72000) * 1.1)
  })

  it('is silent until it hears something, and again once that is gone', () => {
    const fx = new Chorus(rate)
    expect(fx.silent).toBe(true)
    fx.setParams(0.5, 1, 120)
    fx.process(tone(96, 10000), new Float32Array(192), 96)
    expect(fx.silent).toBe(false)
    const zeros = new Float32Array(192)
    let blocks = 0
    while (!fx.silent) {
      fx.setParams(0.5, 1, 120)
      fx.process(zeros, new Float32Array(192), 96)
      blocks++
      expect(blocks).toBeLessThan(10000)
    }
    // More than the line's length: its feedback rang on.
    expect(blocks).toBeGreaterThan(13)
    const out = new Float32Array(192)
    fx.process(zeros, out, 96)
    expect(out.every((v) => Math.abs(v) < 1e-6)).toBe(true)
    fx.process(tone(96, 10000), new Float32Array(192), 96)
    fx.reset()
    expect(fx.silent).toBe(true)
    fx.setParams(0.5, 1, 120)
    const o = new Float32Array(192)
    fx.process(zeros, o, 96)
    expect(o.every((v) => v === 0)).toBe(true)
  })
})
