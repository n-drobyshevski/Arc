// Web addition: PracticePlan.kt's helpers (Kotlin has no test of them): the lane's order of the pads, and the group a
// practice of the scene takes.
import { describe, expect, it } from 'vitest'
import { pattern, patternNote, projectPatterns } from '../../src/core/features/pattern'
import { keypadOrder, practiceGroup } from '../../src/state/practicePlan'

describe('PracticePlan', () => {
  it('lists the pads in the keypad order, top row first: 7 8 9, 4 5 6, 1 2 3, . 0 ENTER', () => {
    // Offsets: '.' 0, '0' 1, ENTER 2, '1' 3 ... '9' 11.
    expect(keypadOrder([0, 2, 3, 11, 7])).toEqual([11, 7, 3, 0, 2])
    expect(keypadOrder(new Set<number>())).toEqual([])
  })

  it("takes the group shown when it has pad hits, else the first that has, KEYS notes not counting", () => {
    const keysOnly = pattern(1, [patternNote(0, 3, 24, 4)])
    const hits = pattern(1, [patternNote(0, 3, 24)])
    const p = projectPatterns([keysOnly, pattern(), hits, hits])
    expect(practiceGroup(p, 3)).toBe(3)
    expect(practiceGroup(p, 0)).toBe(2)
    expect(practiceGroup(p, 1)).toBe(2)
    // Out of range, kept in it; with no hits anywhere, the group shown.
    expect(practiceGroup(p, 7)).toBe(3)
    expect(practiceGroup(projectPatterns(), 1)).toBe(1)
  })
})
