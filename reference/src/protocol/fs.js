// FILE sub-commands (all sent inside CMD.FILE = 5).
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

import { be16, be32, readBe16, readBe32, readCString, readU14le, u14le } from './frame.js'
import { DeviceError } from './session.js'

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

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}

export function parseListPage(payload) {
  const entries = []
  let i = 2
  while (i + 7 <= payload.length) {
    const node = readBe16(payload, i)
    const flags = payload[i + 2]
    const size = readBe32(payload, i + 3)
    const { text, next } = readCString(payload, i + 7)
    if (next > payload.length + 1) break
    entries.push({ node, flags, size, name: text, isDir: !!(flags & 0x02) })
    i = next
  }
  return entries
}

/** One LIST page. Also used as a barrier after uploads. */
export function listPage(session, node, page = 0, opts = {}) {
  return session.file([LIST, ...be16(page), ...be16(node)], { label: `list ${node}`, ...opts })
}

export async function listNode(session, node) {
  const all = []
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const res = await session.file([LIST, ...be16(page), ...be16(node)], { label: `list ${node}` })
    if (res.payload.length < 2) return all
    const echo = readBe16(res.payload, 0)
    if (echo !== page) throw new DeviceError(`List page mismatch (asked ${page}, got ${echo})`)
    const entries = parseListPage(res.payload)
    if (!entries.length) return all
    all.push(...entries)
  }
  throw new DeviceError(`Listing node ${node} did not finish`)
}

function parseJsonLoose(text) {
  const clean = text.replace(/\0+$/, '')
  try {
    return JSON.parse(clean)
  } catch {}
  // The device sometimes leaves stray quotes inside string values.
  const repaired = clean.replace(/:"([^"]*?)"([^,}]*)/g, (_, a, b) => `:"${(a + b).replace(/"/g, '\\"')}"`)
  try {
    return JSON.parse(repaired)
  } catch {}
  throw new DeviceError(`Could not read device metadata: ${clean.slice(0, 60)}`)
}

export async function getMetadata(session, node) {
  let text = ''
  for (let page = 0; page < MAX_META_PAGES; page++) {
    const res = await session.file([META, 2, ...be16(node), ...be16(page)], {
      label: `metadata ${node}`,
      check: page > 0,
    })
    if (page === 0 && res.status !== 0) return null
    if (res.payload.length < 2) break
    const echo = readBe16(res.payload, 0)
    if (echo !== page) throw new DeviceError(`Metadata page mismatch (asked ${page}, got ${echo})`)
    const chunk = res.payload.subarray(2)
    if (!chunk.length) break
    text += new TextDecoder().decode(chunk)
    if (chunk[chunk.length - 1] === 0) break
    try {
      return JSON.parse(text)
    } catch {}
  }
  return text ? parseJsonLoose(text) : {}
}

export async function setMetadata(session, node, patch, opts = {}) {
  const json = new TextEncoder().encode(JSON.stringify(patch))
  if (json.length > MAX_METADATA_BYTES) {
    throw new DeviceError(`Metadata for node ${node} is too large (${json.length} bytes)`)
  }
  return session.file([META, 1, ...be16(node), ...json], { label: `set metadata ${node}`, ...opts })
}

/** The device drops the next command after a transfer unless we re-handshake. */
async function reinit(session, pending) {
  try {
    await session.handshake()
  } catch (err) {
    if (!pending) throw err
  }
}

function checkAbort(signal) {
  if (signal?.aborted) throw new CancelledError()
}

/** Download a file node (a sound's PCM, or a project directory as a TAR). */
export async function download(session, node, { onProgress, signal } = {}) {
  checkAbort(signal)
  const init = await session.file([GET, 0, ...be16(node), 0, 0, 0, 0, 0], {
    timeout: 5000,
    label: `open ${node}`,
  })
  let pending
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
      const res = await session.file([GET, 1, ...u14le(page)], {
        timeout: 4000,
        check: false,
        label: `read ${node} page ${page}`,
      })
      if (res.status !== 0 && res.payload.length < 2) {
        throw new DeviceError(`Reading node ${node} failed at ${got}/${total} bytes (status ${res.status})`)
      }
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
    pending = err
    throw err
  } finally {
    await reinit(session, pending)
  }
}

/**
 * Upload a file. Chunks are pipelined with a small window of unacknowledged
 * frames so a slow USB link is never flooded; if the device stops acking we
 * keep going and rely on the barrier request at the end.
 *
 * `barrier` is an async function sent after the last chunk. It only resolves
 * once the device has processed everything queued before it.
 */
export async function upload(
  session,
  { node, parent, flags, name, meta = null, data, barrier, onProgress, window = 16 },
) {
  const nameBytes = new TextEncoder().encode(name)
  const jsonBytes = meta ? new TextEncoder().encode(JSON.stringify(meta)) : new Uint8Array()
  if (jsonBytes.length > MAX_METADATA_BYTES) throw new DeviceError('Sound settings too large to upload')
  const chunks = Math.ceil(data.length / UPLOAD_CHUNK)
  if (chunks > 0xffff) throw new DeviceError('File too large to upload')

  await session.file(
    [PUT, 0, flags, ...be16(node), ...be16(parent), ...be32(data.length), ...nameBytes, 0, ...jsonBytes],
    { timeout: 6000, check: false, label: `create ${node}` },
  )

  let deviceError = null
  let pending
  try {
    const inFlight = new Set()
    let wake = null
    let acksSeen = 0
    let limit = window
    const onAck = (id) => (f) => {
      acksSeen++
      inFlight.delete(id)
      if (f.status > 0 && f.status < 64 && !deviceError) {
        const reason = new TextDecoder().decode(f.payload).replace(/\0+$/, '')
        deviceError = new DeviceError(`Device rejected data for node ${node}${reason ? `: ${reason}` : ''}`, f.status)
      }
      wake?.()
    }
    const waitForRoom = () =>
      new Promise((resolve) => {
        const t = setTimeout(() => {
          // No acks arriving. If none ever came, this firmware doesn't ack
          // chunks at all: stop windowing and just stream.
          for (const id of inFlight) session.forgetAck(id)
          inFlight.clear()
          if (acksSeen === 0) limit = Infinity
          resolve()
        }, 600)
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
      let id = -1
      id = session.send(5, [PUT, 1, ...be16(idx), ...slice], (f) => onAck(id)(f))
      inFlight.add(id)
      onProgress?.(Math.min(off + UPLOAD_CHUNK, data.length), data.length)
      if (idx % 32 === 31) await new Promise((r) => setTimeout(r, 0))
    }
    session.send(5, [PUT, 1, ...be16(chunks)])
    if (flags === PUT_FLAGS_SOUND) session.send(5, [INFO, ...be16(node)])
    await barrier()
    for (const id of inFlight) session.forgetAck(id)
    if (deviceError) throw deviceError
  } catch (err) {
    pending = err
    throw err
  } finally {
    await reinit(session, pending)
  }
}
