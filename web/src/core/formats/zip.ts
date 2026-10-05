// Port of core/src/main/kotlin/dev/arc/ep133/formats/Zip.kt (+ reference/src/formats/zip.js)
//
// Small ZIP reader/writer (store + deflate) built on CompressionStream. The
// .pak layout must match the Sample Tool and the Android app: UTF-8 flag
// (0x0800) on every entry, no data descriptors, no extra fields, version 20,
// and names with a leading "/".

import { crc32 } from './crc32'

/** The message JS (V8) gives when a DataView read falls outside the buffer. */
export const DATAVIEW_RANGE = 'Offset is outside the bounds of the DataView'

/**
 * Web addition: the most [readZip] unpacks from one file, all entries
 * together (the EP-133 holds 128 MB of sounds). Without it a small crafted
 * zip (one deflated entry, or many directory entries sharing one) could
 * unpack to gigabytes and take the tab down.
 */
export const MAX_UNZIPPED = 512 * 1024 * 1024
export const TOO_BIG = 'This file is too big to be a .pak'

/** One file inside a .pak. [path] keeps the leading "/" that the Sample Tool layout uses. */
export interface ZipEntry {
  path: string
  data: Uint8Array
  /** false stores the entry as-is. Default true. */
  compress?: boolean
}

export interface WriteZipOptions {
  /** Timestamp for every entry (ms since epoch or a Date). Default now. */
  date?: number | Date
  /** Minutes east of UTC for the DOS fields. Default: the local zone at [date]. */
  offsetMin?: number
}

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50

const hasStreams = typeof CompressionStream !== 'undefined'

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

/**
 * MS-DOS time and date fields for [epochMs], in the zone [offsetMin] minutes
 * east of UTC (default: the local zone at that instant, like the JS Date getters).
 */
export function dosTime(
  epochMs: number,
  offsetMin: number = -new Date(epochMs).getTimezoneOffset(),
): { time: number; date: number } {
  const d = new Date(epochMs + offsetMin * 60000)
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1)
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate()
  return { time: time & 0xffff, date: date & 0xffff }
}

/** Raw deflate (no zlib header). */
export function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return pipe(data, new CompressionStream('deflate-raw'))
}

/**
 * Raw inflate. Damaged or truncated data throws `Damaged data in <name>`,
 * the Android message, instead of the browser's TypeError. So does data that
 * inflates past [limit] bytes (web addition: its declared size, so a crafted
 * entry can't inflate without bound); the stream stops there.
 */
export async function inflateRaw(raw: Uint8Array, name: string, limit: number = Infinity): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    const reader = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > limit) {
        reader.cancel().catch(() => {})
        throw new Error('over limit')
      }
      chunks.push(value)
    }
  } catch {
    throw new Error(`Damaged data in ${name}`)
  }
  if (chunks.length === 1) return chunks[0]!
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

class Le {
  readonly buf: Uint8Array
  private readonly dv: DataView
  private o = 0
  constructor(size: number) {
    this.buf = new Uint8Array(size)
    this.dv = new DataView(this.buf.buffer)
  }
  u16(v: number): this {
    this.dv.setUint16(this.o, v, true)
    this.o += 2
    return this
  }
  u32(v: number): this {
    this.dv.setUint32(this.o, v, true)
    this.o += 4
    return this
  }
  bytes(b: Uint8Array): this {
    this.buf.set(b, this.o)
    this.o += b.length
    return this
  }
}

