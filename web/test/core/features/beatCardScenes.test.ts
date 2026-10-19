// Port of core/src/test/kotlin/dev/arc/ep133/features/BeatCardScenesTest.kt (the same cases, in the same order).
import { describe, expect, it } from 'vitest'
import {
  BeatCards,
  SoundStatus,
  allSections,
  beatCard,
  beatCardOfScenes,
  cardFx,
  cardPad,
  cardScene,
  cardSection,
  cardSound,
  isMultiScene,
  withSections,
  type BeatCard,
  type CardPad,
  type CardRead,
  type CardScene,
  type CardSection,
  type CardSound,
} from '../../../src/core/features/beatCard'
import { Chain, chain, chainStep } from '../../../src/core/features/chain'
import { FxSettings, FxType } from '../../../src/core/features/fxSettings'
import { physicalPad } from '../../../src/core/features/padNotes'
import { PadSettings } from '../../../src/core/features/padSettings'
import { ProjectSeq, Seq, pattern, patternNote, projectSeq, scene, type Pattern, type PatternNote } from '../../../src/core/features/pattern'

const hit = (tick: number, offset: number, gate = 24, semi: number | null = null, vel = 127): PatternNote => patternNote(tick, offset, gate, semi, vel)

const problems = (r: CardRead): string[] => r.problems.map((p) => `${p.line} ${p.error ? 'error' : 'warning'}: ${p.message}`)

const read = (...lines: string[]): CardRead => BeatCards.read(lines.join('\n'))

const bar = 'A7 | X... .... .... .... |'

const a = (
  notes: PatternNote[] = [],
  o: { bars?: number; group?: number; number?: number | null; sounds?: Map<number, CardSound>; pads?: Map<number, CardPad> } = {},
): CardSection => cardSection(o.group ?? 0, o.number ?? null, pattern(o.bars ?? 1, notes), o.sounds ?? new Map(), o.pads ?? new Map())

const sc = (name: string | null, ...sections: CardSection[]): CardScene => cardScene(name, sections)

const cardOf = (scenes: CardScene[], chainSteps: [number, number][] | null = null, fx = null as BeatCard['fx']): BeatCard => beatCardOfScenes(null, null, 50, scenes, fx, chainSteps, true)

const snd = (slot: number, name: string | null = null): CardSound => cardSound(slot, name)

const keys = (p: Pattern): string[] => p.notes.map((n) => `${n.tick}/${n.offset}/${n.gate}/${n.semitones}/${n.velocity}`).sort()

/** A track idea: an intro, a drop and a B-only break, in a chain that repeats the drop. */
const track = [
  'ARC BEAT 1', 'name Track', 'tempo 120', 'chain 1x2 2 3x4 2',
  'scene Intro', '[A] bars 1', 'A7 | X... .... .... .... |', '[B]', 'B4 | x... .... x... .... |',
  'scene Drop', '[A]', 'A7 | X.x. X.x. X.x. X.x. |',
  'scene', '[B] bars 2', 'B4 | x... .... x... .... | x... .... x... .... |',
].join('\n')

