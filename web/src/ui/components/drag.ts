// Web only (no Android counterpart): a pointer followed from its press, and
// the keys a slider takes, shared by the FX sheet's XY pad and send faders
// (sheets/FxSheet.tsx) and the drawn EP-133's knobs and fader
// (live/DeviceControls.tsx). Kotlin's controls take a drag gesture and a
// screen reader's actions instead.

export const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1)

/**
 * Follows the pointer pressed in [e] on the element it was pressed on
 * (captured there): [move] with each of its moves, then [end] once it lets
 * go, or is taken away ([cancelled]).
 */
export function follow(e: PointerEvent, move: (ev: PointerEvent) => void, end?: (ev: PointerEvent, cancelled: boolean) => void): void {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture?.(e.pointerId)
  const moved = (ev: PointerEvent): void => {
    if (ev.pointerId === e.pointerId) move(ev)
  }
  const done = (ev: PointerEvent): void => {
    if (ev.pointerId !== e.pointerId) return
    el.removeEventListener('pointermove', moved)
    el.removeEventListener('pointerup', done)
    el.removeEventListener('pointercancel', done)
    end?.(ev, ev.type === 'pointercancel')
  }
  el.addEventListener('pointermove', moved)
  el.addEventListener('pointerup', done)
  el.addEventListener('pointercancel', done)
}

/** Follows one pointer from its press on [e]'s element: [at] with where it is, 0..1 across and up. */
export function drag(e: PointerEvent, at: (x: number, y: number) => void): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const to = (ev: PointerEvent): void => {
    at(r.width > 0 ? clamp01((ev.clientX - r.left) / r.width) : 0, r.height > 0 ? clamp01(1 - (ev.clientY - r.top) / r.height) : 0)
  }
  to(e)
  follow(e, to)
}

/** What a key does to a slider: steps up (+) or down (−), or goes to an end. */
export type SliderKey = { readonly step: number } | { readonly to: 'min' | 'max' }

/**
 * The slider keys, as ARIA's slider takes them: the arrows a step (up and
 * right up), PageUp and PageDown [page] steps, Home and End the ends; null
 * for any other key.
 */
export function sliderKey(key: string, page = 10): SliderKey | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return { step: 1 }
    case 'ArrowDown':
    case 'ArrowLeft':
      return { step: -1 }
    case 'PageUp':
      return { step: page }
    case 'PageDown':
      return { step: -page }
    case 'Home':
      return { to: 'min' }
    case 'End':
      return { to: 'max' }
    default:
      return null
  }
}
