// FxBusTest.kt's cases, on the web port.
import { describe, expect, it } from 'vitest'
import { FxBus, FxControl } from '../../../../src/core/formats/fx/fxBus'
import { Lcg } from '../../../../src/core/formats/fx/fxMath'
import { VoiceMixer, VoiceShape } from '../../../../src/core/formats/voiceMixer'

const f = Math.fround

const steady = (n: number, v = 1000): Int16Array => new Int16Array(n).fill(v)

function render(m: VoiceMixer, frames: number): Int16Array {
  const out = new Int16Array(frames * 2)
  m.render(out, frames)
  return out
}

const left = (out: Int16Array): number[] => [...out].filter((_, i) => i % 2 === 0)

/** A random integer in [from, until), from [lcg]. */
const int = (lcg: Lcg, from: number, until: number): number => from + Math.trunc(lcg.unit() * (until - from))

/**
 * Random presses on random buses, the same for each mixer from the same
 * [seed]; [extra] adds controls between renders, with numbers of its own.
 */
function play(m: VoiceMixer, seed: number, extra: (m: VoiceMixer, r: Lcg) => void = () => {}): number[] {
  const r = new Lcg(seed)
  const own = new Lcg(seed + 1000)
  const sounds = Array.from({ length: 4 }, () => Int16Array.from({ length: int(r, 200, 4200) }, () => int(r, -32768, 32768)))
  const out: number[] = []
  for (let n = 0; n < 300; n++) {
    const key = `k${int(r, 0, 6)}`
    const what = int(r, 0, 10)
    if (what <= 3) {
      const shape = VoiceShape.of({ bus: int(r, -1, 4), duckSource: int(r, 0, 4) === 0, gain: f(r.unit()) })
      const at = int(r, 0, 2) === 0 ? VoiceMixer.NOW : m.frame + int(r, 0, 400)
      m.start(key, sounds[int(r, 0, 4)]!, 1, 44100, int(r, -12, 13), 0, shape, at)
    } else if (what <= 5) {
      m.release(key)
    } else {
      extra(m, own)
      out.push(...render(m, int(r, 1, 301)))
    }
  }
  return out
}

