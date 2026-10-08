// Port of core/src/main/kotlin/dev/arc/ep133/features/FxSettings.kt
//
// A project's FX: the master effect with its two knobs, each group's send to
// it, the master compressor and the sidechain (an addition), kept in arc by
// project; how each effect hears its knobs (FxKnobs), what the display says
// about them, and the book of every project's settings as JSON.
//
// Web deltas:
// - The data classes are plain readonly interfaces built by `comp()`,
//   `sidechain()` and `FxSettings.of()` (by named fields over the Kotlin
//   defaults); their methods are functions taking the value first, on the
//   `FxSettings` object (`s.withSend(g, v)` is `FxSettings.withSend(s, g, v)`).
// - The enum class FxType is a const object plus a string-union type of the
//   same name (the values are the enum names); `FX_TYPES` is
//   `FxType.entries` and `fxTypeIndex(t)` its ordinal.
// - Knob values are floats kept with Math.fround (the builders round them),
//   so the mappings and readouts work out as Kotlin's Float math does, and
//   JSON.stringify writes the same exact numbers Kotlin does.
// - FxBook's map is a ReadonlyMap; fromJson reads through JSON.parse, with
//   kotlinx's intOrNull as in pattern.ts.

import { clamp01, knobHz, lerp } from '../formats/fx/fxMath'
import { DEFAULT as DEFAULT_BPM } from './tempo'

const f = Math.fround

/**
 * The master effect, as the EP-133's FX offers them (its index in FX_TYPES
 * is the mixer's control index): one at a time on the send bus, with two
 * knobs, X and Y. COMPRESSOR is the FX slot's own compressor, apart from the
 * master one (Comp).
 */
export const FxType = {
  NONE: 'NONE',
  DELAY: 'DELAY',
  REVERB: 'REVERB',
  DISTORTION: 'DISTORTION',
  CHORUS: 'CHORUS',
  FILTER: 'FILTER',
  COMPRESSOR: 'COMPRESSOR',
} as const
export type FxType = (typeof FxType)[keyof typeof FxType]

/** FxType.entries, in declaration order. */
export const FX_TYPES: readonly FxType[] = [
  FxType.NONE,
  FxType.DELAY,
  FxType.REVERB,
  FxType.DISTORTION,
  FxType.CHORUS,
  FxType.FILTER,
  FxType.COMPRESSOR,
]

/** The Kotlin ordinal: the mixer's control index. */
export function fxTypeIndex(t: FxType): number {
  return FX_TYPES.indexOf(t)
}

/** The master compressor, after everything: [on], its drive [x] and its speed [y] (0..1). */
export interface Comp {
  readonly on: boolean
  readonly x: number
  readonly y: number
}

export function comp(fields: Partial<Comp> = {}): Comp {
  const c = { on: false, x: 0.5, y: 0.5, ...fields }
  return { on: c.on, x: f(c.x), y: f(c.y) }
}

/**
 * The sidechain (an addition to the EP-133's FX page): while [on], the pad
 * at [pad] (0..11) of [group] (0..3) ducks the groups in [dests] (a bitmask,
 * bit g for group g); [x] is how long the duck lasts and [y] its shape (0..1).
 */
export interface Sidechain {
  readonly on: boolean
  readonly group: number
  readonly pad: number
  readonly dests: number
  readonly x: number
  readonly y: number
}

export function sidechain(fields: Partial<Sidechain> = {}): Sidechain {
  const s = { on: false, group: 0, pad: 0, dests: 0, x: 0.3, y: 0.5, ...fields }
  return { on: s.on, group: s.group, pad: s.pad, dests: s.dests, x: f(s.x), y: f(s.y) }
}

/**
 * A project's FX: the master effect [type] with its knobs [x] and [y] (0..1),
 * each group's send to it ([sends], A..D, 0..1), the master compressor and
 * the sidechain. They stay in arc (the EP-133's own FX settings aren't read
 * or written); the mixer plays them (FxKnobs says how each knob is heard).
 * DEFAULT is no effect, no sends, nothing on: the mixer as it was before FX.
 */
