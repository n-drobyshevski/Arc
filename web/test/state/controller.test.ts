// Controller tests (no Android counterpart: ArcController had no unit tests).
// The controller runs against MockEP133 through fakeMidiAccess and the real
// webmidi code, a fake-indexeddb Library, and in-memory stand-ins for the
// rest of the platform.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { encodeWav } from '../../src/core/formats/wav'
import { TrafficLog } from '../../src/core/protocol/trafficLog'
import { RestoreSelection } from '../../src/core/text/libraryRules'
import { SettingsText, ThemeChoice } from '../../src/core/text/settingsText'
import { Strings } from '../../src/core/text/strings'
import { WebText } from '../../src/core/text/webText'
import { NullPlayer } from '../../src/platform/audio/player'
import { readFile } from '../../src/platform/files/pick'
import type { ReleaseLock } from '../../src/platform/midi/owner'
import { openMidi, probePermission, requestMidiAccess, watchMidi, webMidiSupported, type NavigatorLike } from '../../src/platform/midi/webmidi'
import { nullChannel } from '../../src/platform/storage/channel'
import { MemoryTarget } from '../../src/platform/storage/external'
import { Library } from '../../src/platform/storage/library'
import { CoachPrefs, LastReadPrefs, OfflinePadsPrefs, MirrorPrefs, SettingsStore, memoryStorage } from '../../src/platform/storage/settings'
import { connectionPhase } from '../../src/state/connection'
import { createController, type ArcController } from '../../src/state/controller'
import { unavailableLibrary, type Deps } from '../../src/state/deps'
import type { ToastMsg, UiState } from '../../src/state/types'
import { memoryPadSoundStore } from '../../src/core/features/padSoundCache'
import { fakeLiveAudio, type FakeLiveAudio } from './fakeLiveAudio'
import { DemoData, tone } from '../helpers/demoData'
import { connectMock, fakeNavigator, type FakeEp } from '../helpers/fakeMidiAccess'
import { samplePak } from '../helpers/fixtures'
import type { MockEP133 } from '../helpers/mockDevice'

let dbCount = 0

interface Harness {
  c: ArcController
  deps: Deps
  mock: MockEP133
  ep: FakeEp
  library: Library
  player: NullPlayer
  toasts: ToastMsg[]
  titles: string[]
  wake: boolean[]
  guards: { active: number; total: number }
  saved: string[]
  setVisible(v: boolean): void
  launch(files: File[]): void
  lockHeld: { value: boolean }
  liveAudio: FakeLiveAudio
  padSounds: ReturnType<typeof memoryPadSoundStore>
  storage: ReturnType<typeof memoryStorage>
}

const harnesses: Harness[] = []

afterEach(() => {
  for (const h of harnesses.splice(0)) {
    h.c.dispose()
    h.library.close()
  }
})

