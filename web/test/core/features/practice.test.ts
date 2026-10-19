// Port of core/src/test/kotlin/dev/arc/ep133/features/PracticeTest.kt
//
// Web delta: Kotlin's Pairs are tuples.
import { describe, expect, it } from 'vitest'
import { Practice, PracticeCounts, PracticeScore, PracticeWait, practiceCounts, practiceSpec } from '../../../src/core/features/practice'
import { ProjectPatterns, Seq, pattern, patternNote, projectPatterns } from '../../../src/core/features/pattern'

const kick = 9
const snare = 11
const hat = 6

// A bar: kick on 1 and 3, snare on 2 and 4, a KEYS note on the kick's pad (left to the backing).
const drums = pattern(1, [
  patternNote(0, kick, 24),
  patternNote(96, snare, 24),
  patternNote(192, kick, 24),
  patternNote(288, snare, 24),
  patternNote(48, kick, 24, 3),
])
const bass = pattern(2, [patternNote(0, 9, 96, 0), patternNote(400, 9, 96, 2)])

/** PRACTICE: what the player plays, what plays under them, and how their presses score. */
describe('PracticeTest', () => {
  it("the player's hits are the group's pad hits on the pads picked, in time order", () => {
    expect(Practice.targets(drums, practiceSpec(0)).map((t) => [t.tick, t.offset])).toEqual([
      [0, kick],
      [96, snare],
      [192, kick],
      [288, snare],
    ])
    expect(Practice.targets(drums, practiceSpec(0, { pads: new Set([kick]) })).map((t) => t.tick)).toEqual([0, 192])
    expect(Practice.length(pattern(4), practiceSpec(0, { bars: 1 }))).toBe(Seq.TICKS_PER_BAR)
    expect(Practice.length(pattern(2), practiceSpec(0, { bars: 4 }))).toBe(Seq.TICKS_PER_BAR * 2)
  })

  it("the backing is the rest, the player's hits out, cut to the bars, silent without backing or in wait", () => {
    const all = projectPatterns([drums, bass, pattern(), pattern()])
    const p = Practice.patterns(all, practiceSpec(0, { pads: new Set([kick]), bars: 1 }))
    expect(ProjectPatterns.group(p, 0).notes.map((n) => n.tick)).toEqual([96, 288, 48])
    expect(ProjectPatterns.group(p, 1).bars).toBe(1)
    expect(ProjectPatterns.group(p, 1).notes.map((n) => n.tick)).toEqual([0])
    const alone = Practice.patterns(all, practiceSpec(0, { backing: false }))
    expect(ProjectPatterns.isEmpty(alone)).toBe(true)
    expect(ProjectPatterns.isEmpty(Practice.patterns(all, practiceSpec(0, { wait: true })))).toBe(true)
    expect(ProjectPatterns.group(Practice.patterns(all, practiceSpec(0)), 1).bars).toBe(2)
  })

  it('a press is in time, early or late by how far it is, or extra with no hit near', () => {
    // At 120 BPM 60 ms is 11.5 ticks, held to a third of a sixteenth: 8 ticks.
    const s = new PracticeScore(Practice.targets(drums, practiceSpec(0)), Seq.TICKS_PER_BAR, 120.0)
    expect(s.press(kick, 4.0)).toBe('ON_TIME')
    expect(s.press(snare, 80.0)).toBe('EARLY')
    expect(s.press(kick, 210.0)).toBe('LATE')
    expect(s.press(hat, 288.0)).toBe('EXTRA')
    // The same hit can't be played twice.
    expect(s.press(kick, 5.0)).toBe('EXTRA')
    expect(s.counts).toEqual(practiceCounts({ onTime: 1, early: 1, late: 1, extra: 2 }))
  })

  it('hits let go by are missed, and a pass with nothing missed or extra is clean', () => {
    const s = new PracticeScore(Practice.targets(drums, practiceSpec(0)), Seq.TICKS_PER_BAR, 90.0)
    for (const t of [0, 96, 192, 288]) s.press(t % 192 === 0 ? kick : snare, t)
    s.advance(Seq.TICKS_PER_BAR + 20.0)
    expect(s.counts.passes).toBe(1)
    expect(s.counts.cleanRun).toBe(1)
    // The second pass: the snare on 2 never comes.
    s.press(kick, 384.0)
    s.press(kick, 576.0)
    s.press(snare, 672.0)
    s.advance(2.0 * Seq.TICKS_PER_BAR + 20)
    expect(s.counts.missed).toBe(1)
    expect(s.counts.passes).toBe(2)
    expect(s.counts.cleanRun).toBe(0)
    expect(PracticeCounts.percent(s.counts)).toBe(88)
    // A missed hit can't be played afterwards.
    expect(s.press(snare, 480.0)).toBe('EXTRA')
  })

  it('the pads light for the next hits not yet played, and the worst pad is named', () => {
    const s = new PracticeScore(Practice.targets(drums, practiceSpec(0)), Seq.TICKS_PER_BAR, 120.0)
    expect(s.upcoming(0.0).map(([t, d]) => [t.offset, d])).toEqual([
      [kick, 0.0],
      [snare, 96.0],
      [kick, 192.0],
      [snare, 288.0],
    ])
    s.press(kick, 2.0)
    expect(s.upcoming(10.0)[0]![0].offset).toBe(snare)
    // Into the next pass.
    expect(s.upcoming(300.0).some(([t, d]) => t.offset === kick && d === 84.0)).toBe(true)
    expect(s.worst()).toBeNull()
    s.press(snare, 80.0)
    s.press(snare, 270.0)
    s.advance(1000.0)
    expect(s.worst()).toEqual([kick, 'MISSED'])
  })

  it('wait goes on once every pad on the step is played, and round again', () => {
    const two = Practice.targets(pattern(1, [patternNote(0, kick, 24), patternNote(0, hat, 24), patternNote(96, snare, 24)]), practiceSpec(0))
    const w = new PracticeWait(two)
    expect(w.waiting).toEqual(new Set([kick, hat]))
    expect(w.press(snare)).toBe('EXTRA')
    w.press(kick)
    expect(w.waiting).toEqual(new Set([hat]))
    w.press(hat)
    expect(w.tick).toBe(96)
    w.press(snare)
    expect(w.step).toBe(0)
    expect(w.counts).toEqual(practiceCounts({ onTime: 3, extra: 1, passes: 1, cleanRun: 0 }))
  })
})
