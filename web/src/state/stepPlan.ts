// Port of app/src/main/kotlin/dev/arc/ep133/controller/StepPlan.kt
//
// STEP: the pattern a step at a time while stopped, and timing correct (the
// device's − / +, RECORD + pad, SHIFT + TIMING), as the controller keeps it.
//
// Web deltas:
// - What lights on the cursor's step ([StepUi.lit]) is a Set of
//   Steps.padKey strings ("3:n", "3:2") where Kotlin has (offset, semitones)
//   Pairs; [litHas] reads them.
// - Times are performance.now() milliseconds where Kotlin's are nanoTime.
// - pressureVelocity (Kotlin ArpPlan.kt) is here, as the web has no arp yet.
// - StepHosting has only MORPH's sense on the web: the panel takes the
//   function keys' place under the display line wherever Live shows one
//   (stepHosting is kept for the views' tests).

import { Keys, ROOT_NOTE, type NoteNames } from '../core/features/keys'
import type { PhysicalPad } from '../core/features/padNotes'
import { ProjectPatterns, Seq, Timing, timingTicks, type TimingSettings } from '../core/features/pattern'
import type { PatternRecorder } from '../core/features/patternRecorder'
import { Steps } from '../core/features/steps'
import type { TransportPhase } from '../core/features/transport'
import { MirrorText } from '../core/text/mirrorText'
import { ERASE_TAP_MS } from './patternPlan'
import { PressureSense } from './pressure'

/** LEN's knob: the note lengths it snaps through, in ticks, from a tick to a bar. */
export const STEP_GATES: readonly number[] = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 36, 48, 64, 72, 96, 128, 144, 192, 288, 384]

/** A step's note heard as the cursor lands on it sounds as long as its gate, but this long at least, and at most (ms). */
export const STEP_AUDITION_MIN_MS = 60
export const STEP_AUDITION_MAX_MS = 1500

/** The line keeps "5 corrected" this long after the last pad held to correct while playing lets go. */
export const CORRECT_SHOWN_MS = 1500

/**
 * A note as the STEP panel names it: its [pad], and its KEYS pitch
 * ([semitones] from Keys.ROOT_NOTE); null for a pad hit, and for a pad's
 * every pitch where PADS picks or corrects a pad.
 */
export interface StepNote {
  readonly pad: PhysicalPad
  readonly semitones: number | null
}

/** Kotlin's StepNote equality. */
export function sameNote(a: StepNote | null, b: StepNote | null): boolean {
  if (a === null || b === null) return a === b
  return a.pad.group === b.pad.group && a.pad.offset === b.pad.offset && a.semitones === b.semitones
}

/**
 * STEP as Live shows it: the panel [open] on [group]'s pattern, the cursor
 * ([step] of [count], [label] as the device shows it, at TIMING's
 * [interval]), the group's length ([bars]) and the bar the strip shows
 * ([page], from 0), the steps with notes ([occupied]), what lights on the
 * cursor's step ([lit]: Steps.padKey strings, a KEYS note by its pitch), the
 * first note's [velocity] and [gate] there (null: an empty step, the knobs
 * off), the panel's RECORD held ([recordHeld]), NUDGE latched and waiting
 * for a pad ([nudgePick]) and the note [picked] for − / +, CORRECT on
 * ([correct]: while playing too, where a pad held corrects as it plays), the
 * status line ([status]: "+ SNARE", "KICK → 1.2.2", "5 corrected",
 * "KICK +1 tk"; null shows the cursor), and what a screen reader says of the
 * last change ([said]).
 */
export interface StepUi {
  readonly open: boolean
  readonly group: number
  readonly step: number
  readonly count: number
  readonly label: string
  readonly bars: number
  readonly page: number
  readonly occupied: readonly boolean[]
  readonly lit: ReadonlySet<string>
  readonly velocity: number | null
  readonly gate: number | null
  readonly recordHeld: boolean
  readonly nudgePick: boolean
  readonly picked: StepNote | null
  readonly correct: boolean
  readonly status: string | null
  readonly said: string | null
  readonly interval: Timing
}

