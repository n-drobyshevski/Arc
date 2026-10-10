// Port of core/src/main/kotlin/dev/arc/ep133/features/Pattern.kt
//
// The EP-133's sequencer, as its guide gives it (96 ticks a beat, 1 to 99
// bars a group), and Live's patterns: 99 a group and up to 99 scenes, kept by
// project in arc and never written to the device. The web has no pattern
// recording yet; this is the core logic only.
//
// Web deltas:
// - The data classes are plain readonly interfaces built by `patternNote()`,
//   `pattern()` and `projectPatterns()` with the Kotlin defaults; their
//   methods are functions taking the value first, on the `Pattern`,
//   `ProjectPatterns` and `Patterns` objects (`p.group(g)` is
//   `ProjectPatterns.group(p, g)`). A note's absent `semitones` is null.
// - Patterns' map and ProjectSeq's banks are ReadonlyMaps; usedPads gives
//   the pads' padKey numbers, as JS Sets have no value equality for objects.
// - Scene and ProjectSeq are built by `scene()` and `projectSeq()` (Kotlin's
//   `ProjectSeq(...)`, which leaves blank patterns out); their members are on
//   the `Scene` and `ProjectSeq` objects. The Kotlin compares them with data
//   class equals; here samePattern and sameSeq compare them field by field.
// - Timing is a string union of the Kotlin enum's `id` ('off', '1/1' ...
//   '1/32'): `timing.id` is `timing`, `timing.ticks` is `timingTicks(timing)`,
//   `timing.swings` is `timingSwings(timing)`, `timing.swingOffset(k, s)` is
//   `swingOffset(timing, k, s)` and `timing.quantize(t, s)` is
//   `quantize(timing, t, s)` (the swing defaulting to 50, so it is also
//   `timing.quantize(t)`); `Timing.entries` is TIMINGS and
//   `Timing.intervals` TIMING_INTERVALS.
// - TimingSettings is a plain readonly interface built by
//   `TimingSettings.of()`, with its methods on the `TimingSettings` object
//   (`s.record` is `TimingSettings.record(s)`).
// - fromJson reads through JSON.parse, with kotlinx's intOrNull as in
//   offlinePads.

import { padKey } from './padNotes'
import { BEATS_PER_BAR } from './tempo'

/** The EP-133's sequencer, as its guide gives it: 96 ticks a beat, 1 to 99 bars a group. */
export const Seq = {
  PPQN: 96,
  TICKS_PER_BAR: 96 * BEATS_PER_BAR,
  DEFAULT_BARS: 1,
  MAX_BARS: 99,
  /** The longest a pattern grows to while recording with AUTO length (an addition). */
  MAX_AUTO_BARS: 8,
  /** Notes a group's pattern holds; more are ignored. */
  MAX_NOTES: 2048,
  /** The lengths offered first, as bars. */
  LENGTHS: Object.freeze([1, 2, 4, 8]) as readonly number[],
  /** The patterns a group's bank holds (numbered from 1), and the scenes a project holds. */
  MAX_PATTERNS: 99,
  MAX_SCENES: 99,
} as const

/**
 * A note in a group's pattern: at [tick] from the pattern's start, on the pad
 * at [offset] (0..11, as in PhysicalPad), for [gate] ticks (at least 1).
 * [semitones] is null for a pad hit and the note's distance from
 * Keys.ROOT_NOTE for a KEYS note played on that pad. [id] tells notes apart
 * while arc runs (a held note's release, a pass to skip); it isn't saved,
 * and notes read back have 0.
 */
export interface PatternNote {
  readonly tick: number
  readonly offset: number
  readonly gate: number
  readonly semitones: number | null
  readonly velocity: number
  readonly id: number
}

export function patternNote(tick: number, offset: number, gate: number, semitones: number | null = null, velocity = 127, id = 0): PatternNote {
  return { tick, offset, gate, semitones, velocity, id }
}

/**
 * A group's pattern: [bars] long, looping, with its [notes] in the order they
 * were recorded. Notes past the end (the length made shorter) are kept but
 * not played, as on the device. [open] while it is recorded with AUTO length
 * and its end isn't known yet: it doesn't loop, and grows as the recording
 * goes on. A pattern plays whatever sound is on its pads.
 */
