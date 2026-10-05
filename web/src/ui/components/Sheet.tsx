// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (ArcSheet)
//
// A bottom sheet over a scrim: the web version's <dialog class="sheet">. The
// panel rises 40px and fades in over 220 ms (SheetEasing); the scrim fades in.
// At 640px and wider it is a centred dialog with all corners rounded. Max
// height 92%, scrolls inside; padding 18 / top 10 (22 without the grip) /
// bottom 22; 16px between children; a 40×5 grip in keyEdge.
//
// [onDismiss] null makes it modal (the progress sheet): Escape and the scrim do
// nothing. Otherwise both call onDismiss, which is expected to close the sheet
// through the navigation stack (so the browser Back closes it too).
//
// The content stays mounted, showing what it last showed, until the close
// transition is over (Root's "last X" pattern), so callers may pass null
// content data once [open] is false.
import type { ComponentChildren, JSX, TargetedMouseEvent, TargetedPointerEvent } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import './Sheet.css'

export interface SheetProps {
  open: boolean
  /** Null: modal (no Escape, no scrim tap). */
  onDismiss: (() => void) | null
  /** The grip bar at the top (default true; the progress sheet has none). */
  grip?: boolean
  /** Accessible name of the dialog. */
  label?: string
  /** Id of the element naming the dialog (instead of [label]). */
  labelledBy?: string
  class?: string
  children?: ComponentChildren
}

/** The close transition (opacity only; ArcSheet has ExitTransition.None, so it is kept short). */
export const SHEET_EXIT_MS = 120

type Phase = 'closed' | 'open' | 'closing'

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function Sheet(props: SheetProps): JSX.Element | null {
  const { open, onDismiss, grip = true } = props
  const ref = useRef<HTMLDialogElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'closed')
  // The content last shown while open, for the close transition.
  const last = useRef<ComponentChildren>(null)
  if (open) last.current = props.children
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  const openRef = useRef(open)
  openRef.current = open

  // What had focus before the sheet opened; it gets it back once the sheet is gone.
  const opener = useRef<HTMLElement | null>(null)
  // Closes the <dialog> while it is still in the document (the browser then
  // restores focus itself), before it unmounts.
  const finish = (): void => {
    const d = ref.current
    if (d?.open) {
      try {
        d.close()
      } catch {
        // Leave it.
      }
    }
    const back = opener.current
    opener.current = null
    const active = document.activeElement
    if (back?.isConnected && (active === null || active === document.body || (d !== null && d.contains(active)))) {
      back.focus({ preventScroll: true })
    }
    setPhase('closed')
  }

  // Follow [open]: open at once, close after the transition.
  useEffect(() => {
    if (open) {
      setPhase('open')
      return
    }
    if (phase === 'closed') return
    if (reducedMotion()) {
      finish()
      return
    }
    setPhase('closing')
    const t = window.setTimeout(finish, SHEET_EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open])

  // The <dialog>'s own state: showModal while open or closing, close() after.
  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    if (phase !== 'closed' && !d.open) {
      if (opener.current === null && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        opener.current = document.activeElement
      }
      try {
        d.showModal()
      } catch {
        d.setAttribute('open', '')
      }
      // Start on the panel, not its first field: showModal would focus a text
      // field (and raise the soft keyboard) whenever the content fits without
      // scrolling. ArcSheet focuses nothing.
      if (!d.querySelector('[autofocus]')) panelRef.current?.focus({ preventScroll: true })
    } else if (phase === 'closed' && d.open) {
      d.close()
    }
  }, [phase])

  // Escape: never let the browser close it behind our back; ask instead.
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onCancel = (e: Event): void => {
      e.preventDefault()
      if (openRef.current) dismiss.current?.()
    }
    // Some browsers close anyway (a repeated Escape without user activation).
    const onClose = (): void => {
      if (!openRef.current) return
      if (dismiss.current) dismiss.current()
      else {
        try {
          d.showModal()
        } catch {
          // Leave it.
        }
      }
    }
    d.addEventListener('cancel', onCancel)
    d.addEventListener('close', onClose)
    return () => {
      d.removeEventListener('cancel', onCancel)
      d.removeEventListener('close', onClose)
    }
  }, [phase === 'closed'])

  // A press that starts and ends on the scrim (not a drag out of the panel) dismisses.
  const downOnScrim = useRef(false)

  if (phase === 'closed') return null

  const onPointerDown = (e: TargetedPointerEvent<HTMLDialogElement>): void => {
    downOnScrim.current = e.target === e.currentTarget
  }
  const onClick = (e: TargetedMouseEvent<HTMLDialogElement>): void => {
    if (e.target === e.currentTarget && downOnScrim.current && openRef.current) dismiss.current?.()
  }

  const content = open ? props.children : last.current
  return (
    <dialog
      ref={ref}
      class={`sheet${phase === 'closing' ? ' sheet--closing' : ''}${onDismiss ? '' : ' sheet--modal'}${props.class ? ` ${props.class}` : ''}`}
      aria-label={props.labelledBy ? undefined : props.label}
      aria-labelledby={props.labelledBy}
      aria-modal="true"
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <div ref={panelRef} tabIndex={-1} class={`sheet__panel${grip ? '' : ' sheet__panel--no-grip'}`}>
        {grip && <div class="sheet__grip" aria-hidden="true" />}
        {content}
      </div>
    </dialog>
  )
}
