// Port of core/src/test/kotlin/dev/arc/ep133/protocol/SessionTest.kt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceError, TimeoutError } from '../../../src/core/protocol/errors'
import { decodeFrame } from '../../../src/core/protocol/frame'
import { Session } from '../../../src/core/protocol/session'
import type { Transport } from '../../../src/core/protocol/transport'
import { bytes, concat } from '../../../src/core/util/bytes'
import { hex } from '../../helpers/bytes'
import { ScriptedTransport, fixedRandom, responseFrame } from '../../helpers/scriptedTransport'

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Runs every queued microtask (setImmediate is not faked). */
const flush = () => new Promise<void>((r) => setImmediate(r))

function session(
  respond: (t: ScriptedTransport, req: Uint8Array) => void | Promise<void>,
  first = 4094,
): [Session, ScriptedTransport] {
  const t = new ScriptedTransport((req, tr) => respond(tr, req))
  return [new Session(t, { random: fixedRandom(first) }), t]
}

const idOf = (frame: Uint8Array) => decodeFrame(frame)!.requestId

/** Like Kotlin runCatching: never rejects, so pending promises are never unhandled. */
function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: Error }> {
  return p.then(
    (value) => ({ value }),
    (error: Error) => ({ error }),
  )
}

describe('SessionTest', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('request ids are 12 bit and wrap after 4095', async () => {
    const [s, t] = session((t, req) => t.reply(req, 0), 4094)
    await s.request(1)
    await s.request(1)
    expect(t.sent.map(idOf)).toEqual([4095, 0])
    // bytes 6 and 7 carry the id: 0x40|0x20|(4095>>7) and 4095&0x7f
    expect(t.sent[0]![6]).toBe(0x7f)
    expect(t.sent[0]![7]).toBe(0x7f)
    s.close()
  })

  it('replies are matched by request id', async () => {
    const [s] = session((t, req) => {
      const id = idOf(req)
      // A reply for some other id first; it must be ignored.
      t.emit(responseFrame(0x33, (id + 7) % 4096, 5, 1))
      t.reply(req, 0, Uint8Array.of(9))
    })
    const f = await s.request(5, Uint8Array.of(4, 0, 0, 0, 0))
    expect(f.status).toBe(0)
    expect(f.payload[0]).toBe(9)
    s.close()
  })

  it('fire-and-forget acks run once', async () => {
    const [s, t] = session((t, req) => {
      t.reply(req, 0)
      t.reply(req, 0)
    })
    let acks = 0
    s.send(5, Uint8Array.of(2, 1, 0, 0), () => acks++)
    await flush()
    expect(acks).toBe(1)
    expect(t.sent.length).toBe(1)
    s.close()
  })

  it('a progress status restarts the timeout', async () => {
    const [s] = session(async (t, req) => {
      await delay(800)
      t.reply(req, 64)
      await delay(800)
      t.reply(req, 65)
      await delay(800)
      t.reply(req, 0)
    })
    const start = Date.now()
    const p = settle(s.request(5, undefined, { timeout: 1000, progress: true, label: 'barrier' }))
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.error).toBeUndefined()
    expect(r.value?.status).toBe(0)
    expect(Date.now() - start).toBe(2400)
    s.close()
  })

  it('without progress a status of 64 or more is final', async () => {
    const [s] = session((t, req) => t.reply(req, 64))
    const e = await s.request(5, undefined, { label: 'x' }).catch((e: unknown) => e)
    expect(e).toBeInstanceOf(DeviceError)
    expect((e as Error).message).toBe('x failed: in progress')
    s.close()
  })

  it('a missing reply times out with the JS message', async () => {
    const [s] = session(() => {})
    const start = Date.now()
    const p = settle(s.request(1, undefined, { label: 'greet' }))
    await vi.runAllTimersAsync()
    const { error } = await p
    expect(error).toBeInstanceOf(TimeoutError)
    expect(error?.message).toBe('The device did not answer (greet). Check the cable and try again.')
    expect(Date.now() - start).toBe(3000)
    s.close()
  })

  it('a failure status carries the device reason', async () => {
    const [s] = session((t, req) => t.reply(req, 1, concat(bytes('nope'), Uint8Array.of(0, 0))))
    const e = await s.request(5, undefined, { label: 'list 1000' }).catch((e: unknown) => e)
    expect(e).toBeInstanceOf(DeviceError)
    expect((e as DeviceError).message).toBe('list 1000 failed: error (nope)')
    expect((e as DeviceError).status).toBe(1)
    const e2 = await session((t, req) => t.reply(req, 17))[0].request(5).catch((e: unknown) => e)
    expect(e2).toBeInstanceOf(DeviceError)
    expect((e2 as Error).message).toBe('cmd 5 failed: device error 17')
    s.close()
  })

  it('check false returns any status', async () => {
    const [s] = session((t, req) => t.reply(req, 2))
    expect((await s.request(5, undefined, { check: false })).status).toBe(2)
    s.close()
  })

  it('close rejects pending requests and later ones', async () => {
    const [s, t] = session(() => {})
    const pending = settle(s.request(1, undefined, { label: 'greet' }))
    await vi.advanceTimersByTimeAsync(10)
    s.close()
    const r = await pending
    expect(r.error?.message).toBe('Disconnected')
    const e = await s.request(1).catch((e: unknown) => e)
    expect(e).toBeInstanceOf(DeviceError)
    expect((e as Error).message).toBe('Not connected')
    expect(t.closed).toBe(true)
  })

  it('handshake sends identity, greet and file init and applies fallbacks', async () => {
    const [s, t] = session((t, req) => {
      if (req[1] === 0x7e) {
        t.emit(hex('F0 7E 21 06 02 00 20 76 20 00 01 00 00 00 00 00 F7'))
        return
      }
      const f = decodeFrame(req)!
      if (f.command === 1) t.reply(req, 0, concat(bytes('product:;sw_version:1.2;serial:X1;mode:normal'), Uint8Array.of(0)))
      else t.reply(req, 0)
    })
    const info = await s.handshake()
    expect(info).toEqual({ product: 'EP', sku: 'TE032AS001', osVersion: '1.2', serial: 'X1', mode: 'normal' })
    expect(s.deviceId).toBe(0x21)
    expect(t.sent.length).toBe(3)
    expect([...t.sent[0]!].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')).toBe('F0 7E 7F 06 01 F7')
    // FILE INIT payload 01 01 00 40 00 00, sent to the device id learnt from identity
    const init = decodeFrame(t.sent[2]!)!
    expect(init.deviceId).toBe(0x21)
    expect([...init.payload]).toEqual([1, 1, 0, 0x40, 0, 0])
    s.close()
  })

  it('handshake tolerates a device that ignores identity', async () => {
    const [s] = session((t, req) => {
      if (req[1] === 0x7e) return
      const f = decodeFrame(req)!
      if (f.command === 1) t.reply(req, 0, bytes('product:EP-133;os_version:2.0.5;sku:TE032AS001'))
      else t.reply(req, 0)
    })
    const p = settle(s.handshake())
    await vi.advanceTimersByTimeAsync(1500)
    const { value: info, error } = await p
    expect(error).toBeUndefined()
    expect(info?.product).toBe('EP-133')
    expect(info?.osVersion).toBe('2.0.5')
    expect(s.deviceId).toBe(0x33)
    s.close()
  })

  it('unrelated messages are ignored', async () => {
    const [s] = session((t, req) => {
      t.emit(hex('90 3C 7F')) // note on
      t.emit(hex('F0 41 10 42 12 F7')) // other manufacturer
      t.emit(hex('F0 7E 7F 09 01 F7')) // universal non-identity
      t.reply(req, 0)
    })
    expect((await s.request(5)).status).toBe(0)
    s.close()
  })

  it('nothing is delivered after close', async () => {
    const [s, t] = session(() => {})
    const pending = settle(s.request(5, undefined, { label: 'x' }))
    await vi.advanceTimersByTimeAsync(10)
    // A reply that arrives after close() must not resolve the request.
    const req = t.sent[t.sent.length - 1]!
    s.close()
    t.reply(req, 0)
    expect((await pending).error?.message).toBe('Disconnected')
  })

  it('a timed out request removes its id even if a newer request reused it', async () => {
    // JS deletes the waiter by id. With the id wrapped, the older request's
    // timeout also drops the newer one, whose reply is then ignored.
    const [s, t] = session(() => {}, 9)
    const old = settle(s.request(5, undefined, { timeout: 100, label: 'old' })) // id 10
    await vi.advanceTimersByTimeAsync(1)
    // Use up the other 4095 ids so the next request gets id 10 again.
    for (let i = 0; i < 4095; i++) s.send(11)
    const young = settle(s.request(5, undefined, { timeout: 300, label: 'young' })) // id 10 again
    await vi.advanceTimersByTimeAsync(150)
    expect(idOf(t.sent[t.sent.length - 1]!)).toBe(10)
    t.reply(t.sent[t.sent.length - 1]!, 0)
    await vi.runAllTimersAsync()
    expect((await old).error?.message).toBe('The device did not answer (old). Check the cable and try again.')
    expect((await young).error?.message).toBe('The device did not answer (young). Check the cable and try again.')
    s.close()
  })

  it('a throwing push listener stops the rest for that frame', async () => {
    const [s, t] = session(() => {})
    const calls: string[] = []
    s.onPush(() => {
      calls.push('a')
      throw new Error('boom')
    })
    s.onPush(() => {
      calls.push('b')
    })
    t.emit(hex('F0 00 20 76 33 40 40 00 05 00 07 F7'))
    await flush()
    expect(calls).toEqual(['a'])
    s.close()
  })
})

