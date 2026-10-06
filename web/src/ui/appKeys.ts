// Web only (no Android counterpart; there a hardware Esc is Back already):
// the computer keyboard's app-wide keys on a desktop, and the one slot a
// screen's own keys plug into (Live's, live/useLiveKeys). Pure, apart from
// that slot; useAppKeys listens and carries the commands out.
//
// - ? opens the Keyboard keys sheet (off fields, with nothing over the page).
// - Esc closes the full screen in front (Settings, Search, Contents, Compare,
//   Debug, the Guide), never a section, and never past the progress sheet;
//   with none, it goes to the screen's own keys (Live: leave EDIT, or stop).
// - Ctrl/Cmd+Z runs the message's UNDO while it shows, never in a field.
//
// Owners go first: element handlers and document listeners see a key before
// this layer's window listener, and a key they took (preventDefault, or a
// stopped propagation) never reaches it.

import { WebText } from '../core/text/webText'
import type { KeyInput } from './keyGuard'
import type { KeyRow, LiveContext } from './live/liveKeyboard'
import type { NavView } from './nav'

/** What the app layer reads of the app, for [appCommand]. */
export interface AppContext {
  view: NavView
  /** Back may close something (the progress sheet's guard isn't up). */
  canBack: boolean
  /** Settings → Computer keyboard: single keys act. */
  enabled: boolean
  /** The message on screen has an action (UNDO). */
  toastAction: boolean
}

export type AppCommand = 'help' | 'back' | 'undo'

/** Whether anything is over the page: a sheet, a dialog, the guide overlay, the section menu or a side panel. */
export function overlaid(v: NavView): boolean {
  return v.sheets.length !== 0 || v.dialogs.length !== 0 || v.coach || v.menu || v.side
}

/** Whether Esc closes a full screen: one is open and nothing is over it. */
export function escapeCloses(v: NavView): boolean {
  if (overlaid(v)) return false
  return v.settings || v.debug || v.search || v.guide || v.contentsId !== null || v.compare !== null
}

export function appCommand(input: KeyInput, ctx: AppContext): AppCommand | null {
  if (input.prevented || input.composing) return null
  const mod = input.ctrl || input.meta
  if (mod && !input.alt && !input.shift && (input.code === 'KeyZ' || input.key.toLowerCase() === 'z')) {
    return ctx.toastAction && !input.inField ? 'undo' : null
  }
  if (mod || input.alt) return null
  if (input.key === '?') return ctx.enabled && !input.inField && !overlaid(ctx.view) ? 'help' : null
  if (input.key === 'Escape' && !input.shift) return ctx.canBack && !input.inField && escapeCloses(ctx.view) ? 'back' : null
  return null
}

/** A screen's own keys (Live's), plugged into the app layer while it is in front. */
export interface KeyScopeHandler {
  /** A key down (single keys on, off fields, nothing over the page); true when it acted. */
  keydown(e: KeyboardEvent, input: KeyInput): boolean
  keyup(e: KeyboardEvent): void
  /** Esc that closed no screen; true when it did something. */
  escape(): boolean
  /** Lets go of every held key (focus left, Cmd held, the scope goes). */
  releaseAll(): void
  /** What Live shows, for the Keyboard keys sheet. */
  context(): LiveContext
}

let scope: KeyScopeHandler | null = null

/** Puts [handler] in the slot; the returned function takes it out (if it is still there). */
export function setKeyScope(handler: KeyScopeHandler): () => void {
  scope?.releaseAll()
  scope = handler
  return () => {
    if (scope === handler) {
      handler.releaseAll()
      scope = null
    }
  }
}

export function keyScope(): KeyScopeHandler | null {
  return scope
}

