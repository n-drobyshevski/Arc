// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LiveStep.kt (LiveStep, PadStep's helpers,
// StepHeader, StepDeck, StepStrip, StepKey, StepKnobs, BarPageKeys, NudgeLatch, CorrectLatch) and
// PatternLine.kt's StepChip (a cell of the scene's key) and CorrectChip
//
// STEP on Live (an addition, after the EP-133's own step sequencing: − / +
// while stopped, RECORD + pad, SHIFT + KNOB X / Y, SHIFT + pad then − / +,
// and SHIFT + TIMING's timing correct). A STEP chip on the stopped display
// line opens the STEP panel in the function keys' place, on the line's dark
// screen: the panel's RECORD (held), PLAY, the status and ✕; then − and +
// either side of the strip, one bar of steps with the cursor on it, and under
// them VEL and LEN, BAR's pages, NUDGE and CORRECT. The pads (or KEYS keys)
// on the cursor's step are outlined in signal orange, the one picked for − /
// + ringed (MirrorScreen's useStepMark).
//
// Web deltas:
// - The panel takes the function keys' place (Kotlin's SLOT hosting, with
//   its own header) wherever Live shows them, and a column left of KEYS on a
//   phone on its side, unrolling there as it mounts rather than the line
//   morphing into it (MirrorScreen.css, panelMotion.ts's times); Escape closes
//   it. Not in the desk's Device view yet.
// - VEL and LEN are sliders, back to their default on a double click; a
//   turn ends (one UNDO step) with the slider's change event.
// - CORRECT is a key of one cell (PatternLine.tsx's lineFit measures it as one).

import { createContext, type JSX } from 'preact'
import { useComputed } from '@preact/signals'
import { useContext, useEffect, useRef } from 'preact/hooks'
import { Keys } from '../../core/features/keys'
import type { PhysicalPad } from '../../core/features/padNotes'
import { Seq, timingTicks, type Timing } from '../../core/features/pattern'
import { MirrorText } from '../../core/text/mirrorText'
import { STEP_GATES, snapGate, type StepUi } from '../../state/stepPlan'
import './StepPanel.css'

/**
 * STEP for Live's page (Kotlin LiveStep): [ui] as the controller has it, and
 * [pickedWord], the note picked for − / + as the status names it, for
 * NUDGE's chip; what the chip, the panel and the pads' long press do.
 */
export interface StepActions {
  readonly ui: StepUi
  readonly pickedWord: string | null
  /** The STEP chip: the panel opens (on the group Live shows; MirrorScreen keeps it there). */
  onOpen(): void
  onClose(): void
  onRecordDown(): void
  onRecordUp(): void
  onPlay(): void
  onMinus(): void
  onPlus(): void
  onJump(step: number): void
  onPage(bar: number): void
  onVelocity(v: number): void
  onGate(ticks: number): void
  onKnobEnd(): void
  onNudge(on: boolean): void
  onCorrect(on: boolean): void
  /** A long press on a pad or KEYS note: picked for − / + (false where it has no note on the step). */
  onPadPick(pad: PhysicalPad): boolean
  onNotePick(note: number): boolean
  /** The group the panel edits: Live's group shown, or the KEYS sound's. */
  onGroup(group: number): void
}

/** STEP on Live; null where Live has no pattern (no output to play it on). */
export const StepContext = createContext<StepActions | null>(null)

export function useStep(): StepActions | null {
  return useContext(StepContext)
}

/** The KEYS notes (MIDI) lit for [ui], [pad] the KEYS sound: its notes on the cursor's step, by pitch. */
export function stepLitNotes(ui: StepUi, pad: PhysicalPad | null): Set<number> {
  const out = new Set<number>()
  if (pad === null || ui.group !== pad.group) return out
  for (const k of ui.lit) {
    const [o, s] = k.split(':')
    if (Number(o) === pad.offset && s !== 'n') out.add(Keys.ROOT_NOTE + Number(s))
  }
  return out
}

/** The pad offsets lit on [group]'s grid for [ui]: those with a note (any pitch) on the cursor's step, while the panel is on that group. */
export function stepLitPads(ui: StepUi, group: number): Set<number> {
  const out = new Set<number>()
  if (ui.group !== group) return out
  for (const k of ui.lit) out.add(Number(k.split(':')[0]))
  return out
}

