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
//   more-tools strip) gets the PO tutorial's side tag: a vertical tab on that
//   edge, its word turned (one line), centred on the control and kept 48px
//   below the top, with a hooked arrow above it pointing at the edge
//   ([sideHook]). The tab and 30px above it (the hook) keep clear of the tags
//   beside their controls, which are placed first: the tab slides down (while
//   its hook still meets the control) or up (while it still runs beside it)
//   until it is clear. One that finds no room goes first instead, and the
//   others make way for it.
// - In a crowded window ([PlaceOptions.crowded]: Kotlin's short window, a
//   phone on its side) no tag sits on another control or on another tag's
//   arrow: it slides sideways off them while it still meets its own arrow, or
//   goes further out, to the other side of its control, beside it (the arrow
//   pointing across), or meets a wide control towards one end; whichever fits
//   best. The order the tags are placed in is then tried both ways around any
//   arrow that still runs across a tag, and the best kept.
// - The close hint sits at 72% of the height; where a tag is there anyway, in
//   the middle of the tallest gap between the tags instead ([hintTop]).
//
// Web deltas:
// - [layoutTags] (the overlay's entry point) uses the crowded rules in a short
//   window, as Kotlin does, and also in any other window whose plain placement
//   hides a control under a tag (Device's two keys under the top bar, on a
//   phone upright or a computer), when they hide fewer. The plain placement
//   reworks its order around crossed arrows too ([PlaceOptions.reorder]): the
//   top bar's tags then take their two heights so no arrow runs under a tag.
// - When crowded, the tags keep off the edge tabs too (the GUIDE tab, the
//   more-tools strip), so the control a side tag's hook points at stays in view.
// - The order search also counts tags on each other, and tries other orders
//   for them (Kotlin's counts only arrows across tags).
// - Last, a tag another tag's arrow runs under slides sideways off it where it
//   can ([clearArrows]).
// - Two side tags on one edge (the GUIDE tab and Live's EDIT tab under it) are
//   stacked apart, hook and all: the overlap is shared, the upper tag moving up
//   (where that is clear) and the lower one down (more of it up when there is
//   no room below), before either slides. Where both can't fit (a phone on its
//   side), the lower tab gets an ordinary tag beside it instead.
// - A side tag stands on the edge its control hugs: the screen's edge, or the
//   safe area's (the web's edge controls aren't padded for a notch, Android's
//   are, so both are their control's own edge).
// - Measuring a label lays it out in the page: [placeTags] measures each label
//   once per call ([MeasureTag] results are memoised).

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

/** The safe area's insets in px (env(safe-area-inset-*); WindowInsets.safeDrawing). */
export interface Insets {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export const NO_INSETS: Insets = Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 })

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
  /** Where the arrow points (2px off the control); null for a tall area or a side tag. */
  readonly tip: Point | null
  /** Where the arrow leaves the tag; null for a tall area or a side tag. Level with [tip] for a tag beside its control. */
  readonly tail: Point | null
  /**
   * 0 for an ordinary tag; -1 / 1 for a side tag on the left / right edge
   * ([rect] is then the vertical tab, its text turned; the hook is [sideHook]).
   */
  readonly side: -1 | 0 | 1
  /** The room the tag keeps from the others (a side tag's hook too); [rect] when absent. */
  readonly room?: Box
  /** A side tag's edge: the x its tab stands on and its hook points at. */
  readonly edge?: number
}

