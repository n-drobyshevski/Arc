// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (connect, dropSession, refreshDevice,
// midi.watch in init: :226-308) and app/src/main/kotlin/dev/arc/ep133/midi/MidiConnector.kt
// (+ reference/src/app.js:114-151, reference/src/webmidi.js)
//
// The connection state machine (plan §3), derived from UiState as on Android:
//
//   unsupported (midiSupported=false)          terminal; library only
//   disconnected -connect()-> opening (busy) -open ok-> handshaking (connected, busy)
//        ^                     | error -> dropSession(msg)      | handshake + refreshDevice ok
//        |                     v                                v
//        +-- dropSession <- any error / device removed / connect() toggle -- ready (device, !busy)
//   ready -runTask-> task (busy, task) ; -exclusive-> reading (busy, browser.reading)
//
// Web deltas:
// - MIDI access needs requestMIDIAccess({sysex}), which prompts the first
//   time. At boot ([Connection.boot]) access is requested only when the
//   permission is already granted; then attach/detach is watched and, with
//   autoConnect on and an EP-133 already plugged in, it connects (Android
//   only connects on a USB attach; a page reload is the web's "attach").
//   Otherwise watching starts with the first tap on Connect.
// - The 300 ms auto-connect delay is watchMidi's debounce (WATCH_DEBOUNCE_MS).
// - connect() holds the 'arc-device' Web Lock while its session lives, so
//   two tabs never talk to the device at once (WebText.OTHER_TAB otherwise).
// - Device identity is the pair of port ids (OpenMidi.owns), not MidiDeviceInfo.id.
// - For Try arc's Connect card the state also says what the browser allows
//   (UiState.midiPermission: the boot probe, then every request for access,
//   probed again after a MidiError), whether an EP-133 is plugged in
//   (UiState.plugged, MidiConnector.epPlugged: null until access was given,
//   then recomputed on every attach and detach) and why a Connect did nothing
//   (UiState.connectNote: another tab holds the device).

import { getStorage, listProjects, listSounds } from '../core/protocol/device'
import { LoggingTransport } from '../core/protocol/loggingTransport'
import type { MidiEvent } from '../core/protocol/midiInput'
import { Session } from '../core/protocol/session'
import { Strings } from '../core/text/strings'
import { WebText } from '../core/text/webText'
import type { ReleaseLock } from '../platform/midi/owner'
import {
  MidiError,
  pickPair,
  portLooksLikeEp,
  type MidiAccessLike,
  type MidiDeviceEvent,
  type OpenMidi,
} from '../platform/midi/webmidi'
import type { Deps } from './deps'
import type { Store } from './store'
import { errorText, type Tasks } from './tasks'
import { emptyBrowser, type UiState } from './types'

/** Where the connection is, derived from the state (plan §3). */
export type ConnectionPhase = 'unsupported' | 'disconnected' | 'opening' | 'handshaking' | 'ready' | 'task' | 'reading'

export function connectionPhase(s: UiState): ConnectionPhase {
  if (!s.midiSupported) return 'unsupported'
  if (s.task) return 'task'
  if (s.busy && s.browser.reading !== null) return 'reading'
  if (!s.connected) return s.busy ? 'opening' : 'disconnected'
  if (!s.device) return 'handshaking'
  return s.busy ? 'reading' : 'ready'
}

/** MidiConnector.epPlugged: the ports [pickPair] would open both look like an EP-133. */
export function epPlugged(access: MidiAccessLike): boolean {
  const pair = pickPair(access)
  return pair !== null && portLooksLikeEp(pair.input) && portLooksLikeEp(pair.output)
}

/** A subscription to the device's notes, clock and transport (MidiTransport.events). */
export type LiveEvents = (cb: (e: MidiEvent) => void) => () => void

export interface ConnectionHost {
  store: Store<UiState>
  deps: Deps
  tasks: Tasks
  toast(text: string, error?: boolean): void
  /**
   * dropSession's controller part, run after the session is closed: stop the
   * mirror (showing "not connected" if open) and any device sound.
   */
  onDropped(): void
}

export class Connection {
  /** The open session (ArcController.session). */
  session: Session | null = null
  /** Device description for the debug log export. */
  midiDescription = ''
  private openMidi: OpenMidi | null = null
  private events: LiveEvents | null = null
  private releaseLock: ReleaseLock | null = null
  private access: MidiAccessLike | null = null
  private unwatch: (() => void) | null = null
  private disposed = false

  constructor(private readonly host: ConnectionHost) {}

  /** The live mirror's event stream while connected. */
  get liveEvents(): LiveEvents | null {
    return this.events
  }

  /**
   * At startup: without WebMIDI the app is library only. With the permission
   * already granted, access is taken silently, plugging and unplugging are
   * watched, and an EP-133 already plugged in is connected when autoConnect is on.
   */
  async boot(): Promise<void> {
    const { deps, store } = this.host
    if (!deps.midi.supported()) {
      store.update((s) => ({ ...s, midiSupported: false, midiPermission: 'unsupported' }))
      return
    }
    let permission
    try {
      permission = await deps.midi.probe()
    } catch {
      return
    }
    if (this.disposed) return
    // Access may have been given meanwhile (a tap on Connect): that answer is newer.
    if (this.access === null) store.update((s) => ({ ...s, midiPermission: permission }))
    if (permission !== 'granted') return
    let access: MidiAccessLike
    try {
      access = await this.ensureAccess()
    } catch {
      return
    }
    if (!deps.settings.settings.autoConnect || this.session !== null || store.get().busy) return
    if (epPlugged(access)) await this.connect()
  }

