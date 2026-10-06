// Tests for Live's piano layout and computer keyboard (src/ui/live/keyboard.ts,
// Android's pianoRange / view switch rule in MirrorScreen.kt), where Live's
// display line goes (live/window.ts), the piano's keyboard access
// (PianoKeyboard.tsx tabStop / stepNote), the KEYS display's note words with
// the piano (keys.ts keysNoteText), the pad sheet's layer id
// (sheets/PadEditSheet.tsx), the toast's UNDO time and the guide overlay's
// stacked edge tags (coachPlace.ts).
import { describe, expect, it } from 'vitest'
import { NoteNames, Scale } from '../../src/core/features/keys'
import { physicalPad } from '../../src/core/features/padNotes'
import { KeysView, rangeNotes } from '../../src/core/features/piano'
import { MirrorText } from '../../src/core/text/mirrorText'
import { COACH_METRICS, placeTags, type CoachMarkInput, type MeasureTag } from '../../src/ui/coachPlace'
import { ERROR_TOAST_MS, TOAST_MS, toastDuration } from '../../src/ui/components/Toast'
import {
  COMPUTER_KEYS,
  PIANO_MAX_DESK,
  PIANO_MAX_TABLET,
  chosenView,
  computerHint,
  computerNote,
  octaveStep,
  pianoFor,
  pianoHeight,
  pianoWidth,
  playsKeys,
} from '../../src/ui/live/keyboard'
import { DEFAULT_KEYS, keysNoteText, type KeysUi } from '../../src/ui/live/keys'
import { stepNote, tabStop } from '../../src/ui/live/PianoKeyboard'
import { LIVE_PILL_WINDOW, landscape, liveInBar, short } from '../../src/ui/live/window'
import { editPadOf } from '../../src/ui/sheets/PadEditSheet'

const AUTO = KeysView.AUTO

describe('the piano in Live', () => {
  it('takes Live\'s box less its chrome', () => {
    expect(pianoWidth(1200, true)).toBe(1200 - 16 - 28 - 42)
    expect(pianoWidth(852, false)).toBe(852 - 58 - 22)
    expect(pianoWidth(10, false)).toBe(0)
    expect(pianoHeight(800, true)).toBe(800 - 194 - 43)
    expect(pianoHeight(329, false)).toBe(329 - 128 - 23)
  })

  it('plays on the piano on a wide window where it fits, AUTO or PIANO; PADS keeps the grid', () => {
    // A phone on its side: 852 x 393, Live 852 x 329.
    const land = pianoFor(852, 393, 852, 329, false, AUTO, AUTO, null, 4)
    expect(land.switchShown).toBe(true)
    expect(land.room).toBe(true)
    expect(land.wide).toBe(true)
    // 772 px: 15 white keys (C3 to C5) of 51 px.
    expect(land.range).toEqual({ first: 48, last: 72 })
    expect(land.height).toBe(329 - 128 - 23)
    expect(pianoFor(852, 393, 852, 329, false, KeysView.PADS, AUTO, null, 4).range).toBeNull()
    // The tall window's view doesn't count on a wide one.
    expect(pianoFor(852, 393, 852, 329, false, AUTO, KeysView.PADS, null, 4).range).not.toBeNull()
  })

  it('never on a portrait phone, which has no switch; a portrait tablet only when asked', () => {
    const phone = pianoFor(393, 852, 393, 788, false, AUTO, KeysView.PIANO, null, 4)
    expect(phone.switchShown).toBe(false)
    expect(phone.range).toBeNull()
    const tablet = pianoFor(800, 1200, 800, 1130, false, AUTO, AUTO, null, 4)
    expect(tablet.switchShown).toBe(true)
    expect(tablet.wide).toBe(false)
    expect(tablet.range).toBeNull()
    expect(pianoFor(800, 1200, 800, 1130, false, AUTO, KeysView.PIANO, null, 4).range).toEqual({ first: 48, last: 72 })
  })

  it('caps its height, and greys the piano out without room (under 8 whites or 120 px)', () => {
    expect(pianoFor(1440, 900, 1200, 2000, true, AUTO, AUTO, null, 4).height).toBe(PIANO_MAX_DESK)
    expect(pianoFor(1000, 900, 1000, 2000, false, AUTO, AUTO, null, 4).height).toBe(PIANO_MAX_TABLET)
    const short = pianoFor(852, 300, 852, 250, false, AUTO, KeysView.PIANO, null, 4)
    expect(short.room).toBe(false)
    expect(short.range).toBeNull()
    expect(pianoFor(700, 400, 400, 350, false, AUTO, KeysView.PIANO, null, 4).room).toBe(false)
  })

  it('shows the size chosen in Settings, capped at what fits', () => {
    // The desk at 1440: 1114 px, three octaves fit.
    expect(pianoFor(1440, 900, 1200, 760, true, AUTO, AUTO, null, 4).range).toEqual({ first: 48, last: 84 })
    expect(pianoFor(1440, 900, 1200, 760, true, AUTO, AUTO, 8, 4).range).toEqual({ first: 48, last: 60 })
    // Three octaves asked, 772 px: two.
    expect(pianoFor(852, 393, 852, 329, false, AUTO, AUTO, 22, 4).range).toEqual({ first: 48, last: 72 })
  })

  it('gives the keys the display line\'s height when the line is in the top bar', () => {
    expect(pianoHeight(329, false, true)).toBe(329 - 128 - 23 + 58)
    // A phone on its side, the line in the bar: the same keys, taller.
    const inBar = pianoFor(852, 393, 852, 329, false, AUTO, AUTO, null, 4, true)
    expect(inBar.range).toEqual({ first: 48, last: 72 })
    expect(inBar.height).toBe(329 - 128 - 23 + 58)
    // The desk keeps its line on the page.
    expect(pianoHeight(800, true, true)).toBe(pianoHeight(800, true))
  })

  it('stores the switch as PIANO or PADS', () => {
    expect(chosenView(true)).toBe(KeysView.PIANO)
    expect(chosenView(false)).toBe(KeysView.PADS)
  })
})

