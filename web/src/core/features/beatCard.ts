// Port of core/src/main/kotlin/dev/arc/ep133/features/BeatCard.kt
//
// The ARC BEAT text card, version 1 (skill/arc-beats/references/beat-card.md):
// reading it, writing it and planning it into a project. Pure. The text is the
// spec's: grid rows for what sits on a step, a notes list for what doesn't, so
// a card Arc wrote reads back to the same patterns and writes out as the same
// text.
//
// Web deltas:
// - The data classes are plain readonly interfaces, built by `beatCard()` and
//   `cardSection()` with the Kotlin defaults.
// - The object's functions are on the `BeatCards` const object; `names` is a
//   function from a PhysicalPad (or undefined, for none) giving a name or null.
// - CardImport.fullGroup is null (not absent) when nothing is full; `placed`
//   holds [group, pattern number] tuples where the Kotlin has Pairs.
// - A section's `sounds` is a ReadonlyMap from pad offset to CardSound, built
//   by `cardSound()`; `available` in resolveSounds is a ReadonlyMap from slot to
//   name; SoundStatus is a const object plus a string union of its names.
//   Its `foreign` comes last (optional), after `current`, where the Kotlin
//   has it before the trailing lambda.
// - A section's `pads` is a ReadonlyMap from pad offset to CardPad, built by
//   `cardPad()`; the card's `fx` is a CardFx built by `cardFx()` (its `sends` a
//   ReadonlyMap from group to send). Knobs are floats kept with Math.fround, as
//   in fxSettings.ts. CardPad's methods are the functions `cardPadIsEmpty` and
//   `mergedCardPad`.
// - BeatCard keeps `sections` (the first scene's) as a field next to `scenes`,
//   so build one with `beatCard()` (a single scene from sections) or
//   `beatCardOfScenes()`; `withSections(card, sections)` is the Kotlin
//   `card.withSections(sections)`. The Kotlin properties `allSections` and
//   `multiScene` are the functions `allSections(card)` and `isMultiScene(card)`.
//   The card's chain is a list of [card scene number, passes] tuples; the
//   import's `chain` is a list of ChainSteps; BeatCards.fromScenes takes the
//   chain as ChainSteps, the seq's by default (pass `undefined`).
// - A section's `synths` (its synth lines, a ReadonlyMap from pad offset to
//   CardSynth) is optional and present only when it has any, so sections built
//   without them compare equal as before. A CardSynth, built by `cardSynth()`,
//   leaves out the fields its line didn't give (Kotlin has nulls), and its
//   enums are string unions of their words. BeatCards.synthsByPad is keyed by
//   padKey where the Kotlin has PhysicalPads. The web reads, writes and keeps
//   synth lines; it makes no sounds.

import { clamp01 } from '../formats/fx/fxMath'
import { Chain, chainStep, type ChainStep } from './chain'
import { FX_TYPES, FxSettings, FxType, comp, sidechain, type Comp, type Sidechain } from './fxSettings'
import { Keys } from './keys'
import { LABELS, ROWS, noteName, padKey, physicalPad, type PhysicalPad } from './padNotes'
import { Pattern, ProjectSeq, Seq, Timing, TimingSettings, pattern, patternNote, scene, timingTicks, type PatternNote, type Scene } from './pattern'
import { PadSettings, PlayMode } from './padSettings'
import { PadSoundCache } from './padSoundCache'
import { FactoryKit, unnamed } from './factorySounds'
import { SceneOps } from './scenes'
import { Steps } from './steps'
import { BEATS_PER_BAR } from './tempo'
import { ClaudeText } from '../text/claudeText'

/**
 * A beat as an ARC BEAT text card: an optional [name] (up to 40 characters),
 * the [tempo] it is meant for (40 to 240 BPM), the [swing] of its grid rows
 * (50..75, 50 straight, as the device's TIMING) and its [scenes]. [fx] is the
 * project's effect lines, null when the card has none; they are project-wide,
 * so they apply to every scene.
 *
 * [scenes] is never empty. A card with no `scene` line has one implicit scene
 * with no name, which holds the card's sections, one for each group at most;
 * [sections] is that first scene's sections, so code written for single-scene
 * cards keeps working (on a multi-scene card it is the first scene only: use
 * allSections or [scenes]). [sceneLines] is set when the card's text had a
 * `scene` line (or is to be written with them), even for one scene: a card with
 * `scene` lines imports as new scenes (BeatCards.plan), one without as
 * patterns. [chain] is the `chain` line, null when the card has none: its steps
 * as [card scene number from 1, passes 1..8].
 */
export interface BeatCard {
  readonly name: string | null
  readonly tempo: number | null
  readonly swing: number
  readonly scenes: readonly CardScene[]
  readonly sections: readonly CardSection[]
  readonly fx: CardFx | null
  readonly chain: readonly (readonly [number, number])[] | null
  readonly sceneLines: boolean
  /** The card's lesson, its `lesson` lines in order (LessonStep); none when left out. */
  readonly lesson?: readonly LessonStep[]
}

/**
 * A step of a card's lesson (`lesson Kick alone | A7 | 50 | Count out loud`): its [title], the [group] and [pads]
 * (offsets; null: all the group's) the player plays, at [speed] percent of the tempo, and a [tip]. Arc on Android
 * runs it in PRACTICE; the web reads and writes it.
 */
export interface LessonStep {
  readonly title: string
  readonly group: number
  readonly pads: readonly number[] | null
  readonly speed: number
  readonly tip: string | null
}

export const LESSON_MAX = 12
export const LESSON_MIN_SPEED = 25
export const LESSON_MAX_SPEED = 100

/** A single-scene card of [sections] (what `BeatCard(...)` is in Kotlin). */
export function beatCard(
  name: string | null = null,
  tempo: number | null = null,
  swing: number = TimingSettings.SWING_MIN,
  sections: readonly CardSection[] = [],
  fx: CardFx | null = null,
): BeatCard {
  return { name, tempo, swing, scenes: [cardScene(null, sections)], sections, fx, chain: null, sceneLines: false }
}

/** A card of [scenes] (never empty: an empty list is one scene with no sections). */
export function beatCardOfScenes(
  name: string | null,
  tempo: number | null,
  swing: number,
  scenes: readonly CardScene[],
  fx: CardFx | null = null,
  chain: readonly (readonly [number, number])[] | null = null,
  sceneLines = false,
  lesson: readonly LessonStep[] = [],
): BeatCard {
  const all = scenes.length === 0 ? [cardScene(null, [])] : scenes
  return { name, tempo, swing, scenes: all, sections: all[0]!.sections, fx, chain, sceneLines, ...(lesson.length > 0 ? { lesson } : {}) }
}

/** The same card with [sections] as its first scene's. */
export function withSections(card: BeatCard, sections: readonly CardSection[]): BeatCard {
  return { ...card, scenes: [{ ...card.scenes[0]!, sections }, ...card.scenes.slice(1)], sections }
}

/** The sections of every scene, in order. */
export function allSections(card: BeatCard): CardSection[] {
  return card.scenes.flatMap((sc) => sc.sections)
}

/** Whether the card is written, and imported, as scenes: it has `scene` lines, more than one scene or a chain. */
export function isMultiScene(card: BeatCard): boolean {
  return card.sceneLines || card.scenes.length > 1 || card.chain !== null
}

/**
 * One scene of a card (a `scene` line and what follows it): its optional [name]
 * (up to 40 characters; Arc keeps no scene names) and its [sections], one for
 * each group at most. A group the scene leaves out plays the previous scene's
 * pattern; in the first scene, the pattern the scene playing gives it.
 */
export interface CardScene {
  readonly name: string | null
  readonly sections: readonly CardSection[]
}

export function cardScene(name: string | null = null, sections: readonly CardSection[] = []): CardScene {
  return { name, sections }
}

/**
 * The effect lines of a card (the spec's "Effects"), each kind apart and null
 * when the card has no such line, so a card sets only what it says. Knobs are
 * 0..1 floats (the card's percent / 100). [type] is the `fx` line's effect with
 * its [x] and [y] (0.5 when the line gave none); [sends] is the `send` lines'
 * groups (0..3) with their sends, the groups left out being 0 once applied;
 * [comp] is the `comp` line (off is `comp({ on: false })`); [sidechain] is the
 * `sidechain` line (off is `sidechain({ on: false })`).
 */
export interface CardFx {
  readonly type: FxType | null
  readonly x: number | null
  readonly y: number | null
  readonly sends: ReadonlyMap<number, number> | null
  readonly comp: Comp | null
  readonly sidechain: Sidechain | null
}

export function cardFx(fields: Partial<CardFx> = {}): CardFx {
  const c = { type: null, x: null, y: null, sends: null, comp: null, sidechain: null, ...fields }
  return { type: c.type, x: c.x === null ? null : Math.fround(c.x), y: c.y === null ? null : Math.fround(c.y), sends: c.sends, comp: c.comp, sidechain: c.sidechain }
}

/**
 * A `pad` line of a card (the spec's "Pad shaping"): the settings it gave, null
 * for the rest. [pitch] is in semitones (-12..12), [level] 0..100, [pan]
 * -16..16, [attack] and [release] envelope ticks 0..255 and [mode] the play
 * mode, all as the pad sheet has them (PadSettings).
 */
export interface CardPad {
  readonly pitch: number | null
  readonly level: number | null
  readonly pan: number | null
  readonly attack: number | null
  readonly release: number | null
  readonly mode: PlayMode | null
}

export function cardPad(fields: Partial<CardPad> = {}): CardPad {
  return { pitch: null, level: null, pan: null, attack: null, release: null, mode: null, ...fields }
}

/** Whether the line gave no setting at all. */
export function cardPadIsEmpty(p: CardPad): boolean {
  return p.pitch === null && p.level === null && p.pan === null && p.attack === null && p.release === null && p.mode === null
}

/** [p]'s settings, with [later]'s over them where it gives one. */
export function mergedCardPad(p: CardPad, later: CardPad): CardPad {
  return {
    pitch: later.pitch ?? p.pitch,
    level: later.level ?? p.level,
    pan: later.pan ?? p.pan,
    attack: later.attack ?? p.attack,
    release: later.release ?? p.release,
    mode: later.mode ?? p.mode,
  }
}

/**
 * One group's pattern on a card: [group] 0..3 (A..D), the pattern [number]
 * 1..99 it was written as (a hint, null when the card gave none), the
 * [pattern] itself, the [sounds] its pads should play and the [pads]' shaping
 * (a `pad` line each), both by pad offset. [synths] are its `synth` lines by
 * pad offset, present only when it has any.
 */
export interface CardSection {
  readonly group: number
  readonly number: number | null
  readonly pattern: Pattern
  readonly sounds: ReadonlyMap<number, CardSound>
  readonly pads: ReadonlyMap<number, CardPad>
  readonly synths?: ReadonlyMap<number, CardSynth>
}

export function cardSection(
  group: number,
  number: number | null,
  pat: Pattern,
  sounds: ReadonlyMap<number, CardSound> = new Map(),
  pads: ReadonlyMap<number, CardPad> = new Map(),
  synths: ReadonlyMap<number, CardSynth> = new Map(),
): CardSection {
  return { group, number, pattern: pat, sounds, pads, ...(synths.size > 0 ? { synths } : {}) }
}

/** The sound types of a synth line, in order (the order is the type's ordinal). */
export type SynthType = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'tom' | 'rim' | 'cowbell' | 'sub' | 'bass' | 'pluck' | 'stab' | 'bell' | 'zap' | 'lead' | 'pad' | 'riser'
export const SYNTH_TYPES: readonly SynthType[] = ['kick', 'snare', 'clap', 'hat', 'openhat', 'tom', 'rim', 'cowbell', 'sub', 'bass', 'pluck', 'stab', 'bell', 'zap', 'lead', 'pad', 'riser']

/** A synth line's oscillator: `metal` is six square waves, `none` noise only. */
export type SynthWave = 'sine' | 'tri' | 'saw' | 'square' | 'metal' | 'none'
export const SYNTH_WAVES: readonly SynthWave[] = ['sine', 'tri', 'saw', 'square', 'metal', 'none']

/** The notes a synth line stacks on its root. */
export type SynthChord = 'one' | 'min' | 'maj' | 'min7' | 'maj7' | 'dom7' | 'sus2' | 'sus4' | 'fifth' | 'oct'
export const SYNTH_CHORDS: readonly SynthChord[] = ['one', 'min', 'maj', 'min7', 'maj7', 'dom7', 'sus2', 'sus4', 'fifth', 'oct']

/**
 * A synth line: only what the line gave. A field the line left out is absent (Arc on Android fills in its type's
 * default when it makes the sound). [note] is a MIDI note, [length] is in hundredths of a second, the knobs are 0..100.
 */
export interface CardSynth {
  readonly type: SynthType
  readonly note?: number
  readonly wave?: SynthWave
  readonly chord?: SynthChord
  readonly attack?: number
  readonly decay?: number
  readonly length?: number
  readonly tone?: number
  readonly reso?: number
  readonly sweep?: number
  readonly bend?: number
  readonly click?: number
  readonly noise?: number
  readonly snap?: number
  readonly drive?: number
  readonly detune?: number
  readonly level?: number
  readonly seed?: number
  readonly name?: string
}

/** The most characters a synth line's name keeps. */
export const SYNTH_NAME_MAX = 13

type SynthFields = { -readonly [K in Exclude<keyof CardSynth, 'type'>]?: CardSynth[K] }

/** A synth line of [type] with [fields]; one left out or undefined is absent, never an undefined value. */
export function cardSynth(type: SynthType, fields: SynthFields = {}): CardSynth {
  const f = fields
  return {
    type,
    ...(f.note !== undefined ? { note: f.note } : {}),
    ...(f.wave !== undefined ? { wave: f.wave } : {}),
    ...(f.chord !== undefined ? { chord: f.chord } : {}),
    ...(f.attack !== undefined ? { attack: f.attack } : {}),
    ...(f.decay !== undefined ? { decay: f.decay } : {}),
    ...(f.length !== undefined ? { length: f.length } : {}),
    ...(f.tone !== undefined ? { tone: f.tone } : {}),
    ...(f.reso !== undefined ? { reso: f.reso } : {}),
    ...(f.sweep !== undefined ? { sweep: f.sweep } : {}),
    ...(f.bend !== undefined ? { bend: f.bend } : {}),
    ...(f.click !== undefined ? { click: f.click } : {}),
    ...(f.noise !== undefined ? { noise: f.noise } : {}),
    ...(f.snap !== undefined ? { snap: f.snap } : {}),
    ...(f.drive !== undefined ? { drive: f.drive } : {}),
    ...(f.detune !== undefined ? { detune: f.detune } : {}),
    ...(f.level !== undefined ? { level: f.level } : {}),
    ...(f.seed !== undefined ? { seed: f.seed } : {}),
    ...(f.name !== undefined ? { name: f.name } : {}),
  }
}