export interface Pattern {
  readonly bars: number
  readonly notes: readonly PatternNote[]
  readonly open: boolean
}

export function pattern(bars: number = Seq.DEFAULT_BARS, notes: readonly PatternNote[] = [], open = false): Pattern {
  return { bars, notes, open }
}

function lengthTicks(p: Pattern): number {
  return p.bars * Seq.TICKS_PER_BAR
}

function patternIsEmpty(p: Pattern): boolean {
  return p.notes.length === 0
}

/** The notes that play, in tick order. */
function playable(p: Pattern): PatternNote[] {
  const len = lengthTicks(p)
  // Array.prototype.sort is stable, as Kotlin's sortedBy.
  return p.notes.filter((n) => n.tick < len).sort((a, b) => a.tick - b.tick)
}

/** The Kotlin `Pattern`'s members. */
export const Pattern = { lengthTicks, isEmpty: patternIsEmpty, playable } as const

/** The patterns playing, one for each group A..D: those the scene gives them (ProjectSeq.playing). */
export interface ProjectPatterns {
  readonly groups: readonly Pattern[]
}

export function projectPatterns(groups: readonly Pattern[] = [pattern(), pattern(), pattern(), pattern()]): ProjectPatterns {
  return { groups }
}

function group(p: ProjectPatterns, g: number): Pattern {
  const out = p.groups[g]
  // Kotlin's groups[g] throws outside 0..3.
  if (out === undefined) throw new RangeError(`Index ${g} out of bounds for length ${p.groups.length}`)
  return out
}

function withGroup(p: ProjectPatterns, g: number, pat: Pattern): ProjectPatterns {
  return { groups: p.groups.map((old, i) => (i === g ? pat : old)) }
}

/** The longest group's length: what a resample of the pattern records. */
function longestTicks(p: ProjectPatterns): number {
  return Math.max(...p.groups.map(lengthTicks))
}

function projectIsEmpty(p: ProjectPatterns): boolean {
  return p.groups.every(patternIsEmpty)
}

/** The pads the notes that play are on (as padKey numbers): the sounds playback needs. */
function usedPads(p: ProjectPatterns): Set<number> {
  const out = new Set<number>()
  p.groups.forEach((pat, g) => {
    for (const n of playable(pat)) out.add(padKey({ group: g, offset: n.offset }))
  })
  return out
}

/** The Kotlin `ProjectPatterns`' members; `p.with(g, pat)` is `ProjectPatterns.with(p, g, pat)`. */
export const ProjectPatterns = { group, with: withGroup, longestTicks, isEmpty: projectIsEmpty, usedPads } as const

/** Whether [a] and [b] are the same pattern (Kotlin's data class equals). */
export function samePattern(a: Pattern, b: Pattern): boolean {
  if (a === b) return true
  return (
    a.bars === b.bars &&
    a.open === b.open &&
    a.notes.length === b.notes.length &&
    a.notes.every((n, i) => {
      const m = b.notes[i]!
      return n.tick === m.tick && n.offset === m.offset && n.gate === m.gate && n.semitones === m.semitones && n.velocity === m.velocity && n.id === m.id
    })
  )
}

/**
 * A scene: the pattern number (1..Seq.MAX_PATTERNS) each group A..D plays,
 * as MAIN picks them on the device.
 */
export interface Scene {
  readonly patterns: readonly number[]
}

export function scene(patterns: readonly number[] = [1, 1, 1, 1]): Scene {
  return { patterns }
}

function sceneWith(s: Scene, group: number, n: number): Scene {
  return { patterns: s.patterns.map((old, i) => (i === group ? n : old)) }
}

const sameScene = (a: Scene, b: Scene): boolean => a.patterns.length === b.patterns.length && a.patterns.every((n, i) => n === b.patterns[i])

/** The Kotlin `Scene`'s members; `s.with(g, n)` is `Scene.with(s, g, n)`. */
export const Scene = { with: sceneWith } as const

