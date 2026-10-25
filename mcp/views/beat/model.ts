// What the beat view draws and plays, worked out from a parsed ARC BEAT card
// (web/src/core/formats/beatCard.ts): the rows of each section with the
// stand-in voice each pad gets, and the hits the player schedules.
//
// Rows: every grid row of a section, then one row for each pad that only the
// notes list plays. Notes show on the step nearest their tick, on their pad's
// row where that step is free.
//
// Voices: from the row's label first (kick, snare, open hat …), then the
// pad's sound line slot (the factory ranges of references/beat-card.md: kicks
// 1-99, snares 100-199, hats 200-299, percussion 300-399, bass 400-499,
// melodic 500-599), then the pad's place: group A as the arc-beats cards lay
// it out (7-9 kicks, 6 clap, 5 open hat, 4 closed hat, the rest percussion),
// B bass, C keys, D percussion.
//
// Hits: a grid hit plays at stepTick (swing included) for len steps; a note at
// its tick for its gate, never swung. Two hits on one pad at one tick and one
// pitch keep the louder, as the device does (the card gets a warning for
// them); a chord's notes differ in pitch, so they all play.

import {
  stepTick,
  type BeatCardGroup,
  type BeatCardNote,
  type BeatCardResult,
  type BeatCardRow,
} from '../../../web/src/core/formats/beatCard'

export type Voice = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'perc' | 'tom' | 'bass' | 'keys'

export interface ViewRow {
  /** Unique within the card (a pad may have two grid rows). */
  readonly key: string
  /** A7, AENTER …: mute and solo go by pad. */
  readonly pad: string
  readonly label: string
  readonly voice: Voice
  /** One entry per step: the velocity of a hit starting there, else 0. */
  readonly vel: readonly number[]
  /** One entry per step: the hit's length in steps, else 0. */
  readonly len: readonly number[]
  /** Velocity of a notes-list note shown on this step (0 for none). */
  readonly noteVel: readonly number[]
  /** A row only the notes list plays. */
  readonly notesOnly: boolean
}

export interface ViewGroup {
  readonly group: BeatCardGroup
  readonly rows: readonly ViewRow[]
  readonly notes: number
}

export interface Hit {
  readonly tick: number
  readonly pad: string
  readonly voice: Voice
  readonly vel: number
  readonly gate: number
  /** The KEYS note's semitone from C4; null for a grid hit or a pad hit. Doubles fold by pad, tick and semi. */
  readonly semi: number | null
  /** MIDI note the stand-in plays at, for pitched voices; null for the voice's own. */
  readonly midi: number | null
}

/** The voice a row label names, or null. Whole words, so "kick 2" and "closed hat" work. */
export function voiceFromLabel(label: string): Voice | null {
  const w = label.toLowerCase()
  const has = (re: RegExp): boolean => re.test(w)
  if (has(/\bopen\b|\boh\b/)) return 'openhat'
  if (has(/\bkick|\bbd\b|bass ?drum/)) return 'kick'
  if (has(/\bbass|\bsub\b|\b808\b|\breese/)) return 'bass'
  if (has(/\bsnare|\bsd\b/)) return 'snare'
  if (has(/\bclap|\bsnap/)) return 'clap'
  if (has(/hat\b|hats\b|\bhh\b|\bch\b|shaker|\bride|\bcymbal|\bcrash|tamb/)) return 'hat'
  if (has(/\btom\b|\btoms\b/)) return 'tom'
  if (has(/\bkeys?\b|chord|stab|piano|synth|\blead|\bmel|\bpad\b|organ|\bbell|pluck|\barp/)) return 'keys'
  if (has(/\brim|perc|cowbell|conga|bongo|clave|wood|block|siren|shout|vox|fx\b|loop/)) return 'perc'
  return null
}

/** The voice a sound slot's factory range suggests, or null. */
export function voiceFromSlot(slot: number): Voice | null {
  if (slot >= 1 && slot <= 99) return 'kick'
  if (slot >= 100 && slot <= 199) return 'snare'
  if (slot >= 200 && slot <= 299) return 'hat'
  if (slot >= 300 && slot <= 399) return 'perc'
  if (slot >= 400 && slot <= 499) return 'bass'
  if (slot >= 500 && slot <= 599) return 'keys'
  return null
}

