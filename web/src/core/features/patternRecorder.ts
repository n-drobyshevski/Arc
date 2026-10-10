// Port of core/src/main/kotlin/dev/arc/ep133/features/PatternRecorder.kt
//
// Recording into a project's patterns, as RECORD does on the device: every
// edit is pure, taking the patterns playing and giving the new ones, and
// keeps the undo checkpoints (SHIFT + B on the device).
//
// Ticks are global: counted from the transport's tick 0 (PLAY starts at bar
// 1), negative during the count-in. A group's pattern takes them from its
// anchor (phase: where it started, bar 1 of the pattern) mod its length
// (localTick), except while it is open: then its tick is the global one less
// the anchor, and it grows instead of looping (grow).
//
// Undo: a checkpoint is the whole of the project's sequencer (seq, with the
// patterns as they were), pushed on the first change after a punch-in or a
// pass of a group being recorded into (passed), before each erase, clear,
// length change or double, and before each edit of the scenes or the banks
// (editSeq); at most [maxUndo] are kept. A gesture (a pad held in ERASE or to
// correct, a knob turned on a step, presses of − / + on one pad) is one
// checkpoint. Picking a pattern or a scene is no checkpoint and keeps them
// all: an undo after it goes back to the checkpoint whole, its pick included.
//
// Step edits (place, velocity, length, nudge) are for a stopped transport,
// whose patterns are never open; on an open pattern they, and the shifts and
// corrects, give the patterns back as they were.
//
// Web deltas:
// - Recorded, Nudged and Corrected are plain readonly interfaces.
// - The Kotlin compares patterns and sequencers with data class equals; here
//   samePatterns and sameSeq (pattern.ts) compare them field by field.
// - Kotlin's Long ticks and passes are whole JS numbers.
// - settle's (offset, semitones, tick) Triples are "offset:semitones:tick"
//   strings.
// - phase is a getter and a setter over a private field, as the Kotlin
//   property's custom setter; correctPad's inRun is a trailing boolean.

import type { PhysicalPad } from './padNotes'
import {
  Pattern,
  ProjectPatterns,
  ProjectSeq,
  Seq,
  Timing,
  pattern,
  patternNote,
  quantize,
  samePattern,
  sameSeq,
  timingTicks,
  type PatternNote,
} from './pattern'
import { PhaseAnchors, localTick, passOf, sinceAnchor } from './sequencer'
import { Steps } from './steps'

/** A note recorded: the [patterns] with it and its [id] (0: nothing recorded), and the pass the scheduler skips, if any. */
export interface Recorded {
  readonly patterns: ProjectPatterns
  readonly id: number
  readonly skipPass: number | null
}

/** Notes nudged: the [patterns] with them moved, and the [step] they sit on now (the old one if none moved). */
export interface Nudged {
  readonly patterns: ProjectPatterns
  readonly step: number
}

/** Notes corrected to the grid: the [patterns] and how many [moved] (dropped onto another note counts too). */
export interface Corrected {
  readonly patterns: ProjectPatterns
  readonly moved: number
}

/** With TIMING OFF, a note this near one on the same pad and pitch replaces it. */
const OVERDUB_TICKS = 6

/** The gesture of the pads held to correct while playing: one run, whatever the pad. */
const CORRECT_RUN = 'correct'

// A pad held in ERASE while playing: where its last range ended, and whether it pushed its checkpoint.
interface EraseRun {
  readonly pad: PhysicalPad
  readonly semitones: number | null
  readonly end: number
  pushed: boolean
}

export class PatternRecorder {
  private readonly checkpoints: ProjectSeq[] = []
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
  // The step edit or correct going on, by its kind and target ("vel:0:5"), so one knob turn or held pad is one checkpoint.
  private lastRun: string | null = null
  // Whether that run has pushed its checkpoint.
  private runPushed = false
  private _phase: PhaseAnchors = PhaseAnchors.ZERO

  /**
   * The project's sequencer as it stands, which the patterns handed to the
   * edits are the playing ones of; the caller sets it whenever the picks, the
   * banks or the scenes change. A checkpoint is this with the patterns before
   * the edit.
   */
  seq: ProjectSeq = ProjectSeq.DEFAULT

  /**
   * Where each group's pattern started, which the global ticks handed to the
   * edits are counted from; the caller sets it as the transport starts (all 0)
   * and as a pick takes over a group.
   */
  get phase(): PhaseAnchors {
    return this._phase
  }

