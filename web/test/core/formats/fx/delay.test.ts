// DelayTest.kt's cases, on the web port.
import { describe, expect, it } from 'vitest'
import { Delay } from '../../../../src/core/formats/fx/delay'
import { maxStep, rate, sine } from './toneHelpers'

const f = Math.fround

/** [input] through [fx] in blocks of 96, the knobs from [knobs] (by block) set before each, at [bpm]. */
function through(input: Float32Array, knobs: (block: number) => [number, number], bpm = 120, fx = new Delay(rate)): Float32Array {
  const out = new Float32Array(input.length)
  for (let at = 0, b = 0; at < input.length / 2; at += 96, b++) {
    const n = Math.min(96, input.length / 2 - at)
    const [x, y] = knobs(b)
    fx.setParams(f(x), f(y), f(bpm))
    const o = new Float32Array(n * 2)
    fx.process(input.subarray(at * 2, (at + n) * 2), o, n)
    out.set(o, at * 2)
  }
  return out
}

/** [frames] stereo frames of silence with a click of [level] on both channels at frame 0. */
function click(frames: number, level = 1000): Float32Array {
  const pcm = new Float32Array(frames * 2)
  pcm[0] = level
  pcm[1] = level
  return pcm
}

/** The left channel's samples from frame [from] until [to], summed. */
function sum(out: Float32Array, from: number, to: number): number {
  let s = 0
  for (let i = from; i < to; i++) s += out[2 * i]!
  return s
}

/** The first frame after 0 whose left sample is not 0. */
function firstEcho(out: Float32Array): number {
  for (let i = 1; i < out.length / 2; i++) if (out[2 * i] !== 0) return i
  return -1
}

describe('Delay', () => {
  it('echoes a click 12000 frames on for an eighth at 120 BPM, each repeat fed back by Y', () => {
    // X = 0.45 is the sixth division, an eighth: a quarter of a second at 120 BPM.
    const out = through(click(80000), () => [0.45, 0.5])
    expect(firstEcho(out)).toBe(12000)
    // The first echo is the click as it was, on both sides.
    expect(out[24000]).toBe(1000)
    expect(out[24001]).toBe(1000)
    for (let i = 12001; i < 24000; i++) expect(out[2 * i]).toBe(0)
    // The next ones are fed back by 0.475 (0.95 Y) through the low-pass, which smears them a little
    // but keeps their sum (its gain at 0 Hz is 1).
    expect(Math.abs(sum(out, 23990, 24300) - 475)).toBeLessThan(1)
    expect(Math.abs(sum(out, 35990, 36400) - 475 * 0.475)).toBeLessThan(1)
    expect(out[2 * 24000]).toBeLessThan(475)
    // Y = 0: a single echo.
    const once = through(click(40000), () => [0.45, 0])
    expect(once[24000]).toBe(1000)
    for (let i = 12001; i < 40000; i++) expect(once[2 * i]).toBe(0)
  })

  it('picks one of twelve divisions of the beat with X, held to 2 seconds', () => {
    // At 120 BPM a 24th of a beat is 1000 frames.
    const ticks = [3, 4, 6, 8, 9, 12, 16, 18, 24, 32, 36, 48]
    ticks.forEach((t, d) => {
      const out = through(click(t * 1000 + 10), () => [(d + 0.5) / 12, 0])
      expect(firstEcho(out), `division ${d}`).toBe(t * 1000)
    })
    // A half note at 20 BPM is 6 seconds: held to 2.
    expect(firstEcho(through(click(96010), () => [1, 0], 20))).toBe(96000)
  })

  it('glides to a new length rather than jumping', () => {
    const level = 10000
    const tone = sine(200, level, 96000)
    // An eighth for half a second, then a quarter: the read head moves 12000 frames over 60 ms.
    const out = through(tone, (b) => [b < 250 ? 0.45 : 0.7, 0.3])
    // The sine moves at most 262 a frame; the glide reads up to 5 times as fast (a fifth of that
    // again from the feedback); a jump would step by up to twice the level.
    expect(maxStep(out.subarray(2 * 23999))).toBeLessThan(0.25 * level)
    // Once there, it echoes at the new length: the tone (no feedback below) a quarter of a second back.
    const plain = through(tone, (b) => [b < 250 ? 0.45 : 0.7, 0])
    for (let i = 80000; i < 96000; i++) expect(plain[2 * i]).toBe(tone[2 * (i - 24000)])
  })

  it('is silent until it hears something, and only once its echoes are gone', () => {
    const fx = new Delay(rate)
    expect(fx.silent).toBe(true)
    // The shortest length (300 BPM, 1/32: 1200 frames), the most feedback.
    fx.setParams(0, 1, 300)
    fx.process(click(96), new Float32Array(192), 96)
    expect(fx.silent).toBe(false)
    const zeros = new Float32Array(192)
    // Nothing comes out until the first echo, but it is not silent.
    for (let b = 0; b < 10; b++) {
      const out = new Float32Array(192)
      fx.process(zeros, out, 96)
      expect(out.every((v) => v === 0)).toBe(true)
      expect(fx.silent).toBe(false)
    }
    let blocks = 0
    while (!fx.silent) {
      fx.setParams(0, 1, 300)
      fx.process(zeros, new Float32Array(192), 96)
      blocks++
      expect(blocks).toBeLessThan(20000)
    }
    // 0.95 a repeat (less through the low-pass) down from 1000 to below 1e-6, and a line's length after.
    expect(blocks).toBeGreaterThan(1000)
    const out = new Float32Array(192)
    fx.process(zeros, out, 96)
    expect(out.every((v) => Math.abs(v) < 1e-6)).toBe(true)
    // Reset: from silence.
    fx.process(click(96), new Float32Array(192), 96)
    fx.reset()
    expect(fx.silent).toBe(true)
    fx.setParams(0, 1, 300)
    for (let b = 0; b < 30; b++) {
      const o = new Float32Array(192)
      fx.process(zeros, o, 96)
      expect(o.every((v) => v === 0)).toBe(true)
    }
  })
})
