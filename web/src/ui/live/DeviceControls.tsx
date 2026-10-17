// The drawn EP-133's VOLUME, X and Y knobs and its fader (web only: Android
// draws no device), turning arc's own sound. Nothing goes to the EP-133.
//
// - VOLUME is arc's output (LiveAudio.setOutputVolume): the pads, the click
//   and the effects as this computer plays them, 0 to 100 %, kept in this
//   browser. Takes record before it.
// - X and Y follow what is held, open or shown, as the device's knobs do
//   ([knobTarget]), first that applies: KEYS held, its key and scale; TEMPO
//   held, X the tempo (Y the click's level, once arc's click has one: [click]);
//   a pad's sheet open, its page's X and Y (PadEditPages' pageKnobs); the
//   drawn device's page (deviceKeys.ts): SOUND the played pad's LEVEL and
//   PITCH, EDIT its page's X and Y (on the pad played last, not in a sheet),
//   TEMPO as held, TIMING the interval and the swing, FX the effect's X and Y,
//   OUTPUT the compressor's drive and speed, SIDECHAIN the duck's length and
//   shape; SAMPLE, LEVEL and THRESH; STEP, the step's VEL and LEN; otherwise
//   the effect's X and Y (the FX sheet's).
// - The fader is the shown group's level in the FX bus (FxDesk.setGroupLevel),
//   0 to 100 %, kept with the project's effects; it moves to a group's own
//   level when the group changes. On the FX page it is the group's send to
//   the effect (FxDesk.setSend). A group's other fader assignments (FADER +
//   a pad) are the host's ([faderAssigned]: none yet). With RECORD held it
//   rests: arc records no automation.
//
// A drag up or to the right turns a knob up, a full turn for about 220 px as
// Android's Knob (FULL_TURN), SHIFT held five times finer (the drawn SHIFT,
// or the computer's Shift); the fader's cap follows the pointer along its
// slot. The wheel steps either, and while one has the focus the arrows step it, PageUp and PageDown
// ten steps, Home and End to its ends (only the focused control: Live's own
// keys are letters and numbers, liveKeyboard.ts). A double tap puts it back
// to its default (as Knob.kt's). A press that doesn't move (under 4 px), or
// Enter, shows its shortcut card instead: a tap's once no second tap follows,
// so the card never covers the knob between the two. Each is a slider for screen readers, named as the
// device prints it, its value saying what it changes now.
import { createContext, type CSSProperties, type HTMLAttributes, type JSX, type TargetedKeyboardEvent, type TargetedPointerEvent, type TargetedWheelEvent } from 'preact'
import { useContext, useEffect, useRef } from 'preact/hooks'
import { FxSettings, FxType } from '../../core/features/fxSettings'
import { Keys, SCALES, type NoteNames, type Scale } from '../../core/features/keys'
import type { PadSettings } from '../../core/features/padSettings'
import { Timing, TIMING_INTERVALS, TimingSettings, timingSwings, timingTicks } from '../../core/features/pattern'
import { Tempo } from '../../core/features/tempo'
import { MirrorText } from '../../core/text/mirrorText'
import { WebText } from '../../core/text/webText'
import { SAMPLE_GAINS, SAMPLE_GAIN_MIC } from '../../platform/storage/settings'
import { STEP_GATES } from '../../state/stepPlan'
import { follow, sliderKey } from '../components/drag'
import { levelPitchKnobs, padPage, padPageShown, pageKnobs, type EditPage, type PageKnob } from '../sheets/PadEditPages'
import { useHaptic } from '../useHaptic'
import { useDeviceKeys } from './DeviceKeys'
import { held } from './deviceKeys'
import { TempoContext } from './FunctionRow'
import { THRESHOLD_OFF, thresholdKnob, thresholdOfKnob, useSample, type SampleActions } from './SamplePanel'
import { gateKnob, useStep, type StepActions } from './StepPanel'

