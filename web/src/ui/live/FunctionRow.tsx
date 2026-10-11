// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LiveFunctionKeys.kt (FunctionRow, FunctionKeys, FunctionKey, ProjectHold, beatBlink)
//
// Live's function keys as the EP-133 prints its two-tier keys: a dark cap
// with its word on the upper half and the lower half filled with a colour
// carrying a second word, under an LED and a printed label. SOUND, PROJECT,
// TEMPO and FX in a row over the pads (and the keys).
//
// Web deltas:
// - A key's hold is [FN_HOLD_MS] (Compose's long-press time); a right-click
//   is a hold (FX: punch-ins on until clicked again, as a screen reader's
//   long click is on Android); Enter or Space is a tap.
// - No column on a phone on its side: the row shows on upright pages only.
// - TEMPO's LED blink is a CSS animation started on each beat when it is heard.
import { createContext, type ButtonHTMLAttributes, type JSX } from 'preact'
import { useContext, useEffect, useRef } from 'preact/hooks'
import { signal, type ReadonlySignal } from '@preact/signals'
import { round as roundTempo, type Beat } from '../../core/features/tempo'
import { MirrorText } from '../../core/text/mirrorText'
import './FunctionRow.css'

/** A function key held this long is held (Compose's long-press time). */
export const FN_HOLD_MS = 450
/** TEMPO's hold (the same). */
export const TEMPO_HOLD_MS = FN_HOLD_MS

/** A beat further past than this when it comes doesn't blink. */
const STALE_BEAT_MS = 100

/** The EP-133's projects (Device.PROJECT_COUNT). */
const PROJECT_COUNT = 9

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

/** TEMPO for Live's function row and the drawn EP-133; null: none (no output with a click). */
export const TempoContext = createContext<TempoUi | null>(null)

/** SOUND: Live's EDIT, and the sheet of the pad played last. */
export interface SoundUi {
  /** EDIT on (in PADS): a tap on a pad gives it another sound. */
  readonly editOn: boolean
  /** Whether SOUND does anything here (Live's own page). */
  readonly enabled: boolean
  /** A tap: EDIT on or off (from KEYS: the pads, EDIT on). */
  onTap(): void
  /** Held: the sheet of the pad played last. */
  onHold(): void
}

/** PROJECT as its key shows it (Kotlin ProjectKeyUi), and what it does. */
export interface ProjectUi {
  /** The project shown (null: none known yet). */
  readonly shown: number | null
  /** Its screen reader state (MirrorText.projectKeyState, with why it is greyed out). */
  readonly state: string
  readonly enabled: boolean
  /** The device is switching to a project asked for: the LED is on. */
  readonly switching: boolean
  /** A tap: the next project. */
  onStep(): void
  /** Held and let go of with no pick: the project sheet. */
  onPick(): void
  /** Held and a pad printed 1 to 9 tapped: that project. */
  onSelect(n: number): void
}

/** FX as its key shows it, and what it does. */
export interface FxKeyUi {
  /** The effect on, as the key's label names it ("DELAY", "OFF"). */
  readonly label: string
  /** The effect's name for screen readers. */
  readonly name: string
  /** An effect is on: the LED is lit. */
  readonly on: boolean
  /** FX held: the pads play the punch-ins. */
  readonly held: boolean
  /** A tap: the FX sheet. */
  onSheet(): void
  /** Held down (true) and let go of (false). */
  onHold(down: boolean): void
}

/** SOUND, PROJECT and FX for Live's function row (TEMPO is [TempoContext]); each null where it has nothing to do. */
export interface FunctionKeysUi {
  readonly sound: SoundUi | null
  readonly project: ProjectUi | null
  readonly fx: FxKeyUi | null
}

export const FunctionKeysContext = createContext<FunctionKeysUi | null>(null)

/**
 * PROJECT held, as the EP-133 picks a project: while [held], a pad or a KEYS
 * key printed 1 to 9 goes to that project instead of sounding, and the
 * others ('.', 0, ENTER) stay still. Let go of PROJECT: a pick made meanwhile
 * is all it does; else a short press steps on and a long one opens the
 * project sheet. A press taken keeps its release too, so nothing lets go of a
 * sound it never started.
 */
export class ProjectHold {
  private readonly _held = signal(false)
  /** PROJECT is held. */
  readonly held: ReadonlySignal<boolean> = this._held
  private picked = false
  private readonly taken = new Set<string | number>()

  down(): void {
    this._held.value = true
    this.picked = false
  }

  /** PROJECT let go of; [long]: held past the long-press time. */
  up(long: boolean, p: ProjectUi): void {
    if (!this._held.peek()) return
    this._held.value = false
    if (this.picked) return
    if (long) p.onPick()
    else p.onStep()
  }

  /** PROJECT's press slid off or went with its key: nothing. */
  cancel(): void {
    this._held.value = false
  }