export interface FxSettings {
  readonly type: FxType
  readonly x: number
  readonly y: number
  readonly sends: readonly number[]
  readonly comp: Comp
  readonly sidechain: Sidechain
}

/** The send groups, A..D. */
const GROUPS = 4
/** Sidechain.dests with every group. */
const ALL_GROUPS = (1 << GROUPS) - 1

/** Settings: [fields] over the defaults (Kotlin's FxSettings constructor). */
function of(fields: Partial<FxSettings> = {}): FxSettings {
  const s = { type: FxType.NONE as FxType, x: 0.5, y: 0.5, sends: [0, 0, 0, 0], comp: comp(), sidechain: sidechain(), ...fields }
  return { type: s.type, x: f(s.x), y: f(s.y), sends: s.sends.map(f), comp: s.comp, sidechain: s.sidechain }
}

const DEFAULT: FxSettings = of()

const coerceIn = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/** Every knob and send held to 0..1 (NaN to 0), four sends, the sidechain's pad, group and groups in range. */
function clamped(s: FxSettings): FxSettings {
  const sc = s.sidechain
  return {
    type: s.type,
    x: clamp01(f(s.x)),
    y: clamp01(f(s.y)),
    sends: Array.from({ length: GROUPS }, (_, g) => clamp01(f(s.sends[g] ?? 0))),
    comp: { on: s.comp.on, x: clamp01(f(s.comp.x)), y: clamp01(f(s.comp.y)) },
    sidechain: {
      on: sc.on,
      group: coerceIn(sc.group, 0, GROUPS - 1),
      pad: coerceIn(sc.pad, 0, 11),
      dests: sc.dests & ALL_GROUPS,
      x: clamp01(f(sc.x)),
      y: clamp01(f(sc.y)),
    },
  }
}

/** Another effect; the knobs stay where they are. */
function withType(s: FxSettings, t: FxType): FxSettings {
  return { ...s, type: t }
}

function withXY(s: FxSettings, x: number, y: number): FxSettings {
  return { ...s, x: clamp01(f(x)), y: clamp01(f(y)) }
}

/** Group [g]'s send at [v] (0..1). */
function withSend(s: FxSettings, g: number, v: number): FxSettings {
  return { ...s, sends: s.sends.map((old, i) => (i === g ? clamp01(f(v)) : old)) }
}

function withComp(s: FxSettings, c: Comp): FxSettings {
  return { ...s, comp: c }
}

function withSidechain(s: FxSettings, c: Sidechain): FxSettings {
  return { ...s, sidechain: c }
}

const X_LABELS: Readonly<Record<FxType, string>> = {
  NONE: '',
  DELAY: 'LENGTH',
  REVERB: 'SIZE',
  DISTORTION: 'DRIVE',
  CHORUS: 'RATE',
  FILTER: 'CUTOFF',
  COMPRESSOR: 'DRIVE',
}

const Y_LABELS: Readonly<Record<FxType, string>> = {
  NONE: '',
  DELAY: 'FEEDBACK',
  REVERB: 'COLOR',
  DISTORTION: 'COLOR',
  CHORUS: 'FEEDBACK',
  FILTER: 'RESO',
  COMPRESSOR: 'SPEED',
}

/** The name over the X knob for [type] ('' for none). */
function xLabel(type: FxType): string {
  return X_LABELS[type]
}

/** The name over the Y knob for [type] ('' for none). */
function yLabel(type: FxType): string {
  return Y_LABELS[type]
}

/**
 * What the X knob at [x] does to [type], as the display shows it: the
 * delay's division ('1/8D'), the filter's cutoff ('LPF 1.2k', 'OPEN',
 * 'HPF 400'), the drive ('12.3x'), the reverb's size ('64%'), the chorus's
 * rate ('0.42 Hz'). [bpm] is the tempo the delay follows; its division reads
 * the same at any tempo.
 */
