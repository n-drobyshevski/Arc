// Port of core/src/main/kotlin/dev/arc/ep133/features/Practice.kt
//
// PRACTICE on Live (an addition): what the player plays along with, what
// plays under them, and how their presses score.
//
// Web deltas:
// - The data classes are plain readonly interfaces built by `practiceSpec()`,
//   `practiceTarget()` and `practiceCounts()` with the Kotlin defaults (the
//   named arguments of PracticeSpec and PracticeCounts are an options
//   object); PracticeCounts' hits and percent are `PracticeCounts.hits(c)`
//   and `PracticeCounts.percent(c)`.
// - The enum class HitMark is a string union of its names plus a const
//   object of the same name; `HitMark.entries` is HIT_MARKS and a mark's
//   ordinal its index there (byPad's arrays are indexed by it).
// - Kotlin's Pairs are tuples: upcoming gives [target, ticks] and worst
//   [offset, mark]. Kotlin Longs (passes, the cursor, the keys) are numbers.
// - worst() walks byPad in pad order, as Kotlin's HashMap of small Int keys
//   does, so a tie goes to the same pad.

import { Pattern, ProjectPatterns, Seq, pattern, projectPatterns } from './pattern'

/**
 * What the player plays along with. They play [group]'s pad hits on [pads]
 * (offsets; null: all its pads), over the first [bars] bars (null: the whole
 * pattern), at [speed] percent of the tempo, while the rest of the scene plays
 * underneath ([backing] off: only what they play is left out, and nothing
 * else plays). In [wait] the beat stands still and waits for each hit in turn.
 */
export interface PracticeSpec {
  readonly group: number
  readonly pads: ReadonlySet<number> | null
  readonly bars: number | null
  readonly speed: number
  readonly wait: boolean
  readonly backing: boolean
}

export function practiceSpec(
  group: number,
  opts: { pads?: ReadonlySet<number> | null; bars?: number | null; speed?: number; wait?: boolean; backing?: boolean } = {},
): PracticeSpec {
  return { group, pads: opts.pads ?? null, bars: opts.bars ?? null, speed: opts.speed ?? 100, wait: opts.wait ?? false, backing: opts.backing ?? true }
}

export const PracticeSpec = {
  /** SPEED's steps, in percent of the tempo. */
  SPEEDS: Object.freeze([50, 75, 100]) as readonly number[],
} as const

/** A hit to play: the pad at [offset], [tick] into the pattern, as hard as [velocity]. */
export interface PracticeTarget {
  readonly offset: number
  readonly tick: number
  readonly velocity: number
}

export function practiceTarget(offset: number, tick: number, velocity: number): PracticeTarget {
  return { offset, tick, velocity }
}

/** How a press went: in time, early, late; a target let go by; a press on no target. */
export type HitMark = 'ON_TIME' | 'EARLY' | 'LATE' | 'MISSED' | 'EXTRA'

/** HitMark.entries, in declaration order (a mark's ordinal is its index). */
export const HIT_MARKS: readonly HitMark[] = ['ON_TIME', 'EARLY', 'LATE', 'MISSED', 'EXTRA']

export const HitMark = {
  ON_TIME: 'ON_TIME',
  EARLY: 'EARLY',
  LATE: 'LATE',
  MISSED: 'MISSED',
  EXTRA: 'EXTRA',
} as const

/** The counts so far, the passes played and how many in a row were clean (nothing missed or extra). */
export interface PracticeCounts {
  readonly onTime: number
  readonly early: number
  readonly late: number
  readonly missed: number
  readonly extra: number
  readonly passes: number
  readonly cleanRun: number
}

export function practiceCounts(c: Partial<PracticeCounts> = {}): PracticeCounts {
  return {
    onTime: c.onTime ?? 0,
    early: c.early ?? 0,
    late: c.late ?? 0,
    missed: c.missed ?? 0,
    extra: c.extra ?? 0,
    passes: c.passes ?? 0,
    cleanRun: c.cleanRun ?? 0,
  }
}

/** The hits played or let go by. */
function hits(c: PracticeCounts): number {
  return c.onTime + c.early + c.late + c.missed
}

/** The share of them in time, in percent (0 before any). */
function percent(c: PracticeCounts): number {
  const n = hits(c)
  return n === 0 ? 0 : Math.round((c.onTime * 100.0) / n)
}

/** The Kotlin `PracticeCounts`' members. */
export const PracticeCounts = { hits, percent } as const

/** The ticks practice loops over: the pattern's, or the [PracticeSpec.bars] played when that is shorter. */
function length(p: Pattern, spec: PracticeSpec): number {
  return Math.max(Math.min(Pattern.lengthTicks(p), (spec.bars ?? p.bars) * Seq.TICKS_PER_BAR), Seq.TICKS_PER_BAR)
}

/** The hits [spec] has the player play in [p]: its pad hits (KEYS notes are left to the backing) in the bars played, in time order. */
function targets(p: Pattern, spec: PracticeSpec): PracticeTarget[] {
  const end = length(p, spec)
  return Pattern.playable(p)
    .filter((n) => n.semitones === null && n.tick < end && (spec.pads === null || spec.pads.has(n.offset)))
    .map((n) => practiceTarget(n.offset, n.tick, n.velocity))
}

