// A LiveAudioDeps that records what the controller asks of Live's output (state tests).
import { signal, type Signal } from '@preact/signals'
import { WebLatencyHint } from '../../src/core/text/latencyText'
import type { LiveAudioDeps, LiveEngineInfo, LivePress } from '../../src/state/deps'

export interface FakeLiveAudio extends LiveAudioDeps {
  readonly loaded: Map<string, { pcm: Int16Array; channels: number; sampleRate: number }>
  readonly presses: { id: string; key: string; options: LivePress }[]
  readonly releases: string[]
  readonly cuts: string[]
  readonly log: string[]
  opened: number
  suspended: number
  closed: number
  gestures: number
  /** What open() and press() answer. */
  available: boolean
  /** Reports a voice heard (as the output would), on [engine]'s latency-test row. */
  started(id: string, ms: number, route?: string, engine?: LiveEngineInfo): void
  /** Reports a slow (Bluetooth-like) output. */
  slow(ms: number): void
  /** The output's own delay signal, as the real LiveAudio has it ([withLate]); absent otherwise. */
  readonly late?: Signal<number | null>
  readonly latencyHint: Signal<WebLatencyHint>
  readonly engine: Signal<LiveEngineInfo | null>
  /** The latencyHint choices made, in order. */
  readonly hints: WebLatencyHint[]
}

/** [withLate]: with a `late` signal of its own, as the real LiveAudio (the controller then follows it). */
export function fakeLiveAudio(withLate = false): FakeLiveAudio {
  const voices = signal<ReadonlySet<string>>(new Set())
  const startedL = new Set<(id: string, ms: number, route: string, engine?: LiveEngineInfo) => void>()
  const slowL = new Set<(ms: number) => void>()
  const set = (f: (s: Set<string>) => void): void => {
    const next = new Set(voices.peek())
    f(next)
    voices.value = next
  }
  const a: FakeLiveAudio = {
    loaded: new Map(),
    presses: [],
    releases: [],
    cuts: [],
    log: [],
    opened: 0,
    suspended: 0,
    closed: 0,
    gestures: 0,
    available: true,
    voices,
    description: '48000 Hz, fake',
    open() {
      a.opened++
      return a.available
    },
    suspend() {
      a.suspended++
      voices.value = new Set()
    },
    close() {
      a.closed++
      voices.value = new Set()
    },
    resumeInGesture() {
      a.gestures++
    },
    preload(key, pcm, channels, sampleRate) {
      a.loaded.set(key, { pcm, channels, sampleRate })
    },
    has: (key) => a.loaded.has(key),
    unload(key) {
      if (key === undefined) a.loaded.clear()
      else a.loaded.delete(key)
    },
    press(id, key, options) {
      if (!a.available || !a.loaded.has(key)) return false
      a.presses.push({ id, key, options })
      set((s) => s.add(id))
      return true
    },
    release(id) {
      a.releases.push(id)
      set((s) => s.delete(id))
    },
    cut(id) {
      a.cuts.push(id)
      set((s) => s.delete(id))
    },
    stopAll() {
      a.log.push('stopAll')
      voices.value = new Set()
    },
    onStarted(l) {
      startedL.add(l)
      return () => startedL.delete(l)
    },
    onSlowOutput(l) {
      slowL.add(l)
      return () => slowL.delete(l)
    },
    started(id, ms, route = 'default output', engine) {
      for (const l of startedL) l(id, ms, route, engine)
    },
    slow(ms) {
      for (const l of slowL) l(ms)
    },
    latencyHint: signal<WebLatencyHint>(WebLatencyHint.ZERO),
    engine: signal<LiveEngineInfo | null>(null),
    hints: [],
    setLatencyHint(choice) {
      a.hints.push(choice)
      a.latencyHint.value = choice
    },
    ...(withLate ? { late: signal<number | null>(null) } : {}),
  }
  return a
}
