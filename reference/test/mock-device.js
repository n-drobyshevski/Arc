// A simulated EP-133 that speaks the FILE protocol as we understand it.
// It is strict in the places real hardware is known to be strict:
//  - after a completed GET/PUT it ignores commands until FILE INIT is resent
//  - list/metadata/data pages must be requested in order

import { TE_MFG, decodeFrame } from '../src/protocol/frame.js'
import { pack7 } from '../src/protocol/packed7.js'
import { crc32 } from '../src/formats/crc32.js'

const be16 = (v) => [(v >> 8) & 0xff, v & 0xff]
const be32 = (v) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]
const rd16 = (d, i) => (d[i] << 8) | d[i + 1]
const rd32 = (d, i) => ((d[i] << 24) >>> 0) + (d[i + 1] << 16) + (d[i + 2] << 8) + d[i + 3]
const u14 = (v) => [v & 0x7f, (v >> 7) & 0x7f]
const rdU14 = (d, i) => d[i] | (d[i + 1] << 7)

export class MockEP133 {
  constructor({ sounds = [], projects = [], capacity = 64 * 1024 * 1024, ackChunks = true, active = 3000 } = {}) {
    this.capacity = capacity
    this.ackChunks = ackChunks
    this.sounds = new Map()
    for (const s of sounds) this.addSound(s)
    this.projects = new Map(projects.map((p) => [p.n, p.tar]))
    this.projectsMeta = { active }
    this.deviceId = 0x33
    this.needsInit = false
    this.reading = null
    this.writing = null
    this.listeners = new Set()
    this.dropped = 0
    this.log = []
  }

  addSound({ slot, name, pcm, meta = {} }) {
    this.sounds.set(slot, {
      name,
      pcm,
      meta: { channels: 1, samplerate: 46875, format: 's16', ...meta, name, crc: crc32(pcm) },
    })
  }

  get used() {
    let n = 0
    for (const s of this.sounds.values()) n += s.pcm.length
    return n
  }

  // Host-side transport.
  transport() {
    return {
      send: (bytes) => setTimeout(() => this.receive(Uint8Array.from(bytes)), 0),
      onMessage: (cb) => {
        this.listeners.add(cb)
        return () => this.listeners.delete(cb)
      },
      close: () => {},
    }
  }

  emit(bytes) {
    for (const cb of this.listeners) cb(Uint8Array.from(bytes))
  }

  reply(req, status, payload = []) {
    const packed = pack7(Uint8Array.from(payload))
    this.emit([
      0xf0,
      ...TE_MFG,
      this.deviceId,
      0x40,
      0x20 | ((req.requestId >> 7) & 0x1f),
      req.requestId & 0x7f,
      req.command,
      status,
      ...packed,
      0xf7,
    ])
  }

  receive(d) {
    if (d[0] === 0xf0 && d[1] === 0x7e && d[3] === 0x06 && d[4] === 0x01) {
      this.emit([0xf0, 0x7e, this.deviceId, 0x06, 0x02, 0x00, 0x20, 0x76, 0x20, 0x00, 0x01, 0x00, 0, 0, 0, 0, 0xf7])
      return
    }
    const f = decodeFrame(d)
    if (!f || !f.isRequest) return
    const p = f.payload
    if (f.command === 1) {
      const text = 'chip_id:0;mode:normal;os_version:2.0.5;product:EP-133;serial:MOCK0001;sku:TE032AS001;sw_version:2.0.5'
      this.reply(f, 0, [...new TextEncoder().encode(text)])
      return
    }
    if (f.command !== 5) return this.reply(f, 2)
    const sub = p[0]
    const isInit = sub === 1
    const isPutData = sub === 2 && p[1] === 1
    if (this.needsInit && !isInit && !isPutData) {
      this.dropped++
      return
    }
    this.log.push(sub)
    if (this.afterPut && sub !== 11 && sub !== 2) {
      // The barrier request after an upload is still answered, then the device wants a re-init.
      this.afterPut = false
      queueMicrotask(() => {
        this.needsInit = true
      })
    }
    switch (sub) {
      case 1:
        this.needsInit = false
        return this.reply(f, 0, [0x00, 0x0c, 0x00, 0x00, 0x02, 0x00])
      case 4:
        return this.list(f, rd16(p, 1), rd16(p, 3))
      case 7:
        return p[1] === 2 ? this.getMeta(f, rd16(p, 2), rd16(p, 4)) : this.setMeta(f, rd16(p, 2), p.subarray(4))
      case 3:
        return p[1] === 0 ? this.getOpen(f, rd16(p, 2)) : this.getData(f, rdU14(p, 2))
      case 2:
        return p[1] === 0 ? this.putOpen(f, p) : this.putData(f, rd16(p, 2), p.subarray(4))
      case 11:
        return this.reply(f, 0)
      default:
        return this.reply(f, 3)
    }
  }

