// Tests for web/src/platform/midi/{webmidi,owner}.ts (ports of MidiConnector.kt and
// MidiTransport.kt onto WebMIDI; Android has no unit tests for these, so the cases
// follow the behaviour described in the Kotlin and reference/src/webmidi.js).

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MidiEvent } from '../../../src/core/protocol/midiInput'
import { Session } from '../../../src/core/protocol/session'
import { WebText } from '../../../src/core/text/webText'
import { acquireDeviceLock, DEVICE_LOCK_NAME, type LocksLike } from '../../../src/platform/midi/owner'
import {
  MIDI_TEXT,
  MidiError,
  OPEN_TIMEOUT_MS,
  openMidi,
  pickPair,
  portLooksLikeEp,
  probePermission,
  requestMidiAccess,
  watchMidi,
  webMidiSupported,
  WebMidiTransport,
  type MidiDeviceEvent,
  type NavigatorLike,
} from '../../../src/platform/midi/webmidi'
import { device } from '../../helpers/demoData'
import { MockEP133 } from '../../helpers/mockDevice'
import { connectMock, fakeNavigator, fakePair, FakeMidiAccess, FakeMidiInput, FakeMidiOutput } from '../../helpers/fakeMidiAccess'

const flush = async (rounds = 20): Promise<void> => {
  for (let i = 0; i < rounds; i++) await Promise.resolve()
}

async function rejectsWith(p: Promise<unknown>, code: string): Promise<MidiError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  )
  expect(e).toBeInstanceOf(MidiError)
  expect((e as MidiError).code).toBe(code)
  expect((e as MidiError).message).toBe(MIDI_TEXT[code as keyof typeof MIDI_TEXT])
  return e as MidiError
}

afterEach(() => {
  vi.useRealTimers()
})

describe('support and permission', () => {
  it('webMidiSupported checks for requestMIDIAccess', () => {
    expect(webMidiSupported(fakeNavigator())).toBe(true)
    expect(webMidiSupported({})).toBe(false)
    expect(webMidiSupported(undefined)).toBe(false)
    // Node's own navigator has no WebMIDI.
    expect(webMidiSupported()).toBe(false)
  })

  it('probePermission maps the permission state', async () => {
    expect(await probePermission(fakeNavigator({ permission: 'granted' }))).toBe('granted')
    expect(await probePermission(fakeNavigator({ permission: 'denied' }))).toBe('denied')
    expect(await probePermission(fakeNavigator({ permission: 'prompt' }))).toBe('prompt')
    expect(await probePermission(fakeNavigator({ permission: 'weird' }))).toBe('prompt')
    // No Permissions API, or it does not know 'midi': ask on a tap.
    expect(await probePermission(fakeNavigator())).toBe('prompt')
    expect(await probePermission(fakeNavigator({ queryThrows: true }))).toBe('prompt')
    expect(await probePermission({})).toBe('unsupported')
  })

  it('queries the sysex midi permission', async () => {
    const query = vi.fn(() => Promise.resolve({ state: 'granted' }))
    await probePermission({ requestMIDIAccess: () => Promise.reject(new Error('x')), permissions: { query } })
    expect(query).toHaveBeenCalledWith({ name: 'midi', sysex: true })
  })

  it('requestMidiAccess asks for sysex and maps failures', async () => {
    const access = new FakeMidiAccess()
    const nav = fakeNavigator({ access })
    expect(await requestMidiAccess(nav)).toBe(access)
    expect(nav.requests).toEqual([{ sysex: true }])
    await rejectsWith(requestMidiAccess(fakeNavigator({ access, deny: true })), 'denied')
    await rejectsWith(requestMidiAccess({}), 'unsupported')
  })

  it('gives Firefox its add-on hint when access is refused', async () => {
    const ff: NavigatorLike = {
      ...fakeNavigator({ deny: true }),
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
    }
    const e = await requestMidiAccess(ff).catch((err: unknown) => err)
    expect(e).toBeInstanceOf(MidiError)
    expect((e as MidiError).code).toBe('denied')
    expect((e as MidiError).message).toBe(WebText.FIREFOX_MIDI_HINT)
    const chrome: NavigatorLike = { ...fakeNavigator({ deny: true }), userAgent: 'Mozilla/5.0 Chrome/140.0 Safari/537.36' }
    await rejectsWith(requestMidiAccess(chrome), 'denied')
  })

  it('maps a synchronous throw from the browser too', async () => {
    const throwing: NavigatorLike = {
      requestMIDIAccess: () => {
        throw new DOMException('insecure', 'SecurityError')
      },
      permissions: {
        query: () => {
          throw new TypeError('bad descriptor')
        },
      },
    }
    await rejectsWith(requestMidiAccess(throwing), 'denied')
    expect(await probePermission(throwing)).toBe('prompt')
  })
})

