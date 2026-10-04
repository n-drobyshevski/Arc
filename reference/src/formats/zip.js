// Small ZIP reader/writer (store + deflate) built on CompressionStream.
// Enough for .pak files, which are plain ZIPs.

import { crc32 } from './crc32.js'

const hasStreams = typeof CompressionStream !== 'undefined'

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

const deflate = (b) => pipe(b, new CompressionStream('deflate-raw'))
const inflate = (b) => pipe(b, new DecompressionStream('deflate-raw'))

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/**
 * @param {Array<{path: string, data: Uint8Array, compress?: boolean}>} entries
 * @returns {Promise<Blob>}
 */
export async function writeZip(entries, { date = new Date() } = {}) {
  const enc = new TextEncoder()
  const { time, date: dday } = dosTime(date)
  const parts = []
  const central = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.path)
    const crc = crc32(e.data)
    let method = 0
    let body = e.data
    if (hasStreams && e.compress !== false && e.data.length > 64) {
      const z = await deflate(e.data)
      if (z.length < e.data.length * 0.95) {
        method = 8
        body = z
      }
    }
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true)
    lv.setUint16(8, method, true)
    lv.setUint16(10, time, true)
    lv.setUint16(12, dday, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, e.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)

    const cen = new Uint8Array(46 + name.length)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, dday, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, e.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    cen.set(name, 46)

    parts.push(local, body)
    central.push(cen)
    offset += local.length + body.length
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cenSize, true)
  ev.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}

/**
 * @param {Uint8Array} buf
 * @returns {Promise<Map<string, Uint8Array>>} keys have any leading "/" removed
 */
export async function readZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a .pak / zip file')
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const dec = new TextDecoder()
  const out = new Map()
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged zip directory')
    const method = dv.getUint16(p + 10, true)
    const csize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localAt = dv.getUint32(p + 42, true)
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    const lNameLen = dv.getUint16(localAt + 26, true)
    const lExtraLen = dv.getUint16(localAt + 28, true)
    const start = localAt + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + csize)
    let data
    if (method === 0) data = raw.slice()
    else if (method === 8) data = await inflate(raw)
    else throw new Error(`Unsupported compression in ${name}`)
    out.set(name.replace(/^\/+/, ''), data)
  }
  return out
}
