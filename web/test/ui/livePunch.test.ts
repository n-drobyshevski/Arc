// Port of app/src/test/kotlin/dev/arc/ep133/ui/screens/PunchPadsTest.kt (yDepth, PressureSense): a punch-in's depth from
// where the finger is, and from its pressure once a device's pressures vary.
import { describe, expect, it } from 'vitest'
import { PRESSURE_SPREAD, PUNCH_FLOOR, PressureSense, yDepth } from '../../src/ui/live/LivePunch'

describe('yDepth', () => {
  it('is 1 at the top of the pad, the floor at its foot, held in between', () => {
    expect(yDepth(0, 100)).toBe(1)
    expect(yDepth(100, 100)).toBeCloseTo(PUNCH_FLOOR)
    expect(yDepth(50, 100)).toBeCloseTo(1 - 0.5 * (1 - PUNCH_FLOOR))
    expect(yDepth(-20, 100)).toBe(1)
    expect(yDepth(400, 100)).toBeCloseTo(PUNCH_FLOOR)
    // No height yet: all the way.
    expect(yDepth(10, 0)).toBe(1)
  })
})

describe('PressureSense', () => {
  it("a constant pressure (a mouse's 0.5) is none: the depth is where the finger is", () => {
    const s = new PressureSense()
    expect(s.depth(0.5, 0, 100)).toBe(1)
    expect(s.depth(0.5, 100, 100)).toBeCloseTo(PUNCH_FLOOR)
    expect(s.varies).toBe(false)
    // A jitter round it is none either.
    s.see(0.5 + PRESSURE_SPREAD / 2)
    expect(s.varies).toBe(false)
  })

  it('once pressures spread, a press is as deep as it is hard, from the floor to 1', () => {
    const s = new PressureSense()
    s.see(0.2)
    s.see(0.8)
    expect(s.varies).toBe(true)
    expect(s.depth(0.2, 0, 100)).toBeCloseTo(PUNCH_FLOOR)
    expect(s.depth(0.8, 100, 100)).toBeCloseTo(1)
    expect(s.depth(0.5, 0, 100)).toBeCloseTo(PUNCH_FLOOR + 0.5 * (1 - PUNCH_FLOOR))
    // A harder press widens the range.
    expect(s.level(1)).toBe(1)
    expect(s.level(0.8)).toBeCloseTo(0.75)
    // Not a number: where the finger is.
    expect(s.depth(Number.NaN, 0, 100)).toBe(1)
  })
})
