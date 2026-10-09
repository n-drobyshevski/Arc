// Tests for the pure helpers of the UI primitives in src/ui/components/
// (ports of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt,
// Icons.kt IconBlock and the TrimSheet.kt waveform and range slider).
import { describe, expect, it } from 'vitest'
import { createLongPress, HOLD_MS, LONG_PRESS_MS, tipAlign, type LongPressTimers } from '../../src/ui/components/IconBlock'
import { litSegments, meterSegments } from '../../src/ui/components/Meter'
import { rovingIndex, rovingIndexSkipping } from '../../src/ui/components/Segmented'
import { octaveKeys } from '../../src/ui/components/MiniPiano'
import { takeChars } from '../../src/ui/components/Field'
import { toastDuration, TOAST_MS, ERROR_TOAST_MS } from '../../src/ui/components/Toast'
import { plateRowClass } from '../../src/ui/components/GridPlate'
import {
  clampRange, keyStep, keyValue, moveThumb, nearestThumb, snap, valueAt,
} from '../../src/ui/components/RangeSlider'
import { waveformBars, WAVE_COLUMNS } from '../../src/ui/components/Waveform'
import { peaks } from '../../src/core/features/sampleTrim'

/** Manual clock for the long-press timer. */
function fakeTimers(): LongPressTimers & { advance(ms: number): void; pending(): number } {
  let now = 0
  let next = 1
  const timers = new Map<number, { at: number; fn: () => void }>()
  return {
    set(fn, ms) {
      const h = next++
      timers.set(h, { at: now + ms, fn })
      return h
    },
    clear(h) { timers.delete(h) },
    advance(ms) {
      now += ms
      for (const [h, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(h)
          t.fn()
        }
      }
    },
    pending: () => timers.size,
  }
}

describe('IconBlock long press', () => {
  it('fires after 500 ms and swallows the following click once', () => {
    const t = fakeTimers()
    let fired = 0
    const lp = createLongPress(() => { fired++ }, t)
    expect(LONG_PRESS_MS).toBe(500)
    lp.down()
    t.advance(499)
    expect(fired).toBe(0)
    t.advance(1)
    expect(fired).toBe(1)
    lp.up()
    expect(lp.consumeClick()).toBe(true)
    // The next ordinary click goes through.
    expect(lp.consumeClick()).toBe(false)
  })

  it('a short press is a click', () => {
    const t = fakeTimers()
    let fired = 0
    const lp = createLongPress(() => { fired++ }, t)
    lp.down()
    t.advance(200)
    lp.up()
    t.advance(1000)
    expect(fired).toBe(0)
    expect(lp.consumeClick()).toBe(false)
  })

  it('cancel (pointer left or scrolled) stops the timer', () => {
    const t = fakeTimers()
    let fired = 0
    const lp = createLongPress(() => { fired++ }, t)
    lp.down()
    lp.cancel()
    expect(t.pending()).toBe(0)
    t.advance(1000)
    expect(fired).toBe(0)
  })

  it('a new press resets a stale long-press flag', () => {
    const t = fakeTimers()
    const lp = createLongPress(() => undefined, t)
    lp.down()
    t.advance(600)
    lp.up()
    // No click arrived (e.g. the pointer was released elsewhere); the next press is fresh.
    lp.down()
    lp.up()
    expect(lp.consumeClick()).toBe(false)
  })

  it('dispose clears a pending timer', () => {
    const t = fakeTimers()
    const lp = createLongPress(() => undefined, t)
    lp.down()
    lp.dispose()
    expect(t.pending()).toBe(0)
  })

  it('the hold (the connection key\'s disconnect) is the same timing over a second', () => {
    const t = fakeTimers()
    let done = 0
    const hold = createLongPress(() => { done++ }, t, HOLD_MS)
    expect(HOLD_MS).toBe(1000)
    // Let go early: no disconnect, and the tap that follows is an ordinary click (the hint).
    hold.down()
    t.advance(HOLD_MS - 1)
    hold.cancel()
    t.advance(10)
    expect(done).toBe(0)
    expect(hold.consumeClick()).toBe(false)
    // Held the whole second: it acts once, and the click that ends the press is swallowed.
    hold.down()
    t.advance(HOLD_MS)
    expect(done).toBe(1)
    hold.up()
    expect(hold.consumeClick()).toBe(true)
    expect(hold.consumeClick()).toBe(false)
  })

  it('keeps the tooltip inside the viewport', () => {
    expect(tipAlign(100, 144, 393, 60)).toBe('center')
    expect(tipAlign(341, 385, 393, 100)).toBe('end')
    expect(tipAlign(8, 52, 393, 100)).toBe('start')
  })
})

