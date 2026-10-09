// Port of core/src/main/kotlin/dev/arc/ep133/features/Scenes.kt
//
// Patterns and scenes, as MAIN and GROUP pick them on the device, and copy and
// paste: each operation is pure, taking a project's sequencer and giving the
// new one (the very one when nothing changes). Picking a pattern or a scene is
// not an edit; the rest are (PatternRecorder.editSeq).
//
// Web deltas:
// - Clip is a union of plain readonly interfaces told apart by `kind`, built
//   by `Clip.PatternClip(...)`, `Clip.BarClip(...)` and `Clip.PadClip(...)`.
// - The enum classes SceneErase and SwitchTime are string unions plus const
//   objects of the same name: SceneErase's values are 'cleared' and
//   'deleted', SwitchTime's its `id`s (`time.id` is `time`);
//   `SwitchTime.entries` is SWITCH_TIMES.
// - SceneErased is a plain readonly interface.
// - The object's functions are on the `SceneOps` const object; switchTick's
//   Long is a whole JS number (never -0).

import type { PhysicalPad } from './padNotes'
import { Pattern, ProjectPatterns, ProjectSeq, Scene, Seq, pattern, type PatternNote } from './pattern'

/** A whole pattern: its bars and notes. */
export interface PatternClip {
  readonly kind: 'pattern'
  readonly pattern: Pattern
}

/** A bar's notes, their ticks from the bar's start (0 until 384). */
export interface BarClip {
  readonly kind: 'bar'
  readonly notes: readonly PatternNote[]
}

/** One pad's notes, every pitch, at their ticks in the pattern, which was [sourceLength] ticks long. */
export interface PadClip {
  readonly kind: 'pad'
  readonly notes: readonly PatternNote[]
  readonly sourceLength: number
}

/**
 * What the clipboard holds, as SHIFT + C copies it on the device and
 * SHIFT + D pastes it (kept in memory, never saved). The notes' ids are 0.
 */
export type Clip = PatternClip | BarClip | PadClip

export const Clip = {
  PatternClip: (p: Pattern): PatternClip => ({ kind: 'pattern', pattern: p }),
  BarClip: (notes: readonly PatternNote[]): BarClip => ({ kind: 'bar', notes }),
  PadClip: (notes: readonly PatternNote[], sourceLength: number): PadClip => ({ kind: 'pad', notes, sourceLength }),
} as const

/** What ERASE + MAIN did: emptied the scene's patterns (CLR) or deleted the scene (DEL). */
export type SceneErase = 'cleared' | 'deleted'

export const SceneErase = { CLEARED: 'cleared', DELETED: 'deleted' } as const

/** A scene erased: the [seq] after it, and which it was. */
export interface SceneErased {
  readonly seq: ProjectSeq
  readonly erase: SceneErase
}

/**
 * When a pattern or scene picked while the sequencer plays takes over (the
 * device's 410 to 412): at once, at the end of the bar, or at the end of the
 * group's pattern. The value is the word kept in settings.
 */
export type SwitchTime = 'now' | 'bar' | 'ptn'

/** SwitchTime.entries, in declaration order. */
export const SWITCH_TIMES: readonly SwitchTime[] = ['now', 'bar', 'ptn']

export const SwitchTime = {
  IMMEDIATE: 'now',
  BAR: 'bar',
  PATTERN: 'ptn',
  DEFAULT: 'now',
  of(id: string): SwitchTime | null {
    return (SWITCH_TIMES as readonly string[]).includes(id) ? (id as SwitchTime) : null
  },
} as const

/** GROUP + − / + or a number: the scene playing gives [group] pattern [n] (held to 1..99). */
function selectPattern(seq: ProjectSeq, group: number, n: number): ProjectSeq {
  const k = Math.min(Math.max(n, 1), Seq.MAX_PATTERNS)
  if (ProjectSeq.selected(seq, group) === k) return seq
  return ProjectSeq.withScenes(seq, seq.scenes.map((s, i) => (i === seq.scene ? Scene.with(s, group, k) : s)))
}

/**
 * SHIFT + A: the first pattern of [group] after the one selected, round
 * 1..99, with no notes; the one selected when every pattern has notes.
 */