const DEFAULT_COUNT = (Seq.DEFAULT_BARS * Seq.TICKS_PER_BAR) / timingTicks(Timing.DEFAULT)

export const STEP_UI: StepUi = Object.freeze({
  open: false,
  group: 0,
  step: 0,
  count: DEFAULT_COUNT,
  label: MirrorText.stepLabel(0, Timing.DEFAULT),
  bars: Seq.DEFAULT_BARS,
  page: 0,
  occupied: new Array<boolean>(DEFAULT_COUNT).fill(false),
  lit: new Set<string>(),
  velocity: null,
  gate: null,
  recordHeld: false,
  nudgePick: false,
  picked: null,
  correct: false,
  status: null,
  said: null,
  interval: Timing.DEFAULT,
})

/** A press in the STEP panel: the [patterns] after it, and whether the pad sounds ([plays]; a pick doesn't). */
export interface StepPress {
  readonly patterns: ProjectPatterns
  readonly plays: boolean
}

/** − or + in the STEP panel: the [patterns] after it, and whether the cursor moved on (its notes [audition]). */
export interface StepMove {
  readonly patterns: ProjectPatterns
  readonly audition: boolean
}

/** The views of Live that offer the STEP panel: one group's pads, the four groups, KEYS' grid and KEYS' piano. */
export const StepView = { ONE_GROUP: 'ONE_GROUP', ALL_GROUPS: 'ALL_GROUPS', KEYS_GRID: 'KEYS_GRID', PIANO: 'PIANO' } as const
export type StepView = (typeof StepView)[keyof typeof StepView]

/** The view Live shows with KEYS [keysOn] on the [piano] (else its grid), or the pads' [oneGroup] (else the four groups). */
export function stepView(keysOn: boolean, piano: boolean, oneGroup: boolean): StepView {
  if (keysOn && piano) return StepView.PIANO
  if (keysOn) return StepView.KEYS_GRID
  return oneGroup ? StepView.ONE_GROUP : StepView.ALL_GROUPS
}

/** Whether Live offers the STEP chip and panel ([step] STEP given, [onLive] the Live tab, [transport] the pattern's). */
export function stepOffered(step: boolean, onLive: boolean, transport: boolean): boolean {
  return step && onLive && transport
}

/** How the STEP panel comes out: the display line growing into it, or its own face in the function keys' place. */
export const StepHosting = { MORPH: 'MORPH', SLOT: 'SLOT' } as const
export type StepHosting = (typeof StepHosting)[keyof typeof StepHosting]

/** How the STEP panel is hosted in [view], held [sideways] or upright, with the window [short]. */
export function stepHosting(view: StepView, sideways: boolean, short: boolean): StepHosting {
  switch (view) {
    case StepView.KEYS_GRID:
      return sideways ? StepHosting.SLOT : StepHosting.MORPH
    case StepView.PIANO:
      return short ? StepHosting.SLOT : StepHosting.MORPH
    default:
      return StepHosting.MORPH
  }
}

/** The group the STEP panel edits in [view]: the KEYS sound's ([keysGroup]) on KEYS' grid and piano, else the [group] shown. */
export function stepGroupFor(view: StepView, group: number, keysGroup: number | null): number | null {
  return view === StepView.KEYS_GRID || view === StepView.PIANO ? keysGroup : group
}

/** Whether the STEP panel opens with the transport in [phase]: stopped, or armed (disarmed first, as STOP does). */
export function stepOpens(phase: TransportPhase): boolean {
  return phase === 'STOPPED' || phase === 'ARMED'
}