describe('FxBus', () => {
  it('leaves the mix exactly as it was at its defaults', () => {
    const plain = play(new VoiceMixer(48000), 1)
    // Every control at its default value, again and again: not a sample changes.
    const controlled = play(new VoiceMixer(48000), 1, (m, r) => {
      m.control(FxControl.FX_TYPE, FxControl.NONE, 0.5, 0.5)
      m.control(FxControl.SEND, int(r, 0, 4), 0, 0)
      m.control(FxControl.COMP, 0, 0.5, 0.5)
      m.control(FxControl.SIDECHAIN, 0, r.unit(), r.unit())
      m.control(FxControl.TEMPO, 0, 20 + r.unit() * 280, 0)
      m.control(FxControl.PUNCH, int(r, 0, FxControl.SLOTS), 0, 0)
      m.control(FxControl.FX_XY, 0, r.unit(), r.unit())
    })
    expect(controlled).toEqual(plain)
    // And the bus itself: begin, gains and process leave a mix alone.
    const bus = new FxBus(44100)
    const r = new Lcg(2)
    const mix = Float32Array.from({ length: 512 }, () => f(f(r.unit() * 65536) - 32768))
    const copy = mix.slice()
    bus.begin(256)
    bus.gains(0, 100, 0)
    bus.gains(100, 156, 100)
    for (let g = 0; g < FxControl.GROUPS; g++) {
      expect(bus.dry(g)).toBeNull()
      expect(bus.send(g)).toBeNull()
    }
    bus.process(mix, 256)
    expect(mix).toEqual(copy)
  })

  it('leaves the dry whole with sends and no effect', () => {
    const plain = play(new VoiceMixer(44100), 3)
    const sent = play(new VoiceMixer(44100), 3, (m, r) => m.control(FxControl.SEND, int(r, 0, 4), r.unit(), 0))
    expect(sent).toEqual(plain)
  })

  it('follows the effect with its dry law', () => {
    const dryAt = (type: number, send: number): number | null => {
      const bus = new FxBus(1000)
      bus.control(FxControl.FX_TYPE, type, 0.5, 0.5)
      bus.control(FxControl.SEND, 2, f(send), 0)
      // 20 ms at 1000 Hz is 20 frames: two seconds is long enough to land.
      bus.begin(2000)
      bus.gains(0, 2000, 0)
      expect(bus.send(2)![1999]).toBe(f(send))
      expect(bus.send(1)).toBeNull()
      return bus.dry(2)?.[1999] ?? null
    }
    expect(dryAt(FxControl.DELAY, 0.5)).toBe(f(1 - f(f(0.3) * 0.5)))
    expect(dryAt(FxControl.REVERB, 0.5)).toBe(f(1 - f(f(0.3) * 0.5)))
    expect(dryAt(FxControl.CHORUS, 1)).toBe(f(1 - f(0.3)))
    expect(dryAt(FxControl.DISTORTION, 0.4)).toBe(f(1 - f(0.4)))
    expect(dryAt(FxControl.FILTER, 1)).toBe(0)
    expect(dryAt(FxControl.COMPRESSOR, 0.25)).toBe(0.75)
    // No effect: the dry is whole (1 throughout, so none to read).
    expect(dryAt(FxControl.NONE, 0.8)).toBeNull()
  })

  it('glides a send to its new value and lands on it', () => {
    const bus = new FxBus(48000)
    bus.control(FxControl.SEND, 0, 1, 0)
    bus.begin(24000)
    bus.gains(0, 24000, 0)
    const send = bus.send(0)!
    // Moving, not jumping, and rising all the way.
    expect(send[0]).toBeGreaterThan(0)
    expect(send[0]).toBeLessThan(0.01)
    for (let i = 1; i < 24000; i++) expect(send[i]! >= send[i - 1]!).toBe(true)
    // About 20 ms: most of the way there by then, nearly all by 100 ms, exactly there by 500 ms.
    expect(send[960]).toBeGreaterThan(0.6)
    expect(send[4800]).toBeGreaterThan(0.99)
    expect(send[23999]).toBe(1)
  })

  it('ducks to its floor in 2 ms and is back by its length', () => {
    const rate = 48000
    const bus = new FxBus(rate)
    // Groups A and C, the shortest duck (30 ms), the fast curve.
    bus.control(FxControl.SIDECHAIN, 0b0101, 0, 0)
    bus.begin(4000)
    bus.gains(0, 100, 0)
    expect(bus.dry(0)).toBeNull()
    bus.trigger(100)
    bus.gains(100, 3900, 100)
    const a = bus.dry(0)!
    expect(bus.dry(1)).toBeNull()
    expect(bus.dry(2)).not.toBeNull()
    expect(bus.dry(3)).toBeNull()
    const dip = (2 * rate) / 1000
    const length = (30 * rate) / 1000
    expect(a[100]).toBe(1)
    for (let i = 101; i <= 100 + dip; i++) expect(a[i]! < a[i - 1]!).toBe(true)
    expect(a[100 + dip]).toBe(f(0.1))
    for (let i = 101 + dip; i < 100 + length; i++) expect(a[i]! >= a[i - 1]! && a[i]! <= 1, `frame ${i}`).toBe(true)
    expect(a[100 + length / 2]).toBeLessThan(1)
    expect(a[100 + length]).toBe(1)
    expect(a[3999]).toBe(1)
    expect(bus.send(0)).toBeNull()
  })

  it('dips from where the duck is when ducked again, and lasts 600 ms at the longest', () => {
    const bus = new FxBus(1000)
    bus.control(FxControl.SIDECHAIN, 0b0001, 1, 0.5)
    bus.begin(1000)
    bus.trigger(0)
    bus.gains(0, 10, 0)
    const first = bus.dry(0)![9]!
    bus.trigger(10)
    bus.gains(10, 990, 10)
    const a = bus.dry(0)!
    expect(a[9]).toBe(first)
    expect(first).toBeGreaterThan(0.1)
    expect(first).toBeLessThan(1)
    expect(a[10]! < 1 && a[10]! > 0.1).toBe(true)
    expect(a[12]).toBe(f(0.1))
    expect(a[609]).toBeLessThan(1)
    expect(a[610]).toBe(1)
  })

  it('ducks for a silent source, on its own frame inside a render', () => {
    const m = new VoiceMixer(1000)
    m.control(FxControl.SIDECHAIN, 0b0010, 0, 0)
    m.start('bass', steady(1000), 1, 1000, 0, 0, VoiceShape.of({ bus: 1 }))
    m.start('other', steady(1000, 500), 1, 1000, 0, 0, VoiceShape.of({ bus: 2 }))
    // An empty sound, timed: nothing plays, nothing starts, but the duck does.
    m.start('kick', new Int16Array(0), 1, 1000, 0, 0, VoiceShape.of({ duckSource: true }), 10)
    const out = left(render(m, 50))
    expect(m.started.some((s) => s.key === 'kick')).toBe(false)
    for (let i = 0; i <= 10; i++) expect(out[i], `frame ${i}`).toBe(1500)
    // 2 ms to the floor: bass at a tenth, the other group untouched.
    expect(out[12]).toBe(100 + 500)
    expect(out[20]! > 600 && out[20]! < 1500).toBe(true)
    // Back at 30 ms.
    expect(out[40]).toBe(1500)
  })

  it('ducks only with the sidechain on and the group in its mask', () => {
    const m = new VoiceMixer(1000)
    m.start('bass', steady(1000), 1, 1000, 0, 0, VoiceShape.of({ bus: 0 }))
    m.start('kick', new Int16Array(0), 1, 1000, 0, 0, VoiceShape.of({ duckSource: true }))
    expect(left(render(m, 20))).toEqual(new Array(20).fill(1000))
    m.control(FxControl.SIDECHAIN, 0b1110, 0, 0)
    m.start('kick', new Int16Array(0), 1, 1000, 0, 0, VoiceShape.of({ duckSource: true }))
    expect(left(render(m, 20))).toEqual(new Array(20).fill(1000))
    // Bus -1 is never ducked.
    m.control(FxControl.SIDECHAIN, 0b1111, 0, 0)
    m.start('free', steady(1000, 300), 1, 1000)
    m.start('kick', new Int16Array(0), 1, 1000, 0, 0, VoiceShape.of({ duckSource: true }))
    expect(left(render(m, 20))[2]).toBe(100 + 300)
  })

  it('takes dry from a voice on a bus with a send and an effect, by the law', () => {
    const m = new VoiceMixer(1000)
    m.control(FxControl.FX_TYPE, FxControl.DISTORTION, 0.5, 0.5)
    m.control(FxControl.SEND, 3, 0.75, 0)
    m.start('a', steady(1000), 1, 1000, 0, 0, VoiceShape.of({ bus: 3 }))
    m.start('b', steady(1000, 100), 1, 1000)
    const out = left(render(m, 200))
    // The send glides up: the dry glides down to a quarter (the stub effect adds nothing back).
    expect(out[1]! >= 1000 && out[1]! < 1100).toBe(true)
    expect(out[199]).toBe(250 + 100)
  })
})
