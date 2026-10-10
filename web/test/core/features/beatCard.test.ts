// Port of core/src/test/kotlin/dev/arc/ep133/features/BeatCardTest.kt (the same cases, in the same order).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BeatCards, SoundStatus, beatCard, cardFx, cardPad, cardSection, cardSound, type BeatCard, type CardPad, type CardRead, type CardSection, type CardSound, type SoundPick } from '../../../src/core/features/beatCard'
import { FxSettings, FxType, comp, sidechain } from '../../../src/core/features/fxSettings'
import { PadSettings, PlayMode } from '../../../src/core/features/padSettings'
import { padKey, physicalPad, type PhysicalPad } from '../../../src/core/features/padNotes'
import { Pattern, ProjectSeq, Seq, Timing, pattern, patternNote, projectSeq, scene, type PatternNote } from '../../../src/core/features/pattern'
import { Steps } from '../../../src/core/features/steps'
import { ClaudeText } from '../../../src/core/text/claudeText'

/** The spec's own text: its first fenced block is the example card. */
const spec = readFileSync(new URL('../../../../skill/arc-beats/references/beat-card.md', import.meta.url), 'utf8')
const example = spec.slice(spec.indexOf('```\n') + 4).split('\n```')[0]!

const named = (entries: [PhysicalPad, string][]) => {
  const m = new Map(entries.map(([p, n]) => [padKey(p), n]))
  return (p: PhysicalPad): string | null => m.get(padKey(p)) ?? null
}
const exampleNames = named([
  [physicalPad(0, 9), 'kick'],
  [physicalPad(0, 11), 'snare'],
  [physicalPad(0, 6), 'hat'],
])

const hit = (tick: number, offset: number, gate = 24, semi: number | null = null, vel = 127): PatternNote => patternNote(tick, offset, gate, semi, vel)

const key = (n: PatternNote): string => `${n.tick}/${n.offset}/${n.gate}/${n.semitones}/${n.velocity}`

/** A pattern's notes as a sorted list: the order and the ids don't count. */
const keys = (p: Pattern): string[] => p.notes.map(key).sort()
const keyList = (...notes: PatternNote[]): string[] => notes.map(key).sort()

const problems = (r: CardRead): string[] => r.problems.map((p) => `${p.line} ${p.error ? 'error' : 'warning'}: ${p.message}`)

const text = (...lines: string[]): string => lines.join('\n')

const bar = 'A7 | X... .... .... .... |'

const read = (...lines: string[]): CardRead => BeatCards.read(text(...lines))

const section = (r: CardRead, i = 0): CardSection => r.card!.sections[i]!

const card = (sections: CardSection[], swing = 50): BeatCard => beatCard(null, null, swing, sections)

const a = (notes: PatternNote[] = [], o: { bars?: number; group?: number; number?: number | null; sounds?: Map<number, CardSound>; pads?: Map<number, CardPad> } = {}): CardSection =>
  cardSection(o.group ?? 0, o.number ?? null, pattern(o.bars ?? 1, notes), o.sounds ?? new Map(), o.pads ?? new Map())

const snd = (slot: number, name: string | null = null): CardSound => cardSound(slot, name)

/** A sections' sounds as a plain list, in pad order: Maps compare by content, but the failures read better. */
const soundsOf = (s: CardSection): [number, CardSound][] => [...s.sounds].sort((x, y) => x[0] - y[0])
const sm = (...entries: [number, CardSound][]): Map<number, CardSound> => new Map(entries)

/** What follows the header: the text after its blank line, without the last newline. */
const body = (s: string): string => s.slice(s.indexOf('\n\n') + 2).trimEnd()

const rowOf = (s: string, label: string): string => s.split('\n').find((l) => l.startsWith(label))!

