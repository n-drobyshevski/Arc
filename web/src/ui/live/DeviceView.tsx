// The device view (web only): on the desk Live draws the EP-133 K.O. II by
// default (Live tools' View: All groups, One group, Device), at the unit's
// 176 × 240 mm (1444 × 1969, scaled to fit), and the mirror drives it.
//
// - The drawing is the unit's: a bead-blasted grey body, the jack tabs on its
//   top edge, the plate and the speaker (only its middle drilled through), the
//   display's black glass with every icon printed faintly and the lit ones
//   bright, each key a cap in its own near-black well (the two-word keys a
//   short cap over a printed tile), the LEDs and the deck's thin printing. It
//   prints in Jost (only the drawing: the cards and panels keep Live's font),
//   keeps its colours in both themes, and its icons and glyphs are drawn here.
// - The pads are Live's own (MirrorScreen's Pad and KeyCap, [pads]) in the
//   drawn ones' places ([padPlace]): they play as the grid's do (hold = gate,
//   a finger per pad), EDIT, ERASE, STEP, ARP and SAMPLE mark them, sounds
//   drop on them; in KEYS they are the 12 notes, FX held the punch-ins. A pad
//   sounding lights its whole cap orange, as strong as the grid's glow. A key
//   held takes them as the device does (MAIN a project 1 to 9, SOUND, TEMPO
//   or a group key a number typed, KEYS the key, FADER its assignment).
// - The keys take the device's combos (live/deviceKeys.ts, DeviceKeys.tsx;
//   the grid views and Live's function row keep arc's own keys): SOUND,
//   SHIFT + SOUND (EDIT), TEMPO, TIMING, FX and SHIFT + FX (OUTPUT, then
//   SIDECHAIN) are pages, MAIN goes back to MAIN; held, keys combine (KEYS + −
//   / + the octave, a group + − / + its pattern, MAIN + − / + the scene, ERASE
//   + a group clears it, SHIFT + B undoes, …), a right-click holds a key until
//   the next, SHIFT clicked holds it for the next key, and the computer's
//   Shift is SHIFT. − / + step what is held or shown (their names and LEDs
//   say what). RECORD and PLAY are the pattern's (PatternLine.tsx; with STEP
//   open RECORD is the panel's), held RECORD with − / + its length. TAKE
//   stays in Live tools; a take going shows on the display (● and the time)
//   and the plate. A combo arc has nothing for (the system settings, CHOP, …)
//   says so on the plate.
// - A page shows on the device, not in a sheet: the plate's orange line is the
//   page's ("EDIT · TRIM — X START · Y LENGTH · −/+ PAGE"), a key that opens
//   arc's own sheet for it; the digits show its word as it opens (SND, EDT,
//   TRM, TMP, TIM, DLY, OUT, SCH …), then on SOUND the pad's slot; the
//   display lights FX on FX, OUTPUT and SIDECHAIN, SWING on TIMING, FREE in
//   free time, the TEMPO and MAIN boxes on their pages, ERASE's while it is
//   on, COPY and PASTE as they go, and SOUND's box on SOUND and EDIT.
// - The open panel (SAMPLE, STEP, SCENE) lies over the plate and the display
//   ([panel]); the display line (S01 and STEP, ERASE, the words) is over the
//   device (MirrorScreen). A page and a panel never show together.
// - The display lights ▶ while the device plays (MIDI clock), the tempo in
//   fourteen segments, BPM, ● (RECORD or a take), the metronome with the
//   click, the group's card A–D and its quarter of the ring (a sounding
//   group's too), the level meter, and the piano and KEYS in KEYS. The group
//   LEDs light the group shown and breathe with the other groups sounding; a
//   group soloed (FX + its key) is lit, one silenced dark, and MUTE lights on
//   the display. While FADER is held the LEDs over the pads light: the shown
//   group's fader's parameter bright, the others arc has dim (TIME, VEL and
//   MOD stay dark). − and + light where they can step. The plate, where the unit prints its
//   name, carries arc's status (or the page) and the last hit, or what was
//   just done ("LENGTH · 4 BARS"), said once for screen readers.
// - The knobs and the fader turn arc's own sound (DeviceControls.tsx): VOLUME
//   arc's output, X and Y what is held, open or shown, as the device's do
//   (KEYS held its key and scale, TEMPO the tempo, a pad's sheet or EDIT its
//   page's X and Y, SOUND the pad's LEVEL and PITCH, TIMING the interval and
//   the swing, FX the effect, OUTPUT the compressor, SIDECHAIN the duck,
//   SAMPLE LEVEL and THRESH, STEP VEL and LEN; TEMPO's Y the click's level),
//   the fader the shown group's level, or what FADER + a pad gave it (its
//   send on FX). Their caps show where they are, and while one
//   turns the digits and the plate's hit line show its value, as the EP-133's
//   display does. A tap on a knob or the fader (or Enter) still opens its
//   card with its shortcuts from the guide; arc never sends anything to the
//   device.
import '@fontsource/jost/latin-300.css'
import '@fontsource/jost/latin-400.css'
import '@fontsource/jost/latin-500.css'
import '@fontsource/jost/latin-700.css'
import type { ButtonHTMLAttributes, Component, ComponentChildren, CSSProperties, FunctionComponent, HTMLAttributes, JSX } from 'preact'
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { signal, type ReadonlySignal } from '@preact/signals'
import { FADER_PARAMS, faderParamSupported, type FaderParam, type FxType } from '../../core/features/fxSettings'
import type { MirrorState } from '../../core/features/liveMirror'
import { ROWS } from '../../core/features/padNotes'
import { parse } from '../../core/text/guideCombo'
import { CLOSE } from '../../core/text/guideText'
import { MirrorText } from '../../core/text/mirrorText'
import { WebText } from '../../core/text/webText'
import type { MirrorUi } from '../../state/types'
import type { CoachId } from '../components/Coach'
import { ComboLine } from '../components/GuideKeys'
import { EDIT_PAGES, padPage } from '../sheets/PadEditPages'
import { useDeviceKeys, useLayerPress, type DeviceKeysUi } from './DeviceKeys'
import { groupKey, held, keyLit, type DeviceKey, type DeviceKeys, type DevicePage } from './deviceKeys'
import { FunctionKeysContext, TempoContext } from './FunctionRow'
import { PatternGridOver, useScene, worthSaying } from './ScenePanel'
import { useSample } from './SamplePanel'
import { useStep } from './StepPanel'
import { DrawnFader, DrawnKnob, useTurnable, type DeviceControl } from './DeviceControls'
import {
  TransportContext,
  hasWords,
  patternRuns,
  patternWordsText,
  playName,
  recordLight,
  recordName,
  usePatternBeat,
  useTransportPress,
  type TransportUi,
} from './PatternLine'
import { of as keymapOf } from '../../core/text/guideKeymap'
import { displayLine, glowCss, groupGlow } from './glow'
import type { KeysShown } from './keys'
import { cardName, cardSearch, shortcutsFor, type CardKey } from './shortcuts'
import type { TakeUi } from './Takes'
import { Spoken } from './spoken'
import './DeviceView.css'

/** The unit's size (176 × 240 mm): everything below is placed in these units, then scaled. */
export const DEVICE_W = 1444
export const DEVICE_H = 1969

/** How long the plate's hit line shows a knob's or the fader's value after it last turned (ms). */
const TURN_SHOWN_MS = 1500

/** Where the controls start under the display (the scene grid covers them). */
const CONTROLS_Y = 869
/** The knobs' and the top function keys' row. */
const KROW = 919
const COLS = [461, 657, 853]
const ROW_Y = [1116, 1312, 1507, 1704]
const LED_Y = [1081, 1276, 1472, 1669]
const LED_LABELS = [
  ['LEVEL', 'PITCH', 'TIME'],
  ['LPF', 'HPF', '→ FX'],
  ['ATK', 'REL', 'PAN'],
  ['TUNE', 'VEL', 'MOD'],
] as const
/** The group keys' glyphs (A ✳, B ↩, C ↥, D ↧), drawn on a 12-unit grid. */
const GROUP_GLYPHS = [
  'M6 1.6V10.4M1.6 6H10.4M2.9 2.9L9.1 9.1M9.1 2.9L2.9 9.1',
  'M9.5 2.5V5.2A2.8 2.8 0 0 1 6.7 8H2.5M2.5 8L4.9 5.6M2.5 8L4.9 10.4',
  'M6 8.5V1.8M6 1.8L3.5 4.3M6 1.8L8.5 4.3M2 10.5H10',
  'M6 1.5V8.5M6 8.5L3.5 6M6 8.5L8.5 6M2 10.5H10',
] as const

/** The three digits: the tempo, the take's time while recording, OFF when offline. */
export function displayDigits(st: MirrorState, mirror: MirrorUi | null, take: TakeUi | null): { text: string; dot: boolean; bpm: boolean } {
  if (mirror?.offline != null && st.playing === null) return { text: 'OFF', dot: false, bpm: false }
  if (take?.state.kind === 'recording') {
    const s = Math.min(take.state.seconds, 599)
    return { text: `${Math.trunc(s / 60)}${String(s % 60).padStart(2, '0')}`, dot: true, bpm: false }
  }
  if (st.bpm === null) return { text: '---', dot: false, bpm: false }
  return { text: String(Math.min(999, Math.round(st.bpm))).padStart(3, ' '), dot: false, bpm: true }
}

/** The plate's orange line: REC, offline, or the project. */
export function plateStatus(st: MirrorState, mirror: MirrorUi | null, take: TakeUi | null): string {
  if (take?.state.kind === 'recording') return MirrorText.takeBadge(take.state.seconds)
  if (take?.state.kind === 'armed') return WebText.TAKE_ARMED
  if (mirror?.offline != null && st.playing === null) return `${MirrorText.OFFLINE} · ${mirror.offline}`
  return st.activeProject !== null ? MirrorText.project(st.activeProject) : MirrorText.TITLE
}

