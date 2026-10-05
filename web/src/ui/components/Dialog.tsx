// Port of the Material AlertDialog uses in app/src/main/kotlin/dev/arc/ep133/ui/screens/Sheets.kt
// (DeleteDialog) and screens/SettingsScreen.kt (ConfirmDialog): a centred card on the page
// colour with one sentence (body15, ink) and two text buttons at the end: Cancel (bold,
// graphite) and the action (bold, danger).
//
// A native modal <dialog>: Escape and a tap on the scrim call onDismiss (the
// caller closes it through the navigation stack, so Back does too). Focus
// starts on Cancel, the safe choice.
import type { JSX } from 'preact'
import { useEffect, useId, useLayoutEffect, useRef } from 'preact/hooks'
import { Strings } from '../../core/text/strings'
import './Dialog.css'

export interface DialogProps {
  open: boolean
  /** The question (Strings.deleteConfirm(title), SettingsText.pruneConfirm(n), ...). */
  text: string
  /** The action's label (Strings.DELETE, ...). */
  confirm: string
  /** The dismiss label (default Strings.CANCEL). */
  cancel?: string
  /** The action's colour (default var(--danger): every AlertDialog in arc confirms a deletion). */
  confirmColor?: string
  onConfirm: () => void
  onDismiss: () => void
}

export function Dialog(props: DialogProps): JSX.Element | null {
  const { open, text, confirm, cancel = Strings.CANCEL, confirmColor, onConfirm, onDismiss } = props
  const ref = useRef<HTMLDialogElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  const downOnScrim = useRef(false)
  const textId = `${useId()}-text`

  useLayoutEffect(() => {
    const d = ref.current
    if (!d || !open) return
    const active = document.activeElement
    const opener = active instanceof HTMLElement && active !== document.body && !d.contains(active) ? active : null
    if (!d.open) {
      try {
        d.showModal()
      } catch {
        d.setAttribute('open', '')
      }
    }
    cancelRef.current?.focus()
    // The <dialog> unmounts without close(), so focus is put back by hand.
    return () => {
      const now = document.activeElement
      if (opener?.isConnected && (now === null || now === document.body || !now.isConnected || d.contains(now))) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [open])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onCancel = (e: Event): void => {
      e.preventDefault()
      dismiss.current()
    }
    const onClose = (): void => dismiss.current()
    d.addEventListener('cancel', onCancel)
    d.addEventListener('close', onClose)
    return () => {
      d.removeEventListener('cancel', onCancel)
      d.removeEventListener('close', onClose)
    }
  }, [open])

  if (!open) return null
  return (
    <dialog
      ref={ref}
      class="arc-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={textId}
      onPointerDown={(e) => { downOnScrim.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnScrim.current) dismiss.current() }}
    >
      <div class="arc-dialog__card">
        <p id={textId} class="arc-dialog__text t-body15">{text}</p>
        <div class="arc-dialog__buttons">
          <button ref={cancelRef} type="button" class="arc-dialog__button t-bold" onClick={() => onDismiss()}>
            {cancel}
          </button>
          <button
            type="button"
            class="arc-dialog__button arc-dialog__button--confirm t-bold"
            style={confirmColor ? { color: confirmColor } : undefined}
            onClick={() => onConfirm()}
          >
            {confirm}
          </button>
        </div>
      </div>
    </dialog>
  )
}
