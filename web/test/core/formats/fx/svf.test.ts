// SvfTest.kt's cases, on the web port.
import { describe, expect, it } from 'vitest'
import { Lcg } from '../../../../src/core/formats/fx/fxMath'
import { Svf } from '../../../../src/core/formats/fx/svf'

const f = Math.fround
const rate = 48000

/** The RMS of [out] past its first [skip] samples (the filter settling). */
function rms(out: Float32Array, skip: number): number {
  let sum = 0
  for (let i = skip; i < out.length; i++) sum += out[i]! * out[i]!
  return Math.sqrt(sum / (out.length - skip))
}

function tuned(hz: number, q: number): Svf {
  const svf = new Svf()
  svf.tune(f(hz), f(q), rate)
  return svf
}

function run(svf: Svf, input: Float32Array, pick: (s: Svf) => number): Float32Array {
  return input.map((x) => {
    svf.process(x)
    return pick(svf)
  })
}

function noise(n: number, seed: number, scale = 1): Float32Array {
  const lcg = new Lcg(seed)
  return Float32Array.from({ length: n }, () => f(f(f(lcg.unit() * 2) - 1) * scale))
}

describe('Svf', () => {
  it('takes out what is far above its low-pass cutoff', () => {
    // A square at the Nyquist rate, and noise, through a 500 Hz low-pass.
    const square = Float32Array.from({ length: 4800 }, (_, i) => (i % 2 === 0 ? 1 : -1))
    expect(rms(run(tuned(500, 0.707), square, (s) => s.lp), 480)).toBeLessThan(1e-3)
    const white = noise(48000, 133)
    // White noise keeps about sqrt(500 / 24000) of itself under 500 Hz: well under a quarter.
    expect(rms(run(tuned(500, 0.707), white, (s) => s.lp), 480)).toBeLessThan(0.25 * rms(white, 0))
    // Its high-pass keeps the square whole.
    expect(rms(run(tuned(500, 0.707), square, (s) => s.hp), 480)).toBeCloseTo(1, 2)
  })

  it('takes out DC with the high-pass and keeps it with the low-pass', () => {
    const dc = new Float32Array(9600).fill(1)
    expect(Math.abs(run(tuned(100, 0.707), dc, (s) => s.hp).at(-1)!)).toBeLessThan(1e-4)
    expect(run(tuned(100, 0.707), dc, (s) => s.lp).at(-1)!).toBeCloseTo(1, 4)
    expect(Math.abs(run(tuned(100, 0.707), dc, (s) => s.bp).at(-1)!)).toBeLessThan(1e-4)
  })

  it('rings at Q 8 near the cutoff cap but stays bounded', () => {
    const loud = noise(96000, 7, 32768)
    for (const hz of [0.39 * rate, 0.4 * rate, 30000, 20]) {
      const svf = tuned(hz, 8)
      let peak = 0
      for (const x of loud) {
        svf.process(x)
        for (const v of [svf.lp, svf.bp, svf.hp]) {
          expect(Number.isFinite(v)).toBe(true)
          peak = Math.max(peak, Math.abs(v))
        }
      }
      // Q 8 rings at most about Q times the input at the cutoff.
      expect(peak, `${hz} Hz`).toBeLessThan(32768 * 40)
    }
  })

  it('lets a tail die to exactly zero, and reset silences it at once', () => {
    const svf = tuned(1000, 8)
    svf.process(32768)
    for (let i = 0; i < rate * 4; i++) svf.process(0)
    expect([svf.lp, svf.bp, svf.hp]).toEqual([0, 0, 0])
    svf.process(1000)
    svf.reset()
    svf.process(0)
    expect([svf.lp, svf.hp]).toEqual([0, 0])
  })

  it('keeps its state when retuned, so a sweep does not click', () => {
    const svf = tuned(200, 0.707)
    for (let i = 0; i < 4800; i++) svf.process(1)
    const before = svf.lp
    svf.tune(5000, f(0.707), rate)
    svf.process(1)
    expect(Math.abs(svf.lp - before)).toBeLessThan(1e-3)
  })
})
