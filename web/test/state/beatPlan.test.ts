// Port of app/src/test/kotlin/dev/arc/ep133/controller/BeatPlanTest.kt: beat cards as the controller works them
// (what a share sends, the sheet's plan and grids, and an import as one UNDO step). The same cases, in the same order.
// Web deltas: Weight is a string union ('GHOST' | 'NORMAL' | 'ACCENT'); BeatImportUi.card / .problems are
// beatCardOf(ui) / beatProblems(ui); [placed] pairs are [group, n] tuples; the names callback gives string | null,
// its map keyed by padKey; the test's `with` helper is withP (`with` is reserved in JS); the sequencer is compared
// with toEqual (plain data, as Kotlin's data class equals) and assertSame is toBe.
import { describe, expect, it } from 'vitest'
import { BeatCards, beatCard, cardSection, type BeatCard, type CardSection } from '../../src/core/features/beatCard'
import { padKey, physicalPad, type PhysicalPad } from '../../src/core/features/padNotes'
import { Pattern, ProjectSeq, Seq, Timing, pattern, patternNote, type PatternNote } from '../../src/core/features/pattern'
import { PatternRecorder } from '../../src/core/features/patternRecorder'
import { SceneOps } from '../../src/core/features/scenes'
import { ClaudeText } from '../../src/core/text/claudeText'
import { applyBeat, beatCardOf, beatGrid, beatImportUi, beatImported, beatProblems, beatShare, type BeatGridUi } from '../../src/state/beatPlan'

const kick = physicalPad(0, 9)
const names = new Map<number, string>([
  [padKey(kick), 'kick'],
  [padKey(physicalPad(0, 11)), 'snare'],
])
const nameOf = (p: PhysicalPad): string | null => names.get(padKey(p)) ?? null
const bar = Seq.TICKS_PER_BAR

const hit = (tick: number, offset = 9, velocity = 127): PatternNote => patternNote(tick, offset, 24, null, velocity)

const pat = (notes: PatternNote[], bars = 1): Pattern => pattern(bars, notes)

const withP = (seq: ProjectSeq, group: number, n: number, p: Pattern): ProjectSeq => ProjectSeq.withPattern(seq, group, n, p)

const card = (sections: CardSection[], o: { tempo?: number | null; swing?: number; name?: string | null } = {}): BeatCard =>
  beatCard(o.name ?? null, o.tempo ?? null, o.swing ?? 50, sections)

const section = (group: number, p: Pattern): CardSection => cardSection(group, null, p)

const read = (c: BeatCard) => BeatCards.read(BeatCards.write(c))

