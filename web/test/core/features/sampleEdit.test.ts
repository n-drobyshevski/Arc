// Port of core/src/test/kotlin/dev/arc/ep133/features/SampleEditTest.kt
//
// Web delta: assertEquals with a tolerance is toBeCloseTo; Kotlin Float
// expectations go through Math.fround.
import { describe, expect, it } from 'vitest'
import {
  applyGain,
  cut,
  frames,
  leadingSilence,
  MAX_NORMALIZE_DB,
  normalizeGain,
  peaks,
  toMono,
  toWavBytes,
} from '../../../src/core/features/sampleEdit'
import { peaks as trimPeaks } from '../../../src/core/features/sampleTrim'
import { decodeWav, encodeWav } from '../../../src/core/formats/wav'

const pcm = (...s: number[]): Int16Array => Int16Array.from(s)
const f = Math.fround

describe('SampleEditTest', () => {
  it('normalizing brings the loudest sample to full scale', () => {
    // A take peaking at half scale is doubled, near enough.
    const half = pcm(0, 8000, -16384, 4000)
    expect(normalizeGain(half, 1, 0, 4)).toBe(f(32767 / 16384))
    expect(normalizeGain(half, 1, 0, 4)).toBeCloseTo(2, 3)
    // Only the range counts, clamped to the audio, across both channels.
    expect(normalizeGain(half, 1, 0, 2)).toBe(f(32767 / 8000))
    expect(normalizeGain(half, 2, -5, 99)).toBe(f(32767 / 16384))
    expect(normalizeGain(pcm(10, 20, 4000, -100), 2, 1, 2)).toBe(f(32767 / 4000))
    // A full-scale negative sample is turned down a hair to fit.
    expect(normalizeGain(pcm(-32768), 1, 0, 1)).toBeLessThan(1)
  })

  it('normalizing raises at most 24 dB, and leaves silence alone', () => {
    expect(MAX_NORMALIZE_DB).toBe(24)
    const quiet = pcm(0, 100, -50)
    expect(normalizeGain(quiet, 1, 0, 3)).toBeCloseTo(15.8489, 4)
    expect(20 * Math.log10(normalizeGain(quiet, 1, 0, 3))).toBeCloseTo(24, 4)
    expect(normalizeGain(pcm(0, 0, 0, 0), 2, 0, 2)).toBe(1)
    expect(normalizeGain(pcm(1000, 1000), 1, 1, 1)).toBe(1)
    expect(normalizeGain(new Int16Array(0), 1, 0, 10)).toBe(1)
  })

  it('gain rounds half up and clips to 16 bits', () => {
    expect(applyGain(pcm(1, -1, 1, -1, 0), 2)).toEqual(pcm(2, -2, 2, -2, 0))
    // Halves round up: 1.5 to 2, -1.5 to -1, 0.5 to 1 and -0.5 to 0.
    expect(applyGain(pcm(1, -1), 1.5)).toEqual(pcm(2, -1))
    expect(applyGain(pcm(10, -10, 1, -1), 0.5)).toEqual(pcm(5, -5, 1, 0))
    expect(applyGain(pcm(20000, -20000, 15000), 2)).toEqual(pcm(32767, -32768, 30000))
    // A copy, even at unity gain.
    const take = pcm(7, 8)
    const same = applyGain(take, 1)
    expect(same).toEqual(take)
    same[0] = 0
    expect(take[0]).toBe(7)
  })

  it('the sound starts after the silence, less a guard', () => {
    // -48 dBFS is a sample of about 130.
    const mono = pcm(0, 3, -129, 50, 0, -131, 900, 0)
    expect(leadingSilence(mono, 1, 0)).toBe(5)
    expect(leadingSilence(mono, 1, 2)).toBe(3)
    expect(leadingSilence(mono, 1, 20)).toBe(0)
    expect(leadingSilence(mono, 1, 0, -40)).toBe(6)
    // Either channel starts it; frames, not samples, are counted.
    const stereo = pcm(0, 0, 10, -10, 0, 500, 0, 0)
    expect(leadingSilence(stereo, 2, 0)).toBe(2)
    expect(leadingSilence(stereo, 2, 1)).toBe(1)
    // All silent (or empty): nothing to start from.
    expect(leadingSilence(pcm(0, 10, -100, 0), 1, 0)).toBeNull()
    expect(leadingSilence(new Int16Array(0), 2, 0)).toBeNull()
  })

  it('stereo mixes down to mono', () => {
    expect(toMono(pcm(100, 200, -100, -200, 0, -1, 32767, 32767, -32768, -32768))).toEqual(pcm(150, -150, -1, 32767, -32768))
    // (l + r) >> 1 floors: -1 and 0 give -1, 1 and 0 give 0.
    expect(toMono(pcm(-1, 0, 1, 0))).toEqual(pcm(-1, 0))
    // A trailing odd sample is dropped.
    expect(toMono(pcm(10, 20, 30))).toEqual(pcm(15))
  })

  it('cut takes whole frames and clamps the range', () => {
    const stereo = pcm(1, -1, 2, -2, 3, -3, 4, -4)
    expect(cut(stereo, 2, 1, 2)).toEqual(pcm(2, -2, 3, -3))
    expect(cut(stereo, 2, 2, 99)).toEqual(pcm(3, -3, 4, -4))
    expect(cut(stereo, 2, 3, 2147483647)).toEqual(pcm(4, -4))
    expect(cut(stereo, 2, -3, 1)).toEqual(pcm(1, -1))
    expect(cut(stereo, 2, 9, 2)).toEqual(new Int16Array(0))
    expect(cut(stereo, 2, 1, -2)).toEqual(new Int16Array(0))
    expect(cut(stereo, 1, 2, 3)).toEqual(pcm(2, -2, 3))
    expect(frames(stereo, 2)).toBe(4)
    expect(frames(pcm(1, 2, 3, 4, 5), 2)).toBe(2)
  })

  it('peaks give one min and max per column', () => {
    const take = Int16Array.from({ length: 2 * 1000 }, (_, i) =>
      i % 2 === 0 ? ((i * 37) % 20000) - 10000 : -((i * 13) % 9000),
    )
    const p = peaks(take, 2, 64)
    expect(p).toHaveLength(64)
    for (const c of p) {
      expect(c.min).toBeLessThanOrEqual(c.max)
      expect(c.min).toBeGreaterThanOrEqual(-1)
      expect(c.max).toBeLessThanOrEqual(1)
    }
    // More columns than frames still gives every column.
    expect(peaks(pcm(1, 2, 3), 1, 10)).toHaveLength(10)
    // The same as sampleTrim's, for the same audio as bytes.
    expect(p).toEqual(trimPeaks(new Uint8Array(take.buffer), 2, 64))
    expect(peaks(pcm(0, 0, 32767, -32768, 0, 0, 16384, 0), 1, 2)).toEqual([
      { min: -1, max: 1 },
      { min: 0, max: f(16384 / 32767) },
    ])
    expect(peaks(new Int16Array(0), 1, 3)).toEqual([
      { min: 0, max: 0 },
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ])
    expect(peaks(take, 2, 0)).toEqual([])
  })

  it('a take wraps as a WAV', () => {
    const take = pcm(1, -1, 256, -256, 32767, -32768)
    const wav = toWavBytes(take, 2, 46875)
    expect(wav).toHaveLength(44 + 12)
    const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
    expect(dv.getUint32(4, true)).toBe(36 + 12)
    expect(dv.getUint16(22, true)).toBe(2)
    expect(dv.getUint32(24, true)).toBe(46875)
    expect(dv.getUint32(28, true)).toBe(46875 * 4)
    expect(dv.getUint32(40, true)).toBe(12)
    expect(dv.getInt16(44 + 6, true)).toBe(-256)
    const bytes = wav.slice(44)
    expect(wav).toEqual(encodeWav(bytes, 2, 46875))
    const back = decodeWav(wav)
    expect(back.channels).toBe(2)
    expect(back.sampleRate).toBe(46875)
    expect(back.pcm).toEqual(bytes)
    // A view into a larger take wraps only its own samples.
    expect(toWavBytes(take.subarray(2, 4), 2, 46875)).toEqual(encodeWav(bytes.slice(4, 8), 2, 46875))
    // Mono, and an empty take.
    const mono = toWavBytes(pcm(5), 1, 48000)
    expect(new DataView(mono.buffer).getUint16(22, true)).toBe(1)
    expect(toWavBytes(new Int16Array(0), 1, 48000)).toHaveLength(44)
  })
})
