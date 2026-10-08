// Port of core/src/main/kotlin/dev/arc/ep133/features/PatternRecorder.kt
//
// Recording into a project's patterns, as RECORD does on the device: every
// edit is pure, taking the patterns and giving the new ones, and keeps the
// undo checkpoints (SHIFT + B on the device).
//
// Ticks are global: counted from the transport's tick 0 (PLAY starts at bar
// 1), negative during the count-in. A group's pattern takes them mod its
// length, except while it is open: then its tick is the global one, and it
// grows instead of looping (grow).
//
// Undo: a checkpoint is the whole of a project's patterns, pushed on the
// first change after a punch-in or a pass of a group being recorded into
// (passed), and before each erase, clear, length change or double; at most
// [maxUndo] are kept.
//
// Web deltas:
// - Recorded is a plain readonly interface.
// - The Kotlin compares patterns with data class equals; here samePatterns
//   compares them field by field.
// - Kotlin's Long ticks and passes are whole JS numbers.

import type { PhysicalPad } from './padNotes'
import { Pattern, ProjectPatterns, Seq, Timing, pattern, patternNote, quantize, timingTicks, type PatternNote } from './pattern'
import { passOf } from './sequencer'

/** A note recorded: the [patterns] with it and its [id] (0: nothing recorded), and the pass the scheduler skips, if any. */
export interface Recorded {
  readonly patterns: ProjectPatterns
  readonly id: number
  readonly skipPass: number | null
}

/** With TIMING OFF, a note this near one on the same pad and pitch replaces it. */
const OVERDUB_TICKS = 6

// A pad held in ERASE while playing: where its last range ended, and whether it pushed its checkpoint.
interface EraseRun {
  readonly pad: PhysicalPad
  readonly semitones: number | null
  readonly end: number
  pushed: boolean
}

export class PatternRecorder {
  private readonly checkpoints: ProjectPatterns[] = []
  // The next change pushes a checkpoint.
  private pending = false
  private nextId = 0
  // A held note's global start, for its gate.
  private readonly held = new Map<number, number>()
  // An open group's length before it was opened, for a recording with no notes in it.
  private readonly openedFrom: number[] = [Seq.DEFAULT_BARS, Seq.DEFAULT_BARS, Seq.DEFAULT_BARS, Seq.DEFAULT_BARS]
  // The pass each group was last seen in, so one pass marks once.
  private readonly lastPass: (number | null)[] = [null, null, null, null]
  // The erase going on while playing, so one held pad is one checkpoint.
  private lastErase: EraseRun | null = null

  constructor(private readonly maxUndo = 32) {}

  get canUndo(): boolean {
    return this.checkpoints.length > 0
  }

  /**
   * Recording starts. Groups still empty open for AUTO length, but only from
   * stop ([fromStop]) with [autoLength] on: they start at a bar and grow as
   * it goes on.
   */
  punchIn(p: ProjectPatterns, fromStop: boolean, autoLength: boolean): ProjectPatterns {
    this.pending = true
    this.lastErase = null
    this.lastPass.fill(null)
    if (!fromStop || !autoLength) return p
    let out = p
    for (let g = 0; g < 4; g++) {
      const pat = ProjectPatterns.group(p, g)
      if (!Pattern.isEmpty(pat) || pat.open) continue
      this.openedFrom[g] = pat.bars
      out = ProjectPatterns.with(out, g, pattern(Seq.DEFAULT_BARS, pat.notes, true))
    }
    return out
  }

  /**
   * Recording stops at [tickNow]. An open group with notes closes at the bars
   * gone by, rounded up to 1, 2, 4 or 8; one with none goes back to the
   * length it had.
   */
  punchOut(p: ProjectPatterns, tickNow: number): ProjectPatterns {
    this.lastErase = null
    this.held.clear()
    let out = p
    for (let g = 0; g < 4; g++) {
      const pat = ProjectPatterns.group(p, g)
      if (!pat.open) continue
      if (Pattern.isEmpty(pat)) {
        out = ProjectPatterns.with(out, g, pattern(this.openedFrom[g]!, pat.notes))
      } else {
        const last = Math.max(...pat.notes.map((n) => n.tick))
        const elapsed = Math.max(Math.ceil(tickNow / Seq.TICKS_PER_BAR), Math.trunc(last / Seq.TICKS_PER_BAR) + 1)
        out = ProjectPatterns.with(out, g, pattern(autoBars(elapsed), pat.notes))
      }
    }
    return out
  }

