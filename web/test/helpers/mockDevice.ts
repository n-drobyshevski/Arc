// Port of core/src/test/kotlin/dev/arc/ep133/testing/MockEP133.kt (+ reference/test/mock-device.js)
//
// A simulated EP-133 that speaks the FILE protocol as we understand it.
// It is strict in the places real hardware is known to be strict:
//  - after a completed GET/PUT it ignores commands until FILE INIT is resent
//  - list/metadata/data pages must be requested in order
//
// Kotlin additions over the JS mock: [opens], [metaWrites] and the knobs
// [echoPagesBigEndian], [corruptCrcUploads], [reportCrc], [silent],
// [hideProjectList], [emptyPages], plus [pushPadActive]. The after-PUT re-init
// is set synchronously after the reply (Kotlin), not in a queueMicrotask (JS).

import { crc32 } from '../../src/core/formats/crc32'
import { be16, be32, decodeFrame, readBe16, readBe32, u14le, type Frame } from '../../src/core/protocol/frame'
import { pack7 } from '../../src/core/protocol/packed7'
import type { Transport } from '../../src/core/protocol/transport'
import { bytes } from '../../src/core/util/bytes'
import { responseFrame } from './scriptedTransport'

export type Json = Record<string, unknown>

/** A sound to preload into the simulator. */
export interface MockSound {
  slot: number
  name: string
  pcm: Uint8Array
  meta?: Json
}

/** A project to preload: project number and its tar. */
export interface MockProject {
  n: number
  tar: Uint8Array
}

export interface MockOptions {
  sounds?: MockSound[]
  projects?: MockProject[]
  capacity?: number
  ackChunks?: boolean
  active?: number
}

export interface StoredSound {
  name: string
  pcm: Uint8Array
  meta: Json
}

interface Writing {
  flags: number
  node: number
  parent: number
  size: number
  name: string
  meta: Json
  chunks: Uint8Array[]
  next: number
}

interface Reading {
  data: Uint8Array
  next: number
  offset: number
}

interface Node {
  node: number
  flags: number
  size: number
  name: string
}

const GREET_TEXT =
  'chip_id:0;mode:normal;os_version:2.0.5;product:EP-133;serial:MOCK0001;sku:TE032AS001;sw_version:2.0.5'

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)
const fromUtf8 = (b: Uint8Array): string => new TextDecoder().decode(b)

// The mock's own page reader: low byte, then high byte shifted by 7, with no
// 7-bit masks (Kotlin rdU14; the protocol's readU14le masks both bytes).
function rdU14(d: Uint8Array, i: number): number {
  return (d[i] ?? 0) | ((d[i + 1] ?? 0) << 7)
}

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Object.assign, except a "__proto__" key is stored as a plain key (Kotlin putAll).
// Existing keys keep their position, new ones are appended.
function putAll(target: Json, patch: Json): void {
  for (const [k, v] of Object.entries(patch)) {
    Object.defineProperty(target, k, { value: v, writable: true, enumerable: true, configurable: true })
  }
}

export class MockEP133 {
  capacity: number
  readonly ackChunks: boolean
  /** Slot to sound, in insertion order; re-setting a slot keeps its position (JS Map). */
  readonly sounds = new Map<number, StoredSound>()
  readonly projects = new Map<number, Uint8Array>()
  readonly projectsMeta: Json = {}
  deviceId = 0x33
  needsInit = false
  dropped = 0
  /** Every FILE sub-command that was handled, in order. */
  readonly log: number[] = []

  /** Every GET open, by node. */
  readonly opens: number[] = []
  /** Every META set as [node, json text], in order. */
  readonly metaWrites: [number, string][] = []
  /** Reply to data pages with a big-endian page echo (the download accepts either order). */
  echoPagesBigEndian = false
  /** How many of the next sound uploads should report a wrong crc. */
  corruptCrcUploads = 0
  /** Whether sound metadata includes a crc (real firmware is not confirmed to report one). */
  reportCrc = true
  /** Ignore everything (to provoke timeouts). */
  silent = false
  /** List /projects as empty (some firmware does), so the backup has to probe. */
  hideProjectList = false
  /** Answer this many data pages with no data (and without advancing). */
  emptyPages = 0

  private reading: Reading | null = null
  private writing: Writing | null = null
  private afterPut = false
  private readonly listeners = new Set<(b: Uint8Array) => void>()

  constructor({ sounds = [], projects = [], capacity = 64 * 1024 * 1024, ackChunks = true, active = 3000 }: MockOptions = {}) {
    this.capacity = capacity
    this.ackChunks = ackChunks
    for (const s of sounds) this.addSound(s)
    for (const p of projects) this.projects.set(p.n, p.tar)
    this.projectsMeta.active = active
  }

  /** `{ channels: 1, samplerate: 46875, format: 's16', ...meta, name, crc: crc32(pcm) }` */
  addSound({ slot, name, pcm, meta = {} }: MockSound): void {
    const m: Json = { channels: 1, samplerate: 46875, format: 's16' }
    putAll(m, meta)
    m.name = name
    let crc = crc32(pcm)
    if (this.corruptCrcUploads > 0) {
      this.corruptCrcUploads--
      crc = (crc ^ 1) >>> 0
    }
    if (this.reportCrc) m.crc = crc
    this.sounds.set(slot, { name, pcm, meta: m })
  }

