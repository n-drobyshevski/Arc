// views/beat/model.ts: the rows, stand-in voices and hits the beat view draws
// and plays, from parsed cards, scene by scene, and the steps of a chain.
import { describe, expect, it } from 'vitest'
import { parseBeatCard, type BeatCardResult } from '../../web/src/core/formats/beatCard'
import { CARDS } from '../../web/test/core/formats/beatCardFixtures'
import {
  audible,
  cardFx,
  chainSteps,
  firstStepOf,
  groupHits,
  hasFx,
  isBeatCardResult,
  sceneCard,
  sceneLoops,
  sceneSteps,
  viewGroups,
  voiceFromLabel,
  voiceFromPad,
  voiceFromSlot,
} from '../views/beat/model'

const card = (...lines: string[]): BeatCardResult => parseBeatCard(['ARC BEAT 1', ...lines].join('\n'))

describe('voices', () => {
  it('reads the labels the skill writes', () => {
    expect(voiceFromLabel('kick')).toBe('kick')
    expect(voiceFromLabel('kick 2')).toBe('kick')
    expect(voiceFromLabel('closed hat')).toBe('hat')
    expect(voiceFromLabel('open hat')).toBe('openhat')
    expect(voiceFromLabel('snare')).toBe('snare')
    expect(voiceFromLabel('clap')).toBe('clap')
    expect(voiceFromLabel('rimshot')).toBe('perc')
    expect(voiceFromLabel('shaker')).toBe('hat')
    expect(voiceFromLabel('tom')).toBe('tom')
    expect(voiceFromLabel('bass loop a')).toBe('bass')
    expect(voiceFromLabel('mel loop a')).toBe('keys')
    expect(voiceFromLabel('cowbell')).toBe('perc')
    expect(voiceFromLabel('')).toBeNull()
  })

  it('falls back to the sound slot, then the pad', () => {
    expect(voiceFromSlot(12)).toBe('kick')
    expect(voiceFromSlot(250)).toBe('hat')
    expect(voiceFromSlot(420)).toBe('bass')
    expect(voiceFromSlot(700)).toBeNull()
    expect(voiceFromPad('A', 10)).toBe('kick')
    expect(voiceFromPad('A', 6)).toBe('hat')
    expect(voiceFromPad('B', 0)).toBe('bass')
    expect(voiceFromPad('C', 3)).toBe('keys')
  })

  it('uses the sound line when the row has no label', () => {
    const r = card('[A] bars 1 step 1/16', 'sound A1 120 SNARE', 'A1 | X... .... X... .... |')
    expect(viewGroups(r)[0]!.rows[0]!.voice).toBe('snare')
  })
})

describe('rows', () => {
  it('has a row per grid row and per pad only the notes list plays', () => {
    const house = parseBeatCard(CARDS.find((c) => c.heading === 'House')!.card)
    const [a, b] = viewGroups(house)
    expect(a!.rows.map((r) => r.pad)).toEqual(['A7', 'A6', 'A5', 'A4'])
    expect(a!.rows.every((r) => r.vel.length === 16)).toBe(true)
    expect(b!.rows).toHaveLength(1)
    expect(b!.rows[0]).toMatchObject({ pad: 'B7', notesOnly: true, voice: 'bass' })
    // Notes at 1.1.3, 1.2.3, 1.3.3, 1.4.3: steps 2, 6, 10, 14.
    const marked = b!.rows[0]!.noteVel.flatMap((v, k) => (v > 0 ? [k] : []))
    expect(marked).toEqual([2, 6, 10, 14])
    expect(b!.notes).toBe(4)
  })
})

