// Port of core/src/test/kotlin/dev/arc/ep133/features/PadSettingsTest.kt
//
// Live's EDIT: a pad's SOUND EDIT settings, as pad metadata (community notes,
// see device.writePadSettings). Kotlin's IllegalArgumentException is a
// RangeError; the Pair keys of ProjectPads.settings are flatKey strings.
import { describe, expect, it } from 'vitest'
import { node } from '../../../src/core/features/padPush'
import { PadSettings, PLAY_MODES, PlayMode, type PadSettings as Settings } from '../../../src/core/features/padSettings'
import { flatKey, read as readPads, settings as padSettingsOf } from '../../../src/core/features/projectPads'
import { slotsUsedByProject } from '../../../src/core/formats/tar'
import { readPad, readProject, writePadSettings } from '../../../src/core/protocol/device'
import { DeviceError } from '../../../src/core/protocol/errors'
import { setMetadata, type JsonObject } from '../../../src/core/protocol/fs'
import { Session } from '../../../src/core/protocol/session'
import { tarFile } from '../../helpers/bytes'
import { DemoData } from '../../helpers/demoData'
import type { MockEP133 } from '../../helpers/mockDevice'

const meta = (text: string): JsonObject => JSON.parse(text) as JsonObject
const ps = (o: Partial<Settings> = {}): Settings => ({ ...PadSettings.DEFAULT, ...o })
const utf8Length = (s: string): number => new TextEncoder().encode(s).length

async function connect(dev: MockEP133): Promise<Session> {
  const s = new Session(dev.transport())
  await s.handshake()
  return s
}

/** A 26-byte pad record: slot, then the settings at ep133-ppak's offsets. */
function record(slot: number, volume: number, pitch: number, pan: number, attack: number, release: number, time: number, mute: number, mode: number): Uint8Array {
  const r = new Uint8Array(26)
  r[1] = slot & 0xff
  r[2] = (slot >> 8) & 0xff
  r[16] = volume & 0xff
  r[17] = pitch & 0xff
  r[18] = pan & 0xff
  r[19] = attack & 0xff
  r[20] = release & 0xff
  r[21] = time & 0xff
  r[22] = mute & 0xff
  r[23] = mode & 0xff
  return r
}

