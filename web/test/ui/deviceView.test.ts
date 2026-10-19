// The device view's pure parts (web only: ui/live/DeviceView.tsx, ui/live/shortcuts.ts).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MirrorText } from '../../src/core/text/mirrorText'
import { WebText } from '../../src/core/text/webText'
import { emptyMirrorState, type MirrorUi } from '../../src/state/types'
import { DIGIT_GLYPHS, displayDigits, editWord, firstSentence, pageWord, patternBitsOf, patternKey, plateStatus, readoutDigits, stepsKey, stepsOf } from '../../src/ui/live/DeviceView'
import { hasWords, patternRuns, recordLight, type TransportUi } from '../../src/ui/live/PatternLine'
import { PATTERN_UI } from '../../src/state/patternPlan'
import { EDIT_PAGES } from '../../src/ui/sheets/PadEditPages'
import { FX_TYPES } from '../../src/core/features/fxSettings'
import { cardSearch, shortcutsFor } from '../../src/ui/live/shortcuts'
import type { TakeUi } from '../../src/ui/live/Takes'

const noop = (): void => {}
const idle: TakeUi = { state: { kind: 'idle' }, onTake: noop }
const st = (over: Partial<ReturnType<typeof emptyMirrorState>> = {}) => ({ ...emptyMirrorState(), ...over })
const ui = (over: Partial<MirrorUi> = {}): MirrorUi => ({ state: st(), loading: false, error: null, offline: null, ...over })

describe('the seven-segment digits', () => {
  it('show the tempo, rounded', () => {
    expect(displayDigits(st({ bpm: 122.4 }), ui(), idle)).toEqual({ text: '122', dot: false, bpm: true })
    expect(displayDigits(st({ bpm: 90 }), ui(), idle).text).toBe(' 90')
  })
  it('dashes without a clock, OFF offline', () => {
    expect(displayDigits(st(), ui(), idle).text).toBe('---')
    expect(displayDigits(st(), ui({ offline: 'Last seen Oct 5, 2:04 PM' }), idle)).toEqual({ text: 'OFF', dot: false, bpm: false })
  })
  it("show the take's time while recording, minutes then a dot", () => {
    expect(displayDigits(st({ bpm: 120 }), ui(), { state: { kind: 'recording', seconds: 72 }, onTake: noop })).toEqual({ text: '112', dot: true, bpm: false })
    expect(displayDigits(st(), ui(), { state: { kind: 'recording', seconds: 5 }, onTake: noop }).text).toBe('005')
  })
})

describe('the digits on the key layer', () => {
  it("show a control's readout in three characters, a point where it has decimals", () => {
    const d = (r: string): string => {
      const o = readoutDigits(r)
      return o.dot === null ? o.text : `${o.text.slice(0, o.dot + 1)}.${o.text.slice(o.dot + 1)}`
    }
    expect(d('62')).toBe(' 62')
    expect(d('62%')).toBe(' 62')
    expect(d('128')).toBe('128')
    expect(d('1000')).toBe('000')
    expect(d('-12')).toBe('-12')
    expect(d('+1.5')).toBe(' 1.5')
    expect(d('0.02 s')).toBe('0.02')
    expect(d('12.75')).toBe('12.7')
    expect(d('-1.5')).toBe('-1.5')
    expect(d('1/16')).toBe(' 16')
    expect(d('1/8T')).toBe(' 8T')
    expect(d('Oneshot')).toBe('ONE')
    expect(d('C')).toBe('C  ')
    expect(d('L8')).toBe('L8 ')
    expect(d(MirrorText.NO_VALUE)).toBe('---')
  })

  it("spell each page's word, and every character they use can be drawn", () => {
    expect(pageWord('SOUND', 'NONE', 0)).toBe('SND')
    expect(pageWord('EDIT', 'NONE', EDIT_PAGES.indexOf('TRIM'))).toBe('TRM')
    expect(pageWord('FX', 'DELAY', 0)).toBe('DLY')
    expect(pageWord('MAIN', 'NONE', 0)).toBeNull()
    const words = [
      ...(['SOUND', 'TEMPO', 'TIMING', 'OUTPUT', 'SIDECHAIN'] as const).map((p) => pageWord(p, 'NONE', 0)!),
      ...EDIT_PAGES.map((_, i) => editWord(i)),
      ...FX_TYPES.map((t) => pageWord('FX', t, 0)!),
      'EDT',
    ]
    for (const w of words) for (const ch of w) expect(DIGIT_GLYPHS.has(ch), `${w}: ${ch}`).toBe(true)
  })
})

