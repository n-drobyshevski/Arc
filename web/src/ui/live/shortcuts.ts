// The device view's shortcut cards (web only): a control's combinations from
// the shortcut guide (core/text/guideData.ts, GuideText.kt), those that use
// it, shortest first. The knobs and the fader keep their cards (a tap shows
// them); the keys take the device's combos instead (deviceKeys.ts), so only
// RECORD and PLAY keep one, where the pattern isn't there to drive them.
import { filter, type GuideEntry } from '../../core/text/guideText'

/** The device's controls that open a shortcuts card. */
export type CardKey = 'FADER' | 'KNOBX' | 'KNOBY' | 'PLAY' | 'RECORD' | 'VOLUME'

/** How each key is named in the guide's combos, and on the card. */
const KEYS: Record<CardKey, { readonly match: RegExp | null; readonly name: string; readonly search: string }> = {
  FADER: { match: /\bFADER\b/, name: 'FADER', search: 'FADER' },
  KNOBX: { match: /KNOB ?X\b/, name: 'Knob X', search: 'knob X' },
  KNOBY: { match: /KNOB ?Y\b/, name: 'Knob Y', search: 'knob Y' },
  PLAY: { match: /\bPLAY\b/, name: 'PLAY', search: 'PLAY' },
  RECORD: { match: /\bRECORD\b/, name: 'RECORD', search: 'RECORD' },
  VOLUME: { match: null, name: 'VOLUME', search: 'volume' },
}

export function cardName(key: CardKey): string {
  return KEYS[key].name
}

/** What the guide's search is given for "All … shortcuts". */
export function cardSearch(key: CardKey): string {
  return KEYS[key].search
}

/** Up to [max] of the guide's entries whose keys use [key], shortest combination first. */
export function shortcutsFor(key: CardKey, max = 3): GuideEntry[] {
  const match = KEYS[key].match
  if (match === null) return []
  const out: GuideEntry[] = []
  for (const s of filter('')) for (const e of s.entries) if (e.combo !== null && match.test(e.combo)) out.push(e)
  return out.sort((a, b) => a.combo!.length - b.combo!.length).slice(0, max)
}
