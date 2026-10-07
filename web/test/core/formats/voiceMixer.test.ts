// Port of core/src/test/kotlin/dev/arc/ep133/formats/VoiceMixerTest.kt,
// plus web cases for the Float32 outputs (interleaved and planar), and a
// replay of the native mixer's vectors (app/src/test/cpp/voice-mixer.golden,
// written by the Kotlin mixer), so the port is held to it sample for sample
// as the C++ one is.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VoiceMixer, VoiceMode, VoiceShape } from '../../../src/core/formats/voiceMixer'

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
    for (const k of ['note:60', 'note:64', 'note:67', 'note:81']) expect(m.keys.has(k)).toBe(true)
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

  it('a cut ends the voice within the choke, not the minimum gate', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000)
    render(m, 10)
    // Well inside MIN_GATE_MS: the press turned into a scroll.
    m.cut('a')
    const out = left(render(m, 20))
    expect(out[0]).toBeGreaterThanOrEqual(1)
    expect(out[0]).toBeLessThanOrEqual(1000)
    expect(out[VoiceMixer.CHOKE_MS + 1]).toBe(0)
    expect([...m.keys]).toEqual([])
  })

  it('a cut in the same render as its start still fades, without a click', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000)
    m.cut('a')
    const out = left(render(m, 10))
    expect(out[0]).toBe(1000)
    expect(out[VoiceMixer.CHOKE_MS + 1]).toBe(0)
    expect(m.started.map((s) => s.key)).toEqual(['a'])
  })

  it('a cut of a voice already let go of ends it at once', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000)
    m.release('a')
    render(m, 5)
    m.cut('a')
    expect(left(render(m, 10))[VoiceMixer.CHOKE_MS + 1]).toBe(0)
  })

  it('a cut leaves the other voices alone', () => {
    const m = mixer()
    m.start('a', steady(1000, 1000), 1, 1000)
    m.start('b', steady(1000, 2000), 1, 1000)
    render(m, 5)
    m.cut('a')
    const out = left(render(m, 10))
    expect(out[VoiceMixer.CHOKE_MS + 1]).toBe(2000)
    expect([...m.keys]).toEqual(['b'])
  })

  it('a cut of a key not playing does nothing', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000)
    render(m, 1)
    m.cut('nothing')
    expect(left(render(m, 10))[9]).toBe(1000)
    expect([...m.keys]).toEqual(['a'])
  })

  it('keys and started stay right over many renders', () => {
    const m = mixer()
    const out = new Int16Array(200 * 2)
    for (let n = 0; n < 300; n++) {
      const at = m.frame
      m.start('a', steady(1000), 1, 1000, 0, n)
      m.start('b', steady(1000), 1, 1000)
      m.render(out, 10)
      expect(m.started).toEqual([
        { key: 'a', tag: n, frame: at },
        { key: 'b', tag: 0, frame: at },
      ])
      expect([...m.keys]).toEqual(['a', 'b'])
      // Unchanged keys are the same set, not a new one per render.
      const held = m.keys
      m.render(out, 10)
      expect(m.started).toEqual([])
      expect(m.keys).toBe(held)
      m.cut('b')
      m.render(out, 10)
      expect([...m.keys]).toEqual(['a'])
      m.release('a')
      m.render(out, 200)
      expect(m.keys.size).toBe(0)
      expect(out[2 * 199]).toBe(0)
    }
    expect(m.frame).toBe(300 * 230)
  })

  // Voice shapes (an addition): the EP-133's SOUND EDIT settings, as the mixer plays them.

  it('the default shape plays as the mixer always has', () => {
    const plain = mixer()
    const shaped = mixer()
    const pcm = Int16Array.from({ length: 300 }, (_, i) => ((i * 97) % 2000) - 1000)
    plain.start('a', pcm, 1, 1500, 5)
    shaped.start('a', pcm, 1, 1500, 5, 0, VoiceShape.of({ semitones: 0 }))
    plain.release('a')
    shaped.release('a')
    expect(render(shaped, 200)).toEqual(render(plain, 200))
    expect(VoiceShape.of()).toEqual(VoiceShape.DEFAULT)
  })

  it("a shape's semitones add to the start's, fractions too", () => {
    const m = mixer()
    m.start('k', Int16Array.from({ length: 9 }, (_, i) => i * 100), 1, 1000, 5, 0, VoiceShape.of({ semitones: 7 }))
    expect(left(render(m, 6))).toEqual([0, 200, 400, 600, 800, 0])
    expect(VoiceMixer.pitchRatio(0.5)).toBe(Math.pow(2, 0.5 / 12))
  })

  it('gain scales the level', () => {
    const m = mixer()
    m.start('a', steady(10), 1, 1000, 0, 0, VoiceShape.of({ gain: 0.5 }))
    expect(render(m, 1)).toEqual([500, 500])
    m.start('a', steady(10), 1, 1000, 0, 0, VoiceShape.of({ gain: 0 }))
    render(m, VoiceMixer.CHOKE_MS + 1)
    expect(render(m, 1)).toEqual([0, 0])
    // Silent, but sounding.
    expect([...m.keys]).toEqual(['a'])
  })

  it('pan turns one side down, never the other up', () => {
    const m = mixer()
    m.start('a', steady(10), 1, 1000, 0, 0, VoiceShape.of({ pan: -16 }))
    expect(render(m, 1)).toEqual([1000, 0])
    m.cut('a')
    render(m, VoiceMixer.CHOKE_MS + 1)
    m.start('b', steady(10), 1, 1000, 0, 0, VoiceShape.of({ pan: 8 }))
    expect(render(m, 1)).toEqual([500, 1000])
    // Past the end of the scale it stays hard over.
    m.start('b', steady(10), 1, 1000, 0, 0, VoiceShape.of({ pan: 99 }))
    render(m, VoiceMixer.CHOKE_MS + 1)
    expect(render(m, 1)).toEqual([0, 1000])
  })

  it('a trimmed sound plays from its start to before its end', () => {
    const m = mixer()
    const ramp = Int16Array.from({ length: 10 }, (_, i) => i * 100)
    m.start('a', ramp, 1, 1000, 0, 0, VoiceShape.of({ start: 2, end: 5 }))
    expect(left(render(m, 4))).toEqual([200, 300, 400, 0])
    // One frame is still a sound.
    m.start('a', ramp, 1, 1000, 0, 0, VoiceShape.of({ start: 7, end: 8 }))
    expect(left(render(m, 2))).toEqual([700, 0])
    // Past the sound's frames, clamped to them.
    m.start('a', ramp, 1, 1000, 0, 0, VoiceShape.of({ start: 8, end: 400 }))
    expect(left(render(m, 3))).toEqual([800, 900, 0])
  })

  it('a trim with nothing left plays nothing and cuts nothing', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000)
    render(m, 1)
    m.start('a', steady(1000), 1, 1000, 0, 0, VoiceShape.of({ start: 6, end: 6 }))
    m.start('a', steady(1000), 1, 1000, 0, 0, VoiceShape.of({ start: 2000 }))
    expect(left(render(m, 10))[9]).toBe(1000)
    expect(m.started).toEqual([])
    expect([...m.keys]).toEqual(['a'])
  })

  it('an attack fades the voice in from silence', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000, 0, 0, VoiceShape.of({ attackMs: 4 }))
    expect(left(render(m, 6))).toEqual([0, 250, 500, 750, 1000, 1000])
  })

  it('a longer release fades out longer, a shorter one no faster than the fade', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000, 0, 0, VoiceShape.of({ releaseMs: 100 }))
    render(m, 100)
    m.release('a')
    const out = left(render(m, 120))
    expect(out[50]).toBeGreaterThanOrEqual(400)
    expect(out[50]).toBeLessThanOrEqual(600)
    expect(out[101]).toBe(0)
    m.start('b', steady(1000), 1, 1000, 0, 0, VoiceShape.of({ releaseMs: 1 }))
    render(m, 100)
    m.release('b')
    const short = left(render(m, 40))
    expect(short[VoiceMixer.FADE_MS / 2]).toBeGreaterThanOrEqual(400)
    expect(short[VoiceMixer.FADE_MS / 2]).toBeLessThanOrEqual(600)
    expect(short[VoiceMixer.FADE_MS + 1]).toBe(0)
  })

  it('a one-shot plays to its end, release or not', () => {
    const m = mixer()
    const oneShot = VoiceShape.of({ mode: VoiceMode.ONESHOT })
    m.start('a', steady(200), 1, 1000, 0, 0, oneShot)
    m.release('a')
    const out = left(render(m, 210))
    expect(out[199]).toBe(1000)
    expect(out[200]).toBe(0)
    // The same key again starts it over; a cut still ends it.
    m.start('a', steady(200, 1000), 1, 1000, 0, 0, oneShot)
    render(m, 10)
    m.start('a', steady(200, 2000), 1, 1000, 0, 0, oneShot)
    expect(left(render(m, 10))[VoiceMixer.CHOKE_MS + 1]).toBe(2000)
    m.cut('a')
    expect(left(render(m, 10))[VoiceMixer.CHOKE_MS + 1]).toBe(0)
  })

  it('in key mode the same key again adds a voice, and release takes them all', () => {
    const m = mixer()
    const key = VoiceShape.of({ mode: VoiceMode.KEY })
    m.start('k', steady(1000), 1, 1000, 0, 0, key)
    render(m, 10)
    m.start('k', steady(1000), 1, 1000, 0, 0, key)
    m.start('k', steady(1000), 1, 1000, 0, 0, key)
    expect(left(render(m, 1))[0]).toBe(3000)
    // Still one key.
    expect([...m.keys]).toEqual(['k'])
    m.release('k')
    const out = left(render(m, 100))
    expect(out[VoiceMixer.MIN_GATE_MS + VoiceMixer.FADE_MS + 1]).toBe(0)
    expect(m.keys.size).toBe(0)
    m.start('k', steady(1000), 1, 1000, 0, 0, key)
    m.start('k', steady(1000), 1, 1000, 0, 0, key)
    render(m, 1)
    m.cut('k')
    expect(left(render(m, 10))[VoiceMixer.CHOKE_MS + 1]).toBe(0)
    expect(m.keys.size).toBe(0)
  })

  it("key mode's voices still count against the limit", () => {
    const m = mixer(2)
    const key = VoiceShape.of({ mode: VoiceMode.KEY })
    m.start('k', steady(1000, 100), 1, 1000, 0, 0, key)
    m.start('k', steady(1000, 200), 1, 1000, 0, 0, key)
    m.start('k', steady(1000, 400), 1, 1000, 0, 0, key)
    render(m, 1)
    expect(left(render(m, 10))[9]).toBe(600)
  })

  it('legato on a held voice changes its pitch where it is', () => {
    const m = mixer()
    const sound = Int16Array.from({ length: 100 }, (_, i) => i * 10)
    const legato = VoiceShape.of({ mode: VoiceMode.LEGATO })
    m.start('l', sound, 1, 1000, 0, 0, legato)
    expect(left(render(m, 4))).toEqual([0, 10, 20, 30])
    m.start('l', sound, 1, 1000, 12, 9, legato)
    // On from frame 4, twice as fast, no cut.
    expect(left(render(m, 4))).toEqual([40, 60, 80, 100])
    expect(m.started).toEqual([{ key: 'l', tag: 9, frame: 4 }])
    expect([...m.keys]).toEqual(['l'])
  })

  it('legato on another sound, or once let go of, starts over', () => {
    const m = mixer()
    const sound = steady(1000, 1000)
    const other = steady(1000, 2000)
    const legato = VoiceShape.of({ mode: VoiceMode.LEGATO })
    m.start('l', sound, 1, 1000, 0, 0, legato)
    render(m, 10)
    m.start('l', other, 1, 1000, 0, 0, legato)
    const out = left(render(m, 10))
    // The old voice is cut while the new one plays.
    expect(out[0]).toBeGreaterThanOrEqual(2000)
    expect(out[0]).toBeLessThanOrEqual(3000)
    expect(out[VoiceMixer.CHOKE_MS + 1]).toBe(2000)
    m.release('l')
    render(m, 70)
    m.start('l', other, 1, 1000, 12, 0, legato)
    render(m, 1)
    // A new voice (the old one still fading out its release).
    expect(m.started).toEqual([{ key: 'l', tag: 0, frame: 90 }])
    // The fading one is cut short under it: the new one alone.
    expect(left(render(m, 10))[VoiceMixer.CHOKE_MS + 1]).toBe(2000)
  })

  it("a mute group cuts the group's other voices only", () => {
    const m = mixer()
    m.start('open', steady(1000, 1000), 1, 1000, 0, 0, VoiceShape.of({ muteGroup: 1 }))
    m.start('ride', steady(1000, 300), 1, 1000, 0, 0, VoiceShape.of({ muteGroup: 2 }))
    m.start('kick', steady(1000, 50), 1, 1000)
    render(m, 10)
    m.start('closed', steady(1000, 2000), 1, 1000, 0, 0, VoiceShape.of({ muteGroup: 1 }))
    expect(left(render(m, 10))[VoiceMixer.CHOKE_MS + 1]).toBe(2350)
    expect([...m.keys]).toEqual(['ride', 'kick', 'closed'])
  })

  it('a cut inside the attack fades from where the fade is, without a click', () => {
    const m = mixer()
    m.start('a', steady(1000), 1, 1000, 0, 0, VoiceShape.of({ attackMs: 10 }))
    render(m, 5)
    m.cut('a')
    const out = left(render(m, 6))
    // Never above the attack's level at the cut, then gone within the choke.
    for (const v of out) expect(v).toBeLessThanOrEqual(700)
    expect(out[VoiceMixer.CHOKE_MS]).toBe(0)
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

  it('renders what the Kotlin mixer wrote for the native one, sample for sample', () => {
    const scenarios = replayGolden(readFileSync(goldenPath, 'utf8'))
    expect(scenarios).toBeGreaterThan(20)
  })
})

