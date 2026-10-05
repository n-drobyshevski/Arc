// Port of core/src/test/kotlin/dev/arc/ep133/testing/ScriptedTransport.kt
//
// A transport whose device side is a script, the TE response frame builder,
// and a fixed "random" to pin the first request id.

import { pack7 } from '../../src/core/protocol/packed7'
import { decodeFrame } from '../../src/core/protocol/frame'
import type { Transport } from '../../src/core/protocol/transport'

/** A TE response frame, as the device (and mock-device.js reply()) builds it. */
export function responseFrame(
  deviceId: number,
  requestId: number,
  command: number,
  status: number,
  payload: Uint8Array = new Uint8Array(0),
): Uint8Array {
  const packed = pack7(payload)
  const out = new Uint8Array(11 + packed.length)
  out[0] = 0xf0
  out[1] = 0x00
  out[2] = 0x20
  out[3] = 0x76
  out[4] = deviceId
  out[5] = 0x40
  out[6] = 0x20 | ((requestId >> 7) & 0x1f)
  out[7] = requestId & 0x7f
  out[8] = command
  out[9] = status
  out.set(packed, 10)
  out[out.length - 1] = 0xf7
  return out
}

/** The device-side script: runs (asynchronously) for every sent message. */
export type Respond = (req: Uint8Array, t: ScriptedTransport) => void | Promise<void>

/**
 * A transport whose device side is a script: [respond] runs in a microtask for
 * every sent message (Kotlin `scope.launch`). Emitted messages are delivered in
 * order, each in its own microtask (Kotlin's unlimited Channel). A script that
 * throws or rejects surfaces as an unhandled error and fails the test, like an
 * exception in a launched coroutine.
 */
export class ScriptedTransport implements Transport {
  readonly sent: Uint8Array[] = []
  closed = false
  private readonly listeners = new Set<(b: Uint8Array) => void>()
  private readonly respond: Respond

  constructor(respond: Respond) {
    this.respond = respond
  }

  send(b: Uint8Array): void {
    const copy = b.slice()
    this.sent.push(copy)
    queueMicrotask(() => {
      void this.respond(copy, this)
    })
  }

  onMessage(cb: (b: Uint8Array) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  close(): void {
    this.closed = true
  }

  emit(b: Uint8Array): void {
    const copy = b.slice()
    queueMicrotask(() => {
      for (const cb of [...this.listeners]) cb(copy)
    })
  }

  /** Answer [req] (a sent request frame) with [status] and [payload], always as device 0x33. */
  reply(req: Uint8Array, status: number, payload: Uint8Array = new Uint8Array(0)): void {
    const f = decodeFrame(req)
    if (!f) throw new Error('reply: not a TE frame')
    this.emit(responseFrame(0x33, f.requestId, f.command, status, payload))
  }
}

/**
 * Kotlin's FixedRandom(value) for `new Session(t, { random })`: the Session takes
 * `Math.floor(random() * 4096)` as its starting id, so this returns value / 4096
 * (exact for any integer 0..4095). The first request id is then value + 1.
 */
export function fixedRandom(value: number): () => number {
  return () => value / 4096
}

/** Lets queued microtasks (sends, replies, script steps) run. Works with or without fake timers. */
export async function settle(rounds = 50): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve()
}