/** A drag across this many CSS px turns a knob through its whole range (Knob.kt's FULL_TURN). */
export const FULL_TURN_PX = 220
/** Shift held, a drag turns this many times finer (the device's SHIFT). */
export const FINE = 5
/** A press that moves less than this (CSS px) is a tap: the card. */
export const TAP_SLOP_PX = 4
/** The fader's cap travels this much of its slot's height (DeviceView.css: 228 of 306). */
export const FADER_TRAVEL = 228 / 306
/** The wheel ends a turn (STEP's UNDO step) once it rests this long. */
const WHEEL_REST_MS = 400
/** A second tap within this long (ms) is a double tap: back to the default (Android's double-tap timeout). */
export const DOUBLE_TAP_MS = 300

/** The drawn controls that turn. */
export type DeviceControl = 'volume' | 'x' | 'y' | 'fader'

/**
 * What a control turns now: its [name] on the plate ("FX X") and [what] it
 * changes for screen readers ("effect X"), its value in [min]..[max] by
 * [step], back to [def], read out as [readout] (and [spoken]); [set] turns
 * it, [end] ends a turn (STEP's UNDO step). Not [enabled]: it rests.
 */
export interface Turnable {
  readonly name: string
  readonly what: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly def: number
  readonly readout: string
  readonly spoken: string
  readonly enabled: boolean
  set(v: number): void
  end?(): void
}

/** A pad's sound settings as the knobs turn them: [enabled] once the pad is read. */
export interface PadKnobs {
  readonly settings: PadSettings
  readonly frames: number | null
  readonly sampleRate: number
  readonly enabled: boolean
  adjust(s: PadSettings): void
}

/** The tempo and what sets it; [click] the click's level (0..1), once arc's click has one. */
export interface TempoKnobs {
  readonly bpm: number
  set(bpm: number): void
  readonly click?: { readonly level: number; set(v: number): void } | null
}

/** The drawn device's page (deviceKeys.ts) as its knobs see it: SOUND and EDIT on the pad played last (null: none, or not read yet). */
export type KnobPage =
  | { readonly kind: 'SOUND'; readonly pad: PadKnobs | null }
  | { readonly kind: 'EDIT'; readonly page: EditPage; readonly pad: PadKnobs | null }
  | { readonly kind: 'TEMPO'; readonly tempo: TempoKnobs }
  | { readonly kind: 'TIMING'; readonly timing: TimingSettings; setInterval(t: Timing): void; setSwing(percent: number): void }
  | { readonly kind: 'FX' | 'OUTPUT' | 'SIDECHAIN' }

/** What knob X and Y can turn, in [knobTarget]'s order. */
export interface KnobInputs {
  /** KEYS held on the drawn device: its key and scale, and what sets them; null while it isn't. */
  readonly keys: { readonly root: number; readonly scale: Scale; readonly names: NoteNames; setRoot(root: number): void; setScale(scale: Scale): void } | null
  /** The pad sheet open on [page] ([enabled] once the pad is read); null with none open. */
  readonly pad: (PadKnobs & { readonly page: EditPage }) | null
  /** The drawn device's page; null on MAIN. */
  readonly page: KnobPage | null
  /** SAMPLE (its panel open while ui.on). */
  readonly sample: Pick<SampleActions, 'ui' | 'onGain' | 'onThreshold'> | null
  /** STEP (its panel open while ui.open). */
  readonly step: Pick<StepActions, 'ui' | 'onVelocity' | 'onGate' | 'onKnobEnd'> | null
  /** TEMPO held: the tempo and what sets it; null while it isn't. */
  readonly tempo: TempoKnobs | null
  /** The project's effect, at the tempo its delay follows; the compressor and the sidechain (OUTPUT, SIDECHAIN). */
  readonly fx: {
    readonly settings: FxSettings
    readonly bpm: number
    setXY(x: number, y: number): void
    setComp?(x: number, y: number): void
    setSidechainXY?(x: number, y: number): void
  }
}

const pct = (v: number): string => String(Math.round(v * 100))

/** A 0..1 control in hundredths, shown as 0..100 ("62") and said as a percentage. */
function unit(name: string, what: string, value: number, def: number, set: (v: number) => void): Turnable {
  return { name, what, value, min: 0, max: 1, step: 0.01, def, readout: pct(value), spoken: `${pct(value)}%`, enabled: true, set }
}

