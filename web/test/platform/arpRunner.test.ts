// Port of the arp and note repeat cases of app/src/test/kotlin/dev/arc/ep133/audio/PatternSchedulerTest.kt
// (ArpRunner, as PatternScheduler plays it): steps from the press on a clock of their own, or on the
// pattern's grid while it runs, their gates, note repeat, and the steps told for RECORD.
// Web deltas: the press's frame comes in the plan ([ArpPlan.atFrame]) where Kotlin finds it from the
// output's FrameClock stamp (r.heard(f) + stamp() is atFrame f; no stamp is atFrame null, the frames
// rendered), so there are no stamps to run with; pressMs is the run's identity only. Kotlin's
// `playing` is transportOn. Nothing skipped: none of these cases use lost() or wait for a stamp.
import { describe, expect, it } from 'vitest'
import { Arp, ArpOrder, ArpSettings, arpNote, type ArpNote } from '../../src/core/features/arp'
import { physicalPad, type PhysicalPad } from '../../src/core/features/padNotes'
import { Timing, TimingSettings, pattern, patternNote, projectPatterns, type Pattern } from '../../src/core/features/pattern'
import { PhaseAnchors } from '../../src/core/features/sequencer'
import { VoiceMode, VoiceShape } from '../../src/core/formats/voiceMixer'
import { PatternScheduler, type ArpPlan, type ArpStep, type PadVoice, type ScheduleSink, type SeqPlan } from '../../src/platform/audio/patternScheduler'

// 48 kHz at 120 BPM: 250 frames a tick, a bar 96000 frames; the lookahead 2400.
const rate = 48000
const ahead = 2400
const bar = 96000
// 1/16 at 120 BPM: 24 ticks, 6000 frames a step.
const step = 6000
const padShape = VoiceShape.of({ gain: 0.5 })
const keysShape = VoiceShape.of({ mode: VoiceMode.LEGATO })

interface Started {
  key: string
  semitones: number
  tag: number
  shape: VoiceShape
  at: number
  // The frames rendered when it was sent.
  rendered: number
}
interface Released {
  key: string
  at: number
  tag: number
}

