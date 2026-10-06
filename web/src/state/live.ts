// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (Live's sounds and its last read:
// openOfflineMirror … clearPadSounds, playPad, cutPad, playNote, selectKeysPad, the KEYS settings' use)
//
// What Live plays on the phone and what it remembers of the device:
// - the last read (project, pads, sound names), kept so Live still shows
//   the pads while the EP-133 is not connected, and copied to the library
//   folder as live.json; before any read, the factory sounds' first project
//   when the library has them (factorySnapshot);
// - arc's copies of the samples on the active project's pads, read from the
//   device one at a time in the background while Live is open and connected
//   (PadSoundCache); an action started meanwhile waits at most for the sound
//   being read (UiState.backgroundRead, Tasks.acquire);
// - the samples on the pads decoded in memory (padMemory) and loaded into
//   Live's output, so a press plays at once; a pad or key sounds while held
//   (a gate) and several make a chord (LiveAudioDeps mixes them);
// - KEYS: the pad whose sample the keys play, repitched to each note (the
//   grid's keys and the piano's are both played by MIDI note, so a held key
//   keeps its note when the key, scale or octave changes);
// - presses during a slide: one load per sound, shared by every press that
//   waits on it (padLoads); after a slow one only the latest lifted press
//   sounds (LATE_LOAD_MS); a toast a press raises shows once (toastOnce).
//
// Web deltas:
// - Coroutines become promises; a generation counter ends a loop (cacheGen,
//   preloadGen) where Kotlin cancels a Job.
// - padMemory is a Map kept in access order by hand (LinkedHashMap with
//   accessOrder). Each sample is also loaded into LiveAudioDeps under the same
//   key ("slot:name"), so a press sends only names to the audio thread.
// - Times are Deps.perfNow ms (System.nanoTime on Android). A press's time
//   is its input event's timeStamp (PointerEvent / KeyboardEvent, on the same
//   clock) where the screen passes one ([pressTime]; Android converts the
//   touch's uptimeMillis), so the latency note counts the input's dispatch.
// - The latency test ([latency], [latencyOpened], [resetLatency]) keeps,
//   beside LatencyStats, each row's LiveEngineInfo (the output's reported
//   delay) for its estimate line, in one signal (Android's LiveLatency).
// - Bluetooth's delay is pointed out when Live's output reports a slow
//   output (LiveAudioDeps.onSlowOutput): browsers don't tell where the sound
//   goes, so the output guesses from its own latency, and the toast is
//   WebText.LIVE_SLOW_OUTPUT. Toasts that say "on the phone" use WebText too.
// - Leaving Live suspends its output ([suspendAudio]) where Kotlin closes
//   it; the controller closes it after a while away.
// - The background copy reads each sound at most once a run, so a copy the
//   store refuses (quota) is not downloaded over and over.

import { signal, type ReadonlySignal } from '@preact/signals'
import { openPak, type Pak } from '../core/backup/pak'
import { soundDetails, type SoundDetails } from '../core/features/deviceBrowser'
import { FactorySounds } from '../core/features/factorySounds'
import { Keys } from '../core/features/keys'
import { LatencyStats } from '../core/features/latencyStats'
import type { NameEntry } from '../core/features/librarySearch'
import type { LiveMirror } from '../core/features/liveMirror'
import { fromJson as snapshotFromJson, toJson as snapshotToJson, type LiveSnapshot } from '../core/features/liveSnapshot'
import { padKey, type PhysicalPad } from '../core/features/padNotes'
import { PadSoundCache } from '../core/features/padSoundCache'
import { newestBackupWith } from '../core/features/padSounds'
import { decodeWav, encodeWav, isSilent } from '../core/formats/wav'
import type { SoundEntry } from '../core/protocol/device'
import { download } from '../core/protocol/fs'
import type { Session } from '../core/protocol/session'
import { FeatureText } from '../core/text/featureText'
import { MirrorText } from '../core/text/mirrorText'
import { WebText } from '../core/text/webText'
import { ktTrim } from '../core/util/kotlinText'
import type { Deps, LiveEngineInfo } from './deps'
import type { Store } from './store'
import { errorText, type Tasks } from './tasks'
import type { UiState } from './types'

/** How much of Live's pad samples is kept decoded in memory (16-bit, so 32M samples). */
export const PAD_MEMORY_BYTES = 64 * 1024 * 1024

