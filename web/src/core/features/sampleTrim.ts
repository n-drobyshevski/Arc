// Port of core/src/main/kotlin/dev/arc/ep133/features/SampleTrim.kt
//
// Trimming and drawing audio on the phone (an addition to the web version).
// PCM is signed 16-bit little-endian, interleaved, as everywhere else in arc.
//
// Web deltas: trim ranges are half-open {start, end} (Kotlin callers pass an
// inclusive IntRange and call cut(.., first, last + 1)); Peak values are
// Kotlin Floats, so they go through Math.fround.

import type { JsonObject } from '../protocol/fs'

/** Min/max of one waveform column, both in -1..1 (float32 values). */
export interface Peak {
  min: number
  max: number
}

/** A half-open frame range [start, end). */
export interface TrimRange {
  start: number
  end: number
}

export function frames(pcm: Uint8Array, channels: number): number {
  return channels <= 0 ? 0 : Math.trunc(pcm.length / (2 * channels))
}

// Kotlin's coerceIn (min <= max here).
function coerceIn(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Frames [start, end) of [pcm], as a copy. The range is clamped to the audio. */
export function cut(pcm: Uint8Array, channels: number, start: number, end: number): Uint8Array {
  const n = frames(pcm, channels)
  const a = coerceIn(start, 0, n)
  const b = coerceIn(end, a, n)
  const bytesPerFrame = 2 * channels
  return pcm.slice(a * bytesPerFrame, b * bytesPerFrame)
}

/**
 * Loop points are frame positions, so they move with the start of the trim
 * and are clamped into the trimmed length. A loop start past the end (or a
 * loop end before the start) means the loop was trimmed away; like
 * device.js's out-of-range rule, that point then falls back to the whole
 * sample (0 or the last frame) instead of collapsing to one frame. Other
 * settings are kept, in their order.
 */
export function shiftLoops(settings: Readonly<JsonObject>, start: number, length: number): JsonObject {
  const out: JsonObject = { ...settings }
  const last = Math.max(0, length - 1)
  const rawStart = settings['sound.loopstart']
  const rawEnd = settings['sound.loopend']
  if (typeof rawStart === 'number') {
    const ls = rawStart - start
    out['sound.loopstart'] = coerceIn(ls > last ? 0 : ls, 0, last)
  }
  if (typeof rawEnd === 'number') {
    const le = rawEnd - start
    out['sound.loopend'] = coerceIn(le < 0 ? last : le, 0, last)
  }
  return out
}

// Kotlin Long division for non-negative integers, without float rounding of a / b.
function idiv(a: number, b: number): number {
  return (a - (a % b)) / b
}

/** [columns] min/max pairs across all channels, for drawing a waveform. */
export function peaks(pcm: Uint8Array, channels: number, columns: number): Peak[] {
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
    for (let f = from; f < to; f += step) {
      for (let c = 0; c < channels; c++) {
        const i = (f * channels + c) * 2
        const v = pcm[i]! | ((pcm[i + 1]! << 24) >> 16)
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    out.push({ min: Math.fround(lo / 32768), max: Math.fround(hi / 32767) })
  }
  return out
}

/** Frame position to seconds. */
export function seconds(frame: number, sampleRate: number): number {
  return sampleRate <= 0 ? 0 : frame / sampleRate
}