/**
 * A project's sequencer, as the device keeps it: each group's bank of
 * patterns ([banks], by pattern number 1..99), and the [scenes] (1 to 99,
 * shown from S01), the one at index [scene] playing. A pattern missing from a
 * bank is blank (a bar, no notes): a bank never holds one, so projects with
 * the same patterns are equal. `projectSeq()` keeps that true, with 4 banks,
 * 1 to 99 scenes and the index on one of them; the default is one scene of
 * patterns 1 and nothing in the banks.
 */
export interface ProjectSeq {
  readonly banks: readonly ReadonlyMap<number, Pattern>[]
  readonly scenes: readonly Scene[]
  readonly scene: number
}

const BLANK = pattern()

/** A project's sequencer with blank patterns left out of the banks, 1 to 99 scenes and [index] held to them. */
export function projectSeq(banks: readonly ReadonlyMap<number, Pattern>[] = [], scenes: readonly Scene[] = [scene()], index = 0): ProjectSeq {
  const b = [0, 1, 2, 3].map(
    (g) => new Map([...(banks[g] ?? new Map<number, Pattern>())].filter(([n, p]) => n >= 1 && n <= Seq.MAX_PATTERNS && !samePattern(p, BLANK))),
  )
  const s = scenes.length === 0 ? [scene()] : scenes.slice(0, Seq.MAX_SCENES)
  return { banks: b, scenes: s, scene: Math.min(Math.max(index, 0), s.length - 1) }
}

/** The scene playing. */
function current(p: ProjectSeq): Scene {
  return p.scenes[p.scene]!
}

/** [group]'s pattern [n]: blank when the bank has none. */
function seqPattern(p: ProjectSeq, group: number, n: number): Pattern {
  const bank = p.banks[group]
  // Kotlin's banks[group] throws outside 0..3.
  if (bank === undefined) throw new RangeError(`Index ${group} out of bounds for length ${p.banks.length}`)
  return bank.get(n) ?? BLANK
}

/** The pattern number the scene playing gives [group]. */
function selected(p: ProjectSeq, group: number): number {
  return current(p).patterns[group]!
}

/** The scene's four patterns: what the recorder and the sequencer work on. */
function playing(p: ProjectSeq): ProjectPatterns {
  return { groups: [0, 1, 2, 3].map((g) => seqPattern(p, g, selected(p, g))) }
}

/** [pp]'s patterns back in the slots the scene playing gives them; a slot is its group's own, so nothing is shared across groups. */
function withPlaying(p: ProjectSeq, pp: ProjectPatterns): ProjectSeq {
  let out = p
  for (let g = 0; g < 4; g++) out = withPattern(out, g, selected(p, g), group(pp, g))
  return out
}

/** [pat] as [group]'s pattern [n] (1..99; another number changes nothing); a blank one leaves the bank. */
function withPattern(p: ProjectSeq, group: number, n: number, pat: Pattern): ProjectSeq {
  if (!Number.isInteger(n) || n < 1 || n > Seq.MAX_PATTERNS || samePattern(seqPattern(p, group, n), pat)) return p
  const bank = new Map(p.banks[group]!)
  if (samePattern(pat, BLANK)) bank.delete(n)
  else bank.set(n, pat)
  return { ...p, banks: p.banks.map((old, g) => (g === group ? bank : old)) }
}

/** Other [scenes], the one at [index] playing (held to them). */
function withScenes(p: ProjectSeq, scenes: readonly Scene[], index: number = p.scene): ProjectSeq {
  return projectSeq(p.banks, scenes, index)
}

/** No pattern has notes, whatever the lengths and scenes. */
function seqIsEmpty(p: ProjectSeq): boolean {
  return p.banks.every((bank) => [...bank.values()].every(patternIsEmpty))
}

/** Whether [a] and [b] are the same project's sequencer (Kotlin's data class equals). */
export function sameSeq(a: ProjectSeq, b: ProjectSeq): boolean {
  if (a === b) return true
  if (a.scene !== b.scene || a.scenes.length !== b.scenes.length || !a.scenes.every((s, i) => sameScene(s, b.scenes[i]!))) return false
  return a.banks.every((bank, g) => {
    const other = b.banks[g]!
    if (bank.size !== other.size) return false
    for (const [n, pat] of bank) {
      const o = other.get(n)
      if (o === undefined || !samePattern(pat, o)) return false
    }
    return true
  })
}