/** A pad page's knob [k] on [pad]'s settings (null: the page has none). */
function padKnob(k: PageKnob | null, pad: PadKnobs): Turnable | null {
  if (k === null) return null
  return {
    name: k.label.toUpperCase(),
    what: k.label,
    value: k.value,
    min: k.min,
    max: k.max,
    step: k.step,
    def: k.def,
    readout: k.readout,
    spoken: k.readout,
    enabled: pad.enabled && !k.disabled,
    set: (v) => pad.adjust(k.apply(v)),
  }
}

/** TEMPO's X (the tempo) or Y (the click's level, where arc's click has one). */
function tempoKnob(x: boolean, tempo: TempoKnobs): Turnable | null {
  if (!x) {
    const click = tempo.click ?? null
    return click === null ? null : unit(MirrorText.CLICK.toUpperCase(), WebText.TURN_CLICK, click.level, 1, (v) => click.set(v))
  }
  return {
    name: MirrorText.FN_TEMPO.toUpperCase(),
    what: WebText.TURN_TEMPO,
    value: tempo.bpm,
    min: Tempo.MIN,
    max: Tempo.MAX,
    step: 1,
    def: Tempo.DEFAULT,
    readout: String(tempo.bpm),
    spoken: MirrorText.tempoValue(tempo.bpm),
    enabled: true,
    set: (v) => tempo.set(Math.round(v)),
  }
}

/** KEYS held: X its key (0..11), Y its scale. */
function keysKnob(x: boolean, keys: NonNullable<KnobInputs['keys']>): Turnable {
  if (x) {
    const name = Keys.name(keys.root, keys.names)
    return { name: MirrorText.KEY.toUpperCase(), what: WebText.TURN_KEY, value: keys.root, min: 0, max: 11, step: 1, def: 0, readout: name, spoken: name, enabled: true, set: (v) => keys.setRoot(Math.round(v)) }
  }
  const i = Math.max(0, SCALES.indexOf(keys.scale))
  const name = MirrorText.scaleName(keys.scale)
  return {
    name: MirrorText.SCALE.toUpperCase(),
    what: WebText.TURN_SCALE,
    value: i,
    min: 0,
    max: SCALES.length - 1,
    step: 1,
    def: 0,
    readout: name,
    spoken: name,
    enabled: true,
    set: (v) => keys.setScale(SCALES[Math.min(Math.max(Math.round(v), 0), SCALES.length - 1)]!),
  }
}

/** TIMING's page: X the interval (1/1 … 1/32), Y the swing (50 to 75 %, where the interval swings). */
function timingKnob(x: boolean, p: Extract<KnobPage, { kind: 'TIMING' }>): Turnable {
  const t = p.timing
  if (x) {
    const i = Math.max(0, TIMING_INTERVALS.indexOf(t.interval))
    return {
      name: MirrorText.INTERVAL.toUpperCase(),
      what: WebText.TURN_INTERVAL,
      value: i,
      min: 0,
      max: TIMING_INTERVALS.length - 1,
      step: 1,
      def: TIMING_INTERVALS.indexOf(Timing.DEFAULT),
      readout: MirrorText.timingLabel(t.interval),
      spoken: MirrorText.intervalName(t.interval),
      enabled: true,
      set: (v) => p.setInterval(TIMING_INTERVALS[Math.min(Math.max(Math.round(v), 0), TIMING_INTERVALS.length - 1)]!),
    }
  }
  return {
    name: MirrorText.SWING.toUpperCase(),
    what: WebText.TURN_SWING,
    value: t.swing,
    min: TimingSettings.SWING_MIN,
    max: TimingSettings.SWING_MAX,
    step: 1,
    def: TimingSettings.SWING_MIN,
    readout: MirrorText.percent(t.swing),
    spoken: MirrorText.percent(t.swing),
    enabled: timingSwings(t.interval),
    set: (v) => p.setSwing(Math.round(v)),
  }
}