/**
 * A control's readout as the three digits show it ([dot]: the point lit after
 * that digit, or null): a number right-aligned, its decimals as far as they fit
 * ("62%" → " 62", "0.02 s" → "0.02", "+1.5" → " 1.5", "-12" → "-12"), an
 * interval by its denominator ("1/16" → " 16", "1/8T" → " 8T"), else its
 * first three letters or digits ("ONESHOT" → "ONE"); "---" for none.
 */
export function readoutDigits(readout: string): { text: string; dot: number | null } {
  const r = readout.trim().toUpperCase()
  const num = /^([+-]?)(\d+)(?:\.(\d+))?(?:%|\s*[A-Z]+)?$/.exec(r)
  if (num !== null) {
    const sign = num[1] === '-' ? '-' : ''
    const whole = sign + num[2]!.replace(/^0+(?=\d)/, '')
    if (whole.length >= 3) return { text: whole.slice(-3), dot: null }
    const shown = (whole + (num[3] ?? '')).slice(0, 3)
    const pad = 3 - shown.length
    // The point after the whole part, where the digits have one (after the first two only).
    const at = shown.length > whole.length ? pad + whole.length - 1 : -1
    return { text: shown.padStart(3, ' '), dot: at >= 0 && at < 2 ? at : null }
  }
  const frac = /^1\/(\d+[A-Z]?)$/.exec(r)
  if (frac !== null) return { text: frac[1]!.slice(-3).padStart(3, ' '), dot: null }
  const word = r.replace(/[^A-Z0-9-]/g, '')
  return { text: word === '' ? '---' : word.slice(0, 3).padEnd(3, ' '), dot: null }
}

/** EDIT's pages as the digits spell them (PadEditPages' EDIT_PAGES order). */
const EDIT_WORDS = ['SND', 'TRM', 'ENV', 'MID', 'MUT'] as const

/** The word the digits show as page [page] opens ([fx]: the effect on, for FX); null for none (MAIN). */
export function pageWord(page: DevicePage, fx: FxType, editPage: number): string | null {
  switch (page) {
    case 'SOUND':
      return 'SND'
    case 'EDIT':
      return EDIT_WORDS[editPage] ?? 'EDT'
    case 'TEMPO':
      return 'TMP'
    case 'TIMING':
      return 'TIM'
    case 'FX':
      return MirrorText.fxCode(fx)
    case 'OUTPUT':
      return 'OUT'
    case 'SIDECHAIN':
      return 'SCH'
    default:
      return null
  }
}

/** The EDIT page's word on the digits, [i] in EDIT_PAGES. */
export function editWord(i: number): string {
  return EDIT_WORDS[i] ?? 'EDT'
}

export interface DeviceViewProps {
  st: MirrorState
  mirror: MirrorUi | null
  keys: KeysShown
  /**
   * The pads (or KEYS' keys), each in its place ([padPlace]): Live's own (MirrorScreen's Pad
   * and KeyCap), so they play, EDIT, ERASE, STEP, ARP and SAMPLE as the grid's do.
   */
  pads: ComponentChildren
  now: number
  group: number
  /** TAKE, for the display (null: no TAKE). */
  take: TakeUi | null
  still: boolean
  /** Opens the shortcut guide searched for [query]. */
  onGuide?: ((query: string) => void) | undefined
  /** The open panel (SAMPLE, STEP, SCENE), over the device's top as Android's unrolls from the display. */
  panel?: ComponentChildren
}

/** Where pad [offset] sits on the drawn EP-133: its whole well, the cap drawn inside it (kept the same across renders, so a pad renders only when it changes). */
export function padPlace(offset: number): CSSProperties {
  if (padPlaces.length === 0) ROWS.forEach((offsets, r) => offsets.forEach((o, c) => (padPlaces[o] = at(COLS[c]!, ROW_Y[r]!, 130, 128))))
  return padPlaces[offset]!
}

const padPlaces: CSSProperties[] = []

const at = (x: number, y: number, w?: number, h?: number): CSSProperties => ({
  left: `${x}px`,
  top: `${y}px`,
  ...(w !== undefined ? { width: `${w}px` } : {}),
  ...(h !== undefined ? { height: `${h}px` } : {}),
})

/** The near-black well a key sits in. */
const well = (x: number, y: number, w: number, h: number): JSX.Element => <i key={`w${x}:${y}`} class="ep-a ep-well" style={at(x, y, w, h)} aria-hidden="true" />

