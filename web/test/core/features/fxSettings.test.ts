// Port of core/src/test/kotlin/dev/arc/ep133/features/FxSettingsTest.kt
//
// Web delta: the book is a Map; settings are built with FxSettings.of(),
// comp() and sidechain().
import { describe, expect, it } from 'vitest'
import { FX_TYPES, FxBook, FxKnobs, FxSettings, FxType, comp, fxTypeIndex, sidechain } from '../../../src/core/features/fxSettings'

const f = Math.fround

const busy = FxSettings.of({
  type: FxType.DELAY,
  x: 0.25,
  y: 0.75,
  sends: [0.5, 0, 1, 0.25],
  comp: comp({ on: true, x: 0.5, y: 1 }),
  sidechain: sidechain({ on: true, group: 2, pad: 5, dests: 0b0011, x: 0.5, y: 0.25 }),
})

describe('FxSettingsTest', () => {
  it('the defaults are no effect, no sends, nothing on', () => {
    const d = FxSettings.DEFAULT
    expect(d.type).toBe(FxType.NONE)
    expect(d.x).toBe(0.5)
    expect(d.y).toBe(0.5)
    expect(d.sends).toEqual([0, 0, 0, 0])
    expect(d.comp).toEqual(comp({ on: false, x: 0.5, y: 0.5 }))
    expect(d.sidechain).toEqual({ on: false, group: 0, pad: 0, dests: 0, x: f(0.3), y: 0.5 })
    // The ordinal is the mixer's control index.
    expect(FX_TYPES).toEqual(['NONE', 'DELAY', 'REVERB', 'DISTORTION', 'CHORUS', 'FILTER', 'COMPRESSOR'])
    expect(fxTypeIndex(FxType.COMPRESSOR)).toBe(6)
  })

  it('clamped holds every knob, send and index in range', () => {
    const wild = FxSettings.of({
      x: Number.NaN,
      y: 1.5,
      sends: [-1, 2],
      comp: comp({ on: true, x: -0.5, y: 3 }),
      sidechain: sidechain({ on: true, group: 9, pad: -1, dests: 0xff, x: 2, y: -2 }),
    })
    expect(FxSettings.clamped(wild)).toEqual(
      FxSettings.of({
        x: 0,
        y: 1,
        sends: [0, 1, 0, 0],
        comp: comp({ on: true, x: 0, y: 1 }),
        sidechain: sidechain({ on: true, group: 3, pad: 0, dests: 0xf, x: 1, y: 0 }),
      }),
    )
    expect(FxSettings.clamped(FxSettings.DEFAULT)).toEqual(FxSettings.DEFAULT)
    // -0 reads as 0.
    expect(Object.is(FxSettings.clamped(FxSettings.of({ x: -0 })).x, 0)).toBe(true)
  })

  it('the with functions change one thing', () => {
    let s = FxSettings.withType(FxSettings.DEFAULT, FxType.REVERB)
    s = FxSettings.withXY(s, 0.2, 1.4)
    s = FxSettings.withSend(FxSettings.withSend(s, 2, 0.6), 0, -1)
    expect(s.type).toBe(FxType.REVERB)
    expect(s.x).toBe(f(0.2))
    expect(s.y).toBe(1)
    expect(s.sends).toEqual([0, 0, f(0.6), 0])
    expect(FxSettings.withComp(s, comp({ on: true })).comp).toEqual(comp({ on: true }))
    expect(FxSettings.withSidechain(s, sidechain({ on: true, dests: 1 })).sidechain).toEqual(sidechain({ on: true, dests: 1 }))
  })

  it("each effect's knobs have their names", () => {
    expect(FX_TYPES.map(FxSettings.xLabel)).toEqual(['', 'LENGTH', 'SIZE', 'DRIVE', 'RATE', 'CUTOFF', 'DRIVE'])
    expect(FX_TYPES.map(FxSettings.yLabel)).toEqual(['', 'FEEDBACK', 'COLOR', 'COLOR', 'FEEDBACK', 'RESO', 'SPEED'])
  })

  it('readouts say what the knobs do', () => {
    const x = (type: FxType, ...pairs: [number, string][]): void => {
      for (const [k, want] of pairs) expect(FxSettings.xReadout(type, f(k), 120), `${type} x ${k}`).toBe(want)
    }
    const y = (type: FxType, ...pairs: [number, string][]): void => {
      for (const [k, want] of pairs) expect(FxSettings.yReadout(type, f(k)), `${type} y ${k}`).toBe(want)
    }
    x(FxType.NONE, [0.5, ''])
    y(FxType.NONE, [0.5, ''])
    x(FxType.DELAY, [0, '1/32'], [0.1, '1/16T'], [0.5, '1/4T'], [0.65, '1/8D'], [0.999, '1/2'], [1, '1/2'], [2, '1/2'])
    y(FxType.DELAY, [0, '0%'], [0.2, '19%'], [1, '95%'])
    x(FxType.REVERB, [0, '0%'], [0.64, '64%'], [1, '100%'])
    y(FxType.REVERB, [0, 'DARK 100'], [0.3, 'DARK 40'], [0.5, 'FLAT'], [0.6, 'BRIGHT 20'], [1, 'BRIGHT 100'])
    x(FxType.DISTORTION, [0, '1.0x'], [0.25, '3.4x'], [0.5, '11x'], [1, '40x'])
    y(FxType.DISTORTION, [0, 'LP 100'], [0.5, 'OPEN'], [0.75, 'HP 50'])
    x(FxType.CHORUS, [0, '0.05 Hz'], [0.5, '0.67 Hz'], [1, '5.00 Hz'])
    y(FxType.CHORUS, [0, '0%'], [1, '70%'])
    x(
      FxType.FILTER,
      [0, 'LPF 60'],
      [0.1, 'LPF 252'],
      [0.2, 'LPF 1.6k'],
      [0.4, 'LPF 12k'],
      [0.47, 'OPEN'],
      [0.5, 'OPEN'],
      [0.53, 'OPEN'],
      [0.6, 'HPF 46'],
      [0.8, 'HPF 1.5k'],
      [1, 'HPF 8.0k'],
    )
    y(FxType.FILTER, [0, 'Q 0.5'], [0.5, 'Q 4.3'], [1, 'Q 8.0'])
    x(FxType.COMPRESSOR, [0, '1.0x'], [0.5, '2.8x'], [1, '8.0x'])
    y(FxType.COMPRESSOR, [0, '0.5/40'], [0.5, '10/200'], [0.99, '30/600'], [1, '30/600'])
  })

  it("the knobs' mappings", () => {
    expect(FxKnobs.DELAY_DIVISIONS.length).toBe(12)
    expect(FxKnobs.DELAY_DIVISIONS[7]).toEqual({ name: '1/8D', num: 3, den: 4 })
    expect([0, 0.09, 0.5, 0.95, 1].map((v) => FxKnobs.delayDivision(f(v)))).toEqual([0, 1, 6, 11, 11])
    expect(FxKnobs.filterZone(f(0.46))).toBe(FxKnobs.LPF)
    expect(FxKnobs.filterZone(f(0.47))).toBe(FxKnobs.OPEN)
    expect(FxKnobs.filterZone(f(0.53))).toBe(FxKnobs.OPEN)
    expect(FxKnobs.filterZone(f(0.54))).toBe(FxKnobs.HPF)
    expect(FxKnobs.filterLpfHz(0)).toBe(60)
    expect(FxKnobs.filterLpfHz(FxKnobs.LPF_TOP)).toBe(20000)
    expect(FxKnobs.filterHpfHz(FxKnobs.HPF_BOTTOM)).toBe(20)
    expect(FxKnobs.filterHpfHz(1)).toBe(8000)
    expect(FxKnobs.reverbFeedback(0)).toBe(f(0.7))
    expect(FxKnobs.reverbFeedback(1)).toBe(f(0.98))
    expect(FxKnobs.distortionDrive(1)).toBe(40)
    expect(FxKnobs.compDrive(1)).toBe(8)
    expect(FxKnobs.COMP_SPEEDS[0]).toEqual({ name: '0.5/40', attackMs: 0.5, releaseMs: 40 })
    expect(FxKnobs.COMP_SPEEDS[7]).toEqual({ name: '30/600', attackMs: 30, releaseMs: 600 })
  })

  it('a book round-trips, its floats written exactly', () => {
    const book = new Map([
      [7, FxSettings.DEFAULT],
      [1, busy],
    ])
    const json = FxBook.toJson(book)
    expect(json).toBe(
      '{"v":1,"projects":[' +
        '{"project":1,"type":"DELAY","x":0.25,"y":0.75,"sends":[0.5,0,1,0.25],"comp":{"on":true,"x":0.5,"y":1},' +
        '"sidechain":{"on":true,"group":2,"pad":5,"dests":3,"x":0.5,"y":0.25}},' +
        '{"project":7,"type":"NONE","x":0.5,"y":0.5,"sends":[0,0,0,0],"comp":{"on":false,"x":0.5,"y":0.5},' +
        '"sidechain":{"on":false,"group":0,"pad":0,"dests":0,"x":0.30000001192092896,"y":0.5}}]}',
    )
    expect(FxBook.fromJson(json)).toEqual(book)
    expect([...FxBook.fromJson(json)!.keys()]).toEqual([1, 7])
    expect(FxBook.toJson(new Map())).toBe('{"v":1,"projects":[]}')
    expect(FxBook.fromJson(FxBook.toJson(new Map()))).toEqual(new Map())
    // Written clamped.
    expect(FxBook.fromJson(FxBook.toJson(new Map([[2, FxSettings.of({ x: 5 })]])))).toEqual(new Map([[2, FxSettings.of({ x: 1 })]]))
    // Any knob value comes back as the same float.
    const odd = FxSettings.of({ x: 0.1, y: 0.437, sends: [0.3, 0.7, 0.01, 0.99] })
    expect(FxBook.fromJson(FxBook.toJson(new Map([[3, odd]])))).toEqual(new Map([[3, odd]]))
  })

  it("junk reads as nothing, and entries it can't read are skipped", () => {
    expect(FxBook.fromJson('not json')).toBeNull()
    expect(FxBook.fromJson('[]')).toBeNull()
    expect(FxBook.fromJson('{"v":2,"projects":[]}')).toBeNull()
    expect(FxBook.fromJson('{"v":"1","projects":[]}')).toBeNull()
    expect(FxBook.fromJson('{"projects":[]}')).toBeNull()
    expect(FxBook.fromJson('{"v":1}')).toEqual(new Map())
    const text = `{"v":1,"projects":[
      {"project":100},
      {"project":"1"},
      {"project":1,"type":"FLANGER"},
      {"project":1,"x":"0.5"},
      {"project":1,"sends":0.5},
      {"project":1,"sends":[0.5,"0"]},
      {"project":1,"comp":true},
      {"project":1,"comp":{"on":1}},
      {"project":1,"sidechain":{"group":1.5}},
      {"project":2,"type":"DELAY","x":0.25},
      {"project":3,"type":"FILTER","x":2,"y":-1,"sends":[2],"comp":{"on":true},
        "sidechain":{"on":true,"group":9,"pad":-1,"dests":255,"x":0.75}},
      {"project":2,"type":"CHORUS"},
      "junk"
    ]}`
    const want = new Map([
      [2, FxSettings.of({ type: FxType.CHORUS })],
      [
        3,
        FxSettings.of({
          type: FxType.FILTER,
          x: 1,
          y: 0,
          sends: [1, 0, 0, 0],
          comp: comp({ on: true }),
          sidechain: sidechain({ on: true, group: 3, pad: 0, dests: 15, x: 0.75 }),
        }),
      ],
    ])
    expect(FxBook.fromJson(text)).toEqual(want)
  })
})
