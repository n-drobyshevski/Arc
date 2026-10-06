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
import { NullPlayer } from '../../src/platform/audio/player'
import { MemoryTarget } from '../../src/platform/storage/external'
import { LIVE_KEY, memoryStorage, SETTINGS_KEY } from '../../src/platform/storage/settings'
import { LIVE_AUDIO_KEEP_MS } from '../../src/state/controller'
import { latencyRows, PRESS_STAMP_MAX_MS, pressTime } from '../../src/state/live'
import { WebLatencyHint } from '../../src/core/text/latencyText'
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

  it("a device sound Live holds plays from memory: the device isn't asked", async () => {
    const h = await liveOn()
    await copied(h)
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('1:kick')).toBe(true))
    const player = h.deps.player as NullPlayer
    const traffic = h.mock.log.length
    await h.c.playDeviceSound(1)
    expect(player.plays.at(-1)).toMatchObject({ key: 'device:1', channels: 1 })
    expect(h.mock.log.length).toBe(traffic)
  })

  it("without Live, it plays arc's copy, decoded once: the device isn't asked", async () => {
    const h = await liveOn()
    await copied(h)
    // Live's samples are let go with the mirror; the copies stay.
    h.c.closeMirror()
    const player = h.deps.player as NullPlayer
    const traffic = h.mock.log.length
    await h.c.playDeviceSound(5)
    await h.c.playDeviceSound(5)
    expect(player.plays.map((p) => p.key)).toEqual(['device:5', 'device:5'])
    expect(player.plays[1]?.pcm).toBe(player.plays[0]?.pcm)
    expect(h.mock.log.length).toBe(traffic)
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

  it('starts the sound before noting the KEYS pad', async () => {
    const h = await liveOn()
    await copied(h)
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('5:clap')).toBe(true))
    const order: string[] = []
    const press = h.liveAudio.press.bind(h.liveAudio)
    h.liveAudio.press = (id, key, options) => {
      order.push('press')
      return press(id, key, options)
    }
    const setKeysPad = h.deps.mirrorPrefs.setKeysPad.bind(h.deps.mirrorPrefs)
    h.deps.mirrorPrefs.setKeysPad = (pad) => {
      order.push('keys pad')
      setKeysPad(pad)
    }
    await h.c.playPad(A5)
    expect(order).toEqual(['press', 'keys pad'])
    expect(h.c.state.value.keysPad).toMatchObject({ group: 0, offset: 4 })
  })

  it('a press that became a scroll is cut, not released', async () => {
    const h = await liveOn()
    await copied(h)
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('1:kick')).toBe(true))
    await h.c.playPad(A1)
    h.c.cutPad(A1)
    expect(h.liveAudio.cuts).toEqual(['live:0:0'])
    expect(h.liveAudio.releases).toEqual([])
    expect(h.c.playingPads.value.size).toBe(0)
    // The next press of that pad plays as usual.
    await h.c.playPad(A1)
    expect(h.liveAudio.presses.map((p) => p.id)).toEqual(['live:0:0', 'live:0:0'])
  })

  it('a pad cut while its sound was loading never starts', async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.clearPadSounds()
    await backupWith(h, 'b', 1, 'kick')
    const playing = h.c.playPad(A1)
    h.c.cutPad(A1)
    await playing
    expect(h.liveAudio.presses).toEqual([])
  })

  it('an unsure press (the scrolling page) sounds from memory at once, but becomes the KEYS sound only once kept', async () => {
    const h = await liveOn()
    await copied(h)
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('5:clap')).toBe(true))
    const before = h.c.state.value.keysPad
    await h.c.playPad(A5, true, true)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:4', key: '5:clap' })
    expect(h.c.state.value.keysPad).toBe(before)
    await h.c.keepPad(A5)
    expect(h.c.state.value.keysPad).toMatchObject({ group: 0, offset: 4 })
    expect(h.storage.getItem('arc.mirror.keysPad')).toBe('0:4')
    // Kept once: a second keep does nothing.
    await h.c.keepPad(A5)
    expect(h.liveAudio.presses).toHaveLength(1)
  })

  it('an unsure press cut by a scroll leaves the KEYS sound alone', async () => {
    const h = await liveOn()
    await copied(h)
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('5:clap')).toBe(true))
    await h.c.playPad(A1)
    await h.c.playPad(A5, true, true)
    h.c.cutPad(A5)
    await h.c.keepPad(A5)
    expect(h.liveAudio.cuts).toEqual(['live:0:4'])
    expect(h.c.state.value.keysPad).toMatchObject({ group: 0, offset: 0 })
  })

  it('an unsure press not in memory loads nothing, and says nothing, until kept', async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.clearPadSounds()
    await backupWith(h, 'b', 1, 'kick')
    const toasts = h.toasts.length
    // Cut: never loads, never sounds, no toast; an empty pad doesn't say "no sample" either.
    await h.c.playPad(A1, true, true)
    await h.c.playPad(D12, true, true)
    h.c.cutPad(A1)
    h.c.cutPad(D12)
    await h.c.keepPad(A1)
    expect(h.liveAudio.presses).toEqual([])
    expect(h.toasts.length).toBe(toasts)
    // Kept (the window closed): it loads and plays now.
    await h.c.playPad(A1, true, true)
    expect(h.liveAudio.presses).toEqual([])
    await h.c.keepPad(A1)
    expect(h.liveAudio.presses.map((p) => p.id)).toEqual(['live:0:0'])
    await h.c.playPad(D12, true, true)
    await h.c.keepPad(D12)
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.NO_SAMPLE)
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
    expect(h.c.liveLate.value).toBeNull()
    h.liveAudio.slow(200.4)
    h.liveAudio.slow(220)
    expect(h.toasts.filter((t) => t.text === WebText.LIVE_SLOW_OUTPUT)).toHaveLength(1)
    // An output without its own late signal: the display line's delay is the slow one reported.
    expect(h.c.liveLate.value).toBe(220)
  })

  it("follows the output's own late signal where it has one (the real LiveAudio), not the slow reports", async () => {
    const h = await liveOn({ late: true })
    const late = h.liveAudio.late!
    expect(h.c.liveLate.value).toBeNull()
    late.value = 140
    expect(h.c.liveLate.value).toBe(140)
    h.liveAudio.slow(220)
    expect(h.c.liveLate.value).toBe(140)
    late.value = null
    expect(h.c.liveLate.value).toBeNull()
  })
})

