import { describe, expect, it } from 'vitest'
import { LABELS, ROWS } from '../../src/core/features/padNotes'
import type { KeyInput } from '../../src/ui/keyGuard'
import { COMPUTER_KEYS } from '../../src/ui/live/keyboard'
import { latinLetter, liveCommand, NUMPAD_OFFSET, padOffset, ROW_OFFSET, type LiveContext } from '../../src/ui/live/liveKeyboard'

/** A key press off fields and controls, no modifiers, unless said. */
function key(code: string, k: string, more: Partial<KeyInput> = {}): KeyInput {
  return { code, key: k, shift: false, ctrl: false, meta: false, alt: false, altGraph: false, repeat: false, composing: false, prevented: false, inField: false, onControl: false, ...more }
}

const PADS: LiveContext = { keys: false, pianoShown: false, editAvailable: true, editOn: false, oneGroup: true, viewSwitchable: false, soundsTab: true }
const GRID: LiveContext = { ...PADS, keys: true, editAvailable: false, viewSwitchable: true }
const PIANO: LiveContext = { ...GRID, pianoShown: true }

describe('Live on other keyboard layouts', () => {
  it('steps the key on a dead key\'s place ([ on AZERTY is ^), but leaves other dead keys to the input method', () => {
    expect(liveCommand(key('BracketLeft', 'Dead', { composing: true }), GRID)).toEqual({ kind: 'root', step: -1 })
    expect(liveCommand(key('BracketRight', 'Dead', { composing: true, shift: true }), GRID)).toEqual({ kind: 'scale', step: 1 })
    expect(liveCommand(key('Quote', 'Dead', { composing: true }), GRID)).toBeNull()
  })

  it('takes letters by what they type, by place only for another script\'s letters', () => {
    // AZERTY: the comma sits on M's place; it is no M.
    expect(liveCommand(key('KeyM', ','), PADS)).toBeNull()
    // Dvorak: . on E's place, ; on Z's; V on the full stop's place stays V.
    expect(liveCommand(key('KeyE', '.'), PADS)).toBeNull()
    expect(liveCommand(key('KeyZ', ';'), GRID)).toBeNull()
    expect(liveCommand(key('Period', 'v'), PADS)).toEqual({ kind: 'view' })
    // Dvorak: / on [ 's place finds in PADS, and steps the key down in KEYS (by place there).
    expect(liveCommand(key('BracketLeft', '/'), PADS)).toEqual({ kind: 'find' })
    expect(liveCommand(key('BracketLeft', '/'), GRID)).toEqual({ kind: 'root', step: -1 })
    // A Latin letter with an accent types itself, not its place's letter.
    expect(latinLetter('é', 'KeyE')).toBeNull()
    expect(latinLetter('ç', 'KeyC')).toBeNull()
    // Another script's vowel sign or ligature on a letter's place: that place's letter.
    expect(latinLetter('ा', 'KeyE')).toBe('e') // Hindi InScript
    expect(latinLetter('ิ', 'KeyB')).toBe('b') // Thai
    expect(latinLetter('لا', 'KeyB')).toBe('b') // Arabic
  })

  it('never takes AltGr combinations (Linux reports AltGr without Ctrl or Alt)', () => {
    expect(liveCommand(key('Digit8', '[', { altGraph: true }), GRID)).toBeNull()
    expect(liveCommand(key('KeyB', 'b', { altGraph: true }), PADS)).toBeNull()
  })
})

