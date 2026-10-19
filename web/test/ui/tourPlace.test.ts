// Port of app/src/test/kotlin/dev/arc/ep133/ui/TourPlaceTest.kt (same cases, same names)
//
// Where the tour's card goes (dp = px). The pad grid in Live's one-group view
// starts under the top bar and the display line (about 124 down) and leaves
// about 128 below it for the mode row and the A-D keys; a compact card (PAD,
// HEAR) is about 160 tall, its heading alone about 70.
//
// Web additions after the Kotlin cases: holeOf and veilPath.
import { describe, expect, it } from 'vitest'
import type { Box } from '../../src/ui/coachPlace'
import { TourPlace, holeOf, placeTourCard, tourCardWidth, veilPath, type TourPlacement } from '../../src/ui/tourPlace'

const compact = 160
const head = 70

const rect = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom })
const width = (b: Box): number => b.right - b.left
const height = (b: Box): number => b.bottom - b.top

function grid(vw: number, vh: number, safeBottom = 0): Box {
  return rect(30, 124, vw - 32, vh - safeBottom - 128)
}

function place(vw: number, vh: number, target: Box | null, card = compact, safeTop = 0, safeBottom = 0): TourPlacement {
  return placeTourCard(vw, vh, target, () => card, () => head, safeTop, safeBottom)
}

/** On screen, inside the margins and the system bars. */
function expectOnScreen(p: TourPlacement, vw: number, vh: number, safeTop = 0, safeBottom = 0): void {
  expect(p.card.left).toBeGreaterThanOrEqual(TourPlace.MARGIN - 0.01)
  expect(p.card.right).toBeLessThanOrEqual(vw - TourPlace.MARGIN + 0.01)
  expect(p.card.top).toBeGreaterThanOrEqual(safeTop + TourPlace.MARGIN - 0.01)
  expect(p.card.bottom).toBeLessThanOrEqual(vh - safeBottom - TourPlace.MARGIN + 0.01)
}

/** Docked over the grid's bottom: the cut-out stops above the card, and at most one row of pads is covered. */
function expectDockedBelow(p: TourPlacement, g: Box): void {
  expect(p.holeClip).not.toBeNull()
  const clip = p.holeClip!
  expect(clip.bottom).toBeCloseTo(p.card.top - TourPlace.GAP, 2)
  expect(g.bottom - clip.bottom).toBeLessThanOrEqual(height(g) / TourPlace.PAD_ROWS + 0.01)
}