describe('Meter', () => {
  it('lights floor(f * 24 + .5) segments, at least one above zero', () => {
    expect(litSegments(0, 24)).toBe(0)
    expect(litSegments(0.001, 24)).toBe(1)
    expect(litSegments(0.5, 24)).toBe(12)
    expect(litSegments(0.52, 24)).toBe(12)
    expect(litSegments(0.53, 24)).toBe(13)
    expect(litSegments(1, 24)).toBe(24)
    expect(litSegments(2, 24)).toBe(24)
    expect(litSegments(-1, 24)).toBe(0)
    expect(litSegments(Number.NaN, 24)).toBe(0)
  })

  it('turns every lit segment orange from 90%', () => {
    const low = meterSegments(0.5)
    expect(low.filter((s) => s === 'on')).toHaveLength(12)
    expect(low.filter((s) => s === 'hot')).toHaveLength(0)
    const high = meterSegments(0.9)
    expect(high.filter((s) => s === 'hot')).toHaveLength(22)
    expect(high.slice(22)).toEqual(['off', 'off'])
  })

  it('with tipHot only the last lit segment is orange', () => {
    const s = meterSegments(0.25, 24, 0.9, true)
    expect(s.slice(0, 5)).toEqual(['on', 'on', 'on', 'on', 'on'])
    expect(s[5]).toBe('hot')
    expect(s[6]).toBe('off')
    expect(meterSegments(0.95, 24, 0.9, true).filter((x) => x === 'hot')).toHaveLength(1)
  })
})

describe('roving focus', () => {
  it('moves and wraps with arrows, jumps with Home/End', () => {
    expect(rovingIndex(0, 'ArrowRight', 3)).toBe(1)
    expect(rovingIndex(2, 'ArrowRight', 3)).toBe(0)
    expect(rovingIndex(0, 'ArrowLeft', 3)).toBe(2)
    expect(rovingIndex(1, 'ArrowDown', 3)).toBe(2)
    expect(rovingIndex(1, 'ArrowUp', 3)).toBe(0)
    expect(rovingIndex(1, 'Home', 3)).toBe(0)
    expect(rovingIndex(1, 'End', 3)).toBe(2)
    expect(rovingIndex(1, 'Enter', 3)).toBeNull()
    expect(rovingIndex(0, 'ArrowRight', 0)).toBeNull()
  })

  it('flips left and right for RTL', () => {
    expect(rovingIndex(0, 'ArrowLeft', 3, true)).toBe(1)
    expect(rovingIndex(0, 'ArrowRight', 3, true)).toBe(2)
  })
})

describe('Field', () => {
  it('cuts input at maxLength (it.take(maxLength))', () => {
    expect(takeChars('hello', 3)).toBe('hel')
    expect(takeChars('hi', 3)).toBe('hi')
    expect(takeChars('hello', undefined)).toBe('hello')
    expect(takeChars('hello', Number.POSITIVE_INFINITY)).toBe('hello')
  })
})

describe('Toast', () => {
  it('stays 3200 ms, errors 7000 ms', () => {
    expect(toastDuration(false)).toBe(3200)
    expect(toastDuration(true)).toBe(7000)
    expect(TOAST_MS).toBe(3200)
    expect(ERROR_TOAST_MS).toBe(7000)
  })
})

