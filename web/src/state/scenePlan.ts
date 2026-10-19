// Port of app/src/main/kotlin/dev/arc/ep133/controller/ScenePlan.kt
//
// SCENES: the pattern each group plays, switched while playing, and copy and
// paste (the device's GROUP, MAIN, SHIFT + C / D), as the controller keeps them.
//
// Web deltas:
// - Kotlin's enums are string unions with const objects (ClipMode, PadStage).
// - SwitchTime.cycled() is [cycledSwitch]; SceneUi's groups are an array.
// - Weight (BeatPlan.kt) is beatPlan.ts's string union, Weight.of its weightOf.
// - SceneUi.chain is the project chain's steps alone (Kotlin's ChainUi.chain.steps),
//   which SHARE CHAIN names; the CHAIN row itself is not on the web yet.

import type { ChainStep } from '../core/features/chain'
import type { PhysicalPad } from '../core/features/padNotes'
import { Pattern, ProjectPatterns, ProjectSeq, Seq, pattern } from '../core/features/pattern'
import type { PatternRecorder } from '../core/features/patternRecorder'
import { SWITCH_TIMES, SceneErase, SceneOps, SwitchTime, type Clip, type SceneErased } from '../core/features/scenes'
import { PhaseAnchors, localTick } from '../core/features/sequencer'
import { MirrorText } from '../core/text/mirrorText'
import { weightOf, type Weight } from './beatPlan'

/** What the CLIP row copies and pastes: a whole pattern, one bar of it, or one pad's notes. */
export const ClipMode = { PTN: 'PTN', BAR: 'BAR', PAD: 'PAD' } as const
export type ClipMode = (typeof ClipMode)[keyof typeof ClipMode]
export const CLIP_MODES: readonly ClipMode[] = ['PTN', 'BAR', 'PAD']

/**
 * Where the PAD clip is: nothing waits (NONE), COPY waits for the pad to copy
 * (SOURCE), or PASTE waits for the pad to paste onto (TARGET). A pad tapped
 * while one waits is the clip's: it neither plays nor records.
 */
export const PadStage = { NONE: 'NONE', SOURCE: 'SOURCE', TARGET: 'TARGET' } as const
export type PadStage = (typeof PadStage)[keyof typeof PadStage]

/** What the clipboard holds as the CLIP row names it: its [mode] and [what] ("A01", "bar 2", "KICK"). */
export interface ClipUi {
  readonly mode: ClipMode
  readonly what: string
}

/**
 * A group's column in the scene panel: the pattern it plays ([number], 1..99),
 * the one waiting to take over ([queued]; null for none), the numbers with
 * notes ([filled], for the 1–99 grid), the next free one after the number
 * shown ([nextFree]), the pattern's length ([bars]) and its first bar as
 * [lights] (Live tools' Claude page draws them on its glass).
 */
export interface SceneGroupUi {
  readonly number: number
  readonly queued: number | null
  readonly filled: ReadonlySet<number>
  readonly nextFree: number
  readonly bars: number
  readonly lights: readonly (Weight | null)[]
}

/** The steps a bar is drawn in as lights. */
export const LIGHTS = 16
export const NO_LIGHTS: readonly (Weight | null)[] = Array.from({ length: LIGHTS }, () => null)

/**
 * [p]'s first bar as [LIGHTS] step lights: the hardest hit starting in each
 * sixteenth (on any pad, to the nearest one, the last half step going round
 * to the first), null where none does.
 */
export function stepLights(p: Pattern): (Weight | null)[] {
  const step = Seq.TICKS_PER_BAR / LIGHTS
  const top = new Array<number>(LIGHTS).fill(-1)
  const end = Math.min(Seq.TICKS_PER_BAR, Pattern.lengthTicks(p))
  for (const n of p.notes) {
    if (n.tick < 0 || n.tick >= end) continue
    const i = Math.floor((n.tick + step / 2) / step) % LIGHTS
    top[i] = Math.max(top[i]!, n.velocity)
  }
  return top.map((v) => (v < 0 ? null : weightOf(v)))
}

