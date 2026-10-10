// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (live mirror: openMirror … saveLearned, :615-758)
//
// Starts the live mirror: reads the sound names, the active project and its
// pads (the reads the browser already makes), then only listens to MIDI and
// pad pushes. Nothing is sent while it runs (Live's EDIT writes through the
// controller, then tells the mirror: [assigned]).
//
// Web deltas:
// - Times are ms on the MIDI event clock (deps.perfNow = performance.now),
//   where Android uses System.nanoTime.
// - `_state.first { !busy || mirror == null }` is store.waitFor.
// - No 33 ms publishing loop: a note or pad push marks the mirror changed and
//   it publishes at the next display frame (host.requestFrame, else a short
//   timer), once however many events came; an idle mirror does nothing. The
//   time-based changes the loop caught (a faded pad dropped, a tempo gone
//   stale) get one timer for the soonest of them. StateFlow drops an equal
//   state; here [sameMirrorState] does, so a clock tick with the same tempo
//   redraws nothing.
// - SharedPreferences "mirror" is MirrorPrefs (localStorage arc.mirror.*).
// - Live's sounds and last read (openOfflineMirror, saveLastRead,
//   preloadPads, copyPadSounds, forgetPadMemory) live in live.ts; the
//   mirror calls them at the same points ArcController does.
// - [openOffline] has a generation token: an offline open still loading the
//   last read gives way to any later open or stop.
// - Offline pad changes (an addition): [openOffline] puts them over the last
//   read (LiveMirror.setLocal) with the sounds offered offline, [refreshOffline]
//   follows the library, [localChanged] shows a change; a good read tells the
//   host ([MirrorHost.deviceRead]), which asks whether to write them.

import { getMetadata, isJsonObject, type JsonValue } from '../core/protocol/fs'
import { PROJECTS_NODE, projectOfActive, type SoundEntry } from '../core/protocol/device'
import type { Session } from '../core/protocol/session'
import { contents, projectLayout } from '../core/features/deviceBrowser'
import { LearnedLinks } from '../core/features/learnedLinks'
import { CLOCK_TIMEOUT_MS, FADE_MS, LiveMirror, type Hit, type MirrorState, type PadLight, type PadTarget } from '../core/features/liveMirror'
import type { PhysicalPad } from '../core/features/padNotes'
import { SoundSource } from '../core/features/offlinePads'
import { parse as parsePadPush, type PadOrder } from '../core/features/padPush'
import type { PadGroup } from '../core/features/projectPads'
import { MirrorText } from '../core/text/mirrorText'
import { SettingsText } from '../core/text/settingsText'
import type { MirrorPrefs } from '../platform/storage/settings'
import type { LiveEvents } from './connection'
import type { LiveSounds } from './live'
import type { Store } from './store'
import type { Tasks } from './tasks'
import { emptyMirrorState, type MirrorUi, type UiState } from './types'

/** Where the host has no frame clock: a change is published after about one frame. */
export const MIRROR_FRAME_MS = 16
/** How many times the initial read is tried while the device is busy or the read fails. */
export const MIRROR_READ_TRIES = 5

