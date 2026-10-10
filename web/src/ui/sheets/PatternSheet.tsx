// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PatternSheet.kt
//
// RECORD held: the pattern's settings. LENGTH: the four groups' lengths, one
// picked to change (the group recorded into last first): − and + a bar (held,
// they repeat), the lengths offered first (1, 2, 4, 8), and ×2, which copies
// the notes in. TIMING, the grid notes snap to; the count-in and AUTO length;
// UNDO and CLEAR (a group's notes or every group's, asked here first). Pads
// the pattern plays whose sounds aren't on the phone yet are counted.
//
// Web deltas: no SCENE CHANGE and no ERASE (the web has neither scenes nor
// ERASE yet); a group's length cell is a radio of a radiogroup, where Kotlin's
// is a selectable tab.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Seq, TIMINGS, type Timing } from '../../core/features/pattern'
import { MirrorText } from '../../core/text/mirrorText'
import { Strings } from '../../core/text/strings'
import type { PatternUiState } from '../../state/patternPlan'
import { Caption } from '../components/Caption'
import { GridPlate, PlateLine } from '../components/GridPlate'
import { Key } from '../components/Key'
import { Segmented } from '../components/Segmented'
import { Sheet } from '../components/Sheet'
import { SwitchRow } from '../components/SwitchRow'
import './PatternSheet.css'

/** What the sheet changes (Kotlin TransportUi's callbacks). */
export interface PatternSheetActions {
  onLength(group: number, bars: number): void
  onDouble(group: number): void
  onTiming(t: Timing): void
  onCountIn(on: boolean): void
  onAutoLength(on: boolean): void
  onUndo(): void
  onClear(group: number | null): void
}

export interface PatternSheetProps {
  open: boolean
  ui: PatternUiState
  actions: PatternSheetActions
  onDismiss: () => void
}

/** CLEAR's question for every group, where a group's number would be. */
const ALL = -1

/** TIMING's choices in two rows: Off to 1/4, then 1/8 to 1/32. */
const TIMING_ROWS: readonly (readonly Timing[])[] = [TIMINGS.slice(0, 4), TIMINGS.slice(4)]

/** How long − or + is held before it repeats, and then how often. */
const REPEAT_AFTER_MS = 400
const REPEAT_EVERY_MS = 80

