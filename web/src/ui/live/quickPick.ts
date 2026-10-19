// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/QuickPick.kt (QuickPick)
//
// Hold to pick, on KEYS' scale and octave words ([PickWord]'s quick): held still for
// [HOLD_MS], the word's choices rise in a vertical half-circle beside the thumb, toward
// the screen's middle, in the list's order top to bottom (the octaves high to low, so up is higher:
// [option]). A small move toward one lights it (the direction from where the finger went
// down picks, not what is under it), and letting go picks it; letting go in the dead zone under the
// thumb keeps the choice. Ported from the prototype the preset "C1 · Aim" was chosen in.
//
// The layout and the pick are plain numbers here so they can be tested. Window coordinates
// throughout: the press point, the finger and the window's edges, so a word turned on its side
// opens its fan upright. ui/live/QuickPickFan.tsx draws what they give.
//
// Web deltas:
// - Kotlin's dp become CSS px (density 1); [fan] keeps the density parameter so the tests read
//   as Kotlin's.
// - Compose's Rect is a plain { left, top, right, bottom }.

/** How long the word is held still before the fan opens; a move past the touch slop first is a flick. */
export const HOLD_MS = 280

/** A row: the choices stack this far apart. */
export const GAP = 38

/** The least a row shrinks to where the window is short (a phone on its side); below that, the list. */
export const MIN_GAP = 30

/** The ring under the thumb: letting go inside it keeps the choice. */
export const DEAD = 18

/** How far the half-circle bows out at the thumb's height (the prototype's "medium"). */
export const RADIUS = 128

/** The room a chip takes beyond its point on the arc, kept on screen. */
export const CHIP_ROOM = 150

/** The least a chip sits out from the thumb, at the half-circle's ends (clear of the dead zone). */
export const MIN_DX = 40

/** The narrowest the half-circle gets, where there is little room toward the middle. */
export const MIN_RX = 56

/** The room kept between the outermost rows' middles and the window's top and foot (half a chip, and a little). */
export const EDGE = 30

/** A window's safe area, in px. */
export interface Rect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** A choice's place: [i] its index in the list, [dx] out from the press point toward the middle (never back), [dy] down from it. */
export interface Slot {
  readonly i: number
  readonly dx: number
  readonly dy: number
}

/** The way to [s] from the press point, in degrees: 0 straight out, −90 straight up, 90 straight down. */
export function slotAngle(s: Slot): number {
  return (Math.atan2(s.dy, s.dx) * 180) / Math.PI
}

/**
 * An open fan: the press point ([x], [y], window px), the way it opens ([dir] 1 rightward, −1
 * leftward), the row it was laid out with ([gap]), and its [slots] in the list's order.
 */
export interface Fan {
  readonly x: number
  readonly y: number
  readonly dir: 1 | -1
  readonly gap: number
  readonly slots: readonly Slot[]
}

/** A chip's point on the arc, in window px: its left end's middle (its right end's, opening leftward). */
export function fanAt(fan: Fan, s: Slot): { x: number; y: number } {
  return { x: fan.x + fan.dir * s.dx, y: fan.y + s.dy }
}

/**
 * The choice (its index in the list of [n]) the fan's [row] shows, top to bottom: the list's
 * order, or with [reversed] its end first (the octaves high to low, so up is higher). Its own
 * inverse, so it also gives the row a choice sits on.
 */
export function option(row: number, n: number, reversed: boolean): number {
  return reversed ? n - 1 - row : row
}

/** Whole rows of [gap] in [room] (a hair's grace, so a gap worked out from the room fits it). */
function whole(room: number, gap: number): number {
  return room <= 0 ? 0 : Math.floor(room / gap + 1e-3)
}

/**
 * The rows' offsets down from the thumb ([n] choices, [gap] apart, in the list's order): the last
 * sits as low as [roomBelow] allows (whole rows: the thumb stays level with a row), never more
 * than half the list below the thumb, so the stack is lifted where its foot doesn't fit. Where
 * its head wouldn't fit in [roomAbove] (a word high on the screen), it comes down as far as the
 * room below allows instead.
 */
export function rows(n: number, roomBelow: number, gap: number, roomAbove: number = Infinity): number[] {
  if (n <= 0) return []
  const fits = Math.min(whole(roomBelow, gap), n - 1)
  let below = Math.min(fits, Math.floor((n - 1) / 2))
  const head = roomAbove === Infinity ? n - 1 : whole(roomAbove, gap)
  if (n - 1 - below > head) below = Math.min(fits, n - 1 - head)
  const at = n - 1 - below
  return Array.from({ length: n }, (_, k) => (k - at) * gap)
}