/** Whether a pad or KEYS press arms the pattern's recording: RECORD armed, and not in SAMPLE ([sampling]) or the STEP panel ([stepping]). */
export function pressArms(phase: TransportPhase, sampling: boolean, stepping: boolean): boolean {
  return phase === 'ARMED' && !sampling && !stepping
}

/** The cursor at [to] where it stood at [from] (Steps.convert), wrapped into the pattern's [count] steps. */
export function cursorAt(step: number, from: Timing, to: Timing, count: number): number {
  return Steps.clampStep(Steps.convert(step, from, to), count)
}

/** The bar the strip shows (from 0) with the cursor on [step] at [interval]: the page follows the cursor. */
export function stepPage(step: number, interval: Timing): number {
  return Math.trunc((step * timingTicks(interval)) / Seq.TICKS_PER_BAR)
}

/** The first step of [bar] (from 0) at [interval]: where BAR's page puts the cursor. */
export function barStep(bar: number, interval: Timing): number {
  return Math.trunc((bar * Seq.TICKS_PER_BAR) / timingTicks(interval))
}

/** LEN's knob at [ticks]: the nearest of STEP_GATES (the shorter of two as near). */
export function snapGate(ticks: number): number {
  let best = STEP_GATES[0]!
  for (const g of STEP_GATES) if (Math.abs(g - ticks) < Math.abs(best - ticks)) best = g
  return best
}

/** How long a note [gate] ticks long sounds as the cursor auditions it, at [bpm]: 60 ms to 1.5 s. */
export function auditionMs(gate: number, bpm: number): number {
  const ms = Math.round((gate * 60000) / (bpm * Seq.PPQN))
  return Math.min(Math.max(ms, STEP_AUDITION_MIN_MS), STEP_AUDITION_MAX_MS)
}

/** A touch's pressure level (0..1) as a note's velocity, 1..127 (Kotlin ArpPlan.kt). */
export function pressureVelocity(level: number): number {
  return 1 + Math.round(126 * Math.min(Math.max(level, 0), 1))
}

/** [note] as the status line names it: a KEYS note by [names] ("MI"), else its sound's [name] in capitals ("KICK"), else the pad ("A 7"). */
export function stepWord(note: StepNote, name: string | null, names: NoteNames): string {
  if (note.semitones !== null) return Keys.name(ROOT_NOTE + note.semitones, names)
  const n = name?.trim() ?? ''
  if (n.length > 0) return n.toUpperCase()
  return `${note.pad.groupLetter} ${note.pad.label}`
}

/** Whether [note] has a note among [lit] (the cursor's step, in its group): any pitch on the pad, for a PADS note. */
export function litHas(lit: ReadonlySet<string>, note: StepNote): boolean {
  if (note.semitones !== null) return lit.has(Steps.padKey(note.pad.offset, note.semitones))
  const prefix = `${note.pad.offset}:`
  for (const k of lit) if (k.startsWith(prefix)) return true
  return false
}

// A finger down on [note]: whether it corrects as it lets go (CORRECT on, RECORD not held), and − / +'s shifts of its notes.
interface Down {
  readonly note: StepNote
  readonly corrects: boolean
  shifts: number
  net: number
}

// A pad held to correct while playing from [downAt]; [from] is the tick it has corrected to, once it holds.
interface CorrectHold {
  readonly note: StepNote
  readonly downAt: number
  from: number | null
}

/**
 * STEP as the controller keeps it: the panel open or not, on which group,
 * the cursor of each project's groups (in memory while arc runs, at the
 * interval it was set at, so a change of interval keeps its place and a
 * shorter length wraps it), the panel's RECORD, NUDGE and the note picked,
 * CORRECT, the fingers down while the panel is open (by their voice's key,
 * "live:<group>:<offset>" or "note:<midi>"), the pads held to correct while
 * playing, and the status line. Its edits are PatternRecorder's step edits
 * on the patterns handed in, at the TIMING handed in, and give the patterns
 * back; [word] names a note for the status. A touch's pressure, on a screen
 * that tells it (PressureSense), is a placed note's velocity.
 */
