// Port of core/src/test/kotlin/dev/arc/ep133/features/SequencerTest.kt
//
// Web delta: times are milliseconds where the Kotlin uses nanoseconds, and
// PatternPosition's fraction is a double (compared closely, not exactly).
import { describe, expect, it } from 'vitest'
import { ProjectPatterns, Seq, pattern, patternNote, projectPatterns, type PatternNote, type ProjectPatterns as Patterns } from '../../../src/core/features/pattern'
import { frameAt, type FrameClock } from '../../../src/core/features/sampleTiming'
import { barFrames } from '../../../src/core/features/sampleSource'
import {
  PatternPlayer,
  PhaseAnchors,
  beatGrid,
  framesPerTick,
  frameOf,
  firstPassAtOrAfter,
  globalTickOf,
  localTick,
  msOf,
  sinceAnchor,
  nextLoopStart,
  passOf,
  positionOf,
  rebase,
  retempo,
  tickAt,
  transportClock,
  type SeqNote,
  type TransportClock,
} from '../../../src/core/features/sequencer'
import { gridAccent, gridAt } from '../../../src/core/features/tempo'

const notes = (ticks: number[], offset = 0): PatternNote[] => ticks.map((t) => patternNote(t, offset, 24))

/** Every note from [from] to [to] in windows of [block] frames, back to back. */
function play(p: Patterns, clock: TransportClock, from: number, to: number, block: number, skip: ReadonlyMap<number, number> = new Map()): SeqNote[] {
  const all: SeqNote[] = []
  const out: SeqNote[] = []
  let f = from
  while (f < to) {
    const end = Math.min(f + block, to)
    PatternPlayer.window(p, clock, f, end, skip, out)
    for (const n of out) expect(n.startFrame >= f && n.startFrame < end).toBe(true)
    all.push(...out)
    f = end
  }
  return all
}

const at = (list: SeqNote[]): [number, number][] => list.map((n) => [n.startTick, n.group])