/**
 * A sound line of a card: the EP-133 sound [slot] (1..999) a pad should play
 * and, when the card gave it, the sound's [name] as the user's list has it,
 * which lets Arc check that the slot still holds that sound.
 */
export interface CardSound {
  readonly slot: number
  readonly name: string | null
}

export function cardSound(slot: number, name: string | null = null): CardSound {
  return { slot, name }
}

/** What `BeatCards.resolveSounds` makes of a sound line. */
export type SoundStatus = 'CHANGE' | 'SAME' | 'FOUND_BY_NAME' | 'MISSING'
export const SoundStatus = {
  /** The sound is on the slot to put on the pad: a change. */
  CHANGE: 'CHANGE',
  /** The pad already plays the sound: nothing to do. */
  SAME: 'SAME',
  /** The line's slot didn't hold the named sound (or was empty), but another slot does: still a change, to that slot. */
  FOUND_BY_NAME: 'FOUND_BY_NAME',
  /** Neither the slot nor the name is among the sounds: the line is skipped. */
  MISSING: 'MISSING',
} as const

/**
 * A sound line matched to the user's sounds: the [pad] and what the card
 * [wanted], the [slot] and [name] to put on it (null for both when [status]
 * is MISSING), the slot the pad plays now ([currentSlot], null when not known)
 * and the [status]. [unverified] is set when the slot is a factory sound the
 * EP-133 lists without a name ("200.pcm", see FactorySounds.unnamed): it is
 * used by its slot, as its name can't be checked.
 */
export interface SoundPick {
  readonly pad: PhysicalPad
  readonly wanted: CardSound
  readonly slot: number | null
  readonly name: string | null
  readonly currentSlot: number | null
  readonly status: SoundStatus
  readonly unverified: boolean
}

/** Something wrong with a card, at [line] (counted from 1 in the text read): an [error] stops the card being read, a warning doesn't. */
export interface CardProblem {
  readonly line: number
  readonly message: string
  readonly error: boolean
}

/** A card as read: the [card], or null when any problem is an error, and all the [problems] by line. */
export interface CardRead {
  readonly card: BeatCard | null
  readonly problems: readonly CardProblem[]
  /** Each pad's row name as the card writes it ("A7 kick" gives kick), by padKey, the first row's for a pad with several: for suggestSound. */
  readonly names?: ReadonlyMap<number, string>
}

/**
 * A card planned into a project's sequencer: the [seq] after it, the
 * [group, pattern number] slots it filled ([placed], in the card's order: for a
 * card of scenes, scene by scene), and whether it added a scene ([newScene]).
 * [scenes] are the indices of the scenes it added, in the card's order (empty
 * when [newScene] is false); [chain] is the card's chain mapped to them, as
 * steps of those scene indices (null when the card has no chain or added no
 * scenes). [fullGroup] is the group whose bank had no free pattern when
 * nothing could be placed: then [seq] is the very one given and [placed] is
 * empty. It is null otherwise.
 */
export interface CardImport {
  readonly seq: ProjectSeq
  readonly placed: readonly (readonly [number, number])[]
  readonly newScene: boolean
  readonly fullGroup: number | null
  readonly scenes: readonly number[]
  readonly chain: readonly ChainStep[] | null
}

const VERSION = 1
const MAX_NAME = 40

/** The most scenes a card holds. */
const MAX_SCENES = 16

/** The comment a tidied card carries. */
const TIDY_COMMENT = '# tidied: velocities and short gates rounded'

const TEMPO_MIN = 40
const TEMPO_MAX = 240

/** The sound slots of the EP-133. */
const SLOT_MIN = 1
const SLOT_MAX = 999

/** A note's gate when it gives none: a 1/16. */
const DEFAULT_GATE = 24

/** The least width of the sound name column, when any row has a name. */
const NAME_WIDTH = 9

/** The steps a card may read in, and those it writes in (first that fits). */
const READ_STEPS: readonly Timing[] = [Timing.EIGHTH, Timing.SIXTEENTH, Timing.THIRTY_SECOND, Timing.EIGHTH_T, Timing.SIXTEENTH_T]
const WRITE_STEPS: readonly Timing[] = [Timing.SIXTEENTH, Timing.SIXTEENTH_T, Timing.THIRTY_SECOND]

/** The gate words, in ticks. */
const GATES: ReadonlyMap<string, number> = new Map([
  ['1/4', 96],
  ['1/8', 48],
  ['1/16', 24],
  ['1/32', 12],
  ['1/8T', 32],
  ['1/16T', 16],
])

/** The pads in the order rows go: the keypad from top to bottom (7 8 9 4 5 6 1 2 3 . 0 E). */
const KEYPAD: readonly number[] = ROWS.flat()

const NOTE_KEYS = new Set(['at', 't', 'vel', 'gate', 'note', 'semi'])
const HEADER_KEYS = new Set(['name', 'tempo', 'swing'])

/** The effect lines: header only. */
const FX_KEYS = new Set(['fx', 'send', 'comp', 'sidechain'])
const PAD_KEYS = new Set(['pitch', 'level', 'pan', 'attack', 'release', 'mode'])
const FX_WORDS = 'none, delay, reverb, distortion, chorus, filter or compressor'

/** A synth line's settings, in the order a card writes them. No key is a type, wave or chord word, or a line's first word. */
const SYNTH_KEYS = ['note', 'wave', 'chord', 'attack', 'decay', 'length', 'tone', 'reso', 'sweep', 'bend', 'click', 'noise', 'snap', 'drive', 'detune', 'level', 'seed', 'name'] as const
type SynthKey = (typeof SYNTH_KEYS)[number]
const SYNTH_KEY_SET: ReadonlySet<string> = new Set(SYNTH_KEYS)
/** The synth knobs, 0 to 100; level is 1 to 100 and seed 0 to 999. */
const SYNTH_KNOBS = new Set(['attack', 'decay', 'tone', 'reso', 'sweep', 'bend', 'click', 'noise', 'snap', 'drive', 'detune'])
const SYNTH_INT = /^[0-9]{1,3}$/
const SYNTH_NOTE = /^[A-G]#?[0-9]$/
const SYNTH_LENGTH = /^([0-9])(?:\.([0-9]{1,2}))?$/
const SYNTH_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
/** A synth note: C0 to C7, as MIDI. */
const SYNTH_NOTE_MIN = 12
const SYNTH_NOTE_MAX = 96
/** A synth length: 0.05 to 4 seconds, in hundredths. */
const SYNTH_LENGTH_MIN = 5
const SYNTH_LENGTH_MAX = 400

/** A knob value as a card writes it: 0 to 100, whole or with one decimal. */
const PERCENT = /^\d{1,3}(\.\d)?$/
const PERCENT_TEXT = '0 to 100, whole or with one decimal'
const PITCH_TEXT = /^[+-]?\d{1,2}(\.\d{1,2})?$/
const GROUP_LIST = /^[A-D]+$/

const CARD_START = /^ARC[ \t\u00A0]+BEAT(?:[ \t\u00A0]|$)/i
const PAD = /^([A-D])(ENTER|[E.0-9])$/
const SECTION = /^([A-D])(\d*)$/
const AT = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})([+-]\d{1,6})?$/
const NOTE_NAME = /^[A-G]#?(?:-1|\d)$/
const CHAIN_STEP = /^(\d{1,6})(?:[xX](\d{1,6}))?$/
const TEXT_BREAKS = /[#|\t\r\n\u00A0 ]+/g
const INT = /^\d{1,9}$/
const SIGNED = /^[+-]?\d{1,9}$/
const TEMPO_TEXT = /^\d{1,3}(\.\d)?$/
const SWING_TEXT = /^\d{1,3}$/

/** MIDI note by name, C-1 (0) to G9 (127), as padNotes' noteName names them. */
let noteNumbers: Map<string, number> | null = null
function noteNumber(name: string): number | undefined {
  if (noteNumbers === null) {
    noteNumbers = new Map()
    for (let n = 0; n <= 127; n++) noteNumbers.set(noteName(n), n)
  }
  return noteNumbers.get(name)
}

function noteOrder(a: PatternNote, b: PatternNote): number {
  return a.tick - b.tick || a.offset - b.offset || (a.semitones ?? -Infinity) - (b.semitones ?? -Infinity) || 0
}

function isSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\u00A0'
}

function trim(s: string): string {
  return s.replace(/^[ \t\u00A0]+|[ \t\u00A0]+$/g, '')
}

// A # starts a comment at the start of a line or after a space; one inside a word is a sharp (note C#3).
function stripComment(s: string): string {
  for (let i = 0; i < s.length; i++) if (s[i] === '#' && (i === 0 || isSpace(s[i - 1]!))) return s.slice(0, i)
  return s
}

function tokens(s: string): string[] {
  return s.split(/[ \t\u00A0]+/).filter((t) => t !== '')
}

// [s] cut to at most [max] characters, a surrogate pair counting as one so it is never split.
function cut(s: string, max: number): string {
  const chars = Array.from(s)
  return chars.length <= max ? s : chars.slice(0, max).join('')
}

function chunks(s: string, n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n))
  return out
}

function firstIsPad(line: string): boolean {
  return parsePad(tokens(line)[0]!) !== null
}

// "A7", "A." or "AENTER" (or "AE") as a pad; null when it isn't one. Case counts.
function parsePad(token: string): PhysicalPad | null {
  const m = PAD.exec(token)
  if (m === null) return null
  const label = m[2] === 'E' ? 'ENTER' : m[2]!
  return physicalPad(m[1]!.charCodeAt(0) - 65, LABELS.indexOf(label))
}

/** A pad as a card writes it: its group letter and label, ENTER as E. */
function padText(group: number, offset: number): string {
  return `${String.fromCharCode(65 + group)}${offset === 2 ? 'E' : LABELS[offset]}`
}

function letter(group: number): string {
  return String.fromCharCode(65 + group)
}

// The velocity a step character plays at; null when it isn't a hit.
function velocityOf(c: string): number | null {
  if (c === 'X') return 127
  if (c === 'x') return 100
  if (c === 'o') return 64
  if (c >= '1' && c <= '9') return 14 * (c.charCodeAt(0) - 48)
  return null
}

// The step character for a velocity; null when no character gives it.
function charOf(velocity: number): string | null {
  if (velocity === 127) return 'X'
  if (velocity === 100) return 'x'
  if (velocity === 64) return 'o'
  if (velocity >= 14 && velocity <= 126 && velocity % 14 === 0) return String(velocity / 14)
  return null
}

/** [tick] as the notes list gives it: bar.beat.sixteenth, and the ticks left over as +n (or -n before the next sixteenth). */
function atText(tick: number): string {
  const bar = Math.trunc(tick / Seq.TICKS_PER_BAR)
  const within = tick % Seq.TICKS_PER_BAR
  let sixteenth = Math.trunc(within / 24)
  let left = within % 24
  // Past halfway the next sixteenth is nearer; the last of a bar keeps its +n.
  if (left > 12 && sixteenth < 15) {
    sixteenth++
    left -= 24
  }
  const suffix = left > 0 ? `+${left}` : left < 0 ? `${left}` : ''
  return `${bar + 1}.${Math.trunc(sixteenth / 4) + 1}.${(sixteenth % 4) + 1}${suffix}`
}

// ---- Reading ----

interface Draft {
  readonly line: number
  readonly group: number
  readonly number: number | null
  readonly bars: number
  readonly step: Timing
  /** The section's own line was wrong: its body is skipped, as it would only repeat the fault. */
  readonly skip: boolean
  /** A second section of a group already read: read for its problems, then dropped. */
  readonly dropped: boolean
  /** The notes read, with the line each came from. */
  readonly hits: { note: PatternNote; line: number }[]
  /** The sound lines read, by pad offset. */
  readonly sounds: Map<number, CardSound>
  /** The pad lines read (merged when a pad has more than one), by pad offset. */
  readonly pads: Map<number, CardPad>
  /** The synth lines read, by pad offset: a later line for a pad replaces the first, in its place. */
  readonly synths: Map<number, CardSynth>
  inNotes: boolean
}

function newDraft(line: number, group: number, number: number | null, bars: number, step: Timing, skip: boolean, dropped: boolean): Draft {
  return { line, group, number, bars, step, skip, dropped, hits: [], sounds: new Map(), pads: new Map(), synths: new Map(), inNotes: false }
}

/** Whether [text] has an ARC BEAT line: what [read] starts from, so a text without one is no card at all (not a card with a mistake). */
function hasCard(text: string): boolean {
  return text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).some((l) => CARD_START.test(trim(l)))
}

/**
 * The card in [text]. What comes before the first ARC BEAT line is ignored,
 * and reading stops at a line that is just ``` or END; see the spec for the
 * rest. A # starts a comment at the start of a line or after a space, so a
 * sharp in a note name (C#3) stays. Lines count from 1 in [text]. The card is
 * null when any problem is an error; warnings leave it readable.
 */