export class StepDesk {
  /** The panel is shown. */
  private _open = false
  /** The project whose cursors these are: the patterns handed in are its. */
  project = 0
  private _group = 0
  private _recordHeld = false
  private _nudgePick = false
  private _picked: StepNote | null = null
  private _correct = false
  private _status: string | null = null
  private _said: string | null = null
  // Each project's groups' cursors, by "project:group": the step, and the interval it was set at.
  private readonly cursors = new Map<string, { readonly step: number; readonly at: Timing }>()
  // The fingers down while the panel is open, by voice key, in the order pressed.
  private readonly down = new Map<string, Down>()
  // The pads held to correct while playing, by key.
  private readonly holds = new Map<string, CorrectHold>()
  // The notes the holds going on have corrected, for the line.
  private corrected = 0
  private readonly sense = new PressureSense()

  constructor(private readonly word: (n: StepNote) => string) {}

  get open(): boolean {
    return this._open
  }
  /** The group the panel steps through. */
  get group(): number {
    return this._group
  }
  /** The panel's RECORD is held: a press places its note on the step. */
  get recordHeld(): boolean {
    return this._recordHeld
  }
  /** NUDGE latched: a tap picks its pad instead of sounding. */
  get nudgePick(): boolean {
    return this._nudgePick
  }
  /** The note − / + nudge, picked on the cursor's step; null for none. */
  get picked(): StepNote | null {
    return this._picked
  }
  /** CORRECT on: a tap in the panel puts its pad's notes on the grid, and a pad held while playing corrects them as they pass. */
  get correct(): boolean {
    return this._correct
  }
  /** The panel's status line (null: the cursor shows). */
  get status(): string | null {
    return this._status
  }
  /** What a screen reader says of the last change. */
  get said(): string | null {
    return this._said
  }
  /** Whether a pad is held to correct while playing. */
  get holding(): boolean {
    return this.holds.size > 0
  }

  /** The cursor on [p]'s group at [interval]: where it was left, kept in its place and wrapped into the pattern. */
  cursor(p: ProjectPatterns, interval: Timing): number {
    const c = this.cursors.get(`${this.project}:${this._group}`)
    if (c === undefined) return 0
    return cursorAt(c.step, c.at, interval, Steps.count(ProjectPatterns.group(p, this._group), interval))
  }

  /** The panel opens on [group] of [project]'s patterns, the cursor where it was left. */
  openOn(project: number, group: number): void {
    this.project = project
    this._group = Math.min(Math.max(group, 0), 3)
    this._open = true
    this._status = null
  }

  /**
   * The panel closes (✕, PLAY, another project): the pick, NUDGE, RECORD
   * held, the fingers, the status and what a screen reader was told go (and
   * [recorder]'s run); CORRECT stays.
   */
  close(recorder: PatternRecorder): void {
    this._open = false
    this._picked = null
    this._nudgePick = false
    this._recordHeld = false
    this._status = null
    this._said = null
    this.down.clear()
    recorder.endRun()
  }

  /** Live shows [group] now: the panel steps through it, at its own cursor; a pick on another group's pad goes. */
  setGroup(group: number): void {
    if (group === this._group || group < 0 || group > 3) return
    this._group = group
    this._picked = null
    this._status = null
  }

  /** The panel's RECORD down or up ([held]). */
  record(held: boolean): void {
    this._recordHeld = held
    this._status = null
  }

  /** NUDGE latched ([on]: a tap picks its pad) or not (the pick goes); CORRECT goes off with it on. */
  nudge(on: boolean, recorder: PatternRecorder): void {
    this._nudgePick = on
    if (on) this.endCorrect()
    else this._picked = null
    this._status = null
    recorder.endRun()
  }