async function harness(
  opts: { permission?: string; nav?: NavigatorLike; mock?: MockEP133; storage?: Record<string, string>; otherTab?: boolean } = {},
): Promise<Harness> {
  const mock = opts.mock ?? DemoData.device()
  const ep = connectMock(mock)
  const nav = opts.nav ?? fakeNavigator({ access: ep.access, permission: opts.permission ?? 'prompt' })
  const library = await Library.open({ dbOptions: { name: `arc-state-${++dbCount}-${Math.random().toString(36).slice(2)}` }, channel: nullChannel(), storage: null })
  const storage = memoryStorage(opts.storage)
  const player = new NullPlayer()
  const liveAudio = fakeLiveAudio()
  const padSounds = memoryPadSoundStore()
  const visListeners = new Set<(v: boolean) => void>()
  let visible = true
  const titles: string[] = []
  let title = 'arc'
  const wake: boolean[] = []
  const guards = { active: 0, total: 0 }
  const saved: string[] = []
  let launchCb: ((files: File[]) => void) | null = null
  const lockHeld = { value: false }
  const deps: Deps = {
    midi: {
      supported: () => webMidiSupported(nav),
      probe: () => probePermission(nav),
      requestAccess: () => requestMidiAccess(nav),
      open: (access) => openMidi(access),
      watch: (access, onAdded, onRemoved) => watchMidi(access, onAdded, onRemoved),
    },
    lock: {
      acquire: async (): Promise<ReleaseLock | null> => {
        if (opts.otherTab || lockHeld.value) return null
        lockHeld.value = true
        return () => {
          lockHeld.value = false
        }
      },
    },
    library,
    settings: new SettingsStore(storage),
    mirrorPrefs: new MirrorPrefs(storage),
    coach: new CoachPrefs(storage),
    files: {
      pick: async () => [],
      read: (f) => readFile(f),
      save: async (name) => {
        saved.push(name)
        return 'saved'
      },
      canPickFolder: () => false,
      pickFolder: async () => null,
    },
    share: { share: async () => 'shared' },
    player,
    liveAudio,
    padSounds,
    lastRead: new LastReadPrefs(storage),
    offlinePads: new OfflinePadsPrefs(storage),
    wakeLock: {
      set: async (on) => {
        wake.push(on)
      },
    },
    trafficLog: new TrafficLog(),
    now: () => Date.now(),
    perfNow: () => performance.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    guardUnload: () => {
      guards.active++
      guards.total++
      return () => {
        guards.active--
      }
    },
    visibility: {
      visible: () => visible,
      subscribe: (l) => {
        visListeners.add(l)
        return () => visListeners.delete(l)
      },
    },
    title: {
      get: () => title,
      set: (t) => {
        title = t
        titles.push(t)
      },
    },
    launchFiles: (cb) => {
      launchCb = cb
      return true
    },
    userAgent: 'vitest',
  }
  const c = createController(deps)
  const toasts: ToastMsg[] = []
  c.store.subscribe((s) => {
    if (s.toast && toasts[toasts.length - 1] !== s.toast) toasts.push(s.toast)
  })
  const h: Harness = {
    c,
    deps,
    mock,
    ep,
    library,
    player,
    toasts,
    titles,
    wake,
    guards,
    saved,
    lockHeld,
    liveAudio,
    padSounds,
    storage,
    setVisible(v) {
      visible = v
      for (const l of [...visListeners]) l(v)
    },
    launch(files) {
      launchCb?.(files)
    },
  }
  harnesses.push(h)
  return h
}

const texts = (h: Harness): string[] => h.toasts.map((t) => t.text)
const lastToast = (h: Harness): ToastMsg | undefined => h.toasts[h.toasts.length - 1]
const until = (h: Harness, pred: (s: UiState) => boolean): Promise<UiState> => h.c.store.waitFor(pred)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function connected(opts: Parameters<typeof harness>[0] = {}): Promise<Harness> {
  const h = await harness(opts)
  await h.c.start()
  await h.c.connect()
  expect(h.c.state.value.device).not.toBeNull()
  return h
}

async function backedUp(opts: Parameters<typeof harness>[0] = {}): Promise<Harness> {
  const h = await connected(opts)
  await h.c.backup()
  await until(h, (s) => s.backups.length === 1)
  return h
}

