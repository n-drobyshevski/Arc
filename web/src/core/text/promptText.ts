// Port of core/src/main/kotlin/dev/arc/ep133/text/PromptText.kt
//
// The Claude page's prompt builder (an addition): the glass's sentence
// ([sentence]), the answers under it, and the prompt it builds ([prompt]) for
// the arc-beats skill. An IMPROVE as it starts asks what the plain share always
// has (ClaudeText.SHARE_PROMPT, SHARE_CHAIN_PROMPT); the kit goes after the
// prompt as ClaudeText.kitLine.
//
// Web deltas:
// - learn() is WebText.learn, which says the Arc web app where the Kotlin says
//   Android (as WebText.LEARN_PROMPT replaces ClaudeText.LEARN_PROMPT).
// - PromptPiece is a plain interface built by `promptPiece()`; its slot is null
//   for plain words.
// - The parts are a ReadonlySet and the feels a readonly array, as ClaudePrompt
//   keeps them.

import {
  ClaudePrompt,
  Genres,
  PROMPT_PARTS,
  PromptGoal,
  PromptSlot,
  PromptTask,
  PlayLevel,
  PlayWay,
  SavedPrompt,
  SharePick,
  savedPrompt,
  type Feel,
  type Genre,
  type GenreFamily,
  type PromptPart,
} from '../features/claudePrompt'
import type { FactoryKit } from '../features/factorySounds'
import { plural } from './format'
import { WebText } from './webText'

/** A piece of the prompt's sentence on the glass: plain words, or the words of a [slot] that a tap changes. */
export interface PromptPiece {
  readonly text: string
  readonly slot: PromptSlot | null
}

export function promptPiece(text: string, slot: PromptSlot | null = null): PromptPiece {
  return { text, slot }
}

/** The glass's tabs, and for screen readers. */
function task(t: PromptTask): string {
  switch (t) {
    case PromptTask.BEAT:
      return 'New beat'
    case PromptTask.IMPROVE:
      return 'Improve'
    case PromptTask.TRACK:
      return 'Track'
    case PromptTask.PLAY:
      return 'Play'
    case PromptTask.LEARN:
      return 'Learn'
  }
}

const SLOTS: Readonly<Record<PromptSlot, string>> = {
  BARS: 'Length',
  FEEL: 'Feel',
  GENRE: 'Genre',
  TEMPO: 'Tempo',
  KIT: 'Kit',
  PARTS: 'Parts',
  GOAL: 'Ask',
  EDITS: 'Edits',
  LENGTH: 'Length',
  START: 'Start',
  LESSON: 'Lesson',
  WAY: 'How',
  LEVEL: 'Level',
  SPEED: 'Start at',
}

const FAMILIES: Readonly<Record<GenreFamily, string>> = {
  HOUSE: 'House',
  BASS: 'Bass',
  CHILL: 'Chill',
  CLUB: 'Club',
  TECHNO: 'Techno',
  HIP_HOP: 'Hip-hop',
  BREAKS: 'Breaks',
  RIDDIM: 'Riddim',
}

// ---------- The sentence's words ----------
const FEEL_WORDS: Readonly<Record<Feel, string>> = {
  DREAMY: 'dreamy',
  DARK: 'dark',
  UPLIFTING: 'uplifting',
  LAID_BACK: 'laid-back',
  DRIVING: 'driving',
  AGGRESSIVE: 'aggressive',
  DUSTY: 'dusty',
  GRITTY: 'gritty',
  SPACIOUS: 'spacious',
  MINIMAL: 'minimal',
  BOUNCY: 'bouncy',
  HYPNOTIC: 'hypnotic',
}

const FEEL_HINTS: Readonly<Record<Feel, string>> = {
  DREAMY: 'Dreamy: long chords, softer hits, an echo on the chords.',
  DARK: 'Dark: minor or Phrygian, a low bass, a sparse top.',
  UPLIFTING: 'Uplifting: major chords, a rising lead, open hats.',
  LAID_BACK: 'Laid-back: slower, more swing, the snare a little late.',
  DRIVING: 'Driving: faster, straight hats, the bass pumping with the kick.',
  AGGRESSIVE: 'Aggressive: accents, rolls, distortion and compression.',
  DUSTY: 'Dusty: swing, uneven hits, a low-pass on everything.',
  GRITTY: 'Gritty: hard accents, crushed sounds, distorted drums.',
  SPACIOUS: 'Spacious: few hits, long notes, a dotted delay.',
  MINIMAL: 'Minimal: three or four pads, small changes.',
  BOUNCY: 'Bouncy: a syncopated kick, swing, an octave-jumping bass.',
  HYPNOTIC: 'Hypnotic: a repeating one-bar motif, three against four.',
}