  /** CORRECT on or off; either way NUDGE and the pick go, and off, the pads held to correct let go. */
  setCorrect(on: boolean, recorder: PatternRecorder): void {
    if (!on) this.endCorrect()
    this._correct = on
    this._nudgePick = false
    this._picked = null
    this._status = null
    recorder.endRun()
  }

  /**
   * A finger down on voice [key] in the open panel, on [note] (its group
   * becomes the panel's, on the step the cursor shows), at the touch's
   * [pressure] (NaN: none told). With the panel's RECORD held it is placed on
   * the cursor's step at the pressure's velocity (else 127). Else, with NUDGE
   * waiting, it is picked instead and doesn't sound; else it only sounds, and
   * with CORRECT on its notes go onto the grid as it lets go ([release]).
   */
  press(key: string, note: StepNote, pressure: number, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): StepPress {
    if (note.pad.group !== this._group) {
      // The panel shows a step: the pad's group takes it over, rather than its own saved cursor.
      const shown = this.cursor(p, t.interval)
      this.setGroup(note.pad.group)
      this.setCursor(shown, t.interval)
    }
    this._status = null
    const level = this.sense.level(pressure)
    if (!this._recordHeld && this._nudgePick) {
      this.pick(note, p, recorder, t)
      return { patterns: p, plays: false }
    }
    this.down.delete(key)
    this.down.set(key, { note, corrects: this._correct && !this._recordHeld, shifts: 0, net: 0 })
    if (!this._recordHeld) return { patterns: p, plays: true }
    const step = this.cursor(p, t.interval)
    const out = recorder.stepPlace(p, note.pad, note.semitones, step, t.interval, t.swing, level !== null ? pressureVelocity(level) : 127)
    if (out !== p) {
      const w = this.word(note)
      this._status = MirrorText.stepPlaced(w)
      this._said = MirrorText.stepPlacedSpoken(w, MirrorText.stepLabel(step, t.interval))
    }
    return { patterns: out, plays: true }
  }

  /**
   * The finger on voice [key] up. With CORRECT on its note's notes go onto
   * the grid (PatternRecorder.correctPad: a tap), unless − / + shifted them
   * while it was held: that run ends instead.
   */
  release(key: string, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): ProjectPatterns {
    const d = this.down.get(key)
    if (d === undefined) return p
    this.down.delete(key)
    if (d.shifts > 0) {
      recorder.endRun()
      return p
    }
    if (!d.corrects || !this._correct) return p
    const r = recorder.correctPad(p, d.note.pad, d.note.semitones, t.interval, t.swing)
    this._status = MirrorText.correctedLine(r.moved)
    this._said = this._status
    return r.patterns
  }

  /**
   * [note] picked for − / + (a long press, or a tap with NUDGE waiting), when
   * it has a note on the cursor's step; the one picked already is let go of.
   * Not with CORRECT on. False when nothing was picked or let go of.
   */
  pick(note: StepNote, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): boolean {
    this._status = null
    if (this._correct || note.pad.group !== this._group || !litHas(this.lit(p, t), note)) return false
    this._picked = sameNote(this._picked, note) ? null : note
    recorder.endRun()
    return true
  }

  /**
   * − or + ([dir] -1 or +1). With CORRECT on and a pad held, its notes a tick
   * earlier or later; else, a note picked, it is nudged (a step on the swung
   * grid with TIMING's quantize, else a tick), the cursor following it; else
   * the cursor moves a step, wrapping round the pattern (its notes are
   * auditioned: [StepMove.audition]).
   */
  minusPlus(dir: number, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): StepMove {
    this._status = null
    const last = [...this.down.values()].at(-1)
    const held = this._correct ? last : undefined
    if (held !== undefined) {
      const out = recorder.shiftPad(p, held.note.pad, held.note.semitones, dir)
      held.shifts++
      held.net += dir
      const w = this.word(held.note)
      this._status = MirrorText.stepShifted(w, held.net)
      this._said = MirrorText.stepShiftedSpoken(w, held.net)
      return { patterns: out, audition: false }
    }
    const pick = this._picked
    const step = this.cursor(p, t.interval)
    if (pick !== null) {
      const r = recorder.nudge(p, pick.pad, pick.semitones, step, t.interval, t.swing, t.quantize, dir)
      this.setCursor(r.step, t.interval)
      const w = this.word(pick)
      const label = MirrorText.stepLabel(r.step, t.interval)
      this._status = MirrorText.stepNudged(w, label)
      this._said = MirrorText.stepNudgedSpoken(w, label)
      return { patterns: r.patterns, audition: false }
    }
    this.moveTo(step + dir, p, t)
    return { patterns: p, audition: true }
  }