describe('Live: KEYS', () => {
  it('asks for a pad first, then plays its sample at each key\'s note', async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.playKey(0)
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.PICK_SOUND)
    h.c.selectKeysPad(A1)
    await h.c.playKey(0)
    await h.c.playKey(4)
    expect(h.liveAudio.presses.map((p) => [p.id, p.key, p.options.pitch])).toEqual([
      ['keys:0', '1:kick', 0],
      ['keys:4', '1:kick', 4],
    ])
    expect(h.c.playingKeys.value).toEqual(new Set([0, 4]))
    h.c.releaseKey(4)
    expect(h.liveAudio.releases).toEqual(['keys:4'])
    h.c.setKeysOctave(5)
    h.c.setKeysScale('MAJOR')
    h.c.setKeysRoot(2)
    await h.c.playKey(2)
    // D major from D5: D E F# → +2 semitones from C4, +12, +4.
    expect(h.liveAudio.presses.at(-1)?.options.pitch).toBe(12 + 2 + 4)
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

  it('keeps the piano size, a size it does not offer read as Auto (stored as 0)', async () => {
    const h = await liveHarness()
    h.c.setPianoWhites(15)
    expect(h.c.settings.value.pianoWhites).toBe(15)
    expect(JSON.parse(h.storage.getItem(SETTINGS_KEY)!)).toEqual({ pianoWhites: 15 })
    h.c.setPianoWhites(9)
    expect(h.c.settings.value.pianoWhites).toBeNull()
    expect(JSON.parse(h.storage.getItem(SETTINGS_KEY)!)).toEqual({ pianoWhites: 0 })
  })

  it('the KEYS pad comes back after a restart', async () => {
    const storage = memoryStorage({ 'arc.mirror.keysPad': '2:7' })
    const h = await liveHarness({ storage })
    expect(h.c.state.value.keysPad).toMatchObject({ group: 2, offset: 7 })
  })
})

