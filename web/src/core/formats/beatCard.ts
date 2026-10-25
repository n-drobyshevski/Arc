// ARC BEAT cards: the plain-text beats the arc-beats skill writes, read for a
// preview (an addition with no Kotlin twin, like guideData.ts: web only).
//
// The spec is the skill's references/beat-card.md ("ARC BEAT card, version
// 1"); its reading rules are followed one by one, the same way as the skill's
// scripts/beatcard.py, so a card is valid here exactly when `beatcard.py
// check` finds no error, and each problem has the same line and the same
// reason (beatcard.py's code and wording). This is what a player needs: the
// header (name, tempo, swing), the effect lines (fx, send, comp, sidechain),
// the [A]-[D] sections with their grid rows, notes, sound and pad lines.
//
// The rest of the format is checked by the same rules but not kept: the chain
// and every scene but the first. Each such line that reads fine gets a
// warning "not previewed yet" with its line number, so a card that uses them
// still plays.
//
// Holds: a grid row keeps two arrays with one entry per step. vel[k] is the
// velocity of the hit that starts at step k (0 for a rest or a hold) and
// len[k] its length in steps, 1 plus the '-' after it (0 where no hit
// starts). A hit plays at stepTick(group, k, swing) for len[k] * stepTicks.
// Two hits on one pad at one tick (two rows, or a row and a note) stay as
// written here; the card gets beatcard.py's warning that the louder is kept.

import { LABELS, note, noteName } from '../features/padNotes'

export const VERSION = 1
export const TICKS_PER_BEAT = 96
export const TICKS_PER_BAR = 384
/** The most notes a section may have (pad hits and notes, after doubles fold). */
export const MAX_NOTES = 2048
export const NAME_MAX = 40
export const MAX_SCENES = 16
export const CHAIN_MAX_STEPS = 64
export const TEMPO_MIN = 40
export const TEMPO_MAX = 240
export const SWING_MIN = 50
export const SWING_MAX = 75
export const SLOT_MIN = 1
export const SLOT_MAX = 999
/** KEYS mode's root: `note C4` (60) is semi 0. */
export const KEYS_ROOT = 60

/** The grid steps a section can use, in ticks (96 a beat, 384 a bar). */
export const STEP_TICKS = { '1/8': 48, '1/16': 24, '1/32': 12, '1/8T': 32, '1/16T': 16 } as const
export type StepName = keyof typeof STEP_TICKS
/** Gate names a note can use, in ticks. */
const GATE_TICKS: Readonly<Record<string, number>> = { '1/4': 96, ...STEP_TICKS }
/** Swing moves only 1/8 and 1/16 grids, as the device's TIMING does. */
const SWING_STEPS: readonly StepName[] = ['1/8', '1/16']

const GROUPS = 'ABCD'
const PASSES_MIN = 1
const PASSES_MAX = 8
const FX_TYPES = ['none', 'delay', 'reverb', 'distortion', 'chorus', 'filter', 'compressor'] as const
const FX_LIST = 'none, delay, reverb, distortion, chorus, filter or compressor'
const FX_WORDS = ['fx', 'send', 'comp', 'sidechain']
const PAD_SETTINGS = ['pitch', 'level', 'pan', 'attack', 'release', 'mode']
const PLAY_MODES = ['oneshot', 'key', 'legato']
/** The release a pad gets when its mode leaves oneshot and the line gives none: the device's key default. */
export const KEY_RELEASE = 15
/** The sidechain's length and shape when the line gives none, and the fx knobs'. */
export const SIDECHAIN_LENGTH = 30
export const SIDECHAIN_SHAPE = 50
export const FX_KNOB = 50
const HEADER_WORDS = ['name', 'tempo', 'swing']
const NOTE_KEYS = ['at', 't', 'vel', 'gate', 'note', 'semi']
const PERCENT_TEXT = '0 to 100, whole or with one decimal'

/** A problem with the card: its line (from 1, in the text as given), beatcard.py's code and a short reason. */
export interface BeatCardProblem {
  readonly line: number
  readonly code: string
  readonly msg: string
}

/** One grid row. vel/len have one entry per step of the section (see the header comment). */
export interface BeatCardRow {
  /** The pad as printed: A7, A., A0, AENTER (E is written out). */
  readonly pad: string
  /** The pad's place in its group's octave, 0..11 ('.', '0', ENTER, '1' … '9'). */
  readonly offset: number
  /** The pad's MIDI note, 36..83 (padNotes.note). */
  readonly note: number
  /** The sound name written between the pad and the first '|'; '' when none. */
  readonly label: string
  readonly line: number
  readonly vel: readonly number[]
  readonly len: readonly number[]
}

/** A section: one group's pattern. */
export interface BeatCardGroup {
  /** A..D */
  readonly group: string
  /** 0..3 */
  readonly index: number
  /** The pattern number written as a hint, [B12] → 12; null when none. */
  readonly number: number | null
  readonly line: number
  readonly bars: number
  readonly step: StepName
  readonly stepTicks: number
  readonly stepsPerBar: number
  /** bars * stepsPerBar: the length of every row's vel and len. */
  readonly steps: number
  /** A triplet grid (1/8T, 1/16T): 3 steps a beat at 1/8T, 6 at 1/16T. */
  readonly triplet: boolean
  /** Whether swing moves this grid's odd steps (1/8 and 1/16 only). */
  readonly swings: boolean
  /** The pattern's length in ticks, bars * 384. */
  readonly length: number
  readonly rows: readonly BeatCardRow[]
}

/** A line of a section's notes list: a pad hit (semi null) or a KEYS note, never swung. */
export interface BeatCardNote {
  readonly group: string
  readonly pad: string
  readonly offset: number
  /** The pad's MIDI note (a KEYS note plays the pad's sound at semi). */
  readonly note: number
  readonly tick: number
  readonly vel: number
  /** In ticks. */
  readonly gate: number
  /** Semitones from KEYS_ROOT, -127..127; null for a pad hit. */
  readonly semi: number | null
  /** The KEYS note's name (C4 for semi 0); null for a pad hit or one outside MIDI's 0..127. */
  readonly key: string | null
  readonly line: number
}

/** A sound line: which slot a pad should play; the later line for a pad wins. */
export interface BeatCardSound {
  readonly group: string
  readonly pad: string
  readonly offset: number
  readonly slot: number
  /** '' when the line gave none. */
  readonly name: string
  readonly line: number
}

/** The master effect of an fx line; x and y are percent, 0..100 (50 when the line leaves them out). */
export interface BeatCardFx {
  readonly type: FxType
  readonly x: number
  readonly y: number
}

export type FxType = (typeof FX_TYPES)[number]

/** Send lines, added up: each group given, A..D, with its percent; groups left out play 0. */
export type BeatCardSends = Partial<Record<'A' | 'B' | 'C' | 'D', number>>

/** A comp line that turns the compressor on: drive and speed in percent. */
export interface BeatCardComp {
  readonly drive: number
  readonly speed: number
}

