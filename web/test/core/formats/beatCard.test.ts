// Web only (no Kotlin twin, like guideData): beatCard.ts against the arc-beats
// skill's own cards and against what its scripts/beatcard.py says about them
// (recorded in beatCardFixtures.ts), plus the grid, notes, sound, scene and
// chain rules of references/beat-card.md.
import { describe, expect, it } from 'vitest'
import {
  cardScenes,
  chainText,
  MAX_SCENES,
  parseBeatCard,
  playOrder,
  scenePatterns,
  sceneTicks,
  stepTick,
  summarizeBeatCard,
  swingOffset,
  type BeatCardProblem,
  type BeatCardResult,
} from '../../../src/core/formats/beatCard'
import { CARDS, ERROR_CARDS } from './beatCardFixtures'

const ROW = '| X... .... X... .... |'

const card = (...lines: string[]): BeatCardResult => parseBeatCard(['ARC BEAT 1', ...lines].join('\n'))

/** The problems as beatcard.py's fixtures record them: line and code. */
const own = (ps: readonly BeatCardProblem[]): { line: number; code: string }[] =>
  ps.map(({ line, code }) => ({ line, code }))

describe('the skill cards', () => {
  it('has every card of genres.md, ep40-kit.md and beat-card.md', () => {
    expect(CARDS.length).toBe(38)
    expect(new Set(CARDS.map((c) => c.source))).toEqual(new Set(['genres.md', 'ep40-kit.md', 'beat-card.md']))
  })

  for (const c of CARDS) {
    it(`${c.source}: ${c.heading} reads as beatcard.py says`, () => {
      const r = parseBeatCard(c.card)
      expect(r.valid).toBe(c.valid)
      expect(r.errors).toEqual([])
      // beatcard.py had nothing to say about these cards, and every part of them is kept.
      expect(r.warnings).toEqual([])
      expect(r.groups.length).toBeGreaterThan(0)
      for (const g of r.groups) {
        for (const row of g.rows) {
          expect(row.vel.length).toBe(g.steps)
          expect(row.len.length).toBe(g.steps)
        }
      }
    })
  }

  it('beat-card.md: the example card', () => {
    const r = parseBeatCard(CARDS.find((c) => c.source === 'beat-card.md')!.card)
    expect(r).toMatchObject({ valid: true, name: 'Lazy boom bap', tempo: 92, swing: 58, scenes: [], sceneCount: 1 })
    expect(r.chain).toBeNull()
    const [a] = r.groups
    expect(a).toMatchObject({
      group: 'A',
      bars: 1,
      step: '1/16',
      stepTicks: 24,
      stepsPerBar: 16,
      steps: 16,
      swings: true,
    })
    expect(a!.rows.map((row) => [row.pad, row.label, row.note])).toEqual([
      ['A7', 'kick', 45],
      ['A9', 'snare', 47],
      ['A4', 'hat', 42],
    ])
    expect(a!.rows[1]!.vel).toEqual([0, 0, 0, 0, 127, 0, 0, 0, 0, 0, 0, 0, 127, 0, 0, 64])
    expect(r.notes).toEqual([
      {
        group: 'A',
        pad: 'A9',
        offset: 11,
        note: 47,
        tick: 288 + 72 + 6,
        vel: 50,
        gate: 24,
        semi: null,
        key: null,
        line: 11,
      },
      { group: 'A', pad: 'A1', offset: 3, note: 39, tick: 0, vel: 127, gate: 48, semi: 0, key: 'C4', line: 12 },
    ])
  })

  it('Breakcore arrangement: every scene, the chain and the effects, with no warning', () => {
    const r = parseBeatCard(CARDS.find((c) => c.heading === 'Breakcore arrangement')!.card)
    expect(r.valid).toBe(true)
    expect(r.warnings).toEqual([])
    expect(r.sceneCount).toBe(5)
    expect(r.scenes.map((s) => [s.index, s.name, s.line, s.groups.map((g) => g.group).join('')])).toEqual([
      [0, 'Intro', 10, 'AB'],
      [1, 'Drop', 21, 'AB'],
      [2, 'Breakdown', 37, 'AB'],
      [3, 'Build', 46, 'A'],
      [4, 'Drop 2', 52, 'AB'],
    ])
    expect(r.chain).toEqual([
      { scene: 0, passes: 2 },
      { scene: 1, passes: 2 },
      { scene: 2, passes: 1 },
      { scene: 3, passes: 1 },
      { scene: 4, passes: 2 },
    ])
    expect(chainText(r.chain!)).toBe('1x2 2x2 3 4 5x2')
    // The top level is the first scene.
    expect(r.groups).toEqual(r.scenes[0]!.groups)
    expect(r.notes).toEqual(r.scenes[0]!.notes)
    expect(r.groups[0]!.rows.map((row) => row.pad)).toEqual(['A7', 'A4', 'AENTER'])
    expect(r.scenes[1]!.groups[0]!.rows.map((row) => row.pad)).toEqual(['A7', 'A8', 'A9', 'A5', 'A4', 'AENTER'])
    expect(r.scenes[2]!.notes.map((n) => [n.tick, n.key])).toEqual([
      [0, 'E1'],
      [384, 'G1'],
    ])
    // Build leaves B out: it plays Breakdown's bass.
    expect(scenePatterns(r, 3).map((p) => [p.group.group, p.scene, p.group.line])).toEqual([
      ['A', 3, 47],
      ['B', 2, 41],
    ])
    expect(r.fx).not.toBeNull()
    expect(r.sends).not.toBeNull()
    expect(r.comp).not.toBeNull()
  })
})

