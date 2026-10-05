// Live's sounds and last read in the controller (main's ArcController delta: copying the pad sounds
// in the background, playing pads and keys from a copy / backup / the device, the offline mirror,
// KEYS settings, clearing the copies, the guide flag, restoring live.json and learned links).
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { physicalPad, padKey } from '../../src/core/features/padNotes'
import { fromJson as snapshotFromJson } from '../../src/core/features/liveSnapshot'
import { toJson as indexToJson } from '../../src/core/backup/libraryIndex'
import { encodeWav } from '../../src/core/formats/wav'
import { writeZip } from '../../src/core/formats/zip'
import { FeatureText } from '../../src/core/text/featureText'
import { BackupDevice, type BackupRecord } from '../../src/core/text/libraryRules'
import { MirrorText } from '../../src/core/text/mirrorText'
import { WebText } from '../../src/core/text/webText'
import { MemoryTarget } from '../../src/platform/storage/external'
import { LIVE_KEY, memoryStorage, SETTINGS_KEY } from '../../src/platform/storage/settings'
import { createStore } from '../../src/state/store'
import { Tasks } from '../../src/state/tasks'
import { HOME_TAB, initialState } from '../../src/state/types'
import type { Session } from '../../src/core/protocol/session'
import { tone } from '../helpers/demoData'
import { disposeAll, freshLibrary, liveHarness, sleep, until, type LiveHarness } from './liveHarness'

afterEach(() => disposeAll())

// With pad numbers counted from the bottom, pad offset k of group A is a/p(k+1):
// project 1 holds kick (slot 1) on a/p01 and clap (slot 5) on a/p05.
const ORDER = { 'arc.mirror.order': 'FROM_BOTTOM' }
const A1 = physicalPad(0, 0)
const A5 = physicalPad(0, 4)
const D12 = physicalPad(3, 11)

const PAD_SLOTS = [1, 2, 3, 4, 5]

/** Connected, Live open, the first read done. */
async function liveOn(opts: Parameters<typeof liveHarness>[0] = {}): Promise<LiveHarness> {
  const h = await liveHarness({ storage: memoryStorage(ORDER), ...opts })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  return h
}

async function copied(h: LiveHarness, slots = PAD_SLOTS): Promise<void> {
  await vi.waitFor(
    async () => {
      for (const slot of slots) expect(await h.padSounds.has(`s${slot}.wav`)).toBe(true)
      expect(h.c.state.value.backgroundRead).toBe(false)
    },
    { timeout: 5000 },
  )
}

function record(id: string, createdAt: number): BackupRecord {
  return {
    id,
    title: `Backup ${id}`,
    notes: '',
    createdAt,
    source: 'device',
    fileName: null,
    device: BackupDevice('EP-133', 'TE032AS001', 'S1', '2.0.5'),
    soundCount: 1,
    projectCount: 0,
    projects: [],
    slots: [1],
    projectSlots: {},
    size: 0,
  }
}

/** A backup holding [name] in [slot], as a real WAV. */
async function backupWith(h: LiveHarness, id: string, slot: number, name: string, createdAt = 1000): Promise<void> {
  const wav = encodeWav(tone(2000, 220), 1, 46875)
  const bytes = await writeZip(
    [
      { path: 'meta.json', data: new TextEncoder().encode(JSON.stringify({ generated_at: '2026-01-02T03:04:05.000Z' })), compress: false },
      { path: `sounds/${slot} ${name}.wav`, data: wav, compress: false },
    ],
    { date: 0, offsetMin: 0 },
  )
  const before = h.c.state.value.backups.length
  await h.library.save(record(id, createdAt), bytes, { [slot]: name })
  await until(h, (s) => s.backups.length === before + 1)
  // The names reload with the list.
  await sleep(10)
}

