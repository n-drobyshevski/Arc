// Port of core/src/test/kotlin/dev/arc/ep133/features/SampleTimingTest.kt
//
// Web delta: times are milliseconds where the Kotlin uses nanoseconds.
import { describe, expect, it } from 'vitest'
import { CountIn, Counting, followStart, frameAt, Start, Waiting, type FrameClock } from '../../../src/core/features/sampleTiming'
import type { Beat } from '../../../src/core/features/tempo'

const period = 500 // 120 BPM

/** Beat [index] of a steady 120 BPM click, accented on a bar's first beat. */
const beat = (index: number, accent: boolean = index % 4 === 0): Beat => ({ index, at: index * 500, accent })

describe('SampleTimingTest', () => {
  it('a frame clock gives the frame before and after its stamp', () => {
    const c: FrameClock = { frame: 1_000, ms: 5_000, rate: 48_000 }
    expect(frameAt(c, 5_000)).toBe(1_000)
    expect(frameAt(c, 5_010)).toBe(1_480)
    expect(frameAt(c, 4_990)).toBe(520)
    // Half a frame is 10 416.67 ns at 48 kHz: rounded half up, either side.
    expect(frameAt(c, 5_000 + 0.010417)).toBe(1_001)
    expect(frameAt(c, 5_000 + 0.010416)).toBe(1_000)
    expect(frameAt(c, 5_000 - 0.010416)).toBe(1_000)
    expect(frameAt(c, 5_000 - 0.010417)).toBe(999)
    // An hour on.
    expect(frameAt(c, 5_000 + 3_600_000)).toBe(1_000 + 172_800_000)
  })

  it('a count-in waits for an accent, counts, then gives the start', () => {
    const c = new CountIn()
    expect(c.onBeat(beat(1), period)).toEqual(Waiting)
    expect(c.onBeat(beat(2), period)).toEqual(Waiting)
    expect(c.onBeat(beat(3), period)).toEqual(Waiting)
    expect(c.onBeat(beat(4), period)).toEqual(Counting(1))
    expect(c.onBeat(beat(5), period)).toEqual(Counting(2))
    expect(c.onBeat(beat(6), period)).toEqual(Counting(3))
    // The 4th beat: the take starts on the next bar's first beat, the downbeat + 4 beats.
    expect(c.onBeat(beat(7), period)).toEqual(Start(4_000))
    // Then it waits for an accent again.
    expect(c.onBeat(beat(8), period)).toEqual(Counting(1))
    c.reset()
    expect(c.onBeat(beat(9), period)).toEqual(Waiting)
  })

  it("no accent while the bar isn't known", () => {
    const c = new CountIn()
    for (let i = 0; i <= 8; i++) expect(c.onBeat(beat(i, false), period)).toEqual(Waiting)
  })

  it('a skipped beat still counts, and a count that goes back starts again', () => {
    const c = new CountIn()
    c.onBeat(beat(0), period)
    c.onBeat(beat(1), period)
    // Beat 2 was skipped (a late click): beat 3 is still the 4th.
    expect(c.onBeat(beat(3), period)).toEqual(Start(2_000))
    // A new Start on the EP-133 counts from 0 again, from its accent.
    expect(c.onBeat(beat(4), period)).toEqual(Counting(1))
    expect(c.onBeat(beat(5), period)).toEqual(Counting(2))
    expect(c.onBeat({ index: 0, at: 9_000, accent: true }, period)).toEqual(Counting(1))
    expect(c.onBeat({ index: 1, at: 9_500, accent: false }, period)).toEqual(Counting(2))
    // Gone back without an accent: waiting again.
    c.reset()
    c.onBeat(beat(4), period)
    expect(c.onBeat(beat(2), period)).toEqual(Waiting)
  })

  it('the start follows the latest beat, and longer counts go past the bar', () => {
    const c = new CountIn()
    c.onBeat(beat(0), period)
    c.onBeat(beat(1), period)
    c.onBeat(beat(2), period)
    // The tempo nudged on the last beat: a beat after it.
    expect(c.onBeat({ index: 3, at: 1_510, accent: false }, 480)).toEqual(Start(1_510 + 480))
    const two = new CountIn(8)
    two.onBeat(beat(0), period)
    for (let i = 1; i <= 3; i++) two.onBeat(beat(i), period)
    expect(two.onBeat(beat(4), period)).toEqual(Counting(5)) // the next bar's accent goes on counting
    for (let i = 5; i <= 6; i++) two.onBeat(beat(i), period)
    expect(two.onBeat(beat(7), period)).toEqual(Start(4_000))
    // A one-beat count starts from its accent.
    expect(new CountIn(1).onBeat(beat(4), period)).toEqual(Start(2_500))
  })

  it('follow starts on the edge into playing', () => {
    expect(followStart(true, false)).toBe(true)
    expect(followStart(true, null)).toBe(true)
    expect(followStart(true, true)).toBe(false)
    expect(followStart(false, false)).toBe(false)
    expect(followStart(false, true)).toBe(false)
    expect(followStart(null, false)).toBe(false)
    expect(followStart(null, null)).toBe(false)
  })
})
