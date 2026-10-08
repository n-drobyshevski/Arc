// Port of core/src/test/kotlin/dev/arc/ep133/features/PatternRecorderTest.kt
import { describe, expect, it } from 'vitest'
import { physicalPad, type PhysicalPad } from '../../../src/core/features/padNotes'
import {
  Pattern,
  ProjectPatterns,
  Seq,
  Timing,
  pattern,
  patternNote,
  projectPatterns,
  type ProjectPatterns as Patterns,
} from '../../../src/core/features/pattern'
import { PatternRecorder } from '../../../src/core/features/patternRecorder'

const a3 = physicalPad(0, 3)
const a4 = physicalPad(0, 4)
const b0 = physicalPad(1, 0)
const sixteenth = Timing.SIXTEENTH

/** [pad] played at [tick] and heard then, on the 1/16 grid unless [timing] says otherwise. */
const hit = (r: PatternRecorder, p: Patterns, pad: PhysicalPad, tick: number, timing: Timing = sixteenth, semitones: number | null = null) =>
  r.noteOn(p, pad, semitones, tick, tick, timing)

const ticks = (p: Patterns, g = 0): number[] => ProjectPatterns.group(p, g).notes.map((n) => n.tick)
const notesOf = (p: Patterns, g = 0) => ProjectPatterns.group(p, g).notes
const withGroup = (g: number, pat: Pattern, p: Patterns = projectPatterns()): Patterns => ProjectPatterns.with(p, g, pat)

