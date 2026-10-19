// Port of app/src/test/kotlin/dev/arc/ep133/ui/screens/KeysSheetTest.kt
//
// The KEYS sheet's scale rows: each scale's twelve semitones as dots, and what a screen reader hears of the row.
// Web addition: the sheet's navigation layer ('scale:<part>', ui/live/keys.ts), which Back closes.
import { describe, expect, it } from 'vitest'
import { SCALES, Scale, intervals } from '../../src/core/features/keys'
import { KeyMark } from '../../src/core/features/piano'
import { MirrorText } from '../../src/core/text/mirrorText'
import { KeysSheetPart, SCALE_SHEET_PREFIX, scaleSheetOf } from '../../src/ui/live/keys'
import { backStack, initialStack, push, sheetLayer, viewOf } from '../../src/ui/nav'
import { scaleDots } from '../../src/ui/sheets/ScaleSheet'

const { ROOT, IN, OUT } = KeyMark

describe('KeysSheet', () => {
  it('every scale has twelve dots, the first its root', () => {
    for (const s of SCALES) {
      const dots = scaleDots(s)
      expect(dots.length, s).toBe(12)
      expect(dots[0], s).toBe(ROOT)
      expect(dots.filter((d) => d === ROOT).length, s).toBe(1)
    }
  })

  it("the root and the scale's other notes are as many as its intervals", () => {
    for (const s of SCALES) {
      expect(scaleDots(s).filter((d) => d !== OUT).length, s).toBe(intervals(s).length)
    }
  })

  it('major is filled on the white keys from C', () => {
    expect(scaleDots(Scale.MAJOR)).toEqual([ROOT, OUT, IN, OUT, IN, IN, OUT, IN, OUT, IN, OUT, IN])
  })

  it('minor has its flat third, sixth and seventh', () => {
    expect(scaleDots(Scale.MINOR)).toEqual([ROOT, OUT, IN, IN, OUT, IN, OUT, IN, IN, OUT, IN, OUT])
  })

  it('blues has its flat fifth beside the fifth', () => {
    expect(scaleDots(Scale.BLUES)).toEqual([ROOT, OUT, OUT, IN, OUT, IN, IN, IN, OUT, OUT, IN, OUT])
  })

  it('chromatic is every note', () => {
    expect(scaleDots(Scale.CHROMATIC)).toEqual([ROOT, ...Array<KeyMark>(11).fill(IN)])
  })

  it('a row says its scale and how many notes', () => {
    expect(MirrorText.scaleRow(Scale.MAJOR)).toBe('Major, 7 notes')
    expect(MirrorText.scaleRow(Scale.MAJOR_PENTATONIC)).toBe('Major penta, 5 notes')
    expect(MirrorText.scaleRow(Scale.CHROMATIC)).toBe('Chromatic, 12 notes')
  })
})

describe('the KEYS sheet as a navigation layer (web)', () => {
  it('reads the part it opened at from the sheets', () => {
    expect(scaleSheetOf([])).toBeNull()
    expect(scaleSheetOf(['keys', 'tempo'])).toBeNull()
    expect(scaleSheetOf([SCALE_SHEET_PREFIX + 'scale'])).toBe(KeysSheetPart.SCALE)
    expect(scaleSheetOf(['fx', SCALE_SHEET_PREFIX + 'key'])).toBe(KeysSheetPart.KEY)
    expect(scaleSheetOf([SCALE_SHEET_PREFIX + 'octave'])).toBe(KeysSheetPart.OCTAVE)
  })

  it('closes with Back, staying on Live', () => {
    const stack = push(initialStack('#/live'), sheetLayer(SCALE_SHEET_PREFIX + KeysSheetPart.OCTAVE))
    expect(scaleSheetOf(viewOf(stack).sheets)).toBe(KeysSheetPart.OCTAVE)
    const back = backStack(stack)
    expect(back).not.toBeNull()
    const v = viewOf(back!)
    expect(scaleSheetOf(v.sheets)).toBeNull()
    expect(v.tab).toBe('live')
  })
})
