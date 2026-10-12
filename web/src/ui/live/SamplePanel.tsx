// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LiveSampler.kt (SampleUi, SampleLed,
// takePad, handsFreeTake, sampleLed, sampleStatus, sampleSpoken, thresholdKnob,
// thresholdOfKnob, SampleHeaderContent, SampleWave, SampleScope, SampleMeter, SourceKeys,
// StereoKey, LevelKnob, ThresholdKnob, LatchKey, SampleKey) and SamplePanel.kt's panel
//
// SAMPLE mode on Live (an addition, after the EP-133's own sampler): the mic
// key in the top bar opens the SAMPLE panel in the function keys' place, on
// the display line's dark screen. Its header is SAMPLE's orange light, the
// source ("RSP"), the input's meter (the threshold's mark and the clip light
// in orange) and what happens next; the wave strip under it shows the input
// while a take waits or records, else the last take; the controls under that
// are − / source / +, STEREO, LATCH (STOP while a hands-free take goes on),
// LEVEL (the input's gain), THRESH (the level a take waits for) and BARS (a
// hands-free take's length: Free, 1–16 bars, or PTN, the patterns'). The pads
// light as the K.O. II lights them in the mode: empty pads blink, those with
// a sound are ringed, the take's pad lit.
//
// Web deltas:
// - The panel takes the function keys' place as STEP's and SCENE's do
//   (Kotlin's SampleSlot), with a ✕ of its own, and unrolls there as it
//   mounts (CSS keyframes on panelMotion.ts's times, MirrorScreen.css); it
//   goes at once as it closes, the function keys coming back. The swipe on the
//   pads opens and closes it (MirrorScreen, panelMotion.ts), and Escape closes
//   it where Android's Back does.
// - The knobs are sliders (KnobSlider), as the web's other knobs.
// - RSP only, so − / + and STEREO step between RSP and RSP ST; the sources'
//   names say arc's sound, not the phone's (WebText.sampleSourceName).
// - No haptics.

import { createContext, type JSX } from 'preact'
import { useContext, useEffect, useRef } from 'preact/hooks'
import { useComputed, type ReadonlySignal } from '@preact/signals'
import type { PhysicalPad } from '../../core/features/padNotes'
import { PeakMeter } from '../../core/features/peakMeter'
import type { SamplePhase } from '../../core/features/sampleCapture'
import type { Peak } from '../../core/features/sampleTrim'
import { FeatureText } from '../../core/text/featureText'
import { MirrorText } from '../../core/text/mirrorText'
import { WebText } from '../../core/text/webText'
import { SAMPLE_BARS, SAMPLE_GAINS, SAMPLE_GAIN_MIC } from '../../platform/storage/settings'
import type { SampleUiState } from '../../state/samplePlan'
import { KnobSlider } from '../components/KnobSlider'
import './SamplePanel.css'

/**
 * SAMPLE mode for Live's page (Kotlin SampleUi): [ui] as the controller has
 * it, the input's [level] (0..1 across −60..0 dBFS, and its clip light) and
 * the last take's waveform ([lastTake]), read as each part renders.
 */
export interface SampleActions {
  readonly ui: SampleUiState
  readonly level: ReadonlySignal<{ readonly level: number; readonly clip: boolean }> | null
  readonly lastTake: readonly Peak[] | null
  /** The mic key: SAMPLE opens, or closes while open. */
  onToggle(): void
  onClose(): void
  /** STOP, in LATCH's place while a hands-free take goes on. */
  onStop(): void
  onSource(step: number): void
  onStereo(on: boolean): void
  onGain(db: number): void
  onThreshold(db: number | null): void
  onLatch(on: boolean): void
  /** BARS: Free (null) or a number of bars. */
  onBars(bars: number | null): void
  /** BARS on PTN, the patterns' length, or off it. */
  onPattern(on: boolean): void
  /** Whether the project has notes: PTN comes after 16. */
  readonly hasPattern: boolean
}

/** SAMPLE on Live; null where this browser can't sample. */
export const SampleContext = createContext<SampleActions | null>(null)

export function useSample(): SampleActions | null {
  return useContext(SampleContext)
}

/** A pad's light in SAMPLE mode: blinking while EMPTY, ringed with a sound (FILLED), lit while a take into it WAITING or RECORDING. */
export type SampleLed = 'EMPTY' | 'FILLED' | 'WAITING' | 'RECORDING'

/** The pad a take goes into while it waits, counts in or records; null otherwise. */
export function takePad(phase: SamplePhase): PhysicalPad | null {
  switch (phase.type) {
    case 'Waiting':
    case 'WaitingForPlay':
    case 'CountIn':
    case 'Recording':
      return phase.pad
    default:
      return null
  }
}