/**
 * Scenes as Live shows them: the panel [open] on the scene at [index] of
 * [count] ([label] "S01"), the focused column ([group]) and the four columns
 * ([groups]), the scene waiting to take over ([sceneQueued], as shown from
 * 1), whether the CLR hold key is DEL ([canDelete]), the setting for when a
 * pick takes over ([switchTime]), the clipboard ([clip]) and the CLIP row
 * ([clipMode], [bar], [padStage]), the 1–99 grid open for a group
 * ([gridGroup]), the status line ([status]; null shows the scene), what
 * a screen reader says of the last change ([said]), and the project chain's
 * steps ([chain]).
 */
export interface SceneUi {
  readonly open: boolean
  readonly index: number
  readonly count: number
  readonly label: string
  readonly group: number
  readonly groups: readonly SceneGroupUi[]
  readonly sceneQueued: number | null
  readonly canDelete: boolean
  readonly switchTime: SwitchTime
  readonly clip: ClipUi | null
  readonly clipMode: ClipMode
  readonly padStage: PadStage
  readonly bar: number
  readonly gridGroup: number | null
  readonly status: string | null
  readonly said: string | null
  readonly chain: readonly ChainStep[]
}

export const SCENE_UI: SceneUi = Object.freeze({
  open: false,
  index: 0,
  count: 1,
  label: MirrorText.sceneLabel(0),
  group: 0,
  groups: [0, 1, 2, 3].map(() => ({ number: 1, queued: null, filled: new Set<number>(), nextFree: 2, bars: Seq.DEFAULT_BARS, lights: NO_LIGHTS })),
  sceneQueued: null,
  canDelete: false,
  switchTime: SwitchTime.DEFAULT,
  clip: null,
  clipMode: ClipMode.PTN,
  padStage: PadStage.NONE,
  bar: 0,
  gridGroup: null,
  status: null,
  said: null,
  chain: [],
})

/** A pattern change waiting: its group goes to pattern [to] at global tick [at] ([time], the setting it was made at). */
export interface QueuedPick {
  readonly to: number
  readonly at: number
  readonly time: SwitchTime
}

/** A scene change waiting: every group goes to scene [to] (an index; the number of scenes is a new one) at global tick [at]. */
interface QueuedScene {
  readonly to: number
  readonly at: number
  readonly time: SwitchTime
}

/** The global tick at which a pick made at [tick] takes over (SceneOps.switchTick, from [anchor]), no earlier than bar 1. */
export function queueTick(time: SwitchTime, tick: number, lengthTicks: number, anchor = 0): number {
  return Math.max(SceneOps.switchTick(time, tick, lengthTicks, anchor), 0)
}

/** CHANGE's chip: the next choice, Immediate → Bar end → Pattern end → Immediate. */
export function cycledSwitch(t: SwitchTime): SwitchTime {
  return SWITCH_TIMES[(SWITCH_TIMES.indexOf(t) + 1) % SWITCH_TIMES.length]!
}

/** − / + on a pattern number, wrapping round 1..99. */
export function wrapPattern(n: number, dir: number): number {
  const m = Seq.MAX_PATTERNS
  return ((((n - 1 + dir) % m) + m) % m) + 1
}

/** The pattern numbers of [group] that have notes (filled in the grid). */
export function filledPatterns(seq: ProjectSeq, group: number): Set<number> {
  const out = new Set<number>()
  for (const [n, p] of seq.banks[group] ?? new Map<number, Pattern>()) if (!Pattern.isEmpty(p)) out.add(n)
  return out
}

/**
 * [pat] as punch-out closes a pattern recorded with AUTO length, at global
 * [tick]: 1, 2, 4 or 8 bars, by the bars gone by and its notes. One with none
 * is a bar; one that is closed already is as it is.
 */
export function closedAt(pat: Pattern, tick: number, anchor = 0): Pattern {
  if (!pat.open) return pat
  if (Pattern.isEmpty(pat)) return pattern(Seq.DEFAULT_BARS, pat.notes)
  const lastBar = Math.trunc(Math.max(...pat.notes.map((n) => n.tick)) / Seq.TICKS_PER_BAR) + 1
  const elapsed = Math.max(Math.ceil(localTick(tick, anchor, pat) / Seq.TICKS_PER_BAR), lastBar)
  return pattern(Seq.LENGTHS.find((l) => l >= elapsed) ?? Seq.MAX_AUTO_BARS, pat.notes)
}