describe('pickPair', () => {
  it('prefers an input and output of the same device', () => {
    const ep = fakePair('EP-133', 'teenage engineering', 'ep')
    const other = fakePair('Launchkey', 'Novation', 'lk')
    // Listed in a different order on each side.
    const access = new FakeMidiAccess([other.input, ep.input, ep.output, other.output])
    expect(pickPair(access)).toEqual({ input: ep.input, output: ep.output })
  })

  it('takes the first EP-133 device among several', () => {
    const a = fakePair('EP-133', 'teenage engineering', 'a')
    const b = fakePair('EP-1320', 'teenage engineering', 'b')
    const access = new FakeMidiAccess([b.input, a.input, a.output, b.output])
    const pair = pickPair(access)
    expect(pair?.input).toBe(b.input)
    expect(pair?.output).toBe(b.output)
  })

  it('ignores disconnected ports', () => {
    const gone = fakePair('EP-133', 'teenage engineering', 'gone')
    gone.input.state = 'disconnected'
    gone.output.state = 'disconnected'
    const live = fakePair('K.O. II', 'teenage engineering', 'live')
    expect(pickPair(new FakeMidiAccess([gone.input, gone.output, live.input, live.output]))).toEqual({ input: live.input, output: live.output })
    live.output.state = 'disconnected'
    expect(pickPair(new FakeMidiAccess([gone.input, gone.output, live.input, live.output]))).toBeNull()
  })

  it('pairs differently named EP-133 ports from one manufacturer', () => {
    const input = new FakeMidiInput({ id: 'i', name: 'EP-133 MIDI In', manufacturer: 'teenage engineering' })
    const output = new FakeMidiOutput({ id: 'o', name: 'EP-133 MIDI Out', manufacturer: 'teenage engineering' })
    const other = fakePair('Synth', 'Acme', 'x')
    expect(pickPair(new FakeMidiAccess([other.input, input, other.output, output]))).toEqual({ input, output })
  })

  it('matches on "manufacturer name" when the name alone does not', () => {
    const port = { name: 'MIDI 1', manufacturer: 'EP-133' }
    expect(portLooksLikeEp(port)).toBe(true)
    expect(portLooksLikeEp({ name: 'MIDI 1', manufacturer: 'Acme' })).toBe(false)
    expect(portLooksLikeEp({ name: 'ep133', manufacturer: null })).toBe(true)
    expect(portLooksLikeEp({ name: null, manufacturer: null })).toBe(false)
    const input = new FakeMidiInput({ id: 'i', name: 'MIDI 1', manufacturer: 'EP-133' })
    const output = new FakeMidiOutput({ id: 'o', name: 'MIDI 1', manufacturer: 'EP-133' })
    const other = fakePair('MIDI 1', 'Acme', 'x')
    expect(pickPair(new FakeMidiAccess([other.input, input, other.output, output]))).toEqual({ input, output })
  })

  it('falls back to EP-133-named ports on each side', () => {
    const input = new FakeMidiInput({ id: 'i', name: 'EP-133', manufacturer: null })
    const output = new FakeMidiOutput({ id: 'o', name: 'MIDIOUT2 (EP-133)', manufacturer: null })
    const other = fakePair('Synth', 'Acme', 'x')
    expect(pickPair(new FakeMidiAccess([other.input, input, other.output, output]))).toEqual({ input, output })
  })

  it('takes the only device with both directions, then the only input and output', () => {
    const solo = fakePair('USB MIDI Device', 'Generic', 's')
    expect(pickPair(new FakeMidiAccess([solo.input, solo.output]))).toEqual(solo)
    const extraOut = new FakeMidiOutput({ id: 'eo', name: 'Thru', manufacturer: 'Other' })
    expect(pickPair(new FakeMidiAccess([solo.input, solo.output, extraOut]))).toEqual(solo)
    const i = new FakeMidiInput({ id: 'i', name: 'In', manufacturer: null })
    const o = new FakeMidiOutput({ id: 'o', name: 'Out', manufacturer: null })
    expect(pickPair(new FakeMidiAccess([i, o]))).toEqual({ input: i, output: o })
  })

  it('gives up when the choice is ambiguous or a side is missing', () => {
    const a = fakePair('Synth A', 'Acme', 'a')
    const b = fakePair('Synth B', 'Acme', 'b')
    expect(pickPair(new FakeMidiAccess([a.input, a.output, b.input, b.output]))).toBeNull()
    expect(pickPair(new FakeMidiAccess([fakePair().input]))).toBeNull()
    expect(pickPair(new FakeMidiAccess())).toBeNull()
  })
})

