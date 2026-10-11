// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/TempoSheet.kt
//
// TEMPO held: the phone's click and its tempo. The tempo on the display, −
// and + a step of 1 (held, they repeat), a big TAP pad for tapping it in, and
// the click on or off. While the EP-133 sends MIDI clock its tempo leads: the
// display shows it, and − + and TAP rest. TEMPO and TIMING tabs beside the
// title; TIMING's page the interval, quantize or free time, and swing.
//
// Web deltas: no arp section on TIMING's page (the web has no arp or note
// repeat yet), and its note says so (WebText.TIMING_NOTE); SWING is a slider
// where Kotlin has a knob.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { TIMING_INTERVALS, TimingSettings, timingSwings, type Timing } from '../../core/features/pattern'
import { MAX as TEMPO_MAX, MIN as TEMPO_MIN, round as roundTempo } from '../../core/features/tempo'
import { MirrorText } from '../../core/text/mirrorText'
import { Strings } from '../../core/text/strings'
import { WebText } from '../../core/text/webText'
import { Caption } from '../components/Caption'
import { DisplayPanel } from '../components/DisplayPanel'
import { GridPlate, PlateLine } from '../components/GridPlate'
import { Key } from '../components/Key'
import { Segmented } from '../components/Segmented'
import { Sheet } from '../components/Sheet'
import { SwitchRow } from '../components/SwitchRow'
import './TempoSheet.css'

export interface TempoSheetProps {
  open: boolean
  bpm: number
  deviceBpm: number | null
  clickOn: boolean
  timing: TimingSettings
  onClick(on: boolean): void
  onBpm(bpm: number): void
  /** A tap on TAP, at the press's time (performance.now()). */
  onTap(at: number): void
  onInterval(t: Timing): void
  onSwing(percent: number): void
  onQuantize(on: boolean): void
  onDismiss: () => void
}

/** How long − or + is held before it repeats, and then how often. */
const REPEAT_AFTER_MS = 400
const REPEAT_EVERY_MS = 80

/** INTERVAL's eight choices in two rows of four. */
const INTERVAL_ROWS: readonly (readonly Timing[])[] = [TIMING_INTERVALS.slice(0, 4), TIMING_INTERVALS.slice(4)]

export function TempoSheet(props: TempoSheetProps): JSX.Element {
  const [page, setPage] = useState(0)
  useEffect(() => {
    if (props.open) setPage(0)
  }, [props.open])
  return (
    <Sheet open={props.open} onDismiss={props.onDismiss} labelledBy="tempo-sheet-title" class="tempo-sheet">
      <div class="tempo-sheet__head">
        <h2 id="tempo-sheet-title" class="t-heading tempo-sheet__title">
          {MirrorText.TEMPO_TITLE}
        </h2>
        <Segmented
          options={[MirrorText.TEMPO_TAB, MirrorText.TIMING]}
          selected={page}
          onSelect={setPage}
          compact
          label={MirrorText.TEMPO_TITLE}
          class="tempo-sheet__tabs"
        />
      </div>
      {page === 0 ? <TempoPage {...props} /> : <TimingPage {...props} />}
      <Key text={Strings.DONE} variant="quiet" block onClick={props.onDismiss} />
    </Sheet>
  )
}

