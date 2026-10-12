// What fits on Live's display line (lineFit.ts, a port of PatternLine.kt's
// lineFit, stepFit and stepRowFit and MirrorScreen.kt's MainMin), with every
// character 8px wide: ERASE and ↶, then RECORD's word, then TAKE's word give
// way; the scene's cell while playing only where everything else fits; STEP
// with its word on a wide line, its glyph on a phone's, else nothing.
import { describe, expect, it } from 'vitest'
import { idleFit, lineFit, stepFit, stepRowFit, type LineState, type LineWords, type Measure } from '../../src/ui/live/lineFit'

const measure: Measure = (text) => text.length * 8
const WORDS: LineWords = { record: 'RECORD', erase: 'ERASE', step: 'STEP', correct: 'CORRECT', take: 'TAKE' }
const playing = (words: string): LineState => ({ phase: 'PLAYING', erase: false, hasNotes: true, canUndo: true, words })
const stopped: LineState = { phase: 'STOPPED', erase: false, hasNotes: true, canUndo: true, words: '' }
const take = { word: 'TAKE 0:12', short: '0:12' }

describe('lineFit', () => {
  // RECORD and PLAY, dot alone: 67; ERASE and ↶: 95; the counter: 80; two gaps.
  it('keeps ERASE and ↶ while they fit, and gives them up first', () => {
    expect(lineFit(playing('x'.repeat(10)), WORDS, measure, false, 262)).toMatchObject({ edit: true, recordWord: false, takeWord: true })
    expect(lineFit(playing('x'.repeat(10)), WORDS, measure, false, 261)).toMatchObject({ edit: false, recordWord: false, takeWord: true })
  })

  it("has RECORD's word only on a wide line, and gives it up before TAKE's", () => {
    const long = playing('x'.repeat(40))
    expect(lineFit(long, WORDS, measure, false, 600)).toMatchObject({ edit: true, recordWord: true })
    expect(lineFit(long, WORDS, measure, false, 520)).toMatchObject({ edit: false, recordWord: true, takeWord: true })
    expect(lineFit(long, WORDS, measure, false, 520, { take })).toMatchObject({ edit: false, recordWord: false, takeWord: true })
    expect(lineFit(long, WORDS, measure, true, 600).recordWord).toBe(false)
  })

  it("gives TAKE's word up last", () => {
    expect(lineFit(playing('x'.repeat(10)), WORDS, measure, false, 273, { take }).takeWord).toBe(true)
    expect(lineFit(playing('x'.repeat(10)), WORDS, measure, false, 272, { take })).toMatchObject({ edit: false, recordWord: false, takeWord: false })
  })

  it("shows the scene's cell while playing only where everything else fits with it", () => {
    expect(lineFit(playing('x'.repeat(10)), WORDS, measure, false, 318, { scene: 'S01' })).toMatchObject({ edit: true, scene: true })
    expect(lineFit(playing('x'.repeat(10)), WORDS, measure, false, 317, { scene: 'S01' })).toMatchObject({ edit: true, scene: false })
  })

  it('keeps CORRECT, which turns timing correct off', () => {
    // CORRECT: 7 characters in a cell and a border, 78.
    expect(lineFit(playing('x'.repeat(10)), WORDS, measure, false, 350, { correct: true }).edit).toBe(true)
    expect(lineFit(playing('x'.repeat(10)), WORDS, measure, false, 349, { correct: true }).edit).toBe(false)
  })
})

describe('stepFit', () => {
  it('shows the glyph on a phone while the line keeps 64 for its own words, else nothing', () => {
    expect(stepFit(stopped, WORDS, measure, false, 187)).toBe('GLYPH')
    expect(stepFit(stopped, WORDS, measure, false, 186)).toBe('NONE')
  })

  it('shows the word on a wide line, never in the top bar', () => {
    expect(stepFit(stopped, WORDS, measure, false, 600)).toBe('WORD')
    expect(stepFit(stopped, WORDS, measure, true, 600)).toBe('GLYPH')
  })

  it("counts the scene's cell in its key", () => {
    // The scene and STEP in one key: 44 + 34, a divider and the border.
    expect(stepFit(stopped, WORDS, measure, false, 232, { scene: 'S01' })).toBe('GLYPH')
    expect(stepFit(stopped, WORDS, measure, false, 231, { scene: 'S01' })).toBe('NONE')
  })
})

describe('stepRowFit', () => {
  const fit = { edit: true, recordWord: false, takeWord: true, scene: false }
  it('shows the word, else the glyph, else nothing, after RECORD and PLAY and ERASE and ↶', () => {
    expect(stepRowFit(stopped, WORDS, measure, 236, fit, true)).toBe('WORD')
    expect(stepRowFit(stopped, WORDS, measure, 235, fit, true)).toBe('GLYPH')
    expect(stepRowFit(stopped, WORDS, measure, 217, fit, true)).toBe('NONE')
  })
})

describe('idleFit', () => {
  // ▶ and the tempo, each with its gap: 84.
  const clock = ['▶', '120 BPM']
  it("gives the device's ▶/■ and tempo up together where the hit would get less than 96 (or its whole)", () => {
    expect(idleFit(measure, clock, 'Kick 01', 140).clock).toBe(true)
    expect(idleFit(measure, clock, 'Kick 01', 139).clock).toBe(false)
    expect(idleFit(measure, clock, 'Last seen Oct 5, 1:02 PM', 180).clock).toBe(true)
    expect(idleFit(measure, clock, 'Last seen Oct 5, 1:02 PM', 179).clock).toBe(false)
    expect(idleFit(measure, [], 'Kick 01', 400).clock).toBe(false)
  })

  it('shortens the main line where it would be cut', () => {
    expect(idleFit(measure, clock, 'Last seen Oct 5, 1:02 PM', 300).short).toBe(false)
    expect(idleFit(measure, clock, 'Last seen Oct 5, 1:02 PM', 250).short).toBe(true)
    expect(idleFit(measure, clock, 'Last seen Oct 5, 1:02 PM', 150)).toEqual({ clock: false, short: true })
  })
})
