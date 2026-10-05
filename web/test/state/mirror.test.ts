// Live mirror controller tests (ArcController.kt :615-758; no Android counterpart test).
// MockEP133 behind fakeMidiAccess plays the device: notes arrive as MIDI on the
// input, pad pushes as SysEx through the session.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { padKey as padKeyOf } from '../../src/core/features/padNotes'
import { TrafficLog } from '../../src/core/protocol/trafficLog'
import { MirrorText } from '../../src/core/text/mirrorText'
import { SettingsText } from '../../src/core/text/settingsText'
import { NullPlayer } from '../../src/platform/audio/player'
import { readFile } from '../../src/platform/files/pick'
import { openMidi, probePermission, requestMidiAccess, watchMidi, webMidiSupported } from '../../src/platform/midi/webmidi'
import { nullChannel } from '../../src/platform/storage/channel'
import { Library } from '../../src/platform/storage/library'
import { CoachPrefs, MirrorPrefs, SettingsStore, memoryStorage, type KeyValueStorage } from '../../src/platform/storage/settings'
import { createController, type ArcController } from '../../src/state/controller'
import type { Deps } from '../../src/state/deps'
import { activeProject, sameBpm, sameMirrorState } from '../../src/state/mirror'
import { emptyMirrorState as emptyMirrorStateFor, type UiState } from '../../src/state/types'
import { DemoData } from '../helpers/demoData'
import { connectMock, fakeNavigator, type FakeEp } from '../helpers/fakeMidiAccess'
import type { MockEP133 } from '../helpers/mockDevice'

let dbCount = 0

interface Harness {
  c: ArcController
  mock: MockEP133
  ep: FakeEp
  library: Library
  storage: KeyValueStorage
  prefs: MirrorPrefs
  setVisible(v: boolean): void
}

const open: Harness[] = []
afterEach(() => {
  for (const h of open.splice(0)) {
    h.c.dispose()
    h.library.close()
  }
})

async function harness(storage: KeyValueStorage = memoryStorage()): Promise<Harness> {
  const mock = DemoData.device()
  const ep = connectMock(mock)
  const nav = fakeNavigator({ access: ep.access, permission: 'prompt' })
  const library = await Library.open({ dbOptions: { name: `arc-mirror-${++dbCount}-${Math.random().toString(36).slice(2)}` }, channel: nullChannel(), storage: null })
  const visListeners = new Set<(v: boolean) => void>()
  let visible = true
  const prefs = new MirrorPrefs(storage)
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
    mirrorPrefs: prefs,
    coach: new CoachPrefs(storage),
    files: { pick: async () => [], read: (f) => readFile(f), save: async () => 'saved', canPickFolder: () => false, pickFolder: async () => null },
    share: { share: async () => 'shared' },
    player: new NullPlayer(),
    wakeLock: { set: async () => {} },
    trafficLog: new TrafficLog(),
    now: () => Date.now(),
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
  const h: Harness = {
    c,
    mock,
    ep,
    library,
    storage,
    prefs,
    setVisible(v) {
      visible = v
      for (const l of [...visListeners]) l(v)
    },
  }
  open.push(h)
  await c.start()
  return h
}

async function connected(storage?: KeyValueStorage): Promise<Harness> {
  const h = await harness(storage)
  await h.c.connect()
  expect(h.c.state.value.device).not.toBeNull()
  return h
}

const until = (h: Harness, pred: (s: UiState) => boolean): Promise<UiState> => h.c.store.waitFor(pred)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Live opened on a connected device, its first read done. */
async function live(storage?: KeyValueStorage): Promise<Harness> {
  const h = await connected(storage)
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy)
  return h
}

// Pad "7" of group A: offset 9 (note 45), the top-left key.
const NOTE_A7 = 36 + 9
const A7 = { group: 0, offset: 9 }

