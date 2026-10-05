// Tests for web/src/ui/live/desk.ts (web only: Live's all-groups row on the desk,
// after MirrorScreen.kt's allGroupsSideways).
import { describe, expect, it } from 'vitest'
import { ROW_PAD_MIN, rowPadSize } from '../../src/ui/live/desk'

describe('rowPadSize', () => {
  it('takes the smaller of what the width and the height give, in whole pixels', () => {
    // 822 wide: ((822 - 40 - 42) / 4 - 18 - 12) / 3 = 51.67; 900 high leaves far more.
    expect(rowPadSize(822, 900)).toBe(51)
    // A short room: (420 - 215) / 4 = 51.25 beats the width's 51.67 only just.
    expect(rowPadSize(822, 420)).toBe(51)
    expect(rowPadSize(822, 400)).toBe(46)
  })

  it('gives way to the scrolling grid under 40 px either way', () => {
    // 1280 x 720 with the tools docked: 40 exactly still fits.
    expect(rowPadSize(686, 620)).toBe(ROW_PAD_MIN)
    // 1024 wide: the room left of the tools is too narrow.
    expect(rowPadSize(542, 666)).toBeNull()
    expect(rowPadSize(1200, 360)).toBeNull()
  })

  it('is null for an unmeasured room', () => {
    expect(rowPadSize(0, 0)).toBeNull()
  })
})
