// Tests for ui/live/piano.ts and ui/live/window.ts: when the piano shows, what lights, and where Live's display line goes.
import { describe, expect, it } from 'vitest'
import type { PadLight } from '../../src/core/features/liveMirror'
import { glow } from '../../src/ui/live/glow'
import { MAX_PIANO_HEIGHT, MIN_PIANO_HEIGHT, PianoFingers, pastEnds, pianoLit, pianoWhites } from '../../src/ui/live/piano'
import { Piano } from '../../src/core/features/piano'
import { Press, Release } from '../../src/core/features/noteTouches'
import { landscape, liveInBar, short } from '../../src/ui/live/window'

const light = (velocity: number, onAt = 0, offAt: number | null = null): PadLight => ({ velocity, channel: 1, onAt, offAt })
const C3_C5 = { first: 48, last: 72 }

describe('the piano', () => {
  it('shows only in a landscape window with room for an octave, else the grid stays', () => {
    expect(pianoWhites(true, 809, 270)).toBe(15)
    expect(pianoWhites(true, 634, 200)).toBe(12)
    expect(pianoWhites(true, 1300, MAX_PIANO_HEIGHT)).toBe(22)
    expect(pianoWhites(false, 809, 270)).toBe(0)
    expect(pianoWhites(true, 340, 270)).toBe(0)
    expect(pianoWhites(true, 809, MIN_PIANO_HEIGHT - 1)).toBe(0)
  })

  it('lights each device note on its own key, and only inside the range', () => {
    const lit = pianoLit(new Map([[60, light(127)], [61, light(40)], [84, light(127)], [30, light(127)]]), C3_C5, 0)
    expect([...lit.keys()].sort()).toEqual([60, 61])
    expect(lit.get(60)).toBeCloseTo(glow(light(127), 0))
    // Faded out: no longer lit.
    expect(pianoLit(new Map([[60, light(127, 0, 0)]]), C3_C5, 10_000).size).toBe(0)
  })

  it('marks the latest note past either end', () => {
    const notes = new Map([[36, light(100, 1)], [40, light(100, 5)], [84, light(100, 2)], [60, light(100, 9)]])
    expect(pastEnds(notes, C3_C5, 10)).toEqual({ below: 40, above: 84 })
    expect(pastEnds(new Map([[60, light(100)]]), C3_C5, 0)).toEqual({ below: null, above: null })
  })
})

describe('the window', () => {
  it('a phone on its side is landscape and short, and its top bar takes the display line', () => {
    const pixelSideways = { width: 915, height: 412 }
    expect(landscape(pixelSideways)).toBe(true)
    expect(short(pixelSideways)).toBe(true)
    expect(liveInBar(pixelSideways)).toBe(true)
    // Upright, a computer window, a narrow split screen: the line stays on the page.
    expect(liveInBar({ width: 412, height: 915 })).toBe(false)
    expect(liveInBar({ width: 1440, height: 900 })).toBe(false)
    expect(liveInBar({ width: 560, height: 360 })).toBe(false)
  })
})

describe('the fingers on the piano', () => {
  // Two octaves from C3 on a 780 × 280 plate: white keys 52 wide.
  const white = 52
  const h = 280
  const keys = Piano.layout(Piano.range(4, 15), 15 * white, h)
  const low = h * 0.9

  it('a slide along the white keys lets go of each and plays the next', () => {
    const f = new PianoFingers()
    expect(f.down(1, white * 0.5, low, keys)).toEqual([Press(48)])
    // Within C, and up to the slop past its edge: still C.
    expect(f.move(1, white * 0.9, low, keys)).toEqual([])
    expect(f.move(1, white + 7, low, keys)).toEqual([])
    expect(f.move(1, white * 1.5, low, keys)).toEqual([Release(48), Press(50)])
    expect(f.move(1, white * 2.5, low, keys)).toEqual([Release(50), Press(52)])
    expect(f.up(1)).toEqual([Release(52)])
    expect(f.has(1)).toBe(false)
  })

  it('slides up from a white key into the black key above it', () => {
    const f = new PianoFingers()
    f.down(1, white * 0.8, low, keys)
    const events = []
    for (let y = low; y > 10; y -= 4) events.push(...f.move(1, white * 0.8, y, keys))
    expect(events).toEqual([Release(48), Press(49)])
  })

  it('a press off every key is not followed, and moves of it play nothing', () => {
    const f = new PianoFingers()
    expect(f.down(1, -5, low, keys)).toEqual([])
    expect(f.has(1)).toBe(false)
    expect(f.move(1, white * 0.5, low, keys)).toEqual([])
    expect(f.up(1)).toEqual([])
  })

  it('off the plate lets go, back on plays again', () => {
    const f = new PianoFingers()
    f.down(1, white * 0.5, low, keys)
    expect(f.move(1, white * 0.5, h + 20, keys)).toEqual([Release(48)])
    expect(f.move(1, white * 0.5, low, keys)).toEqual([Press(48)])
  })

  it('several fingers make a chord, each let go of on its own', () => {
    const f = new PianoFingers()
    expect([...f.down(1, white * 0.5, low, keys), ...f.down(2, white * 2.5, low, keys), ...f.down(3, white * 4.5, low, keys)]).toEqual([
      Press(48),
      Press(52),
      Press(55),
    ])
    expect([...f.held]).toEqual([48, 52, 55])
    expect(f.up(2)).toEqual([Release(52)])
    expect([...f.held]).toEqual([48, 55])
    expect(f.releaseAll()).toEqual([Release(48), Release(55)])
    expect(f.held.size).toBe(0)
  })

  it('after − or + a resting finger keeps its note until it moves on', () => {
    const f = new PianoFingers()
    f.down(1, white * 0.5, low, keys)
    // An octave up: the same place is now C4.
    const up = Piano.layout(Piano.range(5, 15), 15 * white, h)
    f.relayout()
    expect(f.move(1, white * 0.5 + 2, low, up)).toEqual([])
    expect([...f.held]).toEqual([48])
    expect(f.move(1, white * 0.5 + 20, low, up)).toEqual([Release(48), Press(60)])
    expect([...f.held]).toEqual([60])
  })
})