export interface MirrorHost {
  store: Store<UiState>
  prefs: MirrorPrefs
  tasks: Pick<Tasks, 'exclusive'>
  session(): Session | null
  liveEvents(): LiveEvents | null
  /** The MIDI event clock, ms. */
  perfNow(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  /** Runs [fn] at the display's next frame; returns a cancel (Deps.requestFrame). Absent: a short timer. */
  requestFrame?: ((fn: () => void) => () => void) | undefined
  /** library.syncIndex(), fire and forget. */
  syncIndex(): void
  toast(text: string, error?: boolean): void
  /** Live's sounds and last read. */
  live: LiveSounds
  /** "5 Oct, 14:02" for the offline line. */
  fmtDateTime(ms: number): string
  /** The EP-133 started ([playing]) or stopped (MIDI Start/Continue, Stop): TAKE follows it. */
  transport?(playing: boolean): void
  /** The device's sounds and pads were read: offline pad changes kept may be written now. */
  deviceRead(): void
}

/** The project an "active" value names: device.projectOfActive, kept under this name for its callers. */
export const activeProject = projectOfActive

function sameLight(a: PadLight, b: PadLight): boolean {
  return a.velocity === b.velocity && a.channel === b.channel && a.onAt === b.onAt && a.offAt === b.offAt
}

function samePad(a: PhysicalPad | null, b: PhysicalPad | null): boolean {
  if (a === null || b === null) return a === b
  return a.group === b.group && a.offset === b.offset
}

function sameHit(a: Hit | null, b: Hit | null): boolean {
  if (a === null || b === null) return a === b
  return (
    samePad(a.pad, b.pad) &&
    a.note === b.note &&
    a.channel === b.channel &&
    a.velocity === b.velocity &&
    a.slot === b.slot &&
    a.name === b.name
  )
}

function sameMap<V>(a: ReadonlyMap<number, V>, b: ReadonlyMap<number, V>, eq: (x: V, y: V) => boolean): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    const w = b.get(k)
    if (w === undefined || !eq(v, w)) return false
  }
  return true
}

/**
 * Tempos are equal when they read the same on screen (MirrorText.bpm, one
 * decimal): the clock estimate wobbles in the hundredths on every tick, which
 * would otherwise redraw (and re-announce the live display line) ~30 times a second.
 */
export function sameBpm(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return a.toFixed(1) === b.toFixed(1)
}

/** MirrorState data-class equality (what lets StateFlow drop an unchanged state), tempo at display precision. */
export function sameMirrorState(a: MirrorState, b: MirrorState): boolean {
  return (
    a.lastKeysNote === b.lastKeysNote &&
    a.playing === b.playing &&
    sameBpm(a.bpm, b.bpm) &&
    a.activeProject === b.activeProject &&
    a.pushesSeen === b.pushesSeen &&
    a.padOrder === b.padOrder &&
    sameHit(a.lastHit, b.lastHit) &&
    sameMap(a.pads, b.pads, sameLight) &&
    sameMap(a.keysHeld, b.keysHeld, (x, y) => x === y) &&
    sameMap(a.learned, b.learned, (x, y) => x === y) &&
    a.lastNote === b.lastNote &&
    sameMap(a.notes, b.notes, sameLight)
  )
}

export class MirrorController {
  private mirror: LiveMirror | null = null
  private mirrorSession: Session | null = null
  private unlisten: (() => void) | null = null
  private pushOff: (() => void) | null = null
  /** The publish waiting for the next frame (its cancel), or null. */
  private frame: (() => void) | null = null
  /** The publish for the soonest time-based change (a fade over, a tempo gone stale), or null. */
  private settle: unknown = null
  private openGen = 0

  constructor(private readonly host: MirrorHost) {}

  /** Whether the mirror listens right now (connected or offline). */
  get running(): boolean {
    return this.mirror !== null
  }

  /** The mirror Live shows, connected or offline. */
  get current(): LiveMirror | null {
    return this.mirror
  }

  /** The mirror showing the last read without the device, if that is what Live shows. */
  get offline(): LiveMirror | null {
    return this.mirrorSession === null ? this.mirror : null
  }

  /** Sets mirror.state to the snapshot, unless it equals the one shown. */
  private publish(m: LiveMirror, patch: Partial<MirrorUi> = {}): void {
    const now = this.host.perfNow()
    const st = m.snapshot(now)
    this.host.store.update((cur) => {
      const mi = cur.mirror
      if (!mi) return cur
      const state = sameMirrorState(mi.state, st) ? mi.state : st
      const next: MirrorUi = { ...mi, state, ...patch }
      if (next.state === mi.state && next.loading === mi.loading && next.error === mi.error && next.offline === mi.offline) return cur
      return { ...cur, mirror: next }
    })
    if (this.mirror === m) this.settleLater(m, st, now)
  }

