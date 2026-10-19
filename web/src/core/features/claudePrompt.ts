// Port of core/src/main/kotlin/dev/arc/ep133/features/ClaudePrompt.kt
//
// The Claude page's prompt builder (an addition): the arc-beats skill's
// genres, the tasks and the choices a prompt's sentence shows, and how a
// prompt and the saved ones are kept in the settings.
//
// Web deltas:
// - The enum classes are const objects plus string-union types of the same
//   name (the values are the enum names, so they persist as the same
//   strings); `X.entries` is the X_ENTRIES-style array beside each
//   (GENRE_FAMILIES, PROMPT_TASKS...), in declaration order.
// - Genre and the data classes are plain readonly interfaces built by
//   `genre()`, `claudePrompt()` and `savedPrompt()` with the Kotlin defaults
//   (the named arguments are an options object); Kotlin's `copy` is a spread.
//   Genre.ep40 is a field set as it is built.
// - Kotlin's IntRange (Genre.tempo, TEMPOS) is an inclusive {first, last}.
// - ClaudePrompt's members are functions of `ClaudePrompt` taking the prompt
//   first; `ClaudePrompt.equals` is the data class equals (feels in order, the
//   parts as a set, the kit by identity).
// - decode reads ASCII digits only where Kotlin's toIntOrNull reads any
//   Unicode decimal ones; encode writes nothing else.

import { FactoryKit } from './factorySounds'
import { Tempo } from './tempo'

/** An inclusive range of whole numbers (Kotlin IntRange). */
export interface IntRange {
  readonly first: number
  readonly last: number
}

const range = (first: number, last: number): IntRange => Object.freeze({ first, last })

const inRange = (n: number, r: IntRange): boolean => n >= r.first && n <= r.last

/** The families the prompt builder's genres are grouped in, in the order its keys show them. */
export const GenreFamily = {
  HOUSE: 'HOUSE',
  TECHNO: 'TECHNO',
  HIP_HOP: 'HIP_HOP',
  BREAKS: 'BREAKS',
  BASS: 'BASS',
  CLUB: 'CLUB',
  CHILL: 'CHILL',
  RIDDIM: 'RIDDIM',
} as const
export type GenreFamily = (typeof GenreFamily)[keyof typeof GenreFamily]
export const GENRE_FAMILIES: readonly GenreFamily[] = Object.freeze(Object.values(GenreFamily))

/**
 * A recipe of the arc-beats skill's genres.md the prompt builder offers: its
 * heading there ([name]; the EP-40's without " (EP-40)"), the word on its key
 * ([short]), how a prompt says it ([words]), its `BPM:` range and its card's
 * tempo ([bpm]). The skill's test of genres.md and this list's own keep them
 * the same.
 */
export interface Genre {
  readonly id: string
  readonly name: string
  readonly family: GenreFamily
  readonly tempo: IntRange
  readonly bpm: number
  readonly short: string
  readonly words: string
  /** One of the EP-40 Riddim kit's recipes (genres.md's "(EP-40)" ones). */
  readonly ep40: boolean
}

export function genre(
  id: string,
  name: string,
  family: GenreFamily,
  tempo: IntRange,
  bpm: number,
  short: string = name,
  words: string = name.toLowerCase(),
): Genre {
  return Object.freeze({ id, name, family, tempo, bpm, short, words, ep40: family === GenreFamily.RIDDIM })
}

const { HOUSE, TECHNO, HIP_HOP, BREAKS, BASS, CLUB, CHILL, RIDDIM } = GenreFamily

