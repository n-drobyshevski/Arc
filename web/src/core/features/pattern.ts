// Port of core/src/main/kotlin/dev/arc/ep133/features/Pattern.kt
//
// The EP-133's sequencer, as its guide gives it (96 ticks a beat, 1 to 99
// bars a group), and Live's patterns: one a group, kept by project in arc and
// never written to the device. The web has no pattern recording yet; this is
// the core logic only.
//
// Web deltas:
// - The data classes are plain readonly interfaces built by `patternNote()`,
//   `pattern()` and `projectPatterns()` with the Kotlin defaults; their
//   methods are functions taking the value first, on the `Pattern`,
//   `ProjectPatterns` and `Patterns` objects (`p.group(g)` is
//   `ProjectPatterns.group(p, g)`). A note's absent `semitones` is null.
// - Patterns' map is a ReadonlyMap; usedPads gives the pads' padKey numbers,
//   as JS Sets have no value equality for objects.
// - Timing is a string union of the Kotlin enum's `id` ('off', '1/8',
//   '1/16', '1/32'): `timing.id` is `timing`, `timing.ticks` is
//   `timingTicks(timing)` and `timing.quantize(t)` is `quantize(timing, t)`;
//   `Timing.entries` is TIMINGS.
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

/** A project's patterns, one for each group A..D (the device keeps 99 a group; arc one). */
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

/**
 * Every project's patterns, by project number (1..99; 0 while no project is
 * known, offline with nothing read). Patterns stay in arc: they aren't
 * written to the EP-133.
 */
export interface Patterns {
  readonly projects: ReadonlyMap<number, ProjectPatterns>
}

const EMPTY: Patterns = { projects: new Map() }

const blankPattern = (p: Pattern): boolean => patternIsEmpty(p) && p.bars === Seq.DEFAULT_BARS
const blankProject = (p: ProjectPatterns): boolean => p.groups.every(blankPattern)

function of(all: Patterns, project: number): ProjectPatterns {
  return all.projects.get(project) ?? projectPatterns()
}

/** [p] for [project]; a project with nothing in it (no notes, default lengths) is dropped. */
function put(all: Patterns, project: number, p: ProjectPatterns): Patterns {
  const projects = new Map(all.projects)
  if (blankProject(p)) projects.delete(project)
  else projects.set(project, p)
  return { projects }
}

/** Groups with notes or another length only; the open flag and the notes' ids aren't written. */
function toJson(all: Patterns): string {
  // Non-numeric keys: JSON.stringify keeps them in the Kotlin order.
  const projects = [...all.projects.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, p]) => !blankProject(p))
    .map(([project, p]) => ({
      project,
      groups: p.groups.flatMap((pat, g) =>
        blankPattern(pat)
          ? []
          : [
              {
                group: g,
                bars: pat.bars,
                notes: pat.notes.map((n) => ({
                  t: n.tick,
                  pad: n.offset,
                  gate: n.gate,
                  ...(n.semitones !== null ? { semi: n.semitones } : {}),
                  ...(n.velocity !== 127 ? { vel: n.velocity } : {}),
                })),
              },
            ],
      ),
    }))
  return JSON.stringify({ v: 1, projects })
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A whole number written as a number (not a string), in the Int range (kotlinx intOrNull). */
function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= -(2 ** 31) && v <= 2 ** 31 - 1 ? v : null
}

const inRange = (v: number | null, lo: number, hi: number): v is number => v !== null && v >= lo && v <= hi

/**
 * Null when the text is not a version this one can read; entries it can't
 * read are skipped (as OfflinePads.fromJson): a project, a group or a note.
 * A later entry for the same project or group wins.
 */
function fromJson(text: string): Patterns | null {
  let o: unknown
  try {
    o = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(o)) return null
  if (intOrNull(o['v']) !== 1) return null
  let out = EMPTY
  const list = o['projects']
  for (const f of Array.isArray(list) ? (list as unknown[]) : []) {
    if (!isObject(f)) continue
    const project = intOrNull(f['project'])
    if (!inRange(project, 0, 99)) continue
    let p = of(out, project)
    const groups = f['groups']
    for (const gf of Array.isArray(groups) ? (groups as unknown[]) : []) {
      if (!isObject(gf)) continue
      const g = intOrNull(gf['group'])
      if (!inRange(g, 0, 3)) continue
      const bars = intOrNull(gf['bars'])
      if (!inRange(bars, 1, Seq.MAX_BARS)) continue
      const notes: PatternNote[] = []
      const ns = gf['notes']
      for (const nf of Array.isArray(ns) ? (ns as unknown[]) : []) {
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
          const v = intOrNull(nf['vel'])
          if (!inRange(v, 1, 127)) continue
          vel = v
        }
        notes.push(patternNote(t, pad, gate, semi, vel))
      }
      p = withGroup(p, g, pattern(bars, notes))
    }
    out = put(out, project, p)
  }
  return out
}

/** The Kotlin `Patterns` (with its companion). */
export const Patterns = { EMPTY, of, put, toJson, fromJson } as const

/**
 * TIMING (the device's quantize): the grid recorded notes snap to, or 'off'
 * for free time (the tick played). 1/16 by default, as on the device. The
 * value is the word kept in settings.
 */
export type Timing = 'off' | '1/8' | '1/16' | '1/32'

/** Timing.entries, in declaration order. */
export const TIMINGS: readonly Timing[] = ['off', '1/8', '1/16', '1/32']

const TIMING_TICKS: Readonly<Record<Timing, number>> = { off: 0, '1/8': 48, '1/16': 24, '1/32': 12 }

export function timingTicks(t: Timing): number {
  return TIMING_TICKS[t]
}

/**
 * [tick] on [t]'s grid: the nearest grid tick, ties rounding up; 'off' the
 * nearest tick. It can land on the pattern's length (the caller wraps it).
 */
export function quantize(t: Timing, tick: number): number {
  const ticks = TIMING_TICKS[t]
  return ticks === 0 ? Math.floor(tick + 0.5) : Math.floor(tick / ticks + 0.5) * ticks
}

export const Timing = {
  OFF: 'off',
  EIGHTH: '1/8',
  SIXTEENTH: '1/16',
  THIRTY_SECOND: '1/32',
  DEFAULT: '1/16',
  of(id: string): Timing | null {
    return (TIMINGS as readonly string[]).includes(id) ? (id as Timing) : null
  },
} as const
