// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LivePunch.kt
//
// Punch-ins (an addition): while FX is held, the one-group pads play the
// twelve punch-in effects instead of their sounds.
//
// Web deltas:
// - A pad's touch is pointer events (each pointer its own press, captured so
//   a finger sliding off still holds it); a press is a PointerEvent's
//   pressure, which a mouse reports as 0.5 throughout (none to play with).
// - A screen reader's click is a click with no pointer (detail 0).
// - What the pads play is [PunchContext] (null: their sounds).

import { createContext } from 'preact'
import { useContext, useEffect, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { MirrorText } from '../../core/text/mirrorText'
import { tick } from '../../platform/haptics'
import { capDown, capUp } from './capDown'
import { PressureSense } from '../../state/pressure'
import './LivePunch.css'

export { PRESSURE_SPREAD, PUNCH_FLOOR, PressureSense, yDepth } from '../../state/pressure'

/**
 * The punch-ins on Live's pads while FX is held: [held] the slots down, in
 * the order pressed (the display line names them). A pad's press is
 * [onDown] at its depth, a finger moving [onMove], the lift [onUp]; several
 * pads held together play together. None of it starts a voice or goes into
 * the pattern.
 */
export interface PunchUi {
  readonly held: ReadonlySet<number>
  onDown(slot: number, depth: number): void
  onMove(slot: number, depth: number): void
  onUp(slot: number): void
  /** A light tick as a pad goes down (Settings → Haptics). */
  readonly haptic: boolean
}

/** The punch-ins while the pads play them (FX held on Live's pads), null while they play their sounds. */
export const PunchContext = createContext<PunchUi | null>(null)

/** The punch-ins, if the pads play them. */
export function usePunch(): PunchUi | null {
  return useContext(PunchContext)
}

// The pressures seen stay with the page, so a device's pressure is learned once.
const sense = new PressureSense()

/**
 * A pad while FX is held: punch-in [slot]'s name where the pad prints its
 * sound, "hold" at its foot; held (the slot down) the cap turns signal
 * orange, a thin bar at its foot as long as the depth. A screen reader's
 * click puts the punch-in in (all the way) until clicked again: there's no
 * finger to hold.
 */
export function PunchPad(props: { slot: number; punch: PunchUi; class?: string }): JSX.Element {
  const { slot, punch } = props
  const latest = useRef(punch)
  latest.current = punch
  const lit = punch.held.has(slot)
  // The fingers on the pad (pointer id), and the last one's depth for the bar (-1: none, or a click: all the way).
  const fingers = useRef(new Set<number>())
  const [depth, setDepth] = useState(-1)
  const btn = useRef<HTMLButtonElement>(null)
  // The pad leaving the screen (FX let go of, the pads back to their sounds) lifts what is held on it.
  useEffect(
    () => () => {
      if (fingers.current.size > 0) latest.current.onUp(slot)
      fingers.current.clear()
    },
    [slot],
  )
  const depthOf = (e: PointerEvent): number => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return sense.depth(e.pressure, e.clientY - r.top, r.height)
  }
  const lift = (e: PointerEvent): void => {
    if (!fingers.current.delete(e.pointerId)) return
    if (btn.current) capUp(btn.current)
    if (fingers.current.size === 0) latest.current.onUp(slot)
  }
  const shown = depth >= 0 ? depth : 1
  return (
    <button
      ref={btn}
      type="button"
      class={`live-pad cap-3d live-pad--big live-pad--press live-punch${lit ? ' is-held' : ''}${props.class ? ` ${props.class}` : ''}`}
      style={{ '--glow': lit ? 1 : 0 }}
      aria-label={MirrorText.punchDescription(slot)}
      aria-description={lit ? `${MirrorText.PUNCHED_IN}. ${MirrorText.PUNCH_OUT}` : MirrorText.PUNCH_IN}
      aria-pressed={lit}
      data-punch={slot}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        const d = depthOf(e)
        const first = fingers.current.size === 0
        fingers.current.add(e.pointerId)
        setDepth(d)
        capDown(e.currentTarget)
        if (first) latest.current.onDown(slot, d)
        else latest.current.onMove(slot, d)
        if (latest.current.haptic) tick()
      }}
      onPointerMove={(e) => {
        if (!fingers.current.has(e.pointerId)) return
        const d = depthOf(e)
        if (d === depth) return
        setDepth(d)
        latest.current.onMove(slot, d)
      }}
      onPointerUp={lift}
      onPointerCancel={lift}
      onLostPointerCapture={lift}
      onClick={(e) => {
        if (e.detail !== 0) return
        if (lit) {
          latest.current.onUp(slot)
        } else {
          setDepth(-1)
          latest.current.onDown(slot, 1)
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span class="live-punch__name">{MirrorText.punchName(slot).toUpperCase()}</span>
      {lit ? (
        <span class="live-punch__bar" aria-hidden="true">
          <span class="live-punch__fill" style={{ width: `${Math.round(Math.min(Math.max(shown, 0), 1) * 100)}%` }} />
        </span>
      ) : (
        <span class="live-punch__hold">{MirrorText.PUNCH_HOLD}</span>
      )}
    </button>
  )
}
