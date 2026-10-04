// Request/response session over any MIDI-like transport.
//
// transport = {
//   send(bytes: Uint8Array): void,
//   onMessage(cb: (bytes: Uint8Array) => void): () => void,  // returns unsubscribe
//   close?(): void,
// }

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
} from './frame.js'

export class DeviceError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'DeviceError'
    this.status = status
  }
}

export class TimeoutError extends DeviceError {
  constructor(label) {
    super(`The device did not answer (${label}). Check the cable and try again.`)
    this.name = 'TimeoutError'
  }
}

const FILE_INIT = 1
const FILE_INIT_SUBSCRIBE = 1
const MAX_RESPONSE = 4 * 1024 * 1024

export class Session {
  constructor(transport, { log } = {}) {
    this.transport = transport
    this.log = log ?? null
    this.deviceId = DEFAULT_DEVICE_ID
    this.info = null
    this._id = Math.floor(Math.random() * 4096)
    this._waiters = new Map()
    this._ackHandlers = new Map()
    this._identityWaiter = null
    this._pushListeners = new Set()
    this._closed = false
    this._unsub = transport.onMessage((d) => this._dispatch(d))
  }

  _nextId() {
    this._id = (this._id + 1) % 4096
    return this._id
  }

  _dispatch(raw) {
    const d = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
    if (d[0] === 0xf0 && d[1] === 0x7e) {
      const id = parseIdentity(d)
      if (id && this._identityWaiter) {
        const w = this._identityWaiter
        this._identityWaiter = null
        w(id)
      }
      return
    }
    const f = decodeFrame(d)
    if (!f) return
    if (f.isRequest) {
      if (!f.hasId) for (const cb of this._pushListeners) cb(f)
      return
    }
    const ack = this._ackHandlers.get(f.requestId)
    if (ack) {
      this._ackHandlers.delete(f.requestId)
      ack(f)
      return
    }
    const w = this._waiters.get(f.requestId)
    if (!w) return
    if (w.progress && f.status >= STATUS.SPECIFIC_SUCCESS_START) {
      // Intermediate progress: keep waiting, restart the clock.
      clearTimeout(w.timer)
      w.timer = setTimeout(w.onTimeout, w.timeout)
      return
    }
    clearTimeout(w.timer)
    this._waiters.delete(f.requestId)
    w.resolve(f)
  }

  /** Listen for unsolicited device pushes (file added / deleted / metadata changed). */
  onPush(cb) {
    this._pushListeners.add(cb)
    return () => this._pushListeners.delete(cb)
  }

  /**
   * Send a request and wait for its reply.
   * @returns {Promise<{status:number, payload:Uint8Array, command:number}>}
   */
  request(command, payload = [], { timeout = 3000, check = true, label, progress = false } = {}) {
    if (this._closed) return Promise.reject(new DeviceError('Not connected'))
    const id = this._nextId()
    const frame = encodeRequest(this.deviceId, id, command, Uint8Array.from(payload))
    const name = label ?? `cmd ${command}`
    const p = new Promise((resolve, reject) => {
      const onTimeout = () => {
        this._waiters.delete(id)
        reject(new TimeoutError(name))
      }
      this._waiters.set(id, {
        resolve,
        reject,
        timeout,
        progress,
        onTimeout,
        timer: setTimeout(onTimeout, timeout),
      })
    })
    this.transport.send(frame)
    if (!check) return p
    return p.then((f) => {
      if (f.status !== STATUS.OK) {
        const reason = new TextDecoder().decode(f.payload).replace(/\0+$/, '')
        throw new DeviceError(`${name} failed: ${statusText(f.status)}${reason ? ` (${reason})` : ''}`, f.status)
      }
      return f
    })
  }

  /** Fire a request without waiting. `onAck` runs if the device answers it. */
  send(command, payload = [], onAck) {
    const id = this._nextId()
    if (onAck) this._ackHandlers.set(id, onAck)
    this.transport.send(encodeRequest(this.deviceId, id, command, Uint8Array.from(payload)))
    return id
  }

  forgetAck(id) {
    this._ackHandlers.delete(id)
  }

  file(payload, opts = {}) {
    return this.request(CMD.FILE, payload, opts)
  }

  async _identify(timeout = 1500) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._identityWaiter = null
        resolve(null)
      }, timeout)
      this._identityWaiter = (id) => {
        clearTimeout(timer)
        resolve(id)
      }
      this.transport.send(IDENTITY_REQUEST)
    })
  }

  /**
   * Identity → GREET → FILE INIT. Also required after every completed file
   * transfer, otherwise the device drops the next command.
   */
  async handshake() {
    const id = await this._identify()
    if (id) {
      this.deviceId = id.deviceId
    }
    const greet = await this.request(CMD.GREET, [], { timeout: 3000, label: 'greet' })
    const meta = parseGreet(new TextDecoder().decode(greet.payload))
    await this.file([FILE_INIT, FILE_INIT_SUBSCRIBE, ...be32(MAX_RESPONSE)], { label: 'file init' })
    this.info = {
      product: meta.product || 'EP',
      sku: meta.sku || id?.sku || '',
      osVersion: meta.os_version || meta.sw_version || '',
      serial: meta.serial || '',
      mode: meta.mode || '',
    }
    return this.info
  }

  close() {
    this._closed = true
    for (const w of this._waiters.values()) {
      clearTimeout(w.timer)
      w.reject(new DeviceError('Disconnected'))
    }
    this._waiters.clear()
    this._ackHandlers.clear()
    this._unsub?.()
    this.transport.close?.()
  }
}
