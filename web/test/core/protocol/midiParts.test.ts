// Port of core/src/test/kotlin/dev/arc/ep133/protocol/MidiPartsTest.kt
// (+ the "MIDI input" cases of core/src/test/kotlin/dev/arc/ep133/features/LiveMirrorTest.kt)
import { describe, expect, it } from 'vitest'
import { hexBytes as hex, toHex } from '../../../src/core/util/bytes'
import { encodeRequest } from '../../../src/core/protocol/frame'
import { LoggingTransport } from '../../../src/core/protocol/loggingTransport'
import { MidiInput, type MidiEvent } from '../../../src/core/protocol/midiInput'
import { matches, pick } from '../../../src/core/protocol/portMatch'
import { SysexAssembler } from '../../../src/core/protocol/sysexAssembler'
import { TrafficLog, describe as describeMsg } from '../../../src/core/protocol/trafficLog'
import type { Transport } from '../../../src/core/protocol/transport'

const greetReply = hex(
  'F0 00 20 76 33 40 37 14 01 00 00 70 72 6F 64 75 63 74 00 3A 45 50 2D 31 33 33 00 3B 6D 6F 64 65 3A 6E 00 6F 72 6D 61 6C 3B 73 00 6B 75 3A 54 45 30 33 00 32 41 53 30 30 31 3B 00 6F 73 5F 76 65 72 73 00 69 6F 6E 3A 31 2E 31 00 2E 32 3B 73 77 5F 76 00 65 72 73 69 6F 6E 3A 00 31 2E 31 2E 32 3B 62 00 6C 5F 76 65 72 73 69 00 6F 6E 3A 31 30 30 30 00 2E 30 2E 31 30 3B 73 00 65 72 69 61 6C 3A 45 00 33 50 54 56 32 4A 54 F7',
)

describe('MidiPartsTest', () => {
  it('a reply split at any point is reassembled', () => {
    for (let cut = 1; cut < greetReply.length; cut++) {
      const got: Uint8Array[] = []
      const a = new SysexAssembler((m) => got.push(m))
      a.feed(greetReply, 0, cut)
      expect(got.length).toBe(0)
      a.feed(greetReply, cut, greetReply.length - cut)
      expect(got.length).toBe(1)
      expect(got[0]).toEqual(greetReply)
    }
  })

  it('a reply delivered one byte at a time with realtime bytes in between', () => {
    const got: Uint8Array[] = []
    const a = new SysexAssembler((m) => got.push(m))
    greetReply.forEach((b, i) => {
      a.feed(Uint8Array.of(b))
      if (i % 10 === 3) a.feed(Uint8Array.of(0xf8, 0xfe))
    })
    expect(got.length).toBe(1)
    expect(got[0]).toEqual(greetReply)
  })

  it('several messages in one chunk, other messages dropped', () => {
    const got: Uint8Array[] = []
    const a = new SysexAssembler((m) => got.push(m))
    a.feed(hex('90 3C 7F F0 7E 33 06 02 F7 80 3C 00 F0 01 02 F7'))
    expect(got.map((m) => toHex(m))).toEqual(['F0 7E 33 06 02 F7', 'F0 01 02 F7'])
  })

  it('a status byte aborts a sysex and F0 restarts one', () => {
    const got: Uint8Array[] = []
    const a = new SysexAssembler((m) => got.push(m))
    a.feed(hex('F0 00 20 90 3C F7 F0 00 F0 11 22 F7'))
    expect(got.map((m) => toHex(m))).toEqual(['F0 11 22 F7'])
  })

  it('oversized sysex is discarded', () => {
    const got: Uint8Array[] = []
    const a = new SysexAssembler((m) => got.push(m), 8)
    a.feed(hex('F0 01 02 03 04 05 06 07 08 09 F7 F0 05 F7'))
    expect(got.length).toBe(1)
    expect(got[0]?.length).toBe(3)
  })

  it('EP-133 port names', () => {
    for (const n of ['EP-133', 'EP133 MIDI', 'ep 1320', 'teenage engineering EP-40', 'K.O. II', 'KO II', 'ko ii', 'K.OII']) {
      expect(matches(n), n).toBe(true)
    }
    for (const n of ['OP-1', 'EP-13', 'Kontakt', 'KoſII', null]) expect(matches(n), String(n)).toBe(false)
    expect(pick(['OP-Z', 'EP-133', 'EP-40'], (it) => it)).toBe('EP-133')
    expect(pick(['Some synth'], (it) => it)).toBe('Some synth')
    expect(pick(['a', 'b'], (it) => it)).toBeNull()
  })

  it('traffic log export and eviction', () => {
    let t = 1_791_119_124_116
    const log = new TrafficLog(3, () => t++)
    log.out(encodeRequest(0x33, 0xb94, 1))
    log.inbound(greetReply)
    log.inbound(hex('F0 7E 33 06 02 00 20 76 20 00 01 00 00 00 00 00 F7'))
    log.out(encodeRequest(0x33, 5, 5, Uint8Array.of(4, 0, 0, 3, 0xe8)))
    expect(log.size).toBe(3)
    const text = log.export(['device: EP-133'], 'utc')
    const lines = text.split('\n')
    expect(lines[0]).toBe('arc SysEx log')
    expect(lines[1]).toBe('device: EP-133')
    expect(lines[2]).toBe('(1 older messages not kept)')
    expect(lines[4]?.startsWith('2026-10-04 13:05:24.117  IN   [139] GREET id=2964 status=0  F0 00 20 76'), lines[4]).toBe(true)
    expect(lines[5]?.includes('IN   [17] identity reply  F0 7E 33'), lines[5]).toBe(true)
    expect(lines[6]?.endsWith('OUT  [16] FILE list id=5  F0 00 20 76 33 40 60 05 05 10 04 00 00 03 68 F7'), lines[6]).toBe(true)
  })
})

