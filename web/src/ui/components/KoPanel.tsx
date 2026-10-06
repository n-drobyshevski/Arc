// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/KoPanel.kt
//
// The K.O. II drawn whole, beside the Guide's list (an addition to the web
// version): the ports strip, the cream panel and its grille, the display, the
// knob row, the LEDs and the function labels between the rows of keys, the
// KEYS / FADER / SHIFT column and the fader, the group keys, the pads and the
// two-tier function keys. Every key is a cap like the app's (a flat face over
// a flat edge offset down and right), and every knob a flat skirt and a
// raised flat cap, each over its own edge.
//
// It is laid out in units of a 560-wide drawing (the web draft's pixels) and
// scaled to the size it is given. The keys of the selected shortcut are
// outlined in signal orange with numbered step badges; the rest dim.
//
// Web deltas: an SVG (viewBox in drawing units) instead of a Canvas; the
// colours are the --ko-* tokens (theme/cap.css, Cap.kt KoColors); a key that
// isn't part of the shortcut is drawn at 30% opacity over the body (Kotlin
// lerps each colour 30% of the way from the body, the same result), and fades
// there. Text widths come from a canvas (measureText), re-read once the fonts
// have loaded. Shown on the desk only (GuideScreen); Android shows it on a
// wide window.
import type { JSX } from 'preact'
import { useEffect, useId, useState } from 'preact/hooks'
import { type GuideKeymap, type PanelKey, type StepKind } from '../../core/text/guideKeymap'
import { LED_ROWS, PANEL, PORTS, knobLabel, panelLabel, panelSub, stepTag } from '../../core/text/guideText'
import './KoPanel.css'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** The drawing's layout, in units of a 560-wide device. */
export const Ko = (() => {
  const W = 560
  const EDGE_X = 4
  const EDGE_Y = 6
  const PORTS_H = 22
  const TOP = 92
  const SCREEN = 78
  const PAD_T = 14
  const PAD_X = 18
  const PAD_B = 20
  const GAP_X = 14
  const GAP_Y = 5
  const LABEL = 14
  /** A pad column's width; the first column (KEYS, FADER, SHIFT) is 0.78 of it. */
  const UNIT = (W - 2 * PAD_X - 6 * GAP_X) / 6.78
  const COL0 = 0.78 * UNIT
  const PAD = UNIT / 1.08
  const KNOB = UNIT * 0.92
  const BODY = PORTS_H + TOP + SCREEN
  /** The body's rows: labels, knobs, then an LED row over each row of keys. */
  const ROWS = [LABEL, KNOB, LABEL, PAD, LABEL, PAD, LABEL, PAD, LABEL, PAD] as const
  const H = BODY + PAD_T + ROWS.reduce((a, b) => a + b, 0) + GAP_Y * (ROWS.length - 1) + PAD_B
  return { W, H, EDGE_X, EDGE_Y, RADIUS: 18, PORTS: PORTS_H, TOP, SCREEN, PAD_T, PAD_X, GAP_X, GAP_Y, LABEL, KEY_R: 6, UNIT, COL0, PAD, KNOB, BODY, ROWS }
})()

/** Width over height of the drawing, its body's edge included (Kotlin KoAspect). */
export const KO_ASPECT = (Ko.W + Ko.EDGE_X) / (Ko.H + Ko.EDGE_Y)

export function colX(i: number): number {
  return i === 0 ? Ko.PAD_X : Ko.PAD_X + Ko.COL0 + Ko.GAP_X + (i - 1) * (Ko.UNIT + Ko.GAP_X)
}
export function colW(i: number): number {
  return i === 0 ? Ko.COL0 : Ko.UNIT
}
export function rowY(i: number): number {
  let y = Ko.BODY + Ko.PAD_T
  for (let r = 0; r < i; r++) y += Ko.ROWS[r]! + Ko.GAP_Y
  return y
}