const ALL: readonly Genre[] = Object.freeze([
  genre('house', 'House', HOUSE, range(120, 128), 124),
  genre('deep-house', 'Deep house', HOUSE, range(118, 124), 122, 'Deep'),
  genre('tech-house', 'Tech house', HOUSE, range(124, 128), 126, 'Tech'),
  genre('hip-house', 'Hip-house', HOUSE, range(112, 124), 118),
  genre('disco', 'Disco and nu-disco', HOUSE, range(112, 122), 118, 'Disco', 'disco'),
  genre('afro-house', 'Afro house', HOUSE, range(118, 124), 122, 'Afro', 'Afro house'),
  genre('amapiano', 'Amapiano', HOUSE, range(108, 115), 112),
  genre('techno', 'Techno', TECHNO, range(126, 138), 132),
  genre('detroit', 'Detroit techno', TECHNO, range(125, 132), 128, 'Detroit', 'Detroit techno'),
  genre('minimal', 'Minimal techno', TECHNO, range(124, 130), 127, 'Minimal'),
  genre('dub-techno', 'Dub techno', TECHNO, range(118, 126), 122, 'Dub'),
  genre('acid', 'Acid techno', TECHNO, range(135, 150), 142, 'Acid'),
  genre('hypnotic', 'Hypnotic techno', TECHNO, range(128, 136), 132, 'Hypnotic'),
  genre('peak-time', 'Peak-time techno', TECHNO, range(130, 138), 134, 'Peak-time'),
  genre('melodic', 'Melodic techno', TECHNO, range(120, 126), 122, 'Melodic'),
  genre('industrial', 'Industrial techno', TECHNO, range(130, 140), 136, 'Industrial'),
  genre('hard-techno', 'Hard techno', TECHNO, range(145, 160), 152, 'Hard'),
  genre('schranz', 'Schranz', TECHNO, range(150, 160), 152),
  genre('hard-groove', 'Hard groove', TECHNO, range(135, 145), 140),
  genre('boom-bap', 'Boom bap', HIP_HOP, range(84, 96), 90),
  genre('lo-fi', 'Lo-fi', HIP_HOP, range(70, 86), 76),
  genre('trap', 'Trap', HIP_HOP, range(130, 150), 140),
  genre('drill', 'Drill', HIP_HOP, range(138, 146), 142),
  genre('phonk', 'Phonk', HIP_HOP, range(130, 150), 140),
  genre('g-funk', 'G-funk', HIP_HOP, range(88, 100), 94, 'G-funk', 'G-funk'),
  genre('dnb', 'Drum and bass', BREAKS, range(170, 176), 174, 'DnB'),
  genre('liquid', 'Liquid drum and bass', BREAKS, range(170, 176), 174, 'Liquid'),
  genre('jungle', 'Jungle', BREAKS, range(160, 170), 166),
  genre('breakcore', 'Breakcore', BREAKS, range(160, 200), 180),
  genre('breakbeat', 'Breakbeat', BREAKS, range(120, 135), 126),
  genre('electro', 'Electro', BREAKS, range(125, 135), 128),
  genre('uk-garage', 'UK garage', BASS, range(130, 136), 132, 'Garage', 'UK garage'),
  genre('bassline', 'Bassline', BASS, range(135, 140), 137),
  genre('uk-funky', 'UK funky', BASS, range(128, 132), 130, 'UK funky', 'UK funky'),
  genre('grime', 'Grime', BASS, range(138, 142), 140),
  genre('dubstep', 'Dubstep', BASS, range(138, 142), 140),
  genre('halftime', 'Halftime', BASS, range(80, 88), 85),
  genre('jersey-club', 'Jersey club', CLUB, range(130, 140), 135, 'Jersey', 'Jersey club'),
  genre('footwork', 'Footwork', CLUB, range(155, 165), 160),
  genre('dembow', 'Reggaeton and dembow', CLUB, range(88, 98), 94, 'Dembow', 'reggaeton or dembow'),
  genre('moombahton', 'Moombahton', CLUB, range(108, 112), 110, 'Moombah'),
  genre('baile-funk', 'Baile funk', CLUB, range(125, 135), 130, 'Baile'),
  genre('afrobeats', 'Afrobeats', CLUB, range(98, 112), 104, 'Afrobeats', 'Afrobeats'),
  genre('pop-rock', 'Pop and rock backbeat', CLUB, range(90, 130), 100, 'Pop/rock', 'pop or rock backbeat'),
  genre('trip-hop', 'Trip-hop', CHILL, range(84, 96), 90),
  genre('downtempo', 'Downtempo', CHILL, range(95, 110), 100),
  genre('neo-soul', 'Neo-soul', CHILL, range(80, 95), 88),
  genre('synthwave', 'Synthwave', CHILL, range(100, 118), 110),
  genre('one-drop', 'One drop', RIDDIM, range(70, 80), 76),
  genre('rockers', 'Rockers', RIDDIM, range(75, 85), 80),
  genre('steppers', 'Steppers', RIDDIM, range(72, 84), 78),
  genre('dub', 'Dub', RIDDIM, range(65, 78), 72),
  genre('digital', 'Digital riddim', RIDDIM, range(90, 100), 96, 'Digital'),
  genre('dancehall', 'Dancehall', RIDDIM, range(96, 110), 104),
  genre('uk-dub', 'UK dub', RIDDIM, range(135, 145), 140, 'UK dub', 'UK dub'),
])

