// Live's sounds and last read in the controller (main's ArcController delta: copying the pad sounds
// in the background, playing pads and keys from a copy / backup / the device, the offline mirror,
// KEYS settings, clearing the copies, the guide flag, restoring live.json and learned links).
import type { Signal } from '@preact/signals'
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { physicalPad, padKey } from '../../src/core/features/padNotes'
import { fromJson as snapshotFromJson } from '../../src/core/features/liveSnapshot'
import { toJson as indexToJson } from '../../src/core/backup/libraryIndex'
import { encodeWav } from '../../src/core/formats/wav'
import { writeZip } from '../../src/core/formats/zip'
import { FeatureText } from '../../src/core/text/featureText'
import { BackupDevice, toPrune, type BackupRecord } from '../../src/core/text/libraryRules'
import { MirrorText } from '../../src/core/text/mirrorText'
import { Strings } from '../../src/core/text/strings'
import { WebText } from '../../src/core/text/webText'
import { NullPlayer } from '../../src/platform/audio/player'
import { MemoryTarget } from '../../src/platform/storage/external'
import { LIVE_KEY, memoryStorage, SETTINGS_KEY } from '../../src/platform/storage/settings'
import { LIVE_AUDIO_KEEP_MS } from '../../src/state/controller'
import { LATE_LOAD_MS, latencyRows, packKey, padAudioOf, PRESS_STAMP_MAX_MS, pressTime } from '../../src/state/live'
import { WebLatencyHint } from '../../src/core/text/latencyText'
import { createStore } from '../../src/state/store'
import { Tasks } from '../../src/state/tasks'
import { HOME_TAB, initialState } from '../../src/state/types'
import type { Session } from '../../src/core/protocol/session'
import { tone } from '../helpers/demoData'
import { pad, tarFile } from '../helpers/bytes'
import { FactoryKit, FactorySounds } from '../../src/core/features/factorySounds'
import type { FactoryDeps } from '../../src/state/deps'
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
  await backupOf(h, id, { [slot]: name }, createdAt)
}

/** A backup holding each of [sounds] (names by slot), as real WAVs. */
async function backupOf(h: LiveHarness, id: string, sounds: Record<number, string>, createdAt = 1000): Promise<void> {
  const wav = encodeWav(tone(2000, 220), 1, 46875)
  const bytes = await writeZip(
    [
      { path: 'meta.json', data: new TextEncoder().encode(JSON.stringify({ generated_at: '2026-01-02T03:04:05.000Z' })), compress: false },
      ...Object.entries(sounds).map(([slot, name]) => ({ path: `sounds/${slot} ${name}.wav`, data: wav, compress: false })),
    ],
    { date: 0, offsetMin: 0 },
  )
  const before = h.c.state.value.backups.length
  await h.library.save(record(id, createdAt), bytes, sounds)
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

  it("Live's own read of the sounds is one sorted list, the same array until the next read (the Sounds tab keeps its rows)", async () => {
    const h = await liveOn()
    expect(h.c.state.value.browser.contents).toBeNull()
    const list = h.c.liveSounds()
    expect(list.length).toBeGreaterThan(0)
    expect(list.map((snd) => snd.slot)).toEqual([...list.map((snd) => snd.slot)].sort((a, b) => a - b))
    expect(h.c.liveSounds()).toBe(list)
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
  it("the arp's sounding pads and KEYS notes, apart from the rest (Kotlin's arpLit: lit full)", async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.playPad(A1)
    await h.c.releasePad(A1)
    expect(h.c.state.value.keysPad).toMatchObject({ group: 0, offset: 0 })
    // A pad hit by note repeat, a note of the KEYS sound up 3 semitones, and a pad of its own.
    // The fake's voices are a plain signal (the worklet's report).
    const voices = h.liveAudio.voices as Signal<ReadonlySet<string>>
    voices.value = new Set(['arp:0:4:n', 'arp:0:0:3', 'live:0:1'])
    expect([...h.c.arpPads.value].sort()).toEqual([padKey(A1), padKey(A5)].sort())
    expect([...h.c.arpNotes.value]).toEqual([60 + 3])
    // The rings still count every voice.
    expect(h.c.playingPads.value.has(padKey(physicalPad(0, 1)))).toBe(true)
    voices.value = new Set()
    expect(h.c.arpPads.value.size).toBe(0)
    expect(h.c.arpNotes.value.size).toBe(0)
  })

  it("the KEYS notes keep their set while only pads' voices change, so the piano doesn't render again", async () => {
    const h = await liveOn()
    await copied(h)
    const voices = h.liveAudio.voices as Signal<ReadonlySet<string>>
    voices.value = new Set(['note:60', 'live:0:1'])
    const notes = h.c.playingNotes.value
    voices.value = new Set(['note:60', 'live:0:1', 'live:0:2'])
    expect(h.c.playingNotes.value).toBe(notes)
    voices.value = new Set(['note:60'])
    expect(h.c.playingNotes.value).toBe(notes)
    voices.value = new Set(['note:60', 'note:64'])
    expect(h.c.playingNotes.value).not.toBe(notes)
    expect([...h.c.playingNotes.value]).toEqual([60, 64])
  })

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

describe('Live: a backup opened once for the pads', () => {
  /** Offline, the copies cleared, a backup with the kick (a/p01) and the clap (a/p05). */
  async function fromBackup(): Promise<LiveHarness> {
    const h = await liveOn()
    await copied(h)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.mirror?.offline != null)
    await h.c.clearPadSounds()
    await backupOf(h, 'b', { 1: 'kick', 5: 'clap' })
    return h
  }

  it('presses that overlap read the backup once', async () => {
    const h = await fromBackup()
    const bytes = vi.spyOn(h.library, 'bytes')
    await Promise.all([h.c.playPad(A1), h.c.playPad(A5)])
    expect(bytes).toHaveBeenCalledTimes(1)
    expect(h.liveAudio.presses.map((p) => p.key).sort()).toEqual(['1:kick', '5:clap'])
  })

  it('a backup that failed to open is opened again by the next press', async () => {
    const h = await fromBackup()
    const bytes = vi.spyOn(h.library, 'bytes').mockRejectedValueOnce(new Error('read failed'))
    await h.c.playPad(A1)
    expect(h.liveAudio.presses).toHaveLength(0)
    expect(h.toasts.at(-1)).toMatchObject({ error: true })
    await h.c.playPad(A1)
    expect(bytes).toHaveBeenCalledTimes(2)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ key: '1:kick' })
  })

  it('a press while the preload loads its sound waits for that load', async () => {
    const h = await fromBackup()
    let open!: () => void
    const gate = new Promise<void>((r) => (open = r))
    const read = h.library.bytes.bind(h.library)
    const bytes = vi.spyOn(h.library, 'bytes').mockImplementation(async (id) => {
      await gate
      return read(id)
    })
    const preload = vi.spyOn(h.liveAudio, 'preload')
    await h.c.clearPadSounds()
    await vi.waitFor(() => expect(bytes).toHaveBeenCalled())
    const playing = h.c.playPad(A1)
    open()
    await playing
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ key: '1:kick' })
    expect(bytes).toHaveBeenCalledTimes(1)
    expect(preload.mock.calls.filter(([key]) => key === '1:kick')).toHaveLength(1)
  })

  it('a preload that runs past its slice still loads every pad, a task later', async () => {
    const h = await fromBackup()
    // Each read of the clock 10 ms on: every pad waits for a later task first.
    let t = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => (t += 10))
    try {
      const preload = vi.spyOn(h.liveAudio, 'preload')
      await h.c.clearPadSounds()
      await vi.waitFor(() => expect(preload.mock.calls.map(([key]) => key).sort()).toEqual(['1:kick', '5:clap']))
    } finally {
      now.mockRestore()
    }
  })
})