function xReadout(type: FxType, x: number, bpm: number = DEFAULT_BPM): string {
  const k = clamp01(f(x))
  switch (type) {
    case FxType.NONE:
      return ''
    case FxType.DELAY:
      return (DELAY_DIVISIONS[delayDivision(k)] as Division).name
    case FxType.REVERB:
      return `${Math.round(f(k * 100))}%`
    case FxType.DISTORTION:
      return times(distortionDrive(k))
    case FxType.CHORUS:
      return `${hundredths(chorusRateHz(k))} Hz`
    case FxType.FILTER: {
      const zone = filterZone(k)
      if (zone === LPF) return `LPF ${hz(filterLpfHz(k))}`
      if (zone === HPF) return `HPF ${hz(filterHpfHz(k))}`
      return 'OPEN'
    }
    case FxType.COMPRESSOR:
      return times(compDrive(k))
  }
}

/**
 * What the Y knob at [y] does to [type]: the feedback ('45%'), the reverb's
 * tilt ('DARK 40', 'FLAT', 'BRIGHT 20'), the distortion's colour ('LP 40',
 * 'OPEN', 'HP 20'), the filter's Q ('Q 2.3'), the compressor's attack and
 * release in ms ('0.5/40').
 */
function yReadout(type: FxType, y: number): string {
  const k = clamp01(f(y))
  // From the centre: -100 (all the way down) to 100 (all the way up).
  const tilt = Math.round(f(f(k - 0.5) * 200))
  switch (type) {
    case FxType.NONE:
      return ''
    case FxType.DELAY:
      return `${Math.round(f(delayFeedback(k) * 100))}%`
    case FxType.REVERB:
      return tilt < 0 ? `DARK ${-tilt}` : tilt > 0 ? `BRIGHT ${tilt}` : 'FLAT'
    case FxType.DISTORTION:
      return tilt < 0 ? `LP ${-tilt}` : tilt > 0 ? `HP ${tilt}` : 'OPEN'
    case FxType.CHORUS:
      return `${Math.round(f(chorusDepth(k) * 100))}%`
    case FxType.FILTER:
      return `Q ${tenths(filterQ(k))}`
    case FxType.COMPRESSOR:
      return (COMP_SPEEDS[compSpeed(k)] as Speed).name
  }
}

/** [v] (0 or more) to one decimal: '2.5'. */
function tenths(v: number): string {
  const t = Math.round(f(v * 10))
  return `${Math.trunc(t / 10)}.${t % 10}`
}

/** [v] (0 or more) to two decimals: '0.42'. */
function hundredths(v: number): string {
  const h = Math.round(f(v * 100))
  return `${Math.trunc(h / 100)}.${String(h % 100).padStart(2, '0')}`
}

/** A gain as '2.5x', whole from 10 up ('40x'). */
function times(v: number): string {
  return Math.round(f(v * 10)) < 100 ? `${tenths(v)}x` : `${Math.round(v)}x`
}

/** A frequency as '400', '1.2k', whole kHz from 10k up ('12k'). */
function hz(v: number): string {
  const r = Math.round(v)
  if (r < 1000) return `${r}`
  const t = Math.round(f(v / 100))
  return t < 100 ? `${Math.trunc(t / 10)}.${t % 10}k` : `${Math.round(f(v / 1000))}k`
}

/** The Kotlin `FxSettings` (with its companion). */
export const FxSettings = {
  GROUPS,
  ALL_GROUPS,
  DEFAULT,
  of,
  clamped,
  withType,
  withXY,
  withSend,
  withComp,
  withSidechain,
  xLabel,
  yLabel,
  xReadout,
  yReadout,
} as const

// ---------- FxKnobs ----------

/** A delay length: [num]/[den] of a beat (a quarter note). */
export interface Division {
  readonly name: string
  readonly num: number
  readonly den: number
}

const division = (name: string, num: number, den: number): Division => ({ name, num, den })

/** The delay's tempo-synced lengths, shortest first: X picks one of twelve. */
const DELAY_DIVISIONS: readonly Division[] = [
  division('1/32', 1, 8),
  division('1/16T', 1, 6),
  division('1/16', 1, 4),
  division('1/8T', 1, 3),
  division('1/16D', 3, 8),
  division('1/8', 1, 2),
  division('1/4T', 2, 3),
  division('1/8D', 3, 4),
  division('1/4', 1, 1),
  division('1/2T', 4, 3),
  division('1/4D', 3, 2),
  division('1/2', 2, 1),
]