/** How to place the tags. */
export interface PlaceOptions {
  /**
   * Kotlin's short window: no tag on another control or another tag's arrow,
   * the other places and orders tried. Off: the tags keep their plain places.
   */
  readonly crowded?: boolean
  /** Controls with no tag of their own that tags keep off when crowded (Kotlin coachClear: the octave's − and +). */
  readonly clear?: readonly Box[]
  /** The safe area (where edge controls may stand, and the close hint's room). */
  readonly safe?: Insets
  /**
   * Whether the placing order is reworked around an arrow running across a tag
   * (always when crowded; a web delta for the plain places, see [layoutTags]).
   */
  readonly reorder?: boolean
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
  /** A window shorter than this is crowded (Kotlin ArcWindow.short: a phone on its side). */
  shortHeight: 480,
  /** A control this close to the screen's left or right edge is on it. */
  edgeSlack: 2,
  /** A control wider than this never gets a side tag. */
  edgeMaxWidth: 48,
  /** A side tag stays this far below the top margin. */
  sideTop: 40,
  /** Room above a side tag for its hook. */
  hookRoom: 30,
  /** A side tag looking for room moves this far at a time. */
  sideStep: 4,
  /** A side tag that slides keeps this much of it level with its control (running beside it, or its hook meeting it). */
  sideReach: 12,
  /** How far the hook reaches above the tab (hookGap + hookRise). */
  hookReach: 26,
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
  /** Controls are shrunk by this much before checking whether a tag or arrow is on them (touching isn't). */
  controlInset: 1,
  /** An arrow keeps this far from a tag when crowded. */
  arrowRoom: 3,
  /** A tag sliding sideways off something moves this far at a time. */
  slideStep: 2,
  /** A wide control's arrow may meet it this far from either end, when crowded. */
  endReach: 12,
  /** A place must fit better than this to beat the plain one (a misfit is ~100 per thing in the way). */
  better: 5,
  /** How many times the placing order is reworked around crossed arrows. */
  orderPasses: 4,
  /** A tag over this much of a control's area hides it (layoutTags). */
  occluded: 0.25,
})

const M = COACH_METRICS

export const centerX = (b: Box): number => (b.left + b.right) / 2
export const centerY = (b: Box): number => (b.top + b.bottom) / 2
export const boxHeight = (b: Box): number => b.bottom - b.top
export const boxWidth = (b: Box): number => b.right - b.left

/** Compose Rect.inflate (a negative [d] deflates). */
export function inflate(b: Box, d: number): Box {
  return { left: b.left - d, top: b.top - d, right: b.right + d, bottom: b.bottom + d }
}

/** Compose Rect.overlaps: shared edges don't count. */
export function overlaps(a: Box, b: Box): boolean {
  if (a.right <= b.left || b.right <= a.left) return false
  if (a.bottom <= b.top || b.bottom <= a.top) return false
  return true
}

