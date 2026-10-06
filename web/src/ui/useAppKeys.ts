// Web only: the computer keyboard's one window listener (appKeys has the
// rules). Mounted once in app.tsx's Root, on a desktop or with a fine pointer.
//
// Window listeners run last, so an element's own keys (a field, a dialog's
// Esc, the side panel's, the guide's) are done with a key before it gets here.
// Keys down go to the app's commands first, then (single keys on, off fields,
// nothing over the page) to the screen's own keys (appKeys setKeyScope);
// every key up goes to the screen, and leaving the window lets go of all.

import { useEffect, useRef } from 'preact/hooks'
import { appCommand, keyScope, overlaid } from './appKeys'
import { toKeyInput } from './keyGuard'
import { computerKeys } from './keyPrefs'
import type { NavView } from './nav'

export interface AppKeysHost {
  view: NavView
  canBack(): boolean
  /** The message's action (UNDO), when it shows one. */
  undo: (() => void) | null
  openHelp(): void
  back(): void
}

export function useAppKeys(enabled: boolean, host: AppKeysHost): void {
  const latest = useRef(host)
  latest.current = host
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const releaseAll = (): void => keyScope()?.releaseAll()
    const onDown = (e: KeyboardEvent): void => {
      // macOS sends no key up for a key let go while Cmd is down.
      if (e.metaKey || e.key === 'Meta') releaseAll()
      const input = toKeyInput(e)
      if (input.prevented || input.composing) return
      const h = latest.current
      const cmd = appCommand(input, { view: h.view, canBack: h.canBack(), enabled: computerKeys.peek(), toastAction: h.undo !== null })
      if (cmd !== null) {
        e.preventDefault()
        if (cmd === 'undo') h.undo?.()
        else if (cmd === 'help') h.openHelp()
        else h.back()
        return
      }
      if (overlaid(h.view) || input.inField) return
      const scope = keyScope()
      if (scope === null) return
      if (input.key === 'Escape') {
        // Once a press: a held Esc leaves EDIT, not then stop the sound too.
        if (input.repeat) {
          e.preventDefault()
          return
        }
        if (!input.ctrl && !input.meta && !input.alt && scope.escape()) e.preventDefault()
        return
      }
      if (!computerKeys.peek()) return
      scope.keydown(e, input)
    }
    const onUp = (e: KeyboardEvent): void => {
      if (e.key === 'Meta') releaseAll()
      keyScope()?.keyup(e)
    }
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') releaseAll()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', onHidden)
      releaseAll()
    }
  }, [enabled])
}
