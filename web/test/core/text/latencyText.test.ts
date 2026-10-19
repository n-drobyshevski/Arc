// Port of core/src/test/kotlin/dev/arc/ep133/text/LatencyTextTest.kt
import { describe, expect, it } from 'vitest'
import { LatencyText, LIVE_ENGINES, WEB_LATENCY_HINTS, WebLatencyHint } from '../../../src/core/text/latencyText'

describe('LatencyTextTest', () => {
  it('choices', () => {
    expect(LIVE_ENGINES.map((it) => LatencyText.engine(it))).toEqual(['Auto', 'AudioTrack', 'AudioTrack, old'])
    expect(WEB_LATENCY_HINTS.map((it) => LatencyText.hint(it))).toEqual(['latencyHint 0', "latencyHint 'interactive'"])
    expect(LatencyText.HOW_TO).toBe('Pick an engine, tap one pad 20 times in Live, then compare.')
  })

  it('engine rows', () => {
    expect([
      LatencyText.nativeMode(false, false, false),
      LatencyText.nativeMode(true, true, true),
      LatencyText.nativeMode(true, false, true),
      LatencyText.nativeMode(true, false, false),
    ]).toEqual(['OpenSL ES', 'AAudio exclusive (MMAP)', 'AAudio shared (MMAP)', 'AAudio shared'])
    expect(LatencyText.nativeEngine('AAudio exclusive (MMAP)', 96)).toBe('AAudio exclusive (MMAP), 96-frame bursts')
    expect(LatencyText.nativeEngine('AAudio shared', 240, false)).toBe('AAudio shared, 240-frame bursts, normal path')
    expect(LatencyText.trackEngine(true, 192)).toBe('AudioTrack low-latency path, 192-frame bursts')
    expect(LatencyText.trackEngine(false, 960)).toBe('AudioTrack normal path, 960-frame bursts')
    expect(LatencyText.trackEngine(true, 192, true)).toBe('AudioTrack, old, low-latency path, 192-frame bursts')
    expect(LatencyText.webEngine(WebLatencyHint.ZERO, 48000)).toBe('latencyHint 0, 48000 Hz')
    expect(LatencyText.webEngine(WebLatencyHint.INTERACTIVE, 44100)).toBe("latencyHint 'interactive', 44100 Hz")
  })

  it('numbers and estimates', () => {
    expect(LatencyText.stats(30.5, 24.2, 47.6, 20)).toBe('median 31 ms · best 24 · worst 48 · 20 presses')
    expect(LatencyText.stats(9.0, 9.0, 9.0, 1)).toBe('median 9 ms · best 9 · worst 9 · 1 press')
    expect(LatencyText.statsDescription(30.5, 24.2, 47.6, 2)).toBe(
      'Median 31 milliseconds, best 24, worst 48, over 2 presses',
    )
    expect(LatencyText.estimate(192, 96, 48000)).toBe(
      'Estimate: 192 frames ÷ 48000 Hz = 4.0 ms buffer, 96-frame bursts (2.0 ms)',
    )
    expect(LatencyText.webEstimate(5.3, 21.0)).toBe('Estimate: base 5.3 ms + output 21.0 ms = 26.3 ms')
    expect(LatencyText.webEstimate(5.3, null)).toBe('Estimate: base 5.3 ms (output delay not reported)')
  })
})
