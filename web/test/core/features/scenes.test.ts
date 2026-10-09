// Port of core/src/test/kotlin/dev/arc/ep133/features/ScenesTest.kt
import { describe, expect, it } from 'vitest'
import { physicalPad } from '../../../src/core/features/padNotes'
import {
  ProjectPatterns,
  ProjectSeq,
  Seq,
  Timing,
  pattern,
  patternNote,
  projectPatterns,
  projectSeq,
  scene,
  type Pattern,
  type Scene,
} from '../../../src/core/features/pattern'
import { PatternRecorder } from '../../../src/core/features/patternRecorder'
import { Clip, SWITCH_TIMES, SceneErase, SceneOps, SwitchTime } from '../../../src/core/features/scenes'

const kick = pattern(1, [patternNote(0, 0, 24, null, 127, 3)])
const full = pattern(1, [patternNote(0, 0, 24)])

/** Every pattern of a bank with notes. */
const fullBank = (): Map<number, Pattern> => new Map(Array.from({ length: Seq.MAX_PATTERNS }, (_, i) => [i + 1, full]))

const sc = (...n: number[]): Scene => scene(n)

const ticks = (p: Pattern): number[] => p.notes.map((n) => n.tick)

const scenes = (n: number): Scene[] => Array.from({ length: n }, () => scene())