describe('errors, as beatcard.py finds them', () => {
  for (const c of ERROR_CARDS) {
    it(c.title, () => {
      const r = parseBeatCard(c.card)
      expect(r.valid).toBe(false)
      expect(own(r.errors)).toEqual(c.errors)
      expect(own(r.warnings)).toEqual(c.warnings)
    })
  }

  it('says where and why', () => {
    expect(card('[A]', 'A7 kick | X... .... X... ... |').errors).toEqual([
      { line: 3, code: 'step-count', msg: 'row A7: bar 1 has 15 steps, needs 16 a bar' },
    ])
    expect(card('[A] bars 2', 'A7 | X... .... X... .... |').errors[0]!.msg).toBe(
      'row A7 has 16 steps, needs 32 (2 bars of 16): bar 2 is short',
    )
    expect(card('tempo 300', '[A]', `A7 ${ROW}`).errors).toEqual([
      { line: 2, code: 'bad-tempo', msg: "tempo '300' must be 40 to 240, whole or with one decimal" },
    ])
    expect(card('[A]', `A7 ${ROW}`, `A10 ${ROW}`).errors).toEqual([
      { line: 4, code: 'bad-pad', msg: "'A10' is not a pad: after the group letter use . 0 E (or ENTER) or 1-9" },
    ])
    expect(card('[A]', 'sound B7 12 Kick').errors).toEqual([
      { line: 3, code: 'wrong-group', msg: 'pad B7 is in group B but the section is [A]' },
    ])
    expect(parseBeatCard('[A]\nA7 | X... |').errors).toEqual([
      { line: 1, code: 'no-card', msg: 'no line starts with ARC BEAT, so there is no card here' },
    ])
  })

  it('counts lines from the start of the text, chat and fences included', () => {
    const r = parseBeatCard(['Here you go:', '', '```', 'ARC BEAT 1', '[A]', 'A7 | X.. |', '```', 'Enjoy!'].join('\n'))
    expect(r.errors.map((e) => e.line)).toEqual([6])
  })
})