/**
 * Scenes as the controller keeps them: the panel open or not, the focused
 * column, the 1–99 grid, the CLIP row and its clipboard (in memory while arc
 * runs, never saved), the pad flow's stage, the picks waiting for their
 * tick, and the status line. The picks and edits are SceneOps on the
 * sequencer handed in, and give it back: a pick while the sequencer plays
 * ([at] a tick, else it is stopped) is queued instead, the sequencer handed
 * back as it was, until [due] finds the playhead past it. The edits (COMMIT,
 * CLR / DEL, the pastes) go through PatternRecorder.editSeq, one UNDO step
 * each.
 *
 * A group's pick replaces that group's queue and cancels a scene's; a
 * scene's cancels every group's. A pick of what already plays cancels the
 * queue it would have replaced. A scene change queues all four groups at one
 * tick: the next bar line under BAR, and under PATTERN the end of the longest
 * pattern playing. A pattern taking over a group starts at its bar 1 on the
 * tick it takes over at ([phase]).
 */
export class SceneDesk {
  private _open = false
  private _group = 0
  private _gridGroup: number | null = null
  private _clipMode: ClipMode = ClipMode.PTN
  private _phase: PhaseAnchors = PhaseAnchors.ZERO
  private _padStage: PadStage = PadStage.NONE
  private _bar = 0
  private _status: string | null = null
  private _said: string | null = null
  // The clipboard, and its name as the CLIP row shows it.
  private clip: Clip | null = null
  private clipWhat: string | null = null
  // The picks waiting for their tick: a group's by group (in the order each group was first picked), and a scene's.
  private readonly picks = new Map<number, QueuedPick>()
  private scene: QueuedScene | null = null

  constructor(private readonly word: (pad: PhysicalPad) => string) {}

  get open(): boolean {
    return this._open
  }
  /** The focused column: the group the CLIP row's pattern and bar copy and paste work on. */
  get group(): number {
    return this._group
  }
  /** The 1–99 grid is open over the pads for this group; null for none. */
  get gridGroup(): number | null {
    return this._gridGroup
  }
  get clipMode(): ClipMode {
    return this._clipMode
  }
  /** Where each group's pattern started: the global tick of its bar 1. */
  get phase(): PhaseAnchors {
    return this._phase
  }
  /** The PAD flow: nothing, COPY waiting for a pad, or PASTE waiting for one. */
  get padStage(): PadStage {
    return this._padStage
  }
  get bar(): number {
    return this._bar
  }
  get status(): string | null {
    return this._status
  }
  get said(): string | null {
    return this._said
  }

  /** How many picks wait for their tick: a group's each, or the scene's. */
  get waiting(): number {
    return this.picks.size + (this.scene !== null ? 1 : 0)
  }

  /** The global tick the first pick waiting takes over at; null for none. */
  dueTick(): number | null {
    const ticks = [...(this.scene !== null ? [this.scene.at] : []), ...[...this.picks.values()].map((q) => q.at)]
    return ticks.length === 0 ? null : Math.min(...ticks)
  }

  /** The panel opens with column [group] focused. */
  openOn(group: number): void {
    this._open = true
    this._group = Math.min(Math.max(group, 0), 3)
    this._status = null
    this._said = null
  }

  /** The panel closes: the grid, the PAD flow, the status and what was said go; the picks waiting and the clipboard stay. */
  close(): void {
    this._open = false
    this._gridGroup = null
    this._padStage = PadStage.NONE
    this._status = null
    this._said = null
  }

  /** Another project: the panel closes, and the picks waiting, where the patterns started and the CLIP row go; the clipboard stays. */
  reset(): void {
    this.close()
    this.picks.clear()
    this.scene = null
    this._phase = PhaseAnchors.ZERO
    this._clipMode = ClipMode.PTN
    this._bar = 0
  }

  /** The transport starts: every pattern starts at bar 1. */
  restart(): void {
    this._phase = PhaseAnchors.ZERO
  }

  /** Live shows [group] now (or its column was tapped): the CLIP row works on it. */
  focus(group: number): void {
    if (group === this._group || group < 0 || group > 3) return
    this._group = group
    this._status = null
  }

  /** The 1–99 grid opens over the pads for [group], or closes (null). */
  grid(group: number | null): void {
    this._gridGroup = group !== null && group >= 0 && group <= 3 ? group : null
    this._padStage = PadStage.NONE
    this._status = null
  }

