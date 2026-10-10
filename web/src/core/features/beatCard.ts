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
// - A section's `pads` is a ReadonlyMap from pad offset to CardPad, built by
//   `cardPad()`; the card's `fx` is a CardFx built by `cardFx()` (its `sends` a
//   ReadonlyMap from group to send). Knobs are floats kept with Math.fround, as
//   in fxSettings.ts. CardPad's methods are the functions `cardPadIsEmpty` and
//   `mergedCardPad`.

import { clamp01 } from '../formats/fx/fxMath'
import { FX_TYPES, FxSettings, FxType, comp, sidechain, type Comp, type Sidechain } from './fxSettings'
import { Keys } from './keys'
import { LABELS, ROWS, noteName, physicalPad, type PhysicalPad } from './padNotes'
import { Pattern, ProjectSeq, Seq, Timing, TimingSettings, pattern, patternNote, scene, timingTicks, type PatternNote } from './pattern'
import { PadSettings, PlayMode } from './padSettings'
import { PadSoundCache } from './padSoundCache'
import { unnamed } from './factorySounds'
import { SceneOps } from './scenes'
import { Steps } from './steps'
import { BEATS_PER_BAR } from './tempo'
import { ClaudeText } from '../text/claudeText'

/**
 * A beat as an ARC BEAT text card: an optional [name] (up to 40 characters),
 * the [tempo] it is meant for (40 to 240 BPM), the [swing] of its grid rows
 * (50..75, 50 straight, as the device's TIMING) and its [sections], one for
 * each group at most. [fx] is the project's effect lines, null when the card
 * has none.
 */
export interface BeatCard {
  readonly name: string | null
  readonly tempo: number | null
  readonly swing: number
  readonly sections: readonly CardSection[]
  readonly fx: CardFx | null
}

export function beatCard(
  name: string | null = null,
  tempo: number | null = null,
  swing: number = TimingSettings.SWING_MIN,
  sections: readonly CardSection[] = [],
  fx: CardFx | null = null,
): BeatCard {
  return { name, tempo, swing, sections, fx }
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
 * (a `pad` line each), both by pad offset.
 */
export interface CardSection {
  readonly group: number
  readonly number: number | null
  readonly pattern: Pattern
  readonly sounds: ReadonlyMap<number, CardSound>
  readonly pads: ReadonlyMap<number, CardPad>
}

export function cardSection(
  group: number,
  number: number | null,
  pat: Pattern,
  sounds: ReadonlyMap<number, CardSound> = new Map(),
  pads: ReadonlyMap<number, CardPad> = new Map(),
): CardSection {
  return { group, number, pattern: pat, sounds, pads }
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
}

/**
 * A card planned into a project's sequencer: the [seq] after it, the
 * [group, pattern number] slots it filled ([placed], in the card's order), and
 * whether it added a scene ([newScene]). [fullGroup] is the group whose bank
 * had no free pattern when nothing could be placed: then [seq] is the very one
 * given and [placed] is empty. It is null otherwise.
 */
export interface CardImport {
  readonly seq: ProjectSeq
  readonly placed: readonly (readonly [number, number])[]
  readonly newScene: boolean
  readonly fullGroup: number | null
}

const VERSION = 1
const MAX_NAME = 40

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
  inNotes: boolean
}