describe('BeatCardTest', () => {
  // ---- reading ----

  it("the spec's example card reads, and writes back as itself", () => {
    const r = BeatCards.read(example)
    expect(problems(r)).toEqual([])
    const c = r.card!
    expect(c.name).toBe('Lazy boom bap')
    expect(c.tempo).toBe(92)
    expect(c.swing).toBe(58)
    expect(c.sections.length).toBe(1)
    expect(c.sections[0]!.group).toBe(0)
    expect(c.sections[0]!.number).toBeNull()
    expect(c.sections[0]!.pattern.bars).toBe(1)
    // The odd steps play 4 ticks late at swing 58; the notes list isn't swung.
    const kick = [0, 144, 192].map((t) => key(hit(t, 9, 24, null, t === 144 ? 100 : 127)))
    const snare = [key(hit(96, 11)), key(hit(288, 11)), key(hit(364, 11, 24, null, 64))]
    const hat = [0, 48, 96, 144, 192, 240, 288, 336].map((t) => key(hit(t, 6, 24, null, 100))).concat(key(hit(364, 6, 24, null, 64)))
    const notes = [key(hit(366, 11, 24, null, 50)), key(hit(0, 3, 48, 0))]
    expect(keys(c.sections[0]!.pattern)).toEqual([...kick, ...snare, ...hat, ...notes].sort())
    expect(c.sections[0]!.pattern.notes.length).toBe(kick.length + snare.length + hat.length + notes.length)
    expect(BeatCards.write(c, exampleNames)).toBe(example + '\n')
    // The whole spec file reads as the example: the text before it and the closing fence are left out.
    expect(BeatCards.read(spec).card).toEqual(c)
  })

  it('text around the card is ignored, and reading stops at a closing fence or END', () => {
    const chat = text('Sure, here is a beat:', '', '```text', 'ARC BEAT 1', '[A]', bar, '```', 'Hope you like it!', '[B]', 'B7 | oops |')
    const r = BeatCards.read(chat)
    expect(problems(r)).toEqual([])
    expect(r.card!.sections.length).toBe(1)
    expect(keys(section(r).pattern)).toEqual(keyList(hit(0, 9)))
    // Lines count in the text given, chat and all.
    const bad = text('Sure:', '```', 'ARC BEAT 1', '[A]', 'A9 | X... .... .... ... |', '```')
    expect(problems(BeatCards.read(bad))).toEqual(['5 error: A9 bar 1 has 15 steps, needs 16.'])
    for (const end of ['END', 'end', '  End  ']) {
      const r2 = read('ARC BEAT 1', '[A]', bar, end, '[B]', 'B7 | oops |')
      expect(r2.card!.sections.map((s) => s.group)).toEqual([0])
      expect(problems(r2)).toEqual([])
    }
    // Chat text that merely mentions the name isn't the start; CRLF line ends and a byte order mark are fine.
    const r3 = BeatCards.read(`\uFEFFHere is your ARC BEAT:\r\nARC BEAT 1\r\n[A]\r\n${bar}\r\n`)
    expect(problems(r3)).toEqual([])
    expect(section(r3).pattern.notes.length).toBe(1)
  })

  it('a text has a card when it has an ARC BEAT line, mistakes or not', () => {
    expect(BeatCards.hasCard(`ARC BEAT 1\n[A]\n${bar}`)).toBe(true)
    expect(BeatCards.hasCard('Sure:\n```\n  arc beat 1\r\n[A]')).toBe(true)
    expect(BeatCards.hasCard('\uFEFFARC BEAT')).toBe(true)
    // A card with a mistake is still a card; a mention of the name, or none, isn't.
    expect(BeatCards.hasCard('ARC BEAT x\n[A]')).toBe(true)
    expect(BeatCards.hasCard('Here is your ARC BEAT: enjoy')).toBe(false)
    expect(BeatCards.hasCard(`[A]\n${bar}`)).toBe(false)
    expect(BeatCards.hasCard('')).toBe(false)
  })

  it('comments, blank lines and the case of keywords', () => {
    const r = read('ARC BEAT 1 # version', '# a whole line', '', 'name Foo # trailing', '[A] # section', 'A7 | X... .... .... .... | # kick', '   ', '# end')
    expect(problems(r)).toEqual([])
    expect(r.card!.name).toBe('Foo')
    expect(section(r).pattern.notes.length).toBe(1)
    const up = read('arc beat 1', 'NAME Foo', 'TEMPO 100', 'SWING 60', '[A] BARS 1 STEP 1/16', bar, 'NOTES', 'A9 AT 1.1.1 VEL 5 GATE 1/8 NOTE C4')
    expect(problems(up)).toEqual([])
    expect(up.card).toEqual(beatCard('Foo', 100, 60, up.card!.sections))
    expect(keys(section(up).pattern)).toEqual(keyList(hit(0, 9), hit(0, 11, 48, 0, 5)))
    // Pad labels, X and x, and note names do count.
    expect(problems(read('ARC BEAT 1', '[A]', 'a7 | X... .... .... .... |'))).toEqual(["3 error: 'a7' isn't a pad. Use A to D, then . 0 E or 1 to 9."])
    expect(problems(read('ARC BEAT 1', '[A]', bar, 'notes', 'A9 at 1.1.1 note c4'))).toEqual(['5 error: A9 note: note must be a name from C-1 to G9, such as C4.'])
  })

  it('a card needs its version, and a newer one is refused', () => {
    expect(problems(BeatCards.read(`[A]\n${bar}`))).toEqual(['1 error: No ARC BEAT line found.'])
    expect(problems(BeatCards.read(''))).toEqual(['1 error: No ARC BEAT line found.'])
    expect(problems(BeatCards.read(`ARC BEAT\n[A]\n${bar}`))).toEqual(['1 error: ARC BEAT needs a version, as in ARC BEAT 1.'])
    expect(problems(BeatCards.read(`ARC BEAT one\n[A]\n${bar}`))).toEqual(['1 error: ARC BEAT needs a version, as in ARC BEAT 1.'])
    expect(problems(BeatCards.read(`ARC BEAT 0\n[A]\n${bar}`))).toEqual(['1 error: ARC BEAT needs a version, as in ARC BEAT 1.'])
    const newer = BeatCards.read(`ARC BEAT 2\nfuture 1\n[A]\n${bar}`)
    expect(newer.card).toBeNull()
    expect(problems(newer)).toEqual(['1 error: This card was made by a newer Arc (version 2).'])
    expect(problems(BeatCards.read('\nARC BEAT 1\nname Empty'))).toEqual(['2 error: The card has no section, such as [A].'])
  })

  it('the header', () => {
    const r = read('ARC BEAT 1', 'name Lazy boom bap', 'tempo 92.5', 'swing 66', '[A]', bar)
    expect(r.card).toEqual(beatCard('Lazy boom bap', 92.5, 66, r.card!.sections))
    const bare = read('ARC BEAT 1', '[A]', bar).card!
    expect(bare.name).toBeNull()
    expect(bare.tempo).toBeNull()
    expect(bare.swing).toBe(50)
    // The range of each word.
    expect(read('ARC BEAT 1', 'tempo 40', '[A]', bar).card!.tempo).toBe(40)
    expect(read('ARC BEAT 1', 'tempo 240.0', '[A]', bar).card!.tempo).toBe(240)
    expect(read('ARC BEAT 1', 'swing 75', '[A]', bar).card!.swing).toBe(75)
    for (const t of ['39.9', '241', 'abc', '92.55', '-92', '', '92 bpm']) {
      expect(problems(read('ARC BEAT 1', `tempo ${t}`, '[A]', bar)), t).toEqual(['2 error: Tempo must be 40 to 240, whole or with one decimal.'])
    }
    for (const s of ['49', '76', '58.5', 'x', '']) {
      expect(problems(read('ARC BEAT 1', `swing ${s}`, '[A]', bar)), s).toEqual(['2 error: Swing must be a whole number from 50 to 75.'])
    }
    // A title is kept to 40 characters; the last of a repeated word counts.
    const long = read('ARC BEAT 1', 'name ' + 'x'.repeat(45), '[A]', bar)
    expect(problems(long)).toEqual(['2 warning: Name is longer than 40 characters, shortened.'])
    expect(long.card!.name).toBe('x'.repeat(40))
    expect(problems(read('ARC BEAT 1', 'name', '[A]', bar))).toEqual(['2 warning: Name is empty, ignored.'])
    // Characters are counted and cut as whole characters: a surrogate pair is never split.
    const smile = '\u{1F600}'
    const fit = read('ARC BEAT 1', 'name a' + smile.repeat(20), '[A]', bar)
    expect(problems(fit)).toEqual([])
    expect(fit.card!.name).toBe('a' + smile.repeat(20))
    const wide = read('ARC BEAT 1', 'name a' + smile.repeat(45), '[A]', bar)
    expect(problems(wide)).toEqual(['2 warning: Name is longer than 40 characters, shortened.'])
    expect(wide.card!.name).toBe('a' + smile.repeat(39))
    expect(read('ARC BEAT 1', 'tempo 90', 'tempo 100', '[A]', bar).card!.tempo).toBe(100)
    // Words a newer card may add, and header words too late, only warn.
    const odd = read('ARC BEAT 1', 'groove 3', '[A]', bar, 'tempo 100')
    expect(problems(odd)).toEqual(["2 warning: Unknown header word 'groove', ignored.", "5 warning: 'tempo' belongs before the first section, ignored."])
    expect(odd.card!.tempo).toBeNull()
    // Rows and notes need a section.
    expect(problems(read('ARC BEAT 1', bar, '[A]', bar))).toEqual(["2 error: 'A7' needs a section first, such as [A]."])
    expect(problems(read('ARC BEAT 1', 'notes', '[A]', bar))).toEqual(["2 error: 'notes' needs a section first, such as [A]."])
  })

  it('sections', () => {
    const r = read('ARC BEAT 1', '[A07] bars 2 step 1/8', 'A7 | X... .... |  X... .... |', '', '[D] step 1/16T', 'D7 | Xxo. .... .... .... .... .... |')
    expect(problems(r)).toEqual([])
    expect(r.card!.sections.map((s) => s.group)).toEqual([0, 3])
    expect(r.card!.sections.map((s) => s.number)).toEqual([7, null])
    expect(r.card!.sections.map((s) => s.pattern.bars)).toEqual([2, 1])
    // 1/8 steps are 48 ticks; 1/16T steps 16.
    expect(keys(section(r, 0).pattern)).toEqual(keyList(hit(0, 9, 48), hit(384, 9, 48)))
    expect(keys(section(r, 1).pattern)).toEqual(keyList(hit(0, 9, 16), hit(16, 9, 16, null, 100), hit(32, 9, 16, null, 64)))
    // The pattern number is 1 to 99, written with or without a zero.
    expect(read('ARC BEAT 1', '[A1]', bar).card!.sections[0]!.number).toBe(1)
    expect(read('ARC BEAT 1', '[A99]', bar).card!.sections[0]!.number).toBe(99)
    for (const s of ['[A100]', '[A0]', '[A00]', '[A123]']) {
      const digits = s.slice(2, s.length - 1)
      expect(problems(read('ARC BEAT 1', s, bar)), s).toEqual([`2 error: The pattern number in [A${digits}] must be 1 to 99.`])
    }
    // Faults on the section line; its rows aren't blamed for them.
    expect(problems(read('ARC BEAT 1', '[E]', 'E7 | X |'))).toEqual(['2 error: A section needs a group A to D, as in [A] or [A07].'])
    expect(problems(read('ARC BEAT 1', '[]', bar))).toEqual(['2 error: A section needs a group A to D, as in [A] or [A07].'])
    expect(problems(read('ARC BEAT 1', '[a]', bar))).toEqual(['2 error: A section needs a group A to D, as in [A] or [A07].'])
    expect(problems(read('ARC BEAT 1', '[A bars 2', bar))).toEqual(['2 error: A section needs a closing ], as in [A].'])
    for (const b of ['0', '100', 'x', '-1', '']) {
      expect(problems(read('ARC BEAT 1', `[A] bars ${b}`, bar)), b).toEqual(['2 error: bars must be a whole number from 1 to 99.'])
    }
    expect(problems(read('ARC BEAT 1', '[A] step 1/4', bar))).toEqual(['2 error: step must be one of 1/8 1/16 1/32 1/8T 1/16T.'])
    expect(problems(read('ARC BEAT 1', '[A] step', bar))).toEqual(['2 error: step must be one of 1/8 1/16 1/32 1/8T 1/16T.'])
    expect(read('ARC BEAT 1', '[A] bars 99', 'A7 | ' + 'X... .... .... .... '.repeat(99) + '|').card!.sections[0]!.pattern.bars).toBe(99)
    // A group comes once; the second is still read, for its own faults.
    const twice = read('ARC BEAT 1', '[A]', bar, '[B]', 'B7 | X... .... .... .... |', '[A]', 'A9 | X... |')
    expect(problems(twice)).toEqual(['6 error: Group A has two sections.', '7 error: A9 bar 1 has 4 steps, needs 16.'])
    expect(twice.card).toBeNull()
    // Words a newer card may add only warn, with their value.
    const newer = read('ARC BEAT 1', '[A] colour red bars 2 loud', 'A7 | X... .... .... .... | .... .... .... .... |')
    expect(problems(newer)).toEqual(["2 warning: Unknown option 'colour' on [A], ignored.", "2 warning: Unknown option 'loud' on [A], ignored."])
    expect(section(newer).pattern.bars).toBe(2)
    // A card with no [ line has no section.
    expect(problems(read('ARC BEAT 1'))).toEqual(['1 error: The card has no section, such as [A].'])
  })

  it('grid rows', () => {
    // Every step character, and a hold.
    const r = read('ARC BEAT 1', '[A]', 'A7 kick drum | Xxo1 9--. .... .... |')
    expect(problems(r)).toEqual([])
    expect(keys(section(r).pattern)).toEqual(keyList(hit(0, 9), hit(24, 9, 24, null, 100), hit(48, 9, 24, null, 64), hit(72, 9, 24, null, 14), hit(96, 9, 72, null, 126)))
    // Pads are written as printed on the device; ENTER is E; the name is for reading only.
    const pads = read(
      'ARC BEAT 1', '[A]',
      'A. | X... .... .... .... |', 'A0|.X.. .... .... ....|', 'AE | ..X. .... .... .... |', 'AENTER | ...X .... .... .... |',
      'A1 | .... X... .... .... |', 'A2 | .... .X.. .... .... |', 'A3 | .... ..X. .... .... |', 'A4 | .... ...X .... .... |',
      'A5 | .... .... X... .... |', 'A6 | .... .... .X.. .... |', 'A7 | .... .... ..X. .... |', 'A8 | .... .... ...X .... |',
      'A9 | .... .... .... X... |',
    )
    expect(problems(pads)).toEqual([])
    expect(section(pads).pattern.notes.map((n) => n.offset)).toEqual([0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(section(pads).pattern.notes.map((n) => n.tick).sort((x, y) => x - y)).toEqual(Array.from({ length: 13 }, (_, i) => i * 24))
    // Spaces and bars between the steps don't count; the hold goes across a bar line.
    const two = read('ARC BEAT 1', '[A] bars 2', 'A7 | .... .... .... ...X | -- .. .... .... ...x |')
    expect(keys(section(two).pattern)).toEqual(keyList(hit(360, 9, 72), hit(744, 9, 24, null, 100)))
    // A pad may have more than one row.
    const ghosts = read('ARC BEAT 1', '[A]', 'A4 | x... x... x... x... |', 'A4 | .o.. .o.. .o.. .o.. |')
    expect(section(ghosts).pattern.notes.length).toBe(8)
    expect(problems(ghosts)).toEqual([])
    // The same pad at the same tick is one hit, the louder, with a warning at the later row.
    for (const rows of [['x...', 'X...'], ['X...', 'x...'], ['X...', 'X...']]) {
      const dup = read('ARC BEAT 1', '[A]', `A7 | ${rows[0]} .... .... .... |`, `A7 | ${rows[1]} .... .... .... |`)
      expect(problems(dup)).toEqual(['4 warning: A7 has two hits at 1.1.1, kept the louder.'])
      expect(section(dup).pattern.notes.map((n) => n.velocity)).toEqual([127])
    }
  })

  it('grid row errors name the row and the bar', () => {
    const one = (lines: string[], header = '[A]'): string[] => problems(BeatCards.read(text('ARC BEAT 1', header, ...lines)))
    expect(one(['A7 | X... .... .... ... |'])).toEqual(['3 error: A7 bar 1 has 15 steps, needs 16.'])
    expect(one(['A7 | X... .... .... .... | .... .... .... ... |'], '[A] bars 2')).toEqual(['3 error: A7 bar 2 has 15 steps, needs 16.'])
    expect(one([bar], '[A] bars 2')).toEqual(['3 error: A7 bar 2 has 0 steps, needs 16.'])
    expect(one(['A7 | |'])).toEqual(['3 error: A7 bar 1 has 0 steps, needs 16.'])
    expect(one(['A7 | X... .... .... .... . |'])).toEqual(['3 error: A7 has 17 steps, needs 16.'])
    expect(one(['A7 | ' + 'X... .... .... .... '.repeat(2) + '. |'], '[A] bars 2')).toEqual(['3 error: A7 has 33 steps, needs 32.'])
    expect(one(['A7 | X |'], '[A] step 1/8')).toEqual(['3 error: A7 bar 1 has 1 step, needs 8.'])
    expect(one(['A7 | ' + '.'.repeat(20) + ' |'], '[A] step 1/16T')).toEqual(['3 error: A7 bar 1 has 20 steps, needs 24.'])
    expect(one(['A7 | X... .... .... ...z |'])).toEqual(["3 error: A7 bar 1 has 'z', which isn't one of X x o 1-9 - or ."])
    expect(one(['A7 | X... .... .... .... | 0... .... .... .... |'], '[A] bars 2')).toEqual(["3 error: A7 bar 2 has '0', which isn't one of X x o 1-9 - or ."])
    expect(one(['A7 | O... .... .... .... |'])).toEqual(["3 error: A7 bar 1 has 'O', which isn't one of X x o 1-9 - or ."])
    expect(one(['A7 | -... .... .... .... |'])).toEqual(['3 error: A7 bar 1 has a - with no hit before it.'])
    expect(one(['A7 | X.-. .... .... .... |'])).toEqual(['3 error: A7 bar 1 has a - with no hit before it.'])
    expect(one(['B7 | X... .... .... .... |'])).toEqual(['3 error: B7 is in group B, but the section is [A].'])
    expect(one(['Q7 | X... .... .... .... |'])).toEqual(["3 error: 'Q7' isn't a pad. Use A to D, then . 0 E or 1 to 9."])
    expect(one(['A10 | X... .... .... .... |'])).toEqual(["3 error: 'A10' isn't a pad. Use A to D, then . 0 E or 1 to 9."])
    expect(one(['| X... .... .... .... |'])).toEqual(['3 error: A row needs a pad before its first |.'])
    expect(one(['A7 X... .... .... ....'])).toEqual(['3 error: A7 needs a | before its steps.'])
    // Words that aren't rows only warn.
    expect(one(['groove 3'])).toEqual(["3 warning: Unknown word 'groove', ignored."])
    // Each fault is its own line; the card is not read.
    const many = BeatCards.read(text('ARC BEAT 1', '[A]', 'A7 | X |', 'A8 | X... .... .... .... |', 'A9 | z |'))
    expect(many.card).toBeNull()
    expect(many.problems.map((p) => p.line)).toEqual([3, 5])
    expect(many.problems.every((p) => p.error)).toBe(true)
  })

  it('swing bends the odd steps of 1_8 and 1_16 rows only', () => {
    const ticks = (header: string, swing: number, row: string): number[] =>
      read('ARC BEAT 1', `swing ${swing}`, header, `A7 | ${row} |`).card!.sections[0]!.pattern.notes.map((n) => n.tick)
    expect(ticks('[A]', 50, 'XXXX .... .... ....')).toEqual([0, 24, 48, 72])
    expect(ticks('[A]', 58, 'XXXX .... .... ....')).toEqual([0, 28, 48, 76])
    expect(ticks('[A]', 75, 'XXXX .... .... ....')).toEqual([0, 36, 48, 84])
    expect(ticks('[A] step 1/8', 66, 'XXXX ....')).toEqual([0, 63, 96, 159])
    expect(ticks('[A] step 1/8', 75, 'XXXX ....')).toEqual([0, 72, 96, 168])
    // Triplets and 32nds stay straight.
    expect(ticks('[A] step 1/8T', 75, 'XXXX .... ....')).toEqual([0, 32, 64, 96])
    expect(ticks('[A] step 1/16T', 75, 'XXXX ' + '....'.repeat(5))).toEqual([0, 16, 32, 48])
    expect(ticks('[A] step 1/32', 75, 'XXXX ' + '....'.repeat(7))).toEqual([0, 12, 24, 36])
    // The notes list never swings; a hold keeps its length.
    const r = read('ARC BEAT 1', 'swing 75', '[A]', 'A7 | .X-. .... .... .... |', 'notes', 'A9 at 1.1.2', 'A9 t 24 vel 50')
    expect(problems(r)).toEqual(['7 warning: A9 has two hits at 1.1.2, kept the louder.'])
    expect(keys(section(r).pattern)).toEqual(keyList(hit(36, 9, 48), hit(24, 11)))
  })

  it('the notes list', () => {
    const r = read(
      'ARC BEAT 1', '[A] bars 2', 'notes',
      'A9 at 1.1.1', 'A9 at 1.2.3+8', 'A9 at 1.1.2-3', 'A9 at 2.1.1', 'A9 t 100 vel 64 gate 10',
      'A1 at 1.1.1 note C4', 'A1 at 1.1.2 note C-1', 'A1 at 1.1.3 note G9', 'A1 at 1.1.4 note C#3',
      'AE at 1.2.1 semi -127', 'AE at 1.2.2 semi 127', 'AE at 1.2.3 semi +3', 'A. at 1.2.4 SEMI 0',
    )
    expect(problems(r)).toEqual([])
    const want = keyList(
      hit(0, 11), hit(152, 11), hit(21, 11), hit(384, 11), hit(100, 11, 10, null, 64),
      hit(0, 3, 24, 0), hit(24, 3, 24, -60), hit(48, 3, 24, 67), hit(72, 3, 24, -11),
      hit(96, 2, 24, -127), hit(120, 2, 24, 127), hit(144, 2, 24, 3), hit(168, 0, 24, 0),
    )
    expect(keys(section(r).pattern)).toEqual(want)
    // Defaults are vel 127, a 1/16 gate and a pad hit; every gate word.
    const gates = read('ARC BEAT 1', '[A]', 'notes', 'A9 t 0', 'A9 t 1 gate 1/4', 'A9 t 2 gate 1/8', 'A9 t 3 gate 1/16', 'A9 t 4 gate 1/32', 'A9 t 5 gate 1/8T', 'A9 t 6 gate 1/16T', 'A9 t 7 gate 1/8t', 'A9 t 8 gate 1')
    expect(section(gates).pattern.notes.map((n) => n.gate)).toEqual([24, 96, 48, 24, 12, 32, 16, 32, 1])
    expect(section(gates).pattern.notes.every((n) => n.velocity === 127 && n.semitones === null)).toBe(true)
    // KEYS notes of one pad at one tick are different notes; the same pitch is one.
    const chord = read('ARC BEAT 1', '[A]', 'notes', 'A9 t 0 note C4', 'A9 t 0 note E4', 'A9 t 0', 'A9 t 0 note C4 vel 50')
    expect(problems(chord)).toEqual(['7 warning: A9 has two hits at 1.1.1, kept the louder.'])
    expect(keys(section(chord).pattern)).toEqual(keyList(hit(0, 11, 24, 0), hit(0, 11, 24, 4), hit(0, 11)))
    // Options come in any order.
    const order = read('ARC BEAT 1', '[A]', 'notes', 'A9 gate 1/8 note D4 vel 20 at 1.1.1')
    expect(keys(section(order).pattern)).toEqual(keyList(hit(0, 11, 48, 2, 20)))
  })

  it('notes list errors', () => {
    const one = (lines: string[], header = '[A]'): string[] => problems(BeatCards.read(text('ARC BEAT 1', header, 'notes', ...lines)))
    const at = 'at needs bar.beat.sixteenth, with beat and sixteenth 1 to 4, as in 1.2.3 or 1.2.3+6.'
    expect(one(['A9 vel 50'])).toEqual(['4 error: A9 note needs at or t to place it.'])
    expect(one(['A9 t 384'])).toEqual(['4 error: A9 note at tick 384 is outside the pattern (0 to 383).'])
    expect(one(['A9 at 2.1.1'])).toEqual(['4 error: A9 note at tick 384 is outside the pattern (0 to 383).'])
    expect(one(['A9 at 1.1.1-1'])).toEqual(['4 error: A9 note at tick -1 is outside the pattern (0 to 383).'])
    expect(one(['A9 at 2.4.4+24'], '[A] bars 2')).toEqual(['4 error: A9 note at tick 768 is outside the pattern (0 to 767).'])
    for (const bad of ['1.5.1', '1.1.5', '0.1.1', '1.0.1', '1.1', '1.1.1.1', 'x', '1.1.1+', '1.1.1+x']) expect(one([`A9 at ${bad}`]), bad).toEqual([`4 error: A9 note: ${at}`])
    for (const bad of ['x', '-1', '1.5']) expect(one([`A9 t ${bad}`]), bad).toEqual(['4 error: A9 note: t needs a whole tick number.'])
    for (const bad of ['0', '128', 'x', '-5']) expect(one([`A9 t 0 vel ${bad}`]), bad).toEqual(['4 error: A9 note: vel must be 1 to 127.'])
    for (const bad of ['0', '1/3', 'x', '-5']) expect(one([`A9 t 0 gate ${bad}`]), bad).toEqual(['4 error: A9 note: gate must be a tick count or one of 1/4 1/8 1/16 1/32 1/8T 1/16T.'])
    for (const bad of ['H4', 'G#9', 'C', 'C10', 'Db4', 'c4', '60']) expect(one([`A9 t 0 note ${bad}`]), bad).toEqual(['4 error: A9 note: note must be a name from C-1 to G9, such as C4.'])
    for (const bad of ['128', '-128', 'x']) expect(one([`A9 t 0 semi ${bad}`]), bad).toEqual(['4 error: A9 note: semi must be -127 to 127.'])
    expect(one(['A9 at 1.1.1 t 0'])).toEqual(['4 error: A9 note has both at and t.'])
    expect(one(['A9 t 0 note C4 semi 1'])).toEqual(['4 error: A9 note has both note and semi.'])
    expect(one(['A9 t 0 semi 1 note C4'])).toEqual(['4 error: A9 note has both note and semi.'])
    expect(one(['A9 at'])).toEqual(['4 error: A9 note: at needs a value.'])
    expect(one(['B9 t 0'])).toEqual(['4 error: B9 is in group B, but the section is [A].'])
    expect(one(['Z9 t 0'])).toEqual(["4 error: 'Z9' isn't a pad. Use A to D, then . 0 E or 1 to 9."])
    // A word that isn't an option warns, and so does the value after it.
    const warn = BeatCards.read(text('ARC BEAT 1', '[A]', 'notes', 'A9 t 0 colour red vel 50 loud'))
    expect(problems(warn)).toEqual(["4 warning: Unknown option 'colour' on A9 note, ignored.", "4 warning: Unknown option 'loud' on A9 note, ignored."])
    expect(keys(warn.card!.sections[0]!.pattern)).toEqual(keyList(hit(0, 11, 24, null, 50)))
    // Rows can't follow the notes list: what is in it is a note.
    const row = BeatCards.read(text('ARC BEAT 1', '[A]', 'notes', 'A9 | X... .... .... .... |'))
    expect(row.card).toBeNull()
    expect(problems(row)).toContain('4 error: A9 note needs at or t to place it.')
    // The next section ends the list.
    const next = read('ARC BEAT 1', '[A]', 'notes', 'A9 t 0', '[B]', 'B7 | X... .... .... .... |')
    expect(problems(next)).toEqual([])
    expect(next.card!.sections.map((s) => s.pattern.notes.length)).toEqual([1, 1])
  })

  it('at most 2048 notes in a pattern', () => {
    const steps = 99 * 32
    const make = (hits: number): CardRead => BeatCards.read(text('ARC BEAT 1', '[A] bars 99 step 1/32', 'A7 | ' + 'x'.repeat(hits) + '.'.repeat(steps - hits) + ' |'))
    expect(problems(make(2048))).toEqual([])
    expect(make(2048).card!.sections[0]!.pattern.notes.length).toBe(2048)
    const over = make(2049)
    expect(problems(over)).toEqual(['2 error: Group A has 2049 notes, the most is 2048.'])
    expect(over.card).toBeNull()
    // Notes folded into one don't count twice.
    const folded = read('ARC BEAT 1', '[A]', 'notes', ...Array.from({ length: 3000 }, () => 'A9 t 5'))
    expect(folded.problems.length).toBe(2999)
    expect(folded.problems.some((p) => p.error)).toBe(false)
    expect(section(folded).pattern.notes.length).toBe(1)
  })

  // ---- writing ----

  it('the header, the sections in order, and the name', () => {
    const c = beatCard('  Lazy # boom |bap  ', 92.5, 66, [a([hit(0, 9)], { group: 2 }), a([hit(0, 9)], { group: 0, number: 2 })])
    const want =
      text(
        'ARC BEAT 1', 'name Lazy boom bap', 'tempo 92.5', 'swing 66', '',
        '[A02] bars 1 step 1/16', 'A7 | X... .... .... .... |', '',
        '[C] bars 1 step 1/16', 'C7 | X... .... .... .... |',
      ) + '\n'
    expect(BeatCards.write(c)).toBe(want)
    expect(BeatCards.write({ ...c, sections: [...c.sections].reverse() })).toBe(BeatCards.write(c))
    // Tempo is whole or one decimal; the name keeps to 40 characters; no title, no tempo, no line.
    expect(BeatCards.write({ ...c, tempo: 90 })).toContain('\ntempo 90\n')
    expect(BeatCards.write({ ...c, tempo: 92.04 })).toContain('\ntempo 92\n')
    expect(BeatCards.write({ ...c, tempo: 92.06 })).toContain('\ntempo 92.1\n')
    expect(BeatCards.write({ ...c, name: 'y'.repeat(50) })).toContain(`\nname ${'y'.repeat(40)}\n`)
    expect(BeatCards.write({ ...c, name: 'a' + '\u{1F600}'.repeat(50) })).toContain(`\nname a${'\u{1F600}'.repeat(39)}\n`)
    const plain = BeatCards.write({ ...c, name: null, tempo: null, swing: 50 })
    expect(plain.startsWith('ARC BEAT 1\nswing 50\n\n[A02]')).toBe(true)
    expect(BeatCards.write({ ...c, name: ' # | ' })).not.toContain('name')
  })

  it('a pattern is written on the first of 1_16, 1_16T and 1_32 that fits its hits', () => {
    // Triplets.
    const triplets = a([hit(0, 9, 16), hit(16, 9, 16, null, 100), hit(32, 9, 16, null, 64)])
    expect(body(BeatCards.write(card([triplets])))).toBe(text('[A] bars 1 step 1/16T', 'A7 | Xxo. .... .... .... .... .... |'))
    // 32nds.
    expect(body(BeatCards.write(card([a([hit(0, 9, 12), hit(12, 9, 12)])])))).toBe(text('[A] bars 1 step 1/32', 'A7 | XX.. .... .... .... .... .... .... .... |'))
    // Straight hits stay on 1/16 though they would fit 1/32.
    expect(BeatCards.write(card([a([hit(0, 9), hit(48, 9)])]))).toContain('step 1/16\n')
    // KEYS notes and hits past the end don't choose the step.
    expect(BeatCards.write(card([a([hit(0, 9), hit(5, 3, 24, 0), hit(400, 9)])]))).toContain('step 1/16\n')
    // None fits: 1/16, and the hit that doesn't fit goes to the notes list.
    expect(body(BeatCards.write(card([a([hit(0, 9), hit(5, 9)])])))).toBe(text('[A] bars 1 step 1/16', 'A7 | X... .... .... .... |', 'notes', 'A7 at 1.1.1+5'))
    expect(body(BeatCards.write(card([a([hit(5, 9)])])))).toBe(text('[A] bars 1 step 1/16', 'notes', 'A7 at 1.1.1+5'))
  })

  it("rows go in keypad order, in groups of 4 with a bar between bars, after the sound's name", () => {
    const c = card([a(Array.from({ length: 12 }, (_, i) => hit(0, i)))])
    const labels = BeatCards.write(c).split('\n').filter((l) => l.startsWith('A') && l.includes(' | ')).map((l) => l.split(' ')[0])
    expect(labels).toEqual(['A7', 'A8', 'A9', 'A4', 'A5', 'A6', 'A1', 'A2', 'A3', 'A.', 'A0', 'AE'])
    const names = named([
      [physicalPad(0, 9), 'kick'],
      [physicalPad(0, 11), 'a|b # c'],
    ])
    const two = card([a([hit(0, 9), hit(384 + 72, 9), hit(96, 11), hit(0, 6)], { bars: 2, number: 3 })])
    const want = text(
      '[A03] bars 2 step 1/16',
      'A7 kick      | X... .... .... .... | ...X .... .... .... |',
      'A9 a b c     | .... X... .... .... | .... .... .... .... |',
      'A4' + ' '.repeat(11) + '| X... .... .... .... | .... .... .... .... |',
    )
    expect(body(BeatCards.write(two, names))).toBe(want)
    // A long name widens the column; no names, no column.
    expect(rowOf(BeatCards.write(card([a([hit(0, 9)])]), () => 'twelve sound'), 'A7')).toBe('A7 twelve sound | X... .... .... .... |')
    expect(rowOf(BeatCards.write(card([a([hit(0, 9)])])), 'A7')).toBe('A7 | X... .... .... .... |')
    // Another group's pads are asked for by their own group.
    const b = BeatCards.write(card([a([hit(0, 9)], { group: 1 })]), (p) => (padKey(p) === padKey(physicalPad(1, 9)) ? 'bass' : 'wrong'))
    expect(rowOf(b, 'B7')).toBe('B7 bass      | X... .... .... .... |')
  })

  it('velocities and holds are written as characters, the rest goes to the notes list', () => {
    const c = card([
      a([
        hit(0, 6), hit(48, 6, 72, null, 100), hit(144, 6, 24, null, 64),
        hit(96, 11, 60), hit(240, 11, 24, null, 42), hit(366, 11, 24, null, 50),
        hit(23, 6),
        hit(0, 3, 72), hit(48, 3), hit(0, 3, 48, 0),
        hit(0, 0, 24, 67), hit(24, 0, 24, 68), hit(48, 0, 24, -100),
      ]),
    ])
    const want = text(
      '[A] bars 1 step 1/16',
      'A9 | .... .... ..3. .... |',
      'A4 | X.x- -.o. .... .... |',
      'A1 | ..X. .... .... .... |',
      'notes',
      'A9 at 1.2.1 gate 60',
      'A9 at 1.4.4+6 vel 50',
      'A4 at 1.1.2-1',
      'A1 at 1.1.1 gate 72',
      'A1 at 1.1.1 note C4 gate 1/8',
      'A. at 1.1.1 note G9',
      'A. at 1.1.2 semi 68',
      'A. at 1.1.3 semi -100',
    )
    expect(body(BeatCards.write(c))).toBe(want)
    // Every velocity character and its value.
    const vels: [number, string][] = [[127, 'X'], [100, 'x'], [64, 'o'], [14, '1'], [28, '2'], [42, '3'], [56, '4'], [70, '5'], [84, '6'], [98, '7'], [112, '8'], [126, '9']]
    const row = rowOf(BeatCards.write(card([a(vels.map(([v], i) => hit(i * 24, 9, 24, null, v)))])), 'A7')
    expect(row).toBe('A7 | ' + vels.map(([, ch]) => ch).join('').match(/.{4}/g)!.join(' ') + ' .... |')
    // A hold that stops at the next hit fits; one into it doesn't; one past the end doesn't.
    expect(BeatCards.write(card([a([hit(0, 9, 48), hit(48, 9)])]))).toContain('A7 | X-X. ')
    expect(BeatCards.write(card([a([hit(0, 9, 72), hit(48, 9)])]))).toContain('\nnotes\nA7 at 1.1.1 gate 72\n')
    expect(BeatCards.write(card([a([hit(360, 9, 48)])]))).toContain('\nnotes\nA7 at 1.4.4 gate 1/8\n')
    // Two hits on one pad and tick are one, the louder, as reading has it; notes past the end are left out.
    const dup = BeatCards.write(card([a([hit(0, 9, 24, null, 100), hit(0, 9), hit(400, 9), hit(384, 3, 24, 0)])]))
    expect(body(dup)).toBe(text('[A] bars 1 step 1/16', 'A7 | X... .... .... .... |'))
    // Gates that are a listed value are written as it.
    const gates = [96, 48, 12, 32, 16, 100]
    const written = BeatCards.write(card([a(gates.map((g, i) => hit(i * 30, 3, g, 0)))]))
    const gateLines = text(
      'A1 at 1.1.1 note C4 gate 1/4',
      'A1 at 1.1.2+6 note C4 gate 1/8',
      'A1 at 1.1.3+12 note C4 gate 1/32',
      'A1 at 1.2.1-6 note C4 gate 1/8T',
      'A1 at 1.2.2 note C4 gate 1/16T',
      'A1 at 1.2.3+6 note C4 gate 100',
    )
    expect(body(written)).toBe(text('[A] bars 1 step 1/16', 'notes', gateLines))
  })

  it('rows use the swing of the card', () => {
    const p = a([hit(0, 9), hit(28, 9)])
    expect(body(BeatCards.write(card([p], 58)))).toBe(text('[A] bars 1 step 1/16', 'A7 | XX.. .... .... .... |'))
    expect(body(BeatCards.write(card([p], 50)))).toBe(text('[A] bars 1 step 1/16', 'A7 | X... .... .... .... |', 'notes', 'A7 at 1.1.2+4'))
    expect(BeatCards.write(card([p], 58)).startsWith('ARC BEAT 1\nswing 58\n')).toBe(true)
    // Swing is held to 50..75 when written.
    expect(BeatCards.write(card([p], 99)).startsWith('ARC BEAT 1\nswing 75\n')).toBe(true)
    // Triplets are not swung: the card's swing doesn't move them.
    const triplets = a([hit(0, 9, 16), hit(16, 9, 16)])
    expect(body(BeatCards.write(card([triplets], 70)))).toBe(text('[A] bars 1 step 1/16T', 'A7 | XX.. .... .... .... .... .... |'))
  })

  it('tidy rounds velocities and short gates, and says so', () => {
    const p = a([hit(0, 9, 10, null, 90), hit(24, 9, 24, null, 113), hit(48, 9, 24, null, 114), hit(72, 9, 24, null, 81), hit(96, 9, 30, null, 82)])
    const raw = BeatCards.write(card([p]))
    expect(raw).not.toContain('tidied')
    expect(body(raw)).toBe(
      text('[A] bars 1 step 1/16', 'notes', 'A7 at 1.1.1 vel 90 gate 10', 'A7 at 1.1.2 vel 113', 'A7 at 1.1.3 vel 114', 'A7 at 1.1.4 vel 81', 'A7 at 1.2.1 vel 82 gate 30'),
    )
    const tidy = BeatCards.write(card([p]), () => null, true)
    expect(tidy).toBe(
      text(
        'ARC BEAT 1', 'swing 50', '# tidied: velocities and short gates rounded', '',
        '[A] bars 1 step 1/16', 'A7 | xxXo .... .... .... |', 'notes', 'A7 at 1.2.1 vel 100 gate 30',
      ) + '\n',
    )
    // The comment is a comment: the tidied card reads back as the tidied pattern.
    const back = BeatCards.read(tidy)
    expect(problems(back)).toEqual([])
    expect(keys(section(back).pattern)).toEqual(keyList(hit(0, 9, 24, null, 100), hit(24, 9, 24, null, 100), hit(48, 9), hit(72, 9, 24, null, 64), hit(96, 9, 30, null, 100)))
    // KEYS notes are rounded too.
    const keysCard = BeatCards.write(card([a([hit(0, 3, 5, 0, 70)])]), () => null, true)
    expect(keysCard.endsWith('\nnotes\nA1 at 1.1.1 vel 64 note C4\n')).toBe(true)
  })

  // ---- round trips ----

  const rich = (): BeatCard => {
    const x = cardSection(
      0,
      4,
      pattern(2, [
        hit(0, 9), hit(28, 9, 24, null, 100), hit(48, 9, 72, null, 64), hit(384 + 96, 11), hit(366, 11, 24, null, 50), hit(456, 11), hit(23, 6, 12),
        hit(0, 3, 48, 0), hit(96, 3, 24, 7, 90), hit(96, 3, 24, 4, 90), hit(200, 1, 100, -100),
        hit(500, 4, 96), hit(520, 4, 32), hit(760, 5, 16, null, 14),
      ]),
    )
    const y = cardSection(2, null, pattern(1, [hit(0, 9, 16), hit(16, 9, 16, null, 100), hit(32, 9, 16, null, 64), hit(48, 6, 16, 12)]))
    const z = cardSection(3, 99, pattern(1, [hit(0, 0, 12), hit(12, 0, 12), hit(36, 0, 12, null, 42), hit(60, 2)]))
    return beatCard('Rich beat', 87.5, 58, [x, y, z])
  }

  it('a card Arc wrote reads back to the same patterns and writes out as the same text', () => {
    const names = named([
      [physicalPad(0, 9), 'kick'],
      [physicalPad(2, 9), 'tom'],
      [physicalPad(3, 0), 'shaker'],
    ])
    for (const c of [rich(), BeatCards.read(example).card!, beatCard(null, null, 50, [a([hit(0, 9)])])]) {
      const out = BeatCards.write(c, names)
      const back = BeatCards.read(out)
      expect(problems(back), out).toEqual([])
      const b = back.card!
      expect(b.name).toBe(c.name)
      expect(b.tempo).toBe(c.tempo)
      expect(b.swing).toBe(c.swing)
      expect(b.sections.map((s) => [s.group, s.number])).toEqual(c.sections.map((s) => [s.group, s.number]))
      const sorted = [...c.sections].sort((p, q) => p.group - q.group)
      sorted.forEach((x, i) => {
        const y = b.sections[i]!
        expect(y.pattern.bars).toBe(x.pattern.bars)
        expect(keys(y.pattern), out).toEqual(keys(x.pattern))
        expect(y.pattern.notes.length).toBe(x.pattern.notes.length)
      })
      expect(BeatCards.write(b, names)).toBe(out)
    }
    // Reading puts the notes in tick order, with no ids.
    const order = BeatCards.read(BeatCards.write(rich())).card!.sections[0]!.pattern.notes
    expect(order.map((n) => n.tick)).toEqual([...order].map((n) => n.tick).sort((x, y) => x - y))
    expect(order.every((n) => n.id === 0)).toBe(true)
    // Everything in the rich card that has to leave the rows did.
    const out = BeatCards.write(rich())
    expect(out).toContain('notes\n')
    expect(out).toContain('[A04] bars 2 step 1/16')
    expect(out).toContain('[C] bars 1 step 1/16T')
    expect(out).toContain('[D99] bars 1 step 1/32')
  })

  it('a card of every pattern shape round trips', () => {
    // A bar of each step, with holds, accents, ghosts and odd steps; at several swings.
    for (const swing of [50, 54, 58, 66, 75]) {
      for (const bars of [1, 2, 3]) {
        const notes: PatternNote[] = []
        for (let k = 0; k < bars * 16; k++) {
          const tick = Steps.tickOf(k, Timing.SIXTEENTH, swing)
          if (k % 3 === 0) notes.push(hit(tick, k % 12, 24 * (1 + (k % 2)), null, [127, 100, 64, 14 * (1 + (k % 9))][k % 4]!))
          if (k % 5 === 0) notes.push(hit(tick + 3, (k + 4) % 12, 24, (k % 13) - 6))
        }
        const c = beatCard(null, null, swing, [cardSection(1, null, pattern(bars, notes))])
        const out = BeatCards.write(c)
        const back = BeatCards.read(out)
        expect(problems(back), out).toEqual([])
        expect(keys(back.card!.sections[0]!.pattern), out).toEqual(keys(c.sections[0]!.pattern))
        expect(BeatCards.write(back.card!)).toBe(out)
      }
    }
  })

  // ---- from patterns ----

  it('the swing of an export is the timing swing only when the hits fit that grid', () => {
    const swung = a([hit(0, 9), hit(28, 9), hit(48, 9, 24, null, 100), hit(76, 11)])
    expect(BeatCards.fromPatterns('n', 90, 58, [swung]).swing).toBe(58)
    expect(BeatCards.fromPatterns('n', 90, 50, [swung]).swing).toBe(50)
    // Hits on the straight odd steps, on triplets or between steps do not fit a swung grid.
    expect(BeatCards.fromPatterns(null, null, 58, [a([hit(0, 9), hit(24, 9)])]).swing).toBe(50)
    expect(BeatCards.fromPatterns(null, null, 58, [a([hit(0, 9, 16), hit(16, 9, 16)])]).swing).toBe(50)
    expect(BeatCards.fromPatterns(null, null, 58, [a([hit(5, 9)])]).swing).toBe(50)
    // Hits on the even steps fit every swing; KEYS notes, hits past the end and empty patterns don't count.
    expect(BeatCards.fromPatterns(null, null, 66, [a([hit(0, 9), hit(48, 9), hit(5, 3, 24, 0), hit(400, 9)])]).swing).toBe(66)
    expect(BeatCards.fromPatterns(null, null, 66, [a()]).swing).toBe(66)
    // Every section has to fit.
    expect(BeatCards.fromPatterns(null, null, 58, [swung, a([hit(24, 9)], { group: 1 })]).swing).toBe(50)
    expect(BeatCards.fromPatterns(null, null, 58, [swung, a([hit(0, 9)], { group: 1 })]).swing).toBe(58)
    // The swing is held to 50..75.
    expect(BeatCards.fromPatterns(null, null, 99, [a([hit(0, 9)])]).swing).toBe(75)
    expect(BeatCards.fromPatterns(null, null, 10, [a([hit(0, 9)])]).swing).toBe(50)
    // The card written from it reads back to the same pattern.
    const c = BeatCards.fromPatterns('n', 90, 58, [swung])
    expect(keys(BeatCards.read(BeatCards.write(c)).card!.sections[0]!.pattern)).toEqual(keys(swung.pattern))
  })

  it('an export holds the sections with notes, in group order', () => {
    const sections = [a([hit(0, 9)], { group: 3 }), a([], { group: 1 }), a([hit(0, 9)], { group: 0, number: 2 }), a([], { bars: 4, group: 2 })]
    const c = BeatCards.fromPatterns('Scene', 100, 50, sections)
    expect(c.sections.map((s) => s.group)).toEqual([0, 3])
    expect(c.name).toBe('Scene')
    expect(c.tempo).toBe(100)
    // A pattern with no notes alone is kept, as written (a card needs a section).
    const blank = BeatCards.fromPatterns(null, null, 50, [a([], { bars: 2, group: 2 })])
    expect(blank.sections.map((s) => s.group)).toEqual([2])
    expect(BeatCards.read(BeatCards.write(blank)).card).toEqual(blank)
  })

  // ---- sounds ----

  it('sound lines give a pad its slot and name, anywhere in the section', () => {
    const r = read(
      'ARC BEAT 1', '[A]',
      'sound A7 12 Kick 808',
      'sound A9 140',
      'SOUND AENTER 7   Open   hat  # soft',
      'Sound A. 999 Last.wav',
      'sound A1 5 Kick#2',
      bar,
    )
    expect(problems(r)).toEqual([])
    expect(section(r).sounds).toEqual(sm([9, snd(12, 'Kick 808')], [11, snd(140)], [2, snd(7, 'Open hat')], [0, snd(999, 'Last.wav')], [3, snd(5, 'Kick 2')]))
    // Before or after the rows, and after notes, where the lines that follow are still notes.
    const after = read(
      'ARC BEAT 1', '[A]', 'sound A7 12 Kick', bar, 'notes', 'A9 at 1.1.1', 'sound A9 140 Snare', 'A5 at 1.2.1',
      '[B]', 'B7 | X... .... .... .... |', 'sound B7 3',
    )
    expect(problems(after)).toEqual([])
    expect(section(after).sounds).toEqual(sm([9, snd(12, 'Kick')], [11, snd(140, 'Snare')]))
    expect(section(after).pattern.notes.length).toBe(3)
    expect(section(after, 1).sounds).toEqual(sm([9, snd(3)]))
    // A pad with no notes can have a sound; a section with no sound lines has none.
    expect(section(read('ARC BEAT 1', '[A]', 'sound A1 8', bar)).sounds).toEqual(sm([3, snd(8)]))
    expect(section(read('ARC BEAT 1', '[A]', bar)).sounds).toEqual(new Map())
    expect(section(read('ARC BEAT 1', '[A]', 'sound A1 8')).sounds).toEqual(sm([3, snd(8)]))
    // The slots run 1 to 999.
    expect(section(read('ARC BEAT 1', '[A]', 'sound A7 001')).sounds).toEqual(sm([9, snd(1)]))
  })

  it('sound line errors and warnings name the line', () => {
    const slotError = '3 error: A7 sound: the slot must be a whole number from 1 to 999.'
    const errors: [string, string][] = [
      ['sound B7 12', '3 error: B7 is in group B, but the section is [A].'],
      ['sound A7 0', slotError],
      ['sound A7 1000', slotError],
      ['sound A7 -1', slotError],
      ['sound A7 12.5', slotError],
      ['sound A7 kick', slotError],
      ['sound A7', slotError],
      ['sound kick 12', "3 error: 'kick' isn't a pad. Use A to D, then . 0 E or 1 to 9."],
      ['sound a7 12', "3 error: 'a7' isn't a pad. Use A to D, then . 0 E or 1 to 9."],
      ['sound', '3 error: A sound line needs a pad and a slot, as in sound A7 12 Kick.'],
    ]
    for (const [line, message] of errors) {
      const r = read('ARC BEAT 1', '[A]', line, bar)
      expect(problems(r), line).toEqual([message])
      expect(r.card, line).toBeNull()
    }
    // After notes the line is still a sound line; before any section it has no place.
    expect(problems(read('ARC BEAT 1', '[A]', bar, 'notes', 'sound B7 12'))).toEqual(['5 error: B7 is in group B, but the section is [A].'])
    expect(problems(read('ARC BEAT 1', 'sound A7 12', '[A]', bar))).toEqual(["2 error: 'sound' needs a section first, such as [A]."])
    // A second line for a pad replaces the first, nameless or not.
    const twice = read('ARC BEAT 1', '[A]', 'sound A7 12 Kick', bar, 'sound A8 3', 'sound A7 14')
    expect(problems(twice)).toEqual(['6 warning: A7 has two sound lines, kept the later.'])
    expect(section(twice).sounds).toEqual(sm([9, snd(14)], [10, snd(3)]))
    // Lines of a skipped section are not read; those of a second section of a group are read for their faults, then dropped.
    expect(problems(read('ARC BEAT 1', '[A] bars 0', 'sound A7 0'))).toEqual(['2 error: bars must be a whole number from 1 to 99.'])
    const dup = read('ARC BEAT 1', '[A]', bar, '[A]', 'sound A7 0')
    expect(problems(dup)).toEqual(['4 error: Group A has two sections.', '5 error: A7 sound: the slot must be a whole number from 1 to 999.'])
  })

  it("a section's sound lines are written right after its line, in keypad order", () => {
    const s = a([hit(0, 9), hit(96, 11)], {
      sounds: sm([0, snd(5, 'Cowbell')], [9, snd(12, 'Kick 808')], [11, snd(140)], [3, snd(7, 'Big  Kick#2')], [4, snd(300, '  ')]),
    })
    const lines = BeatCards.write(card([s]), (p) => (p.offset === 9 ? 'kick' : null)).split('\n')
    expect(lines.slice(3, 9)).toEqual(['[A] bars 1 step 1/16', 'sound A7 12 Kick 808', 'sound A9 140', 'sound A1 7 Big Kick 2', 'sound A2 300', 'sound A. 5 Cowbell'])
    expect(lines[9]!.startsWith('A7 kick ')).toBe(true)
    // Slots a card can't read are left out.
    const bad = BeatCards.write(card([a([hit(0, 9)], { sounds: sm([9, snd(0, 'Kick')], [11, snd(1000)]) })]))
    expect(bad.includes('sound')).toBe(false)
    // A section with sounds and no notes still writes them.
    expect(BeatCards.write(card([a([], { group: 1, sounds: sm([9, snd(9, 'Kick')]) })])).split('\n').slice(3, 5)).toEqual(['[B] bars 1 step 1/16', 'sound B7 9 Kick'])
  })

  it('a card with sounds round trips', () => {
    const base = rich()
    const sounds = [
      sm([9, snd(12, 'Kick 808')], [3, snd(7)], [4, snd(200, 'Open hat')]),
      sm([9, snd(40, 'Tom')]),
      sm([0, snd(999, 'Shaker.wav')], [2, snd(1)]),
    ]
    const c: BeatCard = { ...base, sections: base.sections.map((s, i) => ({ ...s, sounds: sounds[i]! })) }
    const text = BeatCards.write(c)
    const back = BeatCards.read(text)
    expect(problems(back), text).toEqual([])
    expect(back.card!.sections.map(soundsOf)).toEqual(c.sections.map(soundsOf))
    expect(BeatCards.write(back.card!)).toBe(text)
    expect(text.includes('[A04] bars 2 step 1/16\nsound A7 12 Kick 808\nsound A1 7\nsound A2 200 Open hat\n')).toBe(true)
    // The sound list Arc adds after the closing fence is not part of the card.
    const shared = 'Check this:\n\n```\n' + text + '```\n' + BeatCards.soundList(ClaudeText.SOUNDS_FROM_DEVICE, new Map([[12, 'Kick 808'], [7, 'Snare']]))
    const viaShare = BeatCards.read(shared)
    expect(problems(viaShare)).toEqual([])
    expect(viaShare.card).toEqual(back.card)
  })

  it('an export gives each pad its notes use the sound it plays', () => {
    const sections = [a([hit(0, 9), hit(96, 3, 24, 0)]), a([hit(0, 9)], { group: 1 })]
    const known = new Map<number, CardSound>([
      [padKey(physicalPad(0, 9)), snd(12, 'Kick')],
      [padKey(physicalPad(0, 3)), snd(30, 'Bass')],
      [padKey(physicalPad(0, 4)), snd(99, 'Unused')],
      [padKey(physicalPad(1, 9)), snd(13)],
    ])
    const lookup = (p: PhysicalPad): CardSound | null => known.get(padKey(p)) ?? null
    const c = BeatCards.fromPatterns('n', null, 50, sections, lookup)
    // KEYS notes count as use; a pad no note uses is left out.
    expect(c.sections[0]!.sounds).toEqual(sm([9, snd(12, 'Kick')], [3, snd(30, 'Bass')]))
    expect(c.sections[1]!.sounds).toEqual(sm([9, snd(13)]))
    // A pad the lookup doesn't know gets none, and without a lookup there are none.
    expect(BeatCards.fromPatterns(null, null, 50, sections.slice(0, 1), (p) => lookup(p)?.slot === 12 ? lookup(p) : null).sections[0]!.sounds).toEqual(sm([9, snd(12, 'Kick')]))
    expect(BeatCards.fromPatterns(null, null, 50, sections).sections.map((s) => s.sounds)).toEqual([new Map(), new Map()])
    // The sounds are on the card written, and read back.
    expect(BeatCards.read(BeatCards.write(c)).card!.sections.map(soundsOf)).toEqual(c.sections.map(soundsOf))
  })

  const library = new Map([[12, 'Kick 808'], [14, 'Snare.wav'], [20, 'Hat'], [30, 'Clap'], [31, ' clap.WAV ']])

  const pick = (p: SoundPick): string => `${p.pad.groupLetter}${p.pad.label} ${p.status} ${p.slot} ${p.name} ${p.currentSlot}`

  it("sound lines are matched to the user's sounds by slot and name", () => {
    const sounds = sm(
      [9, snd(12, 'kick 808')], // slot holds the name, ignoring case
      [10, snd(14, 'SNARE')], // ... and ".wav"
      [11, snd(13, 'Hat')], // slot is empty: the name is found in 20
      [6, snd(99, 'Clap')], // two slots hold it: the lowest
      [7, snd(77, 'clap')], // ... but the pad's own first
      [8, snd(99)], // no name and no such slot
      [3, snd(500, 'Cymbal')], // nowhere
      [4, snd(20, 'Hat')], // already on the pad
      [5, snd(20)], // no name, the slot is there
      [0, snd(12, 'Snare')], // the slot holds another sound: the name is found in 14
    )
    const currents = new Map([[padKey(physicalPad(0, 9)), 3], [padKey(physicalPad(0, 7)), 31], [padKey(physicalPad(0, 4)), 20], [padKey(physicalPad(0, 3)), 8], [padKey(physicalPad(0, 11)), 20]])
    const c = beatCard(null, null, 50, [a([], { sounds }), a([], { group: 1, sounds: sm([9, snd(12)]) })])
    const picks = BeatCards.resolveSounds(c, library, (p) => currents.get(padKey(p)) ?? null)
    expect(picks.map(pick)).toEqual([
      'A7 CHANGE 12 Kick 808 3',
      'A8 CHANGE 14 Snare.wav null',
      'A9 SAME 20 Hat 20',
      'A4 FOUND_BY_NAME 30 Clap null',
      'A5 SAME 31  clap.WAV  31',
      'A6 MISSING null null null',
      'A1 MISSING null null 8',
      'A2 SAME 20 Hat 20',
      'A3 CHANGE 20 Hat null',
      'A. FOUND_BY_NAME 14 Snare.wav null',
      'B7 CHANGE 12 Kick 808 null',
    ])
    expect(picks[2]!.wanted).toEqual(snd(13, 'Hat'))
    expect(picks[picks.length - 1]!.pad).toEqual(physicalPad(1, 9))
    // A pad that plays another sound is a change; one that plays the named sound by another slot is a change to that slot.
    const moved = BeatCards.resolveSounds(beatCard(null, null, 50, [a([], { sounds: sm([9, snd(13, 'Hat')]) })]), library, () => 12)
    expect(moved.map(pick)).toEqual(['A7 FOUND_BY_NAME 20 Hat 12'])
    // A card with no sound lines, or no sounds to choose from.
    expect(BeatCards.resolveSounds(beatCard(null, null, 50, [a([hit(0, 9)])]), library, () => null)).toEqual([])
    expect(BeatCards.resolveSounds(beatCard(null, null, 50, [a([], { sounds: sm([9, snd(12, 'Kick')]) })]), new Map(), () => null).map((p) => p.status)).toEqual([SoundStatus.MISSING])
  })

  it('the sound list is a header and a line for each sound in slot order', () => {
    const text = BeatCards.soundList(ClaudeText.SOUNDS_FROM_DEVICE, new Map([[20, 'Hat #2'], [14, 'Snare.wav'], [12, 'Kick  808'], [21, ' '], [1000, 'x'], [0, 'y']]))
    expect(text).toBe("My EP-133's sounds (slot name), from the EP-133:\n12 Kick 808\n14 Snare.wav\n20 Hat 2\n21\n")
    expect(BeatCards.soundList(ClaudeText.SOUNDS_FROM_LAST_READ, new Map())).toBe("My EP-133's sounds (slot name), from the last read:\n")
    expect(BeatCards.soundList(ClaudeText.SOUNDS_FROM_FACTORY, new Map([[1, 'Kick']]))).toBe("My EP-133's sounds (slot name), from the factory pack:\n1 Kick\n")
    // A name read from the list is the one the card writes, so it matches.
    const c = beatCard(null, null, 50, [a([], { sounds: sm([9, snd(20, 'Hat 2')]) })])
    expect(BeatCards.resolveSounds(c, new Map([[20, 'Hat #2']]), () => null).map((p) => p.status)).toEqual([SoundStatus.CHANGE])
  })

  it("sound names take the factory pack's name for a slot the device lists unnamed", () => {
    const device = new Map([[1, '001.pcm'], [200, '200.pcm'], [201, ' 201.PCM '], [202, '202.pcm'], [203, '203.pcm'], [204, 'Mine'], [300, '300.pcm']])
    const factory = new Map([[1, 'KICK 808'], [200, 'HH CLOSED'], [201, 'HH OPEN'], [202, '202.pcm'], [203, '  '], [204, 'Factory'], [999, 'Other']])
    expect([...BeatCards.soundNames(device, factory)]).toEqual([[1, 'KICK 808'], [200, 'HH CLOSED'], [201, 'HH OPEN'], [202, '202.pcm'], [203, '203.pcm'], [204, 'Mine'], [300, '300.pcm']])
    // Without the pack the device's names stand.
    expect(BeatCards.soundNames(device, null)).toEqual(device)
    expect(BeatCards.soundNames(device, new Map())).toEqual(device)
  })

  it("a card name that is its own slot's file name counts as no name", () => {
    // The skill has Claude copy "200.pcm"; after the factory pack the slot is named, and the line still resolves.
    const available = new Map([[200, 'HH CLOSED']])
    const picks = BeatCards.resolveSounds(beatCard(null, null, 50, [a([], { sounds: sm([9, snd(200, '200.pcm')]) })]), available, () => null)
    expect(picks.map((p) => `${pick(p)} ${p.unverified}`)).toEqual(['A7 CHANGE 200 HH CLOSED null false'])
  })

  it('an unnamed slot is used by its slot, unverified', () => {
    const available = new Map([[200, '200.pcm'], [201, '201.pcm'], [205, 'HH CLOSED'], [12, 'Kick']])
    const currents = new Map([[padKey(physicalPad(0, 9)), 200], [padKey(physicalPad(0, 10)), 200]])
    const sounds = sm(
      [9, snd(200, 'HH CLOSED')], // the slot is unnamed, but the name is found in 205 first
      [10, snd(200, 'SNARE')], // the name is nowhere: the unnamed slot is used, and it is on the pad already
      [11, snd(201, 'SNARE')], // ... a change
      [6, snd(201)], // no name
      [7, snd(201, '201.pcm')], // the card gave the device's own name
      [8, snd(12, 'Snare')], // a named slot with another sound: missing
      [5, snd(202, 'HH OPEN')], // no such slot
    )
    const picks = BeatCards.resolveSounds(beatCard(null, null, 50, [a([], { sounds })]), available, (p) => currents.get(padKey(p)) ?? null)
    expect(picks.map((p) => `${pick(p)} ${p.unverified}`)).toEqual([
      'A7 FOUND_BY_NAME 205 HH CLOSED 200 false',
      'A8 SAME 200 200.pcm 200 true',
      'A9 CHANGE 201 201.pcm null true',
      'A4 CHANGE 201 201.pcm null true',
      'A5 CHANGE 201 201.pcm null true',
      'A6 MISSING null null null false',
      'A3 MISSING null null null false',
    ])
    // Named sounds are never unverified.
    const named = BeatCards.resolveSounds(beatCard(null, null, 50, [a([], { sounds: sm([9, snd(12, 'Kick')]) })]), available, () => null)
    expect(named.map((p) => p.unverified)).toEqual([false])
  })

  it('the sound list notes the factory sounds without names, when it lists one', () => {
    const note = 'Names like 200.pcm are factory sounds the EP-133 keeps without a name. By slot: kicks 1-99, snares 100-199, hats 200-299, percussion 300-399, bass 400-499, melodic 500-599.'
    expect(ClaudeText.UNNAMED_SOUNDS_NOTE).toBe(note)
    const text = BeatCards.soundList(ClaudeText.SOUNDS_FROM_DEVICE, new Map([[200, '200.pcm'], [12, 'Kick'], [343, 'HH']]))
    expect(text).toBe(`My EP-133's sounds (slot name), from the EP-133:\n${note}\n12 Kick\n200 200.pcm\n343 HH\n`)
    // A name that is another slot's file name is a name; none unnamed: no note.
    expect(BeatCards.soundList(ClaudeText.SOUNDS_FROM_DEVICE, new Map([[200, '201.pcm'], [12, 'Kick']]))).not.toContain('Names like')
    // The note is not part of a card.
    const shared = '```\n' + BeatCards.write(beatCard(null, null, 50, [a([hit(0, 9)])])) + '```\n' + text
    expect(BeatCards.read(shared).card!.sections.length).toBe(1)
  })

  // ---- import ----

  const kick = pattern(1, [hit(0, 9)])

  const project = (playing: number[] = [1, 5, 1, 7]): ProjectSeq =>
    projectSeq(
      [
        new Map([[1, kick], [2, kick], [3, kick]]),
        new Map(),
        new Map(),
        new Map([[7, kick]]),
      ],
      [scene(playing)],
    )

  it('a card goes into the next free pattern of each group, and a new scene plays them', () => {
    const c = card([a([hit(0, 9), hit(24, 11)], { bars: 2 }), a([hit(24, 3)], { group: 2, number: 5 })])
    const seq = project()
    const plan = BeatCards.plan(seq, c)
    expect(plan.fullGroup).toBeNull()
    expect(plan.newScene).toBe(true)
    // Group A's 2 and 3 have notes: the next free is 4. Group C's bank is empty: 2.
    expect(plan.placed).toEqual([[0, 4], [2, 2]])
    expect(keys(ProjectSeq.pattern(plan.seq, 0, 4))).toEqual(keys(c.sections[0]!.pattern))
    expect(ProjectSeq.pattern(plan.seq, 0, 4).bars).toBe(2)
    expect(keys(ProjectSeq.pattern(plan.seq, 2, 2))).toEqual(keys(c.sections[1]!.pattern))
    expect(ProjectSeq.pattern(plan.seq, 0, 4).notes.every((n) => n.id === 0)).toBe(true)
    // Nothing was overwritten.
    for (let n = 1; n <= 3; n++) expect(ProjectSeq.pattern(plan.seq, 0, n)).toBe(kick)
    expect(ProjectSeq.pattern(plan.seq, 3, 7)).toBe(kick)
    expect(plan.seq.banks[1]).toEqual(seq.banks[1])
    // The new scene is the last, selected; groups the card hasn't keep the scene playing's numbers.
    expect(plan.seq.scenes.length).toBe(2)
    expect(plan.seq.scene).toBe(1)
    expect(ProjectSeq.current(plan.seq).patterns).toEqual([4, 5, 2, 7])
    expect(plan.seq.scenes[0]).toEqual(scene([1, 5, 1, 7]))
    // The card is the same planned from any scene playing.
    expect(ProjectSeq.current(BeatCards.plan(project([1, 6, 1, 8]), c).seq).patterns).toEqual([4, 6, 2, 8])
  })

  it('one section goes in without a new scene, and the next card goes after it', () => {
    const c = card([a([hit(0, 9)], { group: 2 })])
    const first = BeatCards.plan(project(), c)
    expect(first.placed).toEqual([[2, 2]])
    expect(first.newScene).toBe(false)
    expect(first.fullGroup).toBeNull()
    expect(first.seq.scenes).toEqual(project().scenes)
    expect(first.seq.scene).toBe(0)
    expect(keys(ProjectSeq.pattern(first.seq, 2, 2))).toEqual(keys(c.sections[0]!.pattern))
    const second = BeatCards.plan(first.seq, c)
    expect(second.placed).toEqual([[2, 3]])
    expect(keys(ProjectSeq.pattern(second.seq, 2, 2))).toEqual(keys(c.sections[0]!.pattern))
    expect(keys(ProjectSeq.pattern(second.seq, 2, 3))).toEqual(keys(c.sections[0]!.pattern))
    // Counting starts after the pattern selected.
    expect(BeatCards.plan(project([5, 1, 1, 1]), card([a([hit(0, 9)])])).placed).toEqual([[0, 6]])
    // A card with no section changes nothing.
    const none = BeatCards.plan(project(), beatCard())
    expect(none.placed).toEqual([])
    expect(none.newScene).toBe(false)
    expect(none.seq).toEqual(project())
  })

  it('a group with every pattern used stops the whole card', () => {
    const full = new Map(Array.from({ length: Seq.MAX_PATTERNS }, (_, i) => [i + 1, kick] as [number, Pattern]))
    const seq = projectSeq([new Map(), full, new Map(), new Map()])
    const plan = BeatCards.plan(seq, card([a([hit(0, 9)]), a([hit(0, 9)], { group: 1 })]))
    expect(plan.seq).toBe(seq)
    expect(plan.placed).toEqual([])
    expect(plan.newScene).toBe(false)
    expect(plan.fullGroup).toBe(1)
    // A card without that group goes in.
    const other = BeatCards.plan(seq, card([a([hit(0, 9)]), a([hit(0, 9)], { group: 2 })]))
    expect(other.fullGroup).toBeNull()
    expect(other.placed).toEqual([[0, 2], [2, 2]])
    // Patterns with no notes are free, however long.
    const rest = new Map(Array.from({ length: Seq.MAX_PATTERNS - 1 }, (_, i) => [i + 2, kick] as [number, Pattern]))
    rest.set(1, pattern(3))
    const blanks = projectSeq([rest, new Map(), new Map(), new Map()])
    expect(BeatCards.plan(blanks, card([a([hit(0, 9)])])).placed).toEqual([[0, 1]])
  })

  it('no new scene past 99 scenes, but the patterns are still placed', () => {
    const seq = projectSeq([], Array.from({ length: Seq.MAX_SCENES }, () => scene()))
    const plan = BeatCards.plan(seq, card([a([hit(0, 9)]), a([hit(0, 9)], { group: 1 })]))
    expect(plan.newScene).toBe(false)
    expect(plan.placed).toEqual([[0, 2], [1, 2]])
    expect(plan.seq.scenes.length).toBe(Seq.MAX_SCENES)
    expect(plan.seq.scene).toBe(0)
    expect(ProjectSeq.pattern(plan.seq, 1, 2).notes.length).toBe(1)
  })

  // ---- effects and pad shaping ----

  const f = Math.fround
  const pad = (group: number, offset: number): PhysicalPad => physicalPad(group, offset)
  const fxCard = (...lines: string[]): CardRead => read('ARC BEAT 1', ...lines, '[A]', bar)
  const sendsOf = (...entries: [number, number][]): Map<number, number> => new Map(entries.map(([g, v]) => [g, f(v)]))
  const ps = (o: Partial<PadSettings> = {}): PadSettings => ({ ...PadSettings.DEFAULT, ...o })

  it('a card without effect lines has no fx, and an all effect card reads', () => {
    expect(BeatCards.read(example).card!.fx).toBeNull()
    const r = fxCard('fx delay 40 55', 'send A 20 C 35.5', 'comp 40 60', 'sidechain A7 BC 25 70')
    expect(problems(r)).toEqual([])
    const fx = r.card!.fx!
    expect(fx.type).toBe(FxType.DELAY)
    expect(fx.x).toBe(f(0.4))
    expect(fx.y).toBe(f(0.55))
    expect(fx.sends).toEqual(sendsOf([0, 0.2], [2, 0.355]))
    expect(fx.comp).toEqual(comp({ on: true, x: 0.4, y: 0.6 }))
    expect(fx.sidechain).toEqual(sidechain({ on: true, group: 0, pad: 9, dests: 0b0110, x: 0.25, y: 0.7 }))
  })

  it('effect lines default their knobs, any case, and each kind stands alone', () => {
    const fx = fxCard('FX Reverb', 'sidechain B. A').card!.fx!
    expect(fx.type).toBe(FxType.REVERB)
    expect(fx.x).toBe(0.5)
    expect(fx.y).toBe(0.5)
    expect(fx.sends).toBeNull()
    expect(fx.comp).toBeNull()
    // Length and shape default to 30 and 50; the pad's own group may be in the list.
    expect(fx.sidechain).toEqual(sidechain({ on: true, group: 1, pad: 0, dests: 0b0001, x: 0.3, y: 0.5 }))
    expect(fxCard('comp OFF').card!.fx).toEqual(cardFx({ comp: comp({ on: false }) }))
    expect(fxCard('sidechain off').card!.fx).toEqual(cardFx({ sidechain: sidechain({ on: false }) }))
    expect(fxCard('send B 100').card!.fx).toEqual(cardFx({ sends: sendsOf([1, 1]) }))
    expect(fxCard('fx none').card!.fx).toEqual(cardFx({ type: FxType.NONE, x: 0.5, y: 0.5 }))
    // Whole or one decimal, as the knob's percent.
    expect(fxCard('fx filter 7.5 0').card!.fx!.x).toBe(f(0.075))
    expect(fxCard('fx filter 7.5 0').card!.fx!.y).toBe(0)
  })

  it('send lines add up, a group given twice keeps the later value', () => {
    const r = fxCard('send A 10 B 20', 'send B 30 D 40 A 50')
    expect(problems(r)).toEqual([])
    expect(r.card!.fx!.sends).toEqual(sendsOf([0, 0.5], [1, 0.3], [3, 0.4]))
  })

  it('a second fx, comp or sidechain line replaces the first, with a warning', () => {
    const r = fxCard('fx delay 10 10', 'fx reverb 20 30', 'comp 10 10', 'comp off', 'sidechain A7 B', 'sidechain A9 C')
    expect(problems(r)).toEqual(['3 warning: Two fx lines, kept the later.', '5 warning: Two comp lines, kept the later.', '7 warning: Two sidechain lines, kept the later.'])
    expect(r.card!.fx).toEqual(
      cardFx({ type: FxType.REVERB, x: 0.2, y: 0.3, comp: comp({ on: false }), sidechain: sidechain({ on: true, group: 0, pad: 11, dests: 0b0100, x: 0.3, y: 0.5 }) }),
    )
  })

  it('effect line mistakes are errors with their line, extra words a warning', () => {
    const one = (line: string): string => {
      const p = problems(fxCard(line))
      expect(p.length).toBe(1)
      return p[0]!
    }
    const types = 'none, delay, reverb, distortion, chorus, filter or compressor'
    expect(one('fx')).toBe(`2 error: fx needs an effect: ${types}.`)
    expect(one('fx flanger')).toBe(`2 error: 'flanger' isn't an effect. Use ${types}.`)
    expect(one('fx delay 101')).toBe('2 error: fx x must be 0 to 100, whole or with one decimal.')
    expect(one('fx delay 50 -1')).toBe('2 error: fx y must be 0 to 100, whole or with one decimal.')
    expect(one('fx delay 5.55')).toBe('2 error: fx x must be 0 to 100, whole or with one decimal.')
    expect(one('send')).toBe('2 error: send needs a group and a value, as in send A 40 B 20.')
    expect(one('send E 10')).toBe("2 error: 'E' isn't a group. Use A to D.")
    expect(one('send a 10')).toBe("2 error: 'a' isn't a group. Use A to D.")
    expect(one('send A 10 B')).toBe('2 error: send B needs a value, 0 to 100, whole or with one decimal.')
    expect(one('send A 101')).toBe('2 error: send A must be 0 to 100, whole or with one decimal.')
    expect(one('comp')).toBe('2 error: comp needs off, or a drive and a speed, as in comp 40 60.')
    expect(one('comp on')).toBe('2 error: comp drive must be 0 to 100, whole or with one decimal, or use comp off.')
    expect(one('comp 40')).toBe('2 error: comp needs a speed after the drive, as in comp 40 60.')
    expect(one('comp 40 200')).toBe('2 error: comp speed must be 0 to 100, whole or with one decimal.')
    expect(one('sidechain')).toBe('2 error: sidechain needs off, or a pad and the groups it ducks, as in sidechain A7 BC.')
    expect(one('sidechain A17 B')).toBe("2 error: 'A17' isn't a pad. Use A to D, then . 0 E or 1 to 9.")
    expect(one('sidechain A7')).toBe('2 error: sidechain A7 needs the groups it ducks, as in sidechain A7 BC.')
    expect(one('sidechain A7 25')).toBe("2 error: '25' isn't a list of groups. Use the letters A to D, as in BC.")
    expect(one('sidechain A7 bc')).toBe("2 error: 'bc' isn't a list of groups. Use the letters A to D, as in BC.")
    expect(one('sidechain A7 B 120')).toBe('2 error: sidechain length must be 0 to 100, whole or with one decimal.')
    expect(one('sidechain A7 B 20 x')).toBe('2 error: sidechain shape must be 0 to 100, whole or with one decimal.')
    // A line with a fault sets nothing, and the card isn't read.
    expect(fxCard('fx flanger').card).toBeNull()
    // Left-over words are ignored.
    expect(one('fx delay 10 20 oops')).toBe("2 warning: The fx line has extra words from 'oops', ignored.")
    expect(one('comp off x')).toBe("2 warning: The comp line has extra words from 'x', ignored.")
    expect(one('sidechain A7 B 10 20 z')).toBe("2 warning: The sidechain line has extra words from 'z', ignored.")
    expect(fxCard('fx delay 10 20 oops').card!.fx).toEqual(cardFx({ type: FxType.DELAY, x: 0.1, y: 0.2 }))
  })

  it('effect lines after the first section are errors, and a pad line before it needs a section', () => {
    const late = read('ARC BEAT 1', '[A]', bar, 'fx delay', 'send A 10', '[B]', 'B7 | X... .... .... .... |', 'comp off', 'sidechain off')
    expect(problems(late)).toEqual([
      "4 error: 'fx' belongs before the first section.",
      "5 error: 'send' belongs before the first section.",
      "8 error: 'comp' belongs before the first section.",
      "9 error: 'sidechain' belongs before the first section.",
    ])
    expect(late.card).toBeNull()
    // Even inside the notes list.
    expect(problems(read('ARC BEAT 1', '[A]', bar, 'notes', 'FX delay'))).toEqual(["5 error: 'FX' belongs before the first section."])
    expect(problems(read('ARC BEAT 1', 'pad A7 level 10', '[A]', bar))).toEqual(["2 error: 'pad' needs a section first, such as [A]."])
  })

  it('pad lines read the settings they give', () => {
    const r = read('ARC BEAT 1', '[A]', bar, 'pad A7 pitch -7.5 level 90 pan -4 attack 3 release 20 mode Key', 'pad A. level 0', 'pad AE mode legato', 'pad A1 pitch +3 pan 16')
    expect(problems(r)).toEqual([])
    expect(section(r).pads).toEqual(
      new Map([
        [9, cardPad({ pitch: -7.5, level: 90, pan: -4, attack: 3, release: 20, mode: PlayMode.KEY })],
        [0, cardPad({ level: 0 })],
        [2, cardPad({ mode: PlayMode.LEGATO })],
        [3, cardPad({ pitch: 3, pan: 16 })],
      ]),
    )
    // The ranges' ends, and a pad line after the notes list is still a pad line.
    const ends = read('ARC BEAT 1', '[B]', 'notes', 'B7 at 1.1.1', 'pad B7 pitch -12 level 100 pan 0 attack 255 release 0', 'pad B8 pitch 12.00 pan -16')
    expect(problems(ends)).toEqual([])
    expect(section(ends).pads.get(9)).toEqual(cardPad({ pitch: -12, level: 100, pan: 0, attack: 255, release: 0 }))
    expect(section(ends).pads.get(10)).toEqual(cardPad({ pitch: 12, pan: -16 }))
    // A second line merges, the later settings winning; the same setting twice on a line keeps the later.
    const twice = read('ARC BEAT 1', '[A]', bar, 'pad A7 pitch 1 level 50', 'pad A7 level 60 pan 2', 'pad A8 level 1 level 2')
    expect(problems(twice)).toEqual(['5 warning: A7 has two pad lines, merged, the later settings win.'])
    expect(section(twice).pads.get(9)).toEqual(cardPad({ pitch: 1, level: 60, pan: 2 }))
    expect(section(twice).pads.get(10)).toEqual(cardPad({ level: 2 }))
    expect(section(read('ARC BEAT 1', '[A]', bar)).pads.size).toBe(0)
  })

  it('pad line mistakes are errors with their line, an unknown setting a warning', () => {
    const one = (line: string): string => {
      const p = problems(read('ARC BEAT 1', '[A]', bar, line))
      expect(p.length).toBe(1)
      return p[0]!
    }
    expect(one('pad')).toBe('4 error: A pad line needs a pad and a setting, as in pad A7 pitch -7 level 90.')
    expect(one('pad X7 level 5')).toBe("4 error: 'X7' isn't a pad. Use A to D, then . 0 E or 1 to 9.")
    expect(one('pad B7 level 5')).toBe('4 error: B7 is in group B, but the section is [A].')
    expect(one('pad A7')).toBe('4 error: A7 pad: give at least one of pitch, level, pan, attack, release or mode.')
    expect(one('pad A7 pitch')).toBe('4 error: A7 pad: pitch needs a value.')
    expect(one('pad A7 pitch 12.5')).toBe('4 error: A7 pad: pitch must be -12 to 12 semitones, whole or with up to two decimals.')
    expect(one('pad A7 pitch 1.234')).toBe('4 error: A7 pad: pitch must be -12 to 12 semitones, whole or with up to two decimals.')
    expect(one('pad A7 level 101')).toBe('4 error: A7 pad: level must be a whole number from 0 to 100.')
    expect(one('pad A7 level 50.5')).toBe('4 error: A7 pad: level must be a whole number from 0 to 100.')
    expect(one('pad A7 pan 17')).toBe('4 error: A7 pad: pan must be a whole number from -16 to 16, negative is left.')
    expect(one('pad A7 attack 256')).toBe('4 error: A7 pad: attack must be a whole number from 0 to 255.')
    expect(one('pad A7 release -1')).toBe('4 error: A7 pad: release must be a whole number from 0 to 255.')
    expect(one('pad A7 mode loop')).toBe('4 error: A7 pad: mode must be oneshot, key or legato.')
    expect(one('pad A7 level 5 colour red')).toBe("4 warning: Unknown setting 'colour' on A7 pad, ignored.")
    // All unknown: nothing given.
    expect(problems(read('ARC BEAT 1', '[A]', bar, 'pad A7 colour red'))).toEqual([
      "4 warning: Unknown setting 'colour' on A7 pad, ignored.",
      '4 error: A7 pad: give at least one of pitch, level, pan, attack, release or mode.',
    ])
    expect(read('ARC BEAT 1', '[A]', bar, 'pad A7 level 101').card).toBeNull()
  })

  it("a card with effects and pad shaping writes them in the spec's order and reads back as itself", () => {
    const fx = cardFx({
      type: FxType.DISTORTION,
      x: 0.6,
      y: 0.35,
      sends: sendsOf([0, 0.2], [1, 0.05]),
      comp: comp({ on: true, x: 0.4, y: 0.6 }),
      sidechain: sidechain({ on: true, group: 0, pad: 9, dests: 0b0110, x: 0.25, y: 0.7 }),
    })
    const pads = new Map([
      [9, cardPad({ pitch: -7, level: 90 })],
      [3, cardPad({ pan: -4, release: 20, mode: PlayMode.KEY })],
      [4, cardPad({ pitch: 0.25, attack: 5 })],
      [0, cardPad({ pitch: -0.5 })],
    ])
    const c = beatCard('Fx', 140, 56, [a([hit(0, 9), hit(48, 3)], { sounds: sm([9, snd(12, 'Kick')], [3, snd(300)]), pads })], fx)
    const t = BeatCards.write(c)
    expect(t.split('\n').slice(0, 16)).toEqual([
      'ARC BEAT 1', 'name Fx', 'tempo 140', 'swing 56',
      'fx distortion 60 35', 'send A 20 B 5', 'comp 40 60', 'sidechain A7 BC 25 70',
      '',
      '[A] bars 1 step 1/16',
      'sound A7 12 Kick', 'sound A1 300',
      'pad A7 pitch -7 level 90', 'pad A1 pan -4 release 20 mode key', 'pad A2 pitch 0.25 attack 5', 'pad A. pitch -0.5',
    ])
    const r = BeatCards.read(t)
    expect(problems(r)).toEqual([])
    expect(r.card!.fx).toEqual(fx)
    expect(section(r).pads).toEqual(pads)
    expect(section(r).sounds).toEqual(c.sections[0]!.sounds)
    expect(BeatCards.write(r.card!)).toBe(t)
    // The tidy comment follows the effect lines, and the other kinds of line stay out when the card has none.
    const tidy = BeatCards.write(beatCard(null, null, 50, [a([hit(0, 9)])], cardFx({ sends: sendsOf([2, 1]) })), undefined, true).split('\n')
    expect(tidy.slice(0, 4)).toEqual(['ARC BEAT 1', 'swing 50', 'send C 100', BeatCards.TIDY_COMMENT])
    expect(BeatCards.write(card([a([hit(0, 9)])])).split('\n').some((l) => l.startsWith('fx') || l.startsWith('send') || l.startsWith('pad'))).toBe(false)
    // off lines, and a sidechain with no groups written as off.
    const off = BeatCards.write(beatCard(null, null, 50, [a([hit(0, 9)])], cardFx({ type: FxType.NONE, comp: comp({ on: false }), sidechain: sidechain({ on: true, dests: 0 }) }))).split('\n')
    expect(off.slice(2, 5)).toEqual(['fx none', 'comp off', 'sidechain off'])
  })

  it('fromPatterns writes the fx only when they make a sound, and pad lines only for what differs', () => {
    const sections = [a([hit(0, 9), hit(0, 6), hit(24, 7)])]
    const from = (fx: FxSettings | null = null, pads?: (p: PhysicalPad) => PadSettings | null): BeatCard => BeatCards.fromPatterns(null, null, 50, sections, undefined, fx, pads)
    expect(from(FxSettings.DEFAULT).fx).toBeNull()
    expect(from().fx).toBeNull()
    // Knobs moved, but no effect, send, compressor or sidechain on: nothing to say.
    expect(from(FxSettings.of({ x: 0.9, comp: comp({ on: false, x: 0.2, y: 0.2 }) })).fx).toBeNull()
    const fx = FxSettings.of({
      type: FxType.REVERB,
      x: 0.337,
      y: 0.5,
      sends: [0.2, 0, 0.004, 0.5],
      comp: comp({ on: true, x: 0.4, y: 0.6 }),
      sidechain: sidechain({ on: true, group: 0, pad: 9, dests: 0b0110, x: 0.25, y: 0.7 }),
    })
    const c = from(fx)
    // Whole percents, the groups above 0 only: 0.004 is 0.
    expect(c.fx).toEqual(
      cardFx({
        type: FxType.REVERB,
        x: 0.34,
        y: 0.5,
        sends: sendsOf([0, 0.2], [3, 0.5]),
        comp: comp({ on: true, x: 0.4, y: 0.6 }),
        sidechain: sidechain({ on: true, group: 0, pad: 9, dests: 0b0110, x: 0.25, y: 0.7 }),
      }),
    )
    expect({ ...BeatCards.read(BeatCards.write(c)).card!, sections: c.sections }).toEqual(c)
    // Only a compressor on: the effect line is there too.
    const only = from(FxSettings.of({ comp: comp({ on: true, x: 0.5, y: 0.5 }) }))
    expect(only.fx).toEqual(cardFx({ type: FxType.NONE, x: 0.5, y: 0.5, comp: comp({ on: true, x: 0.5, y: 0.5 }) }))
    expect(BeatCards.write(only).split('\n').slice(2, 4)).toEqual(['fx none', 'comp 50 50'])
    // A sidechain on with no groups does nothing.
    expect(from(FxSettings.of({ sidechain: sidechain({ on: true, dests: 0 }) })).fx).toBeNull()

    const settings = new Map<number, PadSettings>([
      [padKey(pad(0, 9)), ps({ pitch: -7, level: 90 })],
      [padKey(pad(0, 6)), ps({ mode: PlayMode.KEY, release: 20, attack: 4 })],
      [padKey(pad(0, 7)), ps()], // the defaults
      [padKey(pad(0, 8)), ps({ pan: 3 })], // no note: no line
    ])
    const shaped = from(null, (p) => settings.get(padKey(p)) ?? null)
    expect(shaped.sections[0]!.pads).toEqual(
      new Map([
        [9, cardPad({ pitch: -7, level: 90 })],
        [6, cardPad({ attack: 4, release: 20, mode: PlayMode.KEY })],
      ]),
    )
    // Key mode's own release (15) isn't written; the oneshot default (255) neither; 255 in key mode is.
    expect(BeatCards.padOf(ps({ mode: PlayMode.KEY, release: 15 }))).toEqual(cardPad({ mode: PlayMode.KEY }))
    expect(BeatCards.padOf(ps({ mode: PlayMode.LEGATO, release: 255 }))).toEqual(cardPad({ mode: PlayMode.LEGATO, release: 255 }))
    expect(BeatCards.padOf(ps({ release: 40 }))).toEqual(cardPad({ release: 40 }))
    expect(BeatCards.padOf(ps())).toBeNull()
    // The fields the card carries only: trim, mute and MIDI channel don't count.
    expect(BeatCards.padOf(ps({ start: 100, end: 900, muteGroup: true, midiChannel: 3, timeMode: 'bar' }))).toBeNull()
    // A setting out of range is held in it, as the sheet does.
    expect(BeatCards.padOf(ps({ pitch: 30, level: -5 }))).toEqual(cardPad({ pitch: 12, level: 0 }))
    // The text reads back as the card.
    const back = BeatCards.read(BeatCards.write(shaped)).card!
    expect(back.sections[0]!.pads).toEqual(shaped.sections[0]!.pads)
    expect(BeatCards.write(shaped).split('\n').filter((l) => l.startsWith('pad'))).toEqual(['pad A7 pitch -7 level 90', 'pad A4 attack 4 release 20 mode key'])
  })

  it('applying effect lines sets each kind apart', () => {
    const now = FxSettings.of({
      type: FxType.DELAY,
      x: 0.3,
      y: 0.4,
      sends: [0.1, 0.2, 0.3, 0.4],
      comp: comp({ on: true, x: 0.7, y: 0.8 }),
      sidechain: sidechain({ on: true, group: 1, pad: 4, dests: 0b1000, x: 0.6, y: 0.2 }),
    })
    // Nothing on the card: nothing changes.
    expect(BeatCards.applyFx(now, cardFx())).toEqual(now)
    // The effect line: type and knobs, the rest alone.
    expect(BeatCards.applyFx(now, cardFx({ type: FxType.CHORUS, x: 0.8, y: 0.1 }))).toEqual({ ...now, type: FxType.CHORUS, x: f(0.8), y: f(0.1) })
    // None leaves the knobs.
    expect(BeatCards.applyFx(now, cardFx({ type: FxType.NONE, x: 0.5, y: 0.5 }))).toEqual({ ...now, type: FxType.NONE })
    // Sends: the groups named, the others 0.
    expect(BeatCards.applyFx(now, cardFx({ sends: sendsOf([1, 0.9], [3, 0.25]) }))).toEqual({ ...now, sends: [0, f(0.9), 0, f(0.25)] })
    // The compressor: on with its knobs, or off keeping them.
    expect(BeatCards.applyFx(now, cardFx({ comp: comp({ on: true, x: 0.1, y: 0.2 }) }))).toEqual({ ...now, comp: comp({ on: true, x: 0.1, y: 0.2 }) })
    expect(BeatCards.applyFx(now, cardFx({ comp: comp({ on: false }) }))).toEqual({ ...now, comp: comp({ on: false, x: 0.7, y: 0.8 }) })
    // The sidechain: on as written, or off keeping its source and groups.
    const on = sidechain({ on: true, group: 0, pad: 9, dests: 0b0110, x: 0.25, y: 0.7 })
    expect(BeatCards.applyFx(now, cardFx({ sidechain: on }))).toEqual({ ...now, sidechain: on })
    expect(BeatCards.applyFx(now, cardFx({ sidechain: sidechain({ on: false }) }))).toEqual({ ...now, sidechain: sidechain({ on: false, group: 1, pad: 4, dests: 0b1000, x: 0.6, y: 0.2 }) })
    // From a read card, onto the default.
    const read1 = fxCard('fx delay 40 55', 'send A 20 C 35', 'comp 40 60', 'sidechain A7 BC 25 70').card!
    expect(BeatCards.applyFx(FxSettings.DEFAULT, read1.fx!)).toEqual(
      FxSettings.of({ type: FxType.DELAY, x: 0.4, y: 0.55, sends: [0.2, 0, 0.35, 0], comp: comp({ on: true, x: 0.4, y: 0.6 }), sidechain: on }),
    )
    // A share's own card applies to the same settings.
    const own = FxSettings.of({
      type: FxType.FILTER,
      x: 0.2,
      y: 0.6,
      sends: [0.5, 0, 0, 0.25],
      comp: comp({ on: true, x: 0.3, y: 0.9 }),
      sidechain: sidechain({ on: true, group: 2, pad: 11, dests: 0b0011, x: 0.4, y: 0.8 }),
    })
    expect(BeatCards.applyFx(FxSettings.DEFAULT, BeatCards.fxOf(own)!)).toEqual(own)
    // Out of range values are held in it.
    expect(BeatCards.applyFx(now, cardFx({ sends: sendsOf([0, 7]) })).sends[0]).toBe(1)
  })

  it('applying a pad line sets the settings it gives, as the pad sheet does', () => {
    const now = ps({ pitch: 2, level: 80, pan: 3, attack: 10, release: 255, start: 5, end: 900, muteGroup: true, midiChannel: 4, timeMode: 'bpm' })
    expect(BeatCards.applyPad(now, cardPad())).toEqual(now)
    expect(BeatCards.applyPad(now, cardPad({ pitch: -7.5, level: 0 }))).toEqual({ ...now, pitch: -7.5, level: 0 })
    expect(BeatCards.applyPad(now, cardPad({ pan: -16, attack: 255 }))).toEqual({ ...now, pan: -16, attack: 255 })
    // Leaving oneshot sets the key release, as the sheet's MODE knob does; a release on the line wins.
    expect(BeatCards.applyPad(now, cardPad({ mode: PlayMode.KEY }))).toEqual({ ...now, mode: PlayMode.KEY, release: PadSettings.KEY_RELEASE })
    expect(BeatCards.applyPad(now, cardPad({ mode: PlayMode.KEY, release: 20 }))).toEqual({ ...now, mode: PlayMode.KEY, release: 20 })
    expect(BeatCards.applyPad(now, cardPad({ release: 0, mode: PlayMode.LEGATO }))).toEqual({ ...now, mode: PlayMode.LEGATO, release: 0 })
    // Back to oneshot: plays to the end.
    const key = { ...now, mode: PlayMode.KEY, release: 40 }
    expect(BeatCards.applyPad(key, cardPad({ mode: PlayMode.ONESHOT }))).toEqual({ ...key, mode: PlayMode.ONESHOT, release: 255 })
    // The same mode again changes nothing; a release alone keeps the mode.
    expect(BeatCards.applyPad(key, cardPad({ mode: PlayMode.KEY }))).toEqual(key)
    expect(BeatCards.applyPad(key, cardPad({ release: 90 }))).toEqual({ ...key, release: 90 })
    // Clamped like the sheet, whatever the card object holds.
    expect(BeatCards.applyPad(now, cardPad({ pitch: 40, level: 400, pan: -50, attack: -3 }))).toEqual({ ...now, pitch: 12, level: 100, pan: -16, attack: 0 })
    // A share's own pad line applies to the same settings.
    const own = ps({ pitch: -7, level: 90, pan: -4, attack: 3, release: 20, mode: PlayMode.KEY })
    expect(BeatCards.applyPad(PadSettings.DEFAULT, BeatCards.padOf(own)!)).toEqual(own)
  })

  it('silent pads are the pads the notes use that have no sound and no sound line, in keypad order for each group', () => {
    // Offsets: 9 is the 7 key, 6 the 4 key, 3 the 1 key (see PadNotes.ROWS); the keypad goes 7 8 9 4 5 6 1 2 3 . 0 E.
    const a7 = physicalPad(0, 9)
    const a4 = physicalPad(0, 6)
    const a1 = physicalPad(0, 3)
    const c7 = physicalPad(2, 9)
    const d7 = physicalPad(3, 9)
    const c = card([
      a([hit(0, 3), hit(48, 6), hit(0, 9)], { group: 0 }),
      a([hit(0, 9, 24, 0), hit(24, 9, 24, 4), hit(48, 9, 24, 7)], { group: 2 }),
      a([hit(0, 9, 24, 0), hit(96, 9, 24, 3)], { group: 3 }),
    ])
    // Pad hits and KEYS notes both count; a pad with a sound is not silent.
    expect(BeatCards.silentPads(c, (p) => (padKey(p) === padKey(a7) ? 12 : null), true)).toEqual([a4, a1, c7, d7])
    // The pads aren't read yet: nothing is known to be empty.
    expect(BeatCards.silentPads(c, () => null, false)).toEqual([])
    // A sound line of the card is a sound: the pad it is on isn't silent.
    const lined = card([
      a([hit(0, 9), hit(0, 6)], { group: 0, sounds: new Map([[6, snd(100)]]) }),
      a([hit(0, 9, 24, 0)], { group: 3, sounds: new Map([[9, snd(512, 'PIANO')]]) }),
    ])
    expect(BeatCards.silentPads(lined, () => null, true)).toEqual([a7])
    expect(BeatCards.silentPads(lined, () => 5, true)).toEqual([])
    // Sections in any order come out by group, and a pad is listed once.
    const shuffled = card([a([hit(0, 9, 24, 0)], { group: 3 }), a([hit(0, 9)], { group: 0 }), a([hit(0, 9), hit(0, 3)], { group: 0 })])
    expect(BeatCards.silentPads(shuffled, () => null, true)).toEqual([a7, a1, d7])
    // A note past the pattern's end doesn't play, so its pad isn't used.
    const past = card([a([hit(0, 9), hit(Seq.TICKS_PER_BAR, 6)], { group: 1 })])
    expect(BeatCards.silentPads(past, () => null, true)).toEqual([physicalPad(1, 9)])
    // A card with no notes has none.
    expect(BeatCards.silentPads(card([a([], { group: 1 })]), () => null, true)).toEqual([])
  })

  it('a sound line with a slot out of range is no sound, and notes are counted by pad', () => {
    const bad = card([a([hit(0, 9)], { group: 0, sounds: new Map([[9, snd(0)]]) })])
    expect(BeatCards.silentPads(bad, () => null, true)).toEqual([physicalPad(0, 9)])
    const s = a([hit(0, 9), hit(48, 9), hit(0, 10, 24, 0), hit(Seq.TICKS_PER_BAR + 5, 6)], { group: 0 })
    expect([...BeatCards.notesByPad(s)]).toEqual([[9, 2], [10, 1]])
  })

  it('the pads with no sound are one comment right after the header, which readers ignore', () => {
    const d7 = physicalPad(3, 9)
    const c7 = physicalPad(2, 9)
    const c = beatCard('Test', 92, 50, [a([hit(0, 9)])])
    const plain = BeatCards.write(c)
    expect(plain.includes('no sound')).toBe(false)
    const t = BeatCards.write(c, undefined, false, [c7, d7])
    expect(ClaudeText.noSoundOn([c7, d7])).toBe('# no sound on: C7 D7')
    expect(t.split('\n').slice(0, 6)).toEqual(['ARC BEAT 1', 'name Test', 'tempo 92', 'swing 50', '# no sound on: C7 D7', ''])
    // Tidy cards carry it too, before their own comment.
    const tidy = BeatCards.write(c, undefined, true, [d7]).split('\n')
    expect(tidy[4]).toBe('# no sound on: D7')
    expect(tidy[5]).toBe(BeatCards.TIDY_COMMENT)
    // The comment changes nothing about what is read.
    const r = BeatCards.read(t)
    expect(problems(r)).toEqual([])
    expect(r.card).toEqual(BeatCards.read(plain).card)
    // ENTER is E, as the card writes its pad.
    expect(ClaudeText.noSoundOn([physicalPad(0, 2)])).toBe('# no sound on: AE')
  })

  it('the silent pads rows are worded for one note or several', () => {
    const d7 = physicalPad(3, 9)
    expect(ClaudeText.silentRow(d7, 12)).toBe('D7 \u00B7 12 notes, no sound: they will be silent')
    expect(ClaudeText.silentRow(d7, 1)).toBe('D7 \u00B7 1 note, no sound: it will be silent')
    expect(ClaudeText.silentRowName(d7, 12)).toBe('D7: 12 notes, no sound, they will be silent')
    expect(ClaudeText.pickedRowName(d7, '512 PIANO')).toBe('D7: will get 512 PIANO')
    expect(ClaudeText.pickSoundName(d7)).toBe('Pick a sound for D7')
    expect(ClaudeText.changePickName(d7, '512 PIANO')).toBe('Pick another sound for D7, now 512 PIANO')
    expect(ClaudeText.pickTitle(d7)).toBe('Sound for D7')
    expect(ClaudeText.pickLine(12)).toBe('12 notes of the card play on this pad.')
  })

  it('every recipe card in the skill reads cleanly, and the ones with effect lines carry them', () => {
    const genres = readFileSync(new URL('../../../../skill/arc-beats/references/genres.md', import.meta.url), 'utf8')
    const cards = [...genres.matchAll(/```\n(ARC BEAT 1\n[\s\S]*?)\n```/g)].map((m) => m[1]!)
    expect(cards.length).toBeGreaterThanOrEqual(28)
    for (const t of cards) {
      const r = BeatCards.read(t)
      expect(problems(r)).toEqual([])
      // What is read writes back to a card that reads the same.
      expect(BeatCards.read(BeatCards.write(r.card!)).card!.fx).toEqual(r.card!.fx)
    }
    const withFx = cards.map((t) => BeatCards.read(t).card!).filter((c) => c.fx !== null)
    expect(withFx.map((c) => c.name).sort()).toEqual(['Amen shred', 'Dub chord echo', 'Dusty lo-fi', 'Hard groove workout', 'Hard techno pound', 'House groove', 'Industrial pressure', 'Schranz pressure'])
    expect(withFx.find((c) => c.name === 'House groove')!.fx!.sidechain).toEqual(sidechain({ on: true, group: 0, pad: 9, dests: 0b0010, x: 0.3, y: 0.55 }))
    expect(withFx.find((c) => c.name === 'Dusty lo-fi')!.fx!.type).toBe(FxType.FILTER)
  })
})
