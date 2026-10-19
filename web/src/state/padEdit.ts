// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (EDIT: a pad's sound settings;
// PadEditState, openPadEdit, closePadEdit, adjustPad, writePadSettings, padsRead,
// forgetPadSettings, load/saveOfflinePadSettings, and the settings' part of
// offerOfflinePads / writeOfflinePadsNow)
//
// What arc knows of the pads' SOUND EDIT settings (an addition): those of
// Live's project, read with its pads, the ones turned since, and EDIT's sheet
// on one pad: shown at once, read from the device, turned, and written once
// the turning rests. Offline the turns are kept in arc until the EP-133
// connects.
//
// Web deltas:
// - The offline settings are a localStorage key (Deps.offlinePadSettings),
//   not files/live-pad-settings.json.
// - The device is waited for (busy) before each read and write, as Kotlin's
//   exclusive(wait = true).
// - Kotlin's data-class equality is [sameSettings].

import { signal, type ReadonlySignal, type Signal } from '@preact/signals'
import type { PadTarget } from '../core/features/liveMirror'
import { OfflinePadSettings, type OfflinePadSetting } from '../core/features/offlinePadSettings'
import type { PhysicalPad } from '../core/features/padNotes'
import { PadSettings } from '../core/features/padSettings'
import { peaks as trimPeaks } from '../core/features/sampleEdit'
import type { Peak } from '../core/features/sampleTrim'
import type { ProjectLayout } from '../core/features/deviceBrowser'
import { readPad, writePadSettings } from '../core/protocol/device'
import type { Session } from '../core/protocol/session'
import { MirrorText } from '../core/text/mirrorText'
import type { OfflinePadsDeps } from './deps'
import type { PadAudio } from './live'
import type { Store } from './store'
import { errorText, type Tasks } from './tasks'
import type { UiState } from './types'

/** EDIT's knobs: their turning rests this long before the pad's settings are written. */
export const PAD_WRITE_DELAY_MS = 150

/** TRIM's waveform: this many columns of peaks. */
export const TRIM_COLUMNS = 96

/**
 * EDIT's sheet on [pad] (its [target]): the [settings] shown, and [base],
 * what the first offline turn started from; the sound's [frames],
 * [sampleRate] and [peaks] for TRIM (null until it loads); [reading] the
 * device, [offline] (kept in arc), or [failed] (no answer: nothing to turn).
 */
export interface PadEditState {
  readonly pad: PhysicalPad
  readonly target: PadTarget
  readonly settings: PadSettings
  readonly base: PadSettings
  readonly frames: number | null
  readonly sampleRate: number
  readonly peaks: readonly Peak[] | null
  readonly reading: boolean
  readonly offline: boolean
  readonly failed: boolean
}

/** Kotlin's PadSettings equality. */
export function sameSettings(a: PadSettings, b: PadSettings): boolean {
  if (a === b) return true
  return (Object.keys(a) as (keyof PadSettings)[]).every((k) => a[k] === b[k])
}

const keyOf = (project: number, group: number, pad: number): string => OfflinePadSettings.padKey(project, group, pad)
const targetKey = (t: PadTarget): string => keyOf(t.project, t.group, t.pad)

export interface PadEditHost {
  store: Store<UiState>
  tasks: Pick<Tasks, 'exclusive'>
  session(): Session | null
  /** Connected and read: turns go on the device; otherwise they are kept in arc. */
  connected(): boolean
  /** [pad]'s sound, for TRIM (null when it can't be had). */
  padAudio(pad: PhysicalPad): Promise<{ readonly audio: PadAudio } | null>
  /** Where the offline turns are kept. */
  prefs: OfflinePadsDeps
  toast(text: string, error?: boolean): void
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  /** The pads' settings changed: the pattern plays them so from its next note. */
  changed(): void
}