function newDraft(line: number, group: number, number: number | null, bars: number, step: Timing, skip: boolean, dropped: boolean): Draft {
  return { line, group, number, bars, step, skip, dropped, hits: [], sounds: new Map(), pads: new Map(), inNotes: false }
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
  const sections: CardSection[] = []
  const groups = new Set<number>()
  let draft: Draft | null = null
  let sectionLines = 0

  const error = (line: number, message: string): void => {
    problems.push({ line, message, error: true })
  }
  const warn = (line: number, message: string): void => {
    problems.push({ line, message, error: false })
  }
  const result = (): CardRead => {
    // Array.prototype.sort is stable, as Kotlin's sortedBy.
    const sorted = [...problems].sort((a, b) => a.line - b.line)
    return { card: sorted.some((p) => p.error) ? null : { name, tempo, swing, sections, fx: readFx() }, problems: sorted }
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
    if (!d.dropped) sections.push({ group: d.group, number: d.number, pattern: pattern(d.bars, kept.sort(noteOrder)), sounds: d.sounds, pads: d.pads })
  }

  // A section line that can't be used: its body is skipped.
  const skipped = (no: number, message: string): void => {
    error(no, message)
    draft = newDraft(no, 0, null, Seq.DEFAULT_BARS, Timing.SIXTEENTH, true, true)
  }

  const section = (no: number, line: string): void => {
    close()
    sectionLines++
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

  const header = (no: number, line: string): void => {
    const word = tokens(line)[0]!
    const key = word.toLowerCase()
    const rest = trim(line.slice(word.length))
    if (line.includes('|') || firstIsPad(line) || key === 'notes' || key === 'sound' || key === 'pad') {
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

  const lineAt = (no: number, line: string): void => {
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
  if (sectionLines === 0) error(start + 1, 'The card has no section, such as [A].')
  return result()
}

// ---- Writing ----

/**
 * [card] as text, as the spec's writing rules have it. [names] gives the
 * sound name a row shows after its pad (null for none). A section's sound
 * lines come right after its line, in keypad order, each with its name when it
 * has one. With [tidy], velocities are rounded to 127, 100 or 64 (ties up) and gates under a step
 * become a step, for every note, and the card says so in a comment. The [silent]
 * pads (silentPads) are listed in a comment of their own right after the header
 * (ClaudeText.noSoundOn); readers ignore it. The text ends in a newline.
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
  if (silent.length > 0) out.push(ClaudeText.noSoundOn(silent))
  if (tidy) out.push(TIDY_COMMENT)
  for (const s of [...card.sections].sort((a, b) => a.group - b.group)) {
    out.push('')
    writeSection(out, s, swing, names, tidy)
  }
  return out.join('\n') + '\n'
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
  return { name, tempo, swing, sections: kept, fx: fx === null ? null : fxOf(fx) }
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
 * be silent: [slotOf] gives no sound for them now (null) and no sound line of the card puts one on them. In keypad
 * order for each group. Empty when the pads are not [known] (nothing read yet): then a pad with no slot is not
 * known to be empty.
 */
function silentPads(card: BeatCard, slotOf: (pad: PhysicalPad) => number | null, known: boolean): PhysicalPad[] {
  if (!known) return []
  const out: PhysicalPad[] = []
  for (const s of [...card.sections].sort((a, b) => a.group - b.group)) {
    const used = notesByPad(s)
    for (const offset of KEYPAD) {
      if (!used.has(offset)) continue
      const line = s.sounds.get(offset)
      if (line !== undefined && line.slot >= SLOT_MIN && line.slot <= SLOT_MAX) continue
      const pad = physicalPad(s.group, offset)
      if (slotOf(pad) === null && !out.some((p) => p.group === pad.group && p.offset === pad.offset)) out.push(pad)
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
 * pick whose slot is already on the pad is SAME, found by name or not.
 */
function resolveSounds(card: BeatCard, available: ReadonlyMap<number, string>, current: (pad: PhysicalPad) => number | null): SoundPick[] {
  const picks: SoundPick[] = []
  for (const s of card.sections) {
    for (const offset of KEYPAD) {
      const wanted = s.sounds.get(offset)
      if (wanted === undefined) continue
      const pad = physicalPad(s.group, offset)
      const now = current(pad)
      // The device's own file name for the slot ("200.pcm") says nothing about the sound: it counts as no name.
      const name = wanted.name !== null && wanted.name.trim() !== '' && !unnamed(wanted.slot, wanted.name) ? wanted.name : null
      const direct = available.has(wanted.slot) && (name === null || holds(available.get(wanted.slot), name)) ? wanted.slot : null
      const byName = direct === null && name !== null ? lookUp(available, name, now) : null
      const slot = direct ?? byName ?? (unnamedIn(available, wanted.slot) ? wanted.slot : null)
      if (slot === null) {
        picks.push({ pad, wanted, slot: null, name: null, currentSlot: now, status: SoundStatus.MISSING, unverified: false })
        continue
      }
      const unverified = unnamedIn(available, slot)
      const status = slot === now ? SoundStatus.SAME : byName !== null ? SoundStatus.FOUND_BY_NAME : SoundStatus.CHANGE
      picks.push({ pad, wanted, slot, name: available.get(slot) ?? null, currentSlot: now, status, unverified })
    }
  }
  return picks
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
 */
function plan(seq: ProjectSeq, card: BeatCard): CardImport {
  let out = seq
  const placed: [number, number][] = []
  for (const s of card.sections) {
    if (s.group < 0 || s.group > 3) continue
    const n = SceneOps.nextFree(out, s.group)
    if (!Pattern.isEmpty(ProjectSeq.pattern(out, s.group, n))) return { seq, placed: [], newScene: false, fullGroup: s.group }
    const p = s.pattern
    out = ProjectSeq.withPattern(out, s.group, n, pattern(p.bars, p.notes.slice(0, Seq.MAX_NOTES).map((x) => ({ ...x, id: 0 }))))
    placed.push([s.group, n])
  }
  if (placed.length < 2) return { seq: out, placed, newScene: false, fullGroup: null }
  const withScene = SceneOps.newScene(out)
  if (withScene.scenes.length === out.scenes.length) return { seq: out, placed, newScene: false, fullGroup: null }
  const numbers = [0, 1, 2, 3].map((g) => [...placed].reverse().find((x) => x[0] === g)?.[1] ?? ProjectSeq.selected(seq, g))
  const scenes = [...withScene.scenes.slice(0, -1), scene(numbers)]
  return { seq: ProjectSeq.withScenes(withScene, scenes, withScene.scene), placed, newScene: true, fullGroup: null }
}

/** The Kotlin `BeatCards` object. */
export const BeatCards = { VERSION, MAX_NAME, TIDY_COMMENT, read, hasCard, write, fromPatterns, fxOf, padOf, applyFx, applyPad, resolveSounds, soundNames, soundList, silentPads, notesByPad, plan } as const
