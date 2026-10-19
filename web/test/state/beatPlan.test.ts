// Port of app/src/test/kotlin/dev/arc/ep133/controller/BeatPlanTest.kt: beat cards as the controller works them
// (what a share sends, the sheet's plan and grids, and an import as one UNDO step). The same cases, in the same order.
// Web deltas: Weight is a string union ('GHOST' | 'NORMAL' | 'ACCENT'); BeatImportUi.card / .problems are
// beatCardOf(ui) / beatProblems(ui); [placed] pairs are [group, n] tuples; the names callback gives string | null,
// its map keyed by padKey; the test's `with` helper is withP (`with` is reserved in JS); the sequencer is compared
// with toEqual (plain data, as Kotlin's data class equals) and assertSame is toBe. beatShare's named arguments are its
// ShareParts object, beatImportUi's blocks its BeatBlocks; soundSetOf and soundChoicesOf take the connected list as an
// argument (Kotlin's MirrorUi.sounds); the picks for silent pads are keyed by padKey.
// BeatFxUi's `same` is ClaudeText.isSame; padShapes takes pad keys.
// Web addition: "each silent pad starts with a sound Arc suggests" (suggestedSounds, which Kotlin tests only through
// BeatCardTest's suggestSound), on that test's card and library.
// Left for the steps that port them: the prompt share (PromptText), REPLACE (the projectScenes and replace asserts of
// "the sheet names where each section goes"), and the synth rows (the four synth tests and "the sheet and IMPORT plan the same sounds", which needs a synth line).
import { describe, expect, it } from 'vitest'
import { FactoryKit } from '../../src/core/features/factorySounds'
import { BeatCards, SoundStatus, beatCard, cardFx, cardPad, cardSection, cardSound, type BeatCard, type CardSection, type CardSound } from '../../src/core/features/beatCard'
import type { PadTarget } from '../../src/core/features/liveMirror'
import { OfflinePads, SoundSource, type OfflinePad } from '../../src/core/features/offlinePads'
import { chain, chainStep } from '../../src/core/features/chain'
import { FxSettings, FxType, comp } from '../../src/core/features/fxSettings'
import { padKey, physicalPad, type PhysicalPad } from '../../src/core/features/padNotes'
import { PadSettings, PlayMode } from '../../src/core/features/padSettings'
import { Pattern, ProjectSeq, Seq, Timing, pattern, patternNote, type PatternNote } from '../../src/core/features/pattern'
import type { SoundEntry } from '../../src/core/protocol/device'
import { PatternRecorder } from '../../src/core/features/patternRecorder'
import { SceneOps } from '../../src/core/features/scenes'
import { ClaudeText } from '../../src/core/text/claudeText'
import {
  applyBeat,
  beatCardOf,
  beatFxUi,
  beatGrid,
  beatImportUi,
  beatImported,
  beatProblems,
  beatShare,
  beatShareChain,
  chainForCard,
  chainSceneCount,
  isBefore,
  offlineRestore,
  padShapes,
  padShapingUi,
  pickedRow,
  pickedSounds,
  silentUi,
  soundChoicesOf,
  suggestedSounds,
  soundSet,
  soundSetOf,
  soundsUi,
  type BeatGridUi,
  type SoundChoices,
  type SoundSet,
} from '../../src/state/beatPlan'
import { emptyMirrorState, type MirrorUi } from '../../src/state/types'

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
    expect(scene.text.startsWith(ClaudeText.SHARE_PROMPT + '\n\n' + ClaudeText.EP133_LINE + '\n\n```\nARC BEAT 1\nname S01\ntempo 92\nswing 50\n# tidied')).toBe(true)
    expect(scene.text.endsWith('\n```\n')).toBe(true)
    // The EP-40 kit is named before the card; the EP-133's adds nothing.
    const riddim = beatShare(seq, null, 92.0, 50, nameOf, { kit: FactoryKit.EP40 })!
    expect(riddim.text.startsWith(ClaudeText.SHARE_PROMPT + '\n\nMy EP-133 plays the EP-40 Riddim factory kit.\n\n```\nARC BEAT 1\n')).toBe(true)
    expect(beatShare(seq, null, 92.0, 50, nameOf, { kit: FactoryKit.EP133 })!.text).toBe(scene.text)
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
    // REPLACE: the same card's one scene would be the project's only one, S01 (the project has 1 scene now).
    expect(three.replace?.scene).toBe(0)
    expect(three.projectScenes).toBe(1)
    // A card of one group adds no scene: no REPLACE row.
    expect(beatImportUi(read(card([section(0, a)])), seq, 120.0, nameOf).replace).toBeNull()
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

  // ---- scenes and the chain ----

  const track = `ARC BEAT 1
name Track
tempo 168
chain 1x2 2 1x2 3

scene Intro
[A] bars 1 step 1/16
A7 kick | X... .... X... .... |
[B] bars 2 step 1/16
B7 bass | X... .... .... X... | .... .... X... .... |

scene Drop
[A] bars 1 step 1/16
A7 kick | X.x. X.x. X.x. X.x. |
A9 snare | .... X... .... X..o |
[B] bars 2 step 1/16
B7 bass | X.x. ..x. X... x... | X.x. ..x. X... x... |

scene Breakdown
[B] bars 2 step 1/16
B8 bass | X... .... .... .... | .... .... .... .... |
`

  it('a card of scenes adds a scene for each of its own and sets the chain, in the one undo step', () => {
    const recorder = new PatternRecorder()
    // The project has a chain of its own, which the card's replaces.
    const seq = ProjectSeq.withChain(ProjectSeq.DEFAULT, chain([chainStep(0, 4)], false))
    recorder.seq = seq
    const applied = applyBeat(seq, BeatCards.read(track).card!, recorder)
    expect(applied.scene).toBe(1)
    expect(applied.scenes).toBe(3)
    expect(applied.chainSet).toBe(true)
    expect(applied.seq.scenes.length).toBe(4)
    expect(applied.seq.scene).toBe(1)
    expect(applied.seq.chain).toEqual(chain([chainStep(1, 2), chainStep(2), chainStep(1, 2), chainStep(3)], true))
    // Scene 3 has no A section: it plays scene 2's pattern.
    expect(applied.seq.scenes[3]!.patterns[0]).toBe(applied.seq.scenes[2]!.patterns[0])
    expect(beatImported(applied)).toBe('Imported to scenes S02\u2013S04. Chain set. UNDO takes it back.')
    // One UNDO: the scenes, the patterns and the chain as they were.
    expect(recorder.undo(applied.seq)).toEqual(seq)
    expect(recorder.canUndo).toBe(false)
  })

  it("with SET CHAIN off the project's chain stays and the toast does not say it was set", () => {
    const recorder = new PatternRecorder()
    const seq = ProjectSeq.withChain(ProjectSeq.DEFAULT, chain([chainStep(0, 4)], true))
    recorder.seq = seq
    const applied = applyBeat(seq, BeatCards.read(track).card!, recorder, false)
    expect(applied.chainSet).toBe(false)
    expect(applied.seq.chain).toEqual(seq.chain)
    expect(applied.seq.scenes.length).toBe(4)
    expect(beatImported(applied)).toBe('Imported to scenes S02\u2013S04. UNDO takes it back.')
  })

  it("the sheet lists a card's scenes with where each goes, a group left out as same, and the chain on the new scenes", () => {
    const ui = beatImportUi(BeatCards.read(track), ProjectSeq.DEFAULT, 120.0, nameOf)
    expect(ui.scenes.length).toBe(3)
    expect(ui.scenes.map((s) => s.name)).toEqual(['Intro', 'Drop', 'Breakdown'])
    expect(ui.scenes.map((s) => s.grids.length)).toEqual([2, 2, 1])
    expect(ui.grids.length).toBe(5)
    expect(ui.scenes.map((s) => s.index)).toEqual([1, 2, 3])
    // Groups A and B are in the card: the Breakdown leaves out A.
    expect(ui.scenes[2]!.parts.map(([g]) => g)).toEqual([0, 1])
    expect(ui.scenes[2]!.parts[0]![1]).toBeNull()
    const b = ui.scenes[2]!.parts[1]![1]!
    expect(ClaudeText.cardSceneTarget(3, ui.scenes[2]!.parts)).toBe(`new S04 \u00B7 A (same) \u00B7 B 0${b}`)
    expect(ui.chain?.steps).toEqual([chainStep(1, 2), chainStep(2), chainStep(1, 2), chainStep(3)])
    expect(ClaudeText.chainImport(ui.chain!.steps)).toBe('S02\u00D72 \u2192 S03 \u2192 S02\u00D72 \u2192 S04')
    expect(ui.scene).toBe(1)
    expect(ui.noRoom).toBe(false)
    expect(ui.blocked).toBeNull()
    // A card with no scene lines has none of it.
    const plain = beatImportUi(read(card([section(0, pat([hit(0)]))])), ProjectSeq.DEFAULT, 120.0, nameOf)
    expect(plain.scenes).toEqual([])
    expect(plain.chain).toBeNull()
  })

  it("with no room for the scenes the sheet says so, shows no chain, and the import picks the first scene's patterns", () => {
    let seq = ProjectSeq.DEFAULT
    for (let i = 0; i < Seq.MAX_SCENES - 2; i++) seq = SceneOps.newScene(seq)
    const ui = beatImportUi(BeatCards.read(track), seq, 120.0, nameOf)
    expect(ui.noRoom).toBe(true)
    expect(ui.chain).toBeNull()
    expect(ui.scenes.every((s) => s.index === null)).toBe(true)
    const recorder = new PatternRecorder()
    recorder.seq = seq
    const applied = applyBeat(seq, BeatCards.read(track).card!, recorder)
    expect(applied.scene).toBeNull()
    expect(applied.chainSet).toBe(false)
    expect(applied.seq.scenes.length).toBe(seq.scenes.length)
    // A and B each take the pattern of the card's first scene that has them.
    expect([ProjectSeq.selected(applied.seq, 0), ProjectSeq.selected(applied.seq, 1)]).toEqual([applied.placed[0]![1], applied.placed[1]![1]])
  })

  it('a chain is shared as a card of its scenes in the order they first play, with the passes', () => {
    let seq = withP(ProjectSeq.DEFAULT, 0, 1, pat([hit(0)]))
    seq = SceneOps.newScene(seq)
    seq = withP(seq, 0, 2, pat([hit(0), hit(96)]))
    seq = ProjectSeq.withChain(seq, chain([chainStep(1, 2), chainStep(0), chainStep(1, 2)], true))
    const share = beatShareChain(seq, 120.0, 50, nameOf)!
    expect(share.subject).toBe('Arc beat Chain')
    expect(share.text.startsWith(ClaudeText.SHARE_CHAIN_PROMPT + '\n\n' + ClaudeText.EP133_LINE + '\n\n```\nARC BEAT 1\nname Chain\ntempo 120')).toBe(true)
    const c = BeatCards.read(share.text).card!
    expect(c.scenes.length).toBe(2)
    // Scene 2 (S02) plays first, so it is the card's scene 1.
    expect(c.chain).toEqual([[1, 2], [2, 1], [1, 2]])
    // The kit is named in the chain's share too.
    expect(
      beatShareChain(seq, 120.0, 50, nameOf, { kit: FactoryKit.EP40 })!.text.startsWith(ClaudeText.SHARE_CHAIN_PROMPT + '\n\nMy EP-133 plays the EP-40 Riddim factory kit.\n\n```\n'),
    ).toBe(true)
    // No chain, nothing to share.
    expect(beatShareChain(ProjectSeq.DEFAULT, 120.0, 50, nameOf)).toBeNull()
  })

  it('a chain of more scenes than a card holds is cut before the scene that would not fit', () => {
    const steps = [...Array.from({ length: 20 }, (_, i) => chainStep(i)), chainStep(0)]
    const cut = chainForCard(steps)
    expect(cut.length).toBe(BeatCards.MAX_SCENES)
    expect(chainSceneCount(steps)).toBe(BeatCards.MAX_SCENES)
    // A scene already in the card can come again after the cut would have been.
    const again = chainForCard([...Array.from({ length: 16 }, (_, i) => chainStep(i)), chainStep(3), chainStep(17)])
    expect(again.length).toBe(17)
    expect(chainSceneCount([chainStep(0), chainStep(2), chainStep(0), chainStep(5)])).toBe(3)
  })

  // ---- sounds ----

  it('a share has a sound line for each pad it uses, and the sound list after the closing fence when asked', () => {
    const seq = withP(ProjectSeq.DEFAULT, 0, 1, pat([hit(0), hit(96, 11)]))
    const sounds = (pad: PhysicalPad): CardSound | null => {
      const p = pads.get(padKey(pad))
      return p === undefined ? null : cardSound(p[0], p[1])
    }
    const plain = beatShare(seq, 0, 120.0, 50, nameOf, { sounds })!
    const c = BeatCards.read(plain.text).card!
    expect(c.sections[0]!.sounds).toEqual(new Map([[9, cardSound(12, 'Kick dusty')], [11, cardSound(300, 'Rim')]]))
    expect(plain.text.endsWith('\n```\n')).toBe(true)
    // With the list: a blank line after the fence, the header, and the sounds in slot order; the card reads the same.
    const list = soundSet(ClaudeText.SOUNDS_FROM_LAST_READ, new Map([[300, 'Rim'], [12, 'Kick dusty']]))
    const full = beatShare(seq, 0, 120.0, 50, nameOf, { sounds, list })!
    expect(full.text).toBe(plain.text + '\n' + ClaudeText.soundListHeader(ClaudeText.SOUNDS_FROM_LAST_READ) + '\n12 Kick dusty\n300 Rim\n')
    expect(BeatCards.read(full.text).card).toEqual(c)
    // A pad with no known sound gets no line.
    expect(BeatCards.read(beatShare(seq, 0, 120.0, 50, nameOf)!.text).card!.sections[0]!.sounds).toEqual(new Map())
  })

  it("the sounds Arc knows are the EP-133's while connected, and the view's list offline", () => {
    expect(soundSetOf(null, [])).toBeNull()
    expect(soundSetOf(mirror(), [])).toBeNull()
    const connected = soundSetOf(mirror(), entries([1, 'Kick'], [2, 'Snare']))!
    expect(connected.source).toBe(ClaudeText.SOUNDS_FROM_DEVICE)
    expect(connected.names).toEqual(new Map([[1, 'Kick'], [2, 'Snare']]))
    expect(connected.size).toBe(2)
    const device = entries([5, 'Kick'])
    const factory = entries([1, 'Pack kick'], [2, 'Pack snare'], [3, 'Pack hat'])
    const offline = (base: SoundSource, d: SoundEntry[] | null = device, f: SoundEntry[] | null = factory) =>
      soundSetOf(mirror({ offline: 'Last seen', offlineSounds: { base, device: d, factory: f, unavailable: new Set() } }), [])
    const last = offline(SoundSource.DEVICE)!
    expect([last.source, last.names]).toEqual([ClaudeText.SOUNDS_FROM_LAST_READ, new Map([[5, 'Kick']])])
    expect(offline(SoundSource.FACTORY)!.source).toBe(ClaudeText.SOUNDS_FROM_FACTORY)
    expect(offline(SoundSource.FACTORY)!.size).toBe(3)
    expect(offline(SoundSource.FACTORY, device, null)).toBeNull()
    expect(soundSetOf(mirror({ offline: 'Factory sounds' }), [])).toBeNull()
  })

  it("the sheet's sound rows are the card's lines matched to the sounds, with the old names", () => {
    const sections = cardSection(0, null, pat([hit(0), hit(96, 11)]), new Map([[9, cardSound(12, 'Micro kick')], [11, cardSound(300, 'Rim dusty')], [0, cardSound(40, 'Hat')]]))
    const c = card([sections])
    const set = soundSet(ClaudeText.SOUNDS_FROM_DEVICE, new Map([[12, 'Micro kick'], [40, 'Hat'], [77, 'Other']]))
    const current = new Map([[padKey(micro), 5], [padKey(physicalPad(0, 0)), 40]])
    const ui = soundsUi(c, set, (p) => current.get(padKey(p)) ?? null, (p) => (padKey(p) === padKey(micro) ? 'Kick dusty' : null), false, 3)!
    expect(ui.project).toBe(3)
    expect(ui.offline).toBe(false)
    // Keypad order: 7 (offset 9), 9 (offset 11), then . (offset 0).
    expect(ui.rows.map((r) => r.pad)).toEqual([micro, rim, physicalPad(0, 0)])
    expect(ui.rows.map((r) => r.pick.status)).toEqual([SoundStatus.CHANGE, SoundStatus.MISSING, SoundStatus.SAME])
    expect(ui.rows.map((r) => r.oldName)).toEqual(['Kick dusty', null, null])
    // Only the change can be ticked.
    expect(ui.changes.map((r) => r.pad)).toEqual([micro])
    // No sounds known at all: every line is missing. A card without sound lines has no block.
    expect(soundsUi(c, null, () => null, nameOf, true, null)!.rows.map((r) => r.pick.status)).toEqual(Array(3).fill(SoundStatus.MISSING))
    expect(soundsUi(card([section(0, pat([hit(0)]))]), set, () => null, nameOf, false, 1)).toBeNull()
    // The sheet carries them.
    const sheet = beatImportUi(read(c), ProjectSeq.DEFAULT, 120.0, nameOf, { sounds: (it) => soundsUi(it, set, () => null, nameOf, false, 2) })
    expect(sheet.sounds!.rows.length).toBe(3)
    expect(beatImportUi(read(c), ProjectSeq.DEFAULT, 120.0, nameOf).sounds).toBeNull()
  })

  it('the factory pack names the sounds the EP-133 lists unnamed, in the sound set and the sheet', () => {
    const pack = new Map([[12, 'KICK DEEP'], [200, 'HH CLOSED'], [201, '201.pcm']])
    const connected = entries([12, '012.pcm'], [200, '200.pcm'], [201, '201.pcm'], [5, 'Mine'])
    expect(soundSetOf(mirror(), connected, pack)!.names).toEqual(new Map([[12, 'KICK DEEP'], [200, 'HH CLOSED'], [201, '201.pcm'], [5, 'Mine']]))
    expect(soundSetOf(mirror(), connected)!.names).toEqual(new Map([[12, '012.pcm'], [200, '200.pcm'], [201, '201.pcm'], [5, 'Mine']]))
    const offline = mirror({ offline: 'Last seen', offlineSounds: { base: SoundSource.DEVICE, device: entries([200, '200.pcm']), factory: entries([200, 'HH CLOSED']), unavailable: new Set() } })
    const set = soundSetOf(offline, [], pack)!
    expect([set.source, set.names]).toEqual([ClaudeText.SOUNDS_FROM_LAST_READ, new Map([[200, 'HH CLOSED']])])
    // With the names, a card's line is found; without them it is taken by its slot, unverified, and the row says what the card called it.
    const c = card([cardSection(0, null, pat([hit(0)]), new Map([[9, cardSound(200, 'HH CLOSED')], [11, cardSound(201, 'SNARE')], [0, cardSound(201, '201.pcm')], [3, cardSound(5, 'Mine')]]))])
    const rows = (s: SoundSet | null) => soundsUi(c, s, () => null, nameOf, false, 1)!.rows
    // Keypad order: 7, 9, 1, then . (offsets 9, 11, 3, 0). Slot 201 is unnamed in the pack too.
    const named = rows(soundSetOf(mirror(), connected, pack))
    expect(named.map((r) => r.pick.unverified)).toEqual([false, true, false, true])
    expect(named.map((r) => r.cardSays)).toEqual([null, 'SNARE', null, null])
    const bare = rows(soundSetOf(mirror(), connected))
    expect(bare.map((r) => r.pick.unverified)).toEqual([true, true, false, true])
    // The card's name is only quoted where it differs from what the row shows.
    expect(bare.map((r) => r.cardSays)).toEqual(['HH CLOSED', 'SNARE', null, null])
    expect(bare.map((r) => r.pick.status)).toEqual(Array(4).fill(SoundStatus.CHANGE))
  })

  it('the hint to share the sound list shows when every sound line is missing', () => {
    const c = card([cardSection(0, null, pat([hit(0)]), new Map([[9, cardSound(301, 'Rim')], [11, cardSound(410, null)]]))])
    const set = soundSet(ClaudeText.SOUNDS_FROM_DEVICE, new Map([[12, 'Kick'], [301, 'Rim']]))
    expect(soundsUi(c, soundSet(ClaudeText.SOUNDS_FROM_DEVICE, new Map([[12, 'Kick']])), () => null, nameOf, false, 1)!.noneFound).toBe(true)
    expect(soundsUi(c, null, () => null, nameOf, false, 1)!.noneFound).toBe(true)
    // One found is enough to leave it out.
    expect(soundsUi(c, set, () => null, nameOf, false, 1)!.noneFound).toBe(false)
  })

  // ---- silent pads ----

  it('a share names the pads it uses that have no sound, once the pads are known, in one comment after the header', () => {
    const held = new Map([[padKey(micro), 12]])
    const heldOf = (pad: PhysicalPad): number | null => held.get(padKey(pad)) ?? null
    const sounds = (pad: PhysicalPad): CardSound | null => {
      const slot = heldOf(pad)
      return slot === null ? null : cardSound(slot, 'Kick dusty')
    }
    const shared = beatShare(melody(), null, 120.0, 50, nameOf, { sounds, held: heldOf, padsKnown: true })!
    const lines = shared.text.split('\n')
    expect(lines[lines.indexOf('swing 50') + 1]).toBe('# no sound on: C7 D7')
    // The card reads the same with it.
    const c = BeatCards.read(shared.text)
    expect(c.problems).toEqual([])
    expect(BeatCards.silentPads(c.card!, heldOf, true)).toEqual([c7, d7])
    // Pads not read yet: nothing is said. A pad with a sound line isn't named.
    expect(beatShare(melody(), null, 120.0, 50, nameOf, { sounds, held: heldOf, padsKnown: false })!.text).not.toContain('no sound on')
    const all = beatShare(melody(), null, 120.0, 50, nameOf, { held: () => 1, padsKnown: true })!
    expect(all.text).not.toContain('no sound on')
    // A group's share names only its own pads.
    expect(beatShare(melody(), 3, 120.0, 50, nameOf, { held: () => null, padsKnown: true })!.text).toContain('# no sound on: D7\n')
  })

  it('the silent pads block has a row for each pad with its notes, and none when the pads are not known or all have a sound', () => {
    const m = melody()
    const c = BeatCards.read(BeatCards.write(BeatCards.fromPatterns(null, 120.0, 50, [2, 3, 0].map((g) => cardSection(g, null, ProjectSeq.pattern(m, g, 1)))))).card!
    const choices: SoundChoices = { source: SoundSource.DEVICE, entries: [{ slot: 512, name: 'PIANO', size: 0 }], unavailable: new Set(), names: new Map([[512, 'PIANO']]) }
    const held = (pad: PhysicalPad): number | null => (padKey(pad) === padKey(micro) ? 12 : null)
    const ui = silentUi(c, held, true, choices, false, 3)!
    expect(ui.rows.map((r) => r.pad)).toEqual([c7, d7])
    expect(ui.rows.map((r) => r.notes)).toEqual([3, 2])
    expect(ui.project).toBe(3)
    expect(ui.offline).toBe(false)
    expect(silentUi(c, held, false, choices, false, 3)).toBeNull()
    expect(silentUi(c, () => 1, true, choices, false, 3)).toBeNull()
    // No sound list known: the rows stay, without a way to pick.
    expect(silentUi(c, held, true, null, true, null)!.choices).toBeNull()
    // The sheet carries it, and a card that isn't readable has none.
    expect(beatImportUi(read(c), ProjectSeq.DEFAULT, 120.0, nameOf, { silent: (it) => silentUi(it, held, true, choices, false, 3) }).silent!.rows.length).toBe(2)
    expect(beatImportUi(read(c), ProjectSeq.DEFAULT, 120.0, nameOf).silent).toBeNull()
  })

  it('each silent pad starts with a sound Arc suggests, a different one each, from the sounds it can play', () => {
    const library = new Map([
      [9, 'KICK 909'], [12, 'Kick 808'], [101, 'SNARE TIGHT'], [202, 'HH CLOSED'], [203, 'HH OPEN'], [312, 'SHAKER'], [340, 'COWBELL'],
      [401, 'BASS SUB'], [512, 'PIANO'], [513, 'LEAD SAW'], [600, '601.pcm'], [615, 'horn skank amin'], [830, 'jammy bass a 85'],
    ])
    const r = BeatCards.read(
      'ARC BEAT 1\n[A]\nA3 shaker | .o.o .o.o .o.o .o.o |\nA5 open hat | .... .... .... ..x. |\nA6 | x... .... .... .... |\n' +
        '[B]\nnotes\nB7 at 1.1.1 note F1\n[C]\nC7 chords | x... .... .... .... |\n[D]\nnotes\nD7 at 1.1.1 note C5\n',
    )
    const c = r.card!
    const choices = (unavailable: number[] = []): SoundChoices => ({
      source: SoundSource.DEVICE,
      entries: [...library].map(([slot, name]) => ({ slot, name, size: 0 })),
      unavailable: new Set(unavailable),
      names: library,
    })
    const silent = (ch: SoundChoices | null) => silentUi(c, () => null, true, ch, false, 1)!
    const at = (g: number, o: number) => padKey(physicalPad(g, o))
    // By the row's name, its kind, or its notes; A6 has nothing to go by.
    expect(suggestedSounds(silent(choices()), c, r.names!, FactoryKit.EP133)).toEqual(
      new Map([[at(0, 7), 203], [at(0, 5), 312], [at(1, 9), 401], [at(2, 9), 615], [at(3, 9), 512]]),
    )
    // A sound not available to play is passed over, and one taken by an earlier row goes to the next.
    const without = suggestedSounds(silent(choices([615])), c, r.names!, FactoryKit.EP133)
    expect([without.get(at(2, 9)), without.get(at(3, 9))]).toEqual([512, 513])
    // With the EP-40 kit, chords look among its chord stabs.
    expect(suggestedSounds(silent(choices([615])), c, r.names!, FactoryKit.EP40).get(at(2, 9))).toBe(600)
    // No sound list known: nothing to suggest.
    expect(suggestedSounds(silent(null), c, r.names!, FactoryKit.EP133).size).toBe(0)
    // The sheet suggests them by the card's row names, with the kit it is given.
    const sheet = beatImportUi(r, ProjectSeq.DEFAULT, 120.0, nameOf, { silent: () => silentUi(c, () => null, true, choices([615]), false, 1), kit: FactoryKit.EP40 })
    expect(sheet.silent!.suggested.get(at(2, 9))).toBe(600)
    expect(beatImportUi(r, ProjectSeq.DEFAULT, 120.0, nameOf, { silent: () => silent(choices()) }).silent!.suggested.get(at(0, 5))).toBe(312)
  })

  it('the sounds to pick from are the ones the sound rows choose from, named as the sound set names them', () => {
    const pack = new Map([[12, 'KICK DEEP']])
    const connected = entries([12, '012.pcm'], [512, 'PIANO'])
    const c = soundChoicesOf(mirror(), connected, pack)!
    expect(c.source).toBe(SoundSource.DEVICE)
    expect(c.names).toEqual(soundSetOf(mirror(), connected, pack)!.names)
    expect(c.entries.map((e) => e.slot)).toEqual([12, 512])
    expect(soundChoicesOf(null, [])).toBeNull()
    expect(soundChoicesOf(mirror(), [])).toBeNull()
    // Offline: the view's list, the last read's with the slots Arc has no audio for, or the factory pack's.
    const device = entries([5, 'Kick'], [6, 'Snare'])
    const factory = entries([1, 'Pack kick'], [2, 'Pack snare'], [3, 'Pack hat'])
    const off = mirror({ offline: 'Last seen', offlineSounds: { base: SoundSource.DEVICE, device, factory, unavailable: new Set([6]) } })
    const last = soundChoicesOf(off, [])!
    expect([last.source, last.unavailable]).toEqual([SoundSource.DEVICE, new Set([6])])
    expect(last.names).toEqual(soundSetOf(off, [])!.names)
    const pk = soundChoicesOf(mirror({ ...off, offlineSounds: { base: SoundSource.FACTORY, device, factory, unavailable: new Set([6]) } }), [])!
    expect([pk.source, pk.unavailable]).toEqual([SoundSource.FACTORY, new Set()])
    expect(pk.entries.length).toBe(3)
    expect(soundChoicesOf(mirror({ offline: 'Factory sounds' }), [])).toBeNull()
    expect(soundChoicesOf(mirror({ ...off, offlineSounds: { base: SoundSource.FACTORY, device, factory: null, unavailable: new Set() } }), [])).toBeNull()
  })

  it('a picked sound is a sound row that changes the silent pad from no sound, and an extra pick for IMPORT', () => {
    const row = pickedRow(d7, 512, 'PIANO')
    expect(row.changes).toBe(true)
    expect(row.picked).toBe(true)
    expect(row.pick.status).toBe(SoundStatus.CHANGE)
    expect(row.pick.slot).toBe(512)
    expect(row.pick.name).toBe('PIANO')
    expect(row.oldName).toBe(ClaudeText.NO_SOUND)
    expect(row.pick.unverified).toBe(false)
    expect(row.cardSays).toBeNull()
    // A sound the EP-133 lists unnamed is used by its slot, as a card's line would be.
    const unnamed = pickedRow(d7, 512, '512.pcm')
    expect(unnamed.pick.unverified).toBe(true)
    expect(unnamed.cardSays).toBeNull()
    // IMPORT matches the picks to the sounds as they are then: a slot no longer listed is left out, as is a pad that has it already.
    const names = new Map([[512, 'PIANO'], [515, 'RHODES']])
    const picks = pickedSounds(new Map([[padKey(d7), 512], [padKey(c7), 515], [padKey(micro), 999]]), names, (p) => (padKey(p) === padKey(c7) ? 515 : null))
    expect(picks.map((p) => p.pad)).toEqual([d7])
    expect(picks.map((p) => p.status)).toEqual([SoundStatus.CHANGE])
    expect(picks[0]!.slot).toBe(512)
    expect(picks[0]!.currentSlot).toBeNull()
  })

  it("taking the sounds back offline restores each pad's change as it was, or drops it, never a recording gone to Takes", () => {
    const a: PadTarget = { project: 1, group: 0, pad: 1, slot: 10 }
    const b: PadTarget = { project: 1, group: 0, pad: 2, slot: 11 }
    const c: PadTarget = { project: 1, group: 0, pad: 3, slot: 12 }
    const change = (project: number, group: number, pad: number, slot: number, name: string, source: SoundSource, file?: string): OfflinePad =>
      file === undefined ? { project, group, pad, slot, name, source } : { project, group, pad, slot, name, source, file }
    const oldA = change(1, 0, 1, 20, 'Old A', SoundSource.DEVICE)
    const recorded = change(1, 0, 3, 0, 'Take', SoundSource.RECORDED, 'take.wav')
    const before: OfflinePads = { list: [oldA, recorded] }
    // The import replaced all three pads' changes; a fourth change of the user's came after.
    const other = change(1, 1, 1, 9, 'Other', SoundSource.DEVICE)
    const after: OfflinePads = {
      list: [change(1, 0, 1, 31, 'New A', SoundSource.FACTORY), change(1, 0, 2, 32, 'New B', SoundSource.FACTORY), change(1, 0, 3, 33, 'New C', SoundSource.FACTORY), other],
    }
    const restored = offlineRestore(after, before, [a, b, c])
    expect(OfflinePads.at(restored, 1, 0, 1)).toEqual(oldA)
    expect(OfflinePads.at(restored, 1, 0, 2)).toBeNull()
    expect(OfflinePads.at(restored, 1, 0, 3)).toBeNull()
    expect(OfflinePads.at(restored, 1, 1, 1)).toEqual(other)
    expect(OfflinePads.size(restored)).toBe(2)
  })

  it("UNDO is the import's when it goes back to the sequencer before it, and not when an edit came between", () => {
    const recorder = new PatternRecorder()
    const seq = withP(ProjectSeq.DEFAULT, 0, 1, pat([hit(0, 11)]))
    recorder.seq = seq
    const applied = applyBeat(seq, card([section(0, pat([hit(0)]))]), recorder)
    // A later edit of the banks: its undo is not the import's.
    recorder.seq = applied.seq
    const edited = recorder.editSeq(applied.seq, withP(applied.seq, 1, 1, pat([hit(0)])))
    expect(isBefore(recorder.undo(edited)!, seq)).toBe(false)
    expect(isBefore(recorder.undo(applied.seq)!, seq)).toBe(true)
  })

  // ---- FX and pad shaping ----

  it("a share carries the project's FX and each used pad's settings, and nothing when they are the defaults", () => {
    const seq = withP(ProjectSeq.DEFAULT, 0, 1, pat([hit(0), hit(96, 11)]))
    const plain = beatShare(seq, 0, 120.0, 50, nameOf, { fx: FxSettings.DEFAULT, pads: () => PadSettings.DEFAULT })!.text
    expect(plain.includes('\nfx ') || plain.includes('\npad ')).toBe(false)
    const fx = FxSettings.of({ type: FxType.DISTORTION, x: 0.55, y: 0.5, sends: [0.45, 0.3, 0, 0], comp: comp({ on: true, x: 0.6, y: 0.15 }) })
    const shaped = new Map([
      [padKey(kick), { ...PadSettings.DEFAULT, pitch: -2.0, level: 80 }],
      [padKey(physicalPad(0, 11)), { ...PadSettings.withMode(PadSettings.DEFAULT, PlayMode.KEY), release: 20 }],
    ])
    const text = beatShare(seq, 0, 120.0, 50, nameOf, { fx, pads: (p) => shaped.get(padKey(p)) ?? null })!.text
    const c = BeatCards.read(text).card!
    expect(c.fx!.type).toBe(FxType.DISTORTION)
    expect(c.fx!.sends).toEqual(new Map([[0, Math.fround(0.45)], [1, Math.fround(0.3)]]))
    expect(c.fx!.comp!.on).toBe(true)
    const padLines = c.sections[0]!.pads
    expect(padLines.get(9)).toEqual(cardPad({ pitch: -2.0, level: 80 }))
    expect(padLines.get(11)).toEqual(cardPad({ release: 20, mode: PlayMode.KEY }))
    // The share's FX come before the first section, as the spec has them.
    const at = text.indexOf('\nfx distortion')
    expect(at >= 1 && at < text.indexOf('[A')).toBe(true)
  })

  it('the FX block has a row for each kind the card sets, and says so when the project has it already', () => {
    const now = FxSettings.of({ type: FxType.REVERB, x: 0.5, y: 0.5, sends: [0.5, 0, 0, 0] })
    const c: BeatCard = { ...card([section(0, pat([hit(0)]))]), fx: cardFx({ type: FxType.DISTORTION, x: 0.55, y: 0.4, sends: new Map([[0, 0.5]]), comp: comp({ on: false }) }) }
    const ui = beatFxUi(c, now)!
    expect(ui.rows.map((r) => r.label)).toEqual(['Effect', 'Sends', 'Comp'])
    // The sends A 50% say the same; the comp is off already: only the effect changes.
    expect(ui.rows.map((r) => ClaudeText.isSame(r))).toEqual([false, true, true])
    expect(ui.changes).toBe(true)
    expect(ui.rows[0]!.old).toBe('REVERB \u00B7 SIZE 50% \u00B7 FLAT')
    expect(ui.rows[0]!.new).toBe('DISTORTION \u00B7 DRIVE 13x \u00B7 LP 20')
    // Everything the card says is set already: the block stays, with nothing to apply.
    const same = beatFxUi({ ...c, fx: cardFx({ sends: new Map([[0, 0.5]]) }) }, now)!
    expect(same.changes).toBe(false)
    // No FX line, no block; the sheet carries it.
    expect(beatFxUi(card([section(0, pat([hit(0)]))]), now)).toBeNull()
    expect(beatImportUi(read(c), ProjectSeq.DEFAULT, 120.0, nameOf, { fx: (it) => beatFxUi(it, now) }).fx!.rows.length).toBe(3)
    expect(beatImportUi(read(c), ProjectSeq.DEFAULT, 120.0, nameOf).fx).toBeNull()
  })

  it("the pad shaping rows are the card's pad lines in keypad order, starting from the defaults when a new sound goes on", () => {
    const shaped = { ...PadSettings.DEFAULT, pitch: 2.0 }
    const snare = physicalPad(0, 11)
    const c = card([
      cardSection(0, null, pat([hit(0)]), new Map(), new Map([[11, cardPad({ pitch: 2.0, release: 40, mode: PlayMode.KEY })], [9, cardPad({ pitch: 2.0 })], [0, cardPad({ level: 90 })]])),
    ])
    const a0 = physicalPad(0, 0)
    const ui = padShapingUi(c, (p) => (padKey(p) === padKey(kick) ? shaped : null), (p) => padKey(p) !== padKey(a0), nameOf, false)!
    // Keypad order: 7 (offset 9), 9 (offset 11), then . (offset 0).
    expect(ui.rows.map((r) => r.pad)).toEqual([kick, snare, a0])
    expect(ui.rows.map((r) => r.name)).toEqual(['kick', 'snare', null])
    const [k, sn, none] = ui.rows as [typeof ui.rows[0], typeof ui.rows[0], typeof ui.rows[0]]
    // A7 has pitch +2 already; A9 changes pitch, release and mode.
    expect(k.parts(false)).toEqual([])
    expect(k.changes(false)).toBe(false)
    expect(sn.parts(false).map((p) => p.name)).toEqual(['Pitch', 'Release', 'Mode'])
    expect(sn.changes(false)).toBe(true)
    // A new sound resets the pad: its row starts from the defaults, so A7's pitch is a change then.
    expect(k.parts(true).map((p) => p.name)).toEqual(['Pitch'])
    expect(k.changes(true)).toBe(true)
    // A pad with no sound can't be shaped, unless a sound is going onto it.
    expect(none.changes(false)).toBe(false)
    expect(none.changes(true)).toBe(true)
    expect(none.after(true)).toEqual({ ...PadSettings.DEFAULT, level: 90 })
    expect(padShapingUi(card([section(0, pat([hit(0)]))]), () => null, () => true, nameOf, true)).toBeNull()
    // IMPORT shapes the ticked pads, in section and keypad order.
    expect(padShapes(c, new Set([padKey(snare)]))).toEqual([[snare, cardPad({ pitch: 2.0, release: 40, mode: PlayMode.KEY })]])
    expect(padShapes(c, new Set([padKey(snare), padKey(kick)])).map(([p]) => p.offset)).toEqual([9, 11])
    expect(padShapes(c, new Set())).toEqual([])
    expect(beatImported({ seq: ProjectSeq.DEFAULT, placed: [[0, 2]], scene: null, fullGroup: null, scenes: 0, chainSet: false }, 0, 0, true)).toBe('Imported to A \u00B7 02. FX applied. UNDO takes it back.')
  })
})