describe('connection', () => {
  it('connects: device info, sound and project counts, a traffic note, and the ready phase', async () => {
    const h = await harness()
    await h.c.start()
    expect(connectionPhase(h.c.state.value)).toBe('disconnected')
    const p = h.c.connect()
    expect(h.c.state.value.busy).toBe(true)
    expect(connectionPhase(h.c.state.value)).toBe('opening')
    await p
    const s = h.c.state.value
    expect(s.connected).toBe(true)
    expect(s.busy).toBe(false)
    expect(s.device?.info.product).toBe('EP-133')
    expect(s.device?.info.osVersion).toBe('2.0.5')
    expect(s.device?.sounds).toBe(12)
    expect(s.device?.projects).toBe(3)
    expect(h.c.phase.value).toBe('ready')
    expect(h.c.isConnected).toBe(true)
    expect(h.c.midiDescription).toBe('EP-133, id ep-out')
    expect(h.c.trafficLog.snapshot().some((e) => e.note === 'connect EP-133, id ep-out')).toBe(true)
    expect(h.lockHeld.value).toBe(true)
  })

  it('Connect again disconnects (the toggle) and releases the device lock', async () => {
    const h = await connected()
    await h.c.connect()
    const s = h.c.state.value
    expect(s.connected).toBe(false)
    expect(s.device).toBeNull()
    expect(h.toasts).toHaveLength(0)
    expect(h.lockHeld.value).toBe(false)
    expect(h.c.trafficLog.snapshot().some((e) => e.note === 'disconnect')).toBe(true)
  })

  it('another tab holding the device: nothing opens and OTHER_TAB is shown', async () => {
    const h = await harness({ otherTab: true })
    await h.c.start()
    await h.c.connect()
    expect(h.c.state.value.connected).toBe(false)
    expect(h.c.state.value.busy).toBe(false)
    expect(lastToast(h)).toMatchObject({ text: WebText.OTHER_TAB, error: true })
    expect(h.ep.input.opens).toBe(0)
  })

  it('a refused MIDI permission drops the session with the error', async () => {
    const h = await harness({ nav: fakeNavigator({ deny: true }) })
    await h.c.start()
    await h.c.connect()
    expect(h.c.state.value.connected).toBe(false)
    expect(lastToast(h)).toMatchObject({ text: WebText.MIDI_DENIED, error: true })
    expect(h.lockHeld.value).toBe(false)
  })

  it('without WebMIDI the app is library only', async () => {
    const h = await harness({ nav: {} })
    await h.c.start()
    expect(h.c.state.value.midiSupported).toBe(false)
    expect(h.c.phase.value).toBe('unsupported')
    expect(h.c.state.value.libraryLoaded).toBe(true)
  })

  it('boot: with the permission granted and autoConnect on, a plugged-in EP-133 connects', async () => {
    const h = await harness({ permission: 'granted' })
    await h.c.start()
    expect(h.c.state.value.device?.sounds).toBe(12)
  })

  it('boot: autoConnect off waits for the tap; plugging the device in later does not connect either', async () => {
    const h = await harness({ permission: 'granted', storage: { 'arc.settings': JSON.stringify({ autoConnect: false }) } })
    await h.c.start()
    expect(h.c.state.value.connected).toBe(false)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    h.ep.access.plug(h.ep.input, h.ep.output)
    await sleep(400)
    expect(h.c.state.value.connected).toBe(false)
  })

  it('auto-connects when an EP-133 is plugged in (statechange, debounced)', async () => {
    const h = await harness({ permission: 'granted', storage: { 'arc.settings': JSON.stringify({ autoConnect: false }) } })
    await h.c.start()
    expect(h.c.state.value.connected).toBe(false)
    h.c.setAutoConnect(true)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    h.ep.access.plug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device !== null)
    expect(h.c.state.value.device?.sounds).toBe(12)
  })
})