/** Compose Rect.contains(Offset): the left and top edges are in, the right and bottom ones out. */
export function contains(b: Box, p: Point): boolean {
  return p.x >= b.left && p.x < b.right && p.y >= b.top && p.y < b.bottom
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

/**
 * Whether the arrow from [tail] to [tip] (straight down, up or across) runs over
 * [r]. An arrow ending on [r]'s edge doesn't (as a tag's own arrow leaves it).
 */
export function crosses(tip: Point, tail: Point, r: Box): boolean {
  if (tip.x === tail.x) return tip.x >= r.left && tip.x <= r.right && r.top < Math.max(tip.y, tail.y) && r.bottom > Math.min(tip.y, tail.y)
  return tip.y >= r.top && tip.y <= r.bottom && r.left < Math.max(tip.x, tail.x) && r.right > Math.min(tip.x, tail.x)
}

/** Whether [m] is a tall area (its tag goes in its middle, with no arrow). */
export function isTall(m: CoachMarkInput, viewport: Size): boolean {
  return boxHeight(m.bounds) > viewport.height * M.tallFraction
}

/** Which screen edge [m] sits on for a side tag: -1 left, 1 right, 0 none (an ordinary tag). */
export function edgeOf(m: CoachMarkInput, viewport: Size, safe: Insets = NO_INSETS): -1 | 0 | 1 {
  const w = boxWidth(m.bounds)
  if (w > M.edgeMaxWidth || boxHeight(m.bounds) < w * 2) return 0
  if (m.bounds.left <= safe.left + M.edgeSlack) return -1
  if (m.bounds.right >= viewport.width - safe.right - M.edgeSlack) return 1
  return 0
}

/** The x a side tag on [side] stands on: the screen's edge if its control hugs it, else the safe area's. */
function edgeX(m: CoachMarkInput, side: -1 | 1, viewport: Size, safe: Insets): number {
  if (side < 0) return m.bounds.left <= M.edgeSlack ? 0 : safe.left
  return m.bounds.right >= viewport.width - M.edgeSlack ? viewport.width : viewport.width - safe.right
}

/** The order tags are placed in: tall areas last, then by centre y, then centre x (stable). */
export function placementOrder(marks: readonly CoachMarkInput[], viewport: Size): CoachMarkInput[] {
  return marks
    .map((m, i) => ({ m, i, tall: isTall(m, viewport) ? 1 : 0, y: centerY(m.bounds), x: centerX(m.bounds) }))
    .sort((a, b) => a.tall - b.tall || a.y - b.y || a.x - b.x || a.i - b.i)
    .map((e) => e.m)
}

/** [measure], laying each text out once per width. */
function memoised(measure: MeasureTag): MeasureTag {
  const sizes = new Map<string, Size>()
  return (text, maxWidth) => {
    const key = `${maxWidth}\u0000${text}`
    let s = sizes.get(key)
    if (!s) {
      s = measure(text, maxWidth)
      sizes.set(key, s)
    }
    return s
  }
}

/** The room a placed tag keeps from the others. */
const roomOf = (p: PlacedTag): Box => p.room ?? p.rect

/** A place for a tag and its arrow. */
interface Spot {
  readonly rect: Box
  readonly tip: Point
  readonly tail: Point
}

/**
 * Places every mark's tag (CoachOverlay's placement): the tags beside their
 * controls, then the side tags, then the tall areas'. Two side tags on one edge
 * with no room for both, hooks and all (GUIDE and Live's EDIT under it, on a
 * phone on its side), would sit on each other: the lower one then gets an
 * ordinary tag by its tab instead (a web delta).
 */
export function placeTags(marks: readonly CoachMarkInput[], viewport: Size, measure: MeasureTag, opts: PlaceOptions = {}): PlacedTag[] {
  const sized = memoised(measure)
  const asTag = new Set<string>()
  for (;;) {
    const placed = placeOnce(marks, viewport, sized, opts, asTag)
    const lower = placed.find(
      (p) => p.side !== 0 && placed.some((q) => q !== p && q.side === p.side && centerY(q.mark.bounds) < centerY(p.mark.bounds) && overlaps(roomOf(p), q.rect)),
    )
    if (!lower || asTag.has(lower.mark.id)) return placed
    asTag.add(lower.mark.id)
  }
}

/** One placement, the side controls in [asTag] given ordinary tags. */
function placeOnce(marks: readonly CoachMarkInput[], viewport: Size, measure: MeasureTag, opts: PlaceOptions, asTag: ReadonlySet<string>): PlacedTag[] {
  const crowded = opts.crowded ?? false
  const safe = opts.safe ?? NO_INSETS
  const vw = viewport.width
  const vh = viewport.height
  const sized = memoised(measure)
  const list = placementOrder(marks, viewport)
  // A side tab given an ordinary tag is a control, however tall: its tag points at it from beside it.
  const tall = (m: CoachMarkInput): boolean => !asTag.has(m.id) && isTall(m, viewport)
  const edge = (m: CoachMarkInput): -1 | 0 | 1 => (asTag.has(m.id) ? 0 : edgeOf(m, viewport, safe))
  // When crowded, the controls a tag must leave in view: every marked one but the tall areas
  // (their tags sit in them), and the ones with no tag. Otherwise the tags keep their places as
  // they were. Arrows point just under or over [controls]; the edge tabs (their own tags hook
  // round to them) are only kept clear.
  const controls = crowded ? list.filter((m) => !tall(m) && edge(m) === 0) : []
  const blockers = crowded ? [...controls, ...list.filter((m) => edge(m) !== 0)] : []
  const untagged = crowded ? (opts.clear ?? []).map((b) => inflate(b, -M.controlInset)) : []
  const onControls = (r: Box, own: CoachMarkInput): number =>
    blockers.filter((c) => c !== own && overlaps(inflate(c.bounds, -M.controlInset), r)).length + untagged.filter((u) => overlaps(u, r)).length

  const placed: PlacedTag[] = []

  /** Whether the side tag found room clear of the tags already placed. */
  const placeSide = (m: CoachMarkInput, side: -1 | 1): boolean => {
    const text = m.label.toUpperCase()
    // One line, however long: it runs along the edge.
    const textSize = sized(text, Number.POSITIVE_INFINITY)
    const w = textSize.height + 2 * M.padY
    const h = textSize.width + 2 * M.padX
    const lo = M.margin + M.sideTop
    const hi = vh - M.margin - h
    const at = edgeX(m, side, viewport, safe)
    const left = side < 0 ? at : at - w
    // With room for the hook above it, so other tags keep clear; neither covers a control
    // (on a phone on its side, the hook would otherwise reach up into the top bar).
    const room = (top: number): Box => ({ left, top: top - M.hookRoom, right: left + w, bottom: top + h })
    const clear = (top: number): boolean =>
      !placed.some((p) => overlaps(inflate(roomOf(p), M.clearance), room(top))) && onControls(room(top), m) === 0
    let centred = coerceIn(centerY(m.bounds) - h / 2, lo, hi)
    // Web: two tabs stacked on one edge (GUIDE and Live's EDIT) keep their tags apart, hook and
    // all: the overlap is shared, the upper tag moving up (where it stays clear) and this one
    // down, each near its tab.
    const above = placed.filter((p) => p.side === side && centerY(p.mark.bounds) <= centerY(m.bounds)).at(-1)
    if (above !== undefined) {
      const overlap = above.rect.bottom + M.clearance + M.hookRoom - centred
      if (overlap > 0) {
        let lift = Math.min(Math.max(0, above.rect.top - lo), Math.max(overlap / 2, overlap - Math.max(0, hi - centred)))
        if (lift > 0) {
          const r = above.rect
          const moved = box(r.left, r.top - lift, r.right - r.left, r.bottom - r.top)
          const movedRoom = { ...moved, top: moved.top - M.hookRoom }
          const free = !placed.some((p) => p !== above && overlaps(inflate(roomOf(p), M.clearance), movedRoom)) && onControls(movedRoom, above.mark) === 0
          if (free) placed[placed.indexOf(above)] = { ...above, rect: moved, room: movedRoom }
          else lift = 0
        }
        centred = Math.min(centred + overlap - lift, hi)
      }
    }
    // On a phone on its side the edge controls sit high, where the top bar's tags hang: the
    // side tag slides down clear of them while its hook still meets the control, or up while
    // the tag still runs beside it.
    let top: number | null = null
    if (clear(centred)) {
      top = centred
    } else {
      for (let t = centred; t <= hi && t - M.hookReach <= m.bounds.bottom - M.sideReach; t += M.sideStep) {
        if (clear(t)) {
          top = t
          break
        }
      }
      if (top === null) {
        for (let t = centred; t >= lo && t + h >= m.bounds.top + M.sideReach; t -= M.sideStep) {
          if (clear(t)) {
            top = t
            break
          }
        }
      }
    }
    const y = top ?? centred
    placed.push({ mark: m, text, textSize, rect: box(left, y, w, h), tip: null, tail: null, side, room: room(y), edge: at })
    return top !== null
  }

  const placeTag = (m: CoachMarkInput): void => {
    const text = m.label.toUpperCase()
    const textSize = sized(text, M.maxText)
    const w = textSize.width + 2 * M.padX
    const h = textSize.height + 2 * M.padY
    // A tall area (the pad grid, the side strip) gets its tag in its middle, with no arrow;
    // kept on screen, so a strip at the edge still shows its whole tag.
    if (tall(m)) {
      const left = coerceIn(centerX(m.bounds) - w / 2, M.margin, vw - M.margin - w)
      let rect = box(left, centerY(m.bounds) - h / 2, w, h)
      let tries = 0
      while (placed.some((p) => overlaps(inflate(roomOf(p), M.clearance), rect)) && tries++ < M.maxTries) rect = translateY(rect, h + M.clearance)
      placed.push({ mark: m, text, textSize, rect, tip: null, tail: null, side: 0 })
      return
    }
    // Where the arrow meets the control: its middle, or (see below) towards one end.
    let x = centerX(m.bounds)
    let left = 0
    // The lefts the tag may slide to and still meet its arrow.
    let from = 0
    let to = 0
    const aim = (at: number): void => {
      x = at
      left = coerceIn(x - w / 2, M.margin, vw - M.margin - w)
      from = Math.max(M.margin, x - w + M.padX)
      to = Math.min(vw - M.margin - w, x - M.padX)
    }
    aim(x)
    // On a tag placed, or (when crowded) on its arrow.
    const hits = (r: Box): boolean =>
      placed.some(
        (p) =>
          overlaps(inflate(roomOf(p), M.clearance), r) ||
          (crowded && p.tip !== null && p.tail !== null && crosses(p.tip, p.tail, inflate(r, M.arrowRoom))),
      )
    const hitsSide = (r: Box): boolean => placed.some((p) => p.side !== 0 && overlaps(inflate(roomOf(p), M.clearance), r))
    // When crowded (the top bar's tags hanging over the row of words under it) a tag there
    // would hide where another control's arrow points (just under or over it): the tag slides
    // sideways off that point if it can and still meet its own arrow, or else hangs further
    // out. (A control its own arrow runs over anyway doesn't count.)
    const under = (r: Box): CoachMarkInput[] => {
      if (!crowded) return []
      const near = inflate(r, M.clearance)
      return list.filter((n) => {
        const b = n.bounds
        return (
          n !== m && !tall(n) && edge(n) === 0 && !(x >= b.left && x <= b.right) &&
          (contains(near, { x: centerX(b), y: b.bottom + M.tipGap }) || contains(near, { x: centerX(b), y: b.top - M.tipGap }))
        )
      })
    }
    // The arrows of the other controls above or below this place that run (or, their tags not
    // placed yet, may run) across it.
    const lines = (r: Box): number =>
      controls.filter((n) => {
        const p = placed.find((q) => q.mark === n)
        const cx = centerX(n.bounds)
        return (
          n !== m && cx >= r.left - M.clearance && cx <= r.right + M.clearance && (n.bounds.bottom <= r.top || n.bounds.top >= r.bottom) &&
          (!p || p.tip === null || p.tail === null || crosses(p.tip, p.tail, inflate(r, M.clearance)))
        )
      }).length
    /** The first place at [top], [left] ± 2, ± 4…, within [from]..[to], that [ok] takes. */
    const slide = (base: number, top: number, ok: (r: Box) => boolean): Box | null => {
      const n = Math.trunc((to - from) / M.slideStep)
      for (let i = 1; i <= n; i++) {
        for (const l of [base - i * M.slideStep, base + i * M.slideStep]) {
          if (l < from || l > to) continue
          const r = box(l, top, w, h)
          if (ok(r)) return r
        }
      }
      return null
    }
    // Pushed further out, below or above the control, until it clears the tags placed and the
    // other controls (sliding sideways off them where it still meets its arrow).
    const out = (below: boolean): Box => {
      let reach: number = M.gap
      let rect: Box
      let tries = 0
      for (;;) {
        const top = below ? m.bounds.bottom + reach : m.bounds.top - reach - h
        rect = box(left, top, w, h)
        let blocked = hits(rect)
        const covered = under(rect).length
        const edgeTag = hitsSide(rect)
        const onControl = onControls(rect, m) > 0
        // (When crowded a tag also slides off another tag before going further out.)
        if (covered > 0 || edgeTag || onControl || (crowded && blocked)) {
          const off =
            slide(left, top, (r) => under(r).length === 0 && !hits(r) && onControls(r, m) === 0) ??
            (edgeTag && !onControl ? slide(left, top, (r) => !hits(r) && under(r).length <= covered && onControls(r, m) === 0) : null)
          if (off) {
            rect = off
            blocked = false
          } else if (covered > 0 || onControl) {
            blocked = true
          }
        }
        if (!blocked || ++tries > M.maxTries) break
        reach += h + M.clearance
      }
      // When crowded, slid off the line another control's arrow runs down (or up) where it can,
      // so that arrow needn't cross it.
      if (crowded && !hits(rect) && lines(rect) > 0) {
        const r0 = rect
        const fewer = slide(r0.left, r0.top, (r) => lines(r) < lines(r0) && under(r).length <= under(r0).length && !hits(r) && onControls(r, m) === 0)
        if (fewer) rect = fewer
      }
      return rect
    }
    // Where the tag goes, and its arrow: from the tag's edge to just off the control's.
    const vertical = (below: boolean): Spot => {
      const r = out(below)
      return below
        ? { rect: r, tip: { x, y: m.bounds.bottom + M.tipGap }, tail: { x, y: r.top } }
        : { rect: r, tip: { x, y: m.bounds.top - M.tipGap }, tail: { x, y: r.bottom } }
    }
    // Beside the control, level with it, the arrow pointing across.
    const beside = (right: boolean): Spot => {
      const y = centerY(m.bounds)
      const r = box(right ? m.bounds.right + M.gap : m.bounds.left - M.gap - w, y - h / 2, w, h)
      return right
        ? { rect: r, tip: { x: m.bounds.right + M.tipGap, y }, tail: { x: r.left, y } }
        : { rect: r, tip: { x: m.bounds.left - M.tipGap, y }, tail: { x: r.right, y } }
    }
    // How badly a place fits: off the screen, on another tag or control, its arrow across other
    // tags or controls, over where other arrows point, and (a little) a long arrow.
    const misfit = (s: Spot): number => {
      const r = s.rect
      const crossed =
        placed.filter((p) => crosses(s.tip, s.tail, roomOf(p))).length +
        blockers.filter((c) => c !== m && crosses(s.tip, s.tail, inflate(c.bounds, -M.controlInset))).length +
        untagged.filter((u) => crosses(s.tip, s.tail, u)).length
      const off = r.top < M.margin || r.bottom > vh - M.margin || r.left < M.margin || r.right > vw - M.margin
      return (off ? 1000 : 0) + (hits(r) ? 100 : 0) + 100 * onControls(r, m) + 10 * (crossed + under(r).length + lines(r)) +
        (Math.abs(s.tail.x - s.tip.x) + Math.abs(s.tail.y - s.tip.y)) / vh
    }
    // Below a control in the top half, above one in the bottom half; when crowded the other side,
    // or beside the control (the side with more room first), where that fits better.
    const below = centerY(m.bounds) < vh / 2
    let spot = vertical(below)
    if (crowded) {
      let fit = misfit(spot)
      const right = x < vw / 2
      for (const other of [vertical(!below), beside(right), beside(!right)]) {
        const f = misfit(other)
        if (f + M.better < fit) {
          spot = other
          fit = f
        }
      }
      // Or its arrow meets the control towards one end, so the tag can hang clear of the arrow of
      // a control just over or under it (the section tag over the row of words).
      if (boxWidth(m.bounds) > 4 * M.endReach) {
        for (const at of [m.bounds.right - M.endReach, m.bounds.left + M.endReach]) {
          aim(at)
          const other = vertical(below)
          const f = misfit(other)
          if (f + M.better < fit) {
            spot = other
            fit = f
          }
        }
      }
    }
    placed.push({ mark: m, text, textSize, rect: spot.rect, tip: spot.tip, tail: spot.tail, side: 0 })
  }

  // The tags beside their controls first (in [order]), then the edge tabs' tags around them,
  // then the tall areas' tags in whatever room is left. An edge tab's tag that finds no room
  // that way goes first instead, and the others make way for it.
  const layout = (order: readonly CoachMarkInput[]): void => {
    const early = new Set<CoachMarkInput>()
    for (;;) {
      placed.length = 0
      for (const m of list) {
        const side = edge(m)
        if (side !== 0 && early.has(m)) placeSide(m, side)
      }
      for (const m of order) placeTag(m)
      const cramped: CoachMarkInput[] = []
      for (const m of list) {
        const side = edge(m)
        if (side !== 0 && !early.has(m) && !placeSide(m, side)) cramped.push(m)
      }
      for (const m of list) if (edge(m) === 0 && tall(m)) placeTag(m)
      if (cramped.length === 0) break
      for (const m of cramped) early.add(m)
    }
  }
  const crossings = (p: PlacedTag): number => {
    const { tip, tail } = p
    if (!tip || !tail) return 0
    return placed.filter((q) => q !== p && crosses(tip, tail, roomOf(q))).length
  }
  // The tags [p] sits on (a web delta: Kotlin's score leaves them out, so a crowded window
  // could keep two tags on each other when every place near one was taken).
  const stacked = (p: PlacedTag): number => placed.filter((q) => q !== p && overlaps(roomOf(p), roomOf(q))).length
  // How well the tags fit together: none off the screen, on another tag or on a control, no
  // arrow across another tag, and short arrows.
  const score = (): number =>
    placed.reduce((sum, p) => {
      const r = roomOf(p)
      const off = r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw
      const arrow = p.tip && p.tail ? Math.abs(p.tail.x - p.tip.x) + Math.abs(p.tail.y - p.tip.y) : 0
      return sum + (off ? 1000 : 0) + 100 * (onControls(r, p.mark) + stacked(p)) + 10 * crossings(p) + arrow / vh
    }, 0)

  let order = list.filter((m) => edge(m) === 0 && !tall(m))
  layout(order)
  // When crowded, top to bottom can leave an arrow running across another tag (or, a web delta,
  // a tag on another): the tags either side of such a crossing are tried earlier or later in
  // turn, and the best order kept.
  if (crowded || opts.reorder) {
    let best = score()
    for (let pass = 0; pass < M.orderPasses; pass++) {
      const crossed = placed.filter((p) => crossings(p) > 0)
      const involved = placed
        .filter((p) => crossings(p) > 0 || stacked(p) > 0 || crossed.some((q) => q.tip && q.tail && crosses(q.tip, q.tail, roomOf(p))))
        .map((p) => p.mark)
        .filter((m) => order.includes(m))
      let bestOrder: CoachMarkInput[] | null = null
      for (const m of involved) {
        const i = order.indexOf(m)
        for (let j = 0; j < order.length; j++) {
          if (j === i) continue
          const tried = order.filter((_, k) => k !== i)
          tried.splice(j, 0, m)
          layout(tried)
          const fit = score()
          if (fit < best - 1) {
            best = fit
            bestOrder = tried
          }
        }
      }
      if (!bestOrder) break
      order = bestOrder
      layout(order)
    }
    layout(order)
  }
  return placed.slice()
}

/** The area [a] and [b] share. */
function shared(a: Box, b: Box): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}

