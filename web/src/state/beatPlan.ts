// Port of app/src/main/kotlin/dev/arc/ep133/controller/BeatPlan.kt
//
// BEAT CARDS (an addition): sharing a pattern or scene to Claude as an ARC BEAT
// card, and the sheet a pasted card opens: its grids, where it goes, the tempo
// and swing it says, its problems; IMPORT applies it as one UNDO step.
//
// Web deltas: [placed] pairs are [group, n] tuples; Weight is a string union
// ordered by [WEIGHT_RANK]; names give null rather than Kotlin's null String?.
// deviceKitOf and soundSetOf take the connected device's sound list as
// [sounds] (Live keeps it, LiveDesk.deviceSoundList, where the Kotlin has
// MirrorUi.sounds). beatShare and beatShareChain take what Kotlin passes as
// named arguments in one [ShareParts] object.

import { FactoryKit, FactorySounds } from '../core/features/factorySounds'
import { BeatCards, cardSection, type BeatCard, type CardProblem, type CardRead, type CardSection, type CardSound } from '../core/features/beatCard'
import type { ChainStep } from '../core/features/chain'
import type { FxSettings } from '../core/features/fxSettings'
import type { PadSettings } from '../core/features/padSettings'
import { SoundSource } from '../core/features/offlinePads'
import { PadSoundCache } from '../core/features/padSoundCache'
import type { SoundEntry } from '../core/protocol/device'
import type { BackupRecord } from '../core/text/libraryRules'
import { ROWS, physicalPad, type PhysicalPad } from '../core/features/padNotes'
import { Pattern, ProjectSeq, Seq, TimingSettings, timingTicks, type Timing } from '../core/features/pattern'
import type { PatternRecorder } from '../core/features/patternRecorder'
import { SceneOps } from '../core/features/scenes'
import { Steps } from '../core/features/steps'
import { Tempo } from '../core/features/tempo'
import { ClaudeText } from '../core/text/claudeText'
import { MirrorText } from '../core/text/mirrorText'
import type { MirrorUi } from './types'

/** A pad's sound name, or null. */
export type PadNames = (pad: PhysicalPad) => string | null

/** What a share sends: the [subject] and the [text] (the prompt, then the card in a fenced block). */
export interface BeatShare {
  readonly subject: string
  readonly text: string
}

/** The kit a device's own sounds are ([kit]), and the names its unnamed ones ("200.pcm") go by ([names]; null: none known). */
export interface DeviceKit {
  readonly kit: FactoryKit
  readonly names: ReadonlyMap<number, string> | null
}

/**
 * The kit the EP-133's sounds are, for a share and for reading a card's sound
 * lines (DeviceKit). Live playing a pack offline (OfflineSounds.base FACTORY):
 * the [active] kit and its pack's names. Otherwise the device's slots
 * (connected, [sounds], or as last read) told against the saved packs'
 * (FactorySounds.kitOf), with that pack's names; failing that, the connected
 * device's own kit ([sku]) with no names, or, with no list known, [active]. An
 * EP-133 whose slots match no saved pack is the EP-133's kit, its unnamed
 * sounds left unnamed: never another kit's names.
 */
export function deviceKitOf(
  m: MirrorUi | null,
  sounds: readonly SoundEntry[],
  backups: readonly BackupRecord[],
  kitNames: ReadonlyMap<FactoryKit, ReadonlyMap<number, string>>,
  sku: string | null,
  active: FactoryKit,
): DeviceKit {
  const own = (kit: FactoryKit): DeviceKit => ({ kit, names: kitNames.get(kit) ?? null })
  let list: readonly SoundEntry[] | null
  if (m === null) list = null
  else if (m.offline == null) list = sounds
  else if (m.offlineSounds?.base === SoundSource.FACTORY) return own(active)
  else list = m.offlineSounds?.device ?? null
  if (list === null || list.length === 0) return own(active)
  const packs = new Map<FactoryKit, ReadonlySet<number>>()
  for (const k of FactoryKit.SHOWN) {
    const b = FactorySounds.inLibrary(backups, k)
    if (b !== null) packs.set(k, new Set(b.slots))
  }
  const matched = FactorySounds.kitOf(new Set(list.map((e) => e.slot)), packs)
  if (matched !== null) return own(matched)
  return { kit: FactoryKit.ofSku(sku) ?? FactoryKit.EP133, names: null }
}

