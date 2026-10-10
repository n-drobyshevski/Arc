// Port of app/src/test/kotlin/dev/arc/ep133/audio/PatternSchedulerTest.kt (the
// cases the web's scheduler has: no lost output, arp or queued switches), and
// ClickSoundTest's shape; plus the count-in's clicks, which are the web's own.
import { describe, expect, it } from 'vitest'
import { Seq, pattern, patternNote, projectPatterns, type Pattern } from '../../src/core/features/pattern'
import { PhaseAnchors, type TransportClock } from '../../src/core/features/sequencer'
import { VoiceMixer, VoiceShape, VoiceMode } from '../../src/core/formats/voiceMixer'
import { ClickSound, EMPTY_PLAN, PatternScheduler, type PadVoice, type ScheduleSink, type SeqPlan } from '../../src/platform/audio/patternScheduler'
import { MixerHost, type FromMixer } from '../../src/platform/audio/liveMixer'

// 48 kHz at 120 BPM: 250 frames a tick, a bar 96000 frames; the lookahead 2400.
const rate = 48000
const ahead = 2400
const bar = 96000
const padShape = VoiceShape.of({ gain: 0.5 })
const keysShape = VoiceShape.of({ mode: VoiceMode.LEGATO })

interface Started {
  key: string
  semitones: number
  tag: number
  shape: VoiceShape
  at: number
}
interface Released {
  key: string
  at: number
  tag: number
}

class FakeSink implements ScheduleSink {
  readonly events: (Started | Released | 'flush')[] = []
  get starts(): Started[] {
    return this.events.filter((e): e is Started => typeof e === 'object' && 'semitones' in e)
  }
  get releases(): Released[] {
    return this.events.filter((e): e is Released => typeof e === 'object' && !('semitones' in e))
  }
  startAt(key: string, _v: PadVoice, semitones: number, tag: number, shape: VoiceShape, frame: number): boolean {
    this.events.push({ key, semitones, tag, shape, at: frame })
    return true
  }
  releaseAt(key: string, frame: number, tag: number): void {
    this.events.push({ key, at: frame, tag })
  }
  flushTimed(): void {
    this.events.push('flush')
  }
}

function voices(): Map<number, PadVoice> {
  const m = new Map<number, PadVoice>()
  for (let p = 0; p < 48; p++) m.set(p, { id: 1, channels: 1, rate: 46875, shape: padShape, keysShape })
  return m
}

function plan(group: number, pat: Pattern, bpm = 120, opts: { voices?: Map<number, PadVoice>; skip?: Map<number, number> } = {}): SeqPlan {
  const groups = [pattern(), pattern(), pattern(), pattern()]
  groups[group] = pat
  return { patterns: projectPatterns(groups), voices: opts.voices ?? voices(), skip: opts.skip ?? new Map(), bpm, phase: PhaseAnchors.ZERO }
}

/** Fills block by block from [from] to [to] frames, [block] at a time. */
function run(s: PatternScheduler, sink: FakeSink, from: number, to: number, block = 128): void {
  for (let f = from; f < to; f += block) s.fill(sink, f, rate)
}

// One note on each beat of a 1-bar pattern, gate 48 ticks.
const beats = pattern(1, [0, 1, 2, 3].map((b) => patternNote(b * Seq.PPQN, b, 48)))

