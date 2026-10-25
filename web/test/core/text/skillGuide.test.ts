// Web only (no Kotlin twin): scripts/gen-skill-guide.mjs, which writes the arc-beats
// skill's references/ep133-guide.md from guideData.ts.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as GuideText from '../../../src/core/text/guideText'
// @ts-expect-error: a plain .mjs script, without types
import { PREFIX } from '../../../scripts/gen-skill-guide.mjs'

const script = fileURLToPath(new URL('../../../scripts/gen-skill-guide.mjs', import.meta.url))
const md = execFileSync(process.execPath, [script, '--stdout'], { encoding: 'utf8' })
const all = GuideText.sections.flatMap((s) => s.entries)

describe('skill guide', () => {
  it('lists all 100 entries with ids per section, in guide order', () => {
    const headings = [...md.matchAll(/^### ([A-Z]+)-(\d+) (.*)$/gm)]
    expect(headings.length).toBe(100)
    expect(md).toContain('\n100 key combinations from')
    expect(headings.map((h) => h[3])).toEqual(all.map((e) => e.action))
    const ids = headings.map((h) => `${h[1]}-${h[2]}`)
    expect(new Set(ids).size).toBe(100)
    expect(ids.filter((id) => id.startsWith('SND-')).length).toBe(20)
    expect(ids.at(-1)).toBe('SYS-18')
    expect(md).toContain('- [Effects and performance](#effects-and-performance), FX-1 to FX-20')
  })

  it('every entry has its keys and source, and a Steps line when it has a combo', () => {
    expect(md.match(/^- \*\*Keys:\*\* /gm)!.length).toBe(100)
    expect(md.match(/^- \*\*Source:\*\* https:\/\/teenage\.engineering\/guides\/ep-133/gm)!.length).toBe(100)
    expect(md.match(/^- \*\*Steps:\*\* /gm)!.length).toBe(all.filter((e) => e.combo !== null).length)
  })

  it('spells combos out as numbered steps', () => {
    expect(md).toContain('- **Steps:** In SOUND mode: 1. press SHIFT and C twice, 2. press a group key (A to D), 3. press SHIFT and D')
    expect(md).toContain('- **Steps:** 1. hold a pad, 2. press SHIFT and C, 3. press SHIFT and D')
    expect(md).toContain('- **Steps:** 1. hold SHIFT, 2. turn KNOB X\n- **Or:** 1. hold SHIFT, 2. turn KNOB Y')
    expect(md).toContain('- **Steps:** 1. hold MAIN, 2. press the number pads (1 to 9)')
  })

  it('ids from guideId are the skill guide\'s, and the script\'s prefixes are GUIDE_IDS', () => {
    expect(PREFIX).toEqual(GuideText.GUIDE_IDS)
    expect(Object.keys(GuideText.GUIDE_IDS)).toEqual(GuideText.sections.map((s) => s.title))
    const ids = GuideText.sections.flatMap((s, i) => s.entries.map((_, j) => GuideText.guideId(i, j)))
    expect(ids.length).toBe(100)
    expect(new Set(ids).size).toBe(100)
    expect(ids).toEqual([...md.matchAll(/^### ([A-Z]+-\d+) /gm)].map((h) => h[1]))
    expect([ids[0], ids[20], ids.at(-1)]).toEqual(['SND-1', 'SMP-1', 'SYS-18'])
    expect(() => GuideText.guideId(0, 20)).toThrow(RangeError)
    expect(() => GuideText.guideId(5, 0)).toThrow(RangeError)
  })
})
