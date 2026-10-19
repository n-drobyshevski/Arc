// Port of core/src/main/kotlin/dev/arc/ep133/text/LatencyText.kt
//
// The latency test in the debug screen (an addition): the audio engine
// choice, and a row per engine tried this session with its press-to-sound
// times (LatencyStats) and what its output says it should take.
//
// Web deltas: the Kotlin enum classes LiveEngine and WebLatencyHint are const
// objects plus string-union types of the same names (the values are the enum
// names, so they persist as the same strings), with LIVE_ENGINES and
// WEB_LATENCY_HINTS for their entries; jsToFixed is native toFixed; Kotlin's
// default arguments are optional parameters. The Android choices and rows are
// here too, so the two files stay the same text.

import { KEEP } from '../features/latencyStats'
import { plural } from './format'

/**
 * Which output Live plays through on Android, a debug choice for comparing
 * latency (an addition): the native engine (falling back to AudioTrack, as
 * normal), AudioTrack rendering each burst just in time, or AudioTrack as it
 * was before the latency work (render, then a blocking write, no pacing,
 * tagged as media). The old way is the output only: touch input stays
 * unbuffered while Live is shown, as it is now.
 */
export const LiveEngine = {
  AUTO: 'AUTO',
  TRACK: 'TRACK',
  TRACK_OLD: 'TRACK_OLD',
} as const
export type LiveEngine = (typeof LiveEngine)[keyof typeof LiveEngine]

/** LiveEngine.entries, in declaration order. */
export const LIVE_ENGINES: readonly LiveEngine[] = [LiveEngine.AUTO, LiveEngine.TRACK, LiveEngine.TRACK_OLD]

/** The same choice on the web: the AudioContext's latencyHint, 0 (now) or 'interactive' (before). */
export const WebLatencyHint = {
  ZERO: 'ZERO',
  INTERACTIVE: 'INTERACTIVE',
} as const
export type WebLatencyHint = (typeof WebLatencyHint)[keyof typeof WebLatencyHint]

/** WebLatencyHint.entries, in declaration order. */
export const WEB_LATENCY_HINTS: readonly WebLatencyHint[] = [WebLatencyHint.ZERO, WebLatencyHint.INTERACTIVE]

const whole = (ms: number): string => ms.toFixed(0)
const ms = (n: number): string => n.toFixed(1)
const frames = (n: number, rate: number): string => (rate > 0 ? ms((n * 1000.0) / rate) : '?')

export const LatencyText = {
  TITLE: 'Latency',
  HOW_TO: `Pick an engine, tap one pad ${KEEP} times in Live, then compare.`,
  /** What the numbers measure. */
  MEASURES: 'From the touch to the first sound leaving the output. Bluetooth adds its own delay on top.',
  NO_PRESSES: 'No presses yet.',
  RESET: 'Reset',
  /** The row of the engine Live plays through now. */
  IN_USE: 'In use',

  ENGINE: 'Audio engine',
  ENGINE_NOTE: 'For testing. Live reopens its output when this changes.',
  engine(e: LiveEngine): string {
    switch (e) {
      case LiveEngine.AUTO:
        return 'Auto'
      case LiveEngine.TRACK:
        return 'AudioTrack'
      case LiveEngine.TRACK_OLD:
        return 'AudioTrack, old'
    }
  },
  /** Each choice's one-line note. */
  engineNote(e: LiveEngine): string {
    switch (e) {
      case LiveEngine.AUTO:
        return "The native engine (AAudio), AudioTrack where it won't open."
      case LiveEngine.TRACK:
        return 'Each burst rendered just before the output needs it.'
      case LiveEngine.TRACK_OLD:
        return 'Render, then a blocking write, as media, as before the latency work. Touch input stays as now.'
    }
  },
  hint(h: WebLatencyHint): string {
    switch (h) {
      case WebLatencyHint.ZERO:
        return 'latencyHint 0'
      case WebLatencyHint.INTERACTIVE:
        return "latencyHint 'interactive'"
    }
  },
  hintNote(h: WebLatencyHint): string {
    switch (h) {
      case WebLatencyHint.ZERO:
        return 'The smallest buffer the browser allows.'
      case WebLatencyHint.INTERACTIVE:
        return "The browser's usual buffer, as before the latency work."
    }
  },

  // The engine on each row, as it opened. These are also the rows' keys in LatencyStats,
  // so they leave out what changes while it plays (a buffer grown after xruns).
  /** The native stream's mode, from its set-up. */
  nativeMode(aaudio: boolean, exclusive: boolean, mmap: boolean): string {
    if (!aaudio) return 'OpenSL ES'
    if (exclusive) return 'AAudio exclusive (MMAP)'
    if (mmap) return 'AAudio shared (MMAP)'
    return 'AAudio shared'
  },
  /** "AAudio exclusive (MMAP), 96-frame bursts". */
  nativeEngine(mode: string, burst: number, lowLatency = true): string {
    return `${mode}, ${burst}-frame bursts` + (lowLatency ? '' : ', normal path')
  },
  /** "AudioTrack low-latency path, 192-frame bursts", or "AudioTrack, old, low-latency path, 192-frame bursts". */
  trackEngine(fast: boolean, burst: number, old = false): string {
    return (
      (old ? `${LatencyText.engine(LiveEngine.TRACK_OLD)}, ` : 'AudioTrack ') +
      (fast ? 'low-latency path' : 'normal path') +
      `, ${burst}-frame bursts`
    )
  },
  /**
   * "latencyHint 0, 48000 Hz". The delay the browser reports drifts (and often reads 0 just
   * after a start), so it is left to [webEstimate].
   */
  webEngine(h: WebLatencyHint, rate: number): string {
    return `${LatencyText.hint(h)}, ${rate} Hz`
  },

  /** "median 31 ms · best 24 · worst 48 · 20 presses". */
  stats(median: number, best: number, worst: number, count: number): string {
    return `median ${whole(median)} ms · best ${whole(best)} · worst ${whole(worst)} · ${plural(count, 'press', 'presses')}`
  },
  /** The same, spelt out for screen readers. */
  statsDescription(median: number, best: number, worst: number, count: number): string {
    return `Median ${whole(median)} milliseconds, best ${whole(best)}, worst ${whole(worst)}, over ${plural(count, 'press', 'presses')}`
  },

  /**
   * What the Android output's buffer alone should take: "Estimate: 192 frames ÷ 48000 Hz
   * = 4.0 ms buffer, 96-frame bursts (2.0 ms)".
   */
  estimate(bufferFrames: number, burstFrames: number, rate: number): string {
    return (
      `Estimate: ${bufferFrames} frames ÷ ${rate} Hz = ${frames(bufferFrames, rate)} ms buffer, ` +
      `${burstFrames}-frame bursts (${frames(burstFrames, rate)} ms)`
    )
  },
  /** The web's: "Estimate: base 5.3 ms + output 21.0 ms = 26.3 ms", or the base alone where the output isn't reported. */
  webEstimate(baseMs: number, outputMs: number | null): string {
    return outputMs === null
      ? `Estimate: base ${ms(baseMs)} ms (output delay not reported)`
      : `Estimate: base ${ms(baseMs)} ms + output ${ms(outputMs)} ms = ${ms(baseMs + outputMs)} ms`
  },
} as const