function read(text: string): CardRead {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
  const problems: CardProblem[] = []
  let name: string | null = null
  let tempo: number | null = null
  let swing: number = TimingSettings.SWING_MIN
  let fxType: FxType | null = null
  let fxX: number | null = null
  let fxY: number | null = null
  let fxSends: Map<number, number> | null = null
  let fxComp: Comp | null = null
  let fxSidechain: Sidechain | null = null
  // The sections of the scene being read (of the one implicit scene when the card has no scene line).
  const sections: CardSection[] = []
  const groups = new Set<number>()
  let draft: Draft | null = null
  let sectionLines = 0

  // The scenes read, the scene line count, the name of the scene being read, and the line of the first section when no scene line came before it.
  const scenes: CardScene[] = []
  let sceneLines = 0
  let sceneName: string | null = null
  let firstSection = 0

  // The chain line read (card scene numbers from 1, passes) and its line.
  let chain: [number, number][] | null = null
  let chainAt = 0

  // Each pad's first row name, for CardRead.names.
  const names = new Map<number, string>()
  const error = (line: number, message: string): void => {
    problems.push({ line, message, error: true })
  }
  const warn = (line: number, message: string): void => {
    problems.push({ line, message, error: false })
  }
  const result = (): CardRead => {
    // Array.prototype.sort is stable, as Kotlin's sortedBy.
    const sorted = [...problems].sort((a, b) => a.line - b.line)
    const card = sorted.some((p) => p.error) ? null : beatCardOfScenes(name, tempo, swing, [...scenes], readFx(), chain, sceneLines > 0, lesson.map((l) => l[1]))
    return { card, problems: sorted, names }
  }
  // ---- lesson ----
  const lesson: [number, LessonStep][] = []
  // lesson <title> | <pads> | <speed> | <tip>: a step of the lesson. A line with a fault is left out.
  const lessonLine = (no: number, line: string): void => {
    const parts = line.slice(tokens(line)[0]!.length).split('|').map((p) => trim(p))
    let title = parts[0] ?? ''
    const padsText = parts[1] ?? ''
    if (title === '' || padsText === '') return error(no, 'A lesson line needs a title and the pads to play, as in lesson Kick alone | A7 | 50.')
    if (lesson.length === LESSON_MAX) return error(no, `The lesson has more than ${LESSON_MAX} steps, the most is ${LESSON_MAX}.`)
    if (Array.from(title).length > MAX_NAME) {
      warn(no, `Lesson step title is longer than ${MAX_NAME} characters, shortened.`)
      title = trim(cut(title, MAX_NAME))
    }
    let group: number | null = null
    let pads: Set<number> | null = new Set()
    for (const tok of tokens(padsText)) {
      const whole = tok.length === 1 && tok >= 'A' && tok <= 'D'
      const pad = whole ? null : parsePad(tok)
      const g = whole ? tok.charCodeAt(0) - 65 : (pad?.group ?? null)
      if (g === null) return error(no, `'${tok}' isn't a pad or a group: write pads such as A7 A9, or A for the whole group.`)
      if (group !== null && g !== group) return error(no, "A lesson step's pads are all in one group.")
      group = g
      if (whole) pads = null
      else pads?.add(pad!.offset)
    }
    const speedText = trim((parts[2] ?? '').replace(/%$/, ''))
    const speed = speedText === '' ? LESSON_MAX_SPEED : /^\d{1,3}$/.test(speedText) ? Number(speedText) : null
    if (speed === null || speed < LESSON_MIN_SPEED || speed > LESSON_MAX_SPEED) {
      return error(no, `A lesson step's speed is ${LESSON_MIN_SPEED} to ${LESSON_MAX_SPEED} percent of the tempo.`)
    }
    const tip = trim(parts.slice(3).join(' | '))
    lesson.push([no, { title, group: group!, pads: pads === null ? null : [...pads].sort((a, b) => a - b), speed, tip: tip === '' ? null : tip }])
  }
  // Each step's pads have pad hits in the first scene's pattern of its group.
  const checkLesson = (): void => {
    const first = scenes[0]?.sections ?? []
    for (const [no, step] of lesson) {
      const section = first.find((s) => s.group === step.group)
      const notes = section === undefined ? [] : Pattern.playable(section.pattern).filter((n) => n.semitones === null)
      const played = new Set(notes.map((n) => n.offset))
      const missing = (step.pads ?? []).filter((o) => !played.has(o))
      if (notes.length === 0) error(no, `Lesson step '${step.title}': the card's first scene has no pad hits in group ${letter(step.group)}.`)
      else if (missing.length > 0) error(no, `Lesson step '${step.title}': ${missing.map((o) => padText(step.group, o)).join(' ')} has no hits in the first scene's [${letter(step.group)}].`)
    }
  }
  // The chain names scenes the card has, and the card has scenes at all.
  const checkChain = (): void => {
    const c = chain
    if (c === null) return
    if (sceneLines === 0) {
      error(chainAt, 'A chain needs scenes: start each scene with a scene line.')
      return
    }
    const i = c.findIndex((x) => x[0] > sceneLines)
    if (i >= 0) error(chainAt, `chain step ${i + 1} names scene ${c[i]![0]}, but the card has ${sceneLines} ${sceneLines === 1 ? 'scene' : 'scenes'}.`)
  }
  // The effect lines read, or null when the card has none.
  const readFx = (): CardFx | null =>
    fxType === null && fxX === null && fxY === null && fxSends === null && fxComp === null && fxSidechain === null
      ? null
      : { type: fxType, x: fxX, y: fxY, sends: fxSends === null ? null : new Map(fxSends), comp: fxComp, sidechain: fxSidechain }

  // The version after ARC BEAT; false when the card can't be read at all.
  const version = (no: number, t: string[]): boolean => {
    const v = t[2]
    if (v === undefined || !/^\d+$/.test(v) || v.length > 6 || Number(v) < 1) {
      error(no, `ARC BEAT needs a version, as in ARC BEAT ${VERSION}.`)
      return false
    }
    if (Number(v) > VERSION) {
      error(no, `This card was made by a newer Arc (version ${Number(v)}).`)
      return false
    }
    return true
  }

  // The section's pattern: duplicates folded, the limit checked.
  const close = (): void => {
    const d = draft
    if (d === null) return
    draft = null
    if (d.skip) return
    const kept: PatternNote[] = []
    const at = new Map<string, number>()
    for (const { note: n, line: no } of d.hits) {
      const key = `${n.offset}:${n.tick}:${n.semitones ?? 'n'}`
      const j = at.get(key)
      if (j === undefined) {
        at.set(key, kept.length)
        kept.push(n)
      } else {
        warn(no, `${padText(d.group, n.offset)} has two hits at ${atText(n.tick)}, kept the louder.`)
        if (n.velocity > kept[j]!.velocity) kept[j] = n
      }
    }
    if (kept.length > Seq.MAX_NOTES) error(d.line, `Group ${letter(d.group)} has ${kept.length} notes, the most is ${Seq.MAX_NOTES}.`)
    if (!d.dropped) {
      sections.push({ group: d.group, number: d.number, pattern: pattern(d.bars, kept.sort(noteOrder)), sounds: d.sounds, pads: d.pads, ...(d.synths.size > 0 ? { synths: d.synths } : {}) })
    }
  }

  // A section line that can't be used: its body is skipped.
  const skipped = (no: number, message: string): void => {
    error(no, message)
    draft = newDraft(no, 0, null, Seq.DEFAULT_BARS, Timing.SIXTEENTH, true, true)
  }

  const section = (no: number, line: string): void => {
    close()
    sectionLines++
    if (sceneLines === 0 && firstSection === 0) firstSection = no
    const end = line.indexOf(']')
    if (end < 0) {
      skipped(no, 'A section needs a closing ], as in [A].')
      return
    }
    const m = SECTION.exec(trim(line.slice(1, end)))
    if (m === null) {
      skipped(no, 'A section needs a group A to D, as in [A] or [A07].')
      return
    }
    const letterText = m[1]!
    const group = letterText.charCodeAt(0) - 65
    const digits = m[2]!
    const parsed = digits === '' ? null : Number(digits)
    const num = parsed !== null && digits.length <= 2 && parsed >= 1 && parsed <= Seq.MAX_PATTERNS ? parsed : null
    if (digits !== '' && num === null) {
      skipped(no, `The pattern number in [${letterText}${digits}] must be 1 to ${Seq.MAX_PATTERNS}.`)
      return
    }
    const t = tokens(line.slice(end + 1))
    let bars: number = Seq.DEFAULT_BARS
    let step: Timing = Timing.SIXTEENTH
    let bad = false
    let i = 0
    while (i < t.length) {
      const key = t[i]!.toLowerCase()
      const v = t[i + 1]
      if (key === 'bars') {
        const n = v !== undefined && v.length <= 3 && /^\d+$/.test(v) ? Number(v) : null
        if (n === null || n < 1 || n > Seq.MAX_BARS) {
          error(no, `bars must be a whole number from 1 to ${Seq.MAX_BARS}.`)
          bad = true
        } else bars = n
        i += 2
      } else if (key === 'step') {
        const s = READ_STEPS.find((x) => v !== undefined && x.toLowerCase() === v.toLowerCase())
        if (s === undefined) {
          error(no, `step must be one of ${READ_STEPS.join(' ')}.`)
          bad = true
        } else step = s
        i += 2
      } else {
        warn(no, `Unknown option '${t[i]}' on [${letterText}], ignored.`)
        i += v !== undefined && v.toLowerCase() !== 'bars' && v.toLowerCase() !== 'step' ? 2 : 1
      }
    }
    const dropped = groups.has(group)
    groups.add(group)
    if (dropped) error(no, `Group ${letter(group)} has two sections.`)
    draft = newDraft(no, group, num, bars, step, bad, dropped)
  }

  // scene [name]: starts a scene; the sections up to the next scene line are its.
  const sceneLine = (no: number, line: string): void => {
    close()
    if (sceneLines > 0) scenes.push(cardScene(sceneName, [...sections]))
    else if (firstSection !== 0) error(firstSection, 'A section comes before the first scene line: once a card has scenes, every section belongs to one.')
    sections.length = 0
    groups.clear()
    sceneLines++
    if (sceneLines === MAX_SCENES + 1) error(no, `The card has more than ${MAX_SCENES} scenes, the most is ${MAX_SCENES}.`)
    const rest = trim(line.slice(tokens(line)[0]!.length))
    if (rest === '') sceneName = null
    else if (Array.from(rest).length > MAX_NAME) {
      warn(no, `Scene name is longer than ${MAX_NAME} characters, shortened.`)
      sceneName = trim(cut(rest, MAX_NAME))
    } else sceneName = rest
  }

  // chain <step> ...: a step is a scene number from 1, with its passes as in 2x4 (1..8, default 1). A line with a fault changes nothing.
  const chainLine = (no: number, line: string): void => {
    const word = tokens(line)[0]!
    if (sectionLines > 0 || sceneLines > 0) {
      error(no, `'${word}' belongs before the first scene.`)
      return
    }
    const t = tokens(line.slice(word.length))
    if (t.length === 0) {
      error(no, 'chain needs at least one scene, as in chain 1 2x2 3.')
      return
    }
    const steps: [number, number][] = []
    for (const tok of t) {
      const m = CHAIN_STEP.exec(tok)
      if (m === null) {
        error(no, `'${tok}' isn't a chain step. Write a scene number, and its passes after an x, as in 2 or 2x4.`)
        return
      }
      const sc = Number(m[1])
      const passes = m[2] === undefined || m[2] === '' ? 1 : Number(m[2])
      if (sc < 1) {
        error(no, `chain step '${tok}': scenes count from 1.`)
        return
      }
      if (passes < Chain.MIN_PASSES || passes > Chain.MAX_PASSES) {
        error(no, `chain step '${tok}': passes must be ${Chain.MIN_PASSES} to ${Chain.MAX_PASSES}.`)
        return
      }
      steps.push([sc, passes])
    }
    if (steps.length > Chain.MAX_STEPS) {
      error(no, `The chain has ${steps.length} steps, the most is ${Chain.MAX_STEPS}.`)
      return
    }
    if (chain !== null) warn(no, 'Two chain lines, kept the later.')
    chain = steps
    chainAt = no
  }

  const header = (no: number, line: string): void => {
    const word = tokens(line)[0]!
    const key = word.toLowerCase()
    const rest = trim(line.slice(word.length))
    if (sceneLines > 0 && HEADER_KEYS.has(key)) {
      warn(no, `'${word}' belongs before the first scene, ignored.`)
    } else if (sceneLines > 0 && FX_KEYS.has(key)) {
      error(no, `'${word}' belongs before the first scene.`)
    } else if (line.includes('|') || firstIsPad(line) || key === 'notes' || key === 'sound' || key === 'pad' || key === 'synth') {
      error(no, `'${word}' needs a section first, such as [A].`)
    } else if (FX_KEYS.has(key)) {
      fxLine(no, word, key, tokens(rest))
    } else if (key === 'name') {
      if (rest === '') warn(no, 'Name is empty, ignored.')
      else if (Array.from(rest).length > MAX_NAME) {
        warn(no, `Name is longer than ${MAX_NAME} characters, shortened.`)
        name = trim(cut(rest, MAX_NAME))
      } else name = rest
    } else if (key === 'tempo') {
      const t = tokens(rest)
      const v = t.length === 1 && TEMPO_TEXT.test(t[0]!) ? Number(t[0]) : null
      if (v === null || v < TEMPO_MIN || v > TEMPO_MAX) error(no, 'Tempo must be 40 to 240, whole or with one decimal.')
      else tempo = v
    } else if (key === 'swing') {
      const t = tokens(rest)
      const v = t.length === 1 && SWING_TEXT.test(t[0]!) ? Number(t[0]) : null
      if (v === null || v < TimingSettings.SWING_MIN || v > TimingSettings.SWING_MAX) error(no, 'Swing must be a whole number from 50 to 75.')
      else swing = v
    } else {
      warn(no, `Unknown header word '${word}', ignored.`)
    }
  }

  const row = (d: Draft, no: number, line: string): void => {
    const bar = line.indexOf('|')
    const head = tokens(line.slice(0, bar))
    const pad = head.length > 0 ? parsePad(head[0]!) : null
    if (pad === null) {
      error(no, head.length === 0 ? 'A row needs a pad before its first |.' : `'${head[0]}' isn't a pad. Use A to D, then . 0 E or 1 to 9.`)
      return
    }
    const label = padText(pad.group, pad.offset)
    if (pad.group !== d.group) {
      error(no, `${label} is in group ${letter(pad.group)}, but the section is [${letter(d.group)}].`)
      return
    }
    if (head.length > 1 && !names.has(padKey(pad))) names.set(padKey(pad), head.slice(1).join(' '))
    const ticks = timingTicks(d.step)
    const per = Seq.TICKS_PER_BAR / ticks
    const total = d.bars * per
    const steps = [...line.slice(bar + 1)].filter((c) => !isSpace(c) && c !== '|').join('')
    const hits: { step: number; velocity: number; held: number }[] = []
    let open = false
    for (let k = 0; k < steps.length; k++) {
      const c = steps[k]!
      const v = velocityOf(c)
      if (v !== null) {
        hits.push({ step: k, velocity: v, held: 1 })
        open = true
      } else if (c === '-') {
        if (!open) {
          error(no, `${label} bar ${Math.trunc(k / per) + 1} has a - with no hit before it.`)
          return
        }
        hits[hits.length - 1]!.held++
      } else if (c === '.') {
        open = false
      } else {
        error(no, `${label} bar ${Math.trunc(k / per) + 1} has '${c}', which isn't one of X x o 1-9 - or .`)
        return
      }
    }
    if (steps.length < total) {
      const has = steps.length % per
      error(no, `${label} bar ${Math.trunc(steps.length / per) + 1} has ${has} ${has === 1 ? 'step' : 'steps'}, needs ${per}.`)
      return
    }
    if (steps.length > total) {
      error(no, `${label} has ${steps.length} steps, needs ${total}.`)
      return
    }
    for (const h of hits) d.hits.push({ note: patternNote(Steps.tickOf(h.step, d.step, swing), pad.offset, h.held * ticks, null, h.velocity), line: no })
  }

  // bar.beat.sixteenth with its leftover ticks, as a tick; null when it isn't one.
  const atTick = (v: string): number | null => {
    const m = AT.exec(v)
    if (m === null) return null
    const bar = Number(m[1])
    const beat = Number(m[2])
    const six = Number(m[3])
    if (bar < 1 || beat < 1 || beat > BEATS_PER_BAR || six < 1 || six > 4) return null
    const adjust = m[4] === undefined ? 0 : Number(m[4])
    return (bar - 1) * Seq.TICKS_PER_BAR + (beat - 1) * Seq.PPQN + (six - 1) * 24 + adjust
  }

  const note = (d: Draft, no: number, line: string): void => {
    const t = tokens(line)
    const pad = parsePad(t[0]!)
    if (pad === null) {
      error(no, `'${t[0]}' isn't a pad. Use A to D, then . 0 E or 1 to 9.`)
      return
    }
    const label = padText(pad.group, pad.offset)
    if (pad.group !== d.group) {
      error(no, `${label} is in group ${letter(pad.group)}, but the section is [${letter(d.group)}].`)
      return
    }
    let tick: number | null = null
    let tickKey = ''
    let vel = 127
    let gate = DEFAULT_GATE
    let semi: number | null = null
    let semiKey = ''
    let i = 1
    while (i < t.length) {
      const key = t[i]!.toLowerCase()
      const v = t[i + 1]
      if (!NOTE_KEYS.has(key)) {
        warn(no, `Unknown option '${t[i]}' on ${label} note, ignored.`)
        i += v !== undefined && !NOTE_KEYS.has(v.toLowerCase()) ? 2 : 1
        continue
      }
      if (v === undefined) {
        error(no, `${label} note: ${key} needs a value.`)
        return
      }
      if (key === 'at' || key === 't') {
        if (tickKey !== '' && tickKey !== key) {
          error(no, `${label} note has both at and t.`)
          return
        }
        tickKey = key
        tick = key === 't' ? (INT.test(v) ? Number(v) : null) : atTick(v)
        if (tick === null) {
          error(no, key === 't' ? `${label} note: t needs a whole tick number.` : `${label} note: at needs bar.beat.sixteenth, with beat and sixteenth 1 to 4, as in 1.2.3 or 1.2.3+6.`)
          return
        }
      } else if (key === 'vel') {
        const n = INT.test(v) ? Number(v) : 0
        if (n < 1 || n > 127) {
          error(no, `${label} note: vel must be 1 to 127.`)
          return
        }
        vel = n
      } else if (key === 'gate') {
        const named = GATES.get(v.toUpperCase())
        const n = named ?? (INT.test(v) ? Number(v) : 0)
        if (n < 1) {
          error(no, `${label} note: gate must be a tick count or one of ${[...GATES.keys()].join(' ')}.`)
          return
        }
        gate = n
      } else if (key === 'note') {
        if (semiKey === 'semi') {
          error(no, `${label} note has both note and semi.`)
          return
        }
        semiKey = 'note'
        const midi = NOTE_NAME.test(v) ? noteNumber(v) : undefined
        if (midi === undefined) {
          error(no, `${label} note: note must be a name from C-1 to G9, such as C4.`)
          return
        }
        semi = midi - Keys.ROOT_NOTE
      } else {
        if (semiKey === 'note') {
          error(no, `${label} note has both note and semi.`)
          return
        }
        semiKey = 'semi'
        const n = SIGNED.test(v) ? Number(v) + 0 : NaN
        if (!(n >= -127 && n <= 127)) {
          error(no, `${label} note: semi must be -127 to 127.`)
          return
        }
        semi = n
      }
      i += 2
    }
    if (tick === null) {
      error(no, `${label} note needs at or t to place it.`)
      return
    }
    const length = d.bars * Seq.TICKS_PER_BAR
    if (tick < 0 || tick >= length) {
      error(no, `${label} note at tick ${tick} is outside the pattern (0 to ${length - 1}).`)
      return
    }
    d.hits.push({ note: patternNote(tick, pad.offset, gate, semi, vel), line: no })
  }

  // sound <pad> <slot> [name], anywhere in a section (after notes too). A second line for a pad replaces the first.
  const sound = (d: Draft, no: number, line: string): void => {
    let rest = trim(line.slice(tokens(line)[0]!.length))
    const padToken = tokens(rest)[0]
    if (padToken === undefined) {
      error(no, 'A sound line needs a pad and a slot, as in sound A7 12 Kick.')
      return
    }
    const pad = parsePad(padToken)
    if (pad === null) {
      error(no, `'${padToken}' isn't a pad. Use A to D, then . 0 E or 1 to 9.`)
      return
    }
    const label = padText(pad.group, pad.offset)
    if (pad.group !== d.group) {
      error(no, `${label} is in group ${letter(pad.group)}, but the section is [${letter(d.group)}].`)
      return
    }
    rest = trim(rest.slice(padToken.length))
    const slotToken = tokens(rest)[0]
    const slot = slotToken !== undefined && INT.test(slotToken) ? Number(slotToken) : 0
    if (slot < SLOT_MIN || slot > SLOT_MAX) {
      error(no, `${label} sound: the slot must be a whole number from ${SLOT_MIN} to ${SLOT_MAX}.`)
      return
    }
    const name = cleanText(rest.slice(slotToken!.length), Infinity)
    if (d.sounds.has(pad.offset)) warn(no, `${label} has two sound lines, kept the later.`)
    d.sounds.set(pad.offset, { slot, name: name === '' ? null : name })
  }

  // ---- effect lines (header only) ----

  // A knob value, 0 to 100 as a card writes it, as 0..1; null when it isn't one.
  const percent = (token: string): number | null => {
    if (!PERCENT.test(token)) return null
    const n = Number(token)
    return n <= 100 ? Math.fround(n / 100) : null
  }

  // Words left over after the line's last value ([t] from index [from]) are ignored, with a warning.
  const extra = (no: number, word: string, t: string[], from: number): void => {
    if (t.length > from) warn(no, `The ${word} line has extra words from '${t[from]}', ignored.`)
  }

  // fx / send / comp / sidechain: [t] are the words after [word]. A line with a fault changes nothing.
  const fxLine = (no: number, word: string, key: string, t: string[]): void => {
    if (key === 'fx') {
      const w = t[0]
      const type = w === undefined ? undefined : FX_TYPES.find((x) => x === w.toUpperCase())
      if (type === undefined) {
        error(no, t.length === 0 ? `fx needs an effect: ${FX_WORDS}.` : `'${t[0]}' isn't an effect. Use ${FX_WORDS}.`)
        return
      }
      let x = 0.5
      let y = 0.5
      if (t.length > 1) {
        const v = percent(t[1]!)
        if (v === null) return error(no, `fx x must be ${PERCENT_TEXT}.`)
        x = v
      }
      if (t.length > 2) {
        const v = percent(t[2]!)
        if (v === null) return error(no, `fx y must be ${PERCENT_TEXT}.`)
        y = v
      }
      extra(no, word, t, 3)
      if (fxType !== null) warn(no, 'Two fx lines, kept the later.')
      fxType = type
      fxX = Math.fround(x)
      fxY = Math.fround(y)
    } else if (key === 'send') {
      if (t.length === 0) return error(no, 'send needs a group and a value, as in send A 40 B 20.')
      const line = new Map<number, number>()
      for (let i = 0; i < t.length; i += 2) {
        const g = t[i]!
        if (g.length !== 1 || g < 'A' || g > 'D') return error(no, `'${g}' isn't a group. Use A to D.`)
        const token = t[i + 1]
        if (token === undefined) return error(no, `send ${g} needs a value, ${PERCENT_TEXT}.`)
        const v = percent(token)
        if (v === null) return error(no, `send ${g} must be ${PERCENT_TEXT}.`)
        line.set(g.charCodeAt(0) - 65, v)
      }
      const sends = fxSends ?? new Map<number, number>()
      for (const [g, v] of line) sends.set(g, v)
      fxSends = sends
    } else if (key === 'comp') {
      if (t.length === 0) return error(no, 'comp needs off, or a drive and a speed, as in comp 40 60.')
      let c: Comp
      if (t[0]!.toLowerCase() === 'off') {
        extra(no, word, t, 1)
        c = comp()
      } else {
        const drive = percent(t[0]!)
        if (drive === null) return error(no, `comp drive must be ${PERCENT_TEXT}, or use comp off.`)
        if (t.length < 2) return error(no, 'comp needs a speed after the drive, as in comp 40 60.')
        const speed = percent(t[1]!)
        if (speed === null) return error(no, `comp speed must be ${PERCENT_TEXT}.`)
        extra(no, word, t, 2)
        c = comp({ on: true, x: drive, y: speed })
      }
      if (fxComp !== null) warn(no, 'Two comp lines, kept the later.')
      fxComp = c
    } else {
      if (t.length === 0) return error(no, 'sidechain needs off, or a pad and the groups it ducks, as in sidechain A7 BC.')
      let sc: Sidechain
      if (t[0]!.toLowerCase() === 'off') {
        extra(no, word, t, 1)
        sc = sidechain({ on: false })
      } else {
        const pad = parsePad(t[0]!)
        if (pad === null) return error(no, `'${t[0]}' isn't a pad. Use A to D, then . 0 E or 1 to 9.`)
        const groups = t[1]
        if (groups === undefined) return error(no, `sidechain ${t[0]} needs the groups it ducks, as in sidechain A7 BC.`)
        if (!GROUP_LIST.test(groups)) return error(no, `'${groups}' isn't a list of groups. Use the letters A to D, as in BC.`)
        let length = 0.3
        let shape = 0.5
        if (t.length > 2) {
          const v = percent(t[2]!)
          if (v === null) return error(no, `sidechain length must be ${PERCENT_TEXT}.`)
          length = v
        }
        if (t.length > 3) {
          const v = percent(t[3]!)
          if (v === null) return error(no, `sidechain shape must be ${PERCENT_TEXT}.`)
          shape = v
        }
        extra(no, word, t, 4)
        const dests = [...groups].reduce((m, c) => m | (1 << (c.charCodeAt(0) - 65)), 0)
        sc = sidechain({ on: true, group: pad.group, pad: pad.offset, dests, x: length, y: shape })
      }
      if (fxSidechain !== null) warn(no, 'Two sidechain lines, kept the later.')
      fxSidechain = sc
    }
  }

  // ---- pad lines ----

  // A whole number (a + or - allowed) from [lo] to [hi]; null when it isn't one.
  const padInt = (v: string, lo: number, hi: number): number | null => {
    if (!SIGNED.test(v)) return null
    const n = Number(v) + 0
    return n >= lo && n <= hi ? n : null
  }

  // pad <pad> [pitch n] [level n] [pan n] [attack n] [release n] [mode m], anywhere in a section. A second line for a pad merges into the first.
  const padLine = (d: Draft, no: number, line: string): void => {
    const t = tokens(line)
    const padToken = t[1]
    if (padToken === undefined) return error(no, 'A pad line needs a pad and a setting, as in pad A7 pitch -7 level 90.')
    const pad = parsePad(padToken)
    if (pad === null) return error(no, `'${padToken}' isn't a pad. Use A to D, then . 0 E or 1 to 9.`)
    const label = padText(pad.group, pad.offset)
    if (pad.group !== d.group) return error(no, `${label} is in group ${letter(pad.group)}, but the section is [${letter(d.group)}].`)
    let shaping = cardPad()
    let i = 2
    while (i < t.length) {
      const key = t[i]!.toLowerCase()
      const v = t[i + 1]
      if (!PAD_KEYS.has(key)) {
        warn(no, `Unknown setting '${t[i]}' on ${label} pad, ignored.`)
        i += v !== undefined && !PAD_KEYS.has(v.toLowerCase()) ? 2 : 1
        continue
      }
      if (v === undefined) return error(no, `${label} pad: ${key} needs a value.`)
      if (key === 'pitch') {
        const n = PITCH_TEXT.test(v) ? Number(v) : NaN
        if (!(n >= -PadSettings.PITCH_MAX && n <= PadSettings.PITCH_MAX)) return error(no, `${label} pad: pitch must be -12 to 12 semitones, whole or with up to two decimals.`)
        shaping = { ...shaping, pitch: n + 0 }
      } else if (key === 'level') {
        const n = padInt(v, 0, PadSettings.LEVEL_MAX)
        if (n === null) return error(no, `${label} pad: level must be a whole number from 0 to ${PadSettings.LEVEL_MAX}.`)
        shaping = { ...shaping, level: n }
      } else if (key === 'pan') {
        const n = padInt(v, -PadSettings.PAN_MAX, PadSettings.PAN_MAX)
        if (n === null) return error(no, `${label} pad: pan must be a whole number from -${PadSettings.PAN_MAX} to ${PadSettings.PAN_MAX}, negative is left.`)
        shaping = { ...shaping, pan: n }
      } else if (key === 'attack') {
        const n = padInt(v, 0, PadSettings.ENV_MAX)
        if (n === null) return error(no, `${label} pad: attack must be a whole number from 0 to ${PadSettings.ENV_MAX}.`)
        shaping = { ...shaping, attack: n }
      } else if (key === 'release') {
        const n = padInt(v, 0, PadSettings.ENV_MAX)
        if (n === null) return error(no, `${label} pad: release must be a whole number from 0 to ${PadSettings.ENV_MAX}.`)
        shaping = { ...shaping, release: n }
      } else {
        const m = PlayMode.of(v.toLowerCase())
        if (m === null) return error(no, `${label} pad: mode must be oneshot, key or legato.`)
        shaping = { ...shaping, mode: m }
      }
      i += 2
    }
    if (cardPadIsEmpty(shaping)) return error(no, `${label} pad: give at least one of pitch, level, pan, attack, release or mode.`)
    const before = d.pads.get(pad.offset)
    if (before !== undefined) warn(no, `${label} has two pad lines, merged, the later settings win.`)
    d.pads.set(pad.offset, before === undefined ? shaping : mergedCardPad(before, shaping))
  }

  // ---- synth lines ----

  // synth <pad> <type> [key value]...: a sound for Arc to make. A line with a fault is left out; an earlier line for the pad stays.
  const synthLine = (d: Draft, no: number, line: string): void => {
    // Older Arc reads a line after notes as a note, and so refuses the card.
    if (d.inNotes) warn(no, 'Put synth lines before notes, so older Arc can read the card.')
    if (line.includes('|')) return error(no, "A synth line can't hold a |.")
    const t = tokens(line)
    if (t.length < 3) return error(no, 'A synth line needs a pad and a sound type, as in synth A7 kick.')
    const pad = parsePad(t[1]!)
    if (pad === null) return error(no, `'${t[1]}' isn't a pad. Use A to D, then . 0 E or 1 to 9.`)
    const label = padText(pad.group, pad.offset)
    if (pad.group !== d.group) return error(no, `${label} is in group ${letter(pad.group)}, but the section is [${letter(d.group)}].`)
    const type = SYNTH_TYPES.find((x) => x === t[2]!.toLowerCase())
    if (type === undefined) return warn(no, `Unknown sound type '${t[2]}' on ${label} synth, line ignored.`)
    const s: SynthFields = {}
    let i = 3
    while (i < t.length) {
      const key = t[i]!.toLowerCase()
      const v = t[i + 1]
      if (!SYNTH_KEY_SET.has(key)) {
        warn(no, `Unknown setting '${t[i]}' on ${label} synth, ignored.`)
        i += v !== undefined && !SYNTH_KEY_SET.has(v.toLowerCase()) ? 2 : 1
        continue
      }
      if (v === undefined) return error(no, `${label} synth: ${key} needs a value.`)
      const k = key as SynthKey
      if (SYNTH_KNOBS.has(k) || k === 'level' || k === 'seed') {
        const lo = k === 'level' ? 1 : 0
        const hi = k === 'seed' ? 999 : 100
        const n = SYNTH_INT.test(v) ? Number(v) : -1
        if (n < lo || n > hi) return error(no, `${label} synth: ${k} must be a whole number from ${lo} to ${hi}.`)
        Object.assign(s, { [k]: n })
      } else if (k === 'note') {
        const midi = SYNTH_NOTE.test(v) ? noteNumber(v) : undefined
        if (midi === undefined || midi < SYNTH_NOTE_MIN || midi > SYNTH_NOTE_MAX) return error(no, `${label} synth: note must be C0 to C7, such as C2 or F#1.`)
        s.note = midi
      } else if (k === 'length') {
        // Read as whole hundredths, never as a float: 1.25 is 125, 2.5 is 250.
        const m = SYNTH_LENGTH.exec(v)
        const frac = m?.[2]
        const cs = m === null ? -1 : Number(m[1]) * 100 + (frac === undefined ? 0 : frac.length === 1 ? Number(frac) * 10 : Number(frac))
        if (cs < SYNTH_LENGTH_MIN || cs > SYNTH_LENGTH_MAX) return error(no, `${label} synth: length must be 0.05 to 4 seconds, with up to two decimals.`)
        s.length = cs
      } else if (k === 'wave') {
        const w = SYNTH_WAVES.find((x) => x === v.toLowerCase())
        if (w === undefined) warn(no, `${label} synth: unknown wave '${v}', ignored.`)
        else s.wave = w
      } else if (k === 'chord') {
        const c = SYNTH_CHORDS.find((x) => x === v.toLowerCase())
        if (c === undefined) warn(no, `${label} synth: unknown chord '${v}', ignored.`)
        else s.chord = c
      } else {
        if (!SYNTH_NAME.test(v)) return error(no, `${label} synth: name must be one word of letters, digits, _ or -, starting with a letter or digit.`)
        if (v.length > SYNTH_NAME_MAX) warn(no, `${label} synth: name cut to ${SYNTH_NAME_MAX} characters.`)
        s.name = v.slice(0, SYNTH_NAME_MAX)
      }
      i += 2
    }
    if (d.synths.has(pad.offset)) warn(no, `${label} has two synth lines, kept the later.`)
    d.synths.set(pad.offset, cardSynth(type, s))
  }

  const lineAt = (no: number, line: string): void => {
    const first = tokens(line)[0]!.toLowerCase()
    // A lesson line may come anywhere: it names no section's pads but its own.
    if (first === 'lesson') {
      lessonLine(no, line)
      return
    }
    if (first === 'scene') {
      sceneLine(no, line)
      return
    }
    if (first === 'chain') {
      chainLine(no, line)
      return
    }
    if (line.startsWith('[')) {
      section(no, line)
      return
    }
    const d = draft
    if (d === null) {
      header(no, line)
      return
    }
    if (d.skip) return
    if (line.toLowerCase() === 'notes') d.inNotes = true
    else if (tokens(line)[0]!.toLowerCase() === 'sound') sound(d, no, line)
    else if (tokens(line)[0]!.toLowerCase() === 'pad') padLine(d, no, line)
    else if (tokens(line)[0]!.toLowerCase() === 'synth') synthLine(d, no, line)
    else if (FX_KEYS.has(tokens(line)[0]!.toLowerCase())) error(no, `'${tokens(line)[0]}' belongs before the first section.`)
    else if (d.inNotes) note(d, no, line)
    else if (line.includes('|')) row(d, no, line)
    else if (firstIsPad(line)) error(no, `${tokens(line)[0]} needs a | before its steps.`)
    else {
      const word = tokens(line)[0]!
      if (HEADER_KEYS.has(word.toLowerCase())) warn(no, `'${word}' belongs before the first section, ignored.`)
      else warn(no, `Unknown word '${word}', ignored.`)
    }
  }

  const start = lines.findIndex((l) => CARD_START.test(trim(l)))
  if (start < 0) {
    error(1, 'No ARC BEAT line found.')
    return result()
  }
  if (!version(start + 1, tokens(stripComment(lines[start]!)))) return result()
  for (let i = start + 1; i < lines.length; i++) {
    const line = trim(stripComment(lines[i]!))
    if (line === '```' || line.toUpperCase() === 'END') break
    if (line === '') continue
    lineAt(i + 1, line)
  }
  close()
  scenes.push(cardScene(sceneLines > 0 ? sceneName : null, [...sections]))
  if (sectionLines === 0) error(start + 1, 'The card has no section, such as [A].')
  checkChain()
  checkLesson()
  return result()
}