export const Genres = {
  ALL,

  of(id: string | null | undefined): Genre | null {
    return ALL.find((g) => g.id === id) ?? null
  },

  inFamily(family: GenreFamily): Genre[] {
    return ALL.filter((g) => g.family === family)
  },
} as const

/** What the prompt asks Claude for: the Claude page's tabs. */
export const PromptTask = { BEAT: 'BEAT', IMPROVE: 'IMPROVE', TRACK: 'TRACK', PLAY: 'PLAY', LEARN: 'LEARN' } as const
export type PromptTask = (typeof PromptTask)[keyof typeof PromptTask]
export const PROMPT_TASKS: readonly PromptTask[] = Object.freeze(Object.values(PromptTask))

/** A word of the prompt's sentence that can be changed (tapped on the glass). */
export const PromptSlot = {
  BARS: 'BARS',
  FEEL: 'FEEL',
  GENRE: 'GENRE',
  TEMPO: 'TEMPO',
  KIT: 'KIT',
  PARTS: 'PARTS',
  GOAL: 'GOAL',
  EDITS: 'EDITS',
  LENGTH: 'LENGTH',
  START: 'START',
  LESSON: 'LESSON',
  WAY: 'WAY',
  LEVEL: 'LEVEL',
  SPEED: 'SPEED',
} as const
export type PromptSlot = (typeof PromptSlot)[keyof typeof PromptSlot]
export const PROMPT_SLOTS: readonly PromptSlot[] = Object.freeze(Object.values(PromptSlot))

/**
 * A feel word before the genre ("dreamy lo-fi"): the skill's genres.md turns
 * each into changes to the recipe (tempo within its range, swing, density,
 * harmony, FX); a prompt takes up to [ClaudePrompt.MAX_FEELS].
 */
export const Feel = {
  DREAMY: 'DREAMY',
  DARK: 'DARK',
  UPLIFTING: 'UPLIFTING',
  LAID_BACK: 'LAID_BACK',
  DRIVING: 'DRIVING',
  AGGRESSIVE: 'AGGRESSIVE',
  DUSTY: 'DUSTY',
  GRITTY: 'GRITTY',
  SPACIOUS: 'SPACIOUS',
  MINIMAL: 'MINIMAL',
  BOUNCY: 'BOUNCY',
  HYPNOTIC: 'HYPNOTIC',
} as const
export type Feel = (typeof Feel)[keyof typeof Feel]
export const FEELS: readonly Feel[] = Object.freeze(Object.values(Feel))

/** How a PLAY prompt wants the card taught: finger drumming, step entry, performing it, or its KEYS parts. */
export const PlayWay = { FINGERS: 'FINGERS', STEPS: 'STEPS', PERFORM: 'PERFORM', KEYS: 'KEYS' } as const
export type PlayWay = (typeof PlayWay)[keyof typeof PlayWay]
export const PLAY_WAYS: readonly PlayWay[] = Object.freeze(Object.values(PlayWay))

/** Who a PLAY prompt teaches: a beginner, someone with some practice, someone sure on the pads. */
export const PlayLevel = { NEW: 'NEW', SOME: 'SOME', SURE: 'SURE' } as const
export type PlayLevel = (typeof PlayLevel)[keyof typeof PlayLevel]
export const PLAY_LEVELS: readonly PlayLevel[] = Object.freeze(Object.values(PlayLevel))