// ---- sounds ----

function entries(...e: [number, string][]): SoundEntry[] {
  return e.map(([slot, name]) => ({ slot, name, size: 0 }))
}

const mirror = (o: Partial<MirrorUi> = {}): MirrorUi => ({ state: emptyMirrorState(), loading: false, error: null, offline: null, ...o })

const micro = physicalPad(0, 9)
const rim = physicalPad(0, 11)
const pads = new Map<number, [number, string]>([
  [padKey(micro), [12, 'Kick dusty']],
  [padKey(physicalPad(0, 11)), [300, 'Rim']],
])

// ---- silent pads ----

const d7 = physicalPad(3, 9)
const c7 = physicalPad(2, 9)

/** A kit on A7, a bass on C7 (three KEYS notes) and a melody on D7 (two). */
function melody(): ProjectSeq {
  let seq = ProjectSeq.DEFAULT
  seq = withP(seq, 0, 1, pat([hit(0), hit(96)]))
  seq = withP(seq, 2, 1, pat([patternNote(0, 9, 24, 0, 127), patternNote(96, 9, 24, 3, 127), patternNote(192, 9, 24, 7, 127)]))
  seq = withP(seq, 3, 1, pat([patternNote(0, 9, 24, 12, 127), patternNote(48, 9, 24, 15, 127)]))
  return seq
}