// ---- Writing ----

/**
 * [card] as text, as the spec's writing rules have it. [names] gives the
 * sound name a row shows after its pad (null for none). A section's sound
 * lines come right after its line, in keypad order, each with its name when it
 * has one; its synth lines follow them, in keypad order, with the settings they
 * give in a fixed order (synthText), before its pad lines. With [tidy], velocities are rounded to 127, 100 or 64 (ties up) and gates under a step
 * become a step, for every note, and the card says so in a comment. The [silent]
 * pads (silentPads) are listed in a comment of their own right after the header
 * (ClaudeText.noSoundOn); readers ignore it. A card of scenes (isMultiScene) is
 * written as the spec's writing rule has it: the `chain` line after the effect
 * lines (steps that name no scene are left out), then each scene as a `scene`
 * line with its name if it has one, followed by its sections in group order. A
 * section that only repeats the previous scene's pattern for its group (the
 * same pattern, sounds, synths and pad shaping) is left out. The text ends in a newline.
 */
function write(card: BeatCard, names: (pad: PhysicalPad) => string | null = () => null, tidy = false, silent: readonly PhysicalPad[] = []): string {
  const swing = TimingSettings.clampSwing(card.swing)
  const out: string[] = []
  out.push(`ARC BEAT ${VERSION}`)
  const title = card.name === null ? '' : cleanText(card.name, MAX_NAME)
  if (title !== '') out.push(`name ${title}`)
  if (card.tempo !== null) out.push(`tempo ${tempoText(card.tempo)}`)
  out.push(`swing ${swing}`)
  if (card.fx !== null) writeFx(out, card.fx)
  if (isMultiScene(card) && card.chain !== null) writeChain(out, card.chain, card.scenes.length)
  for (const step of (card.lesson ?? []).slice(0, LESSON_MAX)) out.push(lessonText(step))
  if (silent.length > 0) out.push(ClaudeText.noSoundOn(silent))
  if (tidy) out.push(TIDY_COMMENT)
  if (!isMultiScene(card)) {
    for (const s of [...card.sections].sort((a, b) => a.group - b.group)) {
      out.push('')
      writeSection(out, s, swing, names, tidy)
    }
    return out.join('\n') + '\n'
  }
  const before: (CardSection | null)[] = [null, null, null, null]
  for (const sc of card.scenes) {
    out.push('')
    const sceneTitle = sc.name === null ? '' : cleanText(sc.name, MAX_NAME)
    out.push('scene' + (sceneTitle === '' ? '' : ` ${sceneTitle}`))
    let first = true
    for (const s of [...sc.sections].sort((a, b) => a.group - b.group)) {
      const prev = s.group >= 0 && s.group < 4 ? before[s.group]! : null
      if (prev !== null && repeats(prev, s)) continue
      if (!first) out.push('')
      first = false
      writeSection(out, s, swing, names, tidy)
      if (s.group >= 0 && s.group < 4) before[s.group] = s
    }
  }
  return out.join('\n') + '\n'
}