describe('openMidi', () => {
  it('opens the pair and describes it', async () => {
    const { input, output } = fakePair('EP-133', 'teenage engineering', 'ep')
    const access = new FakeMidiAccess([input, output])
    const open = await openMidi(access)
    expect(input.connection).toBe('open')
    expect(output.connection).toBe('open')
    expect(open.portName).toBe('EP-133')
    expect(open.portIds).toEqual({ input: 'ep-in', output: 'ep-out' })
    expect(open.deviceId).toBe('ep-out')
    expect(open.access).toBe(access)
    expect(open.transport.input).toBe(input)
    expect(input.listenerCount).toBe(1)
    open.close()
    expect(input.listenerCount).toBe(0)
    expect(input.connection).toBe('closed')
    expect(output.connection).toBe('closed')
  })

  it('names an unnamed device EP-133', async () => {
    const input = new FakeMidiInput({ id: 'i', name: null, manufacturer: null })
    const output = new FakeMidiOutput({ id: 'o', name: '', manufacturer: null })
    const open = await openMidi(new FakeMidiAccess([input, output]))
    expect(open.portName).toBe('EP-133')
  })

  it('requests access when none is given', async () => {
    const { input, output } = fakePair()
    const nav = fakeNavigator({ access: new FakeMidiAccess([input, output]) })
    const open = await openMidi(undefined, { nav })
    expect(nav.requests).toEqual([{ sysex: true }])
    expect(open.transport.output).toBe(output)
    await rejectsWith(openMidi(undefined, { nav: fakeNavigator({ deny: true }) }), 'denied')
    await rejectsWith(openMidi(undefined, { nav: {} }), 'unsupported')
  })

  it('reports no EP-133', async () => {
    await rejectsWith(openMidi(new FakeMidiAccess()), 'notFound')
  })

  it('is blocked when a port refuses to open, and closes the other', async () => {
    const { input, output } = fakePair()
    output.openMode = 'reject'
    await rejectsWith(openMidi(new FakeMidiAccess([input, output])), 'blocked')
    expect(input.connection).toBe('closed')
    expect(input.closes).toBeGreaterThan(0)
  })

  it('is blocked when a port opens but does not end up open', async () => {
    const { input, output } = fakePair()
    input.openMode = 'pending'
    await rejectsWith(openMidi(new FakeMidiAccess([input, output])), 'blocked')
    expect(output.connection).toBe('closed')
  })

  it('is blocked when opening takes longer than 5 s', async () => {
    vi.useFakeTimers()
    const { input, output } = fakePair()
    input.openMode = 'hang'
    const p = openMidi(new FakeMidiAccess([input, output]))
    const settled = vi.fn()
    p.then(settled, settled)
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS - 1)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await rejectsWith(p, 'blocked')
    expect(output.closes).toBeGreaterThan(0)
  })

  it('closes a port that opens after its sibling was refused', async () => {
    const { input, output } = fakePair()
    let finishOpen: () => void = () => {}
    input.open = () => {
      input.opens++
      return new Promise((resolve) => {
        finishOpen = () => {
          input.setConnection('open')
          resolve(input)
        }
      })
    }
    output.openMode = 'reject'
    await rejectsWith(openMidi(new FakeMidiAccess([input, output])), 'blocked')
    finishOpen()
    await flush()
    expect(input.connection).toBe('closed')
  })

  it('a late close from a timed-out attempt does not close a newer connection', async () => {
    vi.useFakeTimers()
    const { input, output } = fakePair()
    const access = new FakeMidiAccess([input, output])
    let finishOpen: () => void = () => {}
    input.open = () =>
      new Promise((resolve) => {
        finishOpen = () => {
          input.setConnection('open')
          resolve(input)
        }
      })
    const first = openMidi(access)
    first.catch(() => {})
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS)
    await rejectsWith(first, 'blocked')
    // Retry: this time the port opens at once.
    input.open = () => {
      input.setConnection('open')
      return Promise.resolve(input)
    }
    const open = await openMidi(access)
    // The first attempt's open finally completes: its late close must leave the ports alone.
    finishOpen()
    await vi.advanceTimersByTimeAsync(0)
    expect(input.connection).toBe('open')
    expect(output.connection).toBe('open')
    const got: number[][] = []
    open.transport.onMessage((b) => got.push([...b]))
    input.receiveNow([0xf0, 1, 0xf7])
    expect(got).toEqual([[0xf0, 1, 0xf7]])
    open.close()
    expect(input.connection).toBe('closed')
  })

  it('closing a stale transport leaves ports a live one shares', async () => {
    const { input, output } = fakePair()
    const access = new FakeMidiAccess([input, output])
    const a = await openMidi(access)
    const b = await openMidi(access)
    a.close()
    expect(input.connection).toBe('open')
    expect(output.connection).toBe('open')
    b.close()
    expect(input.connection).toBe('closed')
    expect(output.connection).toBe('closed')
  })

  it('owns removal events for its own ports only', async () => {
    const { input, output } = fakePair('EP-133', 'teenage engineering', 'ep')
    const open = await openMidi(new FakeMidiAccess([input, output]))
    expect(open.owns({ portIds: ['ep-in'] })).toBe(true)
    expect(open.owns({ portIds: ['ep-out'] })).toBe(true)
    expect(open.owns({ portIds: ['other'] })).toBe(false)
  })
})