describe('BeatPlanTest', () => {
  // ---- sharing ----

  it("a share is the scene's patterns or a group's as a tidied card in a fenced block, or nothing without notes", () => {
    expect(beatShare(ProjectSeq.DEFAULT, null, 120.0, 50, nameOf)).toBeNull()
    expect(beatShare(ProjectSeq.DEFAULT, 0, 120.0, 50, nameOf)).toBeNull()
    let seq = withP(ProjectSeq.DEFAULT, 0, 1, pat([hit(0)]))
    seq = withP(seq, 2, 1, pat([hit(0, 11), hit(96, 11)], 2))
    const scene = beatShare(seq, null, 92.0, 50, nameOf)!
    expect(scene.subject).toBe('Arc beat S01')
    expect(scene.text.startsWith(ClaudeText.SHARE_PROMPT + '\n\n```\nARC BEAT 1\nname S01\ntempo 92\nswing 50\n# tidied')).toBe(true)
    expect(scene.text.endsWith('\n```\n')).toBe(true)
    // The blank groups (B, D) are left out; the pad's name is on its row.
    const c = BeatCards.read(scene.text).card!
    expect(c.sections.map((s) => s.group)).toEqual([0, 2])
    expect(scene.text).toContain('A7 kick')
    // One group: its own pattern, named by the number and the scene; a group with no notes shares nothing.
    const one = beatShare(seq, 2, 92.0, 50, nameOf)!
    expect(one.subject).toBe('Arc beat P01 S01')
    expect(BeatCards.read(one.text).card!.sections.map((s) => s.group)).toEqual([2])
    expect(beatShare(seq, 1, 92.0, 50, nameOf)).toBeNull()
    // The scene playing and the pattern picked: the second scene's own.
    const two = SceneOps.newScene(seq)
    expect(beatShare(two, null, 92.0, 50, nameOf)).toBeNull()
    expect(beatShare(withP(two, 1, 2, pat([hit(0)])), null, 92.0, 50, nameOf)!.subject).toBe('Arc beat S02')
  })

  it('the swing is kept only where every hit sits on it', () => {
    const seq = withP(ProjectSeq.DEFAULT, 0, 1, pat([hit(0), hit(24 + 6)]))
    // 1/16 swung 58%: the odd step plays 4 ticks late (24 + 4 = 28), so 30 is off the grid: the card is straight.
    expect(beatShare(seq, 0, 120.0, 58, nameOf)!.text).toContain('\nswing 50\n')
    const swung = withP(ProjectSeq.DEFAULT, 0, 1, pat([hit(0), hit(28)]))
    expect(beatShare(swung, 0, 120.0, 58, nameOf)!.text).toContain('\nswing 58\n')
  })

  // ---- the grid ----

  it('a grid has a row for each pad with notes, the keypad\'s order, lit by velocity', () => {
    const g = beatGrid(section(0, pat([hit(0, 9, 127), hit(96, 9, 100), hit(192, 9, 40), hit(0, 11, 127), hit(48, 6, 100)])), 50, nameOf, 4)
    expect(g.step).toBe(Timing.SIXTEENTH)
    expect(g.perBar).toBe(16)
    expect(g.goesTo).toBe(4)
    // The keypad goes 7 8 9 / 4 5 6 from the top: 7 (offset 9), 9 (offset 11), then 4 (offset 6).
    expect(g.rows.map((r) => r.pad.offset)).toEqual([9, 11, 6])
    expect(g.rows.map((r) => r.name)).toEqual(['kick', 'snare', null])
    expect(g.rows.map((r) => r.hits)).toEqual([3, 1, 1])
    const kicks = g.rows[0]!.cells
    expect(kicks.length).toBe(16)
    expect(kicks[0]).toBe('ACCENT')
    expect(kicks[4]).toBe('NORMAL')
    expect(kicks[8]).toBe('GHOST')
    expect(kicks[1]).toBeNull()
    expect(g.moreBars).toBe(0)
  })

  it('a long pattern shows its first two bars, and the rest as more bars', () => {
    const g = beatGrid(section(0, pat([hit(0), hit(bar * 3)], 4)), 50, nameOf, 1)
    expect(g.shownBars).toBe(2)
    expect(g.moreBars).toBe(2)
    expect(g.rows[0]!.cells.length).toBe(32)
    // The hit in bar 4 is a hit of the row all the same.
    expect(g.rows[0]!.hits).toBe(2)
  })

  it('a grid reads in 1/16T or 1/32 when the hits need it, and notes past the end are left out', () => {
    expect(beatGrid(section(0, pat([hit(0), hit(16)])), 50, nameOf, 1).step).toBe(Timing.SIXTEENTH_T)
    expect(beatGrid(section(0, pat([hit(0), hit(12)])), 50, nameOf, 1).step).toBe(Timing.THIRTY_SECOND)
    const g = beatGrid(section(0, pat([hit(0), hit(bar + 24)])), 50, nameOf, 1)
    expect(g.rows.map((r) => r.hits)).toEqual([1])
  })

  // ---- the sheet ----

  it('the sheet names where each section goes, the scene a card adds, and the tempo and swing it says', () => {
    const seq = withP(ProjectSeq.DEFAULT, 0, 2, pat([hit(0)]))
    const a = pat([hit(0), hit(96)], 2)
    const b = pat([hit(48, 11)])
    const one = beatImportUi(read(card([section(0, a)], { tempo: 92.0, swing: 50, name: 'Lazy' })), seq, 120.0, nameOf)
    expect(one.title).toBe('Lazy')
    expect(one.summary).toBe('Beat card · 2 bars · 1 pad · 2 hits')
    // A is on pattern 1 (with notes in 2): the next free after it is 3.
    expect(one.placed).toEqual([[0, 3]])
    expect(one.grids.map((g) => g.goesTo)).toEqual([3])
    expect(one.scene).toBeNull()
    expect(one.tempo).toBe(92)
    expect(one.tempoNow).toBe(120)
    expect(one.swing).toBeNull()
    expect(one.blocked).toBeNull()
    expect(beatProblems(one).length).toBe(0)
    // Three groups: a new scene (the second), the tempo is the same (hidden) and the swing is said.
    const swung = pat([hit(0), hit(28)])
    const three = beatImportUi(read(card([section(0, swung), section(1, b), section(3, b)], { tempo: 120.4, swing: 58 })), seq, 120.0, nameOf)
    expect(three.scene).toBe(1)
    expect(three.placed.length).toBe(3)
    expect(three.tempo).toBeNull()
    expect(three.swing).toBe(58)
    expect(three.title).toBe('Beat card')
    expect(three.summary).toBe('Beat card · 1 bar · 3 pads · 4 hits')
    // The bars are the longest group's, as the scene loops over it, not the groups' lengths added up.
    const mixed = card([section(0, pat([hit(0)])), section(1, pat([hit(0)], 2)), section(2, pat([hit(0)], 4))])
    expect(beatImportUi(read(mixed), seq, 120.0, nameOf).summary).toBe('Beat card · 4 bars · 3 pads · 3 hits')
    // No tempo on the card: nothing to offer.
    expect(beatImportUi(read(card([section(0, a)])), seq, 100.0, nameOf).tempo).toBeNull()
  })

  it("a card that can't be read lists its problems and a full group blocks the import", () => {
    const bad = BeatCards.read('ARC BEAT 1\n[A]\nA7 | X... |\n')
    const ui = beatImportUi(bad, ProjectSeq.DEFAULT, 120.0, nameOf)
    expect(beatCardOf(ui)).toBeNull()
    expect(ui.summary).toBeNull()
    expect(ui.blocked).toBe(ClaudeText.FIX_ERRORS)
    expect(beatProblems(ui).some((p) => p.error)).toBe(true)
    expect(ui.grids).toEqual([] as BeatGridUi[])
    let full = ProjectSeq.DEFAULT
    for (let n = 1; n <= Seq.MAX_PATTERNS; n++) full = withP(full, 1, n, pat([hit(0)]))
    const blocked = beatImportUi(read(card([section(0, pat([hit(0)])), section(1, pat([hit(0)]))])), full, 120.0, nameOf)
    expect(blocked.blocked).toBe('Group B has no free pattern.')
    expect(blocked.placed).toEqual([])
    expect(blocked.grids.map((g) => g.goesTo)).toEqual([null, null])
  })

  // ---- import ----

  it('a card of one group goes into the next free pattern and is picked, in one undo step', () => {
    const recorder = new PatternRecorder()
    let seq = withP(ProjectSeq.DEFAULT, 0, 1, pat([hit(0, 11)]))
    recorder.seq = seq
    const applied = applyBeat(seq, card([section(0, pat([hit(0), hit(96)], 2))]), recorder)
    expect(applied.fullGroup).toBeNull()
    expect(applied.placed).toEqual([[0, 2]])
    expect(applied.scene).toBeNull()
    expect(ProjectSeq.selected(applied.seq, 0)).toBe(2)
    expect(ProjectSeq.pattern(applied.seq, 0, 2).bars).toBe(2)
    expect(applied.seq.scenes.length).toBe(1)
    // The pattern that was there stays, in its slot.
    expect(Pattern.isEmpty(ProjectSeq.pattern(applied.seq, 0, 1))).toBe(false)
    expect(beatImported(applied)).toBe('Imported to A · 02. UNDO takes it back.')
    expect(recorder.canUndo).toBe(true)
    // One undo: the banks and the picks as they were.
    seq = applied.seq
    expect(recorder.undo(seq)).toEqual(withP(ProjectSeq.DEFAULT, 0, 1, pat([hit(0, 11)])))
    expect(recorder.canUndo).toBe(false)
  })

  it('a card of several groups adds a scene that plays them, in one undo step', () => {
    const recorder = new PatternRecorder()
    const seq = withP(ProjectSeq.DEFAULT, 2, 1, pat([hit(0)]))
    recorder.seq = seq
    const applied = applyBeat(seq, card([section(0, pat([hit(0)])), section(1, pat([hit(48, 11)]))]), recorder)
    expect(applied.scene).toBe(1)
    expect(applied.seq.scene).toBe(1)
    expect(applied.seq.scenes.length).toBe(2)
    // A and B on their new patterns; C and D, which the card hasn't, keep the numbers of the scene playing.
    expect(applied.seq.scenes[0]!.patterns).toEqual([1, 1, 1, 1])
    expect(applied.seq.scenes[1]!.patterns).toEqual([2, 2, 1, 1])
    expect(beatImported(applied)).toBe('Imported to scene S02. UNDO takes it back.')
    expect(recorder.undo(applied.seq)).toEqual(seq)
    expect(recorder.canUndo).toBe(false)
  })

  it('with 99 scenes the patterns are placed and picked in the scene playing', () => {
    let seq = ProjectSeq.DEFAULT
    for (let i = 0; i < Seq.MAX_SCENES - 1; i++) seq = SceneOps.newScene(seq)
    expect(seq.scenes.length).toBe(Seq.MAX_SCENES)
    const recorder = new PatternRecorder()
    recorder.seq = seq
    const applied = applyBeat(seq, card([section(0, pat([hit(0)])), section(1, pat([hit(0)]))]), recorder)
    expect(applied.scene).toBeNull()
    expect(applied.seq.scenes.length).toBe(Seq.MAX_SCENES)
    // The last scene played pattern 99 in every group: the next free after it wraps to 1.
    expect(applied.placed).toEqual([
      [0, 1],
      [1, 1],
    ])
    expect([0, 1, 2, 3].map((g) => ProjectSeq.selected(applied.seq, g))).toEqual([1, 1, 99, 99])
    expect(beatImported(applied)).toBe('Imported to A · 01, B · 01. UNDO takes it back.')
    expect(recorder.undo(applied.seq)).toEqual(seq)
  })

  it('a full group changes nothing and makes no undo step', () => {
    let seq = ProjectSeq.DEFAULT
    for (let n = 1; n <= Seq.MAX_PATTERNS; n++) seq = withP(seq, 0, n, pat([hit(0)]))
    const recorder = new PatternRecorder()
    recorder.seq = seq
    const applied = applyBeat(seq, card([section(0, pat([hit(0)]))]), recorder)
    expect(applied.fullGroup).toBe(0)
    expect(applied.seq).toBe(seq)
    expect(applied.placed.length).toBe(0)
    expect(recorder.canUndo).toBe(false)
  })
})