const feel = (f: Feel): string => FEEL_WORDS[f]

const PLAIN = 'plain'
const feels = (list: readonly Feel[]): string => (list.length === 0 ? PLAIN : list.map(feel).join(', '))

const bars = (n: number): string => `${n}-bar`
const barsKey = (n: number): string => plural(n, 'bar')
const ANY_STYLE = 'any style'
const OWN_STYLE = 'in its own style'
const toward = (g: Genre): string => `toward ${g.words}`
const tempo = (bpm: number): string => `${bpm} BPM`
const ANY_TEMPO = 'any tempo'
const kit = (k: FactoryKit): string => k.model

const PART_WORDS: Readonly<Record<PromptPart, string>> = { BASS: 'bass', CHORDS: 'chords', LEAD: 'lead', FILL: 'fill', FX: 'FX' }
const part = (p: PromptPart): string => PART_WORDS[p]

const DRUMS_ONLY = 'drums only'
const parts = (set: ReadonlySet<PromptPart>): string =>
  set.size === 0 ? DRUMS_ONLY : PROMPT_PARTS.filter((p) => set.has(p)).map(part).join(' · ')

const GOALS: Readonly<Record<PromptGoal, string>> = {
  BETTER: 'make it better',
  DRIVE: 'give it more drive',
  LAID_BACK: 'make it laid-back',
  BUSIER: 'make it busier',
  SPARSER: 'strip it back',
  SWING: 'give it more swing',
  FILL: 'add a fill',
  BASS: 'add a bassline',
  MELODY: 'add chords or a melody',
}
const goal = (g: PromptGoal): string => GOALS[g]

const GOAL_KEYS: Readonly<Record<PromptGoal, string>> = {
  BETTER: 'Better',
  DRIVE: 'More drive',
  LAID_BACK: 'Laid-back',
  BUSIER: 'Busier',
  SPARSER: 'Sparser',
  SWING: 'More swing',
  FILL: 'A fill',
  BASS: 'A bassline',
  MELODY: 'Chords, melody',
}
const goalKey = (g: PromptGoal): string => GOAL_KEYS[g]

const edits = (n: number): string => (n === 1 ? 'one edit' : n === 3 ? '2-3 edits' : '4-5 edits')

const WAYS: Readonly<Record<PlayWay, string>> = {
  FINGERS: 'by finger drumming',
  STEPS: 'by step entry',
  PERFORM: 'as a live set',
  KEYS: 'its KEYS parts',
}
const way = (w: PlayWay): string => WAYS[w]

const WAY_KEYS: Readonly<Record<PlayWay, string>> = { FINGERS: 'Fingers', STEPS: 'Steps', PERFORM: 'Perform', KEYS: 'Keys' }
const wayKey = (w: PlayWay): string => WAY_KEYS[w]

const WAY_SUBS: Readonly<Record<PlayWay, string>> = {
  FINGERS: 'live, part by part',
  STEPS: 'on the sequencer',
  PERFORM: 'scenes, FX, punch-ins',
  KEYS: 'bass and melody',
}

const LEVELS: Readonly<Record<PlayLevel, string>> = { NEW: 'a beginner', SOME: 'an improver', SURE: 'a sure hand' }
const level = (l: PlayLevel): string => LEVELS[l]

const speed = (percent: number): string => (percent === 50 ? 'half tempo' : percent === 75 ? 'three-quarter tempo' : 'full tempo')

const FROM_SCRATCH = 'from scratch'
const FROM_PICK = 'from this beat'
const lesson = (n: number): string => `lesson ${n}: ${ClaudePrompt.LESSONS[n - 1]!.toLowerCase()}`