/** The effect's X or Y, named and read as the FX sheet does ("LENGTH · 1/8D"), or FX X / FX Y with none on. */
function fxKnob(x: boolean, fx: KnobInputs['fx']): Turnable {
  const st = fx.settings
  const v = x ? st.x : st.y
  const set = (n: number): void => (x ? fx.setXY(n, st.y) : fx.setXY(st.x, n))
  const def = x ? FxSettings.DEFAULT.x : FxSettings.DEFAULT.y
  if (st.type === FxType.NONE) return unit(x ? 'FX X' : 'FX Y', x ? WebText.TURN_FX_X : WebText.TURN_FX_Y, v, def, set)
  const label = x ? FxSettings.xLabel(st.type) : FxSettings.yLabel(st.type)
  const readout = x ? FxSettings.xReadout(st.type, v, fx.bpm) : FxSettings.yReadout(st.type, v)
  return { ...unit(label, `${MirrorText.fxName(st.type)} ${label.toLowerCase()}`, v, def, set), readout, spoken: readout }
}

/** OUTPUT's compressor: X its drive, Y its speed (turned, it is on). */
function compKnob(x: boolean, fx: KnobInputs['fx']): Turnable | null {
  const setComp = fx.setComp
  if (setComp === undefined) return null
  const c = fx.settings.comp
  const label = x ? MirrorText.DRIVE : MirrorText.SPEED
  const v = x ? c.x : c.y
  const readout = x ? FxSettings.xReadout(FxType.COMPRESSOR, v) : FxSettings.yReadout(FxType.COMPRESSOR, v)
  const def = x ? FxSettings.DEFAULT.comp.x : FxSettings.DEFAULT.comp.y
  const t = unit(label.toUpperCase(), WebText.turnOutput(label), v, def, (n) => (x ? setComp(n, c.y) : setComp(c.x, n)))
  return { ...t, readout, spoken: readout }
}

/** SIDECHAIN: X the duck's length, Y its shape. */
function sidechainKnob(x: boolean, fx: KnobInputs['fx']): Turnable | null {
  const setXY = fx.setSidechainXY
  if (setXY === undefined) return null
  const sc = fx.settings.sidechain
  const label = x ? MirrorText.LENGTH : MirrorText.SHAPE
  const v = x ? sc.x : sc.y
  const readout = x ? MirrorText.sidechainLength(v) : MirrorText.sidechainShape(v)
  const def = x ? FxSettings.DEFAULT.sidechain.x : FxSettings.DEFAULT.sidechain.y
  const t = unit(label.toUpperCase(), WebText.turnSidechain(label), v, def, (n) => (x ? setXY(n, sc.y) : setXY(sc.x, n)))
  return { ...t, readout, spoken: readout }
}

/**
 * What knob [knob] turns, first that applies: KEYS held (its key, its
 * scale), TEMPO held (X the tempo, Y the click's level where it has one),
 * the pad sheet (its page's X or Y, null where the page has none), the drawn
 * device's page, SAMPLE (LEVEL, THRESH), STEP (VEL, LEN), else the effect's X
 * or Y.
 */