/** A pad's sample, ready to play: 16-bit PCM, [channels] interleaved. */
export interface PadAudio {
  readonly pcm: Int16Array
  readonly channels: number
  readonly sampleRate: number
  readonly silent: boolean
}

/** PadAudio.of: from little-endian 16-bit PCM bytes (a partial last sample is dropped). */
export function padAudioOf(pcm: Uint8Array, channels: number, sampleRate: number): PadAudio {
  const n = Math.floor(pcm.length / 2)
  const out = new Int16Array(n)
  const dv = new DataView(pcm.buffer, pcm.byteOffset, n * 2)
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true)
  return { pcm: out, channels: Math.min(2, Math.max(1, channels)), sampleRate, silent: isSilent(pcm) }
}

const padBytes = (a: PadAudio): number => a.pcm.length * 2

/** Whether this platform stores 16-bit numbers little end first (every browser in practice). */
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

/** 16-bit samples as s16le bytes: a view of the same memory where the platform is little-endian, else a copy. */
export function s16leBytes(pcm: Int16Array): Uint8Array {
  if (LITTLE_ENDIAN) return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const out = new Uint8Array(pcm.length * 2)
  const dv = new DataView(out.buffer)
  for (let i = 0; i < pcm.length; i++) dv.setInt16(i * 2, pcm[i]!, true)
  return out
}

/** The key a pad's sample is kept under, in memory and in Live's output: "slot:name". */
export function memoryKey(slot: number, name: string): string {
  return `${slot}:${ktTrim(name).toLowerCase()}`
}

/**
 * An input event's timeStamp further than this before the press's handler
 * runs is not taken for its time: an old browser's epoch timeStamp, or one
 * on another clock.
 */
export const PRESS_STAMP_MAX_MS = 1000

/**
 * When the finger came down, on Deps.perfNow's clock: [at] (the input event's
 * timeStamp) where it is one, so the latency note counts the input's dispatch
 * too; else [now]. A stamp after [now] or over [PRESS_STAMP_MAX_MS] before it
 * is on another clock.
 */
export function pressTime(at: number | undefined, now: number): number {
  return at !== undefined && Number.isFinite(at) && at > 0 && at <= now && now - at <= PRESS_STAMP_MAX_MS ? at : now
}

/** The latency test's numbers: each engine's press-to-sound times, and the delay each one's output reported. */
export interface LiveLatency {
  readonly stats: LatencyStats
  /** Every engine opened, by row label (the keys in [stats]), first opened first. */
  readonly engines: ReadonlyMap<string, LiveEngineInfo>
}

/** The rows of [l]: every engine opened or measured, first first (Kotlin's LiveLatency.State.engines). */
export function latencyRows(l: LiveLatency): string[] {
  return [...new Set([...l.engines.keys(), ...l.stats.engines])]
}

const NO_LATENCY: LiveLatency = { stats: new LatencyStats(), engines: new Map() }

/** Live's voice id for a pad: "live:<group>:<offset>". */
export const padVoice = (pad: { readonly group: number; readonly offset: number }): string => `live:${pad.group}:${pad.offset}`
/** Live's voice id for a KEYS note, on the grid or the piano: "note:<midi>". */
export const noteVoice = (note: number): string => `note:${note}`

/** A Live press let go of while its sound loaded for longer than this sounds only if no press came after it (Kotlin LATE_LOAD_NS). */
export const LATE_LOAD_MS = 120

/** The slots on a read's pads, each once, in order. */
function padSlots(snap: LiveSnapshot): number[] {
  const set = new Set<number>()
  for (const g of snap.groups) for (const slot of g.pads.values()) if (slot !== null) set.add(slot)
  return [...set].sort((a, b) => a - b)
}

export interface LiveHost {
  store: Store<UiState>
  deps: Pick<Deps, 'liveAudio' | 'padSounds' | 'lastRead' | 'library' | 'mirrorPrefs' | 'settings' | 'player' | 'trafficLog' | 'now' | 'perfNow'>
  tasks: Pick<Tasks, 'exclusive' | 'waitTurn'>
  session(): Session | null
  /** The mirror Live shows (connected or offline), if open. */
  mirror(): LiveMirror | null
  /** Every sound name in the saved backups (library.names). */
  names(): readonly NameEntry[]
  /** The play token: a request plays only if no stop or newer request came meanwhile. */
  playToken(): number
  toast(text: string, error?: boolean): void
  /** A toast, unless the same text is already showing (a press can raise one, and a slide presses many). */
  toastOnce(text: string, error?: boolean): void
}

