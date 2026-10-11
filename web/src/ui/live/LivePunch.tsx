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
import './LivePunch.css'

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

/** The lightest a punch-in goes by where the finger is: the pad's foot (its top is 1). */
export const PUNCH_FLOOR = 0.15

/** How far apart a device's pressures must be before they count as pressure: a constant (or a jitter round it) is none. */
export const PRESSURE_SPREAD = 0.05

/** A punch-in's depth from where the finger is on its pad, [y] down a pad [height] tall: 1 at the top, [PUNCH_FLOOR] at the foot. */
export function yDepth(y: number, height: number): number {
  if (!(height > 0)) return 1
  const down = Math.min(Math.max(y / height, 0), 1)
  return 1 - down * (1 - PUNCH_FLOOR)
}

/**
 * What the screen makes of a touch's pressure: the lowest and highest it
 * has reported. A device that reports the same pressure for every touch
 * (a mouse's 0.5, many screens' 1) has none to play with, and the depth
 * comes from where the finger is ([yDepth]); once they have spread at least
 * [PRESSURE_SPREAD], a touch's pressure in that range is its depth, from
 * [PUNCH_FLOOR] to 1, as the finger presses harder or lighter.
 */
export class PressureSense {
  private low = Number.NaN
  private high = Number.NaN

  /** Whether the pressures seen vary enough to play with. */
  get varies(): boolean {
    return this.high - this.low >= PRESSURE_SPREAD
  }

  /** A touch's [pressure] seen (one that isn't a number is left out). */
  see(pressure: number): void {
    if (!Number.isFinite(pressure)) return
    this.low = Number.isNaN(this.low) ? pressure : Math.min(this.low, pressure)
    this.high = Number.isNaN(this.high) ? pressure : Math.max(this.high, pressure)
  }

  /** A touch's depth: its [pressure] (seen first) while pressures vary, else where it is, [y] down a pad [height] tall. */
  depth(pressure: number, y: number, height: number): number {
    const at = this.level(pressure)
    return at === null ? yDepth(y, height) : PUNCH_FLOOR + at * (1 - PUNCH_FLOOR)
  }

  /** Where [pressure] (seen first) is in the range seen, 0..1, while pressures vary; null while they don't. */
  level(pressure: number): number | null {
    this.see(pressure)
    if (!this.varies || !Number.isFinite(pressure)) return null
    return Math.min(Math.max((pressure - this.low) / (this.high - this.low), 0), 1)
  }
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
