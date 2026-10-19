// Tests for SAMPLE's haptics' rule (ui/live/SamplePanel.tsx autoStopped), as LiveSamplerTest's.
import { describe, expect, it } from 'vitest'
import { SamplePhase } from '../../src/core/features/sampleCapture'
import { physicalPad } from '../../src/core/features/padNotes'
import { autoStopped } from '../../src/ui/live/SamplePanel'

const pad = physicalPad(0, 0)
const take = (seconds: number, max: number, latched: boolean) =>
  SamplePhase.Recording(pad, seconds, max, latched) as Extract<SamplePhase, { type: 'Recording' }>

describe('autoStopped', () => {
  it('is a take still held, or one at its longest', () => {
    expect(autoStopped(take(3, 20, false), true, null, 120)).toBe(true)
    expect(autoStopped(take(19, 20, false), false, null, 120)).toBe(true)
    expect(autoStopped(take(3, 20, false), false, null, 120)).toBe(false)
  })

  it("is a hands-free take of some bars that ran its length, not one let go of sooner", () => {
    // 2 bars at 120: 4 s.
    expect(autoStopped(take(3, 20, true), false, 2, 120)).toBe(true)
    expect(autoStopped(take(2, 20, true), false, 2, 120)).toBe(false)
    // Free, or held: only the limit.
    expect(autoStopped(take(3, 20, true), false, null, 120)).toBe(false)
    expect(autoStopped(take(3, 20, false), false, 2, 120)).toBe(false)
    expect(autoStopped(take(3, 20, true), false, 2, 0)).toBe(false)
  })
})