/**
 * What [placed] hides, whatever rules placed it: a tag off the screen, a tag on
 * another tag, and a tag over a quarter or more of a marked control (not a tall
 * area) or an untagged one. A sliver doesn't count: a word's touch area reaches
 * well past its letters.
 */
export function occlusions(placed: readonly PlacedTag[], viewport: Size, opts: Omit<PlaceOptions, 'crowded'> = {}): number {
  const controls = placed.filter((p) => !isTall(p.mark, viewport) || p.side !== 0).map((p) => p.mark)
  const covers = (r: Box, c: Box): boolean => {
    const area = boxWidth(c) * boxHeight(c)
    return area > 0 && shared(r, c) >= area * M.occluded
  }
  let n = 0
  placed.forEach((p, i) => {
    const r = p.rect
    if (r.left < 0 || r.top < 0 || r.right > viewport.width || r.bottom > viewport.height) n++
    for (let j = i + 1; j < placed.length; j++) if (overlaps(r, placed[j]!.rect)) n++
    n += controls.filter((c) => c !== p.mark && covers(r, c.bounds)).length
    n += (opts.clear ?? []).filter((c) => covers(r, c)).length
  })
  return n
}

/**
 * Slides each tag that another tag's arrow runs under sideways off it, where
 * the tag still meets its own (up or down) arrow, stays on the screen and
 * clear of the other tags, their arrows and any control it didn't already
 * touch (an arrow running down behind a neighbour's tag in a row of keys).
 * The nearest such place wins; a tag with nowhere to go stays.
 */