/** A box [w] x [h] centred in row [row] and column [col]. */
function cell(col: number, row: number, w = colW(col), h: number = Ko.ROWS[row]!): Rect {
  return { x: colX(col) + (colW(col) - w) / 2, y: rowY(row) + (Ko.ROWS[row]! - h) / 2, w, h }
}

/** The fader's slot: the first column, from the LED row under FADER to the one over SHIFT. */
export const FADER_SLOT: Rect = (() => {
  const top = rowY(6) + 10
  const bottom = rowY(8) + Ko.LABEL - 10
  const x = colX(0) + Ko.COL0 / 2
  return { x: x - 4, y: top, w: 8, h: bottom - top }
})()
export const FADER_KNOB: Rect = (() => {
  const cx = FADER_SLOT.x + FADER_SLOT.w / 2
  const cy = FADER_SLOT.y + FADER_SLOT.h * 0.38
  return { x: cx - 15, y: cy - 15, w: 30, h: 30 }
})()

const KNOBS: ReadonlySet<PanelKey> = new Set<PanelKey>(['VOL', 'X', 'Y'])

/** Where each key sits. Knobs are their square box. */
export const RECTS: ReadonlyMap<PanelKey, Rect> = (() => {
  const m = new Map<PanelKey, Rect>()
  m.set('VOL', cell(0, 1, Ko.COL0 * 0.92, Ko.COL0 * 0.92))
  m.set('SOUND', cell(1, 1, undefined, Ko.UNIT / 1.6))
  m.set('MAIN', cell(2, 1, undefined, Ko.UNIT / 1.6))
  m.set('TEMPO', cell(3, 1, undefined, Ko.UNIT / 1.6))
  m.set('X', cell(5, 1, Ko.KNOB, Ko.KNOB))
  m.set('Y', cell(6, 1, Ko.KNOB, Ko.KNOB))
  const wide = Ko.COL0 / 2.1
  m.set('KEYS', cell(0, 3, undefined, wide))
  m.set('FADER', cell(0, 5, undefined, wide))
  m.set('SHIFT', cell(0, 9, undefined, wide))
  const rows: readonly (readonly PanelKey[])[] = [
    ['A', 'P7', 'P8', 'P9', 'SAMPLE', 'TIMING'],
    ['B', 'P4', 'P5', 'P6', 'FX', 'ERASE'],
    ['C', 'P1', 'P2', 'P3', 'MINUS', 'PLUS'],
    ['D', 'DOT', 'P0', 'ENTER', 'REC', 'PLAY'],
  ]
  rows.forEach((keys, r) => keys.forEach((k, i) => m.set(k, cell(i + 1, 3 + 2 * r, undefined, Ko.PAD))))
  return m
})()

/** Where a step's keys sit: a key, or the fader itself (moved) rather than its FADER key. */
export type Spot = PanelKey | 'SLIDER'

/** A badge over a spot: the steps it belongs to and what the first asks. */
export interface SpotBadge {
  readonly steps: readonly number[]
  readonly kind: StepKind
}

export interface Lit {
  readonly spots: ReadonlySet<Spot>
  readonly badges: ReadonlyMap<Spot, SpotBadge>
}

/**
 * The spots a keymap lights and their badges. A step of one, two or three
 * keys numbers each of them; a step over a whole set (any pad, the digits,
 * the groups) is only outlined, as in the web draft: a badge over the top
 * row of pads would cover the labels between the rows, and the open row's
 * steps say it already.
 */
export function litOf(keymap: GuideKeymap | null): Lit {
  const steps = keymap?.steps ?? []
  const spots = new Set<Spot>()
  const numbers = new Map<Spot, [number, StepKind][]>()
  steps.forEach((step, i) => {
    const here = step.keys.map((k): Spot => (k === 'FADER' && step.kind === 'MOVE' ? 'SLIDER' : k))
    for (const s of here) spots.add(s)
    if (here.length <= 3) {
      for (const s of here) {
        const l = numbers.get(s) ?? []
        l.push([i + 1, step.kind])
        numbers.set(s, l)
      }
    }
  })
  const badges = new Map<Spot, SpotBadge>()
  for (const [s, l] of numbers) badges.set(s, { steps: l.map((n) => n[0]), kind: l[0]![1] })
  return { spots, badges }
}

