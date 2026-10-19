// Port of core/src/test/kotlin/dev/arc/ep133/formats/OggOpusTest.kt: a take as a voice
// message, Ogg Opus pages around the encoder's packets.

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRE_SKIP,
  oggCrc,
  oggOpusFile,
  oggPage,
  opusHead,
  packetSamples,
  preSkipOf,
  voicePcm,
} from '../../../src/core/formats/oggOpus'
import { hexBytes, toHex } from '../../../src/core/util/bytes'

// ffmpeg's (libopus) first page of a mono file: OpusHead with a pre-skip of 312, BOS.
const FFMPEG_HEAD_PAGE = '4f67675300020000000000000000e7d1e06b000000009c69c70a01134f707573486561640101380180bb0000000000'

const hex = (b: Uint8Array): string => toHex(b).replace(/ /g, '').toLowerCase()

function s16(...v: number[]): Uint8Array {
  const b = new Uint8Array(v.length * 2)
  const d = new DataView(b.buffer)
  v.forEach((x, i) => d.setInt16(i * 2, x, true))
  return b
}

interface Page {
  flags: number
  granule: number
  seq: number
  crc: number
  recomputed: number
  lacing: number[]
  body: Uint8Array
}

function pages(file: Uint8Array): Page[] {
  const out: Page[] = []
  let i = 0
  while (i < file.length) {
    const v = new DataView(file.buffer, file.byteOffset + i)
    expect(String.fromCharCode(...file.subarray(i, i + 4))).toBe('OggS')
    const n = file[i + 26]!
    const lacing = [...file.subarray(i + 27, i + 27 + n)]
    const len = 27 + n + lacing.reduce((a, b) => a + b, 0)
    const bytes = file.slice(i, i + len)
    new DataView(bytes.buffer).setUint32(22, 0, true)
    out.push({
      flags: file[i + 5]!,
      granule: Number(v.getBigInt64(6, true)),
      seq: v.getUint32(18, true),
      crc: v.getUint32(22, true),
      recomputed: oggCrc(bytes),
      lacing,
      body: bytes.subarray(27 + n),
    })
    i += len
  }
  return out
}

describe('OggOpus', () => {
  it("the head page is byte for byte libopus's, its CRC included", () => {
    const head = opusHead(1, 312, 48_000)
    expect(hex(head)).toBe('4f707573486561640101380180bb0000000000')
    expect(hex(oggPage([head], 0, 0x6be0d1e7, 0, 0x02))).toBe(FFMPEG_HEAD_PAGE)
  })

  it("a packet's samples come from its TOC byte", () => {
    expect(packetSamples(new Uint8Array([0xf8, 1]))).toBe(960)
    expect(packetSamples(new Uint8Array([0x18, 1]))).toBe(2880)
    expect(packetSamples(new Uint8Array([0x61, 1]))).toBe(960)
    expect(packetSamples(new Uint8Array([0x83, 4]))).toBe(480)
    expect(packetSamples(new Uint8Array(0))).toBe(0)
  })

  it("the pre-skip comes from an OpusHead in the encoder's config, else libopus's", () => {
    expect(preSkipOf(opusHead(1, 120, 48_000))).toBe(120)
    expect(preSkipOf(hexBytes('00 01 02 03'))).toBe(DEFAULT_PRE_SKIP)
    expect(preSkipOf(null)).toBe(DEFAULT_PRE_SKIP)
  })

  it("a file is head, tags, then pages of a second, the last cut to the audio's length", () => {
    const packet = new Uint8Array(301)
    packet[0] = 0xf8
    for (let k = 1; k < 301; k++) packet[k] = (k - 1) & 0xff
    const ps = pages(oggOpusFile(Array(120).fill(packet), 1, 312, 44_100, 114_000))
    expect(ps.length).toBe(5)
    expect(ps.map((p) => p.flags)).toEqual([0x02, 0, 0, 0, 0x04])
    expect(ps.map((p) => p.granule)).toEqual([0, 0, 48_000, 96_000, 114_312])
    expect(ps.map((p) => p.seq)).toEqual([0, 1, 2, 3, 4])
    expect(ps[2]!.lacing.slice(0, 2)).toEqual([255, 46])
    expect(ps[2]!.lacing.length).toBe(100)
    expect(String.fromCharCode(...ps[1]!.body.subarray(0, 8))).toBe('OpusTags')
    for (const p of ps) expect(p.recomputed).toBe(p.crc)
  })

  it('no packets still make a file that ends', () => {
    const ps = pages(oggOpusFile([], 1, 312, 48_000, 0))
    expect(ps.map((p) => p.flags)).toEqual([0x02, 0, 0x04])
    expect(ps.at(-1)!.granule).toBe(312)
  })

  it('a voice message is mono at 48 kHz', () => {
    expect([...voicePcm(s16(1000, 3000, -1000, -2001), 2, 48_000)]).toEqual([...s16(2000, -1501)])
    expect(voicePcm(s16(0, 100, 200, 300), 1, 24_000).length / 2).toBe(8)
    expect(voicePcm(new Uint8Array(0), 2, 44_100).length).toBe(0)
  })
})
