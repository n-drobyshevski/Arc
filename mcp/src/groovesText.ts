// The words of arc's browse_grooves tool and its gallery view (mcp/, a
// web-only addition with no Kotlin twin), beside text.ts's beat-card words and
// guideText.ts's key-combo words. The grooves themselves are the arc-beats
// skill's genre recipes (grooves.ts, generated from its genres.md); this file
// says what the tool and the view say around them, and holds the search both
// use. Same tone as web/src/core/text: short and plain, and arc in lower case.
//
// GroovesToolText goes to the model (the tool's description and its text
// result, all a host without MCP Apps shows), GroovesViewText to the user
// (views/grooves). The view imports this file too, so keep it free of Node
// APIs.

import type { FAMILIES } from './grooves'

/** The gallery view's resource. The tool's _meta.ui.resourceUri names it. */
export const GROOVES_URI = 'ui://arc/grooves.html'
export const GROOVES_TOOL = 'browse_grooves'
/** The tool's input: a few words to search with, and at most LIMIT_MAX grooves back (all of them). */
export const QUERY_MAX = 100
export const LIMIT_MAX = 36

export type GrooveFamily = (typeof FAMILIES)[number]

/** One genre recipe of the arc-beats skill (references/genres.md). */
export interface Groove {
  /** The name as a slug: "uk-garage". */
  readonly id: string
  /** The recipe's heading without its (EP-40) mark: "UK garage". */
  readonly name: string
  readonly family: GrooveFamily
  /** The recipe's tempo range as written: "120-128". */
  readonly bpm: string
  /** The recipe's swing range as written: "50-54". */
  readonly swing: string
  /** What it should feel like, a sentence or a few (code spans in backticks). */
  readonly feel: string
  /** The paragraph under the card (what its FX lines or hand-written swing do), or null. */
  readonly note: string | null
  /** For the EP-40 Riddim kit's pads, not the assumed kit. */
  readonly ep40: boolean
  /** The whole ARC BEAT card, valid as written. */
  readonly card: string
}

/** The tool's structuredContent. */
export interface GrooveGallery {
  /** The words searched for, trimmed; null when none were given. */
  readonly query: string | null
  /** The family the gallery was kept to, or null for all of them. */
  readonly family: GrooveFamily | null
  readonly grooves: readonly Groove[]
  /** How many grooves matched, `grooves` holding at most the limit of them. */
  readonly total: number
}

/** Short names the recipes never write, spelled out as they do: "dnb" finds "Drum and bass". */
const SPELLED_OUT: ReadonlyMap<string, string> = new Map([
  ['dnb', 'drum and bass'],
  ['d&b', 'drum and bass'],
  ['ukg', 'uk garage'],
])

/** The query as the search reads it: lower case, one space between words, short names spelled out. */
export function grooveQuery(query: string): string {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => SPELLED_OUT.get(w) ?? w)
    .join(' ')
}

/** The search's words: grooveQuery's, each once. */
export function grooveWords(query: string): string[] {
  const q = grooveQuery(query)
  return q === '' ? [] : [...new Set(q.split(' '))]
}

/**
 * What the search reads of [g]: its name, family and feel in lower case, then
 * again with hyphens left out and as spaces, so "lofi" and "hip hop" find
 * "Lo-fi" and "Hip-hop".
 */
function searchText(g: Pick<Groove, 'name' | 'family' | 'feel'>): string {
  const text = `${g.name} · ${g.family} · ${g.feel}`.toLowerCase()
  return `${text} · ${text.replace(/-/g, '')} · ${text.replace(/-/g, ' ')}`
}

/** Does [g] have every one of [words] somewhere in its name, family or feel? No words matches everything. */
export function grooveMatches(g: Pick<Groove, 'name' | 'family' | 'feel'>, words: readonly string[]): boolean {
  const text = searchText(g)
  return words.every((w) => text.includes(w))
}

