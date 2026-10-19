// CompressorTest.kt's cases, on the web port.
import { describe, expect, it } from 'vitest'
import { Compressor } from '../../../../src/core/formats/fx/compressor'
import { noise, rate } from './toneHelpers'

/** [input] through [fx] in blocks of 96 at [x], [y]: added to silence, or in place. */
function through(input: Float32Array, x: number, y: number, inPlace = false, fx = new Compressor(rate)): Float32Array {
  const out = new Float32Array(input.length)
  for (let at = 0; at < input.length / 2; at += 96) {
    const n = Math.min(96, input.length / 2 - at)
    fx.setParams(Math.fround(x), Math.fround(y), 120)
    const i = input.slice(at * 2, (at + n) * 2)
    if (inPlace) {
      fx.processInPlace(i, n)
      out.set(i, at * 2)
    } else {
      const o = new Float32Array(n * 2)
      fx.process(i, o, n)
      out.set(o, at * 2)
    }
  }
  return out
}

describe('Compressor', () => {
  it('leaves the level alone below the threshold and pulls it down 4 to 1 above it', () => {
    // No drive: 1x in, 1x made up.
    const quiet = Float32Array.from({ length: 96000 }, (_, i) => (i % 2 === 0 ? 2000 : -2000))
    expect(through(quiet, 0, 0)).toEqual(quiet)
    const out = through(new Float32Array(96000).fill(20000), 0, 0)
    // Settled: the threshold plus a quarter of the way above it (in dB).
    const expected = Compressor.THRESHOLD * (20000 / Compressor.THRESHOLD) ** 0.25
    expect(Math.abs(out.at(-1)! - expected)).toBeLessThan(expected * 0.01)
    expect(out.at(-1)!).toBeLessThan(0.35 * 20000)
  })

  it('pushes harder with the drive, and makes up for it below the threshold', () => {
    // X = 1: 8x in, 1/sqrt(8) out, so what stays below comes up by sqrt(8).
    expect(through(new Float32Array(9600).fill(300), 1, 0.5).at(-1)!).toBeCloseTo(300 * Math.sqrt(8), 2)
    // A level that was below the threshold is driven over it.
    expect(through(new Float32Array(96000).fill(3000), 1, 0).at(-1)!).toBeLessThan(3000 * Math.sqrt(8) * 0.8)
  })

  it('picks the attack and release by its speed, fast pulling a sudden peak down sooner', () => {
    const step = Float32Array.from({ length: 96000 }, (_, i) => (i < 9600 ? 0 : 20000))
    const settle = (y: number) => {
      const out = through(step, 0, y)
      // Frames from the step until it is down 6 dB.
      for (let i = 4800; i < 48000; i++) if (out[2 * i]! < 10000) return i - 4800
      return Number.MAX_SAFE_INTEGER
    }
    const fast = settle(0)
    expect(fast).toBeLessThan(48)
    expect(settle(0.99)).toBeGreaterThan(5 * fast)
    // And the release: once the peak has gone, fast lets go sooner.
    const burst = Float32Array.from({ length: 96000 }, (_, i) => (i < 24000 ? 20000 : 2000))
    const recover = (y: number) => {
      const out = through(burst, 0, y)
      for (let i = 12000; i < 48000; i++) if (out[2 * i]! > 1900) return i - 12000
      return Number.MAX_SAFE_INTEGER
    }
    expect(recover(0) * 5).toBeLessThan(recover(0.99))
  })

  it('compresses the master in place as the effect adds', () => {
    const input = noise(24000, 11, 30000)
    expect(through(input, 0.7, 0.3, true)).toEqual(through(input, 0.7, 0.3))
  })

  it('is silent once its input is, and it has let go', () => {
    const fx = new Compressor(rate)
    expect(fx.silent).toBe(true)
    fx.setParams(0, 0, 120)
    fx.process(new Float32Array(192).fill(20000), new Float32Array(192), 96)
    expect(fx.silent).toBe(false)
    // Its input gone, it returns nothing, but it is not silent until the envelope is below the threshold.
    const out = new Float32Array(192)
    fx.process(new Float32Array(192), out, 96)
    expect(out.every((v) => v === 0)).toBe(true)
    let blocks = 0
    while (!fx.silent) {
      fx.process(new Float32Array(192), new Float32Array(192), 96)
      blocks++
    }
    expect(blocks).toBeGreaterThanOrEqual(1)
    expect(blocks).toBeLessThanOrEqual(100)
    fx.process(new Float32Array(192).fill(20000), new Float32Array(192), 96)
    fx.reset()
    expect(fx.silent).toBe(true)
  })
})