describe('padAudioOf', () => {
  it('reads s16le from an odd offset, drops a partial sample and keeps its own copy', () => {
    const backing = new Uint8Array([0xff, 0x00, 0x40, 0x00, 0x80, 0x7f])
    const pcm = backing.subarray(1) // 0x4000, 0x8000 and a stray byte
    const a = padAudioOf(pcm, 3, 46875)
    expect(Array.from(a.pcm)).toEqual([16384, -32768])
    expect(a.channels).toBe(2)
    backing.fill(0)
    expect(Array.from(a.pcm)).toEqual([16384, -32768])
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

  it('a first slide over a sound still loading: one load, and after a slow one only the latest lifted press sounds', async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.clearPadSounds()
    await backupWith(h, 'b', 1, 'kick')
    h.c.selectKeysPad(A1)
    let t = 10_000
    const deps = h.deps as { perfNow: () => number }
    deps.perfNow = () => t
    // Three keys slid over, each let go of before the sound is in memory; the load takes long.
    const slide: Promise<void>[] = []
    for (const n of [60, 62, 64]) {
      slide.push(h.c.playNote(n))
      h.c.releaseNote(n)
      t += 10
    }
    t += LATE_LOAD_MS + 50
    await Promise.all(slide)
    expect(h.liveAudio.presses.map((p) => p.id)).toEqual(['note:64'])
    // Let go of already: it sounds briefly.
    expect(h.liveAudio.releases.at(-1)).toBe('note:64')
  })

  it('after a quick load every lifted press of a slide still sounds, briefly', async () => {
    const h = await liveOn()
    await copied(h)
    await h.c.clearPadSounds()
    await backupWith(h, 'b', 1, 'kick')
    h.c.selectKeysPad(A1)
    const t = 10_000
    const deps = h.deps as { perfNow: () => number }
    deps.perfNow = () => t
    const slide: Promise<void>[] = []
    for (const n of [60, 62]) {
      slide.push(h.c.playNote(n))
      h.c.releaseNote(n)
    }
    await Promise.all(slide)
    expect(h.liveAudio.presses.map((p) => p.id).sort()).toEqual(['note:60', 'note:62'])
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
    // Where the line is short, the day alone (MirrorScreen's IdleWords).
    expect(m.offlineShort).toBe(MirrorText.seen(h.c.fmtMonthDay(Date.UTC(2026, 9, 5, 12, 2))))
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
    await h.c.playNote(63, true, at - 1)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'note:63', options: { pressedAt: at - 1 } })
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
    await h.c.playNote(67)
    h.liveAudio.started('note:67', 22, undefined, zero)
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

describe('Factory sounds', () => {
  const PAGE_HTML = '<script type="module" crossorigin src="/apps/ep-sample-tool/assets/index-C1wBjhTa.js"></script>'
  const SCRIPT = 'x="/apps/ep-sample-tool/assets/ep-133-factory-content-T3st.pak"'
  const PAK_PATH = '/apps/ep-sample-tool/assets/ep-133-factory-content-T3st.pak'

  /** A small factory pack: kick (1) on a/p01 and clap (5) on a/p05 of project 1. */
  async function factoryPak(meta: Record<string, string> = { pak_type: 'factory', device_name: 'EP-133' }): Promise<Uint8Array> {
    const wav = encodeWav(tone(2000, 220), 1, 46875)
    return writeZip(
      [
        { path: 'meta.json', data: new TextEncoder().encode(JSON.stringify({ ...meta, generated_at: '2023-11-24T00:00:00.000Z' })), compress: false },
        { path: 'sounds/001 micro kick.wav', data: wav, compress: false },
        { path: 'sounds/005 nt clap.wav', data: wav, compress: false },
        { path: 'projects/P01.tar', data: tarFile([['pads/a/p01', pad(1)], ['pads/a/p05', pad(5)]]), compress: false },
      ],
      { date: 0, offsetMin: 0 },
    )
  }

  /** teenage engineering's site serving [pak]; [asked] lists the paths read. */
  function site(pak: Uint8Array, asked: string[] = []): FactoryDeps {
    return {
      text: async (path) => {
        asked.push(path)
        return path === FactorySounds.PAGE ? PAGE_HTML : SCRIPT
      },
      bytes: async (path, _signal, onProgress) => {
        asked.push(path)
        onProgress(pak.length / 2, pak.length)
        onProgress(pak.length, pak.length)
        return pak
      },
    }
  }

  it('downloads the pack into the library, and Live without a read plays its project 1', async () => {
    const asked: string[] = []
    const h = await liveHarness({ storage: memoryStorage(ORDER), unplugged: true, factory: site(await factoryPak(), asked) })
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.error === MirrorText.NOT_CONNECTED)
    await h.c.getFactorySounds()
    expect(asked).toEqual([FactorySounds.PAGE, '/apps/ep-sample-tool/assets/index-C1wBjhTa.js', PAK_PATH])
    await until(h, (s) => s.backups.length === 1)
    const b = h.c.state.value.backups.find((r) => r.source === FactorySounds.SOURCE)!
    expect(b).toMatchObject({ title: FeatureText.FACTORY_TITLE, fileName: FactorySounds.FILE_NAME, soundCount: 2, projectCount: 1 })
    expect(h.toasts.at(-1)?.text).toBe(FeatureText.factorySaved(2))
    // Live, showing "connect" before, opens on the factory sounds.
    await until(h, (s) => s.mirror?.offline === MirrorText.FACTORY)
    expect(h.c.state.value.mirror!.state.activeProject).toBe(1)
    expect(h.c.mirrorName(A1)).toBe('micro kick')
    expect(h.c.mirrorName(A5)).toBe('nt clap')
    // Kept under the pack's own keys.
    await vi.waitFor(() => expect(h.liveAudio.loaded.has(packKey(b.id, 5, 'nt clap'))).toBe(true))
    await h.c.playPad(A5)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:4', key: packKey(b.id, 5, 'nt clap') })
    // Not downloaded twice.
    await h.c.getFactorySounds()
    expect(asked).toHaveLength(3)
    // Deleted, Live says to connect again.
    await h.c.delete(b)
    await until(h, (s) => s.mirror?.error === MirrorText.NOT_CONNECTED)
  })

  it('with pads counted from the top and none learned, numbers them from the top row', async () => {
    const h = await liveHarness({ unplugged: true, factory: site(await factoryPak()) })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds()
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.offline === MirrorText.FACTORY)
    // p01 is '7' (offset 9), p05 is '5' (offset 7); nothing learned is saved.
    expect(h.c.mirrorName(physicalPad(0, 9))).toBe('micro kick')
    expect(h.c.mirrorName(physicalPad(0, 7))).toBe('nt clap')
    expect(h.c.mirrorName(A1)).toBeNull()
    expect(h.storage.getItem('arc.mirror.learned')).toBeNull()
  })

  it("unplugging the EP-133 doesn't cancel the download, and plugging it back in connects once it ends", async () => {
    const pak = await factoryPak()
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const h = await liveHarness({
      factory: {
        ...site(pak),
        bytes: async (_path, _signal, onProgress) => {
          onProgress(1000, pak.length)
          await gate
          return pak
        },
      },
    })
    await h.c.connect()
    await until(h, (s) => s.device !== null && !s.busy)
    const done = h.c.getFactorySounds()
    await until(h, (s) => s.task?.fraction !== undefined && s.task.fraction > 0)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device === null)
    expect(h.c.state.value.task).not.toBeNull()
    // Back in while the download runs: busy, so it waits.
    h.ep.access.plug(h.ep.input, h.ep.output)
    await sleep(400)
    expect(h.c.isConnected).toBe(false)
    release()
    await done
    expect(h.toasts.map((t) => t.text)).toContain(FeatureText.factorySaved(2))
    expect(h.toasts.map((t) => t.text)).not.toContain(Strings.CANCELLED)
    await until(h, (s) => s.device !== null)
  })

  it('an EP-133 plugged in and out again during the download is not connected afterwards', async () => {
    const pak = await factoryPak()
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const h = await liveHarness({
      factory: {
        ...site(pak),
        bytes: async () => {
          await gate
          return pak
        },
      },
    })
    await h.c.connect()
    await until(h, (s) => s.device !== null && !s.busy)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device === null)
    const before = h.toasts.length
    const done = h.c.getFactorySounds()
    await until(h, (s) => s.task !== null)
    h.ep.access.plug(h.ep.input, h.ep.output)
    await sleep(400)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    release()
    await done
    await sleep(100)
    expect(h.c.isConnected).toBe(false)
    // No "No EP-133 found" from a connect nobody wanted.
    expect(h.toasts.slice(before).filter((t) => t.error)).toEqual([])
  })

  it('a download starts at once while Live copies pad sounds (it never uses the device)', async () => {
    const h = await liveHarness({ storage: memoryStorage(ORDER), factory: site(await factoryPak()) })
    await h.c.connect()
    h.c.setLive(true)
    await until(h, (s) => s.backgroundRead)
    const done = h.c.getFactorySounds()
    expect(h.c.state.value.task?.title).toBe(FeatureText.GETTING_FACTORY)
    await done
  })

  it('tapped while something else runs, it goes next rather than never', async () => {
    const asked: string[] = []
    const h = await liveHarness({ unplugged: true, factory: site(await factoryPak(), asked) })
    await until(h, (s) => s.libraryLoaded)
    h.c.store.update((st) => ({ ...st, busy: true }))
    const done = h.c.getFactorySounds()
    await sleep(30)
    expect(asked).toEqual([])
    h.c.store.update((st) => ({ ...st, busy: false }))
    await done
    expect(asked).toHaveLength(3)
    await until(h, (s) => s.backups.length === 1)
  })

  it('refuses a file that is not an EP-133 factory pack, and keeps nothing', async () => {
    const h = await liveHarness({ unplugged: true, factory: site(await factoryPak({ pak_type: 'user', device_name: 'EP-133' })) })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds()
    expect(h.toasts.at(-1)).toMatchObject({ text: FeatureText.factoryFailed(FeatureText.NOT_FACTORY), error: true })
    expect(h.c.state.value.backups).toEqual([])
    expect(h.c.state.value.task).toBeNull()
  })

  it("falls back to the last known path when the tool's page can't be read", async () => {
    const asked: string[] = []
    const pak = await factoryPak()
    const h = await liveHarness({
      unplugged: true,
      factory: { ...site(pak, asked), text: () => Promise.reject(new Error('HTTP 404')) },
    })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds()
    expect(asked).toEqual([FactorySounds.KNOWN_PAK])
    await until(h, (s) => s.backups.length === 1)
    expect(h.c.state.value.backups.map((r) => r.source)).toEqual([FactorySounds.SOURCE])
  })

  it("plays a last read's unnamed sounds (\"001.pcm\") from the factory pack, and points to it until it's there", async () => {
    // A device still holding the factory sounds lists them by their files.
    const lastRead = JSON.stringify({ v: 1, savedAt: 1, project: 1, groups: { a: { '1': 1, '5': 5 } }, names: { '1': '001.pcm', '5': '005.pcm' } })
    const h = await liveHarness({ storage: memoryStorage({ ...ORDER, [LIVE_KEY]: lastRead }), unplugged: true, factory: site(await factoryPak()) })
    await until(h, (s) => s.libraryLoaded)
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.offline != null)
    expect(h.c.mirrorName(A1)).toBe('001.pcm')
    await h.c.playPad(A1)
    expect(h.toasts.at(-1)?.text).toBe(WebText.LIVE_NO_COPY_FACTORY)
    await h.c.getFactorySounds()
    await until(h, (s) => s.backups.length === 1)
    await sleep(10)
    // Still the last read, now playing from the pack.
    expect(h.c.state.value.mirror!.offline).not.toBe(MirrorText.FACTORY)
    await h.c.playPad(A1)
    // Kept under the pack's key: another kit's pack would be another sound.
    const pack = FactorySounds.inLibrary(h.c.state.value.backups)!
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:0', key: packKey(pack.id, 1, '001.pcm') })
  })

  it('offline with pads counted from the top and none learned, a last read still names and plays its pads', async () => {
    // Pad numbers from the top (the default), nothing learned: p01 is '7', numbered as arc writes pads.
    const lastRead = JSON.stringify({ v: 1, savedAt: 1, project: 1, groups: { a: { '1': 1 } }, names: { '1': '001.pcm' } })
    const h = await liveHarness({ storage: memoryStorage({ [LIVE_KEY]: lastRead }), unplugged: true, factory: site(await factoryPak()) })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds()
    await until(h, (s) => s.backups.length === 1)
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.offline != null)
    const seven = physicalPad(0, 9)
    expect(h.c.mirrorName(seven)).toBe('001.pcm')
    await h.c.playPad(seven)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:9', key: packKey(FactorySounds.inLibrary(h.c.state.value.backups)!.id, 1, '001.pcm') })
    // The guess isn't kept as learned.
    expect(h.storage.getItem('arc.mirror.learned')).toBeNull()
  })

  it('a last read comes before the factory sounds', async () => {
    const first = await liveOn()
    const { storage } = first
    disposeAll()
    const h = await liveHarness({ storage, unplugged: true, factory: site(await factoryPak()) })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds()
    await until(h, (s) => s.backups.length === 1)
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.offline != null)
    expect(h.c.state.value.mirror!.offline).not.toBe(MirrorText.FACTORY)
    expect(h.c.mirrorName(A5)).toBe('clap')
  })
})