describe('grid rows', () => {
  it('reads velocities and holds', () => {
    const r = card('[A]', 'A7 | X--- x.o. 9-1. 5... |')
    const row = r.groups[0]!.rows[0]!
    expect(row.vel).toEqual([127, 0, 0, 0, 100, 0, 64, 0, 126, 0, 14, 0, 70, 0, 0, 0])
    expect(row.len).toEqual([4, 0, 0, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 0, 0])
  })

  it('ignores spaces and bars inside the steps, and a comment after a blank', () => {
    const r = card('[A] bars 2', 'A7 kick|X...|....X...  ....|X.......X... ....| # four on the floor')
    expect(r.valid).toBe(true)
    expect(r.groups[0]!.rows[0]!).toMatchObject({ pad: 'A7', label: 'kick' })
    expect(r.groups[0]!.rows[0]!.vel.filter((v) => v > 0)).toEqual([127, 127, 127, 127])
  })

  it('knows the pads as printed, ENTER as E', () => {
    const r = card('[D]', `D. ${ROW}`, `D0 ${ROW}`, `DE ${ROW}`, `DENTER ${ROW}`, `D1 ${ROW}`, `D9 ${ROW}`)
    expect(r.groups[0]!.rows.map((row) => [row.pad, row.offset, row.note])).toEqual([
      ['D.', 0, 72],
      ['D0', 1, 73],
      ['DENTER', 2, 74],
      ['DENTER', 2, 74],
      ['D1', 3, 75],
      ['D9', 11, 83],
    ])
  })

  it('defaults: one bar of 1/16, swing 50, no tempo or name', () => {
    const r = card('[A]', `A7 ${ROW}`)
    expect(r).toMatchObject({ valid: true, name: '', tempo: null, swing: 50 })
    expect(r.groups[0]).toMatchObject({
      bars: 1,
      step: '1/16',
      stepsPerBar: 16,
      steps: 16,
      triplet: false,
      length: 384,
    })
  })

  it('has the steps per bar of every step size', () => {
    const r = card(
      '[A] step 1/8',
      'A7 | X... .... |',
      '[B] step 1/32',
      `B7 | ${'X...'.repeat(8)} |`,
      '[C] step 1/8t',
      'C7 | X.. X.. X.. X.. |',
      '[D] step 1/16T bars 2',
      `D7 | ${'X.....'.repeat(4)} | ${'X.....'.repeat(4)} |`,
    )
    expect(r.valid).toBe(true)
    expect(r.groups.map((g) => [g.step, g.stepTicks, g.stepsPerBar, g.steps, g.triplet, g.swings])).toEqual([
      ['1/8', 48, 8, 8, false, true],
      ['1/32', 12, 32, 32, false, false],
      ['1/8T', 32, 12, 12, true, false],
      ['1/16T', 16, 24, 48, true, false],
    ])
  })

  it('swings odd 1/8 and 1/16 steps, ties rounding up', () => {
    expect(swingOffset('1/16', 1, 58)).toBe(4) // 8 * 24 / 50 = 3.84
    expect(swingOffset('1/16', 2, 58)).toBe(0)
    expect(swingOffset('1/8', 3, 75)).toBe(24)
    expect(swingOffset('1/32', 1, 75)).toBe(0)
    const g = card('swing 58', '[A]', `A7 ${ROW}`).groups[0]!
    expect([0, 1, 2, 3].map((k) => stepTick(g, k, 58))).toEqual([0, 28, 48, 76])
  })

  it('folds two hits on a pad at one tick, with a warning', () => {
    const r = card('[A]', `A7 ${ROW}`, 'A7 | o... .... .... .... |')
    expect(r.valid).toBe(true)
    expect(own(r.warnings)).toEqual([{ line: 4, code: 'duplicate-hit' }])
  })
})