/**
 * The Kotlin `ProjectSeq`'s members; `p.playing()` is `ProjectSeq.playing(p)`,
 * `p.current` is `ProjectSeq.current(p)`.
 */
export const ProjectSeq = {
  DEFAULT: projectSeq(),
  current,
  pattern: seqPattern,
  selected,
  playing,
  withPlaying,
  withPattern,
  withScenes,
  isEmpty: seqIsEmpty,
} as const

/**
 * Every project's sequencer, by project number (1..99; 0 while no project is
 * known, offline with nothing read). Patterns stay in arc: they aren't
 * written to the EP-133.
 */
export interface Patterns {
  readonly projects: ReadonlyMap<number, ProjectSeq>
}

const EMPTY: Patterns = { projects: new Map() }

const blankPattern = (p: Pattern): boolean => patternIsEmpty(p) && p.bars === Seq.DEFAULT_BARS
const blankProject = (p: ProjectSeq): boolean =>
  p.scenes.length === 1 && sameScene(p.scenes[0]!, scene()) && p.banks.every((bank) => [...bank.values()].every(blankPattern))

function of(all: Patterns, project: number): ProjectSeq {
  return all.projects.get(project) ?? ProjectSeq.DEFAULT
}

/** [p] for [project]; a project as it starts (no notes, default lengths, the one scene) is dropped. */
function put(all: Patterns, project: number, p: ProjectSeq): Patterns {
  const projects = new Map(all.projects)
  if (blankProject(p)) projects.delete(project)
  else projects.set(project, p)
  return { projects }
}

/**
 * Version 2: each project's scenes and the patterns in its banks with notes
 * or another length only; the open flag and the notes' ids aren't written.
 */
function toJson(all: Patterns): string {
  // Non-numeric keys: JSON.stringify keeps them in the Kotlin order.
  const projects = [...all.projects.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, p]) => !blankProject(p))
    .map(([project, p]) => ({
      project,
      scene: p.scene,
      scenes: p.scenes.map((s) => s.patterns),
      groups: p.banks.flatMap((bank, g) => {
        const kept = [...bank.entries()].filter(([, pat]) => !blankPattern(pat)).sort(([a], [b]) => a - b)
        if (kept.length === 0) return []
        return [
          {
            group: g,
            patterns: kept.map(([n, pat]) => ({
              n,
              bars: pat.bars,
              notes: pat.notes.map((note) => ({
                t: note.tick,
                pad: note.offset,
                gate: note.gate,
                ...(note.semitones !== null ? { semi: note.semitones } : {}),
                ...(note.velocity !== 127 ? { vel: note.velocity } : {}),
              })),
            })),
          },
        ]
      }),
    }))
  return JSON.stringify({ v: 2, projects })
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A whole number written as a number (not a string), in the Int range (kotlinx intOrNull). */
function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= -(2 ** 31) && v <= 2 ** 31 - 1 ? v : null
}

const inRange = (v: number | null, lo: number, hi: number): v is number => v !== null && v >= lo && v <= hi

const arrayOf = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : [])

/**
 * Null when the text is not a version this one can read (1 or 2); entries it
 * can't read are skipped (as OfflinePads.fromJson): a project, a scene, a
 * group, a pattern or a note. Version 1 kept one pattern a group: it reads as
 * pattern 1, in the one scene. A later entry for the same group (version 1)
 * or pattern (version 2) wins; in version 2 a later entry for the same
 * project replaces it.
 */
function fromJson(text: string): Patterns | null {
  let o: unknown
  try {
    o = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(o)) return null
  const v = intOrNull(o['v'])
  if (v !== 1 && v !== 2) return null
  let out = EMPTY
  for (const f of arrayOf(o['projects'])) {
    if (!isObject(f)) continue
    const project = intOrNull(f['project'])
    if (!inRange(project, 0, 99)) continue
    out = put(out, project, v === 1 ? readV1(f, of(out, project)) : readV2(f))
  }
  return out
}

