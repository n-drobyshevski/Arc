// Tests for web/src/ui/live/keys.ts and press.ts (KEYS maths and holdToPlay of
// MirrorScreen.kt), and glow.ts's offline display helpers.
import { describe, expect, it } from 'vitest'
import { Keys, Scale, NoteNames } from '../../src/core/features/keys'
import type { Hit, PadLight } from '../../src/core/features/liveMirror'
import { physicalPad } from '../../src/core/features/padNotes'
import { MirrorText } from '../../src/core/text/mirrorText'
import { emptyMirrorState, type MirrorUi } from '../../src/state/types'
import { displayLine, displayLineSmall, glow, showOffline } from '../../src/ui/live/glow'
import { DEFAULT_KEYS, PICK_PREFIX, keysDisplayNote, keysLit, keysPickerOf, octaves, upperOctave, type KeysUi } from '../../src/ui/live/keys'
import { backStack, dialogLayer, initialStack, overlayLayer, push, viewOf } from '../../src/ui/nav'
import { PRESS_DELAY_MS, PressTracker, ticking, type PressTarget, type PressTimers } from '../../src/ui/live/press'

const light = (velocity: number, offAt: number | null = null): PadLight => ({ velocity, channel: 1, onAt: 0, offAt })

describe('KEYS grid', () => {
  const major4 = Keys.notes(0, Scale.MAJOR, 4)

  it('lights the key of a device note, else the first key with its name, brightest wins', () => {
    const notes = new Map<number, PadLight>([
      [64, light(127)], // MI4: key 2
      [76, light(40)], // MI5: key 9
      [61, light(127)], // DI4: not in C major
      [48, light(100)], // DO3: no DO3 key, falls on DO4 (key 0)
    ])
    const lit = keysLit(notes, major4, 0)
    expect(lit.get(2)).toBeCloseTo(1)
    expect(lit.get(9)).toBeCloseTo(glow(light(40), 0))
    expect(lit.get(0)).toBeCloseTo(glow(light(100), 0))
    expect(lit.size).toBe(3)
    // Two notes on one key: the brighter.
    const both = keysLit(new Map([[60, light(30)], [72 + 12, light(120)]]), major4, 0)
    expect(both.get(0)).toBeCloseTo(glow(light(120), 0))
  })

  it('rings the chosen octave navy and the next orange, in turn', () => {
    expect(upperOctave(60, 4)).toBe(false)
    expect(upperOctave(72, 4)).toBe(true)
    expect(upperOctave(84, 4)).toBe(false)
    // The screenshot: C major from DO4, keys 7.. (DO5 up) orange.
    expect(major4.map((n) => upperOctave(n, 4))).toEqual([
      false, false, false, false, false, false, false, true, true, true, true, true,
    ])
  })

  it('names the key last pressed on the phone, else the device note', () => {
    const keys: KeysUi = { ...DEFAULT_KEYS, on: true, scale: Scale.MAJOR, playingKeys: new Set([5, 7]) }
    expect(keysDisplayNote(keys, 40)).toBe(72)
    expect(MirrorText.noteName(72, NoteNames.SOLFEGE)).toBe('DO5')
    expect(keysDisplayNote({ ...keys, playingKeys: new Set() }, 40)).toBe(40)
    expect(keysDisplayNote({ ...keys, playingKeys: new Set() }, null)).toBeNull()
  })

  it('offers octaves 0 to 8', () => {
    expect(octaves()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('offline display', () => {
  const offline: MirrorUi = { state: emptyMirrorState(), loading: false, error: null, offline: 'Last seen Oct 5, 2:02 PM' }
  const hit: Hit = { pad: physicalPad(0, 9), note: 45, channel: 1, velocity: 96, slot: null, name: null }

  it('shows the last read time after a hit and before waiting', () => {
    expect(displayLine(offline.state, offline)).toBe('Last seen Oct 5, 2:02 PM')
    const st = { ...emptyMirrorState(), lastHit: hit }
    expect(displayLine(st, offline)).toBe(MirrorText.hit(hit))
    expect(displayLine(offline.state, { ...offline, offline: null })).toBe(MirrorText.WAITING)
    expect(displayLine(offline.state, { ...offline, error: 'x' })).toBe('x')
  })

  it('says Offline only while no clock is heard, and draws the long line smaller', () => {
    expect(showOffline(offline.state, offline)).toBe(true)
    expect(showOffline({ ...offline.state, playing: true }, offline)).toBe(false)
    expect(showOffline(offline.state, null)).toBe(false)
    expect(displayLineSmall(offline.state, offline)).toBe(true)
    expect(displayLineSmall({ ...offline.state, lastHit: hit }, offline)).toBe(false)
  })
})

/** Timers run by hand. */
function fakeTimers(): PressTimers & { run: () => void; pending: () => number } {
  let next = 1
  const due = new Map<number, () => void>()
  return {
    set: (fn) => {
      const id = next++
      due.set(id, fn)
      return id
    },
    clear: (h) => void due.delete(h as number),
    run: () => {
      const fns = [...due.values()]
      due.clear()
      for (const f of fns) f()
    },
    pending: () => due.size,
  }
}

function recorder(log: string[], name: string): PressTarget {
  return {
    press: (hold, unsure) => log.push(`${name} press ${hold}${unsure ? ' unsure' : ''}`),
    release: () => log.push(`${name} release`),
    cut: () => log.push(`${name} cut`),
    keep: () => log.push(`${name} keep`),
  }
}

describe('hold to play', () => {
  it('presses on touch-down in the big grid and releases on lift', () => {
    const log: string[] = []
    const t = new PressTracker(fakeTimers())
    t.down(1, 0, 0, recorder(log, 'a'), false)
    expect(log).toEqual(['a press true'])
    t.move(1, 50, 50) // moving never cancels a press that sounds
    t.up(1)
    t.up(1)
    expect(log).toEqual(['a press true', 'a release'])
  })

  it('plays a chord: a finger per pad, each released on its own', () => {
    const log: string[] = []
    const t = new PressTracker(fakeTimers())
    t.down(1, 0, 0, recorder(log, 'a'), false)
    t.down(2, 0, 0, recorder(log, 'b'), false)
    t.up(1)
    t.cancel(2)
    expect(log).toEqual(['a press true', 'b press true', 'a release', 'b release'])
  })

  it('a scrolling page plays at once; a drag past the slop within the window cuts the sound', () => {
    const log: string[] = []
    const timers = fakeTimers()
    const t = new PressTracker(timers, PRESS_DELAY_MS, 8)
    t.down(1, 0, 0, recorder(log, 'a'), true)
    // Optimistic: no wait before the sound, pressed unsure.
    expect(log).toEqual(['a press true unsure'])
    expect(timers.pending()).toBe(1)
    t.move(1, 0, 5) // within the slop: still a press
    expect(log).toEqual(['a press true unsure'])
    t.move(1, 0, 12) // past the slop: a scroll, never kept
    expect(log).toEqual(['a press true unsure', 'a cut'])
    expect(t.has(1)).toBe(false)
    expect(timers.pending()).toBe(0)
    t.up(1) // the lift after the scroll: nothing more
    expect(log).toEqual(['a press true unsure', 'a cut'])
  })

  it('after the window a move no longer cuts; the browser taking it for a scroll still does', () => {
    const log: string[] = []
    const timers = fakeTimers()
    const t = new PressTracker(timers, PRESS_DELAY_MS, 8)
    t.down(2, 0, 0, recorder(log, 'b'), true)
    timers.run() // PRESS_DELAY_MS passed: a hold, kept
    t.move(2, 0, 40)
    expect(log).toEqual(['b press true unsure', 'b keep'])
    t.cancel(2, true) // pointercancel: the page scrolled after all
    expect(log).toEqual(['b press true unsure', 'b keep', 'b cut'])
  })

  it('pointercancel within the window cuts; leaving the pad releases', () => {
    const log: string[] = []
    const t = new PressTracker(fakeTimers())
    t.down(1, 0, 0, recorder(log, 'a'), true)
    t.cancel(1, true)
    t.down(2, 0, 0, recorder(log, 'b'), true)
    t.cancel(2)
    expect(log).toEqual(['a press true unsure', 'a cut', 'b press true unsure', 'b keep', 'b release'])
  })

  it('pointercancel outside a scrolling page releases, as before', () => {
    const log: string[] = []
    const t = new PressTracker(fakeTimers())
    t.down(1, 0, 0, recorder(log, 'a'), false)
    t.cancel(1, true)
    expect(log).toEqual(['a press true', 'a release'])
  })

  it('raw moves (pointerrawupdate) cut as they come; that pointer\'s pointermoves are skipped', () => {
    const log: string[] = []
    const timers = fakeTimers()
    const t = new PressTracker(timers, PRESS_DELAY_MS, 8)
    t.down(1, 0, 0, recorder(log, 'a'), true)
    t.down(2, 0, 0, recorder(log, 'b'), true)
    t.move(1, 0, 5, true) // raw, within the slop
    t.move(1, 0, 12) // its frame's pointermove (or a coalesced one): already seen, skipped
    expect(log).toEqual(['a press true unsure', 'b press true unsure'])
    t.move(1, 0, 12, true)
    expect(log).toEqual(['a press true unsure', 'b press true unsure', 'a cut'])
    // A pointer with no raw moves (a browser without them for its kind) still cuts on pointermove.
    t.move(2, 0, 12)
    expect(log).toEqual(['a press true unsure', 'b press true unsure', 'a cut', 'b cut'])
    // A raw move of a pointer not held: nothing.
    t.move(3, 0, 40, true)
    expect(log).toHaveLength(4)
    // The same id pressed again starts without raw moves seen.
    t.down(1, 0, 0, recorder(log, 'c'), true)
    t.move(1, 0, 12)
    expect(log.at(-1)).toBe('c cut')
  })

  it('onWindows says when the first scroll window opens and the last one closes', () => {
    const log: string[] = []
    const windows: boolean[] = []
    const timers = fakeTimers()
    const t = new PressTracker(timers, PRESS_DELAY_MS, 8)
    t.onWindows = (open) => windows.push(open)
    // Outside a scrolling page there is no window to watch.
    t.down(1, 0, 0, recorder(log, 'a'), false)
    t.up(1)
    expect(windows).toEqual([])
    t.down(2, 0, 0, recorder(log, 'b'), true)
    t.down(3, 0, 0, recorder(log, 'c'), true)
    expect(windows).toEqual([true])
    t.move(2, 0, 12) // b scrolls: c's window is still open
    expect(windows).toEqual([true])
    timers.run() // c's window closes: none open
    expect(windows).toEqual([true, false])
    t.up(3)
    // Opened again, then ended by a lift inside it, or the screen going.
    t.down(4, 0, 0, recorder(log, 'd'), true)
    t.up(4)
    t.down(5, 0, 0, recorder(log, 'e'), true)
    t.releaseAll()
    expect(windows).toEqual([true, false, true, false, true, false])
  })

  it('a target without cut is released instead', () => {
    const log: string[] = []
    const t = new PressTracker(fakeTimers())
    t.down(1, 0, 0, { press: () => log.push('press'), release: () => log.push('release') }, true)
    t.move(1, 30, 0)
    expect(log).toEqual(['press', 'release'])
  })

  it('a quick tap in a scrolling page plays, and ends at once', () => {
    const log: string[] = []
    const timers = fakeTimers()
    const t = new PressTracker(timers)
    t.down(1, 0, 0, recorder(log, 'a'), true)
    t.up(1)
    // Kept before it is let go of: a tap, not a scroll.
    expect(log).toEqual(['a press true unsure', 'a keep', 'a release'])
    expect(timers.pending()).toBe(0)
  })

  it('releaseAll ends every finger', () => {
    const log: string[] = []
    const timers = fakeTimers()
    const t = new PressTracker(timers)
    t.down(2, 0, 0, recorder(log, 'b'), false)
    t.down(3, 0, 0, recorder(log, 'c'), true)
    t.releaseAll()
    timers.run()
    expect(log).toEqual(['b press true', 'c press true unsure', 'b release', 'c keep', 'c release'])
    expect(timers.pending()).toBe(0)
  })

  it('a pointer id reused without its end finishes the old press first', () => {
    const log: string[] = []
    const t = new PressTracker(fakeTimers())
    t.down(1, 0, 0, recorder(log, 'a'), false)
    t.down(1, 0, 0, recorder(log, 'b'), false)
    expect(log).toEqual(['a press true', 'a release', 'b press true'])
  })
})

describe('haptic tick', () => {
  it('ticks after the press is handed on, and only when on', () => {
    const log: string[] = []
    const t = new PressTracker(fakeTimers())
    t.down(1, 0, 0, ticking(recorder(log, 'a'), true, () => log.push('tick')), false)
    expect(log).toEqual(['a press true', 'tick'])
    t.up(1)
    // Nothing on the release.
    expect(log).toEqual(['a press true', 'tick', 'a release'])
    log.length = 0
    t.down(2, 0, 0, ticking(recorder(log, 'b'), false, () => log.push('tick')), false)
    t.up(2)
    expect(log).toEqual(['b press true', 'b release'])
  })

  it('a press cut by a scroll keeps its tick; the keep gets none', () => {
    const log: string[] = []
    const timers = fakeTimers()
    const t = new PressTracker(timers, PRESS_DELAY_MS, 8)
    t.down(1, 0, 0, ticking(recorder(log, 'a'), true, () => log.push('tick')), true)
    t.move(1, 0, 20)
    expect(log).toEqual(['a press true unsure', 'tick', 'a cut'])
    log.length = 0
    t.down(2, 0, 0, ticking(recorder(log, 'b'), true, () => log.push('tick')), true)
    timers.run()
    expect(log).toEqual(['b press true unsure', 'tick', 'b keep'])
  })

  it('an EDIT long press (a press handed on later) ticks once, after it', () => {
    const log: string[] = []
    const target = ticking(recorder(log, 'a'), true, () => log.push('tick'))
    target.press(true)
    target.release()
    expect(log).toEqual(['a press true', 'tick', 'a release'])
  })
})

describe('KEYS lists as navigation layers', () => {
  it('reads the open list from the dialogs', () => {
    expect(keysPickerOf([])).toBeNull()
    expect(keysPickerOf(['forget'])).toBeNull()
    expect(keysPickerOf([PICK_PREFIX + 'scale'])).toBe('scale')
    expect(keysPickerOf(['delete', PICK_PREFIX + 'octave'])).toBe('octave')
    expect(keysPickerOf([PICK_PREFIX + 'tempo'])).toBeNull()
  })

  it('closes with Back before anything else, staying on Live', () => {
    // Kotlin's focusable Popup: Back dismisses the list, not the page.
    const stack = push(push(initialStack('#/live'), overlayLayer('side')), dialogLayer(PICK_PREFIX + 'scale'))
    expect(keysPickerOf(viewOf(stack).dialogs)).toBe('scale')
    const back = backStack(stack)
    expect(back).not.toBeNull()
    const v = viewOf(back!)
    expect(keysPickerOf(v.dialogs)).toBeNull()
    expect(v.tab).toBe('live')
    expect(v.side).toBe(true)
  })
})