describe('plateRow', () => {
  it('rounds only the outer rows', () => {
    expect(plateRowClass(true, false)).toBe('plate-row plate-row--first')
    expect(plateRowClass(false, false)).toBe('plate-row')
    expect(plateRowClass(false, true)).toBe('plate-row plate-row--last')
    expect(plateRowClass(true, true)).toBe('plate-row plate-row--first plate-row--last')
  })
})

describe('RangeSlider', () => {
  it('clamps like TrimSheet: start in [0, n], end in [start, n]', () => {
    expect(clampRange(-5, 50, 0, 100)).toEqual({ start: 0, end: 50 })
    expect(clampRange(60, 50, 0, 100)).toEqual({ start: 60, end: 60 })
    expect(clampRange(10, 500, 0, 100)).toEqual({ start: 10, end: 100 })
    expect(clampRange(10, 20, 0, -1)).toEqual({ start: 0, end: 0 })
  })

  it('maps a pointer position to a value on the step grid', () => {
    // 204px wide, thumbs inset 2px: 200px of travel.
    expect(valueAt(2, 204, 0, 1000)).toBe(0)
    expect(valueAt(102, 204, 0, 1000)).toBe(500)
    expect(valueAt(202, 204, 0, 1000)).toBe(1000)
    expect(valueAt(-50, 204, 0, 1000)).toBe(0)
    expect(valueAt(999, 204, 0, 1000)).toBe(1000)
    expect(valueAt(103, 204, 0, 1000)).toBe(505)
    expect(valueAt(103, 204, 0, 1000, 10)).toBe(510)
    expect(valueAt(10, 0, 0, 1000)).toBe(0)
    expect(snap(7, 0, 5)).toBe(5)
    expect(snap(8, 0, 5)).toBe(10)
  })

  it('grabs the nearer thumb, by side when they meet', () => {
    expect(nearestThumb(10, 20, 80)).toBe('start')
    expect(nearestThumb(90, 20, 80)).toBe('end')
    expect(nearestThumb(40, 20, 80)).toBe('start')
    expect(nearestThumb(60, 20, 80)).toBe('end')
    expect(nearestThumb(50, 20, 80)).toBe('start')
    expect(nearestThumb(40, 50, 50)).toBe('start')
    expect(nearestThumb(60, 50, 50)).toBe('end')
  })

  it('never lets the thumbs cross', () => {
    expect(moveThumb('start', 90, 20, 80, 0, 100)).toEqual({ start: 80, end: 80 })
    expect(moveThumb('end', 10, 20, 80, 0, 100)).toEqual({ start: 20, end: 20 })
    expect(moveThumb('start', -10, 20, 80, 0, 100)).toEqual({ start: 0, end: 80 })
    expect(moveThumb('end', 150, 20, 80, 0, 100)).toEqual({ start: 20, end: 100 })
  })

  it('moves by 1% with arrows, 10% with Page keys, to the limits with Home/End', () => {
    expect(keyStep(0, 44100)).toBe(441)
    expect(keyStep(0, 50)).toBe(1)
    expect(keyValue('ArrowRight', 1000, 0, 44100, 0, 44100)).toBe(1441)
    expect(keyValue('ArrowLeft', 100, 0, 44100, 0, 44100)).toBe(0)
    expect(keyValue('PageUp', 0, 0, 44100, 0, 44100)).toBe(4410)
    expect(keyValue('PageDown', 44100, 20000, 44100, 0, 44100)).toBe(39690)
    expect(keyValue('Home', 30000, 20000, 44100, 0, 44100)).toBe(20000)
    expect(keyValue('End', 0, 0, 30000, 0, 44100)).toBe(30000)
    expect(keyValue('Tab', 0, 0, 100, 0, 100)).toBeNull()
  })
})