describe('Live on the computer keyboard', () => {
  it('lays the number pad out as the EP-133 keypad, and the number row by the numbers printed', () => {
    // The number pad's rows from the top are the pads' rows from the top (ROWS).
    const numpad = [
      ['Numpad7', 'Numpad8', 'Numpad9'],
      ['Numpad4', 'Numpad5', 'Numpad6'],
      ['Numpad1', 'Numpad2', 'Numpad3'],
      ['NumpadDecimal', 'Numpad0', 'NumpadEnter'],
    ]
    expect(numpad.map((row) => row.map((c) => NUMPAD_OFFSET[c]))).toEqual(ROWS)
    // Each number-row key plays the pad printed with that number.
    for (const [code, offset] of Object.entries(ROW_OFFSET)) {
      const printed = code === 'Period' ? '.' : code.slice('Digit'.length)
      expect(LABELS[offset]).toBe(printed)
    }
    // NumLock off: the number pad sends Home, End and the arrows, by the same codes.
    expect(padOffset(key('Numpad7', 'Home'))).toBe(9)
    expect(padOffset(key('NumpadDecimal', ','))).toBe(0)
    // Shift plays nothing; main Enter plays ENTER off a control only, the number pad's always.
    expect(padOffset(key('Digit7', '&', { shift: true }))).toBeNull()
    expect(padOffset(key('Enter', 'Enter'))).toBe(2)
    expect(padOffset(key('Enter', 'Enter', { onControl: true }))).toBeNull()
    expect(padOffset(key('NumpadEnter', 'Enter', { onControl: true }))).toBe(2)
  })

  it('plays pads in PADS, opens their sound in EDIT, plays the grid in KEYS, and leaves the piano its own', () => {
    expect(liveCommand(key('Digit5', '5'), PADS)).toEqual({ kind: 'pad', offset: 7 })
    expect(liveCommand(key('Digit5', '5'), { ...PADS, editOn: true })).toEqual({ kind: 'editPad', offset: 7 })
    expect(liveCommand(key('Numpad0', '0'), GRID)).toEqual({ kind: 'gridKey', offset: 1 })
    expect(liveCommand(key('Digit5', '5'), PIANO)).toBeNull()
    // Ctrl, Cmd or Alt, and composing, are never Live's.
    for (const mod of [{ ctrl: true }, { meta: true }, { alt: true }, { composing: true }]) {
      expect(liveCommand(key('Digit5', '5', mod), PADS)).toBeNull()
      expect(liveCommand(key('KeyB', 'b', mod), PADS)).toBeNull()
    }
  })

  it("never takes the piano's keys while it shows (by place, so other layouts too)", () => {
    for (const code of [...COMPUTER_KEYS, 'KeyZ', 'KeyX']) {
      expect(liveCommand(key(code, 'x'), PIANO)).toBeNull()
    }
    // AZERTY: M is where ; is, a piano key; Q where A is.
    expect(liveCommand(key('Semicolon', 'm'), PIANO)).toBeNull()
    expect(liveCommand(key('KeyA', 'q'), PIANO)).toBeNull()
    // The grid has no piano: there M is the mode.
    expect(liveCommand(key('Semicolon', 'm'), GRID)).toEqual({ kind: 'mode' })
  })

  it('gives letters their meaning per mode', () => {
    expect(liveCommand(key('KeyB', 'b'), PADS)).toEqual({ kind: 'group', group: 1 })
    expect(liveCommand(key('KeyD', 'D', { shift: true }), PADS)).toBeNull() // Shift+D: not a group key
    expect(liveCommand(key('KeyD', 'D'), PADS)).toEqual({ kind: 'group', group: 3 }) // Caps Lock on
    expect(liveCommand(key('KeyD', 'd'), PADS)).toEqual({ kind: 'group', group: 3 })
    expect(liveCommand(key('KeyB', 'b'), GRID)).toBeNull()
    expect(liveCommand(key('KeyE', 'e'), PADS)).toEqual({ kind: 'edit' })
    expect(liveCommand(key('KeyE', 'e'), { ...PADS, editAvailable: false })).toBeNull()
    expect(liveCommand(key('KeyF', 'f'), PADS)).toEqual({ kind: 'follow' })
    expect(liveCommand(key('KeyF', 'f'), { ...PADS, oneGroup: false })).toBeNull()
    expect(liveCommand(key('KeyV', 'v'), PADS)).toEqual({ kind: 'view' })
    expect(liveCommand(key('KeyV', 'v'), GRID)).toEqual({ kind: 'view' })
    expect(liveCommand(key('KeyV', 'v'), { ...GRID, viewSwitchable: false })).toBeNull()
    expect(liveCommand(key('KeyM', 'm'), PADS)).toEqual({ kind: 'mode' })
    expect(liveCommand(key('KeyM', 'm'), PIANO)).toEqual({ kind: 'mode' })
    expect(liveCommand(key('KeyZ', 'z'), GRID)).toEqual({ kind: 'octave', step: -1 })
    expect(liveCommand(key('KeyX', 'x'), GRID)).toEqual({ kind: 'octave', step: 1 })
    expect(liveCommand(key('KeyZ', 'z'), PADS)).toBeNull()
    // A Cyrillic layout: the letter by its place.
    expect(latinLetter('и', 'KeyB')).toBe('b')
    expect(liveCommand(key('KeyB', 'и'), PADS)).toEqual({ kind: 'group', group: 1 })
  })

  it('steps the key with [ ], the scale with Shift, in KEYS only; / finds a sound with the Sounds tab', () => {
    expect(liveCommand(key('BracketLeft', '['), GRID)).toEqual({ kind: 'root', step: -1 })
    expect(liveCommand(key('BracketRight', ']'), PIANO)).toEqual({ kind: 'root', step: 1 })
    expect(liveCommand(key('BracketRight', '}', { shift: true }), GRID)).toEqual({ kind: 'scale', step: 1 })
    expect(liveCommand(key('BracketLeft', '['), PADS)).toBeNull()
    expect(liveCommand(key('Slash', '/'), PADS)).toEqual({ kind: 'find' })
    // German layout: / is Shift+7.
    expect(liveCommand(key('Digit7', '/', { shift: true }), PADS)).toEqual({ kind: 'find' })
    expect(liveCommand(key('Slash', '/'), { ...PADS, soundsTab: false })).toBeNull()
    // ? and Esc are the app's.
    expect(liveCommand(key('Slash', '?', { shift: true }), PADS)).toBeNull()
    expect(liveCommand(key('Escape', 'Escape'), PADS)).toBeNull()
  })
})
