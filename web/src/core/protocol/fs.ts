// Port of core/src/main/kotlin/dev/arc/ep133/protocol/Fs.kt (+ reference/src/protocol/fs.js)
//
// FILE sub-commands, all sent inside CMD.FILE = 5.
//
//   INIT      [1, flags, be32 maxResponse]
//   PUT open  [2, 0, flags, be16 node, be16 parent, be32 size, name\0, json?]
//   PUT data  [2, 1, be16 index, ...bytes]          (empty data = end of file)
//   GET open  [3, 0, be16 node, be32 offset, 0]  -> [be16 node, flags, be32 size, name\0]
//   GET data  [3, 1, u14le page]                 -> [u14le page, ...bytes]
//   LIST      [4, be16 page, be16 node]          -> [be16 page, {be16 node, flags, be32 size, name\0}*]
//   META set  [7, 1, be16 node, json]
//   META get  [7, 2, be16 node, be16 page]       -> [be16 page, json chunk]
//   INFO      [11, be16 node]

import { bytes } from '../util/bytes'
import { checkAbort } from './cancel'
import { CancelledError, DeviceError } from './errors'
import { CMD, be16, be32, readBe16, readBe32, readCString, readU14le, u14le, type Frame } from './frame'
import type { Session } from './session'

export { CancelledError }

/** Any JSON value, as JSON.parse returns it. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
/** A JSON object (device metadata, sound settings). */
export type JsonObject = { [key: string]: JsonValue }

/** Download/upload progress: bytes done so far and the total. */
export type ProgressFn = (got: number, total: number) => void

export interface ListEntry {
  node: number
  flags: number
  size: number
  name: string
  isDir: boolean
}

const PUT = 2
const GET = 3
const LIST = 4
const META = 7
const INFO = 11

export const PUT_FLAGS_SOUND = 0x05
export const PUT_FLAGS_DIR = 0x06
export const UPLOAD_CHUNK = 433
export const MAX_METADATA_BYTES = 320

const MAX_LIST_PAGES = 128
const MAX_META_PAGES = 64

/** No acks for this long while the window is full: give up windowing (see [upload]). */
export const ACK_STALL_MS = 600
/** Unacknowledged data chunks allowed in flight before waiting for acks. */
export const UPLOAD_WINDOW = 16

const utf8 = new TextEncoder()

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * `x ?? {}` followed by property reads: anything that is not a JSON object
 * (null, a number, a string, an array) reads as empty, like Kotlin's `asObject()`.
 */
export function asObject(v: unknown): JsonObject {
  return isJsonObject(v) ? v : {}
}

/** True for a JSON object (not null, not an array): Kotlin `is JsonObject`. */
export function isJsonObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function parseListPage(payload: Uint8Array): ListEntry[] {
  const entries: ListEntry[] = []
  let i = 2
  while (i + 7 <= payload.length) {
    const node = readBe16(payload, i)
    const flags = payload[i + 2] ?? 0
    const size = readBe32(payload, i + 3)
    const { text, next } = readCString(payload, i + 7)
    if (next > payload.length + 1) break
    entries.push({ node, flags, size, name: text, isDir: (flags & 0x02) !== 0 })
    i = next
  }
  return entries
}

export interface BarrierOptions {
  /** Milliseconds to wait (default 3000). */
  timeout?: number
  /** Statuses of 64 and up restart the timeout (default false). */
  progress?: boolean
}

/** One LIST page. Also used as a barrier after uploads. */
export function listPage(session: Session, node: number, page = 0, opts: BarrierOptions = {}): Promise<Frame> {
  const { timeout = 3000, progress = false } = opts
  return session.file(bytes(LIST, be16(page), be16(node)), { timeout, label: `list ${node}`, progress })
}

export async function listNode(session: Session, node: number): Promise<ListEntry[]> {
  const all: ListEntry[] = []
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const res = await session.file(bytes(LIST, be16(page), be16(node)), { label: `list ${node}` })
    if (res.payload.length < 2) return all
    const echo = readBe16(res.payload, 0)
    if (echo !== page) throw new DeviceError(`List page mismatch (asked ${page}, got ${echo})`)
    const entries = parseListPage(res.payload)
    if (!entries.length) return all
    all.push(...entries)
  }
  throw new DeviceError(`Listing node ${node} did not finish`)
}

function tryParse(text: string): { ok: true; value: JsonValue } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue }
  } catch {
    return { ok: false }
  }
}

// The device sometimes leaves stray quotes inside string values.
const STRAY_QUOTES = /:"([^"]*?)"([^,}]*)/g