describe('Waveform', () => {
  // A 1000-frame mono ramp from -1 to ~1.
  const n = 1000
  const pcm = new Uint8Array(n * 2)
  const view = new DataView(pcm.buffer)
  for (let i = 0; i < n; i++) view.setInt16(i * 2, Math.round(-32768 + (65535 * i) / (n - 1)), true)
  const cols = peaks(pcm, 1, WAVE_COLUMNS)

  it('draws 160 columns, 0.7 of a column wide and centred', () => {
    const bars = waveformBars(cols, n, 0, n, 320, 96)
    expect(WAVE_COLUMNS).toBe(160)
    expect(bars).toHaveLength(160)
    expect(bars[0]!.x).toBeCloseTo(0.3)
    expect(bars[0]!.w).toBeCloseTo(1.4)
    expect(bars[159]!.x).toBeCloseTo(159 * 2 + 0.3)
  })

  it('scales peaks to half the height less 6px', () => {
    const flat = [{ min: -1, max: 1 }, { min: 0, max: 0 }]
    const [full, silent] = waveformBars(flat, 2, 0, 2, 100, 96)
    // mid 48, half 42: from 6 to 90.
    expect(full!.y).toBe(6)
    expect(full!.h).toBe(84)
    // Silence still draws a 1px bar.
    expect(silent!.y).toBe(48)
    expect(silent!.h).toBe(1)
  })

  it('marks bars whose centre frame is inside [start, end)', () => {
    const bars = waveformBars(cols, n, 250, 500, 320, 96)
    const inside = bars.map((b) => b.inside)
    // Column i covers frame ((i + .5) * 1000 / 160) | 0.
    expect(inside[39]).toBe(false) // frame 246
    expect(inside[40]).toBe(true) // frame 253
    expect(inside[79]).toBe(true) // frame 496
    expect(inside[80]).toBe(false) // frame 503
    expect(inside.filter(Boolean)).toHaveLength(40)
  })

  it('handles no columns', () => {
    expect(waveformBars([], 0, 0, 0, 100, 96)).toEqual([])
  })
})

describe('roving focus over disabled choices', () => {
  const off = (...i: number[]) => (n: number) => i.includes(n)

  it('steps over the skipped ones, wrapping', () => {
    expect(rovingIndexSkipping(0, 'ArrowRight', 5, off(1, 2))).toBe(3)
    expect(rovingIndexSkipping(3, 'ArrowRight', 5, off(4))).toBe(0)
    expect(rovingIndexSkipping(0, 'ArrowLeft', 5, off(4, 3))).toBe(2)
    expect(rovingIndexSkipping(0, 'ArrowRight', 5, off())).toBe(1)
  })

  it('Home and End walk inwards from a skipped end', () => {
    expect(rovingIndexSkipping(2, 'End', 5, off(4, 3))).toBe(2)
    expect(rovingIndexSkipping(2, 'Home', 5, off(0))).toBe(1)
    expect(rovingIndexSkipping(2, 'End', 5, off(4), true)).toBe(3)
  })

  it('gives up when every other choice is skipped, and ignores other keys', () => {
    expect(rovingIndexSkipping(0, 'ArrowRight', 3, off(0, 1, 2))).toBeNull()
    expect(rovingIndexSkipping(0, 'a', 3, off())).toBeNull()
  })
})

describe('MiniPiano', () => {
  it('lays one octave out: 7 whites across, the blacks on their gaps', () => {
    const keys = octaveKeys()
    expect(keys.map((k) => k.pc)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(keys.filter((k) => k.black).map((k) => k.pc)).toEqual([1, 3, 6, 8, 10])
    const whites = keys.filter((k) => !k.black)
    expect(whites.map((k) => k.left * 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(whites.every((k) => k.width === 1 / 7)).toBe(true)
    // DI sits centred on the gap between DO and RE, 0.6 of a white wide.
    const di = keys[1]!
    expect((di.left + di.width / 2) * 7).toBeCloseTo(1)
    expect(di.width * 7).toBeCloseTo(0.6)
    // FI on the gap after FA (the fourth white).
    expect((keys[6]!.left + keys[6]!.width / 2) * 7).toBeCloseTo(4)
  })
})
