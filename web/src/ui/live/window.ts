// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Window.kt
//
// The window Live lays itself out for: wider than tall is "landscape" (a phone
// on its side, or most computer windows), and under 480 high is "short" (a
// phone on its side, where the top bar is tight). Layout follows the window's
// size, not the device's orientation, so split screens and resized browser
// windows get what fits them.
//
// Web delta: Compose's BoxWithConstraints-provided ArcWindow is a hook on the
// window's inner size (resize events), and the decisions are pure functions
// so they test without a DOM.
import { useEffect, useState } from 'preact/hooks'

export interface ArcWindow {
  readonly width: number
  readonly height: number
}

/** Wider than tall. */
export const landscape = (w: ArcWindow): boolean => w.width > w.height

/** Under 480 high: the top bar tightens and Live's display line moves into it. */
export const short = (w: ArcWindow): boolean => w.height < 480

/** The narrowest window whose top bar takes Live's display line: its middle is still about 200 wide. */
export const LIVE_PILL_WINDOW = 600

/**
 * Whether Live's display line sits in the top bar: a short window wider than
 * tall, a phone on its side, with room in the bar's middle for the line to
 * read (not a narrow split screen: there it stays on the page).
 */
export function liveInBar(w: ArcWindow): boolean {
  return landscape(w) && short(w) && w.width >= LIVE_PILL_WINDOW
}

const now = (): ArcWindow =>
  typeof window === 'undefined' ? { width: 412, height: 843 } : { width: window.innerWidth, height: window.innerHeight }

/** The window's inner size, updated as it is resized or turned. */
export function useArcWindow(): ArcWindow {
  const [w, setW] = useState(now)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const on = (): void => setW((prev) => {
      const next = now()
      return prev.width === next.width && prev.height === next.height ? prev : next
    })
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  return w
}
