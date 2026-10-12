// The swipe on Live's pads (panelMotion.ts, a port of SamplePanel.kt's swipeLands and
// panelSwipe's claim): it lands at 30 % of the way across or flung at 1000 px/s; it is a
// swipe once past the touch slop, more across than up or down, the way that does something.
import { describe, expect, it } from 'vitest'
import { PANEL_FLING, PANEL_SWIPE_AT, TOUCH_SLOP, swipeClaims, swipeLands, swipeRefused } from '../../src/ui/live/panelMotion'

describe('swipeLands', () => {
  it('lands at 30 % of the way across, or flung, and not short of both', () => {
    expect(swipeLands(PANEL_SWIPE_AT, 0)).toBe(true)
    expect(swipeLands(0.29, 0)).toBe(false)
    expect(swipeLands(0.05, PANEL_FLING)).toBe(true)
    expect(swipeLands(0.05, 999)).toBe(false)
    // The other way is negative: never.
    expect(swipeLands(-0.6, -2000)).toBe(false)
  })
})

describe('swipeClaims', () => {
  it('waits for the touch slop', () => {
    expect(swipeClaims(-TOUCH_SLOP, 0, true)).toBe(false)
    expect(swipeRefused(-TOUCH_SLOP, 0, true)).toBe(false)
    expect(swipeClaims(-TOUCH_SLOP - 1, 0, true)).toBe(true)
  })

  it('opens leftwards and closes rightwards, more across than up or down', () => {
    expect(swipeClaims(-20, 5, true)).toBe(true)
    expect(swipeClaims(20, 5, true)).toBe(false)
    expect(swipeRefused(20, 5, true)).toBe(true)
    expect(swipeClaims(20, -5, false)).toBe(true)
    expect(swipeClaims(-20, 5, false)).toBe(false)
    // A scroll: more up or down than across.
    expect(swipeClaims(-10, 20, true)).toBe(false)
    expect(swipeRefused(-10, 20, true)).toBe(true)
  })
})