  nodes(parent) {
    if (parent === 0)
      return [
        { node: 1000, flags: 0x0e, size: 0, name: 'sounds' },
        { node: 2000, flags: 0x0e, size: 0, name: 'projects' },
      ]
    if (parent === 1000)
      return [...this.sounds].sort((a, b) => a[0] - b[0]).map(([slot, s]) => ({ node: slot, flags: 0x05, size: s.pcm.length, name: s.name }))
    if (parent === 2000)
      return [...this.projects.keys()].sort((a, b) => a - b).map((n) => ({ node: 3000 + (n - 1) * 1000, flags: 0x06, size: 0, name: String(n).padStart(2, '0') }))
    return []
  }

  list(f, page, parent) {
    const all = this.nodes(parent)
    const per = 5
    const slice = all.slice(page * per, page * per + per)
    const body = [...be16(page)]
    for (const e of slice) body.push(...be16(e.node), e.flags, ...be32(e.size), ...new TextEncoder().encode(e.name), 0)
    this.reply(f, 0, body)
  }

  metaFor(node) {
    if (node === 1000) return { max_capacity: this.capacity, free_space_in_bytes: this.capacity - this.used }
    if (node === 2000) return this.projectsMeta
    if (this.sounds.has(node)) return this.sounds.get(node).meta
    return null
  }

  getMeta(f, node, page) {
    const meta = this.metaFor(node)
    if (!meta) return this.reply(f, 1, [...new TextEncoder().encode('no such node')])
    const bytes = [...new TextEncoder().encode(JSON.stringify(meta)), 0]
    const per = 60
    this.reply(f, 0, [...be16(page), ...bytes.slice(page * per, page * per + per)])
  }

  setMeta(f, node, json) {
    let patch
    try {
      patch = JSON.parse(new TextDecoder().decode(json))
    } catch {
      return this.reply(f, 3)
    }
    if (node === 2000) Object.assign(this.projectsMeta, patch)
    else if (this.sounds.has(node)) Object.assign(this.sounds.get(node).meta, patch)
    else return this.reply(f, 1)
    this.reply(f, 0)
  }

  getOpen(f, node) {
    let data
    let name
    if (this.sounds.has(node)) {
      data = this.sounds.get(node).pcm
      name = this.sounds.get(node).name
    } else {
      const n = (node - 3000) / 1000 + 1
      if (!this.projects.has(n)) return this.reply(f, 1, [...new TextEncoder().encode('not found')])
      data = this.projects.get(n)
      name = String(n).padStart(2, '0')
    }
    this.reading = { data, next: 0 }
    this.reply(f, 0, [...be16(node), 0x05, ...be32(data.length), ...new TextEncoder().encode(name), 0])
  }

  getData(f, page) {
    if (!this.reading || page !== this.reading.next) return this.reply(f, 1)
    const per = 327
    const chunk = this.reading.data.subarray(page * per, page * per + per)
    this.reading.next++
    this.reply(f, 0, [...u14(page), ...chunk])
    if ((page + 1) * per >= this.reading.data.length) {
      this.reading = null
      this.needsInit = true
    }
  }

  putOpen(f, p) {
    const flags = p[2]
    const node = rd16(p, 3)
    const parent = rd16(p, 5)
    const size = rd32(p, 7)
    let end = 11
    while (p[end] !== 0) end++
    const name = new TextDecoder().decode(p.subarray(11, end))
    const json = p.subarray(end + 1)
    const meta = json.length ? JSON.parse(new TextDecoder().decode(json)) : {}
    if (parent === 1000) {
      const existing = this.sounds.get(node)?.pcm.length ?? 0
      if (this.used - existing + size > this.capacity) return this.reply(f, 16, [...new TextEncoder().encode('full')])
    }
    this.writing = { flags, node, parent, size, name, meta, chunks: [], next: 0 }
    this.reply(f, 0)
  }

  putData(f, idx, data) {
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
    else this.projects.set((w.node - 3000) / 1000 + 1, buf)
    this.writing = null
    this.afterPut = true
    if (this.ackChunks) this.reply(f, 0)
  }
}