export function DeviceView(props: DeviceViewProps): JSX.Element {
  const { st, mirror, keys, now, group, take } = props
  const box = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.4)
  const [card, setCard] = useState<{ key: CardKey; x: number; y: number; above: number } | null>(null)

  // Fits the drawing into the space Live has.
  useLayoutEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const fit = (): void => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) setScale(Math.min(w / DEVICE_W, h / DEVICE_H))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const offline = mirror?.offline != null && st.playing === null
  const digits = displayDigits(st, mirror, take)
  const glows = [0, 1, 2, 3].map((g) => groupGlow(st.pads, g, now))

  // The key layer: the device's combos on the drawn keys, its page shown on the display and the plate.
  const dk = useDeviceKeys()
  const layer = dk?.layer ?? null
  const ks = layer?.state.value ?? null
  const page: DevicePage = ks?.page ?? 'MAIN'
  const lit = (k: DeviceKey): boolean => ks !== null && keyLit(ks, k)
  const shiftLit = layer !== null && layer.shiftHeld()
  // − and +: what they step now (their names), and where they can.
  const steps = layer?.route() ?? null
  // The computer's Shift held is SHIFT, while the device shows.
  useEffect(() => {
    if (layer === null || typeof window === 'undefined') return
    const key = (on: boolean) => (e: KeyboardEvent): void => {
      if (e.key === 'Shift') layer.setShiftKey(on)
    }
    const down = key(true)
    const up = key(false)
    const off = (): void => layer.setShiftKey(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', off)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', off)
      off()
    }
  }, [layer])

  // PATTERN: RECORD and PLAY are the pattern's, the display's ● and ▶ light with it and the plate counts it.
  const transport = useContext(TransportContext)
  // TEMPO's click: the display's metronome lights with it.
  const tempo = useContext(TempoContext)
  // MAIN's project (its switching lights the key).
  const fn = useContext(FunctionKeysContext)
  const sample = useSample()
  const scene = useScene()
  const numbers = scene !== null && worthSaying(scene.ui) ? scene.ui.groups : null
  const pat = transport?.ui ?? null
  const patLight = pat !== null ? recordLight(pat) : null
  const recLight: 'live' | 'armed' | null =
    patLight ?? (take?.state.kind === 'recording' ? 'live' : take?.state.kind === 'armed' ? 'armed' : null)
  const patternOn = pat !== null && patternRuns(pat)
  // The knobs and the fader: what each turns now, and the one turned last, shown on the plate for a moment.
  const turning = useMemo(() => signal<DeviceControl | null>(null), [])
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (turnTimer.current !== null) clearTimeout(turnTimer.current)
    },
    [],
  )
  const turned = (which: DeviceControl): void => {
    // A knob turned with KEYS or TEMPO held spends them (no tap, no sheet as they let go).
    if (which === 'x' || which === 'y') layer?.turned()
    turning.value = which
    if (turnTimer.current !== null) clearTimeout(turnTimer.current)
    turnTimer.current = setTimeout(() => {
      turnTimer.current = null
      turning.value = null
    }, TURN_SHOWN_MS)
  }
  const openCard = (key: CardKey, el: HTMLElement): void => {
    const b = box.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (!b) return
    setCard(card?.key === key ? null : { key, x: r.left - b.left, y: r.bottom - b.top + 8, above: r.top - b.top - 8 })
  }
  const fine = (): boolean => layer?.shiftHeld() === true

  // An LED centred on (x, y).
  const led = (x: number, y: number, extra?: HTMLAttributes<HTMLSpanElement>): JSX.Element => (
    <span class="ep-a ep-led" style={at(x - 10, y - 10)} aria-hidden="true" {...extra} />
  )
  // A printed word, its middle on y: from x, or centred on it.
  const label = (x: number, y: number, text: ComponentChildren, centre = false): JSX.Element => (
    <span class="ep-a ep-lbl" style={{ ...at(x, y), transform: `translate(${centre ? '-50%' : '0'}, -50%)` }} aria-hidden="true">
      {text}
    </span>
  )
  // A drawn key on the layer (inert without one).
  const splitKey = (k: DeviceKey, d: DrawnKey, name: string, on: boolean, extra: { held?: boolean; coach?: CoachId; coachLabel?: string } = {}): JSX.Element => (
    <LayerKey layer={layer} k={k} name={name} lit={on} held={extra.held ?? false} coach={extra.coach} coachLabel={extra.coachLabel} place={d.place} hint={WebText.DEVICE_KEY_HINTS[k] ?? ''}>
      <span class={`ep-h ${d.topCls}`}>{d.top}</span>
      <span class={`ep-h ${d.bottomCls}`}>{d.bottom}</span>
    </LayerKey>
  )
  const slim = (k: DeviceKey, y: number, name: string, on: boolean, cls: string, extra: { coach?: CoachId; sel?: boolean } = {}): JSX.Element => (
    <LayerKey layer={layer} k={k} name={name} lit={on} held={lit(k)} coach={extra.coach} place={at(68, y, 130, 64)} hint={WebText.DEVICE_KEY_HINTS[k] ?? ''} cls={`ep-key--slim ${cls}${extra.sel ? ' is-sel' : ''}`}>
      {k}
    </LayerKey>
  )

  // The group LEDs: a group the FX bus silences dark, a soloed one lit, else the group shown lit and the sounding ones breathing.
  const groupLed = (g: number): string =>
    dk?.silenced.has(g) === true
      ? ' is-silenced'
      : dk?.soloed.has(g) === true || (!offline && g === group)
        ? ' is-on'
        : glows[g]! > 0
          ? ' is-sounding'
          : ''
  // FADER held: the LED over each pad's parameter, the shown group's assigned one bright, the others arc has dim.
  const faderHeld = lit('FADER')
  const faderLed = (p: FaderParam): string =>
    !faderHeld ? '' : (dk?.faderAssign[group] ?? 'LEVEL') === p ? ' is-on' : faderParamSupported(p) ? ' is-avail' : ''
  const fxType = dk?.fxType ?? 'NONE'
  const fxPage = page === 'FX' || page === 'OUTPUT' || page === 'SIDECHAIN'
  const plateHit = keys.on ? (keys.pad !== null ? MirrorText.keysSound(keys.pad, keys.padName) : MirrorText.NO_SOUND) : displayLine(st, mirror)
  const said = layer?.said.value ?? null
  // What a key just did is newer than a knob's value: it takes the line.
  useEffect(() => {
    if (said === null) return
    if (turnTimer.current !== null) clearTimeout(turnTimer.current)
    turnTimer.current = null
    turning.value = null
  }, [said?.n])
  const minusName = steps !== null ? (WebText.DEVICE_MINUS_PLUS[steps.route]?.[0] ?? WebText.PREV_GROUP) : WebText.PREV_GROUP
  const plusName = steps !== null ? (WebText.DEVICE_MINUS_PLUS[steps.route]?.[1] ?? WebText.NEXT_GROUP) : WebText.NEXT_GROUP
  return (
    <div class="ko-device" ref={box}>
      <div class="ko-device__box" style={{ width: `${DEVICE_W * scale}px`, height: `${DEVICE_H * scale}px` }}>
        <div class="ep" role="group" aria-label={WebText.DEVICE_VIEW} style={{ transform: `scale(${scale})` }}>
          {/* The top: jacks, the plate and the speaker. */}
          <span class="ep-a ep-jack ep-jack--out" aria-hidden="true">OUTPUT</span>
          <span class="ep-a ep-jack ep-jack--in" aria-hidden="true">INPUT</span>
          <span class="ep-a ep-jack ep-jack--sync" aria-hidden="true">
            <span><i style={{ left: '-6px' }}>I</i><i style={{ right: '-8px' }}>O</i>SYNC</span>
            <span><i style={{ left: '-4px' }}>I</i><i style={{ right: '-10px' }}>O</i>MIDI</span>
          </span>
          <span class="ep-a ep-jack ep-jack--usb" aria-hidden="true">USB</span>
          <span class="ep-a ep-jack ep-jack--pow" aria-hidden="true">POWER</span>
          <span class="ep-a ep-pow" aria-hidden="true" />
          <div class="ep-a ep-plate" aria-hidden="true" />
          {[[14, 80], [928, 80], [14, 406], [928, 406]].map(([x, y]) => <span key={`${x}:${y}`} class="ep-a ep-screw" style={at(x!, y!)} aria-hidden="true" />)}
          <span class="ep-a ep-plate__title" aria-hidden="true">
            K.O.
            {/* The Roman two, drawn: two stems between a top and a bottom bar. */}
            <svg viewBox="0 0 50 58">
              <path d="M2 1.8H48M2 56.2H48M15 1.8V56.2M35 1.8V56.2" />
            </svg>
          </span>
          {/* A page's line (a key to arc's own sheet for it), else the pattern's words, else the status. */}
          {dk !== null && page !== 'MAIN' ? (
            <PageLine dk={dk} page={page} group={group} />
          ) : transport !== null && hasWords(transport.ui) ? (
            <PlateWords t={transport} still={props.still} />
          ) : (
            <span class="ep-a ep-plate__status" aria-live="polite">{plateStatus(st, mirror, take)}</span>
          )}
          {/* The hit, said at most once a second (Kotlin's spoken()): a run of hits is read where it ends.
              While a knob or the fader turns it shows its value instead (the slider says it itself); what a
              key just did shows a moment ("LENGTH · 4 BARS"), and is said. */}
          <PlateHit hit={said?.text ?? plateHit} turning={turning} group={group} />
          <Spoken text={said?.text ?? plateHit} />
          <div class="ep-a ep-grille" aria-hidden="true"><Grille /></div>

          {/* The display: the glass, its reflection, the icons and two pins. */}
          <div class="ep-a ep-disp" aria-hidden="true" />
          <div class="ep-a ep-disp__gloss" aria-hidden="true" />
          <svg class="ep-a ep-lcd" viewBox="0 0 1444 396" aria-hidden="true">
            <LcdPrint />
            <LcdLit
              fx={fxPage}
              swing={page === 'TIMING'}
              free={dk !== null && !dk.quantize}
              main={page === 'MAIN' && !offline}
              tempo={page === 'TEMPO'}
              erase={pat?.erase === true}
              mute={dk?.muted === true}
              clip={layer?.lcd.value ?? null}
            />
            {/* The piano and KEYS in KEYS (SOUND printed in its box otherwise, lit on SOUND and EDIT). */}
            {ic(98, R[2], C.white, PIANO, keys.on)}
            {wordBox(273, 384, C.white, keys.on ? MirrorText.MODE_KEYS.toUpperCase() : 'SOUND', keys.on || page === 'SOUND' || page === 'EDIT')}
            {/* The group cards: the group shown lit, a sounding group's offset lit. */}
            {[0, 1, 2, 3].map((g) => {
              const on = !offline && g === group
              const ghost = 'var(--lcd-ghost)'
              return (
                <g key={g} class="ic on ep-dgrp" style={{ '--c': GROUP_COLOURS[g] }} transform={`translate(222 ${R[g]})`}>
                  <path d="M15 -16H21V22H-14V16H15Z" style={{ opacity: on || glows[g]! > 0 ? 1 : ghost }} />
                  <g style={{ opacity: on ? 1 : 'var(--lcd-ghost-w)' }}>
                    <rect x="-20" y="-22" width="35" height="38" style={{ fill: C.white }} />
                    {t(-3, -3, MirrorText.groupKey(g), 24, 'k', 500)}
                  </g>
                </g>
              )
            })}
            <LcdDigits base={digits} turning={turning} group={group} dk={dk} />
            {ic(820, R[1] + 2, C.white, METRONOME, st.playing === true || tempo?.clickOn === true, 'ep-metro')}
            {ic(557, R[2], C.red, <circle r="21" />, recLight !== null, `ep-rec${recLight === 'armed' && !props.still ? ' is-armed' : ''}`)}
            {ic(624, R[2], C.white, <path d="M-15 -21L21 0L-15 21z" />, st.playing === true || patternOn, `ep-play${st.playing === true || patternOn ? ' is-on' : ''}`)}
            {/* The X ring: a quarter a group (A bottom left, B top left, C top right, D bottom right), the group shown and the sounding ones lit. */}
            <g class="ic on ep-ring">
              {QUARTER_GROUP.map((g, k) => quarter(1113, RING_Y, k, GROUP_COLOURS[g]!, (!offline && g === group) || glows[g]! > 0 ? 1 : 'var(--lcd-ghost)'))}
            </g>
            <Meter level={Math.max(...glows)} />
          </svg>
          <span class="ep-a ep-disp__pin" style={at(715, 466)} aria-hidden="true" />
          <span class="ep-a ep-disp__pin" style={at(715, 818)} aria-hidden="true" />

          {/* The controls' printing. */}
          {label(133, 886, 'VOLUME', true)}
          <span class="ep-a ep-line" style={at(721, 885, 2, 34)} aria-hidden="true" />
          <span class="ep-a ep-line" style={at(721, 885, 336, 2)} aria-hidden="true" />
          {label(1114, 886, 'BPM', true)}
          <span class="ep-a ep-line" style={at(1160, 885, 68, 2)} aria-hidden="true" />
          {label(1310, 886, 'METRONOME', true)}
          <Knob kind="vol" which="volume" label="Volume" card="VOLUME" place={at(68, KROW)} group={group} onCard={openCard} onTurned={turned} fine={fine} />
          {[265, 461, 657].map((x) => well(x, KROW, 130, 130))}
          {splitKey('SOUND', DRAWN.SOUND, MirrorText.FN_SOUND, page === 'SOUND' || page === 'EDIT' || lit('SOUND'), { coach: 'live.sound' })}
          {/* MAIN: the MAIN page; held, a pad 1 to 9 picks a project (as the EP-133 loads one), − / + the scene. */}
          {splitKey('MAIN', DRAWN.MAIN, WebText.DEVICE_MAIN_KEY, lit('MAIN') || fn?.project?.switching === true, { coach: 'live.project', coachLabel: WebText.COACH_DEVICE_MAIN })}
          {splitKey('TEMPO', DRAWN.TEMPO, MirrorText.FN_TEMPO, page === 'TEMPO' || lit('TEMPO'), { coach: 'live.tempo', coachLabel: WebText.COACH_DEVICE_TEMPO })}
          <Knob kind="x" which="x" label="Knob X" card="KNOBX" place={at(1049, KROW)} group={group} onCard={openCard} onTurned={turned} fine={fine} />
          <Knob kind="y" which="y" label="Knob Y" card="KNOBY" place={at(1245, KROW)} group={group} onCard={openCard} onTurned={turned} fine={fine} />
          <span class="ep-a ep-badge ep-badge--x" style={at(1098, 1067)} aria-hidden="true">X</span>
          <span class="ep-a ep-badge ep-badge--y" style={at(1294, 1067)} aria-hidden="true">Y</span>
          {/* GAIN (orange) and SWING (black) brackets, the line broken round the word. */}
          <span class="ep-a ep-line ep-line--red" style={at(1016, 984, 2, 50)} aria-hidden="true" />
          <span class="ep-a ep-line ep-line--red" style={at(1016, 1098, 2, 48)} aria-hidden="true" />
          <span class="ep-a ep-line ep-line--red" style={at(1016, 984, 24, 2)} aria-hidden="true" />
          <span class="ep-a ep-line ep-line--red" style={at(1016, 1144, 24, 2)} aria-hidden="true" />
          <span class="ep-a ep-lbl ep-lbl--red ep-lbl--up" style={at(1017, 1066)} aria-hidden="true">GAIN</span>
          <span class="ep-a ep-line" style={at(1408, 984, 2, 40)} aria-hidden="true" />
          <span class="ep-a ep-line" style={at(1408, 1108, 2, 38)} aria-hidden="true" />
          <span class="ep-a ep-line" style={at(1388, 984, 22, 2)} aria-hidden="true" />
          <span class="ep-a ep-line" style={at(1388, 1144, 22, 2)} aria-hidden="true" />
          <span class="ep-a ep-lbl ep-lbl--up" style={at(1409, 1066)} aria-hidden="true">SWING</span>

          {/* The LEDs over the pads and their labels; the LED above each group key is its group's. */}
          {LED_Y.map((y, r) => (
            <span key={y}>
              {led(297, y, {
                class: `ep-a ep-led ep-led--group${groupLed(r)}`,
                'data-group': String(r),
                style: { ...at(287, y - 10), '--glow': glowCss(r === group ? glows[r]! : glows[r]! * 0.5) },
              } as HTMLAttributes<HTMLSpanElement>)}
              {COLS.map((x, i) => (
                <span key={x}>
                  {led(x + 32, y, { class: `ep-a ep-led ep-led--pad${faderLed(FADER_PARAMS[r * 3 + i]!)}` })}
                  {label(x + 62, y, LED_LABELS[r]![i] === '→ FX' ? <><span class="ep-arr">→</span> FX</> : LED_LABELS[r]![i])}
                </span>
              ))}
            </span>
          ))}
          {led(1082, 1669, { class: `ep-a ep-led${steps?.minus === true ? ' is-on' : ''}` })}
          {led(1147, 1669, { class: `ep-a ep-led${steps?.plus === true ? ' is-on' : ''}` })}

          {well(68, ROW_Y[0]!, 130, 64)}
          {slim('KEYS', ROW_Y[0]!, MirrorText.MODE_KEYS, keys.on || lit('KEYS'), 'ep-key--black', { coach: 'live.mode', sel: keys.on })}
          {well(68, 1246, 130, 64)}
          {slim('FADER', 1246, WebText.DEVICE_FADER_KEY, lit('FADER'), 'ep-key--black')}
          <Fader group={group} onCard={openCard} onTurned={turned} fine={fine} layer={layer} />
          {well(68, 1769, 130, 64)}
          {slim('SHIFT', 1769, WebText.DEVICE_SHIFT_KEY, shiftLit, 'ep-key--shift')}

          {/* The guide's tags on the group keys and the pads: boxes over them (their keys are placed one by one). */}
          <span class="ep-a ep-area" style={at(265, ROW_Y[0]!, 130, 716)} data-coach="live.groups" aria-hidden="true" />
          <span class="ep-a ep-area" style={at(461, ROW_Y[0]!, 522, 716)} data-coach={keys.on ? 'live.keys' : 'live.pads'} aria-hidden="true" />
          {ROW_Y.map((y) => well(265, y, 130, 128))}
          <div role="tablist" aria-label={MirrorText.GROUP}>
            {[0, 1, 2, 3].map((g) => (
              <GroupKey key={g} layer={layer} g={g} selected={g === group} held={lit(groupKey(g))} col={numbers?.[g] ?? null} />
            ))}
          </div>

          {ROW_Y.map((y) => COLS.map((x) => well(x, y, 130, 128)))}
          <div role="group" aria-label={keys.on ? MirrorText.MODE_KEYS : `${MirrorText.GROUP} ${MirrorText.groupKey(group)}`}>
            {props.pads}
          </div>

          {[ROW_Y[0]!, ROW_Y[1]!].map((y) => [1050, 1246].map((x) => well(x, y, 130, 130)))}
          {splitKey('SAMPLE', DRAWN.SAMPLE, 'SAMPLE / CHOP', sample?.ui.on === true || lit('SAMPLE'))}
          {splitKey('TIMING', DRAWN.TIMING, WebText.DEVICE_TIMING_KEY, page === 'TIMING' || lit('TIMING'))}
          {splitKey('FX', DRAWN.FX, MirrorText.FX_EFFECTS, fxType !== 'NONE' || fxPage || lit('FX'), { held: ks?.punch === true })}
          {splitKey('ERASE', DRAWN.ERASE, MirrorText.ERASE, pat?.erase === true || lit('ERASE'), { coach: 'live.erase' })}
          {[ROW_Y[2]!, ROW_Y[3]!].map((y) => [1050, 1246].map((x) => well(x, y, 130, 128)))}
          <button
            type="button"
            class="ep-a ep-key ep-key--light ep-key--sign"
            style={at(1050, ROW_Y[2]!, 130, 128)}
            aria-label={minusName}
            disabled={steps?.minus !== true}
            onClick={(e) => layer?.minusPlus(-1, e.shiftKey)}
          >
            <svg viewBox="0 0 44 44" aria-hidden="true"><path d="M4 22H40" /></svg>
          </button>
          <button
            type="button"
            class="ep-a ep-key ep-key--light ep-key--sign"
            style={at(1246, ROW_Y[2]!, 130, 128)}
            aria-label={plusName}
            disabled={steps?.plus !== true}
            onClick={(e) => layer?.minusPlus(1, e.shiftKey)}
          >
            <svg viewBox="0 0 44 44" aria-hidden="true"><path d="M4 22H40M22 4V40" /></svg>
          </button>
          {transport !== null ? (
            <DeviceTransport t={transport} still={props.still} layer={layer} />
          ) : (
            <>
              <button
                type="button"
                class="ep-a ep-key ep-key--orange ep-key--word"
                style={at(1050, ROW_Y[3]!, 130, 128)}
                aria-haspopup="dialog"
                onClick={(e) => openCard('RECORD', e.currentTarget)}
              >
                RECORD
              </button>
              <button
                type="button"
                class={`ep-a ep-key ep-key--grey ep-key--word${st.playing === true ? ' is-lit' : ''}`}
                style={at(1246, ROW_Y[3]!, 130, 128)}
                aria-label={`PLAY, ${st.playing === true ? MirrorText.PLAYING : st.playing === false ? MirrorText.STOPPED : MirrorText.OFFLINE}`}
                aria-haspopup="dialog"
                onClick={(e) => openCard('PLAY', e.currentTarget)}
              >
                PLAY
              </button>
            </>
          )}
        </div>
        {props.panel && <div class="ko-device__panel">{props.panel}</div>}
        {/* The 1–99 grid over the controls and the pads (Kotlin's gridOver), as wide as the device. */}
        <PatternGridOver style={{ top: `${CONTROLS_Y * scale}px` }} />
        {card && <ShortcutCard card={card} boxWidth={DEVICE_W * scale} boxHeight={DEVICE_H * scale} onClose={() => setCard(null)} onGuide={props.onGuide} />}
      </div>
    </div>
  )
}

