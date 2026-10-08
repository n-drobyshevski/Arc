// Port of core/src/test/kotlin/dev/arc/ep133/features/PatternTest.kt
//
// Web delta: usedPads gives padKey numbers.
import { describe, expect, it } from 'vitest'
import { padKey } from '../../../src/core/features/padNotes'
import {
  Pattern,
  Patterns,
  ProjectPatterns,
  Seq,
  TIMINGS,
  Timing,
  pattern,
  patternNote,
  projectPatterns,
  quantize,
  timingTicks,
} from '../../../src/core/features/pattern'

describe('PatternTest', () => {
  it("the device's sequencer numbers", () => {
    expect(Seq.PPQN).toBe(96)
    expect(Seq.TICKS_PER_BAR).toBe(384)
    expect(Seq.LENGTHS).toEqual([1, 2, 4, 8])
    expect(Pattern.lengthTicks(pattern())).toBe(384)
    expect(Pattern.lengthTicks(pattern(99))).toBe(99 * 384)
  })

  it('a pattern plays its notes in tick order, not those past its end', () => {
    const late = patternNote(400, 1, 24)
    const p = pattern(1, [patternNote(200, 3, 24), late, patternNote(0, 2, 24)])
    expect(Pattern.isEmpty(p)).toBe(false)
    expect(Pattern.isEmpty(pattern())).toBe(true)
    expect(Pattern.playable(p).map((n) => n.tick)).toEqual([0, 200])
    // Longer again, the note past the end plays again.
    expect(Pattern.playable({ ...p, bars: 2 }).map((n) => n.tick)).toEqual([0, 200, 400])
  })

  it("a project's patterns, one a group", () => {
    const a = pattern(1, [patternNote(0, 3, 24), patternNote(96, 3, 24, 2), patternNote(500, 7, 24)])
    const p = ProjectPatterns.with(ProjectPatterns.with(projectPatterns(), 0, a), 2, pattern(4, [patternNote(10, 0, 24)]))
    expect(ProjectPatterns.group(p, 0)).toEqual(a)
    expect(ProjectPatterns.group(p, 1)).toEqual(pattern())
    expect(ProjectPatterns.longestTicks(p)).toBe(4 * 384)
    expect(ProjectPatterns.longestTicks(projectPatterns())).toBe(384)
    expect(ProjectPatterns.isEmpty(p)).toBe(false)
    expect(ProjectPatterns.isEmpty(projectPatterns())).toBe(true)
    // The note past A's end isn't played, so its pad isn't needed.
    expect(ProjectPatterns.usedPads(p)).toEqual(new Set([padKey({ group: 0, offset: 3 }), padKey({ group: 2, offset: 0 })]))
  })

  it('patterns by project, the blank ones dropped', () => {
    const p = ProjectPatterns.with(projectPatterns(), 1, pattern(2))
    const all = Patterns.put(Patterns.put(Patterns.EMPTY, 1, p), 3, projectPatterns())
    expect(Patterns.of(all, 1)).toEqual(p)
    expect(Patterns.of(all, 2)).toEqual(projectPatterns())
    expect([...all.projects.keys()]).toEqual([1])
    expect(Patterns.put(all, 1, projectPatterns())).toEqual(Patterns.EMPTY)
  })

  it('the patterns survive the round trip, without ids or the open flag', () => {
    const a = pattern(2, [patternNote(96, 3, 24, 5, 127, 7)])
    const all = Patterns.put(Patterns.EMPTY, 1, ProjectPatterns.with(projectPatterns(), 0, a))
    expect(Patterns.toJson(all)).toBe(
      '{"v":1,"projects":[{"project":1,"groups":[{"group":0,"bars":2,"notes":[{"t":96,"pad":3,"gate":24,"semi":5}]}]}]}',
    )
    expect(Patterns.fromJson(Patterns.toJson(all))).toEqual(
      Patterns.put(Patterns.EMPTY, 1, ProjectPatterns.with(projectPatterns(), 0, { ...a, notes: [{ ...a.notes[0]!, id: 0 }] })),
    )
    // Velocity only when it isn't full; a group with only another length is kept; project 0 (none known) too.
    const more = Patterns.put(
      Patterns.put(Patterns.EMPTY, 0, ProjectPatterns.with(projectPatterns(), 3, pattern(1, [patternNote(0, 0, 1, null, 64)]))),
      2,
      ProjectPatterns.with(projectPatterns(), 1, pattern(4)),
    )
    expect(Patterns.toJson(more)).toBe(
      '{"v":1,"projects":[{"project":0,"groups":[{"group":3,"bars":1,"notes":[{"t":0,"pad":0,"gate":1,"vel":64}]}]},' +
        '{"project":2,"groups":[{"group":1,"bars":4,"notes":[]}]}]}',
    )
    expect(Patterns.fromJson(Patterns.toJson(more))).toEqual(more)
    expect(Patterns.toJson(Patterns.put(Patterns.EMPTY, 1, ProjectPatterns.with(projectPatterns(), 0, { ...a, open: true })))).not.toContain('open')
    expect(Patterns.fromJson(Patterns.toJson(Patterns.EMPTY))).toEqual(Patterns.EMPTY)
  })

  it("junk reads as nothing, and entries it can't read are skipped", () => {
    expect(Patterns.fromJson('not json')).toBeNull()
    expect(Patterns.fromJson('[]')).toBeNull()
    expect(Patterns.fromJson('{"v":2,"projects":[]}')).toBeNull()
    expect(Patterns.fromJson('{"projects":[]}')).toBeNull()
    expect(Patterns.fromJson('{"v":1}')).toEqual(Patterns.EMPTY)
    const text = `{"v":1,"projects":[
            {"project":100,"groups":[{"group":0,"bars":2,"notes":[]}]},
            {"project":"1","groups":[{"group":0,"bars":2,"notes":[]}]},
            {"project":1,"groups":[
                {"group":4,"bars":2,"notes":[]},
                {"group":1,"bars":0,"notes":[]},
                {"group":1,"bars":100,"notes":[]},
                {"group":2,"notes":[]},
                {"group":0,"bars":2,"notes":[
                    {"t":0,"pad":1,"gate":24},
                    {"t":-1,"pad":1,"gate":24},
                    {"t":0,"pad":12,"gate":24},
                    {"t":0,"pad":1,"gate":0},
                    {"t":0,"pad":1,"gate":24,"semi":"2"},
                    {"t":0,"pad":1,"gate":24,"vel":0},
                    {"t":0,"pad":1},
                    "x",
                    {"t":48,"pad":2,"gate":12,"semi":-3,"vel":100}
                ]}
            ]}
        ]}`
    const want = Patterns.put(
      Patterns.EMPTY,
      1,
      ProjectPatterns.with(projectPatterns(), 0, pattern(2, [patternNote(0, 1, 24), patternNote(48, 2, 12, -3, 100)])),
    )
    expect(Patterns.fromJson(text)).toEqual(want)
  })

  it('a group reads at most its note cap', () => {
    const notes = Array.from({ length: Seq.MAX_NOTES + 5 }, (_, i) => `{"t":${i},"pad":0,"gate":1}`).join(',')
    const read = Patterns.fromJson(`{"v":1,"projects":[{"project":1,"groups":[{"group":0,"bars":99,"notes":[${notes}]}]}]}`)
    expect(ProjectPatterns.group(Patterns.of(read!, 1), 0).notes.length).toBe(Seq.MAX_NOTES)
  })

  it('timing snaps to the nearest grid tick, ties up', () => {
    expect(Timing.DEFAULT).toBe(Timing.SIXTEENTH)
    expect(TIMINGS.map(timingTicks)).toEqual([0, 48, 24, 12])
    expect(Timing.of('1/8')).toBe(Timing.EIGHTH)
    expect(Timing.of('off')).toBe(Timing.OFF)
    expect(Timing.of('1/64')).toBeNull()
    expect(quantize(Timing.SIXTEENTH, 11.9)).toBe(0)
    expect(quantize(Timing.SIXTEENTH, 12.0)).toBe(24)
    expect(quantize(Timing.SIXTEENTH, 35.9)).toBe(24)
    expect(quantize(Timing.EIGHTH, 24.0)).toBe(48)
    expect(quantize(Timing.THIRTY_SECOND, 17.9)).toBe(12)
    // On the length: the caller wraps it.
    expect(quantize(Timing.SIXTEENTH, 380.0)).toBe(384)
    // Before tick 0: half a step rounds up to 0, more doesn't.
    expect(quantize(Timing.SIXTEENTH, -12.0)).toBe(0)
    expect(quantize(Timing.SIXTEENTH, -12.1)).toBe(-24)
    // OFF: the nearest whole tick.
    expect(quantize(Timing.OFF, 10.49)).toBe(10)
    expect(quantize(Timing.OFF, 10.5)).toBe(11)
    expect(quantize(Timing.OFF, -0.5)).toBe(0)
  })
})
