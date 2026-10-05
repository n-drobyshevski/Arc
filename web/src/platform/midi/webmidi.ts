// Port of app/src/main/kotlin/dev/arc/ep133/midi/MidiConnector.kt and MidiTransport.kt (+ reference/src/webmidi.js)
//
// Finds the EP-133 through WebMIDI, opens its ports and reports attach/detach.
//
// Web deltas from Android:
// - Android sees one MidiDevice with an input and an output port; WebMIDI
//   lists inputs and outputs separately, so [pickPair] pairs them up (same name
//   first, as Android's "both directions" rule), falling back to PortMatch.pick
//   on each side, then to "the only input and the only output".
// - WebMIDI delivers one complete message per event (the browser reassembles
//   SysEx and splits out real-time bytes), so there is no SysexAssembler: a
//   message starting with F0 goes to the session listeners and nothing else,
//   every other message goes to MidiInput for the live mirror.
// - Event times are ms on the performance.now() timebase (MidiInput's web unit).
// - Device identity is the pair of port ids (Android: MidiDeviceInfo.id).
// - `statechange` fires once per port and also when a port's connection
//   changes (our own open()), so [watchMidi] tracks port states, debounces and
//   coalesces the input and output into one added event per device.
// - There is no maxMessageSize on the web, so that warning is dropped.
//
// Nothing here touches navigator directly except the default arguments, so the
// state layer and tests can pass a MidiAccessLike / NavigatorLike stand-in.

import { MidiInput, type MidiEvent } from '../../core/protocol/midiInput'
import { matches } from '../../core/protocol/portMatch'
import type { Transport } from '../../core/protocol/transport'
import { WebText } from '../../core/text/webText'

// ---------------------------------------------------------------------------
// Structural subset of the Web MIDI API (a real MIDIAccess satisfies it).

export type MidiPortState = 'connected' | 'disconnected'
export type MidiPortConnection = 'open' | 'closed' | 'pending'

export interface MidiPortLike {
  readonly id: string
  readonly name: string | null
  readonly manufacturer: string | null
  readonly type: 'input' | 'output'
  readonly state: MidiPortState
  readonly connection: MidiPortConnection
  open(): Promise<unknown>
  close(): Promise<unknown>
}

export interface MidiMessageEventLike {
  readonly data: Uint8Array | null
  readonly timeStamp: number
}

export interface MidiInputLike extends MidiPortLike {
  addEventListener(type: 'midimessage', listener: (e: MidiMessageEventLike) => void): void
  removeEventListener(type: 'midimessage', listener: (e: MidiMessageEventLike) => void): void
}

export interface MidiOutputLike extends MidiPortLike {
  send(data: Uint8Array, timestamp?: number): void
}

export interface MidiConnectionEventLike {
  readonly port: MidiPortLike | null
}

export interface MidiAccessLike {
  readonly inputs: { values(): Iterable<MidiInputLike> }
  readonly outputs: { values(): Iterable<MidiOutputLike> }
  addEventListener(type: 'statechange', listener: (e: MidiConnectionEventLike) => void): void
  removeEventListener(type: 'statechange', listener: (e: MidiConnectionEventLike) => void): void
}

/** The bits of `navigator` this module uses. */
export interface NavigatorLike {
  requestMIDIAccess?(options: { sysex: boolean }): Promise<MidiAccessLike>
  permissions?: { query(desc: { name: string; sysex?: boolean }): Promise<{ state: string }> }
  userAgent?: string
}

// Compile-time proof that the browser types fit the interfaces above.
const _accessFits: (a: MIDIAccess) => MidiAccessLike = (a) => a
void _accessFits

function browserNavigator(): NavigatorLike | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as unknown as NavigatorLike)
}

// ---------------------------------------------------------------------------
// Errors

export type MidiErrorCode = 'unsupported' | 'denied' | 'notFound' | 'blocked'

/** User-facing texts. notFound and blocked are MidiConnector.kt's; the others are web wording. */
export const MIDI_TEXT: Record<MidiErrorCode, string> = {
  unsupported: WebText.MIDI_UNSUPPORTED,
  denied: WebText.MIDI_DENIED,
  notFound: WebText.MIDI_NOT_FOUND,
  blocked: WebText.MIDI_BLOCKED,
}

