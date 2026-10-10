// Port of app/src/main/kotlin/dev/arc/ep133/ArcApp.kt (the wiring: library, MIDI, traffic log, clock)
//
// Everything the state layer needs from the platform, behind one injected
// object, so state/ never touches navigator, window, document or indexedDB
// and the controller runs in Node with fakes. The browser wiring
// (createBrowserDeps, as ArcApp.onCreate builds the controller's Library,
// MidiConnector and TrafficLog) is src/boot/browserDeps.ts.
//
// Web additions (no ArcApp counterpart): the cross-tab device lock, the
// wake lock (TransferService / keepScreenOn), the beforeunload guard, tab
// visibility (the activity lifecycle), the document title (the progress
// notification) and the launch queue (VIEW intents).
//
// Live (ported from main's Live KEYS / pad playback delta): [LiveAudioDeps] is
// Android's LiveAudio (one low-latency output mixing the pads and keys),
// [Deps.padSounds] the folder PadSoundCache keeps its copies in,
// [Deps.lastRead] Live's last read of the device (files/live-last.json) and
// [Deps.offlinePads] its pad changes made offline (files/live-pads.json).

import type { RecState } from '../core/features/takeRecorder'
import type { RecordedTake } from '../platform/audio/liveAudio'
import type { TakeStore } from '../platform/storage/takeStore'
import type { ReadonlySignal } from '@preact/signals'
import { signal } from '@preact/signals'
import type { PadSoundStore } from '../core/features/padSoundCache'
import type { WebLatencyHint } from '../core/text/latencyText'
import type { VoiceShape } from '../core/formats/voiceMixer'
import type { TrafficLog } from '../core/protocol/trafficLog'
import type { MidiAccessLike, MidiDeviceEvent, MidiPermission, OpenMidi } from '../platform/midi/webmidi'
import type { ReleaseLock } from '../platform/midi/owner'
import type { Library } from '../platform/storage/library'
import type { CoachPrefs, MirrorPrefs, SettingsStore } from '../platform/storage/settings'
import type { ExternalTarget } from '../platform/storage/external'
import type { PickOptions, ReadableFile } from '../platform/files/pick'
import type { FileData, SaveResult } from '../platform/files/save'
import type { ShareResult } from '../platform/share/share'
import type { SoundPlayer } from '../platform/audio/player'

/** MidiConnector: support, the silent permission probe, access, open and attach/detach. */
export interface MidiDeps {
  supported(): boolean
  /** The SysEx MIDI permission, without prompting. */
  probe(): Promise<MidiPermission>
  /** requestMIDIAccess({sysex: true}); prompts the first time. Rejects with MidiError. */
  requestAccess(): Promise<MidiAccessLike>
  /** Finds and opens the EP-133 through [access]. Rejects with MidiError. */
  open(access: MidiAccessLike): Promise<OpenMidi>
  watch(access: MidiAccessLike, onAdded: (ev: MidiDeviceEvent) => void, onRemoved: (ev: MidiDeviceEvent) => void): () => void
}

/** One device owner across tabs (Web Locks). Resolves null when another tab holds the device. */
export interface LockDeps {
  acquire(): Promise<ReleaseLock | null>
}

/** What the controller uses of the Library (a Library, or a stand-in). */
export type LibraryApi = Pick<
  Library,
  | 'list'
  | 'names'
  | 'bytes'
  | 'blob'
  | 'save'
  | 'update'
  | 'delete'
  | 'prune'
  | 'sweep'
  | 'reconcile'
  | 'indexMissing'
  | 'syncIndex'
  | 'saveLive'
  | 'live'
  | 'restoreFrom'
  | 'estimate'
  | 'persist'
  | 'subscribe'
  | 'loadFolder'
  | 'reconnectFolder'
  | 'exportZip'
  | 'folderPicked'
  | 'target'
  | 'settings'
  | 'onExternalError'
>

