// Web only: Settings → Computer keyboard, the switch for every single key
// (the piano's letters, the pads, Live's letters, ? and /). Some people need
// single keys off (WCAG 2.1.4); Esc, Ctrl/Cmd+Z and the keys inside controls
// (arrows, Enter, Space) keep working.
//
// Kept under its own localStorage key, not in AppSettings: those are the
// Android app's settings, written to library.json as app.*, and Android has
// no computer keyboard. Unreadable storage (a private window) means on.

import { signal, type ReadonlySignal } from '@preact/signals'

export const COMPUTER_KEYS_KEY = 'arc.computerKeys'

function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(COMPUTER_KEYS_KEY) !== 'off'
  } catch {
    return true
  }
}

const on = signal(read())

/** Whether single keys act (on unless switched off). */
export const computerKeys: ReadonlySignal<boolean> = on

export function setComputerKeys(value: boolean): void {
  on.value = value
  try {
    if (value) globalThis.localStorage?.removeItem(COMPUTER_KEYS_KEY)
    else globalThis.localStorage?.setItem(COMPUTER_KEYS_KEY, 'off')
  } catch {
    // Kept for this page only.
  }
}