/** A card line that is another kit's sound than the device's ([deviceKit]): that pack's sound of its name at its slot. */
export function foreignTo(packs: ReadonlyMap<FactoryKit, ReadonlyMap<number, string>>, deviceKit: FactoryKit | null): (wanted: CardSound) => boolean {
  return (w) => {
    const name = w.name
    if (name === null) return false
    for (const [kit, names] of packs) {
      if (kit === deviceKit) continue
      const there = names.get(w.slot)
      if (there !== undefined && PadSoundCache.sameName(there, name)) return true
    }
    return false
  }
}

/**
 * The sounds Arc can name to Claude and look cards up in: [names] by slot, and
 * the [source] they came from as the sound list words it
 * (ClaudeText.SOUNDS_FROM_DEVICE, SOUNDS_FROM_LAST_READ or
 * SOUNDS_FROM_FACTORY). [size]: how many.
 */
export interface SoundSet {
  readonly source: string
  readonly names: ReadonlyMap<number, string>
  readonly size: number
}

export function soundSet(source: string, names: ReadonlyMap<number, string>): SoundSet {
  return { source, names, size: names.size }
}

/**
 * The sounds [m] (Live's mirror) can choose from: the EP-133's, read
 * ([sounds]), while connected; offline the list the view shows, the last
 * read's or the factory pack's (OfflineSounds.base). Null when none is known
 * (nothing read, or no pack). A sound the EP-133 lists unnamed ("200.pcm") has
 * the name [factory] (the pack's, by slot; null without the pack) gives it
 * (BeatCards.soundNames).
 */
export function soundSetOf(m: MirrorUi | null, sounds: readonly SoundEntry[], factory: ReadonlyMap<number, string> | null = null): SoundSet | null {
  if (m === null) return null
  const named = (list: readonly SoundEntry[]): Map<number, string> => BeatCards.soundNames(new Map(list.map((e) => [e.slot, e.name])), factory)
  if (m.offline == null) return sounds.length > 0 ? soundSet(ClaudeText.SOUNDS_FROM_DEVICE, named(sounds)) : null
  const o = m.offlineSounds
  if (o == null) return null
  const fromPack = o.base === SoundSource.FACTORY
  const list = fromPack ? o.factory : o.device
  if (list === null || list.length === 0) return null
  return soundSet(fromPack ? ClaudeText.SOUNDS_FROM_FACTORY : ClaudeText.SOUNDS_FROM_LAST_READ, named(list))
}

/**
 * What a share carries besides the notes (Kotlin's named arguments): each
 * pad's sound line ([sounds]: the slot and name known for it), the sound
 * list after the card ([list]), the project's [fx] and each used pad's
 * settings ([pads]; null when not known), the slot a pad holds ([held], null
 * for none) once the pads are [padsKnown], the [kit] and the [prompt].
 */
export interface ShareParts {
  readonly sounds?: (pad: PhysicalPad) => CardSound | null
  readonly list?: SoundSet | null
  readonly fx?: FxSettings | null
  readonly pads?: (pad: PhysicalPad) => PadSettings | null
  readonly held?: (pad: PhysicalPad) => number | null
  readonly padsKnown?: boolean
  readonly kit?: FactoryKit
  readonly prompt?: string
}

/**
 * The text [group]'s playing pattern in [seq] shares (null [group]: the scene
 * playing, its four patterns, the blank ones left out), as an ARC BEAT card
 * tidied and written with the pads' [names], at [tempo] and the TIMING [swing]
 * (BeatCards.fromPatterns keeps the swing only where every hit sits on it).
 * Each pad the notes use gets a sound line with the slot and name [o.sounds]
 * knows for it. The project's [o.fx] and each used pad's settings ([o.pads];
 * null when not known) are written as the card's effect and `pad` lines
 * (BeatCards.fromPatterns leaves out what is at the defaults). With a
 * [o.list], the sounds Arc knows follow the card's closing fence
 * (BeatCards.soundList), for Claude to choose from. When the pads are
 * [o.padsKnown], the pads the notes use that have no sound ([o.held] gives a
 * pad's slot, null for none; BeatCards.silentPads) are named in a comment
 * after the header (ClaudeText.noSoundOn). The [o.kit] is named before the
 * card (ClaudeText.kitLine); the [o.prompt] goes first. Null when there is
 * nothing to share: no notes in it.
 */
