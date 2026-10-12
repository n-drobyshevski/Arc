// The device view's pure parts (web only: ui/live/DeviceView.tsx, ui/live/shortcuts.ts).
import { describe, expect, it } from 'vitest'
import { MirrorText } from '../../src/core/text/mirrorText'
import { WebText } from '../../src/core/text/webText'
import { emptyMirrorState, type MirrorUi } from '../../src/state/types'
import { displayDigits, firstSentence, plateStatus } from '../../src/ui/live/DeviceView'
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

describe('shortcut cards', () => {
  it("list a key's combinations from the guide, shortest first", () => {
    const sound = shortcutsFor('SOUND')
    expect(sound.length).toBe(3)
    for (const e of sound) expect(e.combo).toMatch(/\bSOUND\b/)
    expect(sound.map((e) => e.combo!.length)).toEqual([...sound.map((e) => e.combo!.length)].sort((a, b) => a - b))
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
