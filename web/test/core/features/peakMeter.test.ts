// Port of core/src/test/kotlin/dev/arc/ep133/features/PeakMeterTest.kt
//
// Web delta: assertEquals with a tolerance is toBeCloseTo.
import { describe, expect, it } from 'vitest'
import { PeakMeter } from '../../../src/core/features/peakMeter'

describe('PeakMeterTest', () => {
  it('levels in dBFS, silence at the floor', () => {
    expect(PeakMeter.toDb(1)).toBe(0)
    expect(PeakMeter.toDb(0.5)).toBeCloseTo(-6.0206, 4)
    expect(PeakMeter.toDb(0.1)).toBeCloseTo(-20, 4)
    expect(PeakMeter.toDb(0.001)).toBeCloseTo(-60, 4)
    // Quieter than the floor, and silence, read as the floor.
    expect(PeakMeter.toDb(0.0001)).toBe(PeakMeter.FLOOR_DB)
    expect(PeakMeter.toDb(0)).toBe(PeakMeter.FLOOR_DB)
    expect(PeakMeter.toDb(-1)).toBe(PeakMeter.FLOOR_DB)
    // And back.
    expect(PeakMeter.fromDb(0)).toBe(1)
    expect(PeakMeter.fromDb(-6)).toBeCloseTo(0.5012, 4)
    expect(PeakMeter.fromDb(-60)).toBeCloseTo(0.001, 7)
  })

  it('silence reads 0', () => {
    const m = new PeakMeter(1000)
    expect(m.dbfs()).toBe(PeakMeter.FLOOR_DB)
    expect(m.level01()).toBe(0)
    m.onBlock(0, 100)
    expect(m.dbfs()).toBe(PeakMeter.FLOOR_DB)
    expect(m.level01()).toBe(0)
    expect(m.clip).toBe(false)
  })

  it('a peak holds for 300 ms, then falls at 20 dB a second', () => {
    const m = new PeakMeter(1000)
    m.onBlock(1, 10)
    expect(m.dbfs()).toBe(0)
    // 300 frames at 1 kHz: still held.
    m.onBlock(0, 100)
    m.onBlock(0, 200)
    expect(m.dbfs()).toBe(0)
    // Half a second on: 10 dB down.
    m.onBlock(0, 500)
    expect(m.dbfs()).toBeCloseTo(-10, 4)
    // A block that ends the hold only falls for the part after it.
    const n = new PeakMeter(1000)
    n.onBlock(1, 10)
    n.onBlock(0, 400)
    expect(n.dbfs()).toBeCloseTo(-2, 4)
    // A quieter peak while falling doesn't lift it; a louder one holds again.
    m.onBlock(0.1, 100)
    expect(m.dbfs()).toBeCloseTo(-12, 4)
    m.onBlock(0.5, 10)
    expect(m.dbfs()).toBeCloseTo(-6.0206, 4)
    m.onBlock(0, 300)
    expect(m.dbfs()).toBeCloseTo(-6.0206, 4)
    // It comes to rest at the floor.
    m.onBlock(0, 10_000)
    expect(m.dbfs()).toBe(PeakMeter.FLOOR_DB)
    expect(m.level01()).toBe(0)
  })

  it('a clip stays lit for a second', () => {
    const m = new PeakMeter(1000)
    m.onBlock(0.99, 10)
    expect(m.clip).toBe(false)
    m.onBlock(32767 / 32768, 10)
    expect(m.clip).toBe(true)
    m.onBlock(0, 999)
    expect(m.clip).toBe(true)
    m.onBlock(0, 1)
    expect(m.clip).toBe(false)
    // Clipping again lights it again, and a reset puts it out.
    m.onBlock(1, 10)
    expect(m.clip).toBe(true)
    m.reset()
    expect(m.clip).toBe(false)
    expect(m.dbfs()).toBe(PeakMeter.FLOOR_DB)
  })

  it('the level and the threshold mark share a scale', () => {
    expect(PeakMeter.markOf(-60)).toBe(0)
    expect(PeakMeter.markOf(-30)).toBe(0.5)
    expect(PeakMeter.markOf(0)).toBe(1)
    expect(PeakMeter.markOf(-90)).toBe(0)
    expect(PeakMeter.markOf(6)).toBe(1)
    for (const db of [-60, -48, -30, -12, -6, 0]) {
      const m = new PeakMeter(48_000)
      m.onBlock(PeakMeter.fromDb(db), 480)
      expect(m.level01()).toBeCloseTo(PeakMeter.markOf(db), 5)
      expect(m.dbfs()).toBeCloseTo(db, 4)
    }
  })
})