  /** The picks waiting are dropped (an UNDO, or an edit that moves the scenes). */
  cancel(): void {
    this.picks.clear()
    this.scene = null
  }

  /**
   * [group]'s pattern picked, [n] (1..99): at once while stopped ([at] null),
   * else queued for the tick [time] gives from [at], the global tick heard
   * now. It replaces the group's queue, and cancels a scene's; the pattern
   * playing picked cancels the queue. The grid closes.
   */
  pickPattern(seq: ProjectSeq, group: number, n: number, at: number | null, time: SwitchTime): ProjectSeq {
    this._gridGroup = null
    this._status = null
    const k = Math.min(Math.max(n, 1), Seq.MAX_PATTERNS)
    this.scene = null
    if (at === null || k === ProjectSeq.selected(seq, group)) {
      this.picks.delete(group)
      const out = SceneOps.selectPattern(seq, group, k)
      this._said = this.patternSaid(out, group)
      return out
    }
    const playing = ProjectSeq.pattern(seq, group, ProjectSeq.selected(seq, group))
    // A group picked again keeps its place in the order (Kotlin's LinkedHashMap).
    this.picks.set(group, { to: k, at: queueTick(time, at, Pattern.lengthTicks(playing), PhaseAnchors.of(this._phase, group)), time })
    this._said =
      time === SwitchTime.IMMEDIATE ? MirrorText.patternSpoken(group, k, ProjectSeq.pattern(seq, group, k).bars) : MirrorText.patternQueuedSpoken(group, k, time)
    return seq
  }

  /** − or + ([dir]) on [group]'s number as shown (the queued one, if any), wrapping round 1..99: a pick. */
  stepPattern(seq: ProjectSeq, group: number, dir: number, at: number | null, time: SwitchTime): ProjectSeq {
    return this.pickPattern(seq, group, wrapPattern(this.shown(seq, group), dir), at, time)
  }

  /** NEXT FREE: the first pattern after the number shown with no notes, picked. */
  pickNextFree(seq: ProjectSeq, group: number, at: number | null, time: SwitchTime): ProjectSeq {
    return this.pickPattern(seq, group, SceneOps.nextFree(SceneOps.selectPattern(seq, group, this.shown(seq, group)), group), at, time)
  }

  /**
   * Scene [to] picked (an index; the number of scenes is a new one; held to
   * what there is, and to no new one at 99): at once while stopped ([at]
   * null), else queued for all four groups at one tick. It cancels every
   * group's queue, and the scene playing picked cancels the scene's.
   */
  pickScene(seq: ProjectSeq, to: number, at: number | null, time: SwitchTime): ProjectSeq {
    this._status = null
    this.picks.clear()
    const count = seq.scenes.length
    const k = Math.min(Math.max(to, 0), count < Seq.MAX_SCENES ? count : count - 1)
    if (at === null || k === seq.scene) {
      this.scene = null
      const out = this.pickedScene(seq, k)
      this._said = this.sceneSaid(out)
      return out
    }
    this.scene = { to: k, at: this.sceneTick(seq, at, time), time }
    this._said = time === SwitchTime.IMMEDIATE ? this.sceneSaid(this.pickedScene(seq, k)) : MirrorText.sceneQueuedSpoken(k, time)
    return seq
  }

  /** − or + ([dir]) on the scene as shown (the queued one, if any); past the last scene is a new one. */
  stepScene(seq: ProjectSeq, dir: number, at: number | null, time: SwitchTime): ProjectSeq {
    return this.pickScene(seq, (this.scene?.to ?? seq.scene) + dir, at, time)
  }

  /** COMMIT: SceneOps.commit, one UNDO step, at once, and the picks waiting go with the scenes that moved. */
  commit(seq: ProjectSeq, recorder: PatternRecorder): ProjectSeq {
    this._status = null
    this._gridGroup = null
    const out = recorder.editSeq(seq, SceneOps.commit(seq))
    if (out === seq) {
      if (seq.scenes.length >= Seq.MAX_SCENES) this._status = MirrorText.SCENES_FULL
      return seq
    }
    this.cancel()
    this._status = MirrorText.sceneCommitted(out.scene)
    this._said = MirrorText.sceneCommittedSpoken(out.scene)
    return out
  }

