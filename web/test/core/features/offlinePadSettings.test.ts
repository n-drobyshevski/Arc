// Port of core/src/test/kotlin/dev/arc/ep133/features/OfflinePadSettingsTest.kt
import { describe, expect, it } from 'vitest'
import { OfflinePadSettings, type OfflinePadSetting } from '../../../src/core/features/offlinePadSettings'
import { PadSettings, type PadSettings as Settings } from '../../../src/core/features/padSettings'

const ps = (o: Partial<Settings> = {}): Settings => ({ ...PadSettings.DEFAULT, ...o })
const pitched: OfflinePadSetting = { project: 1, group: 0, pad: 5, settings: ps({ pitch: 1.5, level: 80, mode: 'key', release: 15 }) }
const trimmed: OfflinePadSetting = {
  project: 1,
  group: 1,
  pad: 2,
  settings: ps({ start: 100, end: 4000, pan: -8, muteGroup: true, midiChannel: 9, timeMode: 'bpm' }),
}

describe('OfflinePadSettingsTest', () => {
  it('one change per pad, the latest last, and a drop takes it back', () => {
    let p = OfflinePadSettings.put(OfflinePadSettings.put(OfflinePadSettings.EMPTY, pitched), trimmed)
    expect(OfflinePadSettings.size(p)).toBe(2)
    expect(OfflinePadSettings.at(p, 1, 0, 5)).toEqual(pitched)
    expect(OfflinePadSettings.at(p, 2, 0, 5)).toBeNull() // another project's pad
    expect(OfflinePadSettings.at(p, 1, 1, 5)).toBeNull() // another group's
    // New settings on the same pad replace its change and move it last.
    const louder: OfflinePadSetting = { ...pitched, settings: { ...pitched.settings, level: 100 } }
    p = OfflinePadSettings.put(p, louder)
    expect(p.list).toEqual([trimmed, louder])
    p = OfflinePadSettings.drop(p, 1, 0, 5)
    expect(p.list).toEqual([trimmed])
    expect(OfflinePadSettings.drop(p, 1, 0, 5)).toEqual(p) // nothing there: no change
  })

  it('the changes survive the round trip, and junk reads as nothing', () => {
    const p = OfflinePadSettings.put(OfflinePadSettings.put(OfflinePadSettings.EMPTY, pitched), trimmed)
    expect(OfflinePadSettings.toJson(p)).toBe(
      '{"v":1,"pads":[{"project":1,"group":0,"pad":5,"settings":{"pitch":1.5,"level":80,"pan":0,"mode":"key","start":0,' +
        '"attack":0,"release":15,"muteGroup":false,"midiChannel":0,"timeMode":"off"}},' +
        '{"project":1,"group":1,"pad":2,"settings":{"pitch":0,"level":100,"pan":-8,"mode":"oneshot","start":100,"end":4000,' +
        '"attack":0,"release":255,"muteGroup":true,"midiChannel":9,"timeMode":"bpm"}}]}',
    )
    expect(OfflinePadSettings.fromJson(OfflinePadSettings.toJson(p))).toEqual(p)
    expect(OfflinePadSettings.fromJson(OfflinePadSettings.toJson(OfflinePadSettings.EMPTY))).toEqual(OfflinePadSettings.EMPTY)
    expect(OfflinePadSettings.fromJson('not json')).toBeNull()
    expect(OfflinePadSettings.fromJson('[]')).toBeNull()
    expect(OfflinePadSettings.fromJson('{"v":2,"pads":[]}')).toBeNull()
    expect(OfflinePadSettings.fromJson('{"v":1}')).toEqual(OfflinePadSettings.EMPTY)
  })

  it("entries it can't read are skipped, and settings it can't read are the defaults, clamped", () => {
    const text = `{"v":1,"pads":[
      {"project":1,"group":0,"pad":5,"settings":{"pitch":1.5,"level":80,"mode":"key","release":15}},
      {"project":1,"group":4,"pad":6,"settings":{}},
      {"project":0,"group":0,"pad":6,"settings":{}},
      {"project":1,"group":0,"pad":"6","settings":{}},
      {"project":1,"group":0,"pad":6},
      {"project":1,"group":0,"pad":6,"settings":[]},
      7, null,
      {"project":1,"group":1,"pad":3,"settings":{"pitch":"x","level":300,"mode":"loop","end":-4}}
    ]}`
    const p = OfflinePadSettings.fromJson(text)!
    expect(p.list).toEqual([pitched, { project: 1, group: 1, pad: 3, settings: ps({ level: 100, end: 1 }) }])
  })
})