/** "1 HOLD" over a key: its steps and, for all but a press, what to do. */
export function badgeLabel(b: SpotBadge): string {
  const t = stepTag(b.kind)
  return b.steps.join('·') + (t !== null ? ` ${t}` : '')
}

function rectOf(spot: Spot): Rect {
  return spot === 'SLIDER' ? FADER_KNOB : RECTS.get(spot)!
}

// ---- Text ----

let measureCtx: CanvasRenderingContext2D | null | undefined

/** How wide [t] is, in units, at [size] units: measured on a canvas, else estimated (tests). */
export function textWidth(t: string, size: number, weight: number, spacing = 0, mono = false): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
    } catch {
      measureCtx = null
    }
  }
  const tracking = spacing * size * t.length
  if (!measureCtx) return t.length * size * (mono ? 0.6 : 0.66) + tracking
  const style = getComputedStyle(document.documentElement)
  const family = style.getPropertyValue(mono ? '--font-mono' : '--font').trim() || (mono ? 'monospace' : 'sans-serif')
  // Measured at 100px for precision, scaled down.
  measureCtx.font = `${weight} 100px ${family}`
  return (measureCtx.measureText(t).width * size) / 100 + tracking
}

/** Re-renders once the web fonts have loaded, so measured widths are Manrope's. */
function useFontsLoaded(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    fonts?.ready.then(() => live && setN((v) => v + 1)).catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return n
}

/** Where a text's baseline goes for it to look centred on [cy] (caps and digits). */
const mid = (cy: number, size: number): number => cy + size * 0.37
/** Where its baseline goes for its line box to start at [top] (Compose's top-aligned text). */
const below = (top: number, size: number): number => top + size * 1.07

interface TextOpts {
  size: number
  fill: string
  weight?: number
  spacing?: number
  mono?: boolean
  anchor?: 'start' | 'middle' | 'end'
}

function T(props: TextOpts & { x: number; y: number; children: string }): JSX.Element {
  const { size, fill, weight = 500, spacing = 0, mono = false, anchor = 'middle' } = props
  return (
    <text
      x={props.x}
      y={props.y}
      class={mono ? 'ko__t ko__t--mono' : 'ko__t'}
      text-anchor={anchor}
      style={{ fill, fontSize: `${size}px`, fontWeight: weight, letterSpacing: spacing ? `${spacing}em` : undefined }}
    >
      {props.children}
    </text>
  )
}

const v = (token: string): string => `var(--ko-${token})`

// ---- The drawing ----

export interface KoPanelProps {
  /** The selected entry's keymap; null (or one with no keys on the panel) draws the device plain. */
  keymap: GuideKeymap | null
  class?: string
}