  /**
   * The CLR / DEL hold done: SceneOps.eraseScene (DEL when the scene is empty
   * and not the only one, else CLR), one UNDO step, at once, and the picks
   * waiting go. Null when nothing changed.
   */
  erase(seq: ProjectSeq, recorder: PatternRecorder): SceneErased | null {
    this._status = null
    this._gridGroup = null
    const r = SceneOps.eraseScene(seq)
    const out = recorder.editSeq(seq, r.seq)
    if (out === seq) return null
    this.cancel()
    if (r.erase === SceneErase.CLEARED) {
      this._status = MirrorText.sceneCleared(seq.scene)
      this._said = MirrorText.CLEARED_SCENE
    } else {
      this._status = MirrorText.sceneDeleted(seq.scene)
      this._said = MirrorText.DELETED_SCENE
    }
    return { seq: out, erase: r.erase }
  }

  /** The CLIP row's PTN, BAR or PAD: the PAD flow in progress is dropped. */
  mode(mode: ClipMode): void {
    this._clipMode = mode
    this._padStage = PadStage.NONE
    this._status = null
  }

  /** The bar page (from 0) BAR copies and pastes. */
  page(bar: number): void {
    this._bar = Math.min(Math.max(bar, 0), Seq.MAX_BARS - 1)
    this._status = null
  }

  /** COPY: in PTN the focused group's pattern is the clipboard, in BAR its bar page; in PAD it waits for the pad to copy. */
  copy(seq: ProjectSeq): void {
    this._status = null
    this._gridGroup = null
    const g = this._group
    const n = ProjectSeq.selected(seq, g)
    switch (this._clipMode) {
      case ClipMode.PTN: {
        this.clip = SceneOps.copyPattern(seq, g)
        this.clipWhat = MirrorText.groupPattern(g, n)
        this._status = MirrorText.clipCopied(this.clipWhat)
        this._said = MirrorText.copiedPattern(n)
        break
      }
      case ClipMode.BAR: {
        const b = this.barOf(seq)
        this.clip = SceneOps.copyBar(seq, g, b)
        this.clipWhat = `bar ${b + 1}`
        this._status = MirrorText.clipCopied(`${String.fromCharCode(65 + g)} ${this.clipWhat}`)
        this._said = MirrorText.copiedBar(b + 1)
        break
      }
      case ClipMode.PAD:
        this._padStage = this._padStage === PadStage.SOURCE ? PadStage.NONE : PadStage.SOURCE
    }
  }

  /**
   * PASTE: in PTN the clipboard's pattern replaces the focused group's, in BAR
   * the bar page's notes are the clipboard's (one UNDO step each); in PAD it
   * waits for the pad to paste onto. With nothing of the mode's kind copied,
   * the status says so.
   */
  paste(seq: ProjectSeq, recorder: PatternRecorder): ProjectSeq {
    this._status = null
    this._gridGroup = null
    const g = this._group
    const n = ProjectSeq.selected(seq, g)
    const c = this.clip
    switch (this._clipMode) {
      case ClipMode.PTN: {
        if (c === null || c.kind !== 'pattern') return this.none(MirrorText.NO_PATTERN_COPIED, seq)
        this._status = MirrorText.clipPasted(MirrorText.groupPattern(g, n))
        this._said = MirrorText.pastedPattern(n)
        return recorder.editSeq(seq, SceneOps.pastePattern(seq, g, c))
      }
      case ClipMode.BAR: {
        if (c === null || c.kind !== 'bar') return this.none(MirrorText.NO_BAR_COPIED, seq)
        const b = this.barOf(seq)
        this._status = MirrorText.clipPasted(`${String.fromCharCode(65 + g)} bar ${b + 1}`)
        this._said = MirrorText.pastedBar(b + 1)
        return recorder.editSeq(seq, SceneOps.pasteBar(seq, g, b, c))
      }
      case ClipMode.PAD: {
        if (c === null || c.kind !== 'pad') return this.none(MirrorText.NO_PAD_COPIED, seq)
        this._padStage = this._padStage === PadStage.TARGET ? PadStage.NONE : PadStage.TARGET
        return seq
      }
    }
  }

