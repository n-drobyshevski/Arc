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
import { PRESS_DELAY_MS, PressTracker, type PressTimers } from '../../src/ui/live/press'

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

function recorder(log: string[], name: string) {
  return { press: (hold: boolean) => log.push(`${name} press ${hold}`), release: () => log.push(`${name} release`) }
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

  it('waits in a scrolling page: a drag plays nothing, a hold plays after the delay', () => {
    const log: string[] = []
    const timers = fakeTimers()
    const t = new PressTracker(timers, PRESS_DELAY_MS, 8)
    t.down(1, 0, 0, recorder(log, 'a'), true)
    expect(log).toEqual([])
    t.move(1, 0, 12) // past the slop: a scroll
    timers.run()
    t.up(1)
    expect(log).toEqual([])
    expect(t.has(1)).toBe(false)

    t.down(2, 0, 0, recorder(log, 'b'), true)
    t.move(2, 3, 3) // within the slop
    timers.run()
    expect(log).toEqual(['b press true'])
    t.cancel(2) // the browser took it for a scroll after all
    expect(log).toEqual(['b press true', 'b release'])
  })

  it('a quick tap in a scrolling page still plays, and ends at once', () => {
    const log: string[] = []
    const timers = fakeTimers()
    const t = new PressTracker(timers)
    t.down(1, 0, 0, recorder(log, 'a'), true)
    t.up(1)
    expect(log).toEqual(['a press true', 'a release'])
    expect(timers.pending()).toBe(0)
  })

  it('a cancelled pending press plays nothing; releaseAll ends every finger', () => {
    const log: string[] = []
    const timers = fakeTimers()
    const t = new PressTracker(timers)
    t.down(1, 0, 0, recorder(log, 'a'), true)
    t.cancel(1)
    timers.run()
    expect(log).toEqual([])
    t.down(2, 0, 0, recorder(log, 'b'), false)
    t.down(3, 0, 0, recorder(log, 'c'), true)
    t.releaseAll()
    timers.run()
    expect(log).toEqual(['b press true', 'b release'])
  })

  it('a pointer id reused without its end finishes the old press first', () => {
    const log: string[] = []
    const t = new PressTracker(fakeTimers())
    t.down(1, 0, 0, recorder(log, 'a'), false)
    t.down(1, 0, 0, recorder(log, 'b'), false)
    expect(log).toEqual(['a press true', 'a release', 'b press true'])
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
