// Port of app/src/main/kotlin/dev/arc/ep133/ArcApp.kt (onCreate: the controller's Library, MidiConnector and TrafficLog)
//
// The composition root: wires the platform/ implementations into the
// state layer's [Deps]. The only place that reads window, document and
// navigator for the state layer, so state/ itself stays free of browser
// globals and runs in Node with fakes.

import { TrafficLog } from '../core/protocol/trafficLog'
import { openMidi, probePermission, requestMidiAccess, watchMidi, webMidiSupported } from '../platform/midi/webmidi'
import { acquireDeviceLock } from '../platform/midi/owner'
import type { OpenOptions } from '../platform/storage/db'
import { Library } from '../platform/storage/library'
import { CoachPrefs, MirrorPrefs, SettingsStore, browserStorage } from '../platform/storage/settings'
import { canPickFolder, pickFolder } from '../platform/storage/external'
import { pickFiles, readFile } from '../platform/files/pick'
import { saveBytes } from '../platform/files/save'
import { onLaunchFiles } from '../platform/files/launchQueue'
import { shareFile } from '../platform/share/share'
import { WebAudioPlayer } from '../platform/audio/player'
import { createWakeLock } from '../platform/wakelock/wakeLock'
import { unavailableLibrary, type Deps, type LibraryApi } from '../state/deps'

type Timer = ReturnType<typeof globalThis.setTimeout>

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
}

/**
 * The browser's [Deps]: opens the library database (and so is async). Call
 * once at startup; then createController(deps) and controller.start().
 * Never rejects for the database: without it the library is
 * [unavailableLibrary] and the device side still works.
 */
export async function createBrowserDeps(options: BrowserDepsOptions = {}): Promise<Deps> {
  const storage = browserStorage()
  let library: LibraryApi
  try {
    const dbOptions: OpenOptions = {}
    if (options.onLibraryBlocked) dbOptions.onBlocked = options.onLibraryBlocked
    if (options.onLibraryVersionChange) dbOptions.onVersionChange = options.onLibraryVersionChange
    library = await Library.open({ dbOptions })
  } catch (e) {
    // Without a database the app still starts; every library action says why it failed.
    library = unavailableLibrary(e)
  }
  const settings = new SettingsStore(storage)
  const mirrorPrefs = new MirrorPrefs(storage)
  const doc = typeof document === 'undefined' ? undefined : document
  const win = typeof window === 'undefined' ? undefined : window
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const player = new WebAudioPlayer()
  const wakeLock = createWakeLock()
  return {
    midi: {
      supported: () => webMidiSupported(),
      probe: () => probePermission(),
      requestAccess: () => requestMidiAccess(),
      open: (access) => openMidi(access),
      watch: (access, onAdded, onRemoved) => watchMidi(access, onAdded, onRemoved),
    },
    lock: { acquire: () => acquireDeviceLock() },
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
    },
    player,
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
      if (!win) return () => {}
      const on = (e: StorageEvent): void => {
        if (e.key === null || e.key.startsWith('arc.')) listener()
      }
      win.addEventListener('storage', on)
      return () => win.removeEventListener('storage', on)
    },
  }
}
