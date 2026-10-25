// The words of arc's lookup_combo tool and its guide view (mcp/, a web-only
// addition with no Kotlin twin), beside text.ts's beat-card words. The guide
// entries themselves, their check note and the official guide's address are
// the app's own (web/src/core/text/guideText.ts); this file only adds what the
// tool says around them (the result carries the check note and address).
// Same tone as web/src/core/text: short and plain, and arc in lower case.
//
// GuideToolText goes to the model (the tool's description and its text
// result, all a host without MCP Apps shows), GuideViewText to the user
// (views/guide). The view imports this file too, so keep it free of Node APIs.

/** The guide view's resource. The tool's _meta.ui.resourceUri names it. */
export const GUIDE_URI = 'ui://arc/guide.html'
export const GUIDE_TOOL = 'lookup_combo'
/** The tool's input: a few words for the task, and at most LIMIT_MAX entries back. */
export const QUERY_MIN = 1
export const QUERY_MAX = 200
export const LIMIT_DEFAULT = 4
export const LIMIT_MAX = 8

/** One entry as the tool returns it: the skill's id, its section and the app's entry fields. */
export interface GuideHit {
  readonly id: string
  readonly section: string
  readonly action: string
  readonly keys: string
  readonly note: string | null
  readonly source: string
  /** The keys in guideCombo notation, which the view draws; null when they can't be drawn. */
  readonly combo: string | null
}

/**
 * How the entries were found: `all` every word of the query matches them,
 * `some` none matched every word so they are ranked by how many they match,
 * `none` nothing matched.
 */
export type GuideMatch = 'all' | 'some' | 'none'

/** The tool's structuredContent. */
export interface GuideLookup {
  readonly query: string
  /** The section the search was kept to, or null for the whole guide. */
  readonly section: string | null
  readonly match: GuideMatch
  readonly entries: readonly GuideHit[]
  /** How many more entries matched than `entries` holds. */
  readonly more: number
  readonly checkNote: string
  readonly officialUrl: string
}

/** "SMP-12 — Resample the current pattern…", then its keys, note and source, one a line. */
function entryText(e: GuideHit): string {
  const lines = [`${e.id} — ${e.action}`, `Keys: ${e.keys}`]
  if (e.note !== null) lines.push(`Note: ${e.note}`)
  lines.push(`Source: ${e.source}`)
  return lines.join('\n')
}

/** ` in Sequencer` for a search kept to a section, else nothing. */
function within(section: string | null): string {
  return section !== null ? ` in ${section}` : ''
}

export const GuideToolText = {
  TITLE: 'Look up an EP-133 key combo',
  DESCRIPTION:
    "Find EP-133 K.O. II key combinations in arc's checked copy of teenage engineering's official user guide " +
    "(OS 2.5) and show them to the user drawn as the device's keys. Call it whenever the user asks how to do " +
    'something on the EP-133 (sample, resample, chop, record or copy a pattern, punch-in FX, load a project …), ' +
    'and before you write any key combo in an answer or a lesson. Search with a few plain words for the task, ' +
    'e.g. "resample" or "copy pattern". Give only the combos it returns, cited by their id (SMP-12), and never ' +
    "make one up: when nothing matches, the reply says so, and you tell the user it isn't in the official guide.",
  QUERY_DESCRIPTION: 'A few words for what the user wants to do, e.g. "resample", "copy pattern", "punch-in fx".',
  SECTION_DESCRIPTION: 'Search only this section of the guide.',
  LIMIT_DESCRIPTION: `At most this many entries (default ${LIMIT_DEFAULT}).`,

  VIEW_NAME: 'EP-133 key combos',
  VIEW_DESCRIPTION: "Entries of the EP-133's official guide with their key combinations drawn as the device's keys.",

  /** The text result: the entries found, or that the guide doesn't have it. */
  result: (r: GuideLookup, sections: readonly string[]): string => {
    if (r.match === 'none') {
      return [
        `That isn't in the official guide: none of arc's key combos from teenage engineering's EP-133 guide ` +
          `(OS 2.5) matches "${r.query}"${within(r.section)}. Tell the user so instead of guessing a combo, and ` +
          `point them to the official guide (${r.officialUrl}) or the device itself.`,
        `The guide's sections: ${sections.join(', ')}. Try other words, or one section.`,
      ].join('\n')
    }
    const n = r.entries.length + r.more
    const head =
      r.match === 'all'
        ? `${n} key combo${n === 1 ? '' : 's'} from the official EP-133 guide (OS 2.5) for "${r.query}"${within(r.section)}:`
        : `No entry of the official EP-133 guide (OS 2.5) matches every word of "${r.query}"${within(r.section)}. ` +
          'The closest, by how many words they match (check they fit the question):'
    const out = [head, ...r.entries.map(entryText)]
    if (r.more > 0) out.push(`… and ${r.more} more: use more words${r.section === null ? ', or pass a section' : ''}.`)
    out.push(`Give the combos as they are, cited by id, with no keys they don't name. ${r.checkNote}`)
    return out.join('\n\n')
  },
} as const

/** A guide entry in a message to Claude: "SMP-12 (Resample the current pattern…)". */
function entryRef(e: Pick<GuideHit, 'id' | 'action'>): string {
  return `${e.id} (${e.action})`
}

export const GuideViewText = {
  APP_NAME: 'arc combo guide',
  WAITING: 'Looking up key combos…',
  CANCELLED: 'The search was not sent.',
  /** The heading over the entries: "Key combos for “resample”". */
  heading: (query: string): string => `Key combos for “${query}”`,
  /** The line under the heading. */
  INTRO: "From teenage engineering's official EP-133 guide for OS 2.5, in arc's words.",
  inSection: (section: string): string => `In ${section}.`,
  SOME_WORDS: 'Nothing matches every word; these match some of them.',
  more: (n: number): string => `${n} more match${n === 1 ? 'es' : ''}. Ask Claude to narrow it down.`,
  NOT_FOUND: "That isn't in the official guide.",
  sectionsLine: (sections: readonly string[]): string => `Its sections: ${sections.join(', ')}.`,

  KEYS: 'Keys',
  /** Opens the entry's section of the official guide through the host. */
  OFFICIAL: 'Official guide',
  officialAria: (id: string): string => `Official guide for ${id}`,
  /** The host would not open the link: the address to copy. */
  LINK_FAILED: "Couldn't open the link here. The address:",
  MORE: 'Show more like this',
  BEAT: 'Make a beat that uses this',
  SENT: 'Sent to Claude.',
  SEND_FAILED: "Couldn't send. Type your request in the chat instead.",
  moreMessage: (e: Pick<GuideHit, 'id' | 'action'>): string =>
    `Show me more EP-133 key combos like ${entryRef(e)}, with lookup_combo.`,
  beatMessage: (e: Pick<GuideHit, 'id' | 'action'>): string =>
    `Make me an ARC BEAT card that uses ${entryRef(e)}, and tell me in a few steps how to do it on the EP-133 ` +
    'with that combo. Show me the card with show_beat_card.',
} as const
