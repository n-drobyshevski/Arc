// Port of the sample upload and backup diff cases of
// core/src/test/kotlin/dev/arc/ep133/features/FeaturesTest.kt.
// The device browser cases are in features.pure.test.ts.
import { describe, expect, it } from 'vitest'
import { backupDevice, RestoreError } from '../../../src/core/backup/backup'
import { openPak, type Pak } from '../../../src/core/backup/pak'
import { compare, ProjectDiff, ProjectState, SoundState, type SoundDiff } from '../../../src/core/features/backupDiff'
import { nameFor, suggestSlots, upload, UploadError, UploadItem } from '../../../src/core/features/sampleUpload'
import { encodeWav } from '../../../src/core/formats/wav'
import { CancelledError, DeviceError } from '../../../src/core/protocol/errors'
import { Session } from '../../../src/core/protocol/session'
import { bytes } from '../../../src/core/util/bytes'
import { noise, pad, tarFile } from '../../helpers/bytes'
import { MockEP133 } from '../../helpers/mockDevice'

function device(): MockEP133 {
  return new MockEP133({
    sounds: [
      { slot: 1, name: 'kick', pcm: noise(20000), meta: { 'sound.playmode': 'key', 'sound.pitch': -3 } },
      { slot: 2, name: 'snare', pcm: noise(1000) },
      { slot: 150, name: 'vox', pcm: noise(9000), meta: { channels: 2 } },
    ],
    projects: [
      {
        n: 1,
        tar: tarFile([
          ['pads/a/p01', pad(1)],
          ['pads/a/p02', pad(2)],
        ]),
      },
      { n: 4, tar: tarFile([['pads/b/p05', pad(150)]]) },
    ],
  })
}

async function connect(dev: MockEP133): Promise<Session> {
  const s = new Session(dev.transport())
  await s.handshake()
  return s
}

/** A backup of [dev], opened (Kotlin `Paks.open(Backup.backupDevice(connect(src)).bytes)`). */
async function backupOf(dev: MockEP133): Promise<Pak> {
  return openPak((await backupDevice(await connect(dev))).bytes)
}

const bySlot = (sounds: readonly SoundDiff[]): Map<number, SoundDiff> => new Map(sounds.map((d) => [d.slot, d]))

/** Fix the RIFF size field (bytes 4..7) after inserting a chunk. */
function fixRiffSize(wav: Uint8Array): Uint8Array {
  const size = wav.length - 8
  wav[4] = size & 0xff
  wav[5] = (size >> 8) & 0xff
  wav[6] = (size >> 16) & 0xff
  wav[7] = (size >> 24) & 0xff
  return wav
}

