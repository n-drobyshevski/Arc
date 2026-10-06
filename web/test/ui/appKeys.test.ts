import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebText } from '../../src/core/text/webText'
import { appCommand, escapeCloses, keyHelp, keyScope, setKeyScope, type AppContext, type KeyScopeHandler } from '../../src/ui/appKeys'
import { inControl, inField, type KeyInput } from '../../src/ui/keyGuard'
import type { LiveContext } from '../../src/ui/live/liveKeyboard'
import { screenLayer, sheetLayer, tabLayer, overlayLayer, viewOf, type Layer } from '../../src/ui/nav'

function key(code: string, k: string, more: Partial<KeyInput> = {}): KeyInput {
  return { code, key: k, shift: false, ctrl: false, meta: false, alt: false, altGraph: false, repeat: false, composing: false, prevented: false, inField: false, onControl: false, ...more }
}

const live = tabLayer('live')
const view = (...layers: Layer[]) => viewOf([live, ...layers])
const ctx = (layers: Layer[] = [], more: Partial<AppContext> = {}): AppContext => ({ view: view(...layers), canBack: true, enabled: true, toastAction: false, ...more })

describe('the app-wide keys', () => {
  it('Esc closes the full screen in front, never a section, nothing under an overlay or past the guard', () => {
    for (const screen of [{ kind: 'settings' }, { kind: 'debug' }, { kind: 'search' }, { kind: 'guide' }, { kind: 'contents', id: 'a' }, { kind: 'compare', a: 'a', b: 'b' }] as const) {
      expect(escapeCloses(view(screenLayer(screen)))).toBe(true)
      expect(appCommand(key('Escape', 'Escape'), ctx([screenLayer(screen)]))).toBe('back')
    }
    // A section is not a screen: Esc on Device stays there.
    expect(escapeCloses(viewOf([live, tabLayer('device')]))).toBe(false)
    expect(appCommand(key('Escape', 'Escape'), { ...ctx(), view: viewOf([live, tabLayer('device')]) })).toBeNull()
    // A sheet, dialog, side panel, menu or the guide overlay handle their own Esc.
    for (const over of [sheetLayer('licence'), overlayLayer('dialog', 'forget'), overlayLayer('side'), overlayLayer('menu'), overlayLayer('coach')]) {
      expect(appCommand(key('Escape', 'Escape'), ctx([screenLayer({ kind: 'settings' }), over]))).toBeNull()
    }
    // The progress sheet's guard, a field, a key someone took: not Back.
    expect(appCommand(key('Escape', 'Escape'), ctx([screenLayer({ kind: 'settings' })], { canBack: false }))).toBeNull()
    expect(appCommand(key('Escape', 'Escape', { inField: true }), ctx([screenLayer({ kind: 'search' })]))).toBeNull()
    expect(appCommand(key('Escape', 'Escape', { prevented: true }), ctx([screenLayer({ kind: 'settings' })]))).toBeNull()
  })

  it('? opens the keys off fields with nothing over the page, and only with single keys on', () => {
    expect(appCommand(key('Slash', '?', { shift: true }), ctx())).toBe('help')
    // AZERTY: ? is Shift+Comma.
    expect(appCommand(key('Comma', '?', { shift: true }), ctx())).toBe('help')
    expect(appCommand(key('Slash', '?', { shift: true }), ctx([], { enabled: false }))).toBeNull()
    expect(appCommand(key('Slash', '?', { shift: true, inField: true }), ctx())).toBeNull()
    expect(appCommand(key('Slash', '?', { shift: true }), ctx([sheetLayer('keys')]))).toBeNull()
  })

  it('Ctrl/Cmd+Z runs the UNDO while it shows, never in a field', () => {
    expect(appCommand(key('KeyZ', 'z', { ctrl: true }), ctx([], { toastAction: true }))).toBe('undo')
    expect(appCommand(key('KeyZ', 'z', { meta: true }), ctx([], { toastAction: true }))).toBe('undo')
    expect(appCommand(key('KeyZ', 'z', { ctrl: true }), ctx())).toBeNull()
    expect(appCommand(key('KeyZ', 'z', { ctrl: true, inField: true }), ctx([], { toastAction: true }))).toBeNull()
    expect(appCommand(key('KeyZ', 'Z', { ctrl: true, shift: true }), ctx([], { toastAction: true }))).toBeNull()
  })

  it('lists only the keys that work now, Everywhere last', () => {
    const pads: LiveContext = { keys: false, pianoShown: false, editAvailable: true, editOn: false, oneGroup: false, viewSwitchable: false, soundsTab: false }
    const titles = (groups: { title: string }[]): string[] => groups.map((g) => g.title)
    const labels = (rows: readonly { label: string }[]): string[] => rows.map((r) => r.label)
    const groups = keyHelp({ live: pads, enabled: true })
    expect(titles(groups)).toEqual([WebText.KEYS_PADS, WebText.KEYS_EDIT, WebText.KEYS_EVERYWHERE])
    // No Follow in the all-groups view, no find without the Sounds tab; EDIT off: only E there.
    expect(labels(groups[0]!.rows)).not.toContain(WebText.KEY_FOLLOW)
    expect(labels(groups[1]!.rows)).toEqual([WebText.KEY_EDIT])
    // EDIT on: the pad keys open sounds, so the pads' playing rows give way.
    const editing = keyHelp({ live: { ...pads, editOn: true, soundsTab: true }, enabled: true })
    expect(labels(editing[0]!.rows)).not.toContain(WebText.KEY_PADS)
    expect(labels(editing[0]!.rows)).not.toContain(WebText.KEY_PADS_ROW)
    expect(labels(editing[1]!.rows)).toEqual([WebText.KEY_EDIT, WebText.KEY_EDIT_PAD, WebText.KEY_FIND])
    expect(titles(keyHelp({ live: { ...pads, keys: true, pianoShown: true }, enabled: true }))).toEqual([WebText.KEYS_PIANO, WebText.KEYS_EVERYWHERE])
    expect(titles(keyHelp({ live: { ...pads, keys: true }, enabled: true }))).toEqual([WebText.KEYS_GRID, WebText.KEYS_EVERYWHERE])
    // Away from Live (Settings' Show keys): all of Live's keys.
    expect(titles(keyHelp({ live: null, enabled: true }))).toEqual([
      WebText.KEYS_PADS,
      WebText.KEYS_EDIT,
      WebText.KEYS_GRID,
      WebText.KEYS_PIANO,
      WebText.KEYS_EVERYWHERE,
    ])
    // Single keys off: only Esc and Ctrl/Cmd+Z (? doesn't open anything then).
    const off = keyHelp({ live: pads, enabled: false })
    expect(titles(off)).toEqual([WebText.KEYS_EVERYWHERE])
    expect(labels(off[0]!.rows)).toEqual([WebText.KEY_ESCAPE, WebText.KEY_UNDO])
  })

  it('acts once per press of Esc, and leaves AltGr combinations alone', () => {
    expect(appCommand(key('Escape', 'Escape', { repeat: true }), ctx([screenLayer({ kind: 'settings' })]))).toBeNull()
    expect(appCommand(key('Slash', '?', { shift: true, altGraph: true }), ctx())).toBeNull()
  })
})

describe('the key scope slot', () => {
  afterEach(() => {
    keyScope()?.releaseAll()
  })

  it('holds one screen at a time, letting the old one go, and empties only for its owner', () => {
    const make = (): KeyScopeHandler => ({ keydown: () => false, keyup: () => {}, escape: () => false, releaseAll: vi.fn(), context: () => null as unknown as LiveContext })
    const a = make()
    const b = make()
    const offA = setKeyScope(a)
    const offB = setKeyScope(b)
    expect(a.releaseAll).toHaveBeenCalledTimes(1)
    offA()
    expect(keyScope()).toBe(b)
    offB()
    expect(keyScope()).toBeNull()
  })
})

describe('the key guards', () => {
  it('are false off the DOM (node tests)', () => {
    expect(inField(null)).toBe(false)
    expect(inControl({} as EventTarget)).toBe(false)
  })
})