export function beatShare(seq: ProjectSeq, group: number | null, tempo: number, swing: number, names: PadNames, o: ShareParts = {}): BeatShare | null {
  const groups = group === null ? [0, 1, 2, 3] : [group]
  const sections = groups.map((g) => cardSection(g, ProjectSeq.selected(seq, g), ProjectSeq.pattern(seq, g, ProjectSeq.selected(seq, g))))
  if (sections.every((s) => Pattern.isEmpty(s.pattern))) return null
  const name = group === null ? ClaudeText.sceneCardName(seq.scene) : ClaudeText.patternCardName(ProjectSeq.selected(seq, group), seq.scene)
  const card = BeatCards.fromPatterns(name, tempo, swing, sections, o.sounds, o.fx ?? null, o.pads)
  return shareOf(name, card, names, o, ClaudeText.SHARE_PROMPT)
}

// [card] as a share named [name]: the prompt, the kit, the card with its silent pads, then the list.
function shareOf(name: string, card: BeatCard, names: PadNames, o: ShareParts, prompt: string): BeatShare {
  const silent = BeatCards.silentPads(card, o.held ?? (() => null), o.padsKnown ?? false)
  const text = ClaudeText.shareText(o.prompt ?? prompt, BeatCards.write(card, names, true, silent), o.kit ?? FactoryKit.EP133)
  // The list follows the closing fence after a blank line (the card's text ends in a newline); readers stop at the fence.
  const list = o.list ?? null
  return { subject: ClaudeText.shareSubject(name), text: list === null ? text : text + '\n' + BeatCards.soundList(list.source, list.names) }
}

/**
 * The steps of [steps] a card holds: from the first, up to the step that
 * would bring in more distinct scenes than a card has (BeatCards.MAX_SCENES)
 * (a card with more is one Arc itself would refuse to read).
 */
export function chainForCard(steps: readonly ChainStep[]): ChainStep[] {
  const seen = new Set<number>()
  const out: ChainStep[] = []
  for (const step of steps) {
    if (!seen.has(step.scene) && seen.size === BeatCards.MAX_SCENES) break
    seen.add(step.scene)
    out.push(step)
  }
  return out
}

/** The distinct scenes chainForCard shares: the card's scenes ("SHARE CHAIN · 3 SCENES"). */
export function chainSceneCount(steps: readonly ChainStep[]): number {
  return new Set(chainForCard(steps).map((s) => s.scene)).size
}

/**
 * The text the project's chain shares: as beatShare, a card
 * (BeatCards.fromScenes: the chain's scenes in the order they first play, each
 * with its patterns, and the `chain` line with the passes) with the prompt for
 * an arrangement (ClaudeText.SHARE_CHAIN_PROMPT unless [o.prompt]), at
 * [tempo] and the TIMING [swing], the pads' [names], the sounds, FX and pad
 * settings the other shares carry, the sound list after it, and the pads with
 * no sound named in a comment. Null when the chain has no step (or none naming
 * a scene of [seq]).
 */
export function beatShareChain(seq: ProjectSeq, tempo: number, swing: number, names: PadNames, o: ShareParts = {}): BeatShare | null {
  const name = ClaudeText.CHAIN_CARD_NAME
  const card = BeatCards.fromScenes(name, tempo, swing, seq, chainForCard(seq.chain.steps), o.sounds, o.fx ?? null, o.pads)
  if (card === null) return null
  return shareOf(name, card, names, o, ClaudeText.SHARE_CHAIN_PROMPT)
}

/** How strong a hit is drawn on the sheet's grid: the ghost, normal and accent tints (the card's x, o and X, as TIDY rounds them). */
export type Weight = 'GHOST' | 'NORMAL' | 'ACCENT'

