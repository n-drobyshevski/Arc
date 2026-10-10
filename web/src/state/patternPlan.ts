// Port of app/src/main/kotlin/dev/arc/ep133/controller/PatternPlan.kt
//
// PATTERN as Live's line and its sheet show it, and the pure helpers the
// controller's pattern code (pattern.ts) runs on.
//
// Web deltas:
// - PatternUiState's pads with notes are pad keys (group × 12 + offset).
// - patternVoices maps pad keys to the sample keys Live's output holds (a
//   PadVoice is the worklet's, liveMixer.ts), with no shapes: the web plays
//   every pad as the mixer's DEFAULT, as its presses do.
// - pressPlace has no OutputDelay: the web keeps no Bluetooth make-up, so the
//   tick heard is the tick stamped.
// - Times are performance.now() milliseconds where Kotlin's are System.nanoTime.

import { Pattern, ProjectPatterns, Seq, Timing, TimingSettings } from '../core/features/pattern'
import type { PatternRecorder } from '../core/features/patternRecorder'
import { Tempo } from '../core/features/tempo'
import type { TransportPhase, TransportState } from '../core/features/transport'

/**
 * PATTERN as Live's line and its sheet show it: the transport's [phase],
 * whether pads played go into the pattern ([recording]), the count-in's beat
 * as it is heard ([countIn], 1..4; null outside it), the settings ([timing],
 * [countInOn], [autoLength]), each group's length and whether it has notes
 * ([bars], [hasNotes], A..D), the pads with notes ([notePads]), the group
 * last played into ([focusGroup], whose position the line counts), ERASE
 * ([erase]), whether UNDO has something ([canUndo]), how many pads the patterns play have
 * sounds not in memory yet ([missing]) and the project they are [project]'s
 * (0: none known).
 */
export interface PatternUiState {
  readonly phase: TransportPhase
  readonly recording: boolean
  readonly countIn: number | null
  readonly timing: Timing
  /** TIMING whole: the interval, its swing and quantize or free time (the tempo sheet's TIMING page). */
  readonly timingSettings: TimingSettings
  readonly countInOn: boolean
  readonly autoLength: boolean
  readonly bars: readonly number[]
  readonly hasNotes: readonly boolean[]
  readonly notePads: ReadonlySet<number>
  readonly focusGroup: number
  /** ERASE: a pad tapped erases its notes, one held while playing erases them as they pass. */
  readonly erase: boolean
  readonly canUndo: boolean
  readonly missing: number
  readonly project: number
}

export const PATTERN_UI: PatternUiState = Object.freeze({
  phase: 'STOPPED',
  recording: false,
  countIn: null,
  timing: Timing.DEFAULT,
  timingSettings: TimingSettings.DEFAULT,
  countInOn: true,
  autoLength: false,
  bars: [Seq.DEFAULT_BARS, Seq.DEFAULT_BARS, Seq.DEFAULT_BARS, Seq.DEFAULT_BARS],
  hasNotes: [false, false, false, false],
  notePads: new Set<number>(),
  focusGroup: 0,
  erase: false,
  canUndo: false,
  missing: 0,
  project: 0,
})

/** Counting in or playing: the sequencer runs. */
export function patternRunning(ui: Pick<PatternUiState, 'phase'>): boolean {
  return ui.phase === 'COUNT_IN' || ui.phase === 'PLAYING'
}

/** Any group has notes. */
export function anyNotes(ui: Pick<PatternUiState, 'hasNotes'>): boolean {
  return ui.hasNotes.some((h) => h)
}

