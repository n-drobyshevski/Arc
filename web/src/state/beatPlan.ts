// Port of app/src/main/kotlin/dev/arc/ep133/controller/BeatPlan.kt
//
// BEAT CARDS (an addition): sharing a pattern or scene to Claude as an ARC BEAT
// card, and the sheet a pasted card opens: its grids, where it goes, the tempo
// and swing it says, its FX, SOUNDS, SILENT PADS and PAD SHAPING, its
// problems; IMPORT applies it as one UNDO step.
//
// Web deltas: [placed] pairs are [group, n] tuples; Weight is a string union
// ordered by [WEIGHT_RANK]; names give null rather than Kotlin's null String?.
// deviceKitOf, soundSetOf and soundChoicesOf take the connected device's
// sound list as [sounds] (Live keeps it, LiveDesk.deviceSoundList, where the
// Kotlin has MirrorUi.sounds). beatShare and beatShareChain take what Kotlin
// passes as named arguments in one [ShareParts] object, beatImportUi its
// blocks in one [BeatBlocks]. SoundRowUi's and SoundsUi's getters are fields,
// set by soundRowUi and soundsUiOf, BeatFxUi's [changes] is a field set by
// beatFxUi. The picks for silent pads and the pads padShapes takes are keyed
// by padKey. Not yet here: the synth rows (SynthVoice), the suggested sounds
// and REPLACE (BeatReplaceUi, projectScenes).

