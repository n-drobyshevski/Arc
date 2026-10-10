// Web only: Settings → Computer keyboard, the switch for every single key
// (the piano's letters, the pads, Live's letters, ? and /). Some people need
// single keys off (WCAG 2.1.4); Esc, Ctrl/Cmd+Z and the keys inside controls
// (arrows, Enter, Space) keep working.
//
// Kept under its own key in the page's storage (main.tsx: pageStorage, so in
// memory for ?demo), not in AppSettings: those are the Android app's
// settings, written to library.json as app.*, and Android has no computer
// keyboard. Another tab's change is followed ([followStorage]). Unreadable
// storage (a private window) means on.

import { signal, type ReadonlySignal } from '@preact/signals'
import type { KeyValueStorage } from '../platform/storage/settings'

export const COMPUTER_KEYS_KEY = 'arc.computerKeys'

let store: KeyValueStorage | null = null

function read(): boolean {
  try {
    return store?.getItem(COMPUTER_KEYS_KEY) !== 'off'
  } catch {
    return true
  }
}

const on = signal(true)

/** Whether single keys act (on unless switched off). */
export const computerKeys: ReadonlySignal<boolean> = on

/** Reads the switch from [storage] (the page's: memory for ?demo); until then it is on. */
export function initKeyPrefs(storage: KeyValueStorage): void {
  store = storage
  on.value = read()
}

export function setComputerKeys(value: boolean): void {
  on.value = value
  try {
    if (value) store?.removeItem(COMPUTER_KEYS_KEY)
    else store?.setItem(COMPUTER_KEYS_KEY, 'off')
  } catch {
    // Kept for this page only.
  }
}

/** Follows another tab's change (the window's storage event); not for ?demo, whose storage is its own. */
export function followStorage(win: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void {
  const onStorage = (e: StorageEvent): void => {
    if (e.key === null || e.key === COMPUTER_KEYS_KEY) on.value = read()
  }
  win.addEventListener('storage', onStorage)
  return () => win.removeEventListener('storage', onStorage)
}