/** Whether [nav] is Firefox, whose MIDI access goes through a site permission add-on. */
function isFirefox(nav: NavigatorLike): boolean {
  return /\bFirefox\//.test(nav.userAgent ?? '')
}

/** A failure to find or open the EP-133 (webmidi.js MidiError, MidiConnector.kt MidiError). */
export class MidiError extends Error {
  readonly code: MidiErrorCode

  constructor(code: MidiErrorCode, message: string = MIDI_TEXT[code]) {
    super(message)
    this.name = 'MidiError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Support and permission

/** Whether this browser can talk MIDI at all (MidiConnector.supported). */
export function webMidiSupported(nav: NavigatorLike | undefined = browserNavigator()): boolean {
  return nav != null && typeof nav.requestMIDIAccess === 'function'
}

export type MidiPermission = 'granted' | 'prompt' | 'denied' | 'unsupported'

/**
 * The SysEx MIDI permission without prompting. At boot the app requests access
 * silently (and so can auto-connect) only when this is 'granted'. Browsers that
 * cannot query the permission report 'prompt'.
 */
export async function probePermission(nav: NavigatorLike | undefined = browserNavigator()): Promise<MidiPermission> {
  if (!webMidiSupported(nav)) return 'unsupported'
  const permissions = nav?.permissions
  if (!permissions || typeof permissions.query !== 'function') return 'prompt'
  try {
    const { state } = await permissions.query({ name: 'midi', sysex: true })
    return state === 'granted' || state === 'denied' ? state : 'prompt'
  } catch {
    return 'prompt'
  }
}

/** `requestMIDIAccess({sysex: true})`, with failures as MidiError ('unsupported' or 'denied'). */
export async function requestMidiAccess(nav: NavigatorLike | undefined = browserNavigator()): Promise<MidiAccessLike> {
  const request = nav?.requestMIDIAccess
  if (!nav || typeof request !== 'function') throw new MidiError('unsupported')
  try {
    return await request.call(nav, { sysex: true })
  } catch {
    // Firefox: declining (or not finishing) the add-on prompt lands here.
    throw new MidiError('denied', isFirefox(nav) ? WebText.FIREFOX_MIDI_HINT : MIDI_TEXT.denied)
  }
}

// ---------------------------------------------------------------------------
// Port matching

/** The name the app shows for a port: its name, else its manufacturer. */
export function portLabel(p: Pick<MidiPortLike, 'name' | 'manufacturer'>): string {
  return (p.name ?? '').trim() || (p.manufacturer ?? '').trim()
}

/** PortMatch on the port's name, then on "manufacturer name" (Android's joined device name). */
export function portLooksLikeEp(p: Pick<MidiPortLike, 'name' | 'manufacturer'>): boolean {
  if (matches(p.name)) return true
  const joined = [p.manufacturer, p.name]
    .map((s) => (s ?? '').trim())
    .filter((s) => s !== '')
    .join(' ')
  return matches(joined)
}

const norm = (s: string | null): string => (s ?? '').trim().toLowerCase()

/** Grouping key for the two ports of one device. */
function deviceKey(p: Pick<MidiPortLike, 'name' | 'manufacturer'>): string {
  return norm(p.name) || norm(p.manufacturer)
}

/** Whether an input and an output carry the same device name (and no conflicting manufacturer). */
function sameName(i: MidiPortLike, o: MidiPortLike): boolean {
  const mi = norm(i.manufacturer)
  const mo = norm(o.manufacturer)
  if (mi !== '' && mo !== '' && mi !== mo) return false
  return norm(i.name) !== '' && norm(i.name) === norm(o.name)
}

/** Same manufacturer and both named like an EP-133 ("EP-133 MIDI In" / "EP-133 MIDI Out"). */
function sameMaker(i: MidiPortLike, o: MidiPortLike): boolean {
  const mi = norm(i.manufacturer)
  return mi !== '' && mi === norm(o.manufacturer) && portLooksLikeEp(i) && portLooksLikeEp(o)
}

export interface MidiPair {
  input: MidiInputLike
  output: MidiOutputLike
}

function pairsBy(inputs: readonly MidiInputLike[], outputs: readonly MidiOutputLike[], same: (i: MidiPortLike, o: MidiPortLike) => boolean): MidiPair[] {
  const pairs: MidiPair[] = []
  for (const input of inputs) {
    for (const output of outputs) if (same(input, output)) pairs.push({ input, output })
  }
  return pairs
}

function connected<T extends MidiPortLike>(ports: { values(): Iterable<T> }): T[] {
  return [...ports.values()].filter((p) => p.state !== 'disconnected')
}

function firstMatch<T extends MidiPortLike>(ports: readonly T[]): T | null {
  return ports.find(portLooksLikeEp) ?? null
}

/**
 * The EP-133's input and output (MidiConnector.find), ignoring disconnected ports:
 * 1. the first input/output pair of one device whose name looks like an EP-133
 *    (same port name; else same manufacturer with both names EP-133-like);
 * 2. else the first EP-133-like input and the first EP-133-like output;
 * 3. else the only device that has both directions (PortMatch "the only candidate");
 * 4. else the only input and the only output (webmidi.js pickPort);
 * 5. else null.
 */
export function pickPair(access: MidiAccessLike): MidiPair | null {
  const inputs = connected(access.inputs)
  const outputs = connected(access.outputs)
  const pairs = pairsBy(inputs, outputs, sameName)
  const named = pairs.find((p) => portLooksLikeEp(p.input) || portLooksLikeEp(p.output)) ?? pairsBy(inputs, outputs, sameMaker)[0]
  if (named) return named
  const input = firstMatch(inputs)
  const output = firstMatch(outputs)
  if (input && output) return { input, output }
  if (pairs.length === 1) return pairs[0] as MidiPair
  if (inputs.length === 1 && outputs.length === 1) return { input: inputs[0] as MidiInputLike, output: outputs[0] as MidiOutputLike }
  return null
}

// ---------------------------------------------------------------------------
// Transport

export interface WebMidiTransportOptions {
  /** Clock for messages whose timeStamp is 0 (default performance.now). */
  now?: () => number
  /** Where "send after close" goes (Android Log.w; default console.warn). */
  warn?: (message: string) => void
}

/**
 * [Transport] over a WebMIDI input/output pair (MidiTransport.kt).
 *
 * Only SysEx (first byte F0) reaches [onMessage] listeners; everything else is
 * parsed by MidiInput and goes to [events] listeners. Both are synchronous fan
 * outs from the `midimessage` event; a throwing listener does not stop the others.
 */
export class WebMidiTransport implements Transport {
  readonly input: MidiInputLike
  readonly output: MidiOutputLike
  private readonly sysexListeners = new Set<(b: Uint8Array) => void>()
  private readonly eventListeners = new Set<(e: MidiEvent) => void>()
  private readonly midiInput: MidiInput
  private readonly now: () => number
  private readonly warn: (message: string) => void
  private closed = false

  constructor(input: MidiInputLike, output: MidiOutputLike, { now = () => performance.now(), warn = (m) => console.warn(m) }: WebMidiTransportOptions = {}) {
    this.input = input
    this.output = output
    this.now = now
    this.warn = warn
    this.midiInput = new MidiInput((e) => {
      for (const cb of [...this.eventListeners]) safely(() => cb(e))
    })
    input.addEventListener('midimessage', this.onMidiMessage)
    retain(input)
    retain(output)
  }

  get isClosed(): boolean {
    return this.closed
  }

  private readonly onMidiMessage = (e: MidiMessageEventLike): void => {
    if (this.closed) return
    const data = e.data
    if (!data || data.length === 0) return
    if (data[0] === 0xf0) {
      // MidiInput skips SysEx but it ends running status, as in the Kotlin
      // (which feeds every byte to both); a marker does that without the copy.
      this.midiInput.feed(SYSEX_MARK)
      for (const cb of [...this.sysexListeners]) safely(() => cb(data))
      return
    }
    this.midiInput.feed(data, e.timeStamp || this.now())
  }

  /** Each frame goes out in a single send() call. */
  send(b: Uint8Array): void {
    if (this.closed) {
      this.warn('arc.midi: send after close ignored')
      return
    }
    try {
      this.output.send(b)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`Could not send to the EP-133: ${msg}`, { cause: e })
    }
  }

  onMessage(cb: (b: Uint8Array) => void): () => void {
    this.sysexListeners.add(cb)
    return () => {
      this.sysexListeners.delete(cb)
    }
  }

  /** Notes, clock and transport from the device, for the live mirror (MidiTransport.events). */
  events(cb: (e: MidiEvent) => void): () => void {
    this.eventListeners.add(cb)
    return () => {
      this.eventListeners.delete(cb)
    }
  }

  /** Idempotent: stops listening and closes both ports (best effort). */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.input.removeEventListener('midimessage', this.onMidiMessage)
    this.sysexListeners.clear()
    this.eventListeners.clear()
    release(this.input)
    release(this.output)
    closeQuietly(this.input, this.output)
  }
}

