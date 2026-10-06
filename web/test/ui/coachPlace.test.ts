// Tests for the guide overlay's tag placement (src/ui/coachPlace.ts), a port of
// CoachOverlay in app/src/main/kotlin/dev/arc/ep133/ui/components/Coach.kt.
// The expected numbers are worked out from the Kotlin loop by hand; the crowded
// rules (a short window) are checked by what they keep clear.
import { describe, expect, it } from 'vitest'
import {
  COACH_METRICS,
  arrowHead,
  clearArrows,
  coerceIn,
  crosses,
  edgeOf,
  hintTop,
  inflate,
  isTall,
  layoutTags,
  occlusions,
  overlaps,
  placeTags,
  placementOrder,
  sideHook,
  type Box,
  type CoachMarkInput,
  type MeasureTag,
  type PlacedTag,
} from '../../src/ui/coachPlace'

const VP = { width: 400, height: 800 }

/** Every label measures 10px per character (capped at the max width), 16px per line. */
const measure: MeasureTag = (text, maxWidth) => {
  const full = text.length * 10
  const lines = Math.max(1, Math.ceil(full / maxWidth))
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
      [mark('l', at(0, 10, 20, 20), 'long label'), mark('r', at(380, 400, 20, 20), 'long label')],
      VP,
      measure,
    )
    // 'LONG LABEL' is 100 wide → tag 118.
    expect(l!.rect.left).toBe(8)
    expect(l!.tip!.x).toBe(10)
    expect(r!.rect.right).toBe(400 - 8)
    expect(r!.rect.left).toBe(400 - 8 - 118)
    expect(r!.tip!.x).toBe(390)
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

  it('keeps a wide tall strip at the edge on screen', () => {
    const [p] = placeTags([mark('wide', at(340, 200, 60, 400), 'More tools')], VP, measure)
    expect(p!.side).toBe(0)
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

describe('side tags (narrow controls on an edge)', () => {
  it('finds the edge of a narrow, tall control', () => {
    expect(edgeOf(mark('g', at(0, 300, 24, 112)), VP)).toBe(-1)
    expect(edgeOf(mark('g', at(2, 300, 24, 112)), VP)).toBe(-1)
    expect(edgeOf(mark('s', at(376, 200, 24, 400)), VP)).toBe(1)
    expect(edgeOf(mark('s', at(340, 200, 48, 96)), VP)).toBe(0) // not on the edge
    expect(edgeOf(mark('s', at(398 - 48, 200, 48, 96)), VP)).toBe(1) // 48 wide, twice as tall: still one
    expect(edgeOf(mark('w', at(0, 200, 49, 400)), VP)).toBe(0) // too wide
    expect(edgeOf(mark('f', at(0, 200, 40, 79)), VP)).toBe(0) // not twice as tall
    expect(edgeOf(mark('i', at(3, 200, 24, 112)), VP)).toBe(0) // off the edge
  })

  it('stands a turned tab on the left edge, centred on the control, measured on one line', () => {
    const widths: number[] = []
    const m: MeasureTag = (text, max) => {
      widths.push(max)
      return measure(text, max)
    }
    const [p] = placeTags([mark('edge.guide', at(0, 300, 24, 112), 'EP-133 shortcuts')], VP, m)
    expect(widths).toEqual([Number.POSITIVE_INFINITY])
    // 16 chars → 160×16 on one line: the tab is 16+12 wide, 160+18 tall.
    expect(p!.side).toBe(-1)
    expect(p!.rect).toEqual(at(0, 356 - 89, 28, 178))
    expect(p!.tip).toBeNull()
    expect(p!.room).toEqual({ left: 0, top: 356 - 89 - 30, right: 28, bottom: 356 + 89 })
  })

  it('stands a tab on the right edge for the more-tools strip, though it is tall', () => {
    const [p] = placeTags([mark('side.more', at(376, 200, 24, 400), 'More tools')], VP, measure)
    expect(p!.side).toBe(1)
    // 100×16 → 28×118, flush with the right edge.
    expect(p!.rect).toEqual(at(400 - 28, 400 - 59, 28, 118))
  })

  it('keeps a side tab 48px below the top and 8px above the bottom', () => {
    const [top] = placeTags([mark('a', at(0, 0, 24, 60), 'ab')], VP, measure)
    expect(top!.rect.top).toBe(8 + 40)
    const [bottom] = placeTags([mark('b', at(0, 770, 24, 60), 'ab')], VP, measure)
    expect(bottom!.rect.bottom).toBe(800 - 8)
  })

  it('places the tags beside their controls first, then the side tab, centred where that is clear', () => {
    const guide = mark('edge.guide', at(0, 300, 24, 112), 'ab')
    // A control in the upper half whose tag hangs just above the hook's room.
    const near = mark('near', at(0, 240, 40, 10), 'ab')
    const ps = placeTags([guide, near], VP, measure)
    expect(ps.map((p) => p.mark.id)).toEqual(['near', 'edge.guide'])
    // Near's tag 260..288 (inflated: ..294); the guide tab 28×38 at 356-19 = 337, its room from 307.
    expect(ps[0]!.rect.top).toBe(250 + 10)
    expect(ps[1]!.rect.top).toBe(337)
  })

  it('slides a side tab down off a tag in its way, while its hook still meets the control', () => {
    const guide = mark('edge.guide', at(0, 300, 24, 112), 'ab')
    const lower = mark('lower', at(0, 270, 40, 10), 'ab')
    const [tag, side] = placeTags([lower, guide], VP, measure)
    // Lower's tag 290..318, inflated to 324: the room (30 over the tab) must start there, so
    // the tab, 4 at a time from 337, lands at 357.
    expect(tag!.rect.top).toBe(290)
    expect(side!.rect.top).toBe(357)
    expect(side!.room!.top).toBe(327)
  })

  it('puts a side tab with no room first, and the tag in its way moves out instead', () => {
    const guide = mark('edge.guide', at(0, 300, 24, 112), 'ab')
    const big = mark('big', at(0, 200, 40, 10), 'big')
    // BIG is 240 high: hanging from 220, it covers every place the tab could slide to.
    const m: MeasureTag = (text, max) => (text === 'BIG' ? { width: 30, height: 240 } : measure(text, max))
    const ps = placeTags([big, guide], VP, m)
    expect(ps.map((p) => p.mark.id)).toEqual(['edge.guide', 'big'])
    expect(ps[0]!.rect.top).toBe(337)
    // 220..472 touches the room (307..375): out by 252 + 6.
    expect(ps[1]!.rect.top).toBe(220 + 252 + 6)
  })

  it('draws the hook up from the inner side and across to an arrowhead at the edge', () => {
    const left = sideHook(at(0, 300, 28, 178), -1, 0)
    // inner 22, bottom 292, bend 274, turn 6, ends 7 short of the tip at 6.
    expect(left.line).toBe('M22 292L22 280Q22 274 16 274L13 274')
    expect(left.head[0]).toEqual({ x: 6, y: 274 })
    expect(left.head[1].x).toBeCloseTo(6 + 9.1)
    expect(left.head[1].y).toBe(267)
    expect(left.head[2].y).toBe(281)
    const right = sideHook(at(372, 300, 28, 178), 1, 400)
    expect(right.line).toBe('M378 292L378 280Q378 274 384 274L387 274')
    expect(right.head[0]).toEqual({ x: 394, y: 274 })
    expect(right.head[1].x).toBeCloseTo(394 - 9.1)
  })

  it('stands a tab on the safe area’s edge where its control does (a notch), and on the screen’s where it hugs that', () => {
    const safe = { left: 44, top: 0, right: 30, bottom: 0 }
    const inset = mark('g', at(44, 300, 24, 112), 'ab')
    expect(edgeOf(inset, VP)).toBe(0)
    expect(edgeOf(inset, VP, safe)).toBe(-1)
    const [p] = placeTags([inset], VP, measure, { safe })
    expect(p!.rect.left).toBe(44)
    expect(p!.edge).toBe(44)
    const [q] = placeTags([mark('g', at(0, 300, 24, 112), 'ab')], VP, measure, { safe })
    expect(q!.rect.left).toBe(0)
    expect(q!.edge).toBe(0)
    const [r] = placeTags([mark('s', at(400 - 30 - 24, 200, 24, 112), 'ab')], VP, measure, { safe })
    expect(r!.side).toBe(1)
    expect(r!.rect.right).toBe(400 - 30)
    expect(r!.edge).toBe(400 - 30)
    expect(sideHook(r!.rect, 1, r!.edge!).head[0].x).toBe(400 - 30 - 6)
  })
})

describe('crosses and arrowheads across', () => {
  it('finds an arrow running over a box, down or across; ending on its edge is not running over it', () => {
    const r = at(100, 100, 50, 30)
    expect(crosses({ x: 120, y: 50 }, { x: 120, y: 200 }, r)).toBe(true)
    expect(crosses({ x: 160, y: 50 }, { x: 160, y: 200 }, r)).toBe(false)
    // A tag's own arrow leaves its top edge.
    expect(crosses({ x: 120, y: 50 }, { x: 120, y: 100 }, r)).toBe(false)
    expect(crosses({ x: 50, y: 110 }, { x: 200, y: 110 }, r)).toBe(true)
    expect(crosses({ x: 50, y: 110 }, { x: 100, y: 110 }, r)).toBe(false)
  })

  it('points across at a control beside its tag', () => {
    const [tip, a, b] = arrowHead({ x: 50, y: 100 }, { x: 80, y: 100 })
    expect(tip).toEqual({ x: 50, y: 100 })
    expect(a.x).toBeCloseTo(58.4)
    expect(a.y).toBe(93)
    expect(b.x).toBeCloseTo(58.4)
    expect(b.y).toBe(107)
    const [, c] = arrowHead({ x: 200, y: 100 }, { x: 170, y: 100 })
    expect(c.x).toBeCloseTo(191.6)
  })
})

describe('crowded (a short window)', () => {
  const SHORT = { width: 800, height: 360 }
  const r = (p: PlacedTag): Box => p.room ?? p.rect
  const inner = (b: Box): Box => inflate(b, -1)

  it('keeps a tag off the control under its own, beside it instead (the arrow across)', () => {
    const a = mark('a', at(100, 20, 40, 40))
    const b = mark('b', at(100, 70, 40, 40))
    const [plainA] = placeTags([a, b], SHORT, measure)
    expect(overlaps(plainA!.rect, inner(b.bounds))).toBe(true)
    const ps = placeTags([a, b], SHORT, measure, { crowded: true })
    const tagA = ps.find((p) => p.mark.id === 'a')!
    expect(overlaps(tagA.rect, inner(b.bounds))).toBe(false)
    // Beside a, on the side with more room, level with it.
    expect(tagA.rect.left).toBe(140 + COACH_METRICS.gap)
    expect(tagA.tip).toEqual({ x: 142, y: 40 })
    expect(tagA.tail).toEqual({ x: 150, y: 40 })
    for (const p of ps) for (const q of ps) if (p !== q) expect(overlaps(r(p), r(q))).toBe(false)
  })

  it('keeps tags off the controls with no tag of their own (the octave’s − and +)', () => {
    const a = mark('a', at(100, 20, 40, 40))
    const minus = at(100, 70, 40, 40)
    const [plain] = placeTags([a], SHORT, measure, { clear: [minus] })
    expect(overlaps(plain!.rect, inner(minus))).toBe(true)
    const [p] = placeTags([a], SHORT, measure, { crowded: true, clear: [minus] })
    expect(overlaps(p!.rect, inner(minus))).toBe(false)
  })

  it('keeps tags off an edge tab, sliding while the tag still meets its arrow', () => {
    const guide = mark('edge.guide', at(0, 100, 24, 112), 'ab')
    const word = mark('word', at(10, 80, 60, 20), 'ab')
    const plain = placeTags([guide, word], SHORT, measure).find((p) => p.mark.id === 'word')!
    expect(overlaps(plain.rect, inner(guide.bounds))).toBe(true)
    const p = placeTags([guide, word], SHORT, measure, { crowded: true }).find((q) => q.mark.id === 'word')!
    expect(overlaps(p.rect, inner(guide.bounds))).toBe(false)
    expect(p.rect.top).toBe(110)
    expect(p.tip!.x).toBe(40)
    expect(p.tip!.x).toBeGreaterThanOrEqual(p.rect.left + COACH_METRICS.padX)
  })

  it('leaves no arrow running across another tag or control in a crowded row', () => {
    // Five keys in a row under a sixth, as the top bar over a row of words.
    const keys = [0, 1, 2, 3, 4].map((i) => mark(`k${i}`, at(300 + i * 52, 12, 44, 44), `key ${i}`))
    const row = mark('row', at(300, 70, 260, 30), 'row')
    const ps = placeTags([...keys, row], SHORT, measure, { crowded: true })
    expect(ps).toHaveLength(6)
    for (const p of ps) {
      expect(r(p).top).toBeGreaterThanOrEqual(0)
      expect(r(p).bottom).toBeLessThanOrEqual(SHORT.height)
      for (const m of [...keys, row]) if (m !== p.mark) expect(overlaps(p.rect, inner(m.bounds))).toBe(false)
      for (const q of ps) if (q !== p) expect(overlaps(r(p), r(q))).toBe(false)
    }
  })

  it('measures each label once, however many places and orders it tries', () => {
    const seen = new Map<string, number>()
    const m: MeasureTag = (text, max) => {
      seen.set(`${text}|${max}`, (seen.get(`${text}|${max}`) ?? 0) + 1)
      return measure(text, max)
    }
    const keys = [0, 1, 2, 3].map((i) => mark(`k${i}`, at(300 + i * 30, 12, 24, 24), `key ${i}`))
    placeTags([...keys, mark('g', at(0, 100, 24, 112), 'guide')], SHORT, m, { crowded: true })
    expect([...seen.values()].every((n) => n === 1)).toBe(true)
  })
})

describe('occlusions', () => {
  const tag = (m: CoachMarkInput, rect: Box): PlacedTag => ({ mark: m, text: m.label.toUpperCase(), textSize: { width: 20, height: 16 }, rect, tip: null, tail: null, side: 0 })

  it('counts a tag over a quarter of a control, not a sliver of its touch area', () => {
    const a = mark('a', at(100, 20, 40, 40))
    const b = mark('b', at(100, 100, 40, 40))
    expect(occlusions([tag(a, at(100, 125, 40, 30)), tag(b, at(200, 300, 40, 28))], VP)).toBe(1)
    // 5 of b's 40 high: an eighth.
    expect(occlusions([tag(a, at(100, 135, 40, 30)), tag(b, at(200, 300, 40, 28))], VP)).toBe(0)
  })

  it('counts tags on each other, off the screen and over an untagged control', () => {
    const a = mark('a', at(100, 20, 40, 40))
    const b = mark('b', at(300, 20, 40, 40))
    expect(occlusions([tag(a, at(100, 200, 40, 28)), tag(b, at(120, 210, 40, 28))], VP)).toBe(1)
    expect(occlusions([tag(a, at(-10, 200, 40, 28))], VP)).toBe(1)
    expect(occlusions([tag(a, at(100, 200, 40, 28))], VP, { clear: [at(100, 200, 40, 40)] })).toBe(1)
  })

  it('lets a tall area’s tag sit in it', () => {
    const pads = mark('pads', at(40, 200, 320, 400))
    expect(occlusions([tag(pads, at(150, 390, 100, 28))], VP)).toBe(0)
  })
})

describe('layoutTags (the overlay’s placement)', () => {
  it('is crowded in a short window', () => {
    const short = { width: 800, height: 479 }
    const marks = [mark('a', at(100, 20, 40, 40)), mark('b', at(100, 70, 40, 40))]
    expect(layoutTags(marks, short, measure)).toEqual(clearArrows(placeTags(marks, short, measure, { crowded: true }), short))
  })

  it('keeps the plain places in a taller window where they hide nothing', () => {
    const marks = [mark('a', at(100, 20, 40, 40)), mark('b', at(300, 20, 40, 40))]
    expect(layoutTags(marks, VP, measure)).toEqual(placeTags(marks, VP, measure))
  })

  it('turns crowded in a taller window where a tag hides a control and the crowded rules hide fewer', () => {
    const a = mark('a', at(100, 20, 40, 40))
    const b = mark('b', at(100, 70, 40, 40))
    expect(occlusions(placeTags([a, b], VP, measure), VP)).toBeGreaterThan(0)
    const ps = layoutTags([a, b], VP, measure)
    expect(occlusions(ps, VP)).toBe(0)
    expect(overlaps(ps.find((p) => p.mark.id === 'a')!.rect, inflate(b.bounds, -1))).toBe(false)
  })
})

describe('clearArrows', () => {
  const P = mark('p', at(100, 20, 40, 40))
  const Q = mark('q', at(130, 20, 20, 20))
  const p: PlacedTag = { mark: P, text: 'P', textSize: { width: 42, height: 16 }, rect: at(90, 70, 60, 28), tip: { x: 120, y: 62 }, tail: { x: 120, y: 70 }, side: 0 }
  // Q's tag hangs lower: its arrow runs down past P's tag at x 140.
  const q: PlacedTag = { mark: Q, text: 'Q', textSize: { width: 22, height: 16 }, rect: at(120, 120, 40, 28), tip: { x: 140, y: 42 }, tail: { x: 140, y: 120 }, side: 0 }

  it('slides a tag off an arrow running under it, to the nearest place still on its own arrow', () => {
    const [moved, same] = clearArrows([p, q], VP)
    // Clear once its right edge, plus the arrow's 3px, is short of 140: left 76 (2 at a time from 90).
    expect(moved!.rect).toEqual(at(76, 70, 60, 28))
    expect(moved!.tip).toEqual(p.tip)
    expect(moved!.tail).toEqual(p.tail)
    expect(same).toBe(q)
  })

  it('leaves a tag where it is when sliding would put it on another tag', () => {
    const R = mark('r', at(30, 20, 20, 20))
    const blocker: PlacedTag = { ...p, mark: R, rect: at(20, 70, 60, 28), tip: { x: 40, y: 42 }, tail: { x: 40, y: 70 } }
    const out = clearArrows([p, q, blocker], VP)
    expect(out[0]!.rect).toEqual(p.rect)
  })
})

describe('hintTop', () => {
  const hint = { width: 200, height: 16 }
  const tagAt = (rect: Box): PlacedTag => ({ mark: mark('t', rect), text: 'T', textSize: { width: 10, height: 16 }, rect, tip: null, tail: null, side: 0 })

  it('stays at 72% where no tag is', () => {
    expect(hintTop(VP, [tagAt(at(100, 100, 200, 40))], hint)).toBeCloseTo(576)
  })

  it('moves to the middle of the tallest gap between the tags across its width', () => {
    // The tag (inflated: 554..606) leaves 8..554 above it and 606..792 below.
    expect(hintTop(VP, [tagAt(at(100, 560, 200, 40))], hint)).toBe((8 + 554 - 16) / 2)
    expect(hintTop(VP, [tagAt(at(100, 560, 200, 40))], hint, { left: 0, top: 40, right: 0, bottom: 0 })).toBe((48 + 554 - 16) / 2)
  })

  it('stays put when no gap is tall enough', () => {
    const tags = Array.from({ length: 20 }, (_, i) => tagAt(at(100, i * 40, 200, 30)))
    expect(hintTop(VP, tags, hint)).toBeCloseTo(576)
  })
})
