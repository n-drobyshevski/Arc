// Sanity tests for the test harness (no Kotlin counterpart): MockEP133, DemoData,
// ScriptedTransport and TestBytes as ported from core/src/test/kotlin/dev/arc/ep133/testing/.

import { describe, expect, it } from 'vitest'
import { crc32 } from '../../src/core/formats/crc32'
import { encodeWav } from '../../src/core/formats/wav'
import { readZip } from '../../src/core/formats/zip'
import { decodeFrame, readBe16, readBe32, readCString, type Frame } from '../../src/core/protocol/frame'
import { Session } from '../../src/core/protocol/session'
import { toHex } from '../../src/core/util/bytes'
import { hex, noise, pad, s16, tarFile } from './bytes'
import { DemoData, demoDevice, device, tone } from './demoData'
import { samplePak } from './fixtures'
import { MockEP133 } from './mockDevice'
import { ScriptedTransport, fixedRandom, responseFrame, settle, type Respond } from './scriptedTransport'

interface Entry {
  node: number
  flags: number
  size: number
  name: string
}

// A minimal LIST walk (fs.ts is ported separately): [4, page be16, parent be16].
async function list(s: Session, parent: number): Promise<Entry[]> {
  const out: Entry[] = []
  for (let page = 0; ; page++) {
    const f = await s.file([4, page >> 8, page & 0xff, parent >> 8, parent & 0xff], { label: `list ${parent}` })
    const p = f.payload
    expect(readBe16(p, 0)).toBe(page)
    let i = 2
    let n = 0
    while (i < p.length) {
      const node = readBe16(p, i)
      const flags = p[i + 2] ?? 0
      const size = readBe32(p, i + 3)
      const c = readCString(p, i + 7)
      out.push({ node, flags, size, name: c.text })
      i = c.next
      n++
    }
    if (n < 5) return out
  }
}

async function connect(dev: MockEP133): Promise<Session> {
  const s = new Session(dev.transport())
  await s.handshake()
  return s
}

