// Live's AudioWorklet module (platform/audio/liveWorklet.ts) loads in an
// AudioWorkletGlobalScope, which has none of the window's helpers: no
// TextEncoder or TextDecoder, no timers, no performance, fetch or storage.
// A module of its graph that uses one at load makes the worklet fail to load,
// and Live then mixes on the main thread (ScriptProcessor) without a word.
// A web addition: the Kotlin has no such scope.

import { afterEach, expect, it, vi } from 'vitest'

// What a window has and the worklet's scope does not (timers, performance and URL
// too, but the test runner itself needs those while it loads the modules).
const MISSING = [
  'TextEncoder', 'TextDecoder', 'fetch', 'crypto', 'localStorage', 'indexedDB',
  'navigator', 'window', 'document', 'requestAnimationFrame',
] as const

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

it("Live's worklet module loads without the window's helpers", async () => {
  const registered: string[] = []
  vi.resetModules()
  for (const name of MISSING) vi.stubGlobal(name, undefined)
  vi.stubGlobal('sampleRate', 48000)
  vi.stubGlobal('AudioWorkletProcessor', class {
    readonly port = { postMessage: () => {}, onmessage: null }
  })
  vi.stubGlobal('registerProcessor', (name: string) => registered.push(name))

  await import('../../src/platform/audio/liveWorklet')

  const { LIVE_PROCESSOR } = await import('../../src/platform/audio/liveProtocol')
  expect(registered).toEqual([LIVE_PROCESSOR])
})