export const WEIGHT_RANK: Readonly<Record<Weight, number>> = { GHOST: 0, NORMAL: 1, ACCENT: 2 }

export function weightOf(velocity: number): Weight {
  return velocity >= 114 ? 'ACCENT' : velocity >= 82 ? 'NORMAL' : 'GHOST'
}

/** A pad's row in a section's grid: the [pad], its sound [name], all its [hits] and its [cells], one for each step of the bars shown (null where nothing sits). */
export interface BeatRowUi {
  readonly pad: PhysicalPad
  readonly name: string | null
  readonly hits: number
  readonly cells: readonly (Weight | null)[]
}

/**
 * A card's section as the sheet draws it: [group]'s pattern of [bars], read in
 * [step]s ([perBar] to a bar), the first [shownBars] bars as [rows] (a pad with
 * notes each, in keypad order), and where it goes ([goesTo]: the pattern
 * number it fills; null when the card can't be imported). [moreBars]: the
 * bars not drawn ("+3 bars").
 */
export interface BeatGridUi {
  readonly group: number
  readonly bars: number
  readonly step: Timing
  readonly perBar: number
  readonly shownBars: number
  readonly rows: readonly BeatRowUi[]
  readonly goesTo: number | null
  readonly moreBars: number
}

/**
 * The beat card sheet's state: what was [read] (the card, or its problems),
 * its [grids], the title and [summary] (null for a card that can't be read),
 * where it would go ([placed]: group and pattern number; [scene]: the index of
 * the scene it adds), the [tempo] it offers (null when it has none or Arc's is
 * the same; [tempoNow] is Arc's), the [swing] it says (null when straight) and
 * why IMPORT is off ([blocked]; null when it isn't).
 */
export interface BeatImportUi {
  readonly read: CardRead
  readonly title: string
  readonly summary: string | null
  readonly grids: readonly BeatGridUi[]
  readonly placed: readonly (readonly [number, number])[]
  readonly scene: number | null
  readonly tempo: number | null
  readonly tempoNow: number
  readonly swing: number | null
  readonly blocked: string | null
}

/** The card the sheet holds, or null. */
export function beatCardOf(ui: BeatImportUi): BeatCard | null {
  return ui.read.card
}

/** The problems the sheet lists. */
export function beatProblems(ui: BeatImportUi): readonly CardProblem[] {
  return ui.read.problems
}

/** The bars drawn of a long pattern. */
export const BEAT_BARS_SHOWN = 2

// The steps a grid reads in, as the card is written: the first on which every pad hit sits.
const BEAT_STEPS: readonly Timing[] = ['1/16', '1/16T', '1/32']

// The keypad from top to bottom, as the card's rows go.
const KEYPAD: readonly number[] = ROWS.flat()

/**
 * [read] (a card read from a text, say) planned into [seq] (BeatCards.plan) and
 * drawn for the sheet: the pads of each section by [names], Arc's tempo [now].
 * The tempo is offered as a whole number, which is what Arc keeps.
 */
export function beatImportUi(read: CardRead, seq: ProjectSeq, now: number, names: PadNames): BeatImportUi {
  const card = read.card
  const nowBpm = Tempo.round(now)
  if (card === null) {
    return { read, title: ClaudeText.CARD, summary: null, grids: [], placed: [], scene: null, tempo: null, tempoNow: nowBpm, swing: null, blocked: ClaudeText.FIX_ERRORS }
  }
  const plan = BeatCards.plan(seq, card)
  // The plan places the sections in the card's order, or none when a group is full.
  const grids = card.sections.map((s, i) => beatGrid(s, card.swing, names, plan.placed[i]?.[1] ?? null))
  const pads = new Set(grids.flatMap((g) => g.rows.map((r) => r.pad.group * 12 + r.pad.offset))).size
  const bars = grids.reduce((m, g) => Math.max(m, g.bars), 0)
  const hits = grids.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + r.hits, 0), 0)
  const tempo = card.tempo === null ? null : Tempo.round(card.tempo)
  return {
    read,
    title: card.name ?? ClaudeText.CARD,
    summary: ClaudeText.summary(bars, pads, hits),
    grids,
    placed: plan.placed,
    scene: plan.newScene ? plan.seq.scene : null,
    tempo: tempo !== null && tempo !== nowBpm ? tempo : null,
    tempoNow: nowBpm,
    swing: card.swing > TimingSettings.SWING_MIN ? card.swing : null,
    blocked: plan.fullGroup === null ? null : ClaudeText.groupFull(plan.fullGroup),
  }
}

