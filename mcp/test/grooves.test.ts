// browse_grooves' gallery (src/grooves.ts, generated from the arc-beats
// skill's genres.md by scripts/gen-grooves.mjs), its search
// (src/tools/grooves.ts) and its words (src/groovesText.ts): the 36 recipes,
// each card valid and the same as the parser's fixture copied from the same
// file, the query, family and limit, the text the model reads, the messages
// the view sends, and the size of the whole gallery. The tool over HTTP is in
// server.test.ts.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseBeatCard } from '../../web/src/core/formats/beatCard'
import { CARDS } from '../../web/test/core/formats/beatCardFixtures'
import { FAMILIES, GROOVES } from '../src/grooves'
import { GroovesToolText, GroovesViewText, LIMIT_MAX, findGrooves, grooveMatches, grooveWords } from '../src/groovesText'
import { browseGrooves } from '../src/tools/grooves'

const ids = (r: { grooves: readonly { id: string }[] }): string[] => r.grooves.map((g) => g.id)

describe('the groove gallery', () => {
  it('has the 36 recipes of genres.md, each id once', () => {
    expect(GROOVES).toHaveLength(36)
    expect(LIMIT_MAX).toBe(GROOVES.length)
    expect(new Set(GROOVES.map((g) => g.id)).size).toBe(36)
    for (const g of GROOVES) expect(g.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(GROOVES[0]).toMatchObject({ id: 'house', name: 'House', family: 'House and club', bpm: '120-128', swing: '50-54' })
  })

  it('reads every card as valid, with no errors', () => {
    for (const g of GROOVES) {
      const r = parseBeatCard(g.card)
      expect(r.errors, g.name).toEqual([])
      expect(r.valid, g.name).toBe(true)
    }
  })

  it('puts every groove in a family, and every family has some', () => {
    for (const f of FAMILIES) expect(GROOVES.filter((g) => g.family === f).length, f).toBeGreaterThan(0)
    for (const g of GROOVES) expect(FAMILIES, g.name).toContain(g.family)
    expect(GROOVES.filter((g) => g.family === 'Techno')).toHaveLength(12)
    // Breakbeat with the breaks, the rock backbeat in a family of its own.
    expect(GROOVES.filter((g) => g.family === 'Drum and bass and breaks').map((g) => g.id)).toEqual([
      'drum-and-bass',
      'jungle',
      'breakcore',
      'breakcore-arrangement',
      'breakbeat',
    ])
    expect(GROOVES.filter((g) => g.family === 'Pop and rock').map((g) => g.id)).toEqual(['pop-and-rock-backbeat'])
  })

  it('marks the last seven as the EP-40 kit’s, in their own family', () => {
    const ep40 = GROOVES.filter((g) => g.ep40)
    expect(ep40).toEqual(GROOVES.slice(-7))
    expect(new Set(ep40.map((g) => g.family))).toEqual(new Set(['Reggae and dub (EP-40)']))
    expect(GROOVES.every((g) => !g.name.includes('(EP-40)'))).toBe(true)
  })

  it('holds the same cards as the parser’s fixtures from genres.md', () => {
    const fixtures = CARDS.filter((c) => c.source === 'genres.md')
    expect(fixtures).toHaveLength(36)
    for (const g of GROOVES) {
      const heading = g.ep40 ? `${g.name} (EP-40)` : g.name
      const fixture = fixtures.find((c) => c.heading === heading)
      expect(fixture, heading).toBeDefined()
      expect(g.card, heading).toBe(fixture!.card)
    }
  })

  it('keeps the notes under the cards and plain text for links', () => {
    expect(GROOVES.find((g) => g.id === 'house')!.note).toMatch(/^The `sidechain` line/)
    expect(GROOVES.find((g) => g.id === 'techno')!.note).toBeNull()
    expect(GROOVES.find((g) => g.id === 'one-drop')!.feel).toContain('see ep40-kit.md)')
    for (const g of GROOVES) expect(`${g.feel} ${g.note ?? ''}`, g.name).not.toMatch(/\]\(/)
    // The BPM line's half-time words go to the feel.
    const trap = GROOVES.find((g) => g.id === 'trap')!
    expect(trap.bpm).toBe('130-150')
    expect(trap.feel).toMatch(/A half-time feel: the snare is on 3 and the hats run double\.$/)
  })

  it.skipIf(!process.env.ARC_BEATS_SKILL)('is what gen-grooves.mjs writes from the skill (ARC_BEATS_SKILL)', () => {
    const script = fileURLToPath(new URL('../scripts/gen-grooves.mjs', import.meta.url))
    const out = execFileSync(process.execPath, [script, '--stdout'], { encoding: 'utf8' })
    expect(out).toBe(readFileSync(new URL('../src/grooves.ts', import.meta.url), 'utf8'))
  })

  it('stops gen-grooves.mjs with a clear error without genres.md', () => {
    const script = fileURLToPath(new URL('../scripts/gen-grooves.mjs', import.meta.url))
    const env = { ...process.env, ARC_BEATS_SKILL: '' }
    expect(() => execFileSync(process.execPath, [script, '--stdout'], { env, stdio: 'pipe' })).toThrow(/ARC_BEATS_SKILL/)
  })
})

describe('browseGrooves', () => {
  it('shows every groove without a query, in the recipes’ order', () => {
    const r = browseGrooves()
    expect(r).toEqual({ query: null, family: null, grooves: GROOVES, total: 36 })
    expect(browseGrooves('   ').query).toBeNull()
  })

  it('keeps the grooves with every word in their name, family or feel', () => {
    expect(ids(browseGrooves('dub'))).toEqual([
      'dub-techno',
      ...GROOVES.filter((g) => g.family === 'Reggae and dub (EP-40)').map((g) => g.id),
    ])
    // Name and feel words together, in any case and order.
    expect(ids(browseGrooves('TECHNO acid'))).toEqual(['acid-techno'])
    expect(ids(browseGrooves('half-time trap'))).toEqual(['trap', 'drill'])
    expect(ids(browseGrooves('808 stutter'))).toEqual(['trap'])
    // The family's name counts.
    expect(ids(browseGrooves('hip-hop and trap'))).toEqual(['boom-bap', 'lo-fi', 'trap', 'drill'])
    expect(browseGrooves('xyzzy')).toMatchObject({ query: 'xyzzy', grooves: [], total: 0 })
    expect(browseGrooves('a(b[')).toMatchObject({ grooves: [], total: 0 })
  })

  it('keeps the grooves with the whole query as words when some have it', () => {
    const breaks = GROOVES.filter((g) => g.family === 'Drum and bass and breaks').map((g) => g.id)
    // Not Melodic techno, whose feel has "drums" and "bass"; not Reggaeton for "reggae".
    expect(ids(browseGrooves('drum and bass'))).toEqual(breaks)
    expect(ids(browseGrooves('Breaks'))).toEqual(breaks)
    expect(ids(browseGrooves('reggae'))).toEqual(GROOVES.filter((g) => g.ep40).map((g) => g.id))
    // Part of a word still finds, as the view's search box narrows while typing.
    expect(ids(browseGrooves('regga'))).toContain('reggaeton-and-dembow')
    expect(ids(browseGrooves('tech'))).toEqual(ids(browseGrooves('techno')))
  })

  it('reads short names and spellings without the hyphen', () => {
    const breaks = ids(browseGrooves('drum and bass'))
    expect(ids(browseGrooves('dnb'))).toEqual(breaks)
    expect(ids(browseGrooves('D&B'))).toEqual(breaks)
    expect(ids(browseGrooves('ukg'))).toEqual(['uk-garage'])
    expect(ids(browseGrooves('lofi'))).toEqual(['lo-fi'])
    expect(ids(browseGrooves('hiphop'))).toEqual(ids(browseGrooves('hip-hop')))
    expect(ids(browseGrooves('hip hop'))).toEqual(ids(browseGrooves('hip-hop')))
    expect(ids(browseGrooves('hiphop'))).toEqual(expect.arrayContaining(['boom-bap', 'lo-fi', 'trap', 'drill']))
  })

  it('keeps to a family and to the limit, counting every match', () => {
    const ep40 = browseGrooves(null, 'Reggae and dub (EP-40)')
    expect(ep40.total).toBe(7)
    expect(ep40.grooves.every((g) => g.ep40)).toBe(true)
    expect(ids(browseGrooves('dub', 'Techno'))).toEqual(['dub-techno'])
    const three = browseGrooves('techno', null, 3)
    expect(three.grooves).toHaveLength(3)
    expect(three.total).toBe(browseGrooves('techno').total)
    expect(three.total).toBeGreaterThan(3)
    expect(browseGrooves(null, null, 0).grooves).toHaveLength(1)
  })

  it('shares its matching with the view’s search box', () => {
    const g = GROOVES.find((x) => x.id === 'uk-garage')!
    expect(grooveWords('  Skippy  skippy UK ')).toEqual(['skippy', 'uk'])
    expect(grooveWords('dnb')).toEqual(['drum', 'and', 'bass'])
    expect(grooveMatches(g, grooveWords('skippy uk'))).toBe(true)
    expect(grooveMatches(g, grooveWords('skippy techno'))).toBe(false)
    expect(grooveMatches(g, [])).toBe(true)
    // findGrooves is browseGrooves' search on any list, in its order.
    const some = GROOVES.slice(0, 20)
    expect(findGrooves(some, 'techno')).toEqual(some.filter((x) => browseGrooves('techno').grooves.includes(x)))
    expect(findGrooves(some, '  ')).toEqual(some)
  })
})

describe('GroovesToolText', () => {
  it('lists one line per groove with no cards', () => {
    const r = browseGrooves()
    const text = GroovesToolText.result(r, FAMILIES)
    expect(text.split('\n')[0]).toBe('36 grooves:')
    expect(text).toContain(
      'House — House and club — 120-128 BPM, swing 50-54 — four on the floor, a clap on 2 and 4',
    )
    for (const g of GROOVES) expect(text).toContain(GroovesToolText.line(g))
    // The note under a card comes last on its groove's line.
    const house = GROOVES.find((g) => g.id === 'house')!
    expect(GroovesToolText.line(house)).toBe(`House — House and club — 120-128 BPM, swing 50-54 — ${house.feel} — ${house.note}`)
    const techno = GROOVES.find((g) => g.id === 'techno')!
    expect(GroovesToolText.line(techno)).toBe(`Techno — Techno — 126-138 BPM, swing 50 — ${techno.feel}`)
    for (const g of GROOVES.filter((x) => x.note !== null)) expect(text).toContain(g.note!)
    expect(text).not.toContain('ARC BEAT 1')
    expect(text).not.toMatch(/\| [Xxo.]{4} /)
    expect(text).toContain('show_beat_card')
    expect(text.length).toBeLessThan(20_000)
  })

  it('says what was searched, how many matched, and when nothing did', () => {
    expect(GroovesToolText.result(browseGrooves('acid'), FAMILIES).split('\n')[0]).toBe('1 groove for "acid" matches:')
    expect(GroovesToolText.result(browseGrooves('techno', 'Techno', 2), FAMILIES).split('\n')[0]).toBe(
      `${browseGrooves('techno', 'Techno').total} grooves match for "techno" in Techno; the first 2:`,
    )
    const none = GroovesToolText.result(browseGrooves('xyzzy'), FAMILIES)
    expect(none).toMatch(/^No groove matches for "xyzzy"\./)
    expect(none).toContain(FAMILIES.join(', '))
  })

  it('keeps the whole gallery well under the hosts’ 150k characters', () => {
    const r = browseGrooves()
    const size = JSON.stringify(r).length + JSON.stringify(GroovesToolText.result(r, FAMILIES)).length
    expect(size).toBeLessThan(100_000)
  })
})

describe('GroovesViewText', () => {
  it('counts the tiles, and the grooves the limit left out', () => {
    expect(GroovesViewText.count(36, 36)).toBe('36 grooves')
    expect(GroovesViewText.count(1, 1)).toBe('1 groove')
    expect(GroovesViewText.count(12, 36)).toBe('12 of 36 grooves')
    expect(GroovesViewText.more(9)).toBe('9 more grooves match. Ask Claude for them.')
    expect(GroovesViewText.more(1)).toBe('1 more groove matches. Ask Claude for it.')
  })
})

describe('GroovesViewText messages', () => {
  const garage = GROOVES.find((g) => g.id === 'uk-garage')!
  const dub = GROOVES.find((g) => g.id === 'dub')!

  it('Make one like this names the groove, asks for show_beat_card and carries the card', () => {
    const m = GroovesViewText.likeMessage(garage)
    expect(m).toMatch(/^Make me a new ARC BEAT card in the style of the gallery's "UK garage" groove, using its card/)
    expect(m).toContain('show_beat_card')
    expect(m.endsWith('```\n' + garage.card + '\n```')).toBe(true)
    expect(GroovesViewText.likeMessage(dub)).toContain('"Dub" groove (for the EP-40 Riddim kit)')
  })

  it('Show in preview asks for the card as it is', () => {
    expect(GroovesViewText.previewMessage(garage)).toBe(
      `Show me the card of the gallery's "UK garage" groove with show_beat_card, as it is.\n\n\`\`\`\n${garage.card}\n\`\`\``,
    )
  })
})
