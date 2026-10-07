// Port of core/src/test/kotlin/dev/arc/ep133/features/OfflinePadSettingsTest.kt
//
// Kotlin's Triple keys of byPad are padKey strings.
import { describe, expect, it } from 'vitest'
import { OfflinePadSettings, type OfflinePadSetting } from '../../../src/core/features/offlinePadSettings'
import { PadSettings, type PadSettings as Settings } from '../../../src/core/features/padSettings'

const ps = (o: Partial<Settings> = {}): Settings => ({ ...PadSettings.DEFAULT, ...o })
const pitched: OfflinePadSetting = {
  project: 1,
  group: 0,
  pad: 5,
  slot: 12,
  settings: ps({ pitch: 1.5, level: 80, mode: 'key', release: 15 }),
  base: PadSettings.DEFAULT,
  frames: null,
}
const trimmed: OfflinePadSetting = {
  project: 1,
  group: 1,
  pad: 2,
  slot: 140,
  settings: ps({ start: 100, end: 4000, pan: -8, muteGroup: true, midiChannel: 9, timeMode: 'bpm' }),
  base: ps({ pan: 3 }),
  frames: 4800,
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

  it("a later turn on the same sound keeps the first turn's base, another sound starts over", () => {
    const first = OfflinePadSettings.put(OfflinePadSettings.EMPTY, trimmed)
    // The sheet showed the first turn's settings by then; that base is not kept.
    const again: OfflinePadSetting = { ...trimmed, settings: { ...trimmed.settings, level: 50 }, base: trimmed.settings, frames: 5000 }
    const p = OfflinePadSettings.put(first, again)
    expect(p.list).toEqual([{ ...again, base: trimmed.base }])
    expect(OfflinePadSettings.at(p, 1, 1, 2)!.frames).toBe(5000)
    // Another sound on the pad: the whole entry is the new one.
    const other: OfflinePadSetting = { project: 1, group: 1, pad: 2, slot: 141, settings: ps({ level: 20 }), base: ps({ level: 90 }), frames: null }
    expect(OfflinePadSettings.put(p, other).list).toEqual([other])
    expect(OfflinePadSettings.at(OfflinePadSettings.put(p, other), 1, 1, 2)!.frames).toBeNull()
  })

  it("byPad gives each changed pad's settings", () => {
    const p = OfflinePadSettings.put(OfflinePadSettings.put(OfflinePadSettings.EMPTY, pitched), trimmed)
    expect(OfflinePadSettings.byPad(p)).toEqual(
      new Map([
        [OfflinePadSettings.padKey(1, 0, 5), pitched.settings],
        [OfflinePadSettings.padKey(1, 1, 2), trimmed.settings],
      ]),
    )
    expect([...OfflinePadSettings.byPad(p).keys()]).toEqual([OfflinePadSettings.padKey(1, 0, 5), OfflinePadSettings.padKey(1, 1, 2)])
    expect(OfflinePadSettings.byPad(OfflinePadSettings.EMPTY)).toEqual(new Map())
  })

  it('the changes survive the round trip, and junk reads as nothing', () => {
    const p = OfflinePadSettings.put(OfflinePadSettings.put(OfflinePadSettings.EMPTY, pitched), trimmed)
    expect(OfflinePadSettings.toJson(p)).toBe(
      '{"v":1,"pads":[{"project":1,"group":0,"pad":5,"slot":12,"settings":{"pitch":1.5,"level":80,"pan":0,"mode":"key","start":0,' +
        '"attack":0,"release":15,"muteGroup":false,"midiChannel":0,"timeMode":"off"},' +
        '"base":{"pitch":0,"level":100,"pan":0,"mode":"oneshot","start":0,' +
        '"attack":0,"release":255,"muteGroup":false,"midiChannel":0,"timeMode":"off"}},' +
        '{"project":1,"group":1,"pad":2,"slot":140,"settings":{"pitch":0,"level":100,"pan":-8,"mode":"oneshot","start":100,"end":4000,' +
        '"attack":0,"release":255,"muteGroup":true,"midiChannel":9,"timeMode":"bpm"},' +
        '"base":{"pitch":0,"level":100,"pan":3,"mode":"oneshot","start":0,' +
        '"attack":0,"release":255,"muteGroup":false,"midiChannel":0,"timeMode":"off"},"frames":4800}]}',
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
      {"project":1,"group":0,"pad":5,"slot":12,"settings":{"pitch":1.5,"level":80,"mode":"key","release":15},"base":{}},
      {"project":1,"group":4,"pad":6,"slot":12,"settings":{}},
      {"project":0,"group":0,"pad":6,"slot":12,"settings":{}},
      {"project":1,"group":0,"pad":"6","slot":12,"settings":{}},
      {"project":1,"group":0,"pad":6,"slot":12},
      {"project":1,"group":0,"pad":6,"slot":12,"settings":[]},
      {"project":1,"group":0,"pad":7,"settings":{}},
      {"project":1,"group":0,"pad":7,"slot":"12","settings":{}},
      {"project":1,"group":0,"pad":7,"slot":0,"settings":{}},
      {"project":1,"group":0,"pad":7,"slot":1000,"settings":{}},
      7, null,
      {"project":1,"group":1,"pad":3,"slot":9,"settings":{"pitch":"x","level":300,"mode":"loop","end":-4},"frames":"10"},
      {"project":1,"group":2,"pad":4,"slot":9,"settings":{"level":60},"base":[],"frames":0}
    ]}`
    const p = OfflinePadSettings.fromJson(text)!
    expect(p.list).toEqual([
      pitched,
      // No base: the settings; frames unreadable: unknown.
      { project: 1, group: 1, pad: 3, slot: 9, settings: ps({ level: 100, end: 1 }), base: ps({ level: 100, end: 1 }), frames: null },
      { project: 1, group: 2, pad: 4, slot: 9, settings: ps({ level: 60 }), base: ps({ level: 60 }), frames: null },
    ])
  })
})
