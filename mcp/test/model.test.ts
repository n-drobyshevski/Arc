// views/beat/model.ts: the rows, stand-in voices and hits the beat view draws
// and plays, from parsed cards.
import { describe, expect, it } from 'vitest'
import { parseBeatCard, type BeatCardResult } from '../../web/src/core/formats/beatCard'
import { CARDS } from '../../web/test/core/formats/beatCardFixtures'
import {
  audible,
  groupHits,
  isBeatCardResult,
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
