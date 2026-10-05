// Port of core/src/main/kotlin/dev/arc/ep133/protocol/Session.kt (+ reference/src/protocol/session.js)
//
// Request/response session over any MIDI-like Transport. The JS event loop is
// the Kotlin `loop` dispatcher: all session state is touched from one thread,
// and the upload window relies on that (ack callbacks mutate it between awaits).

import { DeviceError, TimeoutError } from './errors'
import {
  CMD,
  DEFAULT_DEVICE_ID,
  IDENTITY_REQUEST,
  STATUS,
  be32,
  decodeFrame,
  encodeRequest,
  parseGreet,
  parseIdentity,
  statusText,
  type ByteInput,
  type Frame,
  type Identity,
} from './frame'
import type { Transport } from './transport'

/** What the device said about itself during the handshake. */
export interface DeviceInfo {
  product: string
  sku: string
  osVersion: string
  serial: string
  mode: string
}

export interface RequestOptions {
  /** Milliseconds to wait for the reply (default 3000). */
  timeout?: number
  /** Throw a [DeviceError] naming the request when the status is not 0 (default true). */
  check?: boolean
  /** Names the request in errors (default `cmd N`). */
  label?: string
  /** Statuses of 64 and up are "still working" and restart the timeout (default false). */
  progress?: boolean
}

export interface SessionOptions {
  /** Like Math.random(); picks the starting request id. Tests pin it. */
  random?: () => number
}

export type AckHandler = (f: Frame) => void
export type PushListener = (f: Frame) => void

interface Waiter {
  id: number
  timeout: number
  progress: boolean
  label: string
  resolve: (f: Frame) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout> | undefined
}

const FILE_INIT = 1
const FILE_INIT_SUBSCRIBE = 1
const MAX_RESPONSE = 4 * 1024 * 1024
const EMPTY = new Uint8Array(0)

export class Session {
  deviceId: number = DEFAULT_DEVICE_ID
  info: DeviceInfo | null = null

  private readonly transport: Transport
  // Starts at a random id (Math.random() * 4096); the first id used is that + 1.
  private id: number
  // Insertion-ordered: close() rejects in the order requests were made.
  private readonly waiters = new Map<number, Waiter>()
  private readonly ackHandlers = new Map<number, AckHandler>()
  private identityWaiter: ((id: Identity) => void) | null = null
  private readonly pushListeners = new Set<PushListener>()
  private closed = false
  private readonly unsub: () => void

  constructor(transport: Transport, { random = Math.random }: SessionOptions = {}) {
    this.transport = transport
    this.id = Math.floor(random() * 4096)
    this.unsub = transport.onMessage((d) => this.dispatch(d))
  }

  get isClosed(): boolean {
    return this.closed
  }

  private nextId(): number {
    this.id = (this.id + 1) % 4096
    return this.id
  }

  private startTimer(w: Waiter): void {
    clearTimeout(w.timer)
    w.timer = setTimeout(() => {
      // Deleted by id: after an id wrap this also drops a newer request that
      // reused the id (it then times out too).
      this.waiters.delete(w.id)
      w.reject(new TimeoutError(w.label))
    }, w.timeout)
  }

  private dispatch(d: Uint8Array): void {
    // Nothing is delivered after close().
    if (this.closed) return
    if (d.length >= 2 && d[0] === 0xf0 && d[1] === 0x7e) {
      // Every universal non-realtime message is consumed here, even if it
      // is not an identity reply or nobody is waiting for one.
      const ident = parseIdentity(d)
      const w = this.identityWaiter
      if (ident && w) {
        this.identityWaiter = null
        w(ident)
      }
      return
    }
    const f = decodeFrame(d)
    if (!f) return
    if (f.isRequest) {
      // Only unsolicited pushes (request flag, no id) reach listeners;
      // device-originated requests with an id are ignored.
      if (!f.hasId) this.notifyPush(f)
      return
    }
    // Fire-and-forget acks are matched before waiters and fire once.
    const ack = this.ackHandlers.get(f.requestId)
    if (ack) {
      this.ackHandlers.delete(f.requestId)
      try {
        ack(f)
      } catch {
        // Swallowed, like the Kotlin runCatching.
      }
      return
    }
    const w = this.waiters.get(f.requestId)
    if (!w) {
      // A reply-shaped frame nobody waits for. How the device marks its FILE
      // events is undocumented, so these reach push listeners too (the live
      // mirror); they never complete or disturb a request.
      this.notifyPush(f)
      return
    }
    if (w.progress && f.status >= STATUS.SPECIFIC_SUCCESS_START) {
      // Intermediate progress: keep waiting, restart the full timeout.
      this.startTimer(w)
      return
    }
    clearTimeout(w.timer)
    this.waiters.delete(f.requestId)
    w.resolve(f)
  }

