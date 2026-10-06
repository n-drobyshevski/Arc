// Tests for src/ui/live/capDown.ts: a cap's data-down, kept at least MIN_DOWN_MS.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_DOWN_MS } from '../../src/core/features/keyMotion'
import { capDown, capUp } from '../../src/ui/live/capDown'

/** Just the attributes capDown uses. */
function el(): Element {
  const attrs = new Set<string>()
  return {
    hasAttribute: (n: string) => attrs.has(n),
    setAttribute: (n: string) => void attrs.add(n),
    removeAttribute: (n: string) => void attrs.delete(n),
  } as unknown as Element
}

describe('capDown', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('held past its shortest stay, it goes up at once', () => {
    const k = el()
    capDown(k, 0)
    expect(k.hasAttribute('data-down')).toBe(true)
    capUp(k, 200)
    expect(k.hasAttribute('data-down')).toBe(false)
  })

  it('a quick tap stays down until MIN_DOWN_MS', () => {
    const k = el()
    capDown(k, 0)
    capUp(k, 10)
    expect(k.hasAttribute('data-down')).toBe(true)
    vi.advanceTimersByTime(MIN_DOWN_MS - 11)
    expect(k.hasAttribute('data-down')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(k.hasAttribute('data-down')).toBe(false)
  })

  it('pressed again while waiting, it stays down', () => {
    const k = el()
    capDown(k, 0)
    capUp(k, 10)
    capDown(k, 20)
    vi.advanceTimersByTime(1000)
    expect(k.hasAttribute('data-down')).toBe(true)
    // Its own press's time counts now.
    capUp(k, 30)
    vi.advanceTimersByTime(MIN_DOWN_MS - 10)
    expect(k.hasAttribute('data-down')).toBe(false)
  })

  it('down again while down keeps the first press, and up on a key that is up does nothing', () => {
    const k = el()
    capUp(k, 0)
    expect(k.hasAttribute('data-down')).toBe(false)
    capDown(k, 0)
    capDown(k, 40)
    capUp(k, MIN_DOWN_MS)
    expect(k.hasAttribute('data-down')).toBe(false)
  })
})