  /** The strip's step [step] tapped: the cursor jumps there, and the pick goes. */
  jump(step: number, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): void {
    this._status = null
    if (this._picked !== null) recorder.endRun()
    this._picked = null
    this.moveTo(step, p, t)
  }

  /** BAR's page [bar] (from 0) tapped: the cursor jumps to its first step, and the pick goes. */
  page(bar: number, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): void {
    this.jump(barStep(bar, t.interval), p, recorder, t)
  }

  /** VEL's knob at [velocity] (1..127): every note on the cursor's step; nothing on an empty one. */
  velocity(velocity: number, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): ProjectPatterns {
    this._status = null
    const step = this.cursor(p, t.interval)
    if (Steps.notesOn(ProjectPatterns.group(p, this._group), step, t.interval, t.swing).length === 0) return p
    return recorder.stepVelocity(p, this._group, step, t.interval, t.swing, velocity)
  }

  /** LEN's knob at [ticks], snapped to STEP_GATES: every note on the cursor's step that long; nothing on an empty one. */
  gate(ticks: number, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings): ProjectPatterns {
    this._status = null
    const step = this.cursor(p, t.interval)
    if (Steps.notesOn(ProjectPatterns.group(p, this._group), step, t.interval, t.swing).length === 0) return p
    return recorder.stepGate(p, this._group, step, t.interval, t.swing, snapGate(ticks))
  }

  /**
   * A pad (or a KEYS note on it) pressed at [at] while playing with CORRECT
   * on, by [key]: what it corrects is known as it is held, or let go of
   * ([holdUp]). The line counts from 0 when no other pad is held.
   */
  holdDown(key: string, note: StepNote, at: number): void {
    if (!this._correct) return
    if (this.holds.size === 0) this.corrected = 0
    this.holds.set(key, { note, downAt: at, from: null })
    this._status = MirrorText.correctedLine(this.corrected)
  }

  /**
   * The pads held to correct while playing put their notes on the grid as
   * the playhead passes (PatternRecorder.correctRange), from where each was
   * pressed up to global tick [to] at [now]; [tickAt] is the tick heard at a
   * time. A hold shorter than a tap corrects nothing here. All the pads held
   * together are one UNDO step; the line counts the notes corrected.
   */
  held(p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings, to: number, now: number, tickAt: (ms: number) => number): ProjectPatterns {
    let out = p
    for (const h of this.holds.values()) {
      if (now - h.downAt < ERASE_TAP_MS) continue
      const from = h.from ?? Math.max(tickAt(h.downAt), 0)
      if (to <= from) continue
      const r = recorder.correctRange(out, h.note.pad, h.note.semitones, from, to, t.interval, t.swing)
      out = r.patterns
      this.corrected += r.moved
      h.from = to
      this._status = MirrorText.correctedLine(this.corrected)
    }
    return out
  }