  /**
   * [pad] tapped while the PAD flow waits: it is the pad COPY took, or the
   * pad PASTE puts the clipboard's notes on (one UNDO step). The flow ends
   * either way; the clipboard stays.
   */
  padTap(pad: PhysicalPad, seq: ProjectSeq, recorder: PatternRecorder): ProjectSeq {
    const stage = this._padStage
    this._padStage = PadStage.NONE
    this._status = null
    const name = this.word(pad)
    switch (stage) {
      case PadStage.NONE:
        return seq
      case PadStage.SOURCE:
        this.clip = SceneOps.copyPad(seq, pad)
        this.clipWhat = name
        this._status = MirrorText.clipCopied(name)
        this._said = MirrorText.copiedPad(name)
        return seq
      case PadStage.TARGET: {
        const c = this.clip
        if (c === null || c.kind !== 'pad') return seq
        this._status = MirrorText.clipPasted(name)
        this._said = MirrorText.pastedPad(name)
        return recorder.editSeq(seq, SceneOps.pastePad(seq, pad, c))
      }
    }
  }

  /** The PAD flow is dropped (ERASE came on). */
  endStage(): void {
    if (this._padStage === PadStage.NONE) return
    this._padStage = PadStage.NONE
    this._status = null
  }

  /** The picks whose tick the playhead has passed ([tick], as heard now) take over, in the order of their ticks. */
  due(seq: ProjectSeq, tick: number): ProjectSeq {
    return this.takeOver(seq, tick, (at) => at <= tick)
  }

  /** Every pick waiting takes over now (STOP: while stopped every change is at once). */
  flush(seq: ProjectSeq): ProjectSeq {
    return this.takeOver(seq, null, () => true)
  }

  /** What waits for its tick on [seq], by group: the pattern each group goes to and when. */
  targets(seq: ProjectSeq): Map<number, QueuedPick> {
    const s = this.scene
    const out = new Map<number, QueuedPick>()
    if (s !== null) {
      const to = this.pickedScene(seq, s.to)
      for (let g = 0; g < 4; g++) {
        if (ProjectSeq.selected(to, g) !== ProjectSeq.selected(seq, g)) out.set(g, { to: ProjectSeq.selected(to, g), at: s.at, time: s.time })
      }
      return out
    }
    for (const [g, q] of this.picks) if (q.to !== ProjectSeq.selected(seq, g)) out.set(g, q)
    return out
  }

  /** What Live shows: the panel and the scene of [seq], with [time] the setting for when a pick takes over. */
  ui(seq: ProjectSeq, time: SwitchTime): SceneUi {
    const targets = this.targets(seq)
    const groups = [0, 1, 2, 3].map((g) => {
      const n = ProjectSeq.selected(seq, g)
      return {
        number: n,
        queued: targets.get(g)?.to ?? null,
        filled: filledPatterns(seq, g),
        nextFree: SceneOps.nextFree(SceneOps.selectPattern(seq, g, this.shown(seq, g)), g),
        bars: ProjectSeq.pattern(seq, g, n).bars,
        lights: stepLights(ProjectSeq.pattern(seq, g, n)),
      }
    })
    const c = this.clip
    return {
      open: this._open,
      index: seq.scene,
      count: seq.scenes.length,
      label: MirrorText.sceneLabel(seq.scene),
      group: this._group,
      groups,
      sceneQueued: this.scene !== null ? this.scene.to + 1 : null,
      canDelete: SceneOps.deleteScene(seq) !== seq,
      switchTime: time,
      clip: c !== null ? { mode: c.kind === 'pattern' ? ClipMode.PTN : c.kind === 'bar' ? ClipMode.BAR : ClipMode.PAD, what: this.clipWhat ?? '' } : null,
      clipMode: this._clipMode,
      padStage: this._padStage,
      bar: this.barOf(seq),
      gridGroup: this._gridGroup,
      status: this._status ?? this.stageStatus() ?? (this._gridGroup !== null ? MirrorText.gridStatus(this._gridGroup) : null) ?? this.queueStatus(),
      said: this._said,
      chain: seq.chain.steps,
    }
  }

  // The tick a scene change made at [at] takes over: the next bar line, or the next end of the longest pattern playing.
  private sceneTick(seq: ProjectSeq, at: number, time: SwitchTime): number {
    const playing = ProjectSeq.playing(seq)
    const longest = ProjectPatterns.longestTicks(playing)
    if (time !== SwitchTime.PATTERN) return queueTick(time, at, longest)
    const ticks = [0, 1, 2, 3]
      .filter((g) => Pattern.lengthTicks(ProjectPatterns.group(playing, g)) === longest)
      .map((g) => queueTick(time, at, longest, PhaseAnchors.of(this._phase, g)))
    return Math.min(...ticks)
  }