/** Writes a zip with the .pak layout. Entries over 64 bytes are deflated when that saves at least 5%. */
export async function writeZip(entries: ZipEntry[], options: WriteZipOptions = {}): Promise<Uint8Array> {
  const parts = await zipParts(entries, options)
  let length = 0
  for (const p of parts) length += p.length
  const out = new Uint8Array(length)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** [writeZip] as a Blob (application/zip), without joining the parts first. */
export async function writeZipBlob(entries: ZipEntry[], options: WriteZipOptions = {}): Promise<Blob> {
  const parts = await zipParts(entries, options)
  return new Blob(parts as Uint8Array<ArrayBuffer>[], { type: 'application/zip' })
}

async function zipParts(entries: ZipEntry[], { date = Date.now(), offsetMin }: WriteZipOptions): Promise<Uint8Array[]> {
  const ms = typeof date === 'number' ? date : date.getTime()
  const { time, date: day } = offsetMin === undefined ? dosTime(ms) : dosTime(ms, offsetMin)
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.path)
    const crc = crc32(e.data)
    let method = 0
    let body = e.data
    if (hasStreams && e.compress !== false && e.data.length > 64) {
      const z = await deflateRaw(e.data)
      // Only keep the deflated form when it saves at least 5%.
      if (z.length < e.data.length * 0.95) {
        method = 8
        body = z
      }
    }
    const local = new Le(30 + name.length)
    local.u32(LOCAL_SIG).u16(20).u16(0x0800).u16(method).u16(time).u16(day)
      .u32(crc).u32(body.length).u32(e.data.length).u16(name.length).u16(0)
    local.bytes(name)

    const cen = new Le(46 + name.length)
    cen.u32(CENTRAL_SIG).u16(20).u16(20).u16(0x0800).u16(method).u16(time).u16(day)
      .u32(crc).u32(body.length).u32(e.data.length).u16(name.length)
      .u16(0).u16(0).u16(0).u16(0).u32(0).u32(offset)
    cen.bytes(name)

    parts.push(local.buf, body)
    central.push(cen.buf)
    offset += local.buf.length + body.length
  }
  let cenSize = 0
  for (const c of central) cenSize += c.length
  const end = new Le(22)
  end.u32(END_SIG).u16(0).u16(0).u16(entries.length).u16(entries.length).u32(cenSize).u32(offset).u16(0)
  return [...parts, ...central, end.buf]
}

/**
 * Reads a zip into path → bytes, in central directory order. Any leading "/"
 * is removed from the keys; directory entries are skipped. A repeated name
 * keeps its first position and the last data (Map.set). Throws [TOO_BIG]
 * when the entries would unpack to more than [MAX_UNZIPPED] bytes in all.
 */
export async function readZip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  // Reads that fail with V8's DataView text in every browser.
  const check = (at: number, n: number): void => {
    if (at < 0 || at + n > buf.length) throw new RangeError(DATAVIEW_RANGE)
  }
  const u16 = (at: number): number => {
    check(at, 2)
    return dv.getUint16(at, true)
  }
  const u32 = (at: number): number => {
    check(at, 4)
    return dv.getUint32(at, true)
  }
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (u32(i) === END_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a .pak / zip file')
  const count = u16(eocd + 10)
  let p = u32(eocd + 16)
  const dec = new TextDecoder()
  const out = new Map<string, Uint8Array>()
  // First the directory alone: what every entry would unpack to (stored:
  // its bytes; deflated: its declared size, which inflateRaw then enforces).
  const entries: { name: string; method: number; raw: Uint8Array; usize: number }[] = []
  let total = 0
  for (let n = 0; n < count; n++) {
    if (u32(p) !== CENTRAL_SIG) throw new Error('Damaged zip directory')
    const method = u16(p + 10)
    const csize = u32(p + 20)
    const usize = u32(p + 24)
    const nameLen = u16(p + 28)
    const extraLen = u16(p + 30)
    const commentLen = u16(p + 32)
    const localAt = u32(p + 42)
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    const lNameLen = u16(localAt + 26)
    const lExtraLen = u16(localAt + 28)
    const start = localAt + 30 + lNameLen + lExtraLen
    // The central size, so zips with data descriptors (flag 0x08) work too.
    const raw = buf.subarray(start, start + csize)
    total += method === 0 ? raw.length : method === 8 ? usize : 0
    if (total > MAX_UNZIPPED) throw new Error(TOO_BIG)
    entries.push({ name, method, raw, usize })
  }
  for (const { name, method, raw, usize } of entries) {
    let data: Uint8Array
    if (method === 0) data = raw.slice()
    else if (method === 8) data = await inflateRaw(raw, name, usize)
    else throw new Error(`Unsupported compression in ${name}`)
    out.set(name.replace(/^\/+/, ''), data)
  }
  return out
}