export class PadEditDesk {
  // The settings arc knows, by keyOf(project, group, pad), and what the device has (a failed write goes back to it).
  private settings = new Map<string, PadSettings>()
  private readonly saved = new Map<string, PadSettings>()
  private readonly _edit: Signal<PadEditState | null> = signal(null)
  /** EDIT's sheet on a pad, null while none is open. */
  readonly edit: ReadonlySignal<PadEditState | null> = this._edit
  private openGen = 0
  // The newest turn not written yet, and the writer putting turns on the device.
  private pending: { readonly t: PadTarget; readonly s: PadSettings; readonly frames: number | null } | null = null
  private writer: Promise<void> | null = null
  private offline: OfflinePadSettings | null = null

  constructor(private readonly host: PadEditHost) {}

  /** [t]'s pad's settings as arc knows them, null when unknown. */
  settingsOf(t: PadTarget | null): PadSettings | null {
    return t === null ? null : (this.settings.get(targetKey(t)) ?? null)
  }

  /**
   * EDIT's sheet opened on [pad] ([t] from editTarget): its settings show at
   * once as arc knows them, its sound loads for TRIM's length and waveform,
   * and, connected, the EP-133 is asked for the pad's own (it may have been
   * turned on the device since). Offline they are arc's own, kept until the
   * device connects. An empty pad has nothing to set.
   */
  open(pad: PhysicalPad, t: PadTarget): void {
    const gen = ++this.openGen
    const slot = t.slot
    if (slot === null) {
      this._edit.value = null
      return
    }
    const offline = !this.host.connected()
    const key = targetKey(t)
    const known = this.settings.get(key) ?? null
    const shown = known ?? PadSettings.DEFAULT
    this._edit.value = { pad, target: t, settings: shown, base: shown, frames: null, sampleRate: 46875, peaks: null, reading: !offline, offline, failed: false }
    const update = (f: (e: PadEditState) => PadEditState): void => {
      const e = this._edit.peek()
      if (gen === this.openGen && e !== null && targetKey(e.target) === key) this._edit.value = f(e)
    }
    // The sound loads beside the read: only TRIM waits for it.
    void this.host.padAudio(pad).then((a) => {
      if (a === null) return
      const frames = Math.floor(a.audio.pcm.length / a.audio.channels)
      const peaks = trimPeaks(a.audio.pcm, a.audio.channels, TRIM_COLUMNS)
      update((e) => ({ ...e, frames, sampleRate: a.audio.sampleRate, peaks }))
    })
    if (offline) {
      void this.loadOffline().then((o) => {
        // The base is what the first offline turn started from, kept with the change.
        const kept = OfflinePadSettings.at(o, t.project, t.group, t.pad)
        if (kept === null || kept.slot !== slot) return
        this.settings.set(key, kept.settings)
        update((e) => ({ ...e, settings: kept.settings, base: kept.base }))
      })
      return
    }
    void (async () => {
      const meta = await this.device((s) => readPad(s, t.project, t.group, t.pad))
      if (gen !== this.openGen) return
      // A turn made while it read is newer than what was read.
      const turned = this.pending !== null && targetKey(this.pending.t) === key
      if (meta === null && !turned) {
        // No answer: nothing to turn from but guesses, which a write would put over the pad.
        this.host.toast(MirrorText.PAD_READ_FAILED, true)
        update((e) => ({ ...e, reading: false, failed: true }))
        return
      }
      // Keys the metadata lacks keep what the pad record says.
      const read = meta !== null && PadSettings.written(meta) ? PadSettings.fromMeta(meta, known ?? PadSettings.DEFAULT) : null
      const settings = turned ? (this.settings.get(key) ?? null) : (read ?? known)
      if (!turned && (read ?? known) !== null) this.saved.set(key, (read ?? known)!)
      if (settings !== null) this.settings.set(key, settings)
      update((e) => ({ ...e, settings: settings ?? e.settings, base: settings ?? e.base, reading: false }))
      if (settings !== null && (known === null || !sameSettings(settings, known))) this.host.changed()
    })()
  }

