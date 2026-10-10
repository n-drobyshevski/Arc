// Port of app/src/main/kotlin/dev/arc/ep133/ArcApp.kt (onCreate: the controller's Library, MidiConnector and TrafficLog)
//
// The composition root: wires the platform/ implementations into the
// state layer's [Deps]. The only place that reads window, document and
// navigator for the state layer, so state/ itself stays free of browser
// globals and runs in Node with fakes.
//
// ?demo (BrowserDepsOptions.demo) never touches the real library or settings:
// its library is the separate IndexedDB "arc-demo" (with Live's pad-sound
// copies), its settings, mirror preferences and last read live in memory
// for the page's lifetime, its library broadcasts on its own channel and its
// device lock has its own name, so a real tab can still connect the EP-133.

import { TrafficLog } from '../core/protocol/trafficLog'
import { openMidi, probePermission, requestMidiAccess, watchMidi, webMidiSupported } from '../platform/midi/webmidi'
import { DEVICE_LOCK_NAME, acquireDeviceLock, type LocksLike } from '../platform/midi/owner'
import { memoryPadSoundStore, type PadSoundStore } from '../core/features/padSoundCache'
import { browserChannel, CHANNEL_NAME } from '../platform/storage/channel'
import { DEMO_DB_NAME, type OpenOptions } from '../platform/storage/db'
import { Library } from '../platform/storage/library'
import { IdbPadSoundStore } from '../platform/storage/padSoundStore'
import {
  CoachPrefs,
  LastReadPrefs,
  MirrorPrefs,
  SettingsStore,
  browserStorage,
  memoryStorage,
  type KeyValueStorage,
} from '../platform/storage/settings'
import { canPickFolder, pickFolder } from '../platform/storage/external'
import { pickFiles, readFile } from '../platform/files/pick'
import { saveBytes } from '../platform/files/save'
import { onLaunchFiles } from '../platform/files/launchQueue'
import { canShareFiles, shareFile } from '../platform/share/share'
import { IdbTakeStore, memoryTakeStore, type TakeStore } from '../platform/storage/takeStore'
import { WebAudioPlayer } from '../platform/audio/player'
import { LiveAudio } from '../platform/audio/liveAudio'
import { createWakeLock } from '../platform/wakelock/wakeLock'
import { unavailableLibrary, type Deps, type LibraryApi } from '../state/deps'

type Timer = ReturnType<typeof globalThis.setTimeout>

/** ?demo's library channel (BroadcastChannel) and device lock, apart from the real ones. */
export const DEMO_CHANNEL_NAME = `${CHANNEL_NAME}-demo`
export const DEMO_LOCK_NAME = `${DEVICE_LOCK_NAME}-demo`

/** navigator.locks with every lock name swapped for ?demo's own (so a demo tab never holds the real device lock). */
function demoLocks(): LocksLike | undefined {
  const real = typeof navigator === 'undefined' ? undefined : (navigator as unknown as { locks?: LocksLike }).locks
  if (!real || typeof real.request !== 'function') return undefined
  return { request: (_name, options, callback) => real.request(DEMO_LOCK_NAME, options, callback) }
}

/** What the page wants to hear about while the library database opens or runs. */
export interface BrowserDepsOptions {
  /**
   * Another tab holds an older version of the database open, so opening it
   * waits until that tab closes (say "close other arc tabs"). The open (and
   * so createBrowserDeps) resolves once it does.
   */
  onLibraryBlocked?: () => void
  /**
   * Another tab opened a newer version: this tab's library connection has
   * closed and every library call fails until the page reloads.
   */
  onLibraryVersionChange?: () => void
  /**
   * ?demo: a separate library database ("arc-demo"), settings in memory, and
   * its own library channel and device lock. Nothing real is read or written.
   */
  demo?: boolean
  /**
   * Where settings, mirror preferences and Live's last read are kept. Default:
   * localStorage, or memory with [demo]. main.tsx passes the one it read the
   * theme from.
   */
  storage?: KeyValueStorage
}

/** The settings storage for a page: memory for ?demo (nothing real is touched), else localStorage. */
export function pageStorage(demo: boolean): KeyValueStorage {
  return demo ? memoryStorage() : browserStorage()
}