export function knobTarget(knob: 'x' | 'y', s: KnobInputs): Turnable | null {
  const x = knob === 'x'
  if (s.keys !== null) return keysKnob(x, s.keys)
  if (s.tempo !== null) return tempoKnob(x, s.tempo)
  const pad = s.pad
  if (pad !== null) return padKnob(pageKnobs(pad.page, pad.settings, pad.frames, pad.sampleRate)[knob], pad)
  const page = s.page
  if (page !== null) {
    switch (page.kind) {
      case 'SOUND': {
        if (page.pad === null) return null
        const lp = levelPitchKnobs(page.pad.settings)
        return padKnob(x ? lp.level : lp.pitch, page.pad)
      }
      case 'EDIT':
        return page.pad === null ? null : padKnob(pageKnobs(page.page, page.pad.settings, page.pad.frames, page.pad.sampleRate)[knob], page.pad)
      case 'TEMPO':
        return tempoKnob(x, page.tempo)
      case 'TIMING':
        return timingKnob(x, page)
      case 'FX':
        return fxKnob(x, s.fx)
      case 'OUTPUT':
        return compKnob(x, s.fx)
      case 'SIDECHAIN':
        return sidechainKnob(x, s.fx)
    }
  }
  const sample = s.sample
  if (sample !== null && sample.ui.on) {
    const ui = sample.ui
    if (x) {
      const gain = MirrorText.gainReadout(Math.round(ui.gainDb))
      return {
        name: MirrorText.LEVEL.toUpperCase(),
        what: MirrorText.LEVEL,
        value: ui.gainDb,
        min: SAMPLE_GAINS.min,
        max: SAMPLE_GAINS.max,
        step: 1,
        def: ui.input.source === 'mic' ? SAMPLE_GAIN_MIC : 0,
        readout: gain,
        spoken: gain,
        enabled: true,
        set: (v) => sample.onGain(v),
      }
    }
    const thresh = MirrorText.thresholdReadout(ui.thresholdDb === null ? null : Math.round(ui.thresholdDb))
    return {
      name: MirrorText.THRESHOLD.toUpperCase(),
      what: MirrorText.THRESHOLD_NAME,
      value: thresholdKnob(ui.thresholdDb),
      min: THRESHOLD_OFF,
      max: 0,
      step: 1,
      def: THRESHOLD_OFF,
      readout: thresh,
      spoken: thresh,
      enabled: true,
      set: (v) => sample.onThreshold(thresholdOfKnob(v)),
    }
  }
  const step = s.step
  if (step !== null && step.ui.open) {
    const ui = step.ui
    const end = (): void => step.onKnobEnd()
    if (x) {
      const vel = ui.velocity
      const words = vel !== null ? String(vel) : MirrorText.NO_VALUE
      return {
        name: MirrorText.VEL.toUpperCase(),
        what: MirrorText.VELOCITY,
        value: vel ?? 127,
        min: 1,
        max: 127,
        step: 1,
        def: 127,
        readout: words,
        spoken: words,
        enabled: vel !== null,
        set: (v) => step.onVelocity(Math.round(v)),
        end,
      }
    }
    const gate = ui.gate
    const words = gate !== null ? MirrorText.gateLabel(gate) : MirrorText.NO_VALUE
    return {
      name: MirrorText.LEN.toUpperCase(),
      what: MirrorText.NOTE_LENGTH,
      value: gateKnob(gate ?? timingTicks(ui.interval)),
      min: 0,
      max: STEP_GATES.length - 1,
      step: 1,
      def: gateKnob(timingTicks(ui.interval)),
      readout: words,
      spoken: words,
      enabled: gate !== null,
      set: (v) => step.onGate(STEP_GATES[Math.round(v)] ?? timingTicks(ui.interval)),
      end,
    }
  }
  return fxKnob(x, s.fx)
}

/** VOLUME at [volume] (0..1), turned by [set]. */
export function volumeTarget(volume: number, set: (v: number) => void): Turnable {
  return unit('VOLUME', WebText.TURN_VOLUME, volume, 1, set)
}

/** The fader on group [group] of [fx], turned by [set]. */
export function faderTarget(group: number, fx: FxSettings, set: (group: number, v: number) => void): Turnable {
  const g = MirrorText.groupKey(group)
  return unit(`${MirrorText.GROUP.toUpperCase()} ${g}`, WebText.turnGroup(g), fx.levels[group] ?? 1, 1, (v) => set(group, v))
}

/** The fader on the FX page: group [group]'s send to the effect, turned by [set]. */
export function sendTarget(group: number, fx: FxSettings, set: (group: number, v: number) => void): Turnable {
  const g = MirrorText.groupKey(group)
  return unit(`→FX ${g}`, WebText.turnSend(g), fx.sends[group] ?? 0, 0, (v) => set(group, v))
}

