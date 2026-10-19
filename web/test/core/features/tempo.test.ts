// Port of core/src/test/kotlin/dev/arc/ep133/features/TempoTest.kt
//
// Web delta: times are milliseconds where the Kotlin uses nanoseconds.
import { describe, expect, it } from 'vitest'
import {
  ClockFollow,
  gridAccent,
  gridAt,
  gridBeat,
  gridBpm,
  gridIndexFrom,
  TapTempo,
  Tempo,
  type Beat,
} from '../../../src/core/features/tempo'

/** MINSTD, the same numbers as the Kotlin test: jitter in −1..1 ms. */
class Jitter {
  constructor(private state = 1) {}
  next(): number {
    this.state = (this.state * 48271) % 2147483647
    return Math.round(((this.state / 2147483647) * 2 - 1) * 1_000_000) / 1_000_000
  }
}

const tick120 = 500 / 24

describe('TempoTest', () => {
  it('tempo limits', () => {
    expect(Tempo.clamp(12)).toBe(40)
    expect(Tempo.clamp(300)).toBe(240)
    expect(Tempo.clamp(133)).toBe(133)
    expect(Tempo.round(120.5)).toBe(121)
    expect(Tempo.round(120.49)).toBe(120)
    expect(Tempo.round(1e12)).toBe(240)
  })

  it('tap tempo averages the last intervals', () => {
    const t = new TapTempo()
    expect(t.tap(0)).toBeNull()
    expect(t.tap(500)).toBe(120)
    expect(t.tap(1000)).toBe(120)
    expect(t.tap(1500)).toBe(120)
    // Up to four intervals: 500, 500, 500, 560 → 515 ms → 116.5 → 117.
    expect(t.tap(2060)).toBe(117)
  })

  it('a long pause starts again, and so does a changed mind', () => {
    const t = new TapTempo()
    t.tap(0)
    t.tap(500)
    expect(t.tap(2600)).toBeNull()
    expect(t.tap(3200)).toBe(100)
    // 1000 ms after 600 ms ones: more than half off, so from the tap before it.
    t.reset()
    t.tap(0)
    t.tap(600)
    t.tap(1200)
    expect(t.tap(2200)).toBe(60)
    expect(t.tap(3200)).toBe(60)
    // A tap at the same moment is a new run.
    expect(t.tap(3200)).toBeNull()
  })

  it('tap tempo clamps', () => {
    const fast = new TapTempo()
    fast.tap(0)
    expect(fast.tap(100)).toBe(Tempo.MAX)
    const slow = new TapTempo()
    slow.tap(0)
    expect(slow.tap(1900)).toBe(Tempo.MIN)
  })

  it("the clock's tempo and beats come through jitter", () => {
    const f = new ClockFollow()
    const t0 = 10_000
    const j = new Jitter()
    expect(f.onMidi({ type: 'Start', time: t0 - 1 })).toBeNull()
    const beats: Beat[] = []
    let last = 0
    for (let i = 0; i < 200; i++) {
      last = t0 + Math.round(i * tick120 * 1e6) / 1e6 + j.next()
      const b = f.onMidi({ type: 'Clock', time: last })
      if (b) beats.push(b)
    }
    // Start: clock 0 is beat 0, a bar's first; every 24th clock a beat.
    expect(beats.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(beats.filter((b) => b.accent).map((b) => b.index)).toEqual([0, 4, 8])
    const g = f.grid(last + 1)!
    expect(Math.abs(g.periodMs - 500) / 500).toBeLessThan(0.001)
    expect(Math.abs(gridBpm(g) - 120)).toBeLessThan(0.12)
    expect(g.barKnown).toBe(true)
    expect(g.beatIndex).toBe(8)
    // The fitted beats sit on the device's, inside the jitter (further out, a little less so).
    for (const k of [8, 9]) expect(Math.abs(gridAt(g, k) - (t0 + k * 500))).toBeLessThan(1)
    expect(Math.abs(gridAt(g, 12) - (t0 + 12 * 500))).toBeLessThan(3)
    expect(gridIndexFrom(g, t0 + 8 * 500 - 5)).toBe(8)
    expect(gridIndexFrom(g, t0 + 8 * 500 + 5)).toBe(9)
    expect(gridBeat(g, 12)).toEqual({ index: 12, at: gridAt(g, 12), accent: true })
    expect(gridAccent(g, 13)).toBe(false)
  })

  it('Stop holds the count and Continue goes on from it', () => {
    const f = new ClockFollow()
    let t = 0
    const clock = (): Beat | null => {
      const b = f.onMidi({ type: 'Clock', time: t })
      t += 20
      return b
    }
    f.onMidi({ type: 'Start', time: t })
    for (let i = 0; i < 30; i++) clock() // ticks 0..29
    f.onMidi({ type: 'Stop', time: t })
    // Clocks while stopped count nothing: no beats, the tempo stays.
    for (let i = 0; i < 30; i++) expect(clock()).toBeNull()
    const stopped = f.grid(t)!
    expect(stopped.barKnown).toBe(false)
    expect(stopped.periodMs).toBeCloseTo(480, 6)
    f.onMidi({ type: 'Continue', time: t })
    // Ticks 30..47, then 48: beat 2, not a bar's first.
    for (let i = 0; i < 18; i++) expect(clock()).toBeNull()
    expect(clock()!.index).toBe(2)
  })

  it('no tempo under 25 clocks or once they stop', () => {
    const f = new ClockFollow()
    f.onMidi({ type: 'Start', time: 0 })
    let t = 0
    for (let i = 0; i < 24; i++) {
      f.onMidi({ type: 'Clock', time: t })
      t += 20
    }
    expect(f.grid(t)).toBeNull()
    f.onMidi({ type: 'Clock', time: t })
    expect(f.grid(t)).not.toBeNull()
    expect(f.grid(t + 2100)).toBeNull()
    f.reset()
    expect(f.grid(t)).toBeNull()
  })

  it('opened mid-play, the tempo follows and the bar waits for a Start', () => {
    const f = new ClockFollow()
    let t = 0
    const beats: Beat[] = []
    for (let i = 0; i < 60; i++) {
      const b = f.onMidi({ type: 'Clock', time: t })
      if (b) beats.push(b)
      t += 20
    }
    expect(beats.map((b) => b.index)).toEqual([0, 1, 2])
    expect(beats.some((b) => b.accent)).toBe(false)
    const g = f.grid(t)!
    expect(g.barKnown).toBe(false)
    expect(g.periodMs).toBeCloseTo(480, 6)
    f.onMidi({ type: 'Start', time: t })
    expect(f.onMidi({ type: 'Clock', time: t })).toEqual({ index: 0, at: t, accent: true })
  })

  it("a Start holds the tempo, so the grid is the device's from the first clock after it", () => {
    const f = new ClockFollow()
    const tick90 = 60e3 / 90 / 24
    for (let i = 0; i < 72; i++) f.onMidi({ type: 'Clock', time: i * tick90 })
    f.onMidi({ type: 'Stop', time: 2000 })
    // A second with no clock (some devices send none while stopped), then Start.
    const s = 3000
    f.onMidi({ type: 'Start', time: s })
    expect(f.grid(s)).toBeNull()
    expect(f.onMidi({ type: 'Clock', time: s })).toEqual({ index: 0, at: s, accent: true })
    const g = f.grid(s)!
    expect(g.beatIndex).toBe(0)
    expect(g.anchor).toBe(s)
    expect(g.barKnown).toBe(true)
    expect(Math.abs(g.periodMs - 60e3 / 90)).toBeLessThan(1e-3)
    // Laid through the clocks since, until there are enough to fit.
    for (let i = 1; i < 12; i++) f.onMidi({ type: 'Clock', time: s + i * tick90 })
    expect(Math.abs(gridAt(f.grid(s + 300)!, 1) - (s + 60e3 / 90))).toBeLessThan(1e-3)
    // Continue holds it too; reset forgets it.
    f.onMidi({ type: 'Continue', time: s + 400 })
    f.onMidi({ type: 'Clock', time: s + 400 })
    expect(Math.abs(f.grid(s + 400)!.periodMs - 60e3 / 90)).toBeLessThan(1e-3)
    f.reset()
    f.onMidi({ type: 'Start', time: s + 500 })
    f.onMidi({ type: 'Clock', time: s + 500 })
    expect(f.grid(s + 500)).toBeNull()
  })
})