describe('Live: the piano', () => {
  it('plays MIDI notes on the KEYS sound, as note voices, and lets each go', async () => {
    const h = await liveOn()
    await copied(h)
    h.c.selectKeysPad(A1)
    await h.c.playNote(60)
    await h.c.playNote(67)
    expect(h.liveAudio.presses.map((p) => [p.id, p.key, p.options.pitch])).toEqual([
      ['note:60', '1:kick', 0],
      ['note:67', '1:kick', 7],
    ])
    expect(h.c.playingNotes.value).toEqual(new Set([60, 67]))
    // The grid's keys are not the piano's notes.
    expect(h.c.playingKeys.value).toEqual(new Set())
    h.c.releaseNote(67)
    expect(h.liveAudio.releases).toEqual(['note:67'])
  })

  it('remembers the keys view once for a wide window and once for a tall one', async () => {
    const h = await liveHarness()
    h.c.setKeysView(true, 'PIANO')
    h.c.setKeysView(false, 'PADS')
    expect(h.c.settings.value.keysViewWide).toBe('PIANO')
    expect(h.c.settings.value.keysViewTall).toBe('PADS')
    expect(JSON.parse(h.storage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ keysViewWide: 'PIANO', keysViewTall: 'PADS' })
  })
})

describe('Live: EDIT, another sound on a pad', () => {
  /** The slot on project 1's pad [n] of group A, read back from the device. */
  async function onDevice(h: LiveHarness, n: number): Promise<number | null | undefined> {
    await h.c.loadProjectSounds(1)
    return h.c.state.value.browser.projectPads.get(1)?.find((g) => g.name === 'a')?.pads.get(n)
  }

  it('puts the sound on the pad at once, names it, and UNDO puts the old one back', async () => {
    const h = await liveOn()
    expect(h.c.mirrorName(A5)).toBe('clap')
    expect(await h.c.assignPad(A5, 2)).toBe(true)
    expect(h.c.mirrorName(A5)).toBe('snare')
    const t = h.c.state.value.toast
    expect(t?.text).toBe(MirrorText.assigned(A5, 'snare'))
    expect(t?.action).toBe(MirrorText.UNDO)
    expect(await onDevice(h, 5)).toBe(2)
    h.c.runToastAction(t!.id)
    await until(h, (s) => s.toast?.text === MirrorText.restored(A5, 'clap'))
    expect(h.c.mirrorName(A5)).toBe('clap')
    expect(await onDevice(h, 5)).toBe(5)
    // The UNDO is gone with its toast.
    expect(h.c.state.value.toast?.action).toBeUndefined()
  })

  it('offers no UNDO for a pad that had no sound', async () => {
    const h = await liveOn()
    expect(h.c.editTarget(D12, true)?.slot).toBeNull()
    expect(await h.c.assignPad(D12, 3)).toBe(true)
    expect(h.c.state.value.toast?.action).toBeUndefined()
    expect(h.c.mirrorName(D12)).toBe(h.c.liveSounds().find((snd) => snd.slot === 3)?.name)
  })

  it('says why a pad can\'t be changed: not connected', async () => {
    const h = await liveHarness({ storage: memoryStorage(ORDER) })
    expect(h.c.editTarget(A5)).toBeNull()
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.EDIT_OFFLINE)
    expect(await h.c.assignPad(A5, 2)).toBe(false)
  })

  it('uploads a new sample to a free slot through the upload sheet, then puts it on the pad', async () => {
    const h = await liveOn()
    const wav = encodeWav(tone(400, 220), 1, 46875)
    await h.c.uploadForPad(A5, [new Blob([new Uint8Array(wav)]) as Blob & { name: string }])
    const draft = h.c.state.value.browser.draft
    expect(draft?.length).toBe(1)
    expect(h.c.state.value.browser.draftPad).toEqual(A5)
    const slot = draft![0]!.slot!
    expect(h.c.liveSounds().some((snd) => snd.slot === slot)).toBe(false)
    await h.c.uploadDraft()
    const prefix = MirrorText.assigned(A5, '')
    await until(h, (s) => s.toast?.text?.startsWith(prefix) === true && !s.busy)
    expect(h.c.state.value.toast?.action).toBe(MirrorText.UNDO)
    expect(await onDevice(h, 5)).toBe(slot)
    // Live learned the new sound: the pad is named after it.
    expect(h.c.mirrorName(A5)).toBe(draft![0]!.name)
    expect(h.c.state.value.browser.draftPad ?? null).toBeNull()
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
  it('opens its output while in front; left or hidden it is suspended, stops its sounds, and is let go after a while away', async () => {
    const h = await liveHarness()
    // The controller's timers, run by hand.
    const timers: { fn: () => void; ms: number; cleared: boolean }[] = []
    h.deps.setTimeout = (fn, ms) => {
      const t = { fn, ms, cleared: false }
      timers.push(t)
      return t
    }
    h.deps.clearTimeout = (t) => {
      if (t) (t as { cleared: boolean }).cleared = true
    }
    const keep = () => timers.filter((t) => t.ms === LIVE_AUDIO_KEEP_MS)
    h.c.setLive(true)
    expect(h.liveAudio.opened).toBe(1)
    h.setVisible(false)
    expect(h.liveAudio.suspended).toBe(1)
    expect(h.liveAudio.closed).toBe(0)
    expect(keep()).toHaveLength(1)
    // Back within the minute: woken, the close called off.
    h.setVisible(true)
    expect(h.liveAudio.opened).toBe(2)
    expect(keep()[0]?.cleared).toBe(true)
    h.c.tabChanged('live', 'backups')
    expect(h.liveAudio.suspended).toBe(2)
    expect(h.liveAudio.closed).toBe(0)
    expect(h.liveAudio.log).toContain('stopAll')
    expect(h.c.state.value.mirror).toBeNull()
    // A minute away: let go.
    const t = keep().at(-1)!
    expect(t.cleared).toBe(false)
    t.fn()
    expect(h.liveAudio.closed).toBe(1)
  })

  it('lets the output go at once when the page goes, and opens it again on coming back', async () => {
    const h = await liveHarness()
    h.c.setLive(true)
    h.setVisible(false)
    h.pageHide()
    expect(h.liveAudio.closed).toBe(1)
    h.setVisible(true)
    expect(h.liveAudio.opened).toBe(2)
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

describe('Live: press times from the input event', () => {
  it("pressTime takes the event's timeStamp where it is on the same clock, else now", () => {
    expect(pressTime(4990, 5000)).toBe(4990)
    expect(pressTime(5000, 5000)).toBe(5000)
    expect(pressTime(5000 - PRESS_STAMP_MAX_MS, 5000)).toBe(5000 - PRESS_STAMP_MAX_MS)
    expect(pressTime(undefined, 5000)).toBe(5000)
    // After now, too long before it, an epoch timeStamp, or not a time at all.
    expect(pressTime(5001, 5000)).toBe(5000)
    expect(pressTime(4999 - PRESS_STAMP_MAX_MS, 5000)).toBe(5000)
    expect(pressTime(1.7e12, 5000)).toBe(5000)
    expect(pressTime(0, 5000)).toBe(5000)
    expect(pressTime(Number.NaN, 5000)).toBe(5000)
  })

  it("pads, KEYS keys and piano notes pass the press's timeStamp to the output", async () => {
    const h = await liveOn()
    await copied(h)
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('1:kick')).toBe(true))
    const at = performance.now() - 7
    await h.c.playPad(A1, true, false, at)
    expect(h.liveAudio.presses.at(-1)?.options.pressedAt).toBe(at)
    // A1 is now the KEYS sound.
    await h.c.playKey(3, true, at - 1)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'keys:3', options: { pressedAt: at - 1 } })
    await h.c.playNote(64, true, at - 2)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'note:64', options: { pressedAt: at - 2 } })
    // An unsure press keeps its time for when it is kept.
    h.c.releasePad(A1)
    await h.c.playPad(A5, true, true, at - 3)
    expect(h.liveAudio.presses.at(-1)?.options.pressedAt).toBe(at - 3)
  })

  it('a press without a usable timeStamp is timed at the handler', async () => {
    const h = await liveOn()
    await copied(h)
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('1:kick')).toBe(true))
    const before = performance.now()
    await h.c.playPad(A1, true, false, before - PRESS_STAMP_MAX_MS - 500)
    const t = h.liveAudio.presses.at(-1)?.options.pressedAt ?? 0
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(performance.now())
  })
})

