// Port of core/src/main/kotlin/dev/arc/ep133/protocol/TrafficLog.kt
//
// Raw SysEx in and out, for the hidden debug screen. Nobody has run arc on real
// hardware yet; this log is how the first run gets debugged. Keeps the most
// recent `capacity` messages in a ring buffer.

import { toHex } from '../util/bytes'
import { CMD, decodeFrame, parseIdentity } from './frame'

export type TrafficDir = 'OUT' | 'IN' | 'NOTE'

export interface TrafficEntry {
  /** Epoch milliseconds. */
  readonly time: number
  readonly dir: TrafficDir
  readonly bytes: Uint8Array
  readonly note: string | null
}

/** Which clock zone [TrafficLog.export] writes stamps in (Kotlin passes a ZoneId). */
export type StampZone = 'local' | 'utc'

const FILE_SUBS: Readonly<Record<number, string>> = { 1: 'init', 2: 'put', 3: 'get', 4: 'list', 7: 'meta', 11: 'info' }

/** A short human summary of a message: "[len] FILE list id=123 status=0". */
export function describe(b: Uint8Array): string {
  const head = `[${b.length}]`
  if (b.length >= 2 && b[0] === 0xf0 && b[1] === 0x7e) {
    return parseIdentity(b) != null ? `${head} identity reply` : `${head} universal`
  }
  const f = decodeFrame(b)
  if (f == null) return `${head} ?`
  let cmd: string
  if (f.command === CMD.GREET) cmd = 'GREET'
  else if (f.command === CMD.FILE) {
    const sub = f.payload.length > 0 ? f.payload[0] : undefined
    cmd = 'FILE ' + ((sub !== undefined ? FILE_SUBS[sub] : undefined) ?? '?')
  } else cmd = `cmd ${f.command}`
  const id = f.hasId ? ` id=${f.requestId}` : ' push'
  const st = f.isRequest ? '' : ` status=${f.status}`
  return `${head} ${cmd}${id}${st}`
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** yyyy-MM-dd HH:mm:ss.SSS in local time (or UTC). */
export function stamp(ms: number, zone: StampZone = 'local'): string {
  const d = new Date(ms)
  if (zone === 'utc') {
    return (
      `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
    )
  }
  return (
    `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  )
}

export class TrafficLog {
  /** Kotlin's companion `describe`, also exported as a plain function. */
  static readonly describe = describe

  private readonly capacity: number
  private readonly clock: () => number
  private ring: (TrafficEntry | undefined)[] = []
  private start = 0
  private count = 0
  private droppedCount = 0
  private _version = 0
  private readonly listeners = new Set<(version: number) => void>()

  /** OUT and IN messages are skipped while false. Notes are always kept. */
  enabled = true

  constructor(capacity = 5000, clock: () => number = Date.now) {
    this.capacity = capacity
    this.clock = clock
  }

  /** Changes whenever the log does (for UIs to observe). */
  get version(): number {
    return this._version
  }

  /** Calls [cb] with the new version after every change. Returns an unsubscribe function. */
  subscribe(cb: (version: number) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  out(bytes: Uint8Array): void {
    this.add({ time: this.clock(), dir: 'OUT', bytes: bytes.slice(), note: null })
  }

  inbound(bytes: Uint8Array): void {
    this.add({ time: this.clock(), dir: 'IN', bytes: bytes.slice(), note: null })
  }

  note(text: string): void {
    this.add({ time: this.clock(), dir: 'NOTE', bytes: new Uint8Array(0), note: text }, true)
  }

  private add(e: TrafficEntry, force = false): void {
    if (!this.enabled && !force) return
    if (this.capacity <= 0) {
      this.droppedCount++
    } else if (this.count < this.capacity) {
      this.ring[(this.start + this.count) % this.capacity] = e
      this.count++
    } else {
      // Full: overwrite the oldest.
      this.ring[this.start] = e
      this.start = (this.start + 1) % this.capacity
      this.droppedCount++
    }
    this.bump()
  }

  snapshot(): TrafficEntry[] {
    const out: TrafficEntry[] = []
    for (let i = 0; i < this.count; i++) {
      const e = this.ring[(this.start + i) % this.capacity]
      if (e) out.push(e)
    }
    return out
  }

  get size(): number {
    return this.count
  }

  clear(): void {
    this.ring = []
    this.start = 0
    this.count = 0
    this.droppedCount = 0
    this.bump()
  }

  /** A plain text export: one message per line, full hex, with a short decoded summary. */
  export(header: readonly string[] = [], zone: StampZone = 'local'): string {
    let s = 'arc SysEx log\n'
    for (const h of header) s += h + '\n'
    if (this.droppedCount > 0) s += `(${this.droppedCount} older messages not kept)\n`
    s += '\n'
    for (const e of this.snapshot()) {
      s += stamp(e.time, zone) + '  '
      if (e.dir === 'NOTE') s += '--   ' + String(e.note)
      else s += (e.dir === 'OUT' ? 'OUT  ' : 'IN   ') + describe(e.bytes) + '  ' + toHex(e.bytes)
      s += '\n'
    }
    return s
  }

  private bump(): void {
    const v = ++this._version
    for (const cb of this.listeners) {
      // A failing UI listener must not break the transport that is logging.
      try {
        cb(v)
      } catch (err) {
        queueMicrotask(() => {
          throw err
        })
      }
    }
  }
}