describe('Tasks: an action waits at most for the sound being copied', () => {
  function tasks(): { store: ReturnType<typeof createStore<ReturnType<typeof initialState>>>; t: Tasks } {
    const store = createStore(initialState())
    const t = new Tasks({
      store,
      deps: { guardUnload: () => () => {}, visibility: { visible: () => true, subscribe: () => () => {} }, title: { get: () => '', set: () => {} } },
      toast: () => {},
      session: () => ({}) as Session,
    })
    return { store, t }
  }

  it('waits for the background read, goes first, and the copy waits for it', async () => {
    const { store, t } = tasks()
    store.update((s) => ({ ...s, backgroundRead: true }))
    const seen: boolean[] = []
    const read = t.exclusive('slot:1', true, async () => {
      seen.push(store.get().backgroundRead, store.get().busy)
      await sleep(5)
      return 7
    })
    let turn = false
    void t.waitTurn().then(() => {
      turn = true
      // Never while the action holds the device.
      expect(store.get().busy).toBe(false)
    })
    await sleep(5)
    expect(seen).toEqual([])
    expect(t.waiters).toBe(1)
    expect(turn).toBe(false)
    store.update((s) => ({ ...s, backgroundRead: false }))
    expect(await read).toBe(7)
    expect(seen).toEqual([false, true])
    await sleep(5)
    expect(turn).toBe(true)
    expect(t.waiters).toBe(0)
  })

  it('the copy never takes the device an action took in the same step (no gap between its turn and marking it)', async () => {
    const { store, t } = tasks()
    let overlap = false
    store.subscribe((s) => {
      if (s.busy && s.backgroundRead) overlap = true
    })
    // An action holds the device; the copy waits for its turn.
    const first = t.exclusive('a', true, async () => {
      await sleep(5)
      return 'a'
    })
    const copy = t.waitTurn(() => {
      store.update((s) => ({ ...s, backgroundRead: true }))
      return true
    })
    // The copy reads its sound, then lets go.
    void copy.then(async () => {
      await sleep(5)
      store.update((s) => ({ ...s, backgroundRead: false }))
    })
    // The action's caller goes straight on to another action as soon as the first ends.
    const second = first.then(() =>
      t.exclusive('b', true, async () => {
        await sleep(5)
        return 'b'
      }),
    )
    expect(await second).toBe('b')
    expect(await copy).toBe(true)
    expect(overlap).toBe(false)
  })

  it('a turn the copy no longer wants is not taken', async () => {
    const { store, t } = tasks()
    store.update((s) => ({ ...s, busy: true }))
    const copy = t.waitTurn(() => false)
    store.update((s) => ({ ...s, busy: false }))
    expect(await copy).toBe(false)
    expect(store.get().backgroundRead).toBe(false)
  })

  it('answers at once when free: two taps in one task, only the first runs', async () => {
    const { t } = tasks()
    const a = t.exclusive('a', true, async () => 'a')
    const b = t.exclusive('b', true, async () => 'b')
    expect(await a).toBe('a')
    expect(await b).toBeNull()
  })

  it('of two actions waiting, the first gets the device and the second gives up, as on Android', async () => {
    const { store, t } = tasks()
    store.update((s) => ({ ...s, backgroundRead: true }))
    const a = t.runTask('A', async () => {
      await sleep(5)
      return 'a'
    })
    const b = t.exclusive('b', true, async () => 'b')
    store.update((s) => ({ ...s, backgroundRead: false }))
    expect(await a).toBe('a')
    expect(await b).toBeNull()
  })
})

