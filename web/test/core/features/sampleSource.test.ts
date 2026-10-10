// Port of core/src/test/kotlin/dev/arc/ep133/features/SampleSourceTest.kt
//
// Web delta: SampleName.of takes the zone as minutes east of UTC.
import { describe, expect, it } from 'vitest'
import { cleanSoundName, MAX_SOUND_NAME } from '../../../src/core/protocol/device'
import {
  barFrames,
  SAMPLE_SOURCES,
  SampleInput,
  SampleLimits,
  SampleName,
  SampleSource,
} from '../../../src/core/features/sampleSource'

const mic: SampleInput = { source: SampleSource.MIC, stereo: false }
const micSt: SampleInput = { source: SampleSource.MIC, stereo: true }
const rsp: SampleInput = { source: SampleSource.RSP, stereo: false }
const rspSt: SampleInput = { source: SampleSource.RSP, stereo: true }
const usb: SampleInput = { source: SampleSource.USB, stereo: false }
const usbSt: SampleInput = { source: SampleSource.USB, stereo: true }

describe('SampleSourceTest', () => {
  it("sources by their words, in the device's order", () => {
    expect(SampleInput.ORDER).toEqual([mic, micSt, rsp, rspSt, usb, usbSt])
    expect(SampleSource.RSP).toBe('rsp')
    expect(SampleSource.of('usb')).toBe(SampleSource.USB)
    expect(SampleSource.of('line')).toBeNull()
  })

  it('minus and plus wrap round both ways', () => {
    const all = SampleInput.ORDER
    expect(SampleInput.cycle(all, mic, 1)).toEqual(micSt)
    expect(SampleInput.cycle(all, mic, -1)).toEqual(usbSt)
    expect(SampleInput.cycle(all, usbSt, 1)).toEqual(mic)
    expect(SampleInput.cycle(all, mic, 2)).toEqual(rsp)
    expect(SampleInput.cycle(all, mic, 6)).toEqual(mic) // once round
    expect(SampleInput.cycle(all, rspSt, 0)).toEqual(rspSt)
  })

  it("inputs that aren't there are skipped", () => {
    // No USB plugged in, and a phone with one mic.
    const some = [mic, rsp, rspSt]
    expect(SampleInput.cycle(some, mic, 1)).toEqual(rsp)
    expect(SampleInput.cycle(some, mic, -1)).toEqual(rspSt)
    expect(SampleInput.cycle(some, rspSt, 1)).toEqual(mic)
    expect(SampleInput.cycle(some, mic, 2)).toEqual(rspSt)
    // USB went away while picked: the next press lands on the next one there.
    expect(SampleInput.cycle(some, usb, 1)).toEqual(mic)
    expect(SampleInput.cycle(some, usb, -1)).toEqual(rspSt)
    expect(SampleInput.cycle(some, usbSt, 0)).toEqual(mic)
    // Nothing offered: it stays.
    expect(SampleInput.cycle([], usb, 1)).toEqual(usb)
  })

  it('limits per channel count', () => {
    expect(SampleLimits.maxSeconds(true)).toBe(20)
    expect(SampleLimits.maxSeconds(false)).toBe(40)
    expect(SampleLimits.maxFrames(true, 48_000)).toBe(960_000)
    expect(SampleLimits.maxFrames(false, 48_000)).toBe(1_920_000)
    // 48 kHz goes onto the device at 46875 Hz; 44.1 kHz stays as it is.
    expect(SampleLimits.deviceBytes(960_000, 48_000, 2)).toBe(3_750_000)
    expect(SampleLimits.deviceBytes(1_920_000, 48_000, 1)).toBe(3_750_000)
    expect(SampleLimits.deviceBytes(44_100, 44_100, 1)).toBe(88_200)
  })

  it("low space is a full take that won't fit", () => {
    // 20 s stereo and 40 s mono are both 3 750 000 bytes on the device.
    expect(SampleLimits.lowSpace(3_750_000, true)).toBe(false)
    expect(SampleLimits.lowSpace(3_749_999, true)).toBe(true)
    expect(SampleLimits.lowSpace(3_750_000, false)).toBe(false)
    expect(SampleLimits.lowSpace(3_749_999, false)).toBe(true)
    expect(SampleLimits.lowSpace(0, true)).toBe(true)
    expect(SampleLimits.lowSpace(null, true)).toBe(false) // not known yet
  })

  it('the frames that fit in the space left', () => {
    expect(SampleLimits.framesThatFit(3_750_000, 2, 48_000)).toBe(960_000)
    expect(SampleLimits.framesThatFit(1_000, 1, 44_100)).toBe(500)
    // 250 frames on the device are 256 at 48 kHz, rounded down.
    expect(SampleLimits.framesThatFit(1_001, 2, 48_000)).toBe(256)
    expect(SampleLimits.framesThatFit(-5, 1, 48_000)).toBe(0)
    expect(SampleLimits.framesThatFit(null, 2, 48_000)).toBeNull()
  })

  it("a recording's name says where and when, in 20 characters", () => {
    const at = 1_791_382_981_000 // 2026-10-07 14:23:01 UTC
    expect(SampleName.of(SampleSource.MIC, at, 0)).toBe('mic 1007-142301')
    expect(SampleName.of(SampleSource.RSP, at, -5 * 60)).toBe('rsp 1007-092301')
    expect(SampleName.of(SampleSource.USB, at, 10 * 60)).toBe('usb 1008-002301')
    for (const s of SAMPLE_SOURCES) expect(SampleName.of(s, at, 0).length).toBeLessThanOrEqual(MAX_SOUND_NAME)
    // As an upload cleans it: unchanged.
    expect(cleanSoundName(SampleName.of(SampleSource.MIC, at, 0))).toBe('mic 1007-142301')
  })

  it('bars as frames, rounded half up', () => {
    expect(barFrames(1, 120.0, 48_000)).toBe(96_000)
    expect(barFrames(2, 90.0, 48_000)).toBe(256_000)
    // 11 520 000 / 133.3 = 86 421.6
    expect(barFrames(1, 133.3, 48_000)).toBe(86_422)
    expect(barFrames(1, 133.3, 44_100)).toBe(79_400)
    expect(barFrames(16, 120.0, 48_000)).toBe(1_536_000)
  })
})
