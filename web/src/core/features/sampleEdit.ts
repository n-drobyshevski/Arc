// Port of core/src/main/kotlin/dev/arc/ep133/features/SampleEdit.kt
//
// What SAMPLE's review does to a take before it goes on a pad (an addition):
// normalize, trim the silence in front, mix down, cut, draw and wrap it as a
// WAV. A take is 16-bit PCM in an Int16Array, interleaved at its channel
// count, as SampleCapture gives it; positions and lengths are in frames. The
// web has no SAMPLE mode; this is the core logic only.
//
// Gain rounds as floor(x + 0.5) and stereo mixes down with >>, so it gives
// the same samples as the Kotlin.
//
// Web deltas:
// - ShortArray is Int16Array; the object's members are module functions.
// - Kotlin's Float gains (normalizeGain's result, applyGain's [gain]) and
//   Peak values go through Math.fround, so a gain a Float can't hold exactly
//   scales samples as the Kotlin does.
// - toWavBytes assumes a little-endian platform (as wav.ts's decoder does)
//   to wrap the samples without a second copy.

import { encodeWav } from '../formats/wav'
import { PeakMeter } from './peakMeter'
import type { Peak } from './sampleTrim'

const f = Math.fround

/** The most normalizing raises a take, so a near-silent one doesn't come out as loud noise. */
export const MAX_NORMALIZE_DB = 24

// Kotlin's coerceIn (min <= max here).
function coerceIn(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

// Kotlin Long division for non-negative integers, without float rounding of a / b.
function idiv(a: number, b: number): number {
  return (a - (a % b)) / b
}

/** The frames in [pcm] at [channels] channels; a trailing part frame doesn't count. */
export function frames(pcm: Int16Array, channels: number): number {
  return channels <= 0 ? 0 : Math.trunc(pcm.length / channels)
}

/**
 * The gain that brings the loudest sample of frames [start, end) of [pcm] to
 * full scale (32767), at most [MAX_NORMALIZE_DB] up. The range is clamped to
 * the audio; 1 when it is silent or empty.
 */
export function normalizeGain(pcm: Int16Array, channels: number, start: number, end: number): number {
  const n = frames(pcm, channels)
  const a = coerceIn(start, 0, n)
  const b = coerceIn(end, a, n)
  let peak = 0
  for (let i = a * channels; i < b * channels; i++) peak = Math.max(peak, Math.abs(pcm[i]!))
  if (peak === 0) return 1
  return f(Math.min(32767 / peak, Math.pow(10, MAX_NORMALIZE_DB / 20)))
}

/** [pcm] multiplied by [gain] as a copy, each sample rounded half up and clipped to 16 bits. */
export function applyGain(pcm: Int16Array, gain: number): Int16Array {
  const g = f(gain)
  const out = new Int16Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.floor(pcm[i]! * g + 0.5)
    out[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v
  }
  return out
}

/**
 * Where the sound in [pcm] starts: the first frame with a sample that
 * reaches [thresholdDb] (dBFS), less [guardFrames] so the start of its
 * attack is kept, but not before 0. Null when every frame is quieter.
 */
export function leadingSilence(pcm: Int16Array, channels: number, guardFrames: number, thresholdDb: number = -48): number | null {
  // Compared against the sample's size rather than as dB, so the two ports
  // can't differ by a rounding of log10.
  const limit = 32768 * PeakMeter.fromDb(thresholdDb)
  const n = frames(pcm, channels)
  for (let fr = 0; fr < n; fr++) {
    for (let c = 0; c < channels; c++) {
      if (Math.abs(pcm[fr * channels + c]!) >= limit) return Math.max(0, fr - guardFrames)
    }
  }
  return null
}

/** Stereo [pcm] mixed down to mono, each frame (l + r) >> 1. A trailing odd sample is dropped. */
export function toMono(pcm: Int16Array): Int16Array {
  const out = new Int16Array(pcm.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = (pcm[2 * i]! + pcm[2 * i + 1]!) >> 1
  return out
}

/** [length] frames of [pcm] from frame [start], as a copy. The range is clamped to the audio. */
export function cut(pcm: Int16Array, channels: number, start: number, length: number): Int16Array {
  const n = frames(pcm, channels)
  const a = coerceIn(start, 0, n)
  const b = coerceIn(a + length, a, n)
  return pcm.slice(a * channels, b * channels)
}

/** [columns] min/max pairs across all channels, for drawing a waveform; as sampleTrim's peaks for a take. */
export function peaks(pcm: Int16Array, channels: number, columns: number): Peak[] {
  const n = frames(pcm, channels)
  if (n === 0 || columns <= 0) return Array.from({ length: Math.max(0, columns) }, () => ({ min: 0, max: 0 }))
  const out: Peak[] = []
  for (let col = 0; col < columns; col++) {
    const from = idiv(col * n, columns)
    const to = Math.min(Math.max(from + 1, idiv((col + 1) * n, columns)), n)
    let lo = 0
    let hi = 0
    // Long columns are sampled with a stride; the shape is what matters here.
    const step = Math.max(1, Math.trunc((to - from) / 256))
    for (let fr = from; fr < to; fr += step) {
      for (let c = 0; c < channels; c++) {
        const v = pcm[fr * channels + c]!
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    out.push({ min: f(lo / 32768), max: f(hi / 32767) })
  }
  return out
}

/** [pcm] as a 16-bit WAV file at [channels] channels and [rate] Hz. */
export function toWavBytes(pcm: Int16Array, channels: number, rate: number): Uint8Array {
  return encodeWav(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), channels, rate)
}