/** The drawn controls' state and what turns it (app.tsx: the controller's). */
export interface DeviceControlsUi {
  /** VOLUME, 0..1. */
  readonly volume: number
  setVolume(v: number): void
  /** The project's FX, and the tempo its delay follows. */
  readonly fx: FxSettings
  readonly bpm: number
  setFxXY(x: number, y: number): void
  setGroupLevel(group: number, v: number): void
  setSend(group: number, v: number): void
  setComp(x: number, y: number): void
  setSidechainXY(x: number, y: number): void
  /** The pad sheet's pad while it is open, or the drawn device's SOUND and EDIT pages' (the pad played last). */
  readonly padEdit: { readonly settings: PadSettings; readonly frames: number | null; readonly sampleRate: number; readonly reading: boolean; readonly failed: boolean } | null
  adjustPad(s: PadSettings): void
  setTempo(bpm: number): void
  /** KEYS' key and scale (KEYS held on the drawn device turns them). */
  readonly keys: { readonly root: number; readonly scale: Scale; readonly names: NoteNames }
  setKeysRoot(root: number): void
  setKeysScale(scale: Scale): void
  /** TIMING's interval, swing and quantize (the TIMING page). */
  readonly timing: TimingSettings
  setTimingInterval(t: Timing): void
  setTimingSwing(percent: number): void
  /** The click's level (0..1) for TEMPO's Y; none while arc's click has no level. */
  readonly click?: { readonly level: number; set(v: number): void } | null
  /** Group [group]'s fader when FADER + a pad gave it something other than its level; none: the level (or the FX page's send). */
  faderAssigned?(group: number): Turnable | null
}

/** The drawn EP-133's knobs and fader; null: they only show their shortcuts. */
export const DeviceControlsContext = createContext<DeviceControlsUi | null>(null)

/** What control [which] turns now, on group [group] (the fader's); null for none (or nothing to turn). */
export function useTurnable(which: DeviceControl | null, group: number): Turnable | null {
  const c = useContext(DeviceControlsContext)
  const sample = useSample()
  const step = useStep()
  const tempo = useContext(TempoContext)
  const dk = useDeviceKeys()
  const sheetPage = padPageShown.value
  const editPage = padPage.value
  const keysState = dk?.layer.state.value ?? null
  if (c === null || which === null) return null
  if (which === 'volume') return volumeTarget(c.volume, (v) => c.setVolume(v))
  const page = keysState?.page ?? 'MAIN'
  if (which === 'fader') {
    const t = c.faderAssigned?.(group) ?? (page === 'FX' ? sendTarget(group, c.fx, (g, v) => c.setSend(g, v)) : faderTarget(group, c.fx, (g, v) => c.setGroupLevel(g, v)))
    // RECORD held: the device records the fader's moves; arc doesn't, so it rests.
    return keysState !== null && held(keysState, 'RECORD') ? { ...t, enabled: false } : t
  }
  const edit = c.padEdit
  const fx = c.fx
  const padKnobs: PadKnobs | null =
    edit !== null ? { settings: edit.settings, frames: edit.frames, sampleRate: edit.sampleRate, enabled: !edit.reading && !edit.failed, adjust: (s) => c.adjustPad(s) } : null
  const layer = dk?.layer ?? null
  const tempoKnobs = (spend: boolean): TempoKnobs | null =>
    tempo === null
      ? null
      : {
          bpm: tempo.bpm,
          set: (bpm) => {
            if (spend) layer?.turned()
            c.setTempo(bpm)
          },
          click: c.click ?? null,
        }
  return knobTarget(which, {
    keys:
      keysState !== null && held(keysState, 'KEYS')
        ? {
            ...c.keys,
            setRoot: (r) => {
              layer?.turned()
              c.setKeysRoot(r)
            },
            setScale: (sc) => {
              layer?.turned()
              c.setKeysScale(sc)
            },
          }
        : null,
    pad: padKnobs !== null && sheetPage !== null ? { ...padKnobs, page: sheetPage } : null,
    page: knobPage(page, padKnobs, editPage, tempoKnobs(false), c),
    sample,
    step,
    tempo: keysState !== null && held(keysState, 'TEMPO') ? tempoKnobs(true) : null,
    // The tempo only for the delay's readout (it re-renders with the state).
    fx: {
      settings: fx,
      bpm: fx.type === FxType.DELAY ? c.bpm : Tempo.DEFAULT,
      setXY: (x, y) => c.setFxXY(x, y),
      setComp: (x, y) => c.setComp(x, y),
      setSidechainXY: (x, y) => c.setSidechainXY(x, y),
    },
  })
}