describe('notes and sounds', () => {
  it('reads notes: at with ticks, t, vel, gate, note and semi', () => {
    const r = card(
      '[B] bars 2',
      'notes',
      'B7 at 1.2.3+8 note E2 gate 1/8 vel 50',
      'B7 t 400 semi -5 gate 30',
      'B1 at 2.4.4-2 # a pad hit',
      'B7 at 1.1.1 note C#4',
    )
    expect(r.valid).toBe(true)
    expect(r.notes.map((x) => [x.pad, x.tick, x.vel, x.gate, x.semi, x.key])).toEqual([
      ['B7', 152, 50, 48, -20, 'E2'],
      ['B7', 400, 127, 30, -5, 'G3'],
      ['B1', 384 + 288 + 72 - 2, 127, 24, null, null],
      ['B7', 0, 127, 24, 1, 'C#4'],
    ])
  })

  it('keeps one sound line a pad, the later, with a warning', () => {
    const r = card(
      '[A]',
      'sound A7 12 Kick  808 # factory',
      `A7 ${ROW}`,
      'notes',
      'A7 at 1.2.1',
      'sound A7 13',
      'sound AE 450 Crash',
    )
    expect(r.valid).toBe(true)
    expect(r.sounds).toEqual([
      { group: 'A', pad: 'A7', offset: 9, slot: 13, name: '', line: 7 },
      { group: 'A', pad: 'AENTER', offset: 2, slot: 450, name: 'Crash', line: 8 },
    ])
    expect(own(r.warnings)).toEqual([{ line: 7, code: 'duplicate-sound' }])
    expect(card('[A]', 'sound A7 12 Kick  808').sounds[0]!.name).toBe('Kick 808')
  })
})

describe('effect lines', () => {
  it('keeps their values, with no warning', () => {
    const r = card('fx reverb 60 40', 'send A 20 B 40.5', 'comp 40 60', 'sidechain A7 BC 25 70', '[A]', `A7 ${ROW}`)
    expect(r.valid).toBe(true)
    expect(r.warnings).toEqual([])
    expect(r.fx).toEqual({ type: 'reverb', x: 60, y: 40 })
    expect(r.sends).toEqual({ A: 20, B: 40.5 })
    expect(r.comp).toEqual({ drive: 40, speed: 60 })
    expect(r.sidechain).toEqual({
      pad: 'A7',
      group: 'A',
      offset: 9,
      note: 45,
      groups: ['B', 'C'],
      length: 25,
      shape: 70,
    })
  })

  it('is null for a kind the card has no line of', () => {
    expect(card('[A]', `A7 ${ROW}`)).toMatchObject({ fx: null, sends: null, comp: null, sidechain: null, pads: [] })
    expect(card('send C 10', '[A]', `A7 ${ROW}`)).toMatchObject({ fx: null, sends: { C: 10 }, comp: null })
  })

  it('defaults: x and y 50, length 30 and shape 50; the groups in order, once each', () => {
    const r = card('FX Delay', 'sidechain AE DBB', '[A]', `A7 ${ROW}`)
    expect(r.fx).toEqual({ type: 'delay', x: 50, y: 50 })
    expect(r.sidechain).toMatchObject({ pad: 'AENTER', offset: 2, groups: ['B', 'D'], length: 30, shape: 50 })
    expect(card('fx filter 20', '[A]', `A7 ${ROW}`).fx).toEqual({ type: 'filter', x: 20, y: 50 })
  })

  it('adds send lines up, a group given twice keeping its later value', () => {
    const r = card('send B 40 A 20', 'send B 10 D 5', 'send A 0', '[A]', `A7 ${ROW}`)
    expect(r.warnings).toEqual([])
    expect(r.sends).toEqual({ A: 0, B: 10, D: 5 })
    expect(Object.keys(r.sends!)).toEqual(['A', 'B', 'D'])
  })

  it('keeps the later fx, comp and sidechain line, with a warning', () => {
    const r = card(
      'fx delay 10',
      'comp 40 60',
      'sidechain A7 B',
      'fx none',
      'comp off',
      'sidechain off',
      '[A]',
      `A7 ${ROW}`,
    )
    expect(r).toMatchObject({ fx: { type: 'none', x: 50, y: 50 }, comp: 'off', sidechain: 'off' })
    expect(own(r.warnings)).toEqual([
      { line: 5, code: 'duplicate-fx' },
      { line: 6, code: 'duplicate-comp' },
      { line: 7, code: 'duplicate-sidechain' },
    ])
    expect(card('comp off x', '[A]', `A7 ${ROW}`)).toMatchObject({ comp: 'off', warnings: [{ code: 'fx-extra' }] })
  })

  it('changes nothing for a line with a fault', () => {
    const r = card('send A 10', 'send B 101', 'comp 40 60', 'comp 40', '[A]', `A7 ${ROW}`)
    expect(r.errors.map((e) => [e.line, e.code])).toEqual([
      [3, 'bad-send'],
      [5, 'bad-comp'],
    ])
    expect(r).toMatchObject({ sends: { A: 10 }, comp: { drive: 40, speed: 60 } })
  })
})

