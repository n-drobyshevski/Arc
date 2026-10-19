// Live mirror controller tests (ArcController.kt :615-758; no Android counterpart test).
// MockEP133 behind fakeMidiAccess plays the device: notes arrive as MIDI on the
// input, pad pushes as SysEx through the session.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { padKey as padKeyOf } from '../../src/core/features/padNotes'
import { TrafficLog } from '../../src/core/protocol/trafficLog'
import { MirrorText } from '../../src/core/text/mirrorText'
import { SettingsText } from '../../src/core/text/settingsText'
import { NullPlayer } from '../../src/platform/audio/player'
import { readFile } from '../../src/platform/files/pick'
import { openMidi, probePermission, requestMidiAccess, watchMidi, webMidiSupported } from '../../src/platform/midi/webmidi'
import { nullChannel } from '../../src/platform/storage/channel'
import { Library } from '../../src/platform/storage/library'
import { CoachPrefs, LastReadPrefs, OfflinePadsPrefs, MirrorPrefs, SettingsStore, memoryStorage, type KeyValueStorage } from '../../src/platform/storage/settings'
import { createController, type ArcController } from '../../src/state/controller'
import type { Deps } from '../../src/state/deps'
import { MIRROR_FRAME_MS, MirrorController, activeProject, sameBpm, sameMirrorState, type MirrorHost } from '../../src/state/mirror'
import { emptyMirrorState as emptyMirrorStateFor, initialState, type UiState } from '../../src/state/types'
import { createStore } from '../../src/state/store'
import type { LiveSounds } from '../../src/state/live'
import { CLOCK_TIMEOUT_MS, FADE_MS, LiveMirror } from '../../src/core/features/liveMirror'
import type { MidiEvent } from '../../src/core/protocol/midiInput'
import type { Session } from '../../src/core/protocol/session'
import { memoryPadSoundStore } from '../../src/core/features/padSoundCache'
import { fakeLiveAudio } from './fakeLiveAudio'
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
  padSounds: ReturnType<typeof memoryPadSoundStore>
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
  const padSounds = memoryPadSoundStore()
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
    liveAudio: fakeLiveAudio(),
    padSounds,
    lastRead: new LastReadPrefs(storage),
    offlinePads: new OfflinePadsPrefs(storage),
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
    padSounds,
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
  it('reads names, the active project and its pads first, copies the pads\' sounds once, then sends nothing', async () => {
    const h = await live()
    const m = h.c.state.value.mirror!
    expect(m.error).toBeNull()
    expect(m.offline ?? null).toBeNull()
    expect(m.state.activeProject).toBe(1)
    expect(h.c.state.value.browser.reading).toBeNull()
    // The background copy reads each sound on the project's pads once.
    await vi.waitFor(async () => expect(await h.padSounds.has('index.json')).toBe(true), { timeout: 3000 })
    await vi.waitFor(
      async () => {
        const sent = h.ep.output.sent.length
        await sleep(60)
        expect(h.c.state.value.backgroundRead).toBe(false)
        expect(h.ep.output.sent.length).toBe(sent)
      },
      { timeout: 5000 },
    )
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

  it('publishes at the next frame, once for a burst of notes, and nothing while idle', async () => {
    const h = await live()
    let last = h.c.state.value.mirror
    let publishes = 0
    const off = h.c.store.subscribe((st) => {
      if (st.mirror === last) return
      last = st.mirror
      publishes++
    })
    try {
      // No polling: an idle mirror publishes nothing.
      await sleep(120)
      expect(publishes).toBe(0)
      h.ep.input.receive([0x90, NOTE_A7, 100])
      h.ep.input.receive([0x90, 40, 90])
      h.ep.input.receive([0x90, 41, 80])
      const s = await until(h, (st) => st.mirror?.state.notes.size === 3)
      expect(s.mirror!.state.pads.has(padKeyOf(A7))).toBe(true)
      expect(publishes).toBe(1)
      // Held notes have nothing left to time out: still nothing more.
      await sleep(120)
      expect(publishes).toBe(1)
      // Released, each drops once faded (one timer, no loop).
      h.ep.input.receive([0x80, NOTE_A7, 0])
      h.ep.input.receive([0x80, 40, 0])
      h.ep.input.receive([0x80, 41, 0])
      await until(h, (st) => st.mirror?.state.notes.size === 0)
      expect(publishes).toBe(3)
    } finally {
      off()
    }
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

    // With a read kept, Live shows it offline instead.
    const g = await live()
    g.ep.access.unplug(g.ep.input, g.ep.output)
    await until(g, (st) => st.mirror?.offline != null)
    const off = g.c.state.value.mirror!
    expect(off).toMatchObject({ loading: false, error: null })
    expect(off.offline).toMatch(/^Last seen /)
    expect(off.state.activeProject).toBe(1)
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
    // The last read, offline.
    await until(h, (st) => st.mirror?.offline != null)
    expect(h.c.state.value.mirror).toMatchObject({ error: null })
    await h.c.connect()
    await until(h, (st) => st.mirror !== null && st.mirror.error === null && st.mirror.offline == null && !st.mirror.loading && !st.busy)
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

/**
 * A MirrorController on a hand-driven clock (its timers and perfNow), listening
 * to events sent straight in, beside a LiveMirror fed the same: after every
 * timer (each frame and settle), what is shown must be that mirror's snapshot.
 */
async function clockedMirror() {
  let t = 1000
  let ids = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  const calls = { setTimeout: 0, clearTimeout: 0 }
  let listener: ((e: MidiEvent) => void) | null = null
  const store = createStore<UiState>({ ...initialState(), device: {} as UiState['device'] })
  const session = { onPush: () => () => {} } as unknown as Session
  const host: MirrorHost = {
    store,
    prefs: new MirrorPrefs(memoryStorage()),
    // The first read fails: the mirror runs on the events alone.
    tasks: { exclusive: async () => null } as unknown as MirrorHost['tasks'],
    session: () => session,
    liveEvents: () => (cb) => {
      listener = cb
      return () => {
        listener = null
      }
    },
    perfNow: () => t,
    setTimeout: (fn, ms) => {
      calls.setTimeout++
      timers.set(++ids, { at: t + ms, fn })
      return ids
    },
    clearTimeout: (h) => {
      calls.clearTimeout++
      timers.delete(h as number)
    },
    syncIndex: () => {},
    toast: () => {},
    live: { stopCopy: () => {}, showPack: () => {} } as unknown as LiveSounds,
    fmtDateTime: String,
    fmtMonthDay: String,
    deviceRead: () => {},
  }
  const ctl = new MirrorController(host)
  await ctl.open()
  const ref = new LiveMirror()
  const shown = () => store.get().mirror!.state
  let publishes = 0
  let last = store.get().mirror
  store.subscribe((st) => {
    if (st.mirror !== last) publishes++
    last = st.mirror
  })
  return {
    calls,
    shown,
    get now() {
      return t
    },
    get publishes() {
      return publishes
    },
    send(e: MidiEvent) {
      ref.onMidi(e)
      listener!(e)
    },
    /** Runs the timers due in the next [ms], each at its time, checking the state shown after each. */
    advance(ms: number) {
      const end = t + ms
      for (;;) {
        let id = -1
        let due = { at: Number.POSITIVE_INFINITY, fn: () => {} }
        for (const [k, v] of timers) if (v.at < due.at) [id, due] = [k, v]
        if (due.at > end) break
        timers.delete(id)
        t = due.at
        due.fn()
        expect(sameMirrorState(shown(), ref.snapshot(t))).toBe(true)
      }
      t = end
    },
  }
}

// 120 BPM: 24 clocks a quarter note.
const TICK = 60000 / (120 * 24)

describe('mirror clock frames', () => {
  it('a frame of clocks alone shows the same tempo as a full snapshot, and moves no timer while it reads the same', async () => {
    const h = await clockedMirror()
    const before = h.publishes
    for (let i = 0; i < 200; i++) {
      h.send({ type: 'Clock', time: h.now })
      if (i % 50 === 7) h.send({ type: 'ControlChange', channel: 1, controller: 7, value: 100, time: h.now })
      h.advance(TICK)
    }
    expect(h.shown().bpm).toBeCloseTo(120, 6)
    // The tempo once, from unknown to 120.0; nothing else changed.
    expect(h.publishes - before).toBe(1)
    // One settle timer for its staleness, moved only when it fired (every CLOCK_TIMEOUT_MS), not every frame.
    expect(h.calls.clearTimeout).toBeLessThanOrEqual(3)
  })

  it('a jittery clock shows each tempo that reads otherwise, as a full snapshot would', async () => {
    const h = await clockedMirror()
    for (let i = 0; i < 300; i++) {
      h.send({ type: 'Clock', time: h.now })
      h.advance(TICK + (i % 7 === 0 ? 3 : -0.5))
    }
    expect(h.shown().bpm).not.toBeNull()
  })

  it('clocks with notes and a stop show what a full snapshot shows', async () => {
    const h = await clockedMirror()
    h.send({ type: 'Start', time: h.now })
    for (let i = 0; i < 150; i++) {
      h.send({ type: 'Clock', time: h.now })
      if (i % 12 === 0) h.send({ type: 'NoteOn', channel: 1, note: 36 + (i % 5), velocity: 100, time: h.now })
      if (i % 12 === 6) h.send({ type: 'NoteOff', channel: 1, note: 36 + ((i - 6) % 5), time: h.now })
      h.advance(TICK)
    }
    expect(h.shown().pads.size).toBeGreaterThan(0)
    h.send({ type: 'Stop', time: h.now })
    h.advance(MIRROR_FRAME_MS + 1)
    expect(h.shown().playing).toBe(false)
    h.advance(FADE_MS + 10)
    expect(h.shown().pads.size).toBe(0)
  })

  it('the tempo clears about CLOCK_TIMEOUT_MS after the last clock', async () => {
    const h = await clockedMirror()
    let lastClock = 0
    for (let i = 0; i < 120; i++) {
      lastClock = h.now
      h.send({ type: 'Clock', time: h.now })
      h.advance(TICK)
    }
    expect(h.shown().bpm).toBeCloseTo(120, 6)
    h.advance(lastClock + CLOCK_TIMEOUT_MS - 0.5 - h.now)
    expect(h.shown().bpm).not.toBeNull()
    h.advance(2)
    expect(h.shown().bpm).toBeNull()
  })
})
