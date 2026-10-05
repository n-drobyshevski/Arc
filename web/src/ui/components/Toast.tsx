// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (ArcToast)
//
// A toast at the bottom of the screen: display background, displayInk 15/600,
// padding 14/16, radius 12, 16px from the edges, at most 528 wide. Errors get
// a 5px orange left border and stay 7000 ms instead of 3200 ms. The controller
// holds the message (state.toast); the toast calls onTimeout(id) (the
// controller's dismissToast) when its time is up. A new id restarts the timer.
// The last message stays rendered while the toast fades out.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ToastMsg } from '../../state/types'
import type { ArcController } from '../../state/controller'
import './Toast.css'

export const TOAST_MS = 3200
export const ERROR_TOAST_MS = 7000
/** The fade (Compose fadeIn() / fadeOut() default tween). */
const FADE_MS = 150

export function toastDuration(error: boolean): number {
  return error ? ERROR_TOAST_MS : TOAST_MS
}

export interface ToastProps {
  toast: ToastMsg | null
  onTimeout: (id: number) => void
  /** Room left at the bottom (px), above anything docked there. */
  bottomInset?: number
}

export function Toast(props: ToastProps): JSX.Element {
  const { toast, onTimeout, bottomInset = 0 } = props
  const [shown, setShown] = useState<ToastMsg | null>(toast)
  const [visible, setVisible] = useState(toast !== null)
  const timeout = useRef(onTimeout)
  timeout.current = onTimeout
  const id = toast?.id ?? null

  // Show the new message and time it out.
  useEffect(() => {
    if (toast === null) {
      setVisible(false)
      return
    }
    setShown(toast)
    setVisible(true)
    const handle = window.setTimeout(() => timeout.current(toast.id), toastDuration(toast.error))
    return () => window.clearTimeout(handle)
  }, [id])

  // Drop the stale message once the fade-out is over.
  useEffect(() => {
    if (visible) return
    const handle = window.setTimeout(() => setShown(null), FADE_MS)
    return () => window.clearTimeout(handle)
  }, [visible])

  return (
    <div class="toast-host" style={bottomInset ? { paddingBottom: `calc(${bottomInset}px + env(safe-area-inset-bottom, 0px))` } : undefined}>
      {/* A persistent polite live region, so each new message is announced. */}
      <div role="status" aria-live="polite" aria-atomic="true" class="toast-live">
        {shown && (
          <div class={`toast${shown.error ? ' toast--error' : ''}${visible ? ' is-visible' : ''}`} key={shown.id}>
            <span class="toast__text">{shown.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** The app's toast, wired to the controller's toast state and dismissToast. */
export function ControllerToast(props: { controller: ArcController; bottomInset?: number }): JSX.Element {
  const c = props.controller
  return <Toast toast={c.state.value.toast} onTimeout={(id) => c.dismissToast(id)} bottomInset={props.bottomInset} />
}