/** Whether [phase] is a hands-free take going on, or its count-in or wait for PLAY: LATCH reads STOP and stops it. */
export function handsFreeTake(phase: SamplePhase): boolean {
  switch (phase.type) {
    case 'Waiting':
    case 'Recording':
      return phase.latched
    case 'WaitingForPlay':
    case 'CountIn':
      return true
    default:
      return false
  }
}

/** [pad]'s light in [phase]: the take's pad lit (recording, or waiting to), else [filled] (it has a sound) or empty. */
export function sampleLed(pad: PhysicalPad, phase: SamplePhase, filled: boolean): SampleLed {
  const p = takePad(phase)
  if (p !== null && p.group === pad.group && p.offset === pad.offset) return phase.type === 'Recording' ? 'RECORDING' : 'WAITING'
  return filled ? 'FILLED' : 'EMPTY'
}

/** What SAMPLE's header says next: what a pad does, that the EP-133 has little room, the wait, the count-in, the take's time, the upload. */
export function sampleStatus(s: SampleUiState): string {
  const p = s.phase
  switch (p.type) {
    case 'Ready':
      return s.lowSpace ? MirrorText.diskLow(s.maxSeconds) : s.latch ? MirrorText.SAMPLE_READY_LATCH : MirrorText.SAMPLE_READY
    case 'Waiting':
      return MirrorText.SAMPLE_WAITING
    case 'WaitingForPlay':
      return MirrorText.WAITING_FOR_PLAY
    case 'CountIn':
      return MirrorText.countIn(p.beat)
    case 'Recording':
      return MirrorText.sampleTime(p.seconds, p.max)
    case 'Uploading':
      return MirrorText.sampleUploading(p.pad, p.percent)
  }
}

/** [sampleStatus] as a screen reader hears it: the pad and REC while a take records, the pad alone while one uploads. */
export function sampleSpoken(s: SampleUiState): string {
  const p = s.phase
  switch (p.type) {
    case 'Recording':
      return MirrorText.padTitle(p.pad) + ', ' + MirrorText.REC
    case 'Waiting':
      return MirrorText.padTitle(p.pad) + ', ' + MirrorText.SAMPLE_WAITING
    case 'Uploading':
      return MirrorText.sampleUploading(p.pad)
    default:
      return sampleStatus(s)
  }
}

/** THRESH's leftmost place: no threshold ("Off"), one dB under the lowest. */
export const THRESHOLD_OFF = -61

/** THRESH's place for a threshold in dBFS ([db] null: Off). */
export function thresholdKnob(db: number | null): number {
  return db ?? THRESHOLD_OFF
}

/** The threshold at THRESH's place [v]: Off at the left end, else −60..0 dBFS in whole dB. */
export function thresholdOfKnob(v: number): number | null {
  return v < THRESHOLD_OFF + 0.5 ? null : Math.min(Math.max(Math.round(v), -60), 0)
}

/** BARS' next choice from [bars]: Free, 1, 2, 4, 8, 16, then Free again (one that isn't a choice counts as Free). */
export function nextBars(bars: number | null): number | null {
  const choices: (number | null)[] = [null, ...SAMPLE_BARS]
  return choices[(Math.max(choices.indexOf(bars), 0) + 1) % choices.length] ?? null
}

/** BARS' next choice from [bars] (or PTN, [pattern]): as [nextBars], with PTN after 16 while the project has notes ([hasPattern]), then Free again. */
export function nextBarsPick(bars: number | null, pattern: boolean, hasPattern: boolean): { readonly bars: number | null; readonly pattern: boolean } {
  if (pattern && hasPattern) return { bars: null, pattern: false }
  if (hasPattern && bars === SAMPLE_BARS[SAMPLE_BARS.length - 1]) return { bars, pattern: true }
  return { bars: nextBars(bars), pattern: false }
}

/** [pad]'s light while SAMPLE is open ([filled]: it has a sound), else null. */
export function useSamplePadLed(pad: PhysicalPad, filled: boolean): SampleLed | null {
  const s = useSample()
  const at = useRef({ pad, filled })
  at.current = { pad, filled }
  return useComputed(() => {
    if (s === null) return null
    const ui = s.ui
    return ui.on ? sampleLed(at.current.pad, ui.phase, at.current.filled) : null
  }).value
}

/** The SAMPLE panel in the function keys' place: its header, the wave strip, the controls. */
export function SamplePanel(props: { class?: string }): JSX.Element | null {
  const s = useSample()
  if (s === null || !s.ui.on) return null
  return (
    <section class={`sample-panel${props.class ? ` ${props.class}` : ''}`} aria-label={MirrorText.SAMPLE_TAG}>
      <SampleHeader s={s} />
      <SampleWave s={s} />
      <SampleControls s={s} />
    </section>
  )
}