/**
 * The row for [n] choices between [roomAbove] and [roomBelow] the thumb: [gap], or as much less
 * as the stack needs to fit (a phone on its side), down to [minGap]; null where even that doesn't
 * fit, and the hold opens the ordinary list instead.
 */
export function fit(n: number, roomAbove: number, roomBelow: number, gap: number, minGap: number): number | null {
  if (n <= 1) return gap
  if (whole(roomAbove, gap) + whole(roomBelow, gap) >= n - 1) return gap
  // The widest row any split of the n − 1 rows (some above the thumb, the rest below) allows.
  let best = 0
  for (let below = 0; below <= n - 1; below++) {
    const above = n - 1 - below
    const up = above === 0 ? Infinity : roomAbove / above
    const down = below === 0 ? Infinity : roomBelow / below
    best = Math.max(best, Math.min(up, down))
  }
  const g = Math.min(gap, best)
  return g >= minGap ? g : null
}

/**
 * The rows ([rows]' offsets, [gap] apart) on a half-ellipse round the thumb: as tall as the rows
 * need (ry, the farthest row's offset and half a row), [rx] wide. Each row sits out
 * rx·√(1 − (dy/ry)²), and never less than [minDx], so the ends stay clear of the thumb.
 */
export function place(offsets: readonly number[], rx: number, gap: number, minDx: number): Slot[] {
  if (offsets.length === 0) return []
  const ry = Math.max(...offsets.map((o) => Math.abs(o))) + gap / 2
  return offsets.map((dy, i) => {
    const t = dy / ry
    return { i, dx: Math.max(minDx, rx * Math.sqrt(Math.max(0, 1 - t * t))), dy }
  })
}

/**
 * The choice the finger points at, [dx] out (toward the middle) and [dy] down from the press
 * point: null inside [dead] (letting go keeps the choice), else the slot whose way from the press
 * point is nearest the finger's. A pull back past the thumb reads as straight up or straight
 * down, so the ends are a pull back away too.
 */
export function pick(dx: number, dy: number, slots: readonly Slot[], dead: number): Slot | null {
  if (slots.length === 0 || dx * dx + dy * dy <= dead * dead) return null
  const a = dx < 0 ? (dy < 0 ? -90 : 90) : (Math.atan2(dy, Math.max(dx, 0.0001)) * 180) / Math.PI
  let best = slots[0]!
  for (const s of slots) if (Math.abs(slotAngle(s) - a) < Math.abs(slotAngle(best) - a)) best = s
  return best
}

/**
 * The fan for [n] choices held at ([x], [y]) in a window whose safe area is [window] (px, at
 * [density]): toward the window's middle, the rows fitted between the safe top and foot, the
 * half-circle as wide as [RADIUS] and the room toward the middle less a chip's ([CHIP_ROOM])
 * allow. Null where the rows don't fit even at [MIN_GAP]: the hold opens the ordinary list.
 */
export function fan(n: number, x: number, y: number, window: Rect, density: number = 1): Fan | null {
  if (n <= 0) return null
  const edge = EDGE * density
  const above = y - window.top - edge
  const below = window.bottom - y - edge
  const gap = fit(n, above, below, GAP * density, MIN_GAP * density)
  if (gap === null) return null
  const width = window.right - window.left
  const dir: 1 | -1 = x - window.left < width / 2 ? 1 : -1
  const room = (dir > 0 ? window.right - x : x - window.left) - CHIP_ROOM * density
  const rx = Math.max(MIN_RX * density, Math.min(RADIUS * density, room))
  return { x, y, dir, gap, slots: place(rows(n, below, gap, above), rx, gap, MIN_DX * density) }
}

/** Kotlin's QuickPick object, by its own names ([slotAngle] is Slot.angle, [fanAt] Fan.at). */
export const QuickPick = {
  HOLD_MS,
  GAP,
  MIN_GAP,
  DEAD,
  RADIUS,
  CHIP_ROOM,
  MIN_DX,
  MIN_RX,
  EDGE,
  option,
  rows,
  fit,
  place,
  pick,
  fan,
  angle: slotAngle,
  at: fanAt,
} as const
