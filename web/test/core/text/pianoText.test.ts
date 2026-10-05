// Port of core/src/test/kotlin/dev/arc/ep133/text/FeatureTextTest.kt ("piano and key text")
import { describe, expect, it } from 'vitest'
import { NoteNames, SCALES } from '../../../src/core/features/keys'
import { KeyMark } from '../../../src/core/features/piano'
import { MirrorText } from '../../../src/core/text/mirrorText'

describe('FeatureTextTest: piano and key text', () => {
  it('names the key, the piano keys, its range and notes past it', () => {
    const solfege = NoteNames.SOLFEGE
    expect(MirrorText.keyWord(0, solfege).toUpperCase()).toBe('KEY DO')
    expect(MirrorText.keyWord(10, NoteNames.LETTERS)).toBe('Key A#')
    expect(MirrorText.keyChoice(0, solfege)).toBe('Key: DO. Tap to change.')
    expect(MirrorText.keyChoice(6, NoteNames.LETTERS)).toBe('Key: F#. Tap to change.')
    expect(MirrorText.pianoKey(69, solfege, KeyMark.ROOT)).toBe('LA4, root')
    expect(MirrorText.pianoKey(69, solfege, KeyMark.IN)).toBe('LA4, in the scale')
    expect(MirrorText.pianoKey(65, solfege, KeyMark.OUT)).toBe('FA4, outside the scale')
    expect(MirrorText.pianoKey(66, NoteNames.LETTERS, KeyMark.OUT)).toBe('F#4, outside the scale')
    expect(MirrorText.pianoRange(48, 72, solfege)).toBe('Keyboard, DO3 to DO5')
    expect(MirrorText.pianoRange(96, 127, NoteNames.LETTERS)).toBe('Keyboard, C7 to G9')
    expect(MirrorText.outOfRange(36, solfege, true)).toBe('DO2, below the keys')
    expect(MirrorText.outOfRange(88, NoteNames.LETTERS, false)).toBe('E6, above the keys')
    // Short scale words, still told apart once upper-cased, and never wider than five.
    const codes = SCALES.map((s) => MirrorText.scaleCode(s).toUpperCase())
    expect(codes).toEqual(['CHR', 'MAJ', 'MIN', 'DOR', 'PHR', 'LYD', 'MIX', 'MAJ.P', 'MIN.P', 'BLU'])
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.every((c) => c.length <= 5)).toBe(true)
  })
})