/** What an IMPROVE prompt asks for besides the edits ([BETTER]: nothing more, as the plain share asks). */
export const PromptGoal = {
  BETTER: 'BETTER',
  DRIVE: 'DRIVE',
  LAID_BACK: 'LAID_BACK',
  BUSIER: 'BUSIER',
  SPARSER: 'SPARSER',
  SWING: 'SWING',
  FILL: 'FILL',
  BASS: 'BASS',
  MELODY: 'MELODY',
} as const
export type PromptGoal = (typeof PromptGoal)[keyof typeof PromptGoal]
export const PROMPT_GOALS: readonly PromptGoal[] = Object.freeze(Object.values(PromptGoal))

/** The parts a new beat gets besides its drums. */
export const PromptPart = { BASS: 'BASS', CHORDS: 'CHORDS', LEAD: 'LEAD', FILL: 'FILL', FX: 'FX' } as const
export type PromptPart = (typeof PromptPart)[keyof typeof PromptPart]
export const PROMPT_PARTS: readonly PromptPart[] = Object.freeze(Object.values(PromptPart))

/** What a prompt's card is: the scene playing, the shown group's pattern, or the chain. */
export const SharePick = { SCENE: 'SCENE', PATTERN: 'PATTERN', CHAIN: 'CHAIN' } as const
export type SharePick = (typeof SharePick)[keyof typeof SharePick]
export const SHARE_PICKS: readonly SharePick[] = Object.freeze(Object.values(SharePick))

/**
 * The Claude page's prompt (an addition): its [task] and the choices its
 * sentence shows. [kit] null is the kit Live plays; [genre] null is any style
 * (an IMPROVE keeps its own); [tempo] null leaves it to Claude; [fromPick] has
 * a TRACK continue the card SHARE picks; [text] is the prompt as edited by
 * hand, null while it is built from the rest.
 */
export interface ClaudePrompt {
  readonly task: PromptTask
  readonly bars: number
  /** The feel words before the genre, in the order picked (the first leads). */
  readonly feels: readonly Feel[]
  readonly genre: string | null
  readonly tempo: number | null
  readonly kit: FactoryKit | null
  readonly parts: ReadonlySet<PromptPart>
  readonly goal: PromptGoal
  readonly edits: number
  readonly length: number
  readonly fromPick: boolean
  readonly lesson: number
  readonly way: PlayWay
  readonly level: PlayLevel
  /** A PLAY's starting tempo, in percent of the card's ([SPEEDS]). */
  readonly speed: number
  readonly text: string | null
}

export function claudePrompt(p: Partial<ClaudePrompt> = {}): ClaudePrompt {
  return {
    task: p.task ?? PromptTask.IMPROVE,
    bars: p.bars ?? 4,
    feels: p.feels ?? [],
    genre: p.genre ?? null,
    tempo: p.tempo ?? null,
    kit: p.kit ?? null,
    parts: p.parts ?? new Set([PromptPart.BASS]),
    goal: p.goal ?? PromptGoal.BETTER,
    edits: p.edits ?? 3,
    length: p.length ?? 32,
    fromPick: p.fromPick ?? false,
    lesson: p.lesson ?? 1,
    way: p.way ?? PlayWay.FINGERS,
    level: p.level ?? PlayLevel.NEW,
    speed: p.speed ?? 50,
    text: p.text ?? null,
  }
}

const BARS: readonly number[] = Object.freeze([1, 2, 4, 8])
const EDITS: readonly number[] = Object.freeze([1, 3, 5])
const LENGTHS: readonly number[] = Object.freeze([16, 32, 64])
const SPEEDS: readonly number[] = Object.freeze([50, 75, 100])
const MAX_FEELS = 2

/** The lessons of the skill's lessons.md, in order: lesson n is [LESSONS] [n - 1]. */
const LESSONS: readonly string[] = Object.freeze([
  'Meet the pads',
  'Tempo, bars and counting',
  'Record your first loop live',
  'Step by step',
  'Swing and timing',
  'Loud and quiet',
  'Rolls and note repeat',
  'Longer patterns, fills and variation',
  'Bass and melody in KEYS',
  'Scenes and song',
  'Effects and performance',
  'Sampling and chopping',
])

/** A tempo a prompt asks for: the beat card's range. */
const TEMPOS: IntRange = range(Tempo.MIN, Tempo.MAX)

