// Tests for the swipe-away toast's decisions (src/ui/components/Toast.tsx), a
// port of ArcToast's drag handling in app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt.
import { describe, expect, it } from 'vitest'
import { TOAST_FLING, swipeAlpha, swipeOutcome, swipeTarget, velocityOf } from '../../src/ui/components/Toast'

const base = { dx: 0, dy: 0, vx: 0, vy: 0, width: 300, height: 60 }

describe('swipeOutcome', () => {
  it('springs back after a short, slow drag', () => {
    expect(swipeOutcome({ ...base, dx: 89 })).toBe('back')
    expect(swipeOutcome({ ...base, dy: 30 })).toBe('back')
    expect(swipeOutcome(base)).toBe('back')
  })

  it('dismisses past 30% of the width sideways, either way', () => {
    expect(swipeOutcome({ ...base, dx: 91 })).toBe('side')
    expect(swipeOutcome({ ...base, dx: -91 })).toBe('side')
  })

  it('dismisses past half the height down', () => {
    expect(swipeOutcome({ ...base, dy: 31 })).toBe('down')
  })

  it('dismisses on a fling faster than 700 px/s in its main direction', () => {
    expect(swipeOutcome({ ...base, dx: 10, vx: TOAST_FLING + 1 })).toBe('side')
    expect(swipeOutcome({ ...base, dx: 10, vx: TOAST_FLING + 1, vy: TOAST_FLING + 2 })).toBe('side') // goes the way it went
    expect(swipeOutcome({ ...base, dy: 10, vy: TOAST_FLING + 1 })).toBe('down')
    // An upward fling does nothing (the toast never moves up).
    expect(swipeOutcome({ ...base, vy: -2000 })).toBe('back')
    expect(swipeOutcome({ ...base, dx: 10, vx: TOAST_FLING })).toBe('back')
  })

  it('leaves the way it was going: sideways when |dx| >= dy', () => {
    expect(swipeOutcome({ ...base, dx: 100, dy: 40 })).toBe('side')
    expect(swipeOutcome({ ...base, dx: 20, dy: 40 })).toBe('down')
  })
})

describe('swipeTarget / swipeAlpha / velocityOf', () => {
  it('goes 1.2 widths sideways or 1.5 heights down', () => {
    expect(swipeTarget('side', -5, 300, 60)).toEqual({ x: -360, y: 0 })
    expect(swipeTarget('side', 5, 300, 60)).toEqual({ x: 360, y: 0 })
    expect(swipeTarget('down', 0, 300, 60)).toEqual({ x: 0, y: 90 })
  })

  it('fades as it leaves, to 30%', () => {
    expect(swipeAlpha(0, 0, 300, 60)).toBe(1)
    expect(swipeAlpha(150, 0, 300, 60)).toBeCloseTo(0.65)
    expect(swipeAlpha(-600, 0, 300, 60)).toBeCloseTo(0.3)
    expect(swipeAlpha(0, 60, 300, 60)).toBeCloseTo(0.3)
  })

  it('measures the finger speed over the last 100 ms', () => {
    expect(velocityOf([])).toEqual({ vx: 0, vy: 0 })
    expect(velocityOf([{ t: 0, x: 0, y: 0 }])).toEqual({ vx: 0, vy: 0 })
    const v = velocityOf([
      { t: 0, x: 0, y: 0 },
      { t: 200, x: 0, y: 0 },
      { t: 250, x: 50, y: 10 },
      { t: 300, x: 100, y: 20 },
    ])
    expect(v.vx).toBeCloseTo(1000)
    expect(v.vy).toBeCloseTo(200)
  })
})