/** The words a slot of [p] shows, the kit as [k] (the prompt's, or the one Live plays). */
function value(p: ClaudePrompt, s: PromptSlot, k: FactoryKit): string {
  const g = Genres.of(p.genre)
  switch (s) {
    case PromptSlot.BARS:
      return bars(p.bars)
    case PromptSlot.FEEL:
      return feels(p.feels)
    case PromptSlot.GENRE:
      return p.task === PromptTask.IMPROVE ? (g !== null ? toward(g) : OWN_STYLE) : (g?.words ?? ANY_STYLE)
    case PromptSlot.TEMPO:
      return p.tempo !== null ? tempo(p.tempo) : ANY_TEMPO
    case PromptSlot.KIT:
      return kit(k)
    case PromptSlot.PARTS:
      return parts(p.parts)
    case PromptSlot.GOAL:
      return goal(p.goal)
    case PromptSlot.EDITS:
      return edits(p.edits)
    case PromptSlot.LENGTH:
      return bars(p.length)
    case PromptSlot.START:
      return p.fromPick ? FROM_PICK : FROM_SCRATCH
    case PromptSlot.LESSON:
      return lesson(p.lesson)
    case PromptSlot.WAY:
      return way(p.way)
    case PromptSlot.LEVEL:
      return level(p.level)
    case PromptSlot.SPEED:
      return speed(p.speed)
  }
}

/**
 * The glass's sentence for [p]: "Write a [4-bar] beat in [dub techno] at
 * [122 BPM] for the [EP-133] kit with [bass · FX]", each bracket a slot.
 */
function sentence(p: ClaudePrompt, k: FactoryKit): PromptPiece[] {
  const s = (slot: PromptSlot): PromptPiece => promptPiece(value(p, slot, k), slot)
  const w = (text: string): PromptPiece => promptPiece(text)
  const S = PromptSlot
  switch (p.task) {
    case PromptTask.BEAT:
      return [w('Write a'), s(S.BARS), w('beat in'), s(S.FEEL), s(S.GENRE), w('at'), s(S.TEMPO), w('for the'), s(S.KIT), w('kit with'), s(S.PARTS)]
    case PromptTask.IMPROVE:
      return [w('Improve it:'), s(S.GOAL), s(S.GENRE), w('in'), s(S.EDITS), w('on the'), s(S.KIT), w('kit')]
    case PromptTask.TRACK:
      return [w('Write a'), s(S.LENGTH), w('track in'), s(S.FEEL), s(S.GENRE), w('at'), s(S.TEMPO), w('for the'), s(S.KIT), w('kit'), s(S.START)]
    case PromptTask.PLAY:
      return [w('Teach me to play it'), s(S.WAY), w('as'), s(S.LEVEL), w('starting at'), s(S.SPEED)]
    case PromptTask.LEARN:
      return [w('Teach me'), s(S.LESSON), w('one step at a time')]
  }
}

// ---------- The prompt ----------
// Written as Anthropic's prompting guide has it: the skill and the task first, why (the card goes back into Arc), the
// choices as a list, then what the reply should be; the card or the sound list, the data, follows the words.
const KEEP = 'Keep its sound, FX and pad lines unless an edit needs to change them, or choose sounds from my sound list if one follows the card.'
const FROM_LIST = 'Choose the sounds from my sound list, which follows:'
const THE_CARD = 'The card:'
const REPLY = 'Reply with the card in one code block, then 2-4 lines on the feel and one thing to try changing.'

/** "a, b and c". */
function list(words: readonly string[]): string {
  return words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1]
}

const PART_PHRASES: Readonly<Record<PromptPart, string>> = {
  BASS: 'a bassline',
  CHORDS: 'chords',
  LEAD: 'a lead',
  FILL: 'a fill in the last bar',
  FX: 'FX that suit it',
}

const lines = (...l: (string | null)[]): string => l.filter((x) => x !== null).join('\n')

const removeSuffix = (s: string, suffix: string): string => (s.endsWith(suffix) ? s.slice(0, -suffix.length) : s)

const PLAY_WAYS: Readonly<Record<PlayWay, string>> = {
  FINGERS: 'finger drumming, one part at a time, saying which hand and finger plays each pad',
  STEPS: "step entry on the EP-133's sequencer, with the key combos of the official guide",
  PERFORM: 'performing it live, bar by bar: when to switch scenes, play fills and punch in FX',
  KEYS: 'its bass and melody parts in KEYS, note by note',
}