describe('the plate', () => {
  it('names the project, else Live', () => {
    expect(plateStatus(st({ activeProject: 3 }), ui(), idle)).toBe(MirrorText.project(3))
    expect(plateStatus(st(), ui(), idle)).toBe(MirrorText.TITLE)
  })
  it('says REC and offline', () => {
    expect(plateStatus(st(), ui(), { state: { kind: 'armed' }, onTake: noop })).toBe(WebText.TAKE_ARMED)
    expect(plateStatus(st(), ui(), { state: { kind: 'recording', seconds: 12 }, onTake: noop })).toBe('Take 0:12')
    expect(plateStatus(st(), ui({ offline: 'Last seen Oct 5, 2:04 PM' }), idle)).toBe('Offline · Last seen Oct 5, 2:04 PM')
  })
})

describe('the keys the device renders by', () => {
  it("hold − / +'s route and where each steps, and none without a layer", () => {
    for (const s of [{ route: 'group', minus: true, plus: false }, { route: 'length', minus: false, plus: true }, { route: 'octave', minus: true, plus: true }] as const) {
      expect(stepsOf(stepsKey(s))).toEqual(s)
    }
    expect(stepsKey(null)).toBe('')
    expect(stepsOf('')).toBeNull()
  })
  it("hold what the device shows of the pattern, and none without one", () => {
    const t = (over: Partial<typeof PATTERN_UI>): TransportUi => ({ ui: { ...PATTERN_UI, ...over } }) as unknown as TransportUi
    for (const ui of [{}, { phase: 'ARMED' }, { phase: 'COUNT_IN' }, { phase: 'PLAYING', recording: true }, { phase: 'PLAYING' }, { erase: true }] as const) {
      const u = t(ui).ui
      expect(patternBitsOf(patternKey(t(ui))), JSON.stringify(ui)).toEqual({ light: recordLight(u), runs: patternRuns(u), erase: u.erase, words: hasWords(u) })
    }
    expect(patternKey(null)).toBe('')
    expect(patternBitsOf('')).toBeNull()
  })
})

describe('shortcut cards', () => {
  it("list a control's combinations from the guide, shortest first", () => {
    const fader = shortcutsFor('FADER')
    expect(fader.length).toBe(3)
    for (const e of fader) expect(e.combo).toMatch(/\bFADER\b/)
    expect(fader.map((e) => e.combo!.length)).toEqual([...fader.map((e) => e.combo!.length)].sort((a, b) => a - b))
    expect(shortcutsFor('KNOBX').every((e) => /KNOB ?X/.test(e.combo!))).toBe(true)
    expect(shortcutsFor('KNOBX').length).toBeGreaterThan(0)
    expect(shortcutsFor('VOLUME')).toEqual([])
    expect(cardSearch('KNOBY')).toBe('knob Y')
  })
  it('keep the first sentence of an action', () => {
    expect(firstSentence('Delete fader automation. With playback stopped, hold it.')).toBe('Delete fader automation.')
    expect(firstSentence('Open the system settings')).toBe('Open the system settings')
  })
})

describe("the drawing's colours", () => {
  const css = readFileSync(new URL('../../src/ui/live/DeviceView.css', import.meta.url), 'utf8')
  const block = (selector: string): Set<string> => {
    const start = css.indexOf(`${selector} {`)
    expect(start, selector).toBeGreaterThanOrEqual(0)
    const body = css.slice(start, css.indexOf('}', start))
    return new Set([...body.matchAll(/(--ep-[\w-]+):/g)].map((m) => m[1]!))
  }
  const ep133 = block(':root')

  it('every token the drawing uses is the EP-133\'s', () => {
    const used = new Set([...css.matchAll(/var\((--ep-[\w-]+)/g)].map((m) => m[1]!))
    for (const t of used) if (t !== '--ep-font' && t !== '--ep-thin') expect(ep133.has(t), t).toBe(true)
  })

  it('the EP-40 and the EP-1320 only redefine those, and recolour the body, the keys and the pads', () => {
    for (const skin of ['EP40', 'EP1320']) {
      const own = block(`:root[data-skin=${skin}]`)
      for (const t of own) expect(ep133.has(t), `${skin} ${t}`).toBe(true)
      for (const t of ['--ep-body-1', '--ep-plate-1', '--ep-glass-1', '--ep-black', '--ep-group', '--ep-rec', '--ep-play', '--ep-pad', '--ep-pad-ink']) expect(own.has(t), `${skin} ${t}`).toBe(true)
    }
  })
})
