// Port of the device browser cases of core/src/test/kotlin/dev/arc/ep133/features/FeaturesTest.kt.
// The sample upload and backup diff cases (SampleUpload, BackupDiff) are ported by the stage-B worker.
import { describe, expect, it } from 'vitest'
import { contents, projectLayout, projectSounds, soundDetails } from '../../../src/core/features/deviceBrowser'
import { crc32 } from '../../../src/core/formats/crc32'
import { Session } from '../../../src/core/protocol/session'
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

describe('FeaturesTest (device browser)', () => {
  it('browser lists sounds, projects and storage', async () => {
    const dev = device()
    const s = await connect(dev)
    const c = await contents(s)
    expect(c.sounds.map((x) => x.slot)).toEqual([1, 2, 150])
    expect(c.sounds.map((x) => x.name)).toEqual(['kick', 'snare', 'vox'])
    expect(c.sounds.map((x) => x.size)).toEqual([20000, 1000, 9000])
    expect(c.projects.map((x) => x.project)).toEqual([1, 4])
    expect(c.storage.total).toBe(64.0 * 1024 * 1024)
    expect(c.storage.free).toBe(64.0 * 1024 * 1024 - 30000)
    expect(c.occupiedSlots).toEqual(new Set([1, 2, 150]))
    s.close()
  })

  it('sound details come from metadata only', async () => {
    const dev = device()
    const s = await connect(dev)
    const d = await soundDetails(s, 150)
    expect(d.name).toBe('vox')
    expect(d.channels).toBe(2.0)
    expect(d.sampleRate).toBe(46875.0)
    expect(d.crc).toBe(crc32(noise(9000)))
    const k = await soundDetails(s, 1)
    expect(JSON.stringify(k.settings)).toBe('{"sound.playmode":"key","sound.pitch":-3}')
    expect(dev.opens, 'no audio was downloaded').toEqual([])
    dev.reportCrc = false
    dev.addSound({ slot: 7, name: 'plain', pcm: noise(10) })
    expect((await soundDetails(s, 7)).crc).toBeNull()
    s.close()
  })

  it("project sounds are read from the project's pads", async () => {
    const dev = device()
    const s = await connect(dev)
    expect(await projectSounds(s, 1)).toEqual([1, 2])
    expect(await projectSounds(s, 4)).toEqual([150])
    expect((await projectLayout(s, 4)).pads).toEqual([{ name: 'b', pads: new Map([[5, 150]]) }])
    // The download is followed by the handshake, so the next command still works.
    expect((await contents(s)).sounds.length).toBe(3)
    expect(dev.dropped).toBe(0)
    s.close()
  })
})
