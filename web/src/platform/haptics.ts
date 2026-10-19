// Port of Live's haptic feedback in app/src/main/kotlin/dev/arc/ep133/ui/ (MirrorScreen.kt,
// PianoKeyboard.kt, LiveFunctionKeys.kt, LiveStep.kt, LiveSampler.kt, LiveArp.kt, LiveScene.kt,
// PatternLine.kt, components/Knob.kt, components/HoldKey.kt; HapticFeedbackType)
//
// A light tick when a pad or key goes down under a finger, after the press
// has been handed on (so the sound never waits for it), and only when
// AppSettings.haptics is on. Nothing on the release. Android's other
// feedback types are [Haptic]s: [buzz] plays one (ui/useHaptic.ts gates it
// on the setting).
//
// Web deltas:
// - navigator.vibrate(TICK_MS) stands in for performHapticFeedback. iOS
//   Safari has no vibration API, and desktop Chrome and Edge have one but no
//   motor behind it: [supported] wants the API and a touch screen, and
//   Settings hides the row elsewhere rather than show a switch that does
//   nothing.
// - The phone's own touch-feedback setting can't be read; a browser that
//   refuses (no tap yet, a policy) just doesn't vibrate.
// - Android's feedback types are the phone's own effects; here each is a
//   vibration pattern ([PATTERNS]): KeyboardTap and SegmentTick are the one
//   tick, LongPress a longer buzz, Confirm two short ones, Reject three, and
//   TextHandleMove (a knob's step) the shortest, at most one each
//   [HANDLE_GAP_MS] so a fast turn doesn't hum.

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

/**
 * Android's HapticFeedbackType, as used: [tick] KeyboardTap and SegmentTick,
 * [longPress] LongPress, [confirm] Confirm, [reject] Reject, [handle]
 * TextHandleMove.
 */
export type Haptic = 'tick' | 'longPress' | 'confirm' | 'reject' | 'handle'

/** Each [Haptic]'s vibration: ms on, or on / off / on … */
export const PATTERNS: Readonly<Record<Haptic, number | readonly number[]>> = {
  tick: TICK_MS,
  longPress: 30,
  confirm: [15, 40, 15],
  reject: [30, 30, 30],
  handle: 5,
}

/** The least time between two [handle]s, in ms. */
export const HANDLE_GAP_MS = 40

let lastHandle = -Infinity

/** One [kind] of feedback, where the browser can; never throws. [now]: the clock, for [handle]'s gap. */
export function buzz(kind: Haptic, nav: VibrateNavigator | undefined = browserNavigator(), now: number = Date.now()): void {
  if (!nav || typeof nav.vibrate !== 'function') return
  if (kind === 'handle') {
    if (now - lastHandle < HANDLE_GAP_MS) return
    lastHandle = now
  }
  const p = PATTERNS[kind]
  try {
    ;(nav.vibrate as (p: number | number[]) => boolean).call(nav, typeof p === 'number' ? p : [...p])
  } catch {
    // Refused (no tap yet, or a policy): nothing.
  }
}

/** One light tick, where the browser can; never throws. */
export function tick(nav: VibrateNavigator | undefined = browserNavigator()): void {
  buzz('tick', nav)
}
