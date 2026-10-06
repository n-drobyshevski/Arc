// Port of core/src/test/kotlin/dev/arc/ep133/features/LatencyStatsTest.kt
import { describe, expect, it } from 'vitest'
import { LatencyStats, LatencySummary } from '../../../src/core/features/latencyStats'

describe('LatencyStatsTest', () => {
  it('median, best and worst per engine', () => {
    let s = new LatencyStats()
    expect(s.isEmpty).toBe(true)
    expect(s.summary('a')).toBeNull()
    for (const ms of [30, 10, 20]) s = s.add('a', ms)
    expect(s.summary('a')).toEqual(LatencySummary('a', 3, 20, 10, 30))
    // An even count takes the middle two's mean.
    s = s.add('a', 41)
    expect(s.summary('a')).toEqual(LatencySummary('a', 4, 25, 10, 41))
    s = s.add('b', 7.5)
    expect(s.summary('b')).toEqual(LatencySummary('b', 1, 7.5, 7.5, 7.5))
    expect(s.summary('a')!.count).toBe(4)
  })

  it('only the last 20 count', () => {
    let s = new LatencyStats()
    for (let i = 1; i <= 25; i++) s = s.add('a', i)
    // 6..25 are left.
    expect(s.summary('a')).toEqual(LatencySummary('a', LatencyStats.KEEP, 15.5, 6, 25))
  })

  it('engines read as tried, and reset', () => {
    const s = new LatencyStats().add('native', 12).add('track', 30).add('native', 14).add('old', 60)
    expect(s.engines).toEqual(['native', 'track', 'old'])
    expect(s.summaries().map((it) => it.engine)).toEqual(['native', 'track', 'old'])
    expect(s.reset('track').engines).toEqual(['native', 'old'])
    expect(s.reset('missing').equals(s)).toBe(true)
    expect(s.reset().isEmpty).toBe(true)
    expect(s.reset().summaries()).toEqual([])
  })

  it("times that can't be right are left out, and adding leaves the old value alone", () => {
    const s = new LatencyStats().add('a', 10)
    expect(s.add('a', -1).equals(s)).toBe(true)
    expect(s.add('a', Number.NaN).equals(s)).toBe(true)
    expect(s.add('a', Number.POSITIVE_INFINITY).equals(s)).toBe(true)
    expect(new LatencyStats().add('a', 0).summary('a')).toEqual(LatencySummary('a', 1, 0, 0, 0))
    s.add('a', 99)
    expect(s.summary('a')!.count).toBe(1)
  })
})