describe('live mirror', () => {
  it('reads names, the active project and its pads first, without sending anything after', async () => {
    const h = await live()
    const m = h.c.state.value.mirror!
    expect(m.error).toBeNull()
    expect(m.state.activeProject).toBe(1)
    expect(h.c.state.value.browser.reading).toBeNull()
    const sent = h.ep.output.sent.length
    await sleep(100)
    expect(h.ep.output.sent.length).toBe(sent)
  })

  it('lights a pad from a NoteOn and names it once a pad push links the key (pushPadActive)', async () => {
    const h = await live()
    h.ep.input.receive([0x90, NOTE_A7, 100])
    let s = await until(h, (st) => st.mirror?.state.pads.has(padKeyOf(A7)) === true)
    expect(s.mirror!.state.pads.get(padKeyOf(A7))).toMatchObject({ velocity: 100, channel: 1, offAt: null })
    expect(s.mirror!.state.lastHit).toMatchObject({ note: NOTE_A7, name: null })
    expect(h.c.mirrorName(A7)).toBeNull()
    // The device pushes the pad's file id: project 1, group A, p01 (kick, slot 1).
    h.mock.pushPadActive(1, 0, 1)
    s = await until(h, (st) => st.mirror?.state.lastHit?.name === 'kick')
    expect(s.mirror!.state.lastHit?.slot).toBe(1)
    expect(s.mirror!.state.pushesSeen).toBe(true)
    expect(s.mirror!.state.learned.get(9)).toBe(1)
    expect(h.c.mirrorName(A7)).toBe('kick')
    // Learned pads are kept (SharedPreferences "mirror" learned = "offset:pad").
    expect(h.prefs.learnedRaw()).toBe('9:1')
    // Released: it fades out, then goes.
    h.ep.input.receive([0x80, NOTE_A7, 0])
    s = await until(h, (st) => st.mirror?.state.pads.get(padKeyOf(A7))?.offAt != null)
    await until(h, (st) => st.mirror?.state.pads.has(padKeyOf(A7)) === false)
  })

  it('names pads straight away with links learned in an earlier session', async () => {
    const storage = memoryStorage({ 'arc.mirror.learned': '9:1,99:3,x' })
    const h = await live(storage)
    expect(h.c.state.value.mirror!.state.learned).toEqual(new Map([[9, 1]]))
    h.ep.input.receive([0x90, NOTE_A7, 64])
    const s = await until(h, (st) => st.mirror?.state.lastHit?.name != null)
    expect(s.mirror!.state.lastHit?.name).toBe('kick')
  })

  it("a push from another project reads that project's pads", async () => {
    const h = await live(memoryStorage({ 'arc.mirror.learned': '9:1' }))
    h.mock.pushPadActive(2, 0, 1)
    await until(h, (st) => st.mirror?.state.activeProject === 2 && !st.busy)
    // Project 2 has "hat open" (slot 4) on A p01.
    expect(h.c.mirrorName(A7)).toBe('hat open')
  })

  it('waits for a running transfer before its first read', async () => {
    const h = await connected()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const task = h.c.runTask('Busy', () => gate)
    h.c.setLive(true)
    await sleep(50)
    expect(h.c.state.value.mirror?.loading).toBe(true)
    expect(h.c.state.value.mirror?.state.activeProject).toBeNull()
    release()
    await task
    const s = await until(h, (st) => st.mirror?.loading === false && !st.busy)
    expect(s.mirror!.state.activeProject).toBe(1)
  })

  it('pauses while the tab is hidden and runs again when it is shown', async () => {
    const h = await live()
    h.setVisible(false)
    h.ep.input.receive([0x90, NOTE_A7, 90])
    await sleep(80)
    expect(h.c.state.value.mirror!.state.pads.size).toBe(0)
    h.setVisible(true)
    await until(h, (st) => st.mirror?.loading === false && !st.busy)
    h.ep.input.receive([0x90, NOTE_A7, 90])
    await until(h, (st) => st.mirror?.state.pads.has(padKeyOf(A7)) === true)
  })

  it('shows "not connected" without a device, and after the device goes', async () => {
    const h = await harness()
    await h.c.openMirror()
    expect(h.c.state.value.mirror).toMatchObject({ loading: false, error: MirrorText.NOT_CONNECTED })
    expect(h.c.state.value.mirror!.state).toEqual(emptyMirrorStateFor('FROM_TOP'))
    h.c.closeMirror()
    expect(h.c.state.value.mirror).toBeNull()

    const g = await live()
    g.ep.access.unplug(g.ep.input, g.ep.output)
    expect(g.c.state.value.mirror).toMatchObject({ loading: false, error: MirrorText.NOT_CONNECTED })
  })

  it('leaving the Live tab closes the mirror', async () => {
    const h = await live()
    h.c.tabChanged('live', 'backups')
    expect(h.c.state.value.mirror).toBeNull()
    h.ep.input.receive([0x90, NOTE_A7, 90])
    await sleep(80)
    expect(h.c.state.value.mirror).toBeNull()
  })

  it('pad order and forgetting learned links are kept in the mirror preferences', async () => {
    const h = await live(memoryStorage({ 'arc.mirror.learned': '9:1' }))
    h.c.setPadOrder('FROM_BOTTOM')
    expect(h.prefs.orderRaw()).toBe('FROM_BOTTOM')
    expect(h.c.padOrder()).toBe('FROM_BOTTOM')
    await until(h, (st) => st.mirror?.state.padOrder === 'FROM_BOTTOM')
    h.c.forgetLearned()
    expect(h.prefs.learnedRaw()).toBeNull()
    expect(h.c.state.value.toast?.text).toBe(SettingsText.FORGOTTEN)
    await until(h, (st) => st.mirror?.state.learned.size === 0)
    // Not connected: the choice still shows.
    h.c.pauseMirror()
    h.c.setPadOrder('FROM_TOP')
    expect(h.c.state.value.mirror?.state.padOrder).toBe('FROM_TOP')
  })
})

