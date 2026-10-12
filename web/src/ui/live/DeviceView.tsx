// The device view (web only): on the desk Live draws the EP-133 K.O. II by
// default (Live tools' View: All groups, One group, Device), from the product
// photo's layout (1444 × 2000, scaled to fit), and the mirror drives it.
//
// - The pads are Live's own (MirrorScreen's Pad and KeyCap, [pads]) in the
//   drawn ones' places ([padPlace]): they play as the grid's do (hold = gate,
//   a finger per pad), EDIT, ERASE, STEP, ARP and SAMPLE mark them, sounds
//   drop on them, PROJECT held takes 1 to 9; in KEYS they are the 12 notes,
//   FX held the punch-ins. They glow from the device like the grid's.
// - The keys are Live's where Live has one, as the EP-133 prints them: SOUND
//   (EDIT; held, the pad's sheet), MAIN as PROJECT (as the EP-133 loads a
//   project: held, a pad 1 to 9), TEMPO (the click; held, the tempo sheet),
//   SAMPLE (its panel), FX (the FX sheet; held, the punch-ins), ERASE, KEYS,
//   A–D, −/+ (the octave in KEYS, the group in PADS), RECORD and PLAY (the
//   pattern's, PatternLine.tsx). TAKE stays in Live tools; a take going shows
//   on the display (● and the time) and the plate.
// - The open panel (SAMPLE, STEP, SCENE) lies over the plate and the display
//   ([panel]); the display line (S01 and STEP, ERASE, the words) is over the
//   device (MirrorScreen).
// - PLAY lights while the device plays (MIDI clock); the display shows the
//   tempo in seven segments, ▶ and ● (REC), the A–D boxes, a ring with a
//   quarter per group, and the piano in KEYS. The plate, where the unit
//   prints its name, carries arc's status and the last hit.
// - Every other key and control (TIMING, the knobs, the fader, SHIFT) opens a
//   card with its shortcuts from the guide: arc never sends anything to the device.
import type { ComponentChildren, CSSProperties, HTMLAttributes, JSX, TargetedMouseEvent } from 'preact'
import { useContext, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { MAX_OCTAVE, MIN_OCTAVE } from '../../core/features/keys'
import type { MirrorState } from '../../core/features/liveMirror'
import { ROWS } from '../../core/features/padNotes'
import { parse } from '../../core/text/guideCombo'
import { CLOSE } from '../../core/text/guideText'
import { MirrorText } from '../../core/text/mirrorText'
import { WebText } from '../../core/text/webText'
import type { MirrorUi } from '../../state/types'
import { ComboLine } from '../components/GuideKeys'
import { FunctionKeysContext, FxKey, ProjectHoldContext, ProjectKey, SoundKey, TempoContext, TempoKey, type DrawnKey } from './FunctionRow'
import { PatternGridOver, useScene, worthSaying } from './ScenePanel'
import { useSample } from './SamplePanel'
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
import './DeviceView.css'

/** The photo's size: everything below is placed in these units, then scaled. */
export const DEVICE_W = 1444
export const DEVICE_H = 2000

/** Where the controls start under the display (the scene grid covers them). */
const CONTROLS_Y = 900
const COLS = [461, 657, 853]
const ROW_Y = [1147, 1343, 1538, 1735]
const GROUP_ICONS = ['✳', '↩', '↥', '↧'] as const
const LED_Y = [1112, 1307, 1503, 1700]

/** Seven-segment digits as the K.O. II's display draws them; the unlit segments stay faintly visible. */
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  O: 'abcdef', F: 'aefg', '-': 'g', ' ': '',
}
const SEGMENT_RECTS: readonly [string, number, number, number, number][] = [
  ['a', 10, 0, 46, 11], ['b', 56, 9, 11, 44], ['c', 56, 57, 11, 44], ['d', 10, 97, 46, 11], ['e', 0, 57, 11, 44], ['f', 0, 9, 11, 44], ['g', 10, 48.5, 46, 11],
]