export function clearArrows(placed: readonly PlacedTag[], viewport: Size, opts: Omit<PlaceOptions, 'crowded'> = {}): PlacedTag[] {
  const out = placed.slice()
  const safe = opts.safe ?? NO_INSETS
  const controls = [
    ...out.filter((p) => !isTall(p.mark, viewport) || edgeOf(p.mark, viewport, safe) !== 0).map((p) => ({ mark: p.mark as CoachMarkInput | null, box: inflate(p.mark.bounds, -M.controlInset) })),
    ...(opts.clear ?? []).map((b) => ({ mark: null, box: inflate(b, -M.controlInset) })),
  ]
  const touched = (r: Box, own: CoachMarkInput): number => controls.filter((c) => c.mark !== own && overlaps(c.box, r)).length
  const crossedBy = (r: Box, i: number): boolean =>
    out.some((q, j) => j !== i && q.tip !== null && q.tail !== null && crosses(q.tip, q.tail, inflate(r, M.arrowRoom)))
  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    out.forEach((p, i) => {
      const { tip, tail } = p
      if (p.side !== 0 || !tip || !tail || tip.x !== tail.x || !crossedBy(p.rect, i)) return
      const w = boxWidth(p.rect)
      const from = Math.max(M.margin, tip.x - w + M.padX)
      const to = Math.min(viewport.width - M.margin - w, tip.x - M.padX)
      const before = touched(p.rect, p.mark)
      const fits = (r: Box): boolean =>
        !crossedBy(r, i) &&
        !out.some((q, j) => j !== i && overlaps(inflate(roomOf(q), M.clearance), r)) &&
        touched(r, p.mark) <= before
      const n = Math.trunc((to - from) / M.slideStep)
      for (let k = 1; k <= n; k++) {
        const left = [p.rect.left - k * M.slideStep, p.rect.left + k * M.slideStep].find((l) => l >= from && l <= to && fits(box(l, p.rect.top, w, boxHeight(p.rect))))
        if (left === undefined) continue
        out[i] = { ...p, rect: box(left, p.rect.top, w, boxHeight(p.rect)) }
        moved = true
        break
      }
    })
    if (!moved) break
  }
  return out
}

