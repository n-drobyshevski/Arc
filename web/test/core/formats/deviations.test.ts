// Behaviour of core/src/main/kotlin/dev/arc/ep133/formats/{Wav,Zip,Tar}.kt that
// FormatsTest.kt does not pin: the agreed deviations from the reference JS,
// the error texts the UI shows, and the windows-1252 decoding of embedded settings.

import { describe, expect, it } from 'vitest'
import { decodeWav, decodeWindows1252, encodeWav } from '../../../src/core/formats/wav'
import { readTar } from '../../../src/core/formats/tar'
import { inflateRaw, readZip, writeZip } from '../../../src/core/formats/zip'
import { pad, tarFile } from '../../helpers/bytes'

const enc = new TextEncoder()

/** A WAV with extra [id, body] chunks between the fmt and data chunks. */
function wavWithChunks(...chunks: [string, Uint8Array][]): Uint8Array {
  const base = encodeWav(new Uint8Array(4), 1, 8000)
  const parts: Uint8Array[] = [base.subarray(0, 36)]
  for (const [id, body] of chunks) {
    const head = new Uint8Array(8)
    for (let i = 0; i < 4; i++) head[i] = id.charCodeAt(i)
    new DataView(head.buffer).setUint32(4, body.length, true)
    parts.push(head, body, new Uint8Array(body.length & 1))
  }
  parts.push(base.subarray(36))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  new DataView(out.buffer).setUint32(4, out.length - 8, true)
  return out
}

describe('Wav deviations', () => {
  it('a 0-channel header is rejected instead of looping', () => {
    const w = encodeWav(new Uint8Array(8), 0, 8000)
    expect(() => decodeWav(w)).toThrow(new Error('WAV file has no audio channels'))
  })

  it('0 bits per sample is reported as unsupported', () => {
    const w = encodeWav(new Uint8Array(8), 1, 8000)
    w[34] = 0
    expect(() => decodeWav(w)).toThrow(new Error('Unsupported WAV format (0-bit, type 1)'))
  })

  it('embedded settings are decoded as windows-1252 like TextDecoder("latin1") in a browser', () => {
    const high = Uint8Array.from({ length: 32 }, (_, i) => 0x80 + i)
    expect(decodeWindows1252(high)).toBe('€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ')
    expect(decodeWindows1252(Uint8Array.of(0x41, 0x7f, 0xa0, 0xe9, 0xff))).toBe('A\u007f éÿ')
    const json = Uint8Array.of(...enc.encode('{"sound.name":"'), 0x80, 0x99, 0xe9, ...enc.encode('"}'))
    expect(decodeWav(wavWithChunks(['LIST', json])).embedded).toEqual({ 'sound.name': '€™é' })
  })

  it('only the first chunk with sound or envelope keys is used', () => {
    const w = wavWithChunks(
      ['junk', enc.encode('{"other":1}')],
      ['odd1', enc.encode('x{"envelope.attack":5}')],
      ['LIST', enc.encode('{"sound.pitch":2}')],
    )
    expect(decodeWav(w).embedded).toEqual({ 'envelope.attack': 5 })
    expect(decodeWav(wavWithChunks(['LIST', enc.encode('{"other":1}')])).embedded).toBeNull()
  })
})

describe('Zip errors', () => {
  it('a damaged central directory and unknown methods use the Android texts', async () => {
    const zip = await writeZip([{ path: '/a.bin', data: new Uint8Array(10) }], { date: 0, offsetMin: 0 })
    const cenAt = 30 + '/a.bin'.length + 10
    const bad = zip.slice()
    bad[cenAt] = 0
    await expect(readZip(bad)).rejects.toThrow(new Error('Damaged zip directory'))
    const lzma = zip.slice()
    lzma[cenAt + 10] = 14
    await expect(readZip(lzma)).rejects.toThrow(new Error('Unsupported compression in /a.bin'))
  })

  it('damaged deflate data names the entry', async () => {
    await expect(inflateRaw(new Uint8Array(0), 'x')).rejects.toThrow(new Error('Damaged data in x'))
    await expect(inflateRaw(Uint8Array.of(0xff, 0xff), 'y')).rejects.toThrow(new Error('Damaged data in y'))
  })

  it('a repeated name keeps its first position and the last data', async () => {
    const zip = await writeZip(
      [
        { path: '/a', data: Uint8Array.of(1) },
        { path: '/b', data: Uint8Array.of(2) },
        { path: 'a', data: Uint8Array.of(3) },
      ],
      { date: 0, offsetMin: 0 },
    )
    const files = await readZip(zip)
    expect([...files.keys()]).toEqual(['a', 'b'])
    expect([...files.get('a')!]).toEqual([3])
  })
})

describe('Tar fields', () => {
  it('joins the ustar prefix, reads a NUL type as a file and skips other types', () => {
    const t = tarFile([
      ['p01', pad(5)],
      ['dir', new Uint8Array(0)],
      ['n', pad(6)],
    ])
    // Entry 1: prefix "x/pads/a". Entry 2: type '5' (directory). Entry 3: type NUL.
    t.set(enc.encode('x/pads/a'), 345)
    t[512 + 512 + 156] = 0x35
    t[512 + 512 + 512 + 156] = 0
    expect([...readTar(t).keys()]).toEqual(['x/pads/a/p01', 'n'])
  })
})