describe('Factory sounds: the EP-1320 kit beside the EP-133', () => {
  const PAGE_HTML = '<script type="module" crossorigin src="/apps/ep-sample-tool/assets/index-C1wBjhTa.js"></script>'
  const SCRIPT = 'x="/apps/ep-sample-tool/assets/ep-133-factory-content-T3st.pak"'
  const MEDIEVAL = { device_name: 'EP-1320', device_sku: 'TE032AS005', device_version: '1.0.0' }
  const MEDIEVAL_GREET = 'chip_id:0;mode:normal;os_version:1.0.0;product:EP-1320;serial:MOCK1320;sku:TE032AS005;sw_version:1.0.0'
  const EP133_GREET = 'chip_id:0;mode:normal;os_version:2.0.5;product:EP-133;serial:MOCK0001;sku:TE032AS001;sw_version:2.0.5'

  /**
   * A small pack: [names] in slots 1 and 5 on a/p01 and a/p05 of project 1
   * (and of project 2 when [two]), each a tone [len] samples long, so which
   * pack a sound came from can be told by its length.
   */
  async function pack(meta: Record<string, string>, names: [string, string], len: number, two = false): Promise<Uint8Array> {
    const wav = encodeWav(tone(len, 220), 1, 46875)
    const p = tarFile([['pads/a/p01', pad(1)], ['pads/a/p05', pad(5)]])
    return writeZip(
      [
        { path: 'meta.json', data: new TextEncoder().encode(JSON.stringify({ ...meta, generated_at: '2024-02-03T00:00:00.000Z' })), compress: false },
        { path: `sounds/001 ${names[0]}.wav`, data: wav, compress: false },
        { path: `sounds/005 ${names[1]}.wav`, data: wav, compress: false },
        { path: 'projects/P01.tar', data: p, compress: false },
        ...(two ? [{ path: 'projects/P02.tar', data: tarFile([['pads/b/p01', pad(5)]]), compress: false }] : []),
      ],
      { date: 0, offsetMin: 0 },
    )
  }

  /** The EP-133's pack, as downloaded: micro kick and nt clap, 2000 samples. */
  const ep133Pak = (names: [string, string] = ['micro kick', 'nt clap']): Promise<Uint8Array> =>
    pack({ pak_type: 'factory', device_name: 'EP-133', device_sku: 'TE032AS001' }, names, 2000)
  /** A backup of an EP-1320 (a user pack): med kick and med clap, 3000 samples. */
  const medievalPak = (type = 'user', names: [string, string] = ['med kick', 'med clap'], two = false): Promise<Uint8Array> =>
    pack({ pak_type: type, ...MEDIEVAL }, names, 3000, two)

  function site(pak: Uint8Array): FactoryDeps {
    return {
      text: async (path) => (path === FactorySounds.PAGE ? PAGE_HTML : SCRIPT),
      bytes: async (_path, _signal, onProgress) => {
        onProgress(pak.length, pak.length)
        return pak
      },
    }
  }

  const kitPack = (h: LiveHarness, kit: FactoryKit): BackupRecord | null => FactorySounds.inLibrary(h.c.state.value.backups, kit)

  /** Both kits saved: the EP-133's downloaded, the EP-1320's imported as its factory pack (Live then plays it). */
  async function bothKits(h: LiveHarness, medieval?: Uint8Array): Promise<void> {
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds()
    await until(h, (s) => kitPack(h, FactoryKit.EP133) !== null)
    await h.c.import('medieval.pak', null, async () => medieval ?? (await medievalPak('factory')))
    await until(h, (s) => kitPack(h, FactoryKit.EP1320) !== null)
  }

  it('Use as factory sounds saves a copy as the EP-1320 kit, and the backup stays as it was', async () => {
    const bytes = await medievalPak()
    const h = await liveHarness({ storage: memoryStorage(ORDER), unplugged: true })
    await until(h, (s) => s.libraryLoaded)
    // An EP-1320 user pack imports as an ordinary backup.
    await h.c.import('my medieval.pak', null, async () => bytes)
    await until(h, (s) => s.backups.length === 1)
    const own = h.c.state.value.backups[0]!
    expect(own).toMatchObject({ source: 'import', title: 'my medieval', device: { product: 'EP-1320', sku: 'TE032AS005' } })
    expect(FactorySounds.canUseAsFactory(own)).toBe(true)
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.error === MirrorText.NOT_CONNECTED)

    await h.c.useAsFactory(own)
    await until(h, (s) => s.backups.length === 2)
    const copy = kitPack(h, FactoryKit.EP1320)!
    expect(copy).toMatchObject({
      title: FeatureText.FACTORY_TITLE_1320,
      source: FactoryKit.EP1320.source,
      fileName: FactorySounds.FILE_NAME_1320,
      soundCount: 2,
      device: { product: 'EP-1320', sku: 'TE032AS005', serial: '', osVersion: '1.0.0' },
    })
    expect(copy.id).not.toBe(own.id)
    expect(h.c.state.value.backups.find((b) => b.id === own.id)).toEqual(own)
    expect(await h.library.bytes(copy.id)).toEqual(bytes)
    expect(h.c.state.value.freshId).toBe(copy.id)
    expect(h.toasts.at(-1)?.text).toBe(FeatureText.factory1320Saved(2))
    // Live plays the EP-1320's kit from now on: its project 1, its note naming it.
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP1320.id)
    expect(h.c.factoryKit).toBe(FactoryKit.EP1320)
    await until(h, (s) => s.mirror?.offline === MirrorText.FACTORY)
    expect(h.c.state.value.mirror!.kit).toBe(FactoryKit.EP1320.id)
    expect(h.c.mirrorName(A1)).toBe('med kick')
    expect(h.c.mirrorName(A5)).toBe('med clap')
    // Never pruned, and the copy isn't offered again.
    expect(toPrune(h.c.state.value.backups, 0).map((b) => b.id)).toEqual([own.id])
    expect(FactorySounds.canUseAsFactory(copy)).toBe(false)

    // Again: the newer copy replaces the older.
    await h.c.useAsFactory(own)
    await until(h, (s) => s.backups.some((b) => b.source === FactoryKit.EP1320.source && b.id !== copy.id) && !s.backups.some((b) => b.id === copy.id))
    expect(h.c.state.value.backups.filter((b) => b.source === FactoryKit.EP1320.source)).toHaveLength(1)
    expect(h.c.state.value.backups.some((b) => b.id === own.id)).toBe(true)
  })

  it("refuses a backup that isn't an EP-1320's, and keeps nothing", async () => {
    const h = await liveHarness({ unplugged: true })
    await until(h, (s) => s.libraryLoaded)
    await backupWith(h, 'b1', 1, 'kick')
    const b = h.c.state.value.backups[0]!
    expect(FactorySounds.canUseAsFactory(b)).toBe(false)
    await h.c.useAsFactory(b)
    expect(h.toasts.at(-1)).toMatchObject({ text: FeatureText.NOT_MEDIEVAL, error: true })
    expect(h.c.state.value.backups).toHaveLength(1)
    expect(h.c.state.value.task).toBeNull()
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP133.id)
  })

  it("an imported EP-1320 factory pack is saved as the kit straight away, replacing an older one", async () => {
    const h = await liveHarness({ unplugged: true })
    await until(h, (s) => s.libraryLoaded)
    await h.c.import('medieval.pak', null, async () => medievalPak('factory'))
    await until(h, (s) => kitPack(h, FactoryKit.EP1320) !== null)
    const first = kitPack(h, FactoryKit.EP1320)!
    expect(first).toMatchObject({ title: FeatureText.FACTORY_TITLE_1320, fileName: FactorySounds.FILE_NAME_1320 })
    expect(h.toasts.at(-1)?.text).toBe(FeatureText.factory1320Saved(2))
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP1320.id)
    await h.c.import('medieval 2.pak', null, async () => medievalPak('factory', ['new kick', 'new clap']))
    await until(h, (s) => s.backups.length === 1 && s.backups[0]!.id !== first.id)
    expect(h.c.state.value.backups[0]!.source).toBe(FactoryKit.EP1320.source)
  })

  it("switching the kit opens Live offline again on the other pack's first project and names", async () => {
    const h = await liveHarness({ storage: memoryStorage(ORDER), unplugged: true, factory: site(await ep133Pak()) })
    await bothKits(h, await medievalPak('factory', ['med kick', 'med clap'], true))
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.offline === MirrorText.FACTORY)
    expect(h.c.mirrorName(A1)).toBe('med kick')
    expect(h.c.state.value.mirror!.offlineSounds!.factory!.map((e) => e.name)).toEqual(['med kick', 'med clap'])
    expect(h.c.state.value.mirror!.offlineProjects).toEqual([1, 2])
    // PROJECT on to the Medieval's project 2.
    h.c.selectProject(2)
    await until(h, (s) => s.mirror?.state.activeProject === 2)

    h.c.setFactoryKit(FactoryKit.EP133)
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP133.id)
    await until(h, (s) => s.mirror?.kit === FactoryKit.EP133.id)
    const mi = h.c.state.value.mirror!
    expect(mi.offline).toBe(MirrorText.FACTORY)
    expect(mi.state.activeProject).toBe(FactorySounds.PROJECT)
    expect(mi.offlineProjects).toEqual([1])
    expect(h.c.mirrorName(A1)).toBe('micro kick')
    expect(h.c.mirrorName(A5)).toBe('nt clap')
    expect(mi.offlineSounds!.factory!.map((e) => e.name)).toEqual(['micro kick', 'nt clap'])
    expect(h.c.liveSounds().map((e) => e.name)).toEqual(['micro kick', 'nt clap'])

    // And back: project 1 again, not the 2 stepped to before.
    h.c.setFactoryKit(FactoryKit.EP1320)
    await until(h, (s) => s.mirror?.kit === FactoryKit.EP1320.id)
    expect(h.c.state.value.mirror!.state.activeProject).toBe(1)
    expect(h.c.mirrorName(A1)).toBe('med kick')

    // The EP-1320's copy deleted: Live falls back on the EP-133's kit.
    expect(await h.c.delete(kitPack(h, FactoryKit.EP1320)!)).toBe(true)
    await until(h, (s) => s.mirror?.kit === FactoryKit.EP133.id)
    expect(h.c.factoryKit).toBe(FactoryKit.EP133)
    expect(h.c.mirrorName(A1)).toBe('micro kick')
  })

  it('connecting a TE032AS005 device makes the EP-1320 the kit, once its pack is saved', async () => {
    const h = await liveHarness({ factory: site(await ep133Pak()) })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds()
    await until(h, (s) => kitPack(h, FactoryKit.EP133) !== null)
    h.mock.greet = MEDIEVAL_GREET
    await h.c.connect()
    await until(h, (s) => s.device !== null && !s.busy)
    expect(h.c.state.value.device!.info.sku).toBe('TE032AS005')
    // No EP-1320 pack: the kit stays.
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP133.id)

    await h.c.import('medieval.pak', null, async () => medievalPak('factory'))
    await until(h, (s) => kitPack(h, FactoryKit.EP1320) !== null)
    h.c.setFactoryKit(FactoryKit.EP133)
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP133.id)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device === null)
    h.ep.access.plug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device !== null && !s.busy)
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP1320.id)
    // Copied to library.json with the other settings.
    expect(h.deps.settings.toIndex()['app.factoryKit']).toBe('ep1320')

    // An EP-133 next: its kit again.
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device === null)
    h.mock.greet = EP133_GREET
    h.ep.access.plug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device !== null && !s.busy)
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP133.id)
  })

  it("a sound the device lists unnamed plays from the connected device's kit, and offline from the active one", async () => {
    const h = await liveHarness({ storage: memoryStorage(ORDER), factory: site(await ep133Pak()) })
    await bothKits(h)
    // An EP-1320 still holding its factory sound in slot 1: listed by its file.
    h.mock.greet = MEDIEVAL_GREET
    h.mock.addSound({ slot: 1, name: '001.pcm', pcm: h.mock.sounds.get(1)!.pcm })
    await h.c.connect()
    h.c.setLive(true)
    await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
    await copied(h)
    // The kit chosen is the EP-133's, but this is an EP-1320.
    h.c.setFactoryKit(FactoryKit.EP133)
    expect(h.c.mirrorName(A1)).toBe('001.pcm')
    // Without arc's copy, the pad plays from the EP-1320's pack (3000 samples, not the EP-133's 2000).
    await h.c.clearPadSounds()
    const medieval = packKey(kitPack(h, FactoryKit.EP1320)!.id, 1, '001.pcm')
    await vi.waitFor(() => expect(h.liveAudio.loaded.get(medieval)?.pcm.length).toBe(3000))
    await h.c.playPad(A1)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:0', key: medieval })

    // Unplugged, the last read's unnamed sound plays from the active kit's pack.
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.mirror?.offline != null && s.mirror.offline !== MirrorText.FACTORY)
    const ep133 = packKey(kitPack(h, FactoryKit.EP133)!.id, 1, '001.pcm')
    await vi.waitFor(() => expect(h.liveAudio.loaded.get(ep133)?.pcm.length).toBe(2000))
    await h.c.playPad(A1)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:0', key: ep133 })
  })

  it('keeps each pack\'s sounds under its own keys, though slot and name are the same, and a pad keeps its kit', async () => {
    // Both packs have "kick" in slot 1 and "clap" in slot 5.
    const h = await liveHarness({ storage: memoryStorage(ORDER), unplugged: true, factory: site(await ep133Pak(['kick', 'clap'])) })
    await bothKits(h, await medievalPak('factory', ['kick', 'clap']))
    const ep133 = kitPack(h, FactoryKit.EP133)!.id
    const medieval = kitPack(h, FactoryKit.EP1320)!.id
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.kit === FactoryKit.EP1320.id)
    await vi.waitFor(() => expect(h.liveAudio.loaded.get(packKey(medieval, 1, 'kick'))?.pcm.length).toBe(3000))
    await h.c.playPad(A1)
    expect(h.liveAudio.presses.at(-1)?.key).toBe(packKey(medieval, 1, 'kick'))
    // The EP-1320's clap on D1, in arc only: it keeps its kit.
    const D1 = physicalPad(3, 0)
    expect(await h.c.assignPad(D1, 5, 'factory')).toBe(true)
    expect(JSON.parse(h.storage.getItem('arc.live.pads')!).pads[0]).toMatchObject({ slot: 5, name: 'clap', source: 'factory', kit: 'ep1320' })

    h.c.setFactoryKit(FactoryKit.EP133)
    await until(h, (s) => s.mirror?.kit === FactoryKit.EP133.id)
    await vi.waitFor(() => expect(h.liveAudio.loaded.get(packKey(ep133, 1, 'kick'))?.pcm.length).toBe(2000))
    await h.c.playPad(A1)
    expect(h.liveAudio.presses.at(-1)?.key).toBe(packKey(ep133, 1, 'kick'))
    // The other kit's kick stays apart; D1 still plays the EP-1320's clap.
    expect(h.liveAudio.loaded.get(packKey(medieval, 1, 'kick'))?.pcm.length).toBe(3000)
    expect(packKey(ep133, 1, 'kick')).not.toBe(packKey(medieval, 1, 'kick'))
    await h.c.playPad(D1)
    expect(h.liveAudio.presses.at(-1)?.key).toBe(packKey(medieval, 5, 'clap'))
    expect(h.liveAudio.loaded.get(packKey(medieval, 5, 'clap'))?.pcm.length).toBe(3000)
    // The previews of the factory list follow the kit too.
    const player = h.deps.player as NullPlayer
    await h.c.playLiveSound(5, 'factory')
    expect(player.plays.at(-1)?.key).toBe('factory:5')
  })
})