function nextFree(seq: ProjectSeq, group: number): number {
  const from = ProjectSeq.selected(seq, group)
  for (let i = 1; i < Seq.MAX_PATTERNS; i++) {
    const n = ((from - 1 + i) % Seq.MAX_PATTERNS) + 1
    if (Pattern.isEmpty(ProjectSeq.pattern(seq, group, n))) return n
  }
  return from
}

/** MAIN + − / + or a number: scene [index] (held to those there are). */
function selectScene(seq: ProjectSeq, index: number): ProjectSeq {
  const i = Math.min(Math.max(index, 0), seq.scenes.length - 1)
  return i === seq.scene ? seq : ProjectSeq.withScenes(seq, seq.scenes, i)
}

/** + past the last scene: a new one at the end, each group on its next free pattern (a blank canvas), selected. None past 99. */
function newScene(seq: ProjectSeq): ProjectSeq {
  if (seq.scenes.length >= Seq.MAX_SCENES) return seq
  const s: Scene = { patterns: [0, 1, 2, 3].map((g) => nextFree(seq, g)) }
  return ProjectSeq.withScenes(seq, [...seq.scenes, s], seq.scenes.length)
}

/**
 * COMMIT (SHIFT + MAIN): a copy of the scene, right after it, selected. Each
 * group's pattern with notes is copied into the group's next free pattern,
 * which the new scene plays; an empty one is shared as it is. A group with no
 * free pattern left shares its pattern too. None past 99 scenes.
 */
function commit(seq: ProjectSeq): ProjectSeq {
  if (seq.scenes.length >= Seq.MAX_SCENES) return seq
  let out = seq
  const numbers = [0, 1, 2, 3].map((g) => {
    const from = ProjectSeq.selected(seq, g)
    const pat = ProjectSeq.pattern(seq, g, from)
    const to = Pattern.isEmpty(pat) ? from : nextFree(seq, g)
    if (to !== from) out = ProjectSeq.withPattern(out, g, to, copyOf(pat))
    return to
  })
  const at = seq.scene + 1
  return ProjectSeq.withScenes(out, [...seq.scenes.slice(0, at), { patterns: numbers }, ...seq.scenes.slice(at)], at)
}

/** CLR: the scene's four patterns lose their notes; the lengths stay, as PatternRecorder.clear keeps them. */
function clearScene(seq: ProjectSeq): ProjectSeq {
  return ProjectSeq.withPlaying(seq, { groups: ProjectSeq.playing(seq).groups.map((p) => ({ ...p, notes: [] })) })
}

/**
 * DEL: the scene goes, when its four patterns have no notes and it isn't the
 * only one; the later ones move down and the index stays (on the last one
 * when it was the last).
 */
function deleteScene(seq: ProjectSeq): ProjectSeq {
  if (!ProjectPatterns.isEmpty(ProjectSeq.playing(seq)) || seq.scenes.length <= 1) return seq
  return ProjectSeq.withScenes(seq, seq.scenes.filter((_, i) => i !== seq.scene), seq.scene)
}

/** ERASE + MAIN held: deleteScene when it can (the scene empty, and not the only one), else clearScene. */
function eraseScene(seq: ProjectSeq): SceneErased {
  const deleted = deleteScene(seq)
  return deleted !== seq ? { seq: deleted, erase: SceneErase.DELETED } : { seq: clearScene(seq), erase: SceneErase.CLEARED }
}

/** SHIFT + C twice: [group]'s selected pattern. */
function copyPattern(seq: ProjectSeq, group: number): PatternClip {
  return Clip.PatternClip(copyOf(ProjectSeq.pattern(seq, group, ProjectSeq.selected(seq, group))))
}

/** SHIFT + D: [group]'s selected pattern becomes a copy of the clip's (bars and notes). */
function pastePattern(seq: ProjectSeq, group: number, clip: PatternClip): ProjectSeq {
  const p = clip.pattern
  const notes = p.notes.slice(0, Seq.MAX_NOTES).map((n) => ({ ...n, id: 0 }))
  return ProjectSeq.withPattern(seq, group, ProjectSeq.selected(seq, group), pattern(p.bars, notes))
}