/**
 * The overlay's placement: crowded in a short window (Kotlin's rule). In any
 * other the plain places (in whichever order leaves the fewest arrows across
 * tags), unless a tag there hides a control (or another tag) and the crowded
 * rules hide fewer (a web delta: Device's keys under the top bar, upright or on
 * a computer). Then tags slide off the arrows running under them where they
 * can ([clearArrows], also a web delta).
 */
export function layoutTags(marks: readonly CoachMarkInput[], viewport: Size, measure: MeasureTag, opts: Omit<PlaceOptions, 'crowded'> = {}): PlacedTag[] {
  const sized = memoised(measure)
  const chosen = ((): PlacedTag[] => {
    if (viewport.height < M.shortHeight) return placeTags(marks, viewport, sized, { ...opts, crowded: true })
    // The plain places, in the order that leaves the fewest arrows across tags (the top bar's
    // second-row tags otherwise run their arrows under the first row's).
    const plain = placeTags(marks, viewport, sized, { ...opts, crowded: false, reorder: true })
    const hidden = occlusions(plain, viewport, opts)
    if (hidden === 0) return plain
    const careful = placeTags(marks, viewport, sized, { ...opts, crowded: true })
    return occlusions(careful, viewport, opts) < hidden ? careful : plain
  })()
  return clearArrows(chosen, viewport, opts)
}