export class LiveSounds {
  // Live's pads play on the phone: from arc's copy of the device's sounds, a backup, or the device.
  readonly cache: PadSoundCache
  /** The device's sound list from Live's read (names and sizes), to tell which copies are current. */
  private deviceSounds = new Map<number, SoundEntry>()
  /** The last backup a pad played from, opened, so the next taps are quick. */
  private openPak: { id: string; pak: Pak } | null = null
  // The factory sounds' first project as Live shows it, by the library entry it came from.
  private factorySnap: { id: string; snap: LiveSnapshot | null } | null = null
  // Live's pad samples decoded and ready ("slot:name"), least recently played first.
  private readonly padMemory = new Map<string, PadAudio>()
  private padMemoryBytes = 0
  // A sample's bytes for a preview, made once per sample.
  private readonly previewBytes = new WeakMap<PadAudio, Uint8Array>()
  private preloadGen = 0
  // Bumped to end the copying loop (mirror closed, project changed).
  private cacheGen = 0
  // Live's pads and keys sound while held (a gate): the voices whose finger is still down.
  private readonly held = new Set<string>()
  // Presses that turned into a scroll while their sound was still loading: it doesn't start.
  private readonly cuts = new Set<string>()
  // Presses on the scrolling page that may still turn into a scroll ([playPad] unsure), until
  // [keepPad] or [cutPad]: whether their sound already started (from memory) or waits to load.
  private readonly unsure = new Map<string, { readonly started: boolean; readonly pressedAt: number; readonly token: number }>()
  // Voices started after their sample had to load (or wait out the scroll window): their latency
  // is logged, but kept out of the latency test, which times only presses played from memory.
  private readonly unmeasured = new Set<string>()
  // A sample on its way to memory for a press, by the same key: the presses that come
  // meanwhile (a glissando over the keys) wait for that one load.
  private readonly padLoads = new Map<string, Promise<{ key: string; audio: PadAudio } | null>>()
  // When the latest settled Live press (pad or key) was made, for the late-load rule in startHeld.
  private lastPressAt = 0
  // The device's project, pads and names as Live last read them, shown while it is not connected.
  private lastRead: LiveSnapshot | null = null
  private lastReadLoaded = false
  // Bluetooth's delay is pointed out once a run.
  private toldBluetooth = false
  private readonly _latency = signal<LiveLatency>(NO_LATENCY)
  /** The debug screen's latency test: each engine's last LatencyStats.KEEP press-to-sound times this session. */
  readonly latency: ReadonlySignal<LiveLatency> = this._latency

  constructor(private readonly host: LiveHost) {
    this.cache = new PadSoundCache(host.deps.padSounds)
  }

  // ---------- the last read ----------

  async loadLastRead(): Promise<LiveSnapshot | null> {
    if (!this.lastReadLoaded) {
      let read: LiveSnapshot | null = null
      try {
        const text = await this.host.deps.lastRead.load()
        read = text === null ? null : snapshotFromJson(text)
      } catch {
        read = null
      }
      // A read saved meanwhile is newer than the stored one was.
      if (!this.lastReadLoaded) this.lastRead = read
      this.lastReadLoaded = true
    }
    return this.lastRead
  }

  /** The last read as live.json text, for the library export. */
  async lastReadJson(): Promise<string | null> {
    const s = await this.loadLastRead()
    return s === null ? null : snapshotToJson(s)
  }

  saveLastRead(m: LiveMirror): void {
    const snap = m.saved(this.host.deps.now())
    // A read that found nothing (no project, no names) would only hide a useful one.
    if (snap.names.size === 0 && snap.groups.length === 0) return
    this.writeLastRead(snap)
    // And to the library folder, so it comes back after a reinstall.
    void this.host.deps.library.saveLive(snapshotToJson(snap)).catch(() => undefined)
  }

  /** Live's last read from the folder after a reinstall, unless this install has a newer one. */
  async restoreLastRead(json: string | null): Promise<void> {
    const snap = json === null ? null : snapshotFromJson(json)
    if (snap === null) return
    const cur = await this.loadLastRead()
    if (cur !== null && cur.savedAt >= snap.savedAt) return
    this.writeLastRead(snap)
  }

