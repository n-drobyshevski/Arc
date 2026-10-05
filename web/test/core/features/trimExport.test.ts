// Port of the trimmed upload and export cases of
// core/src/test/kotlin/dev/arc/ep133/features/TrimExportTest.kt.
// The SampleTrim cases are in trimExport.pure.test.ts.
//
// Web delta: trims are half-open {start, end}; Kotlin's `a until b` is {start: a, end: b}.
import { describe, expect, it } from 'vitest'
import { restorePak } from '../../../src/core/backup/backup'
import { describePak, openPak, PakError } from '../../../src/core/backup/pak'
import { project, projectFileName, soundFileName, soundWav } from '../../../src/core/backup/pakExport'
import { upload, UploadError, UploadItem } from '../../../src/core/features/sampleUpload'
import { encodeWav } from '../../../src/core/formats/wav'
import { readZip } from '../../../src/core/formats/zip'
import { Session } from '../../../src/core/protocol/session'
import { bytes } from '../../../src/core/util/bytes'
import { noise } from '../../helpers/bytes'
import { DemoData } from '../../helpers/demoData'
import { samplePak } from '../../helpers/fixtures'
import { MockEP133 } from '../../helpers/mockDevice'

async function connect(dev: MockEP133): Promise<Session> {
  const s = new Session(dev.transport())
  await s.handshake()
  return s
}

describe('TrimExportTest (trimmed upload)', () => {
  it('a trimmed upload writes only the selection, with loops moved', async () => {
    const dev = new MockEP133()
    const s = await connect(dev)
    // 46875 Hz mono, loop points embedded in a LIST chunk.
    const json = new TextEncoder().encode('{"sound.loopstart":1000,"sound.loopend":3000}')
    const base = encodeWav(noise(4000 * 2), 1, 46875)
    // RIFF chunks are padded to an even length.
    const chunk = bytes('LIST', json.length, 0, 0, 0, json, new Uint8Array(json.length & 1))
    const wav = bytes(base.subarray(0, 36), chunk, base.subarray(36))
    const size = wav.length - 8
    wav[4] = size & 0xff
    wav[5] = (size >> 8) & 0xff
    wav[6] = (size >> 16) & 0xff
    wav[7] = (size >> 24) & 0xff

    await upload(s, [UploadItem(5, 'part', wav, { start: 500, end: 2500 })])
    const snd = dev.sounds.get(5)!
    expect(snd.pcm).toEqual(noise(4000 * 2).slice(1000, 5000))
    expect(snd.meta['sound.loopstart']).toBe(500.0)
    expect(snd.meta['sound.loopend']).toBe(1999.0)
    await expect(upload(s, [UploadItem(6, 'none', wav, { start: 4000, end: 4000 })])).rejects.toBeInstanceOf(UploadError)
    s.close()
  })

  it('a trimmed 48 kHz upload is cut first, then resampled', async () => {
    const dev = new MockEP133()
    const s = await connect(dev)
    const wav = encodeWav(noise(9600 * 2), 1, 48000)
    await upload(s, [UploadItem(1, 'half', wav, { start: 0, end: 4800 })])
    expect(dev.sounds.get(1)!.pcm.length).toBe(4688 * 2)
    expect(dev.sounds.get(1)!.meta.samplerate).toBe(46875.0)
    s.close()
  })
})

describe('TrimExportTest (export)', () => {
  it('a sound exports as the exact WAV in the backup', async () => {
    const pak = await openPak(samplePak())
    expect(soundWav(pak, 109)).toEqual(pak.sounds.get(109)!.wav)
    expect(soundFileName(pak.sounds.get(109)!)).toBe('109 vox chop.wav')
    expect(() => soundWav(pak, 500)).toThrow(PakError)
  })

  it('a project exports with only the sounds it uses', async () => {
    const pak = await openPak(samplePak())
    const exported = await project(pak, 5, 1_791_119_124_116, 0)
    const out = await openPak(exported)
    const d = describePak(out)
    expect(d.projects).toEqual([5])
    expect(d.slots).toEqual([7, 8, 108, 109, 110])
    expect(d.projectSlots).toEqual({ 5: [7, 8, 108, 109, 110] })
    for (const slot of d.slots) expect(out.sounds.get(slot)!.wav, `slot ${slot}`).toEqual(pak.sounds.get(slot)!.wav)
    expect(out.projects.get(5)).toEqual(pak.projects.get(5))
    expect(d.device).toEqual(describePak(pak).device)
    const names = describePak(pak).soundNames
    expect(d.soundNames).toEqual(Object.fromEntries(d.slots.map((s) => [s, names[s]])))
    // Same file layout as a backup, in order.
    const files = await readZip(exported)
    expect([...files.keys()]).toEqual([
      'meta.json',
      'arc.json',
      'sounds/007 tom low.wav',
      'sounds/008 perc.wav',
      'sounds/108 bass c1.wav',
      'sounds/109 vox chop.wav',
      'sounds/110 stab.wav',
      'projects/P05.tar',
    ])
    expect(new TextDecoder().decode(files.get('meta.json')!)).toContain('"generated_at": "2026-10-04T13:05:24.116Z"')
    await expect(project(pak, 3)).rejects.toBeInstanceOf(PakError)
    expect(projectFileName('my-set.pak', 5)).toBe('my-set-project-5.pak')
  })

  it('an exported project restores into the simulator', async () => {
    const pak = await openPak(samplePak())
    const small = await openPak(await project(pak, 1))
    const dst = new MockEP133()
    const s = await connect(dst)
    await restorePak(s, small)
    const demo = DemoData.device()
    expect([...dst.sounds.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
    for (const slot of dst.sounds.keys()) expect(dst.sounds.get(slot)!.pcm).toEqual(demo.sounds.get(slot)!.pcm)
    expect(dst.projects.get(1)).toEqual(demo.projects.get(1))
    expect(dst.sounds.get(1)!.name).toBe('kick')
    s.close()
  })
})
