// Tests for ui/live/spoken.tsx (Kotlin spoken()) and ui/live/secondary.ts, with a fake clock.
import { describe, expect, it } from 'vitest'
import { SPOKEN_MS, SpokenThrottle, type SpokenClock } from '../../src/ui/live/spoken'
import { describe as describeKey, isSecondaryKey, shortcuts } from '../../src/ui/live/secondary'

/** A clock whose time only moves when told, its timers run as it passes them. */
function fakeClock(): SpokenClock & { advance(ms: number): void } {
  let t = 0
  let timers: { at: number; fn: () => void; id: number }[] = []
  let next = 1
  return {
    now: () => t,
    set: (fn, ms) => {
      const id = next++
      timers.push({ at: t + ms, fn, id })
      return id
    },
    clear: (h) => {
      timers = timers.filter((x) => x.id !== h)
    },
    advance(ms) {
      const end = t + ms
      for (;;) {
        const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        timers = timers.filter((x) => x !== due)
        t = due.at
        due.fn()
      }
      t = end
    },
  }
}

describe('SpokenThrottle', () => {
  it('says the first text at once, then at most one each second, the latest of a run', () => {
    const clock = fakeClock()
    const said: string[] = []
    const s = new SpokenThrottle((t) => said.push(t), SPOKEN_MS, clock)
    s.offer('KICK')
    expect(said).toEqual(['KICK'])
    clock.advance(100)
    s.offer('SNARE')
    clock.advance(100)
    s.offer('HAT')
    clock.advance(500)
    expect(said).toEqual(['KICK'])
    // The second since KICK ends: the last of the run.
    clock.advance(300)
    expect(said).toEqual(['KICK', 'HAT'])
    // A quiet second later, a change is said at once.
    clock.advance(2000)
    s.offer('CLAP')
    expect(said).toEqual(['KICK', 'HAT', 'CLAP'])
  })

  it('drops a text waiting its turn when cancelled', () => {
    const clock = fakeClock()
    const said: string[] = []
    const s = new SpokenThrottle((t) => said.push(t), 1000, clock)
    s.offer('A')
    s.offer('B')
    s.cancel()
    clock.advance(5000)
    expect(said).toEqual(['A'])
  })
})

describe('secondary actions', () => {
  const key = (k: string, shift = false, ctrl = false) => ({ key: k, shiftKey: shift, ctrlKey: ctrl, altKey: false, metaKey: false })

  it('takes Shift+Enter, the context-menu key and Shift+F10', () => {
    expect(isSecondaryKey(key('Enter', true))).toBe(true)
    expect(isSecondaryKey(key('ContextMenu'))).toBe(true)
    expect(isSecondaryKey(key('F10', true))).toBe(true)
    expect(isSecondaryKey(key('Enter'))).toBe(false)
    expect(isSecondaryKey(key('Enter', true, true))).toBe(false)
    expect(isSecondaryKey(key('F10'))).toBe(false)
  })

  it('names the click, then the second action and its key', () => {
    expect(describeKey('Record hands-free', 'Play')).toBe('Record hands-free. Play: Shift+Enter')
    expect(describeKey('Play', null)).toBe('Play')
    expect(shortcuts('7', true)).toBe('7 Shift+Enter')
    expect(shortcuts(undefined, true)).toBe('Shift+Enter')
    expect(shortcuts('7', false)).toBe('7')
    expect(shortcuts(undefined, false)).toBeUndefined()
  })
})