describe('tasks', () => {
  it('backs up into the library: row, toast, fresh id, browser refreshed, guards released', async () => {
    const h = await connected()
    await h.c.start()
    await h.c.backup()
    const s = await until(h, (st) => st.backups.length === 1)
    const b = s.backups[0]!
    expect(b.source).toBe('device')
    expect(b.title.startsWith('Backup ')).toBe(true)
    expect(b.device.serial).toBe('MOCK0001')
    expect(b.soundCount).toBe(12)
    expect(b.projectCount).toBe(3)
    expect(b.projects).toEqual([1, 2, 5])
    expect(b.size).toBeGreaterThan(0)
    expect(s.freshId).toBe(b.id)
    expect(texts(h)).toContain(Strings.saved(12, 3))
    expect(s.task).toBeNull()
    expect(s.busy).toBe(false)
    expect(s.browser.contents?.sounds).toHaveLength(12)
    // TransferService's stand-ins: wake lock on and off, unload guard, title progress restored.
    expect(h.wake).toEqual([true, false])
    expect(h.guards).toEqual({ active: 0, total: 1 })
    expect(h.titles.some((t) => /^\d+% · Backing up · arc$/.test(t))).toBe(true)
    expect(h.titles[h.titles.length - 1]).toBe('arc')
    expect((await h.library.bytes(b.id)).length).toBe(b.size)
  })

  it('restores everything back into the device with nothing dropped', async () => {
    const h = await backedUp()
    const b = h.c.state.value.backups[0]!
    h.mock.sounds.clear()
    await h.c.restore(b, RestoreSelection(b.slots, b.projects))
    expect(texts(h)).toContain(Strings.restored(12, 3))
    expect(h.mock.dropped).toBe(0)
    expect(h.mock.sounds.size).toBe(12)
    expect(h.c.state.value.busy).toBe(false)
    expect(h.c.state.value.device?.sounds).toBe(12)
  })

  it('compares a backup with the device: the diff lands in the state', async () => {
    const h = await backedUp()
    const b = h.c.state.value.backups[0]!
    const sel = RestoreSelection(b.slots, b.projects)
    await h.c.compare(b, sel)
    const diff = h.c.state.value.diff
    expect(diff?.backupId).toBe(b.id)
    expect(diff?.selection).toBe(sel)
    expect(diff?.result.sounds).toHaveLength(12)
    expect(diff?.result.changes).toBe(0)
    h.c.clearDiff()
    expect(h.c.state.value.diff).toBeNull()
  })

  it('uploads a WAV draft into the first free slot; an unusable file gets an error row', async () => {
    const h = await connected()
    await h.c.refreshBrowser()
    const wav = encodeWav(tone(3000, 220), 1, 46875)
    await h.c.pickForUpload([new File([wav as Uint8Array<ArrayBuffer>], 'My Kick.wav', { lastModified: 5 }), new File([new Uint8Array([1, 2, 3])], 'notes.txt')])
    const draft = h.c.state.value.browser.draft!
    expect(draft).toHaveLength(2)
    expect(draft[0]).toMatchObject({ fileName: 'My Kick.wav', name: 'My Kick', slot: 9, error: null, sampleRate: 46875 })
    expect(draft[1]).toMatchObject({ fileName: 'notes.txt', slot: null, wav: null })
    expect(draft[1]!.error).not.toBeNull()
    h.c.setDraftSlot(0, 42)
    h.c.setDraftTrim(0, { start: 0, end: 1000 })
    expect(h.c.state.value.browser.draft![0]).toMatchObject({ slot: 42, trim: { start: 0, end: 1000 } })
    await h.c.uploadDraft()
    expect(texts(h)).toContain(Strings.uploaded(1))
    expect(h.c.state.value.browser.draft).toBeNull()
    expect(h.mock.sounds.get(42)?.name).toBe('My Kick')
    expect(h.mock.sounds.get(42)?.pcm.length).toBe(2000)
    expect(h.c.state.value.device?.sounds).toBe(13)
  })

  it('cancelTask mid-backup stops between items: cancel toast, nothing saved', async () => {
    const h = await connected()
    const p = h.c.backup()
    await until(h, (s) => (s.task?.fraction ?? 0) > 0)
    h.c.cancelTask()
    expect(h.c.state.value.task).toMatchObject({ cancelling: true, label: Strings.STOPPING })
    await p
    expect(texts(h)).toContain(Strings.CANCELLED)
    expect(h.toasts.find((t) => t.text === Strings.CANCELLED)?.error).toBe(false)
    expect(h.c.state.value.task).toBeNull()
    expect(h.c.state.value.busy).toBe(false)
    expect(await h.library.list()).toHaveLength(0)
    expect(h.c.state.value.connected).toBe(true)
  })

  it('a device unplugged mid-task aborts it and drops the session with DISCONNECTED', async () => {
    const h = await connected()
    const p = h.c.backup()
    await until(h, (s) => (s.task?.fraction ?? 0) > 0)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    expect(h.c.state.value.connected).toBe(false)
    expect(h.c.state.value.device).toBeNull()
    expect(h.toasts.find((t) => t.text === Strings.DISCONNECTED)?.error).toBe(true)
    expect(h.c.trafficLog.snapshot().some((e) => e.note === 'device removed')).toBe(true)
    await p
    expect(h.c.state.value.busy).toBe(false)
    expect(h.c.state.value.task).toBeNull()
    expect(h.lockHeld.value).toBe(false)
    expect(await h.library.list()).toHaveLength(0)
    expect(h.c.phase.value).toBe('disconnected')
  })

  it('only one task at a time: a second runTask is refused without a toast', async () => {
    const h = await connected()
    const p = h.c.backup()
    expect(h.c.state.value.busy).toBe(true)
    let ran = false
    const second = await h.c.runTask('Other', async () => {
      ran = true
      return 1
    })
    expect(second).toBeNull()
    expect(ran).toBe(false)
    expect(h.c.state.value.task?.title).toBe(Strings.BACKING_UP)
    // Short reads are refused too while the transfer runs.
    await h.c.loadSoundDetails(1)
    expect(h.c.state.value.browser.details.size).toBe(0)
    await p
    expect(h.toasts.filter((t) => t.error)).toHaveLength(0)
    expect(await h.c.runTask('Later', async () => 7)).toBe(7)
  })

  it('a failing task toasts its error and frees the device', async () => {
    const h = await connected()
    const r = await h.c.runTask('Broken', async () => {
      throw new Error('boom')
    })
    expect(r).toBeNull()
    expect(lastToast(h)).toMatchObject({ text: 'boom', error: true })
    expect(h.c.state.value.busy).toBe(false)
  })

  it('hiding the tab during a task warns to keep it in front, and stops playback', async () => {
    const h = await connected()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const task = h.c.runTask('Waiting', () => gate)
    await h.c.playNow('trim', DemoData.tone(1000, 300), 1, 46875)
    expect(h.c.playing.value).toBe('trim')
    h.setVisible(false)
    expect(texts(h)).toContain(WebText.KEEP_IN_FRONT)
    expect(h.c.playing.value).toBeNull()
    release()
    await task
    h.setVisible(true)
  })
})

