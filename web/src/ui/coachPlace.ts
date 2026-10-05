// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Coach.kt (CoachOverlay's placement)
//
// Where the guide overlay puts each coloured tag and its arrow, as a pure
// function of the marked controls' bounds, the viewport and a text measurer, so
// it can be unit tested (test/ui/coachPlace.test.ts) and the component only
// measures and draws.
//
// The rules, as in Kotlin:
// - Tall areas (taller than a quarter of the screen: the pad grid, the backup
//   list, the side strip) go last; the rest in reading order (centre y, then x).
// - A tall area's tag sits in its middle, kept on screen, with no arrow; while
//   it touches a tag already placed (inflated by the clearance) it moves down
//   by its height plus the clearance, at most 8 times.
// - Any other tag hangs below its control when the control's centre is above
//   the middle of the screen, otherwise it stands above it; it starts 10px off
//   and moves out by its height plus the clearance while it touches a placed
//   tag, at most 8 times. Its x is centred on the control, kept 8px inside the
//   screen; the arrow runs from the tag's edge to 2px off the control.

/** A rectangle in px (Compose Rect: left, top, right, bottom). */
export interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

/** A control the overlay points at (Kotlin Mark, plus its id). */
export interface CoachMarkInput {
  readonly id: string
  readonly bounds: Box
  readonly label: string
  /** Tag and arrow colour (a CSS colour). */
  readonly face: string
  /** Tag text colour. */
  readonly ink: string
}

/**
 * Measures a tag's text: [text] is the label uppercased, laid out at most
 * [maxWidth] wide (wrapping); returns the text block's size, without padding.
 */
export type MeasureTag = (text: string, maxWidth: number) => Size

export interface PlacedTag {
  readonly mark: CoachMarkInput
  /** The uppercased label. */
  readonly text: string
  /** The text block's size (from the measurer). */
  readonly textSize: Size
  /** The tag, padding included. */
  readonly rect: Box
  /** Where the arrow points (2px off the control); null for a tall area. */
  readonly tip: Point | null
  /** Where the arrow leaves the tag; null for a tall area. */
  readonly tail: Point | null
}

/** CoachOverlay's metrics (dp = px). */
export const COACH_METRICS = Object.freeze({
  /** First distance between a control and its tag. */
  gap: 10,
  /** Tags stay this far inside the screen's edges. */
  margin: 8,
  padX: 9,
  padY: 6,
  /** Placed tags are inflated by this much when checking for a collision. */
  clearance: 6,
  /** The text's maximum width (it wraps beyond). */
  maxText: 170,
  /** The arrow tip stops this far from the control. */
  tipGap: 2,
  /** Arrow line width. */
  arrowWidth: 2,
  /** Half the arrowhead's width; its length is 1.2 times this. */
  head: 7,
  /** Tag corner radius. */
  radius: 6,
  /** How many times a tag moves out before it stays where it is. */
  maxTries: 8,
  /** A mark taller than this fraction of the screen is a tall area. */
  tallFraction: 0.25,
  /** The close hint's top, as a fraction of the screen height. */
  hintAt: 0.72,
})

const M = COACH_METRICS

export const centerX = (b: Box): number => (b.left + b.right) / 2
export const centerY = (b: Box): number => (b.top + b.bottom) / 2
export const boxHeight = (b: Box): number => b.bottom - b.top

/** Compose Rect.inflate. */
export function inflate(b: Box, d: number): Box {
  return { left: b.left - d, top: b.top - d, right: b.right + d, bottom: b.bottom + d }
}

/** Compose Rect.overlaps: shared edges don't count. */
export function overlaps(a: Box, b: Box): boolean {
  if (a.right <= b.left || b.right <= a.left) return false
  if (a.bottom <= b.top || b.bottom <= a.top) return false
  return true
}

/**
 * Kotlin coerceIn(min, max). Kotlin throws when max < min (a screen narrower
 * than the tag); here the tag then sticks to the left margin.
 */
export function coerceIn(v: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(v, min), max)
}

function box(left: number, top: number, w: number, h: number): Box {
  return { left, top, right: left + w, bottom: top + h }
}

function translateY(b: Box, dy: number): Box {
  return { left: b.left, top: b.top + dy, right: b.right, bottom: b.bottom + dy }
}

/** Whether [m] is a tall area (its tag goes in its middle, with no arrow). */
export function isTall(m: CoachMarkInput, viewport: Size): boolean {
  return boxHeight(m.bounds) > viewport.height * M.tallFraction
}

/** The order tags are placed in: tall areas last, then by centre y, then centre x (stable). */
export function placementOrder(marks: readonly CoachMarkInput[], viewport: Size): CoachMarkInput[] {
  return marks
    .map((m, i) => ({ m, i, tall: isTall(m, viewport) ? 1 : 0, y: centerY(m.bounds), x: centerX(m.bounds) }))
    .sort((a, b) => a.tall - b.tall || a.y - b.y || a.x - b.x || a.i - b.i)
    .map((e) => e.m)
}

/** Places every mark's tag (CoachOverlay's first pass), in placement order. */
export function placeTags(marks: readonly CoachMarkInput[], viewport: Size, measure: MeasureTag): PlacedTag[] {
  const placed: PlacedTag[] = []
  const hits = (r: Box): boolean => placed.some((p) => overlaps(inflate(p.rect, M.clearance), r))
  for (const m of placementOrder(marks, viewport)) {
    const text = m.label.toUpperCase()
    const textSize = measure(text, M.maxText)
    const w = textSize.width + 2 * M.padX
    const h = textSize.height + 2 * M.padY
    const cx = centerX(m.bounds)
    const left = coerceIn(cx - w / 2, M.margin, viewport.width - M.margin - w)
    if (isTall(m, viewport)) {
      let rect = box(left, centerY(m.bounds) - h / 2, w, h)
      let tries = 0
      while (hits(rect) && tries++ < M.maxTries) rect = translateY(rect, h + M.clearance)
      placed.push({ mark: m, text, textSize, rect, tip: null, tail: null })
      continue
    }
    const below = centerY(m.bounds) < viewport.height / 2
    let reach = M.gap
    let tries = 0
    let rect: Box
    for (;;) {
      const top = below ? m.bounds.bottom + reach : m.bounds.top - reach - h
      rect = box(left, top, w, h)
      if (!hits(rect) || ++tries > M.maxTries) break
      reach += h + M.clearance
    }
    const tip = below ? { x: cx, y: m.bounds.bottom + M.tipGap } : { x: cx, y: m.bounds.top - M.tipGap }
    const tail = below ? { x: cx, y: rect.top } : { x: cx, y: rect.bottom }
    placed.push({ mark: m, text, textSize, rect, tip, tail })
  }
  return placed
}

/** The arrowhead triangle at [tip], pointing away from [tail]: tip, left corner, right corner. */
export function arrowHead(tip: Point, tail: Point, head: number = M.head): [Point, Point, Point] {
  const dir = tail.y > tip.y ? -1 : 1
  const y = tip.y - dir * head * 1.2
  return [tip, { x: tip.x - head, y }, { x: tip.x + head, y }]
}

/** The close hint's top edge: below the middle, clear of a tag in the middle of the pad grid. */
export function hintTop(viewport: Size): number {
  return viewport.height * M.hintAt
}
