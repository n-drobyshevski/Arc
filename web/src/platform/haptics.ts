// Port of the pads' haptic tick in app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt
// and PianoKeyboard.kt (HapticFeedbackType.KeyboardTap)
//
// A light tick when a pad or key goes down under a finger, after the press
// has been handed on (so the sound never waits for it), and only when
// AppSettings.haptics is on. Nothing on the release.
//
// Web deltas:
// - navigator.vibrate(TICK_MS) stands in for performHapticFeedback. iOS
//   Safari has no vibration API, and desktop Chrome and Edge have one but no
//   motor behind it: [supported] wants the API and a touch screen, and
//   Settings hides the row elsewhere rather than show a switch that does
//   nothing.
// - The phone's own touch-feedback setting can't be read; a browser that
//   refuses (no tap yet, a policy) just doesn't vibrate.

/** How long the tick buzzes, in ms: as short as the motor still feels. */
export const TICK_MS = 10

/** The bits of navigator used here. */
export interface VibrateNavigator {
  vibrate?: unknown
  /** How many touch points the screen takes (0 without a touch screen). */
  maxTouchPoints?: number
}

const browserNavigator = (): VibrateNavigator | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as unknown as VibrateNavigator)

/** Whether the main pointer is a finger (CSS pointer: coarse). */
function coarsePointer(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

/**
 * Whether this browser can vibrate (Settings shows the Haptics row
 * only then): the API, on a touch screen ([coarse]: whether the main pointer
 * is a finger), as desktop Chromium has the API without a motor.
 */
export function supported(nav: VibrateNavigator | undefined = browserNavigator(), coarse: () => boolean = coarsePointer): boolean {
  return typeof nav?.vibrate === 'function' && ((nav.maxTouchPoints ?? 0) > 0 || coarse())
}

/** One light tick, where the browser can; never throws. */
export function tick(nav: VibrateNavigator | undefined = browserNavigator()): void {
  if (!nav || typeof nav.vibrate !== 'function') return
  try {
    ;(nav.vibrate as (ms: number) => boolean).call(nav, TICK_MS)
  } catch {
    // Refused (no tap yet, or a policy): no tick.
  }
}