/** The press options of [LiveAudioDeps.press]. */
export interface LivePress {
  /** Semitones from the sample's own pitch (KEYS; 0 for a pad). */
  readonly pitch: number
  /** True: sounds until release(id), then fades quickly (the EP-133's gate). False: plays to the end. */
  readonly gate: boolean
  /** When the finger came down (Deps.perfNow, ms: the input event's own time), for the latency note. */
  readonly pressedAt?: number
  /** How the pad plays it: VoiceShape's fields over the defaults (its FX group and sidechain source among them). */
  readonly shape?: Partial<VoiceShape>
}

/**
 * Live's output as the debug screen's latency test names it: [label] is its
 * row (LatencyText.webEngine: the latencyHint and rate, the key in
 * LatencyStats), with the delay the output reported last, for the estimate line.
 */
export interface LiveEngineInfo {
  readonly label: string
  readonly baseMs: number
  /** Null where the browser doesn't report the output's own delay. */
  readonly outputMs: number | null
}

/**
 * Live's sound output (Android LiveAudio + VoiceMixer): one output, open
 * while Live is in front, that mixes the pads and keys being played (up to 8
 * voices). Samples are loaded once under a key ([preload]) so a press only
 * names one. Implemented by platform/audio/liveAudio (wired in boot/browserDeps).
 */
export interface LiveAudioDeps {
  /**
   * Opens the output (Live came on screen) or wakes a suspended one, ready
   * before the first press; nothing is heard until a voice starts.
   * [sampleRate]: a rate to ask for (default: the output's own). False when
   * there is no output.
   */
  open(sampleRate?: number): boolean | Promise<boolean>
  /**
   * Live left the screen or the tab was hidden: what was sounding stops, and
   * the output is suspended but kept, with its samples, for a quick return
   * (absent: [close]).
   */
  suspend?(): void
  /** Lets the output go (long away, or the page unloads); what was sounding stops. Loaded samples may be dropped. */
  close(): void
  /** Wakes the output: call synchronously from a tap, before any await (browsers start audio only after one). */
  resumeInGesture(): void
  /** Loads a decoded sample (s16 interleaved, 1 or 2 channels) under [key]. */
  preload(key: string, pcm: Int16Array, channels: number, sampleRate: number): void
  /** Whether [key] is loaded (a press of it can start now). */
  has(key: string): boolean
  /** Drops the sample under [key], or every sample when no key is given. */
  unload(key?: string): void
  /**
   * Starts voice [id] (a pad "live:g:o" or key "keys:i") playing sample [key].
   * False when there is no output or [key] isn't loaded.
   */
  press(id: string, key: string, options: LivePress): boolean
  /** The finger left: voice [id] fades out (it still sounds a moment when the tap was very short). */
  release(id: string): void
  /** The press became a scroll: voice [id] ends at once (a short fade, however short the press was). */
  cut(id: string): void
  stopAll(): void
  /**
   * Sets up the mix's FX bus (VoiceMixer.control: an FxControl command with
   * its index and two values); kept for the next output, a punch-in excepted
   * (absent: no FX).
   */
  control?(what: number, index: number, x: number, y: number): void
  /** The voices sounding (pad and key ids), for the rings (ArcController.liveKeys). */
  readonly voices: ReadonlySignal<ReadonlySet<string>>
  /** How the output was set up, for the debug log ("48000 Hz, …"), "" before it opens. */
  readonly description: string
  /**
   * Each voice's delay from its press to its first frame leaving the output,
   * where the output goes, and (where the output names it) its latency-test row.
   */
  onStarted(listener: (id: string, latencyMs: number, route: string, engine?: LiveEngineInfo) => void): () => void
  /** The output looks like Bluetooth (its own delay, [outputMs]); the controller says so once. */
  onSlowOutput?(listener: (outputMs: number) => void): () => void
  /**
   * The output's whole delay in ms while it is long enough to be heard against
   * the finger, else null (absent: from [onSlowOutput] only): Live's display line says so.
   */
  readonly late?: ReadonlySignal<number | null>
  /** Lines for the debug log (how the output was set up, or why there is none). */
  onLog?(listener: (line: string) => void): () => void
  /** The debug screen's latencyHint choice (absent: no choice to make). */
  readonly latencyHint?: ReadonlySignal<WebLatencyHint>
  /** Changes it: kept, and an open output is reopened at the new hint. */
  setLatencyHint?(choice: WebLatencyHint): void
  /** The open output's latency-test row once it is set up (again whenever its reported delay changes), else null. */
  readonly engine?: ReadonlySignal<LiveEngineInfo | null>
  // TAKE (LiveAudio.kt's takes); an output without them has no TAKE.
  /** The TAKE key's state. */
  readonly rec?: ReadonlySignal<RecState>
  /** Arms TAKE: the next sound (or the EP-133's PLAY) starts a take. False when there is no output. */
  arm?(): boolean
  /** Stops the take: what was recorded is handed to [onTake]. */
  stopRecording?(): void
  /** The EP-133 started playing (MIDI Start or Continue). */
  transportStarted?(): void
  /** The EP-133 stopped (MIDI Stop). */
  transportStopped?(): void
  /** A take ended: its WAV, or null when nothing was played; [limit] when the 10-minute limit ended it. */
  onTake?(listener: (take: RecordedTake | null, limit: boolean) => void): () => void
}