describe('device browser and playback', () => {
  it('reads sound details and project pads, then plays a device sound', async () => {
    const h = await connected()
    await h.c.refreshBrowser()
    await h.c.loadSoundDetails(10)
    expect(h.c.state.value.browser.details.get(10)?.channels).toBe(1)
    await h.c.loadProjectSounds(1)
    expect(h.c.state.value.browser.projectSounds.get(1)).toEqual([1, 2, 3, 4, 5])
    expect(h.c.state.value.browser.projectPads.get(1)?.length).toBeGreaterThan(0)
    await h.c.playDeviceSound(2)
    expect(h.player.resumed).toBe(1)
    expect(h.c.playing.value).toBe('device:2')
    expect(h.player.plays[0]).toMatchObject({ key: 'device:2', channels: 1, sampleRate: 46875 })
    expect(h.c.trafficLog.snapshot().some((e) => e.note?.startsWith('play device:2: 46875 Hz, 1 ch') === true)).toBe(true)
    // Disconnecting stops a device sound.
    await h.c.connect()
    expect(h.c.playing.value).toBeNull()
  })

  it('a stop while the download runs keeps the sound from starting', async () => {
    const h = await connected()
    const p = h.c.playDeviceSound(3)
    h.c.stopPlayback()
    await p
    expect(h.player.plays).toHaveLength(0)
  })

  it('tab side effects: entering Device reads it, leaving it stops playback', async () => {
    const h = await connected()
    h.c.tabChanged('backups', 'device')
    await until(h, (s) => s.browser.contents !== null && !s.busy)
    await h.c.playDeviceSound(1)
    expect(h.c.playing.value).toBe('device:1')
    h.c.tabChanged('device', 'backups')
    expect(h.c.playing.value).toBeNull()
  })
})