describe('WebMidiTransport routing', () => {
  async function opened() {
    const { input, output } = fakePair()
    const open = await openMidi(new FakeMidiAccess([input, output]), { now: () => 777 })
    const sysex: Uint8Array[] = []
    const events: MidiEvent[] = []
    open.transport.onMessage((b) => sysex.push(b))
    open.events((e) => events.push(e))
    return { open, input, output, sysex, events }
  }

  it('sends SysEx only to the transport', async () => {
    const { input, sysex, events } = await opened()
    input.receiveNow([0xf0, 0x00, 0x20, 0x76, 0x33, 0x40, 0xf7], 5)
    expect(sysex.map((b) => [...b])).toEqual([[0xf0, 0x00, 0x20, 0x76, 0x33, 0x40, 0xf7]])
    expect(events).toEqual([])
  })

  it('sends notes, CC and clock to events, never to the transport', async () => {
    const { input, sysex, events } = await opened()
    input.receiveNow([0x90, 36, 100], 10)
    input.receiveNow([0x80, 36, 0], 11)
    input.receiveNow([0x91, 40, 0], 12)
    input.receiveNow([0xb2, 7, 64], 13)
    input.receiveNow([0xf8], 14)
    input.receiveNow([0xfa], 15)
    input.receiveNow([0xfc], 16)
    expect(sysex).toEqual([])
    expect(events).toEqual([
      { type: 'NoteOn', channel: 1, note: 36, velocity: 100, time: 10 },
      { type: 'NoteOff', channel: 1, note: 36, time: 11 },
      { type: 'NoteOff', channel: 2, note: 40, time: 12 },
      { type: 'ControlChange', channel: 3, controller: 7, value: 64, time: 13 },
      { type: 'Clock', time: 14 },
      { type: 'Start', time: 15 },
      { type: 'Stop', time: 16 },
    ])
  })

  it('stamps events without a timeStamp with the clock', async () => {
    const { input, events } = await opened()
    input.receiveNow([0x99, 50, 1], 0)
    expect(events).toEqual([{ type: 'NoteOn', channel: 10, note: 50, velocity: 1, time: 777 }])
  })

  it('keeps running status across messages and ignores empty ones', async () => {
    const { input, events, sysex } = await opened()
    input.receiveNow([0x90, 36, 100, 37, 90])
    input.receiveNow([])
    expect(events.map((e) => (e.type === 'NoteOn' ? e.note : -1))).toEqual([36, 37])
    expect(sysex).toEqual([])
  })

  it('a SysEx ends running status, as the Kotlin parser sees it', async () => {
    const { input, events, sysex } = await opened()
    input.receiveNow([0x90, 36, 100])
    input.receiveNow([0xf0, 0x7e, 0xf7])
    // Data bytes with no status after the SysEx are dropped (MidiInput.kt).
    input.receiveNow([37, 90])
    expect(sysex).toHaveLength(1)
    expect(events.map((e) => (e.type === 'NoteOn' ? e.note : -1))).toEqual([36])
  })

  it('a SysEx between notes does not break the note parser', async () => {
    const { input, events, sysex } = await opened()
    input.receiveNow([0x90, 36, 100])
    input.receiveNow([0xf0, 0x7e, 0xf7])
    input.receiveNow([0x80, 36, 0])
    expect(sysex).toHaveLength(1)
    expect(events.map((e) => e.type)).toEqual(['NoteOn', 'NoteOff'])
  })

  it('unsubscribes, and a throwing listener does not starve the others', async () => {
    const { open, input, sysex } = await opened()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unsub = open.transport.onMessage(() => {
      throw new Error('boom')
    })
    const got: number[] = []
    const unsubEv = open.events(() => got.push(1))
    input.receiveNow([0xf0, 1, 0xf7])
    expect(sysex).toHaveLength(1)
    unsub()
    unsubEv()
    input.receiveNow([0xf0, 2, 0xf7])
    input.receiveNow([0xf8])
    expect(sysex).toHaveLength(2)
    expect(got).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('sends each frame in one call; after close it warns and drops', async () => {
    const { input, output } = fakePair()
    const warnings: string[] = []
    const open = await openMidi(new FakeMidiAccess([input, output]), { warn: (m) => warnings.push(m) })
    open.transport.send(Uint8Array.of(0xf0, 1, 2, 0xf7))
    expect(output.sent.map((b) => [...b])).toEqual([[0xf0, 1, 2, 0xf7]])
    open.close()
    open.close()
    expect(open.transport.isClosed).toBe(true)
    open.transport.send(Uint8Array.of(0xf0, 3, 0xf7))
    expect(output.sent).toHaveLength(1)
    expect(warnings).toEqual(['arc.midi: send after close ignored'])
    expect(input.closes).toBe(1)
    // Nothing arrives after close.
    const got: Uint8Array[] = []
    open.transport.onMessage((b) => got.push(b))
    input.receiveNow([0xf0, 4, 0xf7])
    expect(got).toEqual([])
  })

  it('rewraps send failures', async () => {
    const access = new FakeMidiAccess()
    const { input, output } = fakePair()
    access.add(input).add(output)
    const open = await openMidi(access)
    access.unplug(output)
    expect(() => open.transport.send(Uint8Array.of(0xf0, 0xf7))).toThrow(/^Could not send to the EP-133: Port is disconnected$/)
  })

  it('works as a bare Transport over given ports', () => {
    const { input, output } = fakePair()
    const t = new WebMidiTransport(input, output)
    const got: number[][] = []
    t.onMessage((b) => got.push([...b]))
    input.receiveNow([0xf0, 9, 0xf7])
    expect(got).toEqual([[0xf0, 9, 0xf7]])
    t.close()
  })
})

describe('watchMidi', () => {
  function setup(existing: (FakeMidiInput | FakeMidiOutput)[] = []) {
    vi.useFakeTimers()
    const access = new FakeMidiAccess(existing)
    const added: MidiDeviceEvent[] = []
    const removed: MidiDeviceEvent[] = []
    const stop = watchMidi(
      access,
      (e) => added.push(e),
      (e) => removed.push(e),
    )
    return { access, added, removed, stop }
  }

  it('announces a plugged-in device once, 300 ms after its last port', () => {
    const { access, added } = setup()
    const { input, output } = fakePair('EP-133', 'teenage engineering', 'ep')
    access.plug(input)
    vi.advanceTimersByTime(200)
    access.plug(output)
    vi.advanceTimersByTime(299)
    expect(added).toEqual([])
    vi.advanceTimersByTime(1)
    expect(added).toEqual([{ name: 'EP-133', portIds: ['ep-in', 'ep-out'], looksLikeEp: true }])
    vi.advanceTimersByTime(5000)
    expect(added).toHaveLength(1)
  })

  it('needs both directions and a matching name to look like an EP-133', () => {
    const { access, added } = setup()
    const synth = fakePair('Synth', 'Acme', 'syn')
    access.plug(synth.input, synth.output)
    const lonely = new FakeMidiInput({ id: 'lonely', name: 'EP-133', manufacturer: 'teenage engineering' })
    vi.advanceTimersByTime(300)
    access.plug(lonely)
    vi.advanceTimersByTime(300)
    expect(added).toEqual([
      { name: 'Synth', portIds: ['syn-in', 'syn-out'], looksLikeEp: false },
      { name: 'EP-133', portIds: ['lonely'], looksLikeEp: false },
    ])
  })

  it('ignores connection-only changes such as our own open()', async () => {
    const { input, output } = fakePair('EP-133', 'teenage engineering', 'ep')
    const { access, added, removed } = setup([input, output])
    const open = await openMidi(access)
    open.close()
    vi.advanceTimersByTime(1000)
    expect(access.fired.length).toBeGreaterThanOrEqual(4)
    expect(added).toEqual([])
    expect(removed).toEqual([])
  })

  it('announces a removal at once, once per port, by port id', () => {
    const { input, output } = fakePair('EP-133', 'teenage engineering', 'ep')
    const { access, removed } = setup([input, output])
    access.unplug(output)
    expect(removed).toEqual([{ name: 'EP-133', portIds: ['ep-out'], looksLikeEp: true }])
    access.unplug(input)
    expect(removed.map((e) => e.portIds)).toEqual([['ep-out'], ['ep-in']])
    // A repeated disconnected statechange is not a new removal.
    access.unplug(input)
    expect(removed).toHaveLength(2)
    // Unplugged again later (after a replug): announced again.
    access.plug(input, output)
    vi.advanceTimersByTime(300)
    access.unplug(input, output)
    expect(removed.map((e) => e.portIds)).toEqual([['ep-out'], ['ep-in'], ['ep-in'], ['ep-out']])
  })

  it('a replug and unplug within the window announces nothing added', () => {
    const { input, output } = fakePair('EP-133', 'teenage engineering', 'ep')
    const { access, added, removed } = setup([input, output])
    access.unplug(input, output)
    access.plug(input, output)
    access.unplug(input, output)
    expect(removed).toHaveLength(4)
    vi.advanceTimersByTime(1000)
    expect(added).toEqual([])
  })

  it('two identically named devices unplugged together (a hub) are each announced', () => {
    const a = fakePair('EP-133', 'teenage engineering', 'a')
    const b = fakePair('EP-133', 'teenage engineering', 'b')
    const { access, removed } = setup([a.input, a.output, b.input, b.output])
    // Inputs first, as a hub detach may report them.
    access.unplug(a.input, b.input, a.output, b.output)
    const ids = removed.flatMap((e) => e.portIds)
    expect(ids).toEqual(['a-in', 'b-in', 'a-out', 'b-out'])
  })

  it('drops a device that leaves before it was announced', () => {
    const { access, added, removed } = setup()
    const { input, output } = fakePair('EP-133', 'teenage engineering', 'ep')
    access.plug(input, output)
    vi.advanceTimersByTime(100)
    access.unplug(input)
    vi.advanceTimersByTime(300)
    expect(removed).toHaveLength(1)
    expect(added).toEqual([{ name: 'EP-133', portIds: ['ep-out'], looksLikeEp: false }])
  })

  it('keeps separate devices apart', () => {
    const { access, added } = setup()
    const a = fakePair('EP-133', 'teenage engineering', 'a')
    const b = fakePair('Synth', 'Acme', 'b')
    access.plug(a.input, b.input, a.output, b.output)
    vi.advanceTimersByTime(300)
    expect(added.map((e) => [e.name, e.portIds])).toEqual([
      ['EP-133', ['a-in', 'a-out']],
      ['Synth', ['b-in', 'b-out']],
    ])
  })

  it('stops listening and cancels pending announcements', () => {
    const { access, added, stop } = setup()
    const { input, output } = fakePair()
    access.plug(input, output)
    stop()
    stop()
    vi.advanceTimersByTime(1000)
    expect(added).toEqual([])
    expect(access.listenerCount).toBe(0)
  })

  it('honours a custom debounce', () => {
    vi.useFakeTimers()
    const access = new FakeMidiAccess()
    const added: MidiDeviceEvent[] = []
    watchMidi(access, (e) => added.push(e), () => {}, { debounceMs: 50 })
    const { input, output } = fakePair()
    access.plug(input, output)
    vi.advanceTimersByTime(50)
    expect(added).toHaveLength(1)
  })
})

describe('end to end with MockEP133', () => {
  it('handshakes a Session through the fake MIDIAccess', async () => {
    const mock = device()
    const { access, output } = connectMock(mock)
    const open = await openMidi(access)
    const s = new Session(open.transport)
    const info = await s.handshake()
    expect(info).toEqual({ product: 'EP-133', sku: 'TE032AS001', osVersion: '2.0.5', serial: 'MOCK0001', mode: 'normal' })
    expect(s.deviceId).toBe(0x33)
    expect(mock.log).toEqual([1])
    expect(output.sent.every((b) => b[0] === 0xf0 && b[b.length - 1] === 0xf7)).toBe(true)
    s.close()
    open.close()
  })

  it('delivers device pushes to the session and notes to the events', async () => {
    const mock = new MockEP133()
    const { access, input } = connectMock(mock)
    const open = await openMidi(access)
    const s = new Session(open.transport)
    await s.handshake()
    const pushes: number[] = []
    s.onPush((f) => pushes.push(f.command))
    const events: MidiEvent[] = []
    open.events((e) => events.push(e))
    mock.pushPadActive(1, 0, 3)
    input.receive([0x90, 36, 127], 42)
    input.receive([0xf8], 43)
    await flush()
    expect(pushes).toHaveLength(1)
    expect(events).toEqual([
      { type: 'NoteOn', channel: 1, note: 36, velocity: 127, time: 42 },
      { type: 'Clock', time: 43 },
    ])
    s.close()
    open.close()
  })

  it('a session request fails cleanly once the device is unplugged', async () => {
    const mock = new MockEP133()
    const { access, input, output } = connectMock(mock)
    const open = await openMidi(access)
    const removed: MidiDeviceEvent[] = []
    const stop = watchMidi(access, () => {}, (e) => removed.push(e))
    const s = new Session(open.transport)
    await s.handshake()
    access.unplug(output, input)
    expect(removed).toHaveLength(2)
    expect(removed.every((e) => open.owns(e))).toBe(true)
    await expect(s.file([1, 1])).rejects.toThrow(/Could not send to the EP-133/)
    stop()
    s.close()
    open.close()
  })
})

describe('acquireDeviceLock', () => {
  // A LockManager stand-in: exclusive locks with ifAvailable.
  function fakeLocks(): LocksLike & { held: Set<string>; names: string[] } {
    const held = new Set<string>()
    const names: string[] = []
    return {
      held,
      names,
      async request(name, options, callback) {
        names.push(name)
        if (held.has(name)) {
          expect(options.ifAvailable).toBe(true)
          return callback(null)
        }
        held.add(name)
        try {
          return await callback({ name, mode: 'exclusive' })
        } finally {
          held.delete(name)
        }
      },
    }
  }

  it('gives one owner at a time', async () => {
    const locks = fakeLocks()
    const release = await acquireDeviceLock(locks)
    expect(release).toBeTypeOf('function')
    expect(locks.names).toEqual([DEVICE_LOCK_NAME])
    expect(locks.held.has('arc-device')).toBe(true)
    expect(await acquireDeviceLock(locks)).toBeNull()
    release?.()
    release?.()
    await flush()
    expect(locks.held.size).toBe(0)
    const again = await acquireDeviceLock(locks)
    expect(again).toBeTypeOf('function')
    again?.()
  })

  it('works without Web Locks', async () => {
    const release = await acquireDeviceLock(null)
    expect(release).toBeTypeOf('function')
    release?.()
    // Node 22 has no navigator.locks.
    expect(await acquireDeviceLock()).toBeTypeOf('function')
  })

  it('works when the lock request fails', async () => {
    const throwing: LocksLike = {
      request() {
        throw new DOMException('opaque origin', 'SecurityError')
      },
    }
    expect(await acquireDeviceLock(throwing)).toBeTypeOf('function')
    const rejecting: LocksLike = { request: () => Promise.reject(new DOMException('x', 'SecurityError')) }
    expect(await acquireDeviceLock(rejecting)).toBeTypeOf('function')
  })
})
