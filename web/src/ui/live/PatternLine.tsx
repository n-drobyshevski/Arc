// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PatternLine.kt
// (PatternLine, PatternRow's fit, TransportChips, RecordChip, PlayChip,
// SceneStepKeys, EditChips, PatternWords, patternTrack, patternFrame)
//
// The pattern on Live's display line: ● RECORD and ▶ PLAY as one segmented
// key, the words while it is on (armed: what PLAY will do; counting in: the
// beat, big; playing: the counter), and the frame while it plays (a signal
// border while recording, the loop's hairline along the foot).
//
// Web deltas:
// - RECORD's press waits to be a tap while stopped or armed: held
//   [RECORD_HOLD_MS], it opens the pattern sheet (as Compose's long press);
//   a right-click opens it too. Enter or Space is a tap. The drawn EP-133's
//   RECORD (DeviceView) shares the press, and can end it when another key
//   takes it (− / + with RECORD held set the length: [useTransportPress]'s
//   cancelRecord).
// - The frame time is requestAnimationFrame's; the counter re-renders once a
//   beat, the hairline is moved straight on its element each frame.
// - What fits is measured on the line's content width (lineFit.ts), read
//   from the line PatternLine sits in with a ResizeObserver; unlaid out (no
//   width), everything shows. STEP's and CORRECT's cells are StepPanel.tsx's
//   StepCell and CorrectKey, the scene's ScenePanel.tsx's SceneCell.
import { createContext, type ButtonHTMLAttributes, type ComponentChildren, type JSX } from 'preact'
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { PatternPosition } from '../../core/features/sequencer'
import { BEATS_PER_BAR } from '../../core/features/tempo'
import type { TransportState } from '../../core/features/transport'
import { MirrorText } from '../../core/text/mirrorText'
import type { PatternUiState } from '../../state/patternPlan'
import { canvasMeasure, lineFit, stepFit, stepRowFit, WIDE_LINE, type LineFit, type LineState, type LineWords, type Measure, type StepFit, type TakeWords } from './lineFit'
import { SceneCell, sceneReadout, useScene, worthSaying } from './ScenePanel'
import { CorrectKey, StepCell, useStep } from './StepPanel'
import { TakeBadge, type TakeUi } from './Takes'
import { coachAttrs } from '../components/Coach'
import { useHaptic } from '../useHaptic'
import { useSpoken } from './spoken'
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
  /** ERASE on or off. */
  onErase(on: boolean): void
  /** ↶: back to before the last pass recorded, erase, clear or length change. */
  onUndo(): void
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

/** Whether the pattern has words for the line (armed, counting in, playing, or erasing). */
export function hasWords(ui: PatternUiState): boolean {
  return ui.phase !== 'STOPPED' || ui.erase
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
      return ui.erase ? MirrorText.ERASE_NOTE : null
  }
}

/**
 * RECORD's and PLAY's presses (Kotlin RecordChip's and PlayChip's gestures),
 * for any key that is them (the line's, the drawn device's): RECORD's press
 * waits to be a tap while stopped or armed (held, the sheet), and goes at once
 * while the pattern runs (held, it records while held); PLAY with RECORD
 * down starts recording at once. [cancelRecord] ends a RECORD press another
 * key took (the drawn device's − / + set the length with it held): one still
 * waiting does nothing, one sent comes up.
 */
