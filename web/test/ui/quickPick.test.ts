// Port of app/src/test/kotlin/dev/arc/ep133/ui/screens/QuickPickTest.kt
//
// Hold to pick on KEYS' scale and octave words: the rows, the half-circle and the pick, as the
// prototype has them ("C1 · Aim": by direction, the list's order, toward the middle, 128 px).
// At density 1, so px read as dp.
import { describe, expect, it } from 'vitest'
import { QuickPick, type Rect } from '../../src/ui/live/quickPick'

const gap = QuickPick.GAP
const dead = QuickPick.DEAD
const minDx = QuickPick.MIN_DX

const near = (expected: number, actual: number): void => {
  expect(Math.abs(expected - actual)).toBeLessThanOrEqual(0.01)
}
const range = (n: number, f: (k: number) => number): number[] => Array.from({ length: n }, (_, k) => f(k))
const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom })

describe('rows', () => {
  it('with no room below the whole list stacks up from the thumb, the last level with it', () => {
    const rows = QuickPick.rows(10, 0, gap)
    expect(rows).toHaveLength(10)
    expect(rows).toEqual(range(10, (k) => (k - 9) * gap))
    // Under a row's room is no room: still level.
    expect(QuickPick.rows(10, gap - 1, gap)).toEqual(rows)
  })

  it('with room below the foot goes down whole rows, never more than half the list', () => {
    // Two rows' room (and a bit): the last two choices below the thumb.
    expect(QuickPick.rows(10, 2.5 * gap, gap)).toEqual(range(10, (k) => (k - 7) * gap))
    // Plenty: half the list below at most ((n − 1) / 2 rows), the rest above.
    expect(QuickPick.rows(10, 1000, gap)).toEqual(range(10, (k) => (k - 5) * gap))
    expect(QuickPick.rows(9, 1000, gap)).toEqual(range(9, (k) => (k - 4) * gap))
    // One choice sits level with the thumb; none, nothing.
    expect(QuickPick.rows(1, 1000, gap)).toEqual([0])
    expect(QuickPick.rows(0, 1000, gap)).toEqual([])
  })

  it("the stack is lifted where the foot doesn't fit, and comes down where the head doesn't", () => {
    // Half the list would go four rows down; one fits: lifted to one.
    const lifted = QuickPick.rows(9, gap, gap)
    near(gap, lifted.at(-1)!)
    near(-7 * gap, lifted[0]!)
    // High on the screen (two rows above): as far down as the room below allows, past the half.
    const lowered = QuickPick.rows(9, 1000, gap, 2 * gap)
    near(-2 * gap, lowered[0]!)
    near(6 * gap, lowered.at(-1)!)
    // But never past the room below: the fit (QuickPick.fit) sees that it all goes in.
    const tight = QuickPick.rows(9, 3 * gap, gap, 2 * gap)
    near(3 * gap, tight.at(-1)!)
  })
})

describe('the half-circle', () => {
  it('the half-ellipse bows out at the thumb and narrows to the ends', () => {
    const rows = QuickPick.rows(10, 0, gap)
    const slots = QuickPick.place(rows, 128, gap, minDx)
    const ry = 9 * gap + gap / 2
    // The foot, level with the thumb: the whole radius out.
    near(128, slots.at(-1)!.dx)
    near(0, slots.at(-1)!.dy)
    // The middle row: on the ellipse.
    const dy = slots[5]!.dy
    near(128 * Math.sqrt(1 - (dy / ry) * (dy / ry)), slots[5]!.dx)
    // The top: the ellipse is nearly closed there, so the least way out.
    near(128 * Math.sqrt(1 - ((9 * gap) / ry) * ((9 * gap) / ry)), slots[0]!.dx)
    expect(slots[0]!.dx < slots[5]!.dx && slots[5]!.dx < slots.at(-1)!.dx).toBe(true)
    // Every chip in its list place, in order.
    expect(slots.map((s) => s.i)).toEqual(range(10, (k) => k))
  })

  it('the ends keep clear of the thumb', () => {
    // A narrow half-circle: the ends would come in to the thumb; they stop at the least dx.
    const slots = QuickPick.place(QuickPick.rows(10, 0, gap), 56, gap, minDx)
    near(minDx, slots[0]!.dx)
    expect(slots.every((s) => s.dx >= minDx)).toBe(true)
  })
})