const SYSEX_MARK = Uint8Array.of(0xf0, 0xf7)

// Ports in use by open transports. A port object is shared by everyone holding
// the MIDIAccess (Android hands each open() its own MidiDevice), so a late or
// stale close must not shut a port a newer transport is using.
const portUsers = new WeakMap<MidiPortLike, number>()

function retain(p: MidiPortLike): void {
  portUsers.set(p, (portUsers.get(p) ?? 0) + 1)
}

function release(p: MidiPortLike): void {
  const n = (portUsers.get(p) ?? 0) - 1
  if (n > 0) portUsers.set(p, n)
  else portUsers.delete(p)
}

function safely(f: () => void): void {
  try {
    f()
  } catch (e) {
    console.error(e)
  }
}

/** Closes each port no open transport is using (best effort). */
function closeQuietly(...ports: MidiPortLike[]): void {
  for (const p of ports) {
    if (portUsers.has(p)) continue
    try {
      p.close().catch(() => {})
    } catch {
      // ignored, like the Kotlin runCatching
    }
  }
}

// ---------------------------------------------------------------------------
// Open

export interface OpenMidiOptions extends WebMidiTransportOptions {
  /** How long both ports may take to open (MidiConnector.kt: 5 s). */
  openTimeoutMs?: number
  /** Used only when no access is passed. */
  nav?: NavigatorLike
}

