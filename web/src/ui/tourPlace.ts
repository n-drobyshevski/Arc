// Port of placeTourCard and TourPlace in app/src/main/kotlin/dev/arc/ep133/ui/components/Tour.kt
//
// Where "Try arc" puts its step card, as a pure function of the viewport, the
// spotlit control's bounds and the card's height at a width, so it is unit
// tested (test/ui/tourPlace.test.ts, the cases of TourPlaceTest.kt) and the
// overlay only measures and draws. The card is min(vw - 32, 400) wide and at
// most the screen less 32 tall (it scrolls beyond that).
//
// - No target: from 45% down the screen, moved up to fit; docked to the bottom
//   with dockBottom (Done, whose tags sit around the middle of the screen).
// - A key: below it when it is in the top half, else above it, with room for its tag.
// - The pad grid, the first that works: beside it; below it; above it; docked
//   to the side with more room, covering at most one row of pads (the cut-out
//   stops at the card); heading only, docked the same way.
//
// Web additions: [veilPath] (the veil's even-odd clip path with the hole) and
// [holeOf] (the target inflated by 6, rounded 12, cut to the card's clip),
// which Coach.kt draws with Path.FillType.EvenOdd.

import { coerceIn, inflate, type Box, type Size } from './coachPlace'

/** The card's room around it and next to its target (dp = px). */
export const TourPlace = Object.freeze({
  MARGIN: 16,
  MAX_WIDTH: 400,
  GAP: 12,
  /** Room between a key and a card below or above it, for the key's tag. */
  TAG_ROOM: 48,
  /** A card beside the pad grid needs at least this much width. */
  MIN_SIDE_WIDTH: 260,
  /** Rows of pads in the grid: a docked card may cover one. */
  PAD_ROWS: 4,
  /** A target taller than this share of the screen is an area (the pad grid), not a key. */
  TALL: 0.25,
  /** The hole is the target inflated by this much, rounded this much, with a ring this wide. */
  HOLE_PAD: 6,
  HOLE_RADIUS: 12,
  RING: 3,
})

/** Where the card goes; [holeClip] is the part of the screen the cut-out may use (null: all of it). */
export interface TourPlacement {
  readonly card: Box
  readonly holeClip: Box | null
  readonly headingOnly: boolean
}

const width = (b: Box): number => b.right - b.left
const height = (b: Box): number => b.bottom - b.top

function box(l: number, top: number, w: number, h: number): Box {
  return { left: l, top, right: l + w, bottom: top + h }
}

/**
 * Where the card goes on a [vw] x [vh] screen, next to [target] (null for a
 * card on the veil alone). [cardHeight] and [headingHeight] measure the card,
 * whole and heading only, at a width. [safeTop] and [safeBottom] are the
 * system bars (the web: the safe-area insets).
 */
