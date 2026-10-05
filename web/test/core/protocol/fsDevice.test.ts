// Port of core/src/test/kotlin/dev/arc/ep133/protocol/FsDeviceTest.kt
//
// Pure parts of fs.js and device.js. Expected values come from the reference run under Node 22.
import { describe, expect, it } from 'vitest'
import {
  cleanSoundName,
  getStorage,
  listProjects,
  listSounds,
  projectFromNode,
  projectNode,
  readProject,
  readSound,
  soundMeta,
  writeProject,
  writeSound,
} from '../../../src/core/protocol/device'
import { DeviceError } from '../../../src/core/protocol/errors'
import {
  be16,
  be32,
  decodeFrame,
  parseGreet,
  readBe16,
  readBe32,
  readU14le,
  statusText,
  u14le,
} from '../../../src/core/protocol/frame'
import {
  download,
  getMetadata,
  listNode,
  parseJsonLoose,
  parseListPage,
  setMetadata,
  upload,
  type JsonObject,
} from '../../../src/core/protocol/fs'
import { Session } from '../../../src/core/protocol/session'
import { bytes } from '../../../src/core/util/bytes'
import { noise } from '../../helpers/bytes'
import { device } from '../../helpers/demoData'
import { MockEP133 } from '../../helpers/mockDevice'
import { ScriptedTransport } from '../../helpers/scriptedTransport'

const obj = (json: string): JsonObject => JSON.parse(json) as JsonObject

describe('FsDeviceTest', () => {
  it('soundMeta key order, loop clamping and the 320 byte trim', () => {
    const sm = (ch: number, rate: number, settings: string, frames: number): string =>
      JSON.stringify(soundMeta(ch, rate, obj(settings), frames))
    expect(sm(1.0, 46875.0, '{}', 1000)).toBe(
      '{"sound.playmode":"oneshot","sound.rootnote":60,"sound.pitch":0,"sound.pan":0,"sound.amplitude":100,"envelope.attack":0,"envelope.release":255,"time.mode":"off","channels":1,"samplerate":46875}',
    )
    expect(
      sm(
        2.0,
        44100.0,
        '{"sound.playmode":"key","sound.pitch":-3,"sound.loopend":5000,"sound.loopstart":2000,"sound.bpm":120.5,"foo":1,"sound.pan":null}',
        1000,
      ),
    ).toBe(
      '{"sound.playmode":"key","sound.rootnote":60,"sound.pitch":-3,"sound.pan":0,"sound.amplitude":100,"envelope.attack":0,"envelope.release":255,"time.mode":"off","sound.loopstart":0,"sound.loopend":999,"sound.bpm":120.5,"channels":2,"samplerate":44100}',
    )
    expect(sm(1.0, 46875.0, '{"sound.loopend":"999","sound.loopstart":"abc"}', 500)).toBe(
      '{"sound.playmode":"oneshot","sound.rootnote":60,"sound.pitch":0,"sound.pan":0,"sound.amplitude":100,"envelope.attack":0,"envelope.release":255,"time.mode":"off","sound.loopstart":"abc","sound.loopend":499,"channels":1,"samplerate":46875}',
    )
    const x = 'x'.repeat(200)
    expect(
      sm(
        1.0,
        46875.0,
        `{"sound.playmode":"${x}","sound.bpm":1,"sound.loopstart":1,"sound.loopend":2,"time.mode":"bar","sound.pan":3}`,
        10,
      ),
    ).toBe(
      `{"sound.playmode":"${x}","sound.rootnote":60,"sound.pitch":0,"sound.amplitude":100,"envelope.attack":0,"envelope.release":255,"channels":1,"samplerate":46875}`,
    )
  })

  it('cleanSoundName', () => {
    const inputs = ['kick.wav', 'KICK.WAV', '  héllo wörld 123456789012345  ', '', null, 'éé', 'a.wav.wav', 'tab\there']
    expect(inputs.map(cleanSoundName)).toEqual([
      'kick',
      'KICK',
      'hllo wrld 1234567890',
      'sound',
      'sound',
      'sound',
      'a.wav',
      'tabhere',
    ])
  })

  it('loose metadata parsing repairs stray quotes', () => {
    expect(JSON.stringify(parseJsonLoose('{"name":"kick"}\u0000\u0000'))).toBe('{"name":"kick"}')
    expect(JSON.stringify(parseJsonLoose('{"name":"my "best" kick","x":1}'))).toBe('{"name":"my best\\" kick\\"","x":1}')
    expect(JSON.stringify(parseJsonLoose('{"a":"b"c","d":2}'))).toBe('{"a":"bc\\"","d":2}')
    let err: unknown
    try {
      parseJsonLoose('{{{')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DeviceError)
    expect((err as DeviceError).message).toBe('Could not read device metadata: {{{')
  })

  it('project node numbering', () => {
    expect([2999, 3000, 3500, 4000, 101000, 102000].map(projectFromNode)).toEqual([null, 1, null, 2, 99, null])
    expect(projectNode(1)).toBe(3000)
    expect(projectNode(4)).toBe(6000)
  })

  it('list pages stop at a truncated entry', () => {
    // page echo, then one full entry and a truncated one without enough bytes
    const p = bytes([0, 0], be16(1), [5], be32(99), 'kick', [0], [0, 2, 5])
    expect(parseListPage(p)).toEqual([{ node: 1, flags: 5, size: 99, name: 'kick', isDir: false }])
    // An unterminated last name is still accepted (next == size + 1)
    const q = bytes([0, 0], be16(2), [6], be32(0), '05')
    expect(parseListPage(q)).toEqual([{ node: 2, flags: 6, size: 0, name: '05', isDir: true }])
  })

  it('frame helpers', () => {
    expect(readBe32(Uint8Array.of(0xff, 0xff, 0xff, 0xff), 0)).toBe(0xffffffff)
    expect(readBe16(new Uint8Array(0), 0)).toBe(0)
    expect(readU14le(u14le(0x3fff), 0)).toBe(0x3fff)
    expect(readU14le(Uint8Array.of(1, 1), 0)).toBe(129)
    expect(statusText(16)).toBe('device error 16')
    expect(statusText(4)).toBe('status 4')
    expect({ ...parseGreet('a:b:c;:skip; :x;novalue\u0000') }).toEqual({ a: 'b:c', '': 'x' })
  })
})