// Web additions around the same parts: local-time export, notes while disabled,
// version/subscribe, describe() edge cases and the LoggingTransport wrapper.
describe('TrafficLog (web)', () => {
  it('local export stamps follow TZ (UTC in tests)', () => {
    const log = new TrafficLog(5, () => 1_791_119_124_116)
    log.note('connect EP-133')
    const lines = log.export().split('\n')
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe('2026-10-04 13:05:24.116  --   connect EP-133')
  })

  it('notes are kept while disabled, messages are not; version and subscribe track changes', () => {
    const log = new TrafficLog()
    const seen: number[] = []
    const off = log.subscribe((v) => seen.push(v))
    log.enabled = false
    log.out(Uint8Array.of(0xf0, 0xf7))
    log.inbound(Uint8Array.of(0xf0, 0xf7))
    log.note('hi')
    expect(log.size).toBe(1)
    expect(log.snapshot()[0]?.dir).toBe('NOTE')
    log.enabled = true
    log.out(Uint8Array.of(0xf0, 0xf7))
    log.clear()
    expect(log.size).toBe(0)
    expect(log.version).toBe(3)
    expect(seen).toEqual([1, 2, 3])
    off()
    log.note('x')
    expect(seen).toEqual([1, 2, 3])
    expect(log.export()).toMatch(/^arc SysEx log\n\n\S/)
  })

  it('copies bytes and evicts oldest first', () => {
    const log = new TrafficLog(2, () => 0)
    const b = Uint8Array.of(0xf0, 1, 0xf7)
    log.out(b)
    b[1] = 2
    expect(log.snapshot()[0]?.bytes[1]).toBe(1)
    log.note('a')
    log.note('b')
    expect(log.snapshot().map((e) => e.note)).toEqual(['a', 'b'])
    log.clear()
    expect(log.export()).not.toContain('older messages')
  })

  it('describe names FILE sub-commands, pushes and other commands', () => {
    const file = (sub: number) => describeMsg(encodeRequest(0x33, 7, 5, Uint8Array.of(sub)))
    expect([1, 2, 3, 4, 7, 11, 5].map(file)).toEqual([
      '[12] FILE init id=7',
      '[12] FILE put id=7',
      '[12] FILE get id=7',
      '[12] FILE list id=7',
      '[12] FILE meta id=7',
      '[12] FILE info id=7',
      '[12] FILE ? id=7',
    ])
    expect(describeMsg(encodeRequest(0x33, 7, 5))).toBe('[10] FILE ? id=7')
    expect(describeMsg(encodeRequest(0x33, 1, 9))).toBe('[10] cmd 9 id=1')
    // A push: request flag without an id.
    expect(describeMsg(hex('F0 00 20 76 33 40 40 00 05 00 03 F7'))).toBe('[12] FILE get push')
    expect(describeMsg(hex('F0 7E 7F 06 01 F7'))).toBe('[6] universal')
    expect(describeMsg(hex('90 3C 7F'))).toBe('[3] ?')
    expect(TrafficLog.describe(Uint8Array.of())).toBe('[0] ?')
  })

  it('LoggingTransport records sent and received SysEx and notes close', () => {
    let listener: ((b: Uint8Array) => void) | null = null
    const sent: Uint8Array[] = []
    let closed = false
    const inner: Transport = {
      send: (b) => sent.push(b),
      onMessage: (cb) => {
        listener = cb
        return () => {
          listener = null
        }
      },
      close: () => {
        closed = true
      },
    }
    const log = new TrafficLog(10, () => 0)
    const t = new LoggingTransport(inner, log)
    const got: Uint8Array[] = []
    const off = t.onMessage((b) => got.push(b))
    t.send(Uint8Array.of(0xf0, 1, 0xf7))
    listener!(Uint8Array.of(0xf0, 2, 0xf7))
    off()
    expect(listener).toBeNull()
    t.close()
    expect(sent.length).toBe(1)
    expect(got.length).toBe(1)
    expect(closed).toBe(true)
    expect(log.snapshot().map((e) => [e.dir, toHex(e.bytes), e.note])).toEqual([
      ['OUT', 'F0 01 F7', null],
      ['IN', 'F0 02 F7', null],
      ['NOTE', '', 'transport closed'],
    ])
  })
})