/** The voice a pad gets with nothing else to go on (offset: '.', '0', ENTER, '1' … '9' = 0 … 11). */
export function voiceFromPad(group: string, offset: number): Voice {
  if (group === 'B') return 'bass'
  if (group === 'C') return 'keys'
  if (group === 'D') return 'perc'
  if (offset >= 9) return 'kick'
  if (offset === 8) return 'clap'
  if (offset === 7) return 'openhat'
  if (offset === 6) return 'hat'
  return 'perc'
}

function voiceOf(card: BeatCardResult, group: string, pad: string, offset: number, label: string): Voice {
  const sound = card.sounds.find((s) => s.group === group && s.pad === pad)
  return (
    voiceFromLabel(label) ??
    (sound ? (voiceFromLabel(sound.name) ?? voiceFromSlot(sound.slot)) : null) ??
    voiceFromPad(group, offset)
  )
}

/** The step a note shows on: the nearest, inside the pattern. */
function noteStep(g: BeatCardGroup, n: BeatCardNote): number {
  return Math.min(g.steps - 1, Math.max(0, Math.round(n.tick / g.stepTicks)))
}

export function viewGroups(card: BeatCardResult): ViewGroup[] {
  return card.groups.map((g) => {
    const notes = card.notes.filter((n) => n.group === g.group)
    const rows: ViewRow[] = g.rows.map((r: BeatCardRow) => ({
      key: `${r.pad}@${r.line}`,
      pad: r.pad,
      label: r.label,
      voice: voiceOf(card, g.group, r.pad, r.offset, r.label),
      vel: r.vel,
      len: r.len,
      noteVel: new Array<number>(g.steps).fill(0),
      notesOnly: false,
    }))
    for (const n of notes) {
      let row = rows.find((r) => r.pad === n.pad)
      if (!row) {
        const empty = new Array<number>(g.steps).fill(0)
        row = {
          key: `${n.pad}@notes`,
          pad: n.pad,
          label: '',
          voice: voiceOf(card, g.group, n.pad, n.offset, ''),
          vel: empty,
          len: empty,
          noteVel: new Array<number>(g.steps).fill(0),
          notesOnly: true,
        }
        rows.push(row)
      }
      const k = noteStep(g, n)
      const marks = row.noteVel as number[]
      if (!row.vel[k]) marks[k] = Math.max(marks[k] ?? 0, n.vel)
    }
    return { group: g, rows, notes: notes.length }
  })
}

const PITCHED: readonly Voice[] = ['bass', 'keys']

/** Every hit of one section in one loop, sorted by tick, with doubles (pad, tick, semi) folded to the louder. */
export function groupHits(card: BeatCardResult, view: ViewGroup, swing: number): Hit[] {
  const g = view.group
  const byKey = new Map<string, Hit>()
  const add = (h: Hit): void => {
    const key = `${h.pad}:${h.tick}:${h.semi ?? 'pad'}`
    const had = byKey.get(key)
    if (!had || h.vel > had.vel) byKey.set(key, h)
  }
  for (const row of view.rows) {
    for (let k = 0; k < g.steps; k++) {
      const vel = row.vel[k] ?? 0
      if (vel <= 0) continue
      add({
        tick: stepTick(g, k, swing),
        pad: row.pad,
        voice: row.voice,
        vel,
        gate: (row.len[k] ?? 1) * g.stepTicks,
        semi: null,
        midi: null,
      })
    }
  }
  for (const n of card.notes) {
    if (n.group !== g.group) continue
    const voice = view.rows.find((r) => r.pad === n.pad)?.voice ?? voiceFromPad(g.group, n.offset)
    const midi = n.semi !== null && PITCHED.includes(voice) ? 60 + n.semi : null
    add({ tick: n.tick, pad: n.pad, voice, vel: n.vel, gate: n.gate, semi: n.semi, midi })
  }
  return [...byKey.values()].sort((a, b) => a.tick - b.tick)
}

/** Whether a pad sounds: not muted, and soloed when anything is. */
export function audible(pad: string, muted: ReadonlySet<string>, soloed: ReadonlySet<string>): boolean {
  if (soloed.size > 0) return soloed.has(pad)
  return !muted.has(pad)
}

/** Does this look like a parse result (a tool result's structuredContent)? */
export function isBeatCardResult(x: unknown): x is BeatCardResult {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  return typeof r.valid === 'boolean' && Array.isArray(r.groups) && Array.isArray(r.errors) && Array.isArray(r.notes)
}