describe('BeatCardScenesTest', () => {
  // ---- reading ----

  it('a card with scene lines reads as scenes with their own sections and a chain', () => {
    const r = BeatCards.read(track)
    expect(problems(r)).toEqual([])
    const c = r.card!
    expect(c.name).toBe('Track')
    expect(c.tempo).toBe(120)
    expect(c.scenes.map((s) => s.name)).toEqual(['Intro', 'Drop', null])
    expect(c.scenes.map((s) => s.sections.map((x) => x.group))).toEqual([[0, 1], [0], [1]])
    expect(c.chain).toEqual([[1, 2], [2, 1], [3, 4], [2, 1]])
    expect(c.sceneLines).toBe(true)
    expect(isMultiScene(c)).toBe(true)
    // `sections` is the first scene's, allSections every scene's.
    expect(c.sections).toEqual(c.scenes[0]!.sections)
    expect(allSections(c)).toHaveLength(4)
    expect(c.scenes[2]!.sections[0]!.pattern.bars).toBe(2)
    expect(c.scenes[1]!.sections[0]!.pattern.notes).toHaveLength(8)
  })

  it('a card with no scene line is one implicit scene', () => {
    const c = read('ARC BEAT 1', '[A]', bar, '[B]', 'B7 | X... .... .... .... |').card!
    expect(c.scenes).toHaveLength(1)
    expect(c.scenes[0]!.name).toBeNull()
    expect(c.sceneLines).toBe(false)
    expect(isMultiScene(c)).toBe(false)
    expect(c.chain).toBeNull()
    expect(c.sections).toHaveLength(2)
    expect(allSections(c)).toEqual(c.sections)
    // beatCard(name, tempo, swing, sections) builds the same card, and withSections changes the first scene's.
    expect(beatCard(null, null, 50, c.sections)).toEqual(c)
    expect(withSections(c, [c.sections[1]!]).sections).toEqual([c.sections[1]])
    expect(beatCardOfScenes(null, null, 50, [], null, null, false).scenes).toHaveLength(1)
    // A scene line alone makes a card of scenes, even for one scene.
    const one = read('ARC BEAT 1', 'scene', '[A]', bar).card!
    expect(one.sceneLines).toBe(true)
    expect(isMultiScene(one)).toBe(true)
    expect(one.scenes).toHaveLength(1)
  })

  it('scenes may leave groups out, repeat a group and hold no section at all', () => {
    expect(problems(read('ARC BEAT 1', 'scene', '[A]', bar, 'scene', '[A]', bar))).toEqual([])
    const c = read('ARC BEAT 1', 'scene', 'scene', '[A]', bar).card!
    expect(c.scenes.map((s) => s.sections.length)).toEqual([0, 1])
    expect(problems(read('ARC BEAT 1', 'scene'))).toEqual(['1 error: The card has no section, such as [A].'])
    // A notes list ends at the next scene line; the keywords don't depend on case.
    const n = read('ARC BEAT 1', 'SCENE Drop # loud', '[A]', bar, 'notes', 'A9 at 1.1.1', 'Scene', '[A]', bar)
    expect(problems(n)).toEqual([])
    expect(n.card!.scenes.map((s) => s.name)).toEqual(['Drop', null])
    expect(n.card!.scenes[0]!.sections[0]!.pattern.notes).toHaveLength(2)
    // The sounds and pad lines belong to the scene's section.
    const s = read('ARC BEAT 1', 'scene', '[A]', 'sound A7 12 Kick', bar, 'scene', '[A]', 'sound A7 13', 'pad A7 level 90', bar).card!
    expect([...s.scenes[0]!.sections[0]!.sounds]).toEqual([[9, snd(12, 'Kick')]])
    expect([...s.scenes[1]!.sections[0]!.sounds]).toEqual([[9, snd(13)]])
    expect([...s.scenes[1]!.sections[0]!.pads]).toEqual([[9, cardPad({ level: 90 })]])
  })

  it('scene problems', () => {
    // A section before the first scene line.
    expect(problems(read('ARC BEAT 1', '[A]', bar, 'scene', '[B]', 'B7 | X... .... .... .... |'))).toEqual([
      '2 error: A section comes before the first scene line: once a card has scenes, every section belongs to one.',
    ])
    // A group twice in one scene.
    expect(problems(read('ARC BEAT 1', 'scene', '[A]', bar, '[A]', bar))).toEqual(['5 error: Group A has two sections.'])
    // Header lines after a scene line.
    expect(problems(read('ARC BEAT 1', 'scene', 'name Foo', 'tempo 100', 'fx delay', '[A]', bar))).toEqual([
      "3 warning: 'name' belongs before the first scene, ignored.",
      "4 warning: 'tempo' belongs before the first scene, ignored.",
      "5 error: 'fx' belongs before the first scene.",
    ])
    // The name: cut at 40 characters with a warning; a comment isn't part of it.
    const long = read('ARC BEAT 1', 'scene ' + 'y'.repeat(50), '[A]', bar)
    expect(problems(long)).toEqual(['2 warning: Scene name is longer than 40 characters, shortened.'])
    expect(long.card!.scenes[0]!.name).toBe('y'.repeat(40))
    // 16 scenes, not 17.
    const scenes = (n: number): string[] => ['ARC BEAT 1', ...Array.from({ length: n }, () => ['scene', '[A]', bar]).flat()]
    expect(problems(read(...scenes(16)))).toEqual([])
    const many = read(...scenes(17))
    expect(problems(many)).toEqual(['50 error: The card has more than 16 scenes, the most is 16.'])
    expect(many.card).toBeNull()
  })

  it('chain lines', () => {
    const tail = ['scene', '[A]', bar, 'scene', '[A]', bar]
    const chainRead = (...words: string[]): CardRead => read('ARC BEAT 1', ...words, ...tail)
    expect(chainRead('chain 1 2x8 2').card!.chain).toEqual([[1, 1], [2, 8], [2, 1]])
    expect(problems(chainRead('chain 1 2x8 2'))).toEqual([])
    // Any case; a step may repeat scenes; up to 64 steps.
    expect(chainRead('CHAIN 1X2').card!.chain).toEqual([[1, 2]])
    expect(chainRead('chain ' + Array.from({ length: 64 }, () => '1').join(' ')).card!.chain).toHaveLength(64)
    expect(problems(chainRead('chain ' + Array.from({ length: 65 }, () => '1').join(' ')))).toEqual(['2 error: The chain has 65 steps, the most is 64.'])
    // Scenes the card doesn't have, passes out of range, words that aren't steps, an empty line.
    expect(problems(chainRead('chain 1 3'))).toEqual(['2 error: chain step 2 names scene 3, but the card has 2 scenes.'])
    expect(problems(chainRead('chain 1x0'))).toEqual(["2 error: chain step '1x0': passes must be 1 to 8."])
    expect(problems(chainRead('chain 1 2x9'))).toEqual(["2 error: chain step '2x9': passes must be 1 to 8."])
    expect(problems(chainRead('chain 0'))).toEqual(["2 error: chain step '0': scenes count from 1."])
    expect(problems(chainRead('chain two'))).toEqual(["2 error: 'two' isn't a chain step. Write a scene number, and its passes after an x, as in 2 or 2x4."])
    expect(problems(chainRead('chain x2'))).toEqual(["2 error: 'x2' isn't a chain step. Write a scene number, and its passes after an x, as in 2 or 2x4."])
    expect(problems(chainRead('chain'))).toEqual(['2 error: chain needs at least one scene, as in chain 1 2x2 3.'])
    // A line with a fault changes nothing: the earlier chain line stands, and the card is refused all the same.
    expect(chainRead('chain 2', 'chain 1x0').card).toBeNull()
    // A second chain line replaces the first, with a warning.
    const twice = chainRead('chain 1', 'chain 1x2 2')
    expect(problems(twice)).toEqual(['3 warning: Two chain lines, kept the later.'])
    expect(twice.card!.chain).toEqual([[1, 2], [2, 1]])
    // A chain needs scene lines.
    expect(problems(read('ARC BEAT 1', 'chain 1', '[A]', bar))).toEqual(['2 error: A chain needs scenes: start each scene with a scene line.'])
    // It is a header line: before the first scene, and so before any section.
    expect(problems(read('ARC BEAT 1', 'scene', 'chain 1', '[A]', bar))).toEqual(["3 error: 'chain' belongs before the first scene."])
    expect(problems(read('ARC BEAT 1', 'scene', '[A]', bar, 'chain 1'))).toEqual(["5 error: 'chain' belongs before the first scene."])
    expect(problems(read('ARC BEAT 1', '[A]', bar, 'chain 1'))).toEqual(["4 error: 'chain' belongs before the first scene."])
  })

  // ---- writing ----

  it('scenes are written after the chain, a section that repeats the one before is left out', () => {
    const intro = sc('Intro', a([hit(0, 9)], { group: 0, number: 1 }), a([hit(0, 9)], { group: 1, number: 1 }))
    // B is the intro's pattern again, with other note ids: left out. A has another pattern.
    const drop = sc('Drop', a([hit(0, 9), hit(96, 9)], { group: 0, number: 2 }), cardSection(1, 5, pattern(1, [patternNote(0, 9, 24, null, 127, 4)])))
    // A repeats the drop's: left out, and the scene is just its line.
    const outro = sc(null, a([hit(0, 9), hit(96, 9)], { group: 0 }))
    const c = cardOf([intro, drop, outro], [[1, 2], [2, 1], [3, 1]])
    expect(BeatCards.write(c).trimEnd().split('\n')).toEqual([
      'ARC BEAT 1', 'swing 50', 'chain 1x2 2 3',
      '', 'scene Intro',
      '[A01] bars 1 step 1/16', 'A7 | X... .... .... .... |',
      '', '[B01] bars 1 step 1/16', 'B7 | X... .... .... .... |',
      '', 'scene Drop',
      '[A02] bars 1 step 1/16', 'A7 | X... X... .... .... |',
      '', 'scene',
    ])
    // Read back it is the card without the sections left out.
    const back = BeatCards.read(BeatCards.write(c))
    expect(problems(back)).toEqual([])
    expect(back.card).toEqual(cardOf([intro, sc('Drop', drop.sections[0]!), sc(null)], [[1, 2], [2, 1], [3, 1]]))
    // And writes as the same text.
    expect(BeatCards.write(back.card!)).toBe(BeatCards.write(c))
  })

  it('a section is left out only when its sounds and pad shaping repeat too', () => {
    const kick = snd(12, 'Kick')
    const mk = (sound: CardSound, level: number): CardScene => sc(null, a([hit(0, 9)], { sounds: new Map([[9, sound]]), pads: new Map([[9, cardPad({ level })]]) }))
    const first = mk(kick, 90)
    const sections = (...s: CardScene[]): number => BeatCards.write(cardOf([first, ...s])).split('\n').filter((l) => l.startsWith('[A')).length
    expect(sections(mk(kick, 90))).toBe(1)
    expect(sections(mk(snd(13, 'Snare'), 90))).toBe(2)
    expect(sections(mk(kick, 80))).toBe(2)
    // The scene line is there either way; the order of a scene's sections is the groups'.
    const c = cardOf([sc('X', a([hit(0, 9)], { group: 2 }), a([hit(0, 9)], { group: 0 }))])
    expect(BeatCards.write(c).split('\n').filter((l) => l.startsWith('[') || l.startsWith('scene'))).toEqual(['scene X', '[A] bars 1 step 1/16', '[C] bars 1 step 1/16'])
  })

  it('the chain line is written after the effect lines and only with steps that name a scene', () => {
    const fx = cardFx({ type: FxType.DELAY, x: 0.4, y: 0.5 })
    const c = cardOf([sc('One', a([hit(0, 9)])), sc('Two', a([hit(0, 9), hit(96, 9)]))], [[1, 1], [3, 1], [2, 4], [2, 9], [0, 1]], fx)
    const lines = BeatCards.write(c, undefined, true, [physicalPad(0, 9)]).split('\n')
    expect(lines.slice(0, 6)).toEqual(['ARC BEAT 1', 'swing 50', 'fx delay 40 50', 'chain 1 2x4', '# no sound on: A7', BeatCards.TIDY_COMMENT])
    // Steps that name nothing: no chain line. A chain on a card with no scene lines is a card of scenes.
    expect(BeatCards.write(cardOf([sc(null, a([hit(0, 9)]))], [[2, 1]]))).not.toContain('chain')
    const bare = beatCardOfScenes(null, null, 50, [cardScene(null, [a([hit(0, 9)])])], null, [[1, 3]], false)
    expect(isMultiScene(bare)).toBe(true)
    expect(BeatCards.write(bare).split('\n').slice(1, 5)).toEqual(['swing 50', 'chain 1x3', '', 'scene'])
    // A single-scene card with no scene lines is written as before.
    expect(BeatCards.write(beatCard(null, null, 50, [a([hit(0, 9)])]))).not.toContain('scene')
  })

  it('a card of scenes reads back as itself', () => {
    const c = BeatCards.read(track).card!
    const back = BeatCards.read(BeatCards.write(c))
    expect(problems(back)).toEqual([])
    expect(back.card).toEqual(c)
    expect(BeatCards.write(back.card!)).toBe(BeatCards.write(c))
    const tidy = BeatCards.read(BeatCards.write(c, undefined, true)).card!
    expect(tidy).toEqual(c)
  })

  // ---- from a project's chain ----

  const kickP = pattern(1, [hit(0, 9)])
  const hatP = pattern(1, [hit(0, 6, 24, null, 100), hit(48, 6, 24, null, 100)])
  const fullKick = pattern(1, [hit(0, 9), hit(96, 9)])

  const arrangement = (steps: { scene: number; passes: number }[]): ProjectSeq =>
    projectSeq(
      [new Map([[1, kickP], [2, fullKick]]), new Map([[1, hatP]]), new Map([[3, pattern(2)]]), new Map()],
      [scene([1, 1, 3, 1]), scene([2, 1, 3, 1]), scene([1, 2, 1, 1]), scene([2, 1, 1, 1])],
      0,
      chain(steps, true),
    )

  it('a chain becomes a card of scenes in first-play order', () => {
    const steps = [chainStep(1, 2), chainStep(0, 1), chainStep(1, 1), chainStep(2, 4)]
    const seq = arrangement(steps)
    const sounds = (p: { group: number; offset: number }): CardSound | null =>
      p.group === 0 && p.offset === 9 ? cardSound(5, 'Kick') : p.group === 1 && p.offset === 6 ? cardSound(201, 'Hat') : null
    const pads = (p: { group: number; offset: number }): PadSettings | null => (p.group === 0 && p.offset === 9 ? { ...PadSettings.DEFAULT, level: 80 } : null)
    const c = BeatCards.fromScenes('Arrangement', 120, 58, seq, undefined, sounds, null, pads)!
    expect(c.chain).toEqual([[1, 2], [2, 1], [1, 1], [3, 4]])
    expect(c.sceneLines).toBe(true)
    expect(c.name).toBe('Arrangement')
    expect(c.swing).toBe(58)
    expect(c.fx).toBeNull()
    // Scene 1 is project scene 1: A (pattern 2) and B have notes, C and D (empty) are left out.
    const s1 = c.scenes[0]!.sections
    expect(s1.map((x) => x.group)).toEqual([0, 1])
    expect(s1.map((x) => x.number)).toEqual([2, 1])
    expect([...s1[0]!.sounds]).toEqual([[9, cardSound(5, 'Kick')]])
    expect([...s1[0]!.pads]).toEqual([[9, cardPad({ level: 80 })]])
    expect([...s1[1]!.sounds]).toEqual([[6, cardSound(201, 'Hat')]])
    // Scene 2 is project scene 0: only A changes (B is the hat again, C and D empty); the kick's sound isn't repeated.
    const s2 = c.scenes[1]!.sections
    expect(s2.map((x) => x.group)).toEqual([0])
    expect(s2[0]!.pattern).toEqual(kickP)
    expect(s2[0]!.sounds.size).toBe(0)
    expect(s2[0]!.pads.size).toBe(0)
    // Scene 3 is project scene 2: A is the kick again, and B is empty, which differs from the hat: an empty section.
    expect(c.scenes[2]!.sections).toEqual([cardSection(1, 2, pattern())])
    expect(c.scenes).toHaveLength(3)
    // It writes, and reads back as itself.
    const text = BeatCards.write(c)
    expect(text).toContain('\nchain 1x2 2 1 3x4\n')
    expect(BeatCards.read(text).card).toEqual(c)
    // A note off the swung grid takes the swing back to 50. No chain, no card.
    const offGrid = projectSeq([new Map([[1, pattern(1, [hit(12, 9)])]]), new Map(), new Map(), new Map()], [scene()], 0, chain([chainStep(0)], true))
    expect(BeatCards.fromScenes(null, null, 58, offGrid)!.swing).toBe(50)
    expect(BeatCards.fromScenes(null, null, 58, ProjectSeq.DEFAULT)).toBeNull()
    expect(BeatCards.fromScenes(null, null, 58, seq, [])).toBeNull()
    // Another chain than the project's can be handed in; fx go in as for a pattern.
    const one = BeatCards.fromScenes(null, null, 50, seq, [chainStep(3, 2), chainStep(9, 1)], undefined, FxSettings.of({ type: FxType.REVERB }))!
    expect(one.chain).toEqual([[1, 2]])
    expect(one.fx!.type).toBe(FxType.REVERB)
    // A first scene with no notes at all has all four groups.
    const blank = projectSeq([], [scene()], 0, chain([chainStep(0)], true))
    expect(BeatCards.fromScenes(null, null, 50, blank)!.scenes[0]!.sections.map((x) => x.group)).toEqual([0, 1, 2, 3])
  })

  // ---- planning ----

  const kick = pattern(1, [hit(0, 9)])

  const project = (playing: number[] = [1, 5, 1, 7]): ProjectSeq =>
    projectSeq([new Map([[1, kick], [2, kick], [3, kick]]), new Map(), new Map(), new Map([[7, kick]])], [scene(playing)])

  it("a card of scenes adds a scene for each, each section in its group's next free pattern", () => {
    const card = BeatCards.read(track).card!
    const plan = BeatCards.plan(project(), card)
    expect(plan.fullGroup).toBeNull()
    expect(plan.newScene).toBe(true)
    // A takes 4, then 5; B takes 6, then 7 (after the playing scene's 5).
    expect(plan.placed).toEqual([[0, 4], [1, 6], [0, 5], [1, 7]])
    expect(plan.scenes).toEqual([1, 2, 3])
    expect(plan.seq.scenes).toEqual([scene([1, 5, 1, 7]), scene([4, 6, 1, 7]), scene([5, 6, 1, 7]), scene([5, 7, 1, 7])])
    // The first new scene is selected.
    expect(plan.seq.scene).toBe(1)
    expect(keys(ProjectSeq.pattern(plan.seq, 0, 4))).toEqual(keys(card.scenes[0]!.sections[0]!.pattern))
    expect(keys(ProjectSeq.pattern(plan.seq, 0, 5))).toEqual(keys(card.scenes[1]!.sections[0]!.pattern))
    expect(ProjectSeq.pattern(plan.seq, 1, 7).bars).toBe(2)
    // The chain is mapped to the new scenes, and is the project's, on.
    const mapped = [chainStep(1, 2), chainStep(2, 1), chainStep(3, 4), chainStep(2, 1)]
    expect(plan.chain).toEqual(mapped)
    expect(plan.seq.chain).toEqual(chain(mapped, true))
    // The notes' ids are 0.
    expect(ProjectSeq.pattern(plan.seq, 0, 4).notes.every((n) => n.id === 0)).toBe(true)
  })

  it("the project's chain is replaced, or left alone with set chain off", () => {
    const card = BeatCards.read(track).card!
    const old = chain([chainStep(0, 3)], false)
    const seq = ProjectSeq.withChain(project(), old)
    const on = BeatCards.plan(seq, card)
    expect(on.seq.chain.steps).toEqual([chainStep(1, 2), chainStep(2, 1), chainStep(3, 4), chainStep(2, 1)])
    expect(on.seq.chain.on).toBe(true)
    const off = BeatCards.plan(seq, card, false)
    expect(off.seq.chain).toEqual(old)
    // The mapped chain is still there for the sheet.
    expect(off.chain).toEqual(on.chain)
    expect(off.seq.scenes).toEqual(on.seq.scenes)
    // A card with scenes and no chain leaves the chain as it is.
    const noChain = BeatCards.plan(seq, read('ARC BEAT 1', 'scene', '[A]', bar, 'scene', '[A]', bar).card!)
    expect(noChain.seq.chain).toEqual(old)
    expect(noChain.chain).toBeNull()
    expect(noChain.scenes).toEqual([1, 2])
  })

  it("with replace the card's scenes take the place of the project's, from S01", () => {
    const card = BeatCards.read(track).card!
    const old = chain([chainStep(0, 3)], true)
    const seq = ProjectSeq.withChain(project(), old)
    const replaced = BeatCards.plan(seq, card, true, true)
    expect(replaced.newScene).toBe(true)
    // The patterns go where they go either way; the scenes are the card's alone, the first selected.
    expect(replaced.placed).toEqual(BeatCards.plan(seq, card).placed)
    expect(replaced.scenes).toEqual([0, 1, 2])
    expect(replaced.seq.scenes).toEqual([scene([4, 6, 1, 7]), scene([5, 6, 1, 7]), scene([5, 7, 1, 7])])
    expect(replaced.seq.scene).toBe(0)
    // The card's chain names the new scenes from 0, and is on.
    const mapped = [chainStep(0, 2), chainStep(1, 1), chainStep(2, 4), chainStep(1, 1)]
    expect(replaced.chain).toEqual(mapped)
    expect(replaced.seq.chain).toEqual(chain(mapped, true))
    // SET CHAIN off: the old chain named the old scenes, so it goes.
    expect(BeatCards.plan(seq, card, false, true).seq.chain).toEqual(chain())
    // The project's patterns stay in the banks.
    expect(ProjectSeq.pattern(replaced.seq, 0, 2)).toEqual(kick)
    expect(ProjectSeq.pattern(replaced.seq, 3, 7)).toEqual(kick)
    // No room to add 3 scenes after 97, but room to replace them.
    const crowded = BeatCards.plan(projectSeq([], Array.from({ length: 97 }, () => scene())), card, true, true)
    expect(crowded.newScene).toBe(true)
    expect(crowded.seq.scenes).toHaveLength(3)
  })

  it("with replace a card of several groups and no scene line is the project's one scene", () => {
    const card = read('ARC BEAT 1', '[A]', bar, '[B]', 'B7 | X... .... .... .... |').card!
    const seq = ProjectSeq.withScenes(project(), [scene([1, 5, 1, 7]), scene([2, 5, 1, 7])], 1, chain([chainStep(1, 2)], true))
    const replaced = BeatCards.plan(seq, card, true, true)
    expect(replaced.newScene).toBe(true)
    expect(replaced.scenes).toEqual([0])
    expect(replaced.seq.scenes).toEqual([scene([4, 6, 1, 7])])
    expect(replaced.seq.chain).toEqual(chain())
    // A card of one group adds no scene, so there is nothing to replace.
    const one = BeatCards.plan(seq, read('ARC BEAT 1', '[A]', bar).card!, true, true)
    expect(one.newScene).toBe(false)
    expect(one.seq.scenes).toEqual(seq.scenes)
  })

  it("a group a scene leaves out takes the number of the scene before, the first scene the playing one's", () => {
    const card = read('ARC BEAT 1', 'scene', '[C]', 'C7 | X... .... .... .... |', 'scene', '[A]', bar, 'scene').card!
    const plan = BeatCards.plan(project(), card)
    // C takes 2 (after the playing scene's 1); A takes 4 (after the playing 1; 2 and 3 are used). The playing scene's A, B, D are kept in the first.
    expect(plan.seq.scenes).toEqual([scene([1, 5, 1, 7]), scene([1, 5, 2, 7]), scene([4, 5, 2, 7]), scene([4, 5, 2, 7])])
  })

  it('a section with no notes still takes a pattern of its own', () => {
    const card = read('ARC BEAT 1', 'scene', '[A] bars 2', 'scene', '[A]', bar).card!
    const plan = BeatCards.plan(ProjectSeq.DEFAULT, card)
    expect(plan.placed).toEqual([[0, 2], [0, 3]])
    expect(ProjectSeq.pattern(plan.seq, 0, 2)).toEqual(pattern(2))
    expect(ProjectSeq.pattern(plan.seq, 0, 3).notes).toHaveLength(1)
    expect(plan.seq.scenes).toEqual([scene([1, 1, 1, 1]), scene([2, 1, 1, 1]), scene([3, 1, 1, 1])])
  })

  it('one scene line is one new scene, even with a single section', () => {
    const one = BeatCards.plan(project(), read('ARC BEAT 1', 'scene', '[A]', bar).card!)
    expect(one.newScene).toBe(true)
    expect(one.scenes).toEqual([1])
    expect(one.seq.scene).toBe(1)
    expect(one.seq.scenes[1]).toEqual(scene([4, 5, 1, 7]))
    // Without scene lines a card of one section adds no scene, and one of two does, as before, naming it.
    const plain = BeatCards.plan(project(), read('ARC BEAT 1', '[A]', bar).card!)
    expect(plain.newScene).toBe(false)
    expect(plain.scenes).toEqual([])
    expect(plain.chain).toBeNull()
    const two = BeatCards.plan(project(), read('ARC BEAT 1', '[A]', bar, '[B]', 'B7 | X... .... .... .... |').card!)
    expect(two.newScene).toBe(true)
    expect(two.scenes).toEqual([1])
  })

  it('a full bank stops a card of scenes, and 99 scenes add none', () => {
    const card = BeatCards.read(track).card!
    const full = projectSeq([new Map(), new Map(Array.from({ length: Seq.MAX_PATTERNS }, (_, i) => [i + 1, kick])), new Map(), new Map()])
    const stopped = BeatCards.plan(full, card)
    expect(stopped.seq).toBe(full)
    expect(stopped.placed).toEqual([])
    expect(stopped.fullGroup).toBe(1)
    expect(stopped.newScene).toBe(false)
    // Not enough room for all its scenes: none is added (and no chain), the patterns are placed all the same.
    const crowded = projectSeq([], Array.from({ length: 97 }, () => scene()), 0, chain([chainStep(5, 2)], true))
    const none = BeatCards.plan(crowded, card)
    expect(none.newScene).toBe(false)
    expect(none.scenes).toEqual([])
    expect(none.chain).toBeNull()
    expect(none.placed).toHaveLength(4)
    expect(none.seq.scenes).toHaveLength(97)
    expect(none.seq.chain).toEqual(crowded.chain)
    // Exactly enough room.
    const snug = BeatCards.plan(projectSeq([], Array.from({ length: 96 }, () => scene())), card)
    expect(snug.newScene).toBe(true)
    expect(snug.seq.scenes).toHaveLength(99)
    expect(snug.scenes).toEqual([96, 97, 98])
  })

  // ---- sounds ----

  it("the sound lines of every scene count, a pad's last one wins", () => {
    const card = cardOf([
      sc('One', a([hit(0, 9)], { sounds: new Map([[9, snd(12, 'Kick')]]) }), a([hit(0, 6)], { group: 1 })),
      sc('Two', a([hit(0, 9)], { sounds: new Map([[9, snd(13, 'Snare')]]) }), a([hit(0, 3)], { group: 1, sounds: new Map([[3, snd(300)]]) })),
    ])
    const available = new Map([[12, 'Kick'], [13, 'Snare'], [300, 'Rim']])
    const picks = BeatCards.resolveSounds(card, available, () => null)
    expect(picks.map((p) => [p.pad, p.slot])).toEqual([[physicalPad(0, 9), 13], [physicalPad(1, 3), 300]])
    expect(picks.map((p) => p.status)).toEqual([SoundStatus.CHANGE, SoundStatus.CHANGE])
    // A pad with a sound line in any scene isn't silent; B6 has none and plays nothing.
    expect(BeatCards.silentPads(card, () => null, true)).toEqual([physicalPad(1, 6)])
    expect(BeatCards.silentPads(card, () => null, false)).toEqual([])
    // Pads used in a later scene only are told too, once.
    const later = cardOf([sc(null, a([hit(0, 9)])), sc(null, a([hit(0, 9), hit(0, 3)]), a([hit(0, 3)], { group: 1 }))])
    expect(BeatCards.silentPads(later, () => null, true)).toEqual([physicalPad(0, 9), physicalPad(0, 3), physicalPad(1, 3)])
  })
})