/** The compressor's attack and release, in ms: Y picks one of eight, fast to slow. */
export interface Speed {
  readonly name: string
  readonly attackMs: number
  readonly releaseMs: number
}

const speed = (name: string, attackMs: number, releaseMs: number): Speed => ({ name, attackMs, releaseMs })

const COMP_SPEEDS: readonly Speed[] = [
  speed('0.5/40', 0.5, 40),
  speed('1/60', 1, 60),
  speed('2/100', 2, 100),
  speed('5/150', 5, 150),
  speed('10/200', 10, 200),
  speed('15/300', 15, 300),
  speed('20/400', 20, 400),
  speed('30/600', 30, 600),
]

/** filterZone's answers: low-pass below LPF_TOP, high-pass above HPF_BOTTOM, open between. */
const LPF = -1
const OPEN = 0
const HPF = 1
const LPF_TOP = f(0.47)
const HPF_BOTTOM = f(0.53)

/** The delay's DELAY_DIVISIONS index for X. */
function delayDivision(x: number): number {
  return Math.min(11, Math.trunc(f(clamp01(x) * 12)))
}

/** The delay's feedback for Y: 0..0.95. */
function delayFeedback(y: number): number {
  return f(f(0.95) * y)
}

/** The reverb's comb feedback for X: 0.70..0.98. */
function reverbFeedback(x: number): number {
  return lerp(f(0.7), f(0.98), x)
}

/** The distortion's drive for X: 1 + 39x², 1..40. */
function distortionDrive(x: number): number {
  return f(1 + f(f(39 * x) * x))
}

/** The chorus's LFO rate for X, in Hz: 0.05..5 on the knob's cubic curve. */
function chorusRateHz(x: number): number {
  return knobHz(x, f(0.05), 5)
}

/** The chorus's depth and feedback for Y: 0..0.7. */
function chorusDepth(y: number): number {
  return f(f(0.7) * y)
}

/** Which way the filter goes at X: LPF, OPEN or HPF. */
function filterZone(x: number): number {
  return x < LPF_TOP ? LPF : x > HPF_BOTTOM ? HPF : OPEN
}

/** The low-pass cutoff in the LPF zone: 60 Hz at X = 0 up to 20 kHz at LPF_TOP. */
function filterLpfHz(x: number): number {
  return knobHz(f(x / LPF_TOP), 60, 20000)
}

/** The high-pass cutoff in the HPF zone: 20 Hz at HPF_BOTTOM up to 8 kHz at X = 1. */
function filterHpfHz(x: number): number {
  return knobHz(f(f(x - HPF_BOTTOM) / f(1 - HPF_BOTTOM)), 20, 8000)
}

/** The filter's Q for Y: 0.5..8. */
function filterQ(y: number): number {
  return lerp(0.5, 8, y)
}

/** The compressor's input drive for X: 1 + 7x², 1..8. */
function compDrive(x: number): number {
  return f(1 + f(f(7 * x) * x))
}

/** The compressor's COMP_SPEEDS index for Y. */
function compSpeed(y: number): number {
  return Math.min(7, Math.trunc(f(clamp01(y) * 8)))
}

/**
 * How each effect hears its knobs (0..1), shared by the readouts above and
 * the effects themselves, so what the display says is what plays. Float
 * arithmetic in Kotlin's order, each step through Math.fround.
 */
export const FxKnobs = {
  DELAY_DIVISIONS,
  COMP_SPEEDS,
  LPF,
  OPEN,
  HPF,
  LPF_TOP,
  HPF_BOTTOM,
  delayDivision,
  delayFeedback,
  reverbFeedback,
  distortionDrive,
  chorusRateHz,
  chorusDepth,
  filterZone,
  filterLpfHz,
  filterHpfHz,
  filterQ,
  compDrive,
  compSpeed,
} as const

// ---------- FxBook ----------

/**
 * Every project's FxSettings, by project number (0..99), kept in arc's
 * settings as JSON: {"v":1,"projects":[{"project":n,"type":"DELAY",...}]}.
 * Knob values are written as the exact numbers their floats are, so this
 * writes the same text as the Kotlin twin.
 */