describe('hits', () => {
  it('swings odd 1/16 steps and keeps holds as gates', () => {
    const r = card('swing 75', '[A] bars 1 step 1/16', 'A7 kick | XX-. .... .... .... |')
    const view = viewGroups(r)[0]!
    const hits = groupHits(r, view, 75)
    // Step 1 is odd: (75 - 50) * 24 / 50 = 12 ticks late; its hold makes it 2 steps long.
    expect(hits).toEqual([
      { tick: 0, pad: 'A7', voice: 'kick', vel: 127, gate: 24, semi: null, midi: null },
      { tick: 36, pad: 'A7', voice: 'kick', vel: 127, gate: 48, semi: null, midi: null },
    ])
    expect(groupHits(r, view, 50).map((h) => h.tick)).toEqual([0, 24])
  })

  it('never swings triplets or notes, and plays KEYS notes at their pitch on bass', () => {
    const r = card('swing 70', '[B] bars 1', 'notes', 'B7 at 1.1.2 note E2 gate 1/8')
    const hits = groupHits(r, viewGroups(r)[0]!, 70)
    expect(hits).toEqual([{ tick: 24, pad: 'B7', voice: 'bass', vel: 127, gate: 48, semi: -20, midi: 40 }])
  })

  it('keeps the louder of two hits on one pad at one tick', () => {
    const r = card('[A] bars 1 step 1/16', 'A7 kick | o... .... .... .... |', 'A7 kick | X... .... .... .... |')
    const hits = groupHits(r, viewGroups(r)[0]!, 50)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.vel).toBe(127)
  })

  it('plays every note of a chord on one pad at one tick', () => {
    // As beatcard.py's merge_doubles: doubles fold by (pad, tick, semi), so differing pitches stay.
    const r = card(
      '[C] bars 1',
      'notes',
      'C7 at 1.1.1 note F3',
      'C7 at 1.1.1 note G#3',
      'C7 at 1.1.1 note C4',
      'C7 at 1.1.1 note C4 vel 50',
    )
    const hits = groupHits(r, viewGroups(r)[0]!, 50)
    expect(hits.map((h) => [h.tick, h.midi, h.vel])).toEqual([
      [0, 53, 127],
      [0, 56, 127],
      [0, 60, 127],
    ])
  })
})

describe('mute and solo', () => {
  it('solo wins over mute', () => {
    expect(audible('A7', new Set(), new Set())).toBe(true)
    expect(audible('A7', new Set(['A7']), new Set())).toBe(false)
    expect(audible('A7', new Set(), new Set(['A6']))).toBe(false)
    expect(audible('A7', new Set(['A7']), new Set(['A7']))).toBe(true)
  })
})

describe('isBeatCardResult', () => {
  it('knows a parse result from other structured content', () => {
    expect(isBeatCardResult(JSON.parse(JSON.stringify(card('[A] bars 1'))))).toBe(true)
    expect(isBeatCardResult({ valid: true })).toBe(false)
    expect(isBeatCardResult(null)).toBe(false)
  })
})

describe('pad shaping', () => {
  it('puts a pad line on its pad’s hits and leaves the other pads as they were', () => {
    const r = card(
      '[A] bars 1 step 1/16',
      'A7 kick | X... .... .... .... |',
      'A4 hat  | ..x. .... .... .... |',
      'pad A4 pitch -12 level 80 pan -8 attack 20 mode key',
    )
    const view = viewGroups(r)[0]!
    const [kick, hat] = groupHits(r, view, 50)
    expect(kick).toEqual({ tick: 0, pad: 'A7', voice: 'kick', vel: 127, gate: 24, semi: null, midi: null })
    expect(kick).not.toHaveProperty('shape')
    // A drum voice an octave down plays at half its frequencies; leaving oneshot gave release 15.
    expect(hat!.shape).toEqual({ rate: 0.5, level: 0.8, pan: -0.5, attack: 0.2, release: 0.15, mode: 'key' })
    expect(hat!.midi).toBeNull()
    expect(view.rows[0]!.shaping).toBeNull()
    expect(view.rows[1]!.shaping).toMatchObject({ pad: 'A4', pitch: -12, level: 80, pan: -8, attack: 20, mode: 'key' })
  })

  it('moves a bass or keys note by the pitch, and a oneshot pad keeps no release', () => {
    const r = card('[B] bars 1 step 1/16', 'B7 bass | X... .... .... .... |', 'pad B7 pitch 3.5', 'notes', 'B7 at 1.2.1 note E2')
    const hits = groupHits(r, viewGroups(r)[0]!, 50)
    // The grid hit from the bass's own C2 (36), the note from E2 (40).
    expect(hits.map((h) => h.midi)).toEqual([39.5, 43.5])
    expect(hits[0]!.shape).toEqual({ rate: 1, level: 1, pan: 0, attack: 0, release: 0, mode: 'oneshot' })
  })

  it('reads legato and a notes-only pad’s line', () => {
    const r = card('[C] bars 1', 'notes', 'C7 at 1.1.1 note C4', 'pad C7 mode legato release 40')
    const view = viewGroups(r)[0]!
    expect(view.rows[0]!.shaping).toMatchObject({ pad: 'C7', mode: 'legato', release: 40 })
    expect(groupHits(r, view, 50)[0]!.shape).toMatchObject({ mode: 'legato', release: 0.4 })
  })
})