  get used(): number {
    let n = 0
    for (const s of this.sounds.values()) n += s.pcm.length
    return n
  }

  /**
   * Host-side transport. The device handles each sent message in a microtask,
   * and replies are delivered in later microtasks (never from inside send()).
   * All transports of one mock share its listeners.
   */
  transport(): Transport {
    return {
      send: (b: Uint8Array) => {
        const copy = b.slice()
        queueMicrotask(() => this.receive(copy))
      },
      onMessage: (cb: (b: Uint8Array) => void) => {
        this.listeners.add(cb)
        return () => {
          this.listeners.delete(cb)
        }
      },
      close: () => {},
    }
  }

  private emit(b: Uint8Array): void {
    queueMicrotask(() => {
      for (const cb of [...this.listeners]) cb(b.slice())
    })
  }

  /**
   * A pad press, as community notes describe the push: a FILE event
   * [0x03, group dir be16, {"active": pad fid}, 0x00]. Sent request-shaped
   * (request bit, no id) or, with [replyShaped], like a reply with a status
   * byte and an id nobody waits for, since the real header is not documented.
   */
  pushPadActive(project: number, group: number, pad: number, replyShaped = false): void {
    const dir = 3200 + (project - 1) * 1000 + group * 100
    const payload = bytes(0x03, be16(dir), `{"active":${dir + pad}}`, 0)
    if (replyShaped) {
      this.emit(responseFrame(this.deviceId, 4000, 5, 0, payload))
      return
    }
    this.emit(bytes(0xf0, 0x00, 0x20, 0x76, this.deviceId, 0x40, 0x40, 0x00, 0x05, pack7(payload), 0xf7))
  }

  private reply(req: Frame, status: number, payload: Uint8Array = new Uint8Array(0)): void {
    this.emit(responseFrame(this.deviceId, req.requestId, req.command, status, payload))
  }

  receive(d: Uint8Array): void {
    if (this.silent) return
    if (d[0] === 0xf0 && d[1] === 0x7e && d[3] === 0x06 && d[4] === 0x01) {
      this.emit(bytes(0xf0, 0x7e, this.deviceId, 0x06, 0x02, 0x00, 0x20, 0x76, 0x20, 0x00, 0x01, 0x00, 0, 0, 0, 0, 0xf7))
      return
    }
    const f = decodeFrame(d)
    if (!f || !f.isRequest) return
    const p = f.payload
    if (f.command === 1) {
      this.reply(f, 0, utf8(GREET_TEXT))
      return
    }
    if (f.command !== 5) return this.reply(f, 2)
    const sub = p[0] ?? 0
    const isInit = sub === 1
    const isPutData = sub === 2 && p[1] === 1
    if (this.needsInit && !isInit && !isPutData) {
      this.dropped++
      return
    }
    this.log.push(sub)
    // The barrier request after an upload is still answered, then the device
    // wants a re-init. (queueMicrotask in the JS: it runs after this reply is
    // queued but before the host can send anything else.)
    let initAfterReply = false
    if (this.afterPut && sub !== 11 && sub !== 2) {
      this.afterPut = false
      initAfterReply = true
    }
    switch (sub) {
      case 1:
        this.needsInit = false
        this.reply(f, 0, Uint8Array.of(0x00, 0x0c, 0x00, 0x00, 0x02, 0x00))
        break
      case 4:
        this.list(f, readBe16(p, 1), readBe16(p, 3))
        break
      case 7:
        if (p[1] === 2) this.getMeta(f, readBe16(p, 2), readBe16(p, 4))
        else this.setMeta(f, readBe16(p, 2), p.subarray(4))
        break
      case 3:
        if (p[1] === 0) this.getOpen(f, readBe16(p, 2))
        else this.getData(f, rdU14(p, 2))
        break
      case 2:
        if (p[1] === 0) this.putOpen(f, p)
        else this.putData(f, readBe16(p, 2), p.subarray(4))
        break
      case 11:
        this.reply(f, 0)
        break
      default:
        this.reply(f, 3)
    }
    if (initAfterReply) this.needsInit = true
  }

  private nodes(parent: number): Node[] {
    if (parent === 0)
      return [
        { node: 1000, flags: 0x0e, size: 0, name: 'sounds' },
        { node: 2000, flags: 0x0e, size: 0, name: 'projects' },
      ]
    if (parent === 1000)
      return [...this.sounds]
        .sort((a, b) => a[0] - b[0])
        .map(([slot, s]) => ({ node: slot, flags: 0x05, size: s.pcm.length, name: s.name }))
    if (parent === 2000) {
      if (this.hideProjectList) return []
      return [...this.projects.keys()]
        .sort((a, b) => a - b)
        .map((n) => ({ node: 3000 + (n - 1) * 1000, flags: 0x06, size: 0, name: String(n).padStart(2, '0') }))
    }
    return []
  }