/** The K.O. II with [keymap]'s keys lit and their steps numbered. */
export function KoPanel(props: KoPanelProps): JSX.Element {
  useFontsLoaded()
  const ids = useId()
  const lit = litOf(props.keymap)
  const dimming = lit.spots.size > 0
  const dimClass = (spot: Spot): string => (dimming && !lit.spots.has(spot) ? 'ko__part is-dim' : 'ko__part')
  const clip = `${ids}-clip`
  const holes = `${ids}-holes`
  return (
    <svg
      class={`ko${props.class ? ` ${props.class}` : ''}`}
      viewBox={`0 0 ${Ko.W + Ko.EDGE_X} ${Ko.H + Ko.EDGE_Y}`}
      role="img"
      aria-label={PANEL}
      data-lit={dimming ? [...lit.spots].join(' ') : undefined}
    >
      <defs>
        <clipPath id={clip}>
          <rect width={Ko.W} height={Ko.H} rx={Ko.RADIUS} />
        </clipPath>
        <pattern id={holes} width={11} height={11} patternUnits="userSpaceOnUse" x={Ko.W * 0.66} y={Ko.PORTS}>
          <circle cx={5.5} cy={5.5} r={3.4} style={{ fill: v('grille-hole') }} />
        </pattern>
      </defs>
      {/* The body over its edge. */}
      <rect x={Ko.EDGE_X} y={Ko.EDGE_Y} width={Ko.W} height={Ko.H} rx={Ko.RADIUS} style={{ fill: v('edge') }} />
      <rect width={Ko.W} height={Ko.H} rx={Ko.RADIUS} style={{ fill: v('body') }} />
      <g clip-path={`url(#${clip})`}>
        <Ports />
        <Top holes={holes} />
        <Screen mode={props.keymap?.mode ?? null} />
        <Labels />
        {[...RECTS].filter(([k]) => !KNOBS.has(k)).map(([k, r]) => (
          <g key={k} class={dimClass(k)}>
            <Key k={k} r={r} />
          </g>
        ))}
        {[...KNOBS].map((k) => (
          <g key={k} class={dimClass(k)}>
            <Knob k={k} r={RECTS.get(k)!} />
          </g>
        ))}
        <Fader dim={dimClass('SLIDER')} />
        <Outlines lit={lit} />
        <Badges lit={lit} />
      </g>
    </svg>
  )
}

/** OUTPUT, INPUT, SYNC · MIDI, USB and POWER along the top edge. */
function Ports(): JSX.Element {
  const cols = [0.06, 0.13, 0.08, 0.09, 0.19, 0.13, 0.09]
  const xs = [0]
  for (const c of cols) xs.push(xs[xs.length - 1]! + c * Ko.W)
  const [output, input, sync, usb, power] = PORTS as [string, string, string, string, string]
  const port = (i: number, label: string, face: string, ink: string): JSX.Element => (
    <g key={i}>
      <rect x={xs[i]} width={xs[i + 1]! - xs[i]!} height={Ko.PORTS} style={{ fill: face }} />
      <T x={(xs[i]! + xs[i + 1]!) / 2} y={mid(Ko.PORTS / 2, 8.5)} size={8.5} fill={ink} spacing={0.1}>
        {label.toUpperCase()}
      </T>
    </g>
  )
  return (
    <g>
      <rect width={Ko.W} height={Ko.PORTS} style={{ fill: v('panel') }} />
      {port(1, output, v('port-light'), v('port-light-ink'))}
      {port(3, input, 'var(--signal)', 'var(--on-signal)')}
      {port(4, sync, v('port-dark'), v('port-dark-ink'))}
      {port(6, usb, v('grey-face'), v('grey-ink'))}
      <T x={Ko.W - 10} y={mid(Ko.PORTS / 2, 8.5)} size={8.5} fill={v('port-ink')} spacing={0.1} anchor="end">
        {power.toUpperCase()}
      </T>
    </g>
  )
}

/** The cream panel with its rule, and the speaker grille. */
function Top(props: { holes: string }): JSX.Element {
  const y = Ko.PORTS
  const grille = Ko.W * 0.34
  const panelW = Ko.W - grille
  return (
    <g>
      <rect y={y} width={panelW} height={Ko.TOP} style={{ fill: v('panel') }} />
      <rect x={14} y={y + Ko.TOP - 12} width={panelW * 0.46} height={2} style={{ fill: v('label'), opacity: 0.18 }} />
      <rect x={panelW} y={y} width={grille} height={Ko.TOP} style={{ fill: v('grille') }} />
      <rect x={panelW} y={y} width={grille} height={Ko.TOP} fill={`url(#${props.holes})`} />
    </g>
  )
}