describe('LiveMirrorTest: MIDI input', () => {
  function parse(bytes: number[], time = 7): MidiEvent[] {
    const out: MidiEvent[] = []
    new MidiInput((e) => out.push(e)).feed(Uint8Array.from(bytes), time)
    return out
  }

  it('notes, running status and velocity zero', () => {
    expect(parse([0x90, 36, 100, 37, 90, 36, 0, 0x81, 48, 0, 0xbf, 12, 64])).toEqual([
      { type: 'NoteOn', channel: 1, note: 36, velocity: 100, time: 7 },
      { type: 'NoteOn', channel: 1, note: 37, velocity: 90, time: 7 }, // running status
      { type: 'NoteOff', channel: 1, note: 36, time: 7 }, // velocity 0
      { type: 'NoteOff', channel: 2, note: 48, time: 7 },
      { type: 'ControlChange', channel: 16, controller: 12, value: 64, time: 7 },
    ])
  })

  it('real-time bytes anywhere, SysEx and other messages skipped', () => {
    expect(
      parse([
        0xfa, 0x90, 40, 0xf8, 64,
        0xf0, 0x00, 0x20, 0xf8, 0x76, 0x33, 0xf7,
        // program change, channel pressure and song position: parsed for length, dropped
        0xc0, 5, 0xd0, 9, 0xf2, 1, 2,
        // a stray data byte after system common has no status to belong to
        10,
        0xfc, 0xfe, 0x90, 41, 1,
      ]),
    ).toEqual([
      { type: 'Start', time: 7 },
      { type: 'Clock', time: 7 }, // inside a note message
      { type: 'NoteOn', channel: 1, note: 40, velocity: 64, time: 7 },
      { type: 'Clock', time: 7 }, // inside a SysEx
      { type: 'Stop', time: 7 },
      { type: 'NoteOn', channel: 1, note: 41, velocity: 1, time: 7 },
    ])
    // A note interrupted by SysEx is abandoned rather than finished with SysEx bytes.
    expect(parse([0x90, 40, 0xf0, 1, 2, 0xf7, 3])).toEqual([])
  })

  it('fed in pieces, as USB packets arrive', () => {
    const out: MidiEvent[] = []
    const p = new MidiInput((e) => out.push(e))
    p.feed(Uint8Array.of(0x92, 60), 1)
    p.feed(Uint8Array.of(127, 61), 2)
    p.feed(Uint8Array.of(5), 3)
    expect(out).toEqual([
      { type: 'NoteOn', channel: 3, note: 60, velocity: 127, time: 2 },
      { type: 'NoteOn', channel: 3, note: 61, velocity: 5, time: 3 },
    ])
  })
})

describe('Parity edges (review)', () => {
  it('feed past the end of the buffer throws, as Kotlin array indexing does', () => {
    const got: Uint8Array[] = []
    const a = new SysexAssembler((m) => got.push(m))
    expect(() => a.feed(Uint8Array.of(0xf0, 1), 1, 5)).toThrow(RangeError)
    const events: MidiEvent[] = []
    expect(() => new MidiInput((e) => events.push(e)).feed(Uint8Array.of(0x90, 1), 0, 0, 3)).toThrow(RangeError)
    expect(() => new MidiInput((e) => events.push(e)).feed(Uint8Array.of(0x90, 1), 0, -1, 1)).toThrow(RangeError)
  })

  it('offset and count select a slice; reset drops a partial SysEx', () => {
    const got: Uint8Array[] = []
    const a = new SysexAssembler((m) => got.push(m))
    a.feed(hex('00 F0 01 F7 00'), 1, 3)
    expect(got.map((m) => toHex(m))).toEqual(['F0 01 F7'])
    a.feed(hex('F0 02'))
    a.reset()
    a.feed(hex('03 F7'))
    expect(got.length).toBe(1)
    const events: MidiEvent[] = []
    new MidiInput((e) => events.push(e)).feed(Uint8Array.of(0, 0x90, 40, 64, 0), 5, 1, 3)
    expect(events).toEqual([{ type: 'NoteOn', channel: 1, note: 40, velocity: 64, time: 5 }])
  })

  it('a zero-capacity log keeps nothing and counts every message as dropped', () => {
    const log = new TrafficLog(0, () => 0)
    log.out(Uint8Array.of(0xf0, 0xf7))
    log.note('n')
    expect(log.size).toBe(0)
    expect(log.version).toBe(2)
    expect(log.export().split('\n')[1]).toBe('(2 older messages not kept)')
  })
})
