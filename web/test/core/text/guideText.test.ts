// Port of core/src/test/kotlin/dev/arc/ep133/text/GuideTextTest.kt
// (+ a check that scripts/gen-guide-data.mjs reproduces the committed guideData.ts).

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as GuideCombo from '../../../src/core/text/guideCombo'
import { ComboKeyError, ComboSyntaxError, KeyAction, KeyKind, comboStep, keyCap } from '../../../src/core/text/guideCombo'
import { DIGITS, GROUPS, PADS, PANEL_KEYS, PanelKeymap, keymapStep } from '../../../src/core/text/guideKeymap'
import * as GuideText from '../../../src/core/text/guideText'

const all = GuideText.sections.flatMap((s) => s.entries)

describe('GuideTextTest', () => {
  it('every entry is sourced from the official guide', () => {
    expect(GuideText.sections.length).toBe(5)
    expect(all.length).toBe(100)
    for (const s of GuideText.sections) expect(s.entries.length, s.title).toBeGreaterThan(0)
    for (const e of all) {
      expect(e.source.startsWith(GuideText.OFFICIAL_URL + '/'), e.source).toBe(true)
      expect(e.action.trim() !== '' && e.keys.trim() !== '', e.action).toBe(true)
    }
  })

  it('entries read as user text', () => {
    const fragments = ['http', 'Corrected', 'I removed', 'Citation', 'anchor']
    for (const e of all) {
      for (const text of [e.action, e.keys, e.note].filter((t): t is string => t !== null)) {
        for (const f of fragments) expect(text.includes(f), `"${f}" in: ${text}`).toBe(false)
        expect(text.trim()).toBe(text)
        const first = text[0]!
        expect(/\p{Lu}/u.test(first) || !/\p{L}/u.test(first), text).toBe(true)
        // Plain printable text only: no invisible or typographic characters.
        expect([...text].every((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) <= 0x7e && c.length === 1), text).toBe(true)
      }
    }
  })

  it('no combination is listed twice', () => {
    const norm = (s: string) => [...s.toLowerCase()].filter((c) => /[\p{L}\p{Nd}]/u.test(c)).join('')
    const keys = all.map((e) => norm(e.keys))
    const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))]
    expect(new Set(keys).size, `[${dupes.join(', ')}]`).toBe(keys.length)
    const actions = all.map((e) => norm(e.action))
    expect(new Set(actions).size).toBe(actions.length)
  })

  it('filter matches every word', () => {
    expect(GuideText.filter('  ')).toBe(GuideText.sections)
    const tempo = GuideText.filter('tempo SAMPLE')
    expect(tempo.length).toBeGreaterThan(0)
    for (const s of tempo)
      for (const e of s.entries) {
        const text = (e.action + ' ' + e.keys + ' ' + (e.note ?? '')).toLowerCase()
        expect(text.includes('tempo') && text.includes('sample'), e.action).toBe(true)
      }
    expect(GuideText.filter('zzzz-no-such-combo').length).toBe(0)
  })

  it('combos parse, and only draw keys their own text names', () => {
    const withCombo = all.filter((e) => e.combo !== null)
    expect(withCombo.length).toBe(93)
    for (const e of withCombo) {
      const combo = GuideCombo.parse(e.combo!)
      const text = e.keys
      const lower = text.toLowerCase()
      const has = (s: string) => lower.includes(s.toLowerCase())
      for (const option of combo.options)
        for (const step of option) {
          expect(step.keys.length, e.combo!).toBeGreaterThan(0)
          for (const k of step.keys) {
            let named: boolean
            switch (k.label) {
              case '+':
                named = has('+') || has('plus')
                break
              case '-':
                named = has('-')
                break
              case 'A-D':
                named = has('A-D') || has('group')
                break
              case 'A':
              case 'B':
              case 'C':
              case 'D':
                named = new RegExp(`\\b${k.label}\\b`).test(text)
                break
              case '1-9':
                named = has('1-9')
                break
              case '0-9':
                named = has('type') || has('number') || has('code') || /\p{Nd}/u.test(text)
                break
              default:
                named = has(k.label)
            }
            expect(named, `${k.label} is not in: ${text}`).toBe(true)
            let actionNamed: boolean
            switch (k.action) {
              case null:
                actionNamed = true
                break
              case KeyAction.HOLD:
                actionNamed = has('hold')
                break
              case KeyAction.DIAL:
                actionNamed = k.kind === KeyKind.PAD
                break
              case KeyAction.TURN:
                actionNamed = k.kind === KeyKind.KNOB
                break
              case KeyAction.MOVE:
                actionNamed = k.kind === KeyKind.FADER
                break
              case KeyAction.TWICE:
                actionNamed = has('twice')
                break
            }
            expect(actionNamed, `${k.action} on ${k.label} in: ${text}`).toBe(true)
          }
        }
      // The context line only repeats what the text (or the action) says.
      if (combo.context !== null) {
        const words = combo.context
          .toLowerCase()
          .split(/[^a-z-]+/)
          .filter((w) => w.length > 2 && w !== 'the')
        for (const w of words) {
          expect((lower + ' ' + e.action.toLowerCase()).includes(w), `"${w}" (context) not in: ${text}`).toBe(true)
        }
      }
    }
  })

  it('combo notation', () => {
    const c = GuideCombo.parse('[In SOUND mode] hold:SHIFT + -/+ > turn:KNOB X / KNOB Y | x2:C')
    expect(c.context).toBe('In SOUND mode')
    expect(c.options.length).toBe(2)
    const first = c.options[0]!
    expect(first[0]!.keys).toEqual([keyCap('SHIFT', KeyKind.LIGHT, KeyAction.HOLD), keyCap('-', KeyKind.LIGHT), keyCap('+', KeyKind.LIGHT)])
    expect(first[1]).toEqual(comboStep([keyCap('KNOB X', KeyKind.KNOB, KeyAction.TURN), keyCap('KNOB Y', KeyKind.KNOB)], true))
    const only = c.options[1]![0]!.keys
    expect(only.length).toBe(1)
    expect(only[0]).toEqual(keyCap('C', KeyKind.DARK, KeyAction.TWICE))
    expect(() => GuideCombo.parse('hold:NOPE')).toThrow(ComboKeyError)
    expect(() => GuideCombo.parse('spin:SHIFT')).toThrow(ComboKeyError)
    expect(() => GuideCombo.parse('SHIFT + A / B')).toThrow(ComboSyntaxError)
    expect(GuideText.tab(GuideText.sections[3]!)).toBe('FX')
    expect(GuideText.tab(GuideText.sections[0]!)).toBe('SOUNDS')
  })

  it('every combo maps onto the panel', () => {
    for (const e of all) {
      const map = PanelKeymap.of(e)
      if (map === null) continue
      expect(map.options.length > 0 && map.options.every((o) => o.length > 0), e.combo!).toBe(true)
      for (const option of map.options) for (const step of option) expect(step.keys.length, e.combo!).toBeGreaterThan(0)
      // A step that turns lights a knob, one that moves lights the fader, one that types lights the digits.
      for (const step of map.steps) {
        if (step.kind === 'TURN') expect(step.keys.some((k) => k === 'X' || k === 'Y'), e.combo!).toBe(true)
        if (step.kind === 'MOVE') expect(step.keys.includes('FADER'), e.combo!).toBe(true)
        if (step.kind === 'TYPE') expect(DIGITS.every((d) => step.keys.includes(d)), e.combo!).toBe(true)
      }
    }
    // Each key the illustration draws has a printed name.
    for (const k of PANEL_KEYS) expect(GuideText.panelLabel(k).length).toBeGreaterThan(0)
    expect(new Set(PADS).size).toBe(12)
  })

  it('combos read as steps on the panel', () => {
    // Hold SOUND, then type on the pads: two numbered steps.
    const load = PanelKeymap.parse('hold:SOUND + dial:0-9')
    expect(load.steps).toEqual([keymapStep(['SOUND'], 'HOLD'), keymapStep(DIGITS, 'TYPE')])
    expect(load.mode).toBeNull()
    // Pressed together, one step; then a press.
    expect(PanelKeymap.parse('SHIFT + ERASE > dial:0-9 > ENTER').steps).toEqual([
      keymapStep(['SHIFT', 'ERASE'], 'PRESS'),
      keymapStep(DIGITS, 'TYPE'),
      keymapStep(['ENTER'], 'PRESS'),
    ])
    // A mode, and alternatives.
    const knobs = PanelKeymap.parse('[In SOUND mode] turn:KNOB X / turn:KNOB Y')
    expect(knobs.mode).toBe('SOUND')
    expect(knobs.context).toBe('In SOUND mode')
    expect(knobs.steps).toEqual([keymapStep(['X', 'Y'], 'TURN', true)])
    expect(PanelKeymap.parse('[In sample mode] hold:pad').mode).toBe('SAMPLE')
    expect(PanelKeymap.parse('[In MAIN] SHIFT + C > SHIFT + D').mode).toBe('MAIN')
    expect(PanelKeymap.parse('[While playing] FX').mode).toBeNull()
    expect(PanelKeymap.parse('[In system settings] dial:0-9 > ENTER').mode).toBeNull()
    // Held alone; a pad is any of the twelve; A-D any group.
    expect(PanelKeymap.parse('[In SOUND mode] hold:pad').steps).toEqual([keymapStep(PADS, 'HOLD')])
    expect(PanelKeymap.parse('SOUND > A-D > pad').steps).toEqual([
      keymapStep(['SOUND'], 'PRESS'),
      keymapStep(GROUPS, 'PRESS'),
      keymapStep(PADS, 'PRESS'),
    ])
    // Held through the next step: not held again.
    expect(PanelKeymap.parse('hold:pad + SHIFT + C > hold:pad + SHIFT + D').steps).toEqual([
      keymapStep(PADS, 'HOLD'),
      keymapStep(['SHIFT', 'C'], 'PRESS'),
      keymapStep(['SHIFT', 'D'], 'PRESS'),
    ])
    // Moving the fader with a group held; pressing twice; two ways.
    expect(PanelKeymap.parse('hold:A-D + move:FADER').steps).toEqual([keymapStep(GROUPS, 'HOLD'), keymapStep(['FADER'], 'MOVE')])
    expect(PanelKeymap.parse('[In SOUND mode] SHIFT + x2:C > A-D > SHIFT + D').steps[0]!.kind).toBe('TWICE')
    const tempo = PanelKeymap.parse('TEMPO > turn:KNOB X | hold:TEMPO + dial:0-9')
    expect(tempo.options.length).toBe(2)
    expect(tempo.keys).toEqual(new Set(['TEMPO', 'X']))
    expect(PanelKeymap.parse('RECORD > -/+').steps[1]!.keys).toEqual(['MINUS', 'PLUS'])
    expect(PanelKeymap.parse('hold:MAIN + 1-9').steps[1]!.keys).toEqual(DIGITS.slice(1))
  })

  it('list and illustration words', () => {
    expect(GuideText.searchCount(93)).toBe('Search 93 shortcuts')
    expect(GuideText.modeTag('SOUND')).toBe('SOUND MODE')
    expect(GuideText.modeTag('sample')).toBe('SAMPLE MODE')
    expect(GuideText.tag(KeyAction.DIAL)).toBe('TYPE')
    expect(GuideText.tag(KeyAction.HOLD)).toBe('HOLD')
    expect(GuideText.stepTag('PRESS')).toBeNull()
    expect(GuideText.stepTag('HOLD')).toBe('HOLD')
    expect(GuideText.stepWord('TYPE')).toBe('type a number on the pads')
    expect(GuideText.step(2)).toBe('Step 2')
    expect(GuideText.panelSub('SOUND')).toBe('Edit')
    expect(GuideText.panelSub('PLAY')).toBeNull()
    expect(GuideText.knobLabel('Y')).toBe('Metronome')
  })
})

