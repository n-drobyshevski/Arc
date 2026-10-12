// Tests for web/src/ui/live/desk.ts (web only: Live's all-groups row on the desk,
// after MirrorScreen.kt's allGroupsSideways).
import { describe, expect, it } from 'vitest'
import { ROW_PAD_MIN, rowPadSize, sidewaysRowPad } from '../../src/ui/live/desk'

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

describe('sidewaysRowPad', () => {
  // Live's box on an 852 x 393 phone on its side, the line in the top bar: 852 x 337.
  it("takes the smaller of the width's and the height's pad, the column's 72 off the width", () => {
    // Width: ((852 - 58 - 72 - 42) / 4 - 18 - 12) / 3 = 46.67; height: (337 - 16 - 54 - 26 - 19 - 18) / 4 = 51.
    expect(sidewaysRowPad(852, 337, false)).toBe(46)
    // With the display line on the page, 66 more off the height: (337 - 16 - 54 - 66 - 63) / 4 = 34.5.
    expect(sidewaysRowPad(852, 337, true)).toBeNull()
  })

  it('gives way to the scrolling page under 40 px, or under the column with its LED lines', () => {
    expect(sidewaysRowPad(740, 304, false)).toBeNull()
    // Wide enough, but 225 high for the groups and the column.
    expect(sidewaysRowPad(1200, 16 + 54 + 225, false)).toBeNull()
    expect(sidewaysRowPad(0, 0, false)).toBeNull()
  })

  it('narrows the pads beside an open panel, the row staying', () => {
    const closed = sidewaysRowPad(852, 337, false)!
    const open = sidewaysRowPad(852, 337, false, true)!
    expect(open).toBeLessThan(closed)
    expect(open).toBeGreaterThan(0)
  })
})