  /** MIDI access (prompting the first time), watched for attach/detach from then on. */
  private async ensureAccess(): Promise<MidiAccessLike> {
    const existing = this.access
    if (existing) return existing
    const access = await this.host.deps.midi.requestAccess()
    if (this.access) return this.access
    this.access = access
    this.host.store.update((s) => ({ ...s, midiPermission: 'granted', plugged: epPlugged(access) }))
    if (!this.disposed) {
      this.unwatch = this.host.deps.midi.watch(
        access,
        (ev) => this.onAdded(ev),
        (ev) => this.onRemoved(ev),
      )
    }
    return access
  }

  /** The EP-133 came or went: UiState.plugged follows (midi.watch in ArcController's init). */
  private syncPlugged(): void {
    const access = this.access
    if (access === null || this.disposed) return
    const plugged = epPlugged(access)
    if (this.host.store.get().plugged !== plugged) this.host.store.update((s) => ({ ...s, plugged }))
  }

  /** After a MidiError: what the browser says about MIDI now (the prompt may have been refused). */
  private async reprobe(): Promise<void> {
    let permission
    try {
      permission = await this.host.deps.midi.probe()
    } catch {
      return
    }
    if (this.disposed || this.access !== null) return
    this.host.store.update((s) => ({ ...s, midiPermission: permission }))
  }

  /** Agreed addition: connect on its own when an EP-133 is plugged in. */
  private onAdded(ev: MidiDeviceEvent): void {
    this.syncPlugged()
    if (!ev.looksLikeEp || !this.host.deps.settings.settings.autoConnect) return
    // watchMidi already waited its 300 ms (ArcController's delay(300)).
    if (this.session === null && !this.host.store.get().busy) void this.connect()
  }

  private onRemoved(ev: MidiDeviceEvent): void {
    this.syncPlugged()
    const open = this.openMidi
    if (open && open.owns(ev) && this.session !== null) {
      this.host.deps.trafficLog.note('device removed')
      this.host.tasks.abortCurrent?.abort()
      this.dropSession(Strings.DISCONNECTED)
    }
  }

  /** The Connect / Disconnect key. */
  async connect(): Promise<void> {
    const { deps, store } = this.host
    if (this.session !== null) {
      deps.trafficLog.note('disconnect')
      this.dropSession(null)
      return
    }
    if (store.get().busy) return
    store.update((s) => ({ ...s, busy: true, connectNote: null }))
    try {
      const release = await deps.lock.acquire()
      if (!release) {
        store.update((s) => ({ ...s, connectNote: WebText.OTHER_TAB }))
        this.host.toast(WebText.OTHER_TAB, true)
        return
      }
      this.releaseLock = release
      const access = await this.ensureAccess()
      const open = await deps.midi.open(access)
      if (this.disposed) {
        open.close()
        throw new Error(Strings.DISCONNECTED)
      }
      this.openMidi = open
      this.midiDescription = `${open.portName}, id ${open.deviceId}`
      deps.trafficLog.note(`connect ${this.midiDescription}`)
      const s = new Session(new LoggingTransport(open.transport, deps.trafficLog))
      this.session = s
      this.events = open.events
      store.update((st) => ({ ...st, connected: true }))
      await s.handshake()
      await this.refreshDevice()
    } catch (e) {
      this.dropSession(errorText(e))
      if (e instanceof MidiError) void this.reprobe()
    } finally {
      store.update((s) => ({ ...s, busy: false }))
    }
  }

  /** Storage, sounds and projects for the device panel; dropped if the session changed meanwhile. */
  async refreshDevice(): Promise<void> {
    const s = this.session
    if (!s) return
    const storage = await getStorage(s)
    const sounds = await listSounds(s)
    const projects = await listProjects(s)
    const info = s.info
    if (!info) return
    if (this.session !== s) return
    this.host.store.update((st) => ({ ...st, device: { info, storage, sounds: sounds.length, projects: projects.length } }))
  }

  /** Closes the session and forgets the device; [message] is shown as an error. */
  dropSession(message: string | null): void {
    this.session?.close()
    this.session = null
    // The session closes the transport; an OpenMidi that never got a session is closed here.
    this.openMidi?.close()
    this.openMidi = null
    this.events = null
    const release = this.releaseLock
    this.releaseLock = null
    release?.()
    this.host.onDropped()
    this.host.store.update((st) => ({ ...st, connected: false, device: null, browser: emptyBrowser, diff: null }))
    if (message !== null) this.host.toast(message, true)
  }

  /** Stops watching and closes the session (page teardown, tests). */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unwatch?.()
    this.unwatch = null
    if (this.session !== null || this.openMidi !== null) this.dropSession(null)
    else {
      this.releaseLock?.()
      this.releaseLock = null
    }
  }
}
