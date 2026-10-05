// Port of the SampleTrim cases of core/src/test/kotlin/dev/arc/ep133/features/TrimExportTest.kt.
// The upload and export cases (SampleUpload, PakExport) are ported by the stage-B worker.
import { describe, expect, it } from 'vitest'
import { cut, frames, peaks, shiftLoops } from '../../../src/core/features/sampleTrim'
import type { JsonObject } from '../../../src/core/protocol/fs'
import { s16 } from '../../helpers/bytes'

const obj = (json: string): JsonObject => JSON.parse(json) as JsonObject

describe('TrimExportTest (SampleTrim)', () => {
  it('cut takes whole frames and clamps the range', () => {
    const stereo = s16(1, -1, 2, -2, 3, -3, 4, -4)
    expect(cut(stereo, 2, 1, 3)).toEqual(s16(2, -2, 3, -3))
    expect(cut(stereo, 2, 2, 99)).toEqual(s16(3, -3, 4, -4))
    expect(cut(stereo, 2, 3, 1)).toEqual(new Uint8Array(0))
    expect(frames(stereo, 2)).toBe(4)
  })

  it('loop points move with the trim start and stay inside', () => {
    const s = obj('{"sound.playmode":"key","sound.loopstart":100,"sound.loopend":900}')
    expect(JSON.stringify(shiftLoops(s, 50, 400))).toBe('{"sound.playmode":"key","sound.loopstart":50,"sound.loopend":399}')
    expect(JSON.stringify(shiftLoops(s, 950, 1))).toBe('{"sound.playmode":"key","sound.loopstart":0,"sound.loopend":0}')
  })

  it('a loop trimmed away falls back to the whole sample', () => {
    const late = obj('{"sound.loopstart":40000,"sound.loopend":44099}')
    expect(JSON.stringify(shiftLoops(late, 0, 20000))).toBe('{"sound.loopstart":0,"sound.loopend":19999}')
    const early = obj('{"sound.loopstart":10,"sound.loopend":99}')
    expect(JSON.stringify(shiftLoops(early, 100, 900))).toBe('{"sound.loopstart":0,"sound.loopend":899}')
  })

  it('peaks follow the signal', () => {
    const pcm = s16(0, 0, 32767, -32768, 0, 0, 16384, 0)
    const p = peaks(pcm, 1, 2)
    expect(p[0]).toEqual({ min: -1, max: 1 })
    expect(p[1]!.min).toBe(0)
    expect(p[1]!.max).toBe(Math.fround(16384 / 32767))
    expect(peaks(new Uint8Array(0), 1, 3)).toEqual([
      { min: 0, max: 0 },
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ])
  })
})