  /** A note or push came in: [m] publishes at the next frame, once however many come before it. */
  private changed(m: LiveMirror): void {
    if (this.frame !== null || this.mirror !== m) return
    const { host } = this
    const run = (): void => {
      this.frame = null
      if (this.mirror === m) this.publish(m)
    }
    if (host.requestFrame) {
      this.frame = host.requestFrame(run)
    } else {
      const t = host.setTimeout(run, MIRROR_FRAME_MS)
      this.frame = () => host.clearTimeout(t)
    }
  }

  /**
   * What the old publishing loop caught without any event: a released pad
   * or note dropped once faded, a tempo cleared once the clock stopped. One
   * timer for the soonest of them in [st] (taken at [now]).
   */
  private settleLater(m: LiveMirror, st: MirrorState, now: number): void {
    const { host } = this
    if (this.settle !== null) host.clearTimeout(this.settle)
    this.settle = null
    let at = Number.POSITIVE_INFINITY
    for (const l of st.pads.values()) if (l.offAt !== null) at = Math.min(at, l.offAt + FADE_MS)
    for (const l of st.notes.values()) if (l.offAt !== null) at = Math.min(at, l.offAt + FADE_MS)
    if (st.bpm !== null) at = Math.min(at, now + CLOCK_TIMEOUT_MS)
    if (at === Number.POSITIVE_INFINITY) return
    // Just past the moment, as snapshot drops what is strictly older.
    this.settle = host.setTimeout(() => {
      this.settle = null
      if (this.mirror === m) this.publish(m)
    }, Math.max(0, at - now) + 1)
  }

  async open(): Promise<void> {
    const { host } = this
    // Already running for this connection (opened twice): keep it.
    if (this.mirror !== null && this.mirrorSession !== null && this.mirrorSession === host.session()) return
    this.stop()
    const s = host.session()
    const events = host.liveEvents()
    // Not connected (or still connecting): the last read, if there is one.
    if (s === null || events === null || host.store.get().device === null) {
      await this.openOffline()
      return
    }
    const m = new LiveMirror(host.prefs.loadLearned(), host.prefs.savedPadOrder(), (learned) => this.saveLearned(learned))
    this.mirror = m
    this.mirrorSession = s
    host.store.update((st) => ({ ...st, mirror: { state: m.snapshot(host.perfNow()), loading: true, error: null, offline: null } }))
    // Listen first, so nothing played while reading is missed.
    // Each event is shown at the next frame, at most once a frame.
    this.unlisten = events((e) => {
      m.onMidi(e)
      // An armed take starts with the device's PLAY, and one it started ends with its STOP.
      if (e.type === 'Start' || e.type === 'Continue') host.transport?.(true)
      else if (e.type === 'Stop') host.transport?.(false)
      this.changed(m)
    })
    this.pushOff = s.onPush((f) => {
      const fid = parsePadPush(f)
      if (!fid) return
      m.onPadPush(fid, host.perfNow())
      this.changed(m)
      // Another project on the device: read its pads.
      if (fid.project !== m.snapshot(host.perfNow()).activeProject) this.loadProject(m, fid.project)
    })
    // The names and pads are read once. If the device is busy (a transfer, or the
    // read of a mirror opened just before), wait for it rather than give up.
    // exclusive() also gives null when the read fails (the error is shown), so a few tries at most.
    let ok: boolean | null = null
    let tries = 0
    while (this.mirror === m && ok === null && host.session() === s && tries++ < MIRROR_READ_TRIES) {
      await host.store.waitFor((st) => !st.busy || st.mirror === null)
      if (this.mirror !== m) break
      ok = await host.tasks.exclusive('mirror', tries > 1, async (ss) => {
        const c = await contents(ss)
        host.live.setDeviceSounds(c.sounds)
        m.setNames(new Map(c.sounds.map((snd) => [snd.slot, snd.name])))
        let active: JsonValue | undefined
        try {
          const meta = await getMetadata(ss, PROJECTS_NODE)
          active = isJsonObject(meta) ? meta['active'] : undefined
        } catch {
          active = undefined
        }
        const project = activeProject(active)
        let groups: PadGroup[] = []
        if (project !== null) {
          try {
            groups = (await projectLayout(ss, project)).pads
          } catch {
            groups = []
          }
        }
        m.setProject(project, groups)
        return true
      })
    }
    if (this.mirror === m) {
      if (ok === true) {
        host.deviceRead()
        host.live.saveLastRead(m)
        void host.live.preloadPads(m)
        void host.live.copyPadSounds(m, s)
      }
      this.publish(m, { loading: false })
    }
  }