class FakeSink implements ScheduleSink {
  readonly events: (Started | Released | 'flush')[] = []
  rendered = 0
  get starts(): Started[] {
    return this.events.filter((e): e is Started => typeof e === 'object' && 'semitones' in e)
  }
  get releases(): Released[] {
    return this.events.filter((e): e is Released => typeof e === 'object' && !('semitones' in e))
  }
  startAt(key: string, _v: PadVoice, semitones: number, tag: number, shape: VoiceShape, frame: number): boolean {
    this.events.push({ key, semitones, tag, shape, at: frame, rendered: this.rendered })
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

// Kotlin's SeqPlan(ProjectPatterns(), voices(), emptyMap(), 120.0): the transport with nothing to play.
const emptySeq = (): SeqPlan => ({ patterns: projectPatterns(), voices: voices(), skip: new Map(), bpm: 120, phase: PhaseAnchors.ZERO })

function seqPlan(group: number, pat: Pattern): SeqPlan {
  const groups = [pattern(), pattern(), pattern(), pattern()]
  groups[group] = pat
  return { ...emptySeq(), patterns: projectPatterns(groups) }
}

const note = (semis: number | null, velocity = 127, pad: PhysicalPad = physicalPad(0, 0)): ArpNote => arpNote(pad, semis, velocity)

function arpPlan(
  notes: ArpNote[],
  atFrame: number | null,
  o: { order?: ArpOrder; gate?: number; swing?: number; interval?: Timing; keys?: boolean; bpm?: number; pressMs?: number } = {},
): ArpPlan {
  return {
    notes,
    voices: voices(),
    keys: o.keys ?? true,
    timing: TimingSettings.of({ interval: o.interval ?? Timing.SIXTEENTH, swing: o.swing ?? 50 }),
    settings: ArpSettings.of({ order: o.order ?? ArpOrder.PLAYED, gate: o.gate ?? 50 }),
    bpm: o.bpm ?? 120,
    seed: 7,
    pressMs: o.pressMs ?? 1,
    atFrame,
  }
}

// A scheduler and its sink, rendered block by block.
class Rig {
  readonly s = new PatternScheduler()
  readonly sink = new FakeSink()
  rendered = 0
  fill(): void {
    this.sink.rendered = this.rendered
    this.s.fill(this.sink, this.rendered, rate)
  }
  /** Blocks of [block] up to [until]. */
  run(until: number, block = 192): void {
    while (this.rendered < until) {
      this.fill()
      this.rendered += block
    }
  }
}

const arpStarts = (r: Rig): Started[] => r.sink.starts.filter((n) => n.key.startsWith('arp:'))

// Kotlin's Random(133) stand-in: mulberry32.
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pairs = <T>(xs: T[]): [T, T][] => xs.slice(1).map((b, i): [T, T] => [xs[i]!, b])

describe('PatternScheduler: the arp and note repeat', () => {
  it('a free arp plays its first step on the press, then a step every interval', () => {
    const r = new Rig()
    r.run(48_000)
    const f = r.rendered - 1200
    r.s.arp = arpPlan([note(0), note(4), note(7)], f)
    expect(r.s.running).toBe(true)
    expect(r.s.transportOn).toBe(false)
    r.run(f + bar)
    const starts = arpStarts(r).filter((n) => n.at < f + bar)
    const semis = [0, 4, 7]
    expect(starts.map((n) => n.at)).toEqual(Array.from({ length: 16 }, (_, i) => f + i * step))
    expect(starts.map((n) => n.key)).toEqual(Array.from({ length: 16 }, (_, i) => `arp:0:0:${semis[i % 3]}`))
    expect(starts.map((n) => n.semitones)).toEqual(Array.from({ length: 16 }, (_, i) => semis[i % 3]))
    expect(starts.every((n) => n.shape === keysShape && n.tag < 0)).toBe(true)
    // The press heard before the block: its step a little late, the rest ahead of the mix.
    expect(starts[0]!.at).toBeLessThan(starts[0]!.rendered)
    expect(starts.slice(1).every((n) => n.at >= n.rendered)).toBe(true)
    // No frame for the press: step 0 on the frames rendered.
    const q = new Rig()
    q.run(48_000)
    q.s.arp = arpPlan([note(0)], null)
    q.run(48_000 + bar)
    expect(arpStarts(q).filter((n) => n.at < 48_000 + bar).map((n) => n.at)).toEqual(Array.from({ length: 16 }, (_, i) => 48_000 + i * step))
  })

  it('with the pattern running, the press plays at once and the steps after it lie on the grid', () => {
    const r = new Rig()
    const ticks: number[] = []
    r.s.onArpStep = (s) => ticks.push(s.globalTick)
    r.s.plan = emptySeq()
    r.s.play(0)
    r.run(48_000)
    // Tick 177.6: the grid's 1/16 at 180 is less than half a step on, so the next is 192.
    const f = r.rendered - 1200
    r.s.arp = arpPlan([note(0), note(4)], f)
    r.run(f + bar)
    const starts = arpStarts(r).filter((n) => n.at < f + bar)
    expect(starts[0]!.at).toBe(f)
    expect(starts.slice(1).map((n) => n.at)).toEqual(Array.from({ length: starts.length - 1 }, (_, i) => ahead + (192 + i * 24) * 250))
    expect(ticks.slice(0, starts.length)).toEqual([178, ...Array.from({ length: starts.length - 1 }, (_, i) => 192 + i * 24)])
    expect(pairs(ticks).every(([a, b]) => b > a)).toBe(true)
  })

  it('swing puts every odd step later, free and on the grid', () => {
    const r = new Rig()
    r.run(48_000)
    const f = r.rendered
    r.s.arp = arpPlan([note(0)], null, { swing: 75 })
    r.run(f + bar)
    // 75%: half a 1/16 late, 12 ticks.
    expect(arpStarts(r).filter((n) => n.at < f + bar).map((n) => n.at)).toEqual(
      Array.from({ length: 16 }, (_, i) => f + i * step + (i % 2 === 1 ? 3000 : 0)),
    )
    // On the grid: the odd 1/16s of the bar, from tick 0.
    const g = new Rig()
    g.s.plan = emptySeq()
    g.s.play(0)
    g.run(48_000)
    g.s.arp = arpPlan([note(0)], g.rendered - 1200, { swing: 75 })
    g.run(48_000 + bar)
    const grid = arpStarts(g).slice(1)
    expect(grid.length).toBeGreaterThan(0)
    for (const s of grid) {
      const tick = Math.trunc((s.at - ahead) / 250)
      expect(tick % 24, `tick ${tick}`).toBe(Math.trunc(tick / 24) % 2 === 1 ? 12 : 0)
    }
    // Straight with 1/8T, which doesn't swing.
    const t = new Rig()
    t.run(48_000)
    t.s.arp = arpPlan([note(0)], null, { swing: 75, interval: Timing.EIGHTH_T })
    t.run(48_000 + bar)
    expect(arpStarts(t).filter((n) => n.at < 48_000 + bar).map((n) => n.at)).toEqual(Array.from({ length: 12 }, (_, i) => 48_000 + i * 8000))
  })

  it('UP cycles across windows, neither repeating nor skipping a step through tempo and plan changes', () => {
    const random = rng(133)
    const r = new Rig()
    const held = [note(7), note(0), note(4)]
    while (r.rendered < 4 * bar) {
      // A new plan every block, the same run (its press).
      r.s.arp = arpPlan(held, 0, { order: ArpOrder.UP, bpm: 90 + random() * 60 })
      r.fill()
      r.rendered += 64 + Math.floor(random() * 800)
    }
    const starts = arpStarts(r)
    expect(starts.length).toBeGreaterThan(40)
    expect(starts.map((n) => n.key)).toEqual(starts.map((_, i) => `arp:0:0:${[0, 4, 7][i % 3]}`))
    expect(pairs(starts).every(([a, b]) => b.at > a.at)).toBe(true)
    // Steps at 90..150 BPM: 4800..8000 frames apart.
    const gaps = pairs(starts).map(([a, b]) => b.at - a.at)
    expect(gaps.every((d) => d >= 4790 && d <= 8010), gaps.join(' ')).toBe(true)
  })

  it('each step lets go at its gate, on the voice it started', () => {
    const r = new Rig()
    r.s.arp = arpPlan([note(0), note(5)], 0, { gate: 50 })
    r.run(bar)
    const starts = arpStarts(r).filter((n) => n.at + 3000 < bar - ahead)
    const releases = r.sink.releases
    expect(starts.length).toBeGreaterThanOrEqual(10)
    for (const s of starts) {
      const rel = releases.filter((x) => x.tag === s.tag)
      expect(rel).toHaveLength(1)
      expect(rel[0]!.key).toBe(s.key)
      // Half of a 1/16: 12 ticks.
      expect(rel[0]!.at).toBe(s.at + 3000)
    }
    expect(Arp.gateTicks(Timing.SIXTEENTH, 50)).toBe(12)
  })

  it('no plan lets go of every arp voice, and nothing more plays', () => {
    const r = new Rig()
    r.s.arp = arpPlan([note(0), note(4)], 0, { gate: 100 })
    r.run(30_000)
    const sounding = arpStarts(r).filter((n) => n.at < r.rendered).at(-1)!
    r.s.arp = null
    expect(r.s.running).toBe(false)
    r.fill()
    const stopAt = r.rendered
    r.run(r.rendered + bar)
    const starts = arpStarts(r)
    // Each voice let go of: the one sounding where the mix was, any sent to start later at its gate.
    for (const s of starts) expect(r.sink.releases.some((x) => x.tag === s.tag), `${s.key} at ${s.at} never let go of`).toBe(true)
    expect(Math.min(...r.sink.releases.filter((x) => x.tag === sounding.tag).map((x) => x.at))).toBe(stopAt)
    expect(starts.every((n) => n.at < stopAt + ahead)).toBe(true)
    expect(r.sink.events).not.toContain('flush')
  })

  it('note repeat plays every pad held on each step, as pad hits', () => {
    const r = new Rig()
    const a1 = physicalPad(0, 0)
    const b3 = physicalPad(1, 4)
    r.s.arp = arpPlan([note(null, 127, a1), note(null, 64, b3)], 0, { keys: false })
    r.run(bar)
    const starts = arpStarts(r).filter((n) => n.at < bar)
    expect(starts).toHaveLength(32)
    for (let i = 0; i < 16; i++) {
      const pair = starts.slice(2 * i, 2 * i + 2)
      expect(pair.map((n) => n.key)).toEqual(['arp:0:0:n', 'arp:1:4:n'])
      expect(pair.every((n) => n.at === i * step && n.semitones === 0)).toBe(true)
      expect(pair[0]!.shape).toEqual(padShape)
      // Softer: (64 / 127)² of the pad's gain.
      expect(pair[1]!.shape.gain).toBeCloseTo(padShape.gain * Arp.velocityGain(64), 6)
    }
  })

  it('a pattern note plays at its velocity, 127 as it was', () => {
    const r = new Rig()
    r.s.plan = seqPlan(0, pattern(1, [patternNote(0, 0, 24, null, 127, 1), patternNote(96, 0, 24, null, 32, 2)]))
    r.s.play(0)
    r.run(bar)
    const [loud, soft] = r.sink.starts
    expect(loud!.shape).toBe(padShape)
    expect(soft!.shape.gain).toBeCloseTo(padShape.gain * Arp.velocityGain(32), 6)
  })

  it('steps are told for RECORD only while the pattern runs, which they move onto at its start', () => {
    const r = new Rig()
    const told: ArpStep[] = []
    r.s.onArpStep = (s) => told.push(s)
    r.s.plan = emptySeq()
    r.s.arp = arpPlan([note(0)], 0, { gate: 25 })
    r.run(bar)
    expect(arpStarts(r).length).toBeGreaterThan(0)
    expect(told).toEqual([])
    const before = arpStarts(r).length
    r.s.play(0)
    r.run(3 * bar)
    // PLAY anchors tick 0 a lookahead on; from there, the grid's steps.
    const zero = bar + ahead
    const after = arpStarts(r).slice(before)
    expect(after.length).toBeGreaterThan(0)
    for (const s of after) expect((s.at - zero) % step, `frame ${s.at}`).toBe(0)
    expect(told).toHaveLength(after.length)
    expect(told.map((s) => s.globalTick)).toEqual(after.map((n) => (n.at - zero) / 250))
    expect(told.every((s) => s.gateTicks === 6 && s.note.semitones === 0 && s.note.velocity === 127)).toBe(true)
    expect(told.every((s) => s.note.pad.group === 0 && s.note.pad.offset === 0)).toBe(true)
    // Stopped, the arp goes on its own clock, and RECORD hears nothing more.
    r.s.stop()
    const n = told.length
    r.run(4 * bar)
    expect(told).toHaveLength(n)
    expect(arpStarts(r).at(-1)!.at).toBeGreaterThan(3 * bar + ahead)
  })

  it('a step STOP drops before it is mixed is never told for RECORD', () => {
    const r = new Rig()
    const told: [ArpStep, number][] = []
    r.s.onArpStep = (s) => told.push([s, r.rendered])
    r.s.plan = emptySeq()
    r.s.play(0)
    r.run(48_000)
    r.s.arp = arpPlan([note(0)], r.rendered - 1200)
    // Tick 480 is sent a lookahead early, and not yet mixed when STOP comes.
    const zero = ahead
    const pending = zero + 480 * 250
    r.run(pending - 1056)
    expect(arpStarts(r).some((n) => n.at === pending && n.rendered < pending)).toBe(true)
    // Each one told was mixed by then.
    expect(told.length).toBeGreaterThan(0)
    for (const [s, at] of told) expect(zero + s.globalTick * 250, `tick ${s.globalTick} told at ${at}`).toBeLessThan(at)
    r.s.stop()
    r.run(pending + bar)
    expect(r.sink.events).toContain('flush')
    expect(told.every(([s]) => s.globalTick < 480), told.map(([s]) => s.globalTick).join(' ')).toBe(true)
  })
})