describe('mirror lifecycle', () => {
  it('openMirror outside Live keeps running (the next state change does not pause it)', async () => {
    const h = await connected()
    await h.c.openMirror()
    expect(h.c.state.value.mirror).toMatchObject({ loading: false, error: null })
    h.ep.input.receive([0x90, NOTE_A7, 90])
    await until(h, (st) => st.mirror?.state.pads.has(padKeyOf(A7)) === true)
  })

  it('pauseMirror in Live is not undone by the next state change', async () => {
    const h = await live()
    h.c.pauseMirror()
    h.c.toast('a state change')
    h.ep.input.receive([0x90, NOTE_A7, 90])
    await sleep(80)
    expect(h.c.state.value.mirror!.state.pads.size).toBe(0)
  })

  it('back to Live after leaving it with the mirror already closed: it opens again', async () => {
    const h = await live()
    h.c.closeMirror()
    h.c.tabChanged('live', 'backups')
    expect(h.c.state.value.mirror).toBeNull()
    h.c.setLive(true)
    await until(h, (st) => st.mirror !== null && !st.mirror.loading && !st.busy)
    h.ep.input.receive([0x90, NOTE_A7, 90])
    await until(h, (st) => st.mirror?.state.pads.has(padKeyOf(A7)) === true)
  })

  it('reconnecting while Live is open starts the mirror again for the new session', async () => {
    const h = await live()
    await h.c.connect() // the toggle: disconnect
    expect(h.c.state.value.mirror).toMatchObject({ error: MirrorText.NOT_CONNECTED })
    await h.c.connect()
    await until(h, (st) => st.mirror !== null && st.mirror.error === null && !st.mirror.loading && !st.busy)
    h.ep.input.receive([0x90, NOTE_A7, 90])
    await until(h, (st) => st.mirror?.state.pads.has(padKeyOf(A7)) === true)
  })
})

describe('mirror helpers', () => {
  it('reads the active project like the Kotlin JsonPrimitive chain', () => {
    expect(activeProject(3000)).toBe(1)
    expect(activeProject(4000.7)).toBe(2)
    expect(activeProject('5000')).toBe(3)
    expect(activeProject('5e3')).toBe(3)
    expect(activeProject(' 5000')).toBeNull()
    expect(activeProject(true)).toBeNull()
    expect(activeProject(null)).toBeNull()
    expect(activeProject(undefined)).toBeNull()
    expect(activeProject({ a: 1 })).toBeNull()
    expect(activeProject(3500)).toBeNull()
  })

  it('compares mirror states by value', () => {
    const a = emptyMirrorStateFor('FROM_TOP')
    const b = emptyMirrorStateFor('FROM_TOP')
    expect(sameMirrorState(a, b)).toBe(true)
    b.pads.set(1, { velocity: 1, channel: 1, onAt: 0, offAt: null })
    expect(sameMirrorState(a, b)).toBe(false)
    a.pads.set(1, { velocity: 1, channel: 1, onAt: 0, offAt: null })
    expect(sameMirrorState(a, b)).toBe(true)
    expect(sameMirrorState(a, { ...b, padOrder: 'FROM_BOTTOM' })).toBe(false)
    expect(sameMirrorState({ ...a, bpm: 122.01 }, { ...b, bpm: 122.04 })).toBe(true)
    expect(sameMirrorState({ ...a, bpm: 122.04 }, { ...b, bpm: 122.06 })).toBe(false)
  })

  it('compares tempos at display precision', () => {
    expect(sameBpm(null, null)).toBe(true)
    expect(sameBpm(120, null)).toBe(false)
    expect(sameBpm(null, 120)).toBe(false)
    expect(sameBpm(119.96, 120.04)).toBe(true)
    expect(sameBpm(120.04, 120.06)).toBe(false)
  })
})