/** SAMPLE's orange light, the source's chip, the meter, what happens next (a polite live region), ✕. */
function SampleHeader(props: { s: SampleActions }): JSX.Element {
  const { s } = props
  const ui = s.ui
  const status = sampleStatus(ui)
  return (
    <div class="sample-panel__head">
      <span class="sample-panel__led" aria-hidden="true" />
      <span class="sample-panel__source" aria-hidden="true">{MirrorText.sourceShort(ui.input.source, ui.input.stereo).toUpperCase()}</span>
      <SampleMeter level={s.level} mark={ui.thresholdDb === null ? null : PeakMeter.markOf(ui.thresholdDb)} />
      <span class={`sample-panel__status${status.length > 22 ? ' is-long' : ''}`} aria-hidden="true">
        {status}
      </span>
      <span class="sr-only" aria-live="polite">
        {sampleSpoken(ui)}
      </span>
      <button type="button" class="step-panel__close" aria-label={WebText.CLOSE_SAMPLE} onClick={() => s.onClose()}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}

/** The input's meter: its level as a bar, the threshold's [mark] and the clip light in orange. */
function SampleMeter(props: { level: SampleActions['level']; mark: number | null }): JSX.Element {
  const l = props.level?.value ?? { level: 0, clip: false }
  return (
    <span
      class={`sample-meter${l.clip ? ' is-clip' : ''}`}
      role="meter"
      aria-label={MirrorText.INPUT_LEVEL}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(l.level * 100)}
      aria-valuetext={l.clip ? MirrorText.CLIPPING : undefined}
    >
      <span class="sample-meter__bar" style={{ transform: `scaleX(${Math.min(Math.max(l.level, 0), 1)})` }} />
      {props.mark !== null && <span class="sample-meter__mark" style={{ left: `${props.mark * 100}%` }} />}
      <span class="sample-meter__clip" />
    </span>
  )
}

/** How many of the input's levels the scope keeps, the newest on the right. */
const SCOPE_POINTS = 96
/** How often the scope takes a level (ms). */
const SCOPE_STEP_MS = 40

/** The wave strip: the input while a take waits or records (orange recording), else the last take, else how long a take can be. */
function SampleWave(props: { s: SampleActions }): JSX.Element {
  const { s } = props
  const ui = s.ui
  const p = ui.phase
  if (takePad(p) !== null) return <SampleScope level={s.level} recording={p.type === 'Recording'} />
  const peaks = s.lastTake
  if (peaks !== null && peaks.length > 0) return <TakeWave peaks={peaks} />
  if (ui.lowSpace) return <div class="sample-wave sample-wave--line" aria-hidden="true" />
  return (
    <div class="sample-wave sample-wave--words">
      <span>{MirrorText.sampleMax(ui.maxSeconds)}</span>
    </div>
  )
}

/** The last take as bars from the middle. */
function TakeWave(props: { peaks: readonly Peak[] }): JSX.Element {
  const { peaks } = props
  return (
    <svg class="sample-wave" viewBox={`0 0 ${peaks.length} 2`} preserveAspectRatio="none" aria-hidden="true">
      {peaks.map((pk, i) => {
        const top = 1 - Math.min(Math.max(pk.max, -1), 1)
        const bottom = 1 - Math.min(Math.max(pk.min, -1), 1)
        return <rect key={i} x={i + 0.15} y={top} width={0.7} height={Math.max(bottom - top, 0.04)} />
      })}
    </svg>
  )
}