/** The drawn device's [page] as the knobs see it (null on MAIN, and TEMPO without a click to time). */
function knobPage(page: string, pad: PadKnobs | null, editPage: EditPage, tempo: TempoKnobs | null, c: DeviceControlsUi): KnobPage | null {
  switch (page) {
    case 'SOUND':
      return { kind: 'SOUND', pad }
    case 'EDIT':
      return { kind: 'EDIT', page: editPage, pad }
    case 'TEMPO':
      return tempo === null ? null : { kind: 'TEMPO', tempo }
    case 'TIMING':
      return { kind: 'TIMING', timing: c.timing, setInterval: (t) => c.setTimingInterval(t), setSwing: (v) => c.setTimingSwing(v) }
    case 'FX':
    case 'OUTPUT':
    case 'SIDECHAIN':
      return { kind: page }
    default:
      return null
  }
}

/** [v] on [t]'s grid of steps, in its range. */
function snap(t: Turnable, v: number): number {
  const s = t.step > 0 ? t.min + Math.round((v - t.min) / t.step) * t.step : v
  return Math.min(Math.max(Math.round(s * 1e6) / 1e6, t.min), t.max)
}

/** [t]'s value as a share of its range (0..1). */
export function share(t: Turnable | null): number {
  if (t === null || t.max <= t.min) return 0
  return Math.min(Math.max((t.value - t.min) / (t.max - t.min), 0), 1)
}

/**
 * A control's pointer, wheel and keys, for [t] ([fader]: its cap follows a
 * vertical drag along the slot, FADER_TRAVEL of its height; else a knob's
 * turn); a tap (once no second follows) or Enter is [onTap] with the
 * element, each step taken [onTurned]. A drag with Shift held, or while
 * [fine] says the drawn SHIFT is, turns five times finer.
 */
function useTurn(t: Turnable | null, fader: boolean, onTap: (el: HTMLElement) => void, onTurned: () => void, fine?: () => boolean) {
  const latest = useRef({ t, onTap, onTurned, fine })
  latest.current = { t, onTap, onTurned, fine }
  // Each step felt as KnobSlider's (Android's TextHandleMove), under Settings → Haptics.
  const feel = useHaptic()
  const rest = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A tap waiting to see whether a second one follows (a double tap) before it shows the card.
  const tap = useRef<ReturnType<typeof setTimeout> | null>(null)
  const untap = (): boolean => {
    if (tap.current === null) return false
    clearTimeout(tap.current)
    tap.current = null
    return true
  }
  useEffect(
    () => () => {
      if (rest.current !== null) clearTimeout(rest.current)
      untap()
    },
    [],
  )
  /** Turns to [v] from [from] (null: from the value shown); what it lands on, or null for no change. */
  const turn = (v: number, from: number | null = null): number | null => {
    const cur = latest.current.t
    if (cur === null || !cur.enabled) return null
    const next = snap(cur, v)
    if (Math.abs(next - (from ?? cur.value)) < 1e-6) return null
    feel('handle')
    cur.set(next)
    latest.current.onTurned()
    return next
  }
  const end = (): void => latest.current.t?.end?.()
  return {
    onPointerDown: (e: TargetedPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      const el = e.currentTarget
      el.focus({ preventScroll: true })
      const start = latest.current.t
      // The value under the pointer, unrounded, so slow moves add up; where it last landed.
      let raw = start?.value ?? 0
      let shown = raw
      let moved = false
      let travel = 0
      let lastX = e.clientX
      let lastY = e.clientY
      follow(
        e,
        (ev) => {
          const dx = ev.clientX - lastX
          const dy = ev.clientY - lastY
          lastX = ev.clientX
          lastY = ev.clientY
          if (!moved) {
            // A hand's tremble turns nothing (and is still a tap); past it, it turns without a jump.
            travel += Math.abs(dx) + Math.abs(dy)
            if (travel < TAP_SLOP_PX) return
            moved = true
            // A tap just before it shows no card: the turn is what was meant.
            untap()
            return
          }
          const cur = latest.current.t
          if (cur === null) return
          const span = cur.max - cur.min
          const px = fader ? -dy : dx - dy
          const full = fader ? el.getBoundingClientRect().height * FADER_TRAVEL : FULL_TURN_PX
          raw = Math.min(Math.max(raw + (px * span) / (full * (ev.shiftKey || latest.current.fine?.() === true ? FINE : 1)), cur.min), cur.max)
          const landed = turn(raw, shown)
          if (landed !== null) shown = landed
        },
        (_, cancelled) => {
          if (moved) {
            end()
          } else if (!cancelled) {
            // The second of two taps: the default, and no card; the first waits to know.
            if (untap()) {
              const cur = latest.current.t
              if (cur !== null) turn(cur.def)
              end()
            } else {
              tap.current = setTimeout(() => {
                tap.current = null
                latest.current.onTap(el)
              }, DOUBLE_TAP_MS)
            }
          }
        },
      )
    },
    onWheel: (e: TargetedWheelEvent<HTMLDivElement>) => {
      const cur = latest.current.t
      if (cur === null) return
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? -e.deltaY : e.deltaX
      if (d === 0) return
      e.preventDefault()
      turn(cur.value + Math.sign(d) * cur.step)
      if (rest.current !== null) clearTimeout(rest.current)
      rest.current = setTimeout(() => {
        rest.current = null
        end()
      }, WHEEL_REST_MS)
    },
    onKeyDown: (e: TargetedKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        latest.current.onTap(e.currentTarget)
        return
      }
      const k = sliderKey(e.key)
      const cur = latest.current.t
      if (k === null || cur === null) return
      e.preventDefault()
      turn('step' in k ? cur.value + k.step * cur.step : k.to === 'min' ? cur.min : cur.max)
      end()
    },
  }
}