describe('Live: the latency test', () => {
  const zero = { label: 'latencyHint 0, 48000 Hz', baseMs: 5.3, outputMs: 21 }
  const interactive = { label: "latencyHint 'interactive', 48000 Hz", baseMs: 10.7, outputMs: null }

  it("feeds each heard voice's delay to its engine's row, keeping the engine's reported delay", async () => {
    const h = await liveOn()
    expect(h.c.liveLatency.value.stats.isEmpty).toBe(true)
    h.liveAudio.started('live:0:0', 30, undefined, zero)
    h.liveAudio.started('live:0:0', 24, undefined, { ...zero, outputMs: 22 })
    h.liveAudio.started('live:0:0', 48, undefined, interactive)
    // The debug log line stays.
    expect(h.c.logText()).toContain(MirrorText.latencyNote('live:0:0', 48, 'default output'))
    const { stats, engines } = h.c.liveLatency.value
    expect(stats.engines).toEqual([zero.label, interactive.label])
    expect(stats.summary(zero.label)).toMatchObject({ count: 2, median: 27, best: 24, worst: 30 })
    // The latest delay the output reported, for the estimate.
    expect(engines.get(zero.label)).toEqual({ ...zero, outputMs: 22 })
    expect(engines.get(interactive.label)).toEqual(interactive)
    // An output that names no row, or a time the clocks got wrong, adds nothing.
    h.liveAudio.started('live:0:0', 12)
    h.liveAudio.started('live:0:0', -3, undefined, { ...zero, label: 'other' })
    expect(h.c.liveLatency.value.stats.engines).toEqual([zero.label, interactive.label])
    expect(h.c.liveLatency.value.engines.has('other')).toBe(false)
  })

  it('each output set up gets its row before its first press, keeping its place', async () => {
    const h = await liveOn()
    h.liveAudio.engine.value = zero
    h.liveAudio.engine.value = interactive
    h.liveAudio.engine.value = null
    h.liveAudio.engine.value = { ...zero, outputMs: 25 }
    const l = h.c.liveLatency.value
    expect(latencyRows(l)).toEqual([zero.label, interactive.label])
    expect(l.engines.get(zero.label)).toEqual({ ...zero, outputMs: 25 })
    expect(l.stats.isEmpty).toBe(true)
  })

  it('presses that had to load their sample are logged but not timed', async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.clearPadSounds()
    await backupWith(h, 'b', 1, 'kick')
    // Loaded from the backup: the load's time is not the output's.
    await h.c.playPad(A1)
    expect(h.liveAudio.presses.at(-1)?.id).toBe('live:0:0')
    h.liveAudio.started('live:0:0', 180, undefined, zero)
    expect(h.c.logText()).toContain(MirrorText.latencyNote('live:0:0', 180, 'default output'))
    expect(h.c.liveLatency.value.stats.isEmpty).toBe(true)
    // In memory now: timed.
    h.c.releasePad(A1)
    await h.c.playPad(A1)
    h.liveAudio.started('live:0:0', 20, undefined, zero)
    expect(h.c.liveLatency.value.stats.summary(zero.label)).toMatchObject({ count: 1, median: 20 })
    // The KEYS keys and the piano alike (A1 is the KEYS sound, in memory).
    await h.c.playKey(2)
    h.liveAudio.started('keys:2', 22, undefined, zero)
    await h.c.playNote(62)
    h.liveAudio.started('note:62', 24, undefined, zero)
    expect(h.c.liveLatency.value.stats.summary(zero.label)).toMatchObject({ count: 3 })
  })

  it('Reset clears every row\'s times; the engines tried keep their rows', async () => {
    const h = await liveOn()
    h.liveAudio.started('live:0:0', 30, undefined, zero)
    h.c.resetLatency()
    expect(h.c.liveLatency.value.stats.isEmpty).toBe(true)
    expect(latencyRows(h.c.liveLatency.value)).toEqual([zero.label])
  })

  it("the latencyHint choice and the engine in use come from Live's output", async () => {
    const h = await liveOn()
    expect(h.c.liveLatencyHint?.value).toBe(WebLatencyHint.ZERO)
    h.c.setLiveLatencyHint(WebLatencyHint.INTERACTIVE)
    expect(h.liveAudio.hints).toEqual([WebLatencyHint.INTERACTIVE])
    expect(h.c.liveLatencyHint?.value).toBe(WebLatencyHint.INTERACTIVE)
    expect(h.c.liveEngine.value).toBeNull()
    h.liveAudio.engine.value = zero
    expect(h.c.liveEngine.value).toEqual(zero)
    expect(latencyRows(h.c.liveLatency.value)).toEqual([zero.label])
  })
})