export function placeTourCard(
  vw: number,
  vh: number,
  target: Box | null,
  cardHeight: (width: number) => number,
  headingHeight: (width: number) => number,
  safeTop = 0,
  safeBottom = 0,
  dockBottom = false,
): TourPlacement {
  const m = TourPlace.MARGIN
  const gap = TourPlace.GAP
  const w = Math.max(0, Math.min(vw - 2 * m, TourPlace.MAX_WIDTH))
  const left = (vw - w) / 2
  const minTop = safeTop + m
  const maxBottom = vh - safeBottom - m
  const cap = Math.max(0, maxBottom - minTop)
  const placed = (card: Box, holeClip: Box | null = null, headingOnly = false): TourPlacement => ({ card, holeClip, headingOnly })
  // Kept on screen: moved up to fit, but never above the top.
  const fit = (top: number, h: number): number => Math.max(Math.min(top, maxBottom - h), minTop)

  if (target === null) {
    const h = Math.min(cardHeight(w), cap)
    return placed(box(left, fit(dockBottom ? maxBottom - h : vh * 0.45, h), w, h))
  }
  if (height(target) <= vh * TourPlace.TALL) {
    const h = Math.min(cardHeight(w), cap)
    const centerY = (target.top + target.bottom) / 2
    const top = centerY < vh / 2 ? target.bottom + TourPlace.TAG_ROOM : target.top - TourPlace.TAG_ROOM - h
    return placed(box(left, fit(top, h), w, h))
  }
  // 1. Beside the grid, on the side with more room.
  const roomLeft = target.left - gap - m
  const roomRight = vw - m - target.right - gap
  const sideW = Math.min(Math.max(roomLeft, roomRight), TourPlace.MAX_WIDTH)
  if (sideW >= TourPlace.MIN_SIDE_WIDTH) {
    const h = cardHeight(sideW)
    if (h <= cap) {
      const l = roomRight >= roomLeft ? target.right + gap : target.left - gap - sideW
      return placed(box(l, fit((target.top + target.bottom) / 2 - h / 2, h), sideW, h))
    }
  }
  const h = Math.min(cardHeight(w), cap)
  // 2. Below it, 3. above it.
  if (target.bottom + gap + h <= maxBottom) return placed(box(left, target.bottom + gap, w, h))
  if (target.top - gap - h >= minTop) return placed(box(left, target.top - gap - h, w, h))
  // 4. Docked to the side with more room, over at most one row of pads; 5. heading only.
  const roomBelow = maxBottom - target.bottom
  const roomAbove = target.top - minTop
  const below = roomBelow >= roomAbove
  const dock = (dh: number, headingOnly: boolean): TourPlacement => {
    if (below) {
      const top = maxBottom - dh
      return placed(box(left, top, w, dh), { left: 0, top: 0, right: vw, bottom: top - gap }, headingOnly)
    }
    return placed(box(left, minTop, w, dh), { left: 0, top: minTop + dh + gap, right: vw, bottom: vh }, headingOnly)
  }
  const row = height(target) / TourPlace.PAD_ROWS
  if (h + gap <= Math.max(roomBelow, roomAbove) + row) return dock(h, false)
  return dock(Math.min(headingHeight(w), cap), true)
}

/** The cut-out for [target]: inflated by HOLE_PAD, then kept inside [clip] (a docked card's side). */
export function holeOf(target: Box, clip: Box | null): Box {
  const h = inflate(target, TourPlace.HOLE_PAD)
  if (clip === null) return h
  const out = {
    left: Math.max(h.left, clip.left),
    top: Math.max(h.top, clip.top),
    right: Math.min(h.right, clip.right),
    bottom: Math.min(h.bottom, clip.bottom),
  }
  return { ...out, right: Math.max(out.left, out.right), bottom: Math.max(out.top, out.bottom) }
}

/** The card's width on a [viewport] (before it is placed). */
export function tourCardWidth(viewport: Size): number {
  return Math.max(0, Math.min(viewport.width - 2 * TourPlace.MARGIN, TourPlace.MAX_WIDTH))
}

/**
 * The veil with a rounded hole: an even-odd path (the whole screen, then the
 * hole) for `clip-path: path(evenodd, …)`. Without a hole, the screen.
 */
export function veilPath(viewport: Size, hole: Box | null, radius: number = TourPlace.HOLE_RADIUS): string {
  const { width: w, height: h } = viewport
  const outer = `M0 0H${w}V${h}H0Z`
  if (hole === null || width(hole) <= 0 || height(hole) <= 0) return outer
  const l = hole.left
  const t = hole.top
  const r = hole.right
  const b = hole.bottom
  const rad = coerceIn(radius, 0, Math.min(width(hole), height(hole)) / 2)
  return (
    outer +
    `M${l + rad} ${t}H${r - rad}A${rad} ${rad} 0 0 1 ${r} ${t + rad}V${b - rad}A${rad} ${rad} 0 0 1 ${r - rad} ${b}` +
    `H${l + rad}A${rad} ${rad} 0 0 1 ${l} ${b - rad}V${t + rad}A${rad} ${rad} 0 0 1 ${l + rad} ${t}Z`
  )
}