const PLAY_LEVELS: Readonly<Record<PlayLevel, string>> = { NEW: 'a beginner', SOME: "I've had some practice", SURE: "I'm sure on the pads" }

/**
 * The prompt [p] builds: the words before its card when it has one ([pick]
 * says which), else the whole message before the sound list ([sounds]: one
 * follows). A hand-edited ClaudePrompt.text goes as it is.
 */
function prompt(p: ClaudePrompt, pick: SharePick, sounds: boolean): string {
  if (p.text !== null) return p.text
  const g = Genres.of(p.genre)
  const chain = pick === SharePick.CHAIN
  const style = '- Style: ' + (g !== null ? `${g.words} (start from the skill's recipe)` : 'any style you like')
  const tempoLine = p.tempo !== null ? `- Tempo: ${p.tempo} BPM` : null
  // The feel words: the skill's genres.md turns each into changes to the recipe.
  const feelLine =
    p.feels.length > 0 ? `- Feel: ${list(p.feels.map(feel))} (the skill's feel words: change the recipe the way they say)` : null
  const choose = sounds ? FROM_LIST : null
  const what = chain ? 'arrangement' : 'beat'
  switch (p.task) {
    case PromptTask.BEAT:
      return lines(
        "Use the arc-beats skill to write a new beat for my EP-133. I'll paste your card into the Arc app and play it, so give one complete ARC BEAT card that passes the skill's check.",
        style,
        feelLine,
        tempoLine,
        `- Length: ${p.bars} ${p.bars === 1 ? 'bar' : 'bars'}`,
        '- Parts: ' +
          (p.parts.size === 0
            ? 'drums only'
            : 'drums, ' + list(PROMPT_PARTS.filter((x) => p.parts.has(x)).map((x) => PART_PHRASES[x]))),
        REPLY,
        choose,
      )
    case PromptTask.IMPROVE:
      return lines(
        `Use the arc-beats skill to improve this EP-133 ${what} from Arc. I'll paste your new card back into Arc next to mine, so give it a short new name.`,
        '- First: analyse it, ' +
          (chain ? 'its energy curve, contrast, length and transitions' : 'its groove, its energy and what makes it work'),
        p.goal !== PromptGoal.BETTER ? `- Ask: ${goal(p.goal)}` : null,
        g !== null ? `- Direction: toward ${g.words}` : null,
        `- Edits: ${removeSuffix(removeSuffix(edits(p.edits), ' edits'), ' edit')}, as one new card` +
          (chain ? ' of scenes with a chain line' : ''),
        `${KEEP} ${THE_CARD}`,
      )
    case PromptTask.TRACK: {
      const length = `- Length: about ${p.length} bars`
      if (p.fromPick) {
        return lines(
          `Use the arc-beats skill to continue this EP-133 ${what} from Arc into a track idea: a card of scenes with a chain line that I'll paste into Arc and play.`,
          style,
          feelLine,
          tempoLine,
          length,
          `- Start: this ${what} as its first ${chain ? 'scenes' : 'scene'}, then change one or two things from scene to scene`,
          `${KEEP} ${THE_CARD}`,
        )
      }
      return lines(
        "Use the arc-beats skill to write a track idea for my EP-133: a card of scenes with a chain line that I'll paste into Arc and play.",
        style,
        feelLine,
        tempoLine,
        length,
        '- Shape: an intro, a drop, a breakdown and a second drop, changing one or two things from scene to scene',
        'Reply with the card in one code block, then a line for each scene saying what changes.',
        choose,
      )
    }
    case PromptTask.PLAY:
      return lines(
        `Use the arc-beats skill to teach me to play this EP-133 ${what} from Arc myself, on the device, not just import it.`,
        '- Way: ' + PLAY_WAYS[p.way],
        '- Me: ' + PLAY_LEVELS[p.level],
        '- Start: ' + (p.speed >= 100 ? 'at its own tempo' : `at ${p.speed}% of its tempo, then work up to it`),
        // Finger drumming is what PRACTICE runs: the steps as the card's lesson lines play on Live's pads.
        p.way === PlayWay.FINGERS
          ? "- Arc: also give me the card with lesson lines for your steps, so Arc's PRACTICE runs them on its pads"
          : null,
        `Go one step at a time: explain the step, give me something to play, and wait for me before the next one. ${THE_CARD}`,
      )
    case PromptTask.LEARN:
      return learn(p.lesson)
  }
}