  /**
   * A pad (or a KEYS note on it, [semitones]) pressed at global [tick]; the
   * phone played it at [heardTick]. On [timing]'s grid, a press up to half a
   * step before tick 0 records at 0 and earlier ones nothing. A note on the
   * same pad and pitch at that tick (with OFF, within 6 ticks) is replaced.
   * When the grid put the note after [heardTick], the pass it lands in is to
   * be skipped (skipPass): it was heard.
   */
  noteOn(p: ProjectPatterns, pad: PhysicalPad, semitones: number | null, tick: number, heardTick: number, timing: Timing): Recorded {
    this.lastErase = null
    const q = quantize(timing, tick)
    if (q < 0) return { patterns: p, id: 0, skipPass: null }
    const grown = this.grow(p, q)
    const pat = ProjectPatterns.group(grown, pad.group)
    const len = Pattern.lengthTicks(pat)
    const local = pat.open ? q : floorMod(q, len)
    const near = timing === Timing.OFF ? OVERDUB_TICKS : 0
    // A note left past the end (the length made shorter) isn't played, so nothing played replaces it.
    const kept = pat.notes.filter(
      (n) =>
        !(n.offset === pad.offset && n.semitones === semitones && (pat.open || n.tick < len) && distance(n.tick, local, len, pat.open) <= near),
    )
    if (kept.length >= Seq.MAX_NOTES) return { patterns: p, id: 0, skipPass: null }
    const id = ++this.nextId
    const gate = timing === Timing.OFF ? timingTicks(Timing.SIXTEENTH) : timingTicks(timing)
    const out = ProjectPatterns.with(grown, pad.group, { ...pat, notes: [...kept, patternNote(local, pad.offset, gate, semitones, 127, id)] })
    this.checkpoint(p)
    this.held.set(id, q)
    return { patterns: out, id, skipPass: q > heardTick ? passOf(q, len) : null }
  }

  /** Note [id] let go of at global [tick]: its gate runs from its start on the grid to here, 1 tick to the pattern's length. */
  noteOff(p: ProjectPatterns, id: number, tick: number): ProjectPatterns {
    if (id === 0) return p
    const start = this.held.get(id)
    this.held.delete(id)
    for (let g = 0; g < 4; g++) {
      const pat = ProjectPatterns.group(p, g)
      const i = pat.notes.findIndex((n) => n.id === id)
      if (i < 0) continue
      const n = pat.notes[i]!
      const len = Pattern.lengthTicks(pat)
      // From the global start while it is known; else (an undo in between) from where it sits, wrapping.
      const delta = start !== undefined ? tick - start : floorMod(tick - n.tick, len)
      const gate = Math.min(Math.max(Math.floor(delta + 0.5), 1), len)
      const notes = [...pat.notes]
      notes[i] = { ...n, gate }
      return ProjectPatterns.with(p, g, { ...pat, notes })
    }
    return p
  }

  /** [group], being recorded into, starts its [pass]: the next change in it pushes a checkpoint. */
  passed(group: number, pass: number): void {
    if (this.lastPass[group] === pass) return
    this.lastPass[group] = pass
    this.pending = true
  }

  /** ERASE + pad: every note on [pad], or only its KEYS note [semitones]. */
  erasePad(p: ProjectPatterns, pad: PhysicalPad, semitones: number | null = null): ProjectPatterns {
    this.lastErase = null
    const pat = ProjectPatterns.group(p, pad.group)
    return this.edit(p, ProjectPatterns.with(p, pad.group, { ...pat, notes: pat.notes.filter((n) => !on(n, pad, semitones)) }))
  }

  /**
   * ERASE held on [pad] while playing: its notes from global [fromTick] to
   * [toTick], wrapping round the pattern. Ranges that follow on from the last
   * one on the same pad are the same gesture: one checkpoint.
   */
  eraseRange(p: ProjectPatterns, pad: PhysicalPad, semitones: number | null, fromTick: number, toTick: number): ProjectPatterns {
    const last = this.lastErase
    const goingOn =
      last !== null && last.pad.group === pad.group && last.pad.offset === pad.offset && last.semitones === semitones && last.end === fromTick
    const run: EraseRun = { pad, semitones, end: toTick, pushed: goingOn && last?.pushed === true }
    this.lastErase = run
    if (toTick <= fromTick) return p
    const pat = ProjectPatterns.group(p, pad.group)
    const len = Pattern.lengthTicks(pat)
    const whole = !pat.open && toTick - fromTick >= len
    const from = pat.open ? fromTick : floorMod(fromTick, len)
    const to = pat.open ? toTick : floorMod(toTick, len)
    // Notes left past the end aren't played, so the playhead never passes them.
    const inRange = (t: number): boolean => (pat.open || t < len) && (whole || (from <= to ? t >= from && t < to : t >= from || t < to))
    const out = ProjectPatterns.with(p, pad.group, { ...pat, notes: pat.notes.filter((n) => !(on(n, pad, semitones) && inRange(n.tick))) })
    if (samePatterns(out, p) || run.pushed) return out
    run.pushed = true
    return this.edit(p, out)
  }

  /** ERASE + group: [group]'s notes, or every group's (null); the lengths stay. */
  clear(p: ProjectPatterns, group: number | null): ProjectPatterns {
    this.lastErase = null
    let out = p
    for (let g = 0; g < 4; g++) {
      if (group === null || g === group) out = ProjectPatterns.with(out, g, { ...ProjectPatterns.group(out, g), notes: [] })
    }
    return this.edit(p, out)
  }