/** The input's level these last seconds, as bars from the middle, the newest on the right: drawn on a canvas, not re-rendered. */
function SampleScope(props: { level: SampleActions['level']; recording: boolean }): JSX.Element {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const level = props.level
  useEffect(() => {
    const el = canvas.current
    if (el === null || level === null) return
    const ring = new Float32Array(SCOPE_POINTS)
    let head = 0
    let last = 0
    let frame = 0
    const draw = (t: number): void => {
      frame = requestAnimationFrame(draw)
      if (t - last < SCOPE_STEP_MS) return
      last = t
      ring[head] = level.peek().level
      head = (head + 1) % SCOPE_POINTS
      const ctx = el.getContext('2d')
      if (ctx === null) return
      const w = el.clientWidth
      const h = el.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr)
        el.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = getComputedStyle(el).color
      const step = w / SCOPE_POINTS
      for (let i = 0; i < SCOPE_POINTS; i++) {
        const v = ring[(head + i) % SCOPE_POINTS]!
        const bar = Math.max(1, v * h)
        ctx.fillRect(i * step + step * 0.15, (h - bar) / 2, step * 0.7, bar)
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [level])
  return <canvas ref={canvas} class={`sample-wave sample-scope${props.recording ? ' is-recording' : ''}`} aria-hidden="true" />
}

/** − / source / +, STEREO, LATCH (or STOP); LEVEL and THRESH. */
function SampleControls(props: { s: SampleActions }): JSX.Element {
  const { s } = props
  const ui = s.ui
  const input = ui.input
  const stereoOffered = ui.inputs.some((i) => i.source === input.source && i.stereo !== input.stereo)
  const handsFree = handsFreeTake(ui.phase)
  const gain = MirrorText.gainReadout(Math.round(ui.gainDb))
  const thresh = MirrorText.thresholdReadout(ui.thresholdDb === null ? null : Math.round(ui.thresholdDb))
  return (
    <div class="sample-panel__plate">
      <div class="sample-panel__row">
        <button type="button" class="sample-key sample-key--step" aria-label={MirrorText.PREV_SOURCE} onClick={() => s.onSource(-1)}>
          −
        </button>
        <span class="sample-panel__window" role="status" aria-label={WebText.sampleSourceName(input.source, input.stereo)}>
          <span aria-hidden="true">{MirrorText.sourceShort(input.source, input.stereo).toUpperCase()}</span>
        </span>
        <button type="button" class="sample-key sample-key--step" aria-label={MirrorText.NEXT_SOURCE} onClick={() => s.onSource(1)}>
          +
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={input.stereo}
          aria-label={MirrorText.STEREO}
          class="sample-key"
          disabled={!stereoOffered}
          onClick={() => s.onStereo(!input.stereo)}
        >
          <span class={`sample-key__led${input.stereo ? ' is-on' : ''}`} aria-hidden="true" />
          {MirrorText.STEREO.toUpperCase()}
        </button>
        {handsFree ? (
          <button type="button" class="sample-key" aria-label={MirrorText.STOP_RECORDING} onClick={() => s.onStop()}>
            <span class="sample-key__led is-on" aria-hidden="true" />
            {FeatureText.STOP.toUpperCase()}
          </button>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={ui.latch}
            aria-label={MirrorText.LATCH}
            aria-description={ui.latch ? MirrorText.LATCH_NOTE : undefined}
            class="sample-key"
            onClick={() => s.onLatch(!ui.latch)}
          >
            <span class={`sample-key__led${ui.latch ? ' is-on' : ''}`} aria-hidden="true" />
            {MirrorText.LATCH.toUpperCase()}
          </button>
        )}
      </div>
      <div class="sample-panel__knobs">
        <KnobSlider
          label={MirrorText.LEVEL}
          value={ui.gainDb}
          min={SAMPLE_GAINS.min}
          max={SAMPLE_GAINS.max}
          step={1}
          readout={gain}
          def={input.source === 'mic' ? SAMPLE_GAIN_MIC : 0}
          tone="orange"
          description={MirrorText.knobDescription(MirrorText.LEVEL, gain)}
          onChange={(v) => s.onGain(v)}
        />
        <KnobSlider
          label={MirrorText.THRESHOLD}
          value={thresholdKnob(ui.thresholdDb)}
          min={THRESHOLD_OFF}
          max={0}
          step={1}
          readout={thresh}
          def={THRESHOLD_OFF}
          tone="black"
          description={MirrorText.knobDescription(MirrorText.THRESHOLD_NAME, thresh)}
          onChange={(v) => s.onThreshold(thresholdOfKnob(v))}
        />
        <BarsKey s={s} />
      </div>
    </div>
  )
}

/** BARS and its choice ("FREE", "2 BARS", "PTN"); a tap steps to the next ([nextBarsPick]). */
function BarsKey(props: { s: SampleActions }): JSX.Element {
  const { s } = props
  const bars = s.ui.bars
  const pattern = s.ui.pattern && s.hasPattern
  const choice = pattern ? MirrorText.PTN : MirrorText.barsChoice(bars)
  return (
    <button
      type="button"
      class="sample-key sample-key--bars"
      aria-label={MirrorText.knobDescription(MirrorText.BARS, pattern ? MirrorText.PTN_NAME : choice)}
      onClick={() => {
        const next = nextBarsPick(bars, pattern, s.hasPattern)
        if (next.pattern !== pattern) s.onPattern(next.pattern)
        if (!next.pattern && next.bars !== bars) s.onBars(next.bars)
      }}
    >
      {/* "2 BARS" says it already; Free and PTN say what is free, or the pattern's. */}
      {(bars === null || pattern) && <span class="sample-key__dim">{MirrorText.BARS.toUpperCase()}</span>}
      {choice.toUpperCase()}
    </button>
  )
}
