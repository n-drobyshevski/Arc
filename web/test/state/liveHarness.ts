// A controller on MockEP133 for the Live tests (live.test.ts): fake Live output,
// in-memory pad-sound store and settings, a fake-indexeddb library.
import 'fake-indexeddb/auto'
import { memoryPadSoundStore } from '../../src/core/features/padSoundCache'
import { TrafficLog } from '../../src/core/protocol/trafficLog'
import { NullPlayer } from '../../src/platform/audio/player'
import { readFile } from '../../src/platform/files/pick'
import { openMidi, probePermission, requestMidiAccess, watchMidi, webMidiSupported } from '../../src/platform/midi/webmidi'
import { nullChannel } from '../../src/platform/storage/channel'
import { Library } from '../../src/platform/storage/library'
import { CoachPrefs, LastReadPrefs, MirrorPrefs, SettingsStore, memoryStorage } from '../../src/platform/storage/settings'
import { createController, type ArcController } from '../../src/state/controller'
import type { Deps } from '../../src/state/deps'
import type { ToastMsg, UiState } from '../../src/state/types'
import { DemoData } from '../helpers/demoData'
import { connectMock, fakeNavigator, type FakeEp } from '../helpers/fakeMidiAccess'
import type { MockEP133 } from '../helpers/mockDevice'
import { fakeLiveAudio, type FakeLiveAudio } from './fakeLiveAudio'

let dbCount = 0

export interface LiveHarness {
  c: ArcController
  deps: Deps
  mock: MockEP133
  ep: FakeEp
  library: Library
  storage: ReturnType<typeof memoryStorage>
  padSounds: ReturnType<typeof memoryPadSoundStore>
  liveAudio: FakeLiveAudio
  toasts: ToastMsg[]
  setVisible(v: boolean): void
}

export interface LiveHarnessOptions {
  storage?: ReturnType<typeof memoryStorage>
  padSounds?: ReturnType<typeof memoryPadSoundStore>
  library?: Library
  /** No EP-133 plugged in. */
  unplugged?: boolean
  now?: () => number
}

const all: LiveHarness[] = []

/** Disposes every harness made since the last call (afterEach). */
export function disposeAll(): void {
  for (const h of all.splice(0)) {
    h.c.dispose()
    h.library.close()
  }
}

export function freshLibrary(): Promise<Library> {
  return Library.open({ dbOptions: { name: `arc-live-${++dbCount}-${Math.random().toString(36).slice(2)}` }, channel: nullChannel(), storage: null })
}

export async function liveHarness(opts: LiveHarnessOptions = {}): Promise<LiveHarness> {
  const mock = DemoData.device()
  const ep = connectMock(mock)
  if (opts.unplugged) ep.access.unplug(ep.input, ep.output)
  const nav = fakeNavigator({ access: ep.access, permission: 'prompt' })
  const library = opts.library ?? (await freshLibrary())
  const storage = opts.storage ?? memoryStorage()
  const padSounds = opts.padSounds ?? memoryPadSoundStore()
  const liveAudio = fakeLiveAudio()
  const visListeners = new Set<(v: boolean) => void>()
  let visible = true
  const deps: Deps = {
    midi: {
      supported: () => webMidiSupported(nav),
      probe: () => probePermission(nav),
      requestAccess: () => requestMidiAccess(nav),
      open: (access) => openMidi(access),
      watch: (access, a, r) => watchMidi(access, a, r),
    },
    lock: { acquire: async () => () => {} },
    library,
    settings: new SettingsStore(storage),
    mirrorPrefs: new MirrorPrefs(storage),
    coach: new CoachPrefs(storage),
    files: { pick: async () => [], read: (f) => readFile(f), save: async () => 'saved', canPickFolder: () => false, pickFolder: async () => null },
    share: { share: async () => 'shared' },
    player: new NullPlayer(),
    liveAudio,
    padSounds,
    lastRead: new LastReadPrefs(storage),
    wakeLock: { set: async () => {} },
    trafficLog: new TrafficLog(),
    now: opts.now ?? (() => Date.now()),
    perfNow: () => performance.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    guardUnload: () => () => {},
    visibility: {
      visible: () => visible,
      subscribe: (l) => {
        visListeners.add(l)
        return () => visListeners.delete(l)
      },
    },
    title: { get: () => 'arc', set: () => {} },
    launchFiles: () => false,
    userAgent: 'vitest',
  }
  const c = createController(deps)
  const toasts: ToastMsg[] = []
  c.store.subscribe((s) => {
    if (s.toast && toasts[toasts.length - 1] !== s.toast) toasts.push(s.toast)
  })
  const h: LiveHarness = {
    c,
    deps,
    mock,
    ep,
    library,
    storage,
    padSounds,
    liveAudio,
    toasts,
    setVisible(v) {
      visible = v
      for (const l of [...visListeners]) l(v)
    },
  }
  all.push(h)
  await c.start()
  return h
}

export const until = (h: LiveHarness, pred: (s: UiState) => boolean): Promise<UiState> => h.c.store.waitFor(pred)
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