/**
 * A drawn key on the key layer ([k], named [name] for screen readers, its
 * combos its description): lit (a ring in its cap, aria-pressed) while [lit],
 * its cap orange while [held] (FX's punch-ins). Without a layer it rests.
 */
function LayerKey(props: {
  layer: DeviceKeys | null
  k: DeviceKey
  name: string
  lit: boolean
  held: boolean
  place: CSSProperties
  hint: string
  coach?: CoachId | undefined
  /** The guide overlay's tag where the row's key says otherwise (MAIN, TEMPO). */
  coachLabel?: string | undefined
  cls?: string
  children: ComponentChildren
}): JSX.Element {
  const press = useLayerPress(props.layer, props.k)
  const cls = props.cls ?? 'ep-key--split'
  return (
    <button
      type="button"
      class={`ep-a ep-key ${cls}${props.lit ? ' is-lit' : ''}${props.held ? ' is-held' : ''}`}
      style={props.place}
      aria-label={props.name}
      aria-pressed={props.lit}
      aria-description={props.hint !== '' ? `${props.hint}. ${WebText.DEVICE_KEY_HINTS.RIGHT_CLICK}` : undefined}
      aria-disabled={props.layer === null ? true : undefined}
      data-coach={props.coach}
      data-coach-label={props.coachLabel}
      {...press}
    >
      {props.children}
    </button>
  )
}

/** Group [g]'s key: a tab, its group's pattern in the glyph's place where the scene is worth saying (as Live's group keys); on the layer, held as the device's. */
function GroupKey(props: { layer: DeviceKeys | null; g: number; selected: boolean; held: boolean; col: { readonly number: number; readonly queued: number | null } | null }): JSX.Element {
  const { g, col } = props
  const press = useLayerPress(props.layer, groupKey(g))
  const queued = col?.queued ?? null
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.selected}
      aria-label={`${MirrorText.GROUP} ${MirrorText.groupKey(g)}` + (col !== null ? MirrorText.groupKeyPattern(col.number, queued) : '')}
      aria-description={`${WebText.DEVICE_KEY_HINTS.GROUP}. ${WebText.DEVICE_KEY_HINTS.RIGHT_CLICK}`}
      class={`ep-a ep-key ep-key--group${queued !== null ? ' is-queued' : ''}${props.held ? ' is-held' : ''}`}
      style={at(265, ROW_Y[g]!, 130, 128)}
      {...press}
    >
      <span class="ep-key__letter" aria-hidden="true">{MirrorText.groupKey(g)}</span>
      {col !== null ? (
        <span class={`ep-key__num${queued !== null ? ' is-queued' : ''}`} aria-hidden="true">
          {queued === null ? MirrorText.patternNumber(col.number) : MirrorText.numberMove(col.number, queued)}
        </span>
      ) : (
        <svg class="ep-key__icon" viewBox="0 0 12 12" aria-hidden="true">
          <path d={GROUP_GLYPHS[g]} />
        </svg>
      )}
    </button>
  )
}

/**
 * The plate's orange line on a page: its name and what it shows, then what
 * X, Y and − / + do there ("EDIT · TRIM — X START · Y LENGTH · −/+ PAGE"),
 * a key that opens arc's own sheet for the page; said as it changes.
 */
