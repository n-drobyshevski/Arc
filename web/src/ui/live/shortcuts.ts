// The device view's shortcut cards (web only): a key's combinations from the
// shortcut guide (core/text/guideData.ts, GuideText.kt), those that use the
// key, shortest first.
import { filter, type GuideEntry } from '../../core/text/guideText'

/** The device's keys and controls that open a shortcuts card. */
export type CardKey =
  | 'SOUND'
  | 'MAIN'
  | 'TEMPO'
  | 'SAMPLE'
  | 'TIMING'
  | 'FX'
  | 'ERASE'
  | 'SHIFT'
  | 'FADER'
  | 'KNOBX'
  | 'KNOBY'
  | 'PLAY'
  | 'VOLUME'

/** How each key is named in the guide's combos, and on the card. */
const KEYS: Record<CardKey, { readonly match: RegExp | null; readonly name: string; readonly search: string }> = {
  SOUND: { match: /\bSOUND\b/, name: 'SOUND', search: 'SOUND' },
  MAIN: { match: /\bMAIN\b/, name: 'MAIN', search: 'MAIN' },
  TEMPO: { match: /\bTEMPO\b/, name: 'TEMPO', search: 'TEMPO' },
  SAMPLE: { match: /\bSAMPLE\b/, name: 'SAMPLE', search: 'SAMPLE' },
  TIMING: { match: /\bTIMING\b/, name: 'TIMING', search: 'TIMING' },
  FX: { match: /\bFX\b/, name: 'FX', search: 'FX' },
  ERASE: { match: /\bERASE\b/, name: 'ERASE', search: 'ERASE' },
  SHIFT: { match: /\bSHIFT\b/, name: 'SHIFT', search: 'SHIFT' },
  FADER: { match: /\bFADER\b/, name: 'FADER', search: 'FADER' },
  KNOBX: { match: /KNOB ?X\b/, name: 'Knob X', search: 'knob X' },
  KNOBY: { match: /KNOB ?Y\b/, name: 'Knob Y', search: 'knob Y' },
  PLAY: { match: /\bPLAY\b/, name: 'PLAY', search: 'PLAY' },
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