// Not in the Kotlin tests: web-only checks for the port itself.
describe('guide port', () => {
  it('the generator reproduces the committed guideData.ts', () => {
    const script = fileURLToPath(new URL('../../../scripts/gen-guide-data.mjs', import.meta.url))
    const committed = readFileSync(new URL('../../../src/core/text/guideData.ts', import.meta.url), 'utf8')
    const generated = execFileSync(process.execPath, [script, '--stdout'], { encoding: 'utf8' })
    expect(generated).toBe(committed)
  })

  it('the two error classes are distinct and carry the Kotlin messages', () => {
    expect(() => GuideCombo.parse('[In SOUND mode SHIFT')).toThrow(new ComboSyntaxError('unclosed context in "[In SOUND mode SHIFT"'))
    expect(() => GuideCombo.parse('SHIFT + A / B')).toThrow(new ComboSyntaxError('mixed + and / in "SHIFT + A / B"'))
    expect(() => GuideCombo.parse('hold:NOPE')).toThrow(new ComboKeyError('unknown key "NOPE" in "hold:NOPE"'))
    expect(() => GuideCombo.parse('spin:SHIFT')).toThrow(new ComboKeyError('unknown action in "spin:SHIFT"'))
    expect(() => GuideCombo.parse('constructor:SHIFT')).toThrow(ComboKeyError)
    expect(new ComboSyntaxError('x')).not.toBeInstanceOf(ComboKeyError)
    expect(new ComboKeyError('x')).not.toBeInstanceOf(ComboSyntaxError)
  })

  it('every combo key is one KEY_NAMES knows, and badges match the Kotlin text', () => {
    for (const e of all) {
      if (e.combo === null) continue
      for (const option of GuideCombo.parse(e.combo).options)
        for (const step of option) for (const k of step.keys) expect(GuideCombo.KEY_NAMES.has(k.label), k.label).toBe(true)
    }
    expect(GuideCombo.KEY_NAMES.size).toBe(26)
    expect(GuideCombo.parse('[While stopped] SHIFT + -/+').options[0]![0]!.keys.map((k) => k.label)).toEqual(['SHIFT', '-', '+'])
    expect(GuideCombo.parse('move:FADER').options[0]![0]!.keys[0]).toEqual(keyCap('FADER', KeyKind.FADER, KeyAction.MOVE))
    expect(GuideCombo.parse('dial:0-9').options[0]![0]!.keys[0]).toEqual(keyCap('0-9', KeyKind.PAD, KeyAction.DIAL))
    expect(['HOLD', 'DIAL', 'TURN', 'MOVE', 'TWICE'].map((a) => GuideText.badge(a as KeyAction))).toEqual(['HOLD', 'DIAL', 'TURN', 'MOVE', '2\u00D7'])
    expect(GuideText.tab(GuideText.sections[4]!)).toBe('SYSTEM')
    expect(GuideText.sections.map((s) => s.entries.length)).toEqual([20, 14, 28, 20, 18])
  })

  it('whitespace and edge cases follow Kotlin trim() and Java \\s', () => {
    // Kotlin trim() strips NBSP (Zs) but not U+FEFF; Java \s does not split on NBSP.
    expect(GuideText.filter('   ')).toBe(GuideText.sections)
    expect(GuideText.filter('﻿').length).toBe(0)
    expect(GuideText.filter('tempo sample').length).toBe(0)
    expect(GuideText.filter('\ttempo\n  SAMPLE ').map((s) => s.entries.length)).toEqual(GuideText.filter('tempo sample').map((s) => s.entries.length))
    expect(() => GuideCombo.parse('')).toThrow(new ComboKeyError('unknown key "" in ""'))
    expect(() => GuideCombo.parse('[]')).toThrow(new ComboKeyError('unknown key "" in "[]"'))
    expect(() => GuideCombo.parse(':SHIFT')).toThrow(new ComboKeyError('unknown key ":SHIFT" in ":SHIFT"'))
    expect(GuideCombo.parse(' [ X ]  SHIFT ').context).toBe('X')
  })
})