/** A version 1 project: each group's one pattern, as pattern 1, over [from]. */
function readV1(f: Record<string, unknown>, from: ProjectSeq): ProjectSeq {
  let p = from
  for (const gf of arrayOf(f['groups'])) {
    if (!isObject(gf)) continue
    const g = intOrNull(gf['group'])
    if (!inRange(g, 0, 3)) continue
    const bars = intOrNull(gf['bars'])
    if (!inRange(bars, 1, Seq.MAX_BARS)) continue
    p = withPattern(p, g, 1, pattern(bars, readNotes(gf)))
  }
  return p
}

/** A version 2 project: its scenes (one of patterns 1 when none can be read) and its banks. */
function readV2(f: Record<string, unknown>): ProjectSeq {
  const scenes: Scene[] = []
  for (const se of arrayOf(f['scenes'])) {
    if (!Array.isArray(se)) continue
    const ns = (se as unknown[]).map(intOrNull)
    if (ns.length === 4 && ns.every((n) => inRange(n, 1, Seq.MAX_PATTERNS))) scenes.push(scene(ns as number[]))
  }
  let p = projectSeq([], scenes, intOrNull(f['scene']) ?? 0)
  for (const gf of arrayOf(f['groups'])) {
    if (!isObject(gf)) continue
    const g = intOrNull(gf['group'])
    if (!inRange(g, 0, 3)) continue
    for (const pf of arrayOf(gf['patterns'])) {
      if (!isObject(pf)) continue
      const n = intOrNull(pf['n'])
      if (!inRange(n, 1, Seq.MAX_PATTERNS)) continue
      const bars = intOrNull(pf['bars'])
      if (!inRange(bars, 1, Seq.MAX_BARS)) continue
      p = withPattern(p, g, n, pattern(bars, readNotes(pf)))
    }
  }
  return p
}

/** A pattern's notes, at most its cap; those it can't read are skipped. */
function readNotes(o: Record<string, unknown>): PatternNote[] {
  const notes: PatternNote[] = []
  for (const nf of arrayOf(o['notes'])) {
    if (notes.length >= Seq.MAX_NOTES) break
    if (!isObject(nf)) continue
    const t = intOrNull(nf['t'])
    if (t === null || t < 0) continue
    const pad = intOrNull(nf['pad'])
    if (!inRange(pad, 0, 11)) continue
    const gate = intOrNull(nf['gate'])
    if (gate === null || gate < 1) continue
    // Absent is a pad hit and full velocity; present but unreadable skips the note.
    let semi: number | null = null
    if ('semi' in nf) {
      semi = intOrNull(nf['semi'])
      if (!inRange(semi, -127, 127)) continue
    }
    let vel = 127
    if ('vel' in nf) {
      const vv = intOrNull(nf['vel'])
      if (!inRange(vv, 1, 127)) continue
      vel = vv
    }
    notes.push(patternNote(t, pad, gate, semi, vel))
  }
  return notes
}

/** The Kotlin `Patterns` (with its companion). */
export const Patterns = { EMPTY, of, put, toJson, fromJson } as const

/**
 * TIMING (the device's quantize and note interval): the grid recorded notes
 * snap to and the arp and note repeat step at, or 'off' for free time (the
 * tick played). 1/16 by default, as on the device; swing bends the off-beats
 * of 1/8 and 1/16 only. The value is the word kept in settings.
 */
export type Timing = 'off' | '1/1' | '1/2' | '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T' | '1/32'

/** Timing.entries, in declaration order. */
export const TIMINGS: readonly Timing[] = ['off', '1/1', '1/2', '1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32']

/** The note intervals KNOB X offers: every timing but 'off', in order. */
export const TIMING_INTERVALS: readonly Timing[] = TIMINGS.filter((t) => t !== 'off')

const TIMING_TICKS: Readonly<Record<Timing, number>> = {
  off: 0,
  '1/1': 384,
  '1/2': 192,
  '1/4': 96,
  '1/8': 48,
  '1/8T': 32,
  '1/16': 24,
  '1/16T': 16,
  '1/32': 12,
}