describe('MockEP133', () => {
  it('answers identity and greet, so a Session handshakes', async () => {
    const dev = device()
    const s = new Session(dev.transport())
    expect(await s.identify()).toEqual({ deviceId: 0x33, sku: 'TE032AS001' })
    const info = await s.handshake()
    expect(info).toEqual({ product: 'EP-133', sku: 'TE032AS001', osVersion: '2.0.5', serial: 'MOCK0001', mode: 'normal' })
    expect(s.deviceId).toBe(0x33)
    expect(dev.log).toEqual([1])
    expect(dev.dropped).toBe(0)
    s.close()
  })

  it('lists the root, the sounds and the projects', async () => {
    const dev = device()
    const s = await connect(dev)
    expect(await list(s, 0)).toEqual([
      { node: 1000, flags: 0x0e, size: 0, name: 'sounds' },
      { node: 2000, flags: 0x0e, size: 0, name: 'projects' },
    ])
    const sounds = await list(s, 1000)
    expect(sounds.map((e) => e.node)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 108, 109, 110, 111])
    expect(sounds.map((e) => e.name)).toEqual(DemoData.NAMES)
    expect(sounds.every((e) => e.flags === 0x05)).toBe(true)
    expect(sounds[0]?.size).toBe(8000)
    expect(await list(s, 2000)).toEqual([
      { node: 3000, flags: 0x06, size: 0, name: '01' },
      { node: 4000, flags: 0x06, size: 0, name: '02' },
      { node: 7000, flags: 0x06, size: 0, name: '05' },
    ])
    dev.hideProjectList = true
    expect(await list(s, 2000)).toEqual([])
    s.close()
  })

  it('pages metadata in 60-byte slices with a NUL at the end', async () => {
    const dev = device()
    const s = await connect(dev)
    const text = JSON.stringify(dev.sounds.get(109)?.meta)
    expect(JSON.parse(text)).toEqual({
      channels: 2,
      samplerate: 46875,
      format: 's16',
      name: 'vox chop',
      crc: crc32(DemoData.tone(4000 + 9 * 1500, 60 + 9 * 40, 2)),
    })
    const pages: number[] = []
    for (let page = 0; ; page++) {
      const f = await s.file([7, 2, 0, 109, 0, page])
      expect(readBe16(f.payload, 0)).toBe(page)
      pages.push(...f.payload.subarray(2))
      if (pages.includes(0)) break
    }
    expect(new TextDecoder().decode(Uint8Array.from(pages.slice(0, -1)))).toBe(text)
    const bad = await s.file([7, 2, 0x0b, 0xb8, 0, 0], { check: false }) // node 3000 has no meta
    expect(bad.status).toBe(1)
    s.close()
  })

  it('requires a FILE INIT after a completed download', async () => {
    const dev = new MockEP133({ sounds: [{ slot: 5, name: 'x', pcm: noise(700) }] })
    const s = await connect(dev)
    const open = await s.file([3, 0, 0, 5])
    expect(readBe32(open.payload, 3)).toBe(700)
    expect(dev.opens).toEqual([5])
    const got: number[] = []
    for (let page = 0; page < 3; page++) {
      const f = await s.file([3, 1, page & 0x7f, page >> 7])
      expect([...f.payload.subarray(0, 2)]).toEqual([page, 0])
      got.push(...f.payload.subarray(2))
    }
    expect(Uint8Array.from(got)).toEqual(noise(700))
    expect(dev.needsInit).toBe(true)
    await expect(s.file([4, 0, 0, 0, 0], { timeout: 50, label: 'list 0' })).rejects.toThrow(
      'The device did not answer (list 0). Check the cable and try again.',
    )
    expect(dev.dropped).toBe(1)
    await s.file([1, 1, 0, 0x40, 0, 0])
    expect((await list(s, 0)).length).toBe(2)
    s.close()
  })

  it('answers the barrier after an upload, then wants a re-init', async () => {
    const dev = new MockEP133()
    const s = await connect(dev)
    const data = noise(10)
    // PUT open: [2, 0, flags, node be16, parent be16, size be32, name, 0, json]
    const meta = new TextEncoder().encode('{"channels":1}')
    await s.file([2, 0, 5, 0, 7, 0x03, 0xe8, 0, 0, 0, 10, ...new TextEncoder().encode('hi'), 0, ...meta])
    await s.file([2, 1, 0, 0, ...data])
    await s.file([2, 1, 0, 1])
    expect(dev.sounds.get(7)?.pcm).toEqual(data)
    expect(dev.sounds.get(7)?.meta).toEqual({ channels: 1, samplerate: 46875, format: 's16', name: 'hi', crc: crc32(data) })
    await s.file([11]) // the barrier itself does not trigger the re-init
    expect(dev.needsInit).toBe(false)
    await s.file([4, 0, 0, 0, 0]) // the first other command is still answered...
    expect(dev.needsInit).toBe(true) // ...synchronously followed by the re-init demand
    await expect(s.file([4, 0, 0, 0, 0], { timeout: 50 })).rejects.toThrow('did not answer')
    expect(dev.dropped).toBe(1)
    expect(dev.log).toEqual([1, 2, 2, 2, 11, 4])
    s.close()
  })

  it('records meta writes and honours the knobs', async () => {
    const dev = device()
    dev.reportCrc = false
    dev.corruptCrcUploads = 1
    dev.addSound({ slot: 1, name: 'again', pcm: noise(4) })
    // Re-setting a slot keeps its position; corrupt crc is not reported at all.
    expect([...dev.sounds.keys()][0]).toBe(1)
    expect(dev.sounds.get(1)?.meta.crc).toBeUndefined()
    expect(dev.corruptCrcUploads).toBe(0)
    dev.reportCrc = true
    dev.corruptCrcUploads = 1
    dev.addSound({ slot: 2, name: 'bad', pcm: noise(4) })
    expect(dev.sounds.get(2)?.meta.crc).toBe((crc32(noise(4)) ^ 1) >>> 0)

    const s = await connect(dev)
    await s.file([7, 1, 0x07, 0xd0, ...new TextEncoder().encode('{"active":6000}')])
    expect(dev.projectsMeta).toEqual({ active: 6000 })
    expect(dev.metaWrites).toEqual([[2000, '{"active":6000}']])
    const invalid = await s.file([7, 1, 0x07, 0xd0, ...new TextEncoder().encode('{')], { check: false })
    expect(invalid.status).toBe(3)
    expect(dev.metaWrites.length).toBe(1)

    dev.silent = true
    await expect(s.file([4, 0, 0, 0, 0], { timeout: 50 })).rejects.toThrow('did not answer')
    s.close()
  })

  it('echoes big-endian pages and serves empty pages on request', async () => {
    const dev = new MockEP133({ sounds: [{ slot: 1, name: 'a', pcm: noise(400) }] })
    dev.echoPagesBigEndian = true
    dev.emptyPages = 1
    const s = await connect(dev)
    await s.file([3, 0, 0, 1])
    const p0 = await s.file([3, 1, 0, 0])
    expect([...p0.payload]).toEqual([0, 0]) // empty page, no data
    const p1 = await s.file([3, 1, 1, 0])
    expect([...p1.payload.subarray(0, 2)]).toEqual([0, 1]) // be16 echo
    expect(p1.payload.subarray(2)).toEqual(noise(400).subarray(0, 327))
    const p2 = await s.file([3, 1, 2, 0])
    expect(p2.payload.subarray(2)).toEqual(noise(400).subarray(327))
    expect(dev.needsInit).toBe(true)
    s.close()
  })

  it('does not treat off-grid nodes as projects', async () => {
    const dev = device()
    const s = await connect(dev)
    const f = await s.file([3, 0, 0x0b, 0xb9], { check: false }) // 3001
    expect(f.status).toBe(1)
    expect(new TextDecoder().decode(f.payload)).toBe('not found')
    expect(dev.opens).toEqual([3001])
    s.close()
  })

  it('rejects uploads that do not fit', async () => {
    const dev = new MockEP133({ capacity: 5 })
    const s = await connect(dev)
    const f = await s.file([2, 0, 5, 0, 1, 0x03, 0xe8, 0, 0, 0, 10, 0x61, 0], { check: false })
    expect(f.status).toBe(16)
    s.close()
  })

  it('pushes pad presses request-shaped or reply-shaped', async () => {
    const dev = device()
    const s = await connect(dev)
    const frames: Frame[] = []
    s.onPush((f) => frames.push(f))
    dev.pushPadActive(2, 1, 3)
    dev.pushPadActive(2, 1, 3, true)
    await settle()
    expect(frames.length).toBe(2)
    const payload = new Uint8Array([3, 0x10, 0xcc, ...new TextEncoder().encode('{"active":4303}'), 0]) // dir 3200 + 1000 + 100
    expect(frames[0]).toMatchObject({ isRequest: true, hasId: false, command: 5, status: -1 })
    expect(frames[0]?.payload).toEqual(payload)
    expect(frames[1]).toMatchObject({ isRequest: false, hasId: true, requestId: 4000, command: 5, status: 0 })
    expect(frames[1]?.payload).toEqual(payload)
    s.close()
  })
})