import { FactoryKit, FactorySounds } from '../core/features/factorySounds'
import { BeatCards, SoundStatus, allSections, cardPadIsEmpty, isMultiScene, cardSection, cardSound, type BeatCard, type CardImport, type CardPad, type CardProblem, type CardRead, type CardSection, type CardSound, type SoundPick } from '../core/features/beatCard'
import type { ChainStep } from '../core/features/chain'
import type { FxSettings } from '../core/features/fxSettings'
import { PadSettings } from '../core/features/padSettings'
import type { PadTarget } from '../core/features/liveMirror'
import { OfflinePads, SoundSource } from '../core/features/offlinePads'
import { PadSoundCache } from '../core/features/padSoundCache'
import type { SoundEntry } from '../core/protocol/device'
import type { BackupRecord } from '../core/text/libraryRules'
import { ROWS, padFromKey, padKey, physicalPad, type PhysicalPad } from '../core/features/padNotes'
import { Pattern, ProjectSeq, Seq, TimingSettings, sameSeq, timingTicks, type Timing } from '../core/features/pattern'
import type { PatternRecorder } from '../core/features/patternRecorder'
import { SceneOps } from '../core/features/scenes'
import { Steps } from '../core/features/steps'
import { Tempo } from '../core/features/tempo'
import { ClaudeText, type Change, type PadPart } from '../core/text/claudeText'
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
 * A card scene on the sheet: its [number] (from 1) and [name], its [grids],
 * where it goes ([index]: the new scene it becomes; null when none can be
 * added), the pattern each of its groups gets ([patterns]: the new scene's)
 * and [parts], what its row says: the groups the card has in any scene, each
 * with the pattern number this scene's section takes, or null where it leaves
 * the group out ("B (same)").
 */
export interface BeatSceneUi {
  readonly number: number
  readonly name: string | null
  readonly grids: readonly BeatGridUi[]
  readonly index: number | null
  readonly patterns: readonly number[] | null
  readonly parts: readonly (readonly [number, number | null])[]
}

/** The chain a card sets, as steps on the new scenes ([steps]): the CHAIN row and its SET CHAIN chip. */
export interface BeatChainUi {
  readonly steps: readonly ChainStep[]
}

/**
 * A card's sound line on the sheet: the [pick] (cardPicks) and the name the
 * pad plays now ([oldName], null when unknown). A [picked] row is not the
 * card's: the user chose its sound for a silent pad (pickedRow). A missing
 * sound a saved factory pack has ([fromPack], PackSound): IMPORT can upload it
 * into a free slot, while connected ([uploadable]). [changes]: whether the row
 * can be ticked (the sound is somewhere in the list and not on the pad yet,
 * or can be uploaded from a pack). [cardSays]: the name the card gave a sound
 * used by its slot because the EP-133 lists it unnamed ("200.pcm"), for the
 * line "Card says HH CLOSED"; null for any other row, and when the card named
 * no other sound than the one shown.
 */
export interface SoundRowUi {
  readonly pick: SoundPick
  readonly oldName: string | null
  readonly picked: boolean
  readonly fromPack: PackSound | null
  readonly uploadable: boolean
  readonly pad: PhysicalPad
  readonly changes: boolean
  readonly cardSays: string | null
}

export function soundRowUi(pick: SoundPick, oldName: string | null, o: { picked?: boolean; fromPack?: PackSound | null; uploadable?: boolean } = {}): SoundRowUi {
  const fromPack = o.fromPack ?? null
  const uploadable = o.uploadable ?? false
  const said = pick.unverified ? pick.wanted.name : null
  return {
    pick,
    oldName,
    picked: o.picked ?? false,
    fromPack,
    uploadable,
    pad: pick.pad,
    changes: pick.status === SoundStatus.CHANGE || pick.status === SoundStatus.FOUND_BY_NAME || (fromPack !== null && uploadable),
    cardSays: said !== null && said.trim() !== '' && !PadSoundCache.sameName(said, pick.name ?? '') ? said : null,
  }
}

/**
 * The sheet's SOUNDS block: a [rows] for each sound line of the card,
 * [offline] when the pads change in Arc only until the EP-133 connects, and
 * the [project] they are written in (connected; null when not known).
 * [changes]: the rows that can be ticked. [noneFound]: no sound line is on the
 * user's EP-133 (every row is missing): the sheet says to share with the sound list.
 */
export interface SoundsUi {
  readonly rows: readonly SoundRowUi[]
  readonly offline: boolean
  readonly project: number | null
  readonly changes: readonly SoundRowUi[]
  readonly noneFound: boolean
}

export function soundsUiOf(rows: readonly SoundRowUi[], offline: boolean, project: number | null): SoundsUi {
  return {
    rows,
    offline,
    project,
    changes: rows.filter((r) => r.changes),
    noneFound: rows.length > 0 && rows.every((r) => r.pick.status === SoundStatus.MISSING),
  }
}

/**
 * [card]'s sound lines matched to [set] (cardPicks) as the sheet's rows, each
 * with the name the pad plays now ([names]), the slot it plays now being
 * [current]; null when the card has none. With no [set] every sound line is missing.
 */
export function soundsUi(
  card: BeatCard,
  set: SoundSet | null,
  current: (pad: PhysicalPad) => number | null,
  names: PadNames,
  offline: boolean,
  project: number | null,
  packs: ReadonlyMap<FactoryKit, ReadonlyMap<number, string>> = new Map(),
  deviceKit: FactoryKit | null = null,
): SoundsUi | null {
  if (allSections(card).every((s) => s.sounds.size === 0)) return null
  const rows = cardPicks(card, set?.names ?? new Map(), foreignTo(packs, deviceKit), current, packs, !offline).map((it) =>
    soundRowUi(it.pick, names(it.pick.pad), { fromPack: it.fromPack, uploadable: it.uploadable }),
  )
  return rows.length === 0 ? null : soundsUiOf(rows, offline, project)
}

/** A pad's sound as the sheet shows it and IMPORT does it: the [pick], and a saved pack's sound [fromPack] that IMPORT can upload ([uploadable]). */
export interface PlannedSound {
  readonly pick: SoundPick
  readonly fromPack: PackSound | null
  readonly uploadable: boolean
}

/**
 * One sound for each pad [card] gives a sound line, the sheet's and IMPORT's
 * alike: a sound line found in [names] (BeatCards.resolveSounds: a change,
 * the same, or found by name), else the missing sound line, with the saved
 * pack's sound of it (packSoundOf), to upload while [connected]. [foreign] and
 * [current] are as BeatCards.resolveSounds has them.
 */
export function cardPicks(
  card: BeatCard,
  names: ReadonlyMap<number, string>,
  foreign: (wanted: CardSound) => boolean,
  current: (pad: PhysicalPad) => number | null,
  packs: ReadonlyMap<FactoryKit, ReadonlyMap<number, string>>,
  connected: boolean,
): PlannedSound[] {
  return BeatCards.resolveSounds(card, names, current, foreign).map((p) => {
    if (p.status !== SoundStatus.MISSING) return { pick: p, fromPack: null, uploadable: false }
    const pack = packSoundOf(p.wanted, packs)
    return { pick: p, fromPack: pack, uploadable: pack !== null && connected }
  })
}

/** A sound of a saved factory pack: its [kit], its [slot] there and its [name]. */
export interface PackSound {
  readonly kit: FactoryKit
  readonly slot: number
  readonly name: string
}

/**
 * Where a card's sound line is in the saved [packs]: the pack whose slot holds
 * a sound of its name, else the first that has a sound of that name anywhere;
 * null for a line with no name, or none has it.
 */
export function packSoundOf(wanted: CardSound, packs: ReadonlyMap<FactoryKit, ReadonlyMap<number, string>>): PackSound | null {
  const name = wanted.name
  if (name === null || name.trim() === '' || FactorySounds.unnamed(wanted.slot, name)) return null
  for (const [kit, names] of packs) {
    const there = names.get(wanted.slot)
    if (there !== undefined && PadSoundCache.sameName(there, name)) return { kit, slot: wanted.slot, name: there }
  }
  for (const [kit, names] of packs) {
    let slot: number | null = null
    for (const [s, n] of names) if (PadSoundCache.sameName(n, name) && (slot === null || s < slot)) slot = s
    if (slot !== null) return { kit, slot, name: names.get(slot)! }
  }
  return null
}

/**
 * The sounds PICK SOUND lists, the ones the card's SOUNDS block and IMPORT
 * choose from (soundSetOf): [entries] of one list, the EP-133's while
 * connected, offline the view's ([source]: the last read's or the factory
 * pack's); [unavailable] are the device's slots Arc has no audio for offline
 * (dimmed, not pickable). The names are BeatCards.soundNames'. [names]: slot to name.
 */
export interface SoundChoices {
  readonly source: SoundSource
  readonly entries: readonly SoundEntry[]
  readonly unavailable: ReadonlySet<number>
  readonly names: ReadonlyMap<number, string>
}

function soundChoices(source: SoundSource, entries: readonly SoundEntry[], unavailable: ReadonlySet<number>): SoundChoices {
  return { source, entries, unavailable, names: new Map(entries.map((e) => [e.slot, e.name])) }
}

/** The sounds [m] (Live's mirror; [sounds] the connected device's) offers a pick, as soundSetOf has them, with the sizes the list carries; null when none is known. */
export function soundChoicesOf(m: MirrorUi | null, sounds: readonly SoundEntry[], factory: ReadonlyMap<number, string> | null = null): SoundChoices | null {
  if (m === null) return null
  const named = (list: readonly SoundEntry[]): SoundEntry[] => {
    const names = BeatCards.soundNames(new Map(list.map((e) => [e.slot, e.name])), factory)
    return list.map((e) => ({ ...e, name: names.get(e.slot)! }))
  }
  if (m.offline == null) return sounds.length > 0 ? soundChoices(SoundSource.DEVICE, named(sounds), new Set()) : null
  const o = m.offlineSounds
  if (o == null) return null
  const fromPack = o.base === SoundSource.FACTORY
  const list = fromPack ? o.factory : o.device
  if (list === null || list.length === 0) return null
  return soundChoices(fromPack ? SoundSource.FACTORY : SoundSource.DEVICE, named(list), fromPack ? new Set() : o.unavailable)
}

/** A pad the card plays that has no sound: the [pad] and the [notes] of the card that play on it. */
export interface SilentRowUi {
  readonly pad: PhysicalPad
  readonly notes: number
}

/**
 * The sheet's SILENT PADS block: a [rows] for each used pad with no sound now
 * and none from the card (BeatCards.silentPads), the [choices] PICK SOUND
 * lists (null when no sound is known: the rows then have no key), and whether
 * the pads change in Arc only until the EP-133 connects ([offline]) and the
 * [project] they are written in, for the SOUNDS block a pick joins.
 */
export interface SilentUi {
  readonly rows: readonly SilentRowUi[]
  readonly choices: SoundChoices | null
  readonly offline: boolean
  readonly project: number | null
}

/**
 * [card]'s silent pads (BeatCards.silentPads: [held] gives a pad's slot, null
 * for none, and [known] says the pads were read) as the sheet's rows with
 * their note counts; null when there are none (or the pads aren't known).
 */
export function silentUi(
  card: BeatCard,
  held: (pad: PhysicalPad) => number | null,
  known: boolean,
  choices: SoundChoices | null,
  offline: boolean,
  project: number | null,
): SilentUi | null {
  const pads = BeatCards.silentPads(card, held, known)
  if (pads.length === 0) return null
  const counts = new Map<number, number>()
  for (const s of allSections(card)) {
    for (const [offset, n] of BeatCards.notesByPad(s)) {
      const k = padKey(physicalPad(s.group, offset))
      counts.set(k, (counts.get(k) ?? 0) + n)
    }
  }
  return { rows: pads.map((pad) => ({ pad, notes: counts.get(padKey(pad)) ?? 0 })), choices, offline, project }
}

/**
 * The SOUNDS row for a sound the user picked for a silent [pad]: [slot] named
 * [name] (as the list has it), replacing "No sound": a change like any sound
 * line of the card, ticked to be put on the pad with the others.
 */
export function pickedRow(pad: PhysicalPad, slot: number, name: string | null): SoundRowUi {
  const unverified = name !== null && FactorySounds.unnamed(slot, name)
  const pick: SoundPick = { pad, wanted: cardSound(slot, name), slot, name, currentSlot: null, status: SoundStatus.CHANGE, unverified }
  return soundRowUi(pick, ClaudeText.NO_SOUND, { picked: true })
}

/**
 * The sounds picked for silent pads ([picked]: pad key to slot) as picks
 * IMPORT puts on the pads, like a card's sound lines
 * (BeatCards.resolveSounds): each is matched to the sounds as they are now
 * ([names]) and is a change unless the pad has it already ([current]); a slot
 * no longer listed is left out.
 */
export function pickedSounds(picked: ReadonlyMap<number, number>, names: ReadonlyMap<number, string>, current: (pad: PhysicalPad) => number | null): SoundPick[] {
  const out: SoundPick[] = []
  for (const [key, slot] of picked) {
    const name = names.get(slot)
    if (name === undefined) continue
    const pad = padFromKey(key)
    const now = current(pad)
    if (now === slot) continue
    out.push({ pad, wanted: cardSound(slot, name), slot, name, currentSlot: now, status: SoundStatus.CHANGE, unverified: FactorySounds.unnamed(slot, name) })
  }
  return out
}

/**
 * The sheet's FX block: a row for each kind of FX the card has a line for
 * (effect, sends, comp, duck), the project's FX now and what they become
 * (ClaudeText.fxRows); a row the project has already says so
 * (ClaudeText.isSame). [changes]: whether some row changes the project's FX
 * (APPLY FX has something to do).
 */
export interface BeatFxUi {
  readonly rows: readonly Change[]
  readonly changes: boolean
}

/** [card]'s FX line(s) against the project's FX [now] (BeatCards.applyFx); null when the card has none. */
export function beatFxUi(card: BeatCard, now: FxSettings): BeatFxUi | null {
  const fx = card.fx
  if (fx === null) return null
  const rows = ClaudeText.fxRows(now, BeatCards.applyFx(now, fx), fx)
  return rows.length === 0 ? null : { rows, changes: rows.some((r) => !ClaudeText.isSame(r)) }
}

/**
 * A card's `pad` line on the sheet: the [pad], its sound [name], what the
 * card says ([card]) and the pad's settings [now] ([hasSound]: it plays a
 * sound now, which its settings shape). A pad whose sound is changed by the
 * same import starts from the defaults, because a new sound resets its
 * settings ([base]).
 */
export class PadShapeRowUi {
  constructor(
    readonly pad: PhysicalPad,
    readonly name: string | null,
    readonly card: CardPad,
    readonly now: PadSettings,
    readonly hasSound: boolean,
  ) {}

  /** What the card is applied to: the pad's settings, or the defaults when a new sound is going onto it ([soundChanges]). */
  base(soundChanges: boolean): PadSettings {
    return soundChanges ? PadSettings.DEFAULT : this.now
  }

  /** The settings after the card's line (BeatCards.applyPad). */
  after(soundChanges: boolean): PadSettings {
    return BeatCards.applyPad(this.base(soundChanges), this.card)
  }

  /** The settings that change, old to new (ClaudeText.padParts); empty when the pad has them already. */
  parts(soundChanges: boolean): PadPart[] {
    return ClaudeText.padParts(this.base(soundChanges), this.after(soundChanges))
  }

  /** Whether the row can be ticked: there is a sound to shape (or one going on) and something to change. */
  changes(soundChanges: boolean): boolean {
    return (this.hasSound || soundChanges) && this.parts(soundChanges).length > 0
  }
}

/** The sheet's PAD SHAPING block: a [rows] for each pad line of the card, [offline] when the settings stay in Arc until the EP-133 connects. */
export interface PadShapingUi {
  readonly rows: readonly PadShapeRowUi[]
  readonly offline: boolean
}

/**
 * [card]'s pad lines as the sheet's rows, in keypad order for each section:
 * each pad's settings [now] (the defaults when not known), whether it has a
 * sound ([hasSound]) and its sound's name [names]. Null when the card has no
 * pad line.
 */
export function padShapingUi(
  card: BeatCard,
  now: (pad: PhysicalPad) => PadSettings | null,
  hasSound: (pad: PhysicalPad) => boolean,
  names: PadNames,
  offline: boolean,
): PadShapingUi | null {
  const rows: PadShapeRowUi[] = []
  for (const s of allSections(card)) {
    for (const offset of KEYPAD) {
      const line = s.pads.get(offset)
      if (line === undefined || cardPadIsEmpty(line)) continue
      const pad = physicalPad(s.group, offset)
      rows.push(new PadShapeRowUi(pad, names(pad), line, now(pad) ?? PadSettings.DEFAULT, hasSound(pad)))
    }
  }
  return rows.length === 0 ? null : { rows, offline }
}

/** [card]'s pad lines for the pads in [pads] (pad keys), in section and keypad order: what IMPORT shapes. */
export function padShapes(card: BeatCard, pads: ReadonlySet<number>): [PhysicalPad, CardPad][] {
  const out: [PhysicalPad, CardPad][] = []
  for (const s of allSections(card)) {
    for (const offset of KEYPAD) {
      const line = s.pads.get(offset)
      if (line === undefined || cardPadIsEmpty(line)) continue
      const pad = physicalPad(s.group, offset)
      if (pads.has(padKey(pad))) out.push([pad, line])
    }
  }
  return out
}

/**
 * The pad changes [after] an import put on [targets] offline, taken back: each
 * pad has the change it had [before] (none: the read's sound again). A
 * recording that was on a pad went to Takes when the import replaced it, so
 * its change isn't put back.
 */
export function offlineRestore(after: OfflinePads, before: OfflinePads, targets: readonly PadTarget[]): OfflinePads {
  return targets.reduce((pads, t) => {
    const was = OfflinePads.at(before, t.project, t.group, t.pad)
    return was !== null && was.source !== SoundSource.RECORDED ? OfflinePads.put(pads, was) : OfflinePads.drop(pads, t.project, t.group, t.pad)
  }, after)
}

/**
 * Whether [c], the sequencer UNDO gave back, is the one before an import made
 * at [before] (open groups come back closed, so only the sequencer around the
 * playing patterns is compared when they differ).
 */
export function isBefore(c: ProjectSeq, before: ProjectSeq): boolean {
  return sameSeq(c, before) || sameSeq(ProjectSeq.withPlaying(c, ProjectSeq.playing(before)), before)
}

/**
 * The beat card sheet's state: what was [read] (the card, or its problems),
 * its [grids], the title and [summary] (null for a card that can't be read),
 * where it would go ([placed]: group and pattern number; [scene]: the index of
 * the scene it adds), the [tempo] it offers (null when it has none or Arc's is
 * the same; [tempoNow] is Arc's), the [swing] it says (null when straight),
 * why IMPORT is off ([blocked]; null when it isn't), the [sounds] its sound
 * lines choose (null when it has none), its [fx] against the project's and
 * the [shaping] its pad lines give (null when it has none), and the [silent]
 * pads it plays that have no sound (null when it has none, or the pads aren't
 * known). A card of scenes also has its [scenes] (each with its grids; empty
 * for a card without `scene` lines, whose [grids] are all), its [chain] on the
 * new scenes (null when it has none or no scene can be added) and [noRoom]:
 * the project has too many scenes for the card's, which only place their
 * patterns.
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
  readonly sounds: SoundsUi | null
  readonly fx: BeatFxUi | null
  readonly shaping: PadShapingUi | null
  readonly silent: SilentUi | null
  readonly scenes: readonly BeatSceneUi[]
  readonly chain: BeatChainUi | null
  readonly noRoom: boolean
}

/**
 * The sheet's blocks as the pads are now (Kotlin's named arguments of
 * beatImportUi): the card's [sounds] (soundsUi), its [fx] (beatFxUi), its
 * pad lines' [shaping] (padShapingUi) and its [silent] pads (silentUi).
 */
export interface BeatBlocks {
  readonly sounds?: (card: BeatCard) => SoundsUi | null
  readonly fx?: (card: BeatCard) => BeatFxUi | null
  readonly shaping?: (card: BeatCard) => PadShapingUi | null
  readonly silent?: (card: BeatCard) => SilentUi | null
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
 * The tempo is offered as a whole number, which is what Arc keeps. The
 * [blocks] give the card's sound lines matched (soundsUi), its FX against the
 * project's (beatFxUi), its pad lines (padShapingUi) and its pads with no
 * sound (silentUi).
 */
export function beatImportUi(read: CardRead, seq: ProjectSeq, now: number, names: PadNames, blocks: BeatBlocks = {}): BeatImportUi {
  const card = read.card
  const nowBpm = Tempo.round(now)
  if (card === null) {
    return { read, title: ClaudeText.CARD, summary: null, grids: [], placed: [], scene: null, tempo: null, tempoNow: nowBpm, swing: null, blocked: ClaudeText.FIX_ERRORS, sounds: null, fx: null, shaping: null, silent: null, scenes: [], chain: null, noRoom: false }
  }
  const plan = BeatCards.plan(seq, card)
  // The plan places the sections in the card's order (scene by scene), or none when a group is full.
  const grids = allSections(card).map((s, i) => beatGrid(s, card.swing, names, plan.placed[i]?.[1] ?? null))
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
    sounds: blocks.sounds?.(card) ?? null,
    fx: blocks.fx?.(card) ?? null,
    shaping: blocks.shaping?.(card) ?? null,
    silent: blocks.silent?.(card) ?? null,
    scenes: isMultiScene(card) ? sceneRows(card, grids, plan) : [],
    chain: plan.chain !== null && plan.newScene ? { steps: plan.chain } : null,
    noRoom: isMultiScene(card) && plan.fullGroup === null && !plan.newScene,
  }
}

// The card's scenes as the sheet draws them: each with its slice of [grids] and, where [plan] adds the scenes, the new scene it becomes and the pattern each section took.
function sceneRows(card: BeatCard, grids: readonly BeatGridUi[], plan: CardImport): BeatSceneUi[] {
  const groups = [...new Set(allSections(card).map((s) => s.group))].sort((a, b) => a - b)
  let at = 0
  return card.scenes.map((sc, i) => {
    const mine = grids.slice(at, at + sc.sections.length)
    const taken = new Map(sc.sections.map((s, j) => [s.group, plan.placed[at + j]?.[1] ?? null] as const))
    at += sc.sections.length
    const index = plan.scenes[i] ?? null
    return {
      number: i + 1,
      name: sc.name,
      grids: mine,
      index,
      patterns: index === null ? null : plan.seq.scenes[index]!.patterns,
      parts: groups.map((g) => [g, taken.get(g) ?? null] as const),
    }
  })
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

/**
 * A card applied: the sequencer [seq] after it, where the patterns went
 * ([placed]), the index of the scene it added ([scene]; the first of them for
 * a card of scenes, which added [scenes] of them), whether it set the
 * project's chain ([chainSet]) and the group with no free pattern
 * ([fullGroup]: nothing was done).
 */
export interface BeatApplied {
  readonly seq: ProjectSeq
  readonly placed: readonly (readonly [number, number])[]
  readonly scene: number | null
  readonly fullGroup: number | null
  readonly scenes: number
  readonly chainSet: boolean
}

/**
 * IMPORT: [card] planned into [seq] (BeatCards.plan: next free patterns, a new
 * scene for a card of several groups), and the patterns picked in the scene
 * that plays when there is no new scene (a card of one group, or 99 scenes
 * already), all as ONE checkpoint of [recorder] (PatternRecorder.editSeq): a
 * single UNDO puts back the banks, the scenes and the picks as they were.
 * [BeatApplied.seq] is [seq] itself when a group is full.
 *
 * A card of scenes adds one scene for each of its own after the project's,
 * the first selected, and with [setChain] on (and a chain in the card) the
 * project's chain becomes the card's on the new scenes, turned on: all in the
 * same one checkpoint. With no room for the scenes (the project has too many)
 * the patterns are placed, and the first scene's picked in the scene playing.
 */
export function applyBeat(seq: ProjectSeq, card: BeatCard, recorder: PatternRecorder, setChain = true): BeatApplied {
  const plan = BeatCards.plan(seq, card, setChain)
  if (plan.fullGroup !== null) return { seq, placed: [], scene: null, fullGroup: plan.fullGroup, scenes: 0, chainSet: false }
  let after = plan.seq
  if (!plan.newScene) {
    // A card of scenes names a group's pattern in each scene: the first scene's is the one picked.
    const picks = isMultiScene(card) ? plan.placed.slice(0, card.scenes[0]!.sections.length) : plan.placed
    for (const [g, n] of picks) after = SceneOps.selectPattern(after, g, n)
  }
  const out = recorder.editSeq(seq, after)
  const chainSet = plan.newScene && setChain && plan.chain !== null
  return {
    seq: out,
    placed: plan.placed,
    scene: plan.newScene ? (plan.scenes[0] ?? out.scene) : null,
    fullGroup: null,
    scenes: plan.newScene ? plan.scenes.length : 0,
    chainSet,
  }
}

/**
 * IMPORT's toast for [applied], with the [sounds] put on pads and the
 * [skipped] ones that had no pad to go on, the card's [fx] put on, and the
 * [pads] shaped and the [padsSkipped] that could not be.
 */
export function beatImported(applied: BeatApplied, sounds = 0, skipped = 0, fx = false, pads = 0, padsSkipped = 0): string {
  // A card of scenes names the scenes it made: "S04–S06".
  const first = applied.scene
  const scene = first === null ? null : applied.scenes > 1 ? MirrorText.sceneLabel(first) + '\u2013' + MirrorText.sceneLabel(first + applied.scenes - 1) : MirrorText.sceneLabel(first)
  return ClaudeText.imported(applied.placed, scene, sounds, skipped, fx, pads, padsSkipped, Math.max(applied.scenes, 1), applied.chainSet)
}