describe('Factory sounds: the EP-40 kit beside the EP-133 and the EP-1320', () => {
  const PAGE_HTML = '<script type="module" crossorigin src="/apps/ep-sample-tool/assets/index-C1wBjhTa.js"></script>'
  const PAK_133 = '/apps/ep-sample-tool/assets/ep-133-factory-content-T3st.pak'
  const PAK_40 = '/apps/ep-sample-tool/assets/ep-40-factory-content-T3st40.pak'
  // The tool's script holds both packs' paths, the EP-40's first (as served).
  const SCRIPT = `ep40factoryContent="${PAK_40}",ep133factoryContent="${PAK_133}"`
  const EP40_GREET = 'chip_id:0;mode:normal;os_version:0.0.0;product:EP-40;serial:MOCK0040;sku:TE032AS006;sw_version:0.0.0'
  const EP133_GREET = 'chip_id:0;mode:normal;os_version:2.0.5;product:EP-133;serial:MOCK0001;sku:TE032AS001;sw_version:2.0.5'
  const EP40_META = { pak_type: 'factory', device_name: 'EP-40', device_sku: 'TE032AS006', device_version: '0.0.0' }

  /**
   * A small pack: [names] in slots 1 and 5 on a/p01 and a/p05 of project 1,
   * each a tone [len] samples long. [folder]: every file under that folder,
   * with macOS's resource forks beside it, as the EP-40's pack is zipped.
   */
  async function pack(meta: Record<string, string>, names: [string, string], len: number, folder = ''): Promise<Uint8Array> {
    const wav = encodeWav(tone(len, 220), 1, 46875)
    const fork = new Uint8Array([0, 5, 22, 7, 0, 2, 0, 0])
    const files = [
      { path: `${folder}meta.json`, data: new TextEncoder().encode(JSON.stringify({ ...meta, generated_at: '2025-10-24T00:00:00.000Z' })), compress: false },
      { path: `${folder}sounds/001 ${names[0]}.wav`, data: wav, compress: false },
      { path: `${folder}sounds/005 ${names[1]}.wav`, data: wav, compress: false },
      { path: `${folder}projects/P01.tar`, data: tarFile([['pads/a/p01', pad(1)], ['pads/a/p05', pad(5)]]), compress: false },
    ]
    const forks =
      folder === ''
        ? []
        : [
            { path: `__MACOSX/${folder}._meta.json`, data: fork, compress: false },
            { path: `__MACOSX/${folder}sounds/._001 ${names[0]}.wav`, data: fork, compress: false },
            { path: `__MACOSX/${folder}projects/._P01.tar`, data: fork, compress: false },
          ]
    return writeZip([...files, ...forks], { date: 0, offsetMin: 0 })
  }

  const ep133Pak = (): Promise<Uint8Array> => pack({ pak_type: 'factory', device_name: 'EP-133', device_sku: 'TE032AS001' }, ['micro kick', 'nt clap'], 2000)
  /** The EP-40's pack as teenage engineering zips it: in a folder, with __MACOSX entries. */
  const ep40Pak = (names: [string, string] = ['riddim kick', 'riddim snare']): Promise<Uint8Array> =>
    pack(EP40_META, names, 4000, 'ep-40-factory-content/')
  const medievalPak = (): Promise<Uint8Array> =>
    pack({ pak_type: 'factory', device_name: 'EP-1320', device_sku: 'TE032AS005', device_version: '1.0.0' }, ['med kick', 'med clap'], 3000)

  /**
   * teenage engineering's site: each pack at its own path ([paks]); [asked]
   * lists the paths read, and [labels] the progress shown while the server
   * gives no length.
   */
  function site(paks: Record<string, Uint8Array>, asked: string[] = [], labels: Array<() => string | undefined> = []): FactoryDeps {
    return {
      text: async (path) => {
        asked.push(path)
        return path === FactorySounds.PAGE ? PAGE_HTML : SCRIPT
      },
      bytes: async (path, _signal, onProgress) => {
        asked.push(path)
        const pak = paks[path]
        if (pak === undefined) throw new Error('HTTP 404')
        onProgress(1000, null)
        for (const l of labels) l()
        onProgress(pak.length, pak.length)
        return pak
      },
    }
  }

  const kitPack = (h: LiveHarness, kit: FactoryKit): BackupRecord | null => FactorySounds.inLibrary(h.c.state.value.backups, kit)

  it("Get downloads the EP-40's pack, saves it as its kit, and Live plays it from then on", async () => {
    const asked: string[] = []
    const seen: string[] = []
    let h: LiveHarness | null = null
    const label = (): string | undefined => {
      const l = h?.c.state.value.task?.label
      if (l !== undefined) seen.push(l)
      return l
    }
    h = await liveHarness({ storage: memoryStorage(ORDER), unplugged: true, factory: site({ [PAK_40]: await ep40Pak(), [PAK_133]: await ep133Pak() }, asked, [label]) })
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.error === MirrorText.NOT_CONNECTED)
    await h.c.getFactorySounds(FactoryKit.EP40)
    // The EP-40's path from the script, not the EP-133's beside it.
    expect(asked).toEqual([FactorySounds.PAGE, '/apps/ep-sample-tool/assets/index-C1wBjhTa.js', PAK_40])
    // No length from the server: the progress counts against the EP-40's size.
    expect(seen).toEqual([FeatureText.factoryProgress(1000, FactorySounds.KNOWN_SIZE_40)])
    await until(h, (s) => s.backups.length === 1)
    const b = kitPack(h, FactoryKit.EP40)!
    expect(b).toMatchObject({
      title: FeatureText.FACTORY_TITLE_40,
      source: 'factory-ep40',
      fileName: FactorySounds.FILE_NAME_40,
      soundCount: 2,
      projectCount: 1,
      device: { product: 'EP-40', sku: 'TE032AS006' },
    })
    expect(h.c.state.value.freshId).toBe(b.id)
    expect(h.toasts.at(-1)?.text).toBe(FeatureText.factory40Saved(2))
    // The EP-40's kit is Live's from now on.
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP40.id)
    expect(h.c.factoryKit).toBe(FactoryKit.EP40)
    await until(h, (s) => s.mirror?.offline === MirrorText.FACTORY && s.mirror.kit === FactoryKit.EP40.id)
    expect(h.c.mirrorName(A1)).toBe('riddim kick')
    expect(h.c.mirrorName(A5)).toBe('riddim snare')
    await vi.waitFor(() => expect(h.liveAudio.loaded.get(packKey(b.id, 5, 'riddim snare'))?.pcm.length).toBe(4000))
    await h.c.playPad(A5)
    expect(h.liveAudio.presses.at(-1)?.key).toBe(packKey(b.id, 5, 'riddim snare'))
    // Not downloaded twice; never pruned.
    await h.c.getFactorySounds(FactoryKit.EP40)
    expect(asked).toHaveLength(3)
    expect(toPrune(h.c.state.value.backups, 0)).toEqual([])

    // The EP-133's next: saved beside it, the kit stays the EP-40's.
    await h.c.getFactorySounds()
    expect(asked.at(-1)).toBe(PAK_133)
    await until(h, (s) => kitPack(h!, FactoryKit.EP133) !== null)
    expect(h.toasts.at(-1)?.text).toBe(FeatureText.factorySaved(2))
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP40.id)
    expect(FactorySounds.savedKits(h.c.state.value.backups)).toEqual([FactoryKit.EP133, FactoryKit.EP40])
    expect(h.c.mirrorName(A1)).toBe('riddim kick')
    h.c.setFactoryKit(FactoryKit.EP133)
    await until(h, (s) => s.mirror?.kit === FactoryKit.EP133.id)
    expect(h.c.mirrorName(A1)).toBe('micro kick')
  })

  it("the EP-1320's kit isn't downloaded: Get for it does nothing", async () => {
    const asked: string[] = []
    const h = await liveHarness({ unplugged: true, factory: site({}, asked) })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds(FactoryKit.EP1320)
    expect(asked).toEqual([])
    expect(h.c.state.value.task).toBeNull()
  })

  it("refuses a file that isn't an EP-40 factory pack, and keeps nothing", async () => {
    const h = await liveHarness({ unplugged: true, factory: site({ [PAK_40]: await ep133Pak() }) })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds(FactoryKit.EP40)
    expect(h.toasts.at(-1)).toMatchObject({ text: FeatureText.factoryFailed(FeatureText.NOT_FACTORY_40), error: true })
    expect(h.c.state.value.backups).toEqual([])
    expect(h.c.state.value.task).toBeNull()
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP133.id)
  })

  it("falls back to the EP-40's last known path when the tool's page can't be read", async () => {
    const asked: string[] = []
    const h = await liveHarness({
      unplugged: true,
      factory: { ...site({ [FactorySounds.KNOWN_PAK_40]: await ep40Pak() }, asked), text: () => Promise.reject(new Error('HTTP 404')) },
    })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds(FactoryKit.EP40)
    expect(asked).toEqual([FactorySounds.KNOWN_PAK_40])
    await until(h, (s) => s.backups.length === 1)
    expect(h.c.state.value.backups.map((r) => r.source)).toEqual([FactoryKit.EP40.source])
  })

  it('an imported EP-40 factory pack is saved as the kit straight away', async () => {
    const h = await liveHarness({ unplugged: true })
    await until(h, (s) => s.libraryLoaded)
    await h.c.import('ep-40-factory-content-C42FyxWp.pak', null, async () => ep40Pak())
    await until(h, (s) => kitPack(h, FactoryKit.EP40) !== null)
    expect(h.c.state.value.backups).toHaveLength(1)
    expect(kitPack(h, FactoryKit.EP40)).toMatchObject({ title: FeatureText.FACTORY_TITLE_40, fileName: FactorySounds.FILE_NAME_40 })
    expect(h.toasts.at(-1)?.text).toBe(FeatureText.factory40Saved(2))
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP40.id)
  })

  it('with three kits saved the switch offers them in order; a kit whose pack goes falls back on the first saved', async () => {
    const h = await liveHarness({ storage: memoryStorage(ORDER), unplugged: true, factory: site({ [PAK_40]: await ep40Pak(), [PAK_133]: await ep133Pak() }) })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds()
    await until(h, (s) => kitPack(h, FactoryKit.EP133) !== null)
    // One kit: no switch.
    expect(FactorySounds.savedKits(h.c.state.value.backups)).toEqual([FactoryKit.EP133])
    await h.c.import('medieval.pak', null, async () => medievalPak())
    await until(h, (s) => kitPack(h, FactoryKit.EP1320) !== null)
    expect(FactorySounds.savedKits(h.c.state.value.backups)).toEqual([FactoryKit.EP133, FactoryKit.EP1320])
    await h.c.getFactorySounds(FactoryKit.EP40)
    await until(h, (s) => kitPack(h, FactoryKit.EP40) !== null)
    // EP-133, EP-40, EP-1320: the downloadable ones first.
    expect(FactorySounds.savedKits(h.c.state.value.backups)).toEqual([FactoryKit.EP133, FactoryKit.EP40, FactoryKit.EP1320])
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.kit === FactoryKit.EP40.id)
    expect(h.c.mirrorName(A1)).toBe('riddim kick')

    // The EP-1320's chosen, then its copy deleted: the first saved, the EP-133's.
    h.c.setFactoryKit(FactoryKit.EP1320)
    await until(h, (s) => s.mirror?.kit === FactoryKit.EP1320.id)
    expect(h.c.mirrorName(A1)).toBe('med kick')
    expect(await h.c.delete(kitPack(h, FactoryKit.EP1320)!)).toBe(true)
    await until(h, (s) => s.mirror?.kit === FactoryKit.EP133.id)
    expect(h.c.factoryKit).toBe(FactoryKit.EP133)
    // Without the EP-133's either: the EP-40's.
    expect(await h.c.delete(kitPack(h, FactoryKit.EP133)!)).toBe(true)
    await until(h, (s) => s.mirror?.kit === FactoryKit.EP40.id)
    expect(h.c.factoryKit).toBe(FactoryKit.EP40)
    expect(h.c.mirrorName(A1)).toBe('riddim kick')
  })

  it('connecting a TE032AS006 device makes the EP-40 the kit, once its pack is saved', async () => {
    const h = await liveHarness({ factory: site({ [PAK_40]: await ep40Pak(), [PAK_133]: await ep133Pak() }) })
    await until(h, (s) => s.libraryLoaded)
    await h.c.getFactorySounds()
    await until(h, (s) => kitPack(h, FactoryKit.EP133) !== null)
    h.mock.greet = EP40_GREET
    await h.c.connect()
    await until(h, (s) => s.device !== null && !s.busy)
    expect(h.c.state.value.device!.info.sku).toBe('TE032AS006')
    // No EP-40 pack: the kit stays.
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP133.id)

    await h.c.getFactorySounds(FactoryKit.EP40)
    await until(h, (s) => kitPack(h, FactoryKit.EP40) !== null)
    h.c.setFactoryKit(FactoryKit.EP133)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device === null)
    h.ep.access.plug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device !== null && !s.busy)
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP40.id)
    expect(h.deps.settings.toIndex()['app.factoryKit']).toBe('ep40')

    // An EP-133 next: its kit again.
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device === null)
    h.mock.greet = EP133_GREET
    h.ep.access.plug(h.ep.input, h.ep.output)
    await until(h, (s) => s.device !== null && !s.busy)
    expect(h.deps.settings.settings.factoryKit).toBe(FactoryKit.EP133.id)
  })
})

