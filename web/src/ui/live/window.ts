// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Window.kt (ArcWindow) and
// MirrorScreen.kt (liveInBar)
//
// The window Live lays itself out for: wider than tall is "landscape" (a phone
// on its side, or most computer windows), and under 480 high is "short" (a
// phone on its side, where the top bar is tight). Layout follows the window's
// size, not the device's orientation, so split screens and resized browser
// windows get what fits them.
//
// Web deltas:
// - Compose's BoxWithConstraints-provided ArcWindow is ui/useDesk.ts
//   useWindowSize (the window's inner size, followed through resize events);
//   the decisions here are pure functions, so they test without a DOM.
// - The desk (from 1024px wide, ui/useDesk.ts) keeps its own top bar however
//   low the window: callers ask [liveInBar] only off the desk, and the CSS
//   rules for a short window (TopBar.css, Toast.css) stop at 1023px.

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