/**
 * What the sequencer plays while [spec] is practised in [all]: each pattern
 * cut to the bars played, the player's hits taken out of theirs, and with
 * [PracticeSpec.backing] off the other groups and pads silent too. In
 * [PracticeSpec.wait] nothing plays.
 */
function patterns(all: ProjectPatterns, spec: PracticeSpec): ProjectPatterns {
  return projectPatterns(
    all.groups.map((p, g) => {
      const bars = spec.bars !== null ? Math.min(spec.bars, p.bars) : p.bars
      const notes = spec.wait
        ? []
        : g !== spec.group
          ? spec.backing
            ? p.notes
            : []
          : !spec.backing
            ? []
            : p.notes.filter((n) => !(n.semitones === null && (spec.pads === null || spec.pads.has(n.offset))))
      return pattern(bars, notes.filter((n) => n.tick < bars * Seq.TICKS_PER_BAR))
    }),
  )
}

/** [ms] as ticks at [bpm]. */
function ticksOf(ms: number, bpm: number): number {
  return (ms * bpm * Seq.PPQN) / 60_000.0
}

/** [ticks] as milliseconds at [bpm]. */
function msOf(ticks: number, bpm: number): number {
  return (ticks * 60_000.0) / (bpm * Seq.PPQN)
}

export const Practice = {
  /** The touch is late on a phone, and the ear forgives: a press this close to its hit is in time. */
  ON_TIME_MS: 60.0,
  /** A press counts for the nearest hit of its pad no further than a sixteenth either side. */
  MATCH_TICKS: Seq.PPQN / 4,
  targets,
  length,
  patterns,
  ticksOf,
  msOf,
} as const

/**
 * The score of a practice playing along, [targets] looping every [length]
 * ticks at [bpm]. A press is told its tick from the loop's first start
 * ([press]); it counts for the nearest hit of its pad not yet played, within
 * a sixteenth ([Practice.MATCH_TICKS]), in time within [Practice.ON_TIME_MS]
 * (and a third of a sixteenth), else early or late; one with no hit near is
 * EXTRA. [advance] lets go of the hits passed by, missed, and closes each
 * pass: clean when nothing in it was missed or extra.
 */
export class PracticeScore {
  private readonly played = new Set<number>()
  private cursor = 0
  private readonly extraIn = new Map<number, number>()
  private readonly missedIn = new Map<number, number>()
  private current: PracticeCounts = practiceCounts()

  /** Each pad's marks so far, for "the kick came early". */
  readonly byPad = new Map<number, number[]>()

  private readonly inTime: number

  constructor(
    readonly targets: readonly PracticeTarget[],
    readonly length: number,
    readonly bpm: number,
  ) {
    this.inTime = Math.max(Math.min(Practice.ticksOf(Practice.ON_TIME_MS, bpm), Practice.MATCH_TICKS / 3.0), 1.0)
  }

  get counts(): PracticeCounts {
    return this.current
  }

  private key(pass: number, i: number): number {
    return pass * this.targets.length + i
  }

  private at(pass: number, i: number): number {
    return pass * this.length + this.targets[i]!.tick
  }

  private mark(offset: number, m: HitMark): void {
    let n = this.byPad.get(offset)
    if (n === undefined) {
      n = new Array<number>(HIT_MARKS.length).fill(0)
      this.byPad.set(offset, n)
    }
    n[HIT_MARKS.indexOf(m)]!++
    const c = this.current
    switch (m) {
      case 'ON_TIME':
        this.current = { ...c, onTime: c.onTime + 1 }
        break
      case 'EARLY':
        this.current = { ...c, early: c.early + 1 }
        break
      case 'LATE':
        this.current = { ...c, late: c.late + 1 }
        break
      case 'MISSED':
        this.current = { ...c, missed: c.missed + 1 }
        break
      case 'EXTRA':
        this.current = { ...c, extra: c.extra + 1 }
        break
    }
  }

  /** A press on the pad at [offset], [tick] ticks after the loop first started (the count-in before it is negative). */
  press(offset: number, tick: number): HitMark {
    const pass = Math.floor(tick / this.length)
    let best: [number, number] | null = null
    let bestDist = Number.MAX_VALUE
    for (let p = pass - 1; p <= pass + 1; p++) {
      if (p < 0) continue
      for (let i = 0; i < this.targets.length; i++) {
        // A hit already let go by (missed, behind the cursor) or played can't be played again.
        if (this.targets[i]!.offset !== offset || this.key(p, i) < this.cursor || this.played.has(this.key(p, i))) continue
        const d = Math.abs(tick - this.at(p, i))
        if (d <= Practice.MATCH_TICKS && d < bestDist) {
          bestDist = d
          best = [p, i]
        }
      }
    }
    let m: HitMark = 'EXTRA'
    if (best !== null) {
      const [p, i] = best
      this.played.add(this.key(p, i))
      const d = tick - this.at(p, i)
      m = Math.abs(d) <= this.inTime ? 'ON_TIME' : d < 0 ? 'EARLY' : 'LATE'
    }
    if (m === 'EXTRA') {
      const at = Math.max(pass, 0)
      this.extraIn.set(at, (this.extraIn.get(at) ?? 0) + 1)
    }
    this.mark(offset, m)
    return m
  }