/**
 * The browser's [Deps]: opens the library database (and so is async). Call
 * once at startup; then createController(deps) and controller.start().
 * Never rejects for the database: without it the library is
 * [unavailableLibrary] and the device side still works.
 */
export async function createBrowserDeps(options: BrowserDepsOptions = {}): Promise<Deps> {
  const demo = options.demo === true
  const storage = options.storage ?? pageStorage(demo)
  let library: LibraryApi
  let padSounds: PadSoundStore
  let takes: TakeStore
  try {
    const dbOptions: OpenOptions = {}
    if (demo) dbOptions.name = DEMO_DB_NAME
    if (options.onLibraryBlocked) dbOptions.onBlocked = options.onLibraryBlocked
    if (options.onLibraryVersionChange) dbOptions.onVersionChange = options.onLibraryVersionChange
    const lib = await Library.open(demo ? { dbOptions, channel: browserChannel(DEMO_CHANNEL_NAME) } : { dbOptions })
    library = lib
    padSounds = new IdbPadSoundStore(lib.db)
    takes = new IdbTakeStore(lib.db)
  } catch (e) {
    // Without a database the app still starts; every library action says why it failed.
    library = unavailableLibrary(e)
    // Live's pad copies then last for the session.
    padSounds = memoryPadSoundStore()
    // And takes too.
    takes = memoryTakeStore()
  }
  const settings = new SettingsStore(storage)
  const mirrorPrefs = new MirrorPrefs(storage)
  const doc = typeof document === 'undefined' ? undefined : document
  const win = typeof window === 'undefined' ? undefined : window
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const player = new WebAudioPlayer()
  const liveAudio = new LiveAudio()
  const wakeLock = createWakeLock()
  return {
    midi: {
      supported: () => webMidiSupported(),
      probe: () => probePermission(),
      requestAccess: () => requestMidiAccess(),
      open: (access) => openMidi(access),
      watch: (access, onAdded, onRemoved) => watchMidi(access, onAdded, onRemoved),
    },
    lock: { acquire: () => (demo ? acquireDeviceLock(demoLocks() ?? null) : acquireDeviceLock()) },
    library,
    settings,
    mirrorPrefs,
    coach: new CoachPrefs(storage),
    files: {
      pick: (options) => pickFiles(options),
      read: (file) => readFile(file),
      save: (name, data, mime) => saveBytes(name, data, mime),
      canPickFolder: () => canPickFolder(),
      pickFolder: () => pickFolder(),
    },
    share: {
      share: (name, data, mime, title, text) => shareFile(name, data, mime, title, text === undefined ? {} : { text }),
      canShareFiles: () => canShareFiles(),
    },
    player,
    liveAudio,
    padSounds,
    takes,
    lastRead: new LastReadPrefs(storage),
    wakeLock,
    trafficLog: new TrafficLog(),
    now: () => Date.now(),
    perfNow: () => performance.now(),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as Timer),
    guardUnload() {
      if (!win) return () => {}
      const onBeforeUnload = (e: BeforeUnloadEvent): void => {
        e.preventDefault()
        // Older browsers want returnValue set.
        e.returnValue = ''
      }
      win.addEventListener('beforeunload', onBeforeUnload)
      return () => win.removeEventListener('beforeunload', onBeforeUnload)
    },
    visibility: {
      visible: () => !doc || doc.visibilityState === 'visible',
      subscribe(listener) {
        if (!doc) return () => {}
        const on = (): void => listener(doc.visibilityState === 'visible')
        doc.addEventListener('visibilitychange', on)
        return () => doc.removeEventListener('visibilitychange', on)
      },
    },
    title: {
      get: () => doc?.title ?? '',
      set: (t) => {
        if (doc) doc.title = t
      },
    },
    launchFiles: (onFiles) => onLaunchFiles(onFiles),
    clipboard: nav?.clipboard ? { writeText: (t) => nav.clipboard.writeText(t) } : undefined,
    userAgent: nav?.userAgent ?? '',
    onStorageChange(listener) {
      // ?demo's settings are in memory: another tab's change is not its own.
      if (!win || demo) return () => {}
      const on = (e: StorageEvent): void => {
        if (e.key === null || e.key.startsWith('arc.')) listener()
      }
      win.addEventListener('storage', on)
      return () => win.removeEventListener('storage', on)
    },
  }
}
