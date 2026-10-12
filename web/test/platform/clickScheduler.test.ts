// Port of app/src/test/kotlin/dev/arc/ep133/audio/ClickSchedulerTest.kt (the
// cases with frames; the web's grid comes in frames, so there is no stamp or
// delay to map), and the click in Live's mix (MixerHost): TEMPO's click, the
// pattern's count-in, and TAKE leaving it out.
import { describe, expect, it } from 'vitest'
import { pattern, projectPatterns } from '../../src/core/features/pattern'
import { PhaseAnchors } from '../../src/core/features/sequencer'
import { ClickScheduler, ClickTrack, type Click, type FrameGrid } from '../../src/platform/audio/clickScheduler'
import { MixerHost, type FromMixer } from '../../src/platform/audio/liveMixer'

const RATE = 48000

/** Every click from frame 0 to [to] in blocks of [block]. */
function run(s: ClickScheduler, to: number, bpm: number, grid: (from: number) => FrameGrid | null = () => null, block = 128): Click[] {
  const out: Click[] = []
  for (let f = 0; f < to; f += block) out.push(...s.block(f, block, bpm, grid(f)))
  return out
}

describe('ClickScheduler', () => {
  it('clicks every 24000 frames at 120 BPM and 48 kHz, the first at once', () => {
    const c = run(new ClickScheduler(RATE), 100000, 120)
    expect(c.map((k) => k.frame)).toEqual([0, 24000, 48000, 72000, 96000])
    expect(c.map((k) => k.accent)).toEqual([true, false, false, false, true])
  })

  it("doesn't drift over ten thousand beats at 133 BPM", () => {
    const s = new ClickScheduler(RATE)
    const period = (RATE * 60) / 133
    let last: Click | null = null
    for (let f = 0; f < period * 10000; f += 4096) {
      for (const k of s.block(f, 4096, 133, null)) last = k
    }
    expect(Math.abs(last!.frame - Math.round(last!.index * period))).toBeLessThanOrEqual(1)
  })

  it('waits with a new tempo for the beat already due', () => {
    const s = new ClickScheduler(RATE)
    const out: Click[] = []
    for (let f = 0; f < 30000; f += 128) out.push(...s.block(f, 128, 120, null))
    for (let f = 30080; f < 150000; f += 128) out.push(...s.block(f, 128, 60, null))
    // 48000 was due at 120 when the tempo changed; 60's beats follow it.
    expect(out.map((k) => k.frame)).toEqual([0, 24000, 48000, 96000, 144000])
  })

  it('follows a grid; a beat well past is skipped, one just past clicked at once', () => {
    const grid: FrameGrid = { anchorFrame: 1000, beatIndex: 8, periodFrames: 22000, barKnown: true }
    const s = new ClickScheduler(RATE)
    expect(s.block(0, 25000, 120, grid).map((k) => [k.frame, k.index, k.accent])).toEqual([[1000, 8, true], [23000, 9, false]])
    // A grid nudged 50 frames back: beat 10, just past, clicks at the block's start.
    const t = new ClickScheduler(RATE)
    t.block(0, 44000, 120, grid)
    expect(t.block(45000, 128, 120, { ...grid, anchorFrame: 950 }).map((k) => k.frame)).toEqual([45000])
  })

  it("doesn't click a re-fitted beat twice, and gives way to a grid not too close to its last click", () => {
    const s = new ClickScheduler(RATE)
    const a: FrameGrid = { anchorFrame: 0, beatIndex: 0, periodFrames: 24000, barKnown: false }
    expect(s.block(0, 128, 120, a).map((k) => k.frame)).toEqual([0])
    expect(s.block(128, 128, 120, { ...a, anchorFrame: 130 }).map((k) => k.frame)).toEqual([])
    // Free, then a grid whose beat falls 1000 frames after the last free click: one beat.
    const f = new ClickScheduler(RATE)
    f.block(0, 128, 120, null)
    expect(f.block(1000, 128, 120, { anchorFrame: 1000, beatIndex: 3, periodFrames: 24000, barKnown: false })).toEqual([])
  })

  it('runs free on from the last click when the grid goes, counting on from its beat', () => {
    const s = new ClickScheduler(RATE)
    const g: FrameGrid = { anchorFrame: 0, beatIndex: 5, periodFrames: 20000, barKnown: true }
    s.block(0, 128, 120, g)
    const free = [...s.block(128, 30000, 120, null)]
    expect(free.map((k) => [k.frame, k.index])).toEqual([[24000, 6]])
  })
})

