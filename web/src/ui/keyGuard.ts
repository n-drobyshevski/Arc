// Web only (no Android counterpart): what a key press is aimed at, for the
// computer keyboard's single keys (live/useLiveKeys, useAppKeys, and the
// piano's letters in live/PianoKeyboard).
//
// A single key acts only off fields and dialogs, without Ctrl, Cmd or Alt,
// and not while an input method composes; on a control (a button, a tab)
// Enter keeps its own meaning.

/** Whether [t] is a field (typing) or inside a dialog or a list, where single keys don't act. */
export function inField(t: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(t instanceof Element)) return false
  if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true
  return t.closest('dialog, [role="dialog"], [role="alertdialog"], [role="listbox"]') !== null
}

/** Whether [t] is a control whose own Enter matters (a button, a link, a field, an ARIA widget). */
export function inControl(t: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(t instanceof Element)) return false
  return (
    t.closest(
      'button, a[href], input, select, textarea, [contenteditable=""], [contenteditable="true"], ' +
        '[role="button"], [role="tab"], [role="radio"], [role="option"], [role="checkbox"], [role="switch"], [role="slider"], [role="menuitem"]',
    ) !== null
  )
}

/** Just what the key layers read of a KeyboardEvent (tests build it by hand). */
export interface KeyInput {
  /** KeyboardEvent.code: the key's place, whatever the layout. */
  readonly code: string
  /** KeyboardEvent.key: what it types. */
  readonly key: string
  readonly shift: boolean
  readonly ctrl: boolean
  readonly meta: boolean
  readonly alt: boolean
  readonly repeat: boolean
  /** An input method is composing (or the key is a dead key). */
  readonly composing: boolean
  /** Someone before took the event (preventDefault). */
  readonly prevented: boolean
  /** The target is a field or inside a dialog ([inField]). */
  readonly inField: boolean
  /** The target is a control ([inControl]). */
  readonly onControl: boolean
}

/** Whether [e] comes while an input method composes, or is a dead key. */
export function composing(e: Pick<KeyboardEvent, 'isComposing' | 'key'>): boolean {
  return e.isComposing || e.key === 'Dead' || e.key === 'Process'
}

export function toKeyInput(e: KeyboardEvent): KeyInput {
  return {
    code: e.code,
    key: e.key,
    shift: e.shiftKey,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    alt: e.altKey,
    repeat: e.repeat,
    composing: composing(e),
    prevented: e.defaultPrevented,
    inField: inField(e.target),
    onControl: inControl(e.target),
  }
}
