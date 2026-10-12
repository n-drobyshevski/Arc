// The device view (web only): on a wide screen, Live draws the EP-133 K.O. II
// itself, from the product photo's layout (1444 × 2000, scaled to fit), and the
// mirror drives it.
//
// - The pads play as the grid's do (hold = gate, a finger per pad); in KEYS
//   they are the 12 notes. They glow from the device like the grid's, through
//   the same [data-pad] / [data-key] / [data-group] glow the screen writes.
// - A–D pick the group shown, KEYS switches PADS / KEYS, and −/+ change the
//   octave in KEYS or step through the groups in PADS. RECORD and PLAY are
//   the pattern's (PatternLine.tsx): a tap on RECORD arms it, held it opens
//   the pattern sheet, and PLAY plays and stops; with no pattern (no output)
//   they show their shortcuts as the other keys do. TAKE stays in Live tools;
//   a take going shows on the display (● and the time) and the plate.
// - PLAY lights while the device plays (MIDI clock); the display shows the
//   tempo in seven segments, ▶ and ● (REC), the A–D boxes, a ring with a
//   quarter per group, and the piano in KEYS. The plate, where the unit
//   prints its name, carries arc's status and the last hit.
// - Every other key and control opens a card with its shortcuts from the
//   guide: arc never sends anything to the device.
import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, JSX, TargetedMouseEvent } from 'preact'
import { useContext, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Keys, MAX_OCTAVE, MIN_OCTAVE } from '../../core/features/keys'
import type { MirrorState } from '../../core/features/liveMirror'
import { ROWS, padKey, physicalPad, type PhysicalPad } from '../../core/features/padNotes'
import { parse } from '../../core/text/guideCombo'
import { CLOSE } from '../../core/text/guideText'
import { MirrorText } from '../../core/text/mirrorText'
import { WebText } from '../../core/text/webText'
import type { MirrorUi } from '../../state/types'
import { ComboLine } from '../components/GuideKeys'
import { TempoContext, useTempoPress, type TempoUi } from './FunctionRow'
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
import { displayLine, glow, glowCss, groupGlow } from './glow'
import { keysLit, upperOctave, type KeysShown } from './keys'
import type { PressTarget, PressTracker } from './press'
import { cardName, cardSearch, shortcutsFor, type CardKey } from './shortcuts'
import type { TakeUi } from './Takes'
import './DeviceView.css'

/** The photo's size: everything below is placed in these units, then scaled. */
export const DEVICE_W = 1444
export const DEVICE_H = 2000

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
  /** The notes playing here (KEYS rings them). */
  playingNotes: ReadonlySet<number>
  /** KEYS's 12 notes by pad offset (null in PADS). */
  keyNotes: readonly number[] | null
  nameOf: (pad: PhysicalPad) => string | null
  now: number
  group: number
  onGroup: (g: number) => void
  onMode?: ((on: boolean) => void) | undefined
  onOctave?: ((octave: number) => void) | undefined
  /** What a press on a pad plays (null: the pads stay still). */
  press: (pad: PhysicalPad) => PressTarget | null
  /** A KEYS key's press, by its note. */
  keyPress: (note: number) => PressTarget
  playingPads: ReadonlySet<number>
  tracker: PressTracker
  /** TAKE, for the display (null: no TAKE). */
  take: TakeUi | null
  still: boolean
  /** Opens the shortcut guide searched for [query]. */
  onGuide?: ((query: string) => void) | undefined
  /** The pointer handlers of a pad or key that sounds while held. */
  hold: (target: PressTarget) => ButtonHTMLAttributes<HTMLButtonElement>
}

const at = (x: number, y: number, w?: number, h?: number): CSSProperties => ({
  left: `${x}px`,
  top: `${y}px`,
  ...(w !== undefined ? { width: `${w}px` } : {}),
  ...(h !== undefined ? { height: `${h}px` } : {}),
})

