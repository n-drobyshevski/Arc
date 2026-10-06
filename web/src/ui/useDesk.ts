// Web only (the Android app has no desktop window; its ArcWindow in
// ui/components/Window.kt picks layouts by the window's size the same way).
//
// The desktop layout's switch: true while the window is at least 1024px wide,
// the same breakpoint as every `@media (min-width: 1024px)` rule (theme/desk.css).
// Read synchronously on the first render, so the first paint already has the
// right layout, and followed through matchMedia's change event. False where
// matchMedia is missing (node tests, old browsers): the phone layout.
// Also the window's size and whether the pointer is fine, for Live's piano.
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

/** The window's size in CSS px, kept up to date (0 x 0 without a window). */
export function useWindowSize(): { width: number; height: number } {
  const read = (): { width: number; height: number } =>
    typeof window === 'undefined' ? { width: 0, height: 0 } : { width: window.innerWidth, height: window.innerHeight }
  const [size, setSize] = useState(read)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const on = (): void =>
      setSize((s) => {
        const n = read()
        return n.width === s.width && n.height === s.height ? s : n
      })
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return size
}

/** True while the main pointer is a fine one (a mouse or trackpad): Live's piano takes the computer keyboard then. */
export function useFinePointer(): boolean {
  const media = (): MediaQueryList | null =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: fine)') : null
  const [fine, setFine] = useState(() => media()?.matches ?? false)
  useEffect(() => {
    const m = media()
    if (!m) return
    const sync = (): void => setFine(m.matches)
    sync()
    m.addEventListener?.('change', sync)
    return () => m.removeEventListener?.('change', sync)
  }, [])
  return fine
}
