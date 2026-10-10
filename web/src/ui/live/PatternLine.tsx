// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PatternLine.kt
// (TransportChips, RecordChip, PlayChip, PatternWords, patternTrack, patternFrame)
//
// The pattern on Live's display line: ● RECORD and ▶ PLAY as one segmented
// key, the words while it is on (armed: what PLAY will do; counting in: the
// beat, big; playing: the counter), and the frame while it plays (a signal
// border while recording, the loop's hairline along the foot).
//
// Web deltas:
// - RECORD's press waits to be a tap while stopped or armed: held
//   [RECORD_HOLD_MS], it opens the pattern sheet (as Compose's long press);
//   a right-click opens it too. Enter or Space is a tap.
// - The frame time is requestAnimationFrame's; the counter re-renders once a
//   beat, the hairline is moved straight on its element each frame.
// - No ERASE, ↶, STEP, CORRECT or scene keys on the line yet; no measuring of
//   what fits (the counter keeps its room, RECORD's word only where [word]).
import { createContext, type ButtonHTMLAttributes, type ComponentChildren, type JSX } from 'preact'
import { useContext, useEffect, useRef, useState } from 'preact/hooks'
import type { PatternPosition } from '../../core/features/sequencer'
import { BEATS_PER_BAR } from '../../core/features/tempo'
import type { TransportState } from '../../core/features/transport'
import { MirrorText } from '../../core/text/mirrorText'
import type { PatternUiState } from '../../state/patternPlan'
import './PatternLine.css'

/** RECORD held this long while stopped or armed opens the pattern sheet. */
export const RECORD_HOLD_MS = 450

/** PATTERN as Live's line shows it, and what its keys do (Kotlin TransportUi). */
export interface TransportUi {
  readonly ui: PatternUiState
  /** Where the focus group's pattern is heard at a performance.now() ms; null while stopped. */
  readonly position: (ms: number) => PatternPosition | null
  onRecordDown(at: number): void
  onRecordUp(at: number): void
  onPlay(recordHeld: boolean): void
  /** RECORD held: the pattern sheet. */
  onSheet(): void
}

/** Where the focus group is, a beat at a time. */
interface LineBeat {
  readonly bar: number
  readonly beat: number
  readonly bars: number
}

const stateOf = (ui: PatternUiState): TransportState => ({ phase: ui.phase, recording: ui.recording })
const running = (ui: PatternUiState): boolean => ui.phase === 'PLAYING' || ui.phase === 'COUNT_IN'
/** RECORD is lit while it records, and armed while it waits for PLAY or counts a recording in. */
const recordLive = (ui: PatternUiState): boolean => ui.recording && ui.phase === 'PLAYING'
const recordArmed = (ui: PatternUiState): boolean => ui.phase === 'ARMED' || (ui.phase === 'COUNT_IN' && ui.recording)

/** Whether the pattern has words for the line (armed, counting in or playing). */
export function hasWords(ui: PatternUiState): boolean {
  return ui.phase !== 'STOPPED'
}

/**
 * The frame time while the pattern runs, as [read] gives it from it, kept
 * only when it changes (a beat's position, not every frame). [still]
 * (screenshots) keeps the first value.
 */