describe('effect lines', () => {
  it('reads them from the result, null for each kind the card has none of', () => {
    const r = card('fx delay 62 55', 'send C 30', '[A] bars 1')
    expect(cardFx(r)).toEqual({ fx: { type: 'delay', x: 62, y: 55 }, sends: { C: 30 }, comp: null, sidechain: null })
    expect(hasFx(cardFx(r))).toBe(true)
    expect(hasFx(cardFx(card('[A] bars 1')))).toBe(false)
    expect(hasFx(cardFx(card('comp off', '[A] bars 1')))).toBe(true)
  })
})

describe('scenes', () => {
  const breakcore = parseBeatCard(CARDS.find((c) => c.heading === 'Breakcore arrangement')!.card)

  it('a card without scene lines is its own one scene, playing as before', () => {
    const house = parseBeatCard(CARDS.find((c) => c.heading === 'House')!.card)
    expect(sceneCard(house, 0)).toBe(house)
    const loops = viewGroups(house).map((v) => ({ length: v.group.length, hits: groupHits(house, v, 52) }))
    expect(sceneSteps(house, 0, 52)).toEqual([{ scene: 0, loops, length: 384, passes: Infinity }])
    expect(chainSteps(house, 52)).toEqual([{ ...sceneSteps(house, 0, 52)[0], passes: 1 }])
  })

  it('a scene plays its own sections and the ones it carries, each with its own lines', () => {
    const r = card(
      'scene',
      '[A]',
      'A7 kick | X... .... .... .... |',
      '[B]',
      'sound B7 400 Bass',
      'pad B7 pitch -5',
      'notes',
      'B7 at 1.1.1 note E1',
      'scene Two',
      '[A]',
      'pad A7 level 50',
      'A7 kick | X.X. .... .... .... |',
    )
    const two = sceneCard(r, 1)
    expect(two.groups.map((g) => [g.group, g.line])).toEqual([
      ['A', 11],
      ['B', 5],
    ])
    expect(two.notes.map((n) => n.line)).toEqual([9])
    expect(two.sounds.map((x) => x.pad)).toEqual(['B7'])
    expect(two.pads.map((p) => [p.pad, p.level ?? p.pitch])).toEqual([
      ['A7', 50],
      ['B7', -5],
    ])
    const [a, b] = sceneLoops(r, 1, 50)
    expect(a!.hits.map((h) => [h.tick, h.shape?.level])).toEqual([
      [0, 0.5],
      [48, 0.5],
    ])
    // The carried bass: its note moved by its pad line's pitch, E1 (28) down 5.
    expect(b!.hits.map((h) => [h.pad, h.midi])).toEqual([['B7', 23]])
    // Scene one's kick has no pad line.
    expect(sceneLoops(r, 0, 50)[0]!.hits[0]!.shape).toBeUndefined()
  })

  it('builds the chain’s steps: each scene once, its passes and its longest pattern', () => {
    const steps = chainSteps(breakcore, 50)
    expect(steps.map((s) => [s.scene, s.passes, s.length, s.loops.length])).toEqual([
      [0, 2, 768, 2],
      [1, 2, 768, 2],
      [2, 1, 768, 2],
      [3, 1, 768, 2],
      [4, 2, 768, 2],
    ])
    // Build plays Breakdown's bass.
    expect(steps[3]!.loops[1]).toEqual(sceneLoops(breakcore, 2, 50)[1])
    expect(firstStepOf(steps, 3)).toBe(3)
    expect(firstStepOf(steps, 9)).toBe(0)
    const once = parseBeatCard(['ARC BEAT 1', 'scene', '[A] bars 2', 'A7 | X... .... .... .... | .... .... .... .... |', 'scene', 'scene'].join('\n'))
    expect(chainSteps(once, 50).map((s) => [s.scene, s.passes, s.length])).toEqual([
      [0, 1, 768],
      [1, 1, 768],
      [2, 1, 768],
    ])
    expect(sceneSteps(once, 2, 50)[0]).toMatchObject({ scene: 2, passes: Infinity, length: 768 })
  })
})
