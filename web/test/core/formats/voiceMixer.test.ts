// Port of core/src/test/kotlin/dev/arc/ep133/formats/VoiceMixerTest.kt,
// plus web cases for the Float32 outputs (interleaved and planar).
import { describe, expect, it } from 'vitest'
import { VoiceMixer } from '../../../src/core/formats/voiceMixer'

// 1000 Hz output: one frame per millisecond, so gates and fades are easy to count.
const mixer = (max: number = VoiceMixer.MAX_VOICES): VoiceMixer => new VoiceMixer(1000, max)

function render(m: VoiceMixer, frames: number): number[] {
  const out = new Int16Array(frames * 2)
  m.render(out, frames)
  return [...out]
}

const left = (out: number[]): number[] => out.filter((_, i) => i % 2 === 0)

const steady = (n: number, v = 1000): Int16Array => new Int16Array(n).fill(v)

const s16 = (...v: number[]): Int16Array => Int16Array.from(v)

describe('VoiceMixer', () => {
  it('a mono sound plays on both sides at its own rate', () => {
    const m = mixer()
    m.start('a', s16(0, 100, 200, 300), 1, 1000)
    expect(render(m, 6)).toEqual([0, 0, 100, 100, 200, 200, 300, 300, 0, 0, 0, 0])
    expect([...m.keys]).toEqual([])
  })

  it('a sound at another rate is read faster or slower', () => {
    const m = mixer()
    // 2000 Hz into 1000 Hz: every other frame.
    m.start('a', s16(0, 100, 200, 300, 400), 1, 2000)
    expect(left(render(m, 4))).toEqual([0, 200, 400, 0])
    // 500 Hz: in between, by linear interpolation.
    m.start('b', s16(0, 100, 200), 1, 500)
    expect(left(render(m, 6))).toEqual([0, 50, 100, 150, 200, 0])
  })

  it('an octave up is twice as fast, as KEYS plays it', () => {
    const m = mixer()
    m.start('k', s16(0, 100, 200, 300, 400, 500, 600, 700, 800), 1, 1000, 12)
    expect(left(render(m, 6))).toEqual([0, 200, 400, 600, 800, 0])
    expect(VoiceMixer.pitchRatio(12)).toBeCloseTo(2.0, 9)
    expect(VoiceMixer.pitchRatio(-12)).toBeCloseTo(0.5, 9)
  })

  it('stereo frames stay together', () => {
    const m = mixer()
    m.start('s', s16(1, -1, 2, -2), 2, 1000)
    expect(render(m, 3)).toEqual([1, -1, 2, -2, 0, 0])
  })

  it('a held voice sounds until released, then fades out', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000)
    render(m, 100)
    expect([...m.keys]).toEqual(['a'])
    m.release('a')
    const out = left(render(m, 40))
    expect(out[0]).toBe(1000)
    // Down over the fade, then silent.
    expect(out[VoiceMixer.FADE_MS / 2]).toBeGreaterThanOrEqual(400)
    expect(out[VoiceMixer.FADE_MS / 2]).toBeLessThanOrEqual(600)
    expect(out[VoiceMixer.FADE_MS + 1]).toBe(0)
    expect([...m.keys]).toEqual([])
  })

  it('the quickest tap still sounds for the minimum gate', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000)
    m.release('a')
    const out = left(render(m, 200))
    expect(out[VoiceMixer.MIN_GATE_MS - 1]).toBe(1000)
    expect(out[VoiceMixer.MIN_GATE_MS + VoiceMixer.FADE_MS + 1]).toBe(0)
  })

  it('voices add up, as a chord', () => {
    const m = mixer()
    m.start('a', steady(10, 1000), 1, 1000)
    m.start('b', steady(10, 2000), 1, 1000)
    expect(left(render(m, 1))[0]).toBe(3000)
    expect(new Set(m.keys)).toEqual(new Set(['a', 'b']))
    // And clip rather than wrap around.
    m.start('c', steady(10, 32000), 1, 1000)
    expect(left(render(m, 1))[0]).toBe(32767)
  })

  it('the same key starts over and the old one is cut short without a click', () => {
    const m = mixer()
    m.start('a', steady(1000, 1000), 1, 1000)
    render(m, 10)
    m.start('a', steady(1000, 1000), 1, 1000)
    const out = left(render(m, 10))
    // The old voice fades over CHOKE_MS while the new one plays: never above the two together.
    expect(out[0]).toBeGreaterThanOrEqual(1000)
    expect(out[0]).toBeLessThanOrEqual(2000)
    expect(out[VoiceMixer.CHOKE_MS + 1]).toBe(1000)
    expect([...m.keys]).toEqual(['a'])
  })

  it('past the voice limit the oldest is cut', () => {
    const m = mixer(2)
    m.start('a', steady(100), 1, 1000)
    m.start('b', steady(100), 1, 1000)
    m.start('c', steady(100), 1, 1000)
    render(m, 1)
    expect(new Set(m.keys)).toEqual(new Set(['b', 'c']))
  })

  it('past the limit a voice let go of goes before an older held one', () => {
    const m = mixer(2)
    m.start('a', steady(1000), 1, 1000)
    m.start('b', steady(1000), 1, 1000)
    render(m, 1)
    // b still sounds out its gate, but it was let go of.
    m.release('b')
    m.start('c', steady(1000), 1, 1000)
    render(m, 1)
    expect(new Set(m.keys)).toEqual(new Set(['a', 'c']))
  })

  it('a held chord survives a run of ten keys', () => {
    const m = mixer()
    for (const k of ['note:60', 'note:64', 'note:67']) m.start(k, steady(1000), 1, 1000)
    render(m, 1)
    // A glissando: each key let go of as the next plays, all still in their gates.
    for (let n = 72; n < 82; n++) {
      m.release(`note:${n - 1}`)
      m.start(`note:${n}`, steady(1000), 1, 1000)
      render(m, 1)
    }
    for (const k of ['note:60', 'note:64', 'note:67', 'note:81']) expect(m.keys.has(k), k).toBe(true)
    expect(m.keys.size).toBe(VoiceMixer.MAX_VOICES)
  })

  it('stop fades everything out', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000)
    m.start('b', steady(1000), 1, 1000)
    render(m, 5)
    m.stopAll()
    const out = left(render(m, 10))
    expect(out[VoiceMixer.CHOKE_MS + 1]).toBe(0)
    expect([...m.keys]).toEqual([])
  })

  it('a new voice reports the frame it starts at, with its tag', () => {
    const m = mixer()
    render(m, 64)
    m.start('a', steady(10), 1, 1000, 0, 42)
    render(m, 16)
    expect(m.started).toEqual([{ key: 'a', tag: 42, frame: 64 }])
    render(m, 16)
    expect(m.started).toEqual([])
  })

  it('a release of a key not playing does nothing', () => {
    const m = mixer()
    m.release('nothing')
    m.start('a', steady(10), 1, 1000)
    expect(left(render(m, 1))[0]).toBe(1000)
  })

  // Web cases.

  it('only one or two channels', () => {
    expect(() => mixer().start('a', steady(4), 3, 1000)).toThrow('channels: 3')
    expect(() => mixer().start('a', steady(4), 0, 1000)).toThrow('channels: 0')
  })

  it('renders the same mix as floats, interleaved or planar', () => {
    const pcm = s16(0, 16384, -32768, 32767, 1000)
    const a = mixer()
    const b = mixer()
    a.start('a', pcm, 1, 1000)
    b.start('a', pcm, 1, 1000)
    const inter = new Float32Array(12)
    a.render(inter, 6)
    const l = new Float32Array(6)
    const r = new Float32Array(6)
    b.renderPlanar(l, r, 6)
    const want = [0, 0.5, -1, 32767 / 32768, 1000 / 32768, 0]
    want.forEach((w, i) => {
      expect(inter[2 * i]).toBeCloseTo(w, 6)
      expect(inter[2 * i + 1]).toBeCloseTo(w, 6)
      expect(l[i]).toBeCloseTo(w, 6)
      expect(r[i]).toBeCloseTo(w, 6)
    })
    expect(a.frame).toBe(6)
    expect(b.frame).toBe(6)
  })

  it('resamples the device rate to the output rate', () => {
    // 46875 Hz into 48000 Hz: slightly slower, so more output frames than input.
    const m = new VoiceMixer(48000)
    m.start('a', steady(46875, 1000), 1, 46875)
    const out = new Float32Array(2 * 128)
    let frames = 0
    for (; frames < 60000 && (frames === 0 || m.keys.size > 0); frames += 128) m.render(out, 128)
    expect(frames).toBeGreaterThanOrEqual(48000)
    expect(frames).toBeLessThan(48000 + 256)
  })

  it('keys stay the same object while unchanged', () => {
    const m = mixer()
    m.start('a', steady(100), 1, 1000)
    render(m, 1)
    const k = m.keys
    render(m, 1)
    expect(m.keys).toBe(k)
  })

  it('an empty sound is ignored', () => {
    const m = mixer()
    m.start('a', new Int16Array(0), 1, 1000)
    m.start('b', s16(5), 2, 1000)
    render(m, 1)
    expect(m.started).toEqual([])
    expect(m.keys.size).toBe(0)
  })
})