/** A sidechain line: the pad that ducks the groups, with the length and shape in percent. */
export interface BeatCardSidechain {
  /** The pad as printed (AENTER for E). */
  readonly pad: string
  readonly group: string
  readonly offset: number
  readonly note: number
  /** The groups it ducks, A..D in order, each once (its own group may be one). */
  readonly groups: readonly string[]
  readonly length: number
  readonly shape: number
}

export type PlayMode = 'oneshot' | 'key' | 'legato'

/** A pad's shaping from its pad lines (merged, the later settings winning); only the settings given. */
export interface BeatCardPad {
  readonly group: string
  readonly pad: string
  readonly offset: number
  readonly note: number
  /** Semitones, -12..12, up to two decimals. */
  readonly pitch?: number
  /** 0..100 */
  readonly level?: number
  /** -16..16, negative is left. */
  readonly pan?: number
  /** Envelope ticks, 0..255. */
  readonly attack?: number
  /** Envelope ticks, 0..255; KEY_RELEASE when the mode left oneshot without one. */
  readonly release?: number
  readonly mode?: PlayMode
  /** The pad's last pad line. */
  readonly line: number
}

export interface BeatCardResult {
  /** No errors: the card reads (warnings allowed). */
  readonly valid: boolean
  readonly errors: readonly BeatCardProblem[]
  readonly warnings: readonly BeatCardProblem[]
  readonly name: string
  /** The BPM the card is meant for; null when it has no tempo line. */
  readonly tempo: number | null
  /** 50 (straight) .. 75. */
  readonly swing: number
  /** The (first) scene's sections in card order. */
  readonly groups: readonly BeatCardGroup[]
  /** Those sections' notes lists, in card order. */
  readonly notes: readonly BeatCardNote[]
  /** Those sections' sound lines, one per pad. */
  readonly sounds: readonly BeatCardSound[]
  /** Those sections' pad lines, one per pad, in the order the pads first got one. */
  readonly pads: readonly BeatCardPad[]
  /** The effect lines, project-wide; null when the card has no such line. */
  readonly fx: BeatCardFx | null
  readonly sends: BeatCardSends | null
  readonly comp: BeatCardComp | 'off' | null
  readonly sidechain: BeatCardSidechain | 'off' | null
  /** The scenes the card has (1 without scene lines); only the first is kept. */
  readonly scenes: number
}

// ---------------------------------------------------------------------------
// Helpers a player uses
// ---------------------------------------------------------------------------

/** How many ticks late step k plays: odd steps of 1/8 and 1/16, ties rounding up (Steps.tickOf). */
export function swingOffset(step: StepName, k: number, swing: number): number {
  if (!SWING_STEPS.includes(step) || k % 2 === 0) return 0
  return Math.floor(((swing - SWING_MIN) * STEP_TICKS[step] + 25) / 50)
}

/** The tick step k of a section's rows plays at, swing included. */
export function stepTick(group: BeatCardGroup, k: number, swing: number): number {
  return k * group.stepTicks + swingOffset(group.step, k, swing)
}

/** A tick as bar.beat.sixteenth, with +n for leftover ticks ("1.2.3+8"). */
export function position(tick: number): string {
  const bar = Math.floor(tick / TICKS_PER_BAR)
  const inBar = tick - bar * TICKS_PER_BAR
  const beat = Math.floor(inBar / TICKS_PER_BEAT)
  const inBeat = inBar - beat * TICKS_PER_BEAT
  const sixteenth = Math.floor(inBeat / 24)
  const extra = inBeat - sixteenth * 24
  return `${bar + 1}.${beat + 1}.${sixteenth + 1}` + (extra ? `+${extra}` : '')
}

// ---------------------------------------------------------------------------
// Small text helpers (beatcard.py's)
// ---------------------------------------------------------------------------

/** The blanks a card knows: space, tab and no-break space. Other white space is ordinary text. */
const SPACE = ' \t '
const LINE_BREAK = /\r\n|\r|\n/
const CARD_START = /^[ \t ]*ARC[ \t ]+BEAT(?:[ \t ]|$)/i
const AT = /^([0-9]{1,6})\.([0-9]{1,6})\.([0-9]{1,6})(?:([+-])([0-9]{1,6}))?$/
const PERCENT = /^[0-9]{1,3}(\.[0-9])?$/
const PITCH = /^[+-]?[0-9]{1,2}(\.[0-9]{1,2})?$/
const SIGNED = /^[+-]?[0-9]{1,9}$/
const DIGITS = /^[0-9]{1,9}$/

function trim(text: string): string {
  let a = 0
  let b = text.length
  while (a < b && SPACE.includes(text[a]!)) a++
  while (b > a && SPACE.includes(text[b - 1]!)) b--
  return text.slice(a, b)
}

function tokens(text: string): string[] {
  return text.split(/[ \t ]+/).filter((t) => t !== '')
}

/** Drops a comment: a # at the start of the line or after a blank (C#4 keeps its sharp). */
function stripComment(line: string): string {
  const m = /(^|[ \t ])#/.exec(line)
  return trim(m ? line.slice(0, m.index) : line)
}

/** A name as a card keeps it: no #, | or line breaks, single spaces. */
function cleanText(text: string): string {
  return text.replace(/[#|\t\r\n  ]+/g, ' ').trim()
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** Grid characters and their velocities: X 127, x 100, o 64, a digit n 14 * n. */
const STEP_CHARS: Readonly<Record<string, number>> = {
  X: 127,
  x: 100,
  o: 64,
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), 14 * n])),
}

/** Note names C-1 (0) .. G9 (127) as padNotes.noteName writes them, capitals and sharps only. */
const NOTE_NUMBERS = new Map<string, number>()
for (let n = 0; n <= 127; n++) NOTE_NUMBERS.set(noteName(n), n)

function padLabel(group: number, offset: number): string {
  return GROUPS[group]! + LABELS[offset]!
}

/** (group, offset) of A7, A., AE or AENTER; a reason when the token isn't a pad. */
function parsePad(token: string): { group: number; offset: number } | string {
  if (token.length < 2 || !GROUPS.includes(token[0]!)) {
    const hint =
      'abcd'.includes(token[0] ?? '') && token.length >= 2 ? ' (group letters and pad labels are capitals)' : ''
    return `'${token}' is not a pad: write the group letter A-D, then . 0 E or 1-9, like A7${hint}`
  }
  const label = token.slice(1)
  const offset = label === 'E' ? 2 : LABELS.indexOf(label)
  if (offset < 0) return `'${token}' is not a pad: after the group letter use . 0 E (or ENTER) or 1-9`
  return { group: GROUPS.indexOf(token[0]!), offset }
}