function PageLine(props: { dk: DeviceKeysUi; page: DevicePage; group: number }): JSX.Element {
  const { dk, page } = props
  const x = useTurnable('x', props.group)
  const y = useTurnable('y', props.group)
  const tempo = useContext(TempoContext)
  const word = WebText.DEVICE_PAGES[page] ?? page
  const sel = dk.selected
  const detail =
    page === 'SOUND'
      ? sel !== null
        ? `${sel.pad.groupLetter} ${sel.pad.label}`
        : null
      : page === 'EDIT'
        ? MirrorText.pageName(Math.max(0, EDIT_PAGES.indexOf(padPage.value))).toUpperCase()
        : page === 'TEMPO'
          ? tempo !== null
            ? String(tempo.deviceBpm !== null ? Math.round(tempo.deviceBpm) : tempo.bpm)
            : null
          : page === 'TIMING'
            ? (dk.quantize ? MirrorText.QUANTIZE : MirrorText.FREE_TIME).toUpperCase()
            : page === 'FX'
              ? MirrorText.fxName(dk.fxType).toUpperCase()
              : null
  const head = detail !== null ? `${word} · ${detail}` : word
  const parts = [x !== null ? `X ${x.name}` : null, y !== null ? `Y ${y.name}` : null, WebText.DEVICE_PAGE_STEPS[page] ?? null].filter((p): p is string => p !== null)
  const text = WebText.devicePageLine(head, parts)
  return (
    <>
      <button type="button" class="ep-a ep-plate__status ep-plate__page" aria-label={`${text}. ${WebText.DEVICE_PAGE_SHEET}`} onClick={() => dk.openSheet(page)}>
        {text}
      </button>
      <Spoken text={text} />
    </>
  )
}

/**
 * The three digits: [base] (the tempo, a take's time, OFF), or, first that
 * applies, a number typed while SOUND, TEMPO or a group is held, the value
 * of the control turning, a page's word or a value just set ([DeviceKeys.flash]),
 * SOUND's slot on its page, TEMPO's tempo on its. Read here alone, so a turn re-renders the digits only.
 */
function LcdDigits(props: { base: { text: string; dot: boolean; bpm: boolean }; turning: ReadonlySignal<DeviceControl | null>; group: number; dk: DeviceKeysUi | null }): JSX.Element {
  const { base, dk } = props
  const turn = useTurnable(props.turning.value, props.group)
  const s = dk?.layer.state.value ?? null
  const flash = dk?.layer.flash.value ?? null
  const tempo = useContext(TempoContext)
  const fixed = base.text === 'OFF' || base.dot
  const slot = s?.page === 'SOUND' ? (dk?.selected?.slot ?? null) : null
  // TEMPO's page: arc's tempo (the device's while it sends its clock).
  const bpmNow = s?.page === 'TEMPO' && tempo !== null ? String(Math.min(999, Math.round(tempo.deviceBpm ?? tempo.bpm))).padStart(3, ' ') : null
  const turned = !fixed && !(s !== null && s.dialKey !== null && s.dial !== '') && turn !== null ? readoutDigits(turn.readout) : null
  const text = fixed
    ? base.text
    : s !== null && s.dialKey !== null && s.dial !== ''
      ? s.dial.padStart(3, ' ')
      : turned !== null
        ? turned.text
        : flash !== null
          ? flash
          : slot !== null
            ? String(slot).padStart(3, '0').slice(-3)
            : (bpmNow ?? base.text)
  const bpm = (text === base.text && base.bpm) || (bpmNow !== null && text === bpmNow)
  return (
    <>
      {ic(815, R[0], C.blue, <>{t(-2, -1, 'BPM', 21, 'w', 700)}<path d="M24 -20v34l-6 6h-40" class="s" stroke-width="3" /></>, bpm)}
      {[...text.padEnd(3, ' ').slice(0, 3)].map((ch, i) => <Digit key={i} ch={ch} i={i} dot={fixed ? base.dot && i === 0 : turned?.dot === i} />)}
    </>
  )
}

/** [render] as a component drawn once: it takes no props, so it never renders again. */
function once(render: () => JSX.Element): FunctionComponent {
  return function Once(this: Component): JSX.Element {
    this.shouldComponentUpdate = () => false
    return render()
  }
}

// ---------- the display ----------

/** The display's inks. */
const C = { red: '#E52817', orange: '#F05424', blue: '#5394B5', pink: '#BC487D', tan: '#DDA574', white: '#F1F2F2' } as const
/** The groups' colours on the display: A orange, B red, C pink, D blue. */
const GROUP_COLOURS = [C.orange, C.red, C.pink, C.blue] as const
/** The four rows' middles inside the glass. */
const R = [98, 165, 231, 297] as const
const RING_Y = (R[0] + R[1]) / 2
/** The X ring's quarters (top left, top right, bottom right, bottom left) and the group each shows. */
const QUARTER_GROUP = [1, 2, 3, 0] as const

/** An icon at (x, y) in ink [c]: faint while off, bright when [on] (the white ones fainter still while off). */
function ic(x: number, y: number, c: string, body: ComponentChildren, on = false, cls = ''): JSX.Element {
  return (
    <g class={`ic${on ? ' on' : ''}${c === C.white ? ' w' : ''}${cls ? ` ${cls}` : ''}`} style={{ '--c': c }} transform={`translate(${x} ${y})`}>
      {body}
    </g>
  )
}

/** A word on the display, centred on (x, y): in the icon's ink, or 'k' cut out of it, or 'w' white. */
function t(x: number, y: number, s: string, size: number, cls = '', w = 500, anchor = 'middle', ls = '.02em'): JSX.Element {
  return (
    <text class={cls} x={x} y={y} font-size={size} font-weight={w} text-anchor={anchor} letter-spacing={ls} dominant-baseline="central">
      {s}
    </text>
  )
}

/** A printed word in a box on the bottom row (x0 to x1), [hatch]ed at its end. */
function wordBox(x0: number, x1: number, col: string, word: string, on = false, hatch = false): JSX.Element {
  const w = x1 - x0
  const cx = (x0 + x1) / 2
  return (
    <g class={`ic${on ? ' on' : ''}${col === C.white ? ' w' : ''}`} style={{ '--c': col }}>
      <rect x={x0} y={R[3] - 18} width={hatch ? w - 30 : w} height="36" />
      {hatch && [0, 1, 2, 3].map((k) => <path key={k} d={`M${x1 - 26 + k * 8} ${R[3] - 18}h5l-12 36h-5z`} />)}
      <text class="k" x={hatch ? cx - 15 : cx} y={R[3] + 1} font-size="22" font-weight="400" text-anchor="middle" dominant-baseline="central" letter-spacing=".04em">
        {word}
      </text>
    </g>
  )
}

