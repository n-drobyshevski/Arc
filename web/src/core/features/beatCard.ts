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

import { Keys } from './keys'
import { LABELS, ROWS, noteName, physicalPad, type PhysicalPad } from './padNotes'
import { Pattern, ProjectSeq, Seq, Timing, TimingSettings, pattern, patternNote, scene, timingTicks, type PatternNote } from './pattern'
import { SceneOps } from './scenes'
import { Steps } from './steps'
import { BEATS_PER_BAR } from './tempo'

/**
 * A beat as an ARC BEAT text card: an optional [name] (up to 40 characters),
 * the [tempo] it is meant for (40 to 240 BPM), the [swing] of its grid rows
 * (50..75, 50 straight, as the device's TIMING) and its [sections], one for
 * each group at most.
 */
export interface BeatCard {
  readonly name: string | null
  readonly tempo: number | null
  readonly swing: number
  readonly sections: readonly CardSection[]
}

export function beatCard(name: string | null = null, tempo: number | null = null, swing: number = TimingSettings.SWING_MIN, sections: readonly CardSection[] = []): BeatCard {
  return { name, tempo, swing, sections }
}

/** One group's pattern on a card: [group] 0..3 (A..D), the pattern [number] 1..99 it was written as (a hint, null when the card gave none) and the [pattern] itself. */
export interface CardSection {
  readonly group: number
  readonly number: number | null
  readonly pattern: Pattern
}

export function cardSection(group: number, number: number | null, pat: Pattern): CardSection {
  return { group, number, pattern: pat }
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
  inNotes: boolean
}

function newDraft(line: number, group: number, number: number | null, bars: number, step: Timing, skip: boolean, dropped: boolean): Draft {
  return { line, group, number, bars, step, skip, dropped, hits: [], inNotes: false }
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
    return { card: sorted.some((p) => p.error) ? null : { name, tempo, swing, sections }, problems: sorted }
  }

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
    if (!d.dropped) sections.push({ group: d.group, number: d.number, pattern: pattern(d.bars, kept.sort(noteOrder)) })
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
    if (line.includes('|') || firstIsPad(line) || key === 'notes') {
      error(no, `'${word}' needs a section first, such as [A].`)
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
 * sound name a row shows after its pad (null for none). With [tidy],
 * velocities are rounded to 127, 100 or 64 (ties up) and gates under a step
 * become a step, for every note, and the card says so in a comment. The text
 * ends in a newline.
 */
function write(card: BeatCard, names: (pad: PhysicalPad) => string | null = () => null, tidy = false): string {
  const swing = TimingSettings.clampSwing(card.swing)
  const out: string[] = []
  out.push(`ARC BEAT ${VERSION}`)
  const title = card.name === null ? '' : cleanText(card.name, MAX_NAME)
  if (title !== '') out.push(`name ${title}`)
  if (card.tempo !== null) out.push(`tempo ${tempoText(card.tempo)}`)
  out.push(`swing ${swing}`)
  if (tidy) out.push(TIDY_COMMENT)
  for (const s of [...card.sections].sort((a, b) => a.group - b.group)) {
    out.push('')
    writeSection(out, s, swing, names, tidy)
  }
  return out.join('\n') + '\n'
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
 * never loses a hit's place to a swing it doesn't fit.
 */
function fromPatterns(name: string | null, tempo: number | null, timingSwing: number, sections: readonly CardSection[]): BeatCard {
  const withNotes = sections.filter((s) => !Pattern.isEmpty(s.pattern))
  const kept = [...(withNotes.length > 0 ? withNotes : sections)].sort((a, b) => a.group - b.group)
  const s = TimingSettings.clampSwing(timingSwing)
  const swing = s > TimingSettings.SWING_MIN && kept.every((x) => fitsSwung(x.pattern, s)) ? s : TimingSettings.SWING_MIN
  return { name, tempo, swing, sections: kept }
}

function fitsSwung(p: Pattern, swing: number): boolean {
  const len = Pattern.lengthTicks(p)
  const count = len / timingTicks(Timing.SIXTEENTH)
  return p.notes.every((n) => n.semitones !== null || n.tick >= len || gridStep(n.tick, Timing.SIXTEENTH, swing, count) !== null)
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
export const BeatCards = { VERSION, MAX_NAME, TIDY_COMMENT, read, hasCard, write, fromPatterns, plan } as const