/** An open connection: the transport plus which device it is (MidiConnector.kt OpenMidi). */
export interface OpenMidi {
  transport: WebMidiTransport
  /** Subscribe to notes, clock and transport (MidiTransport.events). */
  events(cb: (e: MidiEvent) => void): () => void
  /** Shown name: the output's name, else the input's, else "EP-133". */
  portName: string
  portIds: { input: string; output: string }
  /** Short id for the "port, id N" description (Android MidiDeviceInfo.id): the output port id. */
  deviceId: string
  access: MidiAccessLike
  /** Whether a removal event from [watchMidi] is about this connection's ports. */
  owns(ev: Pick<MidiDeviceEvent, 'portIds'>): boolean
  close(): void
}

export const OPEN_TIMEOUT_MS = 5000

/**
 * Finds and opens the EP-133 (MidiConnector.open). Without [access] it requests
 * MIDI access first (which may prompt). Errors are MidiError:
 * 'unsupported' / 'denied' (from the access request), 'notFound' (no ports),
 * 'blocked' (a port failed to open within [OpenMidiOptions.openTimeoutMs] or
 * did not end up 'open', e.g. held by another app on Windows).
 */
export async function openMidi(access?: MidiAccessLike, opts: OpenMidiOptions = {}): Promise<OpenMidi> {
  const acc = access ?? (await requestMidiAccess(opts.nav))
  const pair = pickPair(acc)
  if (!pair) throw new MidiError('notFound')
  const { input, output } = pair
  const opens = [input.open(), output.open()]
  const opening = Promise.all(opens)
  const ok = await withTimeout(opening, opts.openTimeoutMs ?? OPEN_TIMEOUT_MS)
  if (!ok || input.connection !== 'open' || output.connection !== 'open') {
    closeQuietly(input, output)
    // Ports that open after the timeout (or after the other port failed) are
    // closed, not leaked. Promise.all would settle at the first rejection.
    if (!ok) void Promise.allSettled(opens).then(() => closeQuietly(input, output))
    throw new MidiError('blocked')
  }
  const transport = new WebMidiTransport(input, output, opts)
  const portIds = { input: input.id, output: output.id }
  return {
    transport,
    events: (cb) => transport.events(cb),
    portName: portLabel(output) || portLabel(input) || 'EP-133',
    portIds,
    deviceId: output.id,
    access: acc,
    owns: (ev) => ev.portIds.includes(portIds.input) || ev.portIds.includes(portIds.output),
    close: () => transport.close(),
  }
}