export function PatternSheet(props: PatternSheetProps): JSX.Element {
  const { ui, actions: a } = props
  const [group, setGroup] = useState(Math.min(Math.max(ui.focusGroup, 0), 3))
  // CLEAR asks first: the group picked (its number), every group (ALL), or nothing asked (null).
  const [ask, setAsk] = useState<number | null>(null)
  // Opened again: on the group recorded into last, nothing asked.
  useEffect(() => {
    if (!props.open) return
    setGroup(Math.min(Math.max(ui.focusGroup, 0), 3))
    setAsk(null)
  }, [props.open])
  const bars = ui.bars[group] ?? Seq.DEFAULT_BARS
  const any = ui.hasNotes.some((h) => h)
  return (
    <Sheet open={props.open} onDismiss={props.onDismiss} labelledBy="pattern-sheet-title" class="pattern-sheet">
      <h2 id="pattern-sheet-title" class="t-heading pattern-sheet__title">
        {MirrorText.PATTERN}
      </h2>
      <Caption text={MirrorText.LENGTH} align="start" as="h3" />
      <div class="pattern-sheet__groups" role="radiogroup" aria-label={MirrorText.LENGTH}>
        {[0, 1, 2, 3].map((g) => {
          const picked = g === group
          const b = ui.bars[g] ?? Seq.DEFAULT_BARS
          const notes = ui.hasNotes[g] ?? false
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={picked}
              class={`pattern-group cap-3d${picked ? ' is-picked' : ''}`}
              aria-label={MirrorText.groupLengthName(g, b) + (notes ? MirrorText.PAD_HAS_NOTES : '')}
              onClick={() => setGroup(g)}
            >
              <span class="pattern-group__head">
                <span class="t-caps-key">{MirrorText.groupKey(g)}</span>
                {notes && <span class="pattern-group__dot" aria-hidden="true" />}
              </span>
              <span class="t-tiny pattern-group__bars">{MirrorText.barsChoice(b)}</span>
            </button>
          )
        })}
      </div>
      <div class="pattern-sheet__length">
        <LengthKey glyph="−" description={MirrorText.SHORTER} enabled={bars > 1} onStep={() => a.onLength(group, Math.max(bars - 1, 1))} />
        <span class="pattern-sheet__bars t-stat-free" aria-live="polite" aria-label={MirrorText.groupLengthName(group, bars)}>
          {MirrorText.groupLength(group, bars)}
        </span>
        <LengthKey glyph="+" description={MirrorText.LONGER} enabled={bars < Seq.MAX_BARS} onStep={() => a.onLength(group, Math.min(bars + 1, Seq.MAX_BARS))} />
      </div>
      <div class="pattern-sheet__lengths">
        <Segmented
          options={Seq.LENGTHS.map(String)}
          selected={Seq.LENGTHS.indexOf(bars)}
          onSelect={(i) => a.onLength(group, Seq.LENGTHS[i]!)}
          label={MirrorText.LENGTH}
          compact
          fill
          descriptions={Seq.LENGTHS.map((n) => MirrorText.groupLengthName(group, n))}
          class="pattern-sheet__seg"
        />
        <Key
          class="pattern-sheet__double"
          text={MirrorText.DOUBLE}
          size="small"
          disabled={bars * 2 > Seq.MAX_BARS}
          aria-label={MirrorText.DOUBLE_NAME + ', ' + MirrorText.groupLengthName(group, bars)}
          onClick={() => a.onDouble(group)}
        />
      </div>
      <Caption text={MirrorText.TIMING} align="start" as="h3" />
      {TIMING_ROWS.map((row, r) => (
        <Segmented
          key={r}
          options={row.map((t) => MirrorText.timingLabel(t))}
          selected={row.indexOf(ui.timing)}
          onSelect={(i) => a.onTiming(row[i]!)}
          label={MirrorText.TIMING}
          descriptions={row.map((t) => MirrorText.timingName(t))}
        />
      ))}
      <GridPlate>
        <SwitchRow title={MirrorText.COUNT_IN} note={MirrorText.COUNT_IN_NOTE} on={ui.countInOn} onChange={a.onCountIn} />
        <PlateLine />
        <SwitchRow title={MirrorText.AUTO} note={MirrorText.AUTO_NOTE} on={ui.autoLength} onChange={a.onAutoLength} />
      </GridPlate>
      {ui.missing > 0 && <p class="t-small pattern-sheet__note">{MirrorText.missingPads(ui.missing) + '. ' + MirrorText.MISSING_NOTE}</p>}
      {ask === null ? (
        <div class="pattern-sheet__keys">
          <Key text={MirrorText.UNDO} size="small" disabled={!ui.canUndo} onClick={a.onUndo} />
          <Key text={MirrorText.CLEAR} size="small" disabled={!any} textColor={any ? 'var(--signal)' : undefined} onClick={() => setAsk(group)} />
        </div>
      ) : (
        <>
          <p class="t-small pattern-sheet__ask" aria-live="polite">
            {MirrorText.clearAsk(ask === ALL ? null : ask)}
          </p>
          <div class="pattern-sheet__keys">
            <Key
              text={ask === ALL ? MirrorText.CLEAR_ALL : MirrorText.CLEAR}
              size="small"
              variant="signal"
              onClick={() => {
                a.onClear(ask === ALL ? null : ask)
                setAsk(null)
              }}
            />
            {ask !== ALL && <Key text={MirrorText.CLEAR_ALL} size="small" onClick={() => setAsk(ALL)} />}
            <Key text={Strings.CANCEL} size="small" onClick={() => setAsk(null)} />
          </div>
        </>
      )}
      <p class="t-small pattern-sheet__note">{MirrorText.PATTERN_NOTE}</p>
      <Key text={Strings.DONE} variant="quiet" block onClick={props.onDismiss} />
    </Sheet>
  )
}

/**
 * − or + by a group's length: a bar on the press, then, held, a bar every
 * REPEAT_EVERY_MS after REPEAT_AFTER_MS. Greyed out (and still) at either end.
 */
function LengthKey(props: { glyph: string; description: string; enabled: boolean; onStep: () => void }): JSX.Element {
  const step = useRef(props.onStep)
  step.current = props.onStep
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [down, setDown] = useState(false)
  const stop = (): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    setDown(false)
  }
  useEffect(() => stop, [])
  useEffect(() => {
    if (!props.enabled) stop()
  }, [props.enabled])
  const repeat = (ms: number): void => {
    timer.current = setTimeout(() => {
      step.current()
      repeat(REPEAT_EVERY_MS)
    }, ms)
  }
  return (
    <button
      type="button"
      class={`pattern-step cap-3d${down ? ' is-down' : ''}`}
      aria-label={props.description}
      disabled={!props.enabled}
      onPointerDown={(e) => {
        if (!props.enabled || e.button !== 0) return
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        setDown(true)
        step.current()
        repeat(REPEAT_AFTER_MS)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      // Enter and Space (and a screen reader's tap): one bar.
      onClick={(e) => {
        if (e.detail === 0) step.current()
      }}
    >
      <span aria-hidden="true">{props.glyph}</span>
    </button>
  )
}
