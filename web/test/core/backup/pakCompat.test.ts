// Port of core/src/test/kotlin/dev/arc/ep133/backup/PakCompatTest.kt
//
// Compatibility with the web version's .pak files.
//
// reference/test/fixtures/sample.pak was written by the JS backup of the
// simulated demo device (test/make-fixture.mjs). The expected values below
// were read from it with the JS reference under Node.
import { describe, expect, it } from 'vitest'
import { backupDevice, prepareSound, restorePak } from '../../../src/core/backup/backup'
import { describePak, openPak, type PakDescription } from '../../../src/core/backup/pak'
import { crc32 } from '../../../src/core/formats/crc32'
import { readZip } from '../../../src/core/formats/zip'
import { Session } from '../../../src/core/protocol/session'
import { demoSounds, device } from '../../helpers/demoData'
import { referenceAppVersion, samplePak } from '../../helpers/fixtures'
import { MockEP133 } from '../../helpers/mockDevice'

/** generated_at of the fixture, 2026-10-04T13:05:24.116Z. */
const fixtureTime = 1_791_119_124_116

const expectedDescription: PakDescription = {
  soundCount: 12,
  projectCount: 3,
  projects: [1, 2, 5],
  slots: [1, 2, 3, 4, 5, 6, 7, 8, 108, 109, 110, 111],
  soundNames: {
    1: 'kick', 2: 'snare', 3: 'hat closed', 4: 'hat open', 5: 'clap', 6: 'rim', 7: 'tom low',
    8: 'perc', 108: 'bass c1', 109: 'vox chop', 110: 'stab', 111: 'riser',
  },
  projectSlots: { 1: [1, 2, 3, 4, 5], 2: [4, 5, 6, 7, 8], 5: [7, 8, 108, 109, 110] },
  device: { product: 'EP-133', sku: 'TE032AS001', osVersion: '2.0.5' },
  generatedAt: fixtureTime,
}

/** (slot, wav size, crc32 of the wav) for every sound in the fixture. */
const expectedWavs: [number, number, number][] = [
  [1, 8044, 1210850052], [2, 11044, 892705292], [3, 14044, 1840889880],
  [4, 17044, 3413871838], [5, 20044, 916970730], [6, 23044, 2483237793],
  [7, 26044, 75479863], [8, 29044, 1502255551], [108, 32044, 1276560396],
  [109, 70044, 323993505], [110, 38044, 2298888661], [111, 41044, 3349279222],
]

interface CentralEntry {
  name: string
  madeBy: number
  needed: number
  flags: number
  method: number
  time: number
  date: number
  crc: number
  size: number
  extra: number
  comment: number
}

/** The central directory, checking each local header against it; also returns each entry's stored bytes. */
function centralDirectory(zip: Uint8Array): { entries: CentralEntry[]; stored: Map<string, Uint8Array> } {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = zip.length - 22
  expect(dv.getUint32(eocd, true)).toBe(0x06054b50)
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const out: CentralEntry[] = []
  const stored = new Map<string, Uint8Array>()
  for (let i = 0; i < count; i++) {
    const u16 = (o: number): number => dv.getUint16(p + o, true)
    const u32 = (o: number): number => dv.getUint32(p + o, true)
    const nl = u16(28)
    const e: CentralEntry = {
      name: new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nl)),
      madeBy: u16(4), needed: u16(6), flags: u16(8), method: u16(10), time: u16(12), date: u16(14),
      crc: u32(16), size: u32(24), extra: u16(30), comment: u16(32),
    }
    // The local header must agree with the central one.
    const l = u32(42)
    expect(dv.getUint32(l, true)).toBe(0x04034b50)
    expect(dv.getUint16(l + 6, true)).toBe(e.flags)
    expect(dv.getUint16(l + 28, true), 'no local extra field').toBe(0)
    const start = l + 30 + dv.getUint16(l + 26, true)
    stored.set(e.name, zip.subarray(start, start + u32(20)))
    out.push(e)
    p += 46 + nl + e.extra + e.comment
  }
  return { entries: out, stored }
}

describe('PakCompatTest', () => {
  it("opens the web version's sample pak", async () => {
    const pak = await openPak(samplePak())
    expect(describePak(pak)).toEqual(expectedDescription)
    expect([...pak.sounds.values()].map((it) => [it.slot, it.wav.length, crc32(it.wav)])).toEqual(expectedWavs)
    expect([...pak.projects].map(([n, t]) => [n, t.length, crc32(t)])).toEqual([
      [1, 7168, 2661716966],
      [2, 7168, 2921213206],
      [5, 7168, 401043680],
    ])
    expect(pak.meta.info).toBe('teenage engineering - pak file')
    expect(pak.sidecar.app).toBe('arc')
    // The fixture's audio is exactly the demo device's tone() output.
    const demo = new Map(demoSounds().map((s) => [s.slot, s]))
    for (const s of pak.sounds.values()) {
      const wav = prepareSound(s)
      expect(wav.pcm, `pcm of slot ${s.slot}`).toEqual(demo.get(s.slot)!.pcm)
    }
  })

  it('a Kotlin backup has the same layout and contents as the JS one', async () => {
    const dev = device()
    const s = new Session(dev.transport())
    await s.handshake()
    // The fixture names the web version that wrote it in meta.json; arc names its own
    // version (version.properties), so build ours with the web version's to compare.
    const webVersion = referenceAppVersion()
    const ours = (await backupDevice(s, { now: () => fixtureTime, offsetMin: 0, appVersion: webVersion })).bytes
    s.close()
    const theirs = samplePak()

    const a = centralDirectory(ours)
    const b = centralDirectory(theirs)
    expect(a.entries.map((it) => it.name), 'entry names and order').toEqual(b.entries.map((it) => it.name))
    // Everything except the compressed size and offset (deflate output may differ).
    expect(a.entries).toEqual(b.entries)
    // Entries stored without compression are byte-for-byte the same in the file.
    for (const e of b.entries) {
      if (e.method === 0) expect(a.stored.get(e.name), e.name).toEqual(b.stored.get(e.name))
    }

    // Uncompressed contents are identical, including meta.json and arc.json.
    const za = await readZip(ours)
    const zb = await readZip(theirs)
    for (const [name, data] of zb) expect(za.get(name), name).toEqual(data)
    const text = (z: Map<string, Uint8Array>, k: string): string => new TextDecoder().decode(z.get(k)!)
    expect(text(za, 'meta.json')).toBe(text(zb, 'meta.json'))
    expect(text(za, 'arc.json')).toBe(text(zb, 'arc.json'))
    expect(describePak(await openPak(ours))).toEqual(describePak(await openPak(theirs)))
  })

  it("the web version's sample pak restores into the simulator", { timeout: 30000 }, async () => {
    const pak = await openPak(samplePak())
    const dst = new MockEP133()
    const s = new Session(dst.transport())
    await s.handshake()
    const r = await restorePak(s, pak)
    expect(r).toEqual({ sounds: 12, projects: 3 })
    const demo = device()
    for (const [slot, snd] of demo.sounds) expect(dst.sounds.get(slot)?.pcm, `slot ${slot}`).toEqual(snd.pcm)
    for (const [n, tar] of demo.projects) expect(dst.projects.get(n), `project ${n}`).toEqual(tar)
    expect(dst.dropped).toBe(0)
    s.close()
  })
})