  /**
   * The pad held to correct, by [key], let go of at [releasedAt]. A tap, or
   * a press while not playing ([tickAt] null), puts the pad's every note on
   * the grid; held while playing, it corrected its notes as they passed, up
   * to here. The line says how many, the last pad up ending the run.
   */
  holdUp(key: string, releasedAt: number, p: ProjectPatterns, recorder: PatternRecorder, t: TimingSettings, tickAt: ((ms: number) => number) | null): ProjectPatterns {
    const h = this.holds.get(key)
    if (h === undefined) return p
    this.holds.delete(key)
    let out: ProjectPatterns
    if (tickAt === null || (h.from === null && releasedAt - h.downAt < ERASE_TAP_MS)) {
      // Part of the gesture of the pads held with it, from the first down to the last up.
      const r = recorder.correctPad(p, h.note.pad, h.note.semitones, t.interval, t.swing, true)
      this.corrected += r.moved
      out = r.patterns
    } else {
      const from = h.from ?? Math.max(tickAt(h.downAt), 0)
      const to = tickAt(releasedAt)
      if (to > from) {
        const r = recorder.correctRange(p, h.note.pad, h.note.semitones, from, to, t.interval, t.swing)
        this.corrected += r.moved
        out = r.patterns
      } else {
        out = p
      }
    }
    if (this.holds.size === 0) recorder.endRun()
    this._status = MirrorText.correctedLine(this.corrected)
    this._said = this._status
    return out
  }

  /** STOP: the pads held to correct let go, correcting no more (the line keeps its count a moment). */
  holdsEnd(recorder: PatternRecorder): void {
    if (this.holds.size === 0) return
    this.holds.clear()
    recorder.endRun()
  }

  /** The line's "5 corrected" goes, a moment after the last pad held to correct while playing let go (not while the panel shows). */
  correctedShown(): void {
    if (this.holds.size === 0 && !this._open) this._status = null
  }

  /** What Live shows: the panel and the cursor's step on [p] at TIMING [t]. */
  ui(p: ProjectPatterns, t: TimingSettings): StepUi {
    const pat = ProjectPatterns.group(p, this._group)
    const interval = t.interval
    const step = this.cursor(p, interval)
    const notes = Steps.notesOn(pat, step, interval, t.swing)
    // The first in tick order (of two at one tick, the first recorded).
    let first = notes[0] ?? null
    for (const n of notes) if (first === null || n.tick < first.tick) first = n
    return {
      open: this._open,
      group: this._group,
      step,
      count: Steps.count(pat, interval),
      label: MirrorText.stepLabel(step, interval),
      bars: pat.bars,
      page: stepPage(step, interval),
      occupied: Steps.occupied(pat, interval, t.swing),
      lit: new Set(notes.map((n) => Steps.padKey(n.offset, n.semitones))),
      velocity: first?.velocity ?? null,
      gate: first?.gate ?? null,
      recordHeld: this._recordHeld,
      nudgePick: this._nudgePick,
      picked: this._picked,
      correct: this._correct,
      status: this._status,
      said: this._said,
      interval,
    }
  }

  // The pads on the cursor's step, as Steps.padsOn has them.
  private lit(p: ProjectPatterns, t: TimingSettings): Set<string> {
    return Steps.padsOn(ProjectPatterns.group(p, this._group), this.cursor(p, t.interval), t.interval, t.swing)
  }

  private setCursor(step: number, interval: Timing): void {
    this.cursors.set(`${this.project}:${this._group}`, { step, at: interval })
  }

  // The cursor onto [step], wrapped round [p]'s pattern; a screen reader hears where, and how many notes are there.
  private moveTo(step: number, p: ProjectPatterns, t: TimingSettings): void {
    const pat = ProjectPatterns.group(p, this._group)
    const s = Steps.clampStep(step, Steps.count(pat, t.interval))
    this.setCursor(s, t.interval)
    this._said = MirrorText.stepSpoken(MirrorText.stepLabel(s, t.interval), Steps.notesOn(pat, s, t.interval, t.swing).length)
  }

  // CORRECT's holds let go (the line's count with them, but for the panel's own status).
  private endCorrect(): void {
    this._correct = false
    this.holds.clear()
    this.corrected = 0
  }
}