/** A lesson's prompt: from lesson [n] of the skill's lessons.md, a step at a time, waiting for the user between them. */
const learn = (n: number): string => WebText.learn(n, ClaudePrompt.LESSONS[n - 1]!)

/** A saved prompt's name: "Dub techno 122", "Improve · Busier", "Lesson 5"; one hand-edited ends in "✎". */
function name(p: ClaudePrompt): string {
  const g = Genres.of(p.genre)
  let base: string
  switch (p.task) {
    case PromptTask.BEAT: {
      const genreWord = g !== null ? (p.feels.length === 0 ? g.name : g.name.toLowerCase()) : task(p.task)
      base = feelsWord(p) + [genreWord, p.tempo?.toString() ?? null].filter((x) => x !== null).join(' ')
      break
    }
    case PromptTask.IMPROVE:
      base = `${task(p.task)} · ` + (g?.name ?? goalKey(p.goal))
      break
    case PromptTask.TRACK:
      base = `${task(p.task)} · ` + ([g?.name ?? null, p.tempo?.toString() ?? null].filter((x) => x !== null).join(' ') || barsKey(p.length))
      break
    case PromptTask.PLAY:
      base = `${task(p.task)} · ${wayKey(p.way)} ${p.speed}%`
      break
    case PromptTask.LEARN:
      base = `Lesson ${p.lesson}`
      break
  }
  return p.text !== null ? `${base} ✎` : base
}

// "Dreamy " before a saved prompt's genre.
function feelsWord(p: ClaudePrompt): string {
  const f = p.feels[0]
  if (f === undefined) return ''
  const w = feel(f)
  return w.charAt(0).toUpperCase() + w.slice(1) + ' '
}

/** [n], with " 2", " 3"... when [taken] has it already. */
function uniqueName(n: string, taken: readonly string[]): string {
  if (!taken.includes(n)) return n
  let i = 2
  while (taken.includes(`${n} ${i}`)) i++
  return `${n} ${i}`
}

/** The saved prompts with [p] added under its [name] (none when SavedPrompt.MAX are kept, or it is kept already). */
function withSaved(saved: readonly SavedPrompt[], p: ClaudePrompt): readonly SavedPrompt[] {
  if (saved.length >= SavedPrompt.MAX || saved.some((s) => ClaudePrompt.equals(s.prompt, p))) return saved
  return [...saved, savedPrompt(uniqueName(name(p), saved.map((s) => s.name)), p)]
}

