// Port of core/src/test/kotlin/dev/arc/ep133/formats/FormatsTest.kt
//
// Edge cases of the format code. Expected values come from running
// reference/src/formats with Node 22.

import { describe, expect, it } from 'vitest'
import { decodeWav, encodeWav, resampleS16 } from '../../../src/core/formats/wav'
import { readTar, slotsUsedByProject } from '../../../src/core/formats/tar'
import { dosTime, readZip, writeZip } from '../../../src/core/formats/zip'
import { toHex } from '../../../src/core/util/bytes'
import { pad, tarFile } from '../../helpers/bytes'

const enc = new TextEncoder()

/** Unspaced lowercase hex to bytes. */
function h(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16)
  return out
}

/** Unspaced lowercase hex. */
const hex = (b: Uint8Array): string => toHex(b, '').toLowerCase()

describe('FormatsTest', () => {
  it('wav conversions match the JS', () => {
    const cases: Record<string, [string, string, number]> = {
      f32: ['524946464400000057415645666d7420100000000300010044ac000010b10200040020006461746120000000000000000000003f000000bf0000803f000080bf0000c03f0000803e80d6fcbd', '0000004001c0ff7f0180ff7f002033f0', 44100],
      f64: ['524946463c00000057415645666d742010000000030001000077010000b80b000800400064617461180000009a9999999999b93fcdccccccccccecbf0000000000000040', 'cd0cce8cff7f', 96000],
      i24: ['524946463400000057415645666d7420100000000100010080bb00008032020003001800646174610f000000000000ffff7f000080010203ffffff00', '0000ff7f018002030000', 48000],
      i32ext: ['524946464c00000057415645666d742028000000feff02001bb70000d8b8050008002000160020000000000001000000000000000000000000000000646174611000000000000000ffffff7f0000008015cd5b07', '0000ff7f01805c07', 46875],
    }
    for (const [name, c] of Object.entries(cases)) {
      const d = decodeWav(h(c[0]))
      expect(hex(d.pcm), name).toBe(c[1])
      expect(d.sampleRate, name).toBe(c[2])
      expect(d.embedded, name).toBeNull()
    }
    expect(decodeWav(h(cases.i32ext![0])).channels).toBe(2)
  })

  it('wav finds settings embedded in another chunk', () => {
    const w = h('524946466000000057415645666d74201000000001000100401f0000401f0000010008004c4953542d00000078787b22736f756e642e706c61796d6f6465223a226b6579222c22736f756e642e7069746368223a2d337d79790064617461050000000080ff40c800')
    const d = decodeWav(w)
    expect(hex(d.pcm)).toBe('01800000ff7e01c0ff47')
    expect(JSON.stringify(d.embedded)).toBe('{"sound.playmode":"key","sound.pitch":-3}')
  })

  it('wav errors', () => {
    expect(() => decodeWav(new Uint8Array(20))).toThrow(new Error('Not a WAV file'))
    const noData = h('524946460c00000057415645666d742010000000010001001bb700003f6e01000200100000')
    expect(() => decodeWav(noData.slice(0, 36))).toThrow(new Error('WAV file is missing audio data'))
    const alaw = encodeWav(new Uint8Array(8), 1, 8000)
    alaw[20] = 6
    alaw[34] = 8
    // 8-bit is converted whatever the format tag says (JS checks bits before format)
    expect(decodeWav(alaw).pcm.length).toBe(16)
    const f16 = encodeWav(new Uint8Array(8), 1, 8000)
    f16[20] = 3
    expect(() => decodeWav(f16)).toThrow(new Error('Unsupported WAV format (16-bit, type 3)'))
  })

  it('resample matches the JS', () => {
    const src = h('0000e80318fcff7f008005006400c8002c01f9ff')
    expect(hex(resampleS16(src, 1, 48000, 46875))).toBe('0000e80318fcff7f008005006400c8002c01f9ff')
    expect(hex(resampleS16(src, 2, 22050, 46875))).toBe(
      '0000e80370fe8b35e0fc2e6746e36766a3b13633008005005bb35300b6e6a1008c009f00dc004c002c01f9ff',
    )
    expect(hex(resampleS16(src, 1, 96000, 46875))).toBe('0000121d03c0af00f9ff')
  })

  it('tar slots follow the JS regex exactly', () => {
    const t = tarFile([
      ['./pads/a/p01', pad(5)], ['pads/b/p12', pad(1000)], ['x/pads/c/p3', pad(300)], ['pads/p04', pad(7)],
      ['pads/a/p05x', pad(8)], ['PADS/a/p06', pad(9)], ['pads/a/p07', new Uint8Array([0, 1])], ['pads/d/p02', pad(0)],
      ['pads/a\u0085b/p09', pad(44)],
    ])
    expect(slotsUsedByProject(t)).toEqual([5, 44, 300])
    expect([...readTar(t).keys()]).toEqual([
      'pads/a/p01', 'pads/b/p12', 'x/pads/c/p3', 'pads/p04', 'pads/a/p05x', 'PADS/a/p06', 'pads/a/p07', 'pads/d/p02', 'pads/aÂ\u0085b/p09',
    ])
  })

  it('tar with a negative size stops instead of looping', () => {
    const t = tarFile([['pads/a/p01', pad(5)], ['pads/a/p02', pad(6)]])
    // Second header's size field becomes "-1000" (octal), which would move backwards.
    t.set(enc.encode('-1000\u0000\u0000\u0000\u0000\u0000\u0000'), 1024 + 124)
    expect(slotsUsedByProject(t)).toEqual([5])
  })

  it('zip writer uses the pak layout', async () => {
    const big = new Uint8Array(5000).fill(7)
    const zip = await writeZip(
      [{ path: '/meta.json', data: enc.encode('{}') }, { path: '/projects/P01.tar', data: big }],
      { date: 1_791_119_124_116, offsetMin: 0 },
    )
    // Local header 1: signature, version 20, flags 0x0800, method 0 (stored, too small), DOS time 0x68AC, date 0x5D44
    expect(hex(zip.subarray(0, 14))).toBe('504b0304' + '1400' + '0008' + '0000' + 'ac68' + '445d')
    const files = await readZip(zip)
    expect(files.get('projects/P01.tar')).toEqual(big)
    // The second entry is deflated (method 8).
    const second = 30 + '/meta.json'.length + 2
    expect(zip[second + 8]).toBe(8)
  })

  it('zip reader accepts zips from other tools', async () => {
    // java.util.zip.ZipOutputStream output (JDK), generated with the same calls as the Kotlin test:
    // a "sounds/" directory entry, "sounds/001 kick.wav" (3000 bytes of i % 13, 8-byte extra field
    // of 1s), "/meta.json" ({"a":1}) and the archive comment "comment". It writes data
    // descriptors (flag 0x08) and different local headers.
    const zip = h(
      '504b0304140008080800e852455d00000000000000000000000007000000736f756e64732f0300504b0708000000000200000000000000' +
        '504b0304140008080800e852455d00000000000000000000000013000800736f756e64732f303031206b69636b2e7761760101010101010101' +
        'edc7370100300c00a0744fff7a6ba3077c44caa5b63ee6dae7868888888888fc9807504b0708ba2d316422000000b80b0000' +
        '504b0304140008080800e852455d0000000000000000000000000a0000002f6d6574612e6a736f6eab564a54b232ac0500504b0708afac1b560900000007000000' +
        '504b01021400140008080800e852455d000000000200000000000000070000000000000000000000000000000000736f756e64732f' +
        '504b01021400140008080800e852455dba2d316422000000b80b0000130008000000000000000000000037000000736f756e64732f303031206b69636b2e7761760101010101010101' +
        '504b01021400140008080800e852455dafac1b5609000000070000000a00000000000000000000000000a20000002f6d6574612e6a736f6e' +
        '504b05060000000003000300b6000000e30000000700636f6d6d656e74',
    )
    const files = await readZip(zip)
    expect([...files.keys()]).toEqual(['sounds/001 kick.wav', 'meta.json'])
    expect(files.get('sounds/001 kick.wav')).toEqual(Uint8Array.from({ length: 3000 }, (_, i) => i % 13))
    await expect(readZip(new Uint8Array(100))).rejects.toThrow(new Error('Not a .pak / zip file'))
  })

  it('dos time uses local time', () => {
    expect(dosTime(1_791_119_124_116, 0)).toEqual({ time: 0x68ac, date: 0x5d44 })
    expect(dosTime(1_791_119_124_116, 120)).toEqual({ time: 0x68ac + (2 << 11), date: 0x5d44 })
  })
})