  /** [group]'s length, 1 to 99 bars; notes past the end are kept but not played. It closes an open group. */
  setLength(p: ProjectPatterns, group: number, bars: number): ProjectPatterns {
    this.lastErase = null
    const pat = ProjectPatterns.group(p, group)
    return this.edit(p, ProjectPatterns.with(p, group, { ...pat, bars: Math.min(Math.max(bars, 1), Seq.MAX_BARS), open: false }))
  }

  /**
   * SHIFT + +: [group] twice as long (up to 99 bars) with its notes copied
   * into the new part, over anything left past the old end.
   */
  double(p: ProjectPatterns, group: number): ProjectPatterns {
    this.lastErase = null
    const pat = ProjectPatterns.group(p, group)
    if (pat.bars >= Seq.MAX_BARS) return p
    const len = Pattern.lengthTicks(pat)
    const bars = Math.min(pat.bars * 2, Seq.MAX_BARS)
    const end = bars * Seq.TICKS_PER_BAR
    const notes = pat.notes.filter((n) => !(n.tick >= len && n.tick < end))
    for (const n of Pattern.playable(pat)) {
      if (notes.length >= Seq.MAX_NOTES) break
      if (n.tick + len < end) notes.push({ ...n, tick: n.tick + len, id: 0 })
    }
    return this.edit(p, ProjectPatterns.with(p, group, pattern(bars, notes)))
  }

  /** Open groups grow to take in [tickNow]: 1, 2, 4 or 8 bars; past 8 they close and loop. */
  grow(p: ProjectPatterns, tickNow: number): ProjectPatterns {
    if (tickNow < 0) return p
    let out = p
    const need = Math.floor(tickNow / Seq.TICKS_PER_BAR) + 1
    for (let g = 0; g < 4; g++) {
      const pat = ProjectPatterns.group(p, g)
      if (!pat.open) continue
      const bars = Math.max(pat.bars, autoBars(need))
      const open = need <= Seq.MAX_AUTO_BARS
      if (bars !== pat.bars || open !== pat.open) out = ProjectPatterns.with(out, g, { ...pat, bars, open })
    }
    return out
  }

  /** The patterns before the last checkpoint, or null with none left. */
  undo(p: ProjectPatterns): ProjectPatterns | null {
    this.lastErase = null
    while (this.checkpoints.length > 0) {
      const c = this.checkpoints.pop()!
      if (!samePatterns(c, p)) {
        this.pending = true
        return c
      }
    }
    return null
  }

  // A recording edit: [before] goes on the stack if a checkpoint is due.
  private checkpoint(before: ProjectPatterns): void {
    if (!this.pending) return
    this.push(before)
    this.pending = false
  }

  // An erase, clear, length or double: its own checkpoint when it changed anything, and what is recorded next another.
  private edit(before: ProjectPatterns, after: ProjectPatterns): ProjectPatterns {
    if (samePatterns(after, before)) return before
    this.push(before)
    this.pending = true
    return after
  }

  private push(before: ProjectPatterns): void {
    // Open groups go back as they were before the punch-in: closed, at their old length.
    let c = before
    for (let g = 0; g < 4; g++) {
      const pat = ProjectPatterns.group(c, g)
      if (pat.open) c = ProjectPatterns.with(c, g, pattern(Pattern.isEmpty(pat) ? this.openedFrom[g]! : pat.bars, pat.notes))
    }
    this.checkpoints.push(c)
    while (this.checkpoints.length > this.maxUndo) this.checkpoints.shift()
  }
}

/** Whether [a] and [b] hold the same patterns (Kotlin's data class equals). */
export function samePatterns(a: ProjectPatterns, b: ProjectPatterns): boolean {
  if (a === b) return true
  if (a.groups.length !== b.groups.length) return false
  return a.groups.every((x, g) => {
    const y = b.groups[g]!
    return (
      x.bars === y.bars &&
      x.open === y.open &&
      x.notes.length === y.notes.length &&
      x.notes.every((n, i) => {
        const m = y.notes[i]!
        return n.tick === m.tick && n.offset === m.offset && n.gate === m.gate && n.semitones === m.semitones && n.velocity === m.velocity && n.id === m.id
      })
    )
  })
}

function on(n: PatternNote, pad: PhysicalPad, semitones: number | null): boolean {
  return n.offset === pad.offset && (semitones === null || n.semitones === semitones)
}

/** 1, 2, 4 or 8 bars: the power of two at or over [bars], at most MAX_AUTO_BARS. */
function autoBars(bars: number): number {
  let n = 1
  while (n < bars && n < Seq.MAX_AUTO_BARS) n *= 2
  return n
}

/** Ticks between [a] and [b], round the loop unless [open]. */
function distance(a: number, b: number, len: number, open: boolean): number {
  const d = Math.abs(a - b)
  return open ? d : Math.min(d, len - d)
}

function floorMod(x: number, m: number): number {
  return x - Math.floor(x / m) * m
}