  set phase(value: PhaseAnchors) {
    // A group whose pattern starts afresh counts its passes anew.
    for (let g = 0; g < 4; g++) if (PhaseAnchors.of(value, g) !== PhaseAnchors.of(this._phase, g)) this.lastPass[g] = null
    this._phase = value
  }

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
    this.breakRuns()
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
    this.breakRuns()
    this.held.clear()
    let out = p
    for (let g = 0; g < 4; g++) {
      const pat = ProjectPatterns.group(p, g)
      if (!pat.open) continue
      if (Pattern.isEmpty(pat)) {
        out = ProjectPatterns.with(out, g, pattern(this.openedFrom[g]!, pat.notes))
      } else {
        const last = Math.max(...pat.notes.map((n) => n.tick))
        const now = localTick(tickNow, PhaseAnchors.of(this.phase, g), pat)
        const elapsed = Math.max(Math.ceil(now / Seq.TICKS_PER_BAR), Math.trunc(last / Seq.TICKS_PER_BAR) + 1)
        out = ProjectPatterns.with(out, g, pattern(autoBars(elapsed), pat.notes))
      }
    }
    return out
  }

  /**
   * A pad (or a KEYS note on it, [semitones]) pressed at global [tick]; the
   * phone played it at [heardTick], at [velocity] (1..127). On [timing]'s
   * grid (the pattern's own: from its anchor), swung by [swing], a press up to
   * half a step before the pattern's tick 0 records at 0 and earlier ones
   * nothing. A note on the same pad and pitch at that tick (with OFF, within 6 ticks) is replaced.
   * When the grid put the note after [heardTick], the pass it lands in is to
   * be skipped (skipPass): it was heard.
   */
  noteOn(
    p: ProjectPatterns,
    pad: PhysicalPad,
    semitones: number | null,
    tick: number,
    heardTick: number,
    timing: Timing,
    swing = 50,
    velocity = 127,
  ): Recorded {
    this.breakRuns()
    const anchor = PhaseAnchors.of(this.phase, pad.group)
    // On the pattern's own time, from its anchor: its grid is the pattern's.
    const q = quantize(timing, sinceAnchor(tick, anchor), swing)
    if (q < 0) return { patterns: p, id: 0, skipPass: null }
    const grown = this.grow(p, q + anchor)
    const pat = ProjectPatterns.group(grown, pad.group)
    const len = Pattern.lengthTicks(pat)
    const local = localTick(q + anchor, anchor, pat)
    const near = timing === Timing.OFF ? OVERDUB_TICKS : 0
    // A note left past the end (the length made shorter) isn't played, so nothing played replaces it.
    const kept = pat.notes.filter(
      (n) =>
        !(n.offset === pad.offset && n.semitones === semitones && (pat.open || n.tick < len) && distance(n.tick, local, len, pat.open) <= near),
    )
    if (kept.length >= Seq.MAX_NOTES) return { patterns: p, id: 0, skipPass: null }
    const id = ++this.nextId
    const gate = timing === Timing.OFF ? timingTicks(Timing.SIXTEENTH) : timingTicks(timing)
    const out = ProjectPatterns.with(grown, pad.group, { ...pat, notes: [...kept, patternNote(local, pad.offset, gate, semitones, velocity, id)] })
    this.checkpoint(p)
    this.held.set(id, q + anchor)
    return { patterns: out, id, skipPass: q + anchor > heardTick ? passOf(q + anchor, len, anchor) : null }
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
      const delta = start !== undefined ? tick - start : floorMod(localTick(tick, PhaseAnchors.of(this.phase, g), pat) - n.tick, len)
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
    this.breakRuns()
    const pat = ProjectPatterns.group(p, pad.group)
    return this.edit(p, ProjectPatterns.with(p, pad.group, { ...pat, notes: pat.notes.filter((n) => !on(n, pad, semitones)) }))
  }

  /**
   * ERASE held on [pad] while playing: its notes from global [fromTick] to
   * [toTick] (nothing before the pattern started), wrapping round the pattern.
   * Ranges that follow on from the last one on the same pad are the same
   * gesture: one checkpoint.
   */
  eraseRange(p: ProjectPatterns, pad: PhysicalPad, semitones: number | null, fromTick: number, toTick: number): ProjectPatterns {
    const last = this.lastErase
    const goingOn =
      last !== null && last.pad.group === pad.group && last.pad.offset === pad.offset && last.semitones === semitones && last.end === fromTick
    const run: EraseRun = { pad, semitones, end: toTick, pushed: goingOn && last?.pushed === true }
    this.lastErase = run
    this.lastRun = null
    const pat = ProjectPatterns.group(p, pad.group)
    const anchor = PhaseAnchors.of(this.phase, pad.group)
    // What passed before the pattern started was another's.
    const start = Math.max(fromTick, anchor)
    if (toTick <= start) return p
    const len = Pattern.lengthTicks(pat)
    const whole = !pat.open && toTick - start >= len
    const from = localTick(start, anchor, pat)
    const to = localTick(toTick, anchor, pat)
    // Notes left past the end aren't played, so the playhead never passes them.
    const inRange = (t: number): boolean => (pat.open || t < len) && (whole || (from <= to ? t >= from && t < to : t >= from || t < to))
    const out = ProjectPatterns.with(p, pad.group, { ...pat, notes: pat.notes.filter((n) => !(on(n, pad, semitones) && inRange(n.tick))) })
    // Nothing passed: the very patterns back, so a pad held over empty stretches changes nothing.
    if (samePatterns(out, p)) return p
    if (run.pushed) return out
    run.pushed = true
    return this.edit(p, out)
  }

  /** ERASE + group: [group]'s notes, or every group's (null); the lengths stay. */
  clear(p: ProjectPatterns, group: number | null): ProjectPatterns {
    this.breakRuns()
    let out = p
    for (let g = 0; g < 4; g++) {
      if (group === null || g === group) out = ProjectPatterns.with(out, g, { ...ProjectPatterns.group(out, g), notes: [] })
    }
    return this.edit(p, out)
  }

  /** [group]'s length, 1 to 99 bars; notes past the end are kept but not played. It closes an open group. */
  setLength(p: ProjectPatterns, group: number, bars: number): ProjectPatterns {
    this.breakRuns()
    const pat = ProjectPatterns.group(p, group)
    return this.edit(p, ProjectPatterns.with(p, group, { ...pat, bars: Math.min(Math.max(bars, 1), Seq.MAX_BARS), open: false }))
  }

  /**
   * SHIFT + +: [group] twice as long (up to 99 bars) with its notes copied
   * into the new part, over anything left past the old end.
   */
  double(p: ProjectPatterns, group: number): ProjectPatterns {
    this.breakRuns()
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

  /** Open groups grow to take in global [tickNow] (from their anchors): 1, 2, 4 or 8 bars; past 8 they close and loop. */
  grow(p: ProjectPatterns, tickNow: number): ProjectPatterns {
    let out = p
    for (let g = 0; g < 4; g++) {
      const pat = ProjectPatterns.group(p, g)
      if (!pat.open) continue
      const now = localTick(tickNow, PhaseAnchors.of(this.phase, g), pat)
      if (now < 0) continue
      const need = Math.floor(now / Seq.TICKS_PER_BAR) + 1
      const bars = Math.max(pat.bars, autoBars(need))
      const open = need <= Seq.MAX_AUTO_BARS
      if (bars !== pat.bars || open !== pat.open) out = ProjectPatterns.with(out, g, { ...pat, bars, open })
    }
    return out
  }

  /**
   * RECORD + pad on [step], stopped: [pad] (or its KEYS note [semitones])
   * placed there for one [interval], at [velocity] (1..127). A note of the
   * same pad and pitch on the step is replaced; the pattern full
   * (Seq.MAX_NOTES), nothing is placed.
   */
  stepPlace(
    p: ProjectPatterns,
    pad: PhysicalPad,
    semitones: number | null,
    step: number,
    interval: Timing,
    swing: number,
    velocity = 127,
  ): ProjectPatterns {
    this.breakRuns()
    const pat = ProjectPatterns.group(p, pad.group)
    if (pat.open) return p
    const isOn = onStep(pat, step, interval, swing)
    const kept = pat.notes.filter((n) => !(n.offset === pad.offset && n.semitones === semitones && isOn(n)))
    if (kept.length >= Seq.MAX_NOTES) return p
    const note = patternNote(Steps.tickOf(step, interval, swing), pad.offset, timingTicks(interval), semitones, clamp(velocity, 1, 127))
    return this.edit(p, ProjectPatterns.with(p, pad.group, { ...pat, notes: [...kept, note] }))
  }

  /** SHIFT + KNOB X on [step], stopped: every note on it at [velocity] (1..127). One turn of the knob is one checkpoint. */
  stepVelocity(p: ProjectPatterns, group: number, step: number, interval: Timing, swing: number, velocity: number): ProjectPatterns {
    const v = clamp(velocity, 1, 127)
    return this.stepNotes(p, `vel:${group}:${step}`, group, step, interval, swing, (n) => ({ ...n, velocity: v }))
  }

  /** SHIFT + KNOB Y on [step], stopped: every note on it [gate] ticks long (1 tick to a bar). One turn of the knob is one checkpoint. */
  stepGate(p: ProjectPatterns, group: number, step: number, interval: Timing, swing: number, gate: number): ProjectPatterns {
    const g = clamp(gate, 1, Seq.TICKS_PER_BAR)
    return this.stepNotes(p, `gate:${group}:${step}`, group, step, interval, swing, (n) => ({ ...n, gate: g }))
  }

  /**
   * SHIFT + pad and − / + on [step], stopped: the notes of [pad] there (every
   * pitch, or only [semitones]) a step earlier or later ([dir] -1 or +1) on
   * the swung grid with [quantize], else a tick, off the grid; both wrap round
   * the pattern. A note moved onto one of the same pad and pitch replaces it.
   * The presses on one pad are one checkpoint.
   */
  nudge(
    p: ProjectPatterns,
    pad: PhysicalPad,
    semitones: number | null,
    step: number,
    interval: Timing,
    swing: number,
    quantize: boolean,
    dir: number,
  ): Nudged {
    const key = `nudge:${pad.group}:${pad.offset}:${semitones}`
    const pat = ProjectPatterns.group(p, pad.group)
    if (pat.open) return { patterns: this.gesture(key, key, p, p), step }
    const len = Pattern.lengthTicks(pat)
    const count = Steps.count(pat, interval)
    const isOn = onStep(pat, step, interval, swing)
    const target = Steps.tickOf(floorMod(step + dir, count), interval, swing)
    const moves = new Map<number, number>()
    pat.notes.forEach((n, i) => {
      if (on(n, pad, semitones) && isOn(n)) moves.set(i, quantize ? target : floorMod(n.tick + dir, len))
    })
    const out = this.gesture(key, key, p, ProjectPatterns.with(p, pad.group, { ...pat, notes: settle(pat, moves, true).notes }))
    if (samePatterns(out, p)) return { patterns: p, step }
    // The cursor follows the note: the first of them, where it sits now.
    return { patterns: out, step: Steps.indexOf(moves.get(Math.min(...moves.keys()))!, interval, swing, count) }
  }

  /**
   * SHIFT + TIMING, a pad held and − / +: all of [pad]'s notes that play
   * (every pitch, or only [semitones]) a tick earlier or later ([dir] -1 or
   * +1), wrapping round the pattern; notes past the end stay put. A note
   * moved onto one of the same pad and pitch replaces it. The presses on one
   * pad are one checkpoint.
   */
  shiftPad(p: ProjectPatterns, pad: PhysicalPad, semitones: number | null, dir: number): ProjectPatterns {
    const key = `shift:${pad.group}:${pad.offset}:${semitones}`
    const pat = ProjectPatterns.group(p, pad.group)
    if (pat.open) return this.gesture(key, key, p, p)
    const len = Pattern.lengthTicks(pat)
    const moves = new Map<number, number>()
    pat.notes.forEach((n, i) => {
      if (on(n, pad, semitones) && n.tick < len) moves.set(i, floorMod(n.tick + dir, len))
    })
    return this.gesture(key, key, p, ProjectPatterns.with(p, pad.group, { ...pat, notes: settle(pat, moves, true).notes }))
  }

  /**
   * SHIFT + TIMING and a pad, stopped (timing correct): all of [pad]'s notes
   * that play (every pitch, or only [semitones]) onto [interval]'s grid swung
   * by [swing], wrapping round the pattern. Of two of one pitch that land on
   * the same tick, the first (in tick order) stays. A tap with other pads held
   * ([inRun]) is part of their gesture (correctRange): one checkpoint with
   * theirs.
   */
  correctPad(p: ProjectPatterns, pad: PhysicalPad, semitones: number | null, interval: Timing, swing: number, inRun = false): Corrected {
    if (!inRun) this.breakRuns()
    const pat = ProjectPatterns.group(p, pad.group)
    if (pat.open) return { patterns: inRun ? this.gesture(CORRECT_RUN, CORRECT_RUN, p, p) : p, moved: 0 }
    const len = Pattern.lengthTicks(pat)
    const { patterns, moved } = correct(p, pat, pad, semitones, interval, swing, (t) => t < len)
    return { patterns: inRun ? this.gesture(CORRECT_RUN, CORRECT_RUN, p, patterns) : this.edit(p, patterns), moved }
  }

  /**
   * SHIFT + TIMING with [pad] held while playing: its notes from global
   * [fromTick] to [toTick] (as eraseRange takes them) corrected as correctPad
   * does. Every range, of any pad, from the first hold to endRun is the same
   * gesture: one checkpoint. Corrected.moved counts this range's notes only.
   */
  correctRange(
    p: ProjectPatterns,
    pad: PhysicalPad,
    semitones: number | null,
    fromTick: number,
    toTick: number,
    interval: Timing,
    swing: number,
  ): Corrected {
    const pat = ProjectPatterns.group(p, pad.group)
    const anchor = PhaseAnchors.of(this.phase, pad.group)
    const start = Math.max(fromTick, anchor)
    if (pat.open || toTick <= start) return { patterns: this.gesture(CORRECT_RUN, CORRECT_RUN, p, p), moved: 0 }
    const len = Pattern.lengthTicks(pat)
    const whole = toTick - start >= len
    const from = localTick(start, anchor, pat)
    const to = localTick(toTick, anchor, pat)
    const { patterns, moved } = correct(p, pat, pad, semitones, interval, swing, (t) => t < len && (whole || (from <= to ? t >= from && t < to : t >= from || t < to)))
    return { patterns: this.gesture(CORRECT_RUN, CORRECT_RUN, p, patterns), moved }
  }

  /** The knob let go of or the pad lifted: the next step edit or correct is a gesture of its own. */
  endRun(): void {
    this.lastRun = null
  }

  /**
   * An edit of the scenes or the banks (a commit, a clear or delete, a
   * paste), from [before] to [after]: as edit, a checkpoint of its own when it
   * changed anything, and the gestures going on end.
   */
  editSeq(before: ProjectSeq, after: ProjectSeq): ProjectSeq {
    this.breakRuns()
    if (sameSeq(after, before)) return before
    this.pushSeq(ProjectSeq.withPlaying(before, this.closed(ProjectSeq.playing(before))))
    this.pending = true
    return after
  }

  /** The project's sequencer before the last checkpoint (those the same as [current] skipped), or null with none left. */
  undo(current: ProjectSeq): ProjectSeq | null {
    this.breakRuns()
    while (this.checkpoints.length > 0) {
      const c = this.checkpoints.pop()!
      if (!sameSeq(c, current)) {
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

  // Any edit but the run it is part of ends the gestures going on.
  private breakRuns(): void {
    this.lastErase = null
    this.lastRun = null
  }

  // A step edit or correct, part of the run [key]: its first change is a checkpoint, as edit, and the rest of the
  // run's none. It goes on from the last run when that was [follows].
  private gesture(follows: string, key: string, before: ProjectPatterns, after: ProjectPatterns): ProjectPatterns {
    this.lastErase = null
    const pushed = this.lastRun === follows && this.runPushed
    this.lastRun = key
    this.runPushed = pushed
    if (samePatterns(after, before)) return before
    if (pushed) return after
    this.runPushed = true
    return this.edit(before, after)
  }

  // stepVelocity and stepGate: [change] on every note on [step] of [group].
  private stepNotes(
    p: ProjectPatterns,
    key: string,
    group: number,
    step: number,
    interval: Timing,
    swing: number,
    change: (n: PatternNote) => PatternNote,
  ): ProjectPatterns {
    const pat = ProjectPatterns.group(p, group)
    if (pat.open) return this.gesture(key, key, p, p)
    const isOn = onStep(pat, step, interval, swing)
    return this.gesture(key, key, p, ProjectPatterns.with(p, group, { ...pat, notes: pat.notes.map((n) => (isOn(n) ? change(n) : n)) }))
  }

  // An erase, clear, length or double: its own checkpoint when it changed anything, and what is recorded next another.
  private edit(before: ProjectPatterns, after: ProjectPatterns): ProjectPatterns {
    if (samePatterns(after, before)) return before
    this.push(before)
    this.pending = true
    return after
  }

  private push(before: ProjectPatterns): void {
    this.pushSeq(ProjectSeq.withPlaying(this.seq, this.closed(before)))
  }

  private pushSeq(c: ProjectSeq): void {
    this.checkpoints.push(c)
    while (this.checkpoints.length > this.maxUndo) this.checkpoints.shift()
  }

  // Open groups go back as they were before the punch-in: closed, at their old length.
  private closed(p: ProjectPatterns): ProjectPatterns {
    let c = p
    for (let g = 0; g < 4; g++) {
      const pat = ProjectPatterns.group(c, g)
      if (pat.open) c = ProjectPatterns.with(c, g, pattern(Pattern.isEmpty(pat) ? this.openedFrom[g]! : pat.bars, pat.notes))
    }
    return c
  }
}

/** Whether [a] and [b] hold the same patterns (Kotlin's data class equals). */
export function samePatterns(a: ProjectPatterns, b: ProjectPatterns): boolean {
  if (a === b) return true
  if (a.groups.length !== b.groups.length) return false
  return a.groups.every((x, g) => samePattern(x, b.groups[g]!))
}

function on(n: PatternNote, pad: PhysicalPad, semitones: number | null): boolean {
  return n.offset === pad.offset && (semitones === null || n.semitones === semitones)
}

/** Whether a note plays on [step] of [pat] (notes past the end are on none). */
function onStep(pat: Pattern, step: number, interval: Timing, swing: number): (n: PatternNote) => boolean {
  const count = Steps.count(pat, interval)
  const len = Pattern.lengthTicks(pat)
  return (n) => n.tick < len && Steps.indexOf(n.tick, interval, swing, count) === step
}

/**
 * [pat]'s notes, in their order, with those at [moves]' indices at their new
 * ticks. Where notes of one pad and pitch then share a tick a moved one landed
 * on, one stays: a moved one when [movedWins], else the first as they were in
 * tick order. Also which notes were dropped.
 */
function settle(pat: Pattern, moves: ReadonlyMap<number, number>, movedWins: boolean): { notes: PatternNote[]; dropped: boolean[] } {
  const notes = pat.notes
  const len = Pattern.lengthTicks(pat)
  const keyOf = (n: PatternNote, t: number): string => `${n.offset}:${n.semitones}:${t}`
  // Only where a moved note landed can two meet.
  const landed = new Set([...moves].map(([i, t]) => keyOf(notes[i]!, t)))
  const rank = (i: number): number => (movedWins && !moves.has(i) ? 1 : 0)
  const order = notes.map((_, i) => i).sort((a, b) => rank(a) - rank(b) || notes[a]!.tick - notes[b]!.tick)
  const seen = new Set<string>()
  const dropped = notes.map(() => false)
  for (const i of order) {
    const t = moves.get(i) ?? notes[i]!.tick
    // Notes past the end aren't played: nothing lands on them.
    if (t >= len) continue
    const k = keyOf(notes[i]!, t)
    if (landed.has(k) && seen.has(k)) dropped[i] = true
    seen.add(k)
  }
  const out: PatternNote[] = []
  notes.forEach((n, i) => {
    if (dropped[i]) return
    const t = moves.get(i)
    out.push(t === undefined ? n : { ...n, tick: t })
  })
  return { notes: out, dropped }
}

/** [pad]'s notes at the ticks [selected] takes, onto the grid: the patterns, and how many moved or were dropped. */
function correct(
  p: ProjectPatterns,
  pat: Pattern,
  pad: PhysicalPad,
  semitones: number | null,
  interval: Timing,
  swing: number,
  selected: (tick: number) => boolean,
): Corrected {
  const len = Pattern.lengthTicks(pat)
  const moves = new Map<number, number>()
  pat.notes.forEach((n, i) => {
    if (on(n, pad, semitones) && selected(n.tick)) moves.set(i, floorMod(quantize(interval, n.tick, swing), len))
  })
  const { notes, dropped } = settle(pat, moves, false)
  const moved = pat.notes.filter((n, i) => dropped[i] || (moves.has(i) && moves.get(i) !== n.tick)).length
  return { patterns: ProjectPatterns.with(p, pad.group, { ...pat, notes }), moved }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
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
