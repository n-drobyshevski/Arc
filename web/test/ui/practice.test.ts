// Web addition: LivePractice.kt's padCues (Kotlin has no test of it): each pad's cue in a practice's frame.
import { describe, expect, it } from 'vitest'
import { practiceCounts, practiceTarget } from '../../src/core/features/practice'
import type { PracticeFrame } from '../../src/state/practicePlan'
import { padCues } from '../../src/ui/live/practice'

const frame = (upcoming: [number, number][]): PracticeFrame => ({
  tick: 0,
  upcoming: upcoming.map(([o, d]) => [practiceTarget(o, d, 100), d] as const),
  counts: practiceCounts(),
})

describe('the pads lit ahead of each hit', () => {
  it('rings a pad with the beats to its next hit up to four, and lights it from a 32nd before', () => {
    const cues = padCues(frame([[0, -10], [1, 12], [2, 13], [3, 96], [4, 97], [5, 384], [6, 385]]), null)
    expect(cues.get(0)).toEqual({ beats: 0, now: true })
    expect(cues.get(1)).toEqual({ beats: 0, now: true })
    expect(cues.get(2)).toEqual({ beats: 1, now: false })
    expect(cues.get(3)).toEqual({ beats: 1, now: false })
    expect(cues.get(4)).toEqual({ beats: 2, now: false })
    expect(cues.get(5)).toEqual({ beats: 4, now: false })
    expect(cues.has(6)).toBe(false)
    // The same cue is the same object, so a pad re-renders only when it changes (web).
    expect(padCues(frame([[3, 50]]), null).get(3)).toBe(cues.get(3))
  })

  it("a pad's next hit decides (the frame's are nearest first); in WAIT the pads waited for are lit; no frame, none", () => {
    expect(padCues(frame([[0, 20], [0, 200]]), null).get(0)).toEqual({ beats: 1, now: false })
    expect([...padCues(frame([[0, 0]]), new Set([4, 5])).keys()]).toEqual([4, 5])
    expect(padCues(null, null).size).toBe(0)
  })
})