// app/src/test/cpp/voice-mixer.golden, read in place (like reference/).
const goldenPath = fileURLToPath(new URL('../../../../app/src/test/cpp/voice-mixer.golden', import.meta.url))

const MODES: readonly VoiceMode[] = [VoiceMode.GATE, VoiceMode.ONESHOT, VoiceMode.KEY, VoiceMode.LEGATO]

/** VoiceMixerGoldenTest's noise: xorshift64, the top 16 bits of each step. */
function noise(size: number, seed: bigint): Int16Array {
  const out = new Int16Array(size)
  let x = BigInt.asUintN(64, seed)
  for (let i = 0; i < size; i++) {
    x = BigInt.asUintN(64, x ^ (x << 13n))
    x ^= x >> 7n
    x = BigInt.asUintN(64, x ^ (x << 17n))
    out[i] = Number(x >> 48n)
  }
  return out
}

/** FNV-1a over the samples as 16-bit words, as VoiceMixerGoldenTest hashes them. */
function fnv(pcm: Int16Array): bigint {
  let h = 0xcbf29ce484222325n
  for (const v of pcm) h = BigInt.asUintN(64, (h ^ BigInt(v & 0xffff)) * 0x100000001b3n)
  return h
}

/** A double from its bits in hex, a float from its. */
const doubleOf = (hex: string): number => new DataView(new BigUint64Array([BigInt('0x' + hex)]).buffer).getFloat64(0, true)
const floatOf = (hex: string): number => new DataView(new Uint32Array([parseInt(hex, 16)]).buffer).getFloat32(0, true)

