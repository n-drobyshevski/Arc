// Port of core/src/test/kotlin/dev/arc/ep133/formats/SilenceTest.kt

import { describe, expect, it } from 'vitest'
import { isSilent } from '../../../src/core/formats/wav'
import { FeatureText } from '../../../src/core/text/featureText'

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

  it('play note for the debug log', () => {
    expect(FeatureText.playNote('backup:x:3', 46875, 1, 0.5249, 'Bluetooth (Buds)')).toBe(
      'play backup:x:3: 46875 Hz, 1 ch, 0.52 s -> Bluetooth (Buds)',
    )
    expect(FeatureText.playNote('trim', 44100, 2, 2.0, 'phone speaker')).toBe('play trim: 44100 Hz, 2 ch, 2 s -> phone speaker')
  })
})