describe('ScenesTest', () => {
  it('a project starts with one scene of patterns 1 and empty banks', () => {
    const d = projectSeq()
    expect(d).toEqual(ProjectSeq.DEFAULT)
    expect(d.scenes).toEqual([sc(1, 1, 1, 1)])
    expect(d.scene).toBe(0)
    expect(d.banks).toEqual([new Map(), new Map(), new Map(), new Map()])
    expect(ProjectSeq.pattern(d, 2, 40)).toEqual(pattern())
    expect(ProjectSeq.selected(d, 3)).toBe(1)
    expect(ProjectSeq.playing(d)).toEqual(projectPatterns())
    expect(ProjectSeq.isEmpty(d)).toBe(true)
    expect(Seq.MAX_PATTERNS).toBe(99)
    expect(Seq.MAX_SCENES).toBe(99)
    // Blank patterns stay out of the banks; 1 to 99 scenes; the index held to them.
    expect(projectSeq([new Map([[1, pattern()]])], [], 5)).toEqual(d)
    expect(projectSeq([], scenes(120)).scenes.length).toBe(99)
    expect(projectSeq([], scenes(2), 7).scene).toBe(1)
    expect(ProjectSeq.withPattern(d, 1, 50, pattern(2)).banks[1]!.size).toBe(1)
    expect(ProjectSeq.isEmpty(ProjectSeq.withPattern(d, 1, 50, pattern(2)))).toBe(true)
    expect(ProjectSeq.withPattern(d, 1, 100, kick)).toBe(d)
  })

  it("playing and withPlaying go through the scene's slots", () => {
    const p = projectSeq([new Map([[1, kick]]), new Map([[2, pattern(2)]]), new Map(), new Map()], [sc(1, 2, 3, 4)])
    expect(ProjectSeq.playing(p)).toEqual(projectPatterns([kick, pattern(2), pattern(), pattern()]))
    expect(ProjectSeq.withPlaying(p, ProjectSeq.playing(p))).toBe(p)
    const edited = ProjectPatterns.with(ProjectPatterns.with(ProjectSeq.playing(p), 1, full), 0, pattern())
    const q = ProjectSeq.withPlaying(p, edited)
    expect(ProjectSeq.pattern(q, 1, 2)).toEqual(full)
    // A blank pattern leaves the bank.
    expect(q.banks[0]!.has(1)).toBe(false)
    expect(ProjectSeq.playing(q)).toEqual(edited)
    // Scenes sharing a slot share its pattern.
    const two = projectSeq([new Map([[1, kick]])], [sc(1, 1, 1, 1), sc(1, 2, 1, 1)], 1)
    const shared = ProjectSeq.withPlaying(two, ProjectPatterns.with(ProjectSeq.playing(two), 0, full))
    expect(ProjectPatterns.group(ProjectSeq.playing(SceneOps.selectScene(shared, 0)), 0)).toEqual(full)
    expect(ProjectSeq.isEmpty(shared)).toBe(false)
  })

  it('picking a pattern, held to 1 to 99', () => {
    const d = ProjectSeq.DEFAULT
    const p = SceneOps.selectPattern(d, 1, 5)
    expect(p.scenes).toEqual([sc(1, 5, 1, 1)])
    expect(ProjectSeq.selected(p, 1)).toBe(5)
    expect(ProjectSeq.selected(SceneOps.selectPattern(d, 0, 120), 0)).toBe(99)
    expect(SceneOps.selectPattern(d, 0, 0)).toBe(d)
    // Only the scene playing.
    const two = projectSeq([], [sc(1, 1, 1, 1), sc(2, 2, 2, 2)], 1)
    expect(SceneOps.selectPattern(two, 3, 7).scenes).toEqual([sc(1, 1, 1, 1), sc(2, 2, 2, 7)])
  })

  it('the next free pattern is the first after the one selected with no notes, round 1 to 99', () => {
    const d = ProjectSeq.DEFAULT
    expect(SceneOps.nextFree(d, 0)).toBe(2)
    const p = ProjectSeq.withPattern(ProjectSeq.withPattern(ProjectSeq.withPattern(d, 0, 2, full), 0, 3, full), 0, 4, pattern(4))
    // A pattern with only a length has no notes: free.
    expect(SceneOps.nextFree(p, 0)).toBe(4)
    expect(SceneOps.nextFree(p, 1)).toBe(2)
    // Round past 99.
    const end = SceneOps.selectPattern(ProjectSeq.withPattern(ProjectSeq.withPattern(d, 0, 98, full), 0, 99, full), 0, 97)
    expect(SceneOps.nextFree(end, 0)).toBe(1)
    // The one selected counts last: free only when nothing else is.
    const bank = fullBank()
    bank.delete(9)
    const nine = SceneOps.selectPattern(projectSeq([bank]), 0, 9)
    expect(SceneOps.nextFree(nine, 0)).toBe(9)
    // Every pattern with notes: the one selected.
    const all = SceneOps.selectPattern(projectSeq([fullBank()]), 0, 40)
    expect(SceneOps.nextFree(all, 0)).toBe(40)
  })

  it('picking a scene, held to those there are', () => {
    const p = projectSeq([], [sc(1, 1, 1, 1), sc(2, 2, 2, 2), sc(3, 3, 3, 3)])
    expect(SceneOps.selectScene(p, 2).scene).toBe(2)
    expect(SceneOps.selectScene(p, 10).scene).toBe(2)
    expect(SceneOps.selectScene(p, -1)).toBe(p)
    expect(ProjectSeq.selected(SceneOps.selectScene(p, 2), 0)).toBe(3)
  })

  it('a new scene goes at the end, each group on its next free pattern', () => {
    const p = ProjectSeq.withPattern(ProjectSeq.withPattern(ProjectSeq.DEFAULT, 0, 1, kick), 0, 2, full)
    const n = SceneOps.newScene(p)
    expect(n.scenes).toEqual([sc(1, 1, 1, 1), sc(3, 2, 2, 2)])
    expect(n.scene).toBe(1)
    expect(ProjectSeq.playing(n)).toEqual(projectPatterns())
    // From the first of three, it still goes at the end.
    const three = SceneOps.selectScene(SceneOps.newScene(n), 0)
    expect(SceneOps.newScene(three).scene).toBe(3)
    const most = projectSeq([], scenes(Seq.MAX_SCENES))
    expect(SceneOps.newScene(most)).toBe(most)
  })

  it('commit copies the patterns with notes into free ones, in a scene right after', () => {
    const c = pattern(2, [patternNote(96, 5, 24, 2, 127, 9)])
    const p = projectSeq([new Map([[1, kick]]), new Map([[1, pattern(2)]]), new Map([[3, c]]), fullBank()], [sc(1, 1, 3, 1), sc(5, 5, 5, 5)])
    const out = SceneOps.commit(p)
    // A copied into 2, C into 4; B empty and D with no free pattern share theirs.
    expect(out.scenes).toEqual([sc(1, 1, 3, 1), sc(2, 1, 4, 1), sc(5, 5, 5, 5)])
    expect(out.scene).toBe(1)
    // The copies' notes have no ids.
    expect(ProjectSeq.pattern(out, 0, 2)).toEqual(pattern(1, [patternNote(0, 0, 24)]))
    expect(ProjectSeq.pattern(out, 2, 4)).toEqual(pattern(2, [patternNote(96, 5, 24, 2)]))
    expect(ProjectSeq.pattern(out, 0, 1)).toEqual(kick)
    expect(ProjectPatterns.group(ProjectSeq.playing(out), 1)).toEqual(pattern(2))
    // The new scene plays what the old one did.
    expect(ProjectSeq.playing(out).groups.map(ticks)).toEqual(ProjectSeq.playing(p).groups.map(ticks))
    const most = projectSeq([], scenes(Seq.MAX_SCENES))
    expect(SceneOps.commit(most)).toBe(most)
  })

  it("clear empties the scene's patterns, delete takes an empty scene away", () => {
    const p = projectSeq([new Map([[1, pattern(2, kick.notes)], [2, full]])], [sc(1, 1, 1, 1), sc(2, 1, 1, 1)])
    const cleared = SceneOps.clearScene(p)
    // The length stays; another scene's pattern keeps its notes.
    expect(ProjectSeq.pattern(cleared, 0, 1)).toEqual(pattern(2))
    expect(ProjectSeq.pattern(cleared, 0, 2)).toEqual(full)
    expect(SceneOps.clearScene(cleared)).toBe(cleared)
    // Not empty, or the only scene: no delete.
    expect(SceneOps.deleteScene(p)).toBe(p)
    expect(SceneOps.deleteScene(ProjectSeq.DEFAULT)).toBe(ProjectSeq.DEFAULT)
    const three = projectSeq([new Map([[1, full], [3, full]])], [sc(1, 1, 1, 1), sc(2, 2, 2, 2), sc(3, 1, 1, 1)], 1)
    const d = SceneOps.deleteScene(three)
    expect(d.scenes).toEqual([sc(1, 1, 1, 1), sc(3, 1, 1, 1)])
    expect(d.scene).toBe(1)
    // The last one deleted: the index on the new last.
    const last = SceneOps.selectScene(SceneOps.newScene(ProjectSeq.withPattern(ProjectSeq.DEFAULT, 0, 1, full)), 1)
    const dl = SceneOps.deleteScene(last)
    expect(dl.scenes).toEqual([sc(1, 1, 1, 1)])
    expect(dl.scene).toBe(0)
    // ERASE + MAIN: DEL when it can, else CLR.
    expect(SceneOps.eraseScene(three)).toEqual({ seq: d, erase: SceneErase.DELETED })
    expect(SceneOps.eraseScene(p)).toEqual({ seq: cleared, erase: SceneErase.CLEARED })
    expect(SceneOps.eraseScene(ProjectSeq.DEFAULT)).toEqual({ seq: ProjectSeq.DEFAULT, erase: SceneErase.CLEARED })
  })

  it('a pattern copied and pasted into another group', () => {
    const a = pattern(2, [patternNote(0, 3, 24, null, 127, 5), patternNote(500, 4, 12, 1, 127, 6)], true)
    const p = SceneOps.selectPattern(ProjectSeq.withPlaying(ProjectSeq.DEFAULT, ProjectPatterns.with(projectPatterns(), 0, a)), 1, 3)
    const clip = SceneOps.copyPattern(p, 0)
    expect(clip).toEqual(Clip.PatternClip(pattern(2, [patternNote(0, 3, 24), patternNote(500, 4, 12, 1)])))
    const out = SceneOps.pastePattern(p, 1, clip)
    expect(ProjectSeq.pattern(out, 1, 3)).toEqual(clip.pattern)
    expect(ProjectPatterns.group(ProjectSeq.playing(out), 1)).toEqual(clip.pattern)
    // Over the pattern's own, length too.
    const over = SceneOps.pastePattern(ProjectSeq.withPattern(ProjectSeq.DEFAULT, 2, 1, pattern(8, kick.notes)), 2, clip)
    expect(ProjectSeq.pattern(over, 2, 1)).toEqual(clip.pattern)
  })

  it('a bar copied and pasted, none past the end', () => {
    const notes = [0, 100, 384, 500, 800].map((t) => patternNote(t, 1, 24, null, 127, t))
    const p = ProjectSeq.withPattern(ProjectSeq.withPattern(ProjectSeq.DEFAULT, 0, 1, pattern(2, notes)), 1, 1, pattern(1, [patternNote(10, 2, 24)]))
    const clip = SceneOps.copyBar(p, 0, 1)
    expect(clip).toEqual(Clip.BarClip([patternNote(0, 1, 24), patternNote(116, 1, 24)]))
    expect(SceneOps.copyBar(p, 0, 0).notes.map((n) => n.tick)).toEqual([0, 100])
    const b = SceneOps.pasteBar(p, 1, 0, clip)
    expect(ProjectSeq.pattern(b, 1, 1).notes).toEqual([patternNote(0, 1, 24), patternNote(116, 1, 24)])
    // Into A's first bar: the rest stay, past the end too.
    expect(ticks(ProjectSeq.pattern(SceneOps.pasteBar(p, 0, 0, clip), 0, 1))).toEqual([384, 500, 800, 0, 116])
    expect(ticks(ProjectSeq.pattern(SceneOps.pasteBar(p, 0, 1, clip), 0, 1))).toEqual([0, 100, 800, 384, 500])
    // B is a bar long: nothing past it.
    expect(SceneOps.pasteBar(p, 1, 1, clip)).toBe(p)
    expect(SceneOps.pasteBar(p, 1, -1, clip)).toBe(p)
  })

  it("a pad's notes pasted onto a pad in another group, cut to its length", () => {
    const a3 = physicalPad(0, 3)
    const b7 = physicalPad(1, 7)
    const a = pattern(2, [patternNote(0, 3, 24), patternNote(96, 3, 24, 2, 127, 4), patternNote(48, 4, 24), patternNote(500, 3, 12)])
    const b = pattern(1, [patternNote(10, 0, 24), patternNote(200, 7, 24, 5)])
    const p = ProjectSeq.withPattern(ProjectSeq.withPattern(ProjectSeq.DEFAULT, 0, 1, a), 1, 1, b)
    const clip = SceneOps.copyPad(p, a3)
    expect(clip).toEqual(Clip.PadClip([patternNote(0, 3, 24), patternNote(96, 3, 24, 2), patternNote(500, 3, 12)], 768))
    const out = SceneOps.pastePad(p, b7, clip)
    // B7's own notes (every pitch) go; the one at 500 is past B's bar.
    expect(ProjectSeq.pattern(out, 1, 1).notes).toEqual([patternNote(10, 0, 24), patternNote(0, 7, 24), patternNote(96, 7, 24, 2)])
    // Back onto A 3 itself: the same notes, at the end.
    expect(ProjectSeq.pattern(SceneOps.pastePad(p, a3, clip), 0, 1).notes).toEqual([...a.notes.filter((n) => n.offset !== 3), ...clip.notes])
  })

  it('every paste stops at the note cap', () => {
    const crowd = pattern(1, Array.from({ length: Seq.MAX_NOTES - 1 }, () => patternNote(0, 0, 1)))
    const p = ProjectSeq.withPattern(
      ProjectSeq.withPattern(ProjectSeq.DEFAULT, 1, 1, crowd),
      0,
      1,
      pattern(1, [patternNote(0, 5, 24), patternNote(96, 5, 24), patternNote(192, 5, 24)]),
    )
    const pad = SceneOps.pastePad(p, physicalPad(1, 7), SceneOps.copyPad(p, physicalPad(0, 5)))
    expect(ProjectSeq.pattern(pad, 1, 1).notes.length).toBe(Seq.MAX_NOTES)
    expect(ProjectSeq.pattern(pad, 1, 1).notes.filter((n) => n.offset === 7).map((n) => n.tick)).toEqual([0])
    const crowdBar = ProjectSeq.withPattern(ProjectSeq.DEFAULT, 1, 1, pattern(2, Array.from({ length: Seq.MAX_NOTES - 1 }, () => patternNote(400, 0, 1))))
    const bar = SceneOps.pasteBar(crowdBar, 1, 0, SceneOps.copyBar(p, 0, 0))
    expect(ProjectSeq.pattern(bar, 1, 1).notes.length).toBe(Seq.MAX_NOTES)
    const big = Clip.PatternClip(pattern(99, Array.from({ length: Seq.MAX_NOTES + 2 }, (_, i) => patternNote(i, 0, 1))))
    expect(ProjectSeq.pattern(SceneOps.pastePattern(ProjectSeq.DEFAULT, 0, big), 0, 1).notes.length).toBe(Seq.MAX_NOTES)
  })

  it('undo goes back through a pick, to the checkpoint whole', () => {
    const r = new PatternRecorder()
    const s0 = ProjectSeq.DEFAULT
    r.seq = s0
    const s1 = ProjectSeq.withPlaying(s0, r.setLength(ProjectSeq.playing(s0), 0, 2))
    r.seq = s1
    // A pick is no checkpoint and keeps them.
    const s2 = SceneOps.selectPattern(s1, 0, 5)
    r.seq = s2
    expect(r.canUndo).toBe(true)
    const s3 = ProjectSeq.withPlaying(s2, r.setLength(ProjectSeq.playing(s2), 0, 4))
    r.seq = s3
    expect(ProjectSeq.pattern(s3, 0, 5).bars).toBe(4)
    expect(r.undo(s3)).toEqual(s2)
    // Back to before the first edit: pattern 1 picked again, a bar long.
    expect(r.undo(s2)).toEqual(s0)
    expect(r.undo(s0)).toBeNull()
  })

  it('scene and paste edits are checkpoints of their own, and end the gestures going on', () => {
    const r = new PatternRecorder()
    const s0 = ProjectSeq.withPattern(ProjectSeq.DEFAULT, 0, 1, pattern(1, [patternNote(0, 3, 24)]))
    r.seq = s0
    const sa = ProjectSeq.withPlaying(s0, r.stepVelocity(ProjectSeq.playing(s0), 0, 0, Timing.SIXTEENTH, 50, 90))
    r.seq = sa
    const sb = r.editSeq(sa, SceneOps.pastePattern(sa, 1, SceneOps.copyPattern(sa, 0)))
    r.seq = sb
    // The same knob turned again after the paste: a checkpoint of its own.
    const sc = ProjectSeq.withPlaying(sb, r.stepVelocity(ProjectSeq.playing(sb), 0, 0, Timing.SIXTEENTH, 50, 80))
    r.seq = sc
    const sd = r.editSeq(sc, SceneOps.commit(sc))
    r.seq = sd
    expect(sd.scenes.length).toBe(2)
    // Nothing changed: no checkpoint, the very seq back.
    expect(r.editSeq(sd, SceneOps.deleteScene(sd))).toBe(sd)
    expect(r.undo(sd)).toEqual(sc)
    expect(r.undo(sc)).toEqual(sb)
    expect(r.undo(sb)).toEqual(sa)
    expect(r.undo(sa)).toEqual(s0)
    expect(r.undo(s0)).toBeNull()
  })

  it("a switch takes over at once, at the next bar line or at the pattern's end", () => {
    expect(SwitchTime.DEFAULT).toBe(SwitchTime.IMMEDIATE)
    expect(SWITCH_TIMES).toEqual(['now', 'bar', 'ptn'])
    expect(SwitchTime.of('ptn')).toBe(SwitchTime.PATTERN)
    expect(SwitchTime.of('song')).toBeNull()
    expect([100.2, 100.0, -3.5, -0.5].map((t) => SceneOps.switchTick(SwitchTime.IMMEDIATE, t, 384))).toEqual([101, 100, -3, 0])
    // A press exactly on a line switches there.
    expect([0.0, 1.0, 383.9, 384.0, 384.5, -10.0, 3840.0].map((t) => SceneOps.switchTick(SwitchTime.BAR, t, 768))).toEqual([0, 384, 384, 384, 768, 0, 3840])
    expect([0.0, 100.0, 768.0, 800.0].map((t) => SceneOps.switchTick(SwitchTime.PATTERN, t, 768))).toEqual([0, 768, 768, 1536])
    expect(SceneOps.switchTick(SwitchTime.PATTERN, 1153.0, 1152)).toBe(2304)
    expect(SceneOps.switchTick(SwitchTime.PATTERN, 1152.0, 1152)).toBe(1152)
  })
})
