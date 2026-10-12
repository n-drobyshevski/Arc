// Port of app/src/test/kotlin/dev/arc/ep133/audio/PatternSchedulerTest.kt (the
// cases the web's scheduler has: no lost output, arp or queued switches), and
// ClickSoundTest's shape; plus the count-in's clicks, which are the web's own.
import { describe, expect, it } from 'vitest'
import { ProjectPatterns, Seq, pattern, patternNote, projectPatterns, type Pattern } from '../../src/core/features/pattern'
import { PhaseAnchors, type TransportClock } from '../../src/core/features/sequencer'
import { VoiceMixer, VoiceShape, VoiceMode } from '../../src/core/formats/voiceMixer'
import { ClickSound, EMPTY_PLAN, PatternScheduler, type PadVoice, type QueuedSwitch, type ScheduleSink, type SeqPlan } from '../../src/platform/audio/patternScheduler'
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

// Port of PatternSchedulerTest.kt's queued switches (scenes: a pick made while the sequencer plays).
describe('PatternScheduler: queued switches', () => {
  // A scheduler and its sink, rendered block by block up to a frame.
  class Rig {
    readonly s = new PatternScheduler()
    readonly sink = new FakeSink()
    rendered = 0
    runTo(to: number): void {
      for (; this.rendered < to; this.rendered += 128) this.s.fill(this.sink, this.rendered, rate)
    }
  }

  // A plan with [now] playing in each queued group, and the group's queued pattern from its tick; [also] other groups' patterns.
  const switching = (now: Pattern, queued: [number, QueuedSwitch][], also: [number, Pattern][] = []): SeqPlan => {
    let p = projectPatterns()
    for (const [g, pat] of also) p = ProjectPatterns.with(p, g, pat)
    for (const [g] of queued) p = ProjectPatterns.with(p, g, now)
    return { patterns: p, voices: voices(), skip: new Map(), bpm: 120, phase: PhaseAnchors.ZERO, queued: new Map(queued) }
  }

  // What started up to tick [until]: its tick (250 frames each at this tempo) and voice.
  const startsBefore = (r: Rig, until: number): [number, string][] =>
    r.sink.starts.filter((n) => n.at < ahead + until * 250).map((n) => [(n.at - ahead) / 250, n.key])

  // A bar with a hit on pad [pad] (0..11) at each of [ticks].
  const hits = (pad: number, ...ticks: number[]): Pattern => pattern(1, ticks.map((t, i) => patternNote(t, pad, 24, null, 127, i + 1)))

  // Kotlin's beats(): a hit on pad 0 on each beat of a bar.
  const beats0 = pattern(1, [0, 1, 2, 3].map((b) => patternNote(b * Seq.PPQN, 0, 24, null, 127, b + 1)))

  const twoBars = (): Pattern => pattern(2, [patternNote(0, 1, 24, null, 127, 1), patternNote(384, 2, 24, null, 127, 2)])

  it('a switch at a bar line plays the old pattern before it and the queued one from it', () => {
    const r = new Rig()
    r.s.plan = switching(beats0, [[0, { pattern: hits(1, 0, 192), atTick: 2 * Seq.TICKS_PER_BAR }]])
    r.s.play(0)
    r.runTo(ahead + 4 * bar)
    const a = [0, 96, 192, 288, 384, 480, 576, 672].map((t): [number, string] => [t, 'live:0:0'])
    const b = [768, 960, 1152, 1344].map((t): [number, string] => [t, 'live:0:1'])
    expect(startsBefore(r, 4 * Seq.TICKS_PER_BAR)).toEqual([...a, ...b])
  })

  it("a switch at a pattern end drops the old pattern's second pass and starts the queued one on its tick", () => {
    const r = new Rig()
    const a = pattern(2, [patternNote(0, 0, 24, null, 127, 1), patternNote(400, 0, 24, null, 127, 2)])
    r.s.plan = switching(a, [[0, { pattern: hits(1, 0), atTick: 768 }]])
    r.s.play(0)
    r.runTo(ahead + 4 * bar)
    expect(startsBefore(r, 4 * Seq.TICKS_PER_BAR)).toEqual([
      [0, 'live:0:0'],
      [400, 'live:0:0'],
      [768, 'live:0:1'],
      [1152, 'live:0:1'],
    ])
  })

  it('an immediate switch starts the queued pattern at its bar 1, whatever tick it comes at', () => {
    const r = new Rig()
    r.s.plan = switching(beats0, [[0, { pattern: hits(1, 0, 192), atTick: 100 }]])
    r.s.play(0)
    r.runTo(ahead + 2 * bar)
    expect(startsBefore(r, 2 * Seq.TICKS_PER_BAR)).toEqual([
      [0, 'live:0:0'],
      [96, 'live:0:0'],
      [100, 'live:0:1'],
      [292, 'live:0:1'],
      [484, 'live:0:1'],
      [676, 'live:0:1'],
    ])
  })

  it('a 2-bar pattern switched in on an odd bar starts at its bar 1', () => {
    const r = new Rig()
    r.s.plan = switching(beats0, [[0, { pattern: twoBars(), atTick: 384 }]])
    r.s.play(0)
    r.runTo(ahead + 4 * bar)
    const b = startsBefore(r, 4 * Seq.TICKS_PER_BAR).filter((n) => n[1] !== 'live:0:0')
    expect(b).toEqual([
      [384, 'live:0:1'],
      [768, 'live:0:2'],
      [1152, 'live:0:1'],
    ])
  })

  it('the plan taking a switched-in pattern in place of the queue goes on from its start', () => {
    const queued = switching(beats0, [[0, { pattern: twoBars(), atTick: 384 }]])
    const whole = new Rig()
    whole.s.plan = queued
    whole.s.play(0)
    whole.runTo(ahead + 6 * bar)
    const applied = new Rig()
    applied.s.plan = queued
    applied.s.play(0)
    applied.runTo(ahead + 384 * 250 + 4800)
    applied.s.plan = { patterns: ProjectPatterns.with(projectPatterns(), 0, twoBars()), voices: voices(), skip: new Map(), bpm: 120, phase: PhaseAnchors.with(PhaseAnchors.ZERO, 0, 384) }
    applied.runTo(ahead + 6 * bar)
    expect(startsBefore(applied, 6 * Seq.TICKS_PER_BAR)).toEqual(startsBefore(whole, 6 * Seq.TICKS_PER_BAR))
    expect(applied.sink.starts.map((n) => n.at)).toEqual(whole.sink.starts.map((n) => n.at))
    // Another switch, out of a pattern that started late, leaves the old one at the tick and starts the new one there.
    const later = new Rig()
    later.s.plan = {
      patterns: ProjectPatterns.with(projectPatterns(), 0, twoBars()),
      voices: voices(),
      skip: new Map(),
      bpm: 120,
      phase: PhaseAnchors.with(PhaseAnchors.ZERO, 0, 100),
      queued: new Map([[0, { pattern: hits(3, 0), atTick: 1000 }]]),
    }
    later.s.play(0)
    later.runTo(ahead + 4 * bar)
    expect(startsBefore(later, 4 * Seq.TICKS_PER_BAR).filter((n) => n[0] <= 1384)).toEqual([
      [100, 'live:0:1'],
      [484, 'live:0:2'],
      [868, 'live:0:1'],
      [1000, 'live:0:3'],
      [1384, 'live:0:3'],
    ])
  })

  it('two groups switch at their own ticks', () => {
    const r = new Rig()
    const a = pattern(1, [patternNote(0, 0, 24, null, 127, 1), patternNote(192, 0, 24, null, 127, 2)])
    const b = pattern(1, [patternNote(96, 1, 24, null, 127, 3)])
    r.s.plan = switching(a, [
      [0, { pattern: b, atTick: 384 }],
      [1, { pattern: b, atTick: 768 }],
    ])
    r.s.play(0)
    r.runTo(ahead + 3 * bar)
    expect(startsBefore(r, 3 * Seq.TICKS_PER_BAR)).toEqual([
      [0, 'live:0:0'],
      [0, 'live:1:0'],
      [192, 'live:0:0'],
      [192, 'live:1:0'],
      [384, 'live:1:0'],
      [480, 'live:0:1'],
      [576, 'live:1:0'],
      [864, 'live:0:1'],
      [864, 'live:1:1'],
    ])
  })

  it('a group with no queue is left as it was', () => {
    const r = new Rig()
    const other = pattern(1, [patternNote(48, 5, 24, null, 127, 9)])
    r.s.plan = switching(beats0, [[0, { pattern: hits(1, 0), atTick: 384 }]], [[2, other]])
    r.s.play(0)
    r.runTo(ahead + 2 * bar)
    const c = startsBefore(r, 2 * Seq.TICKS_PER_BAR).filter((n) => n[1] === 'live:2:5')
    expect(c.map((n) => n[0])).toEqual([48, 432])
  })

  it('the plan taking the queued pattern in place of the queue neither repeats nor skips a note', () => {
    const b = hits(1, 0, 96, 192, 288)
    const queued = switching(beats0, [[0, { pattern: b, atTick: 384 }]])
    const whole = new Rig()
    whole.s.plan = queued
    whole.s.play(0)
    whole.runTo(ahead + 4 * bar)
    const applied = new Rig()
    applied.s.plan = queued
    applied.s.play(0)
    applied.runTo(ahead + 384 * 250 + 4800)
    applied.s.plan = { patterns: ProjectPatterns.with(projectPatterns(), 0, b), voices: voices(), skip: new Map(), bpm: 120, phase: PhaseAnchors.ZERO }
    applied.runTo(ahead + 4 * bar)
    expect(startsBefore(applied, 1536)).toEqual(startsBefore(whole, 1536))
    expect(applied.sink.starts.map((n) => n.at)).toEqual(whole.sink.starts.map((n) => n.at))
  })

  it('a switch queued at the free tick finds nothing of the old pattern sent from it, and the queued one whole', () => {
    const every = Array.from({ length: 16 }, (_, i) => i * 24)
    const r = new Rig()
    expect(r.s.freeTick).toBe(Number.NEGATIVE_INFINITY)
    r.s.plan = plan(0, hits(0, ...every))
    r.s.play(0)
    r.runTo(ahead + bar / 2 + 1234)
    const at = r.s.freeTick
    expect(r.sink.starts.every((n) => (n.at - ahead) / 250 < at)).toBe(true)
    expect(at).toBeGreaterThan((r.rendered - ahead) / 250)
    r.s.plan = switching(hits(0, ...every), [[0, { pattern: hits(1, ...every), atTick: at }]])
    r.runTo(ahead + 2 * bar)
    const heard = startsBefore(r, 2 * Seq.TICKS_PER_BAR)
    expect(heard.some((n) => n[1] === 'live:0:0' && n[0] >= at)).toBe(false)
    const queuedTicks: [number, string][] = []
    for (let t = at; t < 2 * Seq.TICKS_PER_BAR; t += 24) queuedTicks.push([t, 'live:0:1'])
    expect(heard.filter((n) => n[1] === 'live:0:1')).toEqual(queuedTicks)
    r.s.stop()
    r.runTo(r.rendered + 192)
    expect(r.s.freeTick).toBe(Number.NEGATIVE_INFINITY)
  })

  it('a note of the old pattern sounding at the switch is let go of at its own gate', () => {
    const r = new Rig()
    const a = pattern(1, [patternNote(300, 0, 200, null, 127, 1)])
    r.s.plan = switching(a, [[0, { pattern: hits(1, 0), atTick: 384 }]])
    r.s.play(0)
    r.runTo(ahead + 2 * bar)
    const held = r.sink.starts.find((n) => n.key === 'live:0:0')!
    const release = r.sink.releases.find((n) => n.key === 'live:0:0')!
    expect(release.tag).toBe(held.tag)
    expect(release.at).toBe(ahead + 500 * 250)
    expect(startsBefore(r, 768)).toEqual([
      [300, 'live:0:0'],
      [384, 'live:0:1'],
    ])
    expect(r.sink.events.filter((e) => e === 'flush').length).toBe(1)
  })
})
