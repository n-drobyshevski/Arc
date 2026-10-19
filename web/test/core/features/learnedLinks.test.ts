// Port of core/src/test/kotlin/dev/arc/ep133/features/LearnedLinksTest.kt
import { describe, expect, it } from 'vitest'
import { LearnedLinks } from '../../../src/core/features/learnedLinks'

const map = (o: [number, number][]): Map<number, number> => new Map(o)

describe('LearnedLinksTest', () => {
  it('parse skips junk and out-of-range pairs, format round-trips', () => {
    const m = LearnedLinks.parse('0:10,1:11,x:1,12:3,2:13,3')
    expect(m).toEqual(map([[0, 10], [1, 11]]))
    expect(LearnedLinks.parse(LearnedLinks.format(m))).toEqual(m)
    expect(LearnedLinks.parse(null)).toEqual(new Map())
  })

  it('a restore keeps what was learned here and stays one to one', () => {
    const restored = map([[0, 10], [1, 11], [2, 12]])
    // Learned after the reinstall: key 1 again (the same), key 5 as pad 12.
    const local = map([[1, 11], [5, 12]])
    // Key 2's restored pad 12 now belongs to key 5, so it goes.
    expect(LearnedLinks.merge(restored, local)).toEqual(map([[0, 10], [1, 11], [5, 12]]))
    expect(LearnedLinks.merge(restored, new Map())).toEqual(restored)
  })

  it('offline, numbers unlearned pads from the top row, never over a learned number', () => {
    const top = LearnedLinks.offline(new Map())
    expect(top.size).toBe(12)
    expect(top.get(9)).toBe(1) // '7'
    expect(top.get(0)).toBe(10) // '.'
    expect(top.get(2)).toBe(12) // ENTER
    // '7' learned as p02: '8' (p02 from the top) is left unlinked; the rest as before.
    const some = LearnedLinks.offline(new Map([[9, 2]]))
    expect(some.get(9)).toBe(2)
    expect(some.has(10)).toBe(false)
    expect(some.get(0)).toBe(10)
  })
})
