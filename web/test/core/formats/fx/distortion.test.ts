// DistortionTest.kt's cases, on the web port.
import { describe, expect, it } from 'vitest'
import { Distortion } from '../../../../src/core/formats/fx/distortion'
import { softClip } from '../../../../src/core/formats/fx/fxMath'
import { level, maxStep, noise, rate, rms, run, sine } from './toneHelpers'

const f = Math.fround

const through = (input: Float32Array, x: number, y: number) => run(input, new Distortion(rate), () => [x, y])

/** The RMS of the left channel's step from one frame to the next: how much top end there is. */
function edge(out: Float32Array, skip = 4800): number {
  let sum = 0
  for (let i = skip + 1; i < out.length / 2; i++) {
    const d = out[2 * i]! - out[2 * i - 2]!
    sum += d * d
  }
  return Math.sqrt(sum / (out.length / 2 - skip - 1))
}

describe('Distortion', () => {
  it('raises the odd harmonics with more drive, and only those', () => {
    // 1 kHz at about -6 dB: the drive bends it into a square's odd harmonics.
    const tone = sine(1000, 16000, 48000)
    const soft = through(tone, 0, 0.5)
    const hard = through(tone, 1, 0.5)
    const third = (out: Float32Array) => level(out, 3000) / level(out, 1000)
    expect(third(hard)).toBeGreaterThan(0.2)
    expect(third(hard)).toBeGreaterThan(5 * third(soft))
    expect(level(hard, 5000) / level(hard, 1000)).toBeGreaterThan(0.05)
    // The clip is the same both ways round: no even harmonics.
    expect(level(hard, 2000) / level(hard, 1000)).toBeLessThan(1e-3)
  })

  it('clips the peaks of a hard drive and makes it up by its square root', () => {
    const hard = through(sine(440, 32000, 48000), 1, 0.5)
    const peak = hard.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    // The clip's ceiling is full scale over sqrt(40); a sine's peak is sqrt(2) its RMS, a square's 1.
    expect(peak).toBeLessThanOrEqual(32768 / Math.sqrt(40) + 1)
    expect(peak / rms(hard)).toBeLessThan(1.15)
  })

  it('is the clip alone, exactly, in the middle of Y', () => {
    const input = noise(4800, 3, 16000)
    const out = through(input, 0, 0.5)
    for (let i = 0; i < input.length; i++) expect(out[i]).toBe(f(softClip(f(input[i]! * f(1 / 32768))) * 32768))
  })

  it('colours the clip with Y, a low-pass below the middle and a high-pass above it', () => {
    // Noise loses its top end below the middle.
    const input = noise(48000, 5, 16000)
    const tilt = (out: Float32Array) => edge(out) / rms(out)
    expect(tilt(through(input, 0.3, 0))).toBeLessThan(0.2 * tilt(through(input, 0.3, 0.5)))
    // A high tone goes through the high-pass, not the low-pass; a low one the other way round.
    const high = sine(9000, 8000, 48000)
    expect(level(through(high, 0, 1), 9000)).toBeGreaterThan(0.7 * 8000)
    expect(level(through(high, 0, 0), 9000)).toBeLessThan(0.05 * 8000)
    const low = sine(80, 8000, 48000)
    expect(level(through(low, 0, 0), 80)).toBeGreaterThan(0.7 * 8000)
    expect(level(through(low, 0, 1), 80)).toBeLessThan(0.05 * 8000)
  })

  it('glides a knob that moves, and does not click crossing the middle', () => {
    // Y back and forth across the middle, X from one end to the other, a block at a time.
    let y = f(0.35)
    const out = run(sine(200, 12000, 9600), new Distortion(rate), (b) => {
      y = b % 20 < 10 ? f(y + f(0.03)) : f(y - f(0.03))
      return [b % 10 < 5 ? 0 : 1, y]
    })
    // A 200 Hz sine at 12000 moves at most 314 a frame, sqrt(40) times that clipped at the hardest
    // drive (about 2000); a drive jumping from 1 to 40 at once would step by over 6000.
    expect(maxStep(out)).toBeLessThan(3000)
  })

  it('is silent until it hears something, and again once that is gone', () => {
    const fx = new Distortion(rate)
    expect(fx.silent).toBe(true)
    fx.setParams(0.5, 0, 120)
    fx.process(noise(96, 1, 16000), new Float32Array(192), 96)
    expect(fx.silent).toBe(false)
    let blocks = 0
    while (!fx.silent) {
      fx.process(new Float32Array(192), new Float32Array(192), 96)
      expect(++blocks).toBeLessThan(1000)
    }
    fx.process(noise(96, 2, 16000), new Float32Array(192), 96)
    fx.reset()
    expect(fx.silent).toBe(true)
  })
})