describe('pad lines', () => {
  it('keeps their settings, one entry a pad', () => {
    const r = card('[A]', 'pad A4 pitch -7 level 80', `A7 ${ROW}`, 'pad AE pan -4 attack 3 pitch +3.25')
    expect(r.valid).toBe(true)
    expect(r.warnings).toEqual([])
    expect(r.pads).toEqual([
      { group: 'A', pad: 'A4', offset: 6, note: 42, pitch: -7, level: 80, line: 3 },
      { group: 'A', pad: 'AENTER', offset: 2, note: 38, pitch: 3.25, pan: -4, attack: 3, line: 5 },
    ])
  })

  it('merges a second line for a pad, the later settings winning, with a warning', () => {
    const r = card('[B]', 'pad B7 pitch -7 level 80 level 70', 'pad B9 level 5', 'pad B7 level 90 pan -0')
    expect(r.pads).toEqual([
      { group: 'B', pad: 'B7', offset: 9, note: 57, pitch: -7, level: 90, pan: 0, line: 5 },
      { group: 'B', pad: 'B9', offset: 11, note: 59, level: 5, line: 4 },
    ])
    expect(own(r.warnings)).toEqual([{ line: 5, code: 'duplicate-pad-line' }])
  })

  it('sets the release to 15 when the mode leaves oneshot, unless the line gives one', () => {
    const r = card(
      '[A]',
      'pad A7 mode key',
      'pad A8 Mode LEGATO release 40',
      'pad A9 release 40',
      'pad A9 mode key',
      'pad A4 mode key release 30',
      'pad A4 mode legato',
      'pad A5 mode oneshot',
    )
    expect(r.valid).toBe(true)
    expect(r.pads.map((p) => [p.pad, p.mode, p.release])).toEqual([
      ['A7', 'key', 15],
      ['A8', 'legato', 40],
      ['A9', 'key', 15],
      // key to legato doesn't leave oneshot: the release stays.
      ['A4', 'legato', 30],
      ['A5', 'oneshot', undefined],
    ])
  })

  it('keeps each scene’s pad lines with it, the first scene’s on top', () => {
    const r = card('scene One', '[A]', 'pad A7 level 50', 'scene Two', '[A]', 'pad A9 level 60', '[B]', 'pad B7 pan 3')
    expect(r.valid).toBe(true)
    expect(r.warnings).toEqual([])
    expect(r.pads.map((p) => [p.pad, p.level])).toEqual([['A7', 50]])
    expect(r.scenes[1]!.pads.map((p) => p.pad)).toEqual(['A9', 'B7'])
  })
})

