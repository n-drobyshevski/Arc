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
//
// Pad shaping: a hit on a pad with a pad line carries the pad's settings as
// the synth plays them (Shape). Pitch moves a bass or keys note by its
// semitones and scales a drum voice's frequencies by 2^(pitch/12); level is a
// gain, pan -1..1, attack and release seconds (ticks of about 10 ms). A pad
// without a pad line has no shape and plays as it always has.
//
// Scenes: sceneCard gives one scene as a card of its own, the patterns its
// groups play (beatCard.ts scenePatterns: its own sections, or the ones it
// carries from the scenes before) with each section's notes, sound and pad
// lines, so the rows, voices and hits above work per scene unchanged. A card
// without scene lines is its own one scene. sceneSteps and chainSteps turn the
// scenes into what the player plays: one scene looped, or the chain.

import {
  KEY_RELEASE,
  cardScenes,
  playOrder,
  scenePatterns,
  sceneTicks,
  stepTick,
  type BeatCardGroup,
  type BeatCardNote,
  type BeatCardPad,
  type BeatCardResult,
  type BeatCardRow,
  type PlayMode,
} from '../../../web/src/core/formats/beatCard'
import type { Loop, Step } from './player'

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
  /** The pad's pad line (merged), or null when it has none. */
  readonly shaping: BeatCardPad | null
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
  /** The pad's shaping; absent for a pad without a pad line. */
  readonly shape?: Shape
}

/** A pad line as the synth plays it. */
export interface Shape {
  /** Frequency factor of a drum voice, 2^(pitch/12); 1 on bass and keys, whose midi carries the pitch. */
  readonly rate: number
  /** Gain, level / 100. */
  readonly level: number
  /** -1 (left) .. 1 (right): pan / 16. */
  readonly pan: number
  /** Fade-in, seconds. */
  readonly attack: number
  /** Fade-out after the gate in key and legato, seconds. */
  readonly release: number
  readonly mode: PlayMode
}

/** Voices that play a note's pitch; the rest are drums. */
const PITCHED: readonly Voice[] = ['bass', 'keys']

/** The note a bass or keys stand-in plays when the hit gives none (a grid hit). */
export const OWN_MIDI = { bass: 36, keys: 60 } as const

/** An envelope tick of the pad sheet, about 10 ms (beat-card.md: not verified on the device). */
const ENVELOPE_TICK_S = 0.01

/** The effect lines the synth plays; null for a kind the card has no line for. */
export type CardFx = Pick<BeatCardResult, 'fx' | 'sends' | 'comp' | 'sidechain'>

/** The card's effect lines (null for each when the result has none, as an older result may). */
export function cardFx(card: BeatCardResult): CardFx {
  return { fx: card.fx ?? null, sends: card.sends ?? null, comp: card.comp ?? null, sidechain: card.sidechain ?? null }
}

/** Does the card have any effect line? */
export function hasFx(fx: CardFx): boolean {
  return fx.fx !== null || fx.sends !== null || fx.comp !== null || fx.sidechain !== null
}

/** The pad line of [pad], or null. */
export function padShaping(card: BeatCardResult, pad: string): BeatCardPad | null {
  return (card.pads ?? []).find((p) => p.pad === pad) ?? null
}

/** A pad line as the synth plays it on [voice]. */
export function shapeOf(p: BeatCardPad, voice: Voice): Shape {
  const mode = p.mode ?? 'oneshot'
  return {
    rate: PITCHED.includes(voice) ? 1 : 2 ** ((p.pitch ?? 0) / 12),
    level: (p.level ?? 100) / 100,
    pan: (p.pan ?? 0) / 16,
    attack: (p.attack ?? 0) * ENVELOPE_TICK_S,
    release: (p.release ?? (mode === 'oneshot' ? 0 : KEY_RELEASE)) * ENVELOPE_TICK_S,
    mode,
  }
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
      shaping: padShaping(card, r.pad),
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
          shaping: padShaping(card, n.pad),
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

/** [hit] with its pad's shaping: the shape, and a bass or keys note moved by the pitch. */
function shaped(card: BeatCardResult, hit: Hit): Hit {
  const p = padShaping(card, hit.pad)
  if (p === null) return hit
  const pitch = p.pitch ?? 0
  const pitched = hit.voice === 'bass' || hit.voice === 'keys'
  const midi = pitched && pitch !== 0 ? (hit.midi ?? OWN_MIDI[hit.voice]) + pitch : hit.midi
  return { ...hit, midi, shape: shapeOf(p, hit.voice) }
}

/** Every hit of one section in one loop, sorted by tick, with doubles (pad, tick, semi) folded to the louder. */
export function groupHits(card: BeatCardResult, view: ViewGroup, swing: number): Hit[] {
  const g = view.group
  const byKey = new Map<string, Hit>()
  const add = (h: Hit): void => {
    const key = `${h.pad}:${h.tick}:${h.semi ?? 'pad'}`
    const had = byKey.get(key)
    if (!had || h.vel > had.vel) byKey.set(key, shaped(card, h))
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

/**
 * Scene [i] of [card] as a card of its own: the groups are the patterns the
 * scene plays, each with its own section's notes, sound and pad lines. A card
 * without scene lines is returned as it is.
 */
export function sceneCard(card: BeatCardResult, i: number): BeatCardResult {
  const scenes = cardScenes(card)
  if (scenes.length === 1) return card
  const patterns = scenePatterns(card, i)
  const from = <T extends { readonly group: string }>(list: (s: (typeof scenes)[number]) => readonly T[]): T[] =>
    patterns.flatMap((p) => list(scenes[p.scene]!).filter((x) => x.group === p.group.group))
  return {
    ...card,
    groups: patterns.map((p) => p.group),
    notes: from((s) => s.notes),
    sounds: from((s) => s.sounds),
    pads: from((s) => s.pads),
  }
}

/** The sections of scene [i] as the player loops them. */
export function sceneLoops(card: BeatCardResult, i: number, swing: number): Loop[] {
  const scene = sceneCard(card, i)
  return viewGroups(scene).map((v) => ({ length: v.group.length, hits: groupHits(scene, v, swing) }))
}

/** Scene [i] looped by hand: one step that never ends. */
export function sceneSteps(card: BeatCardResult, i: number, swing: number): Step[] {
  return [{ scene: i, loops: sceneLoops(card, i, swing), length: sceneTicks(card, i), passes: Infinity }]
}

/** The chain's steps (each scene once, in order, without a chain line), each scene's loops built once. */
export function chainSteps(card: BeatCardResult, swing: number): Step[] {
  const loops = new Map<number, Loop[]>()
  return playOrder(card).map(({ scene, passes }) => {
    if (!loops.has(scene)) loops.set(scene, sceneLoops(card, scene, swing))
    return { scene, loops: loops.get(scene)!, length: sceneTicks(card, scene), passes }
  })
}

/** The first step of [steps] that plays [scene], else 0: where Play starts the chain (beat-card.md, "Chains in Arc"). */
export function firstStepOf(steps: readonly Step[], scene: number): number {
  return Math.max(0, steps.findIndex((s) => s.scene === scene))
}