describe('Live: copies of the pad sounds', () => {
  it('copies each sound on the active project\'s pads once, in the background, never while an action holds the device', async () => {
    const h = await liveHarness({ storage: memoryStorage(ORDER) })
    let overlap = false
    h.c.store.subscribe((s) => {
      if (s.busy && s.backgroundRead) overlap = true
    })
    await h.c.connect()
    h.c.setLive(true)
    // An action started while a sound is being copied waits only for that sound.
    await until(h, (s) => s.backgroundRead)
    await h.c.refreshBrowser()
    expect(h.c.state.value.browser.contents?.sounds.length).toBe(12)
    await copied(h)
    expect(overlap).toBe(false)
    expect(await h.c.padSoundsSize()).toBeGreaterThan(0)
    // Sounds not on the pads are not copied.
    expect(await h.padSounds.has('s6.wav')).toBe(false)
  })

  it('a sound played from the device list is kept for Live', async () => {
    const h = await liveHarness()
    await h.c.connect()
    await h.c.refreshBrowser()
    await h.c.playDeviceSound(108)
    await vi.waitFor(async () => expect(await h.padSounds.has('s108.wav')).toBe(true))
  })

  it('clears the copies: the size goes to 0, the pads then play from a backup, else say there is none', async () => {
    const h = await liveOn()
    await copied(h)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.mirror?.offline != null)
    await h.c.clearPadSounds()
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.SOUNDS_CLEARED)
    expect(await h.c.padSoundsSize()).toBe(0)
    expect(h.liveAudio.loaded.size).toBe(0)
    await h.c.playPad(A1)
    expect(h.toasts.at(-1)?.text).toBe(WebText.LIVE_NO_COPY)
    expect(h.liveAudio.presses).toHaveLength(0)

    await backupWith(h, 'old', 1, 'Kick.wav', 1000)
    await backupWith(h, 'new', 1, 'kick', 2000)
    await h.c.playPad(A1)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:0', key: '1:kick', options: { gate: true, pitch: 0 } })
  })
})

describe('Live: playing pads', () => {
  it('plays a pad from the copy while held, rings it, and fades it on release', async () => {
    const h = await liveOn()
    await copied(h)
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('1:kick')).toBe(true))
    const gestures = h.liveAudio.gestures
    await h.c.playPad(A1)
    expect(h.liveAudio.gestures).toBe(gestures + 1)
    const p = h.liveAudio.presses.at(-1)!
    expect(p).toMatchObject({ id: 'live:0:0', key: '1:kick', options: { gate: true, pitch: 0 } })
    expect(typeof p.options.pressedAt).toBe('number')
    expect(h.c.playingPads.value.has(padKey(A1))).toBe(true)
    // A chord: a second pad plays alongside.
    await h.c.playPad(A5)
    expect(h.c.liveVoices.value).toEqual(new Set(['live:0:0', 'live:0:4']))
    h.c.releasePad(A1)
    expect(h.liveAudio.releases).toEqual(['live:0:0'])
    // The pad tapped is also the KEYS sound, kept for next time.
    expect(h.c.state.value.keysPad).toMatchObject({ group: 0, offset: 4 })
    expect(h.storage.getItem('arc.mirror.keysPad')).toBe('0:4')
  })

  it("a screen reader's Play plays the whole sample: no gate, no release", async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.playPad(A1, false)
    expect(h.liveAudio.presses.at(-1)?.options.gate).toBe(false)
    expect(h.liveAudio.releases).toEqual([])
  })

  it('a pad let go while its sound was loading still sounds, briefly', async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.clearPadSounds()
    await backupWith(h, 'b', 1, 'kick')
    const playing = h.c.playPad(A1)
    h.c.releasePad(A1)
    await playing
    expect(h.liveAudio.presses.map((p) => p.id)).toEqual(['live:0:0'])
    expect(h.liveAudio.releases).toEqual(['live:0:0', 'live:0:0'])
  })

  it('connected without a copy or backup, a pad plays from the device (and is kept)', async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.clearPadSounds()
    // Stop the copy loop from refilling it first: play right away.
    await h.c.playPad(A5)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:4', key: '5:clap' })
  })

  it('says why nothing plays: no sample known, no output', async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.playPad(D12)
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.NO_SAMPLE)
    h.liveAudio.available = false
    await h.c.playPad(A1)
    expect(h.toasts.at(-1)).toMatchObject({ text: FeatureText.NO_AUDIO_OUTPUT, error: true })
  })

  it('notes each press\'s delay in the debug log and points out Bluetooth once', async () => {
    const h = await liveOn()
    h.liveAudio.started('live:0:0', 12.4)
    expect(h.c.logText()).toContain(MirrorText.latencyNote('live:0:0', 12.4, 'default output'))
    h.liveAudio.slow(200)
    h.liveAudio.slow(220)
    expect(h.toasts.filter((t) => t.text === WebText.LIVE_SLOW_OUTPUT)).toHaveLength(1)
  })
})

