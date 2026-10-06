// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (ArcToast)
//
// A toast at the bottom of the screen: display background, displayInk 15/600,
// padding 14/16, radius 12, 16px from the edges, at most 528 wide. Errors get
// a 5px orange left border and stay 7000 ms instead of 3200 ms. The controller
// holds the message (state.toast); the toast calls onTimeout(id) (the
// controller's dismissToast) when its time is up. A new id restarts the timer.
// The last message stays rendered while the toast fades out.
//
// Web: a toast may carry a key (Live's UNDO, ToastMsg.action) at its end, in
// signal orange; it stays as long as an error, so there is time to press it.
//
// Swiping it sideways or down dismisses it at once, as with a notification
// (past 30% of its width sideways, half its height down, or a fling faster
// than 700 px/s that way); a shorter drag springs back. It fades as it leaves
// and never moves up (that would cover the page). Screen readers get a
// Dismiss key (Kotlin's custom accessibility action), shown when focused.
import type { CSSProperties, JSX, TargetedPointerEvent } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { SettingsText } from '../../core/text/settingsText'
import type { ToastMsg } from '../../state/types'
import type { ArcController } from '../../state/controller'
import './Toast.css'

export const TOAST_MS = 3200
export const ERROR_TOAST_MS = 7000
/** The fade (Compose fadeIn() / fadeOut() default tween). */
const FADE_MS = 150

/** How long a toast stays: longer for an error, or one with a key to press. */
export function toastDuration(error: boolean, action = false): number {
  return error || action ? ERROR_TOAST_MS : TOAST_MS
}

/** A fling faster than this (px/s, Kotlin 700.dp) dismisses the toast that way. */
export const TOAST_FLING = 700
/** How long the toast takes to leave once swiped away (Kotlin tween(160)). */
export const TOAST_LEAVE_MS = 160

/** Where a drag of the toast ended: how far (px, dy never negative) and how fast (px/s). */
export interface ToastDrag {
  readonly dx: number
  readonly dy: number
  readonly vx: number
  readonly vy: number
  /** The toast's size. */
  readonly width: number
  readonly height: number
}

/** What a finished drag does: 'side' or 'down' dismisses it that way, 'back' springs it back. */
export function swipeOutcome(d: ToastDrag): 'side' | 'down' | 'back' {
  const sideways = Math.abs(d.dx) > d.width * 0.3 || (Math.abs(d.vx) > TOAST_FLING && Math.abs(d.vx) > Math.abs(d.vy))
  const down = d.dy > d.height * 0.5 || (d.vy > TOAST_FLING && d.vy > Math.abs(d.vx))
  if (!sideways && !down) return 'back'
  // Off the way it was going (Kotlin: |dx| >= dy goes sideways).
  return Math.abs(d.dx) >= d.dy ? 'side' : 'down'
}

/** Where a dismissed toast goes: 1.2 widths sideways (the way it went) or 1.5 heights down. */
export function swipeTarget(way: 'side' | 'down', dx: number, width: number, height: number): { x: number; y: number } {
  if (way === 'side') return { x: dx < 0 ? -width * 1.2 : width * 1.2, y: 0 }
  return { x: 0, y: height * 1.5 }
}

/** The toast's opacity while dragged: it fades as it leaves, to 30%. */
export function swipeAlpha(dx: number, dy: number, width: number, height: number): number {
  const gone = Math.max(Math.abs(dx) / Math.max(1, width), dy / Math.max(1, height))
  return 1 - 0.7 * Math.min(1, Math.max(0, gone))
}

/** Finger speed over the last ~100 ms of samples (Compose VelocityTracker, roughly), in px/s. */
export function velocityOf(samples: readonly { t: number; x: number; y: number }[]): { vx: number; vy: number } {
  const last = samples[samples.length - 1]
  if (!last) return { vx: 0, vy: 0 }
  const first = samples.find((p) => last.t - p.t <= 100) ?? last
  const dt = last.t - first.t
  if (dt <= 0) return { vx: 0, vy: 0 }
  return { vx: ((last.x - first.x) / dt) * 1000, vy: ((last.y - first.y) / dt) * 1000 }
}

export interface ToastProps {
  toast: ToastMsg | null
  onTimeout: (id: number) => void
  /** The toast's key was pressed (ToastMsg.action). */
  onAction?: (id: number) => void
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
    const handle = window.setTimeout(() => timeout.current(toast.id), toastDuration(toast.error, toast.action !== undefined))
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
      <div class="toast-frame">
        <div role="status" aria-live="polite" aria-atomic="true" class="toast-live">
          {shown && (
            <ToastCard
              key={shown.id}
              toast={shown}
              visible={visible}
              onDismiss={(id) => timeout.current(id)}
              onAction={(id) => props.onAction?.(id)}
            />
          )}
        </div>
        {/* Outside the live region, so it is not read out with every message. */}
        {shown && visible && (
          <button type="button" class="toast__dismiss" onClick={() => timeout.current(shown.id)}>
            {SettingsText.DISMISS}
          </button>
        )}
      </div>
    </div>
  )
}