describe('TourPlaceTest', () => {
  it('393x852 docks the compact card over the last row', () => {
    const g = grid(393, 852)
    const p = place(393, 852, g)
    expectOnScreen(p, 393, 852)
    expect(width(p.card)).toBeCloseTo(361, 2)
    expect(p.card.bottom).toBeCloseTo(852 - TourPlace.MARGIN, 2)
    expect(p.headingOnly).toBe(false)
    expectDockedBelow(p, g)
  })

  it('360x780 docks the compact card over the last row', () => {
    const g = grid(360, 780)
    const p = place(360, 780, g)
    expectOnScreen(p, 360, 780)
    expect(width(p.card)).toBeCloseTo(328, 2)
    expect(p.headingOnly).toBe(false)
    expectDockedBelow(p, g)
  })

  it('360x668 docks the compact card over the last row', () => {
    const g = grid(360, 668)
    const p = place(360, 668, g)
    expectOnScreen(p, 360, 668)
    expect(p.headingOnly).toBe(false)
    expectDockedBelow(p, g)
  })

  it('393x852 with a 48dp navigation bar keeps above it', () => {
    const g = grid(393, 852, 48)
    const p = place(393, 852, g, compact, 24, 48)
    expectOnScreen(p, 393, 852, 24, 48)
    expect(p.card.bottom).toBeCloseTo(852 - 48 - TourPlace.MARGIN, 2)
    expectDockedBelow(p, g)
  })

  it('360x600 clips the cut-out by one row', () => {
    const g = grid(360, 600)
    const p = place(360, 600, g)
    expectOnScreen(p, 360, 600)
    expect(p.headingOnly).toBe(false)
    expectDockedBelow(p, g)
    expect(p.holeClip!.bottom).toBeLessThan(g.bottom)
  })

  it('360x600 with large text shows only the heading', () => {
    const g = grid(360, 600)
    const p = place(360, 600, g, 260)
    expectOnScreen(p, 360, 600)
    expect(p.headingOnly).toBe(true)
    expect(height(p.card)).toBeCloseTo(head, 2)
    expectDockedBelow(p, g)
  })

  it('640x360 goes beside a grid that leaves room', () => {
    const g = rect(30, 70, 330, 330)
    const p = place(640, 360, g)
    expectOnScreen(p, 640, 360)
    expect(p.card.left).toBeGreaterThanOrEqual(g.right + TourPlace.GAP - 0.01)
    expect(width(p.card)).toBeGreaterThanOrEqual(TourPlace.MIN_SIDE_WIDTH)
    expect(p.holeClip).toBeNull()
    expect(p.headingOnly).toBe(false)
  })

  it('640x360 with a wide grid shows only the heading', () => {
    const g = rect(90, 124, 548, 232)
    const p = place(640, 360, g)
    expectOnScreen(p, 640, 360)
    expect(p.headingOnly).toBe(true)
  })

  it('a grid with room below gets the card below it', () => {
    const g = rect(30, 124, 361, 500)
    const p = place(393, 852, g)
    expect(p.card.top).toBeCloseTo(g.bottom + TourPlace.GAP, 2)
    expect(p.holeClip).toBeNull()
  })

  it('a key at the top gets the card below it, clear of its tag', () => {
    const key = rect(250, 12, 294, 56)
    const p = place(393, 852, key, 300)
    expect(p.card.top).toBeCloseTo(key.bottom + TourPlace.TAG_ROOM, 2)
    expect(p.holeClip).toBeNull()
  })

  it('no target starts at 45 percent and docks when too tall', () => {
    expect(place(393, 852, null, 300).card.top).toBeCloseTo(852 * 0.45, 2)
    const tall = place(393, 852, null, 600)
    expect(tall.card.bottom).toBeCloseTo(852 - TourPlace.MARGIN, 2)
    // Taller than the screen: capped (the card scrolls).
    const capped = place(360, 600, null, 900)
    expect(height(capped.card)).toBeCloseTo(600 - 2 * TourPlace.MARGIN, 2)
    expectOnScreen(capped, 360, 600)
  })

  it('done docks to the bottom, clear of its tags', () => {
    const done = placeTourCard(393, 852, null, () => 260, () => head, 0, 48, true)
    expect(done.card.bottom).toBeCloseTo(852 - 48 - TourPlace.MARGIN, 2)
    expectOnScreen(done, 393, 852, 0, 48)
  })

  it('the card is never wider than 400', () => {
    expect(width(place(840, 900, null).card)).toBeCloseTo(400, 2)
  })
})

describe('the hole in the veil (web)', () => {
  it('is the target inflated by 6, cut where a docked card covers the grid', () => {
    const g = grid(360, 600)
    expect(holeOf(g, null)).toEqual(rect(24, 118, 334, 478))
    const p = place(360, 600, g)
    const hole = holeOf(g, p.holeClip)
    expect(hole.bottom).toBeCloseTo(p.card.top - TourPlace.GAP, 2)
    expect(hole.top).toBe(118)
    expect(tourCardWidth({ width: 360, height: 600 })).toBe(328)
  })

  it('veilPath is the screen, then the rounded hole (even-odd)', () => {
    const vp = { width: 100, height: 200 }
    expect(veilPath(vp, null)).toBe('M0 0H100V200H0Z')
    const p = veilPath(vp, rect(10, 20, 60, 80))
    expect(p.startsWith('M0 0H100V200H0ZM22 20H48A12 12 0 0 1 60 32V68')).toBe(true)
    expect(p.endsWith('V32A12 12 0 0 1 22 20Z')).toBe(true)
    // A hole smaller than its corners gets rounder, not inside out; an empty one is no hole.
    expect(veilPath(vp, rect(10, 10, 20, 14))).toContain('A2 2 0 0 1')
    expect(veilPath(vp, rect(10, 10, 10, 30))).toBe('M0 0H100V200H0Z')
  })
})