describe('Live: KEYS', () => {
  it('asks for a pad first, then plays its sample at each note', async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.playNote(60)
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.PICK_SOUND)
    h.c.selectKeysPad(A1)
    await h.c.playNote(60)
    await h.c.playNote(64)
    expect(h.liveAudio.presses.map((p) => [p.id, p.key, p.options.pitch])).toEqual([
      ['note:60', '1:kick', 0],
      ['note:64', '1:kick', 4],
    ])
    expect(h.c.playingNotes.value).toEqual(new Set([60, 64]))
    h.c.releaseNote(64)
    expect(h.liveAudio.releases).toEqual(['note:64'])
    // D5 (74), as the grid's D major from D5 or the piano plays it: 14 semitones over C4.
    await h.c.playNote(74)
    expect(h.liveAudio.presses.at(-1)?.options.pitch).toBe(14)
  })

  it('a slide over the keys says why it is quiet once, not once a key', async () => {
    const h = await liveOn()
    await copied(h)
    for (const n of [60, 62, 64, 65, 67]) await h.c.playNote(n)
    expect(h.toasts.filter((t) => t.text === MirrorText.PICK_SOUND)).toHaveLength(1)
  })

  it('keeps the KEYS choices with the settings, clamped, written only when they change', async () => {
    const h = await liveHarness()
    h.c.setKeysOctave(99)
    h.c.setKeysRoot(-3)
    h.c.setLiveKeys(true)
    h.c.setKeysNames('LETTERS')
    expect(h.c.settings.value).toMatchObject({ keysOctave: 8, keysRoot: 0, liveKeys: true, keysNames: 'LETTERS' })
    expect(JSON.parse(h.storage.getItem(SETTINGS_KEY)!)).toEqual({ keysOctave: 8, liveKeys: true, keysNames: 'LETTERS' })
  })

  it('the KEYS pad comes back after a restart', async () => {
    const storage = memoryStorage({ 'arc.mirror.keysPad': '2:7' })
    const h = await liveHarness({ storage })
    expect(h.c.state.value.keysPad).toMatchObject({ group: 2, offset: 7 })
  })
})

describe('Live offline', () => {
  it('keeps the last read and shows it, marked with its time, once the device goes', async () => {
    const h = await liveOn({ now: () => Date.UTC(2026, 9, 5, 12, 2) })
    const saved = snapshotFromJson(h.storage.getItem(LIVE_KEY)!)
    expect(saved).not.toBeNull()
    expect(saved!.activeProject).toBe(1)
    expect(saved!.names.get(1)).toBe('kick')
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.mirror?.offline != null)
    const m = h.c.state.value.mirror!
    expect(m.offline).toBe(MirrorText.lastSeen(h.c.fmtDateTime(Date.UTC(2026, 9, 5, 12, 2))))
    expect(m.error).toBeNull()
    expect(h.c.mirrorName(A1)).toBe('kick')
  })

  it('opens Live offline after a restart, and plays the copies without the device', async () => {
    const first = await liveOn()
    await copied(first)
    const { storage, padSounds } = first
    disposeAll()
    const h = await liveHarness({ storage, padSounds, unplugged: true })
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.offline != null)
    expect(h.c.mirrorName(A5)).toBe('clap')
    // The copies are loaded into Live's output as it opens.
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('5:clap')).toBe(true))
    expect(h.liveAudio.opened).toBe(1)
    await h.c.playPad(A5)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:4', key: '5:clap' })
  })

  it('without a read kept, Live says to connect', async () => {
    const h = await liveHarness({ unplugged: true })
    h.c.setLive(true)
    await until(h, (s) => s.mirror !== null)
    expect(h.c.state.value.mirror).toMatchObject({ loading: false, error: MirrorText.NOT_CONNECTED })
  })

  it('copies the last read to the library folder as live.json', async () => {
    const library = await freshLibrary()
    const folder = new MemoryTarget('arc')
    library.setTarget(folder)
    await liveOn({ library })
    await vi.waitFor(() => expect(folder.text('live.json')).not.toBeNull())
    expect(snapshotFromJson(folder.text('live.json')!)?.names.get(5)).toBe('clap')
  })
})