/** The display: the mode's name, three digits and the group. */
function Screen(props: { mode: string | null }): JSX.Element {
  const y = Ko.PORTS + Ko.TOP
  const cy = y + Ko.SCREEN / 2
  const tag = (props.mode ?? panelLabel('SOUND')).toUpperCase()
  const digits = (['P1', 'P2', 'P3'] as const).map(panelLabel).join(' ')
  const group = panelLabel('A')
  const tagW = textWidth(tag, 11, 700, 0.12) + 12
  const digitsW = textWidth(digits, 34, 400, 0.12, true)
  const groupW = textWidth(group, 11, 500, 0.1) + 10
  let x = (Ko.W - (tagW + digitsW + groupW + 36)) / 2
  const tagX = x
  x += tagW + 18
  const digitsX = x
  x += digitsW + 18
  const groupX = x
  return (
    <g>
      <rect y={y} width={Ko.W} height={Ko.SCREEN} style={{ fill: v('screen') }} />
      <rect x={tagX} y={cy - 10} width={tagW} height={20} rx={3} style={{ fill: v('screen-tag') }} />
      <T x={tagX + tagW / 2} y={mid(cy, 11)} size={11} weight={700} spacing={0.12} fill={v('screen-tag-ink')}>
        {tag}
      </T>
      <T x={digitsX} y={mid(cy, 34)} size={34} weight={400} spacing={0.12} mono fill={v('screen-ink')} anchor="start">
        {digits}
      </T>
      <rect x={groupX} y={cy - 10} width={groupW} height={20} rx={3} class="ko__group" />
      <T x={groupX + groupW / 2} y={mid(cy, 11)} size={11} spacing={0.1} fill="var(--signal)">
        {group}
      </T>
    </g>
  )
}

/** Which LEDs are lit, as on the device mid-song: by column, per LED row. */
const LEDS_ON: readonly (readonly number[])[] = [[1, 4], [2, 3], [], [3, 6]]

/** VOLUME, BPM and METRONOME over the knobs; the LEDs and their labels; the X and Y tags. */
function Labels(): JSX.Element {
  const out: JSX.Element[] = []
  for (const k of KNOBS) {
    const col = k === 'VOL' ? 0 : k === 'X' ? 5 : 6
    const label = knobLabel(k)
    if (label !== null) {
      out.push(
        <T key={`k${k}`} x={colX(col) + colW(col) / 2} y={mid(rowY(0) + Ko.LABEL / 2, 9.5)} size={9.5} spacing={0.06} fill={v('label')}>
          {label.toUpperCase()}
        </T>,
      )
    }
  }
  LED_ROWS.forEach((words, r) => {
    const cy = rowY(2 + 2 * r) + Ko.LABEL / 2
    for (let col = 1; col <= 4; col++) {
      const x = colX(col) + colW(col) * 0.22
      out.push(<Led key={`l${r}:${col}`} cx={x + 3} cy={cy} on={LEDS_ON[r]!.includes(col)} />)
      if (col > 1) {
        out.push(
          <T key={`w${r}:${col}`} x={x + 12} y={mid(cy, 9.5)} size={9.5} spacing={0.06} fill={v('label')} anchor="start">
            {words[col - 2]!.toUpperCase()}
          </T>,
        )
      }
    }
    if (r === 3) for (const col of [5, 6]) out.push(<Led key={`l${r}:${col}`} cx={colX(col) + colW(col) / 2} cy={cy} on={LEDS_ON[r]!.includes(col)} />)
  })
  const cy = rowY(2) + Ko.LABEL / 2
  out.push(<XyTag key="x" t={panelLabel('X')} cx={colX(5) + Ko.UNIT / 2} cy={cy} face="var(--signal)" />)
  out.push(<XyTag key="y" t={panelLabel('Y')} cx={colX(6) + Ko.UNIT / 2} cy={cy} face={v('y-tag')} />)
  return <g>{out}</g>
}

