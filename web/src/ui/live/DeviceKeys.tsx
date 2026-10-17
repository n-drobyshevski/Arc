// The drawn EP-133's key layer in the page (web only: Android draws no
// device): the context app.tsx gives the device view (the layer, live/
// deviceKeys.ts, with what its pages show), and a drawn key's press on it.
//
// A drawn key goes down with the pointer and comes up with it, so a key is
// held as long as a finger or the mouse holds it (several fingers, several
// keys); a right-click holds it until the next one (lit, aria-pressed); Enter,
// Space and a screen reader's click are a tap. A press made with Shift held is
// SHIFT + the key. The feel is Live's function keys' (FunctionRow's
// useFeltPress: a tick under a finger, a longer buzz once held).
import { createContext, type ButtonHTMLAttributes } from 'preact'
import { useContext, useRef } from 'preact/hooks'
import type { FaderParam, FxType } from '../../core/features/fxSettings'
import type { PhysicalPad } from '../../core/features/padNotes'
import { useFeltPress } from './FunctionRow'
import type { DeviceKey, DeviceKeys, DevicePage } from './deviceKeys'

/** The drawn device's key layer and what its pages show, read as the device view renders (app.tsx's). */
export interface DeviceKeysUi {
  readonly layer: DeviceKeys
  /**
   * SOUND and EDIT's pad: the one played last (state.keysPad), its sound's
   * slot (the one − / + stepped to while its write waits) and name; null
   * with no pad played yet.
   */
  readonly selected: { readonly pad: PhysicalPad; readonly slot: number | null; readonly name: string | null } | null
  /** TIMING records on its grid (else free time: the display's FREE). */
  readonly quantize: boolean
  readonly fxType: FxType
  /** A group muted or soloed (the FX bus's): the display's MUTE. */
  readonly muted: boolean
  /** The groups the FX bus silences (their LEDs dark) and those soloed (theirs lit). */
  readonly silenced: ReadonlySet<number>
  readonly soloed: ReadonlySet<number>
  /** What each group's fader is assigned to (FADER + a pad; LEVEL by default): its pad's LED lights while FADER is held. */
  readonly faderAssign: readonly FaderParam[]
  /** The plate's page line tapped: arc's own sheet for [page] (the pad's, the tempo's, the FX sheet). */
  openSheet(page: DevicePage): void
}

export const DeviceKeysContext = createContext<DeviceKeysUi | null>(null)

export function useDeviceKeys(): DeviceKeysUi | null {
  return useContext(DeviceKeysContext)
}

type PressHandlers = Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerDown' | 'onPointerUp' | 'onPointerCancel' | 'onClick' | 'onContextMenu'>

/**
 * Drawn key [key]'s press on [layer]: down with the pointer (Shift held: with
 * SHIFT), up with it, a right-click held until the next, a click with no
 * pointer (Enter, Space, a screen reader) a tap. With no layer it rests.
 */
export function useLayerPress(layer: DeviceKeys | null, key: DeviceKey): ButtonHTMLAttributes<HTMLButtonElement> {
  const latest = useRef({ layer, key })
  latest.current = { layer, key }
  // The handlers read the latest props (a press may outlive the render it started in).
  const handlers: PressHandlers = {
    onPointerDown: (e) => {
      const l = latest.current
      if (e.button !== 0 || l.layer === null) return
      // No text selection or drag; the key still takes the focus, as a button pressed does.
      e.preventDefault()
      const el = e.currentTarget as HTMLElement
      el.focus({ preventScroll: true })
      el.setPointerCapture?.(e.pointerId)
      l.layer.down(l.key, e.timeStamp, e.shiftKey)
    },
    onPointerUp: (e) => {
      const l = latest.current
      l.layer?.up(l.key, e.timeStamp, e.shiftKey)
    },
    onPointerCancel: () => {
      const l = latest.current
      l.layer?.cancel(l.key)
    },
    onClick: (e) => {
      const l = latest.current
      if (e.detail === 0) l.layer?.tap(l.key, e.shiftKey)
    },
    onContextMenu: (e) => {
      e.preventDefault()
      const l = latest.current
      l.layer?.latch(l.key)
    },
  }
  return useFeltPress(handlers, layer !== null)
}