describe('scenes and the chain', () => {
  const A = (row: string): string => `A7 kick | ${row} |`

  it('keeps every scene with its name, line and own sections', () => {
    const r = card(
      'scene Intro',
      '[A]',
      A('X... .... .... ....'),
      'scene',
      '[B] bars 2',
      'notes',
      'B7 at 2.1.1 note E1',
      'sound B7 400 Bass',
      'scene Drop',
      '[A]',
      A('X.X. X.X. X.X. X.X.'),
      '[C]',
      'C7 | X... .... .... .... |',
    )
    expect(r.valid).toBe(true)
    expect(r.warnings).toEqual([])
    expect(r.sceneCount).toBe(3)
    expect(r.scenes.map((s) => [s.index, s.name, s.line])).toEqual([
      [0, 'Intro', 2],
      [1, '', 5],
      [2, 'Drop', 10],
    ])
    expect(r.scenes.map((s) => s.groups.map((g) => g.group))).toEqual([['A'], ['B'], ['A', 'C']])
    expect(r.scenes[1]!.notes.map((n) => [n.pad, n.tick, n.key])).toEqual([['B7', 384, 'E1']])
    expect(r.scenes[1]!.sounds.map((s) => [s.pad, s.slot])).toEqual([['B7', 400]])
    // The top level stays the first scene's; with no chain line, each scene once.
    expect(r.groups.map((g) => g.group)).toEqual(['A'])
    expect(r.notes).toEqual([])
    expect(r.chain).toBeNull()
    expect(playOrder(r)).toEqual([
      { scene: 0, passes: 1 },
      { scene: 1, passes: 1 },
      { scene: 2, passes: 1 },
    ])
  })

  it('a group a scene leaves out plays the scene before’s pattern, the first scene’s plays nothing', () => {
    const r = card(
      'scene',
      '[B]',
      'B7 | X... .... .... .... |',
      'scene',
      '[A] bars 2',
      A('X... .... .... .... | X... .... .... ....'),
      'scene',
      '[B]',
      'B9 | x... .... .... .... |',
      'scene',
    )
    expect(r.valid).toBe(true)
    const of = (i: number): [string, number][] => scenePatterns(r, i).map((p) => [p.group.group, p.scene])
    expect(of(0)).toEqual([['B', 0]])
    expect(of(1)).toEqual([
      ['A', 1],
      ['B', 0],
    ])
    expect(of(2)).toEqual([
      ['A', 1],
      ['B', 2],
    ])
    expect(of(3)).toEqual(of(2))
    // The same pattern, not a copy.
    expect(scenePatterns(r, 3)[1]!.group).toBe(r.scenes[2]!.groups[0])
    // A pass lasts as long as the scene's longest pattern.
    expect([0, 1, 2, 3].map((i) => sceneTicks(r, i))).toEqual([384, 768, 768, 768])
  })

  it('reads a card without scene lines as its one scene', () => {
    const r = card('[B]', 'B7 | X... .... .... .... |', '[A] bars 3', A(Array(3).fill('X... .... .... ....').join(' | ')))
    expect(r).toMatchObject({ scenes: [], sceneCount: 1, chain: null })
    expect(cardScenes(r)).toEqual([{ index: 0, name: '', line: 0, groups: r.groups, notes: r.notes, sounds: r.sounds, pads: r.pads }])
    // Card order, as the sections come.
    expect(scenePatterns(r, 0).map((p) => p.group.group)).toEqual(['B', 'A'])
    expect(sceneTicks(r, 0)).toBe(3 * 384)
    expect(playOrder(r)).toEqual([{ scene: 0, passes: 1 }])
    // A result from before scenes were kept counts them instead.
    expect(cardScenes({ ...r, scenes: 1 as unknown as [] })).toHaveLength(1)
  })

  it('keeps at most MAX_SCENES scenes, reading the later ones for their problems only', () => {
    const scene = (i: number): string[] => [`scene s${i}`, '[A]', A('X... .... .... ....')]
    const r = card(...Array.from({ length: 18 }, (_, i) => scene(i)).flat(), '[A]', A('X... .... ....'))
    expect(own(r.errors)).toEqual([
      { line: 50, code: 'too-many-scenes' },
      { line: 56, code: 'duplicate-group' },
      { line: 57, code: 'step-count' },
    ])
    expect(r.sceneCount).toBe(18)
    expect(r.scenes).toHaveLength(MAX_SCENES)
    expect(r.scenes.at(-1)!.name).toBe('s15')
    // The later scenes' sections go nowhere, not into the last scene kept.
    expect(r.scenes.every((s) => s.groups.length === 1)).toBe(true)
  })

  it('reads chain steps with 1 pass by default, a later chain line replacing the earlier', () => {
    const scenes = ['scene', '[A]', A('X... .... .... ....'), 'scene', '[A]', A('x... .... .... ....'), 'scene']
    const r = card('chain 1x2 2 3X8', ...scenes)
    expect(r.valid).toBe(true)
    expect(r.chain).toEqual([
      { scene: 0, passes: 2 },
      { scene: 1, passes: 1 },
      { scene: 2, passes: 8 },
    ])
    expect(playOrder(r)).toEqual(r.chain)
    const twice = card('chain 1 2', 'chain 2x4 2 1', ...scenes)
    expect(twice.chain).toEqual([
      { scene: 1, passes: 4 },
      { scene: 1, passes: 1 },
      { scene: 0, passes: 1 },
    ])
    expect(own(twice.warnings)).toEqual([{ line: 3, code: 'duplicate-chain' }])
    // A chain line with a fault changes nothing.
    expect(card('chain 1x2', 'chain 1x9', ...scenes).chain).toEqual([{ scene: 0, passes: 2 }])
  })

  it('keeps a chain that names a scene the card lacks, but plays only the scenes it has', () => {
    const r = card('chain 1 4 2', 'scene', '[A]', A('X... .... .... ....'), 'scene')
    expect(own(r.errors)).toEqual([{ line: 2, code: 'chain-unknown-scene' }])
    expect(r.errors[0]!.msg).toBe('chain step 2 names scene 4, but the card has 2 scenes')
    expect(playOrder(r)).toEqual([
      { scene: 0, passes: 1 },
      { scene: 1, passes: 1 },
    ])
  })

  it('sums up each scene with what it carries, then the chain', () => {
    const r = card(
      'name Arr',
      'chain 1x2 2',
      'scene Intro',
      '[A]',
      A('X... .... X... ....'),
      '[B]',
      'notes',
      'B7 at 1.1.1 note E1',
      'scene',
      '[A]',
      A('X.X. X.X. X.X. X.X.'),
    )
    expect(summarizeBeatCard(r).split('\n')).toEqual([
      '"Arr", swing 50, 2 scenes',
      '',
      'Scene 1 "Intro"',
      '[A] 1 bar, step 1/16 (16 steps a bar)',
      'A7 kick  X... .... X... ....',
      '[B] 1 bar, step 1/16 (16 steps a bar)',
      'notes:',
      '  B7 at 1.1.1  vel 127  gate 24 ticks  KEYS E1',
      '',
      'Scene 2, B from scene 1',
      '[A] 1 bar, step 1/16 (16 steps a bar)',
      'A7 kick  X.X. X.X. X.X. X.X.',
      '',
      'Chain: 1x2 2',
    ])
    const plain = card('scene', '[A]', A('X... .... .... ....'), 'scene', 'scene')
    expect(summarizeBeatCard(plain).split('\n').slice(5)).toEqual([
      '',
      'Scene 2, A from scene 1',
      '',
      'Scene 3, A from scene 1',
      '',
      'No chain line: the scenes play in order, once each.',
    ])
    expect(summarizeBeatCard(card('scene', 'scene', '[A]', A('X... .... .... ....'))).split('\n')[2]).toBe(
      'Scene 1, no sections',
    )
  })

  it('lists scenes and notes up to the limits: four sections’ worth of notes in all', () => {
    const notes = (g: string): string[] => [`[${g}]`, 'notes', `${g}7 at 1.1.1`, `${g}7 at 1.2.1`, `${g}7 at 1.3.1`]
    const r = card(...['A', 'B', 'C', 'D', 'A', 'B'].flatMap((g, i) => (i % 2 === 0 ? ['scene', ...notes(g)] : notes(g))))
    expect(r.valid).toBe(true)
    const text = summarizeBeatCard(r, { notes: 2, scenes: 2 }).split('\n')
    // 8 notes in all: 2 of A, 2 of B, 2 of C, 2 of D; scene 3's are past the limit.
    expect(text.filter((l) => l.startsWith('  ') && l.includes(' at '))).toHaveLength(8)
    expect(text.filter((l) => l.includes('… and 1 more note'))).toHaveLength(4)
    expect(text).toContain('… and 1 more scene')
    expect(text).not.toContain('Scene 3')
    expect(text.at(-1)).toBe('No chain line: the scenes play in order, once each.')
    const all = summarizeBeatCard(r, { notes: 2 }).split('\n')
    expect(all.filter((l) => l.startsWith('  ') && l.includes(' at '))).toHaveLength(8)
    expect(all.filter((l) => l.includes('… and 3 more notes'))).toHaveLength(2)
  })
})