  private writeLastRead(snap: LiveSnapshot): void {
    this.lastRead = snap
    this.lastReadLoaded = true
    try {
      void Promise.resolve(this.host.deps.lastRead.save(snapshotToJson(snap))).catch(() => undefined)
    } catch {
      // Kept in memory for this session.
    }
  }

  // ---------- copies of the device's pad sounds ----------

  /** The device's sound list as Live read it. */
  setDeviceSounds(sounds: readonly SoundEntry[]): void {
    this.deviceSounds = new Map(sounds.map((s) => [s.slot, s]))
  }

  deviceSound(slot: number): SoundEntry | undefined {
    return this.deviceSounds.get(slot)
  }

  /** The device's sound list from Live's read, by slot (empty before it). */
  deviceSoundList(): SoundEntry[] {
    return [...this.deviceSounds.values()].sort((a, b) => a.slot - b.slot)
  }

  /** Ends the copying loop (the mirror stopped). */
  stopCopy(): void {
    this.cacheGen++
  }

  /**
   * Copies the sounds on the active project's pads from the device, one at
   * a time in the background, so Live can play them without it. Only sounds
   * arc has no current copy of are read; it stops when Live closes, the
   * project changes or the device goes away, and gives way to any action.
   */
  copyPadSounds(m: LiveMirror, s: Session): Promise<void> {
    const gen = ++this.cacheGen
    const { host } = this
    const alive = (): boolean => gen === this.cacheGen && host.mirror() === m && host.session() === s
    // Each sound is read once a run: a copy that can't be kept (storage full) is not read again and again.
    const tried = new Set<number>()
    return (async () => {
      while (alive()) {
        let todo: SoundEntry | null = null
        for (const slot of padSlots(m.saved(0))) {
          const e = this.deviceSounds.get(slot)
          if (e === undefined || tried.has(slot)) continue
          let fresh: boolean
          try {
            fresh = await this.cache.fresh(slot, e.name, e.size)
          } catch {
            fresh = false
          }
          if (!fresh) {
            todo = e
            break
          }
        }
        if (todo === null || !alive()) break
        tried.add(todo.slot)
        // The device must be free, and nobody waiting for it; marked in the same step.
        const took = await host.tasks.waitTurn(() => {
          if (!alive()) return false
          host.store.update((st) => ({ ...st, backgroundRead: true }))
          return true
        })
        if (!took) break
        let got: { d: SoundDetails; pcm: Uint8Array } | null = null
        try {
          const d = await soundDetails(s, todo.slot)
          got = { d, pcm: await download(s, todo.slot) }
        } catch (e) {
          host.deps.trafficLog.note(`live copy of ${todo.slot} failed: ${errorText(e)}`)
          got = null
        } finally {
          host.store.update((st) => ({ ...st, backgroundRead: false }))
        }
        if (got === null) break
        await this.keepPadSound(todo.slot, todo.name, todo.size, got.pcm, got.d.channels, got.d.sampleRate)
      }
    })()
  }

  /** A sound read from the device: ready to play while Live is open, and copied for later. */
  async keepPadSound(slot: number, name: string, size: number, pcm: Uint8Array, channels: number, sampleRate: number): Promise<void> {
    if (this.host.mirror() !== null) this.keepInMemory(slot, name, padAudioOf(pcm, Math.trunc(channels), Math.trunc(sampleRate)))
    try {
      await this.cache.put(slot, name, size, encodeWav(pcm, channels, sampleRate))
    } catch (e) {
      this.host.deps.trafficLog.note(`saving pad sound ${slot} failed: ${errorText(e)}`)
    }
  }

  /** Space taken by Live's copies of the device's sounds, in bytes. */
  async padSoundsSize(): Promise<number> {
    try {
      return await this.cache.bytes()
    } catch {
      return 0
    }
  }

  async clearPadSounds(): Promise<void> {
    this.forgetPadMemory()
    try {
      await this.cache.clear()
    } catch (e) {
      this.host.toast(errorText(e), true)
      return
    }
    // What a backup still has plays as quickly as before.
    const m = this.host.mirror()
    if (m) this.preloadPads(m)
    this.host.toast(MirrorText.SOUNDS_CLEARED)
  }

  /** When each copy was last played, kept for choosing what to drop when the copies fill up. */
  flush(): void {
    void this.cache.flush().catch(() => undefined)
  }

  /** The library changed: the backup opened for playing may be gone. */
  libraryChanged(): void {
    this.openPak = null
  }

