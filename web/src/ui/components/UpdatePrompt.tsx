// The app-update toast (PWA; no Android counterpart: Play Store updates replace the app).
//
// Registers the service worker (pwa.ts) and shows ArcToast's look with a Reload
// key once a new version is waiting. The prompt keeps out of the way of the
// work: it stays hidden while a transfer runs (the progress sheet is up then
// anyway) and while one of the controller's own toasts shows, and Reload
// itself waits for the transfer to end - a reload mid-restore would leave the
// EP-133 half written. "Later" hides it for this visit; the new version then
// starts with the next visit, once every arc tab is closed.
//
// The first install's "works offline" message goes through the controller's
// toast, like every other message.
import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { WebText } from '../../core/text/webText'
import { applyUpdate, clearOfflineReady, needRefresh, offlineReady, registerPwa } from '../../pwa'
import type { ArcController } from '../../state/controller'
import type { UiState } from '../../state/types'
import { useController } from '../AppContext'
import { Key } from './Key'
import './Toast.css'
import './UpdatePrompt.css'

/** No text module has these sentences yet (webText.ts has UPDATE_READY / UPDATE_RELOAD). */
export const OFFLINE_READY = 'arc is ready to work offline.'
export const UPDATE_LATER = 'Later'

/** No transfer or other device work is running: a reload is safe. */
export function isIdle(s: UiState): boolean {
  return s.task === null && !s.busy
}

/**
 * After a transfer ends, the UI closes the progress sheet with a history step
 * (ui/nav.ts), and a navigation started after a reload cancels the reload. So
 * a reload that waited for a transfer waits this much longer for the UI to settle.
 */
export const SETTLE_MS = 500

/** Runs [run] now when the controller is idle, otherwise once it is and the UI has settled. */
export function whenIdle(c: ArcController, run: () => void): void {
  if (isIdle(c.state.peek())) {
    run()
    return
  }
  const off = c.store.subscribe((s) => {
    if (!isIdle(s)) return
    off()
    setTimeout(() => whenIdle(c, run), SETTLE_MS)
  })
}

export function UpdatePrompt(): JSX.Element | null {
  const c = useController()
  const [later, setLater] = useState(false)
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    registerPwa({ whenIdle: (run) => whenIdle(c, run) })
  }, [c])

  const ready = offlineReady.value
  useEffect(() => {
    if (!ready) return
    clearOfflineReady()
    c.toast(OFFLINE_READY)
  }, [ready])

  const state = c.state.value
  const shown = needRefresh.value && !later && isIdle(state) && state.toast === null
  if (!shown && !reloading) return null
  return (
    <div class="toast-host update-prompt-host">
      <div role="status" aria-live="polite" aria-atomic="true" class="toast-live">
        <div class="toast is-visible update-prompt">
          <span class="toast__text update-prompt__text">{WebText.UPDATE_READY}</span>
          <span class="update-prompt__keys">
            <Key
              text={UPDATE_LATER}
              variant="quiet"
              size="small"
              textColor="var(--display-dim)"
              disabled={reloading}
              onClick={() => setLater(true)}
            />
            <Key
              text={WebText.UPDATE_RELOAD}
              variant="signal"
              size="small"
              disabled={reloading}
              onClick={() => {
                setReloading(true)
                applyUpdate()
              }}
            />
          </span>
        </div>
      </div>
    </div>
  )
}
