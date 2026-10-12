// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/SamplePanel.kt (PANEL_OPEN_MS,
// PANEL_HEADER_MS, PANEL_CLOSE_MS, PANEL_SWIPE_AT, PANEL_FLING, swipeLands, and
// panelSwipe's claim)
//
// The panels' motion and the swipe on Live's pads: SAMPLE, STEP and SCENE unroll
// from the display line in [PANEL_OPEN_MS] (the header fading in over the first
// [PANEL_HEADER_MS]); right to left across the pads opens SAMPLE, left to right
// closes it, once the finger has gone [PANEL_SWIPE_AT] of the way across or is
// flung past [PANEL_FLING].
//
// Web deltas: the motion is CSS keyframes run as a panel mounts (SamplePanel.css,
// StepPanel.css, ScenePanel.css; the times below are theirs); closing, the panel
// goes at once and the function keys come back over [PANEL_CLOSE_MS]. The swipe
// is MirrorScreen's pointer listeners over these pure checks; px stand in for dp.

/** The panel's unrolling opening (ms). */
export const PANEL_OPEN_MS = 300
/** The display line's words giving way to the panel's header, at the start of the opening (ms). */
export const PANEL_HEADER_MS = 120
/** The function keys coming back as the panel closes (ms). */
export const PANEL_CLOSE_MS = 240
/** How far across the pads (of their width) a swipe has to go to open or close the panel, if not flung. */
export const PANEL_SWIPE_AT = 0.3
/** A fling faster than this (px per second) the way that opens or closes the panel does so, however short. */
export const PANEL_FLING = 1000
/** How far a finger goes before it is a move and not a press (Android's touch slop, about 8 dp). */
export const TOUCH_SLOP = 8

/**
 * Whether a swipe opens (or closes) the panel: [travel] across the pads (of
 * their width) and [velocity] (px per second) the way it goes, both negative
 * the other way.
 */
export function swipeLands(travel: number, velocity: number): boolean {
  return travel >= PANEL_SWIPE_AT || velocity >= PANEL_FLING
}

/**
 * Whether a finger that has moved [dx], [dy] from where it went down is a
 * swipe: past the touch slop, more across than up or down, and the way that
 * does something (leftwards [opening], rightwards closing). False also when
 * it is not (yet) far enough to tell.
 */
export function swipeClaims(dx: number, dy: number, opening: boolean): boolean {
  if (Math.hypot(dx, dy) <= TOUCH_SLOP) return false
  if (Math.abs(dx) <= Math.abs(dy)) return false
  return opening ? dx < 0 : dx > 0
}

/** Whether a finger past the slop can no longer become a swipe (it went up, down or the other way). */
export function swipeRefused(dx: number, dy: number, opening: boolean): boolean {
  return Math.hypot(dx, dy) > TOUCH_SLOP && !swipeClaims(dx, dy, opening)
}