  // ---------- samples in memory ----------

  private keepInMemory(slot: number, name: string, a: PadAudio): void {
    const key = memoryKey(slot, name)
    const prev = this.padMemory.get(key)
    if (prev !== undefined) {
      this.padMemoryBytes -= padBytes(prev)
      this.padMemory.delete(key)
    }
    this.padMemory.set(key, a)
    this.padMemoryBytes += padBytes(a)
    this.host.deps.liveAudio.preload(key, a.pcm, a.channels, a.sampleRate)
    for (const [k, v] of [...this.padMemory]) {
      if (this.padMemoryBytes <= PAD_MEMORY_BYTES) break
      if (v === a) continue
      this.padMemoryBytes -= padBytes(v)
      this.padMemory.delete(k)
      this.host.deps.liveAudio.unload(k)
    }
  }

  /** A sample in memory, now the most recently played. */
  private fromMemory(key: string): PadAudio | null {
    const a = this.padMemory.get(key)
    if (a === undefined) return null
    this.padMemory.delete(key)
    this.padMemory.set(key, a)
    return a
  }

  /** Whether [slot]'s sample with this name is decoded in memory. */
  inMemory(slot: number, name: string): boolean {
    return this.padMemory.has(memoryKey(slot, name))
  }

  /**
   * [slot]'s sample with this name from memory, as s16le bytes for a preview
   * (SoundPlayer.play), or null. The same bytes come back for the same sample.
   */
  memorySound(slot: number, name: string): { pcm: Uint8Array; channels: number; sampleRate: number } | null {
    const a = this.padMemory.get(memoryKey(slot, name))
    if (a === undefined) return null
    let pcm = this.previewBytes.get(a)
    if (pcm === undefined) {
      pcm = s16leBytes(a.pcm)
      this.previewBytes.set(a, pcm)
    }
    return { pcm, channels: a.channels, sampleRate: a.sampleRate }
  }

  /** arc's copy of [slot]'s sound (a WAV) while it is the device's current one ([size] as listed); else null. */
  async currentCopy(slot: number, name: string, size: number): Promise<Uint8Array | null> {
    try {
      return (await this.cache.fresh(slot, name, size)) ? await this.cache.get(slot, name) : null
    } catch {
      return null
    }
  }

  forgetPadMemory(): void {
    this.preloadGen++
    this.padMemory.clear()
    this.padMemoryBytes = 0
    this.host.deps.liveAudio.unload()
  }

  /**
   * Loads the samples on the active project's pads into memory, one at a
   * time in the background, from arc's copies or a backup (never the
   * device: the background copy does that), so pressing a pad plays at once.
   */
  preloadPads(m: LiveMirror): Promise<void> {
    const gen = ++this.preloadGen
    return (async () => {
      const snap = m.saved(0)
      for (const slot of padSlots(snap)) {
        if (gen !== this.preloadGen || this.host.mirror() !== m) return
        const name = snap.names.get(slot)
        if (name === undefined) continue
        if (this.padMemory.has(memoryKey(slot, name)) || this.padLoads.has(memoryKey(slot, name))) continue
        let a: PadAudio | null
        try {
          a = await this.loadPadAudio(slot, name)
        } catch {
          a = null
        }
        if (a === null) continue
        if (gen === this.preloadGen && this.host.mirror() === m) this.keepInMemory(slot, name, a)
      }
    })()
  }

  /** A sample from arc's copy or a backup, decoded; null when neither has it. */
  private async loadPadAudio(slot: number, name: string): Promise<PadAudio | null> {
    const wav = (await this.cache.get(slot, name)) ?? (await this.fromBackup(slot, name))
    if (wav === null) return null
    const w = decodeWav(wav)
    return padAudioOf(w.pcm, w.channels, Math.trunc(w.sampleRate))
  }

  /** The WAV of a sound from the newest backup that has it, if any. */
  private async fromBackup(slot: number, name: string): Promise<Uint8Array | null> {
    const b = newestBackupWith(slot, name, this.host.names(), this.host.store.get().backups)
    if (b === null) return null
    return (await this.pakOf(b.id)).sounds.get(slot)?.wav ?? null
  }

  /** A library entry opened, the last one kept open. */
  private async pakOf(id: string): Promise<Pak> {
    if (this.openPak?.id === id) return this.openPak.pak
    const pak = await openPak(await this.host.deps.library.bytes(id))
    this.openPak = { id, pak }
    return pak
  }