/** Resolves true when [p] fulfils within [ms], false when it rejects or times out. */
function withTimeout(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    p.then(
      () => {
        clearTimeout(timer)
        resolve(true)
      },
      () => {
        clearTimeout(timer)
        resolve(false)
      },
    )
  })
}

// ---------------------------------------------------------------------------
// Watch

/** One device's ports appearing or disappearing (MidiManager.DeviceCallback's MidiDeviceInfo). */
export interface MidiDeviceEvent {
  /** The device name (port name, else manufacturer). */
  name: string
  /** Ids of the ports this event covers: input and/or output. */
  portIds: string[]
  /**
   * MidiConnector.looksLikeEp: the name matches PortMatch and, for an added
   * device, an EP-133-like input and output are both connected.
   */
  looksLikeEp: boolean
}

export interface WatchMidiOptions {
  /** Quiet time before an added device is announced (default 300 ms). */
  debounceMs?: number
}

export const WATCH_DEBOUNCE_MS = 300

/**
 * Attach/detach notifications until the returned function is called (MidiConnector.watch).
 *
 * - Only real state changes count: a port whose state is already known (for
 *   example the `connected` statechange that open() causes) is ignored.
 * - Added: ports of one device (same name) are collected and announced once,
 *   [WatchMidiOptions.debounceMs] after the last of them (this is also
 *   ArcController's 300 ms auto-connect delay). A port that disappears before
 *   then is dropped from the pending announcement.
 * - Removed: announced at once, once per port, with the port id, so a
 *   transfer is aborted without delay. Match it with OpenMidi.owns. A device's
 *   input and output are not coalesced: names do not identify a device (two
 *   EP-133s on a hub, unnamed ports), and swallowing a "sibling" could hide the
 *   removal of the open device. Callers must be idempotent (the controller is:
 *   the session is already gone at the second event).
 */
export function watchMidi(
  access: MidiAccessLike,
  onAdded: (ev: MidiDeviceEvent) => void,
  onRemoved: (ev: MidiDeviceEvent) => void,
  { debounceMs = WATCH_DEBOUNCE_MS }: WatchMidiOptions = {},
): () => void {
  const known = new Map<string, MidiPortState>()
  for (const p of [...access.inputs.values(), ...access.outputs.values()]) known.set(portKey(p), p.state)

  interface Pending {
    name: string
    ports: Map<string, MidiPortLike>
    timer: ReturnType<typeof setTimeout>
  }
  const pending = new Map<string, Pending>()
  let stopped = false

  const announceAdded = (key: string): void => {
    const p = pending.get(key)
    pending.delete(key)
    if (!p || stopped) return
    const ports = [...p.ports.values()].filter((x) => x.state === 'connected')
    if (ports.length === 0) return
    // Both directions present and named like an EP-133 (MidiConnector.looksLikeEp).
    const both = connected(access.inputs).some(portLooksLikeEp) && connected(access.outputs).some(portLooksLikeEp)
    onAdded({ name: p.name, portIds: ports.map((x) => x.id), looksLikeEp: both && ports.some(portLooksLikeEp) })
  }

  const listener = (e: MidiConnectionEventLike): void => {
    const port = e.port
    if (!port || stopped) return
    const pk = portKey(port)
    const before = known.get(pk)
    if (before === port.state) return
    known.set(pk, port.state)
    const key = deviceKey(port)
    if (port.state === 'connected') {
      const p = pending.get(key)
      if (p) clearTimeout(p.timer)
      const ports = p?.ports ?? new Map<string, MidiPortLike>()
      ports.set(pk, port)
      pending.set(key, { name: p?.name ?? portLabel(port), ports, timer: setTimeout(() => announceAdded(key), debounceMs) })
      return
    }
    // disconnected
    const p = pending.get(key)
    if (p) {
      p.ports.delete(pk)
      if (p.ports.size === 0) {
        clearTimeout(p.timer)
        pending.delete(key)
      }
    }
    onRemoved({ name: portLabel(port), portIds: [port.id], looksLikeEp: portLooksLikeEp(port) })
  }

  access.addEventListener('statechange', listener)
  return () => {
    if (stopped) return
    stopped = true
    access.removeEventListener('statechange', listener)
    for (const p of pending.values()) clearTimeout(p.timer)
    pending.clear()
  }
}

// Port ids are unique per direction only in practice; key on both.
function portKey(p: MidiPortLike): string {
  return `${p.type}:${p.id}`
}