// Not Kotlin test cases: they pin the Session.kt behaviour that differs from
// reference/src/protocol/session.js (port-map deltas S1, S3, S4, S5) and the
// identify timeout quirk, so a later "simplify towards the JS" cannot drop them.
describe('Session Kotlin deltas', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('S1: a reply-shaped frame nobody waits for reaches push listeners', async () => {
    const [s, t] = session(() => {})
    const got: number[] = []
    s.onPush((f) => got.push(f.requestId))
    t.emit(responseFrame(0x33, 77, 5, 0))
    await flush()
    expect(got).toEqual([77])
    s.close()
  })

  it('S1: replies that match a waiter or an ack do not reach push listeners', async () => {
    const [s, t] = session((t, req) => t.reply(req, 0))
    const got: number[] = []
    s.onPush((f) => got.push(f.requestId))
    let acks = 0
    s.send(5, Uint8Array.of(2, 1, 0, 0), () => acks++)
    await s.request(1)
    await flush()
    expect(acks).toBe(1)
    expect(got).toEqual([])
    expect(t.sent.length).toBe(2)
    s.close()
  })

  it('S3: an ack handler that throws is swallowed and fires once', async () => {
    const [s] = session((t, req) => {
      t.reply(req, 0)
      t.reply(req, 0)
    })
    const pushes: number[] = []
    s.onPush((f) => pushes.push(f.requestId))
    let calls = 0
    const id = s.send(5, Uint8Array.of(2, 1, 0, 0), () => {
      calls++
      throw new Error('boom')
    })
    await flush()
    expect(calls).toBe(1)
    // The second reply has no handler left, so it is an unmatched reply (S1).
    expect(pushes).toEqual([id])
    // The session still works afterwards.
    expect((await s.request(1)).status).toBe(0)
    s.close()
  })

  it('S4: a send that throws removes the waiter and rethrows', async () => {
    const t: Transport & { sends: number } = {
      sends: 0,
      send() {
        this.sends++
        throw new Error('port gone')
      },
      onMessage: () => () => {},
    }
    const s = new Session(t, { random: () => 0 })
    const e = await s.request(1, undefined, { label: 'greet' }).catch((e: unknown) => e)
    expect((e as Error).message).toBe('port gone')
    // No timer is left behind: nothing times out later.
    expect(vi.getTimerCount()).toBe(0)
    s.close()
  })

  it('S5: close is idempotent and swallows transport close errors', async () => {
    let closes = 0
    const t: Transport = {
      send() {},
      onMessage: () => () => {},
      close() {
        closes++
        throw new Error('already closed')
      },
    }
    const s = new Session(t, { random: () => 0 })
    const a = settle(s.request(1, undefined, { label: 'a' }))
    const b = settle(s.request(1, undefined, { label: 'b' }))
    const order: string[] = []
    void a.then(() => order.push('a'))
    void b.then(() => order.push('b'))
    expect(() => s.close()).not.toThrow()
    expect(() => s.close()).not.toThrow()
    expect(closes).toBe(1)
    expect((await a).error?.message).toBe('Disconnected')
    expect((await b).error?.message).toBe('Disconnected')
    await flush()
    expect(order).toEqual(['a', 'b'])
    expect(s.isClosed).toBe(true)
  })

  it('send does not check whether the session is closed', () => {
    const [s, t] = session(() => {}, 0)
    s.close()
    expect(s.send(11)).toBe(1)
    expect(t.sent.length).toBe(1)
  })

  it('an identify timeout clears the identity waiter unconditionally', async () => {
    const [s, t] = session(() => {})
    const first = s.identify(100)
    await vi.advanceTimersByTimeAsync(50)
    const second = s.identify(100)
    // The first timeout fires and also clears the second identify's waiter.
    await vi.advanceTimersByTimeAsync(60)
    expect(await first).toBeNull()
    t.emit(hex('F0 7E 21 06 02 00 20 76 20 00 01 00 00 00 00 00 F7'))
    await flush()
    await vi.advanceTimersByTimeAsync(100)
    expect(await second).toBeNull()
    s.close()
  })
})