/** The prompt goes with a card ([SharePick]): an IMPROVE, a PLAY, or a TRACK that continues one. */
function withCard(p: ClaudePrompt): boolean {
  return p.task === PromptTask.IMPROVE || p.task === PromptTask.PLAY || (p.task === PromptTask.TRACK && p.fromPick)
}

/** The words its sentence shows, in order (the glass's). */
function slots(p: ClaudePrompt): PromptSlot[] {
  const S = PromptSlot
  switch (p.task) {
    case PromptTask.BEAT:
      return [S.BARS, S.FEEL, S.GENRE, S.TEMPO, S.KIT, S.PARTS]
    case PromptTask.IMPROVE:
      return [S.GOAL, S.GENRE, S.EDITS, S.KIT]
    case PromptTask.TRACK:
      return [S.LENGTH, S.FEEL, S.GENRE, S.TEMPO, S.KIT, S.START]
    case PromptTask.PLAY:
      return [S.WAY, S.LEVEL, S.SPEED]
    case PromptTask.LEARN:
      return [S.LESSON]
  }
}

/** Another task, its own words again (a hand-edited text is for the task it was written for). */
function withTask(p: ClaudePrompt, t: PromptTask): ClaudePrompt {
  return t === p.task ? p : { ...p, task: t, text: null }
}

/** [f] in or out of the feel words; a third one in lets the first go. */
function withFeel(p: ClaudePrompt, f: Feel): ClaudePrompt {
  return { ...p, feels: p.feels.includes(f) ? p.feels.filter((x) => x !== f) : [...p.feels, f].slice(-MAX_FEELS) }
}

/** A genre picked: the tempo follows its recipe's; none (any style) leaves the tempo as it is. */
function withGenre(p: ClaudePrompt, g: Genre | null): ClaudePrompt {
  return { ...p, genre: g?.id ?? null, tempo: g?.bpm ?? p.tempo }
}

/** As kept in the settings: "key=value" pairs separated by ";", the hand-edited text escaped. */
function encode(p: ClaudePrompt): string {
  return [
    `task=${p.task}`,
    `bars=${p.bars}`,
    p.feels.length > 0 ? `feels=${p.feels.join(',')}` : null,
    p.genre !== null ? `genre=${p.genre}` : null,
    p.tempo !== null ? `tempo=${p.tempo}` : null,
    p.kit !== null ? `kit=${p.kit.id}` : null,
    `parts=${PROMPT_PARTS.filter((x) => p.parts.has(x)).join(',')}`,
    `goal=${p.goal}`,
    `edits=${p.edits}`,
    `length=${p.length}`,
    `pick=${p.fromPick}`,
    `lesson=${p.lesson}`,
    `way=${p.way}`,
    `level=${p.level}`,
    `speed=${p.speed}`,
    p.text !== null ? `text=${escape(p.text)}` : null,
  ]
    .filter((x) => x !== null)
    .join(';')
}

// An optional sign then ASCII digits (Kotlin toIntOrNull, see the header).
function intOrNull(s: string | undefined): number | null {
  return s !== undefined && /^[+-]?\d{1,9}$/.test(s) ? Number(s) : null
}

function entryOf<T extends string>(entries: readonly T[], name: string | undefined): T | null {
  return entries.find((e) => e === name) ?? null
}