/** The arrowhead triangle at [tip], pointing away from [tail] (down, up or across): tip, then the two back corners. */
export function arrowHead(tip: Point, tail: Point, head: number = M.head): [Point, Point, Point] {
  if (tip.x === tail.x) {
    const dir = tail.y > tip.y ? -1 : 1
    const y = tip.y - dir * head * 1.2
    return [tip, { x: tip.x - head, y }, { x: tip.x + head, y }]
  }
  // Beside its control, pointing across.
  const dir = tail.x > tip.x ? -1 : 1
  const x = tip.x - dir * head * 1.2
  return [tip, { x, y: tip.y - head }, { x, y: tip.y + head }]
}

/**
 * The close hint's top edge: below the middle (72%), clear of a tag in the
 * middle of the pad grid. Where a tag is there anyway ([placed], the hint
 * [size] centred), in the middle of the tallest gap between the tags across
 * the hint's width, within the safe area, if the hint fits there.
 */
export function hintTop(viewport: Size, placed: readonly PlacedTag[] = [], size?: Size, safe: Insets = NO_INSETS): number {
  const at = viewport.height * M.hintAt
  if (!size) return at
  const left = (viewport.width - size.width) / 2
  const tags = placed.map((p) => inflate(roomOf(p), M.clearance))
  if (!tags.some((r) => overlaps(r, box(left, at, size.width, size.height)))) return at
  const top = safe.top + M.margin
  const bottom = viewport.height - safe.bottom - M.margin
  let from = top
  let best: [number, number] = [top, top]
  const across = tags.filter((r) => r.left < left + size.width && r.right > left).sort((a, b) => a.top - b.top)
  for (const r of across) {
    const to = Math.min(r.top, bottom)
    if (to - from > best[1] - best[0]) best = [from, to]
    from = Math.max(from, r.bottom)
  }
  if (bottom - from > best[1] - best[0]) best = [from, bottom]
  return best[1] - best[0] >= size.height ? (best[0] + best[1] - size.height) / 2 : at
}

/** A side tag's hook: the stroked line (an SVG path) and its filled arrowhead. */
export interface SideHook {
  /** Up from the tab's inner side, a rounded turn, then across towards the edge. */
  readonly line: string
  /** The arrowhead: its tip at the edge, then the two back corners. */
  readonly head: readonly [Point, Point, Point]
}

/** The hooked arrow above a side tag [tab] on edge [side] (standing on x = [edge]), pointing at that edge. */
export function sideHook(tab: Box, side: -1 | 1, edge: number): SideHook {
  const inner = side < 0 ? tab.right - M.hookInset : tab.left + M.hookInset
  const outer = side < 0 ? edge + M.hookInset : edge - M.hookInset
  const bottom = tab.top - M.hookGap
  const bend = bottom - M.hookRise
  const turn = M.hookTurn
  const dir = side < 0 ? -1 : 1
  const end = outer - dir * M.hookHead
  const line = `M${inner} ${bottom}L${inner} ${bend + turn}Q${inner} ${bend} ${inner + dir * turn} ${bend}L${end} ${bend}`
  const back = outer - dir * M.hookHead * 1.3
  return { line, head: [{ x: outer, y: bend }, { x: back, y: bend - M.hookHead }, { x: back, y: bend + M.hookHead }] }
}