  /**
   * What Live shows while no EP-133 has been read: the factory sounds' first
   * project, when the library has them (FactorySounds); else null.
   */
  async factorySnapshot(): Promise<LiveSnapshot | null> {
    const b = FactorySounds.inLibrary(this.host.store.get().backups)
    if (b === null) return null
    if (this.factorySnap?.id === b.id) return this.factorySnap.snap
    let snap: LiveSnapshot | null
    try {
      snap = FactorySounds.snapshot(await this.pakOf(b.id), b.createdAt)
    } catch {
      snap = null
    }
    this.factorySnap = { id: b.id, snap }
    return snap
  }

  /** The slot and name on [pad], when the mirror knows them. */
  private padSample(pad: PhysicalPad): { slot: number; name: string } | null {
    const m = this.host.mirror()
    const slot = m?.slotOf(pad) ?? null
    const name = m?.nameOf(pad) ?? null
    return slot === null || name === null ? null : { slot, name }
  }

  /** A pad's sample from the first place that has it; null after a toast says why. */
  private async padAudio(pad: PhysicalPad): Promise<{ key: string; audio: PadAudio } | null> {
    const { host } = this
    const sample = this.padSample(pad)
    if (sample === null) {
      host.toastOnce(MirrorText.NO_SAMPLE)
      return null
    }
    const { slot, name } = sample
    const key = memoryKey(slot, name)
    const mem = this.fromMemory(key)
    if (mem) return { key, audio: mem }
    // One load for every press waiting on this sound.
    let load = this.padLoads.get(key)
    if (load === undefined) {
      load = this.loadForPress(slot, name, key).finally(() => this.padLoads.delete(key))
      this.padLoads.set(key, load)
    }
    return load
  }

  /** What [padAudio] waits for: arc's copy or a backup, else the device; null after a toast says why. */
  private async loadForPress(slot: number, name: string, key: string): Promise<{ key: string; audio: PadAudio } | null> {
    const { host } = this
    try {
      let audio = await this.loadPadAudio(slot, name)
      if (audio === null) {
        if (host.session() !== null && host.store.get().device !== null) {
          const r = await host.tasks.exclusive(`play:${slot}`, false, async (s) => {
            const d = await soundDetails(s, slot)
            return { d, pcm: await download(s, slot) }
          })
          if (r === null) return null
          const e = this.deviceSounds.get(slot)
          if (e) await this.keepPadSound(slot, e.name, e.size, r.pcm, r.d.channels, r.d.sampleRate)
          audio = this.padMemory.get(key) ?? padAudioOf(r.pcm, Math.trunc(r.d.channels), Math.trunc(r.d.sampleRate))
        } else {
          host.toastOnce(WebText.LIVE_NO_COPY)
          return null
        }
      }
      if (host.mirror() !== null) this.keepInMemory(slot, name, audio)
      return { key, audio }
    } catch (e) {
      host.toast(errorText(e), true)
      return null
    }
  }

  // ---------- playing ----------

  /** Opens Live's sound output (Live came on screen), so the first press is as quick as the rest. */
  async openAudio(): Promise<void> {
    const a = this.host.deps.liveAudio
    let ok: boolean
    try {
      ok = await a.open()
    } catch {
      ok = false
    }
    // An output with its own log lines says how it was set up (it may wait for the first press).
    if (!a.onLog) this.host.deps.trafficLog.note('live audio: ' + (ok ? a.description : 'no output'))
  }

  /** Live left the screen or the tab was hidden: its output is suspended, kept ready for coming back. */
  suspendAudio(): void {
    this.held.clear()
    this.unsure.clear()
    this.unmeasured.clear()
    const a = this.host.deps.liveAudio
    if (a.suspend) a.suspend()
    else a.close()
  }

  /** Lets the output go (long away, or the page goes). */
  closeAudio(): void {
    this.held.clear()
    this.unsure.clear()
    this.unmeasured.clear()
    this.host.deps.liveAudio.close()
  }

  /** Stops every Live voice (stopPlayback). */
  stopAll(): void {
    this.held.clear()
    this.unsure.clear()
    this.unmeasured.clear()
    this.host.deps.liveAudio.stopAll()
  }

