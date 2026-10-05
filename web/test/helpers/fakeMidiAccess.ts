// In-memory Web MIDI for tests (no Android counterpart; stands in for MIDIAccess
// the way MockEP133 stands in for the device).
//
// Behaves like Chrome where it matters to webmidi.ts:
// - ports stay in the maps after unplugging, with state 'disconnected';
// - open() sets connection 'open' and fires `statechange` (a connection-only
//   change, state unchanged); unplugging an open port leaves it 'pending';
// - plugging and unplugging fire one `statechange` per port;
// - send() on a disconnected output throws InvalidStateError;
// - messages reach `midimessage` listeners asynchronously, one per event.
// Knobs: FakeMidiPort.openMode ('ok' | 'reject' | 'hang' | 'pending').

import type {
  MidiAccessLike,
  MidiConnectionEventLike,
  MidiInputLike,
  MidiMessageEventLike,
  MidiOutputLike,
  MidiPortConnection,
  MidiPortLike,
  MidiPortState,
  NavigatorLike,
} from '../../src/platform/midi/webmidi'
import type { MockEP133 } from './mockDevice'

export type OpenMode = 'ok' | 'reject' | 'hang' | 'pending'

let nextId = 1

export interface PortInit {
  id?: string
  name?: string | null
  manufacturer?: string | null
  state?: MidiPortState
}

export abstract class FakeMidiPort implements MidiPortLike {
  abstract readonly type: 'input' | 'output'
  readonly id: string
  readonly name: string | null
  readonly manufacturer: string | null
  state: MidiPortState
  connection: MidiPortConnection = 'closed'
  openMode: OpenMode = 'ok'
  opens = 0
  closes = 0
  /** Set by FakeMidiAccess when the port is added to it. */
  access: FakeMidiAccess | null = null

  constructor({ id, name = 'EP-133', manufacturer = 'teenage engineering', state = 'connected' }: PortInit = {}) {
    this.id = id ?? `port-${nextId++}`
    this.name = name
    this.manufacturer = manufacturer
    this.state = state
  }

  open(): Promise<unknown> {
    this.opens++
    switch (this.openMode) {
      case 'reject':
        return Promise.reject(new DOMException('Port is in use', 'InvalidAccessError'))
      case 'hang':
        return new Promise(() => {})
      case 'pending':
        this.setConnection('pending')
        return Promise.resolve(this)
      case 'ok':
        if (this.state === 'disconnected') {
          this.setConnection('pending')
        } else {
          this.setConnection('open')
        }
        return Promise.resolve(this)
    }
  }

  close(): Promise<unknown> {
    this.closes++
    this.setConnection('closed')
    return Promise.resolve(this)
  }

  setConnection(c: MidiPortConnection): void {
    if (this.connection === c) return
    this.connection = c
    this.access?.fire(this)
  }
}

export class FakeMidiInput extends FakeMidiPort implements MidiInputLike {
  readonly type = 'input' as const
  private readonly listeners = new Set<(e: MidiMessageEventLike) => void>()

  addEventListener(_type: 'midimessage', listener: (e: MidiMessageEventLike) => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'midimessage', listener: (e: MidiMessageEventLike) => void): void {
    this.listeners.delete(listener)
  }

  get listenerCount(): number {
    return this.listeners.size
  }

  /** Delivers one message (asynchronously, like the browser), stamped [timeStamp] ms. */
  receive(data: Uint8Array | number[], timeStamp = 0): void {
    const bytes = Uint8Array.from(data)
    queueMicrotask(() => this.receiveNow(bytes, timeStamp))
  }

  /** Delivers one message synchronously. Dropped while unplugged. */
  receiveNow(data: Uint8Array | number[], timeStamp = 0): void {
    if (this.state !== 'connected') return
    const e: MidiMessageEventLike = { data: Uint8Array.from(data), timeStamp }
    for (const l of [...this.listeners]) l(e)
  }
}

export class FakeMidiOutput extends FakeMidiPort implements MidiOutputLike {
  readonly type = 'output' as const
  readonly sent: Uint8Array[] = []
  /** Where sent bytes go (the device), if anywhere. */
  sink: ((b: Uint8Array) => void) | null = null

