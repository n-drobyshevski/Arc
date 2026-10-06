// Port of core/src/test/kotlin/dev/arc/ep133/features/OfflinePadsTest.kt
import { describe, expect, it } from 'vitest'
import { OfflinePads, SoundSource, type OfflinePad } from '../../../src/core/features/offlinePads'

const kick: OfflinePad = { project: 1, group: 0, pad: 5, slot: 343, name: 'kick', source: SoundSource.FACTORY }
const snare: OfflinePad = { project: 1, group: 1, pad: 2, slot: 7, name: 'snare', source: SoundSource.DEVICE }

describe('OfflinePadsTest', () => {
  it('one change per pad, the latest last, and a drop takes it back', () => {
    let p = OfflinePads.put(OfflinePads.put(OfflinePads.EMPTY, kick), snare)
    expect(OfflinePads.size(p)).toBe(2)
    expect(OfflinePads.at(p, 1, 0, 5)).toEqual(kick)
    expect(OfflinePads.at(p, 2, 0, 5)).toBeNull() // another project's pad
    expect(OfflinePads.at(p, 1, 1, 5)).toBeNull() // another group's
    // Another sound on the same pad replaces its change and moves it last.
    const hat: OfflinePad = { ...kick, slot: 200, name: 'hat', source: SoundSource.DEVICE }
    p = OfflinePads.put(p, hat)
    expect(p.list).toEqual([snare, hat])
    p = OfflinePads.drop(p, 1, 0, 5)
    expect(p.list).toEqual([snare])
    expect(OfflinePads.drop(p, 1, 0, 5)).toEqual(p) // nothing there: no change
    expect(SoundSource.DEVICE).toBe('device')
    expect(SoundSource.of('factory')).toBe(SoundSource.FACTORY)
    expect(SoundSource.of('cloud')).toBeNull()
  })

  it('the changes survive the round trip, and junk reads as nothing', () => {
    const p = OfflinePads.put(OfflinePads.put(OfflinePads.EMPTY, kick), snare)
    expect(OfflinePads.toJson(p)).toBe(
      '{"v":1,"pads":[{"project":1,"group":0,"pad":5,"slot":343,"name":"kick","source":"factory"},' +
        '{"project":1,"group":1,"pad":2,"slot":7,"name":"snare","source":"device"}]}',
    )
    expect(OfflinePads.fromJson(OfflinePads.toJson(p))).toEqual(p)
    expect(OfflinePads.fromJson(OfflinePads.toJson(OfflinePads.EMPTY))).toEqual(OfflinePads.EMPTY)
    expect(OfflinePads.fromJson('not json')).toBeNull()
    expect(OfflinePads.fromJson('[]')).toBeNull()
    expect(OfflinePads.fromJson('{"v":2,"pads":[]}')).toBeNull()
    expect(OfflinePads.fromJson('{"pads":[]}')).toBeNull()
    expect(OfflinePads.fromJson('{"v":1}')).toEqual(OfflinePads.EMPTY)
  })

  it("entries it can't read are skipped, and a later change of a pad wins", () => {
    const text = `{"v":1,"pads":[
      {"project":1,"group":0,"pad":5,"slot":343,"name":"kick","source":"factory"},
      {"project":1,"group":0,"pad":6,"slot":"8","name":"x","source":"device"},
      {"project":1,"group":4,"pad":6,"slot":8,"name":"x","source":"device"},
      {"project":0,"group":0,"pad":6,"slot":8,"name":"x","source":"device"},
      {"project":1,"group":0,"pad":6,"slot":8,"name":5,"source":"device"},
      {"project":1,"group":0,"pad":6,"slot":8,"name":"x","source":"cloud"},
      {"project":1,"group":0,"pad":6,"slot":8,"name":"x"},
      {"project":1,"group":0,"slot":8,"name":"x","source":"device"},
      7, null, [],
      {"project":1,"group":1,"pad":2,"slot":7,"name":"snare","source":"device"},
      {"project":1,"group":0,"pad":5,"slot":344,"name":"kick 2","source":"factory"}
    ]}`
    const p = OfflinePads.fromJson(text)!
    expect(p.list).toEqual([snare, { ...kick, slot: 344, name: 'kick 2' }])
  })

  it('a device sound fits while the device holds it in that slot', () => {
    const names = new Map([
      [7, ' Snare.WAV '],
      [8, 'clap'],
    ])
    expect(OfflinePads.fits(snare, 1, names)).toBe(true) // case, spaces and .wav as PadSoundCache.sameName
    expect(OfflinePads.fits({ ...snare, slot: 8 }, 1, names)).toBe(false) // another sound there now
    expect(OfflinePads.fits({ ...snare, slot: 9 }, 1, names)).toBe(false) // nothing there
    // An unnamed slot is not the device sound that was picked.
    expect(OfflinePads.fits({ ...snare, slot: 343, name: 'kick' }, 1, new Map([[343, '343.pcm']]))).toBe(false)
  })

  it('a factory sound fits where the device has it, named or unnamed', () => {
    expect(OfflinePads.fits(kick, 1, new Map([[343, '343.pcm']]))).toBe(true)
    expect(OfflinePads.fits(kick, 1, new Map([[343, 'KICK']]))).toBe(true)
    expect(OfflinePads.fits(kick, 1, new Map([[343, 'my take']]))).toBe(false)
    expect(OfflinePads.fits(kick, 1, new Map([[343, '344.pcm']]))).toBe(false)
    expect(OfflinePads.fits(kick, 1, new Map())).toBe(false)
  })

  it('a change made on another project is skipped', () => {
    const names = new Map([
      [343, '343.pcm'],
      [7, 'snare'],
    ])
    expect(OfflinePads.fits(kick, 2, names)).toBe(false)
    expect(OfflinePads.fits(snare, null, names)).toBe(false)
    expect(OfflinePads.fits(snare, 1, names)).toBe(true)
  })
})