  private notifyPush(f: Frame): void {
    // A listener that throws stops the rest for this frame; the error is swallowed.
    for (const cb of [...this.pushListeners]) {
      try {
        cb(f)
      } catch {
        break
      }
    }
  }

  /**
   * Listen for unsolicited device pushes (file added / deleted / metadata
   * changed): request frames without an id, and replies no request waits for.
   * Returns an unsubscribe function.
   */
  onPush(cb: PushListener): () => void {
    this.pushListeners.add(cb)
    return () => {
      this.pushListeners.delete(cb)
    }
  }

  /**
   * Send a request and wait for its reply.
   * With `check`, a non-zero status throws a [DeviceError] naming the request.
   * With `progress`, statuses of 64 and up are "still working" and restart the timeout.
   */
  async request(command: number, payload: ByteInput = EMPTY, opts: RequestOptions = {}): Promise<Frame> {
    const { timeout = 3000, check = true, label, progress = false } = opts
    if (this.closed) throw new DeviceError('Not connected')
    const reqId = this.nextId()
    const name = label ?? `cmd ${command}`
    const frame = encodeRequest(this.deviceId, reqId, command, payload)
    let resolve!: (f: Frame) => void
    let reject!: (e: Error) => void
    const result = new Promise<Frame>((res, rej) => {
      resolve = res
      reject = rej
    })
    const w: Waiter = { id: reqId, timeout, progress, label: name, resolve, reject, timer: undefined }
    // Register before sending so the reply can never arrive first.
    this.waiters.set(reqId, w)
    this.startTimer(w)
    try {
      this.transport.send(frame)
    } catch (e) {
      if (this.waiters.get(reqId) === w) this.waiters.delete(reqId)
      clearTimeout(w.timer)
      throw e
    }
    const f = await result
    if (check && f.status !== STATUS.OK) {
      const reason = new TextDecoder().decode(f.payload).replace(/\0+$/, '')
      throw new DeviceError(`${name} failed: ${statusText(f.status)}${reason ? ` (${reason})` : ''}`, f.status)
    }
    return f
  }

  /**
   * Fire a request without waiting; `onAck` runs (once) if the device answers it.
   * Returns the request id. Like the Kotlin and JS it does not check whether the
   * session is closed.
   */
  send(command: number, payload: ByteInput = EMPTY, onAck?: AckHandler): number {
    const reqId = this.nextId()
    if (onAck) this.ackHandlers.set(reqId, onAck)
    this.transport.send(encodeRequest(this.deviceId, reqId, command, payload))
    return reqId
  }

  forgetAck(reqId: number): void {
    this.ackHandlers.delete(reqId)
  }

  file(payload: ByteInput, opts: RequestOptions = {}): Promise<Frame> {
    return this.request(CMD.FILE, payload, opts)
  }

  /** Universal identity request. Resolves null on timeout instead of failing. */
  identify(timeout = 1500): Promise<Identity | null> {
    return new Promise<Identity | null>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      this.identityWaiter = (ident) => {
        clearTimeout(timer)
        resolve(ident)
      }
      try {
        this.transport.send(IDENTITY_REQUEST.slice())
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
        return
      }
      timer = setTimeout(() => {
        // Cleared unconditionally on timeout, even if another identify has
        // installed its own waiter since.
        this.identityWaiter = null
        resolve(null)
      }, timeout)
    })
  }

  /**
   * Identity → GREET → FILE INIT. Also required after every completed file
   * transfer, otherwise the device drops the next command.
   */
  async handshake(): Promise<DeviceInfo> {
    const ident = await this.identify()
    // A device that does not answer identity keeps the previous device id.
    if (ident) this.deviceId = ident.deviceId
    const greet = await this.request(CMD.GREET, EMPTY, { timeout: 3000, label: 'greet' })
    const meta = parseGreet(new TextDecoder().decode(greet.payload))
    await this.file([FILE_INIT, FILE_INIT_SUBSCRIBE, ...be32(MAX_RESPONSE)], { label: 'file init' })
    const info: DeviceInfo = {
      product: meta.product || 'EP',
      sku: meta.sku || ident?.sku || '',
      osVersion: meta.os_version || meta.sw_version || '',
      serial: meta.serial || '',
      mode: meta.mode || '',
    }
    this.info = info
    return info
  }

  /**
   * Rejects everything pending with "Disconnected" and closes the transport.
   * Safe to call more than once.
   */
  close(): void {
    if (this.closed) return
    this.closed = true
    const pending = [...this.waiters.values()]
    this.waiters.clear()
    this.ackHandlers.clear()
    for (const w of pending) {
      clearTimeout(w.timer)
      w.reject(new DeviceError('Disconnected'))
    }
    try {
      this.unsub()
    } catch {
      // ignore
    }
    try {
      this.transport.close?.()
    } catch {
      // Swallowed, like the Kotlin runCatching.
    }
  }
}