function toJson(map: ReadonlyMap<number, FxSettings>): string {
  const projects = [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([project, raw]) => {
      const s = clamped(raw)
      const sc = s.sidechain
      return {
        project,
        type: s.type,
        x: s.x,
        y: s.y,
        sends: s.sends,
        comp: { on: s.comp.on, x: s.comp.x, y: s.comp.y },
        sidechain: { on: sc.on, group: sc.group, pad: sc.pad, dests: sc.dests, x: sc.x, y: sc.y },
      }
    })
  return JSON.stringify({ v: 1, projects })
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A whole number written as a number (not a string), in the Int range (kotlinx intOrNull). */
function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= -(2 ** 31) && v <= 2 ** 31 - 1 ? v : null
}

const floatOrNull = (v: unknown): number | null => (typeof v === 'number' ? f(v) : null)

/** [k] read by [read]: [fallback] when it's left out, null when it can't be read. */
function field<T>(o: Record<string, unknown>, k: string, read: (v: unknown) => T | null, fallback: T): T | null {
  return k in o ? read(o[k]) : fallback
}

const boolOrNull = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

/** One project's settings, or null when a field present can't be read. */
function entry(o: Record<string, unknown>): FxSettings | null {
  const d = DEFAULT
  const type = field(o, 'type', (v) => (FX_TYPES as readonly unknown[]).includes(v) ? (v as FxType) : null, d.type)
  if (type === null) return null
  const x = field(o, 'x', floatOrNull, d.x)
  const y = field(o, 'y', floatOrNull, d.y)
  if (x === null || y === null) return null
  let sends: readonly number[] = d.sends
  if ('sends' in o) {
    const list = o['sends']
    if (!Array.isArray(list)) return null
    const read: number[] = []
    for (let g = 0; g < GROUPS; g++) {
      const v = g < list.length ? floatOrNull(list[g]) : 0
      if (v === null) return null
      read.push(v)
    }
    sends = read
  }
  let c = d.comp
  if ('comp' in o) {
    const co = o['comp']
    if (!isObject(co)) return null
    const on = field(co, 'on', boolOrNull, d.comp.on)
    const cx = field(co, 'x', floatOrNull, d.comp.x)
    const cy = field(co, 'y', floatOrNull, d.comp.y)
    if (on === null || cx === null || cy === null) return null
    c = { on, x: cx, y: cy }
  }
  let sc = d.sidechain
  if ('sidechain' in o) {
    const so = o['sidechain']
    if (!isObject(so)) return null
    const ds = d.sidechain
    const on = field(so, 'on', boolOrNull, ds.on)
    const group = field(so, 'group', intOrNull, ds.group)
    const pad = field(so, 'pad', intOrNull, ds.pad)
    const dests = field(so, 'dests', intOrNull, ds.dests)
    const sx = field(so, 'x', floatOrNull, ds.x)
    const sy = field(so, 'y', floatOrNull, ds.y)
    if (on === null || group === null || pad === null || dests === null || sx === null || sy === null) return null
    sc = { on, group, pad, dests, x: sx, y: sy }
  }
  return clamped({ type, x, y, sends, comp: c, sidechain: sc })
}

/**
 * Null when the text is not a version this one can read. A project entry it
 * can't read (no project number in 0..99, an unknown type, a field of the
 * wrong kind) is skipped; a field left out is its default, and numbers out
 * of range are held in it (FxSettings.clamped). A later entry for the same
 * project wins.
 */
function fromJson(text: string): Map<number, FxSettings> | null {
  let o: unknown
  try {
    o = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(o)) return null
  if (intOrNull(o['v']) !== 1) return null
  const out = new Map<number, FxSettings>()
  const list = o['projects']
  for (const e of Array.isArray(list) ? (list as unknown[]) : []) {
    if (!isObject(e)) continue
    const project = intOrNull(e['project'])
    if (project === null || project < 0 || project > 99) continue
    const s = entry(e)
    if (s === null) continue
    out.set(project, s)
  }
  return out
}

/** The Kotlin `FxBook`. */
export const FxBook = { toJson, fromJson } as const