/** The TEMPO page: the tempo, − TAP +, and the click. */
function TempoPage(props: TempoSheetProps): JSX.Element {
  const following = props.deviceBpm !== null
  const shown = props.deviceBpm !== null ? roundTempo(props.deviceBpm) : props.bpm
  return (
    <>
      <DisplayPanel class="tempo-sheet__display">
        <p class="tempo-sheet__bpm t-stat-free" role="status" aria-live="polite">
          {MirrorText.tempoValue(shown)}
        </p>
      </DisplayPanel>
      <div class="tempo-sheet__keys">
        <RepeatKey glyph="−" description={MirrorText.SLOWER} enabled={!following && props.bpm > TEMPO_MIN} onStep={() => props.onBpm(props.bpm - 1)} />
        <button
          type="button"
          class="tempo-tap cap-3d"
          aria-label={MirrorText.TAP_TEMPO}
          disabled={following}
          onPointerDown={(e) => {
            if (e.button !== 0 || following) return
            e.preventDefault()
            props.onTap(e.timeStamp)
          }}
          onClick={(e) => {
            if (e.detail === 0 && !following) props.onTap(performance.now())
          }}
        >
          <span aria-hidden="true">{MirrorText.FN_TEMPO_SUB.toUpperCase()}</span>
        </button>
        <RepeatKey glyph="+" description={MirrorText.FASTER} enabled={!following && props.bpm < TEMPO_MAX} onStep={() => props.onBpm(props.bpm + 1)} />
      </div>
      {following && <p class="t-small tempo-sheet__note">{MirrorText.FOLLOWING}</p>}
      <GridPlate>
        <SwitchRow title={MirrorText.CLICK} note="" on={props.clickOn} onChange={props.onClick} />
      </GridPlate>
    </>
  )
}

/** TIMING's page: INTERVAL, how recording takes it (QUANTIZE or FREE TIME), and SWING (at 1/8 and 1/16 only). */
function TimingPage(props: TempoSheetProps): JSX.Element {
  const t = props.timing
  const swings = timingSwings(t.interval)
  return (
    <>
      <Caption text={MirrorText.INTERVAL} align="start" as="h3" />
      {INTERVAL_ROWS.map((row, r) => (
        <Segmented
          key={r}
          options={row.map((i) => MirrorText.timingLabel(i))}
          selected={row.indexOf(t.interval)}
          onSelect={(i) => props.onInterval(row[i]!)}
          label={MirrorText.INTERVAL}
          descriptions={row.map((i) => MirrorText.intervalName(i))}
        />
      ))}
      <GridPlate>
        <div class="tempo-sheet__row">
          <div class="tempo-sheet__row-text">
            <p class="t-bold tempo-sheet__row-title" id="tempo-record">{MirrorText.RECORD}</p>
            <p class="t-small tempo-sheet__note">{MirrorText.QUANTIZE_NOTE}</p>
          </div>
          <Segmented
            options={[MirrorText.QUANTIZE, MirrorText.FREE_TIME]}
            selected={t.quantize ? 0 : 1}
            onSelect={(i) => props.onQuantize(i === 0)}
            labelledBy="tempo-record"
            compact
          />
        </div>
        <PlateLine />
        <div class="tempo-sheet__row tempo-sheet__row--swing">
          <label class="tempo-sheet__swing">
            <span class="t-bold">{MirrorText.SWING}</span>
            <input
              type="range"
              min={TimingSettings.SWING_MIN}
              max={TimingSettings.SWING_MAX}
              step={1}
              value={t.swing}
              disabled={!swings}
              aria-valuetext={MirrorText.percent(t.swing)}
              onInput={(e) => props.onSwing(Number((e.currentTarget as HTMLInputElement).value))}
            />
            <span class="tempo-sheet__swing-value">{MirrorText.percent(t.swing)}</span>
          </label>
          <p class={`t-small tempo-sheet__note${swings ? '' : ' is-signal'}`}>{swings ? WebText.TIMING_NOTE : MirrorText.SWING_NOTE}</p>
        </div>
      </GridPlate>
    </>
  )
}

/** − or + on the tempo sheet: a step on the press, then, held, a step every REPEAT_EVERY_MS after REPEAT_AFTER_MS. */
function RepeatKey(props: { glyph: string; description: string; enabled: boolean; onStep: () => void }): JSX.Element {
  const step = useRef(props.onStep)
  step.current = props.onStep
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stop = (): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
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
      class="tempo-step cap-3d"
      aria-label={props.description}
      disabled={!props.enabled}
      onPointerDown={(e) => {
        if (!props.enabled || e.button !== 0) return
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        step.current()
        repeat(REPEAT_AFTER_MS)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onClick={(e) => {
        if (e.detail === 0) step.current()
      }}
    >
      <span aria-hidden="true">{props.glyph}</span>
    </button>
  )
}