  // The number [group] shows: the one waiting for its tick, else the one playing.
  private shown(seq: ProjectSeq, group: number): number {
    return this.targets(seq).get(group)?.to ?? ProjectSeq.selected(seq, group)
  }

  // [seq] on scene [to]: an existing one, or (the number of scenes) a new one.
  private pickedScene(seq: ProjectSeq, to: number): ProjectSeq {
    return to >= seq.scenes.length ? SceneOps.newScene(seq) : SceneOps.selectScene(seq, to)
  }

  // The bar page, held to the focused group's pattern.
  private barOf(seq: ProjectSeq): number {
    const bars = ProjectSeq.pattern(seq, this._group, ProjectSeq.selected(seq, this._group)).bars
    return Math.min(Math.max(this._bar, 0), bars - 1)
  }

  private stageStatus(): string | null {
    switch (this._padStage) {
      case PadStage.NONE:
        return null
      case PadStage.SOURCE:
        return MirrorText.PAD_TAP_SOURCE
      case PadStage.TARGET:
        return MirrorText.padTapTarget(this.clipWhat ?? '')
    }
  }

  // What waits for its tick, as the status says it; nothing for a pick that takes over at once.
  private queueStatus(): string | null {
    const s = this.scene
    if (s !== null) return s.time !== SwitchTime.IMMEDIATE ? MirrorText.queuedLine(MirrorText.sceneMove(s.to), s.time) : null
    const all = [...this.picks.values()]
    const last = all.at(-1)?.time
    if (last === undefined || last === SwitchTime.IMMEDIATE) return null
    const moves = [...this.picks.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([g, q]) => MirrorText.groupMove(g, q.to))
      .join(', ')
    return MirrorText.queuedLine(moves, last)
  }

  private none(why: string, seq: ProjectSeq): ProjectSeq {
    this._status = why
    this._said = why
    return seq
  }

  private patternSaid(seq: ProjectSeq, group: number): string {
    const n = ProjectSeq.selected(seq, group)
    return MirrorText.patternSpoken(group, n, ProjectSeq.pattern(seq, group, n).bars)
  }

  private sceneSaid(seq: ProjectSeq): string {
    return MirrorText.sceneSpoken(
      seq.scene,
      seq.scenes.length,
      [0, 1, 2, 3].map((g) => ProjectSeq.selected(seq, g)),
    )
  }

  // The picks passed take over, the scene's first; a pattern left while open is closed at the pick's tick.
  private takeOver(seq: ProjectSeq, tick: number | null, passed: (at: number) => boolean): ProjectSeq {
    let out = seq
    const s = this.scene
    if (s !== null && passed(s.at)) {
      this.scene = null
      out = this.leaving(out, this.pickedScene(out, s.to), tick !== null ? s.at : null)
      this._said = this.sceneSaid(out)
      this._status = null
    }
    for (const [g, q] of [...this.picks.entries()].sort((a, b) => a[1].at - b[1].at)) {
      if (!passed(q.at)) continue
      this.picks.delete(g)
      out = this.leaving(out, SceneOps.selectPattern(out, g, q.to), tick !== null ? q.at : null)
      this._said = this.patternSaid(out, g)
      this._status = null
    }
    return out
  }

  // [to] (the pick made on [from]) taking over at global tick [at] (null: STOP): the patterns it leaves closed,
  // if one was open, and the groups it changes starting at [at].
  private leaving(from: ProjectSeq, to: ProjectSeq, at: number | null): ProjectSeq {
    if (at === null) return to
    let out = to
    for (let g = 0; g < 4; g++) {
      const n = ProjectSeq.selected(from, g)
      if (ProjectSeq.selected(to, g) === n) continue
      const pat = ProjectSeq.pattern(from, g, n)
      if (pat.open) out = ProjectSeq.withPattern(out, g, n, closedAt(pat, at, PhaseAnchors.of(this._phase, g)))
      this._phase = PhaseAnchors.with(this._phase, g, at)
    }
    return out
  }
}