describe('SequencerTest', () => {
  it('the clock turns ticks into mix frames and back', () => {
    const c = transportClock(1_000, 48_000, 120.0)
    expect(framesPerTick(c)).toBe(250.0)
    expect(frameOf(c, 0)).toBe(1_000)
    expect(frameOf(c, 96)).toBe(1_000 + 24_000)
    expect(frameOf(c, -384)).toBe(1_000 - 96_000)
    expect(tickAt(c, 25_000)).toBe(96.0)
    expect(tickAt(c, 875)).toBe(-0.5)
    // 44.1 kHz at 123 BPM: 224.09... frames a tick, rounded half up as barFrames.
    const odd = transportClock(0, 44_100, 123.0)
    expect(frameOf(odd, Seq.TICKS_PER_BAR)).toBe(barFrames(1, 123.0, 44_100))
    expect(frameOf(odd, 7 * Seq.TICKS_PER_BAR)).toBe(barFrames(7, 123.0, 44_100))
    expect(frameOf(odd, 1)).toBe(224)
  })

  it('another tempo keeps the tick where it changes', () => {
    const c = transportClock(500, 48_000, 120.0)
    const atFrame = 500 + 3 * 96_000 + 1_234
    const r = retempo(c, atFrame, 93.0)
    expect(r.bpm).toBe(93.0)
    expect(Math.abs(tickAt(r, atFrame) - tickAt(c, atFrame))).toBeLessThan(1 / framesPerTick(r))
    // Ticks after it go at the new tempo.
    expect(Math.abs(frameOf(r, 1_000 + 96) - frameOf(r, 1_000) - framesPerTick(r) * 96)).toBeLessThanOrEqual(1.0)
  })

  it('a new frame count keeps the tick', () => {
    const c = rebase(transportClock(500, 48_000, 120.0), 10, 384.0, 44_100)
    expect(c.rate).toBe(44_100)
    expect(c.bpm).toBe(120.0)
    expect(tickAt(c, 10)).toBeCloseTo(384.0, 9)
    expect(c.anchorFrame).toBe(10 - 88_200)
  })

  it("the click's beats fall on the pattern's, count-in before", () => {
    const c = transportClock(48_000, 48_000, 120.0)
    // The output played frame 0 at 5 s: tick 0 plays at 6 s.
    const out: FrameClock = { frame: 0, ms: 5_000, rate: 48_000 }
    const g = beatGrid(c, out)
    expect(gridAt(g, 0)).toBe(6_000)
    expect(g.periodMs).toBe(500.0)
    expect(g.barKnown).toBe(true)
    expect(gridAt(g, -4)).toBe(4_000)
    expect(gridAccent(g, -4)).toBe(true)
    expect([-3, -2, -1, 0].map((i) => gridAccent(g, i))).toEqual([false, false, false, true])
    expect(msOf(c, 48, out)).toBe(6_000 + 250)
    expect(gridAt(g, 1)).toBe(msOf(c, 96, out))
    // Back to the frame through FrameClock.frameAt.
    expect(frameAt(out, msOf(c, 37, out))).toBe(frameOf(c, 37))
  })

  it('windows back to back play every note once', () => {
    let p = projectPatterns()
    p = ProjectPatterns.with(p, 0, pattern(1, notes([0, 96, 191, 383])))
    p = ProjectPatterns.with(p, 1, pattern(2, notes([0, 400, 700], 5)))
    p = ProjectPatterns.with(p, 3, pattern(3, notes([1_000])))
    for (const rate of [44_100, 48_000]) {
      const clock = transportClock(1_234, rate, 123.0)
      const end = frameOf(clock, 12 * Seq.TICKS_PER_BAR)
      const whole: SeqNote[] = []
      PatternPlayer.window(p, clock, 0, end, new Map(), whole)
      // 12 bars: A 12 times, B 6, D 4.
      expect(whole.length).toBe(4 * 12 + 3 * 6 + 4)
      for (const block of [1, 96, 192, 1024, 7_919]) expect(play(p, clock, 0, end, block)).toEqual(whole)
      expect([...whole].sort((a, b) => a.startTick - b.startTick || a.group - b.group)).toEqual(whole)
      for (const n of whole) expect(n.startFrame).toBe(frameOf(clock, n.startTick))
    }
  })

  it("the notes loop at their group's length", () => {
    const p = ProjectPatterns.with(ProjectPatterns.with(projectPatterns(), 0, pattern(1, notes([96]))), 2, pattern(2, notes([96], 3)))
    const clock = transportClock(0, 48_000, 120.0)
    const out: SeqNote[] = []
    PatternPlayer.window(p, clock, 0, frameOf(clock, 4 * 384), new Map(), out)
    expect(at(out)).toEqual([
      [96, 0],
      [96, 2],
      [480, 0],
      [864, 0],
      [864, 2],
      [1_248, 0],
    ])
    expect(out[1]!.note).toEqual(patternNote(96, 3, 24))
  })

  it('nothing plays before tick 0, or in an empty window', () => {
    const p = ProjectPatterns.with(projectPatterns(), 0, pattern(1, notes([0, 192])))
    const clock = transportClock(100_000, 48_000, 120.0)
    const out: SeqNote[] = [{ group: 0, note: patternNote(0, 0, 1), startTick: 0, startFrame: 0 }]
    PatternPlayer.window(p, clock, 0, 100_000, new Map(), out)
    expect(out).toEqual([])
    PatternPlayer.window(p, clock, 0, 100_001, new Map(), out)
    expect(out.map((n) => n.startTick)).toEqual([0])
    PatternPlayer.window(p, clock, 100_000, 100_000, new Map(), out)
    expect(out).toEqual([])
  })

  it("an open pattern plays once, and notes past the end don't", () => {
    const open = ProjectPatterns.with(ProjectPatterns.with(projectPatterns(), 0, pattern(2, notes([100, 500]), true)), 1, pattern(1, notes([10, 400])))
    const clock = transportClock(0, 48_000, 120.0)
    const out: SeqNote[] = []
    PatternPlayer.window(open, clock, 0, frameOf(clock, 4 * 384), new Map(), out)
    expect(at(out)).toEqual([
      [10, 1],
      [100, 0],
      [394, 1],
      [500, 0],
      [778, 1],
      [1_162, 1],
    ])
  })

  it('a pass heard as it was recorded is skipped', () => {
    const p = ProjectPatterns.with(projectPatterns(), 0, pattern(1, [patternNote(0, 0, 24, null, 127, 7), patternNote(0, 1, 24)]))
    const clock = transportClock(0, 48_000, 120.0)
    const got = play(p, clock, 0, frameOf(clock, 3 * 384), 512, new Map([[7, 1]]))
    expect(got.map((n) => [n.startTick, n.note.offset])).toEqual([
      [0, 0],
      [0, 1],
      [384, 1],
      [768, 0],
      [768, 1],
    ])
  })

  it('passes and loop starts', () => {
    expect(passOf(0, 384)).toBe(0)
    expect(passOf(383, 384)).toBe(0)
    expect(passOf(384, 384)).toBe(1)
    expect(passOf(-1, 384)).toBe(-1)
    expect(nextLoopStart(-300.0, 768)).toBe(0)
    expect(nextLoopStart(0.0, 768)).toBe(0)
    expect(nextLoopStart(0.5, 768)).toBe(768)
    expect(nextLoopStart(1_000.0, 768)).toBe(1_536)
    expect(nextLoopStart(1_536.0, 768)).toBe(1_536)
  })

  it('the position reads bar dot beat of the bars', () => {
    const four = pattern(4)
    expect(positionOf(384.0 + 192, four)).toEqual({ bar: 2, beat: 3, bars: 4, fraction: 0.375 })
    expect({ ...positionOf(1_536.0 * 3 + 384 + 192 + 10, four), fraction: 0.375 }).toEqual({ bar: 2, beat: 3, bars: 4, fraction: 0.375 })
    expect(positionOf(-200.0, four)).toEqual({ bar: 1, beat: 1, bars: 4, fraction: 0 })
    const end = positionOf(1_535.0, four)
    expect({ ...end, fraction: 0 }).toEqual({ bar: 4, beat: 4, bars: 4, fraction: 0 })
    expect(end.fraction).toBeCloseTo(1_535 / 1_536, 6)
    expect(positionOf(1_536.0, four)).toEqual({ bar: 1, beat: 1, bars: 4, fraction: 0 })
    // Open, it doesn't loop.
    expect(positionOf(384.0, pattern(2, [], true))).toEqual({ bar: 2, beat: 1, bars: 2, fraction: 0.5 })
  })

  it('a pattern plays from its anchor, bar 1 where it started', () => {
    // A 2-bar pattern with a note on its bar 1 and one on its bar 2, switched in at the odd bar 2 (tick 384).
    const p = ProjectPatterns.with(projectPatterns(), 0, pattern(2, notes([0, 384])))
    const clock = transportClock(0, 48_000, 120.0)
    const out: SeqNote[] = []
    const from = frameOf(clock, 384)
    const to = frameOf(clock, 384 + 3 * 384)
    // Locked to the transport's bar 1 its bar 2 would be heard first, at 384.
    PatternPlayer.window(p, clock, from, to, new Map(), out)
    expect(out.map((n) => [n.startTick, n.note.tick])).toEqual([
      [384, 384],
      [768, 0],
      [1_152, 384],
    ])
    // From its anchor its bar 1 is, and its bar 2 a bar on.
    PatternPlayer.window(p, clock, from, to, new Map(), out, PhaseAnchors.with(PhaseAnchors.ZERO, 0, 384))
    expect(out.map((n) => [n.startTick, n.note.tick])).toEqual([
      [384, 0],
      [768, 384],
      [1_152, 0],
    ])
    // Nothing of a pattern plays before its anchor, and another group goes on as it was.
    const two = ProjectPatterns.with(p, 1, pattern(2, notes([0], 1)))
    PatternPlayer.window(two, clock, 0, frameOf(clock, 3 * 384), new Map(), out, PhaseAnchors.with(PhaseAnchors.ZERO, 0, 384))
    expect(at(out)).toEqual([
      [0, 1],
      [384, 0],
      [768, 0],
      [768, 1],
    ])
  })

  it('windows back to back from an anchor miss and repeat none', () => {
    const p = ProjectPatterns.with(projectPatterns(), 0, pattern(2, notes([0, 100, 384])))
    const clock = transportClock(0, 48_000, 120.0)
    const phase = PhaseAnchors.with(PhaseAnchors.ZERO, 0, 200)
    const whole: SeqNote[] = []
    PatternPlayer.window(p, clock, 0, frameOf(clock, 4 * 384), new Map(), whole, phase)
    const parts: SeqNote[] = []
    const out: SeqNote[] = []
    for (let f = 0; f < frameOf(clock, 4 * 384); f += 777) {
      PatternPlayer.window(p, clock, f, f + 777, new Map(), out, phase)
      parts.push(...out)
    }
    expect(parts.map((n) => n.startTick)).toEqual(whole.map((n) => n.startTick))
    expect(whole.map((n) => n.startTick)).toEqual([200, 300, 584, 968, 1_068, 1_352])
  })

  it('passes skipped are counted from the anchor', () => {
    const p = ProjectPatterns.with(projectPatterns(), 0, pattern(1, [patternNote(0, 0, 24, null, 127, 7)]))
    const clock = transportClock(0, 48_000, 120.0)
    const out: SeqNote[] = []
    PatternPlayer.window(p, clock, frameOf(clock, 100), frameOf(clock, 100 + 3 * 384), new Map([[7, 1]]), out, PhaseAnchors.with(PhaseAnchors.ZERO, 0, 100))
    // Pass 1 from the anchor (tick 484) is the one left out.
    expect(out.map((n) => n.startTick)).toEqual([100, 868])
  })

  it('an open pattern and a window of another phase', () => {
    const open = ProjectPatterns.with(projectPatterns(), 0, pattern(2, notes([100]), true))
    const clock = transportClock(0, 48_000, 120.0)
    const out: SeqNote[] = []
    PatternPlayer.window(open, clock, 0, frameOf(clock, 4 * 384), new Map(), out, PhaseAnchors.with(PhaseAnchors.ZERO, 0, 200))
    expect(out.map((n) => n.startTick)).toEqual([300])
  })

  it('anchors are four ticks, 0 out of range, and the same ones when nothing changes', () => {
    const z = PhaseAnchors.ZERO
    expect(PhaseAnchors.with(z, 0, 0)).toBe(z)
    expect(PhaseAnchors.with(z, 4, 5)).toBe(z)
    const a = PhaseAnchors.with(z, 2, 384)
    expect([0, 1, 2, 3, 7].map((g) => PhaseAnchors.of(a, g))).toEqual([0, 0, 384, 0, 0])
  })

  it('local ticks are the time since the anchor, round the loop unless open', () => {
    const two = pattern(2)
    expect(localTick(768.0, 768, two)).toBe(0)
    expect(localTick(778.0, 768, two)).toBe(10)
    expect(localTick(778.0 + 768, 768, two)).toBe(10)
    expect(localTick(-10.0, 0, two)).toBe(758)
    expect(localTick(778.0, 0, pattern(2, [], true))).toBe(778)
    expect(localTick(778.0, 768, pattern(2, [], true))).toBe(10)
    expect(localTick(758.0, 768, pattern(2, [], true))).toBe(-10)
    expect(passOf(1_151, 768, 384)).toBe(0)
    expect(passOf(1_152, 768, 384)).toBe(1)
    expect(passOf(383, 768, 384)).toBe(-1)
    expect(sinceAnchor(368.0, 384)).toBe(-16)
    // The first pass a note at 10 plays at or after a tick: this one while it hasn't passed, the next once it has.
    expect(firstPassAtOrAfter(394, 10, 768, 384)).toBe(0)
    expect(firstPassAtOrAfter(395, 10, 768, 384)).toBe(1)
    expect(firstPassAtOrAfter(-1_000, 10, 768, 384)).toBe(-1)
    expect(globalTickOf(10, 0, 768, 384)).toBe(394)
    expect(globalTickOf(10, 1, 768, 384)).toBe(1_162)
    expect(nextLoopStart(100.0, 768, 384)).toBe(384)
    expect(nextLoopStart(385.0, 768, 384)).toBe(1_152)
    expect(nextLoopStart(1_152.0, 768, 384)).toBe(1_152)
  })

  it('the position counts from the anchor', () => {
    const two = pattern(2)
    // Switched in at tick 384 (an odd bar): its bar 1 there, its bar 2 a bar on, its bar 1 again at 1152.
    expect(positionOf(384.0, two, 384)).toEqual({ bar: 1, beat: 1, bars: 2, fraction: 0 })
    expect(positionOf(100.0, two, 384)).toEqual({ bar: 1, beat: 1, bars: 2, fraction: 0 })
    expect(positionOf(384.0 + 384 + 192, two, 384)).toEqual({ bar: 2, beat: 3, bars: 2, fraction: 0.75 })
    expect(positionOf(1_152.0, two, 384)).toEqual({ bar: 1, beat: 1, bars: 2, fraction: 0 })
  })
})
