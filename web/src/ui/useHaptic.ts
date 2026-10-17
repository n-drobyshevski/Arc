// Web: Settings → Haptics for any part of the UI (Android passes `haptics` down
// to each composable and reads LocalHapticFeedback there).
//
// The app provides the setting once ([HapticsContext]); [useHaptic] gives a
// part the feedback it plays, a no-op while the setting is off.
// [onFingerDown] is a key's tick as Android's KeyboardTap on a press: a
// mouse's press has none (a computer has no motor, and a mouse's click is no
// finger's tap).
import { createContext } from 'preact'
import { useCallback, useContext } from 'preact/hooks'
import { buzz, type Haptic } from '../platform/haptics'

/** Whether Settings → Haptics is on. */
export const HapticsContext = createContext(false)

/** Plays a [Haptic] while Settings → Haptics is on. */
export function useHaptic(): (kind: Haptic) => void {
  const on = useContext(HapticsContext)
  return useCallback((kind: Haptic) => {
    if (on) buzz(kind)
  }, [on])
}

/** Whether a pointer's press is a finger's (or a pen's), which ticks. */
export const fingerPress = (e: { pointerType: string }): boolean => e.pointerType !== 'mouse'

/**
 * A tick under a finger pressing a key (Kotlin's KeyboardTap on a key's
 * press): for a key's own onPointerDown, or a panel's onPointerDownCapture,
 * where it ticks for the key the press lands on (any button not disabled).
 */
export function useFingerTick(): (e: PointerEvent) => void {
  const feel = useHaptic()
  return useCallback((e: PointerEvent) => {
    if (e.button !== 0 || !fingerPress(e)) return
    const key = e.target instanceof Element ? e.target.closest('button') : null
    if (key === null || key.disabled || key.getAttribute('aria-disabled') === 'true') return
    feel('tick')
  }, [feel])
}
