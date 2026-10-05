// Port of core/src/test/kotlin/dev/arc/ep133/features/PianoTest.kt
import { describe, expect, it } from 'vitest'
import { KeyMark, Piano, isBlack, rangeNotes, type NoteRange } from '../../../src/core/features/piano'
import { NoteTouches, Press, Release, type NoteEvent } from '../../../src/core/features/noteTouches'
import { Scale } from '../../../src/core/features/keys'

const span = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const r = (first: number, last: number): NoteRange => ({ first, last })

describe('PianoTest', () => {
  // OCT 4 at two octaves on a Pixel 7's landscape plate: 15 whites of 52, 280 tall.
  const white = 52
  const h = 280
  const keys = Piano.layout(Piano.range(4, 15), 15 * white, h)
  const slop = 8
  const at = (x: number, y: number, current: number | null = null): number | null => Piano.keyAt(keys, x, y, current, slop)

  it("the range starts an octave under OCT's C", () => {
    expect(Piano.lowest(4)).toBe(48)
    expect(Piano.range(4, 15)).toEqual(r(48, 72))
    // One and a half octaves: C3 to G4.
    expect(Piano.range(4, 12)).toEqual(r(48, 67))
    expect(Piano.range(4, 8)).toEqual(r(48, 60))
    // Three octaves from C7 would pass 127: the plate ends at G9.
    expect(Piano.range(8, 22)).toEqual(r(96, 127))
    expect(Piano.range(0, 22)).toEqual(r(0, 36))
    expect(rangeNotes(Piano.range(4, 0))).toEqual([])
  })

  it('as many whites as fit 44 px each, else none', () => {
    expect(Piano.whitesFor(330)).toBe(0)
    expect(Piano.whitesFor(500)).toBe(8)
    expect(Piano.whitesFor(634)).toBe(12)
    expect(Piano.whitesFor(809)).toBe(15)
    expect(Piano.whitesFor(1200)).toBe(22)
    expect(Piano.whitesFor(352)).toBe(8)
    expect(Piano.whitesFor(351)).toBe(0)
  })

  it('black keys sit on the seams, drawn narrower than they are hit', () => {
    expect(keys.length).toBe(25)
    expect(keys.filter((k) => !k.black).length).toBe(15)
    expect(keys.map((k) => k.note)).toEqual(span(48, 72))
    expect(keys.filter((k) => k.black).slice(0, 5).map((k) => k.note)).toEqual([49, 51, 54, 56, 58])
    expect(isBlack(61)).toBe(true)
    expect(isBlack(64)).toBe(false)
    const c = keys[0]!
    expect(c.rect).toEqual({ left: 0, top: 0, width: white, height: h })
    expect(c.hitRect).toEqual(c.rect)
    const cSharp = keys[1]!
    expect(cSharp.rect.left + cSharp.rect.width / 2).toBeCloseTo(white, 3)
    expect(cSharp.rect.width).toBeCloseTo(white * 0.6, 3)
    expect(cSharp.rect.height).toBeCloseTo(h * 0.62, 3)
    expect(cSharp.hitRect.width).toBeCloseTo(white * 0.72, 3)
    expect(cSharp.hitRect.left + cSharp.hitRect.width / 2).toBeCloseTo(white, 3)
    // F# sits between F (the 4th white) and G.
    const fSharp = keys.find((k) => k.note === 54)!
    expect(fSharp.rect.left + fSharp.rect.width / 2).toBeCloseTo(4 * white, 3)
    const last = keys[keys.length - 1]!
    expect(last.rect.left + last.rect.width).toBeCloseTo(15 * white, 3)
  })

  it('a black key is hit wider than drawn, and the whites below it', () => {
    const y = h * 0.3
    // Just inside the hit band either side of the C–D seam, wider than the drawn key.
    expect(at(white + white * 0.35, y)).toBe(49)
    expect(at(white - white * 0.35, y)).toBe(49)
    expect(at(white + white * 0.37, y)).toBe(50)
    expect(at(white - white * 0.37, y)).toBe(48)
    // Under the black key's foot, the whites.
    expect(at(white - 1, h * 0.62 + 1)).toBe(48)
    expect(at(white + 1, h * 0.62 + 1)).toBe(50)
  })

  it('sliding up from the bottom of C into C# lets go of C, then plays C#', () => {
    const t = new NoteTouches()
    const x = white * 0.8
    let current = at(x, h * 0.9)
    expect(current).toBe(48)
    expect(t.down(1, current!)).toEqual([Press(48)])
    const events: NoteEvent[] = []
    // Up the key in steps: C holds until the finger is a slop inside C#.
    let y = h * 0.9
    while (y > 10) {
      y -= 4
      const next = at(x, y, current)
      if (y > h * 0.62 - slop) expect(next).toBe(48)
      events.push(...t.move(1, next))
      current = next
    }
    expect(events).toEqual([Release(48), Press(49)])
    expect([...t.held]).toEqual([49])
  })

  it('C# slid down past its foot by less than the slop stays C#', () => {
    const x = white + 2
    expect(at(x, h * 0.62 + 2, 49)).toBe(49)
    // A fresh touch there is D's.
    expect(at(x, h * 0.62 + 2)).toBe(50)
    // Past the slop, the white under the finger.
    expect(at(x, h * 0.62 + slop + 1, 49)).toBe(50)
    // Sideways too: C# holds a slop past its hit edge, over C.
    const edge = white - white * 0.36
    expect(at(edge - slop + 1, h * 0.3, 49)).toBe(49)
    expect(at(edge - slop - 1, h * 0.3, 49)).toBe(48)
  })

  it('a white key holds to a slop past its sides', () => {
    const y = h * 0.9
    expect(at(white + slop - 1, y, 48)).toBe(48)
    expect(at(white + slop + 1, y, 48)).toBe(50)
    // And from D back toward C.
    expect(at(white - slop + 1, y, 50)).toBe(50)
    expect(at(white - slop - 1, y, 50)).toBe(48)
    // Not yet a slop inside C#'s hit band: still C.
    const band = white - white * 0.36
    expect(at(band + slop - 1, h * 0.3, 48)).toBe(48)
    expect(at(band + slop + 1, h * 0.3, 48)).toBe(49)
  })

  it('off the plate is no key', () => {
    expect(at(-1, h / 2)).toBeNull()
    expect(at(15 * white, h / 2)).toBeNull()
    expect(at(white / 2, -1)).toBeNull()
    expect(at(white / 2, h)).toBeNull()
    // A finger on a key keeps it a slop over the edge, then lets go.
    expect(at(-slop + 1, h * 0.9, 48)).toBe(48)
    expect(at(-slop - 1, h * 0.9, 48)).toBeNull()
    expect(at(white / 2, h + slop + 1, 48)).toBeNull()
    // A note no longer on the plate (after OCT changed) is a fresh touch.
    expect(at(white / 2, h * 0.9, 30)).toBe(48)
    expect(Piano.layout(r(0, -1), 100, 100)).toEqual([])
  })

  it('keys are marked against the key and scale', () => {
    // A minor: A is the root, C and F are in it, F# and B flat aren't.
    const a = 9
    expect(Piano.mark(57, a, Scale.MINOR)).toBe(KeyMark.ROOT)
    expect(Piano.mark(69, a, Scale.MINOR)).toBe(KeyMark.ROOT)
    expect(Piano.mark(60, a, Scale.MINOR)).toBe(KeyMark.IN)
    expect(Piano.mark(65, a, Scale.MINOR)).toBe(KeyMark.IN)
    expect(Piano.mark(66, a, Scale.MINOR)).toBe(KeyMark.OUT)
    expect(Piano.mark(58, a, Scale.MINOR)).toBe(KeyMark.OUT)
    expect(span(57, 68).filter((n) => Piano.mark(n, a, Scale.MINOR) !== KeyMark.OUT)).toEqual([57, 59, 60, 62, 64, 65, 67])
    // D blues: D F G G# A C.
    expect(span(62, 73).filter((n) => Piano.mark(n, 2, Scale.BLUES) !== KeyMark.OUT)).toEqual([62, 65, 67, 68, 69, 72])
    expect(Piano.mark(50, 2, Scale.BLUES)).toBe(KeyMark.ROOT)
    expect(Piano.mark(64, 2, Scale.BLUES)).toBe(KeyMark.OUT)
    // Chromatic: the root, and every other note in.
    expect(Piano.mark(0, 0, Scale.CHROMATIC)).toBe(KeyMark.ROOT)
    expect(span(61, 71).filter((n) => Piano.mark(n, 0, Scale.CHROMATIC) === KeyMark.IN).length).toBe(11)
  })
})