describe('PatternScheduler', () => {
  it('lands notes on their frames, each once, whatever the block', () => {
    for (const block of [128, 441, 4096]) {
      const s = new PatternScheduler()
      s.plan = plan(0, beats)
      const sink = new FakeSink()
      s.play(0)
      run(s, sink, 0, 2 * bar, block)
      // Tick 0 a lookahead after the frames rendered at PLAY.
      expect(sink.starts.map((n) => n.at)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((b) => ahead + b * 24000).filter((f) => f < 2 * bar + ahead))
      expect(sink.starts.map((n) => n.key).slice(0, 4)).toEqual(['live:0:0', 'live:0:1', 'live:0:2', 'live:0:3'])
    }
  })

  it('puts tick 0 later by a count-in and a lead', () => {
    const s = new PatternScheduler()
    s.plan = plan(0, beats)
    const sink = new FakeSink()
    s.play(1, 150)
    run(s, sink, 0, 2 * bar)
    const zero = ahead + 0.15 * rate + bar
    expect(sink.starts[0]?.at).toBe(zero)
    expect(s.countingIn(zero - 1)).toBe(true)
    expect(s.countingIn(zero)).toBe(false)
  })

  it('neither repeats nor skips a note through tempo changes', () => {
    const s = new PatternScheduler()
    s.plan = plan(0, beats)
    const sink = new FakeSink()
    s.play(0)
    run(s, sink, 0, 30000)
    s.plan = plan(0, beats, 140)
    run(s, sink, 30000, 200000)
    s.plan = plan(0, beats, 90)
    run(s, sink, 200000, 400000)
    const keys = sink.starts.map((n) => n.key)
    // Beats in order, none twice in a row, none left out.
    keys.forEach((k, i) => expect(k).toBe(`live:0:${i % 4}`))
    const at = sink.starts.map((n) => n.at)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('lets go of each gate at its end, on the voice it started', () => {
    const s = new PatternScheduler()
    s.plan = plan(0, beats)
    const sink = new FakeSink()
    s.play(0)
    run(s, sink, 0, bar)
    const first = sink.starts[0]!
    const rel = sink.releases.find((r) => r.tag === first.tag)!
    expect(rel.key).toBe(first.key)
    expect(rel.at).toBe(first.at + 48 * 250)
    // Tags are each a note's own, below 0.
    const tags = sink.starts.map((n) => n.tag)
    expect(new Set(tags).size).toBe(tags.length)
    expect(tags.every((t) => t < 0)).toBe(true)
  })

  it('stops by dropping what waits, then letting go of what sounds', () => {
    const s = new PatternScheduler()
    s.plan = plan(0, pattern(1, [patternNote(0, 0, Seq.TICKS_PER_BAR - 1)]))
    const sink = new FakeSink()
    s.play(0)
    run(s, sink, 0, 10000)
    sink.events.length = 0
    s.stop()
    s.fill(sink, 10000, rate)
    expect(sink.events[0]).toBe('flush')
    expect(sink.releases).toEqual([{ key: 'live:0:0', at: VoiceMixer.NOW, tag: -1 }])
    expect(s.running).toBe(false)
    run(s, sink, 10128, 3 * bar)
    expect(sink.starts).toEqual([])
  })

  it('plays KEYS notes as their own voices, at their velocity', () => {
    const s = new PatternScheduler()
    s.plan = plan(2, pattern(1, [patternNote(0, 5, 24, 7, 64)]))
    const sink = new FakeSink()
    s.play(0)
    run(s, sink, 0, 10000)
    const n = sink.starts[0]!
    expect(n.key).toBe('seq:2:5:67')
    expect(n.semitones).toBe(7)
    expect(n.shape.mode).toBe(VoiceMode.LEGATO)
    expect(n.shape.gain).toBeCloseTo((64 / 127) ** 2)
  })

  it('tells a pad with no sound once a plan, and plays nothing for it', () => {
    const s = new PatternScheduler()
    const missing: number[] = []
    s.onMissing = (p) => missing.push(p)
    s.plan = plan(1, beats, 120, { voices: new Map() })
    const sink = new FakeSink()
    s.play(0)
    run(s, sink, 0, 3 * bar)
    expect(sink.starts).toEqual([])
    expect(missing).toEqual([12, 13, 14, 15])
  })

  it('skips the pass a note was heard live in, only that one', () => {
    const s = new PatternScheduler()
    s.plan = plan(0, pattern(1, [patternNote(0, 0, 24, null, 127, 9)]), 120, { skip: new Map([[9, 0]]) })
    const sink = new FakeSink()
    s.play(0)
    run(s, sink, 0, 2 * bar)
    expect(sink.starts.map((n) => n.at)).toEqual([ahead + bar])
  })

  it('anchors tick 0 on a press, sending what fell behind the mix within a lookahead', () => {
    const s = new PatternScheduler()
    s.plan = plan(0, beats)
    const sink = new FakeSink()
    // Pressed (heard) 1000 frames ago.
    s.play(0, 0, 9000)
    run(s, sink, 10000, 40000)
    expect(sink.starts.map((n) => n.at)).toEqual([9000, 33000])
    // Heard longer ago than the lookahead: the past isn't replayed.
    const s2 = new PatternScheduler()
    s2.plan = plan(0, beats)
    const sink2 = new FakeSink()
    s2.play(0, 0, 1000)
    run(s2, sink2, 10000, 30000)
    expect(sink2.starts.map((n) => n.at)).toEqual([25000])
  })

  it('tells its clock when it starts, changes tempo and stops', () => {
    const s = new PatternScheduler()
    const told: (TransportClock | null)[] = []
    s.onTimeline = (c) => told.push(c)
    s.plan = plan(0, beats)
    const sink = new FakeSink()
    s.play(0)
    run(s, sink, 0, 1280)
    expect(told).toEqual([{ anchorFrame: ahead, rate, bpm: 120 }])
    s.plan = plan(0, beats, 100)
    run(s, sink, 1280, 2560)
    expect(told.length).toBe(2)
    expect(told[1]?.bpm).toBe(100)
    s.stop()
    s.fill(sink, 2560, rate)
    expect(told[2]).toBeNull()
    expect(s.plan).not.toBe(EMPTY_PLAN)
  })
})

describe('ClickSound', () => {
  it('is 30 ms, ends on zero and peaks near -7 dBFS', () => {
    for (const accent of [false, true]) {
      const c = ClickSound.render(rate, accent)
      expect(c.length).toBe(1440)
      expect(c[c.length - 1]).toBe(0)
      const peak = Math.max(...Array.from(c, Math.abs))
      expect(peak).toBeLessThanOrEqual(Math.round(32767 * 10 ** (-7 / 20)))
      expect(peak).toBeGreaterThan(10000)
    }
  })
})

describe('MixerHost and the pattern', () => {
  it('plays a plan, posts its clock and stamps, and stops', () => {
    const posted: FromMixer[] = []
    const host = new MixerHost(rate, (m) => posted.push(m))
    host.handle({ t: 'load', id: 1, pcm: new Int16Array(4000).fill(8000) })
    host.handle({
      t: 'plan',
      patterns: projectPatterns([beats, pattern(), pattern(), pattern()]),
      voices: [0, 1, 2, 3].map((o) => ({ pad: o, id: 1, channels: 1, sampleRate: rate })),
      skip: [],
      bpm: 120,
      phase: PhaseAnchors.ZERO,
    })
    host.handle({ t: 'play', countInBars: 0, leadMs: 0, atFrame: null, atPress: false })
    const l = new Float32Array(128)
    const r = new Float32Array(128)
    let heard = false
    for (let i = 0; i < 100; i++) {
      host.render(l, r, 128, i * 128 / rate)
      if (l.some((x) => x !== 0)) heard = true
    }
    expect(heard).toBe(true)
    expect(posted.some((m) => m.t === 'timeline' && m.clock !== null)).toBe(true)
    expect(posted.some((m) => m.t === 'stamp')).toBe(true)
    expect(posted.some((m) => m.t === 'keys' && m.keys.includes('live:0:0'))).toBe(true)
    host.handle({ t: 'stopSeq' })
    host.render(l, r, 128, 1)
    expect(posted[posted.length - 1]).toEqual(expect.objectContaining({ t: 'timeline', clock: null }))
  })
})