  /** A press on [key] printed [label] (a pad's digit): true when PROJECT takes it. */
  press(key: string | number, label: string, p: ProjectUi | null): boolean {
    if (!this._held.peek() || p === null) return false
    this.taken.add(key)
    const n = /^[1-9]$/.test(label) ? Number(label) : null
    if (n === null || n > PROJECT_COUNT) return true
    this.picked = true
    p.onSelect(n)
    return true
  }

  /** [key] let go of: true when its press was taken. */
  release(key: string | number): boolean {
    return this.taken.delete(key)
  }
}

/** PROJECT's hold, shared by the row's key and the pads it takes. */
export const ProjectHoldContext = createContext<ProjectHold | null>(null)

/** The function keys over the pads; none when none has anything to do. */
export function FunctionRow(props: { class?: string }): JSX.Element | null {
  const tempo = useContext(TempoContext)
  const keys = useContext(FunctionKeysContext)
  const hold = useContext(ProjectHoldContext)
  if (tempo === null && (keys === null || (keys.sound === null && keys.project === null && keys.fx === null))) return null
  return (
    <div class={`fn-row${props.class ? ` ${props.class}` : ''}`}>
      {keys?.sound && <SoundKey s={keys.sound} />}
      {keys?.project && hold && <ProjectKey p={keys.project} hold={hold} />}
      {tempo && <TempoKey t={tempo} />}
      {keys?.fx && <FxKey f={keys.fx} />}
    </div>
  )
}

type PressHandlers = Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerDown' | 'onPointerUp' | 'onPointerCancel' | 'onClick' | 'onContextMenu'>

/**
 * A key whose tap does one thing and whose hold ([FN_HOLD_MS], or a
 * right-click) another, the hold acting as it comes (TEMPO, SOUND).
 * Enter or Space is a tap.
 */
export function useTapHold(onTap: () => void, onHold: () => void, enabled = true): PressHandlers {
  const latest = useRef({ onTap, onHold, enabled })
  latest.current = { onTap, onHold, enabled }
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; spent: boolean; down: boolean }>({ timer: null, spent: false, down: false })
  const clear = (): void => {
    const h = hold.current
    if (h.timer !== null) clearTimeout(h.timer)
    hold.current = { timer: null, spent: false, down: false }
  }
  useEffect(() => clear, [])
  return {
    onPointerDown: (e) => {
      if (e.button !== 0 || !latest.current.enabled) return
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      clear()
      const h = hold.current
      h.down = true
      h.timer = setTimeout(() => {
        h.timer = null
        h.spent = true
        latest.current.onHold()
      }, FN_HOLD_MS)
    },
    onPointerUp: () => {
      const h = hold.current
      if (h.down && !h.spent) latest.current.onTap()
      clear()
    },
    onPointerCancel: clear,
    onClick: (e) => {
      if (e.detail === 0 && latest.current.enabled) latest.current.onTap()
    },
    onContextMenu: (e) => {
      e.preventDefault()
      clear()
      if (latest.current.enabled) latest.current.onHold()
    },
  }
}

/**
 * TEMPO's press, for any key that is TEMPO (the row's, the drawn EP-133's):
 * a tap turns the click on or off; held (or right-clicked), the tempo sheet.
 */
export function useTempoPress(t: TempoUi): PressHandlers {
  const latest = useRef(t)
  latest.current = t
  return useTapHold(
    () => latest.current.onClick(!latest.current.clickOn),
    () => latest.current.onSheet(),
  )
}

/**
 * One two-tier key: [word] on the dark cap's upper half, [sub] on its lower
 * half (signal or light), under its LED ([led]) and [label], in ink while
 * [lit]. [held]: the upper half lit signal (FX held). Greyed out when not [enabled].
 */
function FnKey(props: {
  word: string
  sub: string
  signal?: boolean
  label: string
  lit: boolean
  led: boolean
  ledRef?: { current: HTMLSpanElement | null }
  held?: boolean
  enabled?: boolean
  attrs: ButtonHTMLAttributes<HTMLButtonElement>
}): JSX.Element {
  const enabled = props.enabled ?? true
  return (
    <button
      type="button"
      class={`fn-key${props.lit ? ' is-lit' : ''}${props.held ? ' is-held' : ''}`}
      aria-disabled={enabled ? undefined : true}
      {...props.attrs}
    >
      <span class="fn-key__line" aria-hidden="true">
        <span ref={props.ledRef} class={`fn-key__led${props.led ? ' is-on' : ''}`} />
        <span class="fn-key__label">{props.label.toUpperCase()}</span>
      </span>
      <span class="fn-key__cap cap-3d" aria-hidden="true">
        <span class="fn-key__word">{props.word.toUpperCase()}</span>
        <span class={`fn-key__sub${props.signal ? ' fn-key__sub--signal' : ''}`}>{props.sub.toUpperCase()}</span>
      </span>
    </button>
  )
}

