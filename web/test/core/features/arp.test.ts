// Port of core/src/test/kotlin/dev/arc/ep133/features/ArpTest.kt
import { describe, expect, it } from 'vitest'
import { ARP_ORDERS, Arp, ArpOrder, ArpSettings, arpNote, type ArpNote } from '../../../src/core/features/arp'
import { physicalPad } from '../../../src/core/features/padNotes'
import { Timing } from '../../../src/core/features/pattern'

const keys = physicalPad(0, 0)
const a3 = physicalPad(0, 3)
const b5 = physicalPad(1, 5)
const c = arpNote(keys, 0)
const e = arpNote(keys, 4)
const g = arpNote(keys, 7)

const semis = (notes: readonly ArpNote[]): (number | null)[] => notes.map((n) => n.semitones)
const cycleOf = (held: ArpNote[], order: ArpOrder, octaves: number): (number | null)[] => semis(Arp.cycle(held, order, octaves))

describe('ArpTest', () => {
  it('the orders and their settings words', () => {
    expect(ARP_ORDERS).toEqual([ArpOrder.PLAYED, ArpOrder.UP, ArpOrder.DOWN, ArpOrder.UP_DOWN, ArpOrder.RANDOM])
    expect(ARP_ORDERS).toEqual(['played', 'up', 'down', 'updown', 'random'])
    expect(ArpOrder.of('updown')).toBe(ArpOrder.UP_DOWN)
    expect(ArpOrder.of('sideways')).toBeNull()
  })

  it('one note held plays alone, up the octaves', () => {
    for (const order of ARP_ORDERS) expect(cycleOf([g], order, 1)).toEqual([7])
    expect(cycleOf([g], ArpOrder.PLAYED, 2)).toEqual([7, 19])
    expect(cycleOf([g], ArpOrder.UP, 3)).toEqual([7, 19, 31])
    expect(cycleOf([g], ArpOrder.DOWN, 2)).toEqual([19, 7])
    expect(cycleOf([g], ArpOrder.DOWN, 3)).toEqual([31, 19, 7])
    expect(cycleOf([g], ArpOrder.UP_DOWN, 2)).toEqual([7, 19])
    expect(cycleOf([g], ArpOrder.UP_DOWN, 3)).toEqual([7, 19, 31, 19])
    expect(cycleOf([g], ArpOrder.RANDOM, 3)).toEqual([7, 19, 31])
  })

  it('two notes held', () => {
    // Pressed E then C.
    const held = [e, c]
    expect(cycleOf(held, ArpOrder.PLAYED, 1)).toEqual([4, 0])
    expect(cycleOf(held, ArpOrder.UP, 1)).toEqual([0, 4])
    expect(cycleOf(held, ArpOrder.DOWN, 1)).toEqual([4, 0])
    expect(cycleOf(held, ArpOrder.UP_DOWN, 1)).toEqual([0, 4])
    expect(cycleOf(held, ArpOrder.RANDOM, 1)).toEqual([0, 4])
    expect(cycleOf(held, ArpOrder.PLAYED, 2)).toEqual([4, 0, 16, 12])
    expect(cycleOf(held, ArpOrder.UP, 2)).toEqual([0, 4, 12, 16])
    expect(cycleOf(held, ArpOrder.DOWN, 2)).toEqual([16, 12, 4, 0])
    expect(cycleOf(held, ArpOrder.UP_DOWN, 2)).toEqual([0, 4, 12, 16, 12, 4])
    expect(cycleOf(held, ArpOrder.RANDOM, 2)).toEqual([0, 4, 12, 16])
    expect(cycleOf(held, ArpOrder.PLAYED, 3)).toEqual([4, 0, 16, 12, 28, 24])
    expect(cycleOf(held, ArpOrder.UP, 3)).toEqual([0, 4, 12, 16, 24, 28])
    expect(cycleOf(held, ArpOrder.DOWN, 3)).toEqual([28, 24, 16, 12, 4, 0])
    expect(cycleOf(held, ArpOrder.UP_DOWN, 3)).toEqual([0, 4, 12, 16, 24, 28, 24, 16, 12, 4])
  })

  it('three notes held', () => {
    // Pressed G, C, E.
    const held = [g, c, e]
    expect(cycleOf(held, ArpOrder.PLAYED, 1)).toEqual([7, 0, 4])
    expect(cycleOf(held, ArpOrder.UP, 1)).toEqual([0, 4, 7])
    expect(cycleOf(held, ArpOrder.DOWN, 1)).toEqual([7, 4, 0])
    expect(cycleOf(held, ArpOrder.UP_DOWN, 1)).toEqual([0, 4, 7, 4])
    expect(cycleOf(held, ArpOrder.RANDOM, 1)).toEqual([0, 4, 7])
    expect(cycleOf(held, ArpOrder.PLAYED, 2)).toEqual([7, 0, 4, 19, 12, 16])
    expect(cycleOf(held, ArpOrder.UP, 2)).toEqual([0, 4, 7, 12, 16, 19])
    expect(cycleOf(held, ArpOrder.DOWN, 2)).toEqual([19, 16, 12, 7, 4, 0])
    expect(cycleOf(held, ArpOrder.UP_DOWN, 2)).toEqual([0, 4, 7, 12, 16, 19, 16, 12, 7, 4])
    expect(cycleOf(held, ArpOrder.RANDOM, 2)).toEqual([0, 4, 7, 12, 16, 19])
    expect(cycleOf(held, ArpOrder.PLAYED, 3)).toEqual([7, 0, 4, 19, 12, 16, 31, 24, 28])
    expect(cycleOf(held, ArpOrder.UP, 3)).toEqual([0, 4, 7, 12, 16, 19, 24, 28, 31])
    expect(cycleOf(held, ArpOrder.DOWN, 3)).toEqual([31, 28, 24, 19, 16, 12, 7, 4, 0])
    expect(cycleOf(held, ArpOrder.UP_DOWN, 3)).toEqual([0, 4, 7, 12, 16, 19, 24, 28, 31, 28, 24, 19, 16, 12, 7, 4])
  })

  it('nothing held is an empty cycle', () => {
    for (const order of ARP_ORDERS) expect(Arp.cycle([], order, 3)).toEqual([])
  })

  it('notes keep their pad and velocity; the same pitch stays in press order', () => {
    const loud = arpNote(a3, 4, 90)
    const soft = arpNote(b5, 4, 20)
    const up = Arp.cycle([loud, soft, c], ArpOrder.UP, 2)
    expect(up).toEqual([c, loud, soft, arpNote(keys, 12), arpNote(a3, 16, 90), arpNote(b5, 16, 20)])
  })

  it('PADS hits are never transposed or doubled', () => {
    const p1 = arpNote(a3, null, 100)
    const p2 = arpNote(b5, null)
    for (const order of [ArpOrder.PLAYED, ArpOrder.UP, ArpOrder.RANDOM]) {
      expect(Arp.cycle([p1, p2], order, 3)).toEqual([p1, p2])
    }
    expect(Arp.cycle([p1, p2], ArpOrder.DOWN, 3)).toEqual([p2, p1])
    expect(Arp.cycle([p1, p2], ArpOrder.UP_DOWN, 3)).toEqual([p1, p2])
    // With a KEYS note: the hit counts as the root, and is there once.
    expect(semis(Arp.cycle([e, p1], ArpOrder.UP, 2))).toEqual([null, 4, 16])
    expect(semis(Arp.cycle([e, p1], ArpOrder.PLAYED, 2))).toEqual([4, null, 16])
  })

  it('each step plays the cycle in turn', () => {
    const cycle = Arp.cycle([g, c, e], ArpOrder.UP, 1)
    const steps = [0, 1, 2, 3, 4, 5, 6, 7].map((s) => Arp.noteAt(s, cycle, ArpOrder.UP, 7)?.semitones)
    expect(steps).toEqual([0, 4, 7, 0, 4, 7, 0, 4])
    expect(Arp.noteAt(-1, cycle, ArpOrder.UP, 7)).toEqual(g)
    expect(Arp.noteAt(3_000_000_001, cycle, ArpOrder.PLAYED, 7)).toEqual(e)
    expect(Arp.noteAt(0, [], ArpOrder.UP, 7)).toBeNull()
    expect(Arp.noteAt(0, [], ArpOrder.RANDOM, 7)).toBeNull()
  })

  it('RANDOM picks the same notes in Kotlin and on the web', () => {
    const six = Arp.cycle([c, e, g], ArpOrder.RANDOM, 2)
    const at = (cycle: ArpNote[], seed: number, steps: number[]): number[] =>
      steps.map((s) => cycle.indexOf(Arp.noteAt(s, cycle, ArpOrder.RANDOM, seed)!))
    expect(at(six, 7, [0, 1, 2, 3, 4, 5, 6, 7])).toEqual([1, 1, 0, 5, 5, 4, 3, 3])
    const three = Arp.cycle([c, e, g], ArpOrder.RANDOM, 1)
    expect(at(three, 7, [0, 1, 2, 3, 4, 5, 6, 7])).toEqual([1, 1, 0, 2, 2, 1, 0, 0])
    const five = [0, 1, 2, 3, 4].map((s) => arpNote(keys, s))
    expect(at(five, 7, [0, 1, 2, 3, 4, 5, 6, 7])).toEqual([3, 2, 0, 3, 2, 0, 3, 2])
    expect(at(five, 7, [-1, -2])).toEqual([4, 1])
    // A step before the run and one past 2^32 (only its low 32 bits count).
    expect(at(six, 7, [-1, 4_294_967_296, 4_294_967_299])).toEqual([1, 1, 5])
    // The same seed and step, the same note.
    expect(Arp.noteAt(12, six, ArpOrder.RANDOM, 99)).toBe(Arp.noteAt(12, six, ArpOrder.RANDOM, 99))
  })

  it('RPT retriggers every held pad', () => {
    const held = [arpNote(a3, null), arpNote(b5, null, 64)]
    expect(Arp.repeatNotes(held)).toBe(held)
  })

  it('the gate is a share of the step, at least a tick', () => {
    expect(Arp.gateTicks(Timing.SIXTEENTH, 50)).toBe(12)
    expect(Arp.gateTicks(Timing.SIXTEENTH, 100)).toBe(24)
    expect(Arp.gateTicks(Timing.SIXTEENTH, 10)).toBe(2)
    expect(Arp.gateTicks(Timing.SIXTEENTH_T, 33)).toBe(5)
    expect(Arp.gateTicks(Timing.THIRTY_SECOND, 10)).toBe(1)
    expect(Arp.gateTicks(Timing.WHOLE, 75)).toBe(288)
    expect(Arp.gateTicks(Timing.OFF, 50)).toBe(1)
  })

  it('velocity is heard as its square', () => {
    expect(Arp.velocityGain(127)).toBe(1)
    expect(Arp.velocityGain(200)).toBe(1)
    expect(Arp.velocityGain(64)).toBeCloseTo((64 / 127) ** 2, 6)
    expect(Arp.velocityGain(0)).toBeCloseTo((1 / 127) ** 2, 9)
    expect(Arp.velocityGain(1)).toBe(Arp.velocityGain(0))
  })

  it('the settings, held to their ranges', () => {
    expect(ArpSettings.DEFAULT).toEqual({ order: ArpOrder.PLAYED, octaves: 1, gate: 50, latch: false })
    const s = ArpSettings.DEFAULT
    expect(ArpSettings.withOrder(s, ArpOrder.UP_DOWN).order).toBe(ArpOrder.UP_DOWN)
    expect(ArpSettings.withOctaves(s, 2).octaves).toBe(2)
    expect(ArpSettings.withOctaves(s, 0).octaves).toBe(1)
    expect(ArpSettings.withOctaves(s, 5).octaves).toBe(3)
    expect(ArpSettings.withGate(s, 80).gate).toBe(80)
    expect(ArpSettings.withGate(s, 5).gate).toBe(10)
    expect(ArpSettings.withGate(s, 120).gate).toBe(100)
    expect(ArpSettings.withLatch(s, true).latch).toBe(true)
  })
})
