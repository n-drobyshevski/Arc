// Port of core/src/test/kotlin/dev/arc/ep133/features/StepsTest.kt
import { describe, expect, it } from 'vitest'
import { TIMING_INTERVALS, Timing, pattern, patternNote } from '../../../src/core/features/pattern'
import { Steps } from '../../../src/core/features/steps'

const sixteenth = Timing.SIXTEENTH
const eighth = Timing.EIGHTH
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

describe('StepsTest', () => {
  it('a bar has a whole number of steps at every interval', () => {
    expect(TIMING_INTERVALS.map((t) => Steps.count(pattern(1), t))).toEqual([1, 2, 4, 8, 12, 16, 24, 32])
    expect(TIMING_INTERVALS.map((t) => Steps.count(pattern(2), t))).toEqual([2, 4, 8, 16, 24, 32, 48, 64])
  })

  it("a step's tick is on the swung grid, and gives the step back", () => {
    expect(range(4).map((s) => Steps.tickOf(s, sixteenth, 50))).toEqual([0, 24, 48, 72])
    // At 75 the odd steps play half a step late; at 60 a fifth.
    expect(range(4).map((s) => Steps.tickOf(s, sixteenth, 75))).toEqual([0, 36, 48, 84])
    expect(Steps.tickOf(1, sixteenth, 60)).toBe(29)
    expect(range(4).map((s) => Steps.tickOf(s, eighth, 75))).toEqual([0, 72, 96, 168])
    for (const t of [sixteenth, eighth]) {
      for (const swing of [50, 75]) {
        const count = Steps.count(pattern(2), t)
        for (const step of range(count)) expect(Steps.indexOf(Steps.tickOf(step, t, swing), t, swing, count)).toBe(step)
      }
    }
    // Off the grid: the nearest swung point, ties to the later one.
    expect(Steps.indexOf(30, sixteenth, 75, 16)).toBe(1)
    expect(Steps.indexOf(42, sixteenth, 75, 16)).toBe(2)
    expect(Steps.indexOf(17, sixteenth, 75, 16)).toBe(0)
    expect(Steps.indexOf(35, sixteenth, 50, 16)).toBe(1)
    expect(Steps.indexOf(36, sixteenth, 50, 16)).toBe(2)
  })

  it('triplets have no swing', () => {
    expect(Steps.count(pattern(1), Timing.EIGHTH_T)).toBe(12)
    expect(range(3).map((s) => Steps.tickOf(s, Timing.EIGHTH_T, 75))).toEqual([0, 32, 64])
    expect(Steps.indexOf(47, Timing.EIGHTH_T, 75, 12)).toBe(1)
    expect(Steps.indexOf(48, Timing.EIGHTH_T, 75, 12)).toBe(2)
    expect(Steps.tickOf(5, Timing.SIXTEENTH_T, 50)).toBe(80)
    expect(Steps.indexOf(88, Timing.SIXTEENTH_T, 50, 24)).toBe(6)
  })

  it('a note near the end rounds up to step 0', () => {
    expect(Steps.indexOf(371, sixteenth, 50, 16)).toBe(15)
    expect(Steps.indexOf(372, sixteenth, 50, 16)).toBe(0)
    expect(Steps.indexOf(380, sixteenth, 50, 16)).toBe(0)
    // Swung, step 15 is at 372.
    expect(Steps.indexOf(377, sixteenth, 75, 16)).toBe(15)
    expect(Steps.indexOf(380, sixteenth, 75, 16)).toBe(0)
    // The cursor wraps as − / + do.
    expect([-1, 16, 5].map((s) => Steps.clampStep(s, 16))).toEqual([15, 0, 5])
  })

  it('the notes on a step are those that play there', () => {
    const p = pattern(1, [patternNote(0, 3, 24), patternNote(384, 3, 24), patternNote(10, 4, 24, 2), patternNote(30, 5, 24), patternNote(380, 6, 24)])
    // 384 is past the end: on no step. 380 rounds up to step 0.
    expect(Steps.notesOn(p, 0, sixteenth, 50).map((n) => n.tick)).toEqual([0, 10, 380])
    expect(Steps.notesOn(p, 1, sixteenth, 50).map((n) => n.tick)).toEqual([30])
    expect(Steps.occupied(p, sixteenth, 50)).toEqual([true, true, ...Array<boolean>(14).fill(false)])
    expect(Steps.padsOn(p, 0, sixteenth, 50)).toEqual(new Set([Steps.padKey(3, null), Steps.padKey(4, 2), Steps.padKey(6, null)]))
    expect(Steps.padsOn(p, 0, sixteenth, 50)).toEqual(new Set(['3:n', '4:2', '6:n']))
    expect(Steps.padsOn(p, 2, sixteenth, 50)).toEqual(new Set())
    expect(Steps.occupied(p, Timing.QUARTER, 50)).toEqual([true, false, false, false])
  })

  it('the cursor keeps its place when the interval changes', () => {
    expect(Steps.convert(5, sixteenth, eighth)).toBe(2)
    expect(Steps.convert(2, eighth, sixteenth)).toBe(4)
    expect(Steps.convert(7, sixteenth, Timing.EIGHTH_T)).toBe(5)
    expect(Steps.convert(3, Timing.EIGHTH_T, sixteenth)).toBe(4)
    expect(Steps.convert(15, sixteenth, Timing.WHOLE)).toBe(0)
  })
})