function firstIsPad(text: string): boolean {
  return typeof parsePad(tokens(text)[0]!) !== 'string'
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface Hit {
  readonly offset: number
  readonly tick: number
  readonly vel: number
  readonly semi: number | null
  readonly line: number
}

interface Draft {
  readonly group: number
  readonly number: number | null
  readonly line: number
  bars: number
  step: StepName
  readonly rows: BeatCardRow[]
  readonly notes: BeatCardNote[]
  readonly sounds: Map<number, BeatCardSound>
  readonly pads: Map<number, BeatCardPad>
  readonly hits: Hit[]
}

const draft = (group: number, number: number | null, line: number): Draft => ({
  group,
  number,
  line,
  bars: 1,
  step: '1/16',
  rows: [],
  notes: [],
  sounds: new Map(),
  pads: new Map(),
  hits: [],
})

class Reader {
  readonly problems: { readonly p: BeatCardProblem; readonly error: boolean }[] = []
  readonly lines: string[]
  name = ''
  tempo: number | null = null
  swing = 50
  /** The first scene's sections. */
  readonly kept: Draft[] = []
  private current: Draft | null = null
  /** The section line couldn't be read: its lines are skipped. */
  private skip = false
  /** A second section of a group: read for its problems, then dropped. */
  private dropped = false
  private inNotes = false
  private sectionLines = 0
  private seenGroups = new Map<number, number>()
  sceneCount = 0
  /** The line of the first section, when no scene line came before it. */
  private firstSection = 0
  private chainSteps: number[] | null = null
  private chainLine = 0
  private readonly fxSeen = new Set<string>()
  fx: BeatCardFx | null = null
  sends: BeatCardSends | null = null
  comp: BeatCardComp | 'off' | null = null
  sidechain: BeatCardSidechain | 'off' | null = null

  constructor(text: string) {
    this.lines = (text.startsWith('﻿') ? text.slice(1) : text).split(LINE_BREAK)
  }

  err(line: number, code: string, msg: string): void {
    this.problems.push({ p: { line, code, msg }, error: true })
  }

  warn(line: number, code: string, msg: string): void {
    this.problems.push({ p: { line, code, msg }, error: false })
  }

  later(line: number, what: string): void {
    this.warn(line, 'not-previewed', `${what} not previewed yet`)
  }

  read(): void {
    const start = this.lines.findIndex((l) => CARD_START.test(l))
    if (start < 0) {
      this.err(1, 'no-card', 'no line starts with ARC BEAT, so there is no card here')
      return
    }
    if (!this.version(start)) return
    for (let i = start + 1; i < this.lines.length; i++) {
      const text = trim(stripComment(this.lines[i]!))
      if (text === '```' || text.toUpperCase() === 'END') break
      if (text === '') continue
      this.line(i + 1, text)
    }
    this.close()
    if (this.sectionLines === 0) {
      this.err(start + 1, 'no-sections', 'the card has no section: add [A], [B], [C] or [D] with grid rows')
    }
    this.checkChain()
  }

  private version(start: number): boolean {
    const t = tokens(stripComment(this.lines[start]!))
    const v = t[2]
    if (v === undefined || !/^[0-9]{1,6}$/.test(v) || Number(v) < 1) {
      this.err(start + 1, 'bad-version', 'the version after ARC BEAT must be a whole number, like ARC BEAT 1')
      return false
    }
    if (Number(v) > VERSION) {
      this.err(
        start + 1,
        'newer-version',
        `made by a newer Arc (card version ${Number(v)}, this reader knows ${VERSION})`,
      )
      return false
    }
    return true
  }

  private line(n: number, text: string): void {
    const word = tokens(text)[0]!
    const first = word.toLowerCase()
    if (first === 'scene') return this.sceneLine(n, text)
    if (first === 'chain') return this.chainHeader(n, text)
    if (text.startsWith('[')) return this.startSection(n, text)
    if (this.current === null) return this.header(n, text)
    if (this.skip) return
    if (text.toLowerCase() === 'notes') this.inNotes = true
    else if (first === 'sound') this.sound(n, text)
    else if (first === 'pad') this.padLine(n, text)
    else if (FX_WORDS.includes(first)) this.err(n, 'late-fx', `'${word}' belongs before the first section`)
    else if (this.inNotes) this.note(n, text)
    else if (text.includes('|')) this.row(n, text)
    else if (firstIsPad(text)) {
      this.err(n, 'bad-line', `'${word}' needs a | before its steps: a grid row looks like 'A7 kick | X... .... |'`)
    } else if (HEADER_WORDS.includes(first)) {
      this.warn(n, 'late-header', `'${word}' belongs before the first section; ignored here`)
    } else this.warn(n, 'unknown-word', `unknown word '${word}' ignored`)
  }

  // -- header ---------------------------------------------------------------

  private header(n: number, text: string): void {
    const word = tokens(text)[0]!
    const key = word.toLowerCase()
    const rest = trim(text.slice(word.length))
    if (this.sceneCount > 0 && HEADER_WORDS.includes(key)) {
      this.warn(n, 'late-header', `'${word}' belongs before the first scene; ignored here`)
    } else if (this.sceneCount > 0 && FX_WORDS.includes(key)) {
      this.err(n, 'late-fx', `'${word}' belongs before the first scene`)
    } else if (key === 'notes') {
      this.err(n, 'notes-outside-section', "'notes' has to come inside a section like [A]")
    } else if (key === 'sound') {
      this.err(n, 'sound-outside-section', "'sound' has to come after a section line like [A]")
    } else if (key === 'pad') {
      this.err(n, 'pad-outside-section', "'pad' has to come after a section line like [A]")
    } else if (FX_WORDS.includes(key)) {
      this.fxLine(n, word, key, tokens(rest))
    } else if (text.includes('|') || firstIsPad(text)) {
      this.err(n, 'row-outside-section', 'a grid row has to come after a section line like [A]')
    } else if (HEADER_WORDS.includes(key)) {
      this.headerValue(n, key, rest)
    } else this.warn(n, 'unknown-header', `unknown header word '${word}' ignored`)
  }

  private headerValue(n: number, key: string, rest: string): void {
    if (key === 'name') {
      if (rest === '') this.warn(n, 'empty-name', 'the name is empty; ignored')
      else if ([...rest].length > NAME_MAX) {
        this.warn(n, 'long-name', `the name is longer than ${NAME_MAX} characters; shortened`)
        this.name = trim([...rest].slice(0, NAME_MAX).join(''))
      } else this.name = rest
      return
    }
    const t = tokens(rest)
    if (key === 'tempo') {
      const ok =
        t.length === 1 && /^[0-9]{1,3}(\.[0-9])?$/.test(t[0]!) && Number(t[0]) >= TEMPO_MIN && Number(t[0]) <= TEMPO_MAX
      if (!ok) this.err(n, 'bad-tempo', `tempo '${rest}' must be 40 to 240, whole or with one decimal`)
      else this.tempo = Number(t[0])
      return
    }
    const ok = t.length === 1 && /^[0-9]{1,3}$/.test(t[0]!) && Number(t[0]) >= SWING_MIN && Number(t[0]) <= SWING_MAX
    if (!ok) this.err(n, 'bad-swing', `swing '${rest}' must be a whole number from 50 (straight) to 75`)
    else this.swing = Number(t[0])
  }

  // -- sections -------------------------------------------------------------

  private open(d: Draft, skip: boolean, dropped: boolean): void {
    this.current = d
    this.skip = skip
    this.dropped = dropped
    this.inNotes = false
  }

  /** A section line that can't be used: its lines are skipped, as they would only repeat the fault. */
  private skipped(n: number, code: string, msg: string): void {
    this.err(n, code, msg)
    this.open(draft(0, null, n), true, true)
  }

  private startSection(n: number, text: string): void {
    this.close()
    this.sectionLines++
    if (this.sceneCount === 0 && this.firstSection === 0) this.firstSection = n
    const end = text.indexOf(']')
    if (end < 0)
      return this.skipped(n, 'bad-section', 'a section line looks like [A] or [B12], with the bracket closed')
    const inner = trim(text.slice(1, end))
    const m = /^([A-D])([0-9]*)$/.exec(inner)
    if (!m) {
      return this.skipped(
        n,
        'bad-section',
        `section '[${inner}]' must be [A] to [D], optionally with a pattern number like [B12]`,
      )
    }
    const letter = m[1]!
    const digits = m[2]!
    let number: number | null = null
    if (digits) {
      number = digits.length <= 2 && Number(digits) >= 1 ? Number(digits) : null
      if (number === null) {
        return this.skipped(n, 'bad-pattern-number', `the pattern number in [${letter}${digits}] must be 1 to 99`)
      }
    }
    const group = GROUPS.indexOf(letter)
    const d = draft(group, number, n)
    const bad = this.options(n, d, tokens(text.slice(end + 1)))
    const seen = this.seenGroups.get(group)
    if (seen !== undefined) this.err(n, 'duplicate-group', `group ${letter} already has a section on line ${seen}`)
    else this.seenGroups.set(group, n)
    this.open(d, bad, seen !== undefined)
  }

  /** Reads a section line's options into [d]; true when one of them is wrong. */
  private options(n: number, d: Draft, t: string[]): boolean {
    let bad = false
    let i = 0
    while (i < t.length) {
      const word = t[i]!.toLowerCase()
      const value = t[i + 1]
      if (word === 'bars') {
        if (value !== undefined && /^[0-9]{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 99)
          d.bars = Number(value)
        else {
          this.err(n, 'bad-bars', 'bars must be a whole number from 1 to 99')
          bad = true
        }
        i += 2
      } else if (word === 'step') {
        const step = value?.toUpperCase()
        if (step !== undefined && step in STEP_TICKS) d.step = step as StepName
        else {
          this.err(n, 'bad-step', 'step must be one of 1/8 1/16 1/32 1/8T 1/16T')
          bad = true
        }
        i += 2
      } else {
        this.warn(n, 'unknown-option', `unknown section option '${t[i]}' ignored`)
        i += value !== undefined && !['bars', 'step'].includes(value.toLowerCase()) ? 2 : 1
      }
    }
    return bad
  }

  /** Ends the section being read: doubles folded, the limit checked, the pattern kept when it is the first scene's. */
  private close(): void {
    const d = this.current
    if (d === null) return
    this.current = null
    if (this.skip) return
    this.mergeDoubles(d)
    if (d.hits.length > MAX_NOTES) {
      this.err(d.line, 'too-many-notes', `[${GROUPS[d.group]}] has ${d.hits.length} notes, the most is ${MAX_NOTES}`)
    }
    // A later scene's sections are checked but not kept: the scene line has the warning.
    if (!this.dropped && this.sceneCount <= 1) this.kept.push(d)
  }

  /** Two hits on one pad at one tick count as one: the louder stays, with a warning. */
  private mergeDoubles(d: Draft): void {
    const kept = new Map<string, Hit>()
    for (const hit of d.hits) {
      const key = `${hit.offset} ${hit.tick} ${hit.semi}`
      const old = kept.get(key)
      if (old === undefined) {
        kept.set(key, hit)
        continue
      }
      this.warn(
        hit.line,
        'duplicate-hit',
        `${padLabel(d.group, hit.offset)} at ${position(hit.tick)} is already played on line ${old.line}; the louder is kept`,
      )
      if (hit.vel > old.vel) kept.set(key, hit)
    }
    d.hits.length = 0
    d.hits.push(...kept.values())
  }

  // -- scenes and chain -----------------------------------------------------

  private sceneLine(n: number, text: string): void {
    this.close()
    if (this.sceneCount === 0 && this.firstSection) {
      this.err(
        this.firstSection,
        'section-before-scene',
        'a section comes before the first scene line: once a card has scenes, every section belongs to one',
      )
      // The sections read so far belonged to no scene: they are not the first scene's.
      this.kept.length = 0
    }
    this.sceneCount++
    this.seenGroups = new Map()
    if (this.sceneCount === MAX_SCENES + 1) {
      this.err(n, 'too-many-scenes', `the card has more than ${MAX_SCENES} scenes, the most is ${MAX_SCENES}`)
    }
    let name = trim(text.slice(tokens(text)[0]!.length))
    if ([...name].length > NAME_MAX) {
      this.warn(n, 'long-scene-name', `the scene name is longer than ${NAME_MAX} characters; shortened`)
      name = trim([...name].slice(0, NAME_MAX).join(''))
    }
    if (this.sceneCount > 1) this.later(n, `scene ${this.sceneCount}${name ? ` (${name})` : ''} is`)
  }

  /** chain <step> ...: a scene number from 1, with its passes as in 2x4 (1 to 8). A line with a fault changes nothing. */
  private chainHeader(n: number, text: string): void {
    const word = tokens(text)[0]!
    if (this.sectionLines > 0 || this.sceneCount > 0)
      return this.err(n, 'late-chain', `'${word}' belongs before the first scene`)
    const t = tokens(text.slice(word.length))
    if (t.length === 0) return this.err(n, 'empty-chain', 'chain needs at least one scene, as in chain 1 2x2 3')
    const steps: number[] = []
    for (const tok of t) {
      const m = /^([0-9]{1,6})(?:[xX]([0-9]{1,6}))?$/.exec(tok)
      if (!m) {
        return this.err(
          n,
          'bad-chain-step',
          `'${tok}' isn't a chain step: write a scene number, and its passes after an x, as in 2 or 2x4`,
        )
      }
      const scene = Number(m[1])
      const passes = Number(m[2] ?? 1)
      if (scene < 1) return this.err(n, 'chain-scene-zero', `chain step '${tok}': scenes count from 1`)
      if (passes < PASSES_MIN || passes > PASSES_MAX) {
        return this.err(n, 'bad-passes', `chain step '${tok}': passes must be ${PASSES_MIN} to ${PASSES_MAX}`)
      }
      steps.push(scene)
    }
    if (steps.length > CHAIN_MAX_STEPS) {
      return this.err(n, 'chain-too-long', `the chain has ${steps.length} steps, the most is ${CHAIN_MAX_STEPS}`)
    }
    if (this.chainSteps !== null) this.warn(n, 'duplicate-chain', 'two chain lines: the later one is kept')
    this.chainSteps = steps
    this.chainLine = n
  }

  /** The chain names scenes the card has, and the card has scenes at all. */
  private checkChain(): void {
    if (this.chainSteps === null) return
    if (this.sceneCount === 0) {
      return this.err(
        this.chainLine,
        'chain-without-scenes',
        'a chain needs scenes: start each scene with a scene line',
      )
    }
    const i = this.chainSteps.findIndex((scene) => scene > this.sceneCount)
    if (i >= 0) {
      const what = plural(this.sceneCount, 'scene')
      this.err(
        this.chainLine,
        'chain-unknown-scene',
        `chain step ${i + 1} names scene ${this.chainSteps[i]}, but the card has ${what}`,
      )
    } else this.later(this.chainLine, 'the chain is')
  }

  // -- grid rows ------------------------------------------------------------

  private row(n: number, text: string): void {
    const d = this.current!
    const bar = text.indexOf('|')
    const left = trim(text.slice(0, bar))
    const right = text.slice(bar + 1)
    const parts = tokens(left)
    if (parts.length === 0) return this.err(n, 'bad-pad', "the row starts with '|': it needs a pad first, like A7")
    const label = parts[0]!
    const name = trim(left.slice(label.length))
    const pad = parsePad(label)
    if (typeof pad === 'string') return this.err(n, 'bad-pad', pad)
    if (pad.group !== d.group) {
      return this.err(
        n,
        'wrong-group',
        `pad ${label} is in group ${GROUPS[pad.group]} but the section is [${GROUPS[d.group]}]`,
      )
    }
    const chunks = right
      .split('|')
      .map((part) => [...part].filter((c) => !SPACE.includes(c)).join(''))
      .filter((c) => c !== '')
    const steps = [...chunks.join('')]
    const stepTicks = STEP_TICKS[d.step]
    const perBar = TICKS_PER_BAR / stepTicks
    const vel: number[] = []
    const len: number[] = []
    let last = -1 // the step of the hit a '-' holds, -1 after a rest
    for (let k = 0; k < steps.length; k++) {
      const ch = steps[k]!
      const v = STEP_CHARS[ch]
      vel.push(v ?? 0)
      len.push(v === undefined ? 0 : 1)
      if (v !== undefined) last = k
      else if (ch === '-') {
        if (last < 0) {
          const where = `step ${k + 1} (bar ${Math.floor(k / perBar) + 1})`
          return this.err(n, 'orphan-hold', `row ${label}: '-' at ${where} has no hit before it to hold`)
        }
        len[last] = len[last]! + 1
      } else if (ch === '.') last = -1
      else {
        const where = `step ${k + 1} (bar ${Math.floor(k / perBar) + 1})`
        return this.err(n, 'bad-step-char', `row ${label}: '${ch}' at ${where} isn't a step: use X x o 1-9 - .`)
      }
    }
    if (steps.length !== d.bars * perBar) {
      return this.err(n, 'step-count', countMessage(label, chunks, steps.length, perBar, d.bars))
    }
    d.rows.push({
      pad: padLabel(d.group, pad.offset),
      offset: pad.offset,
      note: note(pad),
      label: name,
      line: n,
      vel,
      len,
    })
    vel.forEach((v, k) => {
      if (v > 0)
        d.hits.push({
          offset: pad.offset,
          tick: k * stepTicks + swingOffset(d.step, k, this.swing),
          vel: v,
          semi: null,
          line: n,
        })
    })
  }

  // -- sound lines ----------------------------------------------------------

  /** sound <pad> <slot> [name], anywhere in a section (after notes too). A second line for a pad replaces the first. */
  private sound(n: number, text: string): void {
    const d = this.current!
    let rest = trim(text.slice(tokens(text)[0]!.length))
    const parts = tokens(rest)
    if (parts.length === 0) {
      return this.err(
        n,
        'bad-sound',
        "a sound line looks like 'sound A7 12 Kick': the pad, the slot, then the name if you know it",
      )
    }
    const pad = parsePad(parts[0]!)
    if (typeof pad === 'string') return this.err(n, 'bad-pad', pad)
    if (pad.group !== d.group) {
      return this.err(
        n,
        'wrong-group',
        `pad ${parts[0]} is in group ${GROUPS[pad.group]} but the section is [${GROUPS[d.group]}]`,
      )
    }
    rest = trim(rest.slice(parts[0]!.length))
    const slotText = rest ? tokens(rest)[0]! : ''
    if (!(DIGITS.test(slotText) && Number(slotText) >= SLOT_MIN && Number(slotText) <= SLOT_MAX)) {
      return this.err(n, 'bad-slot', `sound slot '${slotText}' must be a whole number from ${SLOT_MIN} to ${SLOT_MAX}`)
    }
    const label = padLabel(d.group, pad.offset)
    const old = d.sounds.get(pad.offset)
    if (old !== undefined)
      this.warn(n, 'duplicate-sound', `${label} already has a sound on line ${old.line}; the later line is kept`)
    d.sounds.set(pad.offset, {
      group: GROUPS[d.group]!,
      pad: label,
      offset: pad.offset,
      slot: Number(slotText),
      name: cleanText(rest.slice(slotText.length)),
      line: n,
    })
  }

  // -- effect lines (header only) -------------------------------------------

  /** fx / send / comp / sidechain; [t] are the words after [word]. A line with a fault changes nothing. */
  private fxLine(n: number, word: string, key: string, t: string[]): void {
    const extra = (from: number): void => {
      if (t.length > from) this.warn(n, 'fx-extra', `the ${word} line has extra words from '${t[from]}'; ignored`)
    }
    const once = (kind: string, msg: string): void => {
      if (this.fxSeen.has(kind)) this.warn(n, `duplicate-${kind}`, msg)
      this.fxSeen.add(kind)
    }
    if (key === 'fx') {
      const effect = t.length > 0 ? FX_TYPES.find((e) => e === t[0]!.toLowerCase()) : undefined
      if (effect === undefined) {
        return this.err(
          n,
          'bad-fx',
          t.length === 0 ? `fx needs an effect: ${FX_LIST}` : `'${t[0]}' is not an effect: use ${FX_LIST}`,
        )
      }
      const knobs = [FX_KNOB, FX_KNOB]
      for (const [i, knob] of [
        [1, 'x'],
        [2, 'y'],
      ] as const) {
        if (t.length <= i) continue
        const value = percent(t[i]!)
        if (value === null) return this.err(n, 'bad-fx-value', `fx ${knob} '${t[i]}' must be ${PERCENT_TEXT}`)
        knobs[i - 1] = value
      }
      extra(3)
      once('fx', 'two fx lines; the later is kept')
      this.fx = { type: effect, x: knobs[0]!, y: knobs[1]! }
    } else if (key === 'send') {
      if (t.length === 0) {
        return this.err(
          n,
          'bad-send',
          "a send line looks like 'send A 40 B 20': a group, then 0 to 100, as often as needed",
        )
      }
      const line: Record<string, number> = {}
      for (let i = 0; i < t.length; i += 2) {
        const g = t[i]!
        if (g.length !== 1 || !GROUPS.includes(g)) return this.err(n, 'bad-send', `'${g}' is not a group: use A to D`)
        const value = t[i + 1]
        if (value === undefined) return this.err(n, 'bad-send', `send ${g} needs a value, ${PERCENT_TEXT}`)
        const level = percent(value)
        if (level === null) return this.err(n, 'bad-send', `send ${g} '${value}' must be ${PERCENT_TEXT}`)
        line[g] = level
      }
      // Send lines add up; a group given twice keeps its later value. Kept in group order.
      const sends: Record<string, number> = { ...this.sends, ...line }
      this.sends = Object.fromEntries([...GROUPS].flatMap((g) => (g in sends ? [[g, sends[g]!]] : [])))
    } else if (key === 'comp') {
      if (t.length === 0) {
        return this.err(n, 'bad-comp', "a comp line looks like 'comp off' or 'comp 40 60': a drive and a speed")
      }
      let comp: BeatCardComp | 'off' = 'off'
      if (t[0]!.toLowerCase() === 'off') extra(1)
      else {
        const drive = percent(t[0]!)
        if (drive === null) {
          return this.err(n, 'bad-comp', `comp drive '${t[0]}' must be ${PERCENT_TEXT}, or use comp off`)
        }
        if (t.length < 2) return this.err(n, 'bad-comp', "comp needs a speed after the drive, like 'comp 40 60'")
        const speed = percent(t[1]!)
        if (speed === null) return this.err(n, 'bad-comp', `comp speed '${t[1]}' must be ${PERCENT_TEXT}`)
        extra(2)
        comp = { drive, speed }
      }
      once('comp', 'two comp lines; the later is kept')
      this.comp = comp
    } else {
      if (t.length === 0) {
        return this.err(
          n,
          'bad-sidechain',
          "a sidechain line looks like 'sidechain off' or 'sidechain A7 BC': the pad, then the groups it ducks",
        )
      }
      let side: BeatCardSidechain | 'off' = 'off'
      if (t[0]!.toLowerCase() === 'off') extra(1)
      else {
        const pad = parsePad(t[0]!)
        if (typeof pad === 'string') return this.err(n, 'bad-pad', pad)
        if (t.length < 2) {
          return this.err(n, 'bad-sidechain', `sidechain ${t[0]} needs the groups it ducks, like 'sidechain A7 BC'`)
        }
        if (!/^[A-D]+$/.test(t[1]!)) {
          return this.err(n, 'bad-sidechain', `sidechain groups '${t[1]}' must be the letters A to D, like BC`)
        }
        const knobs = [SIDECHAIN_LENGTH, SIDECHAIN_SHAPE]
        for (const [i, knob] of [
          [2, 'length'],
          [3, 'shape'],
        ] as const) {
          if (t.length <= i) continue
          const value = percent(t[i]!)
          if (value === null) return this.err(n, 'bad-sidechain', `sidechain ${knob} '${t[i]}' must be ${PERCENT_TEXT}`)
          knobs[i - 2] = value
        }
        extra(4)
        side = {
          pad: padLabel(pad.group, pad.offset),
          group: GROUPS[pad.group]!,
          offset: pad.offset,
          note: note(pad),
          groups: [...GROUPS].filter((g) => t[1]!.includes(g)),
          length: knobs[0]!,
          shape: knobs[1]!,
        }
      }
      once('sidechain', 'two sidechain lines; the later is kept')
      this.sidechain = side
    }
  }

  // -- pad lines ------------------------------------------------------------

  /** pad <pad> [pitch n] [level n] [pan n] [attack n] [release n] [mode m]. A second line for a pad merges into the first. */
  private padLine(n: number, text: string): void {
    const d = this.current!
    const t = tokens(text)
    if (t.length < 2)
      return this.err(n, 'bad-pad-line', "a pad line looks like 'pad A7 pitch -7 level 90': the pad, then its settings")
    const pad = parsePad(t[1]!)
    if (typeof pad === 'string') return this.err(n, 'bad-pad', pad)
    if (pad.group !== d.group) {
      return this.err(
        n,
        'wrong-group',
        `pad ${t[1]} is in group ${GROUPS[pad.group]} but the section is [${GROUPS[d.group]}]`,
      )
    }
    const label = padLabel(d.group, pad.offset)
    // The line's settings; one written twice keeps the later value.
    const given: Record<string, number | string> = {}
    let i = 2
    while (i < t.length) {
      const word = t[i]!.toLowerCase()
      const value = t[i + 1]
      if (!PAD_SETTINGS.includes(word)) {
        this.warn(
          n,
          'unknown-pad-setting',
          `unknown setting '${t[i]}' on the ${label} pad line ignored (use ${PAD_SETTINGS.join(', ')})`,
        )
        i += value !== undefined && !PAD_SETTINGS.includes(value.toLowerCase()) ? 2 : 1
        continue
      }
      if (value === undefined) return this.err(n, 'bad-pad-line', `${label} pad: ${word} needs a value`)
      if (word === 'pitch') {
        if (!PITCH.test(value) || Math.abs(Number(value)) > 12) {
          return this.err(
            n,
            'bad-pad-line',
            `${label} pad: pitch '${value}' must be -12 to 12 semitones, whole or with up to two decimals`,
          )
        }
      } else if (word === 'mode') {
        if (!PLAY_MODES.includes(value.toLowerCase())) {
          return this.err(n, 'bad-pad-line', `${label} pad: mode '${value}' must be oneshot, key or legato`)
        }
      } else {
        const [low, high] = word === 'level' ? [0, 100] : word === 'pan' ? [-16, 16] : [0, 255]
        if (!SIGNED.test(value) || Number(value) < low || Number(value) > high) {
          const left = word === 'pan' ? ', negative is left' : ''
          return this.err(
            n,
            'bad-pad-line',
            `${label} pad: ${word} '${value}' must be a whole number from ${low} to ${high}${left}`,
          )
        }
      }
      // + 0 turns -0 into 0.
      given[word] = word === 'mode' ? value.toLowerCase() : Number(value) + 0
      i += 2
    }
    if (Object.keys(given).length === 0) {
      return this.err(
        n,
        'bad-pad-line',
        `${label} pad: give at least one of pitch, level, pan, attack, release or mode`,
      )
    }
    const before = d.pads.get(pad.offset)
    if (before !== undefined) {
      this.warn(
        n,
        'duplicate-pad-line',
        `${label} already has a pad line on line ${before.line}; merged, the later settings win`,
      )
    }
    const settings: Record<string, number | string | undefined> = { ...before, ...given }
    // Leaving oneshot sets the release to the key default, unless the line gives one.
    const leaves = given.mode !== undefined && given.mode !== 'oneshot' && (before?.mode ?? 'oneshot') === 'oneshot'
    if (leaves && given.release === undefined) settings.release = KEY_RELEASE
    d.pads.set(pad.offset, {
      group: GROUPS[d.group]!,
      pad: label,
      offset: pad.offset,
      note: note(pad),
      ...Object.fromEntries(PAD_SETTINGS.flatMap((k) => (settings[k] !== undefined ? [[k, settings[k]]] : []))),
      line: n,
    })
  }

  // -- notes list -----------------------------------------------------------

  private note(n: number, text: string): void {
    const d = this.current!
    const t = tokens(text)
    const pad = parsePad(t[0]!)
    if (typeof pad === 'string') return this.err(n, 'bad-pad', pad)
    if (pad.group !== d.group) {
      return this.err(
        n,
        'wrong-group',
        `pad ${t[0]} is in group ${GROUPS[pad.group]} but the section is [${GROUPS[d.group]}]`,
      )
    }
    let tick: number | null = null
    let tickKey = ''
    let vel = 127
    let gate = 24
    let semi: number | null = null
    let semiKey = ''
    let i = 1
    while (i < t.length) {
      const word = t[i]!.toLowerCase()
      const value = t[i + 1]
      if (!NOTE_KEYS.includes(word)) {
        this.warn(
          n,
          'unknown-note-option',
          `unknown option '${t[i]}' in a note ignored (use at, t, vel, gate, note, semi)`,
        )
        i += value !== undefined && !NOTE_KEYS.includes(value.toLowerCase()) ? 2 : 1
        continue
      }
      if (value === undefined) return this.err(n, 'missing-value', `'${word}' needs a value`)
      if (word === 'at' || word === 't') {
        if (tickKey && tickKey !== word) return this.err(n, 'note-two-times', "give 'at' or 't', not both")
        tickKey = word
        if (word === 't') {
          if (!DIGITS.test(value)) return this.err(n, 'bad-tick', `t '${value}' must be a whole tick number from 0`)
          tick = Number(value)
        } else {
          tick = this.atTick(n, value)
          if (tick === null) return
        }
      } else if (word === 'vel') {
        if (!(DIGITS.test(value) && Number(value) >= 1 && Number(value) <= 127)) {
          return this.err(n, 'bad-vel', `vel '${value}' must be 1 to 127`)
        }
        vel = Number(value)
      } else if (word === 'gate') {
        const named = GATE_TICKS[value.toUpperCase()]
        if (named !== undefined) gate = named
        else if (DIGITS.test(value) && Number(value) >= 1) gate = Number(value)
        else {
          return this.err(
            n,
            'bad-gate',
            `gate '${value}' must be a number of ticks or one of 1/4 1/8 1/16 1/32 1/8T 1/16T`,
          )
        }
      } else if (word === 'note') {
        if (semiKey === 'semi') return this.err(n, 'note-and-semi', "give 'note' or 'semi', not both")
        semiKey = 'note'
        const midi = NOTE_NUMBERS.get(value)
        if (midi === undefined) {
          return this.err(n, 'bad-note-name', `note '${value}' must be C-1 to G9 with a capital letter, sharps as C#4`)
        }
        semi = midi - KEYS_ROOT
      } else {
        if (semiKey === 'note') return this.err(n, 'note-and-semi', "give 'note' or 'semi', not both")
        semiKey = 'semi'
        if (!(SIGNED.test(value) && Math.abs(Number(value)) <= 127)) {
          return this.err(n, 'bad-semi', `semi '${value}' must be a whole number from -127 to 127`)
        }
        semi = Number(value)
      }
      i += 2
    }
    if (tick === null) return this.err(n, 'note-no-time', "a note needs 'at <bar>.<beat>.<sixteenth>' or 't <tick>'")
    const length = d.bars * TICKS_PER_BAR
    if (tick < 0 || tick >= length) {
      const bars = plural(d.bars, 'bar')
      return this.err(n, 'note-out-of-pattern', `tick ${tick} is outside the pattern (0 to ${length - 1} for ${bars})`)
    }
    const midi = semi === null ? null : KEYS_ROOT + semi
    d.notes.push({
      group: GROUPS[d.group]!,
      pad: padLabel(d.group, pad.offset),
      offset: pad.offset,
      note: note(pad),
      tick,
      vel,
      gate,
      semi,
      key: midi !== null && midi >= 0 && midi <= 127 ? noteName(midi) : null,
      line: n,
    })
    d.hits.push({ offset: pad.offset, tick, vel, semi, line: n })
  }

  /** The tick of bar.beat.sixteenth with its leftover +n or -n ticks; null, after an error, when it isn't one. */
  private atTick(n: number, value: string): number | null {
    const m = AT.exec(value)
    if (!m) {
      this.err(n, 'bad-at', `at '${value}' must look like 1.2.3 (bar.beat.sixteenth), with +n or -n ticks if needed`)
      return null
    }
    const bar = Number(m[1])
    const beat = Number(m[2])
    const sixteenth = Number(m[3])
    if (bar < 1 || beat < 1 || beat > 4 || sixteenth < 1 || sixteenth > 4) {
      this.err(n, 'bad-at', `at '${value}': the bar counts from 1, and the beat and the sixteenth are 1 to 4`)
      return null
    }
    const delta = Number(m[5] ?? 0) * (m[4] === '-' ? -1 : 1)
    return (bar - 1) * TICKS_PER_BAR + (beat - 1) * TICKS_PER_BEAT + (sixteenth - 1) * 24 + delta
  }
}

function percent(token: string): number | null {
  return PERCENT.test(token) && Number(token) <= 100 ? Number(token) : null
}

function countMessage(label: string, chunks: string[], total: number, perBar: number, bars: number): string {
  const lengths = chunks.map((c) => [...c].length)
  if (lengths.length === bars && lengths.some((l) => l !== perBar)) {
    const bad = lengths.flatMap((l, i) => (l !== perBar ? [`bar ${i + 1} has ${l}`] : []))
    return `row ${label}: ${bad.join(', ')} steps, needs ${perBar} a bar`
  }
  const need = bars * perBar
  const of = `${plural(bars, 'bar')} of ${perBar}`
  if (total < need)
    return `row ${label} has ${total} steps, needs ${need} (${of}): bar ${Math.floor(total / perBar) + 1} is short`
  return `row ${label} has ${total} steps, needs ${need} (${of}): ${total - need} too many, starting in bar ${bars + 1}`
}

/** Reads an ARC BEAT card from [text] (a whole chat reply works: text before the ARC BEAT line is ignored). */
export function parseBeatCard(text: string): BeatCardResult {
  const r = new Reader(text)
  r.read()
  // Stable, as beatcard.py and Arc's reader sort them.
  const problems = [...r.problems].sort((a, b) => a.p.line - b.p.line)
  const errors = problems.filter((x) => x.error).map((x) => x.p)
  const groups = r.kept.map((d): BeatCardGroup => {
    const stepTicks = STEP_TICKS[d.step]
    const stepsPerBar = TICKS_PER_BAR / stepTicks
    return {
      group: GROUPS[d.group]!,
      index: d.group,
      number: d.number,
      line: d.line,
      bars: d.bars,
      step: d.step,
      stepTicks,
      stepsPerBar,
      steps: d.bars * stepsPerBar,
      triplet: d.step.endsWith('T'),
      swings: SWING_STEPS.includes(d.step),
      length: d.bars * TICKS_PER_BAR,
      rows: d.rows,
    }
  })
  return {
    valid: errors.length === 0,
    errors,
    warnings: problems.filter((x) => !x.error).map((x) => x.p),
    name: r.name,
    tempo: r.tempo,
    swing: r.swing,
    groups,
    notes: r.kept.flatMap((d) => d.notes),
    sounds: r.kept.flatMap((d) => [...d.sounds.values()].sort((a, b) => a.line - b.line)),
    pads: r.kept.flatMap((d) => [...d.pads.values()]),
    fx: r.fx,
    sends: r.sends,
    comp: r.comp,
    sidechain: r.sidechain,
    scenes: Math.max(1, r.sceneCount),
  }
}

// ---------------------------------------------------------------------------
// Plain-text summary
// ---------------------------------------------------------------------------

/** A velocity as a card writes it: X 127, x 100, o 64, else the digit for 14 * n. */
function velChar(vel: number): string {
  if (vel === 127) return 'X'
  if (vel === 100) return 'x'
  if (vel === 64) return 'o'
  return String(Math.max(1, Math.min(9, Math.round(vel / 14))))
}

/** A row's steps grouped by beat (by 4 when a beat isn't whole steps), | between bars, as beatcard.py's grid. */
function rowText(g: BeatCardGroup, row: BeatCardRow): string {
  const cells: string[] = []
  let held = 0
  for (let k = 0; k < g.steps; k++) {
    const v = row.vel[k] ?? 0
    if (v > 0) {
      cells.push(velChar(v))
      held = (row.len[k] ?? 1) - 1
    } else if (held > 0) {
      cells.push('-')
      held--
    } else cells.push('.')
  }
  const per = TICKS_PER_BEAT % g.stepTicks === 0 ? TICKS_PER_BEAT / g.stepTicks : 4
  let text = ''
  cells.forEach((c, k) => {
    if (k && k % g.stepsPerBar === 0) text += ' | '
    else if (k && k % per === 0) text += ' '
    text += c
  })
  return text
}

const problemText = (p: BeatCardProblem): string => `line ${p.line}: ${p.msg}`

/** The effect lines as one line, "reverb 60 40 · send A 20 B 40 · comp 40 60 · sidechain A7 ducks B C"; '' for none. */
function fxText(result: BeatCardResult): string {
  const parts: string[] = []
  if (result.fx !== null) parts.push(`${result.fx.type} ${result.fx.x} ${result.fx.y}`)
  if (result.sends !== null) {
    parts.push(`send ${Object.entries(result.sends).map(([g, level]) => `${g} ${level}`).join(' ')}`)
  }
  if (result.comp !== null) {
    parts.push(result.comp === 'off' ? 'comp off' : `comp ${result.comp.drive} ${result.comp.speed}`)
  }
  const side = result.sidechain
  if (side === 'off') parts.push('sidechain off')
  else if (side !== null) {
    // Length and shape only when the line changed them from 30 and 50.
    const knobs =
      side.length !== SIDECHAIN_LENGTH || side.shape !== SIDECHAIN_SHAPE
        ? `, length ${side.length} shape ${side.shape}`
        : ''
    parts.push(`sidechain ${side.pad} ducks ${side.groups.join(' ')}${knobs}`)
  }
  return parts.join(' · ')
}

/**
 * How much of a long card the summary lists: at most [problems] errors and as
 * many warnings, and [notes] notes of each section, then a line saying how
 * many more there are. The counts stay whole. No limit by default.
 */
export interface SummaryLimits {
  readonly problems?: number
  readonly notes?: number
}

/** The first [max] lines of [lines], then "… and 3 more errors" for the rest. */
function capped(lines: readonly string[], max: number, what: string, indent = ''): string[] {
  if (lines.length <= max) return [...lines]
  return [...lines.slice(0, max), `${indent}… and ${plural(lines.length - max, `more ${what}`)}`]
}

/** The card as plain text: a heading, each section's grid, notes and sounds, then the problems by line. */
export function summarizeBeatCard(result: BeatCardResult, limits: SummaryLimits = {}): string {
  const maxProblems = limits.problems ?? Infinity
  const maxNotes = limits.notes ?? Infinity
  const out: string[] = []
  if (!result.valid) {
    out.push(`This card can't be read: ${plural(result.errors.length, 'error')}.`)
    out.push(...capped(result.errors.map(problemText), maxProblems, 'error'))
  } else {
    const head = [result.name ? `"${result.name}"` : 'ARC BEAT card']
    if (result.tempo !== null) head.push(`${result.tempo} BPM`)
    head.push(`swing ${result.swing}`)
    if (result.scenes > 1) head.push(`${result.scenes} scenes, the first shown`)
    out.push(head.join(', '))
    const fx = fxText(result)
    if (fx) out.push(`FX: ${fx}`)
    for (const g of result.groups) {
      const number = g.number !== null ? String(g.number).padStart(2, '0') : ''
      const swung = g.swings && result.swing > 50 ? ', swung' : ''
      out.push('')
      out.push(`[${g.group}${number}] ${plural(g.bars, 'bar')}, step ${g.step} (${g.stepsPerBar} steps a bar)${swung}`)
      for (const s of result.sounds.filter((s) => s.group === g.group)) {
        out.push(`sound ${s.pad} ${s.slot}${s.name ? ` ${s.name}` : ''}`)
      }
      for (const p of result.pads.filter((p) => p.group === g.group)) {
        const settings = PAD_SETTINGS.flatMap((k) => {
          const value = p[k as keyof BeatCardPad]
          return value !== undefined ? [`${k} ${value}`] : []
        })
        out.push(`pad ${p.pad}: ${settings.join(', ')}`)
      }
      const names = g.rows.map((row) => `${row.pad} ${row.label}`.trimEnd())
      const width = Math.max(4, ...names.map((x) => x.length))
      g.rows.forEach((row, i) => out.push(`${names[i]!.padEnd(width)}  ${rowText(g, row)}`))
      const notes = result.notes.filter((x) => x.group === g.group)
      if (notes.length > 0) {
        out.push('notes:')
        const lines = notes.map((x) => {
          const what = x.semi === null ? 'pad hit' : `KEYS ${x.key ?? `semi ${x.semi}`}`
          return `  ${x.pad} at ${position(x.tick)}  vel ${x.vel}  gate ${x.gate} ticks  ${what}`
        })
        out.push(...capped(lines, maxNotes, 'note', '  '))
      }
    }
  }
  if (result.warnings.length > 0) {
    out.push('')
    out.push(`${plural(result.warnings.length, 'warning')}:`)
    out.push(...capped(result.warnings.map(problemText), maxProblems, 'warning'))
  }
  return out.join('\n')
}