export function useTransportPress(t: TransportUi): {
  record: Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerDown' | 'onPointerUp' | 'onPointerCancel' | 'onClick' | 'onContextMenu'>
  play: Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerDown' | 'onClick'>
  cancelRecord(): void
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
    cancelRecord: () => {
      const h = hold.current
      if (h.downAt !== null && h.sent && !h.spent) latest.current.onRecordUp(performance.now())
      // Its lift is nothing now.
      reset()
    },
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
        {...coachAttrs('live.record', props.compact)}
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
export function PatternWords(props: { t: TransportUi; compact?: boolean; still?: boolean; corrected?: string | null }): JSX.Element {
  const { t } = props
  const ui = t.ui
  const beat = usePatternBeat(t, props.still === true)
  // CORRECT's count said at most once a second (Kotlin PatternWords' spoken(corrected)).
  const counted = useSpoken(props.corrected ?? '')
  const count = props.corrected ? counted : ''
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
      // CORRECT on: what it has corrected, in the counter's place.
      if (props.corrected) {
        words = <span class="pattern-words__note pattern-words__corrected">{props.corrected.toUpperCase()}</span>
        break
      }
      const b = beat ?? { bar: 1, beat: 1, bars: ui.bars[ui.focusGroup] ?? 1 }
      words = (
        <span class="pattern-words__num">
          {ui.recording ? MirrorText.patternRecording(b.bar, b.beat, b.bars, ui.timing) : MirrorText.patternPosition(b.bar, b.beat, b.bars)}
        </span>
      )
      break
    }
    case 'STOPPED':
      words = ui.erase ? <span class="pattern-words__note">{MirrorText.ERASE_NOTE}</span> : <></>
  }
  return (
    <div class="pattern-words">
      <span class="sr-only" aria-live="polite">
        {MirrorText.transportAnnouncement(stateOf(ui)) + (ui.erase ? ', ' + MirrorText.ERASE_NOTE : '') + (count ? ', ' + count : '')}
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

/**
 * ERASE (a latch: while on, a pad erases its notes) and ↶ (undo) as one
 * segmented key: ERASE while the project has notes, and always while on (so
 * it can go off); ↶ while there is something to undo. Its border is signal
 * while ERASE is on. Null when neither shows.
 */
export function EditKeys(props: { t: TransportUi; compact?: boolean }): JSX.Element | null {
  const { t } = props
  const ui = t.ui
  const erase = ui.erase || ui.hasNotes.some((h) => h)
  const undo = ui.canUndo
  if (!erase && !undo) return null
  return (
    <div class={`transport-keys${props.compact ? ' transport-keys--compact' : ''}${ui.erase ? ' is-signal' : ''}`}>
      {erase && (
        <button
          type="button"
          class={`transport-key transport-key--erase${ui.erase ? ' is-on' : ''}`}
          aria-pressed={ui.erase}
          {...coachAttrs('live.erase', props.compact)}
          onClick={() => t.onErase(!ui.erase)}
        >
          {MirrorText.ERASE.toUpperCase()}
        </button>
      )}
      {erase && undo && <span class="transport-keys__divide" aria-hidden="true" />}
      {undo && (
        <button type="button" class="transport-key transport-key--undo" aria-label={MirrorText.UNDO} onClick={() => t.onUndo()}>
          <span aria-hidden="true">↶</span>
        </button>
      )}
    </div>
  )
}

/** The pattern Live's display lines show; null: none (no output to play it on, or not Live). */
export const TransportContext = createContext<TransportUi | null>(null)

/**
 * A light tick on each beat of the pattern's count-in (Kotlin
 * PatternHaptics), as SAMPLE's count-in ticks; only where Settings → Haptics
 * is on.
 */
export function usePatternHaptics(t: TransportUi | null): void {
  const feel = useHaptic()
  const beat = t !== null && t.ui.phase === 'COUNT_IN' ? (t.ui.countIn ?? 1) : null
  useEffect(() => {
    if (beat !== null) feel('tick')
  }, [beat])
}

/**
 * The scene's cell and STEP's as one segmented key, each where it shows
 * ([scene]: its readout or its label; [step]; with one the key is that cell,
 * with neither nothing): the scene's brighter, so the key's border is the
 * display's dim with it, the fainter border without.
 */
function SceneStepKeys(props: { scene: boolean; readout: readonly string[] | null; step: StepFit; compact?: boolean }): JSX.Element | null {
  const step = props.step !== 'NONE'
  if (!props.scene && !step) return null
  return (
    <div class={`transport-keys${props.compact ? ' transport-keys--compact' : ''}${props.scene ? ' is-scene' : ''}`}>
      {props.scene && <SceneCell readout={props.readout} compact={props.compact} />}
      {props.scene && step && <span class="transport-keys__divide" aria-hidden="true" />}
      {step && <StepCell word={props.step === 'WORD'} compact={props.compact} />}
    </div>
  )
}

/** The words a line's measure needs. */
const LINE_WORDS: LineWords = {
  record: MirrorText.RECORD.toUpperCase(),
  erase: MirrorText.ERASE.toUpperCase(),
  step: MirrorText.STEP.toUpperCase(),
  correct: MirrorText.CORRECT.toUpperCase(),
  take: MirrorText.TAKE.toUpperCase(),
}

/** The pattern as the measure needs it: its words at their widest (the counter for its length, the count-in's). */
function lineState(ui: PatternUiState): LineState {
  const bars = ui.bars[ui.focusGroup] ?? 1
  const words =
    ui.phase === 'PLAYING'
      ? ui.recording
        ? MirrorText.patternRecording(bars, BEATS_PER_BAR, bars, ui.timing)
        : MirrorText.patternPosition(bars, BEATS_PER_BAR, bars)
      : ui.phase === 'COUNT_IN'
        ? MirrorText.countInOf(BEATS_PER_BAR)
        : ''
  return { phase: ui.phase, erase: ui.erase, hasNotes: ui.hasNotes.some((h) => h), canUndo: ui.canUndo, words }
}

/** TAKE's badge's words while one is armed or records, for the measure. */
function takeWords(take: TakeUi | null | undefined): TakeWords | null {
  if (!take || take.state.kind === 'idle') return null
  const s = take.state
  return s.kind === 'recording'
    ? { word: MirrorText.takeBadge(s.seconds).toUpperCase(), short: MirrorText.takeLength(s.seconds).toUpperCase() }
    : { word: MirrorText.TAKE.toUpperCase(), short: '' }
}

const measures = new Map<string, Measure>()

/**
 * The content width of the line [probe] sits in ([self]: of [probe] itself),
 * and a [Measure] in its font, kept up to date as it resizes; null until it
 * is laid out (and in a DOM with no layout).
 */
export function useLineMeasure(probe: { current: HTMLElement | null }, self = false): { width: number | null; measure: Measure | null } {
  const [width, setWidth] = useState<number | null>(null)
  const [measure, setMeasure] = useState<Measure | null>(null)
  useLayoutEffect(() => {
    const line = self ? probe.current : probe.current?.parentElement
    if (!line) return
    const read = (): void => {
      const cs = getComputedStyle(line)
      const w = line.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
      setWidth(w > 0 ? Math.floor(w) : null)
    }
    const family = getComputedStyle(line).fontFamily || 'sans-serif'
    let m = measures.get(family)
    if (m === undefined) {
      m = canvasMeasure(family)
      measures.set(family, m)
    }
    const kept = m
    setMeasure(() => kept)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(line)
    return () => ro.disconnect()
  }, [])
  return { width, measure }
}

/**
 * The pattern's part of a display line (Kotlin PatternLine): its keys first
 * (RECORD and PLAY; the scene and STEP; ERASE and ↶; CORRECT), its words in
 * place of the line's own ([children]) while it has some, TAKE's badge
 * ([take]) last, and its frame over the line, which is position: relative.
 * What shows is measured on the line, so the counter is never cut. [row]: the
 * all-groups display's pattern row (Kotlin PatternRow): no scene, no words of
 * its own while stopped. Without a pattern, the line's own words alone.
 */
export function PatternLine(props: { compact?: boolean; still?: boolean; row?: boolean; take?: TakeUi | null; children?: ComponentChildren }): JSX.Element {
  const t = useContext(TransportContext)
  const scene = useScene()
  const step = useStep()
  const probe = useRef<HTMLSpanElement>(null)
  const { width: measured, measure } = useLineMeasure(probe)
  const compact = props.compact === true
  const probeSpan = <span ref={probe} class="pattern-line__probe" aria-hidden="true" />
  const badge = (word: boolean): JSX.Element | null => (props.take !== undefined ? <TakeBadge take={props.take} still={props.still} word={word} /> : null)
  if (t === null) {
    return (
      <>
        {props.children}
        {badge(true)}
        {probeSpan}
      </>
    )
  }
  const ui = t.ui
  // Unlaid out, everything shows.
  const width = measured === null || measure === null ? Number.POSITIVE_INFINITY : measured
  const m: Measure = measure ?? (() => 0)
  const s = lineState(ui)
  const words = hasWords(ui)
  // CORRECT lit while the pattern plays with it on; STEP while it is stopped (not erasing), where the panel isn't open.
  const correct = step !== null && step.ui.correct && ui.phase === 'PLAYING'
  const stepping = step !== null && !step.ui.open && ui.phase === 'STOPPED' && !ui.erase
  // The scene, where its panel isn't open: its chip while stopped (not erasing) and while playing with nothing worth
  // saying, its readout while playing with something (CORRECT keeps the line to itself). Not in the all-groups row.
  const sceneShown = !props.row && scene !== null && !scene.ui.open
  const playing = sceneShown && ui.phase === 'PLAYING' && !correct
  const readout = playing && scene !== null && scene.running && worthSaying(scene.ui) ? sceneReadout(scene.ui) : null
  const stopped = sceneShown && ui.phase === 'STOPPED' && !ui.erase
  const chipWord = scene !== null && (stopped || (playing && readout === null)) ? scene.ui.label : null
  const tw = takeWords(props.take)
  const wide = !props.row && width >= WIDE_LINE
  const fit: LineFit =
    words || props.row
      ? lineFit(s, LINE_WORDS, m, compact, width, { take: props.row ? null : tw, correct, scene: chipWord, readout })
      : { edit: true, recordWord: wide && !compact, takeWord: true, scene: false }
  const recordWord = fit.recordWord
  // While it plays the chip comes last: only where everything else fits with it.
  const sceneCell = readout !== null || (chipWord !== null && (stopped || fit.scene))
  const edit = fit.edit && ui.phase !== 'COUNT_IN' && ui.phase !== 'ARMED'
  const stepShown: StepFit = !stepping
    ? 'NONE'
    : props.row
      ? stepRowFit(s, LINE_WORDS, m, width, { ...fit, recordWord }, edit)
      : stepFit(s, LINE_WORDS, m, compact, width, { take: tw, scene: chipWord })
  return (
    <>
      <TransportKeys t={t} compact={compact} still={props.still} word={recordWord} />
      <SceneStepKeys scene={sceneCell} readout={readout} step={stepShown} compact={compact} />
      {words || props.row ? (
        <>
          {edit && <EditKeys t={t} compact={compact} />}
          {correct && <CorrectKey compact={compact} />}
          {words ? <PatternWords t={t} compact={compact} still={props.still} corrected={correct ? step?.ui.status : null} /> : <span class="pattern-words" />}
        </>
      ) : (
        <>
          {/* On a wide line ERASE and ↶ fit beside the line's own words too; else only while the pattern runs. */}
          {wide && <EditKeys t={t} compact={compact} />}
          {props.children}
        </>
      )}
      {badge(fit.takeWord)}
      <PatternFrame t={t} still={props.still} />
      {probeSpan}
    </>
  )
}