function useRunning<T>(on: boolean, still: boolean, read: (ms: number) => T, same: (a: T, b: T) => boolean): T {
  const readRef = useRef(read)
  readRef.current = read
  const [value, setValue] = useState(() => read(performance.now()))
  useEffect(() => {
    setValue(readRef.current(performance.now()))
    if (!on || still) return
    let frame = 0
    let last = readRef.current(performance.now())
    const tick = (): void => {
      const v = readRef.current(performance.now())
      if (!same(v, last)) {
        last = v
        setValue(v)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [on, still])
  return value
}

const beatOf = (p: PatternPosition | null): LineBeat | null => (p === null ? null : { bar: p.bar, beat: p.beat, bars: p.bars })
const sameBeat = (a: LineBeat | null, b: LineBeat | null): boolean =>
  a === b || (a !== null && b !== null && a.bar === b.bar && a.beat === b.beat && a.bars === b.bars)

/**
 * ● RECORD and ▶ PLAY as one segmented key ([compact]: their glyphs alone;
 * RECORD's word only with [word]). RECORD: dim while off, its light blinking
 * while armed (and while a recording counts in), its cell filled signal while
 * it records. PLAY: ▶ while stopped, ■ while the pattern runs. The key's
 * border is signal while RECORD is armed or records, else the display's ink
 * while the pattern runs. [still] keeps the light from blinking.
 */
/** Where the focus group is, a beat at a time, while the pattern plays (or counts in); null while stopped. */
export function usePatternBeat(t: TransportUi, still = false): LineBeat | null {
  return useRunning(running(t.ui), still, (ms) => beatOf(t.position(ms)), sameBeat)
}

/** The line's words as text: armed, what PLAY will do; counting in, the beat ("3 / 4"); playing, the counter; null while stopped. */
export function patternWordsText(ui: PatternUiState, beat: LineBeat | null): string | null {
  switch (ui.phase) {
    case 'ARMED':
      return MirrorText.patternArmed(ui.timing)
    case 'COUNT_IN':
      return `${ui.countIn ?? 1} ${MirrorText.countInOf(BEATS_PER_BAR)}`
    case 'PLAYING': {
      const b = beat ?? { bar: 1, beat: 1, bars: ui.bars[ui.focusGroup] ?? 1 }
      return ui.recording ? MirrorText.patternRecording(b.bar, b.beat, b.bars, ui.timing) : MirrorText.patternPosition(b.bar, b.beat, b.bars)
    }
    case 'STOPPED':
      return null
  }
}

/**
 * RECORD's and PLAY's presses (Kotlin RecordChip's and PlayChip's gestures),
 * for any key that is them (the line's, the drawn device's): RECORD's press
 * waits to be a tap while stopped or armed (held, the sheet), and goes at once
 * while the pattern runs (held, it records while held); PLAY with RECORD
 * down starts recording at once.
 */
export function useTransportPress(t: TransportUi): {
  record: Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerDown' | 'onPointerUp' | 'onPointerCancel' | 'onClick' | 'onContextMenu'>
  play: Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerDown' | 'onClick'>
} {
  const latest = useRef(t)
  latest.current = t
  // RECORD's press: when it went down, whether it was sent, and whether a hold spent it on the sheet.
  const hold = useRef<{ downAt: number | null; sent: boolean; spent: boolean; timer: ReturnType<typeof setTimeout> | null }>({
    downAt: null,
    sent: false,
    spent: false,
    timer: null,
  })
  const reset = (): void => {
    const h = hold.current
    if (h.timer !== null) clearTimeout(h.timer)
    hold.current = { downAt: null, sent: false, spent: false, timer: null }
  }
  useEffect(() => reset, [])
  return {
    record: {
      onPointerDown: (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        const at = e.timeStamp
        const phase = latest.current.ui.phase
        // Stopped or armed, a hold opens the sheet: the press waits to be a tap. Running, it goes at once.
        const waits = phase === 'STOPPED' || phase === 'ARMED'
        reset()
        const h = hold.current
        h.downAt = at
        h.sent = !waits
        if (!waits) {
          latest.current.onRecordDown(at)
          return
        }
        h.timer = setTimeout(() => {
          h.timer = null
          if (h.sent) return
          h.spent = true
          latest.current.onSheet()
        }, RECORD_HOLD_MS)
      },
      onPointerUp: (e) => {
        const h = hold.current
        if (h.downAt === null) return
        if (!h.spent) {
          if (!h.sent) latest.current.onRecordDown(h.downAt)
          latest.current.onRecordUp(e.timeStamp)
        }
        reset()
      },
      onPointerCancel: (e) => {
        const h = hold.current
        // A press taken away before its lift is nothing; one sent goes up.
        if (h.downAt !== null && h.sent && !h.spent) latest.current.onRecordUp(e.timeStamp)
        reset()
      },
      onClick: (e) => {
        // Enter, Space or a screen reader's tap: a tap.
        if (e.detail !== 0) return
        const now = performance.now()
        latest.current.onRecordDown(now)
        latest.current.onRecordUp(now)
      },
      onContextMenu: (e) => {
        e.preventDefault()
        reset()
        latest.current.onSheet()
      },
    },
    play: {
      onPointerDown: (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        // With RECORD down (waiting to be a tap), it goes first: RECORD + PLAY starts recording at once.
        const h = hold.current
        const held = h.downAt
        if (held !== null && !h.sent) {
          h.sent = true
          latest.current.onRecordDown(held)
        }
        latest.current.onPlay(held !== null)
      },
      onClick: (e) => {
        if (e.detail === 0) latest.current.onPlay(false)
      },
    },
  }
}

/** RECORD's state as the key and the device's light show it: filled while it records, blinking while armed. */
export function recordLight(ui: PatternUiState): 'live' | 'armed' | null {
  return recordLive(ui) ? 'live' : recordArmed(ui) ? 'armed' : null
}

/** Whether the pattern runs (counts in or plays): PLAY is lit. */
export function patternRuns(ui: PatternUiState): boolean {
  return running(ui)
}

/** RECORD's and PLAY's names for screen readers. */
export function recordName(ui: PatternUiState): string {
  return MirrorText.recordDescription(stateOf(ui))
}
export function playName(ui: PatternUiState, beat: LineBeat | null): string {
  return MirrorText.playDescription(stateOf(ui), beat?.bar ?? 1, beat?.bars ?? ui.bars[ui.focusGroup] ?? 1)
}

/**
 * ● RECORD and ▶ PLAY as one segmented key ([compact]: their glyphs alone;
 * RECORD's word only with [word]). RECORD: dim while off, its light blinking
 * while armed (and while a recording counts in), its cell filled signal while
 * it records. PLAY: ▶ while stopped, ■ while the pattern runs. The key's
 * border is signal while RECORD is armed or records, else the display's ink
 * while the pattern runs. [still] keeps the light from blinking.
 */
export function TransportKeys(props: { t: TransportUi; compact?: boolean; still?: boolean; word?: boolean }): JSX.Element {
  const { t } = props
  const ui = t.ui
  const press = useTransportPress(t)
  const live = recordLive(ui)
  const armed = recordArmed(ui)
  const run = running(ui)
  const beat = usePatternBeat(t, props.still === true)
  const cls = [
    'transport-keys',
    props.compact ? 'transport-keys--compact' : '',
    live || armed ? 'is-signal' : run ? 'is-lit' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div class={cls} role="group" aria-label={MirrorText.PATTERN}>
      <button
        type="button"
        class={`transport-key transport-key--record${live ? ' is-filled' : ''}${armed ? ' is-armed' : ''}${props.still ? ' is-still' : ''}`}
        aria-label={recordName(ui)}
        aria-description={MirrorText.RECORD_HOLD}
        {...press.record}
      >
        <span class="transport-key__dot" aria-hidden="true" />
        {props.word && !props.compact && <span class="transport-key__word" aria-hidden="true">{MirrorText.RECORD.toUpperCase()}</span>}
      </button>
      <span class="transport-keys__divide" aria-hidden="true" />
      <button type="button" class="transport-key transport-key--play" aria-label={playName(ui, beat)} {...press.play}>
        <span class={run ? 'transport-key__stop' : 'transport-key__play'} aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * The line's words while the pattern is on: armed, what PLAY will do;
 * counting in, the beat big ("3 / 4"); playing, the counter ("2.3 / 4", the
 * grid too while recording). Read as one polite live region that changes
 * with the transport only, not on every beat.
 */
export function PatternWords(props: { t: TransportUi; compact?: boolean; still?: boolean }): JSX.Element {
  const { t } = props
  const ui = t.ui
  const beat = usePatternBeat(t, props.still === true)
  let words: JSX.Element
  switch (ui.phase) {
    case 'ARMED':
      words = <span class="pattern-words__note">{MirrorText.patternArmed(ui.timing)}</span>
      break
    case 'COUNT_IN':
      words = (
        <>
          <span class={`pattern-words__count${props.compact ? ' pattern-words__count--compact' : ''}`}>{ui.countIn ?? 1}</span>
          <span class="pattern-words__num">{MirrorText.countInOf(BEATS_PER_BAR)}</span>
        </>
      )
      break
    case 'PLAYING': {
      const b = beat ?? { bar: 1, beat: 1, bars: ui.bars[ui.focusGroup] ?? 1 }
      words = (
        <span class="pattern-words__num">
          {ui.recording ? MirrorText.patternRecording(b.bar, b.beat, b.bars, ui.timing) : MirrorText.patternPosition(b.bar, b.beat, b.bars)}
        </span>
      )
      break
    }
    case 'STOPPED':
      words = <></>
  }
  return (
    <div class="pattern-words">
      <span class="sr-only" aria-live="polite">
        {MirrorText.transportAnnouncement(stateOf(ui))}
      </span>
      <span class="pattern-words__shown" aria-hidden="true">
        {words}
      </span>
    </div>
  )
}

/**
 * The line's frame while the pattern plays: a signal border while it
 * records, and the loop's hairline along its foot (signal while recording,
 * the display's ink while playing), moved each frame; a beat at a time with
 * reduced motion or [still]. Laid over its line (position: relative).
 */
export function PatternFrame(props: { t: TransportUi; still?: boolean }): JSX.Element | null {
  const { t } = props
  const ui = t.ui
  const fill = useRef<HTMLSpanElement | null>(null)
  const latest = useRef(t)
  latest.current = t
  const playing = ui.phase === 'PLAYING'
  useEffect(() => {
    if (!playing) return
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const set = (): void => {
      const p = latest.current.position(performance.now())
      if (p === null || fill.current === null) return
      const f = reduce || props.still ? ((p.bar - 1) * BEATS_PER_BAR + p.beat - 1) / (p.bars * BEATS_PER_BAR) : p.fraction
      fill.current.style.transform = `scaleX(${Math.min(Math.max(f, 0), 1)})`
    }
    set()
    if (props.still) return
    let frame = 0
    const tick = (): void => {
      set()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, props.still])
  if (!playing) return null
  const rec = ui.recording
  return (
    <span class={`pattern-frame${rec ? ' is-recording' : ''}`} aria-hidden="true">
      <span class="pattern-frame__track">
        <span ref={fill} class="pattern-frame__fill" />
      </span>
    </span>
  )
}

/** The pattern Live's display lines show; null: none (no output to play it on, or not Live). */
export const TransportContext = createContext<TransportUi | null>(null)

/**
 * The pattern's part of a display line (Kotlin PatternLine): its keys first,
 * its words in place of the line's own ([children]) while it has some, and
 * its frame over the line, which is position: relative. Without a pattern,
 * the line's own words alone.
 */
export function PatternLine(props: { compact?: boolean; still?: boolean; word?: boolean; children?: ComponentChildren }): JSX.Element {
  const t = useContext(TransportContext)
  if (t === null) return <>{props.children}</>
  return (
    <>
      <TransportKeys t={t} compact={props.compact} still={props.still} word={props.word} />
      {hasWords(t.ui) ? <PatternWords t={t} compact={props.compact} still={props.still} /> : props.children}
      <PatternFrame t={t} still={props.still} />
    </>
  )
}
