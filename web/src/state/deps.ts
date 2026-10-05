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
}

/** The activity lifecycle: started/stopped becomes tab visible/hidden. */
export interface VisibilityDeps {
  visible(): boolean
  subscribe(listener: (visible: boolean) => void): () => void
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
  /** The first-run coach (MainActivity coach_seen); for the UI. */
  coach: CoachPrefs
  files: FileDeps
  share: ShareDeps
  player: SoundPlayer
  /** Screen wake lock: on while a task runs, or Live is open with keepScreenOn. */
  wakeLock: { set(on: boolean): Promise<void> }
  trafficLog: TrafficLog
  /** Wall clock, ms (System.currentTimeMillis). */
  now(): number
  /** The MIDI event clock, ms (System.nanoTime's role; performance.now on the web). */
  perfNow(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
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
