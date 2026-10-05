// Port of core/src/test/kotlin/dev/arc/ep133/features/PadPushTest.kt
import { describe, expect, it } from 'vitest'
import { LiveMirror } from '../../../src/core/features/liveMirror'
import { fid, parse, PadOrder, type PadFid } from '../../../src/core/features/padPush'
import type { Frame } from '../../../src/core/protocol/frame'
import { Session } from '../../../src/core/protocol/session'
import { bytes } from '../../../src/core/util/bytes'
import { MockEP133 } from '../../helpers/mockDevice'
import { settle } from '../../helpers/scriptedTransport'

const frame = (command: number, payload: Uint8Array): Frame => ({
  deviceId: 0x33,
  isRequest: true,
  hasId: false,
  requestId: -1,
  command,
  status: -1,
  payload,
})

const event = (json: string, code = 0x03, node = 3200): Uint8Array =>
  bytes(code & 0xff, (node >> 8) & 0xff, node & 0xff, json, 0)

const noteOn = (channel: number, note: number, velocity: number, time: number) =>
  ({ type: 'NoteOn', channel, note, velocity, time }) as const

describe('PadPushTest', () => {
  it('pad file ids split into project, group and pad', () => {
    expect(fid(3210)).toEqual({ project: 1, group: 0, pad: 10 }) // group A '.' in project 1 (kmorrill's example)
    expect(fid(9502)).toEqual({ project: 7, group: 3, pad: 2 }) // ep133-krate's capture: project 7, group D, '8'
    expect(fid(3512)).toEqual({ project: 1, group: 3, pad: 12 })
    expect(fid(3200)).toBeNull() // a group dir, not a pad
    expect(fid(3213)).toBeNull()
    expect(fid(3610)).toBeNull() // no group E
    expect(fid(2000)).toBeNull()
  })

  it('a metadata event with an active pad, and what is not one', () => {
    expect(parse(frame(5, event('{"active":3210}')))).toEqual({ project: 1, group: 0, pad: 10 })
    expect(parse(frame(5, event('{"active":4301,"x":1}', 0x03, 4300)))).toEqual({ project: 2, group: 1, pad: 1 })
    // Without the trailing 0 too.
    const noZero = event('{"active":3203}')
    expect(parse(frame(5, noZero.subarray(0, noZero.length - 1)))).toEqual({ project: 1, group: 0, pad: 3 })
    expect(parse(frame(1, event('{"active":3210}')))).toBeNull()
    expect(parse(frame(5, event('{"active":3210}', 0x08)))).toBeNull()
    expect(parse(frame(5, event('{"name":"kick"}')))).toBeNull()
    expect(parse(frame(5, event('{"active":"3210"}')))).toBeNull()
    expect(parse(frame(5, event('{"active":3210.5}')))).toBeNull()
    expect(parse(frame(5, event('not json')))).toBeNull()
    expect(parse(frame(5, Uint8Array.of(3)))).toBeNull()
  })

  it('pushes reach the mirror through the session, request- or reply-shaped', async () => {
    const dev = new MockEP133()
    const s = new Session(dev.transport())
    await s.handshake()
    const got: PadFid[] = []
    const off = s.onPush((f) => {
      const p = parse(f)
      if (p) got.push(p)
    })
    dev.pushPadActive(1, 0, 10)
    dev.pushPadActive(1, 2, 4, true)
    await settle()
    expect(got).toEqual([
      { project: 1, group: 0, pad: 10 },
      { project: 1, group: 2, pad: 4 },
    ])
    // The session still works after a stray reply.
    await s.handshake()
    off()
    dev.pushPadActive(1, 1, 1)
    await settle()
    expect(got.length).toBe(2)
    s.close()
  })

  it('bottom-up pad order names pads without learning', () => {
    // Kotlin times are ns; here ms (1 ns = 1e-6 ms).
    const m = new LiveMirror(new Map(), PadOrder.FROM_BOTTOM)
    // Counted from the bottom, '.' (offset 0) is p01 and '7' (offset 9) is p10.
    m.setProject(1, [{ name: 'a', pads: new Map([[1, 5], [10, 1]]) }])
    m.setNames(new Map([[1, 'kick'], [5, 'snare']]))
    m.onMidi(noteOn(1, 36, 100, 0))
    expect(m.snapshot(1e-6).lastHit!.name).toBe('snare')
    m.onMidi(noteOn(1, 45, 100, 2e-6))
    expect(m.snapshot(3e-6).lastHit!.name).toBe('kick')
    m.setPadOrder(PadOrder.FROM_TOP)
    // From the top, nothing is learned yet: no name.
    m.onMidi(noteOn(1, 36, 100, 4e-6))
    expect(m.snapshot(5e-6).lastHit!.name).toBeNull()
    expect(m.snapshot(5e-6).padOrder).toBe(PadOrder.FROM_TOP)
  })
})
