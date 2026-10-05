// Web only (the Android app has no desktop window; its ArcWindow in
// ui/components/Window.kt picks layouts by the window's size the same way).
//
// The desktop layout's switch: true while the window is at least 1024px wide,
// the same breakpoint as every `@media (min-width: 1024px)` rule (theme/desk.css).
// Read synchronously on the first render, so the first paint already has the
// right layout, and followed through matchMedia's change event. False where
// matchMedia is missing (node tests, old browsers): the phone layout.
import { useEffect, useState } from 'preact/hooks'

/** The desktop breakpoint, as in the CSS (media queries cannot share a custom property). */
export const DESK_QUERY = '(min-width: 1024px)'

/** Just what useDesk reads of a MediaQueryList (old Safari has only addListener). */
export interface DeskMedia {
  readonly matches: boolean
  addEventListener?: (type: 'change', fn: () => void) => void
  removeEventListener?: (type: 'change', fn: () => void) => void
  addListener?: (fn: () => void) => void
  removeListener?: (fn: () => void) => void
}

/** The window's desktop query; null where matchMedia is missing. */
export function deskMedia(): DeskMedia | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(DESK_QUERY)
}

/** Whether the window is wide enough for the desktop layout now. */
export function isDesk(media: DeskMedia | null = deskMedia()): boolean {
  return media?.matches ?? false
}

/** True while the window is at least 1024px wide (re-renders when that changes). */
export function useDesk(): boolean {
  const [desk, setDesk] = useState(() => isDesk())
  useEffect(() => {
    const media = deskMedia()
    if (!media) return
    const sync = (): void => setDesk(media.matches)
    sync()
    if (media.addEventListener) {
      media.addEventListener('change', sync)
      return () => media.removeEventListener?.('change', sync)
    }
    media.addListener?.(sync)
    return () => media.removeListener?.(sync)
  }, [])
  return desk
}