describe('summarizeBeatCard', () => {
  it('lists the effects in one line and each shaped pad', () => {
    const text = summarizeBeatCard(
      card(
        'fx reverb 60 40',
        'send B 40 A 20',
        'comp 40 60',
        'sidechain A7 CB',
        '[A]',
        'sound A4 200 Hat',
        'pad A4 pitch -7 level 80',
        `A4 ${ROW}`,
        'pad A7 mode key',
      ),
    )
    expect(text.split('\n')).toEqual([
      'ARC BEAT card, swing 50',
      'FX: reverb 60 40 · send A 20 B 40 · comp 40 60 · sidechain A7 ducks B C',
      '',
      '[A] 1 bar, step 1/16 (16 steps a bar)',
      'sound A4 200 Hat',
      'pad A4: pitch -7, level 80',
      'pad A7: release 15, mode key',
      'A4    X... .... X... ....',
    ])
    const off = card('comp off', 'sidechain A7 B 20 50', '[A]', `A7 ${ROW}`)
    expect(summarizeBeatCard(off).split('\n')[1]).toBe('FX: comp off · sidechain A7 ducks B, length 20 shape 50')
  })

  it('writes the grid back as a card does', () => {
    const text = summarizeBeatCard(
      card(
        'name Test',
        'tempo 120',
        'swing 55',
        '[A2] bars 2',
        'A7 kick | X--- x.o. 9-1. .... | X... .... .... .... |',
        'sound A7 12 Kick',
      ),
    )
    expect(text.split('\n')).toEqual([
      '"Test", 120 BPM, swing 55',
      '',
      '[A02] 2 bars, step 1/16 (16 steps a bar), swung',
      'sound A7 12 Kick',
      'A7 kick  X--- x.o. 9-1. .... | X... .... .... ....',
    ])
  })

  it('lists the errors by line when the card is broken', () => {
    const text = summarizeBeatCard(card('[A]', 'A7 kick | X... .... X... ... |', 'fx reverb'))
    expect(text.split('\n')).toEqual([
      "This card can't be read: 2 errors.",
      'line 3: row A7: bar 1 has 15 steps, needs 16 a bar',
      "line 4: 'fx' belongs before the first section",
    ])
  })

  it('lists the problems and notes of a long card up to the limits, keeping the counts', () => {
    const broken = card(...Array.from({ length: 5 }, () => 'zz'), '[A] bars 1', 'A7 | X... |')
    const text = summarizeBeatCard(broken, { problems: 2 }).split('\n')
    expect(text[0]).toBe("This card can't be read: 1 error.")
    expect(text.slice(-4)).toEqual([
      '5 warnings:',
      "line 2: unknown header word 'zz' ignored",
      "line 3: unknown header word 'zz' ignored",
      '… and 3 more warnings',
    ])
    const notes = card('[B] bars 1', 'notes', 'B7 at 1.1.1', 'B7 at 1.2.1', 'B7 at 1.3.1')
    expect(summarizeBeatCard(notes, { notes: 1 }).split('\n').slice(-3)).toEqual([
      'notes:',
      '  B7 at 1.1.1  vel 127  gate 24 ticks  pad hit',
      '  … and 2 more notes',
    ])
  })
})