  /**
   * A voice was heard: how long after the press, in the debug log, and (when
   * it played from memory) on [engine]'s row of the latency test.
   */
  onStarted(id: string, latencyMs: number, route: string, engine?: LiveEngineInfo): void {
    this.host.deps.trafficLog.note(MirrorText.latencyNote(id, latencyMs, route))
    if (this.unmeasured.delete(id) || engine === undefined) return
    const cur = this._latency.peek()
    const stats = cur.stats.add(engine.label, latencyMs)
    // A time the clocks got wrong is left out.
    if (stats === cur.stats) return
    this._latency.value = { stats, engines: new Map(cur.engines).set(engine.label, engine) }
  }

  /**
   * Live's output set up on [engine], or its reported delay changed: its row
   * shows it (keeping its place when that engine opens again).
   */
  latencyOpened(engine: LiveEngineInfo): void {
    const cur = this._latency.peek()
    this._latency.value = { stats: cur.stats, engines: new Map(cur.engines).set(engine.label, engine) }
  }

  /** The latency test's Reset: every row's times go; the engines tried keep their rows. */
  resetLatency(): void {
    const cur = this._latency.peek()
    this._latency.value = { stats: cur.stats.reset(), engines: cur.engines }
  }

  /** The output looks like Bluetooth: its delay is pointed out once a run. */
  slowOutput(): void {
    if (this.toldBluetooth) return
    this.toldBluetooth = true
    this.host.toast(WebText.LIVE_SLOW_OUTPUT)
  }

  /**
   * Plays a Live pad's sample (arc's copy of the device's sound, else the
   * newest backup holding it, else, connected, the device) alongside
   * whatever else is sounding, so several pads make a chord. It sounds until
   * [releasePad]; with [hold] false (a screen reader's Play) it plays to the
   * end. Call from the press (pointerdown): it wakes the output.
   *
   * [unsure]: a press on the scrolling page, which may still turn into a
   * scroll. A sample in memory sounds at once all the same; the rest (the
   * KEYS pad, a load from the device, the "no sample" toast) waits for
   * [keepPad], and [cutPad] drops it. [at]: the press's event timeStamp ([pressTime]).
   */
  playPad(pad: PhysicalPad, hold = true, unsure = false, at?: number): Promise<void> {
    const { host } = this
    host.deps.liveAudio.resumeInGesture()
    const pressedAt = pressTime(at, host.deps.perfNow())
    const id = padVoice(pad)
    if (hold) this.held.add(id)
    this.cuts.delete(id)
    this.unsure.delete(id)
    const token = host.playToken()
    // In memory: plays now, without waiting a turn.
    const sample = this.padSample(pad)
    const mem = sample ? this.fromMemory(memoryKey(sample.slot, sample.name)) : null
    if (sample && mem) this.startHeld(id, hold, memoryKey(sample.slot, sample.name), mem, 0, pressedAt, true)
    if (unsure && hold) {
      // Not yet the latest press either: a scroll mustn't drop another press's late load.
      this.unsure.set(id, { started: mem !== null, pressedAt, token })
      return Promise.resolve()
    }
    this.lastPressAt = pressedAt
    const done = mem !== null ? Promise.resolve() : this.loadAndStart(pad, id, hold, pressedAt, token)
    // The pad tapped is also the sound KEYS plays: noted (and stored) once the sound is on its way.
    this.selectKeysPad(pad)
    return done
  }

  /**
   * The press on the scrolling page was a press after all (the scroll window
   * closed, or the finger lifted inside it): the pad becomes the KEYS sound,
   * and one not in memory loads and plays now.
   */
  keepPad(pad: PhysicalPad): Promise<void> {
    const id = padVoice(pad)
    const u = this.unsure.get(id)
    if (u === undefined) return Promise.resolve()
    this.unsure.delete(id)
    this.lastPressAt = Math.max(this.lastPressAt, u.pressedAt)
    const done = u.started ? Promise.resolve() : this.loadAndStart(pad, id, true, u.pressedAt, u.token)
    this.selectKeysPad(pad)
    return done
  }

  /** Loads [pad]'s sample (copy, backup or device) and starts its voice, unless a stop came meanwhile. */
  private async loadAndStart(pad: PhysicalPad, id: string, hold: boolean, pressedAt: number, token: number): Promise<void> {
    const got = await this.padAudio(pad)
    if (got !== null && token === this.host.playToken()) this.startHeld(id, hold, got.key, got.audio, 0, pressedAt, false)
  }