describe('the pick', () => {
  const fanSlots = QuickPick.place(QuickPick.rows(10, 2.5 * gap, gap), 128, gap, minDx)

  it('in the dead zone nothing is lit', () => {
    expect(QuickPick.pick(0, 0, fanSlots, dead)).toBeNull()
    expect(QuickPick.pick(10, -10, fanSlots, dead)).toBeNull()
    expect(QuickPick.pick(-dead, 0, fanSlots, dead)).toBeNull()
    expect(QuickPick.pick(dead + 1, 0, fanSlots, dead)).not.toBeNull()
  })

  it("the choice nearest the finger's way is lit", () => {
    // Straight out: the row level with the thumb (the eighth, two above the foot).
    expect(QuickPick.pick(30, 0, fanSlots, dead)?.i).toBe(7)
    // Toward each chip, a little way: that chip.
    for (const s of fanSlots) {
      const len = Math.hypot(s.dx, s.dy)
      expect(QuickPick.pick((s.dx / len) * 24, (s.dy / len) * 24, fanSlots, dead)?.i, `toward ${s.i}`).toBe(s.i)
    }
    // Between two chips, the nearer by angle.
    const a = fanSlots[3]!
    const b = fanSlots[4]!
    const mid = (QuickPick.angle(a) * 0.7 + QuickPick.angle(b) * 0.3) * (Math.PI / 180)
    expect(QuickPick.pick(40 * Math.cos(mid), 40 * Math.sin(mid), fanSlots, dead)?.i).toBe(3)
  })

  it('a pull back past the thumb reads as straight up or down, so it reaches the ends', () => {
    expect(QuickPick.pick(-30, -5, fanSlots, dead)?.i).toBe(0)
    expect(QuickPick.pick(-30, 5, fanSlots, dead)?.i).toBe(9)
    // Straight up and straight down: the first and the last.
    expect(QuickPick.pick(0, -40, fanSlots, dead)?.i).toBe(0)
    expect(QuickPick.pick(0, 40, fanSlots, dead)?.i).toBe(9)
  })

  it('the octave fan runs high to low, its rows mapping back to the list', () => {
    // The octaves, 0 to 8 in the list: reversed, OCT 8 tops the fan and OCT 0 is at its foot.
    const octaves = range(9, (k) => k)
    const shown = octaves.map((_, row) => octaves[QuickPick.option(row, octaves.length, true)])
    expect(shown).toEqual(range(9, (k) => 8 - k))
    // A pick by direction lands on a row; the row gives the octave. Straight up: the top row, OCT 8.
    const slots = QuickPick.place(QuickPick.rows(9, 0, gap), 128, gap, minDx)
    const up = QuickPick.pick(0, -40, slots, dead)!
    expect(octaves[QuickPick.option(up.i, 9, true)]).toBe(8)
    // The current octave's row (ringed) goes the same way back: OCT 4 sits on row 4, OCT 7 on row 1.
    expect(QuickPick.option(4, 9, true)).toBe(4)
    expect(QuickPick.option(7, 9, true)).toBe(1)
    for (const i of octaves) expect(QuickPick.option(QuickPick.option(i, 9, true), 9, true)).toBe(i)
    // Unreversed (the scales): the list's order.
    expect(range(10, (k) => QuickPick.option(k, 10, false))).toEqual(range(10, (k) => k))
  })
})

describe('the fit', () => {
  it("where the stack fits the row stays, where it doesn't it shrinks, then the list", () => {
    // Tall: the full row.
    expect(QuickPick.fit(10, 600, 0, gap, 30)).toBe(gap)
    // A phone on its side: 300 px for nine rows, split 110 above and 190 below.
    const g = QuickPick.fit(10, 110, 190, gap, 30)
    expect(g).not.toBeNull()
    expect(g! < gap && g! >= 30, `${g}`).toBe(true)
    const rows = QuickPick.rows(10, 190, g!, 110)
    expect(-rows[0]! <= 110 + 0.01 && rows.at(-1)! <= 190 + 0.01, `${rows}`).toBe(true)
    // Too short even at 30 px a row: null, and the hold opens the list.
    expect(QuickPick.fit(10, 100, 150, gap, 30)).toBeNull()
    // One choice always fits.
    expect(QuickPick.fit(1, 0, 0, gap, 30)).toBe(gap)
  })

  it('the fan opens toward the middle, as wide as the room less a chip allows', () => {
    // The scale word low on a 360 x 668 phone: rightward, the radius cut to the room.
    const phone = rect(0, 0, 360, 668)
    const left = QuickPick.fan(10, 83, 621, phone, 1)!
    expect(left.dir).toBe(1)
    near(360 - 83 - QuickPick.CHIP_ROOM, Math.max(...left.slots.map((s) => s.dx)))
    // No room below (the edge's 30 px), so the whole list stands above the thumb, inside the window.
    near(0, left.slots.at(-1)!.dy)
    expect(left.y + left.slots[0]!.dy >= QuickPick.EDGE).toBe(true)
    // The octave word at the row's end: leftward, the full 128 px.
    const right = QuickPick.fan(9, 300, 621, phone, 1)!
    expect(right.dir).toBe(-1)
    near(QuickPick.RADIUS, Math.max(...right.slots.map((s) => s.dx)))
    expect(QuickPick.at(right, right.slots.at(-1)!).x < 300).toBe(true)
    // Density: the same fan, in px.
    const dense = QuickPick.fan(10, 83 * 2.625, 621 * 2.625, rect(0, 0, 360 * 2.625, 668 * 2.625), 2.625)!
    near(left.slots[0]!.dx * 2.625, dense.slots[0]!.dx)
    // A window too short for the list: none.
    expect(QuickPick.fan(10, 300, 120, rect(0, 0, 700, 240), 1)).toBeNull()
  })
})
