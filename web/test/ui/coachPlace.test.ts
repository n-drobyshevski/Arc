// Tests for the guide overlay's tag placement (src/ui/coachPlace.ts), a port of
// CoachOverlay in app/src/main/kotlin/dev/arc/ep133/ui/components/Coach.kt.
// The expected numbers are worked out from the Kotlin loop by hand.
import { describe, expect, it } from 'vitest'
import {
  COACH_METRICS,
  arrowHead,
  coerceIn,
  hintTop,
  inflate,
  isTall,
  overlaps,
  placeTags,
  placementOrder,
  type Box,
  type CoachMarkInput,
  type MeasureTag,
} from '../../src/ui/coachPlace'

const VP = { width: 400, height: 800 }

/** Every label measures 10px per character (capped at the max width), 16px per line. */
const measure: MeasureTag = (text, maxWidth) => {
  const full = text.length * 10
  const lines = Math.ceil(full / maxWidth)
  return { width: Math.min(full, maxWidth), height: 16 * lines }
}

function at(left: number, top: number, w: number, h: number): Box {
  return { left, top, right: left + w, bottom: top + h }
}

function mark(id: string, bounds: Box, label = 'ab'): CoachMarkInput {
  return { id, bounds, label, face: 'var(--navy)', ink: 'var(--on-navy)' }
}

// A two-letter label: text 20×16, tag 38×28.
const TW = 20 + 2 * COACH_METRICS.padX
const TH = 16 + 2 * COACH_METRICS.padY
const STEP = TH + COACH_METRICS.clearance

describe('helpers', () => {
  it('overlaps ignores shared edges (Compose Rect.overlaps)', () => {
    expect(overlaps(at(0, 0, 10, 10), at(10, 0, 10, 10))).toBe(false)
    expect(overlaps(at(0, 0, 10, 10), at(0, 10, 10, 10))).toBe(false)
    expect(overlaps(at(0, 0, 10, 10), at(9.5, 9.5, 10, 10))).toBe(true)
  })

  it('inflate grows every side', () => {
    expect(inflate(at(10, 20, 30, 40), 6)).toEqual({ left: 4, top: 14, right: 46, bottom: 66 })
  })

  it('coerceIn clamps, and sticks to the minimum when the range is empty', () => {
    expect(coerceIn(-5, 8, 100)).toBe(8)
    expect(coerceIn(500, 8, 100)).toBe(100)
    expect(coerceIn(50, 8, 100)).toBe(50)
    expect(coerceIn(50, 8, -20)).toBe(8)
  })

  it('a mark is tall when taller than a quarter of the screen', () => {
    expect(isTall(mark('a', at(0, 0, 10, 200)), VP)).toBe(false)
    expect(isTall(mark('a', at(0, 0, 10, 201)), VP)).toBe(true)
  })

  it('hint sits at 72% of the height', () => {
    expect(hintTop(VP)).toBeCloseTo(576)
  })
})

describe('placementOrder', () => {
  it('puts tall areas last, then sorts by centre y, then centre x', () => {
    const tall = mark('tall', at(0, 0, 300, 400))
    const lowLeft = mark('lowLeft', at(10, 500, 40, 40))
    const topRight = mark('topRight', at(300, 10, 40, 40))
    const topLeft = mark('topLeft', at(10, 10, 40, 40))
    const ids = placementOrder([tall, lowLeft, topRight, topLeft], VP).map((m) => m.id)
    expect(ids).toEqual(['topLeft', 'topRight', 'lowLeft', 'tall'])
  })

  it('keeps the given order for equal centres', () => {
    const a = mark('a', at(10, 10, 40, 40))
    const b = mark('b', at(10, 10, 40, 40))
    expect(placementOrder([a, b], VP).map((m) => m.id)).toEqual(['a', 'b'])
    expect(placementOrder([b, a], VP).map((m) => m.id)).toEqual(['b', 'a'])
  })
})

