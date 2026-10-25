// lookup_combo's search (src/tools/guide.ts) and its words (src/guideText.ts):
// the whole-query search, the word-by-word fallback and its ranking, the
// limit, and the text the model reads. The tool over HTTP is in server.test.ts.
import { describe, expect, it } from 'vitest'
import { CHECK_NOTE, OFFICIAL_URL, sections } from '../../web/src/core/text/guideText'
import { GuideToolText, GuideViewText, LIMIT_MAX } from '../src/guideText'
import { GUIDE_SECTIONS, lookupCombo } from '../src/tools/guide'

const ids = (q: string, section: string | null = null, limit = LIMIT_MAX): string[] =>
  lookupCombo(q, section, limit).entries.map((e) => e.id)

describe('lookupCombo', () => {
  it('finds the entries with every word, in guide order, with ids and combos', () => {
    const r = lookupCombo('resample')
    expect(r.match).toBe('all')
    expect(r.entries.map((e) => e.id)).toEqual(['SMP-3', 'SMP-6', 'SMP-8', 'SMP-12'])
    expect(r.more).toBe(0)
    const chord = r.entries.find((e) => e.id === 'SMP-12')!
    const entry = sections[1]!.entries[11]!
    expect(chord).toEqual({ id: 'SMP-12', section: 'Sampling', ...entry })
    // Drawn as caps, or (a how-to of several steps) only in words.
    expect(r.entries.find((e) => e.id === 'SMP-8')!.combo).toBe('[In sample mode] SHIFT + pad > PLAY')
    expect(chord.combo).toBeNull()
    expect(r.checkNote).toBe(CHECK_NOTE)
    expect(r.officialUrl).toBe(OFFICIAL_URL)
    expect(ids('copy pattern')).toEqual(['SEQ-7', 'SEQ-21'])
  })

  it('keeps to a section when given one', () => {
    expect(ids('pattern', 'Sampling')).toEqual(['SMP-8'])
    expect(lookupCombo('resample', 'Sequencer').match).toBe('none')
    expect(lookupCombo('resample', 'Sequencer').section).toBe('Sequencer')
  })

  it('ranks by how many words match when none has them all, filler words left out', () => {
    // No entry has every word of the question.
    const r = lookupCombo('how do I resample a chord')
    expect(r.match).toBe('some')
    // resample + chord first (guide order between them), then resample alone.
    expect(r.entries.map((e) => e.id)).toEqual(['SMP-6', 'SMP-12', 'SMP-3', 'SMP-8'])
    const two = lookupCombo('chord resample tempo', null, LIMIT_MAX)
    expect(two.match).toBe('some')
    expect(two.entries.slice(0, 2).map((e) => e.id)).toEqual(['SMP-6', 'SMP-12'])
    // Filler words don't count, though "the" and "a" are in almost every entry.
    expect(lookupCombo('xyzzy the a').match).toBe('none')
  })

  it('answers none for no match, a blank query, or words that are nowhere', () => {
    for (const q of ['xyzzy', '   ', 'xyzzy plugh']) {
      const r = lookupCombo(q)
      expect(r.match, q).toBe('none')
      expect(r.entries).toEqual([])
      expect(r.more).toBe(0)
    }
  })

  it('returns at most limit entries and counts the rest', () => {
    const all = lookupCombo('pattern', null, LIMIT_MAX)
    expect(all.entries).toHaveLength(LIMIT_MAX)
    const four = lookupCombo('pattern')
    expect(four.entries).toEqual(all.entries.slice(0, 4))
    expect(four.more).toBe(all.more + LIMIT_MAX - 4)
    expect(lookupCombo('pattern', null, 1).entries).toHaveLength(1)
  })

  it('offers the guide’s sections as the section choices', () => {
    expect(GUIDE_SECTIONS).toEqual(sections.map((s) => s.title))
  })
})

describe('GuideToolText.result', () => {
  it('lists each entry with its id, keys, note and source, then the check note', () => {
    const text = GuideToolText.result(lookupCombo('resample'), GUIDE_SECTIONS)
    expect(text.startsWith('4 key combos from the official EP-133 guide (OS 2.5) for "resample":\n\nSMP-3 — ')).toBe(true)
    const e = lookupCombo('resample').entries[2]!
    expect(text).toContain(`\n\nSMP-8 — ${e.action}\nKeys: ${e.keys}\nNote: ${e.note}\nSource: ${e.source}\n\n`)
    expect(text.endsWith(CHECK_NOTE)).toBe(true)
    expect(text).not.toContain('more:')
  })

  it('says when only some words match, and how many more there are', () => {
    expect(GuideToolText.result(lookupCombo('how do I resample a chord'), GUIDE_SECTIONS)).toMatch(
      /^No entry of the official EP-133 guide \(OS 2\.5\) matches every word of "how do I resample a chord"\./,
    )
    const r = lookupCombo('pattern')
    expect(GuideToolText.result(r, GUIDE_SECTIONS)).toContain(`… and ${r.more} more: use more words, or pass a section.`)
    // Kept to a section already: only more words help.
    const kept = lookupCombo('pattern', 'Sequencer', 2)
    expect(kept.more).toBeGreaterThan(0)
    expect(GuideToolText.result(kept, GUIDE_SECTIONS)).toContain(`… and ${kept.more} more: use more words.`)
  })

  it('the description’s example tasks are all in the guide, every word matching', () => {
    const tasks = /\(([^)]*) …\)/.exec(GuideToolText.DESCRIPTION)![1]!.split(', ')
    expect(tasks).toContain('load a project')
    for (const task of [...tasks.flatMap((t) => t.split(' or ')), 'copy pattern', 'punch-in fx']) {
      expect(lookupCombo(task).match, task).toBe('all')
    }
  })

  it('says a combo it has not found is not in the official guide, with the sections', () => {
    const text = GuideToolText.result(lookupCombo('xyzzy', 'Sounds'), GUIDE_SECTIONS)
    expect(text).toMatch(/^That isn't in the official guide: .* matches "xyzzy" in Sounds\./)
    expect(text).toContain('instead of guessing a combo')
    expect(text).toContain(OFFICIAL_URL)
    expect(text).toContain("The guide's sections: Sounds, Sampling, Sequencer, Effects and performance, Projects and system.")
  })
})

describe('GuideViewText messages', () => {
  it('Show more like this and Make a beat name the entry', () => {
    const e = { id: 'SEQ-1', action: 'Record a pattern' }
    expect(GuideViewText.moreMessage(e)).toBe('Show me more EP-133 key combos like SEQ-1 (Record a pattern), with lookup_combo.')
    expect(GuideViewText.beatMessage(e)).toMatch(/^Make me an ARC BEAT card that uses SEQ-1 \(Record a pattern\),.*show_beat_card\.$/)
    expect(GuideViewText.more(1)).toBe('1 more matches. Ask Claude to narrow it down.')
    expect(GuideViewText.more(3)).toBe('3 more match. Ask Claude to narrow it down.')
  })
})