/** The Keyboard keys sheet's rows (pads, edit, grid, piano, everywhere). */
export const KEY_ROWS: readonly KeyRow[] = Object.freeze([
  { keys: ['7 8 9', '4 5 6', '1 2 3', '. 0 Enter'], label: WebText.KEY_PADS, scope: 'pads' },
  { keys: ['1–9', '0', '.'], label: WebText.KEY_PADS_ROW, scope: 'pads' },
  { keys: ['A', 'B', 'C', 'D'], label: WebText.KEY_GROUP, scope: 'pads' },
  { keys: ['V'], label: WebText.KEY_VIEW_PADS, scope: 'pads' },
  { keys: ['F'], label: WebText.KEY_FOLLOW, scope: 'pads' },
  { keys: ['M'], label: WebText.KEY_MODE, scope: 'pads' },
  { keys: ['E'], label: WebText.KEY_EDIT, scope: 'edit' },
  { keys: ['1–9', '0', '.', 'Enter'], label: WebText.KEY_EDIT_PAD, scope: 'edit' },
  { keys: ['/'], label: WebText.KEY_FIND, scope: 'edit' },
  { keys: ['1–9', '0', '.', 'Enter'], label: WebText.KEY_GRID, scope: 'grid' },
  { keys: ['Z', 'X'], label: WebText.KEY_OCTAVE, scope: 'grid' },
  { keys: ['[', ']'], label: WebText.KEY_ROOT, scope: 'grid' },
  { keys: ['Shift+[', 'Shift+]'], label: WebText.KEY_SCALE, scope: 'grid' },
  { keys: ['V'], label: WebText.KEY_VIEW_KEYS, scope: 'grid' },
  { keys: ['M'], label: WebText.KEY_MODE, scope: 'grid' },
  { keys: ['A W S E D F T G Y H U J K O L P ;'], label: WebText.KEY_PIANO, scope: 'piano' },
  { keys: ['Z', 'X'], label: WebText.KEY_OCTAVE, scope: 'piano' },
  { keys: ['[', ']'], label: WebText.KEY_ROOT, scope: 'piano' },
  { keys: ['Shift+[', 'Shift+]'], label: WebText.KEY_SCALE, scope: 'piano' },
  { keys: ['V'], label: WebText.KEY_VIEW_KEYS, scope: 'piano' },
  { keys: ['M'], label: WebText.KEY_MODE, scope: 'piano' },
  { keys: ['?'], label: WebText.KEY_HELP, scope: 'everywhere' },
  { keys: ['Esc'], label: WebText.KEY_ESCAPE, scope: 'everywhere' },
  { keys: ['Ctrl+Z', '⌘Z'], label: WebText.KEY_UNDO, scope: 'everywhere' },
] as KeyRow[])

/** One group of the sheet: a heading and its rows. */
export interface KeyGroup {
  readonly title: string
  readonly rows: readonly KeyRow[]
}

/**
 * What the Keyboard keys sheet lists: the keys that work now. [live] is what
 * Live shows when it is in front (null elsewhere); Everywhere comes last.
 */
export function keyHelp(live: LiveContext | null): KeyGroup[] {
  const of = (s: KeyRow['scope']): KeyRow[] => KEY_ROWS.filter((r) => r.scope === s)
  const groups: KeyGroup[] = []
  if (live !== null) {
    if (!live.keys) {
      groups.push({ title: WebText.KEYS_PADS, rows: of('pads').filter((r) => r.label !== WebText.KEY_FOLLOW || live.oneGroup) })
      if (live.editAvailable) groups.push({ title: WebText.KEYS_EDIT, rows: of('edit').filter((r) => r.label !== WebText.KEY_FIND || live.soundsTab) })
    } else if (live.pianoShown) {
      groups.push({ title: WebText.KEYS_PIANO, rows: of('piano').filter((r) => r.label !== WebText.KEY_VIEW_KEYS || live.viewSwitchable) })
    } else {
      groups.push({ title: WebText.KEYS_GRID, rows: of('grid').filter((r) => r.label !== WebText.KEY_VIEW_KEYS || live.viewSwitchable) })
    }
  }
  groups.push({ title: WebText.KEYS_EVERYWHERE, rows: of('everywhere') })
  return groups
}
