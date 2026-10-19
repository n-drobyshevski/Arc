// Web addition: a cap's [data-down] (theme/cap.css) for the pads, the grid's
// keys and the piano, kept for at least MIN_DOWN_MS from its press, so the
// quickest tap still shows the key bottomed out before its spring lets it up
// (Kotlin's KeyMotion.step keeps a let-go key down that long itself).
// An attribute set in the handler, not at the next render, so a key goes
// down with its sound; the clock is injectable for the tests.
import { MIN_DOWN_MS } from '../../core/features/keyMotion'

const since = new WeakMap<Element, number>()
const pending = new WeakMap<Element, ReturnType<typeof setTimeout>>()

/** [el] down; again while it's down, it keeps its first press's time. */
export function capDown(el: Element, now: number = performance.now()): void {
  const wait = pending.get(el)
  if (wait !== undefined) {
    clearTimeout(wait)
    pending.delete(el)
  }
  if (el.hasAttribute('data-down') && since.has(el)) return
  el.setAttribute('data-down', '')
  since.set(el, now)
}

/** [el] up, now or once it's been down MIN_DOWN_MS. */
export function capUp(el: Element, now: number = performance.now()): void {
  if (!el.hasAttribute('data-down') || pending.has(el)) return
  const left = (since.get(el) ?? -Infinity) + MIN_DOWN_MS - now
  since.delete(el)
  if (left <= 0) {
    el.removeAttribute('data-down')
    return
  }
  pending.set(el, setTimeout(() => {
    pending.delete(el)
    el.removeAttribute('data-down')
  }, left))
}
