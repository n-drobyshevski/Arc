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
// - A narrow control on the screen's edge (at most 48px wide, at least twice as
//   tall as wide, within 2px of the left or right edge: the GUIDE tab, the
//   more-tools strip) gets the PO tutorial's side tag instead, placed first: a
//   vertical tab on that edge, its word turned (one line), centred on the
//   control and kept 48px below the top, with a hooked arrow above it pointing
//   at the edge ([sideHook]). The tab and 30px above it (the hook) are kept
//   clear by the other tags.
//
// Web delta: two side tags on one edge (the GUIDE tab and Live's EDIT tab
// under it) are stacked apart, hook and all: the overlap is shared, the upper
// tag moving up and the lower one down (more of it up when there is no room below).

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
  /**
   * 0 for an ordinary tag; -1 / 1 for a side tag on the left / right edge
   * ([rect] is then the vertical tab, its text turned; the hook is [sideHook]).
   */
  readonly side: -1 | 0 | 1
  /** The room the tag keeps from the others (a side tag's hook too); [rect] when absent. */
  readonly room?: Box
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
  /** A control this close to the screen's left or right edge is on it. */
  edgeSlack: 2,
  /** A control wider than this never gets a side tag. */
  edgeMaxWidth: 48,
  /** A side tag stays this far below the top margin. */
  sideTop: 40,
  /** Room above a side tag for its hook. */
  hookRoom: 30,
  /** The side tag's corner radius on its inner side. */
  sideRadius: 8,
  /** The hook's line width. */
  hookWidth: 3,
  /** The hook's vertical line stands this far inside the tab's inner side; its arrowhead tip is this far from the edge. */
  hookInset: 6,
  /** The hook starts this far above the tab. */
  hookGap: 8,
  /** The hook rises this far before it turns. */
  hookRise: 18,
  /** The radius of the hook's turn. */
  hookTurn: 6,
  /** Half the hook's arrowhead height; its length is 1.3 times this. */
  hookHead: 7,
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

/** Which screen edge [m] sits on for a side tag: -1 left, 1 right, 0 none (an ordinary tag). */
export function edgeOf(m: CoachMarkInput, viewport: Size): -1 | 0 | 1 {
  const w = m.bounds.right - m.bounds.left
  if (w > M.edgeMaxWidth || boxHeight(m.bounds) < w * 2) return 0
  if (m.bounds.left <= M.edgeSlack) return -1
  if (m.bounds.right >= viewport.width - M.edgeSlack) return 1
  return 0
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
  const hits = (r: Box): boolean => placed.some((p) => overlaps(inflate(p.room ?? p.rect, M.clearance), r))
  const order = placementOrder(marks, viewport)
  // Side tags first: the others keep clear of them.
  for (const m of order) {
    const side = edgeOf(m, viewport)
    if (side === 0) continue
    const text = m.label.toUpperCase()
    // One line, however long: it runs along the edge.
    const textSize = measure(text, Number.POSITIVE_INFINITY)
    const w = textSize.height + 2 * M.padY
    const h = textSize.width + 2 * M.padX
    const lowest = M.margin + M.sideTop
    const highest = viewport.height - M.margin - h
    let top = coerceIn(centerY(m.bounds) - h / 2, lowest, highest)
    // Web: two tabs stacked on one edge (GUIDE and Live's EDIT) keep their tags apart, hook and
    // all: the overlap is shared, the upper tag moving up and this one down, each near its tab.
    const above = placed.filter((p) => p.side === side).at(-1)
    if (above !== undefined) {
      const overlap = above.rect.bottom + M.clearance + M.hookRoom - top
      if (overlap > 0) {
        const room = Math.max(0, above.rect.top - lowest)
        const lift = Math.min(room, Math.max(overlap / 2, overlap - Math.max(0, highest - top)))
        if (lift > 0) {
          const r = above.rect
          const moved = box(r.left, r.top - lift, r.right - r.left, r.bottom - r.top)
          placed[placed.indexOf(above)] = { ...above, rect: moved, room: { ...moved, top: moved.top - M.hookRoom } }
        }
        top = Math.min(top + overlap - lift, highest)
      }
    }
    const left = side < 0 ? 0 : viewport.width - w
    const rect = box(left, top, w, h)
    const room = { left: rect.left, top: rect.top - M.hookRoom, right: rect.right, bottom: rect.bottom }
    placed.push({ mark: m, text, textSize, rect, tip: null, tail: null, side, room })
  }
  for (const m of order) {
    if (edgeOf(m, viewport) !== 0) continue
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
      placed.push({ mark: m, text, textSize, rect, tip: null, tail: null, side: 0 })
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
    placed.push({ mark: m, text, textSize, rect, tip, tail, side: 0 })
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

/** A side tag's hook: the stroked line (an SVG path) and its filled arrowhead. */
export interface SideHook {
  /** Up from the tab's inner side, a rounded turn, then across towards the edge. */
  readonly line: string
  /** The arrowhead: its tip at the edge, then the two back corners. */
  readonly head: readonly [Point, Point, Point]
}

/** The hooked arrow above a side tag [tab] on edge [side], pointing at that edge. */
export function sideHook(tab: Box, side: -1 | 1, viewportWidth: number): SideHook {
  const inner = side < 0 ? tab.right - M.hookInset : tab.left + M.hookInset
  const outer = side < 0 ? M.hookInset : viewportWidth - M.hookInset
  const bottom = tab.top - M.hookGap
  const bend = bottom - M.hookRise
  const turn = M.hookTurn
  const dir = side < 0 ? -1 : 1
  const end = outer - dir * M.hookHead
  const line = `M${inner} ${bottom}L${inner} ${bend + turn}Q${inner} ${bend} ${inner + dir * turn} ${bend}L${end} ${bend}`
  const back = outer - dir * M.hookHead * 1.3
  return { line, head: [{ x: outer, y: bend }, { x: back, y: bend - M.hookHead }, { x: back, y: bend + M.hookHead }] }
}