  private list(f: Frame, page: number, parent: number): void {
    const per = 5
    const parts: (number | Uint8Array | string)[] = [be16(page)]
    for (const e of this.nodes(parent).slice(page * per, page * per + per)) {
      parts.push(be16(e.node), e.flags, be32(e.size), e.name, 0)
    }
    this.reply(f, 0, bytes(...parts))
  }

  private metaFor(node: number): Json | null {
    if (node === 1000) return { max_capacity: this.capacity, free_space_in_bytes: this.capacity - this.used }
    if (node === 2000) return this.projectsMeta
    return this.sounds.get(node)?.meta ?? null
  }

  private getMeta(f: Frame, node: number, page: number): void {
    const meta = this.metaFor(node)
    if (!meta) return this.reply(f, 1, utf8('no such node'))
    const text = bytes(JSON.stringify(meta), 0)
    const per = 60
    this.reply(f, 0, bytes(be16(page), text.subarray(page * per, page * per + per)))
  }

  private setMeta(f: Frame, node: number, json: Uint8Array): void {
    const text = fromUtf8(json)
    let patch: unknown
    try {
      patch = JSON.parse(text)
    } catch {
      return this.reply(f, 3)
    }
    this.metaWrites.push([node, text])
    const obj = isObject(patch) ? patch : {} // Object.assign ignores non-objects
    if (node === 2000) putAll(this.projectsMeta, obj)
    else {
      const s = this.sounds.get(node)
      if (!s) return this.reply(f, 1)
      putAll(s.meta, obj)
    }
    this.reply(f, 0)
  }

  // Guarded, unlike the JS: a node that is not on the 1000 grid is no project.
  private projectOf(node: number): number | null {
    return (node - 3000) % 1000 === 0 ? (node - 3000) / 1000 + 1 : null
  }

  private getOpen(f: Frame, node: number): void {
    this.opens.push(node)
    let data: Uint8Array
    let name: string
    const s = this.sounds.get(node)
    if (s) {
      data = s.pcm
      name = s.name
    } else {
      const n = this.projectOf(node)
      const tar = n === null ? undefined : this.projects.get(n)
      if (n === null || !tar) return this.reply(f, 1, utf8('not found'))
      data = tar
      name = String(n).padStart(2, '0')
    }
    this.reading = { data, next: 0, offset: 0 }
    this.reply(f, 0, bytes(be16(node), 0x05, be32(data.length), name, 0))
  }

  private getData(f: Frame, page: number): void {
    const r = this.reading
    if (!r || page !== r.next) return this.reply(f, 1)
    const per = 327
    const echo = this.echoPagesBigEndian ? be16(page) : u14le(page)
    r.next++
    if (this.emptyPages > 0) {
      // A page with no data: the host moves on to the next page number.
      this.emptyPages--
      return this.reply(f, 0, echo)
    }
    // The JS mock slices at page * per; a separate cursor gives the same
    // bytes and also works after an empty page.
    const chunk = r.data.subarray(r.offset, r.offset + per)
    r.offset += chunk.length
    this.reply(f, 0, bytes(echo, chunk))
    if (r.offset >= r.data.length) {
      this.reading = null
      this.needsInit = true
    }
  }

  private putOpen(f: Frame, p: Uint8Array): void {
    const flags = p[2] ?? 0
    const node = readBe16(p, 3)
    const parent = readBe16(p, 5)
    const size = readBe32(p, 7)
    let end = 11
    while (end < p.length && p[end] !== 0) end++ // bounded, unlike the JS
    const name = fromUtf8(p.subarray(11, end))
    const json = p.subarray(end + 1)
    const parsed: unknown = json.length ? JSON.parse(fromUtf8(json)) : {}
    const meta = isObject(parsed) ? parsed : {}
    if (parent === 1000) {
      const existing = this.sounds.get(node)?.pcm.length ?? 0
      if (this.used - existing + size > this.capacity) return this.reply(f, 16, utf8('full'))
    }
    this.writing = { flags, node, parent, size, name, meta, chunks: [], next: 0 }
    this.reply(f, 0)
  }

  private putData(f: Frame, idx: number, data: Uint8Array): void {
    const w = this.writing
    if (!w || idx !== w.next) return this.reply(f, 1)
    w.next++
    if (data.length) {
      w.chunks.push(data.slice())
      if (this.ackChunks) this.reply(f, 0)
      return
    }
    const total = w.chunks.reduce((n, c) => n + c.length, 0)
    const buf = new Uint8Array(total)
    let o = 0
    for (const c of w.chunks) {
      buf.set(c, o)
      o += c.length
    }
    if (total !== w.size) {
      this.writing = null
      return this.reply(f, 1)
    }
    if (w.parent === 1000) this.addSound({ slot: w.node, name: w.name, pcm: buf, meta: w.meta })
    else this.projects.set(Math.trunc((w.node - 3000) / 1000) + 1, buf)
    this.writing = null
    this.afterPut = true
    if (this.ackChunks) this.reply(f, 0)
  }
}
