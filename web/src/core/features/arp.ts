// Port of core/src/main/kotlin/dev/arc/ep133/features/Arp.kt
//
// The arpeggiator and note repeat, as the EP-133's TIMING gives them: hold
// TIMING and several KEYS notes and they play one at a time at the TIMING
// interval (ARP); in PADS mode every held pad retriggers on each step (RPT).
// This is what plays when; the phone's scheduler plays it.
//
// Web deltas:
// - The enum class ArpOrder is a string union of its `id`s plus a const
//   object of the same name (`order.id` is `order`); `ArpOrder.entries` is
//   ARP_ORDERS.
// - The data classes are plain readonly interfaces built by `arpNote()` and
//   `ArpSettings.of()` with the Kotlin defaults; ArpSettings' methods are
//   functions taking the value first (`s.withGate(g)` is
//   `ArpSettings.withGate(s, g)`).
// - The web has no arp scheduler: this is the core logic only.

import type { PhysicalPad } from './padNotes'
import { timingTicks, type Timing } from './pattern'

/**
 * The order held notes play in: as they were pressed, by pitch up, down, up
 * then down, or at random among them. [id] is the word kept in settings.
 */
export type ArpOrder = 'played' | 'up' | 'down' | 'updown' | 'random'

/** ArpOrder.entries, in declaration order. */
export const ARP_ORDERS: readonly ArpOrder[] = ['played', 'up', 'down', 'updown', 'random']

export const ArpOrder = {
  PLAYED: 'played',
  UP: 'up',
  DOWN: 'down',
  UP_DOWN: 'updown',
  RANDOM: 'random',
  of(id: string): ArpOrder | null {
    return (ARP_ORDERS as readonly string[]).includes(id) ? (id as ArpOrder) : null
  },
} as const

/**
 * How the arp plays: in [order], over [octaves] (1..3), each note held for
 * [gate] percent of the step (10..100), and [latch]ed: the notes keep playing
 * once let go of, until a new press after every finger is up.
 */
export interface ArpSettings {
  readonly order: ArpOrder
  readonly octaves: number
  readonly gate: number
  readonly latch: boolean
}

const MIN_OCTAVES = 1
const MAX_OCTAVES = 3
const MIN_GATE = 10
const MAX_GATE = 100

const coerceIn = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/** Settings: [fields] over the defaults (Kotlin's ArpSettings constructor). */
function of(fields: Partial<ArpSettings> = {}): ArpSettings {
  const s = { order: ArpOrder.PLAYED as ArpOrder, octaves: 1, gate: 50, latch: false, ...fields }
  return { order: s.order, octaves: s.octaves, gate: s.gate, latch: s.latch }
}

function withOrder(s: ArpSettings, order: ArpOrder): ArpSettings {
  return { ...s, order }
}

/** Over [octaves], 1..3. */
function withOctaves(s: ArpSettings, octaves: number): ArpSettings {
  return { ...s, octaves: coerceIn(octaves, MIN_OCTAVES, MAX_OCTAVES) }
}

/** Each note held for [gate] percent of the step, 10..100. */
function withGate(s: ArpSettings, gate: number): ArpSettings {
  return { ...s, gate: coerceIn(gate, MIN_GATE, MAX_GATE) }
}

function withLatch(s: ArpSettings, latch: boolean): ArpSettings {
  return { ...s, latch }
}

export const ArpSettings = { MIN_OCTAVES, MAX_OCTAVES, MIN_GATE, MAX_GATE, DEFAULT: of(), of, withOrder, withOctaves, withGate, withLatch } as const

/**
 * A note held for the arp: [pad], the KEYS note's [semitones] from the root
 * (null for a PADS hit) and its [velocity] (1..127, from the pressure).
 */
export interface ArpNote {
  readonly pad: PhysicalPad
  readonly semitones: number | null
  readonly velocity: number
}

export function arpNote(pad: PhysicalPad, semitones: number | null, velocity = 127): ArpNote {
  return { pad, semitones, velocity }
}

/** The pitch notes sort by: a PADS hit counts as the root. */
const pitch = (n: ArpNote): number => n.semitones ?? 0

/**
 * The notes [held] (in press order) give, one cycle of them, in [order]
 * over [octaves]: each octave up adds every KEYS note again 12 semitones
 * higher (a PADS hit is never transposed, so it is there once). UP sorts by
 * pitch (ties in press order) and DOWN is UP backwards; UP_DOWN goes up then
 * back down without playing the ends twice (C E G E); RANDOM picks from the
 * UP list (noteAt).
 */
function cycle(held: readonly ArpNote[], order: ArpOrder, octaves: number): ArpNote[] {
  const base = order === ArpOrder.PLAYED ? [...held] : [...held].sort((a, b) => pitch(a) - pitch(b))
  const notes: ArpNote[] = []
  for (let o = 0; o < coerceIn(octaves, MIN_OCTAVES, MAX_OCTAVES); o++) {
    for (const n of base) {
      if (n.semitones === null) {
        if (o === 0) notes.push(n)
      } else {
        notes.push(o === 0 ? n : { ...n, semitones: n.semitones + 12 * o })
      }
    }
  }
  switch (order) {
    case ArpOrder.DOWN:
      return notes.reverse()
    case ArpOrder.UP_DOWN:
      return notes.length <= 2 ? notes : [...notes, ...notes.slice(1, -1).reverse()]
    default:
      return notes
  }
}

/**
 * The note [cycle] plays at [step] (counted from the run's start), or null
 * with nothing held: the cycle in turn, or for RANDOM one picked by [seed]
 * and the step, the same in Kotlin and here.
 */
function noteAt(step: number, cycle: readonly ArpNote[], order: ArpOrder, seed: number): ArpNote | null {
  if (cycle.length === 0) return null
  const i = order === ArpOrder.RANDOM ? lcg(seed, step) % cycle.length : floorMod(step, cycle.length)
  return cycle[i]!
}

/** RPT, in PADS mode: every held pad retriggers together on each step. */
function repeatNotes(held: readonly ArpNote[]): readonly ArpNote[] {
  return held
}

/** How long a step's note sounds: [gate] percent of [interval], at least a tick. */
function gateTicks(interval: Timing, gate: number): number {
  return Math.max(1, Math.trunc((timingTicks(interval) * gate + 50) / 100))
}

/** The gain [velocity] (1..127) plays at: its square, so 127 is exactly 1. */
function velocityGain(velocity: number): number {
  const v = Math.fround(coerceIn(velocity, 1, 127) / 127)
  return Math.fround(v * v)
}

export const Arp = { cycle, noteAt, repeatNotes, gateTicks, velocityGain } as const

/**
 * Two steps of a 32-bit LCG from [seed] xor [step] (Kotlin's Int overflow is
 * Math.imul and `| 0` here), its upper 24 bits: never negative.
 */
function lcg(seed: number, step: number): number {
  let x = (seed ^ (step | 0)) | 0
  x = (Math.imul(x, 1664525) + 1013904223) | 0
  x = (Math.imul(x, 1664525) + 1013904223) | 0
  return x >>> 8
}

function floorMod(x: number, m: number): number {
  return x - Math.floor(x / m) * m
}