/** SOUND: Live's EDIT on or off (from KEYS: the pads, EDIT on); held, the sheet of the pad played last. */
export function SoundKey(props: { s: SoundUi }): JSX.Element {
  const { s } = props
  const press = useTapHold(
    () => s.onTap(),
    () => s.onHold(),
    s.enabled,
  )
  return (
    <FnKey
      word={MirrorText.FN_SOUND}
      sub={MirrorText.EDIT_TAB}
      label={s.editOn ? MirrorText.EDIT_TAB : MirrorText.MODE_PADS}
      lit={s.editOn}
      led={s.editOn}
      enabled={s.enabled}
      attrs={{
        role: 'switch',
        'aria-checked': s.editOn,
        'aria-label': MirrorText.FN_SOUND,
        'aria-description': `${MirrorText.SOUND_SHEET}: hold`,
        ...press,
      }}
    />
  )
}

/**
 * PROJECT: steps to the next project; held, a pad 1 to 9 picks one, or let
 * go of, the project sheet. Its light is on while it is held and while the
 * device switches.
 */
export function ProjectKey(props: { p: ProjectUi; hold: ProjectHold }): JSX.Element {
  const { p, hold } = props
  const latest = useRef(p)
  latest.current = p
  const downAt = useRef<number | null>(null)
  const held = hold.held.value
  return (
    <FnKey
      word={MirrorText.FN_PROJECT}
      sub={MirrorText.FN_PROJECT_SUB}
      label={p.shown !== null ? MirrorText.projectShort(p.shown) : '–'}
      lit={p.switching || held}
      led={p.switching || held}
      enabled={p.enabled}
      attrs={{
        'aria-label': MirrorText.FN_PROJECT,
        'aria-description': `${p.state}. ${MirrorText.PROJECT_NEXT}; ${MirrorText.PICK_PROJECT}: hold`,
        onPointerDown: (e) => {
          if (e.button !== 0 || !latest.current.enabled) return
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          downAt.current = e.timeStamp
          hold.down()
        },
        onPointerUp: (e) => {
          const at = downAt.current
          downAt.current = null
          if (at === null) return
          hold.up(e.timeStamp - at >= FN_HOLD_MS, latest.current)
        },
        onPointerCancel: () => {
          downAt.current = null
          hold.cancel()
        },
        onClick: (e) => {
          if (e.detail === 0 && latest.current.enabled) latest.current.onStep()
        },
        onContextMenu: (e) => {
          e.preventDefault()
          if (latest.current.enabled) latest.current.onPick()
        },
      }}
    />
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
    <FnKey
      word={MirrorText.FN_TEMPO}
      sub={MirrorText.FN_TEMPO_SUB}
      signal
      label={MirrorText.tempoValue(bpm)}
      lit={t.clickOn}
      led={false}
      ledRef={led}
      attrs={{
        role: 'switch',
        'aria-checked': t.clickOn,
        'aria-label': MirrorText.CLICK,
        'aria-description': `${MirrorText.clickState(t.clickOn, bpm, t.deviceBpm !== null)}. ${MirrorText.SET_TEMPO}: hold`,
        ...press,
      }}
    />
  )
}

/**
 * FX: a tap opens the FX sheet; held, the pads play the punch-ins until it
 * lets go (its upper half lit meanwhile). A right-click (Android: a screen
 * reader's long click) turns the punch-ins on and off instead.
 */
export function FxKey(props: { f: FxKeyUi }): JSX.Element {
  const { f } = props
  const latest = useRef(f)
  latest.current = f
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; down: boolean; held: boolean }>({ timer: null, down: false, held: false })
  const end = (): void => {
    const h = press.current
    if (h.timer !== null) clearTimeout(h.timer)
    if (h.held) latest.current.onHold(false)
    press.current = { timer: null, down: false, held: false }
  }
  useEffect(() => end, [])
  return (
    <FnKey
      word={MirrorText.FN_FX}
      sub={MirrorText.FN_FX_SUB}
      label={f.label}
      lit={f.on || f.held}
      led={f.on || f.held}
      held={f.held}
      attrs={{
        'aria-label': MirrorText.FX_EFFECTS,
        'aria-description': `${f.name}. ${MirrorText.FX_SHEET}; ${MirrorText.PUNCH_INS}: hold`,
        'aria-pressed': f.held,
        onPointerDown: (e) => {
          if (e.button !== 0) return
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          end()
          const h = press.current
          h.down = true
          h.timer = setTimeout(() => {
            h.timer = null
            h.held = true
            latest.current.onHold(true)
          }, FN_HOLD_MS)
        },
        onPointerUp: () => {
          const h = press.current
          const tap = h.down && !h.held
          end()
          if (tap) latest.current.onSheet()
        },
        onPointerCancel: end,
        onClick: (e) => {
          if (e.detail === 0) latest.current.onSheet()
        },
        onContextMenu: (e) => {
          e.preventDefault()
          end()
          latest.current.onHold(!latest.current.held)
        },
      }}
    />
  )
}
