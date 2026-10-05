// Port of core/src/test/kotlin/dev/arc/ep133/backup/E2eTest.kt
//
// Port of reference/test/e2e.test.js. Each JS assertion is kept, in order;
// lines marked "extra" are Kotlin additions. Real timers: the no-ack upload
// path waits out one 600 ms stall per large sound.
import { describe, expect, it } from 'vitest'
import { backupDevice, restorePak, RestoreError } from '../../../src/core/backup/backup'
import { describePak, openPak } from '../../../src/core/backup/pak'
import { crc32 } from '../../../src/core/formats/crc32'
import { listSounds } from '../../../src/core/protocol/device'
import { CancelledError } from '../../../src/core/protocol/errors'
import { Session } from '../../../src/core/protocol/session'
import { noise, pad, tarFile } from '../../helpers/bytes'
import { MockEP133 } from '../../helpers/mockDevice'

function sourceDevice(ackChunks = true): MockEP133 {
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
    ackChunks,
  })
}

async function connect(device: MockEP133): Promise<Session> {
  const s = new Session(device.transport())
  await s.handshake()
  return s
}

describe('E2eTest', () => {
  for (const ackChunks of [true, false]) {
    it(`backup then restore into an empty device (chunk acks: ${ackChunks})`, { timeout: 60000 }, async () => {
      const src = sourceDevice()
      const s1 = await connect(src)
      expect(s1.info!.product).toBe('EP-133')
      expect(s1.info!.osVersion).toBe('2.0.5') // extra
      expect(s1.info!.serial).toBe('MOCK0001') // extra
      const progress: number[] = []
      const result = await backupDevice(s1, { onProgress: (it) => progress.push(it.fraction) })
      const summary = result.summary
      expect(summary.soundCount).toBe(3)
      expect(summary.projects).toEqual([1, 4])
      expect(progress.at(-1) === 1 && progress.every((v, i) => i === 0 || v >= progress[i - 1]!)).toBe(true)
      expect(src.dropped, 'no command was sent while the device wanted a re-init').toBe(0)

      const pak = await openPak(result.bytes)
      const d = describePak(pak)
      expect(d.slots).toEqual([1, 2, 150])
      expect(d.projectSlots).toEqual({ 1: [1, 2], 4: [150] })

      const dst = new MockEP133({ ackChunks, projects: [{ n: 4, tar: noise(10) }] })
      const s2 = await connect(dst)
      await restorePak(s2, pak)
      expect(dst.dropped).toBe(0)
      for (const [slot, snd] of src.sounds) {
        const got = dst.sounds.get(slot)
        expect(got, `slot ${slot} restored`).toBeDefined()
        expect(got!.meta.crc).toBe(crc32(snd.pcm))
        expect(got!.meta.channels).toBe(snd.meta.channels)
      }
      expect(dst.sounds.get(1)!.meta['sound.playmode']).toBe('key')
      expect(dst.sounds.get(1)!.meta['sound.pitch']).toBe(-3)
      expect(dst.sounds.get(150)!.name).toBe('vox chop long name x')
      expect(dst.projects.get(1)).toEqual(src.projects.get(1))
      expect(dst.projects.get(4)).toEqual(src.projects.get(4))
      expect(dst.projectsMeta.active, 'active project restored afterwards').toBe(3000)
      // extra: each project upload switches away and back, then the original is restored.
      expect(dst.metaWrites.filter((it) => it[0] === 2000).map((it) => it[1])).toEqual([
        '{"active":6000}',
        '{"active":3000}',
        '{"active":3000}',
        '{"active":6000}',
        '{"active":3000}',
      ])
      s1.close()
      s2.close()
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
    expect(dst.projectsMeta.active).toBe(3000) // extra
    s.close()
  })

  it('refuses to restore when the device is too full', { timeout: 30000 }, async () => {
    const src = sourceDevice()
    const { bytes } = await backupDevice(await connect(src))
    const pak = await openPak(bytes)
    const dst = new MockEP133({ capacity: 50000, sounds: [{ slot: 9, name: 'big', pcm: noise(45000) }] })
    const s = await connect(dst)
    const e = await restorePak(s, pak).then(
      () => null,
      (err: unknown) => err,
    )
    expect(e).toBeInstanceOf(RestoreError)
    expect((e as Error).message).toContain('Not enough room')
    expect((e as Error).message).toBe(
      'Not enough room on the device: this restore needs 0.1 MB, 0.0 MB is available. Delete some samples on the device or restore fewer sounds.',
    ) // extra
    expect(dst.sounds.size, 'nothing was written').toBe(1)
    expect(dst.log.includes(2)).toBe(false) // extra: no PUT at all
    s.close()
  })

  it('cancelling stops between items', { timeout: 30000 }, async () => {
    const src = sourceDevice()
    const s = await connect(src)
    const cancel = new AbortController()
    await expect(
      backupDevice(s, {
        signal: cancel.signal,
        onProgress: (it) => {
          if (it.label.includes('snare')) cancel.abort()
        },
      }),
    ).rejects.toBeInstanceOf(CancelledError)
    // extra: the device was left in a usable state
    expect(src.dropped).toBe(0)
    expect((await listSounds(s)).length).toBe(3)
    s.close()
  })
})