  /**
   * Live without the device: the pads and sample names of the last read
   * (before any, the factory sounds' first project), marked offline. Nothing
   * lights, as nothing is listened to.
   */
  async openOffline(): Promise<void> {
    const { host } = this
    this.stop()
    const gen = this.openGen
    const lastRead = await host.live.loadLastRead()
    // Never read: the factory sounds, if the library has them.
    const snap = lastRead ?? (await host.live.factorySnapshot())
    if (gen !== this.openGen) return
    if (snap === null || (host.session() !== null && host.store.get().device !== null)) {
      if (snap === null) host.store.update((st) => ({ ...st, mirror: this.notConnected() }))
      return
    }
    // The pad changes made offline go over it, and the sounds offered without the device beside it.
    const pads = await host.live.loadOfflinePads()
    const offlineSounds = await host.live.offlineSounds(lastRead !== null ? SoundSource.DEVICE : SoundSource.FACTORY, lastRead)
    if (gen !== this.openGen) return
    if (host.session() !== null && host.store.get().device !== null) return
    // Nothing can be learned without the device: pads unlearned are numbered from the top, and nothing is saved.
    const m = new LiveMirror(LearnedLinks.offline(host.prefs.loadLearned()), host.prefs.savedPadOrder(), () => {})
    m.load(snap)
    m.setLocal(pads)
    this.mirror = m
    this.mirrorSession = null
    void host.live.preloadPads(m)
    const offline = lastRead !== null ? MirrorText.lastSeen(host.fmtDateTime(lastRead.savedAt)) : MirrorText.FACTORY
    host.store.update((st) => ({
      ...st,
      mirror: { state: m.snapshot(host.perfNow()), loading: false, error: null, offline, offlineSounds },
    }))
  }

  /**
   * The library changed while Live shows the last read without the device:
   * the sounds it offers follow (a factory pack saved or deleted, a backup
   * that has a sound arc couldn't play).
   */
  async refreshOffline(): Promise<void> {
    const { host } = this
    const m = this.offline
    if (m === null) return
    const gen = this.openGen
    const lastRead = await host.live.loadLastRead()
    const base = host.store.get().mirror?.offlineSounds?.base ?? (lastRead !== null ? SoundSource.DEVICE : SoundSource.FACTORY)
    const offlineSounds = await host.live.offlineSounds(base, base === SoundSource.DEVICE ? lastRead : null)
    if (gen !== this.openGen || this.mirror !== m) return
    host.store.update((st) => (st.mirror ? { ...st, mirror: { ...st.mirror, offlineSounds } } : st))
  }

  /**
   * An offline pad change was made or dropped (already set on the mirror):
   * Live shows it, and the pads' sounds are loaded again.
   */
  localChanged(): void {
    const m = this.mirror
    if (!m) return
    void this.host.live.preloadPads(m)
    this.publish(m)
    // The names are read through mirrorName: a new MirrorUi re-renders Live even when the state didn't change.
    this.host.store.update((cur) => (cur.mirror ? { ...cur, mirror: { ...cur.mirror } } : cur))
  }

  private loadProject(m: LiveMirror, project: number): void {
    void (async () => {
      const groups = await this.host.tasks.exclusive('mirror', true, async (ss) => (await projectLayout(ss, project)).pads)
      if (groups === null) return
      if (this.mirror === m) {
        m.setProject(project, groups)
        this.host.live.saveLastRead(m)
        void this.host.live.preloadPads(m)
        const s = this.host.session()
        if (s !== null) void this.host.live.copyPadSounds(m, s)
        this.publish(m)
      }
    })()
  }

