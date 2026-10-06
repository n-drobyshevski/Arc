// A LiveAudioDeps that records what the controller asks of Live's output (state tests).
import { signal } from '@preact/signals'
import type { LiveAudioDeps, LivePress } from '../../src/state/deps'

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
  /** Reports a voice heard (as the output would). */
  started(id: string, ms: number, route?: string): void
  /** Reports a slow (Bluetooth-like) output. */
  slow(ms: number): void
}

export function fakeLiveAudio(): FakeLiveAudio {
  const voices = signal<ReadonlySet<string>>(new Set())
  const startedL = new Set<(id: string, ms: number, route: string) => void>()
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
    started(id, ms, route = 'default output') {
      for (const l of startedL) l(id, ms, route)
    },
    slow(ms) {
      for (const l of slowL) l(ms)
    },
  }
  return a
}