describe('FeaturesTest (sample upload)', () => {
  it('slot suggestions and names', () => {
    expect(suggestSlots(new Set([1, 2, 150]), 3)).toEqual([3, 4, 5])
    expect(suggestSlots(new Set([1, 2]), 2, new Set([3]))).toEqual([4, 5])
    expect(suggestSlots(new Set(Array.from({ length: 999 }, (_, i) => i + 1)), 2)).toEqual([])
    expect(nameFor('808 Kick.WAV')).toBe('808 Kick')
    expect(nameFor('a long sample name that goes on.wav')).toBe('a long sample name t')
  })

  it('upload into free slots and over an existing one', async () => {
    const dev = device()
    const s = await connect(dev)
    const a = encodeWav(noise(4000), 1, 46875)
    const b = encodeWav(noise(3000), 2, 46875)
    const c = encodeWav(noise(500), 1, 46875)
    const r = await upload(s, [UploadItem(3, 'hat', a), UploadItem(4, 'pad', b), UploadItem(2, 'snare 2', c)])
    expect(r.sounds).toBe(3)
    expect(r.projects).toBe(0)
    expect(dev.sounds.get(3)!.pcm).toEqual(noise(4000))
    expect(dev.sounds.get(4)!.name).toBe('pad')
    expect(dev.sounds.get(4)!.meta.channels).toBe(2.0)
    expect(dev.sounds.get(2)!.name).toBe('snare 2')
    expect(dev.sounds.get(2)!.pcm).toEqual(noise(500))
    // No project was touched and the active project stayed.
    expect(dev.metaWrites.some(([node]) => node === 2000)).toBe(false)
    expect(dev.dropped).toBe(0)
    s.close()
  })

  it('upload resamples, keeps embedded settings and scales loops', async () => {
    const dev = new MockEP133()
    const s = await connect(dev)
    // A 48 kHz WAV with settings embedded in a LIST chunk, as the Sample Tool writes them.
    const json = new TextEncoder().encode('{"sound.playmode":"legato","sound.loopend":1000}')
    const base = encodeWav(noise(4800 * 2), 1, 48000)
    const chunk = bytes('LIST', json.length, 0, 0, 0, json)
    const wav = fixRiffSize(bytes(base.subarray(0, 36), chunk, base.subarray(36)))
    await upload(s, [UploadItem(9, 'loop', wav)])
    const m = dev.sounds.get(9)!.meta
    expect(m.samplerate).toBe(46875.0)
    expect(m['sound.playmode']).toBe('legato')
    expect(m['sound.loopend']).toBe(977.0)
    expect(dev.sounds.get(9)!.pcm.length).toBe(4688 * 2)
    s.close()
  })

  it('upload refuses bad input before writing anything', async () => {
    const dev = new MockEP133({ capacity: 5000 })
    const s = await connect(dev)
    const wav = encodeWav(noise(6000), 1, 46875)
    const dup = upload(s, [UploadItem(5, 'a', wav), UploadItem(5, 'b', wav)])
    await expect(dup).rejects.toBeInstanceOf(UploadError)
    await expect(dup).rejects.toThrow('Two files are set to slot 5. Give each file its own slot.')
    await expect(upload(s, [UploadItem(1000, 'a', wav)])).rejects.toBeInstanceOf(UploadError)
    // Kotlin: IllegalArgumentException from Wav.decode, a plain Error here.
    await expect(upload(s, [UploadItem(5, 'a', new Uint8Array(100))])).rejects.toThrow(new Error('Not a WAV file'))
    const e = await upload(s, [UploadItem(5, 'a', wav)]).then(
      () => null,
      (err: unknown) => err,
    )
    expect(e).toBeInstanceOf(RestoreError)
    expect((e as Error).message.startsWith('Not enough room on the device')).toBe(true)
    expect(dev.sounds.size).toBe(0)
    expect(dev.log.includes(2), 'no PUT was sent').toBe(false)
    s.close()
  })

  it('upload can be cancelled between files', async () => {
    const dev = new MockEP133()
    const s = await connect(dev)
    const cancel = new AbortController()
    const items = [1, 2, 3].map((n) => UploadItem(n, `s${n}`, encodeWav(noise(2000), 1, 46875)))
    await expect(
      upload(s, items, {
        onProgress: (p) => {
          if (p.label.startsWith('Sound 002')) cancel.abort()
        },
        signal: cancel.signal,
      }),
    ).rejects.toBeInstanceOf(CancelledError)
    // The file in progress finishes; nothing after it is written.
    expect([...dev.sounds.keys()].sort((x, y) => x - y)).toEqual([1, 2])
    s.close()
  })
})

// Not in the Kotlin test: Sequence.take(count) rejects a negative count.
describe('FeaturesTest (web parity)', () => {
  it('a negative slot count is an error, as in Kotlin', () => {
    expect(() => suggestSlots(new Set(), -1)).toThrow('Requested element count -1 is less than zero.')
    expect(suggestSlots(new Set(), 0)).toEqual([])
  })
})