  /**
   * Live's EDIT put [slot] on [t]'s pad (or the old one back): the mirror's
   * names and the saved read follow at once, and the pad's sample is read
   * into memory for the next press.
   */
  assigned(t: PadTarget, slot: number | null): void {
    const m = this.mirror
    if (!m) return
    m.assigned(t, slot)
    this.host.live.saveLastRead(m)
    void this.host.live.preloadPads(m)
    const s = this.host.session()
    if (s !== null && this.mirrorSession === s) void this.host.live.copyPadSounds(m, s)
    this.publish(m)
    // The names are read through mirrorName: a new MirrorUi re-renders Live even when the state didn't change.
    this.host.store.update((cur) => (cur.mirror ? { ...cur, mirror: { ...cur.mirror } } : cur))
  }

  /**
   * The device's sound list read again (after an upload, say): Live's names
   * and copies follow, for a mirror of [s]'s connection (the Kotlin
   * setLiveSounds after an upload; here for every read of the list).
   */
  setSounds(s: Session, sounds: readonly SoundEntry[]): void {
    const m = this.mirror
    if (m === null || this.mirrorSession !== s) return
    this.host.live.setDeviceSounds(sounds)
    m.setNames(new Map(sounds.map((snd) => [snd.slot, snd.name])))
    // The names are read through mirrorName: a new MirrorUi re-renders Live.
    this.host.store.update((cur) => (cur.mirror ? { ...cur, mirror: { ...cur.mirror } } : cur))
  }

  /** The sample on a pad in the mirror, once it is known. */
  mirrorName(pad: { readonly group: number; readonly offset: number }): string | null {
    return this.mirror?.nameOf(pad) ?? null
  }

  setPadOrder(order: PadOrder): void {
    this.host.prefs.setPadOrder(order)
    this.host.syncIndex()
    const m = this.mirror
    if (m) {
      m.setPadOrder(order)
      this.publish(m)
    } else {
      // Not connected: still show the choice.
      this.host.store.update((cur) =>
        cur.mirror ? { ...cur, mirror: { ...cur.mirror, state: { ...cur.mirror.state, padOrder: order } } } : cur,
      )
    }
  }

  /** Stops listening while the app is in the background; the screen keeps its last state. */
  pause(): void {
    this.stop()
  }

  /** The pad order Live uses (for the settings page). */
  padOrder(): PadOrder {
    return this.mirror?.snapshot(this.host.perfNow()).padOrder ?? this.host.prefs.savedPadOrder()
  }

  notConnected(): MirrorUi {
    return { state: emptyMirrorState(this.host.prefs.savedPadOrder()), loading: false, error: MirrorText.NOT_CONNECTED, offline: null }
  }

  close(): void {
    this.stop()
    this.host.live.forgetPadMemory()
    // When each copy was last played, kept for choosing what to drop when the copies fill up.
    this.host.live.flush()
    this.host.store.update((st) => ({ ...st, mirror: null }))
  }

  stop(): void {
    this.openGen++
    this.host.live.stopCopy()
    this.frame?.()
    this.frame = null
    if (this.settle !== null) this.host.clearTimeout(this.settle)
    this.settle = null
    this.unlisten?.()
    this.unlisten = null
    this.pushOff?.()
    this.pushOff = null
    this.mirror = null
    this.mirrorSession = null
  }

  /** Forgets which pad is which in Live (names are learned again as pads are pressed). */
  forgetLearned(): void {
    const m = this.mirror
    if (m) {
      m.forgetLearned()
      this.publish(m)
    }
    this.host.prefs.forgetLearned()
    this.host.syncIndex()
    this.host.toast(SettingsText.FORGOTTEN)
  }

  /** Learned pad links, "offset:pad" pairs: the keypad's numbering is the same in every project. */
  private saveLearned(learned: ReadonlyMap<number, number>): void {
    this.host.prefs.saveLearned(learned)
    this.host.syncIndex()
  }
}
