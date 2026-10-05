// Port of core/src/test/kotlin/dev/arc/ep133/formats/SilenceTest.kt
//
// Skipped: `play note for the debug log` tests FeatureText.playNote
// (core/text/featureText.ts), which belongs to the text port, not formats.

import { describe, expect, it } from 'vitest'
import { isSilent } from '../../../src/core/formats/wav'

describe('SilenceTest', () => {
  it('silent only when every sample is zero', () => {
    expect(isSilent(new Uint8Array(0))).toBe(true)
    expect(isSilent(new Uint8Array(64))).toBe(true)
    // One sample of 1 (low byte), then one of -256 (high byte only).
    const low = new Uint8Array(64)
    low[10] = 1
    expect(isSilent(low)).toBe(false)
    const high = new Uint8Array(64)
    high[11] = 0xff
    expect(isSilent(high)).toBe(false)
    // A trailing odd byte is not a sample.
    const odd = new Uint8Array(5)
    odd[4] = 7
    expect(isSilent(odd)).toBe(true)
  })
})