describe('Live offline: pads changed in arc only', () => {
  const PAGE_HTML = '<script type="module" crossorigin src="/apps/ep-sample-tool/assets/index-C1wBjhTa.js"></script>'
  const SCRIPT = 'x="/apps/ep-sample-tool/assets/ep-133-factory-content-T3st.pak"'
  const PADS_KEY = 'arc.live.pads'
  const D1 = physicalPad(3, 0)

  /** A small factory pack: micro kick (1) on a/p01 and fx sweep (300), not on the demo device, on a/p05. */
  async function factoryPak(): Promise<Uint8Array> {
    const wav = encodeWav(tone(3000, 330), 1, 46875)
    return writeZip(
      [
        { path: 'meta.json', data: new TextEncoder().encode(JSON.stringify({ pak_type: 'factory', device_name: 'EP-133', generated_at: '2023-11-24T00:00:00.000Z' })), compress: false },
        { path: 'sounds/001 micro kick.wav', data: wav, compress: false },
        { path: 'sounds/300 fx sweep.wav', data: wav, compress: false },
        { path: 'projects/P01.tar', data: tarFile([['pads/a/p01', pad(1)], ['pads/a/p05', pad(300)]]), compress: false },
      ],
      { date: 0, offsetMin: 0 },
    )
  }

  function site(pak: Uint8Array): FactoryDeps {
    return {
      text: async (path) => (path === FactorySounds.PAGE ? PAGE_HTML : SCRIPT),
      bytes: async (_path, _signal, onProgress) => {
        onProgress(pak.length, pak.length)
        return pak
      },
    }
  }

  /** Read with the project's pads copied, then unplugged: Live shows the last read, offering its sounds. */
  async function readThenUnplugged(opts: { pack?: boolean } = {}): Promise<LiveHarness> {
    const h = await liveOn({ factory: site(await factoryPak()) })
    await copied(h)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.mirror?.offlineSounds != null)
    if (opts.pack !== false) {
      await h.c.getFactorySounds()
      await until(h, (s) => s.mirror?.offlineSounds?.factory != null)
    }
    return h
  }

  /** The slot on project [project]'s pad [n] of group A, read back from the device. */
  async function onDevice(h: LiveHarness, n: number, project = 1): Promise<number | null | undefined> {
    await h.c.loadProjectSounds(project)
    return h.c.state.value.browser.projectPads.get(project)?.find((g) => g.name === 'a')?.pads.get(n)
  }

  /** Plugged back in: connected, Live read, and the question asked. */
  async function plugged(h: LiveHarness): Promise<void> {
    h.ep.access.plug(h.ep.input, h.ep.output)
    await until(h, (s) => s.offlinePrompt !== null && s.mirror !== null && !s.mirror.loading && !s.busy)
  }

  it('offers the last read and the factory pack, dimming the device sounds arc has no audio for', async () => {
    const h = await readThenUnplugged()
    const off = h.c.state.value.mirror!.offlineSounds!
    expect(off.base).toBe('device')
    expect(off.device?.map((e) => e.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 108, 109, 110, 111])
    expect(off.device?.every((e) => e.size === 0)).toBe(true)
    expect(off.factory?.map((e) => [e.slot, e.name])).toEqual([[1, 'micro kick'], [300, 'fx sweep']])
    // Only the pads' sounds were copied.
    expect([...off.unavailable].sort((a, b) => a - b)).toEqual([6, 7, 8, 108, 109, 110, 111])
    // A backup with one of them: it can play now.
    await backupWith(h, 'b1', 7, 'tom low')
    await until(h, (s) => s.mirror?.offlineSounds?.unavailable.has(7) === false)
  })

  it('without the pack only the device list, and never read only the factory one', async () => {
    const h = await readThenUnplugged({ pack: false })
    expect(h.c.state.value.mirror!.offlineSounds).toMatchObject({ base: 'device', factory: null })
    disposeAll()
    const fresh = await liveHarness({ unplugged: true, factory: site(await factoryPak()) })
    await until(fresh, (s) => s.libraryLoaded)
    await fresh.c.getFactorySounds()
    fresh.c.setLive(true)
    await until(fresh, (s) => s.mirror?.offlineSounds != null)
    const off = fresh.c.state.value.mirror!.offlineSounds!
    expect(off).toMatchObject({ base: 'factory', device: null })
    expect(off.factory?.length).toBe(2)
    expect(fresh.c.liveSounds().map((e) => e.name)).toEqual(['micro kick', 'fx sweep'])
  })

  it('previews either list offline under factory:N and device:N, and says when arc has no copy', async () => {
    const h = await readThenUnplugged()
    const player = h.deps.player as NullPlayer
    await h.c.playLiveSound(300, 'factory')
    expect(player.plays.at(-1)?.key).toBe('factory:300')
    await h.c.playLiveSound(2, 'device')
    expect(player.plays.at(-1)?.key).toBe('device:2')
    const before = player.plays.length
    await h.c.playLiveSound(7, 'device')
    expect(player.plays.length).toBe(before)
    expect(h.toasts.at(-1)?.text).toBe(WebText.LIVE_NO_COPY)
  })

  it('a factory sound put on a pad names it and plays from the pack, though the read has another sound in that slot', async () => {
    const h = await readThenUnplugged()
    expect(await h.c.assignPad(A5, 1, 'factory')).toBe(true)
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.assignedOffline(A5, 'micro kick'))
    expect(h.c.mirrorName(A5)).toBe('micro kick')
    expect(h.c.padSoundName(A5)).toBe('micro kick')
    expect(h.c.padSource(A5)).toBe('factory')
    expect(h.c.state.value.offlinePads).toBe(1)
    await h.c.playPad(A5)
    const pack = FactorySounds.inLibrary(h.c.state.value.backups)!
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:4', key: packKey(pack.id, 1, 'micro kick') })
    // The pad holding the device's slot 1 still plays the device's sound.
    expect(h.c.mirrorName(A1)).toBe('kick')
    await h.c.playPad(A1)
    expect(h.liveAudio.presses.at(-1)).toMatchObject({ id: 'live:0:0', key: '1:kick' })
    // The read itself is kept as the device had it.
    expect(snapshotFromJson(h.storage.getItem(LIVE_KEY)!)!.groups.find((g) => g.name === 'a')?.pads.get(5)).toBe(5)
    // The read's own sound back on the pad drops the change.
    expect(await h.c.assignPad(A5, 5, 'device')).toBe(true)
    expect(h.c.mirrorName(A5)).toBe('clap')
    expect(h.c.state.value.offlinePads).toBe(0)
  })

  it('refuses a device sound arc has no audio for', async () => {
    const h = await readThenUnplugged()
    expect(await h.c.assignPad(A5, 7, 'device')).toBe(false)
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.NEEDS_DEVICE)
    expect(h.c.mirrorName(A5)).toBe('clap')
    expect(h.storage.getItem(PADS_KEY)).toBeNull()
  })

  it("takes a pad back to its own sound in the read, though arc can't play it", async () => {
    const h = await readThenUnplugged()
    expect(await h.c.assignPad(A5, 1, 'factory')).toBe(true)
    // The copies gone: the read's own clap on A5 needs the EP-133 now.
    await h.c.clearPadSounds()
    expect(h.c.state.value.mirror?.offlineSounds?.unavailable.has(5)).toBe(true)
    expect(h.c.padReadSlot(A5)).toBe(5)
    expect(await h.c.assignPad(A5, 5, 'device')).toBe(true)
    expect(h.c.mirrorName(A5)).toBe('clap')
    expect(h.c.state.value.offlinePads).toBe(0)
    // Another sound arc can't play is still refused.
    expect(await h.c.assignPad(A5, 7, 'device')).toBe(false)
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.NEEDS_DEVICE)
  })

  it('a factory sound put on a pad points to the factory sounds once the pack is gone', async () => {
    const h = await readThenUnplugged()
    expect(await h.c.assignPad(A5, 300, 'factory')).toBe(true)
    const pack = FactorySounds.inLibrary(h.c.state.value.backups)!
    expect(await h.c.delete(pack)).toBe(true)
    await until(h, (s) => s.mirror?.offlineSounds?.factory === null)
    // Nothing kept in memory either.
    await h.c.clearPadSounds()
    await h.c.playPad(A5)
    expect(h.toasts.some((t) => t.text === WebText.LIVE_NO_COPY_FACTORY)).toBe(true)
  })

  it('keeps the changes across a restart, and Reset pads clears them', async () => {
    const first = await readThenUnplugged({ pack: false })
    expect(await first.c.assignPad(A5, 2, 'device')).toBe(true)
    expect(first.storage.getItem(PADS_KEY)).not.toBeNull()
    const { storage, padSounds } = first
    disposeAll()
    const h = await liveHarness({ storage, padSounds, unplugged: true })
    h.c.setLive(true)
    await until(h, (s) => s.mirror?.offlineSounds != null)
    expect(h.c.mirrorName(A5)).toBe('snare')
    expect(h.c.state.value.offlinePads).toBe(1)
    await vi.waitFor(() => expect(h.liveAudio.loaded.has('2:snare')).toBe(true))
    await h.c.resetOfflinePads()
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.PADS_RESET)
    expect(h.c.mirrorName(A5)).toBe('clap')
    expect(h.c.state.value.offlinePads).toBe(0)
    expect(storage.getItem(PADS_KEY)).toBeNull()
  })

  it('asks once the EP-133 is read again; Write puts on the changes that still fit and skips the rest', async () => {
    const h = await readThenUnplugged()
    // Fits: the device still has snare in slot 2. Skipped: it has nothing in slot 300.
    expect(await h.c.assignPad(A5, 2, 'device')).toBe(true)
    expect(await h.c.assignPad(D1, 300, 'factory')).toBe(true)
    expect(h.c.state.value.offlinePads).toBe(2)
    await plugged(h)
    expect(h.c.state.value.offlinePrompt).toEqual({ changes: 2, samples: 0 })
    await h.c.writeOfflinePads()
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.offlineWritten(1, 1))
    expect(h.c.state.value).toMatchObject({ offlinePrompt: null, offlinePads: 0 })
    expect(h.storage.getItem(PADS_KEY)).toBeNull()
    expect(await onDevice(h, 5)).toBe(2)
    expect(h.c.mirrorName(A5)).toBe('snare')
    // The read saved for next time has it too.
    expect(snapshotFromJson(h.storage.getItem(LIVE_KEY)!)!.groups.find((g) => g.name === 'a')?.pads.get(5)).toBe(2)
  })

  it('a Write while one runs is the same one, and a read meanwhile asks nothing', async () => {
    const h = await readThenUnplugged({ pack: false })
    expect(await h.c.assignPad(A5, 2, 'device')).toBe(true)
    await plugged(h)
    const first = h.c.writeOfflinePads()
    expect(h.c.writeOfflinePads()).toBe(first)
    await h.c.offerOfflinePads()
    expect(h.c.state.value.offlinePrompt).toBeNull()
    await first
    expect(h.toasts.filter((t) => t.text === MirrorText.offlineWritten(1, 0)).length).toBe(1)
    expect(await onDevice(h, 5)).toBe(2)
  })

  it('closing Live while it asks drops the question; the changes stay', async () => {
    const h = await readThenUnplugged({ pack: false })
    expect(await h.c.assignPad(A5, 2, 'device')).toBe(true)
    await plugged(h)
    h.c.closeMirror()
    expect(h.c.state.value.offlinePrompt).toBeNull()
    expect(h.storage.getItem(PADS_KEY)).not.toBeNull()
  })

  it('connected, a factory slot never goes on the device', async () => {
    const h = await liveOn()
    await copied(h)
    expect(await h.c.assignPad(A5, 1, 'factory')).toBe(false)
    expect(await onDevice(h, 5)).toBe(5)
  })

  it('Discard keeps the device as it is and clears the changes', async () => {
    const h = await readThenUnplugged({ pack: false })
    expect(await h.c.assignPad(A5, 2, 'device')).toBe(true)
    await plugged(h)
    await h.c.discardOfflinePads()
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.OFFLINE_DISCARDED)
    expect(h.c.state.value).toMatchObject({ offlinePrompt: null, offlinePads: 0 })
    expect(h.storage.getItem(PADS_KEY)).toBeNull()
    expect(await onDevice(h, 5)).toBe(5)
    expect(h.c.mirrorName(A5)).toBe('clap')
  })

  it("skips a change made on another project than the device's active one", async () => {
    // Made on project 2 (say, a read since replaced); the device's active project is 1.
    const pads = JSON.stringify({ v: 1, pads: [{ project: 2, group: 0, pad: 1, slot: 2, name: 'snare', source: 'device' }] })
    const h = await liveOn({ storage: memoryStorage({ ...ORDER, [PADS_KEY]: pads }) })
    await until(h, (s) => s.offlinePrompt !== null)
    expect(h.c.state.value.offlinePrompt).toEqual({ changes: 1, samples: 0 })
    await h.c.writeOfflinePads()
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.offlineWritten(0, 1))
    expect(await onDevice(h, 1, 2)).toBe(4)
    expect(h.c.state.value.offlinePads).toBe(0)
  })

  it('unplugged while it asks, the question goes and the changes stay', async () => {
    const h = await readThenUnplugged({ pack: false })
    expect(await h.c.assignPad(A5, 2, 'device')).toBe(true)
    await plugged(h)
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.mirror?.offlineSounds != null)
    expect(h.c.state.value).toMatchObject({ offlinePrompt: null, offlinePads: 1 })
    expect(h.storage.getItem(PADS_KEY)).not.toBeNull()
    expect(h.c.mirrorName(A5)).toBe('snare')
    // Asked again at the next connection.
    await plugged(h)
    expect(h.c.state.value.offlinePrompt).toEqual({ changes: 1, samples: 0 })
  })
})
