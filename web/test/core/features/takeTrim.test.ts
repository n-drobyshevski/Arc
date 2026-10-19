// Port of core/src/test/kotlin/dev/arc/ep133/features/TakeTrimTest.kt
//
// Web deltas: the PCM is bytes (s16), and range() is a half-open {start, end}.
import { describe, expect, it } from 'vitest'
import { TakeTrim } from '../../../src/core/features/takeTrim'
import { MirrorText } from '../../../src/core/text/mirrorText'
import { s16 } from '../../helpers/bytes'

const f = Math.fround

/** A take's trim: kept inside the take, never shorter than a tenth of a second, null when it is all of it. */
describe('TakeTrimTest', () => {
  it('a trim stays inside the take and is null when it is the whole take', () => {
    expect(TakeTrim.of(4_800, 9_600, 48_000, 48_000)).toEqual(new TakeTrim(4_800, 9_600))
    expect(TakeTrim.of(0, 48_000, 48_000, 48_000)).toBeNull()
    expect(TakeTrim.of(-10, 60_000, 48_000, 48_000)).toBeNull()
    expect(TakeTrim.of(-10, 24_000, 48_000, 48_000)).toEqual(new TakeTrim(0, 24_000))
  })

  it('a trim is at least a tenth of a second, the end moving first', () => {
    expect(TakeTrim.of(1_000, 1_200, 48_000, 48_000)).toEqual(new TakeTrim(1_000, 5_800))
    expect(TakeTrim.of(47_000, 47_500, 48_000, 48_000)).toEqual(new TakeTrim(43_200, 48_000))
    // A take shorter than that is all of it.
    expect(TakeTrim.of(10, 20, 100, 48_000)).toBeNull()
  })

  it("a trim file reads back, and what isn't one is nothing", () => {
    const t = new TakeTrim(147_200, 316_800)
    expect(t.text()).toBe('147200 316800')
    expect(TakeTrim.parse(t.text() + '\n', 584_000, 8_000)).toEqual(t)
    expect(TakeTrim.parse('', 584_000, 8_000)).toBeNull()
    expect(TakeTrim.parse('12 x', 584_000, 8_000)).toBeNull()
    expect(TakeTrim.parse('500 100', 584_000, 8_000)).toBeNull()
    expect(TakeTrim.parse('0 584000', 584_000, 8_000)).toBeNull()
    expect(t.range()).toEqual({ start: 147_200, end: 316_800 })
  })

  it("the wave's peaks span all channels", () => {
    const pcm = s16(1000, -2000, 0, 0, 32767, -32768, 0, 0)
    const p = TakeTrim.peaks(pcm, 2, 2)
    expect(p[0]).toEqual({ min: f(-2000 / 32768), max: f(1000 / 32767) })
    expect(p[1]).toEqual({ min: -1, max: 1 })
    expect(TakeTrim.peaks(new Uint8Array(0), 1, 3)).toEqual(Array.from({ length: 3 }, () => ({ min: 0, max: 0 })))
  })

  it("the glass's times", () => {
    expect(MirrorText.trimTime(18.46)).toBe('0:18.4')
    expect(MirrorText.trimTime(65.0)).toBe('1:05.0')
    expect(MirrorText.trimSpan(18.4, 39.6)).toBe('0:18.4 → 0:39.6')
    expect(MirrorText.takeRow(2, 21.2, 'Oct 4', true, true)).toBe('T02, 0:21 trimmed, Oct 4, playing')
    expect(MirrorText.takeDuplicated(5, 2)).toBe('T05, a copy of T02')
  })
})
