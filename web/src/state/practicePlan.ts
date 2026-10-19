// Port of app/src/main/kotlin/dev/arc/ep133/controller/PracticePlan.kt
//
// PRACTICE on Live as the panel shows it (an addition), and a frame of one
// running for the pads and the lane.
//
// Web deltas:
// - The data classes are readonly interfaces; Kotlin's Pairs are tuples
//   (upcoming's [target, ticks], worst's [offset, mark]) and its Map of names
//   a ReadonlyMap.
// - LessonRecord.worst is a [name, mark] tuple or null.
// - PracticeUi.speed is spec.speed, read where it is needed.

import type { HitMark, PracticeCounts, PracticeSpec, PracticeTarget } from '../core/features/practice'
import { ROWS } from '../core/features/padNotes'
import { Pattern, ProjectPatterns } from '../core/features/pattern'

/**
 * PRACTICE on Live as the panel shows it: what is practised ([spec], [place]
 * "A · 01"), the pads played ([pads], keypad order, top row first) and their
 * names for the lane ([names]), the tempo it plays at ([bpm], spec.speed
 * percent of Live's), the bars it loops ([bars]), whether it runs, the counts
 * so far and the pad most often off ([worst]); in WAIT, the pads the step
 * waits for ([waiting]) and which step of how many; the step a lesson card
 * runs ([lesson]), null outside one.
 */
export interface PracticeUi {
  readonly spec: PracticeSpec
  readonly place: string
  readonly pads: readonly number[]
  readonly names: ReadonlyMap<number, string>
  readonly bpm: number
  readonly bars: number
  readonly running: boolean
  readonly counts: PracticeCounts
  readonly worst: readonly [number, HitMark] | null
  readonly waiting: ReadonlySet<number>
  readonly waitStep: number
  readonly waitSteps: number
  /** The step a lesson card runs (from 1), of how many, its title; null outside one. */
  readonly lesson: LessonPlace | null
}

/**
 * Where a lesson is: [step] (from 1) of [steps], called [title], its [tip] if
 * any, and the clean passes that open the next; each step's [records] so far
 * (null: not played), and whether every step is [done].
 */
export interface LessonPlace {
  readonly step: number
  readonly steps: number
  readonly title: string
  readonly tip: string | null
  readonly passesToGo: number
  readonly records: readonly (LessonRecord | null)[]
  readonly done: boolean
}

/** How a lesson's step went the last time it played: the [percent] in time over [passes], whether it was [done] (its clean passes), the pad most often off by name. */
export interface LessonRecord {
  readonly percent: number
  readonly passes: number
  readonly done: boolean
  readonly worst: readonly [string, HitMark] | null
}

/**
 * A frame of a practice running: the [tick] heard into the loop (negative
 * counting in), each pad's next hits not yet played ([upcoming]: ticks from
 * now), and the counts so far.
 */
export interface PracticeFrame {
  readonly tick: number
  readonly upcoming: readonly (readonly [PracticeTarget, number])[]
  readonly counts: PracticeCounts
}

/** [pads] in the keypad's order, top row first (7 8 9, 4 5 6, 1 2 3, . 0 ENTER), as the lane lists them. */
export function keypadOrder(pads: Iterable<number>): number[] {
  const has = new Set(pads)
  return ROWS.flat().filter((o) => has.has(o))
}

/** The group a practice of the scene takes: [shown] when it has pad hits, else the first that has. */
export function practiceGroup(p: ProjectPatterns, shown: number): number {
  const hits = (g: number): boolean => Pattern.playable(ProjectPatterns.group(p, g)).some((n) => n.semitones === null)
  const s = Math.min(Math.max(shown, 0), 3)
  if (hits(s)) return s
  for (let g = 0; g <= 3; g++) if (hits(g)) return g
  return s
}
