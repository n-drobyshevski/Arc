// Port of core/src/test/kotlin/dev/arc/ep133/backup/QuirksTest.kt
//
// The reverse-engineered quirks, each exercised against the simulator.
//
// Kotlin runs these on a virtual-time dispatcher. Here the parts that measure
// or wait out time (the 600 ms ack stall, a 3 s request timeout) run under
// VirtualClock below: setTimeout is replaced by a queue that only advances
// once every microtask has run, so a 0 ms yield costs no time, exactly like
// kotlinx-coroutines-test. Phases that use CompressionStream (real async
// work) run on real timers.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { backupDevice, prepareSound, restorePak } from '../../../src/core/backup/backup'
import { openPak } from '../../../src/core/backup/pak'
import { encodeWav } from '../../../src/core/formats/wav'
import { writeZip } from '../../../src/core/formats/zip'
import { listSounds, projectNode, writeSound } from '../../../src/core/protocol/device'
import { DeviceError, TimeoutError } from '../../../src/core/protocol/errors'
import { decodeFrame } from '../../../src/core/protocol/frame'
import { ACK_STALL_MS, PUT_FLAGS_SOUND, download, setMetadata, upload } from '../../../src/core/protocol/fs'
import { Session } from '../../../src/core/protocol/session'
import type { Transport } from '../../../src/core/protocol/transport'
import { noise, pad, tarFile } from '../../helpers/bytes'
import { MockEP133 } from '../../helpers/mockDevice'
import { fixedRandom } from '../../helpers/scriptedTransport'

const realSetImmediate = globalThis.setImmediate

/** A virtual-time stand-in for setTimeout/clearTimeout (see the header). */
class VirtualClock {
  now = 0
  private seq = 0
  private readonly timers = new Map<number, { due: number; seq: number; fn: () => void }>()

  install(): void {
    vi.stubGlobal('setTimeout', (fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      const id = ++this.seq
      this.timers.set(id, { due: this.now + Math.max(0, Number(ms) || 0), seq: id, fn: () => fn(...args) })
      return id
    })
    vi.stubGlobal('clearTimeout', (id: unknown) => {
      this.timers.delete(id as number)
    })
  }

  /** Runs [work] to completion, firing virtual timers whenever nothing else can run. */
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.install()
    try {
      let done = false
      const p = work()
      p.then(
        () => (done = true),
        () => (done = true),
      )
      for (;;) {
        // A real macrotask: every queued microtask (sends, replies) has run after it.
        await new Promise<void>((r) => realSetImmediate(r))
        if (done) break
        let next: [number, { due: number; seq: number; fn: () => void }] | null = null
        for (const e of this.timers) {
          if (!next || e[1].due < next[1].due || (e[1].due === next[1].due && e[1].seq < next[1].seq)) next = e
        }
        if (!next) throw new Error('VirtualClock: stuck with no timers pending')
        this.timers.delete(next[0])
        this.now = Math.max(this.now, next[1].due)
        next[1].fn()
      }
      return await p
    } finally {
      vi.unstubAllGlobals()
    }
  }
}

function device(ackChunks = true): MockEP133 {
  return new MockEP133({
    sounds: [
      { slot: 1, name: 'kick', pcm: noise(20000) },
      { slot: 2, name: 'snare', pcm: noise(1000) },
      { slot: 150, name: 'vox', pcm: noise(9000), meta: { channels: 2 } },
    ],
    projects: [
      { n: 2, tar: tarFile([['pads/a/p01', pad(1)]]) },
      { n: 7, tar: tarFile([['pads/a/p01', pad(2)]]) },
    ],
    ackChunks,
  })
}