/**
 * Replays the vectors as VoiceMixerParityTest.cpp does (keys are the file's
 * numbers, as strings); each mismatch fails at once. Returns the scenarios.
 * The file's pitch (Kotlin's pitchRatio, bit for bit) stands in for this
 * port's, as the native mixer takes it, since Math.pow may round otherwise.
 */
function replayGolden(text: string): number {
  let mixer = new VoiceMixer(1000)
  let samples: { pcm: Int16Array; channels: number }[] = []
  let out = new Int16Array(0)
  let scenario = ''
  let renders = 0
  let scenarios = 0
  const pitchRatio = VoiceMixer.pitchRatio
  const where = (): string => `scenario ${scenario}, render ${renders}`
  try {
    for (const line of text.split('\n')) {
      if (line === '' || line.startsWith('#')) continue
      const w = line.split(' ')
      const n = (i: number): number => Number(w[i])
      switch (w[0]) {
        case 'scenario':
          scenario = w[1]!
          mixer = new VoiceMixer(n(2), n(3))
          samples = []
          renders = 0
          break
        case 'sample':
          samples[n(1)] = { pcm: Int16Array.from(w.slice(4).map(Number)), channels: n(2) }
          break
        case 'fill':
          samples[n(1)] = { pcm: new Int16Array(n(3)).fill(n(4)), channels: n(2) }
          break
        case 'noise':
          samples[n(1)] = { pcm: noise(n(3), BigInt(w[4]!)), channels: n(2) }
          break
        case 'start': {
          const sound = samples[n(2)]!
          const pitch = doubleOf(w[4]!)
          const shape =
            w.length > 6
              ? VoiceShape.of({
                  gain: floatOf(w[6]!),
                  pan: n(7),
                  start: n(8),
                  end: n(9),
                  attackMs: n(10),
                  releaseMs: n(11),
                  mode: MODES[n(12)]!,
                  muteGroup: n(13),
                })
              : VoiceShape.DEFAULT
          VoiceMixer.pitchRatio = () => pitch
          mixer.start(w[1]!, sound.pcm, sound.channels, n(3), 0, n(5), shape)
          VoiceMixer.pitchRatio = pitchRatio
          break
        }
        case 'release':
          mixer.release(w[1]!)
          break
        case 'cut':
          mixer.cut(w[1]!)
          break
        case 'stop':
          mixer.stopAll()
          break
        case 'render':
          renders++
          out = new Int16Array(n(1) * 2)
          mixer.render(out, n(1))
          break
        case 'out':
          expect([...out], where()).toEqual(w.slice(2).map(Number))
          break
        case 'hash':
          expect(fnv(out).toString(16), where()).toBe(w[1])
          break
        case 'started': {
          const want = []
          for (let i = 0; i < n(1); i++) want.push({ key: w[2 + 3 * i], tag: n(3 + 3 * i), frame: n(4 + 3 * i) })
          expect(mixer.started, where()).toEqual(want)
          break
        }
        case 'keys':
          expect([...mixer.keys], where()).toEqual(w.slice(2))
          break
        case 'frame':
          expect(mixer.frame, where()).toBe(n(1))
          break
        case 'end':
          scenarios++
          break
        default:
          throw new Error(`voice-mixer.golden: unknown line: ${line}`)
      }
    }
  } finally {
    VoiceMixer.pitchRatio = pitchRatio
  }
  return scenarios
}