export function timingTicks(t: Timing): number {
  return TIMING_TICKS[t]
}

/** Whether swing applies to [t]: 1/8 and 1/16 only, as on the device. */
export function timingSwings(t: Timing): boolean {
  return t === '1/8' || t === '1/16'
}

/** Swing, as a percent: 50 is straight, 75 puts the off-beats halfway to the next step. */
const SWING_MIN = 50
const SWING_MAX = 75

function clampSwing(swing: number): number {
  return Math.min(Math.max(swing, SWING_MIN), SWING_MAX)
}

/**
 * How late step [stepIndex] of [t]'s grid plays at [swing] (50..75): 0 for
 * the even steps, and for the odd ones (swing - 50) / 50 of a step, rounded
 * to the tick (ticks / 2 at 75). 0 where [t] doesn't swing.
 */
export function swingOffset(t: Timing, stepIndex: number, swing: number): number {
  if (!timingSwings(t) || stepIndex % 2 === 0) return 0
  return Math.trunc(((clampSwing(swing) - SWING_MIN) * TIMING_TICKS[t] + 25) / 50)
}

/**
 * [tick] on [t]'s grid swung by [swing]: the nearest of its points
 * (k * ticks + swingOffset(k)), ties rounding up; 'off' the nearest tick. It
 * can land on the pattern's length (the caller wraps it).
 */
export function quantize(t: Timing, tick: number, swing: number = SWING_MIN): number {
  const ticks = TIMING_TICKS[t]
  if (ticks === 0) return Math.floor(tick + 0.5)
  if (swingOffset(t, 1, swing) === 0) return Math.floor(tick / ticks + 0.5) * ticks
  const k0 = Math.floor(tick / ticks)
  let best = 0
  let bestDistance = Infinity
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const point = k * ticks + swingOffset(t, k, swing)
    const d = Math.abs(tick - point)
    if (d <= bestDistance) {
      best = point
      bestDistance = d
    }
  }
  return best
}

export const Timing = {
  OFF: 'off',
  WHOLE: '1/1',
  HALF: '1/2',
  QUARTER: '1/4',
  EIGHTH: '1/8',
  EIGHTH_T: '1/8T',
  SIXTEENTH: '1/16',
  SIXTEENTH_T: '1/16T',
  THIRTY_SECOND: '1/32',
  DEFAULT: '1/16',
  of(id: string): Timing | null {
    return (TIMINGS as readonly string[]).includes(id) ? (id as Timing) : null
  },
} as const

/**
 * The TIMING settings: the note [interval] (never 'off'), its [swing]
 * (50..75) and whether recording snaps to the grid ([quantize]) or keeps
 * free time.
 */
export interface TimingSettings {
  readonly interval: Timing
  readonly swing: number
  readonly quantize: boolean
}

/** Settings: [fields] over the defaults (Kotlin's TimingSettings constructor), 'off' read as 1/16 and the swing held to 50..75. */
function timingSettingsOf(fields: Partial<TimingSettings> = {}): TimingSettings {
  const s = { interval: Timing.SIXTEENTH as Timing, swing: SWING_MIN, quantize: true, ...fields }
  return { interval: s.interval === Timing.OFF ? Timing.SIXTEENTH : s.interval, swing: clampSwing(s.swing), quantize: s.quantize }
}

/** The grid recording snaps to: the interval, or 'off' for free time. */
function record(s: TimingSettings): Timing {
  return s.quantize ? s.interval : Timing.OFF
}

function withInterval(s: TimingSettings, interval: Timing): TimingSettings {
  return timingSettingsOf({ ...s, interval })
}

function withSwing(s: TimingSettings, swing: number): TimingSettings {
  return timingSettingsOf({ ...s, swing })
}

function withQuantize(s: TimingSettings, quantize: boolean): TimingSettings {
  return { ...s, quantize }
}

export const TimingSettings = {
  SWING_MIN,
  SWING_MAX,
  DEFAULT: timingSettingsOf(),
  of: timingSettingsOf,
  clampSwing,
  record,
  withInterval,
  withSwing,
  withQuantize,
} as const