  /** The beat has got to [tick]: the hits more than a sixteenth behind it and not played are missed, and each pass behind closes. */
  advance(tick: number): void {
    const size = this.targets.length
    if (size === 0) return
    for (;;) {
      const pass = Math.floor(this.cursor / size)
      const i = this.cursor % size
      if (this.at(pass, i) + Practice.MATCH_TICKS >= tick) return
      if (!this.played.has(this.key(pass, i))) {
        this.missedIn.set(pass, (this.missedIn.get(pass) ?? 0) + 1)
        this.mark(this.targets[i]!.offset, 'MISSED')
      }
      this.cursor++
      if (i === size - 1) {
        const clean = (this.missedIn.get(pass) ?? 0) === 0 && (this.extraIn.get(pass) ?? 0) === 0
        const c = this.current
        this.current = { ...c, passes: c.passes + 1, cleanRun: clean ? c.cleanRun + 1 : 0 }
        for (const k of this.played) if (k < this.cursor) this.played.delete(k)
      }
    }
  }

  /**
   * Each pad's next hit not yet played, as ticks from [tick] (negative while
   * it is still in time to play), looking [ahead] ticks on: what lights the
   * pads and fills the lane.
   */
  upcoming(tick: number, ahead: number = Seq.TICKS_PER_BAR): [PracticeTarget, number][] {
    if (this.targets.length === 0) return []
    const out: [PracticeTarget, number][] = []
    const first = Math.max(Math.floor((tick - Practice.MATCH_TICKS) / this.length), 0)
    for (let p = first; p * this.length <= tick + ahead; p++) {
      for (let i = 0; i < this.targets.length; i++) {
        const d = this.at(p, i) - tick
        if (d < -Practice.MATCH_TICKS || d >= ahead || this.key(p, i) < this.cursor || this.played.has(this.key(p, i))) continue
        out.push([this.targets[i]!, d])
      }
    }
    // Array.prototype.sort is stable, as Kotlin's sortedBy.
    return out.sort((a, b) => a[1] - b[1])
  }

  /** The pad most often off ([HitMark]: missed, early or late), and how, when it was off more than once. */
  worst(): [number, HitMark] | null {
    let best: [number, HitMark] | null = null
    let most = 1
    for (const pad of [...this.byPad.keys()].sort((a, b) => a - b)) {
      const n = this.byPad.get(pad)!
      for (const m of ['MISSED', 'EARLY', 'LATE'] as const) {
        // maxByOrNull keeps the first of the most.
        const c = n[HIT_MARKS.indexOf(m)]!
        if (c > most) {
          most = c
          best = [pad, m]
        }
      }
    }
    return best
  }
}

/**
 * WAIT: the beat stands still at each step of [targets] until every pad on it
 * is played, then goes on to the next (round again after the last). A press
 * on a pad not on the step is EXTRA.
 */
export class PracticeWait {
  /** The steps: the hits at each tick, in time order. */
  readonly steps: readonly (readonly PracticeTarget[])[]
  private stepAt = 0
  private readonly done = new Set<number>()
  private current: PracticeCounts = practiceCounts()
  private extraThisPass = 0

  constructor(readonly targets: readonly PracticeTarget[]) {
    const byTick = new Map<number, PracticeTarget[]>()
    for (const t of targets) {
      const s = byTick.get(t.tick)
      if (s === undefined) byTick.set(t.tick, [t])
      else s.push(t)
    }
    this.steps = [...byTick.keys()].sort((a, b) => a - b).map((k) => byTick.get(k)!)
  }

  get step(): number {
    return this.stepAt
  }

  get counts(): PracticeCounts {
    return this.current
  }

  /** The pads still to play on this step. */
  get waiting(): Set<number> {
    const out = new Set<number>()
    for (const t of this.steps[this.stepAt] ?? []) if (!this.done.has(t.offset)) out.add(t.offset)
    return out
  }

  /** The step's tick into the pattern, where the lane stands. */
  get tick(): number {
    return this.steps[this.stepAt]?.[0]?.tick ?? 0
  }

  press(offset: number): HitMark {
    if (!this.waiting.has(offset)) {
      this.extraThisPass++
      this.current = { ...this.current, extra: this.current.extra + 1 }
      return 'EXTRA'
    }
    this.done.add(offset)
    this.current = { ...this.current, onTime: this.current.onTime + 1 }
    if (this.waiting.size === 0) {
      this.done.clear()
      this.stepAt++
      if (this.stepAt >= this.steps.length) {
        this.stepAt = 0
        const c = this.current
        this.current = { ...c, passes: c.passes + 1, cleanRun: this.extraThisPass === 0 ? c.cleanRun + 1 : 0 }
        this.extraThisPass = 0
      }
    }
    return 'ON_TIME'
  }
}