describe('PatternRecorderTest', () => {
  it('a press goes to the nearest grid tick, and one on the length wraps to 0', () => {
    const r = new PatternRecorder()
    let p = r.punchIn(projectPatterns(), true, false)
    p = hit(r, p, a3, 101.0).patterns
    expect(ticks(p)).toEqual([96])
    // 380 snaps to 384, the length: tick 0 of the next pass.
    p = hit(r, p, a4, 380.0).patterns
    expect(ticks(p)).toEqual([96, 0])
    // A later pass lands on the same pattern ticks.
    p = hit(r, p, b0, 384.0 * 5 + 50).patterns
    expect(ticks(p, 1)).toEqual([48])
    expect(notesOf(p)[0]).toEqual(patternNote(96, 3, 24, null, 127, 1))
  })

  it('a press half a step before the count-in ends records at 0, earlier ones nothing', () => {
    const r = new PatternRecorder()
    const p0 = r.punchIn(projectPatterns(), true, false)
    const at0 = hit(r, p0, a3, -12.0)
    expect(ticks(at0.patterns)).toEqual([0])
    const early = hit(r, at0.patterns, a3, -12.5)
    expect(early.id).toBe(0)
    expect(early.patterns).toEqual(at0.patterns)
    expect(early.skipPass).toBeNull()
    // OFF: half a tick.
    expect(hit(r, p0, a3, -0.6, Timing.OFF).id).toBe(0)
    expect(ticks(hit(r, p0, a3, -0.5, Timing.OFF).patterns)).toEqual([0])
  })

  it('timing OFF records the tick played', () => {
    const r = new PatternRecorder()
    const p = hit(r, projectPatterns(), a3, 101.4, Timing.OFF).patterns
    expect(ticks(p)).toEqual([101])
  })

  it('a note on the same pad and pitch at the same tick replaces the old one', () => {
    const r = new PatternRecorder()
    let p = hit(r, projectPatterns(), a3, 96.0).patterns
    p = hit(r, p, a3, 100.0).patterns
    expect(ticks(p)).toEqual([96])
    expect(notesOf(p)[0]!.id).toBe(2)
    // Another pitch on the pad, or another pad, is another note.
    p = hit(r, p, a3, 96.0, sixteenth, 2).patterns
    p = hit(r, p, a4, 96.0).patterns
    expect(notesOf(p).length).toBe(3)
    // OFF: within 6 ticks, round the loop too.
    let off = hit(r, projectPatterns(), a3, 100.0, Timing.OFF).patterns
    off = hit(r, off, a3, 106.0, Timing.OFF).patterns
    expect(ticks(off)).toEqual([106])
    off = hit(r, off, a3, 113.0, Timing.OFF).patterns
    expect(ticks(off)).toEqual([106, 113])
    off = hit(r, projectPatterns(), a3, 382.0, Timing.OFF).patterns
    off = hit(r, off, a3, 384.0 + 2, Timing.OFF).patterns
    expect(ticks(off)).toEqual([2])
  })

  it('a note the grid puts after it was heard skips that pass', () => {
    const r = new PatternRecorder()
    // Heard at 380, snapped to 384: the next pass's tick 0 would play it again at once.
    expect(r.noteOn(projectPatterns(), a3, null, 380.0, 380.0, sixteenth).skipPass).toBe(1)
    expect(r.noteOn(projectPatterns(), a3, null, 384.0 * 3 + 90, 384.0 * 3 + 90, sixteenth).skipPass).toBe(3)
    // Snapped back to before it was heard: nothing to skip.
    expect(r.noteOn(projectPatterns(), a3, null, 101.0, 101.0, sixteenth).skipPass).toBeNull()
    expect(r.noteOn(projectPatterns(), a3, null, 96.0, 96.0, sixteenth).skipPass).toBeNull()
    // Heard after where it snaps to (the press time was early): nothing.
    expect(r.noteOn(projectPatterns(), a3, null, 90.0, 97.0, sixteenth).skipPass).toBeNull()
    expect(r.noteOn(projectPatterns(), a3, null, 90.0, 90.0, sixteenth).skipPass).toBe(0)
  })

  it("a note's gate runs from its grid start to the release", () => {
    const r = new PatternRecorder()
    const on = hit(r, projectPatterns(), a3, 101.0)
    expect(notesOf(on.patterns)[0]!.gate).toBe(24)
    expect(notesOf(r.noteOff(on.patterns, on.id, 140.2))[0]!.gate).toBe(44)
    // At least a tick; at most the length.
    const short = hit(r, projectPatterns(), a3, 101.0)
    expect(notesOf(r.noteOff(short.patterns, short.id, 96.2))[0]!.gate).toBe(1)
    const long = hit(r, projectPatterns(), a3, 101.0)
    expect(notesOf(r.noteOff(long.patterns, long.id, 96.0 + 2000))[0]!.gate).toBe(384)
    // Snapped across the wrap: from the next pass's 0.
    const wrap = hit(r, projectPatterns(), a3, 380.0)
    expect(notesOf(r.noteOff(wrap.patterns, wrap.id, 400.0))[0]!.gate).toBe(16)
    // A note no longer known (id 0, or gone): nothing changes.
    expect(r.noteOff(on.patterns, 0, 200.0)).toEqual(on.patterns)
    expect(r.noteOff(on.patterns, 99, 200.0)).toEqual(on.patterns)
  })

  it('a release after an undo goes from where the note sits, round the loop', () => {
    const r = new PatternRecorder()
    const p = withGroup(0, pattern(1, [patternNote(370, 3, 24, null, 127, 5)]))
    expect(notesOf(r.noteOff(p, 5, 384.0 * 2 + 16))[0]!.gate).toBe(30)
  })

  it('groups empty at a recording from stop open with auto length, and close where it stops', () => {
    const r = new PatternRecorder()
    const start = withGroup(1, pattern(3), withGroup(0, pattern(1, [patternNote(0, 0, 24)])))
    expect(r.punchIn(start, false, true)).toEqual(start)
    expect(r.punchIn(start, true, false)).toEqual(start)
    let p = r.punchIn(start, true, true)
    expect(ProjectPatterns.group(p, 0).open).toBe(false)
    expect(p.groups.map((g) => g.open)).toEqual([false, true, true, true])
    expect(ProjectPatterns.group(p, 1).bars).toBe(1)
    // In an open group the tick is the global one: no wrap.
    p = hit(r, p, physicalPad(2, 0), 500.0).patterns
    expect(ticks(p, 2)).toEqual([504])
    expect(ProjectPatterns.group(p, 2).bars).toBe(2)
    expect(ProjectPatterns.group(p, 2).open).toBe(true)
    // Stopped in the 2nd bar: 2 bars. B, with no notes, goes back to its 3.
    const out = r.punchOut(p, 600.0)
    expect(out.groups.map((g) => g.bars)).toEqual([1, 3, 2, 1])
    expect(out.groups.every((g) => !g.open)).toBe(true)
    // The bars gone by, up to the next of 1, 2, 4 or 8.
    expect(ProjectPatterns.group(r.punchOut(p, 1200.0), 2).bars).toBe(4)
    expect(ProjectPatterns.group(r.punchOut(p, 1600.0), 2).bars).toBe(8)
    expect(ProjectPatterns.group(r.punchOut(p, 384.0 * 20), 2).bars).toBe(8)
    // Never shorter than the notes in it.
    expect(ProjectPatterns.group(r.punchOut(p, 100.0), 2).bars).toBe(2)
  })

  it('open groups grow to take in the playhead, and loop past 8 bars', () => {
    const r = new PatternRecorder()
    const p = r.punchIn(projectPatterns(), true, true)
    expect(r.grow(p, -100.0)).toEqual(p)
    expect(r.grow(p, 383.0)).toEqual(p)
    expect(ProjectPatterns.group(r.grow(p, 384.0), 0).bars).toBe(2)
    expect(ProjectPatterns.group(r.grow(p, 1200.0), 0).bars).toBe(4)
    expect(ProjectPatterns.group(r.grow(p, 384.0 * 7.5), 0).bars).toBe(8)
    expect(ProjectPatterns.group(r.grow(p, 384.0 * 7.5), 0).open).toBe(true)
    const past = r.grow(p, 384.0 * 8)
    expect(ProjectPatterns.group(past, 0).bars).toBe(8)
    expect(ProjectPatterns.group(past, 0).open).toBe(false)
    // A note past 8 bars loops into the closed 8.
    expect(ticks(hit(r, p, a3, 384.0 * 8 + 96).patterns)).toEqual([96])
  })

  it('a group takes no more than its note cap', () => {
    const r = new PatternRecorder()
    const full = withGroup(0, pattern(99, Array.from({ length: Seq.MAX_NOTES }, (_, i) => patternNote(i, 0, 1))))
    const more = hit(r, full, a3, 100_000.0)
    expect(more.id).toBe(0)
    expect(more.patterns).toEqual(full)
    // Replacing a note still fits.
    expect(hit(r, full, physicalPad(0, 0), 96.0).id).not.toBe(0)
  })

  it('undo takes back a pass at a time', () => {
    const r = new PatternRecorder()
    expect(r.canUndo).toBe(false)
    expect(r.undo(projectPatterns())).toBeNull()
    const empty = projectPatterns()
    let p = r.punchIn(empty, true, false)
    expect(r.canUndo).toBe(false)
    p = hit(r, p, a3, 0.0).patterns
    expect(r.canUndo).toBe(true)
    p = hit(r, p, a4, 96.0).patterns
    const firstPass = p
    r.passed(0, 1)
    // The same pass again doesn't mark another.
    p = hit(r, p, a3, 384.0 + 192).patterns
    r.passed(0, 1)
    p = hit(r, p, a4, 384.0 + 288).patterns
    expect(r.undo(p)).toEqual(firstPass)
    expect(r.undo(firstPass)).toEqual(empty)
    expect(r.undo(empty)).toBeNull()
    expect(r.canUndo).toBe(false)
  })

  it('each erase, clear, length change or double is its own checkpoint', () => {
    const r = new PatternRecorder()
    const p0 = withGroup(0, pattern(1, [patternNote(0, 3, 24), patternNote(96, 4, 24)]))
    const p1 = r.erasePad(p0, a3)
    const p2 = r.setLength(p1, 0, 2)
    const p3 = r.double(p2, 0)
    const p4 = r.clear(p3, null)
    // Nothing to erase: no checkpoint.
    expect(r.erasePad(p4, a3)).toEqual(p4)
    // Recorded after an erase: a checkpoint of its own.
    const p5 = hit(r, p4, a3, 0.0).patterns
    expect(r.undo(p5)).toEqual(p4)
    expect(r.undo(p4)).toEqual(p3)
    expect(r.undo(p3)).toEqual(p2)
    expect(r.undo(p2)).toEqual(p1)
    expect(r.undo(p1)).toEqual(p0)
    expect(r.undo(p0)).toBeNull()
  })

  it('at most maxUndo checkpoints are kept', () => {
    const r = new PatternRecorder(2)
    const p0 = projectPatterns()
    const p1 = r.setLength(p0, 0, 2)
    const p2 = r.setLength(p1, 0, 3)
    const p3 = r.setLength(p2, 0, 4)
    expect(r.undo(p3)).toEqual(p2)
    expect(r.undo(p2)).toEqual(p1)
    expect(r.undo(p1)).toBeNull()
  })

  it('an undo of an auto length recording closes the groups again', () => {
    const r = new PatternRecorder()
    const start = withGroup(1, pattern(3))
    let p = r.punchIn(start, true, true)
    p = hit(r, p, b0, 500.0).patterns
    p = r.punchOut(p, 600.0)
    expect(r.undo(p)).toEqual(start)
  })

  it("erasing a pad takes all its notes, or one pitch's", () => {
    const r = new PatternRecorder()
    const p = withGroup(0, pattern(1, [patternNote(0, 3, 24), patternNote(96, 3, 24, 2), patternNote(192, 3, 24, 5), patternNote(0, 4, 24)]))
    expect(notesOf(r.erasePad(p, a3)).map((n) => n.offset)).toEqual([4])
    expect(ticks(r.erasePad(p, a3, 2))).toEqual([0, 192, 0])
  })

  it('erasing while playing takes the notes the playhead passes, round the loop', () => {
    const r = new PatternRecorder()
    const notes = [patternNote(10, 3, 24), patternNote(200, 3, 24), patternNote(370, 3, 24), patternNote(380, 3, 24), patternNote(380, 4, 24)]
    const p = withGroup(0, pattern(1, notes))
    // 760..780 is 376..12 of the pattern.
    expect(ticks(r.eraseRange(p, a3, null, 760.0, 780.0))).toEqual([200, 370, 380])
    expect(ticks(r.eraseRange(p, a3, null, 100.0, 300.0))).toEqual([10, 370, 380, 380])
    // A whole loop or more: every note on the pad.
    expect(notesOf(r.eraseRange(p, a3, null, 1000.0, 1384.0)).map((n) => n.offset)).toEqual([4])
    expect(r.eraseRange(p, a3, null, 300.0, 300.0)).toEqual(p)
  })

  it('a pad held in erase is one checkpoint', () => {
    const r = new PatternRecorder()
    const p0 = withGroup(0, pattern(1, [patternNote(10, 3, 24), patternNote(100, 3, 24), patternNote(200, 3, 24)]))
    // Its first stretch passes nothing; the next ones follow on.
    let p = r.eraseRange(p0, a3, null, 0.0, 5.0)
    p = r.eraseRange(p, a3, null, 5.0, 50.0)
    p = r.eraseRange(p, a3, null, 50.0, 150.0)
    p = r.eraseRange(p, a3, null, 150.0, 250.0)
    expect(Pattern.isEmpty(ProjectPatterns.group(p, 0))).toBe(true)
    expect(r.undo(p)).toEqual(p0)
    expect(r.undo(p0)).toBeNull()
    // Let go and held again: another gesture.
    let q = r.eraseRange(p0, a3, null, 0.0, 50.0)
    q = r.eraseRange(q, a3, null, 300.0, 384.0 + 150)
    expect(ticks(r.undo(q)!)).toEqual([100, 200])
  })

  it('clear takes the notes of a group or all, and keeps the lengths', () => {
    const r = new PatternRecorder()
    const p = withGroup(1, pattern(1, [patternNote(0, 0, 24)]), withGroup(0, pattern(2, [patternNote(0, 3, 24)])))
    const a = r.clear(p, 0)
    expect(Pattern.isEmpty(ProjectPatterns.group(a, 0))).toBe(true)
    expect(ProjectPatterns.group(a, 0).bars).toBe(2)
    expect(Pattern.isEmpty(ProjectPatterns.group(a, 1))).toBe(false)
    const all = r.clear(p, null)
    expect(ProjectPatterns.isEmpty(all)).toBe(true)
    expect(all.groups.map((g) => g.bars)).toEqual([2, 1, 1, 1])
  })

  it('a length is 1 to 99 bars, and notes past the end are kept', () => {
    const r = new PatternRecorder()
    const p = withGroup(0, pattern(2, [patternNote(0, 3, 24), patternNote(500, 3, 24)]))
    const one = r.setLength(p, 0, 1)
    expect(ticks(one)).toEqual([0, 500])
    expect(Pattern.playable(ProjectPatterns.group(one, 0)).map((n) => n.tick)).toEqual([0])
    expect(Pattern.playable(ProjectPatterns.group(r.setLength(one, 0, 2), 0)).map((n) => n.tick)).toEqual([0, 500])
    expect(ProjectPatterns.group(r.setLength(p, 0, 0), 0).bars).toBe(1)
    expect(ProjectPatterns.group(r.setLength(p, 0, 120), 0).bars).toBe(99)
    // It closes an open group.
    const open = r.punchIn(projectPatterns(), true, true)
    expect(ProjectPatterns.group(r.setLength(open, 3, 4), 3).open).toBe(false)
  })

  it('double copies the notes into the new half, up to 99 bars', () => {
    const r = new PatternRecorder()
    const p = withGroup(0, pattern(1, [patternNote(0, 3, 24, null, 127, 4), patternNote(96, 4, 12), patternNote(500, 5, 24)]))
    const d = r.double(p, 0)
    expect(ProjectPatterns.group(d, 0).bars).toBe(2)
    // The note left past the old end is replaced by the copies.
    expect(notesOf(d)).toEqual([patternNote(0, 3, 24, null, 127, 4), patternNote(96, 4, 12), patternNote(384, 3, 24), patternNote(480, 4, 12)])
    // 60 bars give 99, with the copies that fit.
    const long = withGroup(0, pattern(60, [patternNote(0, 0, 24), patternNote(384 * 50, 0, 24)]))
    const l = r.double(long, 0)
    expect(ProjectPatterns.group(l, 0).bars).toBe(99)
    expect(ticks(l)).toEqual([0, 384 * 50, 384 * 60])
    const most = withGroup(0, pattern(99))
    expect(r.double(most, 0)).toEqual(most)
  })
})