/**
 * The search, the tool's and the view's search box's: the grooves of [grooves]
 * that have the whole query as whole words in their name, family or feel
 * ("drum and bass" finds the Drum and bass family, not a feel with "drums" and
 * "bass"; "reggae" finds the reggae grooves, not Reggaeton), else, when none
 * has, those with every word of it anywhere ("half-time trap", or "tech" while
 * typing). In [grooves]' order; no query keeps them all.
 */
export function findGrooves<G extends Groove>(grooves: readonly G[], query: string): G[] {
  const q = grooveQuery(query)
  if (q === '') return [...grooves]
  const phrase = new RegExp(`(?:^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`)
  const whole = grooves.filter((g) => phrase.test(searchText(g)))
  if (whole.length > 0) return whole
  const words = grooveWords(q)
  return grooves.filter((g) => grooveMatches(g, words))
}

/** "120-128 BPM, swing 50-54". */
function tempoText(g: Pick<Groove, 'bpm' | 'swing'>): string {
  return `${g.bpm} BPM, swing ${g.swing}`
}

/** `"techno" in Techno`, `"techno"`, `in Techno` or nothing. */
function searched(r: Pick<GrooveGallery, 'query' | 'family'>): string {
  const parts: string[] = []
  if (r.query !== null) parts.push(`for "${r.query}"`)
  if (r.family !== null) parts.push(`in ${r.family}`)
  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

export const GroovesToolText = {
  TITLE: 'Browse groove ideas',
  DESCRIPTION:
    "Show the user a gallery of ARC BEAT genre grooves for the EP-133 K.O. II, the arc-beats skill's 36 recipes " +
    '(house, techno and its family, boom bap, lo-fi, trap, drill, drum and bass, jungle, breakcore, breakbeat, UK ' +
    'garage, dembow, afrobeats, a pop and rock backbeat, and reggae and dub for the EP-40 Riddim kit), each a tile ' +
    'they can play. Call it when the user wants ideas, a genre or style to start from, or to browse or hear ' +
    'styles. Leave the query out to show them all, or pass a few words (matched against the name, family and ' +
    'feel) or a family. The reply lists each groove in one line, without its card. After the user picks one, ' +
    'write a new ARC BEAT card from that recipe with the arc-beats skill and show it with show_beat_card.',
  QUERY_DESCRIPTION:
    'Words to find in the name, family or feel, e.g. "techno", "drum and bass", "half-time". The grooves that ' +
    'have them as one phrase are shown, or, when none has, those with every word.',
  FAMILY_DESCRIPTION: 'Show only this family.',
  LIMIT_DESCRIPTION: `At most this many grooves (default all ${LIMIT_MAX}).`,

  VIEW_NAME: 'ARC BEAT groove gallery',
  VIEW_DESCRIPTION: 'Genre grooves for the EP-133 as tiles the user can play, copy or ask Claude to build on.',

  /** "House — House and club — 120-128 BPM, swing 50-54 — four on the floor, … — The `sidechain` line …", the note last when there is one. */
  line: (g: Groove): string =>
    `${g.name} — ${g.family} — ${tempoText(g)} — ${g.feel}${g.note !== null ? ` — ${g.note}` : ''}`,

  /** The text result: how many matched, a line per groove, and what to do next. */
  result: (r: GrooveGallery, families: readonly string[]): string => {
    if (r.total === 0) {
      return (
        `No groove matches${searched(r)}. The families: ${families.join(', ')}. ` +
        'Try fewer or other words, or call browse_grooves with no query to show them all.'
      )
    }
    const shown = r.grooves.length
    const head =
      shown < r.total
        ? `${r.total} grooves match${searched(r)}; the first ${shown}:`
        : `${r.total} groove${r.total === 1 ? '' : 's'}${searched(r)}${r.total === 1 ? ' matches' : ''}:`
    return [
      head,
      ...r.grooves.map(GroovesToolText.line),
      '',
      'The user sees them as tiles they can play. When they pick one, write a new ARC BEAT card from that recipe ' +
        "(the arc-beats skill's genres.md) and show it with show_beat_card. EP-40 grooves use the EP-40 Riddim kit's pads.",
    ].join('\n')
  },
} as const

/** A groove in a message to Claude: `the gallery's "UK garage" groove`, with the kit for an EP-40 one. */
function grooveRef(g: Pick<Groove, 'name' | 'ep40'>): string {
  return `the gallery's "${g.name}" groove${g.ep40 ? ' (for the EP-40 Riddim kit)' : ''}`
}

/** The groove's card in a message, fenced, so Claude has it exactly. */
function fenced(card: string): string {
  return '```\n' + card + '\n```'
}

export const GroovesViewText = {
  APP_NAME: 'arc groove gallery',
  WAITING: 'Loading grooves…',
  CANCELLED: 'The gallery was not sent.',
  TITLE: 'Groove gallery',
  /** The heading of a gallery the model searched: "Grooves for “techno”". */
  heading: (query: string): string => `Grooves for “${query}”`,
  INTRO: "Starting points from the arc-beats skill. Play one, then ask Claude for a beat like it.",
  PREVIEW_NOTE: "Sounds are stand-ins, not your EP-133's.",

  FAMILIES: 'Families',
  ALL: 'All',
  SEARCH: 'Search grooves',
  SEARCH_PLACEHOLDER: 'Search by name or feel',
  /** How many tiles show: "36 grooves", "3 of 36 grooves". */
  count: (shown: number, total: number): string =>
    shown === total ? `${total} groove${total === 1 ? '' : 's'}` : `${shown} of ${total} grooves`,
  /** After the count, when the model asked for fewer grooves than matched: "10 more grooves match. Ask Claude for them." */
  more: (hidden: number): string =>
    hidden === 1 ? '1 more groove matches. Ask Claude for it.' : `${hidden} more grooves match. Ask Claude for them.`,
  NONE: 'No groove matches. Try other words or another family.',

  bpm: (bpm: string): string => `${bpm} BPM`,
  swing: (swing: string): string => `swing ${swing}`,
  EP40: 'EP-40',
  EP40_TITLE: "For the EP-40 Riddim kit's pads",
  /** The disclosure of the groove's note (what its FX lines or hand-written swing do). */
  ABOUT: 'About the card',
  /** The thumbnail's label: "Group A pattern, 1 bar". */
  thumb: (group: string, bars: number): string => `Group ${group} pattern, ${bars} bar${bars === 1 ? '' : 's'}`,

  PLAY: 'Play',
  STOP: 'Stop',
  playAria: (name: string): string => `Play ${name}`,
  stopAria: (name: string): string => `Stop ${name}`,
  NO_AUDIO: "This browser can't play sound here.",
  LIKE: 'Make one like this',
  PREVIEW: 'Show in preview',
  COPY: 'Copy card',
  COPIED: 'Copied',
  COPY_FAILED: 'Select the card below and copy it.',
  cardText: (name: string): string => `${name} card text`,
  SENT: 'Sent to Claude.',
  SEND_FAILED: "Couldn't send. Type your request in the chat instead.",

  /** Make one like this: a new card in that style, built from the groove's card. */
  likeMessage: (g: Pick<Groove, 'name' | 'ep40' | 'card'>): string =>
    `Make me a new ARC BEAT card in the style of ${grooveRef(g)}, using its card as the starting point ` +
    '(arc-beats skill), and show it with show_beat_card.\n\n' +
    fenced(g.card),
  /** Show in preview: the groove's card as it is, in the beat preview. */
  previewMessage: (g: Pick<Groove, 'name' | 'ep40' | 'card'>): string =>
    `Show me the card of ${grooveRef(g)} with show_beat_card, as it is.\n\n${fenced(g.card)}`,
} as const