describe('Live lifecycle', () => {
  it('opens its output while in front, closes it when left or hidden, and stops its sounds on leaving', async () => {
    const h = await liveHarness()
    h.c.setLive(true)
    expect(h.liveAudio.opened).toBe(1)
    h.setVisible(false)
    expect(h.liveAudio.closed).toBe(1)
    h.setVisible(true)
    expect(h.liveAudio.opened).toBe(2)
    h.c.tabChanged('live', 'backups')
    expect(h.liveAudio.closed).toBe(2)
    expect(h.liveAudio.log).toContain('stopAll')
    expect(h.c.state.value.mirror).toBeNull()
  })

  it('Live is the home section', () => {
    expect(HOME_TAB).toBe('live')
  })
})

describe('the guide flag and restoring from the folder', () => {
  it('carries the old coach_seen over into guideSeen; markSeen sets guideSeen', async () => {
    const old = await liveHarness({ storage: memoryStorage({ 'arc.coachSeen': 'true' }) })
    expect(old.c.settings.value.guideSeen).toBe(true)
    expect(old.c.coach.seen).toBe(true)
    expect(JSON.parse(old.storage.getItem(SETTINGS_KEY)!)).toEqual({ guideSeen: true })

    const h = await liveHarness()
    expect(h.c.coach.seen).toBe(false)
    h.c.coach.markSeen()
    expect(h.c.settings.value.guideSeen).toBe(true)
    expect(h.c.coach.seen).toBe(true)
  })

  it('restores settings, combined learned pads, the pad order only if none was chosen, a newer live.json, and rewrites library.json', async () => {
    const storage = memoryStorage({ 'arc.mirror.learned': '0:5,3:4' })
    const h = await liveHarness({ storage })
    // Chosen before restoring: kept, and only it is written.
    h.c.setLiveKeys(true)
    const live = '{"v":1,"savedAt":5000,"project":2,"groups":{"a":{"1":7}},"names":{"7":"perc"}}'
    const folder = new MemoryTarget('arc', {
      'library.json': indexToJson({
        entries: [],
        settings: { 'app.theme': 'DARK', 'app.guideSeen': 'true', 'mirror.learned': '0:1,1:5,2:9', 'mirror.order': 'FROM_BOTTOM' },
      }),
      'live.json': live,
      'x.pak': await writeZip([{ path: 'meta.json', data: new TextEncoder().encode('{}'), compress: false }], { date: 0, offsetMin: 0 }),
    })
    await h.c.restoreFromFolder(folder)
    expect(h.c.settings.value).toMatchObject({ theme: 'DARK', guideSeen: true, liveKeys: true })
    expect(h.deps.mirrorPrefs.learnedRaw()).toBe('2:9,0:5,3:4')
    expect(h.deps.mirrorPrefs.savedPadOrder()).toBe('FROM_BOTTOM')
    expect(JSON.parse(storage.getItem(LIVE_KEY)!)).toMatchObject({ savedAt: 5000, project: 2 })
    const ix = JSON.parse(folder.text('library.json')!) as { settings: Record<string, string> }
    expect(ix.settings).toMatchObject({ 'app.theme': 'DARK', 'app.guideSeen': 'true', 'app.liveKeys': 'true', 'mirror.learned': '2:9,0:5,3:4' })
    // Defaults never chosen are not written.
    expect(ix.settings['app.autoConnect']).toBeUndefined()

    // An older live.json does not replace a newer read.
    const older = new MemoryTarget('arc', { 'live.json': live.replace('5000', '10'), 'y.pak': folder.files.get('x.pak')!.data })
    await h.c.restoreFromFolder(older)
    expect(JSON.parse(storage.getItem(LIVE_KEY)!)).toMatchObject({ savedAt: 5000 })
  })
})