describe('PadSettingsTest', () => {
  it('the play modes by their device strings', () => {
    expect(PLAY_MODES).toEqual(['oneshot', 'key', 'legato'])
    expect(PlayMode.of('legato')).toBe(PlayMode.LEGATO)
    expect(PlayMode.of('Legato')).toBeNull()
    expect(PlayMode.of('loop')).toBeNull()
  })

  it('fromMeta reads numbers, numeric strings, booleans and 0 or 1, and clamps', () => {
    const m = meta(
      '{"sym":140,"sound.playmode":"key","sample.start":"100","sample.end":5000.4,"envelope.attack":12,' +
        '"envelope.release":" 40 ","sound.pitch":"-1.556","sound.amplitude":150,"sound.pan":-20,' +
        '"sound.mutegroup":1,"time.mode":"BPM","midi.channel":"3"}',
    )
    expect(PadSettings.fromMeta(m)).toEqual(
      ps({ pitch: -1.56, level: 100, pan: -16, mode: 'key', start: 100, end: 5000, attack: 12, release: 40, muteGroup: true, midiChannel: 3, timeMode: 'bpm' }),
    )
    // Play and time modes also as their record numbers; booleans as strings.
    const n = PadSettings.fromMeta(meta('{"sound.playmode":2,"time.mode":2,"sound.mutegroup":"false","envelope.release":999}'))
    expect(n.mode).toBe('legato')
    expect(n.timeMode).toBe('bar')
    expect(n.muteGroup).toBe(false)
    expect(n.release).toBe(255)
    // Unknown or unreadable values keep the base's.
    const base = ps({ pitch: 3.0, level: 80, mode: 'key', release: 15, muteGroup: true })
    const junk = meta(
      '{"sound.pitch":"high","sound.amplitude":null,"sound.playmode":"loop","envelope.release":true,' +
        '"sound.mutegroup":"yes","time.mode":"beat","midi.channel":[1],"sound.pan":"0x10","sample.end":"1e3"}',
    )
    expect(PadSettings.fromMeta(junk, base)).toEqual(base)
    expect(PadSettings.fromMeta({}, base)).toEqual(base)
    expect(PadSettings.fromMeta(null)).toEqual(PadSettings.DEFAULT)
    // A pitch outside -12..12 and a start past the end.
    expect(PadSettings.fromMeta(meta('{"sound.pitch":40}')).pitch).toBe(12.0)
    const t = PadSettings.fromMeta(meta('{"sample.start":900,"sample.end":300}'))
    expect([t.start, t.end]).toEqual([299, 300])
    expect(PadSettings.fromMeta(meta('{"sound.pitch":-12.0001}')).pitch).toBe(-12.0)
  })

  it('written tells settings from an untouched pad', () => {
    expect(PadSettings.written(null)).toBe(false)
    expect(PadSettings.written(meta('{}'))).toBe(false)
    expect(PadSettings.written(meta('{"sym":0}'))).toBe(false)
    expect(PadSettings.written(meta('{"sym":5}'))).toBe(true)
    expect(PadSettings.written(meta('{"sym":"5"}'))).toBe(true)
    expect(PadSettings.written(meta('{"sym":0,"sound.pitch":0}'))).toBe(true)
    expect(PadSettings.written(meta('{"envelope.release":15}'))).toBe(true)
    expect(PadSettings.written(meta('{"sym":0,"midi.channel":2}'))).toBe(false)
  })

  it('toMeta writes the full record, modes as strings, in order', () => {
    const s = ps({ pitch: 1.5, level: 80, pan: -4, mode: 'key', start: 10, end: 4000, attack: 3, release: 15, muteGroup: true, midiChannel: 9, timeMode: 'bpm' })
    expect(JSON.stringify(PadSettings.toMeta(s, 140, 5000))).toBe(
      '{"sym":140,"sound.playmode":"key","sample.start":10,"sample.end":4000,"envelope.attack":3,"envelope.release":15,' +
        '"sound.pitch":1.5,"sound.amplitude":80,"sound.pan":-4,"sound.mutegroup":true,"time.mode":"bpm","midi.channel":9}',
    )
    expect(Object.keys(PadSettings.toMeta(s, 140, 5000))).toEqual(PadSettings.KEYS)
    // No end of its own: the sample's end; neither known: no trim at all.
    const d = PadSettings.toMeta(PadSettings.DEFAULT, 7, 46875)
    expect(d['sample.start']).toBe(0)
    expect(d['sample.end']).toBe(46875)
    expect(d['sound.playmode']).toBe('oneshot')
    expect(d['time.mode']).toBe('off')
    expect(d['sound.mutegroup']).toBe(false)
    expect(Object.keys(PadSettings.toMeta(PadSettings.DEFAULT, 7, null))).toEqual(PadSettings.KEYS.filter((k) => k !== 'sample.start' && k !== 'sample.end'))
    // Clamped on the way out: an end past the sample's.
    expect(PadSettings.toMeta({ ...s, end: 9000 }, 140, 5000)['sample.end']).toBe(5000)
    // A time mode arc can't name goes as "off", still a string.
    expect(PadSettings.toMeta({ ...s, timeMode: 'a very long time mode the device never sent' }, 1, null)['time.mode']).toBe('off')
    expect(() => PadSettings.toMeta(s, 0, null)).toThrow(RangeError)
    expect(() => PadSettings.toMeta(s, 1000, null)).toThrow(RangeError)
    // The largest values stay under the 320-byte metadata page.
    const big: Settings = {
      pitch: -11.99, level: 100, pan: -16, mode: 'oneshot', start: 99_999_999_998, end: 99_999_999_999,
      attack: 255, release: 255, muteGroup: false, midiChannel: 15, timeMode: 'bpm',
    }
    const n = utf8Length(JSON.stringify(PadSettings.toMeta(big, 999, 99_999_999_999)))
    expect(n).toBeLessThan(320)
    // And the record reads back as it was written.
    expect(PadSettings.fromMeta(PadSettings.toMeta(big, 999, 99_999_999_999))).toEqual(big)
  })

  it('withMode pairs the release with oneshot', () => {
    const oneshot = PadSettings.DEFAULT
    const key = PadSettings.withMode(oneshot, 'key')
    expect(key.release).toBe(PadSettings.KEY_RELEASE)
    expect(key.mode).toBe('key')
    expect(PadSettings.withMode(key, 'oneshot').release).toBe(255)
    // A release of its own stays when leaving oneshot, and between key and legato.
    expect(PadSettings.withMode({ ...oneshot, release: 80 }, 'legato').release).toBe(80)
    expect(PadSettings.withMode({ ...key, release: 255 }, 'legato').release).toBe(255)
    expect(PadSettings.withMode({ ...key, release: 40 }, 'legato').release).toBe(40)
    // The same mode again: nothing changes.
    const odd = { ...oneshot, release: 90 }
    expect(PadSettings.withMode(odd, 'oneshot')).toEqual(odd)
  })

  it('clamped keeps the trim inside the sample', () => {
    expect(PadSettings.clamped(ps({ start: 500, end: 9000 }), 4000)).toEqual(ps({ start: 500, end: 4000 }))
    expect(PadSettings.clamped(ps({ start: 7000, end: 9000 }), 4000)).toEqual(ps({ start: 3999, end: 4000 }))
    expect(PadSettings.clamped(ps({ start: 200, end: 100 }), null)).toEqual(ps({ start: 99, end: 100 }))
    expect(PadSettings.clamped(ps({ start: -5, end: 0 }), null)).toEqual(ps({ start: 0, end: 1 }))
    // No end of its own: start stays before the sample's end, end stays null.
    expect(PadSettings.clamped(ps({ start: 5000 }), 4000)).toEqual(ps({ start: 3999 }))
    expect(PadSettings.clamped(ps({ start: 5000 }), null)).toEqual(ps({ start: 5000 }))
    expect(PadSettings.clamped(ps({ start: 5000 }), 0)).toEqual(ps({ start: 5000 })) // a length of 0 isn't known
    const wild = ps({ pitch: 1.23456, level: -3, pan: 99, attack: 300, release: -1, midiChannel: 16, timeMode: '?' })
    expect(PadSettings.clamped(wild, null)).toEqual(ps({ pitch: 1.23, level: 0, pan: 16, attack: 255, release: 0, midiChannel: 15 }))
    expect(PadSettings.clamped(ps({ pitch: Number.NaN }), null).pitch).toBe(0)
    expect(PadSettings.length(ps({ start: 500 }), 4000)).toBe(3500)
    expect(PadSettings.length(ps({ start: 500, end: 1500 }), 4000)).toBe(1000)
    expect(PadSettings.length(ps({ start: 5000 }), 4000)).toBe(0)
  })

  it('fromRecord decodes a plausible record and refuses the rest', () => {
    const rec = record(140, 80, -3, 5, 10, 15, 1, 1, 1)
    expect(PadSettings.fromRecord(rec)).toEqual(ps({ pitch: -3.0, level: 80, pan: 5, mode: 'key', attack: 10, release: 15, muteGroup: true, timeMode: 'bpm' }))
    // An unknown time mode reads as off; the rest must be in range.
    expect(PadSettings.fromRecord(record(1, 100, 0, 0, 0, 255, 7, 0, 0))!.timeMode).toBe('off')
    // The demo's records: all zero but the slot.
    const zero = new Uint8Array(26)
    zero[1] = 5
    expect(PadSettings.fromRecord(zero)).toBeNull()
    expect(PadSettings.fromRecord(record(1, 101, 0, 0, 0, 0, 0, 0, 0))).toBeNull()
    expect(PadSettings.fromRecord(record(1, 100, 13, 0, 0, 0, 0, 0, 0))).toBeNull()
    expect(PadSettings.fromRecord(record(1, 100, 0, -17, 0, 0, 0, 0, 0))).toBeNull()
    expect(PadSettings.fromRecord(record(1, 100, 0, 0, 0, 0, 0, 0, 3))).toBeNull()
    expect(PadSettings.fromRecord(rec.slice(0, 23))).toBeNull()
    expect(PadSettings.fromRecord(rec.slice(0, 24))).toEqual(PadSettings.fromRecord(rec))
  })

  it('ProjectPads reads the settings of plausible records only', () => {
    const good = record(140, 80, -3, 5, 10, 15, 0, 0, 1)
    const blank = new Uint8Array(26)
    blank[1] = 9
    const tar = tarFile([
      ['pads/b/p02', good],
      ['pads/a/p10', record(3, 100, 0, 0, 0, 255, 0, 0, 0)],
      ['pads/a/p01', good],
      ['pads/a/p03', blank],
      ['pads/c/p05', good],
      ['pads/c/p05', new Uint8Array(26)], // the last record of a pad counts
    ])
    const m = padSettingsOf(tar)
    expect([...m.keys()]).toEqual([flatKey('a', 1), flatKey('a', 10), flatKey('b', 2)])
    expect(m.get(flatKey('b', 2))).toEqual(PadSettings.fromRecord(good))
    expect(m.get(flatKey('a', 10))!.release).toBe(255)
    // The demo's all-zero records: none.
    expect(padSettingsOf(DemoData.projects()[0]!.tar)).toEqual(new Map())
    expect(padSettingsOf(new Uint8Array(10).fill(1))).toEqual(new Map())
    // The slots still read as before.
    expect(readPads(tar).find((g) => g.name === 'b')!.pads.get(2)).toBe(140)
    expect(slotsUsedByProject(tar)).toEqual([3, 9, 140])
  })

  it("readPad reads a pad's metadata, and writePadSettings writes all twelve keys", async () => {
    const dev = DemoData.device()
    const s = await connect(dev)
    // Untouched: sym 0 only, not settings.
    const before = await readPad(s, 1, 1, 2)
    expect(JSON.stringify(before)).toBe('{"sym":0}')
    expect(PadSettings.written(before)).toBe(false)
    const set = ps({ pitch: -2.5, level: 70, pan: 8, mode: 'legato', start: 100, end: 1200, attack: 4, release: 30, muteGroup: true, midiChannel: 2 })
    await writePadSettings(s, 1, 1, 2, 110, set, 2000)
    const [n, text] = dev.metaWrites[dev.metaWrites.length - 1]!
    expect(n).toBe(3302)
    expect(Object.keys(JSON.parse(text) as JsonObject)).toEqual(PadSettings.KEYS)
    const after = await readPad(s, 1, 1, 2)
    expect(PadSettings.written(after)).toBe(true)
    expect(PadSettings.fromMeta(after)).toEqual(set)
    expect(after).toEqual(dev.padMeta(1, 1, 2))
    // sym still lands in the project's pad record.
    expect(readPads(await readProject(s, 1)).find((g) => g.name === 'b')!.pads.get(2)).toBe(110)
    // Another pad is untouched; a project the device doesn't have reads empty.
    expect(JSON.stringify(await readPad(s, 1, 1, 3))).toBe('{"sym":0}')
    expect(await readPad(s, 9, 0, 1)).toEqual({})
    s.close()
  })

  it("the mock refuses a play or time mode that isn't a string, as the device does", async () => {
    const dev = DemoData.device()
    const s = await connect(dev)
    const pad = node({ project: 1, group: 0, pad: 1 })
    await expect(setMetadata(s, pad, meta('{"sym":3,"sound.playmode":1}'))).rejects.toBeInstanceOf(DeviceError)
    await expect(setMetadata(s, pad, meta('{"sym":3,"time.mode":0}'))).rejects.toBeInstanceOf(DeviceError)
    expect(JSON.stringify(await readPad(s, 1, 0, 1))).toBe('{"sym":0}')
    // A partial write merges into what is there.
    await setMetadata(s, pad, meta('{"sound.pitch":2}'))
    await setMetadata(s, pad, meta('{"sound.pan":-3}'))
    expect(JSON.stringify(await readPad(s, 1, 0, 1))).toBe('{"sym":0,"sound.pitch":2,"sound.pan":-3}')
    // No such project: refused.
    await expect(writePadSettings(s, 9, 0, 1, 1, PadSettings.DEFAULT, null)).rejects.toBeInstanceOf(DeviceError)
    s.close()
  })
})