describe('placeTags', () => {
  it('measures the uppercased label at most 170 wide', () => {
    const seen: [string, number][] = []
    placeTags([mark('a', at(10, 10, 40, 40), "What's what")], VP, (t, w) => {
      seen.push([t, w])
      return { width: 50, height: 16 }
    })
    expect(seen).toEqual([["WHAT'S WHAT", 170]])
  })

  it('hangs a tag below a control in the upper half, centred, with an arrow', () => {
    const [p] = placeTags([mark('a', at(100, 20, 44, 44))], VP, measure)
    // centre x 122, tag 38 wide → left 103; top = bottom 64 + gap 10.
    expect(p!.rect).toEqual(at(122 - TW / 2, 74, TW, TH))
    expect(p!.tip).toEqual({ x: 122, y: 66 })
    expect(p!.tail).toEqual({ x: 122, y: 74 })
    expect(p!.text).toBe('AB')
    expect(p!.textSize).toEqual({ width: 20, height: 16 })
  })

  it('stands a tag above a control in the lower half', () => {
    const [p] = placeTags([mark('a', at(100, 700, 44, 44))], VP, measure)
    // top = 700 - 10 - 28 = 662.
    expect(p!.rect).toEqual(at(122 - TW / 2, 700 - 10 - TH, TW, TH))
    expect(p!.tip).toEqual({ x: 122, y: 698 })
    expect(p!.tail).toEqual({ x: 122, y: 700 - 10 })
  })

  it('a control centred exactly on the middle gets its tag above (centre.y < H/2 is false)', () => {
    const [p] = placeTags([mark('a', at(100, 380, 40, 40))], VP, measure)
    expect(p!.rect.bottom).toBe(370)
  })

  it('keeps tags 8px inside the screen, while the arrow stays on the control', () => {
    const [l, r] = placeTags(
      [mark('l', at(0, 10, 20, 20), 'long label'), mark('r', at(390, 400, 10, 20), 'long label')],
      VP,
      measure,
    )
    // 'LONG LABEL' is 100 wide → tag 118.
    expect(l!.rect.left).toBe(8)
    expect(l!.tip!.x).toBe(10)
    expect(r!.rect.right).toBe(400 - 8)
    expect(r!.rect.left).toBe(400 - 8 - 118)
    expect(r!.tip!.x).toBe(395)
  })

  it('sticks to the left margin when the screen is narrower than the tag', () => {
    const [p] = placeTags([mark('a', at(40, 10, 20, 20), 'a very long label for a tiny screen')], { width: 120, height: 800 }, measure)
    expect(p!.rect.left).toBe(8)
  })

  it('pushes a neighbour on the same line out by one tag height plus clearance', () => {
    // Two controls 30px apart: their tags (38 wide) would overlap.
    const ps = placeTags([mark('a', at(100, 20, 20, 20)), mark('b', at(130, 20, 20, 20))], VP, measure)
    const [a, b] = ps
    expect(a!.mark.id).toBe('a')
    expect(a!.rect.top).toBe(50)
    expect(b!.rect.top).toBe(50 + STEP)
    // The arrow runs from the pushed tag up to the control.
    expect(b!.tail).toEqual({ x: 140, y: 50 + STEP })
    expect(b!.tip).toEqual({ x: 140, y: 42 })
  })

  it('counts tags within the clearance as a collision, and a gap of exactly the clearance as clear', () => {
    // a's tag: left 101..139 (centre 120). b's tag must start at 145 to clear 139 + 6.
    const clear = placeTags([mark('a', at(110, 20, 20, 20)), mark('b', at(145 + TW / 2 - 10, 20, 20, 20))], VP, measure)
    expect(clear[1]!.rect.left).toBeCloseTo(145)
    expect(clear[1]!.rect.top).toBe(clear[0]!.rect.top)
    const near = placeTags([mark('a', at(110, 20, 20, 20)), mark('b', at(144 + TW / 2 - 10, 20, 20, 20))], VP, measure)
    expect(near[1]!.rect.top).toBe(near[0]!.rect.top + STEP)
  })

  it('moves a tag out at most 8 times, then leaves it overlapping', () => {
    const marks = Array.from({ length: 11 }, (_, i) => mark(`m${i}`, at(100, 20, 20, 20)))
    const ps = placeTags(marks, VP, measure)
    const tops = ps.map((p) => p.rect.top)
    // Tag k (k ≤ 8) lands k steps out; after 8 moves the 9th position is final.
    for (let k = 0; k <= 8; k++) expect(tops[k]).toBe(50 + k * STEP)
    expect(tops[9]).toBe(50 + 8 * STEP)
    expect(tops[10]).toBe(50 + 8 * STEP)
  })

  it('gives a tall area its tag in its middle, with no arrow', () => {
    const [p] = placeTags([mark('pads', at(40, 200, 320, 400), 'pads')], VP, measure)
    // 'PADS' 40 wide → tag 58×28, centred on (200, 400).
    expect(p!.rect).toEqual(at(200 - 29, 400 - 14, 58, 28))
    expect(p!.tip).toBeNull()
    expect(p!.tail).toBeNull()
  })

  it('keeps a tall strip at the edge on screen (the side zone)', () => {
    const [p] = placeTags([mark('side.more', at(376, 200, 24, 400), 'More tools')], VP, measure)
    expect(p!.rect.right).toBe(400 - 8)
  })

  it('moves a tall area’s tag down past the tags already placed', () => {
    // A small control in the lower half whose tag stands above it, right where the tall tag would go.
    const small = mark('small', at(180, 430, 40, 40))
    const tall = mark('tall', at(40, 200, 320, 400), 'ab')
    const ps = placeTags([tall, small], VP, measure)
    expect(ps.map((p) => p.mark.id)).toEqual(['small', 'tall'])
    const smallTag = ps[0]!.rect
    expect(smallTag).toEqual(at(200 - TW / 2, 430 - 10 - TH, TW, TH)) // 392..420
    // The tall tag starts at 386..414 (touches), moves to 420..448: 420 < 420 + 6, still touches; then 454.
    expect(ps[1]!.rect.top).toBe(386 + 2 * STEP)
  })

  it('moves a tall area’s tag at most 8 times', () => {
    const tall = (i: number) => mark(`t${i}`, at(40, 200, 320, 400))
    const ps = placeTags(Array.from({ length: 11 }, (_, i) => tall(i)), VP, measure)
    const top0 = ps[0]!.rect.top
    expect(ps[8]!.rect.top).toBe(top0 + 8 * STEP)
    expect(ps[9]!.rect.top).toBe(top0 + 8 * STEP)
  })

  it('places tags of multi-line labels with their measured height', () => {
    const [p] = placeTags([mark('live.pads', at(100, 20, 20, 20), 'Pads light as you play')], VP, measure)
    // 22 chars → 220 > 170: two lines, 170×32 → tag 188×44.
    expect(p!.rect.right - p!.rect.left).toBe(188)
    expect(p!.rect.bottom - p!.rect.top).toBe(44)
  })

  it('returns nothing for no marks', () => {
    expect(placeTags([], VP, measure)).toEqual([])
  })
})

describe('arrowHead', () => {
  it('points up at a control above its tag', () => {
    // Tag below the control: the tail is below the tip, so the head opens downwards.
    const [tip, a, b] = arrowHead({ x: 50, y: 66 }, { x: 50, y: 74 })
    expect(tip).toEqual({ x: 50, y: 66 })
    expect(a.x).toBe(43)
    expect(a.y).toBeCloseTo(66 + 8.4)
    expect(b.x).toBe(57)
    expect(b.y).toBeCloseTo(66 + 8.4)
  })

  it('points down at a control below its tag', () => {
    const [, a, b] = arrowHead({ x: 50, y: 698 }, { x: 50, y: 690 })
    expect(a.y).toBeCloseTo(698 - 8.4)
    expect(b.y).toBeCloseTo(698 - 8.4)
  })
})