export const PromptText = {
  task,
  /** The glass's tab: as [task], but NEW BEAT is NEW, so five fit. */
  tab: (t: PromptTask): string => (t === PromptTask.BEAT ? 'New' : task(t)),
  /** A slot's name: over its answers, and for screen readers. */
  slot: (s: PromptSlot): string => SLOTS[s],
  family: (f: GenreFamily): string => FAMILIES[f],

  // ---------- The sentence's words ----------
  feel,
  /** What a feel word does to the recipe, in a line under the answers (the skill's genres.md has it all). */
  feelHint: (f: Feel): string => FEEL_HINTS[f],
  PLAIN,
  HINT_FEEL: 'Up to two words. Each changes the recipe: tempo in its range, swing, how busy, the chords, the FX.',
  feels,
  bars,
  barsKey,
  ANY_STYLE,
  OWN_STYLE,
  toward,
  tempo,
  ANY_TEMPO,
  kit,
  part,
  DRUMS_ONLY,
  parts,
  goal,
  /** The goal's key: its words without the verb. */
  goalKey,
  edits,
  way,
  /** The way's key, and the line under it. */
  wayKey,
  waySub: (w: PlayWay): string => WAY_SUBS[w],
  level,
  /** The level's key: its words without the article. */
  levelKey: (l: PlayLevel): string => {
    const words = level(l)
    const i = words.indexOf(' ')
    return i < 0 ? words : words.substring(i + 1)
  },
  speed,
  speedKey: (percent: number): string => `${percent}%`,
  FROM_SCRATCH,
  FROM_PICK,
  lesson,
  value,
  sentence,

  // ---------- The prompt ----------
  prompt,
  learn,

  /** What a share without a card is named by while its reply is awaited, and its subject ("Arc · New beat"). */
  NEW_BEAT: 'New beat',
  TRACK_IDEA: 'Track idea',
  subject: (what: string): string => `Arc · ${what}`,

  // ---------- The page ----------
  HINT: 'Tap an orange word to change it. SHARE or COPY takes the prompt to Claude; PASTE CARD brings its card back.',
  HINT_CARD: 'Tap an orange word to change it. SCENE, the pattern or CHAIN picks the card that goes with the prompt.',
  HINT_EDITED: 'Your own words go as they are. EDIT changes them, REBUILD brings the sentence back.',
  HINT_EDITING: 'Write the prompt your way. The card, the kit and the sound list still follow it.',
  HINT_PICK: 'Pick one, then DONE. NEXT goes on to the next word.',
  HINT_PARTS: 'Tap the parts to add or drop them; none is drums only.',
  HINT_KIT: 'The kit Live plays is picked at first. Another one goes with this prompt only.',
  HINT_START: "From this beat sends the card SCENE, the pattern or CHAIN picks, as the track's first scene.",
  hintGenre: (g: Genre | null): string =>
    g !== null
      ? `${g.name}: ${g.tempo.first}-${g.tempo.last} BPM. Picking a genre sets its tempo.`
      : "Pick a genre and its recipe's tempo comes with it.",
  hintTempo: (g: Genre | null): string =>
    g !== null ? `${g.name} runs at ${g.tempo.first}-${g.tempo.last} BPM.` : 'LIVE takes the tempo Live plays at.',

  /** The glass's head while the prompt is edited, or was. */
  PROMPT: 'Prompt',
  EDITED: 'Edited',
  /** The tabs for screen readers: "Task: New beat". */
  taskName: (t: PromptTask): string => `Task: ${task(t)}`,
  /** A slot for screen readers: "Genre: dub techno". */
  slotName: (s: PromptSlot, v: string): string => `${SLOTS[s]}: ${v}`,
  CHANGE: 'Change',

  /** The keys. */
  KEY_EDIT: 'Edit',
  KEY_COPY: 'Copy',
  COPY_NAME: 'Copy the prompt, to paste into Claude',
  /** Said once COPY has put the prompt (and its card) on the clipboard. */
  COPIED: 'Prompt copied. Paste it into a chat with Claude.',
  /** The wide key under the strip: Claude's reply coming back. Held, it opens a card file. */
  KEY_PASTE_CARD: 'Paste card',
  PASTE_CARD_NAME: "Paste Claude's card from the clipboard",
  KEY_REBUILD: 'Rebuild',
  KEY_DONE: 'Done',
  KEY_NEXT: 'Next',
  NEXT_NAME: 'The next word',
  KEY_ANY: 'Any',
  KEY_LIVE: 'Live',
  EDIT_NAME: 'Edit the prompt',
  REBUILD_NAME: 'Drop your words and build the prompt again',
  ANY_GENRE_NAME: 'Any genre',
  ANY_TEMPO_NAME: "Any tempo, Claude's choice",
  liveTempoName: (bpm: number): string => `Live's tempo, ${bpm} BPM`,
  stepTempo: (by: number): string => (by > 0 ? `+${by}` : `−${-by}`),
  stepTempoName: (by: number): string => (by > 0 ? `Faster by ${by} BPM` : `Slower by ${-by} BPM`),
  FROM_SCRATCH_KEY: 'Scratch',
  FROM_PICK_KEY: 'This beat',
  lessonKey: (n: number): string => `${n}`,
  lessonSub: (n: number): string => ClaudePrompt.LESSONS[n - 1]!,

  // ---------- Saved prompts ----------
  SAVED: 'Saved prompts',
  SAVE: 'Save',
  SAVE_NAME: 'Save this prompt',
  SAVED_FULL: 'Hold a saved prompt to delete it, then save this one.',
  savedName: (n: string, current: boolean): string => `Saved prompt ${n}` + (current ? ', in use' : ''),
  DELETE: 'Delete',
  saved: (n: string): string => `Saved “${n}”`,
  deleted: (n: string): string => `Deleted “${n}”`,

  name,
  uniqueName,
  withSaved,
} as const