function Led(props: { cx: number; cy: number; on: boolean }): JSX.Element {
  return (
    <g>
      {props.on && <circle cx={props.cx} cy={props.cy} r={5.5} style={{ fill: v('led-on'), opacity: 0.3 }} />}
      <circle cx={props.cx} cy={props.cy} r={3} style={{ fill: props.on ? v('led-on') : v('led-off') }} />
    </g>
  )
}

function XyTag(props: { t: string; cx: number; cy: number; face: string }): JSX.Element {
  const w = textWidth(props.t, 10, 800) + 10
  return (
    <g>
      <rect x={props.cx - w / 2} y={props.cy - 7} width={w} height={14} rx={3} style={{ fill: props.face }} />
      <T x={props.cx} y={mid(props.cy, 10)} size={10} weight={800} fill="var(--on-signal)">
        {props.t}
      </T>
    </g>
  )
}

/** A cap: [face] over [edge] offset 2 right and 3 down. */
function Cap(props: { r: Rect; face: string; edge: string }): JSX.Element {
  const { r } = props
  return (
    <>
      <rect x={r.x + 2} y={r.y + 3} width={r.w} height={r.h} rx={Ko.KEY_R} style={{ fill: props.edge }} />
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={Ko.KEY_R} style={{ fill: props.face }} />
    </>
  )
}

const DARK = [v('dark-face'), v('dark-edge'), v('dark-ink')] as const
const LIGHT = [v('light-face'), v('light-edge'), v('light-ink')] as const
const SIGNAL = ['var(--signal)', 'var(--signal-edge)', 'var(--on-signal)'] as const
const GREY = [v('grey-face'), v('grey-edge'), v('grey-ink')] as const

function Key(props: { k: PanelKey; r: Rect }): JSX.Element {
  const { k, r } = props
  switch (k) {
    case 'SOUND':
      return <Split k={k} r={r} c={DARK} lower={v('light-face')} lowerInk={v('tier-ink')} />
    case 'MAIN':
      return <Split k={k} r={r} c={DARK} lower="var(--signal)" lowerInk="var(--on-signal)" />
    case 'TEMPO':
      return <Split k={k} r={r} c={DARK} lower={v('loop-face')} lowerInk="var(--on-signal)" />
    case 'SAMPLE':
      return <Split k={k} r={r} c={SIGNAL} lower={v('light-face')} lowerInk={v('tier-ink')} />
    case 'TIMING':
    case 'FX':
      return <Split k={k} r={r} c={DARK} lower={v('light-face')} lowerInk={v('tier-ink')} />
    case 'ERASE':
      return <Split k={k} r={r} c={[v('light-face'), v('light-edge'), v('tier-ink')]} lower={v('light-face')} lowerInk={v('tier-ink')} rule />
    case 'KEYS':
    case 'FADER':
      return <Wide k={k} r={r} c={DARK} />
    case 'SHIFT':
      return <Wide k={k} r={r} c={LIGHT} />
    case 'A':
    case 'B':
    case 'C':
    case 'D':
      return <Group k={k} r={r} />
    case 'MINUS':
    case 'PLUS':
      return <Sign r={r} plus={k === 'PLUS'} />
    case 'ENTER':
      return <Word k={k} r={r} c={DARK} />
    case 'REC':
      return <Word k={k} r={r} c={SIGNAL} />
    case 'PLAY':
      return <Word k={k} r={r} c={GREY} />
    default:
      return <Pad k={k} r={r} />
  }
}

type Colours = readonly [string, string, string]

/** A number pad: the digit in its top-left corner (the dot drawn as one). */
function Pad(props: { k: PanelKey; r: Rect }): JSX.Element {
  const { k, r } = props
  return (
    <>
      <Cap r={r} face={DARK[0]} edge={DARK[1]} />
      {k === 'DOT' ? (
        <circle cx={r.x + 12} cy={r.y + 17} r={2.2} style={{ fill: DARK[2] }} />
      ) : (
        <T x={r.x + 8} y={below(r.y + 4, 18)} size={18} fill={DARK[2]} anchor="start">
          {panelLabel(k)}
        </T>
      )}
    </>
  )
}