interface Drag {
  readonly x: number
  readonly y: number
  /** 'drag': follows the finger; 'back': springs home; 'gone': leaving. */
  readonly mode: 'rest' | 'drag' | 'back' | 'gone'
}

/** One message; its own drag state, so each toast starts in place. */
function ToastCard(props: {
  toast: ToastMsg
  visible: boolean
  onDismiss: (id: number) => void
  onAction: (id: number) => void
}): JSX.Element {
  const { toast, visible } = props
  const [drag, setDrag] = useState<Drag>({ x: 0, y: 0, mode: 'rest' })
  const el = useRef<HTMLDivElement | null>(null)
  const start = useRef<{ id: number; x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null)
  const samples = useRef<{ t: number; x: number; y: number }[]>([])
  const leave = useRef<number | null>(null)
  const dismiss = useRef(props.onDismiss)
  dismiss.current = props.onDismiss
  useEffect(() => () => {
    if (leave.current !== null) window.clearTimeout(leave.current)
  }, [])

  const size = (): { w: number; h: number } => {
    const r = el.current?.getBoundingClientRect()
    return { w: Math.max(1, r?.width ?? 1), h: Math.max(1, r?.height ?? 1) }
  }

  const onPointerDown = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    if (drag.mode === 'gone' || (e.pointerType === 'mouse' && e.button !== 0)) return
    // The key takes its own tap.
    if (e.target instanceof Element && e.target.closest('.toast__action')) return
    start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: drag.x, dy: drag.y, moved: false }
    samples.current = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }]
  }

  const onPointerMove = (e: TargetedPointerEvent<HTMLDivElement>): void => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    // Touch slop before it counts as a drag (a tap stays a tap).
    if (!s.moved) {
      if (Math.hypot(mx, my) < 8) return
      s.moved = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // The pointer is already gone.
      }
    }
    samples.current.push({ t: e.timeStamp, x: e.clientX, y: e.clientY })
    if (samples.current.length > 20) samples.current.shift()
    // Down only: up would cover the page.
    setDrag({ x: s.dx + mx, y: Math.max(0, s.dy + my), mode: 'drag' })
  }

  const onPointerEnd = (e: TargetedPointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    start.current = null
    if (!s.moved) return
    const { w, h } = size()
    const { vx, vy } = velocityOf(samples.current)
    const way = cancelled ? 'back' : swipeOutcome({ dx: drag.x, dy: drag.y, vx, vy, width: w, height: h })
    if (way === 'back') {
      setDrag({ x: 0, y: 0, mode: 'back' })
      return
    }
    const to = swipeTarget(way, drag.x, w, h)
    setDrag({ x: to.x, y: to.y, mode: 'gone' })
    leave.current = window.setTimeout(() => dismiss.current(toast.id), TOAST_LEAVE_MS)
  }

  const { w, h } = drag.mode === 'rest' ? { w: 1, h: 1 } : size()
  const moved = drag.x !== 0 || drag.y !== 0
  const style: CSSProperties | undefined = moved || drag.mode !== 'rest'
    ? { transform: `translate(${drag.x}px, ${drag.y}px)`, opacity: visible ? swipeAlpha(drag.x, drag.y, w, h) : 0 }
    : undefined
  return (
    <div
      ref={el}
      class={`toast${toast.error ? ' toast--error' : ''}${visible ? ' is-visible' : ''}${drag.mode === 'drag' ? ' is-dragging' : ''}${drag.mode === 'back' ? ' is-returning' : ''}${drag.mode === 'gone' ? ' is-leaving' : ''}`}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onPointerEnd(e, false)}
      onPointerCancel={(e) => onPointerEnd(e, true)}
      onTransitionEnd={() => {
        if (drag.mode === 'back') setDrag({ x: 0, y: 0, mode: 'rest' })
      }}
    >
      <span class="toast__text">{toast.text}</span>
      {toast.action !== undefined && (
        <button type="button" class="toast__action" onClick={() => props.onAction(toast.id)}>
          {toast.action}
        </button>
      )}
    </div>
  )
}

/** The app's toast, wired to the controller's toast state and dismissToast. */
export function ControllerToast(props: { controller: ArcController; bottomInset?: number }): JSX.Element {
  const c = props.controller
  return (
    <Toast
      toast={c.state.value.toast}
      onTimeout={(id) => c.dismissToast(id)}
      onAction={(id) => c.runToastAction(id)}
      bottomInset={props.bottomInset}
    />
  )
}