/** The pad picked for − / + on [group]'s grid (its offset), or null. */
export function stepPickedPad(ui: StepUi, group: number): number | null {
  const p = ui.picked
  return p !== null && p.pad.group === group && p.semitones === null ? p.pad.offset : null
}

/** The KEYS note (MIDI) picked for − / +, [pad] the KEYS sound, or null. */
export function stepPickedNote(ui: StepUi, pad: PhysicalPad | null): number | null {
  const p = ui.picked
  if (p === null || pad === null || p.pad.group !== pad.group || p.pad.offset !== pad.offset || p.semitones === null) return null
  return Keys.ROOT_NOTE + p.semitones
}

/**
 * A pad's mark while the STEP panel is open on its group (Kotlin PadStep):
 * 'lit' (a note on the cursor's step), 'picked' (picked for − / +, lit too),
 * or '' (none); null while the panel isn't on its group.
 */
export function useStepPadMark(pad: PhysicalPad): '' | 'lit' | 'picked' | null {
  const s = useStep()
  const at = useRef(pad)
  at.current = pad
  return useComputed(() => {
    if (s === null) return null
    const ui = s.ui
    const p = at.current
    if (!ui.open || ui.group !== p.group) return null
    if (stepPickedPad(ui, p.group) === p.offset) return 'picked'
    return stepLitPads(ui, p.group).has(p.offset) ? 'lit' : ''
  }).value
}

/** A KEYS key's mark while the STEP panel is open on the KEYS sound's group ([pad]): as [useStepPadMark], by MIDI [note]. */
export function useStepNoteMark(note: number, pad: PhysicalPad | null): '' | 'lit' | 'picked' | null {
  const s = useStep()
  const at = useRef({ note, pad })
  at.current = { note, pad }
  return useComputed(() => {
    if (s === null) return null
    const ui = s.ui
    const { note: n, pad: p } = at.current
    if (!ui.open || p === null || ui.group !== p.group) return null
    if (stepPickedNote(ui, p) === n) return 'picked'
    return stepLitNotes(ui, p).has(n) ? 'lit' : ''
  }).value
}

/** The piano's marks while the STEP panel is open on the KEYS sound's group ([pad]): its notes on the cursor's step, and the one picked; null otherwise. */
export function useStepPiano(pad: PhysicalPad | null): PianoStep | null {
  const s = useStep()
  const at = useRef(pad)
  at.current = pad
  return useComputed(() => {
    if (s === null) return null
    const ui = s.ui
    const p = at.current
    if (!ui.open || p === null || ui.group !== p.group) return null
    return { lit: stepLitNotes(ui, p), picked: stepPickedNote(ui, p) }
  }).value
}

/** The piano's STEP marks (PianoKeyboard's [step]): the notes on the cursor's step outlined, the one picked ringed. */
export interface PianoStep {
  readonly lit: ReadonlySet<number>
  readonly picked: number | null
}

/** How many steps the strip shows: one bar of them at [interval]. */
export function stripSteps(interval: Timing): number {
  return Math.max(1, Math.trunc(Seq.TICKS_PER_BAR / timingTicks(interval)))
}

/** The steps the strip shows for [ui]: its page's bar of them, as many as the pattern has. */
export function stripRange(ui: StepUi): number[] {
  const per = stripSteps(ui.interval)
  const first = ui.page * per
  const out: number[] = []
  for (let s = first; s < Math.min(ui.count, first + per); s++) out.push(s)
  return out
}

/** Whether [step] starts a beat inside a bar at [interval] (shorter than a beat): the strip leaves a little more room before it. */
export function beatStarts(step: number, interval: Timing): boolean {
  const ticks = timingTicks(interval)
  const t = step * ticks
  return ticks < Seq.PPQN && t % Seq.PPQN === 0 && t % Seq.TICKS_PER_BAR !== 0
}

/** LEN's knob at [gate] ticks: its place among STEP_GATES. */
export function gateKnob(gate: number): number {
  return STEP_GATES.indexOf(snapGate(gate))
}

/** STEP's three bars, the middle one orange (Kotlin StepGlyph). */
function StepGlyph(): JSX.Element {
  return (
    <span class="step-glyph" aria-hidden="true">
      <span />
      <span class="is-on" />
      <span />
    </span>
  )
}