/**
 * [s] as a grid: the first of 1/16, 1/16T and 1/32 on which every pad hit sits
 * at [swing] (1/16 when none), and a row for each pad with notes, its hits
 * placed on the step they sit on (the nearest, for one between steps), the
 * louder where two share one. Notes past the pattern's end don't play and
 * aren't drawn or counted.
 */
export function beatGrid(s: CardSection, swing: number, names: PadNames, goesTo: number | null): BeatGridUi {
  const p = s.pattern
  const len = Pattern.lengthTicks(p)
  const notes = p.notes.filter((n) => n.tick >= 0 && n.tick < len)
  const step =
    BEAT_STEPS.find((t) => {
      const count = Steps.count(p, t)
      return notes.every((n) => n.semitones !== null || Steps.tickOf(Steps.indexOf(n.tick, t, swing, count), t, swing) === n.tick)
    }) ?? '1/16'
  const perBar = Seq.TICKS_PER_BAR / timingTicks(step)
  const shown = Math.min(p.bars, BEAT_BARS_SHOWN)
  const count = Steps.count(p, step)
  const rows: BeatRowUi[] = []
  for (const offset of KEYPAD) {
    const on = notes.filter((n) => n.offset === offset)
    if (on.length === 0) continue
    const cells: (Weight | null)[] = new Array(shown * perBar).fill(null)
    for (const n of on) {
      const k = Steps.indexOf(n.tick, step, swing, count)
      if (k >= cells.length) continue
      const w = weightOf(n.velocity)
      const was = cells[k]
      if (was === null || was === undefined || WEIGHT_RANK[w] > WEIGHT_RANK[was]) cells[k] = w
    }
    const pad = physicalPad(s.group, offset)
    rows.push({ pad, name: names(pad), hits: on.length, cells })
  }
  return { group: s.group, bars: p.bars, step, perBar, shownBars: shown, rows, goesTo, moreBars: p.bars - shown }
}

/** A card applied: the sequencer [seq] after it, where the patterns went ([placed]), the index of the scene it added ([scene]) and the group with no free pattern ([fullGroup]: nothing was done). */
export interface BeatApplied {
  readonly seq: ProjectSeq
  readonly placed: readonly (readonly [number, number])[]
  readonly scene: number | null
  readonly fullGroup: number | null
}

/**
 * IMPORT: [card] planned into [seq] (BeatCards.plan: next free patterns, a new
 * scene for a card of several groups), and the patterns picked in the scene
 * that plays when there is no new scene (a card of one group, or 99 scenes
 * already), all as ONE checkpoint of [recorder] (PatternRecorder.editSeq): a
 * single UNDO puts back the banks, the scenes and the picks as they were.
 * [BeatApplied.seq] is [seq] itself when a group is full.
 */
export function applyBeat(seq: ProjectSeq, card: BeatCard, recorder: PatternRecorder): BeatApplied {
  const plan = BeatCards.plan(seq, card)
  if (plan.fullGroup !== null) return { seq, placed: [], scene: null, fullGroup: plan.fullGroup }
  let after = plan.seq
  if (!plan.newScene) for (const [g, n] of plan.placed) after = SceneOps.selectPattern(after, g, n)
  const out = recorder.editSeq(seq, after)
  return { seq: out, placed: plan.placed, scene: plan.newScene ? out.scene : null, fullGroup: null }
}

/** IMPORT's toast for [applied]. */
export function beatImported(applied: BeatApplied): string {
  return ClaudeText.imported(applied.placed, applied.scene === null ? null : MirrorText.sceneLabel(applied.scene))
}
