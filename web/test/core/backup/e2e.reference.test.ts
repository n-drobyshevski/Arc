// Port of reference/test/e2e.test.js (node:test + node:assert -> Vitest), test for test.
//
// The reference backupDevice returned { blob }; the port returns { bytes } (Backup.kt),
// so `new Uint8Array(await blob.arrayBuffer())` becomes `bytes`.
import { describe, expect, it } from 'vitest'
import { backupDevice, restorePak } from '../../../src/core/backup/backup'
import { describePak, openPak } from '../../../src/core/backup/pak'
import { crc32 } from '../../../src/core/formats/crc32'
import { Session } from '../../../src/core/protocol/session'
import { MockEP133, type MockOptions } from '../../helpers/mockDevice'

function tarFile(entries: [string, Uint8Array][]): Uint8Array {
  const blocks: Uint8Array[] = []
  for (const [name, data] of entries) {
    const h = new Uint8Array(512)
    h.set(new TextEncoder().encode(name), 0)
    h.set(new TextEncoder().encode(data.length.toString(8).padStart(11, '0')), 124)
    h[156] = 48
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const total = blocks.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const b of blocks) {
    out.set(b, o)
    o += b.length
  }
  return out
}

function pad(slot: number): Uint8Array {
  const r = new Uint8Array(26)
  r[1] = slot & 0xff
  r[2] = slot >> 8
  return r
}

function noise(n: number): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff)
}

function sourceDevice(opts: MockOptions = {}): MockEP133 {
  return new MockEP133({
    sounds: [
      { slot: 1, name: 'kick', pcm: noise(20000), meta: { 'sound.playmode': 'key', 'sound.pitch': -3 } },
      { slot: 2, name: 'snare', pcm: noise(1000) },
      { slot: 150, name: 'vox chop long name x', pcm: noise(90001 - 1), meta: { channels: 2, 'sound.loopend': 10 } },
    ],
    projects: [
      { n: 1, tar: tarFile([['pads/a/p01', pad(1)], ['pads/a/p02', pad(2)], ['settings', noise(222)]]) },
      { n: 4, tar: tarFile([['pads/b/p05', pad(150)]]) },
    ],
    ...opts,
  })
}

async function connect(device: MockEP133): Promise<Session> {
  const s = new Session(device.transport())
  await s.handshake()
  return s
}

describe('reference e2e.test.js', () => {
  for (const ackChunks of [true, false]) {
    it(`backup then restore into an empty device (chunk acks: ${ackChunks})`, { timeout: 60000 }, async () => {
      const src = sourceDevice()
      const s1 = await connect(src)
      expect(s1.info!.product).toBe('EP-133')
      const progress: number[] = []
      const { bytes, summary } = await backupDevice(s1, { onProgress: (p) => progress.push(p.fraction) })
      expect(summary.soundCount).toBe(3)
      expect(summary.projects).toEqual([1, 4])
      expect(progress.at(-1) === 1 && progress.every((v, i) => i === 0 || v >= progress[i - 1]!)).toBeTruthy()
      expect(src.dropped, 'no command was sent while the device wanted a re-init').toBe(0)

      const pak = await openPak(bytes)
      const d = describePak(pak)
      expect(d.slots).toEqual([1, 2, 150])
      expect(d.projectSlots).toEqual({ 1: [1, 2], 4: [150] })

      const dst = new MockEP133({ ackChunks, projects: [{ n: 4, tar: noise(10) }] })
      const s2 = await connect(dst)
      await restorePak(s2, pak)
      expect(dst.dropped).toBe(0)
      for (const [slot, snd] of src.sounds) {
        const got = dst.sounds.get(slot)
        expect(got, `slot ${slot} restored`).toBeTruthy()
        expect(got!.meta.crc).toBe(crc32(snd.pcm))
        expect(got!.meta.channels).toBe(snd.meta.channels)
      }
      expect(dst.sounds.get(1)!.meta['sound.playmode']).toBe('key')
      expect(dst.sounds.get(1)!.meta['sound.pitch']).toBe(-3)
      expect(dst.sounds.get(150)!.name).toBe('vox chop long name x')
      expect(dst.projects.get(1)).toEqual(src.projects.get(1))
      expect(dst.projects.get(4)).toEqual(src.projects.get(4))
      expect(dst.projectsMeta.active, 'active project restored afterwards').toBe(3000)
    })
  }

  it('restore a single project with only the sounds it uses', { timeout: 30000 }, async () => {
    const src = sourceDevice()
    const { bytes } = await backupDevice(await connect(src))
    const pak = await openPak(bytes)
    const dst = new MockEP133()
    const s = await connect(dst)
    const d = describePak(pak)
    await restorePak(s, pak, { projects: [4], slots: d.projectSlots[4] })
    expect([...dst.sounds.keys()]).toEqual([150])
    expect([...dst.projects.keys()]).toEqual([4])
  })

  it('refuses to restore when the device is too full', { timeout: 30000 }, async () => {
    const src = sourceDevice()
    const { bytes } = await backupDevice(await connect(src))
    const pak = await openPak(bytes)
    const dst = new MockEP133({ capacity: 50000, sounds: [{ slot: 9, name: 'big', pcm: noise(45000) }] })
    const s = await connect(dst)
    await expect(restorePak(s, pak)).rejects.toThrow(/Not enough room/)
    expect(dst.sounds.size, 'nothing was written').toBe(1)
  })

  it('cancelling stops between items', { timeout: 30000 }, async () => {
    const src = sourceDevice()
    const s = await connect(src)
    const ac = new AbortController()
    const p = backupDevice(s, {
      signal: ac.signal,
      onProgress: (x) => {
        if (x.label.includes('snare')) ac.abort()
      },
    })
    await expect(p).rejects.toMatchObject({ name: 'CancelledError' })
  })
})