/**
 * STEP's cell on the stopped line (in one key with the scene's,
 * PatternLine.tsx's SceneStepKeys): its word on a wide line ([word]), else
 * its glyph; a tap opens the STEP panel in the function keys' place.
 */
export function StepCell(props: { word: boolean }): JSX.Element | null {
  const s = useStep()
  if (s === null) return null
  return (
    <button type="button" class="transport-key transport-key--step" aria-label={MirrorText.STEP_NAME} onClick={() => s.onOpen()}>
      {props.word ? <span class="transport-key__word" aria-hidden="true">{MirrorText.STEP.toUpperCase()}</span> : <StepGlyph />}
    </button>
  )
}

/**
 * CORRECT's key while the pattern plays with it on (Kotlin CorrectChip): lit
 * signal, a tap turns it off. The count corrected is in the pattern's words.
 */
export function CorrectKey(props: { compact?: boolean }): JSX.Element | null {
  const s = useStep()
  if (s === null) return null
  return (
    <div class={`transport-keys${props.compact ? ' transport-keys--compact' : ''} is-signal`}>
      <button type="button" class="transport-key transport-key--erase is-on" aria-pressed="true" aria-description={MirrorText.CORRECT_NOTE} onClick={() => s.onCorrect(false)}>
        {MirrorText.CORRECT.toUpperCase()}
      </button>
    </div>
  )
}

/** The STEP panel, on the line's dark screen: its header, then the strip with − and +, the knobs, BAR's pages, NUDGE and CORRECT. */
export function StepPanel(props: { class?: string }): JSX.Element | null {
  const s = useStep()
  if (s === null || !s.ui.open) return null
  return (
    <section class={`step-panel${props.class ? ` ${props.class}` : ''}`} aria-label={MirrorText.STEP_NAME}>
      <StepHeader s={s} />
      <StepDeck s={s} />
    </section>
  )
}