describe('library', () => {
  it('imports sample.pak: row, title, toast, no serial', async () => {
    const h = await harness()
    await h.c.start()
    await h.c.import('sample.pak', 0, async () => samplePak())
    const s = await until(h, (st) => st.backups.length === 1)
    const b = s.backups[0]!
    expect(b).toMatchObject({ title: 'sample', source: 'import', fileName: 'sample.pak', soundCount: 12, projectCount: 3 })
    expect(b.device.serial).toBe('')
    expect(s.freshId).toBe(b.id)
    expect(lastToast(h)).toMatchObject({ text: Strings.imported(12, 3), error: false })
  })

  it('imports a file opened with the app (launch queue) and reports a broken one', async () => {
    const h = await harness()
    await h.c.start()
    h.launch([new File([samplePak() as Uint8Array<ArrayBuffer>], 'From Files.PAK')])
    await until(h, (st) => st.backups.length === 1)
    expect(h.c.state.value.backups[0]?.title).toBe('From Files')
    await h.c.importFile(new File([new Uint8Array([1, 2, 3])], 'junk.pak'))
    expect(lastToast(h)?.error).toBe(true)
    expect(lastToast(h)?.text.startsWith(Strings.importFailed('junk.pak', '').slice(0, 10))).toBe(true)
  })

  it('searches sound names across backups (latest query wins)', async () => {
    const h = await harness()
    await h.c.start()
    await h.c.import('sample.pak', 0, async () => samplePak())
    await until(h, (st) => st.backups.length === 1)
    h.c.setSearch('sn')
    h.c.setSearch('kick')
    expect(h.c.state.value.search.query).toBe('kick')
    const s = await until(h, (st) => st.search.results.length > 0)
    expect(s.search.results).toHaveLength(1)
    expect(s.search.results[0]?.hits.map((x) => x.name)).toEqual(['kick'])
    h.c.setSearch('')
    await until(h, (st) => st.search.results.length === 0)
  })

  it('edits, prunes to Keep and deletes', async () => {
    const h = await harness()
    await h.c.start()
    await h.c.import('a.pak', 0, async () => samplePak())
    await h.c.import('b.pak', 0, async () => samplePak())
    await h.c.import('c.pak', 0, async () => samplePak())
    let s = await until(h, (st) => st.backups.length === 3)
    const first = s.backups[0]!
    await h.c.saveEdits(first, '  Renamed  ', 'some notes')
    s = await until(h, (st) => st.backups.some((b) => b.title === 'Renamed'))
    expect(s.backups.find((b) => b.id === first.id)?.notes).toBe('some notes')
    expect(h.c.pruneCount(1)).toBe(2)
    await h.c.setKeepLast(1)
    expect(h.c.settings.value.keepLast).toBe(1)
    expect(lastToast(h)?.text).toBe(SettingsText.pruned(2))
    s = await until(h, (st) => st.backups.length === 1)
    expect(await h.c.delete(s.backups[0]!)).toBe(true)
    expect(lastToast(h)?.text).toBe(Strings.BACKUP_DELETED)
    await until(h, (st) => st.backups.length === 0)
  })

  it("opens a backup's contents, compares two backups and exports pieces", async () => {
    const h = await harness()
    await h.c.start()
    await h.c.import('a.pak', 1000, async () => samplePak())
    await h.c.import('b.pak', 2000, async () => samplePak())
    const s = await until(h, (st) => st.backups.length === 2)
    // Same generatedAt: list order is then by id; pick them by title.
    const x = s.backups.find((b) => b.title === 'a')!
    const y = s.backups.find((b) => b.title === 'b')!
    await h.c.openContents(x)
    const contents = h.c.state.value.contents!
    expect(contents.pak?.sounds.size).toBe(12)
    expect(contents.durations.size).toBe(12)
    await h.c.playBackupSound(1)
    expect(h.c.playing.value).toBe(`backup:${x.id}:1`)
    h.c.closeContents()
    expect(h.c.playing.value).toBeNull()
    expect(h.c.state.value.contents).toBeNull()
    await h.c.compareBackups(x, y)
    expect(h.c.state.value.pakCompare?.error).toBeNull()
    expect(h.c.state.value.pakCompare?.result).not.toBeNull()
    expect(h.c.state.value.pakCompare?.oldNames.get(1)).toBe('kick')
    const wav = await h.c.exportBytes(x.id, 'wav:1')
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF')
    const proj = await h.c.exportBytes(x.id, 'project:1')
    expect(proj[0]).toBe(0x50)
    await expect(h.c.exportBytes(x.id, 'bogus')).rejects.toThrow('bogus')
    await h.c.savePak(x)
    expect(h.saved).toEqual(['a.pak'])
  })

  it('restores from a library folder, taking its settings back', async () => {
    const h = await harness()
    await h.c.start()
    const folder = new MemoryTarget('arc', {
      'arc-20260101-000000-abc.pak': samplePak(),
      'library.json': JSON.stringify({ app: 'arc', version: 1, backups: [], settings: { 'app.theme': 'DARK', 'mirror.order': 'FROM_BOTTOM' } }),
    })
    await h.c.restoreFromFolder(folder)
    expect(lastToast(h)?.text).toMatch(/^Restored 1 backup/)
    await until(h, (st) => st.backups.length === 1)
    expect(h.c.settings.value.theme).toBe(ThemeChoice.DARK)
    expect(h.c.padOrder()).toBe('FROM_BOTTOM')
    expect(h.c.state.value.folderPicked).toBe(true)
    expect(h.c.state.value.folderStatus).toBe('granted')
    // A folder that is not a library folder is refused with the web wording.
    await h.c.restoreFromFolder(new MemoryTarget('Downloads', { 'x.txt': 'hi' }))
    expect(lastToast(h)).toMatchObject({ text: WebText.PICK_ARC_FOLDER, error: true })
  })

  it('keeps the screen on in Live when the setting says so', async () => {
    const h = await harness()
    await h.c.start()
    h.c.setLive(true)
    expect(h.wake).toEqual([true])
    h.c.setKeepScreenOn(false)
    expect(h.wake).toEqual([true, false])
    h.c.setLive(false)
    expect(h.wake).toEqual([true, false])
  })

  it('dismissToast only clears the toast it names', async () => {
    const h = await harness()
    h.c.toast('one')
    const id = h.c.state.value.toast!.id
    h.c.toast('two')
    h.c.dismissToast(id)
    expect(h.c.state.value.toast?.text).toBe('two')
    h.c.dismissToast(h.c.state.value.toast!.id)
    expect(h.c.state.value.toast).toBeNull()
    await sleep(0)
  })
})

