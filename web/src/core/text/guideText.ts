// Port of core/src/main/kotlin/dev/arc/ep133/text/GuideText.kt
// The entries themselves live in guideData.ts, generated from GuideText.kt by
// scripts/gen-guide-data.mjs (npm run gen:guide).

import { sections } from './guideData'
import type { KeyAction } from './guideCombo'
import type { PanelKey, StepKind } from './guideKeymap'
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

// The redesigned list: a search that says how many there are, and tags before the caps.

/** "Search 93 shortcuts". */
export function searchCount(n: number): string {
  return `Search ${n} shortcuts`
}

/** "SOUND MODE", the tag for a combo that starts in a mode (GuideKeymap.mode). */
export function modeTag(mode: string): string {
  return `${mode.toUpperCase()} MODE`
}

/** The tag before a key that is held, typed on, turned, moved or pressed twice (the caps' badges, DIAL read as TYPE). */
export function tag(action: KeyAction): string {
  return action === 'DIAL' ? 'TYPE' : badge(action)
}

/** A numbered step's tag in the illustration ("1 HOLD"); a plain press has none. */
export function stepTag(kind: StepKind): string | null {
  switch (kind) {
    case 'PRESS':
      return null
    case 'TWICE':
      return badge('TWICE')
    case 'HOLD':
      return 'HOLD'
    case 'TYPE':
      return 'TYPE'
    case 'TURN':
      return 'TURN'
    case 'MOVE':
      return 'MOVE'
  }
}

/** What a step asks, in the expanded row's numbered steps: "hold", then the keys. */
export function stepWord(kind: StepKind): string {
  switch (kind) {
    case 'PRESS':
      return 'press'
    case 'TWICE':
      return 'press twice'
    case 'HOLD':
      return 'hold'
    case 'TYPE':
      return 'type a number on the pads'
    case 'TURN':
      return 'turn'
    case 'MOVE':
      return 'move'
  }
}

/** "Step 2", for screen readers. */
export function step(n: number): string {
  return `Step ${n}`
}

// The K.O. II illustration beside the list (wide windows): what is printed on the panel.

/** The illustration as a whole, for screen readers. */
export const PANEL = 'The EP-133 K.O. II, with the keys of the selected shortcut lit'
export const PORTS: readonly string[] = Object.freeze(['Output', 'Input', 'Sync \u00B7 MIDI', 'USB', 'Power'])

/** Over the knobs: VOLUME, and the X and Y knobs' BPM and METRONOME. */
export function knobLabel(k: PanelKey): string | null {
  switch (k) {
    case 'VOL':
      return 'Volume'
    case 'X':
      return 'BPM'
    case 'Y':
      return 'Metronome'
    default:
      return null
  }
}

/** The LED labels between the rows of keys, top row first. */
export const LED_ROWS: readonly (readonly string[])[] = Object.freeze([
  ['Level', 'Pitch', 'Time'],
  ['LPF', 'HPF', '\u2192 FX'],
  ['Atk', 'Rel', 'Pan'],
  ['Tune', 'Vel', 'Mod'],
])

const PANEL_LABELS: Readonly<Record<PanelKey, string>> = Object.freeze({
  VOL: 'Volume',
  SOUND: 'Sound',
  MAIN: 'Main',
  TEMPO: 'Tempo',
  X: 'X',
  Y: 'Y',
  KEYS: 'Keys',
  FADER: 'Fader',
  SHIFT: 'Shift',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  P7: '7',
  P8: '8',
  P9: '9',
  P4: '4',
  P5: '5',
  P6: '6',
  P1: '1',
  P2: '2',
  P3: '3',
  DOT: '.',
  P0: '0',
  ENTER: 'Enter',
  SAMPLE: 'Sample',
  TIMING: 'Timing',
  FX: 'FX',
  ERASE: 'Erase',
  MINUS: '\u2212',
  PLUS: '+',
  REC: 'Record',
  PLAY: 'Play',
})

/** A key's main word as printed (upper-cased where drawn). */
export function panelLabel(k: PanelKey): string {
  return PANEL_LABELS[k]
}

/** The shifted function printed under a two-tier key, or null. */
export function panelSub(k: PanelKey): string | null {
  switch (k) {
    case 'SOUND':
      return 'Edit'
    case 'MAIN':
      return 'Commit'
    case 'TEMPO':
      return 'Loop'
    case 'SAMPLE':
      return 'Chop'
    case 'TIMING':
      return 'Correct'
    case 'FX':
      return 'Output'
    case 'ERASE':
      return 'System'
    default:
      return null
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