/** A quarter of a ring round (cx, cy), squared off at the gaps. */
function quarter(cx: number, cy: number, k: number, col: string, opacity: number | string): JSX.Element {
  const ro = 54
  const ri = 26
  const a0 = Math.asin(4 / ro)
  const b0 = Math.asin(4 / ri)
  const base = [Math.PI, 1.5 * Math.PI, 0, 0.5 * Math.PI][k]!
  const p = (r: number, a: number): string => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`
  const d = `M${p(ro, base + a0)}A${ro} ${ro} 0 0 1 ${p(ro, base + Math.PI / 2 - a0)}L${p(ri, base + Math.PI / 2 - b0)}A${ri} ${ri} 0 0 0 ${p(ri, base + b0)}Z`
  return <path key={k} d={d} style={{ fill: col, opacity }} />
}

const PIANO = (
  <>
    {[0, 1, 2, 3, 4, 5].map((k) => <rect key={k} x={-26 + k * 9} y="-22" width="7.5" height="44" />)}
    {[0, 1, 3, 4].map((k) => <rect key={`b${k}`} x={-20 + k * 9} y="-22" width="5" height="26" class="k" />)}
  </>
)

const METRONOME = (
  <>
    <path d="M-6 -22h12l12 42h-36z" class="s" stroke-width="3" />
    <path d="M0 12L14 -16" class="s" stroke-width="3" style={{ stroke: C.red }} />
    <circle cy="12" r="3.5" style={{ fill: C.red }} />
  </>
)

/** The level meter: four stacks of 2 × 4, filling from the bottom with the loudest group's glow. */
function Meter(props: { level: number }): JSX.Element {
  const lit = Math.round(props.level * 20)
  return (
    <>
      {[C.red, C.pink, C.blue, C.white].map((col, r) => (
        <g key={r} class="ic on" transform={`translate(1211 ${R[r]})`}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
            <rect
              key={k}
              x={-10 + (k % 2) * 12}
              y={-22 + (3 - Math.floor(k / 2)) * 12}
              width="9"
              height="9"
              style={{ fill: col, opacity: k < lit - 8 * (3 - r) ? 1 : 0.07 }}
            />
          ))}
        </g>
      ))}
    </>
  )
}

/** The fourteen segments of a digit (62 × 112); a 1 lights the right-hand pair, a full gap clear of the next digit. */
const SEGMENTS: Record<string, string> = {
  a: '6,0 56,0 50.5,7.5 11.5,7.5',
  d: '6,112 11.5,104.5 50.5,104.5 56,112',
  f: '0,5 7.5,11 7.5,50 3.75,53.5 0,50.5',
  b: '62,5 62,50.5 58.25,53.5 54.5,50 54.5,11',
  e: '0,61.5 3.75,58.5 7.5,62 7.5,101 0,107',
  c: '62,61.5 62,107 54.5,101 54.5,62 58.25,58.5',
  g1: '5,56 9,52.25 27,52.25 29,56 27,59.75 9,59.75',
  g2: '57,56 53,52.25 35,52.25 33,56 35,59.75 53,59.75',
  h: '27.25,12 34.75,12 34.75,48.5 31,52 27.25,48.5',
  l: '27.25,63.5 31,60 34.75,63.5 34.75,100 27.25,100',
  i: '10.5,11.5 14.5,11.5 25.5,40 25.5,49 21.5,49 10.5,19.5',
  j: '51.5,11.5 47.5,11.5 36.5,40 36.5,49 40.5,49 51.5,19.5',
  m: '10.5,100.5 14.5,100.5 25.5,72 25.5,63 21.5,63 10.5,92.5',
  n: '51.5,100.5 47.5,100.5 36.5,72 36.5,63 40.5,63 51.5,92.5',
}
const GLYPHS: Record<string, readonly string[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g1', 'g2', 'e', 'd'],
  '3': ['a', 'b', 'c', 'd', 'g1', 'g2'],
  '4': ['f', 'b', 'c', 'g1', 'g2'],
  '5': ['a', 'f', 'c', 'd', 'g1', 'g2'],
  '6': ['a', 'f', 'e', 'd', 'c', 'g1', 'g2'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g1', 'g2'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g1', 'g2'],
  '-': ['g1', 'g2'],
  // The letters, as fourteen segments draw them (h and l the middle's halves, i j m n the diagonals).
  A: ['a', 'b', 'c', 'e', 'f', 'g1', 'g2'],
  B: ['a', 'b', 'c', 'd', 'h', 'l', 'g2'],
  C: ['a', 'd', 'e', 'f'],
  D: ['a', 'b', 'c', 'd', 'h', 'l'],
  E: ['a', 'd', 'e', 'f', 'g1', 'g2'],
  F: ['a', 'e', 'f', 'g1', 'g2'],
  G: ['a', 'c', 'd', 'e', 'f', 'g2'],
  H: ['b', 'c', 'e', 'f', 'g1', 'g2'],
  I: ['a', 'd', 'h', 'l'],
  J: ['b', 'c', 'd', 'e'],
  K: ['e', 'f', 'g1', 'j', 'n'],
  L: ['d', 'e', 'f'],
  M: ['b', 'c', 'e', 'f', 'i', 'j'],
  N: ['b', 'c', 'e', 'f', 'i', 'n'],
  O: ['a', 'b', 'c', 'd', 'e', 'f'],
  P: ['a', 'b', 'e', 'f', 'g1', 'g2'],
  Q: ['a', 'b', 'c', 'd', 'e', 'f', 'n'],
  R: ['a', 'b', 'e', 'f', 'g1', 'g2', 'n'],
  S: ['a', 'c', 'd', 'f', 'g1', 'g2'],
  T: ['a', 'h', 'l'],
  U: ['b', 'c', 'd', 'e', 'f'],
  V: ['e', 'f', 'm', 'j'],
  W: ['b', 'c', 'e', 'f', 'm', 'n'],
  X: ['i', 'j', 'm', 'n'],
  Y: ['i', 'j', 'l'],
  Z: ['a', 'd', 'j', 'm'],
}

/** The characters the digits can draw. */
export const DIGIT_GLYPHS: ReadonlySet<string> = new Set([' ', ...Object.keys(GLYPHS)])

/** Digit [i] of three in fourteen segments, the unlit ones faintly visible; [dot]: the point after it. */
function Digit(props: { ch: string; i: number; dot: boolean }): JSX.Element {
  const on = GLYPHS[props.ch] ?? []
  const segs = Object.entries(SEGMENTS)
  return (
    <g class="seg" transform={`translate(${549 + props.i * 76} ${R[0] - 39}) skewX(-3)`}>
      {segs.filter(([k]) => !on.includes(k)).map(([k, pts]) => <polygon key={k} class="off" points={pts} />)}
      <g class="seg-lit">
        {segs.filter(([k]) => on.includes(k)).map(([k, pts]) => <polygon key={k} class="on" points={pts} />)}
      </g>
      {props.i < 2 && <rect class={`dot ${props.dot ? 'on' : 'off'}`} x="65" y="104" width="8" height="8" rx="1" />}
    </g>
  )
}

/** Everything the display prints that never lights here (the battery always does): drawn once. What the key layer lights is [LcdLit]. */
const LcdPrint = once(function LcdPrint(): JSX.Element {
  const grid = (k: number): JSX.Element => <path key={k} d={`M${-22 + k * 6} -22V22M-22 ${-22 + k * 11}H2`} class="s" stroke-width="1.3" style={{ stroke: C.tan }} />
  const slabs = ['M2 -22h20v44h-20z', 'M2 -22h20v44h-26z', 'M8 -22h14v44h-26z', 'M-2 -22h24v44h-26z']
  const lid = (stroke?: string): JSX.Element => <path d="M-22 -14v-8h44v8" class="s" stroke-width="3" style={stroke ? { stroke } : undefined} />
  const levels = [5, 10, 14, 9, 12, 7, 4]
  const yGrid: JSX.Element[] = []
  for (let k = 0; k <= 10; k++) yGrid.push(<path key={k} d={`M${1258 + k * 11.3} ${RING_Y - 56}V${RING_Y + 56}M1258 ${RING_Y - 56 + k * 11.2}H1371`} stroke={C.pink} stroke-width="1.4" />)
  return (
    <>
      {/* Column 1: the battery and the fader's page (MUTE is LcdLit's). */}
      {ic(98, R[0], C.red, <><rect x="-24" y="-10" width="42" height="20" /><rect x="18" y="-5" width="6" height="10" /></>, true)}
      {ic(98, R[3], C.white, <><path d="M-20 20L18 -18" class="s" stroke-width="3" /><circle cx="-2" cy="-4" r="7" style={{ fill: C.red }} /><path d="M8 -18h10v10M-20 10v10h10" class="s" stroke-width="2.6" style={{ stroke: C.blue }} /></>)}
      {/* Column 2: the fader's values, a grid and a slab. */}
      {[C.orange, C.red, C.pink, C.blue].map((col, r) => (
        <g key={r}>{ic(166, R[r]!, col, <>{[0, 1, 2, 3, 4].map(grid)}<path d={slabs[r]} /></>)}</g>
      ))}
      {/* Row 1. */}
      {ic(299, R[0], C.white, <>{t(0, -10, 'SYNC', 16, '', 700)}<path d="M-20 10h12M8 10h12" class="s" stroke-width="3" /><rect x="-8" y="5" width="14" height="10" /></>)}
      {ic(361, R[0], C.blue, <><circle r="20" /><rect x="-5" y="13" width="10" height="7" class="k" />{[[-11, -2], [-7, -10], [0, -13], [7, -10], [11, -2]].map(([a, b]) => <circle key={a} cx={a} cy={b} r="2.6" class="k" />)}</>)}
      {ic(423, R[0], C.pink, <><rect x="-19" y="-21" width="38" height="42" rx="3" /><rect x="-6" y="-16" width="12" height="18" rx="2" style={{ fill: C.white }} /><rect x="-1.5" y="2" width="3" height="16" class="k" /></>)}
      {ic(493, R[0], C.red, <><path d="M-20 18v-37h40M-20 18l6 6h34" class="s" stroke-width="3" />{t(3, 0, 'BAR', 22, 'w', 700)}</>)}
      {ic(882, R[0], C.red, <><rect x="-20" y="-20" width="40" height="40" rx="3" />{[-12, -8, -4, 0, 4, 8, 12].map((x, k) => <rect key={x} x={x - 1} y={-levels[k]!} width="2" height={2 * levels[k]!} style={{ fill: C.white }} />)}</>)}
      {ic(949, R[0], C.white, <><circle cy="3" r="16" /><rect x="-4" y="-21" width="8" height="6" /><rect x="-1.5" y="-8" width="3" height="12" style={{ fill: C.red }} /><path d="M-17 -15l5 5M17 -15l-5 5" class="s" stroke-width="3" style={{ stroke: C.red }} /></>)}
      {ic(1016, R[0], C.blue, <><circle cx="-7" cy="-7" r="11" class="s" stroke-width="3" /><circle cx="7" cy="-7" r="11" class="s" stroke-width="3" style={{ stroke: C.red }} />{t(0, 15, 'STEREO', 11, 'w', 700, 'middle', '.04em')}</>)}
      {/* The Y ring over its grid. */}
      <g class="ic">
        {yGrid}
        {[0, 1, 2, 3].map((k) => quarter(1314, RING_Y, k, [C.red, C.pink, C.blue, C.orange][k]!, 1))}
      </g>
      {/* Row 2. */}
      {ic(423, R[1], C.red, <><path d="M-19 -21h32l6 6v36h-38z" /><rect x="-10" y="-21" width="16" height="11" class="k" /><rect x="-12" y="4" width="24" height="14" style={{ fill: C.white }} /></>)}
      {ic(493, R[1], C.pink, <><path d="M20 -20h-40v34l6 6h34" class="s" stroke-width="3" />{t(2, 0, 'TIC', 22, 'w', 700)}</>)}
      {ic(882, R[1], C.orange, <><circle cx="9" cy="-12" r="7" class="s" stroke-width="3" /><path d="M-18 4L6 -8M2 -20l-6 22" class="s" stroke-width="3" />{[-18, -8, 2, 12].map((x) => <rect key={x} x={x} y="12" width="7" height="7" style={{ fill: C.white }} />)}</>)}
      {ic(949, R[1], C.red, <><path d="M-20 0a20 18 0 0 1 40 0z" /><path d="M0 0v14a5 5 0 0 1 -10 0" class="s" stroke-width="3" /><rect x="-1.5" y="-24" width="3" height="6" /></>)}
      {ic(1016, R[1], C.tan, <><circle cy="-10" r="11" /><circle cy="-10" r="4" class="k" /><rect x="-20" y="4" width="40" height="16" style={{ fill: C.pink }} />{t(0, 12, 'MONO', 11, 'k', 700)}</>)}
      {/* Row 3. */}
      {ic(299, R[2], C.white, <>{lid()}<path d="M4 -12v22" class="s" stroke-width="3" style={{ stroke: C.blue }} /><ellipse cx="-2" cy="12" rx="7" ry="5.5" style={{ fill: C.blue }} /></>)}
      {ic(361, R[2], C.red, <>{lid(C.white)}<path d="M-12 -12v34M12 -12v34M-12 5h24" class="s" stroke-width="3" /><path d="M-24 5h6M18 5h6" class="s" stroke-width="3" stroke-dasharray="2 3" style={{ stroke: C.blue }} /></>)}
      {ic(423, R[2], C.blue, <>{lid(C.white)}<path d="M-22 20h10l10 -26 14 26h10" class="s" stroke-width="3" /></>)}
      {ic(487, R[2], C.white, <>{lid()}<path d="M-14 14a10 8 0 0 1 14 -10l6 -12a3 3 0 0 1 4 2l-3 12a8 8 0 0 1 3 8z" /><path d="M-22 20h36l8 -8" class="s" stroke-width="3" style={{ stroke: C.blue }} /></>)}
      {ic(689, R[2], C.white, <><path d="M-6 -14h-10a5 5 0 0 0 -5 5v18a5 5 0 0 0 5 5h32a5 5 0 0 0 5 -5v-18a5 5 0 0 0 -5 -5h-4" class="s" stroke-width="3.2" /><path d="M-8 -14l8 -7v14z" /></>)}
      {ic(753, R[2], C.blue, <><path d="M-21 -21h42v42h-42z" /><path d="M-12 8l10 -14h18M-4 -2h20M-2 4h16M-4 10h12" class="s" stroke-width="3.2" style={{ stroke: C.white }} /></>)}
      {ic(1016, R[2], C.orange, <><rect x="-8" y="-22" width="16" height="6" rx="2" style={{ fill: C.tan }} /><rect x="-10" y="-16" width="20" height="26" rx="4" style={{ fill: C.tan }} /><rect x="-12" y="10" width="24" height="7" /><path d="M-7 18v5M-2 18v5M3 18v5M8 18v5" class="s" stroke-width="2" /></>)}
      {ic(1083, R[2], C.orange, <><rect x="-21" y="-21" width="42" height="42" rx="2" /><path d="M-21 21L4 -4" class="s" stroke-width="5" style={{ stroke: '#121212' }} /><circle cx="5" cy="-5" r="7" style={{ fill: C.white }} /></>)}
      {ic(1145, R[2], C.orange, <><rect x="-21" y="-21" width="42" height="42" rx="3" /><path d="M-21 0h10M10 0h11" class="s" stroke-width="3" style={{ stroke: C.white }} /><rect x="-11" y="-5" width="21" height="10" style={{ fill: C.white }} /></>)}
      {ic(1279, R[2], C.white, <><circle r="15" class="s" stroke-width="4" /><path d="M7 7l12 12" class="s" stroke-width="4" /></>)}
      {/* Row 4: the words in their boxes. */}
      {ic(433, R[3], C.white, <><path d="M-14 -14h-6v28h6" class="s" stroke-width="3" style={{ stroke: C.orange }} /><path d="M-6 16v-8a14 14 0 1 1 18 -4l-2 12z" /></>)}
      {ic(619, R[3], C.orange, <>{[...Array(12).keys()].map((k) => { const a = (k * Math.PI) / 6; return <path key={k} d={`M${(5 * Math.cos(a)).toFixed(1)} ${(5 * Math.sin(a)).toFixed(1)}L${(16 * Math.cos(a)).toFixed(1)} ${(16 * Math.sin(a)).toFixed(1)}`} class="s" stroke-width="3.5" /> })}<path d="M20 -16h4v32h-4" class="s" stroke-width="3" /></>)}
      {wordBox(928, 1037, C.pink, 'SYSTEM')}
      {ic(1083, R[3], C.white, <><rect x="-16" y="-18" width="32" height="24" rx="2" class="s" stroke-width="3" /><path d="M-22 18l6 -10h32l6 10z" /></>)}
      {ic(1145, R[3], C.red, <><path d="M0 -21L23 19H-23z" />{t(0, 9, 'CLIP', 11, 'w', 700)}</>)}
    </>
  )
})

/** The display's bars round FX (red, cut through the middle). */
const fxBars = (x: number, on: boolean): JSX.Element =>
  ic(x, R[2], C.red, <>{[-24, -18, -12, -6, 0, 6, 12, 18].map((bx) => <rect key={bx} x={bx} y="-13" width="4" height="26" />)}<rect x="-24" y="-3" width="46" height="2.5" class="k" /></>, on)

/**
 * The words the display prints that the key layer lights: FX (and its bars)
 * on the FX, OUTPUT and SIDECHAIN pages, SWING on TIMING, FREE in free time,
 * the MAIN and TEMPO boxes on their pages, ERASE's while erase is on, MUTE
 * with a group muted or soloed, COPY and PASTE for a moment as they go.
 */
function LcdLit(props: { fx: boolean; swing: boolean; free: boolean; main: boolean; tempo: boolean; erase: boolean; mute: boolean; clip: 'COPY' | 'PASTE' | null }): JSX.Element {
  return (
    <>
      {ic(98, R[1], C.white, <><path d="M-26 -17h52a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4h-19l-7 10v-10h-26a4 4 0 0 1-4-4v-20a4 4 0 0 1 4-4z" />{t(0, -3, 'MUTE', 14, 'k', 700)}</>, props.mute, 'ep-mute')}
      {ic(299, R[1], C.red, <><path d="M0 -24v12M-9 -15l9 -9 9 9" class="s" stroke-width="3" /><rect x="-22" y="-8" width="44" height="22" rx="2" />{t(0, 3, 'COPY', 14, 'k', 700)}</>, props.clip === 'COPY')}
      {ic(361, R[1], C.white, <><rect x="-22" y="-22" width="44" height="20" rx="3" />{t(0, -12, 'PASTE', 13, 'k', 700)}<path d="M0 -2v22M-9 11l9 9 9 -9" class="s" stroke-width="3" /></>, props.clip === 'PASTE')}
      {fxBars(820, props.fx)}
      {fxBars(951, props.fx)}
      {ic(886, R[2], C.white, t(0, 1, 'FX', 40, '', 400, 'middle', '0'), props.fx, 'ep-fx')}
      {ic(1340, R[2], C.blue, <><path d="M-20 -8c6 -14 12 -14 18 0s12 14 20 0" class="s" stroke-width="3" />{t(0, 13, 'FREE', 16, 'w', 700)}</>, props.free, 'ep-free')}
      {wordBox(474, 578, C.orange, 'MAIN', props.main)}
      {wordBox(670, 773, C.blue, 'TEMPO', props.tempo)}
      {wordBox(799, 908, C.red, 'ERASE', props.erase, true)}
      {ic(1312, R[3], C.red, <>{t(16, -8, 'SWING', 17, '', 700)}<path d="M-4 18c12 0 26 -4 36 -14" class="s" stroke-width="3" style={{ stroke: C.pink }} /><circle cx="-38" cy="-8" r="6" style={{ fill: C.tan }} /><rect x="-44" y="-2" width="13" height="14" style={{ fill: C.tan }} /><rect x="-44" y="12" width="13" height="10" style={{ fill: C.blue }} /><circle cx="-24" cy="-4" r="4" /></>, props.swing, 'ep-swing')}
    </>
  )
}

/**
 * The speaker: 14 × 12 holes on a 4 mm pitch; only the middle's disc is
 * drilled through, the rest are blind cups, the 2 × 2 at each corner shallow
 * dimples. Drawn once.
 */
const Grille = once(function Grille(): JSX.Element {
  const holes: JSX.Element[] = []
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 14; c++) {
      const x = 19.2 + 32.4 * c
      const y = 19.4 + 32.4 * r
      const k = `${r}:${c}`
      if (Math.hypot(x - 229.8, y - 197.4) <= 162) {
        holes.push(
          <g key={k}>
            <circle cx={x} cy={y} r="12.2" fill="url(#ep-cone)" />
            <path d={`M${x + 11.8} ${y - 3.1}A12.2 12.2 0 0 1 ${x - 3.1} ${y + 11.8}`} stroke="#A9A7A6" stroke-opacity=".55" stroke-width="1.6" fill="none" />
            <path d={`M${x - 11.8} ${y + 3.1}A12.2 12.2 0 0 1 ${x + 3.1} ${y - 11.8}`} stroke="#000" stroke-opacity=".5" stroke-width="1.4" fill="none" />
          </g>,
        )
      } else {
        const corner = (c < 2 || c > 11) && (r < 2 || r > 9)
        holes.push(
          <g key={k}>
            <circle cx={x} cy={y} r="12.2" fill={corner ? 'url(#ep-dimple)' : 'url(#ep-cup)'} />
            <circle cx={x} cy={y} r="11.9" fill="none" stroke="url(#ep-rim)" stroke-width={corner ? 2 : 2.4} />
          </g>,
        )
      }
    }
  }
  return (
    <svg viewBox="0 0 459 393" preserveAspectRatio="none">
      <defs>
        <linearGradient id="ep-gp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#858584" /><stop offset="1" stop-color="#6A6A69" /></linearGradient>
        <radialGradient id="ep-cup" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#2A2A2A" /><stop offset=".65" stop-color="#3C3C3C" /><stop offset="1" stop-color="#555555" /></radialGradient>
        <radialGradient id="ep-dimple" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#6E6D6D" /><stop offset="1" stop-color="#7C7B7B" /></radialGradient>
        <linearGradient id="ep-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#262626" /><stop offset=".5" stop-color="#6F6E6E" stop-opacity="0" /><stop offset="1" stop-color="#C4C2C1" /></linearGradient>
        <radialGradient id="ep-cone" gradientUnits="userSpaceOnUse" cx="229.8" cy="197.4" r="170">
          <stop offset="0" stop-color="#191919" /><stop offset=".22" stop-color="#0B0B0B" /><stop offset=".26" stop-color="#1C1C1C" /><stop offset=".3" stop-color="#0C0C0C" />
          <stop offset=".62" stop-color="#101010" /><stop offset=".7" stop-color="#1E1E1E" /><stop offset=".76" stop-color="#0A0A0A" /><stop offset="1" stop-color="#0D0D0D" />
        </radialGradient>
        <filter id="ep-gn" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={2} seed={4} />
          <feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 -.18" />
        </filter>
      </defs>
      <rect width="459" height="393" fill="url(#ep-gp)" />
      <rect width="459" height="393" filter="url(#ep-gn)" opacity=".35" />
      {holes}
      <rect x="0" y="0" width="459" height="2" fill="#000" opacity=".22" />
    </svg>
  )
})

/** Under a card's shortcuts, what the key does in arc where it does more than listen. */
const NOTES: Partial<Record<CardKey, string>> = {
  PLAY: WebText.DEVICE_PLAY_NOTE,
  VOLUME: WebText.DEVICE_VOLUME_NOTE,
  KNOBX: WebText.DEVICE_KNOB_X_NOTE,
  KNOBY: WebText.DEVICE_KNOB_Y_NOTE,
  FADER: WebText.DEVICE_FADER_NOTE,
}

/** A drawn knob ([which]: VOLUME, X or Y) turning what it turns now; a tap opens its [card]. */
function Knob(props: {
  kind: 'vol' | 'x' | 'y'
  which: DeviceControl
  label: string
  card: CardKey
  place: CSSProperties
  group: number
  onCard: (key: CardKey, el: HTMLElement) => void
  onTurned: (which: DeviceControl) => void
  /** SHIFT held on the drawn device: five times finer. */
  fine: () => boolean
}): JSX.Element {
  const t = useTurnable(props.which, props.group)
  return (
    <DrawnKnob kind={props.kind} label={props.label} place={props.place} t={t} onTap={(el) => props.onCard(props.card, el)} onTurned={() => props.onTurned(props.which)} fine={props.fine} />
  )
}

/**
 * The drawn fader on group [group]'s level (its send on the FX page); a tap
 * opens FADER's card. Moved with RECORD held it rests, and the plate says arc
 * records no automation.
 */
function Fader(props: { group: number; onCard: (key: CardKey, el: HTMLElement) => void; onTurned: (which: DeviceControl) => void; fine: () => boolean; layer: DeviceKeys | null }): JSX.Element {
  const t = useTurnable('fader', props.group)
  const { layer } = props
  return (
    <div
      style={{ display: 'contents' }}
      onPointerDownCapture={() => {
        if (layer !== null && held(layer.state.peek(), 'RECORD')) layer.say(WebText.notInArc(WebText.DEVICE_NOT_IN_ARC.AUTOMATION!))
      }}
    >
      <DrawnFader t={t} onTap={(el) => props.onCard('FADER', el)} onTurned={() => props.onTurned('fader')} fine={props.fine} />
    </div>
  )
}

/** The plate's hit line: [hit], or while a control turns ([turning]) its name and value ("FX X · 62"). */
function PlateHit(props: { hit: string; turning: ReadonlySignal<DeviceControl | null>; group: number }): JSX.Element {
  const which = props.turning.value
  const t = useTurnable(which, props.group)
  return (
    <span class="ep-a ep-plate__hit" aria-hidden="true">
      {t !== null ? WebText.turnShown(t.name, t.readout) : props.hit}
    </span>
  )
}

/** "Delete fader automation. With playback …" → "Delete fader automation." (the guide has the rest). */
export function firstSentence(text: string): string {
  const i = text.indexOf('. ')
  return i < 0 ? text : text.slice(0, i + 1)
}

/** A key's shortcuts from the guide, under the key. */
function ShortcutCard(props: {
  card: { key: CardKey; x: number; y: number; above: number }
  boxWidth: number
  boxHeight: number
  onClose: () => void
  onGuide?: ((query: string) => void) | undefined
}): JSX.Element {
  const { key } = props.card
  const name = cardName(key)
  const entries = shortcutsFor(key)
  const note = NOTES[key] ?? WebText.DEVICE_KEY_NOTE
  const x = Math.max(0, Math.min(props.card.x, props.boxWidth - 300))
  const ref = useRef<HTMLDivElement | null>(null)
  // Under the key; above it when there is no room below; else as low as fits.
  const [top, setTop] = useState(props.card.y)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const h = el.offsetHeight
    const { y, above } = props.card
    setTop(y + h <= props.boxHeight ? y : above - h >= 0 ? above - h : Math.max(0, props.boxHeight - h))
    el.focus({ preventScroll: true })
  }, [key, props.card.y])
  return (
    <div
      ref={ref}
      class="ep-card"
      role="dialog"
      aria-label={WebText.keyOnDevice(name)}
      tabIndex={-1}
      style={{ left: `${x}px`, top: `${top}px` }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          props.onClose()
        }
      }}
    >
      <div class="ep-card__head">
        <span class="t-caps ep-card__title">{WebText.keyOnDevice(name)}</span>
        <button type="button" class="ep-card__close" aria-label={CLOSE} onClick={props.onClose}>×</button>
      </div>
      {entries.length === 0 && key !== 'VOLUME' && <p class="t-small ep-card__text">{WebText.NO_SHORTCUTS}</p>}
      {entries.map((e) => (
        <div key={e.combo} class="ep-card__row">
          {keymapOf(e) !== null && <ComboLine combo={parse(e.combo!)} keymap={keymapOf(e)!} spoken={e.keys} class="ep-card__combo" />}
          <p class="t-small ep-card__text">{firstSentence(e.action)}</p>
        </div>
      ))}
      <p class="t-small ep-card__note">{note}</p>
      {props.onGuide && key !== 'VOLUME' && (
        <button type="button" class="ep-card__more" onClick={() => props.onGuide?.(cardSearch(key))}>
          {WebText.allShortcuts(name)} →
        </button>
      )}
    </div>
  )
}

/**
 * The drawn RECORD and PLAY as the pattern's keys: a tap on RECORD arms it (held, the pattern sheet), its cap
 * blinking while armed and lit while recording; PLAY plays and stops, lit while the pattern runs. RECORD is
 * held on the key layer too: − / + with it set the length, and a press so spent arms nothing (nor opens the
 * sheet). With STEP open it is the panel's RECORD (held, a pad placed on the step).
 */
function DeviceTransport(props: { t: TransportUi; still?: boolean; layer: DeviceKeys | null }): JSX.Element {
  const { t, layer } = props
  const ui = t.ui
  const press = useTransportPress(t)
  const beat = usePatternBeat(t, props.still === true)
  const light = recordLight(ui)
  const step = useStep()
  const stepOpen = step?.ui.open === true
  // STEP's RECORD held by this key (let go of with it, even if the panel closed meanwhile).
  const stepHeld = useRef(false)
  // − / + took RECORD while it waited to be a tap: the press ends there.
  const spent = layer?.state.value.spent.has('RECORD') === true
  useEffect(() => {
    if (spent) press.cancelRecord()
  }, [spent])
  const record: ButtonHTMLAttributes<HTMLButtonElement> = {
    ...press.record,
    onPointerDown: (e) => {
      if (e.button !== 0) return
      layer?.down('RECORD', e.timeStamp, e.shiftKey)
      if (stepOpen && step !== null) {
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        stepHeld.current = true
        step.onRecordDown()
        return
      }
      press.record.onPointerDown?.(e)
    },
    onPointerUp: (e) => {
      if (stepHeld.current) {
        stepHeld.current = false
        step?.onRecordUp()
      } else if (layer?.state.peek().spent.has('RECORD') === true) {
        press.record.onPointerCancel?.(e)
      } else {
        press.record.onPointerUp?.(e)
      }
      layer?.up('RECORD', e.timeStamp)
    },
    onPointerCancel: (e) => {
      if (stepHeld.current) {
        stepHeld.current = false
        step?.onRecordUp()
      } else press.record.onPointerCancel?.(e)
      layer?.cancel('RECORD')
    },
  }
  return (
    <>
      <button
        type="button"
        class={`ep-a ep-key ep-key--orange ep-key--word${light === 'live' || (light === 'armed' && props.still === true) ? ' is-on' : light === 'armed' ? ' is-armed' : ''}`}
        style={at(1050, ROW_Y[3]!, 130, 128)}
        aria-label={recordName(ui)}
        aria-description={MirrorText.RECORD_HOLD}
        data-coach="live.record"
        {...record}
      >
        RECORD
      </button>
      <button
        type="button"
        class={`ep-a ep-key ep-key--grey ep-key--word${patternRuns(ui) ? ' is-lit' : ''}`}
        style={at(1246, ROW_Y[3]!, 130, 128)}
        aria-label={playName(ui, beat)}
        {...press.play}
      >
        PLAY
      </button>
    </>
  )
}

/** The plate's orange line while the pattern is on: what PLAY will do, the count-in or the counter. */
function PlateWords(props: { t: TransportUi; still?: boolean }): JSX.Element {
  const beat = usePatternBeat(props.t, props.still === true)
  return (
    <span class="ep-a ep-plate__status" aria-hidden="true">
      {patternWordsText(props.t.ui, beat)}
    </span>
  )
}

/** A two-word key's place on the drawn EP-133 and the words it prints, with their DeviceView.css colours. */
interface DrawnKey {
  readonly place: CSSProperties
  readonly top: string
  readonly bottom: string
  readonly topCls: string
  readonly bottomCls: string
}

/** The two-word keys' places and prints on the drawn EP-133 (each over a well DeviceView draws). */
const DRAWN: Record<'SOUND' | 'MAIN' | 'TEMPO' | 'SAMPLE' | 'TIMING' | 'FX' | 'ERASE', DrawnKey> = {
  SOUND: { place: at(265, KROW, 130, 130), top: 'SOUND', bottom: 'EDIT', topCls: 'ep-h--black', bottomCls: 'ep-h--light ep-h--edit' },
  MAIN: { place: at(461, KROW, 130, 130), top: 'MAIN', bottom: 'COMMIT', topCls: 'ep-h--black', bottomCls: 'ep-h--orange' },
  TEMPO: { place: at(657, KROW, 130, 130), top: 'TEMPO', bottom: 'LOOP', topCls: 'ep-h--black', bottomCls: 'ep-h--grey' },
  SAMPLE: { place: at(1050, ROW_Y[0]!, 130, 130), top: 'SAMPLE', bottom: 'CHOP', topCls: 'ep-h--orange', bottomCls: 'ep-h--light' },
  TIMING: { place: at(1246, ROW_Y[0]!, 130, 130), top: 'TIMING', bottom: 'CORRECT', topCls: 'ep-h--black', bottomCls: 'ep-h--light' },
  FX: { place: at(1050, ROW_Y[1]!, 130, 130), top: 'FX', bottom: 'OUTPUT', topCls: 'ep-h--black', bottomCls: 'ep-h--light' },
  ERASE: { place: at(1246, ROW_Y[1]!, 130, 130), top: 'ERASE', bottom: 'SYSTEM', topCls: 'ep-h--lighter', bottomCls: 'ep-h--light' },
}
