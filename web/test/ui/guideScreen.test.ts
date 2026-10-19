// Tests for the pure parts of the redesigned Guide (ports of
// app/src/main/kotlin/dev/arc/ep133/ui/screens/GuideScreen.kt,
// ui/components/GuideKeys.kt and ui/components/KoPanel.kt): the list's
// counts and ids, the small caps' names, and the K.O. II's layout and lit keys.
import { describe, expect, it } from 'vitest'
import { DIGITS, GROUPS, PADS, PANEL_KEYS, keymapStep, parse } from '../../src/core/text/guideKeymap'
import { filter, sections } from '../../src/core/text/guideText'
import { capText, capTone, stepLabels } from '../../src/ui/components/GuideKeys'
import { FADER_KNOB, FADER_SLOT, KO_ASPECT, Ko, RECTS, badgeLabel, litOf, type Rect } from '../../src/ui/components/KoPanel'
import { TOTAL, entryId, entryOf, tabCounts } from '../../src/ui/screens/GuideScreen'

describe('GuideScreen helpers', () => {
  it('counts every entry for the search placeholder', () => {
    expect(TOTAL).toBe(sections.reduce((n, s) => n + s.entries.length, 0))
    expect(TOTAL).toBeGreaterThan(50)
  })

  it('gives each tab its section size, or its matches while searching', () => {
    expect(tabCounts(null)).toEqual(sections.map((s) => s.entries.length))
    const found = filter('knob')
    const counts = tabCounts(found)
    expect(counts).toHaveLength(sections.length)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(found.reduce((n, s) => n + s.entries.length, 0))
    expect(tabCounts([])).toEqual(sections.map(() => 0))
  })

  it('finds an open entry by its id in any section', () => {
    const s = sections[1]!
    const e = s.entries[2]!
    expect(entryOf(entryId(s, e))).toBe(e)
    expect(entryOf(null)).toBeNull()
    expect(entryOf('nothing:here')).toBeNull()
  })

  it('ids are unique across the guide', () => {
    const ids = sections.flatMap((s) => s.entries.map((e) => entryId(s, e)))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('GuideKeys', () => {
  it('prints key names as the caps do', () => {
    expect(capText('pad')).toBe('PAD')
    expect(capText('0-9')).toBe('0–9')
    expect(capText('1-9')).toBe('1–9')
    expect(capText('A-D')).toBe('A–D')
    expect(capText('-')).toBe('−')
    expect(capText('SOUND')).toBe('SOUND')
  })

  it('colours KNOB X and RECORD signal, the pale keys light, the rest dark', () => {
    expect(capTone('KNOB X')).toBe('signal')
    expect(capTone('RECORD')).toBe('signal')
    for (const k of ['SHIFT', '-', '+', 'A', 'D', 'A-D', 'ERASE']) expect(capTone(k)).toBe('light')
    for (const k of ['SOUND', 'KNOB Y', 'pad', '0-9', 'ENTER', 'PLAY']) expect(capTone(k)).toBe('dark')
  })

  it("names a step's keys in the combo notation, a whole set as one", () => {
    expect(stepLabels(keymapStep(DIGITS, 'TYPE'))).toEqual(['0-9'])
    expect(stepLabels(keymapStep(DIGITS.slice(1), 'TYPE'))).toEqual(['1-9'])
    expect(stepLabels(keymapStep(PADS, 'PRESS'))).toEqual(['pad'])
    expect(stepLabels(keymapStep(GROUPS, 'PRESS', true))).toEqual(['A-D'])
    expect(stepLabels(keymapStep(['SHIFT', 'X'], 'TURN'))).toEqual(['SHIFT', 'KNOB X'])
    expect(stepLabels(keymapStep(['MINUS', 'PLUS'], 'PRESS'))).toEqual(['-', '+'])
    expect(stepLabels(keymapStep(['REC', 'FADER'], 'MOVE'))).toEqual(['RECORD', 'FADER'])
  })

  it('names every step of every combo in the guide', () => {
    for (const s of sections) {
      for (const e of s.entries) {
        if (e.combo === null) continue
        for (const step of parse(e.combo).steps) expect(stepLabels(step).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('KoPanel', () => {
  const inside = (r: Rect): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w + 2 <= Ko.W && r.y + r.h + 3 <= Ko.H
  const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

  it('is a drawing 560 wide, its aspect with the body edge', () => {
    expect(Ko.W).toBe(560)
    expect(KO_ASPECT).toBeCloseTo((560 + 4) / (Ko.H + 6), 6)
    expect(KO_ASPECT).toBeGreaterThan(0.8)
    expect(KO_ASPECT).toBeLessThan(0.95)
  })

  it('places every panel key inside the body, none on another', () => {
    expect([...RECTS.keys()].sort()).toEqual([...PANEL_KEYS].sort())
    const rects = [...RECTS.values()]
    for (const r of rects) expect(inside(r)).toBe(true)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i]!, rects[j]!)).toBe(false)
  })

  it('puts the fader between FADER and SHIFT, its knob on the slot', () => {
    const fader = RECTS.get('FADER')!
    const shift = RECTS.get('SHIFT')!
    expect(FADER_SLOT.y).toBeGreaterThan(fader.y + fader.h)
    expect(FADER_SLOT.y + FADER_SLOT.h).toBeLessThan(shift.y)
    expect(FADER_KNOB.x + FADER_KNOB.w / 2).toBeCloseTo(FADER_SLOT.x + FADER_SLOT.w / 2, 6)
  })

  it('lights nothing without a keymap', () => {
    const lit = litOf(null)
    expect(lit.spots.size).toBe(0)
    expect(lit.badges.size).toBe(0)
  })

  it('numbers a held key and only outlines the digits typed after it', () => {
    const lit = litOf(parse('hold:SOUND + dial:0-9'))
    expect([...lit.spots].sort()).toEqual(['SOUND', ...DIGITS].sort())
    expect([...lit.badges.keys()]).toEqual(['SOUND'])
    expect(badgeLabel(lit.badges.get('SOUND')!)).toBe('1 HOLD')
  })

  it('lights the fader itself when it is moved, the FADER key when it is held', () => {
    const moved = litOf(parse('hold:RECORD + move:FADER'))
    expect(moved.spots.has('SLIDER')).toBe(true)
    expect(moved.spots.has('FADER')).toBe(false)
    expect(badgeLabel(moved.badges.get('SLIDER')!)).toBe('2 MOVE')
    const held = litOf(parse('hold:FADER + pad'))
    expect(held.spots.has('FADER')).toBe(true)
    expect(held.spots.has('SLIDER')).toBe(false)
  })

  it('joins the steps of a key used twice, after the first step\'s kind', () => {
    const lit = litOf(parse('[In SOUND mode] SHIFT + x2:C > A-D > SHIFT + D'))
    expect(badgeLabel(lit.badges.get('SHIFT')!)).toBe('1·3 2×')
    expect(badgeLabel(lit.badges.get('D')!)).toBe('3')
    // A-D is a whole set: outlined, no badge on its keys from that step.
    expect(lit.spots.has('B')).toBe(true)
    expect(lit.badges.has('B')).toBe(false)
  })
})