async function connect(dev: MockEP133, random?: () => number, transport: Transport = dev.transport()): Promise<Session> {
  const s = new Session(transport, random ? { random } : {})
  await s.handshake()
  return s
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => {
      throw new Error('expected a rejection')
    },
    (e: unknown) => e,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('QuirksTest', () => {
  it('download accepts a big-endian page echo', async () => {
    const src = device()
    src.echoPagesBigEndian = true
    const s = await connect(src)
    const pak = await openPak((await backupDevice(s)).bytes)
    expect(prepareSound(pak.sounds.get(1)!).pcm).toEqual(src.sounds.get(1)!.pcm)
    s.close()
  })

  it('one empty data page is tolerated, two are an error', async () => {
    const src = device()
    const s = await connect(src)
    src.emptyPages = 1
    expect((await download(s, 1)).length).toBe(20000)
    src.emptyPages = 2
    const e = await rejection(download(s, 1))
    expect(e).toBeInstanceOf(DeviceError)
    expect((e as Error).message).toBe('Device stopped sending node 1 at 0/20000 bytes')
    // The handshake after a failed transfer leaves the device usable.
    expect((await listSounds(s)).length).toBe(3)
    s.close()
  })

  it('every transfer is followed by a handshake, otherwise commands are dropped', async () => {
    const src = device()
    const s = await connect(src)
    await download(s, 2)
    expect(src.dropped).toBe(0)
    // Simulate a missing re-init: the device ignores the next command.
    src.needsInit = true
    const e = await new VirtualClock().run(() => rejection(listSounds(s)))
    expect(e).toBeInstanceOf(TimeoutError)
    expect((e as Error).message).toBe('The device did not answer (list 1000). Check the cable and try again.')
    expect(src.dropped).toBe(1)
    s.close()
  })

  it('request ids wrap through 4095 during a full backup', async () => {
    const src = device()
    const ids = new Set<number>()
    const inner = src.transport()
    const spy: Transport = {
      send(b) {
        const f = decodeFrame(b)
        if (f) ids.add(f.requestId)
        inner.send(b)
      },
      onMessage: (cb) => inner.onMessage(cb),
    }
    const s = await connect(src, fixedRandom(4000), spy)
    const r = await backupDevice(s)
    expect(r.summary.soundCount).toBe(3)
    expect(ids.has(4095) && ids.has(0), 'ids wrapped').toBe(true)
    expect([...ids].every((it) => it >= 0 && it <= 4095)).toBe(true)
    s.close()
  })

  it('projects are probed when the device lists none', async () => {
    const src = device()
    src.hideProjectList = true
    const s = await connect(src)
    const r = await backupDevice(s)
    expect(r.summary.projects).toEqual([2, 7])
    expect(src.dropped).toBe(0)
    // The three sounds, then a GET open for each of projects 1..9.
    expect(src.opens).toEqual([1, 2, 150, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(projectNode)])
    s.close()
  })

  it('uploads stream without acks after one stall', async () => {
    const src = device()
    const pak = await openPak((await backupDevice(await connect(src))).bytes)

    const clock = new VirtualClock()
    const acked = new MockEP133({ ackChunks: true })
    const silent = new MockEP133({ ackChunks: false })
    await clock.run(async () => {
      const s1 = await connect(acked)
      const t0 = clock.now
      await restorePak(s1, pak, { projects: [] })
      expect(clock.now - t0, 'with acks the window never stalls').toBe(0)

      const s2 = await connect(silent)
      const t1 = clock.now
      await restorePak(s2, pak, { projects: [] })
      // One 600 ms stall for each upload that fills the 16-chunk window
      // (kick: 47 chunks, vox: 21), then the rest streams. Snare is only 3 chunks.
      expect(clock.now - t1).toBe(2 * ACK_STALL_MS)
      expect([...silent.sounds.keys()]).toEqual([...acked.sounds.keys()])
      s1.close()
      s2.close()
    })
  })

  it('at most 16 chunks are unacknowledged', async () => {
    const dst = new MockEP133()
    const inner = dst.transport()
    const outstanding = new Set<number>()
    let max = 0
    const spy: Transport = {
      send(b) {
        const f = decodeFrame(b)
        if (f && f.command === 5 && f.payload.length > 4 && f.payload[0] === 2 && f.payload[1] === 1) {
          outstanding.add(f.requestId)
          max = Math.max(max, outstanding.size)
        }
        inner.send(b)
      },
      onMessage: (cb) =>
        inner.onMessage((b) => {
          const f = decodeFrame(b)
          if (f) outstanding.delete(f.requestId)
          cb(b)
        }),
    }
    const s = await connect(dst, undefined, spy)
    await writeSound(s, { slot: 5, name: 'x', channels: 1, sampleRate: 46875, settings: {}, pcm: noise(433 * 100) })
    expect(max).toBe(16)
    // 433-byte chunks: 100 data frames for 43300 bytes
    expect(dst.sounds.get(5)!.pcm.length).toBe(43300)
    s.close()
  })

  it('a checksum mismatch is retried once', async () => {
    const src = device()
    const pak = await openPak((await backupDevice(await connect(src))).bytes)
    const dst = new MockEP133()
    dst.corruptCrcUploads = 1
    const s = await connect(dst)
    const labels: string[] = []
    await restorePak(s, pak, { slots: [1], projects: [], onProgress: (it) => labels.push(it.label) })
    expect(labels).toContain('Sound 001, kick, retrying')
    dst.corruptCrcUploads = 2
    const e = await rejection(restorePak(s, pak, { slots: [2], projects: [] }))
    expect(e).toBeInstanceOf(DeviceError)
    expect((e as Error).message).toBe('Sound 2 did not verify after upload (checksum mismatch)')
    s.close()
  })

  it('the free space check is skipped when the device reports no capacity', async () => {
    const src = device()
    const pak = await openPak((await backupDevice(await connect(src))).bytes)
    const dst = new MockEP133({ capacity: 0 })
    const s = await connect(dst)
    // Not "Not enough room": the restore went ahead and the device refused the data.
    const e = await rejection(restorePak(s, pak))
    expect(e).toBeInstanceOf(DeviceError)
    expect((e as Error).message).toBe('Device rejected data for node 1')
    s.close()
  })

  it('high sample rates are resampled and loop points scaled', async () => {
    const frames = 4800
    const pcm = noise(frames * 2)
    const wav = encodeWav(pcm, 1, 48000)
    const arc =
      '{"app":"arc","version":1,"sounds":{"3":{"name":"hi","settings":{"sound.loopstart":480,"sound.loopend":1000,"sound.playmode":"key"}}}}'
    const zip = await writeZip(
      [
        { path: '/arc.json', data: new TextEncoder().encode(arc) },
        { path: '/sounds/003 hi.wav', data: wav },
      ],
      { date: 0 },
    )
    const dst = new MockEP133()
    const s = await connect(dst)
    await restorePak(s, await openPak(zip))
    const m = dst.sounds.get(3)!.meta
    expect(m.samplerate).toBe(46875)
    expect(m['sound.loopstart']).toBe(469) // round(480 * 46875 / 48000) = round(468.75)
    expect(m['sound.loopend']).toBe(977) // round(976.5625)
    expect(m['sound.playmode']).toBe('key')
    expect(dst.sounds.get(3)!.pcm.length).toBe(4688 * 2)
    s.close()
  })

  it('metadata writes are capped at 320 bytes', async () => {
    const dst = new MockEP133()
    const s = await connect(dst)
    const big = { name: 'x'.repeat(320) }
    const e = await rejection(setMetadata(s, 5, big))
    expect(e).toBeInstanceOf(DeviceError)
    expect((e as Error).message).toBe('Metadata for node 5 is too large (331 bytes)')
    const e2 = await rejection(
      upload(s, {
        node: 5,
        parent: 1000,
        flags: PUT_FLAGS_SOUND,
        name: 'x',
        meta: big,
        data: new Uint8Array(10),
        barrier: async () => {},
      }),
    )
    expect(e2).toBeInstanceOf(DeviceError)
    expect((e2 as Error).message).toBe('Sound settings too large to upload')
    s.close()
  })

  it('a project upload switches away and back, and restore puts back the active project', async () => {
    const src = device()
    const pak = await openPak((await backupDevice(await connect(src))).bytes)
    const dst = new MockEP133({
      projects: [
        { n: 1, tar: noise(10) },
        { n: 3, tar: noise(10) },
      ],
      active: 5000,
    })
    const s = await connect(dst)
    await restorePak(s, pak, { slots: [], projects: [7] })
    expect(dst.metaWrites.filter((it) => it[0] === 2000).map((it) => it[1])).toEqual([
      '{"active":3000}',
      '{"active":9000}',
      '{"active":5000}',
    ])
    expect(dst.projectsMeta.active).toBe(5000)
    s.close()
  })

  it('a sound name that is not a string goes into arc json unchanged', async () => {
    const src = device()
    src.sounds.get(2)!.meta.name = 7
    const pak = await openPak((await backupDevice(await connect(src))).bytes)
    const arc = JSON.stringify(pak.sidecar.sounds)
    expect(arc).toContain('"2":{"name":7,"settings":{}}')
    expect(pak.sounds.get(2)!.name).toBe('7')
  })
})