/** ENTER, RECORD and PLAY: pad-sized, their word small in the corner. */
function Word(props: { k: PanelKey; r: Rect; c: Colours }): JSX.Element {
  const { r, c } = props
  return (
    <>
      <Cap r={r} face={c[0]} edge={c[1]} />
      <T x={r.x + 8} y={below(r.y + 7, 11)} size={11} spacing={0.06} fill={c[2]} anchor="start">
        {panelLabel(props.k).toUpperCase()}
      </T>
    </>
  )
}

/** KEYS, FADER and SHIFT: short wide keys in the first column. */
function Wide(props: { k: PanelKey; r: Rect; c: Colours }): JSX.Element {
  const { r, c } = props
  return (
    <>
      <Cap r={r} face={c[0]} edge={c[1]} />
      <T x={r.x + r.w / 2} y={mid(r.y + r.h / 2, 9.5)} size={9.5} spacing={0.08} fill={c[2]}>
        {panelLabel(props.k).toUpperCase()}
      </T>
    </>
  )
}

/** A two-tier key: its own word on the upper face, the shifted one on the lower. */
function Split(props: { k: PanelKey; r: Rect; c: Colours; lower: string; lowerInk: string; rule?: boolean }): JSX.Element {
  const { k, r, c } = props
  const m = r.y + r.h / 2
  const b = r.y + r.h
  const R = Ko.KEY_R
  const sub = panelSub(k)
  return (
    <>
      <Cap r={r} face={c[0]} edge={c[1]} />
      <path
        d={`M${r.x} ${m}H${r.x + r.w}V${b - R}A${R} ${R} 0 0 1 ${r.x + r.w - R} ${b}H${r.x + R}A${R} ${R} 0 0 1 ${r.x} ${b - R}Z`}
        style={{ fill: props.lower }}
      />
      {props.rule && <rect x={r.x} y={m} width={r.w} height={1} style={{ fill: v('tier-line') }} />}
      <T x={r.x + r.w / 2} y={mid((r.y + m) / 2, 9.5)} size={9.5} spacing={0.08} fill={c[2]}>
        {panelLabel(k).toUpperCase()}
      </T>
      {sub !== null && (
        <T x={r.x + r.w / 2} y={mid((m + b) / 2, 9.5)} size={9.5} spacing={0.08} fill={props.lowerInk}>
          {sub.toUpperCase()}
        </T>
      )}
    </>
  )
}

/** The glyph printed under a group key's letter, in a 12-unit box: A ✳ (fill), B ↩ (repeat), C ⤒ (copy), D ↓ (paste). */
const GLYPHS: Readonly<Record<'A' | 'B' | 'C' | 'D', string>> = {
  A: 'M6 1.5V10.5M1.5 6H10.5M2.8 2.8L9.2 9.2M9.2 2.8L2.8 9.2',
  B: 'M10 2V7H2M2 7L4.5 4.5M2 7L4.5 9.5',
  C: 'M2 1.5H10M6 11V4M6 4L3.5 6.5M6 4L8.5 6.5',
  D: 'M6 1.5V10.5M6 10.5L3.5 8M6 10.5L8.5 8',
}

/** A group key: its letter in the corner and its function's glyph under it. */
function Group(props: { k: 'A' | 'B' | 'C' | 'D'; r: Rect }): JSX.Element {
  const { k, r } = props
  return (
    <>
      <Cap r={r} face={LIGHT[0]} edge={LIGHT[1]} />
      <T x={r.x + 8} y={below(r.y + 4, 18)} size={18} fill={LIGHT[2]} anchor="start">
        {panelLabel(k)}
      </T>
      <path class="ko__glyph" transform={`translate(${r.x + 8} ${r.y + r.h - 18})`} d={GLYPHS[k]} />
    </>
  )
}