/** A lesson step as its line: "lesson Kick alone | A7 | 50 | Count out loud" (the speed left out at 100, A for the whole group). */
export function lessonText(step: LessonStep): string {
  const parts = [cleanText(step.title, MAX_NAME), lessonPads(step)]
  if (step.speed !== LESSON_MAX_SPEED || step.tip !== null) parts.push(`${step.speed}`)
  if (step.tip !== null) parts.push(cleanText(step.tip, Number.MAX_SAFE_INTEGER))
  return 'lesson ' + parts.join(' | ')
}

/** A lesson step's pads as a card writes them, in keypad order ("A7 A9"), or the group's letter for all its pads. */
export function lessonPads(step: LessonStep): string {
  const pads = step.pads
  return pads === null ? letter(step.group) : ROWS.flat().filter((o) => pads.includes(o)).map((o) => padText(step.group, o)).join(' ')
}

// The chain line: steps as 2 or 2x4; those naming a scene the card hasn't, or passes out of range, are left out, and so is a chain left with none.
function writeChain(out: string[], chain: readonly (readonly [number, number])[], sceneCount: number): void {
  const steps = chain.filter(([sc, passes]) => sc >= 1 && sc <= sceneCount && passes >= Chain.MIN_PASSES && passes <= Chain.MAX_PASSES).slice(0, Chain.MAX_STEPS)
  if (steps.length === 0) return
  out.push('chain ' + steps.map(([sc, passes]) => (passes === 1 ? `${sc}` : `${sc}x${passes}`)).join(' '))
}

const NO_SYNTHS: ReadonlyMap<number, CardSynth> = new Map()

// Whether section [s] only repeats [prev], the previous scene's for its group: the same pattern as written (not the notes' ids), sounds, synths and pad shaping.
function repeats(prev: CardSection, s: CardSection): boolean {
  return (
    sameMap(s.sounds, prev.sounds, (a, b) => a.slot === b.slot && a.name === b.name) &&
    sameMap(s.synths ?? NO_SYNTHS, prev.synths ?? NO_SYNTHS, sameSynth) &&
    sameMap(s.pads, prev.pads, sameCardPad) &&
    sameWritten(prev.pattern, s.pattern)
  )
}

function sameSynth(a: CardSynth, b: CardSynth): boolean {
  return a.type === b.type && SYNTH_KEYS.every((k) => a[k] === b[k])
}

function sameCardPad(a: CardPad, b: CardPad): boolean {
  return a.pitch === b.pitch && a.level === b.level && a.pan === b.pan && a.attack === b.attack && a.release === b.release && a.mode === b.mode
}

function sameMap<V>(a: ReadonlyMap<number, V>, b: ReadonlyMap<number, V>, same: (x: V, y: V) => boolean): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    const o = b.get(k)
    if (o === undefined || !same(v, o)) return false
  }
  return true
}

// Whether two patterns are written the same: the bars and the notes that play, in order, whatever their ids.
function sameWritten(a: Pattern, b: Pattern): boolean {
  if (a.bars !== b.bars) return false
  const x = keyed(a)
  const y = keyed(b)
  return x.length === y.length && x.every((n, i) => n.tick === y[i]!.tick && n.offset === y[i]!.offset && n.semitones === y[i]!.semitones && n.velocity === y[i]!.velocity && n.gate === y[i]!.gate)
}

function keyed(p: Pattern): PatternNote[] {
  const len = Pattern.lengthTicks(p)
  return unique(p.notes.filter((n) => n.tick >= 0 && n.tick < len)).sort(
    (a, b) => a.tick - b.tick || a.offset - b.offset || (a.semitones ?? -Infinity) - (b.semitones ?? -Infinity) || a.velocity - b.velocity || a.gate - b.gate,
  )
}

