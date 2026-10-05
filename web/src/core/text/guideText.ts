// Port of core/src/main/kotlin/dev/arc/ep133/text/GuideText.kt
// The entries themselves live in guideData.ts, generated from GuideText.kt by
// scripts/gen-guide-data.mjs (npm run gen:guide).

import { sections } from './guideData'
import type { KeyAction } from './guideCombo'
import { JAVA_WS, ktTrim } from '../util/kotlinText'

/** One key combination: what it does, the keys, the official guide section it comes from. */
export interface GuideEntry {
  readonly action: string
  readonly keys: string
  readonly source: string
  readonly note: string | null
  /** The keys as caps, in guideCombo notation; null when they can't be drawn (the text says it all). */
  readonly combo: string | null
}

export interface GuideSection {
  readonly title: string
  readonly entries: readonly GuideEntry[]
}

/*
 * The shortcut guide (an addition to the web version). Every entry is
 * paraphrased from teenage engineering's official EP-133 K.O. II user guide
 * (version 2.5, OS 2.5) and links to the section it comes from. Each one was
 * checked against that page a second time; nothing here comes from anywhere
 * else, and combos the guide does not document are left out.
 */
export const TITLE = 'Shortcut guide'
export const GUIDE = 'Guide'
export const OFFICIAL_URL = 'https://teenage.engineering/guides/ep-133'
export const OPEN_OFFICIAL = 'Open the official guide'
export const SOURCE = 'Source'
export const INTRO = "Key combinations from teenage engineering's official user guide for OS 2.5, in our own words."
export const CHECK_NOTE = 'Check against your device: combinations can change between OS versions.'
export const SEARCH = 'Search'
export const HEADER = 'GUIDE'
export const CLOSE = 'Close'
export const THEN = 'then'
export const OR = 'or'
export const NO_MATCHES = 'Nothing matches.'

export { sections }

/** Short tab labels for the sections. */
export function tab(section: GuideSection): string {
  switch (section.title) {
    case 'Effects and performance':
      return 'FX'
    case 'Projects and system':
      return 'SYSTEM'
    default:
      return section.title.toUpperCase()
  }
}

/** Badge text above a key cap. */
export function badge(action: KeyAction): string {
  switch (action) {
    case 'HOLD':
      return 'HOLD'
    case 'DIAL':
      return 'DIAL'
    case 'TURN':
      return 'TURN'
    case 'MOVE':
      return 'MOVE'
    case 'TWICE':
      return '2\u00D7'
  }
}

/**
 * Sections with only the entries whose action, keys or note contain every
 * word of [query] (case-insensitive); empty sections are left out.
 * A blank query returns [sections] itself.
 */
export function filter(query: string): readonly GuideSection[] {
  const words = ktTrim(query)
    .toLowerCase()
    .split(JAVA_WS)
    .filter((w) => w.length > 0)
  if (words.length === 0) return sections
  const out: GuideSection[] = []
  for (const s of sections) {
    const hits = s.entries.filter((e) => {
      const text = (e.action + ' ' + e.keys + ' ' + (e.note ?? '')).toLowerCase()
      return words.every((w) => text.includes(w))
    })
    if (hits.length > 0) out.push({ title: s.title, entries: hits })
  }
  return out
}