describe('ClickTrack', () => {
  it('adds a click from its frame, carrying its tail into the next block', () => {
    const t = new ClickTrack(RATE)
    const l = new Float32Array(1024)
    const r = new Float32Array(1024)
    t.mix(l, r, 1024, 0, [{ frame: 1000, index: 0, accent: true }])
    expect(l.slice(0, 1000).every((v) => v === 0)).toBe(true)
    expect(t.sounding).toBe(true)
    const l2 = new Float32Array(1024)
    t.mix(l2, new Float32Array(1024), 1024, 1024, [])
    expect(l2.some((v) => v !== 0)).toBe(true)
    // 30 ms (1440 frames) in all: it ends in the third block.
    t.mix(new Float32Array(1024), new Float32Array(1024), 1024, 2048, [])
    expect(t.sounding).toBe(false)
  })
})

describe('MixerHost click', () => {
  const beats = (out: FromMixer[]) => out.flatMap((m) => (m.t === 'beat' ? [[m.index, m.accent]] : []))

  it("TEMPO's click: free at the phone's tempo, told beat by beat", () => {
    const out: FromMixer[] = []
    const host = new MixerHost(RATE, (m) => out.push(m))
    host.handle({ t: 'click', on: true, bpm: 120, grid: null })
    const l = new Float32Array(128)
    const r = new Float32Array(128)
    let heard = false
    for (let i = 0; i < 400; i++) {
      l.fill(0)
      host.render(l, r, 128, (i * 128) / RATE)
      if (l.some((v) => v !== 0)) heard = true
    }
    expect(heard).toBe(true)
    expect(beats(out)).toEqual([[0, true], [1, false], [2, false]])
    host.handle({ t: 'click', on: false, bpm: 120, grid: null })
    out.length = 0
    for (let i = 400; i < 800; i++) host.render(l, r, 128, (i * 128) / RATE)
    expect(beats(out)).toEqual([])
  })

  it("the pattern's count-in clicks its four beats, the first accented, and none from bar 1", () => {
    const out: FromMixer[] = []
    const host = new MixerHost(RATE, (m) => out.push(m))
    host.handle({ t: 'plan', patterns: projectPatterns([pattern(), pattern(), pattern(), pattern()]), voices: [], skip: [], bpm: 120, phase: PhaseAnchors.ZERO })
    host.handle({ t: 'play', countInBars: 1, leadMs: 0, atFrame: null, atPress: false })
    const l = new Float32Array(128)
    const r = new Float32Array(128)
    for (let i = 0; i < 1600; i++) host.render(l, r, 128, (i * 128) / RATE)
    expect(beats(out)).toEqual([[-4, true], [-3, false], [-2, false], [-1, false]])
  })

  it('TAKE leaves the click out', () => {
    const out: FromMixer[] = []
    const host = new MixerHost(RATE, (m) => out.push(m))
    host.handle({ t: 'click', on: true, bpm: 120, grid: null })
    host.handle({ t: 'arm' })
    const l = new Float32Array(128)
    const r = new Float32Array(128)
    for (let i = 0; i < 40; i++) host.render(l, r, 128, (i * 128) / RATE)
    // Nothing but the click sounded: the take never started.
    expect(out.some((m) => m.t === 'rec' && m.state.kind === 'recording')).toBe(false)
  })
})