describe('failures', () => {
  it('savePak of a backup whose file is gone: FILE_MISSING, and no save picker opens', async () => {
    const h = await harness()
    await h.c.start()
    await h.c.import('a.pak', 0, async () => samplePak())
    const s = await until(h, (st) => st.backups.length === 1)
    await h.c.savePak({ ...s.backups[0]!, id: 'gone' })
    expect(lastToast(h)).toMatchObject({ text: Strings.FILE_MISSING, error: true })
    expect(h.saved).toEqual([])
    // A piece that can't be exported is not saved either.
    await h.c.saveWav(s.backups[0]!, { slot: 99, name: 'nope' } as Parameters<ArcController['saveWav']>[1])
    expect(lastToast(h)?.error).toBe(true)
    expect(h.saved).toEqual([])
  })

  it('a failed folder catch-up after reconnecting is not an unhandled rejection', async () => {
    const h = await harness()
    await h.c.start()
    h.library.reconnectFolder = async () => 'granted'
    h.library.reconcile = async () => {
      throw new Error('database gone')
    }
    await expect(h.c.reconnectFolder()).resolves.toBeUndefined()
    expect(h.c.state.value.folderStatus).toBe('granted')
  })

  it('restoring from a folder: a failed catch-up does not hide that the restore worked', async () => {
    const h = await harness()
    await h.c.start()
    h.library.reconcile = async () => {
      throw new Error('database gone')
    }
    await h.c.restoreFromFolder(new MemoryTarget('arc', { 'arc-20260101-000000-abc.pak': samplePak() }))
    expect(lastToast(h)).toMatchObject({ error: false })
    expect(lastToast(h)?.text).toMatch(/^Restored 1 backup/)
  })

  it('pruning when the library cannot be listed: nothing pruned, no rejection', async () => {
    const h = await harness()
    await h.c.start()
    await h.c.import('a.pak', 0, async () => samplePak())
    await h.c.import('b.pak', 0, async () => samplePak())
    await until(h, (st) => st.backups.length === 2)
    h.library.list = async () => {
      throw new Error('database gone')
    }
    await expect(h.c.setKeepLast(1)).resolves.toBeUndefined()
    expect(h.c.settings.value.keepLast).toBe(1)
  })

  it('without a library database the app still starts: libraryFailed, and the device connects', async () => {
    const h = await harness()
    const c = createController({ ...h.deps, library: unavailableLibrary(new Error('blocked')) })
    const toasts: string[] = []
    c.store.subscribe((st) => {
      if (st.toast && toasts[toasts.length - 1] !== st.toast.text) toasts.push(st.toast.text)
    })
    try {
      await c.start()
      expect(toasts).toContain(Strings.libraryFailed('blocked'))
      expect(c.state.value.libraryLoaded).toBe(false)
      await c.connect()
      expect(c.state.value.device).not.toBeNull()
      await c.import('a.pak', 0, async () => samplePak())
      expect(toasts[toasts.length - 1]).toBe(Strings.importFailed('a.pak', 'blocked'))
    } finally {
      c.dispose()
    }
  })
})