  /** EDIT's sheet closed: a turn not yet written still goes on the device. */
  close(): void {
    this.openGen++
    this._edit.value = null
  }

  /**
   * A knob turned on the open pad sheet: the pad plays with [settings] on
   * the phone at once, and they go on the EP-133 once the turning rests
   * (PAD_WRITE_DELAY_MS), the newest only; offline they are kept in arc.
   */
  adjust(settings: PadSettings): void {
    const e = this._edit.peek()
    if (e === null || e.reading || e.failed) return
    const v = PadSettings.clamped(settings, e.frames)
    if (sameSettings(v, e.settings)) return
    const key = targetKey(e.target)
    this.settings.set(key, v)
    this._edit.value = { ...e, settings: v }
    // A pattern playing the pad plays it so from its next note.
    this.host.changed()
    const t = e.target
    if (e.offline) {
      const slot = t.slot
      if (slot === null) return
      const change: OfflinePadSetting = { project: t.project, group: t.group, pad: t.pad, slot, settings: v, base: e.base, frames: e.frames }
      void this.loadOffline().then((o) => this.saveOffline(OfflinePadSettings.put(o, change)))
      return
    }
    this.pending = { t, s: v, frames: e.frames }
    if (this.writer !== null) return
    this.writer = (async () => {
      await new Promise<void>((done) => this.host.setTimeout(done, PAD_WRITE_DELAY_MS))
      for (let p = this.pending; p !== null; p = this.pending) {
        this.pending = null
        await this.write(p.t, p.s, p.frames)
      }
      this.writer = null
    })()
  }

  /** Resolves once the turns made so far are written (or failed). */
  async flushed(): Promise<void> {
    while (this.writer !== null) await this.writer
  }

  /**
   * Puts [settings] on [t]'s pad, the whole record (a part could make the
   * device take the rest from the sample again). A failure says why, and
   * (with [revert]) the pad goes back to the settings last written or read.
   */
  private async write(t: PadTarget, settings: PadSettings, frames: number | null, revert = true): Promise<boolean> {
    const slot = t.slot
    if (slot === null) return false
    let error: string | null = null
    const ok = await this.device(async (s) => {
      try {
        await writePadSettings(s, t.project, t.group, t.pad, slot, settings, frames)
        return true
      } catch (e) {
        error = errorText(e)
        return false
      }
    })
    const key = targetKey(t)
    if (ok === true) {
      this.saved.set(key, settings)
      return true
    }
    this.host.toast(error !== null ? MirrorText.padSettingsFailed(error) : MirrorText.EDIT_OFFLINE, true)
    // Back to what the device has, unless a newer turn is on its way (or nothing is known of it).
    const back = this.saved.get(key)
    if (revert && back !== undefined && !(this.pending !== null && targetKey(this.pending.t) === key)) {
      this.settings.set(key, back)
      const e = this._edit.peek()
      if (e !== null && targetKey(e.target) === key) this._edit.value = { ...e, settings: back }
      this.host.changed()
    }
    return false
  }

  /** [block] on the device once it is free (a read or write waits its turn); null without a session or after an error. */
  private async device<T>(block: (s: Session) => Promise<T>): Promise<T | null> {
    const { store } = this.host
    if (this.host.session() === null) return null
    await store.waitFor((st) => !st.busy)
    return this.host.tasks.exclusive('pad', true, block)
  }

  /**
   * The EP-133's [project] read ([layout]): arc's settings for its pads
   * start again from what its pad records hold (they may have been turned on
   * the device); a pad's sheet still asks the device for its own.
   */
  padsRead(project: number | null, layout: ProjectLayout | null): void {
    this.saved.clear()
    const next = new Map<string, PadSettings>()
    if (project !== null && layout?.settings) {
      for (const [k, v] of layout.settings) {
        const [letter, pad] = k.split('\u0000')
        const g = letter !== undefined && letter.length === 1 ? letter.charCodeAt(0) - 97 : -1
        const n = Number(pad)
        if (g >= 0 && g < 4 && Number.isInteger(n)) next.set(keyOf(project, g, n), v)
      }
    }
    this.settings = next
    // What the records hold is what the device has, until a read or write says otherwise.
    for (const [k, v] of next) this.saved.set(k, v)
    this.host.changed()
  }

