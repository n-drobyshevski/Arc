// Port of the reader parts of core/src/test/kotlin/dev/arc/ep133/features/BeatCardSynthTest.kt (the same cases, in the same order).
// The cases are the shared ones of skill/arc-beats/scripts/test_synth_cases.txt, which Kotlin and scripts/beatcard.py read too.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BeatCards, beatCard, cardPad, cardSection, cardSound, cardSynth, type BeatCard, type CardRead, type CardSection, type CardSynth } from '../../../src/core/features/beatCard'
import { PlayMode } from '../../../src/core/features/padSettings'
import { padKey, physicalPad } from '../../../src/core/features/padNotes'
import { pattern, patternNote } from '../../../src/core/features/pattern'

interface SynthCase {
  readonly name: string
  readonly text: string
  /** The problems as `<line> <error|warning> <message>`, in order. */
  readonly expect: readonly string[]
}

/** The cases of the shared file: lines before the first === are comments; a card, then --- expect, then --- python. */
function synthCases(file: string): SynthCase[] {
  const out: SynthCase[] = []
  let name: string | null = null
  let card: string[] = []
  let expected: string[] = []
  let part: 'card' | 'expect' | 'python' = 'python'
  const flush = (): void => {
    if (name !== null) out.push({ name, text: card.join('\n'), expect: expected })
  }
  for (const line of file.split(/\r?\n/)) {
    if (line.startsWith('=== ')) {
      flush()
      name = line.slice(4).trim()
      card = []
      expected = []
      part = 'card'
    } else if (name === null) continue
    else if (line === '--- expect') part = 'expect'
    else if (line === '--- python') part = 'python'
    else if (part === 'card') card.push(line)
    else if (part === 'expect' && line !== '') expected.push(line)
  }
  flush()
  return out
}

const file = readFileSync(new URL('../../../../skill/arc-beats/scripts/test_synth_cases.txt', import.meta.url), 'utf8')
const cases = synthCases(file)
const byName = new Map(cases.map((c) => [c.name, c]))

const problems = (r: CardRead): string[] => r.problems.map((p) => `${p.line} ${p.error ? 'error' : 'warning'} ${p.message}`)

/** The card of the case called [name], which must read. */
const cardOf = (name: string): BeatCard => {
  const c = byName.get(name)
  if (c === undefined) throw new Error(`no case ${name}`)
  const r = BeatCards.read(c.text)
  expect(r.card, name).not.toBeNull()
  return r.card!
}

/** The first section's synth lines, as a plain list in pad order. */
const synthsOf = (s: CardSection): [number, CardSynth][] => [...(s.synths ?? new Map<number, CardSynth>())].sort((x, y) => x[0] - y[0])

