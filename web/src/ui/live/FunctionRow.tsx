// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LiveFunctionKeys.kt (FunctionRow, FunctionKey, beatBlink: TEMPO)
//
// Live's function keys as the EP-133 prints its two-tier keys: a dark cap
// with its word on the upper half and the lower half filled with a colour
// carrying a second word, under an LED and a printed label. A row over the
// pads (and the keys).
//
// Web deltas:
// - TEMPO alone so far: SOUND, PROJECT and FX come with their own rounds.
// - TEMPO's hold ([TEMPO_HOLD_MS], or a right-click) opens the tempo sheet;
//   Enter or Space is a tap.
// - The LED's blink is a CSS animation started on each beat when it is heard.
import { createContext, type ButtonHTMLAttributes, type JSX } from 'preact'
import { useContext, useEffect, useRef } from 'preact/hooks'
import { round as roundTempo, type Beat } from '../../core/features/tempo'
import { MirrorText } from '../../core/text/mirrorText'
import './FunctionRow.css'

/** TEMPO held this long opens the tempo sheet. */
export const TEMPO_HOLD_MS = 450

/** A beat further past than this when it comes doesn't blink. */
const STALE_BEAT_MS = 100

/** TEMPO as Live shows it (Kotlin FunctionKeysUi's TEMPO part). */
export interface TempoUi {
  /** The click on, and the phone's tempo. */
  readonly clickOn: boolean
  readonly bpm: number
  /** The EP-133's tempo while it sends MIDI clock: the one shown and followed. */
  readonly deviceBpm: number | null
  /** The last beat, with when it is heard (performance.now()): the LED blinks then. */
  readonly beat: Beat | null
  onClick(on: boolean): void
  /** TEMPO held: the tempo sheet. */
  onSheet(): void
}

/** TEMPO for Live's function row; null: none (no output with a click). */
export const TempoContext = createContext<TempoUi | null>(null)

/** The function keys over the pads (TEMPO so far); none without TEMPO. */
export function FunctionRow(props: { class?: string }): JSX.Element | null {
  const t = useContext(TempoContext)
  if (t === null) return null
  return (
    <div class={`fn-row${props.class ? ` ${props.class}` : ''}`}>
      <TempoKey t={t} />
    </div>
  )
}

/**
 * TEMPO: a tap turns the click on or off, a hold opens the tempo sheet.
 * While the EP-133 sends MIDI clock its tempo is the one shown (and the one
 * the click follows). Its LED blinks on each beat, longer on a bar's first.
 */
export function TempoKey(props: { t: TempoUi }): JSX.Element {
  const { t } = props
  const bpm = t.deviceBpm !== null ? roundTempo(t.deviceBpm) : t.bpm
  const led = useRef<HTMLSpanElement | null>(null)
  const press = useTempoPress(t)
  // The LED: lit when the beat is heard, fading in 110 ms (220 on a bar's first).
  const beat = t.beat
  useEffect(() => {
    if (beat === null || led.current === null) return
    const wait = beat.at - performance.now()
    if (wait < -STALE_BEAT_MS) return
    const el = led.current
    const go = (): void => {
      el.classList.remove('is-blink', 'is-blink-long')
      void el.offsetWidth
      el.classList.add(beat.accent ? 'is-blink-long' : 'is-blink')
    }
    if (wait <= 0) {
      go()
      return
    }
    const id = setTimeout(go, wait)
    return () => clearTimeout(id)
  }, [beat])
  return (
    <button
      type="button"
      class={`fn-key${t.clickOn ? ' is-lit' : ''}`}
      role="switch"
      aria-checked={t.clickOn}
      aria-label={MirrorText.CLICK}
      aria-description={`${MirrorText.clickState(t.clickOn, bpm, t.deviceBpm !== null)}. ${MirrorText.SET_TEMPO}: hold`}
      {...press}
    >
      <span class="fn-key__line" aria-hidden="true">
        <span ref={led} class="fn-key__led" />
        <span class="fn-key__label">{MirrorText.tempoValue(bpm).toUpperCase()}</span>
      </span>
      <span class="fn-key__cap cap-3d" aria-hidden="true">
        <span class="fn-key__word">{MirrorText.FN_TEMPO.toUpperCase()}</span>
        <span class="fn-key__sub fn-key__sub--signal">{MirrorText.FN_TEMPO_SUB.toUpperCase()}</span>
      </span>
    </button>
  )
}

/**
 * TEMPO's press, for any key that is TEMPO (the row's, the drawn EP-133's):
 * a tap turns the click on or off; held [TEMPO_HOLD_MS] (or right-clicked),
 * the tempo sheet. Enter or Space is a tap.
 */
export function useTempoPress(t: TempoUi): Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerDown' | 'onPointerUp' | 'onPointerCancel' | 'onClick' | 'onContextMenu'> {
  const latest = useRef(t)
  latest.current = t
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; spent: boolean; down: boolean }>({ timer: null, spent: false, down: false })
  const clear = (): void => {
    const h = hold.current
    if (h.timer !== null) clearTimeout(h.timer)
    hold.current = { timer: null, spent: false, down: false }
  }
  useEffect(() => clear, [])
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      clear()
      const h = hold.current
      h.down = true
      h.timer = setTimeout(() => {
        h.timer = null
        h.spent = true
        latest.current.onSheet()
      }, TEMPO_HOLD_MS)
    },
    onPointerUp: () => {
      const h = hold.current
      if (h.down && !h.spent) latest.current.onClick(!latest.current.clickOn)
      clear()
    },
    onPointerCancel: clear,
    onClick: (e) => {
      if (e.detail === 0) latest.current.onClick(!latest.current.clickOn)
    },
    onContextMenu: (e) => {
      e.preventDefault()
      clear()
      latest.current.onSheet()
    },
  }
}