  /** The finger left the pad: its sound fades out. */
  releasePad(pad: { readonly group: number; readonly offset: number }): void {
    this.release(padVoice(pad))
  }

  /** The press on the pad turned into a scroll: its sound ends at once (and one still loading never starts). */
  cutPad(pad: { readonly group: number; readonly offset: number }): void {
    const id = padVoice(pad)
    this.held.delete(id)
    this.cuts.add(id)
    // One still unsure never loads, nor becomes the KEYS sound.
    if (this.unsure.delete(id)) this.cuts.delete(id)
    this.host.deps.liveAudio.cut(id)
  }

  /**
   * Plays MIDI [note] on the KEYS sound (a grid key or a piano key),
   * repitched from its own pitch (C4) as it is mixed, until [releaseNote] (or
   * to the end, with [hold] false). The screen names the note as the finger
   * lands, so a change of key, scale or octave under a held key still lets go
   * of the note it plays. Call from the press; [at]: its event timeStamp ([pressTime]).
   */
  playNote(note: number, hold = true, at?: number): Promise<void> {
    const { host } = this
    host.deps.liveAudio.resumeInGesture()
    const pressedAt = pressTime(at, host.deps.perfNow())
    this.lastPressAt = pressedAt
    const id = noteVoice(note)
    if (hold) this.held.add(id)
    const token = host.playToken()
    const pad = host.store.get().keysPad
    if (pad === null) {
      host.toastOnce(MirrorText.PICK_SOUND)
      return Promise.resolve()
    }
    const pitch = note - Keys.ROOT_NOTE
    const sample = this.padSample(pad)
    const mem = sample ? this.fromMemory(memoryKey(sample.slot, sample.name)) : null
    if (sample && mem) {
      this.startHeld(id, hold, memoryKey(sample.slot, sample.name), mem, pitch, pressedAt, true)
      return Promise.resolve()
    }
    return (async () => {
      const got = await this.padAudio(pad)
      if (got !== null && token === host.playToken()) this.startHeld(id, hold, got.key, got.audio, pitch, pressedAt, false)
    })()
  }

  /** The last finger left the note: it fades out. */
  releaseNote(note: number): void {
    this.release(noteVoice(note))
  }

  private release(id: string): void {
    this.held.delete(id)
    this.host.deps.liveAudio.release(id)
  }

  /**
   * Starts a Live voice. One let go of while it was loading still sounds,
   * briefly, after a quick load. After a slow one ([LATE_LOAD_MS]) only the
   * latest press does: a single quick tap on a sound not in memory yet is
   * still heard, but a first glissando over one doesn't end in a burst of
   * every note it slid over.
   *
   * [measured]: the sample was in memory at the press, so its latency goes
   * into the latency test; a load's time would only blur it.
   */
  private startHeld(id: string, hold: boolean, key: string, a: PadAudio, semitones: number, pressedAt: number, measured: boolean): void {
    const { host } = this
    const out = host.deps.liveAudio
    if (this.cuts.delete(id)) return
    const lifted = hold && !this.held.has(id)
    if (lifted && pressedAt !== this.lastPressAt && host.deps.perfNow() - pressedAt > LATE_LOAD_MS) return
    if (a.silent) {
      host.toastOnce(FeatureText.SILENT_SOUND)
      return
    }
    if (!out.has(key)) out.preload(key, a.pcm, a.channels, a.sampleRate)
    // Marked before the press, which may report at once; one from memory clears a mark left by a
    // loaded voice that was never heard (cut first).
    if (measured) this.unmeasured.delete(id)
    else this.unmeasured.add(id)
    if (!out.press(id, key, { pitch: semitones, gate: hold, pressedAt })) {
      this.unmeasured.delete(id)
      host.toastOnce(FeatureText.NO_AUDIO_OUTPUT, true)
      return
    }
    if (lifted) out.release(id)
    if (host.deps.player.volumeOff()) host.toastOnce(FeatureText.VOLUME_OFF)
  }

  // ---------- KEYS ----------

  /** The sound KEYS plays: the pad last tapped, or last played on the device in the pads view. */
  selectKeysPad(pad: PhysicalPad): void {
    const cur = this.host.store.get().keysPad
    if (cur !== null && padKey(cur) === padKey(pad)) return
    this.host.store.update((st) => ({ ...st, keysPad: pad }))
    this.host.deps.mirrorPrefs.setKeysPad(pad)
  }
}