export function parseJsonLoose(text: string): JsonValue {
  const clean = text.replace(/\0+$/, '')
  const first = tryParse(clean)
  if (first.ok) return first.value
  const repaired = clean.replace(STRAY_QUOTES, (_m, a: string, b: string) => `:"${(a + b).replace(/"/g, '\\"')}"`)
  const second = tryParse(repaired)
  if (second.ok) return second.value
  throw new DeviceError(`Could not read device metadata: ${clean.slice(0, 60)}`)
}

/**
 * A node's JSON metadata, or null if the device refuses page 0.
 * The result can be any JSON value; callers read it through [asObject].
 */
export async function getMetadata(session: Session, node: number): Promise<JsonValue | null> {
  let text = ''
  for (let page = 0; page < MAX_META_PAGES; page++) {
    const res = await session.file(bytes(META, 2, be16(node), be16(page)), {
      label: `metadata ${node}`,
      check: page > 0,
    })
    if (page === 0 && res.status !== 0) return null
    if (res.payload.length < 2) break
    const echo = readBe16(res.payload, 0)
    if (echo !== page) throw new DeviceError(`Metadata page mismatch (asked ${page}, got ${echo})`)
    const chunk = res.payload.subarray(2)
    if (!chunk.length) break
    // Each page is decoded on its own, as the JS and Kotlin do: a character
    // split across two pages becomes U+FFFD.
    text += new TextDecoder().decode(chunk)
    if (chunk[chunk.length - 1] === 0) break
    const parsed = tryParse(text)
    if (parsed.ok) return parsed.value
  }
  return text ? parseJsonLoose(text) : {}
}

/** Metadata writes are capped at 320 bytes of JSON. */
export async function setMetadata(
  session: Session,
  node: number,
  patch: Record<string, unknown>,
  opts: BarrierOptions = {},
): Promise<Frame> {
  const { timeout = 3000, progress = false } = opts
  const json = utf8.encode(JSON.stringify(patch))
  if (json.length > MAX_METADATA_BYTES) {
    throw new DeviceError(`Metadata for node ${node} is too large (${json.length} bytes)`)
  }
  return session.file(bytes(META, 1, be16(node), json), { timeout, label: `set metadata ${node}`, progress })
}

/** The device drops the next command after a transfer unless we re-handshake. */
async function reinit(session: Session, failed: boolean): Promise<void> {
  try {
    await session.handshake()
  } catch (err) {
    if (!failed) throw err
  }
}

export interface DownloadOptions {
  onProgress?: ProgressFn | undefined
  signal?: AbortSignal | null | undefined
}

/** Download a file node (a sound's PCM, or a project directory as a TAR). */
export async function download(session: Session, node: number, opts: DownloadOptions = {}): Promise<Uint8Array> {
  const { onProgress, signal } = opts
  checkAbort(signal)
  const init = await session.file(bytes(GET, 0, be16(node), 0, 0, 0, 0, 0), { timeout: 5000, label: `open ${node}` })
  let failed = false
  try {
    if (init.payload.length < 7) throw new DeviceError(`Bad download header for node ${node}`)
    const total = readBe32(init.payload, 3)
    if (total > 512 * 1024 * 1024) throw new DeviceError(`Implausible file size ${total}`)
    const out = new Uint8Array(total)
    let got = 0
    let page = 0
    let empties = 0
    while (got < total) {
      if (page > 0x3fff) throw new DeviceError(`File ${node} is larger than the transfer protocol allows`)
      const res = await session.file(bytes(GET, 1, u14le(page)), {
        timeout: 4000,
        check: false,
        label: `read ${node} page ${page}`,
      })
      if (res.status !== 0 && res.payload.length < 2) {
        throw new DeviceError(`Reading node ${node} failed at ${got}/${total} bytes (status ${res.status})`)
      }
      // Page numbers are 14-bit little-endian, but the echo is accepted in
      // either byte order. A short payload reads as 0 here.
      const echoLe = readU14le(res.payload, 0)
      const echoBe = readBe16(res.payload, 0)
      if (echoLe !== page && echoBe !== page) {
        throw new DeviceError(`Page mismatch reading node ${node}: asked ${page}, got ${echoLe}`)
      }
      const data = res.payload.subarray(2)
      if (!data.length) {
        if (++empties >= 2) throw new DeviceError(`Device stopped sending node ${node} at ${got}/${total} bytes`)
      } else {
        empties = 0
      }
      const take = Math.min(data.length, total - got)
      out.set(data.subarray(0, take), got)
      got += take
      page++
      onProgress?.(got, total)
    }
    return out
  } catch (err) {
    failed = true
    throw err
  } finally {
    await reinit(session, failed)
  }
}