describe('BeatCardSynthTest', () => {
  // ---- 1. the shared cases ----

  it('the shared file has every case', () => {
    expect(cases.map((c) => c.name)).toEqual([
      'minimal', 'every-key', 'any-case', 'header', 'after-notes', 'bar', 'too-short', 'pad-and-group', 'unknown-type', 'unknown-setting',
      'unknown-words', 'knobs-bad', 'knobs-edges', 'notes-bad', 'notes-edges', 'lengths-bad', 'lengths-ok', 'missing-value', 'names',
      'bad-names', 'duplicate', 'duplicate-with-error', 'one-line-order', 'skipped-section', 'sound-and-synth', 'scenes', 'silent-pads',
    ])
  })

  for (const c of cases) {
    it(`case ${c.name}: the problems, in order, and a card only when none is an error`, () => {
      const r = BeatCards.read(c.text)
      expect(problems(r), c.text).toEqual(c.expect)
      expect(r.card === null).toBe(c.expect.some((p) => / error /.test(p)))
    })
  }

  // ---- 2. what each case reads as ----

  it('minimal', () => {
    expect(synthsOf(cardOf('minimal').sections[0]!)).toEqual([[9, cardSynth('kick')]])
  })

  it('every-key', () => {
    const c = cardOf('every-key')
    expect(synthsOf(c.sections[0]!)).toEqual([
      [
        9,
        cardSynth('bass', {
          note: 36, wave: 'square', chord: 'oct', attack: 3, decay: 25, length: 125, tone: 30, reso: 75, sweep: 70, bend: 5,
          click: 10, noise: 5, snap: 20, drive: 40, detune: 10, level: 90, seed: 7, name: 'acid_bass',
        }),
      ],
    ])
    const line = byName.get('every-key')!.text.split('\n')[2]!
    expect(BeatCards.write(c).split('\n').filter((l) => l.startsWith('synth'))).toEqual([line])
  })

  it('any-case', () => {
    const c = cardOf('any-case')
    const s = c.sections[0]!.synths!.get(9)!
    expect(s).toEqual(cardSynth('kick', { decay: 20, wave: 'saw', name: 'Decay' }))
    // Fields the line didn't give are left out, not undefined.
    expect(Object.keys(s).sort()).toEqual(['decay', 'name', 'type', 'wave'])
    expect(BeatCards.write(c).split('\n').filter((l) => l.startsWith('synth'))).toEqual(['synth A7 kick wave saw decay 20 name Decay'])
  })

  it('after-notes', () => {
    expect(cardOf('after-notes').sections[0]!.synths!.get(3)).toEqual(cardSynth('sub', { note: 36 }))
  })

  it('unknown-type', () => {
    expect(synthsOf(cardOf('unknown-type').sections[0]!).map(([o]) => o)).toEqual([10])
  })

  it('unknown-setting', () => {
    const synths = cardOf('unknown-setting').sections[0]!.synths!
    expect([...synths.keys()]).toEqual([9, 10, 11, 6])
    for (const s of synths.values()) expect(s).toEqual(cardSynth('kick', { tone: 40 }))
  })

  it('unknown-words', () => {
    const s = cardOf('unknown-words').sections[0]!.synths!.get(9)!
    expect(s.wave).toBeUndefined()
    expect(s.chord).toBeUndefined()
    expect(s).toEqual(cardSynth('stab', { tone: 50 }))
  })

  it('knobs-edges', () => {
    const synths = cardOf('knobs-edges').sections[0]!.synths!
    expect(synths.get(9)).toEqual(cardSynth('kick', { attack: 0, decay: 100, level: 1, seed: 999 }))
    expect(synths.get(10)).toEqual(cardSynth('kick', { tone: 0, drive: 7 }))
  })

  it('notes-edges', () => {
    expect(synthsOf(cardOf('notes-edges').sections[0]!).map(([, s]) => s.note)).toEqual([12, 96, 30])
  })

  it('lengths-ok', () => {
    const c = cardOf('lengths-ok')
    expect(synthsOf(c.sections[0]!).map(([, s]) => s.length)).toEqual([400, 50, 5, 250])
    // Written in keypad order: 7 8 before 5 6.
    expect(BeatCards.write(c).split('\n').filter((l) => l.startsWith('synth'))).toEqual([
      'synth D7 riser length 0.05',
      'synth D8 riser length 2.5',
      'synth D5 riser length 4',
      'synth D6 riser length 0.5',
    ])
  })

  it('a length with a line separator after it is refused, as Arc and the script refuse it', () => {
    for (const end of ['\u0085', ' ', ' ']) {
      for (const v of ['1', '2.5']) {
        const r = BeatCards.read(`ARC BEAT 1\n[A] bars 1 step 1/16\nsynth A7 kick length ${v}${end}\n`)
        expect(r.card).toBeNull()
        expect(problems(r)).toEqual(['3 error A7 synth: length must be 0.05 to 4 seconds, with up to two decimals.'])
      }
    }
  })

  it('names', () => {
    expect(synthsOf(cardOf('names').sections[0]!).map(([, s]) => s.name)).toEqual(['808_kick', 'a_very_long_k', '808'])
  })

  it('duplicate', () => {
    expect(cardOf('duplicate').sections[0]!.synths!.get(9)).toEqual(cardSynth('kick', { decay: 60 }))
  })

  it('sound-and-synth', () => {
    const s = cardOf('sound-and-synth').sections[0]!
    expect([...s.sounds.keys()]).toEqual([9])
    expect([...s.synths!.keys()]).toEqual([9])
  })

  // ---- 3. round trips ----

  it('every case with no error reads back as itself', () => {
    for (const c of cases) {
      const r = BeatCards.read(c.text)
      if (r.card === null) continue
      const text = BeatCards.write(r.card)
      const back = BeatCards.read(text)
      expect(back.problems.filter((p) => p.message.includes('synth')), `${c.name}\n${text}`).toEqual([])
      expect(back.card, `${c.name}\n${text}`).toEqual(r.card)
    }
  })

  // ---- 4. where the writer puts them ----

  it('a section writes its sound lines, then its synth lines, then its pad lines, each in keypad order', () => {
    const s = cardSection(
      0,
      null,
      pattern(1, [patternNote(0, 9, 24)]),
      new Map([[3, cardSound(5, 'Snare')], [9, cardSound(12, 'Kick')]]),
      new Map([[0, cardPad({ level: 80 })], [9, cardPad({ mode: PlayMode.KEY })]]),
      new Map([[0, cardSynth('zap')], [3, cardSynth('snare', { decay: 30 })], [9, cardSynth('kick', { name: '808_kick', note: 29 })]]),
    )
    const lines = BeatCards.write(beatCard(null, null, 50, [s])).split('\n')
    expect(lines.slice(3, 11)).toEqual([
      '[A] bars 1 step 1/16',
      'sound A7 12 Kick',
      'sound A1 5 Snare',
      'synth A7 kick note F1 name 808_kick',
      'synth A1 snare decay 30',
      'synth A. zap',
      'pad A7 mode key',
      'pad A. level 80',
    ])
    // A section built without synths has none, so it equals one read from a card without them.
    expect('synths' in cardSection(0, null, pattern(1, []))).toBe(false)
  })

  // ---- 5. scenes ----

  it('scenes: the last synth line for a pad wins, and each scene writes its own', () => {
    const c = cardOf('scenes')
    const synths = BeatCards.synthsByPad(c)
    expect([...synths]).toEqual([[padKey(physicalPad(0, 9)), cardSynth('kick', { decay: 60 })]])
    const text = BeatCards.write(c)
    expect(text.includes('synth A7 kick decay 40\n')).toBe(true)
    expect(text.includes('synth A7 kick decay 60\n')).toBe(true)
  })

  // ---- 6. silent pads ----

  it('silent-pads: a pad with a synth line is not silent', () => {
    expect(BeatCards.silentPads(cardOf('silent-pads'), () => null, true)).toEqual([physicalPad(0, 10)])
  })

  // ---- 7. the spec's example ----

  it("the spec's example card still writes back as itself", () => {
    const spec = readFileSync(new URL('../../../../skill/arc-beats/references/beat-card.md', import.meta.url), 'utf8')
    const example = spec.slice(spec.indexOf('```\n') + 4).split('\n```')[0]!
    const r = BeatCards.read(example)
    expect(problems(r)).toEqual([])
    expect(r.card!.sections.every((s) => s.synths === undefined)).toBe(true)
    const names = new Map([[9, 'kick'], [11, 'snare'], [6, 'hat']])
    expect(BeatCards.write(r.card!, (p) => (p.group === 0 ? (names.get(p.offset) ?? null) : null))).toBe(example + '\n')
  })
})
