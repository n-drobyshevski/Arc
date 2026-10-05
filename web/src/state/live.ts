// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (Live's sounds and its last read:
// openOfflineMirror … clearPadSounds, playPad, playNote, selectKeysPad, the KEYS settings' use)
//
// What Live plays on the phone and what it remembers of the device:
// - the last read (project, pads, sound names), kept so Live still shows
//   the pads while the EP-133 is not connected, and copied to the library
//   folder as live.json;
// - arc's copies of the samples on the active project's pads, read from the
//   device one at a time in the background while Live is open and connected
//   (PadSoundCache); an action started meanwhile waits at most for the sound
//   being read (UiState.backgroundRead, Tasks.acquire);
// - the samples on the pads decoded in memory (padMemory) and loaded into
//   Live's output, so a press plays at once; a pad or key sounds while held
//   (a gate) and several make a chord (LiveAudioDeps mixes them);
// - KEYS: the pad whose sample the keys play, repitched to each note (the
//   grid's keys and the piano's are both played by MIDI note).
//
// Web deltas:
// - Coroutines become promises; a generation counter ends a loop (cacheGen,
//   preloadGen) where Kotlin cancels a Job.
// - padMemory is a Map kept in access order by hand (LinkedHashMap with
//   accessOrder). Each sample is also loaded into LiveAudioDeps under the same
//   key ("slot:name"), so a press sends only names to the audio thread.
// - Times are Deps.perfNow ms (System.nanoTime on Android).
// - Bluetooth's delay is pointed out when Live's output reports a slow
//   output (LiveAudioDeps.onSlowOutput): browsers don't tell where the sound
//   goes, so the output guesses from its own latency, and the toast is
//   WebText.LIVE_SLOW_OUTPUT. Toasts that say "on the phone" use WebText too.
// - A copy kept from the device list's Play (playDeviceSound) is written
//   without making the playback wait for the write.
// - The background copy reads each sound at most once a run, so a copy the
//   store refuses (quota) is not downloaded over and over.

import { openPak, type Pak } from '../core/backup/pak'
import { soundDetails, type SoundDetails } from '../core/features/deviceBrowser'
import { Keys } from '../core/features/keys'
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
import type { Deps } from './deps'
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

/** The key a pad's sample is kept under, in memory and in Live's output: "slot:name". */
export function memoryKey(slot: number, name: string): string {
  return `${slot}:${ktTrim(name).toLowerCase()}`
}

/** Live's voice id for a pad: "live:<group>:<offset>". */
export const padVoice = (pad: { readonly group: number; readonly offset: number }): string => `live:${pad.group}:${pad.offset}`
/** Live's voice id for a KEYS note: "note:<midi>". */
export const noteVoice = (note: number): string => `note:${note}`

/** A Live press let go of while its sound loaded for longer than this sounds only if no press came after it. */
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
  // Live's pad samples decoded and ready ("slot:name"), least recently played first.
  private readonly padMemory = new Map<string, PadAudio>()
  private padMemoryBytes = 0
  private preloadGen = 0
  // Bumped to end the copying loop (mirror closed, project changed).
  private cacheGen = 0
  // Live's pads and keys sound while held (a gate): the voices whose finger is still down.
  private readonly held = new Set<string>()
  // A sample on its way to memory for a press, by the same key: the presses that come
  // meanwhile (a glissando over the keys) wait for that one load.
  private readonly padLoads = new Map<string, Promise<{ key: string; audio: PadAudio } | null>>()
  // When the latest Live press (pad or key) was made, for the late-load rule in startHeld.
  private lastPressAt = 0
  // The device's project, pads and names as Live last read them, shown while it is not connected.
  private lastRead: LiveSnapshot | null = null
  private lastReadLoaded = false
  // Bluetooth's delay is pointed out once a run.
  private toldBluetooth = false

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
        if (this.padMemory.has(memoryKey(slot, name))) continue
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
    let pak = this.openPak?.id === b.id ? this.openPak.pak : null
    if (pak === null) {
      pak = await openPak(await this.host.deps.library.bytes(b.id))
      this.openPak = { id: b.id, pak }
    }
    return pak.sounds.get(slot)?.wav ?? null
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

  /** Closes it (Live left the screen). */
  closeAudio(): void {
    this.held.clear()
    this.host.deps.liveAudio.close()
  }

  /** Stops every Live voice (stopPlayback). */
  stopAll(): void {
    this.held.clear()
    this.host.deps.liveAudio.stopAll()
  }

  /** A voice was heard: how long after the press, in the debug log. */
  onStarted(id: string, latencyMs: number, route: string): void {
    this.host.deps.trafficLog.note(MirrorText.latencyNote(id, latencyMs, route))
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
   */
  playPad(pad: PhysicalPad, hold = true): Promise<void> {
    const { host } = this
    host.deps.liveAudio.resumeInGesture()
    const pressedAt = host.deps.perfNow()
    this.lastPressAt = pressedAt
    const id = padVoice(pad)
    if (hold) this.held.add(id)
    const token = host.playToken()
    // The pad tapped is also the sound KEYS plays.
    this.selectKeysPad(pad)
    // In memory: plays now, without waiting a turn.
    const sample = this.padSample(pad)
    const mem = sample ? this.fromMemory(memoryKey(sample.slot, sample.name)) : null
    if (sample && mem) {
      this.startHeld(id, hold, memoryKey(sample.slot, sample.name), mem, 0, pressedAt)
      return Promise.resolve()
    }
    return (async () => {
      const got = await this.padAudio(pad)
      if (got !== null && token === host.playToken()) this.startHeld(id, hold, got.key, got.audio, 0, pressedAt)
    })()
  }

  /** The finger left the pad: its sound fades out. */
  releasePad(pad: { readonly group: number; readonly offset: number }): void {
    this.release(padVoice(pad))
  }

  /**
   * Plays [note] on the KEYS sound, repitched to it as it is mixed, until
   * [releaseNote] (or to the end, with [hold] false). The grid's keys and the
   * piano's both play by note. Call from the press.
   */
  playNote(note: number, hold = true): Promise<void> {
    const { host } = this
    host.deps.liveAudio.resumeInGesture()
    const pressedAt = host.deps.perfNow()
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
      this.startHeld(id, hold, memoryKey(sample.slot, sample.name), mem, pitch, pressedAt)
      return Promise.resolve()
    }
    return (async () => {
      const got = await this.padAudio(pad)
      if (got !== null && token === host.playToken()) this.startHeld(id, hold, got.key, got.audio, pitch, pressedAt)
    })()
  }

  /** The finger left the note: it fades out. */
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
   */
  private startHeld(id: string, hold: boolean, key: string, a: PadAudio, semitones: number, pressedAt: number): void {
    const { host } = this
    const out = host.deps.liveAudio
    const lifted = hold && !this.held.has(id)
    if (lifted && pressedAt !== this.lastPressAt && host.deps.perfNow() - pressedAt > LATE_LOAD_MS) return
    if (a.silent) {
      host.toastOnce(FeatureText.SILENT_SOUND)
      return
    }
    if (!out.has(key)) out.preload(key, a.pcm, a.channels, a.sampleRate)
    if (!out.press(id, key, { pitch: semitones, gate: hold, pressedAt })) {
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