/** RECORD (held), ▶, the status ("STEP 1.2.1", or what was done last in signal orange) and ✕. */
function StepHeader(props: { s: StepActions }): JSX.Element {
  const { s } = props
  const ui = s.ui
  const latest = useRef(s)
  latest.current = s
  const down = useRef(false)
  const up = (): void => {
    if (!down.current) return
    down.current = false
    latest.current.onRecordUp()
  }
  useEffect(() => up, [])
  const status = ui.status
  return (
    <div class="step-panel__head">
      <button
        type="button"
        role="switch"
        aria-checked={ui.recordHeld}
        aria-label={MirrorText.RECORD}
        aria-description={MirrorText.STEP_RECORD_NOTE}
        class={`step-chip step-chip--record${ui.recordHeld ? ' is-on' : ''}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          down.current = true
          latest.current.onRecordDown()
        }}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={(e) => {
          // A screen reader's click holds it until the next one.
          if (e.detail !== 0) return
          if (latest.current.ui.recordHeld) latest.current.onRecordUp()
          else latest.current.onRecordDown()
        }}
      >
        <span class="step-chip__dot" aria-hidden="true" />
        <span class="step-chip__word" aria-hidden="true">{MirrorText.RECORD.toUpperCase()}</span>
      </button>
      <button type="button" class="step-chip" aria-label={MirrorText.PLAY} onClick={() => s.onPlay()}>
        <span class="step-chip__play" aria-hidden="true" />
      </button>
      <span class={`step-panel__status${status !== null ? ' is-signal' : ''}`} aria-hidden="true">
        {(status ?? MirrorText.stepStatus(ui.label)).toUpperCase()}
      </span>
      <span class="sr-only" aria-live="polite">
        {ui.said ?? status ?? MirrorText.stepSpoken(ui.label, 0)}
      </span>
      <button type="button" class="step-panel__close" aria-label={MirrorText.CLOSE_STEP} onClick={() => s.onClose()}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}

function StepDeck(props: { s: StepActions }): JSX.Element {
  const { s } = props
  const ui = s.ui
  const range = stripRange(ui)
  const nudgeOn = ui.nudgePick || ui.picked !== null
  const vel = ui.velocity
  const gate = ui.gate
  const velWords = vel !== null ? String(vel) : MirrorText.NO_VALUE
  const lenWords = gate !== null ? MirrorText.gateLabel(gate) : MirrorText.NO_VALUE
  return (
    <div class="step-panel__deck">
      <div class="step-panel__strip-row">
        <button type="button" class="step-key" aria-label={MirrorText.PREV_STEP} onClick={() => s.onMinus()}>
          −
        </button>
        <div class={`step-strip${range.length > 16 ? ' is-dense' : ''}`} role="group" aria-label={MirrorText.STEP}>
          {range.map((st) => {
            const on = st === ui.step
            const notes = ui.occupied[st] ?? false
            return (
              <button
                key={st}
                type="button"
                class={`step-cell${on ? ' is-on' : ''}${beatStarts(st, ui.interval) ? ' is-beat' : ''}`}
                aria-label={MirrorText.stepCell(MirrorText.stepLabel(st, ui.interval), notes)}
                aria-current={on ? 'step' : undefined}
                onClick={() => s.onJump(st)}
              >
                {notes && <span class="step-cell__dot" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        <button type="button" class="step-key" aria-label={MirrorText.NEXT_STEP} onClick={() => s.onPlus()}>
          +
        </button>
      </div>
      <div class="step-panel__knob-row">
        <label class={`step-knob step-knob--vel${vel === null ? ' is-off' : ''}`} onDblClick={() => vel !== null && (s.onVelocity(127), s.onKnobEnd())}>
          <span class="step-knob__word">{MirrorText.VEL.toUpperCase()}</span>
          <input
            type="range"
            min={1}
            max={127}
            step={1}
            value={vel ?? 127}
            disabled={vel === null}
            aria-label={MirrorText.VELOCITY}
            aria-valuetext={velWords}
            onInput={(e) => s.onVelocity(Number((e.currentTarget as HTMLInputElement).value))}
            onChange={() => s.onKnobEnd()}
          />
          <span class="step-knob__value">{velWords}</span>
        </label>
        <label
          class={`step-knob step-knob--len${gate === null ? ' is-off' : ''}`}
          onDblClick={() => gate !== null && (s.onGate(timingTicks(ui.interval)), s.onKnobEnd())}
        >
          <span class="step-knob__word">{MirrorText.LEN.toUpperCase()}</span>
          <input
            type="range"
            min={0}
            max={STEP_GATES.length - 1}
            step={1}
            value={gateKnob(gate ?? timingTicks(ui.interval))}
            disabled={gate === null}
            aria-label={MirrorText.NOTE_LENGTH}
            aria-valuetext={lenWords}
            onInput={(e) => s.onGate(STEP_GATES[Number((e.currentTarget as HTMLInputElement).value)] ?? 24)}
            onChange={() => s.onKnobEnd()}
          />
          <span class="step-knob__value">{lenWords}</span>
        </label>
        {ui.bars > 1 && (
          <div class="step-pages" role="tablist" aria-label={MirrorText.BAR}>
            <span class="step-pages__word" aria-hidden="true">{MirrorText.BAR.toUpperCase()}</span>
            <div class="step-pages__keys">
              {Array.from({ length: ui.bars }, (_, b) => (
                <button
                  key={b}
                  type="button"
                  role="tab"
                  aria-selected={b === ui.page}
                  aria-label={MirrorText.barPage(b + 1)}
                  class={`step-page${b === ui.page ? ' is-on' : ''}`}
                  onClick={() => s.onPage(b)}
                >
                  {b + 1}
                </button>
              ))}
            </div>
          </div>
        )}
        <div class="step-latches">
          <StepLatch
            word={MirrorText.nudgeChip(ui.picked !== null ? s.pickedWord : null)}
            on={nudgeOn}
            description={MirrorText.NUDGE}
            note={MirrorText.NUDGE_NOTE}
            onToggle={() => s.onNudge(!nudgeOn)}
          />
          <StepLatch word={MirrorText.CORRECT} on={ui.correct} description={MirrorText.CORRECT} note={MirrorText.CORRECT_NOTE} onToggle={() => s.onCorrect(!ui.correct)} />
        </div>
      </div>
    </div>
  )
}

/** One of the panel's latches: a thin dim border while off, filled signal orange while [on]; a switch for screen readers. */
function StepLatch(props: { word: string; on: boolean; description: string; note: string; onToggle(): void }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      aria-label={props.description}
      aria-description={props.note}
      class={`step-latch${props.on ? ' is-on' : ''}`}
      onClick={() => props.onToggle()}
    >
      <span aria-hidden="true">{props.word.toUpperCase()}</span>
    </button>
  )
}