/** − and +, pale and pad-sized, the sign drawn in the middle. */
function Sign(props: { r: Rect; plus: boolean }): JSX.Element {
  const { r } = props
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  return (
    <>
      <Cap r={r} face={LIGHT[0]} edge={LIGHT[1]} />
      <path class="ko__sign" d={`M${cx - 7} ${cy}H${cx + 7}${props.plus ? `M${cx} ${cy - 7}V${cy + 7}` : ''}`} />
    </>
  )
}

/** VOLUME (white), X (orange) and Y (black): a skirt and a raised cap, each over its own offset edge. */
function Knob(props: { k: PanelKey; r: Rect }): JSX.Element {
  const { r } = props
  const name = props.k === 'VOL' ? 'white' : props.k === 'X' ? 'orange' : 'black'
  const u = r.w / 100
  const at = (x: number, y: number): { cx: number; cy: number } => ({ cx: r.x + x * u, cy: r.y + y * u })
  return (
    <>
      <circle {...at(53, 55)} r={45 * u} style={{ fill: v(`knob-${name}-edge`) }} />
      <circle {...at(50, 50)} r={45 * u} style={{ fill: v(`knob-${name}`) }} />
      <circle {...at(50, 50)} r={38 * u} style={{ fill: 'none', stroke: v(`knob-${name}-edge`), strokeOpacity: 0.35, strokeWidth: 1.5 * u }} />
      <circle {...at(51.5, 52.5)} r={25 * u} style={{ fill: v(`knob-${name}-cap-edge`) }} />
      <circle {...at(49, 48)} r={25 * u} style={{ fill: v(`knob-${name}-cap`) }} />
    </>
  )
}

/** The fader: a black slot and its round grey knob. */
function Fader(props: { dim: string }): JSX.Element {
  const s = FADER_SLOT
  const k = FADER_KNOB
  const cx = k.x + k.w / 2
  const cy = k.y + k.h / 2
  return (
    <g>
      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={4} style={{ fill: v('fader-track') }} />
      <g class={props.dim}>
        <circle cx={cx + 1} cy={cy + 2} r={15} style={{ fill: v('fader-edge') }} />
        <circle cx={cx} cy={cy} r={15} style={{ fill: v('loop-face') }} />
      </g>
    </g>
  )
}

/** A signal outline around each lit key's face, 3 units wide and 4.5 off it; a ring around a lit knob or the fader's knob. */
function Outlines(props: { lit: Lit }): JSX.Element {
  const g = 4.5
  return (
    <g class="ko__outlines">
      {[...props.lit.spots].map((spot) => {
        const r = rectOf(spot)
        if (spot === 'SLIDER' || KNOBS.has(spot)) {
          return <circle key={spot} cx={r.x + r.w / 2} cy={r.y + r.h / 2} r={r.w / 2 + g} />
        }
        return <rect key={spot} x={r.x - g} y={r.y - g} width={r.w + 2 * g} height={r.h + 2 * g} rx={Ko.KEY_R + g} />
      })}
    </g>
  )
}

/** "1 HOLD" over a key's top-right corner, in the hold colours for a held key and signal orange otherwise. */
function Badges(props: { lit: Lit }): JSX.Element {
  return (
    <g>
      {[...props.lit.badges].map(([spot, b]) => {
        const r = rectOf(spot)
        const label = badgeLabel(b)
        const hold = b.kind === 'HOLD'
        const w = Math.max(22, textWidth(label, 11, 800, 0.04) + 12)
        const right = Math.min(r.x + r.w + 10, Ko.W - 4)
        const top = r.y - 12
        return (
          <g key={spot} class={hold ? 'ko__badge ko__badge--hold' : 'ko__badge'}>
            <rect x={right - w} y={top} width={w} height={22} rx={11} />
            <T x={right - w / 2} y={mid(top + 11, 11)} size={11} weight={800} spacing={0.04} fill="var(--ko-badge-ink)">
              {label}
            </T>
          </g>
        )
      })}
    </g>
  )
}