/** SHIFT + C: the notes in [bar] (from 0) of [group]'s selected pattern, their ticks from the bar's start. */
function copyBar(seq: ProjectSeq, group: number, bar: number): BarClip {
  const start = bar * Seq.TICKS_PER_BAR
  const notes = ProjectSeq.pattern(seq, group, ProjectSeq.selected(seq, group)).notes.filter((n) => n.tick >= start && n.tick < start + Seq.TICKS_PER_BAR)
  return Clip.BarClip(notes.map((n) => ({ ...n, tick: n.tick - start, id: 0 })))
}

/** SHIFT + D: [bar] (from 0) of [group]'s selected pattern holds the clip's notes instead of its own; nothing past the end. */
function pasteBar(seq: ProjectSeq, group: number, bar: number, clip: BarClip): ProjectSeq {
  const n = ProjectSeq.selected(seq, group)
  const pat = ProjectSeq.pattern(seq, group, n)
  if (bar < 0 || bar >= pat.bars) return seq
  const start = bar * Seq.TICKS_PER_BAR
  const kept = pat.notes.filter((note) => !(note.tick >= start && note.tick < start + Seq.TICKS_PER_BAR))
  const pasted = clip.notes.map((note) => ({ ...note, tick: note.tick + start, id: 0 }))
  return ProjectSeq.withPattern(seq, group, n, { ...pat, notes: [...kept, ...pasted].slice(0, Seq.MAX_NOTES) })
}

/** A pad held + SHIFT + C: every note on [pad] (every pitch) in its group's selected pattern. */
function copyPad(seq: ProjectSeq, pad: PhysicalPad): PadClip {
  const pat = ProjectSeq.pattern(seq, pad.group, ProjectSeq.selected(seq, pad.group))
  return Clip.PadClip(pat.notes.filter((n) => n.offset === pad.offset).map((n) => ({ ...n, id: 0 })), Pattern.lengthTicks(pat))
}

/**
 * Another pad held + SHIFT + D: [pad]'s notes (every pitch) in its group's
 * selected pattern are the clip's instead, on [pad] at the same ticks; it can
 * be in another group. Notes at or past that pattern's end are left out.
 */
function pastePad(seq: ProjectSeq, pad: PhysicalPad, clip: PadClip): ProjectSeq {
  const n = ProjectSeq.selected(seq, pad.group)
  const pat = ProjectSeq.pattern(seq, pad.group, n)
  const len = Pattern.lengthTicks(pat)
  const kept = pat.notes.filter((note) => note.offset !== pad.offset)
  const pasted = clip.notes.filter((note) => note.tick < len).map((note) => ({ ...note, offset: pad.offset, id: 0 }))
  return ProjectSeq.withPattern(seq, pad.group, n, { ...pat, notes: [...kept, ...pasted].slice(0, Seq.MAX_NOTES) })
}

/**
 * The global tick at which a change queued at [globalTick] takes over a group
 * whose pattern is [currentLengthTicks] long: at once (the next whole tick),
 * at the next bar line, or at the next end of the group's pattern. A press
 * exactly on a line switches there. Stopped, the caller switches at once
 * whatever [time] is. A scene's change queues each group: under PATTERN each
 * has its own tick, under BAR they share one.
 */
function switchTick(time: SwitchTime, globalTick: number, currentLengthTicks: number): number {
  switch (time) {
    case SwitchTime.IMMEDIATE:
      return Math.ceil(globalTick) + 0
    case SwitchTime.BAR:
      return nextLine(globalTick, Seq.TICKS_PER_BAR)
    case SwitchTime.PATTERN:
      return nextLine(globalTick, Math.max(currentLengthTicks, 1))
  }
}

/** The first multiple of [every] at or after [tick] (+ 0: never -0). */
function nextLine(tick: number, every: number): number {
  return Math.ceil(tick / every) * every + 0
}

/** [p] as a copy goes in another slot: closed, its notes' ids 0. */
function copyOf(p: Pattern): Pattern {
  return pattern(p.bars, p.notes.map((n) => ({ ...n, id: 0 })))
}

/** The Kotlin `SceneOps` object. */
export const SceneOps = {
  selectPattern,
  nextFree,
  selectScene,
  newScene,
  commit,
  clearScene,
  deleteScene,
  eraseScene,
  copyPattern,
  pastePattern,
  copyBar,
  pasteBar,
  copyPad,
  pastePad,
  switchTick,
} as const