/** A Live output that never opens (tests, or a browser without Web Audio). */
export function nullLiveAudio(): LiveAudioDeps {
  const voices = signal<ReadonlySet<string>>(new Set())
  return {
    open: () => false,
    close: () => {},
    resumeInGesture: () => {},
    preload: () => {},
    has: () => false,
    unload: () => {},
    press: () => false,
    release: () => {},
    cut: () => {},
    stopAll: () => {},
    voices,
    description: '',
    onStarted: () => () => {},
  }
}

/** Live's last read of the device (LiveSnapshot JSON): Android's files/live-last.json. */
export interface LastReadDeps {
  load(): string | null | Promise<string | null>
  save(json: string): void | Promise<void>
}

/** Live's pad changes made offline (OfflinePads JSON): Android's files/live-pads.json. */
export interface OfflinePadsDeps {
  load(): string | null | Promise<string | null>
  /** Null removes them. */
  save(json: string | null): void | Promise<void>
}

/** Files.kt and the activity's pickers. */
export interface FileDeps {
  /** The file picker (call from a tap); [] when closed. */
  pick(options: PickOptions): Promise<File[]>
  /** Files.read: the whole file, failing over 128 MiB. */
  read(file: ReadableFile): Promise<Uint8Array>
  /** CreateDocument: the save picker, else a download. */
  save(name: string, data: FileData, mime?: string): Promise<SaveResult>
  /** Whether a writable folder can be picked (File System Access). */
  canPickFolder(): boolean
  /** OpenDocumentTree: a writable folder, or null when cancelled. */
  pickFolder(): Promise<ExternalTarget | null>
}

/** Files.share. 'saved' means the browser could not share files and saved instead. */
export interface ShareDeps {
  share(name: string, data: FileData, mime: string, title: string, text?: string): Promise<ShareResult>
  /** Whether this browser can share a file (navigator.canShare with files); where not, Share is left out. */
  canShareFiles?(): boolean
}

/**
 * teenage engineering's site, for the factory sounds (FactorySounds): [path]s
 * on its origin, read through arc's own (platform/net/factory). A cancel
 * rejects with CancelledError.
 */
export interface FactoryDeps {
  text(path: string, signal: AbortSignal): Promise<string>
  /** The file, with its progress as it arrives ([total] null when the server doesn't say). */
  bytes(path: string, signal: AbortSignal, onProgress: (done: number, total: number | null) => void): Promise<Uint8Array>
}