// Web extras (no Kotlin twin): Fs.kt / Device.kt behaviour checked end to end
// against MockEP133 and ScriptedTransport, so parity slips in fs.ts/device.ts
// show up here and not only in the backup-level tests.
describe('fs/device behaviour (web extras)', () => {
  const connect = async (dev: MockEP133): Promise<Session> => {
    const s = new Session(dev.transport())
    await s.handshake()
    return s
  }
  const acks = (s: Session): number => (s as unknown as { ackHandlers: Map<number, unknown> }).ackHandlers.size
  const caught = async (p: Promise<unknown>): Promise<Error> => {
    try {
      await p
    } catch (e) {
      return e as Error
    }
    throw new Error('expected a rejection')
  }

  it('downloads in order, reports progress and re-inits afterwards', async () => {
    const dev = new MockEP133({ sounds: [{ slot: 5, name: 'x', pcm: noise(700) }] })
    const s = await connect(dev)
    const seen: [number, number][] = []
    const pcm = await download(s, 5, { onProgress: (g, t) => seen.push([g, t]) })
    expect(pcm).toEqual(noise(700))
    expect(seen).toEqual([
      [327, 700],
      [654, 700],
      [700, 700],
    ])
    expect(dev.needsInit).toBe(false)
    expect(dev.log.at(-1)).toBe(1)
    expect(await listSounds(s)).toEqual([{ slot: 5, name: 'x', size: 700 }])
    expect(dev.dropped).toBe(0)
    s.close()
  })

  it('accepts a big-endian page echo and gives up after two empty pages', async () => {
    const dev = new MockEP133({ sounds: [{ slot: 1, name: 'a', pcm: noise(400) }] })
    dev.echoPagesBigEndian = true
    dev.emptyPages = 1
    const s = await connect(dev)
    expect(await download(s, 1)).toEqual(noise(400))
    dev.emptyPages = 2
    const err = await caught(download(s, 1))
    expect(err).toBeInstanceOf(DeviceError)
    expect(err.message).toBe('Device stopped sending node 1 at 0/400 bytes')
    s.close()
  })

  it('checks for cancel before opening a download', async () => {
    const dev = device()
    const s = await connect(dev)
    const ac = new AbortController()
    ac.abort()
    const err = await caught(download(s, 1, { signal: ac.signal }))
    expect(err.name).toBe('CancelledError')
    expect(err.message).toBe('Cancelled')
    expect(dev.opens).toEqual([])
    s.close()
  })

  it('download error texts', async () => {
    const replies: ((req: Uint8Array, t: ScriptedTransport) => void)[] = [
      (req, t) => t.reply(req, 0, bytes(be16(9), 5, be32(10), 'x', 0)), // GET open
      (req, t) => t.reply(req, 0, bytes(5, 0, 1, 2, 3)), // page 0 echoed as 5
    ]
    let greet = false
    const t = new ScriptedTransport((req, tr) => {
      if (req[1] === 0x7e) return tr.emit(bytes(0xf0, 0x7e, 0x33, 6, 2, 0, 0x20, 0x76, 0x20, 0, 1, 0, 0, 0, 0, 0, 0xf7))
      const f = decodeFrame(req)
      if (f?.command === 1 && greet) return tr.reply(req, 0, bytes('product:EP-133'))
      if (f?.command !== 5) return
      if (f.payload[0] === 1) return tr.reply(req, 0)
      if (f.payload[0] === 3) replies.shift()?.(req, tr)
    })
    const s = new Session(t)
    // The re-init handshake in the finally gets no greet reply: the pending error wins.
    const err = await caught(download(s, 9))
    expect(err.message).toBe('Page mismatch reading node 9: asked 0, got 5')
    greet = true
    replies.push(
      (req, tr) => tr.reply(req, 0, bytes(be16(9), 5, be32(0x20000001), 'x', 0)),
    )
    expect((await caught(download(s, 9))).message).toBe('Implausible file size 536870913')
    replies.push((req, tr) => tr.reply(req, 0, bytes(be16(9), 5, 0, 0)))
    expect((await caught(download(s, 9))).message).toBe('Bad download header for node 9')
    replies.push(
      (req, tr) => tr.reply(req, 0, bytes(be16(9), 5, be32(10), 'x', 0)),
      (req, tr) => tr.reply(req, 1, bytes(7)),
    )
    expect((await caught(download(s, 9))).message).toBe('Reading node 9 failed at 0/10 bytes (status 1)')
    // A clean download whose re-init fails rethrows the handshake error.
    greet = false
    replies.push(
      (req, tr) => tr.reply(req, 0, bytes(be16(9), 5, be32(2), 'x', 0)),
      (req, tr) => tr.reply(req, 0, bytes(0, 0, 0xaa, 0xbb)),
    )
    expect((await caught(download(s, 9))).message).toBe('The device did not answer (greet). Check the cable and try again.')
    s.close()
  })

  it('lists across pages and rejects a page mismatch', async () => {
    const dev = device()
    const s = await connect(dev)
    expect((await listSounds(s)).map((e) => e.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 108, 109, 110, 111])
    expect(await listProjects(s)).toEqual([
      { project: 1, node: 3000, name: '01', size: 0 },
      { project: 2, node: 4000, name: '02', size: 0 },
      { project: 5, node: 7000, name: '05', size: 0 },
    ])
    s.close()
    const t = new ScriptedTransport((req, tr) => tr.reply(req, 0, bytes(be16(1), be16(1), 5, be32(0), 'a', 0)))
    const s2 = new Session(t)
    expect((await caught(listNode(s2, 1000))).message).toBe('List page mismatch (asked 0, got 1)')
    s2.close()
  })

  it('metadata: null when page 0 is refused, per-page decoding, loose repair', async () => {
    const dev = device()
    const s = await connect(dev)
    expect(await getMetadata(s, 3000)).toBeNull()
    expect(await getStorage(s)).toEqual({
      total: 64 * 1024 * 1024,
      free: 64 * 1024 * 1024 - dev.used,
      used: dev.used,
    })
    s.close()
    // "é" split across two pages decodes as two U+FFFD, like the JS.
    const pages = [bytes(be16(0), '{"name":"a', 0xc3), bytes(be16(1), 0xa9, '"}', 0)]
    const t = new ScriptedTransport((req, tr) => tr.reply(req, 0, pages[decodeFrame(req)?.payload[5] ?? 0]))
    const s2 = new Session(t)
    expect(await getMetadata(s2, 7)).toEqual({ name: 'a��' })
    pages[0] = bytes(be16(0), '{"name":"my "best" kick"}', 0)
    expect(await getMetadata(s2, 7)).toEqual({ name: 'my best" kick"' })
    pages[0] = bytes(be16(0))
    expect(await getMetadata(s2, 7)).toEqual({})
    s2.close()
  })

  it('metadata writes are capped at 320 bytes', async () => {
    const dev = device()
    const s = await connect(dev)
    const err = await caught(setMetadata(s, 2000, { x: 'y'.repeat(320) }))
    expect(err).toBeInstanceOf(DeviceError)
    expect(err.message).toBe('Metadata for node 2000 is too large (328 bytes)')
    expect(dev.metaWrites).toEqual([])
    const big = await caught(
      upload(s, { node: 1, parent: 1000, flags: 5, name: 'a', meta: { x: 'y'.repeat(320) }, data: noise(4), barrier: async () => {} }),
    )
    expect(big.message).toBe('Sound settings too large to upload')
    expect(dev.log).toEqual([1])
    s.close()
  })

  it('uploads with and without chunk acks', async () => {
    for (const ackChunks of [true, false]) {
      const dev = new MockEP133({ ackChunks })
      const s = await connect(dev)
      const pcm = noise(433 * 40 + 10)
      const seen: number[] = []
      await writeSound(s, { slot: 7, name: 'Kick.WAV', channels: 1, sampleRate: 46875, settings: {}, pcm }, {
        onProgress: (g) => seen.push(g),
        tuning: { ackStallMs: 20 },
      })
      expect(dev.sounds.get(7)?.pcm).toEqual(pcm)
      expect(dev.sounds.get(7)?.name).toBe('Kick')
      expect(seen.length).toBe(41)
      expect(seen.at(-1)).toBe(pcm.length)
      expect(dev.dropped).toBe(0)
      expect(acks(s)).toBe(0)
      s.close()
    }
  })

  it('reports rejected data, forgets in-flight acks and still re-inits', async () => {
    const dev = new MockEP133({ capacity: 10 })
    const s = await connect(dev)
    const err = await caught(
      writeSound(s, { slot: 3, name: 'big', channels: 1, sampleRate: 46875, settings: {}, pcm: noise(433 * 20) }, { tuning: { ackStallMs: 20 } }),
    )
    expect(err).toBeInstanceOf(DeviceError)
    expect(err.message).toBe('Device rejected data for node 3')
    expect((err as DeviceError).status).toBe(1)
    expect(acks(s)).toBe(0)
    expect(dev.log.at(-1)).toBe(1)
    expect(await listSounds(s)).toEqual([])
    s.close()
  })

  it('verifies the crc after a sound upload', async () => {
    const dev = new MockEP133()
    dev.corruptCrcUploads = 1
    const s = await connect(dev)
    const err = await caught(
      writeSound(s, { slot: 2, name: 'x', channels: 1, sampleRate: 46875, settings: {}, pcm: noise(100) }),
    )
    expect(err.message).toBe('Sound 2 did not verify after upload (checksum mismatch)')
    dev.reportCrc = false
    await writeSound(s, { slot: 2, name: 'x', channels: 1, sampleRate: 46875, settings: {}, pcm: noise(100) })
    await expect(writeSound(s, { slot: 2, name: 'x', channels: 1, sampleRate: 46875, settings: {}, pcm: new Uint8Array(0) })).rejects.toThrow(
      'Sound 2 is empty',
    )
    s.close()
  })

  it('writeProject switches the active project away and back', async () => {
    const dev = device()
    const s = await connect(dev)
    const tar = noise(1000)
    expect(await readProject(s, 2)).toEqual(dev.projects.get(2))
    await writeProject(s, 2, tar)
    expect(dev.projects.get(2)).toEqual(tar)
    expect(dev.metaWrites).toEqual([
      [2000, '{"active":3000}'],
      [2000, '{"active":4000}'],
    ])
    expect(dev.projectsMeta).toEqual({ active: 4000 })
    expect(dev.dropped).toBe(0)
    s.close()
  })

  it('readSound keeps the raw name value and applies the JS fallbacks', async () => {
    const dev = new MockEP133({
      sounds: [
        { slot: 4, name: 'n', pcm: noise(8), meta: { channels: '2', samplerate: 0, 'sound.pitch': 3, 'sound.pan': null } },
      ],
    })
    dev.sounds.get(4)!.meta.name = 12
    const s = await connect(dev)
    const snd = await readSound(s, 4)
    expect(snd).toMatchObject({ slot: 4, name: '12', nameValue: 12, channels: 2, sampleRate: 46875, settings: { 'sound.pitch': 3 } })
    expect(snd.pcm).toEqual(noise(8))
    s.close()
  })
})