function Digit(props: { ch: string; dot?: boolean }): JSX.Element {
  const on = SEGMENTS[props.ch] ?? ''
  return (
    <svg viewBox="0 0 80 108" aria-hidden="true">
      {SEGMENT_RECTS.map(([k, x, y, w, h]) => (
        <rect key={k} class={on.includes(k) ? 'on' : 'off'} x={x} y={y} width={w} height={h} rx="4" />
      ))}
      <circle class={props.dot ? 'on' : 'off'} cx="74" cy="102" r="6" />
    </svg>
  )
}

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
  onGroup: (g: number) => void
  onMode?: ((on: boolean) => void) | undefined
  onOctave?: ((octave: number) => void) | undefined
  /** TAKE, for the display (null: no TAKE). */
  take: TakeUi | null
  still: boolean
  /** Opens the shortcut guide searched for [query]. */
  onGuide?: ((query: string) => void) | undefined
  /** The open panel (SAMPLE, STEP, SCENE), over the device's top as Android's unrolls from the display. */
  panel?: ComponentChildren
}

/** Where pad [offset] sits on the drawn EP-133 (kept the same across renders, so a pad renders only when it changes). */
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

  const step = (d: number): void => {
    if (keys.on) props.onOctave?.(Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, keys.octave + d)))
    else props.onGroup(Math.max(0, Math.min(3, group + d)))
  }
  const canStep = (d: number): boolean => (keys.on ? keys.octave + d >= MIN_OCTAVE && keys.octave + d <= MAX_OCTAVE : group + d >= 0 && group + d <= 3)

  // PATTERN: RECORD and PLAY are the pattern's, the display's ● and ▶ light with it and the plate counts it.
  const transport = useContext(TransportContext)
  // TEMPO: a tap turns the click on or off, held the tempo sheet; the display's metronome lights with the click.
  const tempo = useContext(TempoContext)
  // SOUND, MAIN (PROJECT) and FX as Live's function keys; SAMPLE opens its panel.
  const fn = useContext(FunctionKeysContext)
  const projectHold = useContext(ProjectHoldContext)
  const sample = useSample()
  const scene = useScene()
  const numbers = scene !== null && worthSaying(scene.ui) ? scene.ui.groups : null
  const pat = transport?.ui ?? null
  const patLight = pat !== null ? recordLight(pat) : null
  const recLight: 'live' | 'armed' | null =
    patLight ?? (take?.state.kind === 'recording' ? 'live' : take?.state.kind === 'armed' ? 'armed' : null)
  const patternOn = pat !== null && patternRuns(pat)
  const openCard = (key: CardKey, e: TargetedMouseEvent<HTMLElement>): void => {
    const b = box.current?.getBoundingClientRect()
    const r = e.currentTarget.getBoundingClientRect()
    if (!b) return
    setCard(card?.key === key ? null : { key, x: r.left - b.left, y: r.bottom - b.top + 8, above: r.top - b.top - 8 })
  }

  const split = (key: CardKey, x: number, y: number, top: string, bottom: string, topCls: string, botCls: string): JSX.Element => (
    <button type="button" class="ep-a ep-key ep-key--split" style={at(x, y, 130, 130)} aria-label={`${top} / ${bottom}`} aria-haspopup="dialog" onClick={(e) => openCard(key, e)}>
      <span class={`ep-h ${topCls}`}>{top}</span>
      <span class={`ep-h ${botCls}`}>{bottom}</span>
    </button>
  )
  const led = (x: number, y: number, extra?: HTMLAttributes<HTMLSpanElement>): JSX.Element => (
    <span class="ep-a ep-led" style={at(x - 10, y - 10)} {...extra} />
  )
  const label = (x: number, y: number, text: string, cls = ''): JSX.Element => (
    <span class={`ep-a ep-lbl ${cls}`} style={at(x, y - 16)} aria-hidden="true">{text}</span>
  )

  return (
    <div class="ko-device" ref={box}>
      <div class="ko-device__box" style={{ width: `${DEVICE_W * scale}px`, height: `${DEVICE_H * scale}px` }}>
        <div class="ep" role="group" aria-label={WebText.DEVICE_VIEW} style={{ transform: `scale(${scale})` }}>
          {/* The top: jacks, the plate and the speaker. */}
          <span class="ep-a ep-jack ep-jack--out" aria-hidden="true">OUTPUT</span>
          <span class="ep-a ep-jack ep-jack--in" aria-hidden="true">INPUT</span>
          <span class="ep-a ep-jack ep-jack--sync" aria-hidden="true"><span>SYNC</span><span>MIDI</span></span>
          <span class="ep-a ep-jack ep-jack--usb" aria-hidden="true">USB</span>
          <span class="ep-a ep-jack ep-jack--pow" aria-hidden="true">POWER</span>
          <span class="ep-a ep-pow" aria-hidden="true" />
          <div class="ep-a ep-plate" aria-hidden="true" />
          {[[18, 112], [928, 112], [18, 438], [928, 438]].map(([x, y]) => <span key={`${x}:${y}`} class="ep-a ep-screw" style={at(x!, y!)} aria-hidden="true" />)}
          <span class="ep-a ep-plate__title" aria-hidden="true">K.O. Ⅱ</span>
          {transport !== null && hasWords(transport.ui) ? (
            <PlateWords t={transport} still={props.still} />
          ) : (
            <span class="ep-a ep-plate__status" aria-live="polite">{plateStatus(st, mirror, take)}</span>
          )}
          <span class="ep-a ep-plate__hit" aria-live="polite">
            {keys.on ? (keys.pad !== null ? MirrorText.keysSound(keys.pad, keys.padName) : MirrorText.NO_SOUND) : displayLine(st, mirror)}
          </span>
          <div class="ep-a ep-grille" aria-hidden="true" />

          {/* The display. */}
          <div class="ep-a ep-disp" aria-hidden="true" />
          <span class="ep-a ep-batt" aria-hidden="true" />
          <span class="ep-a ep-dtxt ep-dim" style={at(78, 634)} aria-hidden="true">MUTE</span>
          <span class={`ep-a ep-piano${keys.on ? ' is-on' : ''}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>
          {[0, 1, 2, 3].map((g) => (
            <span
              key={g}
              class={`ep-a ep-dgrp${!offline && g === group ? ' is-on' : ''}`}
              data-group={g}
              style={{ ...at(212, 562 + g * 66), '--glow': glowCss(groupGlow(st.pads, g, now)) }}
              aria-hidden="true"
            >
              {MirrorText.groupKey(g)}
            </span>
          ))}
          <span class="ep-a ep-mode" aria-hidden="true">{keys.on ? MirrorText.MODE_KEYS.toUpperCase() : MirrorText.MODE_PADS.toUpperCase()}</span>
          <span class="ep-a ep-dtxt ep-dim" style={at(300, 566)} aria-hidden="true">SYNC</span>
          <span class="ep-a ep-dtxt ep-dim" style={at(345, 634)} aria-hidden="true">PASTE</span>
          <span class="ep-a ep-bar" aria-hidden="true">BAR</span>
          <span class="ep-a ep-seg" aria-hidden="true">
            {[...digits.text].map((ch, i) => <Digit key={i} ch={ch} dot={digits.dot && i === 0} />)}
          </span>
          <span class={`ep-a ep-dtxt ep-bpm${digits.bpm ? ' ep-lit' : ' ep-dim'}`} aria-hidden="true">BPM</span>
          <span class={`ep-a ep-rec${recLight === 'live' ? ' is-on' : recLight === 'armed' ? (props.still ? ' is-on' : ' is-armed') : ''}`} aria-hidden="true" />
          <span class={`ep-a ep-play${st.playing === true || patternOn ? ' is-on' : ''}`} aria-hidden="true" />
          <svg class={`ep-a ep-metro${st.playing === true || tempo?.clickOn === true ? ' is-on' : ''}`} viewBox="0 0 40 52" aria-hidden="true">
            <path d="M14 4 h12 l10 44 h-32 z M20 40 L32 8" />
          </svg>
          <span class="ep-a ep-bars" style={at(795, 704)} aria-hidden="true" />
          <span class="ep-a ep-fx ep-dim" aria-hidden="true">FX</span>
          <span class="ep-a ep-bars" style={at(928, 704)} aria-hidden="true" />
          <span class="ep-a ep-stereo ep-dim" aria-hidden="true"><b>OO</b>STEREO</span>
          <svg class="ep-a ep-ring" viewBox="0 0 118 118" aria-hidden="true">
            {[0, 1, 2, 3].map((g) => {
              const c = 2 * Math.PI * 47
              const q = c / 4
              // A top-left, B top-right, C bottom-right, D bottom-left (the circle starts at 3 o'clock).
              const start = [2, 3, 0, 1][g]!
              return (
                <circle
                  key={g}
                  class={`ep-ring__q ep-ring__q--${g}${!offline && g === group ? ' is-on' : ''}`}
                  data-group={g}
                  style={{ '--glow': glowCss(groupGlow(st.pads, g, now)) }}
                  cx="59"
                  cy="59"
                  r="47"
                  stroke-dasharray={`${q - 6} ${c - q + 6}`}
                  stroke-dashoffset={-start * q}
                />
              )
            })}
          </svg>
          <span class="ep-a ep-dots" style={at(1203, 630)} aria-hidden="true" />
          <span class="ep-a ep-dots" style={at(1203, 694)} aria-hidden="true" />
          <span class="ep-a ep-dots" style={at(1203, 760)} aria-hidden="true" />
          <span class="ep-a ep-q ep-dim" aria-hidden="true">Q</span>
          <span class="ep-a ep-dtxt ep-dim" style={at(1310, 760)} aria-hidden="true">SWING</span>

          {/* The controls. */}
          {label(90, 917, 'VOLUME')}
          <button type="button" class="ep-a ep-knob ep-knob--vol" style={at(68, 950)} aria-label="Volume" aria-haspopup="dialog" onClick={(e) => openCard('VOLUME', e)} />
          {fn?.sound ? <SoundKey s={fn.sound} drawn={DRAWN.SOUND} /> : split('SOUND', 265, 950, 'SOUND', 'EDIT', 'ep-h--black', 'ep-h--light')}
          {/* MAIN is PROJECT, as the EP-133 loads a project: held, a pad 1 to 9. */}
          {fn?.project && projectHold ? (
            <ProjectKey p={fn.project} hold={projectHold} drawn={DRAWN.MAIN} />
          ) : (
            split('MAIN', 461, 950, 'MAIN', 'COMMIT', 'ep-h--black', 'ep-h--orange')
          )}
          {tempo !== null ? <TempoKey t={tempo} drawn={DRAWN.TEMPO} /> : split('TEMPO', 657, 950, 'TEMPO', 'LOOP', 'ep-h--black', 'ep-h--grey')}
          <span class="ep-a ep-line" style={at(722, 917, 2, 30)} aria-hidden="true" />
          <span class="ep-a ep-line" style={at(722, 917, 345, 2)} aria-hidden="true" />
          {label(1090, 917, 'BPM')}
          <span class="ep-a ep-line" style={at(1160, 917, 70, 2)} aria-hidden="true" />
          {label(1242, 917, 'METRONOME')}
          <button type="button" class="ep-a ep-knob ep-knob--x" style={at(1049, 950)} aria-label="Knob X" aria-haspopup="dialog" onClick={(e) => openCard('KNOBX', e)} />
          <button type="button" class="ep-a ep-knob ep-knob--y" style={at(1245, 950)} aria-label="Knob Y" aria-haspopup="dialog" onClick={(e) => openCard('KNOBY', e)} />
          <span class="ep-a ep-badge ep-badge--x" style={at(1098, 1098)} aria-hidden="true">X</span>
          <span class="ep-a ep-badge ep-badge--y" style={at(1294, 1098)} aria-hidden="true">Y</span>
          <span class="ep-a ep-line ep-line--red" style={at(1016, 1015, 2, 162)} aria-hidden="true" />
          <span class="ep-a ep-line ep-line--red" style={at(1016, 1015, 30, 2)} aria-hidden="true" />
          <span class="ep-a ep-line ep-line--red" style={at(1016, 1175, 34, 2)} aria-hidden="true" />
          <span class="ep-a ep-lbl ep-lbl--red ep-lbl--up" style={at(986, 1094)} aria-hidden="true">GAIN</span>
          <span class="ep-a ep-line" style={at(1408, 1015, 2, 162)} aria-hidden="true" />
          <span class="ep-a ep-line" style={at(1380, 1015, 30, 2)} aria-hidden="true" />
          <span class="ep-a ep-line" style={at(1380, 1175, 30, 2)} aria-hidden="true" />
          <span class="ep-a ep-lbl ep-lbl--up" style={at(1370, 1088)} aria-hidden="true">SWING</span>

          {/* The fader's labels and LEDs over the pads; the LED above each group key is its group's. */}
          {LED_Y.map((y, r) => (
            <span key={y}>
              {led(297, y, {
                class: `ep-a ep-led ep-led--group${!offline && r === group ? ' is-on' : ''}`,
                'data-group': String(r),
                style: { ...at(287, y - 10), '--glow': glowCss(groupGlow(st.pads, r, now)) },
              } as HTMLAttributes<HTMLSpanElement>)}
              {[493, 689, 885].map((x, i) => (
                <span key={x}>
                  {led(x, y, { 'aria-hidden': 'true' })}
                  {label(x + 30, y, [['LEVEL', 'PITCH', 'TIME'], ['LPF', 'HPF', '→ FX'], ['ATK', 'REL', 'PAN'], ['TUNE', 'VEL', 'MOD']][r]![i]!)}
                </span>
              ))}
            </span>
          ))}
          {led(1082, 1700, { class: `ep-a ep-led${canStep(-1) ? ' is-on' : ''}`, style: at(1072, 1690), 'aria-hidden': 'true' })}
          {led(1147, 1700, { class: `ep-a ep-led${canStep(1) ? ' is-on' : ''}`, style: at(1137, 1690), 'aria-hidden': 'true' })}

          <button
            type="button"
            class={`ep-a ep-key ep-key--black ep-key--slim${keys.on ? ' is-sel' : ''}`}
            style={at(68, 1147, 130, 64)}
            aria-pressed={keys.on}
            aria-label={MirrorText.MODE_KEYS}
            data-coach="live.mode"
            onClick={() => props.onMode?.(!keys.on)}
          >
            KEYS
          </button>
          <button type="button" class="ep-a ep-key ep-key--black ep-key--slim" style={at(68, 1277, 130, 64)} aria-haspopup="dialog" onClick={(e) => openCard('FADER', e)}>
            FADER
          </button>
          <button type="button" class="ep-a ep-fader" aria-label="Fader" aria-haspopup="dialog" onClick={(e) => openCard('FADER', e)}>
            <span class="ep-fader__slot" />
            <span class="ep-fader__tick" />
            <span class="ep-fader__cap" />
          </button>
          <button type="button" class="ep-a ep-key ep-key--light ep-key--slim" style={at(68, 1800, 130, 64)} aria-haspopup="dialog" onClick={(e) => openCard('SHIFT', e)}>
            SHIFT
          </button>

          {/* The guide's tags on the group keys and the pads: boxes over them (their keys are placed one by one). */}
          <span class="ep-a ep-area" style={at(265, 1147, 130, 716)} data-coach="live.groups" aria-hidden="true" />
          <span class="ep-a ep-area" style={at(461, 1147, 522, 716)} data-coach={keys.on ? 'live.keys' : 'live.pads'} aria-hidden="true" />
          <div role="tablist" aria-label={MirrorText.GROUP}>
            {[0, 1, 2, 3].map((g) => {
              // The group's pattern in the icon's place where the scene is worth saying (as Live's group keys).
              const col = numbers?.[g] ?? null
              const queued = col?.queued ?? null
              return (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={g === group}
                  aria-label={`${MirrorText.GROUP} ${MirrorText.groupKey(g)}` + (col !== null ? MirrorText.groupKeyPattern(col.number, queued) : '')}
                  class={`ep-a ep-key ep-key--light ep-key--group${queued !== null ? ' is-queued' : ''}`}
                  style={at(265, ROW_Y[g]!, 130, 128)}
                  onClick={() => props.onGroup(g)}
                >
                  <span class="ep-key__letter" aria-hidden="true">{MirrorText.groupKey(g)}</span>
                  {col !== null ? (
                    <span class={`ep-key__num${queued !== null ? ' is-queued' : ''}`} aria-hidden="true">
                      {queued === null ? MirrorText.patternNumber(col.number) : MirrorText.numberMove(col.number, queued)}
                    </span>
                  ) : (
                    <span class="ep-key__icon" aria-hidden="true">{GROUP_ICONS[g]}</span>
                  )}
                </button>
              )
            })}
          </div>

          <div role="group" aria-label={keys.on ? MirrorText.MODE_KEYS : `${MirrorText.GROUP} ${MirrorText.groupKey(group)}`}>
            {props.pads}
          </div>

          {sample !== null ? (
            <button
              type="button"
              class={`ep-a ep-key ep-key--split${sample.ui.on ? ' is-lit' : ''}`}
              style={at(1050, 1147, 130, 130)}
              aria-label="SAMPLE / CHOP"
              aria-pressed={sample.ui.on}
              onClick={() => sample.onToggle()}
            >
              <span class="ep-h ep-h--orange">SAMPLE</span>
              <span class="ep-h ep-h--light">CHOP</span>
            </button>
          ) : (
            split('SAMPLE', 1050, 1147, 'SAMPLE', 'CHOP', 'ep-h--orange', 'ep-h--light')
          )}
          {split('TIMING', 1246, 1147, 'TIMING', 'CORRECT', 'ep-h--black', 'ep-h--light')}
          {fn?.fx ? <FxKey f={fn.fx} drawn={DRAWN.FX} /> : split('FX', 1050, 1343, 'FX', 'OUTPUT', 'ep-h--black', 'ep-h--light')}
          {pat !== null && transport !== null ? (
            <button
              type="button"
              class={`ep-a ep-key ep-key--split${pat.erase ? ' is-lit' : ''}`}
              style={at(1246, 1343, 130, 130)}
              aria-label={MirrorText.ERASE}
              aria-pressed={pat.erase}
              data-coach="live.erase"
              onClick={() => transport.onErase(!pat.erase)}
            >
              <span class="ep-h ep-h--lighter">ERASE</span>
              <span class="ep-h ep-h--light">SYSTEM</span>
            </button>
          ) : (
            split('ERASE', 1246, 1343, 'ERASE', 'SYSTEM', 'ep-h--lighter', 'ep-h--light')
          )}
          <button
            type="button"
            class="ep-a ep-key ep-key--light ep-key--sign"
            style={at(1050, 1538, 130, 128)}
            aria-label={keys.on ? WebText.OCTAVE_DOWN : WebText.PREV_GROUP}
            disabled={!canStep(-1)}
            onClick={() => step(-1)}
          >
            −
          </button>
          <button
            type="button"
            class="ep-a ep-key ep-key--light ep-key--sign"
            style={at(1246, 1538, 130, 128)}
            aria-label={keys.on ? WebText.OCTAVE_UP : WebText.NEXT_GROUP}
            disabled={!canStep(1)}
            onClick={() => step(1)}
          >
            +
          </button>
          {transport !== null ? (
            <DeviceTransport t={transport} still={props.still} />
          ) : (
            <>
              <button
                type="button"
                class="ep-a ep-key ep-key--orange ep-key--word"
                style={at(1050, 1735, 130, 128)}
                aria-haspopup="dialog"
                onClick={(e) => openCard('RECORD', e)}
              >
                RECORD
              </button>
              <button
                type="button"
                class={`ep-a ep-key ep-key--grey ep-key--word${st.playing === true ? ' is-lit' : ''}`}
                style={at(1246, 1735, 130, 128)}
                aria-label={`PLAY, ${st.playing === true ? MirrorText.PLAYING : st.playing === false ? MirrorText.STOPPED : MirrorText.OFFLINE}`}
                aria-haspopup="dialog"
                onClick={(e) => openCard('PLAY', e)}
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
  const note = key === 'PLAY' ? WebText.DEVICE_PLAY_NOTE : key === 'VOLUME' ? WebText.DEVICE_VOLUME_NOTE : WebText.DEVICE_KEY_NOTE
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

/** The drawn RECORD and PLAY as the pattern's keys: a tap on RECORD arms (held, the pattern sheet), PLAY plays and stops. */
function DeviceTransport(props: { t: TransportUi; still?: boolean }): JSX.Element {
  const { t } = props
  const ui = t.ui
  const press = useTransportPress(t)
  const beat = usePatternBeat(t, props.still === true)
  const light = recordLight(ui)
  return (
    <>
      <button
        type="button"
        class={`ep-a ep-key ep-key--orange ep-key--word${light !== null ? ' is-lit' : ''}`}
        style={at(1050, 1735, 130, 128)}
        aria-label={recordName(ui)}
        aria-description={MirrorText.RECORD_HOLD}
        data-coach="live.record"
        {...press.record}
      >
        RECORD
      </button>
      <button
        type="button"
        class={`ep-a ep-key ep-key--grey ep-key--word${patternRuns(ui) ? ' is-lit' : ''}`}
        style={at(1246, 1735, 130, 128)}
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

/** The function keys' places and prints on the drawn EP-133. */
const DRAWN: Record<'SOUND' | 'MAIN' | 'TEMPO' | 'FX', DrawnKey> = {
  SOUND: { place: at(265, 950, 130, 130), top: 'SOUND', bottom: 'EDIT', topCls: 'ep-h--black', bottomCls: 'ep-h--light' },
  MAIN: { place: at(461, 950, 130, 130), top: 'MAIN', bottom: 'COMMIT', topCls: 'ep-h--black', bottomCls: 'ep-h--orange' },
  TEMPO: { place: at(657, 950, 130, 130), top: 'TEMPO', bottom: 'LOOP', topCls: 'ep-h--black', bottomCls: 'ep-h--grey' },
  FX: { place: at(1050, 1343, 130, 130), top: 'FX', bottom: 'OUTPUT', topCls: 'ep-h--black', bottomCls: 'ep-h--light' },
}