/** [ui] showing [p] (lengths, notes, pads with notes) and the transport as [state] has it. */
export function patternShown(ui: PatternUiState, p: ProjectPatterns, state: TransportState, canUndo: boolean): PatternUiState {
  const notePads = new Set<number>()
  p.groups.forEach((pat, g) => {
    for (const n of pat.notes) notePads.add(g * 12 + n.offset)
  })
  return {
    ...ui,
    phase: state.phase,
    recording: state.recording,
    // Only while counting in; the loop sets it as each beat is heard.
    countIn: state.phase === 'COUNT_IN' ? ui.countIn : null,
    bars: p.groups.map((g) => g.bars),
    hasNotes: p.groups.map((g) => !Pattern.isEmpty(g)),
    notePads,
    canUndo,
  }
}

/**
 * The sounds the patterns play: for each pad in [used] whose sound is in
 * memory ([voice] gives its sample key), that key; second, the pads with a
 * sound not in memory yet, to load. An empty pad plays nothing and isn't missing.
 */
export function patternVoices(
  used: Iterable<number>,
  voice: (pad: number) => string | 'missing' | null,
): { voices: Map<number, string>; missing: Set<number> } {
  const voices = new Map<number, string>()
  const missing = new Set<number>()
  for (const pad of used) {
    const v = voice(pad)
    if (v === 'missing') missing.add(pad)
    else if (v !== null) voices.set(pad, v)
  }
  return { voices, missing }
}

/** Whether two plans' sounds are the same: the same pads, each with the same sample. */
export function sameVoices(a: ReadonlyMap<number, string>, b: ReadonlyMap<number, string>): boolean {
  if (a.size !== b.size) return false
  for (const [pad, k] of a) if (b.get(pad) !== k) return false
  return true
}

/**
 * The pattern's tempo: the EP-133's while it sends its clock ([device], to
 * 0.1 BPM as the display has it), else the phone's ([liveTempo]).
 */
export function patternBpm(device: number | null | undefined, liveTempo: number): number {
  if (device !== null && device !== undefined && device > 0) return Math.floor(device * 10 + 0.5) / 10
  return Tempo.clamp(liveTempo)
}

/**
 * The global tick heard at [ms] in a run a pad's press started at
 * [pressAt] (tick 0 there), at [bpm]: for the presses before the
 * sequencer's timeline is out. Fractional; below 0 before the press.
 */
export function pressTickAt(ms: number, pressAt: number, bpm: number): number {
  return ((ms - pressAt) * bpm * Seq.PPQN) / 60e3
}

/**
 * The pass a note just recorded isn't played in: [skipPass] (the grid put it
 * after it was heard), else pass 0 for the [first] note of a run a press
 * started, or one heard [early] in it (before its timeline is out). Null:
 * every pass plays it.
 */
export function pressSkip(skipPass: number | null, first: boolean, early: boolean): number | null {
  return skipPass ?? (first || early ? 0 : null)
}

/** The count-in's beat heard at global [tick], 1..4 through the bar before tick 0; null before it and from tick 0. */
export function countInBeat(tick: number): number | null {
  if (tick >= 0) return null
  const beat = Math.floor(tick / Seq.PPQN) + Tempo.BEATS_PER_BAR + 1
  return beat >= 1 && beat <= Tempo.BEATS_PER_BAR ? beat : null
}

/**
 * [p] with the notes [held] (by id, their pads or keys still down) ended at
 * global [tick], as recording stops there: each keeps the gate it had up to then.
 */
export function heldNotesEnded(p: ProjectPatterns, recorder: PatternRecorder, held: Iterable<number>, tick: number): ProjectPatterns {
  let out = p
  for (const id of held) out = recorder.noteOff(out, id, tick)
  return out
}

/** [p] without note [id] (a press that was a scroll after all); [p] itself when no note has it. */
export function withoutNote(p: ProjectPatterns, id: number): ProjectPatterns {
  if (id === 0) return p
  for (let g = 0; g < 4; g++) {
    const pat = ProjectPatterns.group(p, g)
    if (!pat.notes.some((n) => n.id === id)) continue
    return ProjectPatterns.with(p, g, { ...pat, notes: pat.notes.filter((n) => n.id !== id) })
  }
  return p
}
