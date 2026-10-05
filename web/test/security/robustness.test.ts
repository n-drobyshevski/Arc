// Security and robustness review: crafted inputs that used to hang, blow up
// memory or crash the UI. Each case failed before its fix.
import { describe, expect, it } from 'vitest'
import { MAX_UNZIPPED, TOO_BIG, readZip, writeZip } from '../../src/core/formats/zip'
import { openPak } from '../../src/core/backup/pak'
import { DAY_PATTERN, DATE_TIME_PATTERN, date } from '../../src/core/text/format'
import { parse } from '../../src/core/backup/libraryIndex'

const enc = new TextEncoder()

/** Central directory record offsets for a writeZip output with one entry. */
function layout(zip: Uint8Array): { dv: DataView; eocd: number; cen: number; cenLen: number } {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = zip.length - 22
  const cen = dv.getUint32(eocd + 16, true)
  const cenLen = dv.getUint32(eocd + 12, true)
  return { dv, eocd, cen, cenLen }
}

/**
 * [copies] central directory records (named a0.bin, a1.bin, ...) that all
 * point at the single local entry of [zip]: the overlapping-entry zip bomb.
 */
function overlapping(zip: Uint8Array, copies: number): Uint8Array {
  const { cen } = layout(zip)
  const fixed = zip.slice(cen, cen + 46)
  const records: Uint8Array[] = []
  for (let i = 0; i < copies; i++) {
    const name = enc.encode(`a${i}.bin`)
    const r = new Uint8Array(46 + name.length)
    r.set(fixed)
    new DataView(r.buffer).setUint16(28, name.length, true)
    r.set(name, 46)
    records.push(r)
  }
  const size = records.reduce((n, r) => n + r.length, 0)
  const out = new Uint8Array(cen + size + 22)
  out.set(zip.subarray(0, cen))
  let o = cen
  for (const r of records) {
    out.set(r, o)
    o += r.length
  }
  const end = new DataView(out.buffer, o, 22)
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, copies, true)
  end.setUint16(10, copies, true)
  end.setUint32(12, size, true)
  end.setUint32(16, cen, true)
  return out
}

describe('readZip: decompression limits', () => {
  it('refuses an entry that inflates past its declared size', async () => {
    const zip = await writeZip([{ path: '/sounds/001 a.wav', data: new Uint8Array(100_000) }], { date: 0, offsetMin: 0 })
    const { dv, cen } = layout(zip)
    expect(dv.getUint16(cen + 10, true)).toBe(8) // deflated
    dv.setUint32(cen + 24, 1000, true) // declare 1000 bytes; the data inflates to 100000
    await expect(readZip(zip)).rejects.toThrow(new Error('Damaged data in /sounds/001 a.wav'))
  })

  it('refuses many directory entries sharing one local entry before inflating them', async () => {
    // 8 MiB of zeros deflates to ~8 KiB; 70 entries pointing at it declare 560 MiB.
    const one = await writeZip([{ path: '/a.bin', data: new Uint8Array(8 * 1024 * 1024) }], { date: 0, offsetMin: 0 })
    const bomb = overlapping(one, Math.ceil(MAX_UNZIPPED / (8 * 1024 * 1024)) + 6)
    expect(bomb.length).toBeLessThan(64 * 1024)
    const t0 = performance.now()
    await expect(readZip(bomb)).rejects.toThrow(new Error(TOO_BIG))
    // Refused from the directory alone, not after inflating hundreds of MiB.
    expect(performance.now() - t0).toBeLessThan(2000)
  })

  it('counts stored (uncompressed) overlapping entries too', async () => {
    const one = await writeZip([{ path: '/a.bin', data: new Uint8Array(1024 * 1024), compress: false }], { date: 0, offsetMin: 0 })
    const bomb = overlapping(one, Math.ceil(MAX_UNZIPPED / (1024 * 1024)) + 1)
    await expect(readZip(bomb)).rejects.toThrow(new Error(TOO_BIG))
  })

  it('still reads a normal .pak', async () => {
    const zip = await writeZip(
      [
        { path: '/meta.json', data: enc.encode('{}') },
        { path: '/sounds/001 kick.wav', data: new Uint8Array(50_000).fill(7) },
      ],
      { date: 0, offsetMin: 0 },
    )
    const pak = await openPak(zip)
    expect(pak.sounds.get(1)?.wav.length).toBe(50_000)
  })
})

describe('dates out of the Date range', () => {
  it('a library.json createdAt beyond the Date range formats as empty instead of throwing', () => {
    // parse() clamps to the Long range (Kotlin toLong), which is far past
    // what Date can show; the backups list rendered it with Intl and the
    // RangeError took down the whole UI on every launch.
    const ix = parse(JSON.stringify({ backups: [{ id: 'x', file: 'x.pak', createdAt: 1e300 }] }))!
    const ms = ix.entries[0]!.createdAt
    expect(() => date(ms, DAY_PATTERN)).not.toThrow()
    expect(date(ms, DAY_PATTERN)).toBe('')
    expect(date(Number.NaN, DATE_TIME_PATTERN)).toBe('')
    expect(date(0, DAY_PATTERN, 'en-US', 'UTC')).toBe('Jan 1, 1970')
  })
})