export function DeviceView(props: DeviceViewProps): JSX.Element {
  const { st, mirror, keys, keyNotes, nameOf, now, group, take } = props
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
  const lit = keyNotes ? keysLit(st.notes, keyNotes, now) : null

  const step = (d: number): void => {
    if (keys.on) props.onOctave?.(Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, keys.octave + d)))
    else props.onGroup(Math.max(0, Math.min(3, group + d)))
  }
  const canStep = (d: number): boolean => (keys.on ? keys.octave + d >= MIN_OCTAVE && keys.octave + d <= MAX_OCTAVE : group + d >= 0 && group + d <= 3)

  // PATTERN: RECORD and PLAY are the pattern's, the display's ● and ▶ light with it and the plate counts it.
  const transport = useContext(TransportContext)
  // TEMPO: a tap turns the click on or off, held the tempo sheet; the display's metronome lights with the click.
  const tempo = useContext(TempoContext)
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
    <div class="device" ref={box}>
      <div class="device__box" style={{ width: `${DEVICE_W * scale}px`, height: `${DEVICE_H * scale}px` }}>
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
          {split('SOUND', 265, 950, 'SOUND', 'EDIT', 'ep-h--black', 'ep-h--light')}
          {split('MAIN', 461, 950, 'MAIN', 'COMMIT', 'ep-h--black', 'ep-h--orange')}
          {tempo !== null ? <DeviceTempoKey t={tempo} /> : split('TEMPO', 657, 950, 'TEMPO', 'LOOP', 'ep-h--black', 'ep-h--grey')}
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

          <div role="tablist" aria-label={MirrorText.GROUP}>
            {[0, 1, 2, 3].map((g) => (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={g === group}
                aria-label={`${MirrorText.GROUP} ${MirrorText.groupKey(g)}`}
                class="ep-a ep-key ep-key--light ep-key--group"
                style={at(265, ROW_Y[g]!, 130, 128)}
                onClick={() => props.onGroup(g)}
              >
                <span class="ep-key__letter" aria-hidden="true">{MirrorText.groupKey(g)}</span>
                <span class="ep-key__icon" aria-hidden="true">{GROUP_ICONS[g]}</span>
              </button>
            ))}
          </div>

          <div role="group" aria-label={keys.on ? MirrorText.MODE_KEYS : `${MirrorText.GROUP} ${MirrorText.groupKey(group)}`}>
            {ROWS.map((offsets, r) =>
              offsets.map((o, c) => {
                const style = at(COLS[c]!, ROW_Y[r]!, 130, 128)
                if (keys.on && keyNotes && lit) {
                  const note = keyNotes[o]!
                  return (
                    <button
                      key={`k${o}`}
                      type="button"
                      class={`ep-a ep-pad ep-pad--key${upperOctave(note, keys.octave) ? ' ep-pad--upper' : ''}${props.playingNotes.has(note) ? ' is-playing' : ''}`}
                      style={{ ...style, '--glow': glowCss(lit.get(o) ?? 0) }}
                      data-key={o}
                      aria-label={MirrorText.noteName(note, keys.names)}
                      aria-description={MirrorText.PLAY}
                      {...props.hold(props.keyPress(note))}
                    >
                      <span class="ep-pad__ring">{Keys.name(note, keys.names)}</span>
                      <span class="ep-pad__oct">{Keys.octaveOf(note)}</span>
                    </button>
                  )
                }
                const pad = physicalPad(group, o)
                const light = st.pads.get(padKey(pad))
                const name = nameOf(pad)
                const target = props.press(pad)
                const g = light ? glow(light, now) : 0
                const word = pad.label === 'ENTER'
                return (
                  <button
                    key={`p${o}`}
                    type="button"
                    class={`ep-a ep-pad${props.playingPads.has(padKey(pad)) ? ' is-playing' : ''}`}
                    style={{ ...style, '--glow': glowCss(g) }}
                    data-pad={padKey(pad)}
                    aria-label={`${pad.groupLetter} ${pad.label}` + (name !== null ? `, ${name}` : '')}
                    aria-description={target ? MirrorText.PLAY : undefined}
                    disabled={target === null}
                    {...(target ? props.hold(target) : {})}
                  >
                    <span class={`ep-pad__num${word ? ' ep-pad__num--word' : ''}`}>{pad.label === '.' ? '•' : pad.label}</span>
                    {name !== null && <span class="ep-pad__name">{name}</span>}
                  </button>
                )
              }),
            )}
          </div>

          {split('SAMPLE', 1050, 1147, 'SAMPLE', 'CHOP', 'ep-h--orange', 'ep-h--light')}
          {split('TIMING', 1246, 1147, 'TIMING', 'CORRECT', 'ep-h--black', 'ep-h--light')}
          {split('FX', 1050, 1343, 'FX', 'OUTPUT', 'ep-h--black', 'ep-h--light')}
          {split('ERASE', 1246, 1343, 'ERASE', 'SYSTEM', 'ep-h--lighter', 'ep-h--light')}
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

/** The drawn TEMPO / LOOP key as TEMPO: a tap turns the click on or off, held (or right-clicked) the tempo sheet. */
function DeviceTempoKey(props: { t: TempoUi }): JSX.Element {
  const { t } = props
  const press = useTempoPress(t)
  const bpm = t.deviceBpm !== null ? Math.round(t.deviceBpm) : t.bpm
  return (
    <button
      type="button"
      class={`ep-a ep-key ep-key--split${t.clickOn ? ' is-lit' : ''}`}
      style={at(657, 950, 130, 130)}
      role="switch"
      aria-checked={t.clickOn}
      aria-label={MirrorText.CLICK}
      aria-description={`${MirrorText.clickState(t.clickOn, bpm, t.deviceBpm !== null)}. ${MirrorText.SET_TEMPO}: hold`}
      {...press}
    >
      <span class="ep-h ep-h--black">TEMPO</span>
      <span class="ep-h ep-h--grey">LOOP</span>
    </button>
  )
}