// The effect lines: fx (when there is an effect line), send, comp, sidechain; knobs as whole percents.
function writeFx(out: string[], fx: CardFx): void {
  if (fx.type !== null) out.push(`fx ${fx.type.toLowerCase()}` + (fx.type === FxType.NONE ? '' : ` ${percentText(fx.x ?? 0.5)} ${percentText(fx.y ?? 0.5)}`))
  if (fx.sends !== null) {
    const sends = [...fx.sends].filter(([g]) => g >= 0 && g <= 3).sort((a, b) => a[0] - b[0])
    if (sends.length > 0) out.push('send ' + sends.map(([g, v]) => `${letter(g)} ${percentText(v)}`).join(' '))
  }
  if (fx.comp !== null) out.push(fx.comp.on ? `comp ${percentText(fx.comp.x)} ${percentText(fx.comp.y)}` : 'comp off')
  if (fx.sidechain !== null) {
    const sc = fx.sidechain
    const dests = sc.dests & FxSettings.ALL_GROUPS
    if (sc.on && dests !== 0) {
      const groups = [0, 1, 2, 3].filter((g) => (dests & (1 << g)) !== 0).map(letter).join('')
      out.push(`sidechain ${padText(coerceIn(sc.group, 0, 3), coerceIn(sc.pad, 0, 11))} ${groups} ${percentText(sc.x)} ${percentText(sc.y)}`)
    } else out.push('sidechain off')
  }
}

const coerceIn = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

// A knob (0..1) as a card's whole percent.
function percentOf(v: number): number {
  return Math.round(Math.fround(clamp01(v) * 100))
}

function percentText(v: number): string {
  return String(percentOf(v))
}

// A pad line: the settings given, in the spec's order.
function padLineText(group: number, offset: number, p: CardPad): string {
  let s = `pad ${padText(group, offset)}`
  if (p.pitch !== null) s += ` pitch ${pitchText(p.pitch)}`
  if (p.level !== null) s += ` level ${p.level}`
  if (p.pan !== null) s += ` pan ${p.pan}`
  if (p.attack !== null) s += ` attack ${p.attack}`
  if (p.release !== null) s += ` release ${p.release}`
  if (p.mode !== null) s += ` mode ${p.mode}`
  return s
}

/** A synth line: the settings given, in SYNTH_KEYS order ("synth A7 kick decay 40 name 808_kick"). */
export function synthText(group: number, offset: number, s: CardSynth): string {
  let out = `synth ${padText(group, offset)} ${s.type}`
  for (const key of SYNTH_KEYS) {
    const v = s[key]
    if (v === undefined) continue
    out += ` ${key} ` + (key === 'note' ? noteName(v as number) : key === 'length' ? lengthText(v as number) : String(v))
  }
  return out
}

// A synth length in hundredths as seconds, as few decimals as needed: 400 is 4, 50 is 0.5, 5 is 0.05, 125 is 1.25.
function lengthText(cs: number): string {
  return `${Math.trunc(cs / 100)}` + (cs % 100 === 0 ? '' : '.' + String(cs % 100).padStart(2, '0').replace(/0+$/, ''))
}

// Semitones to two decimals, as few as needed: 7, -7.5, 0.25.
function pitchText(v: number): string {
  const h = Math.round(coerceIn(v, -PadSettings.PITCH_MAX, PadSettings.PITCH_MAX) * 100)
  const a = Math.abs(h)
  const frac = a % 100 === 0 ? '' : '.' + String(a % 100).padStart(2, '0').replace(/0+$/, '')
  return (h < 0 ? '-' : '') + Math.trunc(a / 100) + frac
}

function writeSection(out: string[], s: CardSection, swing: number, names: (pad: PhysicalPad) => string | null, tidy: boolean): void {
  const p = s.pattern
  const g = s.group
  const len = Pattern.lengthTicks(p)
  let notes = unique(p.notes.filter((n) => n.tick >= 0 && n.tick < len))
  const step = stepFor(p, notes, swing)
  const ticks = timingTicks(step)
  if (tidy) notes = notes.map((n) => tidied(n, ticks))
  const per = Seq.TICKS_PER_BAR / ticks
  const count = p.bars * per
  const stepOf = rowSteps(notes, step, swing, count)
  const number = s.number === null ? '' : String(s.number).padStart(2, '0')
  out.push(`[${letter(g)}${number}] bars ${p.bars} step ${step}`)
  for (const offset of KEYPAD) {
    const snd = s.sounds.get(offset)
    if (snd === undefined || snd.slot < SLOT_MIN || snd.slot > SLOT_MAX) continue
    const name = snd.name === null ? '' : cleanText(snd.name, Infinity)
    out.push(`sound ${padText(g, offset)} ${snd.slot}` + (name === '' ? '' : ` ${name}`))
  }
  for (const offset of KEYPAD) {
    const synth = s.synths?.get(offset)
    if (synth !== undefined) out.push(synthText(g, offset, synth))
  }
  for (const offset of KEYPAD) {
    const pad = s.pads.get(offset)
    if (pad === undefined || cardPadIsEmpty(pad)) continue
    out.push(padLineText(g, offset, pad))
  }
  const rows = KEYPAD.filter((offset) => notes.some((n, i) => stepOf[i]! >= 0 && n.offset === offset))
  const nameOf = new Map<number, string>()
  for (const offset of rows) nameOf.set(offset, cleanText(names(physicalPad(g, offset)) ?? '', Infinity))
  const longest = Math.max(0, ...[...nameOf.values()].map((n) => n.length))
  const width = longest > 0 ? Math.max(NAME_WIDTH, longest) : 0
  for (const offset of rows) {
    const chars: string[] = new Array<string>(count).fill('.')
    notes.forEach((n, i) => {
      const k = stepOf[i]!
      if (k < 0 || n.offset !== offset) return
      chars[k] = charOf(n.velocity)!
      for (let j = 1; j < Math.trunc(n.gate / ticks); j++) chars[k + j] = '-'
    })
    const label = padText(g, offset)
    const head = width > 0 ? `${label} ${nameOf.get(offset)!.padEnd(width)}` : label
    const bars = chunks(chars.join(''), per).map((b) => chunks(b, 4).join(' ')).join(' | ')
    out.push(`${head} | ${bars} |`)
  }
  const rest = notes
    .filter((_, i) => stepOf[i]! < 0)
    .sort((a, b) => KEYPAD.indexOf(a.offset) - KEYPAD.indexOf(b.offset) || a.tick - b.tick || (a.semitones ?? -Infinity) - (b.semitones ?? -Infinity) || 0)
  if (rest.length === 0) return
  out.push('notes')
  for (const n of rest) out.push(noteText(g, n))
}

// The notes with the same pad, tick and pitch folded into the louder (the first when level), as reading folds them.
function unique(notes: readonly PatternNote[]): PatternNote[] {
  const kept: PatternNote[] = []
  const at = new Map<string, number>()
  for (const n of notes) {
    const key = `${n.offset}:${n.tick}:${n.semitones ?? 'n'}`
    const j = at.get(key)
    if (j === undefined) {
      at.set(key, kept.length)
      kept.push(n)
    } else if (n.velocity > kept[j]!.velocity) kept[j] = n
  }
  return kept
}

// The first of 1/16, 1/16T, 1/32 that puts every pad hit on its grid; 1/16 when none does.
function stepFor(p: Pattern, notes: readonly PatternNote[], swing: number): Timing {
  const len = Pattern.lengthTicks(p)
  return (
    WRITE_STEPS.find((t) => {
      const count = len / timingTicks(t)
      return notes.every((n) => n.semitones !== null || gridStep(n.tick, t, swing, count) !== null)
    }) ?? Timing.SIXTEENTH
  )
}

// The step [tick] is on at [t], or null when it is between steps.
function gridStep(tick: number, t: Timing, swing: number, count: number): number | null {
  const k = Steps.indexOf(tick, t, swing, count)
  return Steps.tickOf(k, t, swing) === tick ? k : null
}

// For each note, its step when it goes on a row (-1 when it goes in the notes list).
function rowSteps(notes: readonly PatternNote[], step: Timing, swing: number, count: number): number[] {
  const ticks = timingTicks(step)
  const stepOf: number[] = notes.map(() => -1)
  for (let offset = 0; offset < 12; offset++) {
    const onPad: { i: number; k: number }[] = []
    notes.forEach((n, i) => {
      if (n.semitones !== null || n.offset !== offset) return
      const k = gridStep(n.tick, step, swing, count)
      if (k !== null) onPad.push({ i, k })
    })
    onPad.sort((a, b) => a.k - b.k)
    // From the last hit back, so a hold is checked against the next hit that is on the row.
    let next = count
    for (const { i, k } of onPad.reverse()) {
      const n = notes[i]!
      if (charOf(n.velocity) === null || n.gate < ticks || n.gate % ticks !== 0) continue
      if (k + n.gate / ticks > next) continue
      stepOf[i] = k
      next = k
    }
  }
  return stepOf
}

function tidied(n: PatternNote, stepTicks: number): PatternNote {
  return { ...n, velocity: roundVelocity(n.velocity), gate: Math.max(n.gate, stepTicks) }
}

// The nearest of 127, 100 and 64; halfway goes up.
function roundVelocity(v: number): number {
  return v >= 114 ? 127 : v >= 82 ? 100 : 64
}

// One line of the notes list.
function noteText(group: number, n: PatternNote): string {
  let s = `${padText(group, n.offset)} at ${atText(n.tick)}`
  if (n.velocity !== 127) s += ` vel ${n.velocity}`
  if (n.semitones !== null) {
    const midi = Keys.ROOT_NOTE + n.semitones
    s += midi >= 0 && midi <= 127 ? ` note ${noteName(midi)}` : ` semi ${n.semitones}`
  }
  if (n.gate !== DEFAULT_GATE) {
    const word = [...GATES].find(([, ticks]) => ticks === n.gate)
    s += ` gate ${word === undefined ? n.gate : word[0]}`
  }
  return s
}

// Text for the header or a row: no #, | or line breaks (they would end it), single spaces, at most [max] characters.
function cleanText(s: string, max: number): string {
  return cut(s.replace(TEXT_BREAKS, ' ').replace(/^ +| +$/g, ''), max).replace(/^ +| +$/g, '')
}

