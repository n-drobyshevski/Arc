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
  type PatternNote,
  type ProjectPatterns as Patterns,
} from '../../../src/core/features/pattern'
import { PatternRecorder, type Corrected, type Nudged } from '../../../src/core/features/patternRecorder'

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
const one = (...notes: PatternNote[]): Patterns => withGroup(0, pattern(1, notes))
const nudged = (patterns: Patterns, step: number): Nudged => ({ patterns, step })
const corrected = (patterns: Patterns, moved: number): Corrected => ({ patterns, moved })

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
    // Notes left past the end aren't played: nothing played replaces them.
    const past = withGroup(0, pattern(1, [patternNote(500, 3, 24), patternNote(386, 3, 24)]))
    expect(ticks(hit(r, past, a3, 0.0).patterns)).toEqual([500, 386, 0])
    expect(ticks(hit(r, past, a3, 2.0, Timing.OFF).patterns)).toEqual([500, 386, 2])
  })

  it('a press snaps to the swung grid and keeps its velocity', () => {
    const r = new PatternRecorder()
    // 1/16 at 75%: the off-beats sit at 36 and 84, so 40 goes to 36, not 48.
    let p = r.noteOn(projectPatterns(), a3, null, 40.0, 40.0, sixteenth, 75, 90).patterns
    expect(notesOf(p)[0]).toEqual(patternNote(36, 3, 24, null, 90, 1))
    p = r.noteOn(p, a4, 2, 66.5, 66.5, sixteenth, 75).patterns
    expect(ticks(p)).toEqual([36, 84])
    expect(notesOf(p)[1]!.velocity).toBe(127)
    // Straight by default.
    expect(ticks(hit(r, projectPatterns(), a3, 40.0).patterns)).toEqual([48])
    // Swing doesn't touch 1/32 or OFF.
    expect(ticks(r.noteOn(projectPatterns(), a3, null, 40.0, 40.0, Timing.THIRTY_SECOND, 75).patterns)).toEqual([36])
    expect(ticks(r.noteOn(projectPatterns(), a3, null, 40.4, 40.4, Timing.OFF, 75).patterns)).toEqual([40])
    // Swung after it was heard: that pass is skipped too.
    expect(r.noteOn(projectPatterns(), a3, null, 30.0, 30.0, sixteenth, 75).skipPass).toBe(0)
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
    // A stretch with none of the pad's notes gives the very patterns back (nothing to publish or save).
    expect(r.eraseRange(p, a3, null, 220.0, 300.0)).toBe(p)
    // Notes left past the end aren't played, so the playhead never passes them.
    const past = withGroup(0, pattern(1, [patternNote(10, 3, 24), patternNote(500, 3, 24)]))
    expect(ticks(r.eraseRange(past, a3, null, 760.0, 780.0))).toEqual([500])
    expect(ticks(r.eraseRange(past, a3, null, 0.0, 384.0))).toEqual([500])
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

  it("a note placed on a step replaces the pad's at its pitch", () => {
    const r = new PatternRecorder()
    const p0 = one(patternNote(96, 3, 24, null, 50), patternNote(98, 3, 24, 2), patternNote(100, 3, 24), patternNote(120, 3, 24))
    // Step 4 at 1/16 is 96..107: both of A 3's pad hits go, its KEYS note of another pitch and step 5 stay.
    const p1 = r.stepPlace(p0, a3, null, 4, sixteenth, 50, 90)
    expect(notesOf(p1)).toEqual([patternNote(98, 3, 24, 2), patternNote(120, 3, 24), patternNote(96, 3, 24, null, 90)])
    const p2 = r.stepPlace(p1, a3, 2, 4, sixteenth, 50)
    expect(ticks(p2)).toEqual([120, 96, 96])
    expect(notesOf(p2).map((n) => n.semitones)).toEqual([null, null, 2])
    // One interval long, on the swung grid, at 1..127.
    expect(notesOf(new PatternRecorder().stepPlace(projectPatterns(), a4, null, 1, Timing.EIGHTH, 75, 200))).toEqual([patternNote(72, 4, 48, null, 127)])
    expect(notesOf(new PatternRecorder().stepPlace(projectPatterns(), a4, null, 0, sixteenth, 50, 0))[0]!.velocity).toBe(1)
    // Each place is a checkpoint.
    expect(r.undo(p2)).toEqual(p1)
    expect(r.undo(p1)).toEqual(p0)
  })

  it("a full pattern takes no step note, but a replaced one still fits", () => {
    const r = new PatternRecorder()
    const full = withGroup(0, pattern(99, Array.from({ length: Seq.MAX_NOTES }, (_, i) => patternNote(i, 0, 1))))
    expect(r.stepPlace(full, a3, null, 0, sixteenth, 50)).toBe(full)
    // Ticks 0..11 are step 0.
    expect(notesOf(r.stepPlace(full, physicalPad(0, 0), null, 0, sixteenth, 50)).length).toBe(Seq.MAX_NOTES - 11)
  })

  it("a step's velocity and length are held to range, and a knob turn is one undo", () => {
    const r = new PatternRecorder()
    const p0 = one(patternNote(0, 3, 24), patternNote(2, 4, 24, 5), patternNote(24, 3, 24))
    const velocities = (p: Patterns) => notesOf(p).map((n) => n.velocity)
    let p = r.stepVelocity(p0, 0, 0, sixteenth, 50, 90)
    expect(velocities(p)).toEqual([90, 90, 127])
    p = r.stepVelocity(p, 0, 0, sixteenth, 50, 0)
    expect(velocities(p)).toEqual([1, 1, 127])
    p = r.stepVelocity(p, 0, 0, sixteenth, 50, 300)
    p = r.stepVelocity(p, 0, 0, sixteenth, 50, 100)
    expect(velocities(p)).toEqual([100, 100, 127])
    expect(r.undo(p)).toEqual(p0)
    expect(r.undo(p0)).toBeNull()
    let g = r.stepGate(p0, 0, 0, sixteenth, 50, 0)
    expect(notesOf(g).map((n) => n.gate)).toEqual([1, 1, 24])
    g = r.stepGate(g, 0, 0, sixteenth, 50, 1000)
    expect(notesOf(g).map((n) => n.gate)).toEqual([384, 384, 24])
    g = r.stepGate(g, 0, 0, sixteenth, 50, 48)
    expect(r.undo(g)).toEqual(p0)
    // An empty step: nothing changes.
    expect(r.stepVelocity(p0, 0, 5, sixteenth, 50, 10)).toBe(p0)
    // Another step is another gesture, as is the knob let go of.
    let q = r.stepVelocity(p0, 0, 0, sixteenth, 50, 90)
    q = r.stepVelocity(q, 0, 1, sixteenth, 50, 90)
    const second = q
    q = r.stepVelocity(q, 0, 1, sixteenth, 50, 80)
    r.endRun()
    q = r.stepVelocity(q, 0, 1, sixteenth, 50, 70)
    expect(velocities(r.undo(q)!)).toEqual([90, 90, 80])
    expect(velocities(r.undo(second)!)).toEqual([90, 90, 127])
  })

  it('a nudge moves a step on the grid, or a tick in free time, and the cursor follows', () => {
    const r = new PatternRecorder()
    const p0 = one(patternNote(24, 3, 24), patternNote(24, 3, 24, 2), patternNote(24, 4, 24))
    const up = r.nudge(p0, a3, null, 1, sixteenth, 50, true, 1)
    expect(ticks(up.patterns)).toEqual([48, 48, 24])
    expect(up.step).toBe(2)
    expect(ticks(r.nudge(p0, a3, 2, 1, sixteenth, 50, true, 1).patterns)).toEqual([24, 48, 24])
    const free = r.nudge(p0, a3, null, 1, sixteenth, 50, false, -1)
    expect(ticks(free.patterns)).toEqual([23, 23, 24])
    expect(free.step).toBe(1)
    // A tick past halfway: the next step.
    expect(r.nudge(one(patternNote(35, 3, 24)), a3, null, 1, sixteenth, 50, false, 1)).toEqual(nudged(one(patternNote(36, 3, 24)), 2))
    // Nothing of the pad there: the very patterns, the cursor where it was.
    const none = r.nudge(p0, a3, null, 3, sixteenth, 50, true, 1)
    expect(none.patterns).toBe(p0)
    expect(none.step).toBe(3)
  })

  it('a nudge wraps round both ends', () => {
    const r = new PatternRecorder()
    expect(r.nudge(one(patternNote(0, 3, 24)), a3, null, 0, sixteenth, 50, true, -1)).toEqual(nudged(one(patternNote(360, 3, 24)), 15))
    expect(r.nudge(one(patternNote(360, 3, 24)), a3, null, 15, sixteenth, 50, true, 1)).toEqual(nudged(one(patternNote(0, 3, 24)), 0))
    // Free time: 383 still rounds to step 0.
    expect(r.nudge(one(patternNote(0, 3, 24)), a3, null, 0, sixteenth, 50, false, -1)).toEqual(nudged(one(patternNote(383, 3, 24)), 0))
    expect(r.nudge(one(patternNote(383, 3, 24)), a3, null, 0, sixteenth, 50, false, 1)).toEqual(nudged(one(patternNote(0, 3, 24)), 0))
  })

  it('a nudge keeps a swung grid swung', () => {
    const r = new PatternRecorder()
    let n = r.nudge(one(patternNote(36, 3, 24)), a3, null, 1, sixteenth, 75, true, 1)
    expect(ticks(n.patterns)).toEqual([48])
    n = r.nudge(n.patterns, a3, null, n.step, sixteenth, 75, true, 1)
    expect(n).toEqual(nudged(one(patternNote(84, 3, 24)), 3))
    // Off the grid, on step 1 (36): it snaps to step 0.
    expect(ticks(r.nudge(one(patternNote(40, 3, 24)), a3, null, 1, sixteenth, 75, true, -1).patterns)).toEqual([0])
  })

  it('a nudged note replaces one it lands on, and the presses are one undo', () => {
    const r = new PatternRecorder()
    const p0 = one(patternNote(24, 3, 24), patternNote(48, 3, 24, null, 50), patternNote(48, 4, 24))
    const hit = r.nudge(p0, a3, null, 1, sixteenth, 50, true, 1)
    expect(notesOf(hit.patterns)).toEqual([patternNote(48, 3, 24), patternNote(48, 4, 24)])
    let n = hit
    n = r.nudge(n.patterns, a3, null, n.step, sixteenth, 50, true, 1)
    n = r.nudge(n.patterns, a3, null, n.step, sixteenth, 50, false, 1)
    expect(ticks(n.patterns)).toEqual([73, 48])
    expect(n.step).toBe(3)
    expect(r.undo(n.patterns)).toEqual(p0)
    expect(r.undo(p0)).toBeNull()
  })

  it("a pad's notes shift a tick, round the loop, past the end left alone", () => {
    const r = new PatternRecorder()
    const p0 = one(patternNote(0, 3, 24), patternNote(200, 3, 24, 2), patternNote(500, 3, 24), patternNote(0, 4, 24))
    let p = r.shiftPad(p0, a3, null, -1)
    expect(ticks(p)).toEqual([383, 199, 500, 0])
    p = r.shiftPad(p, a3, null, -1)
    p = r.shiftPad(p, a3, null, -1)
    expect(ticks(p)).toEqual([381, 197, 500, 0])
    expect(r.undo(p)).toEqual(p0)
    expect(r.undo(p0)).toBeNull()
    expect(ticks(r.shiftPad(p0, a3, 2, 1))).toEqual([0, 201, 500, 0])
    expect(ticks(r.shiftPad(one(patternNote(383, 3, 24), patternNote(0, 4, 24)), a3, null, 1))).toEqual([0, 0])
  })

  it("timing correct puts a pad's notes on the grid, the first of two on a tick staying", () => {
    const r = new PatternRecorder()
    const p0 = one(
      patternNote(5, 3, 24),
      patternNote(22, 3, 24, null, 60),
      patternNote(26, 3, 24, null, 70),
      patternNote(48, 3, 24),
      patternNote(380, 3, 24),
      patternNote(500, 3, 24),
      patternNote(13, 4, 24),
    )
    const c = r.correctPad(p0, a3, null, sixteenth, 50)
    // 5 and 22 move; 26 lands on 22's 24 and 380 on 5's 0 (round the loop): both dropped.
    expect(c.moved).toBe(4)
    expect(ticks(c.patterns)).toEqual([0, 24, 48, 500, 13])
    expect(notesOf(c.patterns).map((n) => n.velocity)).toEqual([127, 60, 127, 127, 127])
    // Already on it: nothing moved, the very patterns.
    const again = r.correctPad(c.patterns, a3, null, sixteenth, 50)
    expect(again.moved).toBe(0)
    expect(again.patterns).toBe(c.patterns)
    // Swung: 30 and 40 go to 36, 70 to 84.
    const swung = new PatternRecorder().correctPad(one(patternNote(30, 3, 24), patternNote(40, 3, 24), patternNote(70, 3, 24)), a3, null, sixteenth, 75)
    expect(swung).toEqual(corrected(one(patternNote(36, 3, 24), patternNote(84, 3, 24)), 3))
    // One pitch of the pad.
    expect(new PatternRecorder().correctPad(one(patternNote(5, 3, 24), patternNote(5, 3, 24, 2)), a3, 2, sixteenth, 50)).toEqual(
      corrected(one(patternNote(5, 3, 24), patternNote(0, 3, 24, 2)), 1),
    )
    // Each is a checkpoint.
    const p2 = r.correctPad(c.patterns, a3, null, Timing.QUARTER, 50).patterns
    // At 1/4, 24 lands on 0 and 48 rounds up to 96.
    expect(ticks(p2)).toEqual([0, 96, 500, 13])
    expect(r.undo(p2)).toEqual(c.patterns)
    expect(r.undo(c.patterns)).toEqual(p0)
  })

  it('a pad held to correct while playing is one checkpoint', () => {
    const r = new PatternRecorder()
    const p0 = one(patternNote(10, 3, 24), patternNote(100, 3, 24), patternNote(200, 3, 24))
    let total = 0
    let p = p0
    for (const [from, to] of [
      [0.0, 5.0],
      [5.0, 50.0],
      [50.0, 150.0],
      [150.0, 250.0],
    ] as const) {
      const c = r.correctRange(p, a3, null, from, to, sixteenth, 50)
      total += c.moved
      p = c.patterns
    }
    expect(total).toBe(3)
    expect(ticks(p)).toEqual([0, 96, 192])
    expect(r.undo(p)).toEqual(p0)
    expect(r.undo(p0)).toBeNull()
    // Let go and held again: another gesture.
    let q = r.correctRange(p0, a3, null, 0.0, 50.0, sixteenth, 50).patterns
    const again = r.correctRange(q, a3, null, 300.0, 384.0 + 150, sixteenth, 50)
    expect(again.moved).toBe(1)
    q = again.patterns
    expect(ticks(r.undo(q)!)).toEqual([0, 100, 200])
    // Round the loop, and a whole loop.
    expect(r.correctRange(one(patternNote(380, 3, 24), patternNote(200, 3, 24)), a3, null, 760.0, 780.0, sixteenth, 50)).toEqual(
      corrected(one(patternNote(0, 3, 24), patternNote(200, 3, 24)), 1),
    )
    expect(r.correctRange(p0, a3, null, 1000.0, 1384.0, sixteenth, 50).moved).toBe(3)
    expect(r.correctRange(p0, a3, null, 300.0, 300.0, sixteenth, 50)).toEqual(corrected(p0, 0))
  })

  it('another edit in between breaks a run', () => {
    const r = new PatternRecorder()
    const p0 = one(patternNote(0, 3, 24), patternNote(10, 4, 24), patternNote(30, 4, 24))
    const p1 = r.stepVelocity(p0, 0, 0, sixteenth, 50, 90)
    const p2 = r.stepGate(p1, 0, 0, sixteenth, 50, 48)
    const p3 = r.stepVelocity(p2, 0, 0, sixteenth, 50, 80)
    const p4 = r.correctRange(p3, a4, null, 0.0, 20.0, sixteenth, 50).patterns
    const p5 = r.erasePad(p4, a3)
    // Follows on from 20, but the erase came in between: a checkpoint of its own.
    const p6 = r.correctRange(p5, a4, null, 20.0, 40.0, sixteenth, 50).patterns
    expect(ticks(p6)).toEqual([0, 24])
    const p7 = r.shiftPad(p6, a4, null, 1)
    const p8 = hit(r, p7, a3, 96.0).patterns
    const p9 = r.shiftPad(p8, a4, null, 1)
    expect(ticks(p9)).toEqual([2, 26, 96])
    expect(r.undo(p9)).toEqual(p8)
    expect(r.undo(p8)).toEqual(p7)
    expect(r.undo(p7)).toEqual(p6)
    expect(r.undo(p6)).toEqual(p5)
    expect(r.undo(p5)).toEqual(p4)
    expect(r.undo(p4)).toEqual(p3)
    expect(r.undo(p3)).toEqual(p2)
    expect(r.undo(p2)).toEqual(p1)
    expect(r.undo(p1)).toEqual(p0)
    expect(r.undo(p0)).toBeNull()
  })

  it('step edits and corrects leave an open pattern alone', () => {
    const r = new PatternRecorder()
    let p = r.punchIn(projectPatterns(), true, true)
    p = hit(r, p, a3, 30.0).patterns
    expect(ProjectPatterns.group(p, 0).open).toBe(true)
    expect(r.stepPlace(p, a4, null, 0, sixteenth, 50)).toBe(p)
    expect(r.stepVelocity(p, 0, 1, sixteenth, 50, 10)).toBe(p)
    expect(r.stepGate(p, 0, 1, sixteenth, 50, 10)).toBe(p)
    expect(r.nudge(p, a3, null, 1, sixteenth, 50, true, 1)).toEqual(nudged(p, 1))
    expect(r.shiftPad(p, a3, null, 1)).toBe(p)
    expect(r.correctPad(p, a3, null, Timing.QUARTER, 50)).toEqual(corrected(p, 0))
    expect(r.correctRange(p, a3, null, 0.0, 50.0, Timing.QUARTER, 50)).toEqual(corrected(p, 0))
  })
})