  /** Live without the device: the pads play with the settings turned offline. */
  async padsOffline(): Promise<void> {
    const o = await this.loadOffline()
    this.settings = OfflinePadSettings.byPad(o)
    this.saved.clear()
    this.host.changed()
  }

  /** [t]'s pad got another sound: the device takes its settings from the sample again, and so does arc. */
  forget(t: PadTarget): void {
    const key = targetKey(t)
    const had = this.settings.delete(key)
    this.saved.delete(key)
    if (this.offline !== null && OfflinePadSettings.at(this.offline, t.project, t.group, t.pad) !== null) {
      this.saveOffline(OfflinePadSettings.drop(this.offline, t.project, t.group, t.pad))
    }
    if (had) this.host.changed()
  }

  // ---------- offline ----------

  /** The settings turned offline, read once (none when missing or unreadable). */
  async loadOffline(): Promise<OfflinePadSettings> {
    if (this.offline !== null) return this.offline
    let read: OfflinePadSettings | null = null
    try {
      const json = await this.host.prefs.load()
      read = json === null ? null : OfflinePadSettings.fromJson(json)
    } catch {
      read = null
    }
    if (this.offline === null) this.offline = read ?? OfflinePadSettings.EMPTY
    return this.offline
  }

  /** Keeps [s] as the settings turned offline; none removes them. */
  saveOffline(s: OfflinePadSettings): void {
    this.offline = s
    void Promise.resolve(this.host.prefs.save(OfflinePadSettings.size(s) === 0 ? null : OfflinePadSettings.toJson(s))).catch(() => undefined)
  }

  /** How many pads were turned offline. */
  async offlineCount(): Promise<number> {
    return OfflinePadSettings.size(await this.loadOffline())
  }

  /**
   * The settings turned offline go on [s]'s device, on the pads of the
   * project they were turned in ([active]) that still hold the sound they
   * were turned for ([slotAt]): only what was turned changes, the rest is
   * the device's now. Those it can't put on are skipped; the connection
   * going keeps the rest ([lost]).
   */
  async writeOffline(s: Session, active: number | null, slotAt: (group: number, pad: number) => number | null): Promise<{ written: number; skipped: number; lost: boolean }> {
    const turned = (await this.loadOffline()).list
    let written = 0
    let skipped = 0
    for (const [i, p] of turned.entries()) {
      const slot = slotAt(p.group, p.pad)
      if (active !== p.project || slot === null || slot !== p.slot) {
        skipped++
        continue
      }
      const t: PadTarget = { project: p.project, group: p.group, pad: p.pad, slot }
      const key = targetKey(t)
      const meta = this.host.session() === s ? await this.device((ss) => readPad(ss, t.project, t.group, t.pad)) : null
      if (meta === null) {
        if (this.host.session() !== s) {
          this.saveOffline({ list: turned.slice(i) })
          return { written, skipped, lost: true }
        }
        skipped++
        continue
      }
      const record = this.settings.get(key) ?? PadSettings.DEFAULT
      const now = PadSettings.written(meta) ? PadSettings.fromMeta(meta, record) : record
      const merged = PadSettings.mergedOnto(p.settings, p.base, now)
      if (await this.write(t, merged, p.frames, false)) {
        written++
        this.settings.set(key, merged)
      } else if (this.host.session() !== s) {
        this.saveOffline({ list: turned.slice(i) })
        return { written, skipped, lost: true }
      } else {
        skipped++
      }
    }
    this.saveOffline(OfflinePadSettings.EMPTY)
    if (written > 0) this.host.changed()
    return { written, skipped, lost: false }
  }
}