/** What [encode] wrote; anything missing or unreadable is the default's. */
function decode(s: string): ClaudePrompt {
  const d = claudePrompt()
  const map = new Map<string, string>()
  for (const part of s.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) map.set(part.substring(0, i), part.substring(i + 1))
  }
  const num = (key: string, ok: (n: number) => boolean): number | null => {
    const n = intOrNull(map.get(key))
    return n !== null && ok(n) ? n : null
  }
  const feels = map.get('feels')
  const parts = map.get('parts')
  const pick = map.get('pick')
  const genre = map.get('genre')
  const text = map.has('text') ? unescape(map.get('text')!) : null
  return claudePrompt({
    task: entryOf(PROMPT_TASKS, map.get('task')) ?? d.task,
    bars: num('bars', (n) => BARS.includes(n)) ?? d.bars,
    feels:
      feels !== undefined
        ? [...new Set(feels.split(',').flatMap((n) => entryOf(FEELS, n) ?? []))].slice(0, MAX_FEELS)
        : d.feels,
    genre: genre !== undefined && Genres.of(genre) !== null ? genre : null,
    tempo: num('tempo', (n) => inRange(n, TEMPOS)),
    kit: FactoryKit.ofId(map.get('kit')),
    parts: parts !== undefined ? new Set(parts.split(',').flatMap((n) => entryOf(PROMPT_PARTS, n) ?? [])) : d.parts,
    goal: entryOf(PROMPT_GOALS, map.get('goal')) ?? d.goal,
    edits: num('edits', (n) => EDITS.includes(n)) ?? d.edits,
    length: num('length', (n) => LENGTHS.includes(n)) ?? d.length,
    fromPick: pick === 'true' ? true : pick === 'false' ? false : d.fromPick,
    lesson: num('lesson', (n) => n >= 1 && n <= LESSONS.length) ?? d.lesson,
    way: entryOf(PLAY_WAYS, map.get('way')) ?? d.way,
    level: entryOf(PLAY_LEVELS, map.get('level')) ?? d.level,
    speed: num('speed', (n) => SPEEDS.includes(n)) ?? d.speed,
    text: text !== null && text.trim() !== '' ? text : null,
  })
}

// The text's backslashes, line breaks and the separators (";" between pairs, a new line between saved prompts).
function escape(s: string): string {
  return s.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(';', '\\s')
}

function unescape(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]!
    if (ch === '\\' && i + 1 < s.length) {
      const next = s[i + 1]!
      out += next === 'n' ? '\n' : next === 's' ? ';' : next
      i += 2
    } else {
      out += ch
      i++
    }
  }
  return out
}

/** The data class equals: the feels in order, the parts as a set, the kit by identity. */
function equals(a: ClaudePrompt, b: ClaudePrompt): boolean {
  return (
    a.task === b.task &&
    a.bars === b.bars &&
    a.feels.length === b.feels.length &&
    a.feels.every((f, i) => f === b.feels[i]) &&
    a.genre === b.genre &&
    a.tempo === b.tempo &&
    a.kit === b.kit &&
    a.parts.size === b.parts.size &&
    [...a.parts].every((x) => b.parts.has(x)) &&
    a.goal === b.goal &&
    a.edits === b.edits &&
    a.length === b.length &&
    a.fromPick === b.fromPick &&
    a.lesson === b.lesson &&
    a.way === b.way &&
    a.level === b.level &&
    a.speed === b.speed &&
    a.text === b.text
  )
}

/** The Kotlin `ClaudePrompt`'s members and its companion. */
export const ClaudePrompt = {
  BARS,
  EDITS,
  LENGTHS,
  SPEEDS,
  MAX_FEELS,
  LESSONS,
  TEMPOS,
  withCard,
  slots,
  withTask,
  withFeel,
  withGenre,
  encode,
  decode,
  escape,
  unescape,
  equals,
} as const

/** A prompt kept under SAVED on the Claude page: its [name] (the chip's) and the [prompt]. */
export interface SavedPrompt {
  readonly name: string
  readonly prompt: ClaudePrompt
}

export function savedPrompt(name: string, prompt: ClaudePrompt): SavedPrompt {
  return { name, prompt }
}

/** The most the page keeps. */
const MAX = 12

/** As kept in the settings: one a line, "name=...;" before the prompt's [ClaudePrompt.encode]. */
function encodeAll(list: readonly SavedPrompt[]): string {
  return list.map((s) => `name=${escape(s.name)};` + encode(s.prompt)).join('\n')
}

function decodeAll(s: string): SavedPrompt[] {
  return s
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith('name='))
    .map((line) => {
      const semi = line.indexOf(';')
      const end = semi < 0 ? line.length : semi
      return savedPrompt(unescape(line.substring(5, end)), decode(line.substring(Math.min(end + 1, line.length))))
    })
    .filter((p) => p.name.trim() !== '')
    .slice(0, MAX)
}

/** The Kotlin `SavedPrompt`'s companion. */
export const SavedPrompt = { MAX, encodeAll, decodeAll } as const