/** A control's slider attributes for screen readers, named [label]. */
function sliderAttrs(label: string, t: Turnable | null): HTMLAttributes<HTMLDivElement> {
  return {
    role: 'slider',
    tabIndex: 0,
    'aria-label': label,
    'aria-valuemin': t?.min ?? 0,
    'aria-valuemax': t?.max ?? 1,
    // A float's value without its float noise (0.62, not 0.6200000047683716).
    'aria-valuenow': t !== null ? Math.round(t.value * 1e4) / 1e4 : 0,
    'aria-valuetext': t !== null ? WebText.turnValue(t.what, t.spoken) : WebText.TURN_NOTHING,
    'aria-disabled': t === null || !t.enabled ? true : undefined,
    'aria-description': WebText.DEVICE_TURN_HINT,
  }
}

/**
 * One of the drawn knobs ([kind]: VOLUME, X or Y, at [place]), turning [t]:
 * its cap's mark points at the value, 135° either side of straight up.
 */
export function DrawnKnob(props: {
  kind: 'vol' | 'x' | 'y'
  label: string
  place: CSSProperties
  t: Turnable | null
  onTap: (el: HTMLElement) => void
  onTurned: () => void
  /** SHIFT held on the drawn device: five times finer. */
  fine?: () => boolean
}): JSX.Element {
  const { t } = props
  const turn = useTurn(t, false, props.onTap, props.onTurned, props.fine)
  return (
    <div
      class={`ep-a ep-knob ep-knob--${props.kind}${t === null || !t.enabled ? ' is-resting' : ''}`}
      style={{ ...props.place, '--turn': `${-135 + 270 * share(t)}deg` }}
      {...sliderAttrs(props.label, t)}
      {...turn}
    >
      <span class="ep-knob__mark" aria-hidden="true" />
    </div>
  )
}

/** The drawn fader turning [t] (the shown group's level): its cap sits at the level. */
export function DrawnFader(props: { t: Turnable | null; onTap: (el: HTMLElement) => void; onTurned: () => void; fine?: () => boolean }): JSX.Element {
  const { t } = props
  const turn = useTurn(t, true, props.onTap, props.onTurned, props.fine)
  return (
    <div class="ep-a ep-fader" style={t !== null ? { '--level': share(t) } : undefined} aria-orientation="vertical" {...sliderAttrs('Fader', t)} {...turn}>
      <span class="ep-fader__slot" />
      <span class="ep-fader__tick" />
      <span class="ep-fader__cap" />
    </div>
  )
}
