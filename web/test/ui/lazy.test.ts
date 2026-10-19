// Tests for src/ui/lazy.ts (web addition): a screen or sheet loaded as a chunk of its own.
import { describe, expect, it, vi } from 'vitest'
import type { FunctionComponent } from 'preact'
import { lazy, preloadWhenIdle } from '../../src/ui/lazy'

const Part: FunctionComponent<{ n: number }> = () => null

describe('lazy', () => {
  it('fetches its chunk once, however often it is preloaded', async () => {
    const load = vi.fn(() => Promise.resolve(Part))
    const L = lazy('Part', load)
    expect(load).not.toHaveBeenCalled()
    await Promise.all([L.preload(), L.preload()])
    await L.preload()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('is named after its part, for the render counter', () => {
    expect(lazy('Part', () => Promise.resolve(Part)).displayName).toBe('Lazy(Part)')
  })

  it('tries a failed fetch again next time', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(Part)
    const L = lazy('Part', load as () => Promise<typeof Part>)
    await expect(L.preload()).rejects.toThrow('offline')
    await L.preload()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('preloads at idle, and not once cancelled', async () => {
    vi.useFakeTimers()
    try {
      const a = vi.fn(() => Promise.resolve())
      const b = vi.fn(() => Promise.reject(new Error('offline')))
      preloadWhenIdle([{ preload: a }, { preload: b }])
      const cancel = preloadWhenIdle([{ preload: a }])
      cancel()
      expect(a).not.toHaveBeenCalled()
      await vi.runAllTimersAsync()
      expect(a).toHaveBeenCalledTimes(1)
      expect(b).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
