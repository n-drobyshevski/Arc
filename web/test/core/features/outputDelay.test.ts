// Port of app/src/test/kotlin/dev/arc/ep133/audio/OutputDelayTest.kt
// Web deltas: milliseconds (no nanos), and no latencyMs (the browser reports the latency).
import { describe, expect, it } from 'vitest'
import { OutputDelay } from '../../../src/core/features/outputDelay'
import type { BeatGrid } from '../../../src/core/features/tempo'

describe('OutputDelay', () => {
  it('nothing is made up for wired, with the setting off, or closed', () => {
    expect(OutputDelay.ms(true, false, 140)).toBe(0)
    expect(OutputDelay.ms(false, true, 140)).toBe(0)
    expect(OutputDelay.ms(false, false, null)).toBe(0)
  })

  it('wireless makes up what the stamp leaves out of a typical delay, else all of it', () => {
    expect(OutputDelay.TYPICAL_MS).toBe(180)
    expect(OutputDelay.ms(true, true, null)).toBe(180)
    expect(OutputDelay.ms(true, true, 0)).toBe(180)
    expect(OutputDelay.ms(true, true, -1)).toBe(180)
    expect(OutputDelay.ms(true, true, 30)).toBe(150)
    expect(OutputDelay.ms(true, true, 120)).toBe(60)
  })

  it('the measured latency is never made up for twice', () => {
    expect(OutputDelay.ms(true, true, 180)).toBe(0)
    expect(OutputDelay.ms(true, true, 220)).toBe(0)
    expect(OutputDelay.ms(true, true, 4000)).toBe(0)
    for (const c of [null, 0, 30, 120, 180, 220, 4000]) {
      const made = OutputDelay.ms(true, true, c)
      expect(made + Math.max(c ?? 0, 0)).toBe(OutputDelay.totalMs(c))
    }
    expect(OutputDelay.totalMs(null)).toBe(180)
    expect(OutputDelay.totalMs(30)).toBe(180)
    expect(OutputDelay.totalMs(220)).toBe(220)
  })

  it('the delay as ticks', () => {
    // At 120 BPM a tick is 5.2083 ms: 180 ms is 34.56 ticks. At 60 BPM, half as many.
    expect(OutputDelay.ticks(180, 120)).toBeCloseTo(34.56, 9)
    expect(OutputDelay.ticks(180, 60)).toBeCloseTo(17.28, 9)
    expect(OutputDelay.ticks(0, 120)).toBe(0)
  })

  it('a press is where it was heard', () => {
    expect(OutputDelay.placed(389, 354.44, false)).toBeCloseTo(354.44, 9)
    expect(OutputDelay.placed(389, 354.44, true)).toBeCloseTo(354.44, 9)
    expect(OutputDelay.placed(134, 100, false)).toBe(100)
    expect(OutputDelay.placed(34, 0, false)).toBe(0)
    expect(OutputDelay.placed(24.56, -10, true)).toBeCloseTo(-10, 9)
    expect(OutputDelay.placed(-20, -50, true)).toBe(-50)
    expect(OutputDelay.placed(5, -29.56, false)).toBe(0)
    expect(OutputDelay.placed(-20, -50, false)).toBe(-20)
    for (const t of [-3, 0, 5, 123.456, 4000.5]) {
      expect(OutputDelay.placed(t, t, false)).toBe(t)
      expect(OutputDelay.placed(t, t, true)).toBe(t)
    }
  })

  it("the EP-133's beats go out early by the delay, and as they were with none", () => {
    const grid: BeatGrid = { anchor: 1000, beatIndex: 8, periodMs: 500, barKnown: true }
    const early = OutputDelay.earlier(grid, 180)
    expect(early.anchor).toBe(820)
    expect(early.periodMs).toBe(grid.periodMs)
    expect(early.beatIndex).toBe(grid.beatIndex)
    expect(early.barKnown).toBe(grid.barKnown)
    expect(OutputDelay.earlier(grid, 0)).toBe(grid)
  })
})