/** Upload pacing. Defaults match the Kotlin; tests shrink [ackStallMs]. */
export interface UploadTuning {
  /** Unacknowledged chunks allowed in flight (default 16). */
  window?: number
  /** Give up waiting for acks after this long with the window full (default 600 ms). */
  ackStallMs?: number
  /**
   * Once the device turns out not to ack at all (streaming mode), pause for
   * [streamPauseMs] after every this many chunks. 0 (default) never pauses,
   * like the Kotlin. A knob against the browser's MIDI output buffer filling up.
   */
  streamPauseEvery?: number
  /** Length of each streaming pause (default 0, a plain macrotask yield). */
  streamPauseMs?: number
}

export interface UploadOptions extends UploadTuning {
  node: number
  parent: number
  flags: number
  name: string
  meta?: Record<string, unknown> | null | undefined
  data: Uint8Array
  /** Sent after the last chunk; resolves once the device has processed everything queued before it. */
  barrier: () => Promise<unknown>
  onProgress?: ProgressFn | undefined
}

/**
 * Upload a file. Chunks are pipelined with a small window of unacknowledged
 * frames so a slow USB link is never flooded; if the device stops acking we
 * keep going and rely on the barrier request at the end.
 */
export async function upload(session: Session, opts: UploadOptions): Promise<void> {
  const {
    node,
    parent,
    flags,
    name,
    meta = null,
    data,
    barrier,
    onProgress,
    window = UPLOAD_WINDOW,
    ackStallMs = ACK_STALL_MS,
    streamPauseEvery = 0,
    streamPauseMs = 0,
  } = opts
  const nameBytes = utf8.encode(name)
  const jsonBytes = meta ? utf8.encode(JSON.stringify(meta)) : new Uint8Array(0)
  if (jsonBytes.length > MAX_METADATA_BYTES) throw new DeviceError('Sound settings too large to upload')
  const chunks = Math.ceil(data.length / UPLOAD_CHUNK)
  if (chunks > 0xffff) throw new DeviceError('File too large to upload')

  // The reply is not checked (check: false): if the device refuses the file,
  // the data chunks are rejected and that error is reported instead.
  await session.file(
    bytes(PUT, 0, flags, be16(node), be16(parent), be32(data.length), nameBytes, 0, jsonBytes),
    { timeout: 6000, check: false, label: `create ${node}` },
  )

  let deviceError: DeviceError | null = null
  let failed = false
  // Outside the try so the error path can forget in-flight acks too (Kotlin F1).
  const inFlight = new Set<number>()
  try {
    let wake: (() => void) | null = null
    let acksSeen = 0
    let limit = window
    const onAck = (id: number, f: Frame): void => {
      acksSeen++
      inFlight.delete(id)
      if (f.status > 0 && f.status < 64 && !deviceError) {
        const reason = new TextDecoder().decode(f.payload).replace(/\0+$/, '')
        deviceError = new DeviceError(`Device rejected data for node ${node}${reason ? `: ${reason}` : ''}`, f.status)
      }
      wake?.()
    }
    const waitForRoom = (): Promise<void> =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          wake = null
          // No acks arriving. If none ever came, this firmware doesn't ack
          // chunks at all: stop windowing and just stream.
          for (const id of inFlight) session.forgetAck(id)
          inFlight.clear()
          if (acksSeen === 0) limit = Infinity
          resolve()
        }, ackStallMs)
        wake = () => {
          clearTimeout(t)
          wake = null
          resolve()
        }
      })

    for (let idx = 0; idx < chunks; idx++) {
      if (deviceError) throw deviceError
      while (inFlight.size >= limit) await waitForRoom()
      const off = idx * UPLOAD_CHUNK
      const slice = data.subarray(off, Math.min(off + UPLOAD_CHUNK, data.length))
      // Acks cannot arrive before send() returns: replies are delivered in
      // later tasks, and this loop does not await until the next yield.
      let id = -1
      id = session.send(CMD.FILE, bytes(PUT, 1, be16(idx), slice), (f) => onAck(id, f))
      inFlight.add(id)
      onProgress?.(Math.min(off + UPLOAD_CHUNK, data.length), data.length)
      // Let queued acks dispatch now and then.
      if (idx % 32 === 31) await sleep(0)
      if (limit === Infinity && streamPauseEvery > 0 && (idx + 1) % streamPauseEvery === 0) await sleep(streamPauseMs)
    }
    session.send(CMD.FILE, bytes(PUT, 1, be16(chunks)))
    if (flags === PUT_FLAGS_SOUND) session.send(CMD.FILE, bytes(INFO, be16(node)))
    await barrier()
    for (const id of inFlight) session.forgetAck(id)
    if (deviceError) throw deviceError
  } catch (err) {
    failed = true
    // Kotlin deviation from the JS (agreed): also forget in-flight ack handlers
    // on the error path, so a stale handler can never swallow a later reply
    // once the 12-bit request id wraps around.
    for (const id of inFlight) session.forgetAck(id)
    throw err
  } finally {
    await reinit(session, failed)
  }
}
