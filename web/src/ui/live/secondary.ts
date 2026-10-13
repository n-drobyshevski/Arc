// Web: a Live key's second action, as Android's CustomAccessibilityAction on
// the pads, KEYS' keys and the piano's (MirrorScreen.kt holdToPlay /
// tapToEdit, PianoKeyboard.kt): Play in SAMPLE (a pad with a sound) and in
// EDIT, Pick to nudge with STEP's panel open.
//
// TalkBack lists custom actions; a browser has no such list, so the second
// action is a key of its own on the focused key: Shift+Enter (named in
// aria-keyshortcuts), or the keyboard's context-menu key (or Shift+F10), and
// aria-description names it after what a click does.

/** The second action's key, as aria-keyshortcuts and the descriptions name it. */
export const SECONDARY_KEYS = 'Shift+Enter'

/** Whether [e] asks a focused key for its second action. */
export function isSecondaryKey(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return false
  return (e.key === 'Enter' && e.shiftKey) || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)
}

/** A key's description: what a click does ([primary]), then its second action's name and key, if it has one. */
export function describe(primary: string, secondary: string | null): string {
  return secondary === null ? primary : `${primary}. ${secondary}: ${SECONDARY_KEYS}`
}

/** aria-keyshortcuts for a key with [own] (its computer key, if any) and a second action or not. */
export function shortcuts(own: string | undefined, secondary: boolean): string | undefined {
  const all = [own, secondary ? SECONDARY_KEYS : undefined].filter((k): k is string => k !== undefined)
  return all.length > 0 ? all.join(' ') : undefined
}