describe('DemoData', () => {
  it('builds the device sample.pak was made from', async () => {
    const pak = await readZip(samplePak())
    const d = demoDevice()
    for (const p of d.projects) {
      expect(pak.get(`projects/P${String(p.n).padStart(2, '0')}.tar`)).toEqual(p.tar)
    }
    const crcs: Record<number, number> = {
      1: 1210850052,
      2: 892705292,
      3: 1840889880,
      4: 3413871838,
      5: 916970730,
      6: 2483237793,
      7: 75479863,
      8: 1502255551,
      108: 1276560396,
      109: 323993505,
      110: 2298888661,
      111: 3349279222,
    }
    for (const s of d.sounds) {
      const channels = s.slot === 109 ? 2 : 1
      expect(crc32(encodeWav(s.pcm, channels, 46875))).toBe(crcs[s.slot])
    }
    expect(device().used).toBe(d.sounds.reduce((n, s) => n + s.pcm.length, 0))
    expect(tone(3, 100)).toEqual(s16(0, 59, 44))
  })
})

describe('ScriptedTransport', () => {
  const idOf = (b: Uint8Array): number => decodeFrame(b)?.requestId ?? -1
  function session(first: number, respond: Respond): [Session, ScriptedTransport] {
    const t = new ScriptedTransport(respond)
    return [new Session(t, { random: fixedRandom(first) }), t]
  }

  it('builds response frames like the device', () => {
    expect(toHex(responseFrame(0x33, 0x0b94, 1, 0))).toBe('F0 00 20 76 33 40 37 14 01 00 F7')
    expect(toHex(responseFrame(0x33, 4095, 5, 64, Uint8Array.of(0x80)))).toBe('F0 00 20 76 33 40 3F 7F 05 40 01 00 F7')
  })

  it('replays a script with ids pinned by fixedRandom', async () => {
    const [s, t] = session(4094, (req, tr) => tr.reply(req, 0))
    await s.request(1)
    await s.request(1)
    expect(t.sent.map(idOf)).toEqual([4095, 0])
    expect(t.sent[0]?.[6]).toBe(0x7f)
    expect(t.sent[0]?.[7]).toBe(0x7f)
    s.close()
    expect(t.closed).toBe(true)
  })

  it('emits unrelated frames before the reply and supports async scripts', async () => {
    const [s, t] = session(9, async (req, tr) => {
      tr.emit(responseFrame(0x33, (idOf(req) + 7) % 4096, 5, 1))
      await Promise.resolve()
      tr.reply(req, 0, Uint8Array.of(9))
    })
    const f = await s.request(5, [4, 0, 0, 0, 0])
    expect(f.status).toBe(0)
    expect([...f.payload]).toEqual([9])
    expect(idOf(t.sent[0]!)).toBe(10)
    s.close()
  })

  it('delivers emitted messages asynchronously and in order', async () => {
    const t = new ScriptedTransport(() => {})
    const got: string[] = []
    t.onMessage((b) => got.push(toHex(b)))
    t.emit(hex('F0 01 F7'))
    t.emit(hex('F0 02 F7'))
    expect(got).toEqual([])
    await settle()
    expect(got).toEqual(['F0 01 F7', 'F0 02 F7'])
  })
})

describe('TestBytes', () => {
  it('match the JS test helpers', () => {
    expect([...noise(4)]).toEqual([7, 38, 69, 100])
    expect([...pad(0x1234).subarray(0, 4)]).toEqual([0, 0x34, 0x12, 0])
    expect(pad(1).length).toBe(26)
    expect(toHex(s16(1, -1, 32767, -32768))).toBe('01 00 FF FF FF 7F 00 80')
    const tar = tarFile([['a', Uint8Array.of(1, 2, 3)]])
    expect(tar.length).toBe(512 + 512 + 1024)
    expect(new TextDecoder().decode(tar.subarray(124, 135))).toBe('00000000003')
    expect(tar[156]).toBe(48)
    expect([...tar.subarray(512, 515)]).toEqual([1, 2, 3])
  })
})
