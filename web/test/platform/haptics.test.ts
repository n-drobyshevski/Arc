// Tests for platform/haptics.ts (Live's haptic feedback), with a fake navigator.
import { describe, expect, it } from 'vitest'
import { HANDLE_GAP_MS, PATTERNS, TICK_MS, buzz, supported, tick } from '../../src/platform/haptics'

describe('haptics', () => {
  it('is supported only where navigator.vibrate is a function, on a touch screen', () => {
    const fine = () => false
    expect(supported({ vibrate: () => true, maxTouchPoints: 5 }, fine)).toBe(true)
    expect(supported({ vibrate: () => true }, () => true)).toBe(true)
    expect(supported({ maxTouchPoints: 5 }, fine)).toBe(false)
    expect(supported({ vibrate: true, maxTouchPoints: 5 }, fine)).toBe(false)
    expect(supported(undefined, () => true)).toBe(false)
  })

  it('is not supported on desktop Chrome: vibrate is a function, but no touch screen', () => {
    expect(supported({ vibrate: () => true, maxTouchPoints: 0 }, () => false)).toBe(false)
    // Under node there is no matchMedia: no touch either.
    expect(supported({ vibrate: () => true, maxTouchPoints: 0 })).toBe(false)
  })

  it('ticks once, briefly, with navigator as this', () => {
    const calls: unknown[][] = []
    const nav = {
      vibrate(this: unknown, ...args: unknown[]) {
        expect(this).toBe(nav)
        calls.push(args)
        return true
      },
    }
    tick(nav)
    expect(calls).toEqual([[TICK_MS]])
    expect(TICK_MS).toBe(10)
  })

  it('does nothing without the API, and swallows a refusal', () => {
    expect(() => tick({})).not.toThrow()
    expect(() => tick(undefined)).not.toThrow()
    expect(() =>
      tick({
        vibrate: () => {
          throw new Error('NotAllowedError')
        },
      }),
    ).not.toThrow()
  })

  it("plays each of Android's feedback types as its own pattern", () => {
    const calls: unknown[] = []
    const nav = { vibrate: (p: unknown) => calls.push(p) > 0 }
    buzz('tick', nav)
    buzz('longPress', nav)
    buzz('confirm', nav)
    buzz('reject', nav)
    expect(calls).toEqual([10, 30, [15, 40, 15], [30, 30, 30]])
    expect(PATTERNS.handle).toBeLessThan(TICK_MS)
  })

  it("keeps a knob's steps at least HANDLE_GAP_MS apart", () => {
    const calls: unknown[] = []
    const nav = { vibrate: (p: unknown) => calls.push(p) > 0 }
    const t = 1_000_000
    buzz('handle', nav, t)
    buzz('handle', nav, t + 10)
    buzz('handle', nav, t + HANDLE_GAP_MS - 1)
    buzz('handle', nav, t + HANDLE_GAP_MS)
    // Other types don't wait.
    buzz('tick', nav, t + HANDLE_GAP_MS + 1)
    expect(calls).toEqual([5, 5, 10])
  })
})
