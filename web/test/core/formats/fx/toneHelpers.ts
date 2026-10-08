// Shared by the effects' tests (distortion, filter, compressor, reverb, chorus, delay): signals and measures, as their Kotlin twins have them.
import type { Effect } from '../../../../src/core/formats/fx/fxBus'
import { Lcg } from '../../../../src/core/formats/fx/fxMath'

const f = Math.fround

export const rate = 48000

/** [frames] stereo frames of a sine at [hz] and [level], both channels alike. */
export function sine(hz: number, level: number, frames: number): Float32Array {
  return Float32Array.from({ length: frames * 2 }, (_, i) => level * Math.sin((2 * Math.PI * hz * Math.trunc(i / 2)) / rate))
}

/** [frames] stereo frames of noise at ±[level] (interleaved, each sample its own). */
export function noise(frames: number, seed: number, level: number): Float32Array {
  const lcg = new Lcg(seed)
  return Float32Array.from({ length: frames * 2 }, () => f(f(f(lcg.unit() * 2) - 1) * level))
}

/** [input] through [fx] in blocks of 96, the knobs from [knobs] (by block) set before each. */
export function run(input: Float32Array, fx: Effect, knobs: (block: number) => [number, number]): Float32Array {
  const out = new Float32Array(input.length)
  for (let at = 0, b = 0; at < input.length / 2; at += 96, b++) {
    const n = Math.min(96, input.length / 2 - at)
    const [x, y] = knobs(b)
    fx.setParams(f(x), f(y), 120)
    const o = new Float32Array(n * 2)
    fx.process(input.subarray(at * 2, (at + n) * 2), o, n)
    out.set(o, at * 2)
  }
  return out
}

/** The left channel's level at [hz] (Goertzel), past the first [skip] frames. */
export function level(out: Float32Array, hz: number, skip = 4800): number {
  let re = 0
  let im = 0
  const n = out.length / 2 - skip
  for (let i = 0; i < n; i++) {
    const w = (2 * Math.PI * hz * (i + skip)) / rate
    re += out[2 * (i + skip)]! * Math.cos(w)
    im += out[2 * (i + skip)]! * Math.sin(w)
  }
  return (2 * Math.sqrt(re * re + im * im)) / n
}

/** The RMS of both channels past the first [skip] frames. */
export function rms(out: Float32Array, skip = 4800): number {
  let sum = 0
  for (let i = skip * 2; i < out.length; i++) sum += out[i]! * out[i]!
  return Math.sqrt(sum / (out.length - skip * 2))
}

/** The biggest step of the left channel from one frame to the next. */
export function maxStep(out: Float32Array): number {
  let step = 0
  for (let i = 1; i < out.length / 2; i++) step = Math.max(step, Math.abs(out[2 * i]! - out[2 * i - 2]!))
  return step
}