// 92 for 92.0, 92.5 for 92.5: whole or one decimal.
function tempoText(t: number): string {
  const r = Math.round(t * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// ---- From patterns ----

/**
 * A card for [sections] (an export): the sections with notes, in group order
 * (all of them when none has notes), and the swing [timingSwing] when every
 * pad hit of every section sits on the swung 1/16 grid, else 50, so a card
 * never loses a hit's place to a swing it doesn't fit. [sounds] gives the
 * sound a pad plays (null when not known): each section gets a sound for every
 * pad its notes use that has one. [fx] is the project's FX, written as effect
 * lines unless they leave the sound as it is (fxOf); [pads] gives a pad's
 * settings (null when not known): each section gets a `pad` line for every pad
 * its notes use whose settings differ from the defaults (padOf).
 */
function fromPatterns(
  name: string | null,
  tempo: number | null,
  timingSwing: number,
  sections: readonly CardSection[],
  sounds: (pad: PhysicalPad) => CardSound | null = () => null,
  fx: FxSettings | null = null,
  pads: (pad: PhysicalPad) => PadSettings | null = () => null,
): BeatCard {
  const withNotes = sections.filter((s) => !Pattern.isEmpty(s.pattern))
  const kept = [...(withNotes.length > 0 ? withNotes : sections)]
    .sort((a, b) => a.group - b.group)
    .map((s) => ({ ...s, sounds: new Map([...s.sounds, ...soundsUsed(s, sounds)]), pads: new Map([...s.pads, ...padsUsed(s, pads)]) }))
  const s = TimingSettings.clampSwing(timingSwing)
  const swing = s > TimingSettings.SWING_MIN && kept.every((x) => fitsSwung(x.pattern, s)) ? s : TimingSettings.SWING_MIN
  return beatCard(name, tempo, swing, kept, fx === null ? null : fxOf(fx))
}

/**
 * A card for a project's chain (a share of the arrangement): the chain's
 * distinct scenes in the order they first play become the card's scenes (with
 * `scene` lines, no names), and the chain, mapped to the card's scene numbers,
 * its `chain` line. Null when [chain] has no step that names a scene of [seq].
 * [chain] is the seq's by default.
 *
 * Each scene's sections come from the patterns [seq] gives it, as fromPatterns
 * has them. The first scene has the groups with notes (all four when none has);
 * a later scene has a group only when its pattern differs from the one the
 * group last had in the card's earlier scenes (one it left out counts as
 * blank), so a card never repeats a pattern (write leaves such a section out in
 * any case). The swing is [timingSwing] when every pad hit of every section
 * sits on the swung 1/16 grid, else 50. [sounds], [fx] and [pads] are as in
 * fromPatterns for the whole card: a pad's sound line and `pad` line are
 * written once, in the first section whose notes use the pad, and again only
 * when they change.
 */
function fromScenes(
  name: string | null,
  tempo: number | null,
  timingSwing: number,
  seq: ProjectSeq,
  chain: readonly ChainStep[] = seq.chain.steps,
  sounds: (pad: PhysicalPad) => CardSound | null = () => null,
  fx: FxSettings | null = null,
  pads: (pad: PhysicalPad) => PadSettings | null = () => null,
): BeatCard | null {
  const steps = chain.filter((st) => st.scene >= 0 && st.scene < seq.scenes.length).slice(0, Chain.MAX_STEPS)
  if (steps.length === 0) return null
  const order = [...new Set(steps.map((st) => st.scene))]
  const given = new Map<number, CardSound>()
  const shaped = new Map<number, CardPad>()
  // The pattern each group last had in the card; null before it has a section.
  const last: (Pattern | null)[] = [null, null, null, null]
  const scenes = order.map((index, k) => {
    const numbers = seq.scenes[index]!.patterns
    const all = [0, 1, 2, 3].map((g) => cardSection(g, numbers[g]!, ProjectSeq.pattern(seq, g, numbers[g]!)))
    let chosen: CardSection[]
    if (k === 0) {
      const withNotes = all.filter((x) => !Pattern.isEmpty(x.pattern))
      chosen = withNotes.length > 0 ? withNotes : all
    } else {
      chosen = all.filter((x) => {
        const l = last[x.group]!
        return l !== null ? !sameWritten(l, x.pattern) : !Pattern.isEmpty(x.pattern)
      })
    }
    return cardScene(
      null,
      chosen.map((x) => {
        last[x.group] = x.pattern
        const own = new Map<number, CardSound>()
        for (const [offset, snd] of soundsUsed(x, sounds)) {
          const key = padKey(physicalPad(x.group, offset))
          const prev = given.get(key)
          given.set(key, snd)
          if (prev === undefined || prev.slot !== snd.slot || prev.name !== snd.name) own.set(offset, snd)
        }
        const shaping = new Map<number, CardPad>()
        for (const [offset, pad] of padsUsed(x, pads)) {
          const key = padKey(physicalPad(x.group, offset))
          const prev = shaped.get(key)
          shaped.set(key, pad)
          if (prev === undefined || !sameCardPad(prev, pad)) shaping.set(offset, pad)
        }
        return { ...x, sounds: own, pads: shaping }
      }),
    )
  })
  const s = TimingSettings.clampSwing(timingSwing)
  const swing = s > TimingSettings.SWING_MIN && scenes.every((sc) => sc.sections.every((x) => fitsSwung(x.pattern, s))) ? s : TimingSettings.SWING_MIN
  const mapped = steps.map((st): [number, number] => [order.indexOf(st.scene) + 1, Math.min(Math.max(st.passes, Chain.MIN_PASSES), Chain.MAX_PASSES)])
  return beatCardOfScenes(name, tempo, swing, scenes, fx === null ? null : fxOf(fx), mapped, true)
}

// The sound of each pad the section's notes use, for those [sounds] knows.
function soundsUsed(s: CardSection, sounds: (pad: PhysicalPad) => CardSound | null): Map<number, CardSound> {
  const out = new Map<number, CardSound>()
  for (const offset of KEYPAD) {
    if (!s.pattern.notes.some((n) => n.offset === offset)) continue
    const snd = sounds(physicalPad(s.group, offset))
    if (snd !== null) out.set(offset, snd)
  }
  return out
}

// The shaping of each pad the section's notes use that has any, for those [pads] knows.
function padsUsed(s: CardSection, pads: (pad: PhysicalPad) => PadSettings | null): Map<number, CardPad> {
  const out = new Map<number, CardPad>()
  for (const offset of KEYPAD) {
    if (!s.pattern.notes.some((n) => n.offset === offset)) continue
    const settings = pads(physicalPad(s.group, offset))
    const pad = settings === null ? null : padOf(settings)
    if (pad !== null) out.set(offset, pad)
  }
  return out
}

// A knob at its whole percent, as a card holds it.
function knob(v: number): number {
  return Math.fround(percentOf(v) / 100)
}

/**
 * The effect lines for a project's [fx], as a share writes them, with the knobs
 * in whole percents (so the card reads back as this one): the effect and its
 * knobs, the groups sending above 0, the compressor and the sidechain when they
 * are on. Null when none of that makes a sound (no effect, no send, compressor
 * and sidechain off).
 */
function fxOf(fx: FxSettings): CardFx | null {
  const c = FxSettings.clamped(fx)
  const sends = new Map<number, number>()
  c.sends.forEach((v, g) => {
    if (percentOf(v) > 0) sends.set(g, knob(v))
  })
  const cp = c.comp.on ? comp({ on: true, x: knob(c.comp.x), y: knob(c.comp.y) }) : null
  const sc = c.sidechain.on && c.sidechain.dests !== 0 ? sidechain({ ...c.sidechain, x: knob(c.sidechain.x), y: knob(c.sidechain.y) }) : null
  if (c.type === FxType.NONE && sends.size === 0 && cp === null && sc === null) return null
  const none = c.type === FxType.NONE
  return cardFx({ type: c.type, x: none ? 0.5 : knob(c.x), y: none ? 0.5 : knob(c.y), sends: sends.size === 0 ? null : sends, comp: cp, sidechain: sc })
}

/**
 * A pad's [settings] as a `pad` line holds them: only what differs from the
 * defaults (pitch not 0, level not 100, pan not 0, attack not 0, mode not
 * oneshot, and release when it isn't what the mode starts with: 255 for
 * oneshot, KEY_RELEASE for the others). Null when none does. Only the fields
 * the card format carries.
 */
function padOf(settings: PadSettings): CardPad | null {
  const c = PadSettings.clamped(settings, null)
  const d = PadSettings.DEFAULT
  const release = c.mode === PlayMode.ONESHOT ? PadSettings.ENV_MAX : PadSettings.KEY_RELEASE
  const pad = cardPad({
    pitch: c.pitch !== d.pitch ? c.pitch + 0 : null,
    level: c.level !== d.level ? c.level : null,
    pan: c.pan !== d.pan ? c.pan : null,
    attack: c.attack !== d.attack ? c.attack : null,
    release: c.release !== release ? c.release : null,
    mode: c.mode !== d.mode ? c.mode : null,
  })
  return cardPadIsEmpty(pad) ? null : pad
}

// ---- Applying ----

/**
 * [current] with the card's effect lines on it, each kind apart: the `fx` line
 * sets the effect (and its knobs, unless it is none, which leaves them where
 * they are); the `send` lines set the groups they name and every other group
 * to 0; `comp` sets the compressor (off keeps its knobs); `sidechain` sets the
 * sidechain (off keeps its source and groups). A kind the card has no line for
 * stays as it is. Every value is held in range.
 */
function applyFx(current: FxSettings, fx: CardFx): FxSettings {
  let out = current
  if (fx.type !== null) out = FxSettings.withType(out, fx.type)
  if (fx.type !== FxType.NONE && (fx.x !== null || fx.y !== null)) out = FxSettings.withXY(out, fx.x ?? out.x, fx.y ?? out.y)
  const sends = fx.sends
  if (sends !== null) for (let g = 0; g < FxSettings.GROUPS; g++) out = FxSettings.withSend(out, g, sends.get(g) ?? 0)
  if (fx.comp !== null) out = FxSettings.withComp(out, fx.comp.on ? fx.comp : { ...out.comp, on: false })
  if (fx.sidechain !== null) out = FxSettings.withSidechain(out, fx.sidechain.on ? fx.sidechain : { ...out.sidechain, on: false })
  return FxSettings.clamped(out)
}

/**
 * [current] with the card's `pad` line on it, the settings it gives and no
 * others. The mode goes first, as the pad sheet's MODE knob does
 * (PadSettings.withMode: leaving oneshot sets the release to the key default),
 * so a release the line gives is the one that stays. Every value is clamped as
 * the sheet does.
 */
function applyPad(current: PadSettings, pad: CardPad): PadSettings {
  let out = current
  if (pad.mode !== null) out = PadSettings.withMode(out, pad.mode)
  if (pad.pitch !== null) out = { ...out, pitch: pad.pitch }
  if (pad.level !== null) out = { ...out, level: pad.level }
  if (pad.pan !== null) out = { ...out, pan: pad.pan }
  if (pad.attack !== null) out = { ...out, attack: pad.attack }
  if (pad.release !== null) out = { ...out, release: pad.release }
  return PadSettings.clamped(out, null)
}

function fitsSwung(p: Pattern, swing: number): boolean {
  const len = Pattern.lengthTicks(p)
  const count = len / timingTicks(Timing.SIXTEENTH)
  return p.notes.every((n) => n.semitones !== null || n.tick >= len || gridStep(n.tick, Timing.SIXTEENTH, swing, count) !== null)
}

// ---- Sounds ----

/** How many notes of [s] play on each pad (pad offset to count; a note past the pattern's end doesn't play). */
function notesByPad(s: CardSection): Map<number, number> {
  const len = Pattern.lengthTicks(s.pattern)
  const out = new Map<number, number>()
  for (const n of s.pattern.notes) if (n.tick >= 0 && n.tick < len) out.set(n.offset, (out.get(n.offset) ?? 0) + 1)
  return out
}

/**
 * The pads [card]'s notes use (pad hits and KEYS notes alike; a note past its pattern's end doesn't play) that would
 * be silent: [slotOf] gives no sound for them now (null) and no sound or synth line of the card (in any scene) puts one on them.
 * In keypad order for each group, scene by scene. Empty when the pads are not [known] (nothing read yet): then a pad with no slot is not
 * known to be empty.
 */
function silentPads(card: BeatCard, slotOf: (pad: PhysicalPad) => number | null, known: boolean): PhysicalPad[] {
  if (!known) return []
  const out: PhysicalPad[] = []
  // A sound or synth line in any scene puts a sound on its pad: the sounds are the project's.
  const given = new Set<number>()
  for (const s of allSections(card)) {
    for (const [offset, line] of s.sounds) if (line.slot >= SLOT_MIN && line.slot <= SLOT_MAX) given.add(padKey(physicalPad(s.group, offset)))
    for (const offset of s.synths?.keys() ?? []) given.add(padKey(physicalPad(s.group, offset)))
  }
  for (const scene of card.scenes) {
    for (const s of [...scene.sections].sort((a, b) => a.group - b.group)) {
      const used = notesByPad(s)
      for (const offset of KEYPAD) {
        const pad = physicalPad(s.group, offset)
        if (!used.has(offset) || given.has(padKey(pad))) continue
        if (slotOf(pad) === null && !out.some((p) => p.group === pad.group && p.offset === pad.offset)) out.push(pad)
      }
    }
  }
  return out
}

/**
 * The card's synth lines by pad (padKey), the project's as the sounds are: the sections of every scene in order, pads in
 * keypad order. A pad given a line in more than one scene takes the last, in the place of its first.
 */
function synthsByPad(card: BeatCard): Map<number, CardSynth> {
  const out = new Map<number, CardSynth>()
  for (const s of allSections(card)) {
    for (const offset of KEYPAD) {
      const synth = s.synths?.get(offset)
      if (synth !== undefined) out.set(padKey(physicalPad(s.group, offset)), synth)
    }
  }
  return out
}

// Whether a sound named [have] is the one called [name] (the card's name is cleaned, so the list's is too).
function holds(have: string | undefined, name: string): boolean {
  return have !== undefined && PadSoundCache.sameName(cleanText(have, Infinity), name)
}

// The slot holding a sound called [name]: the pad's own ([now]) when it does, else the lowest; null when none.
function lookUp(available: ReadonlyMap<number, string>, name: string, now: number | null): number | null {
  const same = [...available].filter(([, n]) => holds(n, name)).map(([slot]) => slot)
  if (now !== null && same.includes(now)) return now
  return same.length === 0 ? null : Math.min(...same)
}

/**
 * The names to show and match for the device's sounds ([device], slot to
 * name): a slot the device lists unnamed (FactorySounds.unnamed, "200.pcm")
 * takes the name the [factory] pack has for that slot when it has one (not
 * blank, and not unnamed itself); every other slot is as the device has it.
 */
function soundNames(device: ReadonlyMap<number, string>, factory: ReadonlyMap<number, string> | null): Map<number, string> {
  const out = new Map(device)
  if (factory === null) return out
  for (const [slot, name] of device) {
    const named = factory.get(slot)
    if (named !== undefined && unnamed(slot, name) && named.trim() !== '' && !unnamed(slot, named)) out.set(slot, named)
  }
  return out
}

// Whether [slot] is in [available] under the name the EP-133 gives a sound nobody named ("200.pcm").
function unnamedIn(available: ReadonlyMap<number, string>, slot: number): boolean {
  const name = available.get(slot)
  return name !== undefined && unnamed(slot, name)
}

/**
 * The card's sound lines matched to the user's sounds, in the card's order
 * (sections as given, pads in keypad order). [available] is slot to name
 * (soundNames), [current] the slot a pad plays now (null when not known). A
 * line with a name is matched like this: the slot is used when it holds a
 * sound of that name (PadSoundCache.sameName: ignoring case, spaces and
 * ".wav"); otherwise the sound is looked up by name and the slot that holds it
 * is used (the pad's own slot first, then the lowest); failing that, a slot
 * that is there but unnamed ("200.pcm", a factory sound whose name can't be
 * checked) is used all the same, as a pick that is `unverified`; else the line
 * is MISSING. A line without a name uses its slot when [available] has it. A
 * pick whose slot is already on the pad is SAME, found by name or not. The
 * sounds are the project's, not a scene's: the lines of all the card's scenes
 * are matched, and a pad given a line in more than one scene takes the last
 * (one pick, in the place of its first). A line that is [foreign] (another
 * kit's sound, by its slot and name) is never used by an unnamed slot: that
 * slot holds another sound.
 */
function resolveSounds(
  card: BeatCard,
  available: ReadonlyMap<number, string>,
  current: (pad: PhysicalPad) => number | null,
  foreign: (wanted: CardSound) => boolean = () => false,
): SoundPick[] {
  const picks = new Map<number, SoundPick>()
  for (const s of allSections(card)) {
    for (const offset of KEYPAD) {
      const wanted = s.sounds.get(offset)
      if (wanted === undefined) continue
      const pad = physicalPad(s.group, offset)
      const now = current(pad)
      // The device's own file name for the slot ("200.pcm") says nothing about the sound: it counts as no name.
      const name = wanted.name !== null && wanted.name.trim() !== '' && !unnamed(wanted.slot, wanted.name) ? wanted.name : null
      const direct = available.has(wanted.slot) && (name === null || holds(available.get(wanted.slot), name)) ? wanted.slot : null
      const byName = direct === null && name !== null ? lookUp(available, name, now) : null
      const slot = direct ?? byName ?? (unnamedIn(available, wanted.slot) && !foreign(wanted) ? wanted.slot : null)
      if (slot === null) {
        picks.set(padKey(pad), { pad, wanted, slot: null, name: null, currentSlot: now, status: SoundStatus.MISSING, unverified: false })
        continue
      }
      const unverified = unnamedIn(available, slot)
      const status = slot === now ? SoundStatus.SAME : byName !== null ? SoundStatus.FOUND_BY_NAME : SoundStatus.CHANGE
      picks.set(padKey(pad), { pad, wanted, slot, name: available.get(slot) ?? null, currentSlot: now, status, unverified })
    }
  }
  return [...picks.values()]
}

/**
 * The sound list Arc adds after a shared card: ClaudeText.soundListHeader for
 * [source] (the EP-133, the last read or the factory pack, as ClaudeText words
 * them), then one line "slot name" for each sound of [available] from slot 1 to
 * 999, in slot order. Names are cleaned as the card's are, so a name read from
 * the list reads back the same. When any listed name is unnamed ("200.pcm"),
 * ClaudeText.UNNAMED_SOUNDS_NOTE follows the header. The text ends in a newline.
 */
function soundList(source: string, available: ReadonlyMap<number, string>): string {
  const out: string[] = [ClaudeText.soundListHeader(source)]
  const lines = [...available.keys()]
    .filter((k) => k >= SLOT_MIN && k <= SLOT_MAX)
    .sort((a, b) => a - b)
    .map((slot): [number, string] => [slot, cleanText(available.get(slot)!, Infinity)])
  if (lines.some(([slot, name]) => unnamed(slot, name))) out.push(ClaudeText.UNNAMED_SOUNDS_NOTE)
  for (const [slot, name] of lines) out.push(name === '' ? `${slot}` : `${slot} ${name}`)
  return out.join('\n') + '\n'
}

// ---- Import ----

/**
 * [card] planned into [seq]: each section's pattern goes into its group's
 * next free pattern (SceneOps.nextFree), and nothing is overwritten. A card of
 * more than one section also adds a new scene (SceneOps.newScene, selected)
 * that plays the new patterns, the groups the card doesn't have keeping the
 * numbers of the scene playing; there is none when the project already has 99
 * scenes (newScene false, the patterns still placed). A card of one section
 * leaves the scene alone: the caller picks the pattern from `placed`. When a
 * group has no free pattern (all 99 hold notes), nothing is placed: the result
 * has [seq] as it was, no `placed` and that group in `fullGroup`.
 *
 * A card of scenes (isMultiScene, from `scene` lines) is planned by planScenes
 * instead, which also takes [setChain].
 */
function plan(seq: ProjectSeq, card: BeatCard, setChain = true, replace = false): CardImport {
  if (isMultiScene(card)) return planScenes(seq, card, setChain, replace)
  let out = seq
  const placed: [number, number][] = []
  for (const s of card.sections) {
    if (s.group < 0 || s.group > 3) continue
    const n = SceneOps.nextFree(out, s.group)
    if (!Pattern.isEmpty(ProjectSeq.pattern(out, s.group, n))) return { seq, placed: [], newScene: false, fullGroup: s.group, scenes: [], chain: null }
    const p = s.pattern
    out = ProjectSeq.withPattern(out, s.group, n, pattern(p.bars, p.notes.slice(0, Seq.MAX_NOTES).map((x) => ({ ...x, id: 0 }))))
    placed.push([s.group, n])
  }
  if (placed.length < 2) return { seq: out, placed, newScene: false, fullGroup: null, scenes: [], chain: null }
  const numbers = [0, 1, 2, 3].map((g) => [...placed].reverse().find((x) => x[0] === g)?.[1] ?? ProjectSeq.selected(seq, g))
  // Replacing, the new scene is the project's only one, and a chain of the old scenes goes with them.
  if (replace) {
    return { seq: ProjectSeq.withScenes(out, [scene(numbers)], 0, { steps: [], on: false }), placed, newScene: true, fullGroup: null, scenes: [0], chain: null }
  }
  const withScene = SceneOps.newScene(out)
  if (withScene.scenes.length === out.scenes.length) return { seq: out, placed, newScene: false, fullGroup: null, scenes: [], chain: null }
  const scenes = [...withScene.scenes.slice(0, -1), scene(numbers)]
  return {
    seq: ProjectSeq.withScenes(withScene, scenes, withScene.scene),
    placed,
    newScene: true,
    fullGroup: null,
    scenes: [withScene.scenes.length - 1],
    chain: null,
  }
}

/**
 * A card of scenes planned into [seq]: one new scene for each card scene,
 * appended after the project's scenes, in the card's order. Each section's
 * pattern goes into its group's next free pattern (after the ones the card has
 * placed already, so no two sections share one, and nothing is overwritten); a
 * group a scene leaves out takes the pattern number of the scene before it (the
 * first scene: the numbers of the scene playing). The first new scene is
 * selected. `placed` lists the sections in the card's order, `scenes` the new
 * scenes' indices.
 *
 * `chain` is the card's chain mapped to the new scenes (null when the card has
 * none). With [setChain] on (the default) and a chain, the result's `seq` has
 * it as the project's chain, replacing the one there and turned on; with it off
 * the project's chain is left alone.
 *
 * With [replace] the new scenes take the place of the project's: the card's
 * scenes become S01 on, the first selected, and the project's chain is cleared
 * unless the card's is set (its steps then name the new scenes from 0). The
 * project's patterns are kept in the banks; only the scenes that named them go.
 * plan does the same for a card of several groups and no scenes: its one new
 * scene is the project's only one.
 *
 * Limits, as for the card without scenes: when a group has no free pattern for
 * a section, nothing is placed (`fullGroup`, [seq] as it was). When the new
 * scenes don't all fit in 99, none is added (`newScene` false, no scenes, no
 * chain), and the patterns are still placed.
 */
function planScenes(seq: ProjectSeq, card: BeatCard, setChain = true, replace = false): CardImport {
  let out = seq
  const placed: [number, number][] = []
  const taken = new Set<number>()
  let numbers = [0, 1, 2, 3].map((g) => ProjectSeq.selected(seq, g))
  const made: Scene[] = []
  for (const sc of card.scenes) {
    const now = [...numbers]
    for (const s of sc.sections) {
      if (s.group < 0 || s.group > 3) continue
      const n = freePattern(out, s.group, taken)
      if (n === null) return { seq, placed: [], newScene: false, fullGroup: s.group, scenes: [], chain: null }
      const p = s.pattern
      out = ProjectSeq.withPattern(out, s.group, n, pattern(p.bars, p.notes.slice(0, Seq.MAX_NOTES).map((x) => ({ ...x, id: 0 }))))
      taken.add(s.group * 100 + n)
      placed.push([s.group, n])
      now[s.group] = n
    }
    numbers = now
    made.push(scene(now))
  }
  if (!replace && seq.scenes.length + made.length > Seq.MAX_SCENES) return { seq: out, placed, newScene: false, fullGroup: null, scenes: [], chain: null }
  // Replacing, the card's scenes are the project's from S01 (its patterns stay in the banks), else they follow its scenes.
  const first = replace ? 0 : seq.scenes.length
  const indices = made.map((_, i) => first + i)
  const mapped = (card.chain ?? [])
    .filter(([sc]) => sc >= 1 && sc <= card.scenes.length)
    .slice(0, Chain.MAX_STEPS)
    .map(([sc, passes]) => chainStep(first + sc - 1, Math.min(Math.max(passes, Chain.MIN_PASSES), Chain.MAX_PASSES)))
  const steps = mapped.length > 0 ? mapped : null
  // A chain of the old scenes would name the new ones: replacing, it goes unless the card's takes its place.
  const chain = setChain && steps !== null ? { steps, on: true } : replace ? { steps: [], on: false } : seq.chain
  return { seq: ProjectSeq.withScenes(out, replace ? made : [...seq.scenes, ...made], first, chain), placed, newScene: true, fullGroup: null, scenes: indices, chain: steps }
}

// The first pattern of [group] after the one selected that has no notes and isn't in [taken] (group * 100 + number), round 1..99; null when there is none.
function freePattern(seq: ProjectSeq, group: number, taken: ReadonlySet<number>): number | null {
  const from = ProjectSeq.selected(seq, group)
  for (let i = 1; i < Seq.MAX_PATTERNS; i++) {
    const n = ((from - 1 + i) % Seq.MAX_PATTERNS) + 1
    if (Pattern.isEmpty(ProjectSeq.pattern(seq, group, n)) && !taken.has(group * 100 + n)) return n
  }
  return null
}

/** The Kotlin `BeatCards` object. */
// A kind of sound: what a row's name says (label), what a sound's name says (sound) and its factory block.
interface SoundKind {
  readonly name: string
  readonly label: RegExp
  readonly sound: RegExp
  readonly block: readonly [number, number]
}

// In the order they are tried: "open hat" before "hat", "bass drum" (a kick) before "bass".
const SOUND_KINDS: readonly SoundKind[] = [
  { name: 'kick', label: /\b(kick|kik|bd|bass ?drum)\b/, sound: /\b(kick|kik|bd)/, block: [1, 99] },
  { name: 'snare', label: /\b(snare|sd|rim ?shot)\b/, sound: /\b(snare|sn|sd)\b/, block: [100, 199] },
  { name: 'clap', label: /\b(clap|snap)\b/, sound: /\b(clap|snap)/, block: [100, 199] },
  { name: 'rim', label: /\b(rim|stick|clave)\b/, sound: /\b(rim|stick|clave)/, block: [100, 199] },
  { name: 'open hat', label: /\b(open ?(hat|hh|hi.?hat)|oh)\b/, sound: /\b(oh|open)\b/, block: [200, 299] },
  { name: 'hat', label: /\b(hi.?hats?|hh|hats?|ch)\b/, sound: /\b(hh|hats?|hihat|ch)\b/, block: [200, 299] },
  { name: 'cymbal', label: /\b(crash|ride|cymbal|splash)\b/, sound: /\b(crash|ride|cym)/, block: [200, 299] },
  { name: 'tom', label: /\btoms?\b/, sound: /\btom/, block: [300, 399] },
  { name: 'perc', label: /\b(shaker|shak\w*|tamb\w*|conga|bongo|cowbell|cow|perc\w*|triangle)\b/, sound: /\b(shak|tamb|perc|conga|bongo|cow|tri)/, block: [300, 399] },
  { name: 'bass', label: /\b(bass|sub|808|reese)\b/, sound: /\b(bass|sub|808|synbaz|baz)/, block: [400, 499] },
  { name: 'chord', label: /\b(chords?|stabs?)\b/, sound: /\b(chrd|chord|stab|skank)/, block: [500, 599] },
  { name: 'melodic', label: /\b(lead|keys?|piano|pads?|pluck|synth|organ|mel\w*|bell|strings?|arp)\b/, sound: /\b(lead|piano|pad|pluc?k|pluk|synth|organ|keys|bell|string|mel)/, block: [500, 599] },
]

// Words of a row's name too general to look for in a sound's name.
const STOP_WORDS = new Set(['closed', 'open', 'loop', 'sound', 'the', 'and', 'new', 'drum', 'hit', 'low', 'high', 'main'])
// An EP-40 loop's name ("jammy bass a 85"): tempo-locked, never a one-shot to suggest.
const LOOP_NAME = /\b(drms|fill|bass|mel|melo)\s+[a-d]\s+[0-9]{2,3}\s*$/i

/**
 * A sound to suggest for a silent [pad] of [card]: one of [names] (slot to name, the sounds Arc knows) by the pad's row
 * name in the card ([label], "shaker"). First a sound whose name has one of the label's words, then one whose name is of
 * the label's kind (a hat for "closed hat", a bass for "sub"), then the first sound in the factory block of that kind
 * (kicks 1-99 ... melodic 500-599; with the EP-40 kit, chords 600-699). A pad the card plays only in KEYS, with no
 * telling name, takes a melodic sound, or a bass when its notes sit below C3. The EP-40's loops are never suggested, nor
 * a slot in [taken]. Null when nothing fits. The Kotlin `BeatCards.suggestSound`.
 */
function suggestSound(
  card: BeatCard,
  pad: PhysicalPad,
  label: string | null,
  names: ReadonlyMap<number, string>,
  taken: ReadonlySet<number> = new Set(),
  kit: FactoryKit = FactoryKit.EP133,
): number | null {
  const low = (label ?? '').toLowerCase()
  const keys = allSections(card).filter((s) => s.group === pad.group).flatMap((s) => s.pattern.notes.filter((n) => n.offset === pad.offset))
  let kind = SOUND_KINDS.find((k) => k.label.test(low)) ?? null
  if (kind === null && keys.length > 0 && keys.every((n) => n.semitones !== null)) {
    const avg = keys.reduce((a, n) => a + n.semitones!, 0) / keys.length
    kind = SOUND_KINDS.find((k) => k.name === (avg < -12 ? 'bass' : 'melodic'))!
  }
  const open = [...names].filter(([slot, name]) => slot >= SLOT_MIN && slot <= SLOT_MAX && !taken.has(slot) && !LOOP_NAME.test(name)).sort((a, b) => a[0] - b[0])
  const block: readonly [number, number] | null = kind === null ? null : kind.name === 'chord' && kit === FactoryKit.EP40 ? [600, 699] : kind.block
  const inBlock = (slot: number): boolean => block !== null && slot >= block[0] && slot <= block[1]
  const first = (ok: (slot: number, name: string) => boolean): number | null => {
    const all = open.filter(([slot, name]) => ok(slot, name.toLowerCase())).map(([slot]) => slot)
    return all.find((slot) => block === null || inBlock(slot)) ?? all[0] ?? null
  }
  const words = (low.match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  if (words.length > 0) {
    const hit = first((_, name) => words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)))
    if (hit !== null) return hit
  }
  if (kind === null) return null
  const k = kind
  return first((_, name) => k.sound.test(name)) ?? open.map(([slot]) => slot).find(inBlock) ?? null
}

/** Whether a file named [name] may hold a beat card as text, picked or dropped on the page: .txt, .md or .markdown. */
function isCardFile(name: string): boolean {
  return /\.(txt|md|markdown)$/i.test(name)
}

/** The most of a card file Arc reads: a longer one is no card. */
const MAX_CARD_FILE = 1 << 20

export const BeatCards = { VERSION, MAX_NAME, MAX_SCENES, TIDY_COMMENT, read, hasCard, write, lessonPads, fromPatterns, fromScenes, fxOf, padOf, applyFx, applyPad, resolveSounds, soundNames, soundList, silentPads, synthsByPad, notesByPad, suggestSound, isCardFile, MAX_CARD_FILE, plan, planScenes } as const