describe('FeaturesTest (backup vs device)', () => {
  it('diff reports same, changed, missing and device-only items', async () => {
    const pak = await backupOf(device())

    const dst = device()
    dst.addSound({ slot: 2, name: 'snare', pcm: noise(1001) }) // different audio
    dst.sounds.get(1)!.meta['sound.pitch'] = 5 // same audio, other setting
    dst.sounds.delete(150) // missing
    dst.addSound({ slot: 42, name: 'extra', pcm: noise(10) }) // only on the device
    dst.projects.set(1, tarFile([['pads/a/p01', pad(9)]])) // different project
    dst.projects.delete(4)
    dst.projects.set(7, noise(10))
    const s = await connect(dst)
    const r = await compare(s, pak)

    const m = bySlot(r.sounds)
    expect(m.get(1)!.state).toBe(SoundState.SAME_AUDIO)
    expect(m.get(1)!.settingsDiffer).toEqual(['sound.pitch'])
    expect(!m.get(1)!.unchanged).toBe(true)
    expect(m.get(2)!.state).toBe(SoundState.DIFFERENT_AUDIO)
    expect(m.get(150)!.state).toBe(SoundState.NOT_ON_DEVICE)
    expect(r.deviceOnlySlots).toEqual([42])
    expect(r.projects).toEqual([ProjectDiff(1, ProjectState.DIFFERENT), ProjectDiff(4, ProjectState.NOT_ON_DEVICE)])
    expect(r.deviceOnlyProjects).toEqual([7])
    expect(r.changes).toBe(5)
    expect(!dst.log.includes(2) && dst.metaWrites.length === 0, 'nothing was written').toBe(true)
    expect(dst.dropped).toBe(0)
    s.close()
  })

  it('diff of a backup with its own device shows no changes', async () => {
    const src = device()
    const s = await connect(src)
    const pak = await openPak((await backupDevice(s)).bytes)
    const r = await compare(s, pak)
    expect(
      r.sounds.every((d) => d.unchanged),
      JSON.stringify(r.sounds),
    ).toBe(true)
    expect(r.projects.every((p) => p.state === ProjectState.SAME)).toBe(true)
    expect(r.changes).toBe(0)
    s.close()
  })

  it('diff only looks at the chosen slots and projects', async () => {
    const pak = await backupOf(device())
    const dst = device()
    const s = await connect(dst)
    const r = await compare(s, pak, { slots: [150], projects: [4] })
    expect(r.sounds.map((d) => d.slot)).toEqual([150])
    expect(r.projects.map((p) => p.project)).toEqual([4])
    // Only project 4 was downloaded.
    expect(dst.opens).toEqual([6000])
    s.close()
  })

  it('diff counts settings a restore would reset to defaults', async () => {
    const pak = await backupOf(device())
    const dst = device()
    dst.sounds.get(1)!.meta['sound.rootnote'] = 62 // backup has no rootnote: restore writes 60
    const s = await connect(dst)
    const r = bySlot((await compare(s, pak, { projects: [] })).sounds)
    expect(r.get(1)!.settingsDiffer).toEqual(['sound.rootnote'])
    s.close()
  })

  it('a failed project download is an error, not a missing project', async () => {
    const pak = await backupOf(device())
    const dst = device()
    const s = await connect(dst)
    dst.emptyPages = 2
    const e = await compare(s, pak, { slots: [], projects: [1] }).then(
      () => null,
      (err: unknown) => err,
    )
    expect(e).toBeInstanceOf(DeviceError)
    expect((e as Error).message.startsWith('Device stopped sending node 3000'), (e as Error).message).toBe(true)
    s.close()
  })

  it('without a crc the diff falls back to size', async () => {
    const pak = await backupOf(device())
    const dst = new MockEP133()
    dst.reportCrc = false
    dst.addSound({ slot: 1, name: 'kick', pcm: noise(20000), meta: { 'sound.playmode': 'key', 'sound.pitch': -3 } })
    dst.addSound({ slot: 2, name: 'snare', pcm: noise(999) })
    const s = await connect(dst)
    const r = bySlot((await compare(s, pak, { projects: [] })).sounds)
    expect(r.get(1)!.state).toBe(SoundState.UNVERIFIED)
    expect(r.get(2)!.state).toBe(SoundState.DIFFERENT_AUDIO)
    s.close()
  })
})