/** The activity lifecycle: started/stopped becomes tab visible/hidden. */
export interface VisibilityDeps {
  visible(): boolean
  subscribe(listener: (visible: boolean) => void): () => void
  /** The page is being unloaded or put in the back-forward cache (pagehide): onDestroy's stand-in. */
  onPageHide?(listener: () => void): () => void
}

/** The document title (the progress notification's stand-in). */
export interface TitleDeps {
  get(): string
  set(title: string): void
}

export interface Deps {
  midi: MidiDeps
  lock: LockDeps
  library: LibraryApi
  /** SettingsStore (SharedPreferences "settings"). */
  settings: SettingsStore
  /** SharedPreferences "mirror": learned pads and pad order. */
  mirrorPrefs: MirrorPrefs
  /** Where the first-run guide's flag was before AppSettings.guideSeen (MainActivity coach_seen), read to carry it over. */
  coach: CoachPrefs
  files: FileDeps
  share: ShareDeps
  player: SoundPlayer
  /** Live's pads and keys (Android LiveAudio). */
  liveAudio: LiveAudioDeps
  /** Where Live's copies of the device's pad sounds are kept (Android files/pad-sounds). */
  padSounds: PadSoundStore
  /** Where Live's takes are kept (Android files/takes); without it there is no TAKE. */
  takes?: TakeStore
  /** Live's last read, shown while the device is not connected. */
  lastRead: LastReadDeps
  /** Live's pad changes made offline, until the EP-133 connects (or Reset pads). */
  offlinePads: OfflinePadsDeps
  /** Where the factory sounds are downloaded from; absent: they can't be. */
  factory?: FactoryDeps | undefined
  /** Screen wake lock: on while a task runs, or Live is open with keepScreenOn. */
  wakeLock: { set(on: boolean): Promise<void> }
  trafficLog: TrafficLog
  /** Wall clock, ms (System.currentTimeMillis). */
  now(): number
  /** The MIDI event clock, ms (System.nanoTime's role; performance.now on the web). */
  perfNow(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  /**
   * Runs [fn] at the display's next frame (requestAnimationFrame), or after a
   * short timer where frames don't come (no window, a hidden tab); returns
   * a cancel. Absent: the short timer.
   */
  requestFrame?: ((fn: () => void) => () => void) | undefined
  /** Adds a beforeunload guard (preventDefault) until the returned function is called. */
  guardUnload(): () => void
  visibility: VisibilityDeps
  title: TitleDeps
  /** launchQueue: files opened with the installed app. False when nothing will ever arrive. */
  launchFiles(onFiles: (files: File[]) => void): boolean
  /** navigator.clipboard.writeText, where there is one. */
  clipboard?: { writeText(text: string): Promise<void> } | undefined
  /** For the debug log header (Build fields on Android). */
  userAgent: string
  /** Settings changed in another tab (the window "storage" event). */
  onStorageChange?: ((listener: () => void) => () => void) | undefined
}

/**
 * The library when its database can't be opened (IndexedDB blocked or broken,
 * as in some private windows). Reads and writes fail with [error]'s message,
 * so the controller shows Strings.libraryFailed as Android does when Room
 * fails, and the device side (connect, the browser, Live) still works.
 */
export function unavailableLibrary(error: unknown): LibraryApi {
  const message = error instanceof Error && error.message.length !== 0 ? error.message : String(error)
  const fail = (): Promise<never> => Promise.reject(new Error(message))
  const nothing = async (): Promise<void> => {}
  return {
    list: fail,
    names: fail,
    bytes: fail,
    blob: fail,
    save: fail,
    update: fail,
    delete: fail,
    prune: fail,
    restoreFrom: fail,
    exportZip: fail,
    reconnectFolder: fail,
    sweep: nothing,
    reconcile: nothing,
    indexMissing: nothing,
    syncIndex: nothing,
    saveLive: nothing,
    live: () => null,
    estimate: async () => null,
    persist: async () => false,
    loadFolder: async () => 'none',
    subscribe: () => () => {},
    folderPicked: false,
    target: null,
    settings: () => ({}),
    onExternalError: () => {},
  }
}
