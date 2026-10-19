// FilterTest.kt's cases, on the web port.
import { describe, expect, it } from 'vitest'
import { Filter } from '../../../../src/core/formats/fx/filter'
import { knobHz } from '../../../../src/core/formats/fx/fxMath'
import { maxStep, noise, rate, rms, run, sine } from './toneHelpers'

const f = Math.fround

const through = (input: Float32Array, x: number, y: number) => run(input, new Filter(rate), () => [x, y])

describe('Filter', () => {
  it('is a low-pass low on X, taking the highs away', () => {
    // X = 0.1: a cutoff of about 250 Hz.
    const high = sine(8000, 10000, 24000)
    const low = sine(50, 10000, 24000)
    expect(rms(through(high, 0.1, 0))).toBeLessThan(0.01 * rms(high))
    expect(rms(through(low, 0.1, 0))).toBeGreaterThan(0.9 * rms(low))
  })

  it('is a high-pass high on X, taking the lows away', () => {
    // X = 0.9: a cutoff of about 3.9 kHz.
    const low = sine(100, 10000, 24000)
    const high = sine(15000, 10000, 24000)
    expect(rms(through(low, 0.9, 0))).toBeLessThan(0.01 * rms(low))
    expect(rms(through(high, 0.9, 0))).toBeGreaterThan(0.9 * rms(high))
  })

  it('lets the input through untouched in the middle of X', () => {
    const input = noise(4800, 9, 30000)
    for (const x of [0.47, 0.5, 0.53]) {
      for (const y of [0, 0.5, 1]) expect(through(input, x, y), `x ${x}, y ${y}`).toEqual(input)
    }
  })

  it('raises the resonance at the cutoff with Y', () => {
    // At its own cutoff a filter's gain is about its Q: 0.5 at Y = 0, 8 at Y = 1.
    const hz = knobHz(f(f(0.2) / f(0.47)), 60, 20000)
    const tone = sine(hz, 1000, 24000)
    expect(rms(through(tone, 0.2, 0))).toBeLessThan(0.6 * rms(tone))
    expect(rms(through(tone, 0.2, 1))).toBeGreaterThan(6 * rms(tone))
  })

  it('fades from one mode to another instead of stepping', () => {
    const tone = sine(200, 10000, 19200)
    // A low-pass, straight over to a high-pass, to the middle, back to the low-pass (from silence),
    // and over to the high-pass again before that fade is over.
    const jumps = [0.1, 0.9, 0.5, 0.1, 0.9]
    // Then a slow sweep across the middle and back.
    const sweep = [
      ...Array.from({ length: 41 }, (_, i) => f(f(0.4) + f(i * f(0.005)))),
      ...Array.from({ length: 41 }, (_, i) => f(f(0.6) - f(i * f(0.005)))),
    ]
    for (const xs of [jumps, sweep]) {
      const out = run(tone, new Filter(rate), (b) => [xs[Math.min(Math.trunc(b / 4), xs.length - 1)]!, 0.3])
      // 200 Hz at 10000 moves at most 262 a frame; the low-pass to high-pass jump unfaded would be thousands.
      expect(maxStep(out), `${xs}`).toBeLessThan(400)
    }
  })

  it('is silent until it hears something, and again once that is gone', () => {
    const fx = new Filter(rate)
    expect(fx.silent).toBe(true)
    fx.setParams(f(0.2), 1, 120)
    fx.process(sine(300, 10000, 96), new Float32Array(192), 96)
    expect(fx.silent).toBe(false)
    let blocks = 0
    while (!fx.silent) {
      fx.process(new Float32Array(192), new Float32Array(192), 96)
      expect(++blocks).toBeLessThan(2000)
    }
    fx.setParams(0.5, 1, 120)
    fx.process(new Float32Array(192), new Float32Array(192), 96)
    expect(fx.silent).toBe(true)
    fx.process(sine(300, 10000, 96), new Float32Array(192), 96)
    fx.reset()
    expect(fx.silent).toBe(true)
  })
})