  send(data: Uint8Array): void {
    if (this.state === 'disconnected') throw new DOMException('Port is disconnected', 'InvalidStateError')
    // Sending implicitly opens a closed port.
    if (this.connection === 'closed') this.setConnection('open')
    const copy = Uint8Array.from(data)
    this.sent.push(copy)
    this.sink?.(copy)
  }
}

export class FakeMidiAccess implements MidiAccessLike {
  readonly inputs = new Map<string, FakeMidiInput>()
  readonly outputs = new Map<string, FakeMidiOutput>()
  private readonly listeners = new Set<(e: MidiConnectionEventLike) => void>()
  /** Every statechange fired, as "type:id:state:connection". */
  readonly fired: string[] = []

  constructor(ports: FakeMidiPort[] = []) {
    for (const p of ports) this.add(p)
  }

  addEventListener(_type: 'statechange', listener: (e: MidiConnectionEventLike) => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'statechange', listener: (e: MidiConnectionEventLike) => void): void {
    this.listeners.delete(listener)
  }

  get listenerCount(): number {
    return this.listeners.size
  }

  /** Puts a port in the maps without an event (as it was when access was granted). */
  add(p: FakeMidiPort): this {
    p.access = this
    if (p instanceof FakeMidiInput) this.inputs.set(p.id, p)
    else if (p instanceof FakeMidiOutput) this.outputs.set(p.id, p)
    return this
  }

  /** Plugs ports in: each becomes 'connected' and fires one statechange. */
  plug(...ports: FakeMidiPort[]): void {
    for (const p of ports) {
      this.add(p)
      p.state = 'connected'
      if (p.connection === 'pending') p.connection = 'open'
      this.fire(p)
    }
  }

  /** Unplugs ports: each becomes 'disconnected' (open ones 'pending') and fires one statechange. */
  unplug(...ports: FakeMidiPort[]): void {
    for (const p of ports) {
      p.state = 'disconnected'
      if (p.connection === 'open') p.connection = 'pending'
      this.fire(p)
    }
  }

  fire(port: FakeMidiPort): void {
    this.fired.push(`${port.type}:${port.id}:${port.state}:${port.connection}`)
    for (const l of [...this.listeners]) l({ port })
  }
}

export interface FakeEp {
  access: FakeMidiAccess
  input: FakeMidiInput
  output: FakeMidiOutput
}

/** An input/output pair named [name], as one USB device shows up. */
export function fakePair(name = 'EP-133', manufacturer: string | null = 'teenage engineering', idPrefix?: string): { input: FakeMidiInput; output: FakeMidiOutput } {
  const prefix = idPrefix ?? `dev${nextId++}`
  return {
    input: new FakeMidiInput({ id: `${prefix}-in`, name, manufacturer }),
    output: new FakeMidiOutput({ id: `${prefix}-out`, name, manufacturer }),
  }
}

/**
 * A MIDIAccess holding one EP-133 whose ports are wired to [mock]: what the
 * output sends reaches the mock, and the mock's replies (and pushes) arrive on
 * the input as `midimessage` events.
 */
export function connectMock(mock: MockEP133, name = 'EP-133', access = new FakeMidiAccess()): FakeEp {
  const { input, output } = fakePair(name, 'teenage engineering', 'ep')
  const t = mock.transport()
  output.sink = (b) => t.send(b)
  // The mock already replies in a later microtask.
  t.onMessage((b) => input.receiveNow(b, 0))
  access.add(input).add(output)
  return { access, input, output }
}

/** A navigator stand-in for webMidiSupported / probePermission / requestMidiAccess. */
export function fakeNavigator({
  access,
  permission,
  deny = false,
  queryThrows = false,
}: { access?: MidiAccessLike; permission?: string; deny?: boolean; queryThrows?: boolean } = {}): NavigatorLike & { requests: { sysex: boolean }[] } {
  const requests: { sysex: boolean }[] = []
  const nav: NavigatorLike & { requests: { sysex: boolean }[] } = {
    requests,
    requestMIDIAccess(options: { sysex: boolean }) {
      requests.push(options)
      if (deny || !access) return Promise.reject(new DOMException('denied', 'NotAllowedError'))
      return Promise.resolve(access)
    },
  }
  if (permission !== undefined || queryThrows) {
    nav.permissions = {
      query: () => (queryThrows ? Promise.reject(new TypeError('midi is not a permission')) : Promise.resolve({ state: permission ?? 'prompt' })),
    }
  }
  return nav
}