describe('the window', () => {
  it('a phone on its side is landscape and short, and its top bar takes the display line', () => {
    const pixelSideways = { width: 915, height: 412 }
    expect(landscape(pixelSideways)).toBe(true)
    expect(short(pixelSideways)).toBe(true)
    expect(liveInBar(pixelSideways)).toBe(true)
    expect(liveInBar({ width: 852, height: 393 })).toBe(true)
    // Upright, a computer window, a narrow split screen: the line stays on the page.
    expect(liveInBar({ width: 412, height: 915 })).toBe(false)
    expect(liveInBar({ width: 1440, height: 900 })).toBe(false)
    expect(liveInBar({ width: LIVE_PILL_WINDOW - 40, height: 360 })).toBe(false)
    expect(liveInBar({ width: 900, height: 480 })).toBe(false)
  })
})

describe('the piano\'s keyboard access', () => {
  const notes = rangeNotes({ first: 48, last: 72 })

  it('puts one key in the Tab order: the one last focused, else the first root, else the lowest', () => {
    expect(tabStop(notes, null, 0, Scale.MAJOR)).toBe(48)
    expect(tabStop(notes, null, 9, Scale.MINOR)).toBe(57)
    expect(tabStop(notes, 61, 9, Scale.MINOR)).toBe(61)
    // Focused on a key the range no longer shows (− / +): back to the root.
    expect(tabStop(notes, 84, 2, Scale.MAJOR)).toBe(50)
    expect(tabStop([], null, 0, Scale.MAJOR)).toBeNull()
  })

  it('moves along the keys with the arrows, Home and End, and leaves other keys alone', () => {
    expect(stepNote(notes, 60, 'ArrowRight')).toBe(61)
    expect(stepNote(notes, 60, 'ArrowUp')).toBe(61)
    expect(stepNote(notes, 60, 'ArrowLeft')).toBe(59)
    expect(stepNote(notes, 60, 'ArrowDown')).toBe(59)
    expect(stepNote(notes, 72, 'ArrowRight')).toBe(72)
    expect(stepNote(notes, 48, 'ArrowLeft')).toBe(48)
    expect(stepNote(notes, 60, 'Home')).toBe(48)
    expect(stepNote(notes, 60, 'End')).toBe(72)
    // Enter and Space play the focused key (its click); letters are the computer keyboard's.
    expect(stepNote(notes, 60, 'Enter')).toBeNull()
    expect(stepNote(notes, 60, ' ')).toBeNull()
    expect(stepNote(notes, 60, 'a')).toBeNull()
    // And the computer keyboard never plays Enter, Space or an arrow: one press, one note.
    for (const code of ['Enter', 'NumpadEnter', 'Space', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(computerNote(code, 4)).toBeNull()
    }
  })
})

describe('the computer keyboard', () => {
  it('plays C to E an octave up from OCT\'s own C on the letter rows', () => {
    expect(COMPUTER_KEYS).toHaveLength(17)
    expect(computerNote('KeyA', 4)).toBe(60)
    expect(computerNote('KeyW', 4)).toBe(61)
    expect(computerNote('KeyK', 4)).toBe(72)
    expect(computerNote('Semicolon', 4)).toBe(76)
    expect(computerNote('KeyA', 0)).toBe(12)
    expect(computerNote('KeyQ', 4)).toBeNull()
    // The plate ends at 127.
    expect(computerNote('Semicolon', 9)).toBeNull()
  })

  it('puts the letter on the key it plays', () => {
    expect(computerHint(60, 4)).toBe('A')
    expect(computerHint(61, 4)).toBe('W')
    expect(computerHint(76, 4)).toBe(';')
    expect(computerHint(59, 4)).toBeNull()
    expect(computerHint(77, 4)).toBeNull()
  })

  it('steps the octave with Z and X, and keeps out of fields, dialogs and shortcuts', () => {
    expect(octaveStep('KeyZ')).toBe(-1)
    expect(octaveStep('KeyX')).toBe(1)
    expect(octaveStep('KeyA')).toBeNull()
    const plain = { ctrlKey: false, metaKey: false, altKey: false, inField: false }
    expect(playsKeys(plain)).toBe(true)
    expect(playsKeys({ ...plain, inField: true })).toBe(false)
    expect(playsKeys({ ...plain, metaKey: true })).toBe(false)
    expect(playsKeys({ ...plain, ctrlKey: true })).toBe(false)
    expect(playsKeys({ ...plain, altKey: true })).toBe(false)
  })
})

describe('the KEYS display with the piano', () => {
  const keys: KeysUi = { ...DEFAULT_KEYS, on: true, names: NoteNames.SOLFEGE }
  const range = { first: 48, last: 72 }

  it('names a device note past the keys as such, a note in reach plainly', () => {
    expect(keysNoteText(keys, 36, range)).toBe(MirrorText.outOfRange(36, NoteNames.SOLFEGE, true))
    expect(keysNoteText(keys, 84, range)).toBe(MirrorText.outOfRange(84, NoteNames.SOLFEGE, false))
    expect(keysNoteText(keys, 60, range)).toBe(MirrorText.noteName(60, NoteNames.SOLFEGE))
    // On the grid, every note plainly.
    expect(keysNoteText(keys, 36, null)).toBe(MirrorText.noteName(36, NoteNames.SOLFEGE))
    expect(keysNoteText(keys, null, range)).toBeNull()
  })

  it('names the last note played here first (a grid key or a piano key)', () => {
    const playing = { ...keys, playingNotes: new Set([62, 65]) }
    expect(keysNoteText(playing, 36, range)).toBe(MirrorText.noteName(65, NoteNames.SOLFEGE))
  })
})

describe('EDIT', () => {
  it('reads the pad sheet\'s layer id', () => {
    expect(editPadOf(['edit:0:4'])).toEqual(physicalPad(0, 4))
    expect(editPadOf(['upload', 'edit:3:11'])).toEqual(physicalPad(3, 11))
    expect(editPadOf(['edit:4:0', 'edit:0:12', 'edit:a:1'])).toBeNull()
    expect(editPadOf([])).toBeNull()
  })

  it('keeps a toast with UNDO up as long as an error', () => {
    expect(toastDuration(false)).toBe(TOAST_MS)
    expect(toastDuration(false, true)).toBe(ERROR_TOAST_MS)
    expect(toastDuration(true)).toBe(ERROR_TOAST_MS)
  })
})

describe('the guide overlay: two tabs on one edge', () => {
  const measure: MeasureTag = (text, maxWidth) => ({ width: Math.min(text.length * 10, maxWidth), height: 16 })
  const mark = (id: string, top: number, label: string): CoachMarkInput => ({
    id,
    bounds: { left: 0, top, right: 22, bottom: top + 112 },
    label,
    face: 'var(--navy)',
    ink: 'var(--on-navy)',
  })

  it('stacks their side tags apart, hooks clear, each near its tab', () => {
    const vp = { width: 393, height: 780 }
    // GUIDE and EDIT, 18 apart; labels 200 and 180 long.
    const [g, e] = placeTags([mark('edge.guide', 250, 'x'.repeat(18)), mark('edge.edit', 380, 'y'.repeat(16))], vp, measure)
    expect(g!.side).toBe(-1)
    expect(e!.side).toBe(-1)
    // No overlap, the lower tag's hook included.
    expect(e!.rect.top - COACH_METRICS.hookRoom).toBeGreaterThanOrEqual(g!.rect.bottom + COACH_METRICS.clearance)
    // The overlap is shared: the upper moved up from its centre, the lower down from its own.
    const gh = g!.rect.bottom - g!.rect.top
    const eh = e!.rect.bottom - e!.rect.top
    expect(g!.rect.top).toBeLessThan(306 - gh / 2)
    expect(e!.rect.top).toBeGreaterThan(436 - eh / 2)
  })

  it('leaves tags on different edges alone', () => {
    const vp = { width: 393, height: 780 }
    const right: CoachMarkInput = { ...mark('side.more', 250, 'z'.repeat(10)), bounds: { left: 369, top: 250, right: 393, bottom: 640 } }
    const [a, b] = placeTags([mark('edge.guide', 250, 'x'.repeat(10)), right], vp, measure)
    expect(a!.side).toBe(-1)
    expect(b!.side).toBe(1)
    expect(a!.rect.top).toBe(306 - (a!.rect.bottom - a!.rect.top) / 2)
  })
})
