// Port of core/src/test/kotlin/dev/arc/ep133/protocol/ProtocolTest.kt (itself a port of reference/test/protocol.test.js)
import { describe, expect, it } from 'vitest'
import { crc32 } from '../../../src/core/formats/crc32'
import { decodeWav, encodeWav, resampleS16 } from '../../../src/core/formats/wav'
import { readZip, writeZip } from '../../../src/core/formats/zip'
import { decodeFrame, encodeRequest, parseGreet, parseIdentity } from '../../../src/core/protocol/frame'
import { parseListPage } from '../../../src/core/protocol/fs'
import { pack7, unpack7 } from '../../../src/core/protocol/packed7'
import { bytes } from '../../../src/core/util/bytes'
import { hex, s16 } from '../../helpers/bytes'


/** Seeded byte source (the Kotlin uses kotlin.random.Random(seed); any arbitrary bytes do). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) & 0xff
  }
}

describe('ProtocolTest', () => {
  it('pack7 round-trips arbitrary bytes', () => {
    const rnd = rng(133)
    for (const len of [0, 1, 6, 7, 8, 13, 14, 15, 433, 1000]) {
      const data = Uint8Array.from({ length: len }, () => rnd())
      const packed = pack7(data)
      expect(packed.every((b) => b < 0x80), 'packed bytes are 7-bit').toBe(true)
      expect([...unpack7(packed)]).toEqual([...data])
    }
  })

  it('encodes the same frames the official Sample Tool sends', () => {
    // Captured by wmealing/KO2-SYSEX: GREET with request id 0x0B94 and FILE INIT with 0x0B95.
    expect(encodeRequest(0x33, (0x17 << 7) | 0x14, 1)).toEqual(hex('F0 00 20 76 33 40 77 14 01 F7'))
    expect(encodeRequest(0x33, (0x17 << 7) | 0x15, 5, Uint8Array.of(1, 1, 0x00, 0x40, 0x00, 0x00))).toEqual(
      hex('F0 00 20 76 33 40 77 15 05 00 01 01 00 40 00 00 F7'),
    )
    expect(encodeRequest(0x33, (0x17 << 7) | 0x18, 5, Uint8Array.of(4, 0, 1, 0, 0))).toEqual(
      hex('F0 00 20 76 33 40 77 18 05 00 04 00 01 00 00 F7'),
    )
  })

  it('decodes a real GREET reply', () => {
    const raw = hex(
      'F0 00 20 76 33 40 37 14 01 00 00 70 72 6F 64 75 63 74 00 3A 45 50 2D 31 33 33 00 3B 6D 6F 64 65 3A 6E 00 6F 72 6D 61 6C 3B 73 00 6B 75 3A 54 45 30 33 00 32 41 53 30 30 31 3B 00 6F 73 5F 76 65 72 73 00 69 6F 6E 3A 31 2E 31 00 2E 32 3B 73 77 5F 76 00 65 72 73 69 6F 6E 3A 00 31 2E 31 2E 32 3B 62 00 6C 5F 76 65 72 73 69 00 6F 6E 3A 31 30 30 30 00 2E 30 2E 31 30 3B 73 00 65 72 69 61 6C 3A 45 00 33 50 54 56 32 4A 54 F7',
    )
    const f = decodeFrame(raw)!
    expect(f).not.toBeNull()
    expect(f.isRequest).toBe(false)
    expect(f.requestId).toBe((0x17 << 7) | 0x14)
    expect(f.status).toBe(0)
    const g = parseGreet(new TextDecoder().decode(f.payload))
    expect(g.product).toBe('EP-133')
    expect(g.sku).toBe('TE032AS001')
    expect(g.os_version).toBe('1.1.2')
    expect(g.serial).toBe('E3PTV2JT')
  })

  it('decodes a real identity reply', () => {
    const id = parseIdentity(hex('F0 7E 33 06 02 00 20 76 20 00 01 00 00 00 00 00 F7'))
    expect(id).toEqual({ deviceId: 0x33, sku: 'TE032AS001' })
  })

  it('decodes a real root LIST reply into sounds and projects', () => {
    const raw = hex(
      'F0 00 20 76 33 40 37 16 05 00 08 00 00 03 68 0E 00 00 00 00 00 73 6F 75 6E 64 08 73 00 07 50 0E 00 00 00 00 00 70 72 6F 6A 65 00 63 74 73 00 F7',
    )
    const f = decodeFrame(raw)!
    const entries = parseListPage(f.payload)
    expect(entries.map((e) => [e.node, e.name, e.isDir])).toEqual([
      [1000, 'sounds', true],
      [2000, 'projects', true],
    ])
  })

  it('crc32 matches the standard check value', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
  })

  it('wav encode decode and resample', () => {
    const pcm = s16(0, 1000, -1000, 32767, -32768, 5)
    const wav = encodeWav(pcm, 2, 46875)
    const back = decodeWav(wav)
    expect(back.channels).toBe(2)
    expect(back.sampleRate).toBe(46875)
    expect([...back.pcm]).toEqual([...pcm])
    const up = resampleS16(new Uint8Array(4800 * 2), 1, 48000, 46875)
    expect(up.length / 2).toBe(4688)
  })

  it('zip round-trip with stored and deflated entries', async () => {
    const big = new Uint8Array(5000).fill(7)
    const rnd = rng(7)
    const rand = Uint8Array.from({ length: 3000 }, () => rnd())
    const zip = await writeZip(
      [
        { path: '/meta.json', data: bytes('{"a":1}') },
        { path: '/sounds/001 kick.wav', data: rand },
        { path: '/projects/P01.tar', data: big },
      ],
      { date: 1_791_119_124_116 },
    )
    const files = await readZip(zip)
    expect([...files.keys()]).toEqual(['meta.json', 'sounds/001 kick.wav', 'projects/P01.tar'])
    expect([...files.get('sounds/001 kick.wav')!]).toEqual([...rand])
    expect([...files.get('projects/P01.tar')!]).toEqual([...big])
  })
})
