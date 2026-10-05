// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (live mirror: openMirror … saveLearned, :615-758)
//
// Starts the live mirror: reads the sound names, the active project and its
// pads (the reads the browser already makes), then only listens to MIDI and
// pad pushes. Nothing is sent while it runs.
//
// Web deltas:
// - Times are ms on the MIDI event clock (deps.perfNow = performance.now),
//   where Android uses System.nanoTime.
// - `_state.first { !busy || mirror == null }` is store.waitFor.
// - The 33 ms publishing loop is a setTimeout chain; it only runs while the
//   mirror runs, which the controller limits to a visible tab (repeatOnLifecycle(STARTED)).
//   StateFlow drops an equal state; here [sameMirrorState] does, so an idle
//   mirror does not redraw 30 times a second.
// - SharedPreferences "mirror" is MirrorPrefs (localStorage arc.mirror.*).

import { getMetadata, isJsonObject, type JsonValue } from '../core/protocol/fs'
import { PROJECTS_NODE, projectFromNode } from '../core/protocol/device'
import type { Session } from '../core/protocol/session'
import { contents, projectLayout } from '../core/features/deviceBrowser'
import { LiveMirror, type Hit, type MirrorState, type PadLight } from '../core/features/liveMirror'
import type { PhysicalPad } from '../core/features/padNotes'
import { parse as parsePadPush, type PadOrder } from '../core/features/padPush'
import type { PadGroup } from '../core/features/projectPads'
import { MirrorText } from '../core/text/mirrorText'
import { SettingsText } from '../core/text/settingsText'
import type { MirrorPrefs } from '../platform/storage/settings'
import type { LiveEvents } from './connection'
import type { Store } from './store'
import type { Tasks } from './tasks'
import { emptyMirrorState, type MirrorUi, type UiState } from './types'

/** How often the mirror publishes a state (at most ~30 a second). */
export const MIRROR_TICK_MS = 33
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
  /** library.syncIndex(), fire and forget. */
  syncIndex(): void
  toast(text: string, error?: boolean): void
}

/** Kotlin String.toDoubleOrNull (Java's float syntax, no surrounding blanks). */
function ktToDoubleOrNull(s: string): number | null {
  if (!/^[+-]?(NaN|Infinity|((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)[fFdD]?)$/.test(s)) return null
  const v = Number(s.replace(/[fFdD]$/, ''))
  return Number.isNaN(v) && !/NaN/.test(s) ? null : v
}

/** Kotlin Double.toInt(): toward zero, NaN is 0, clamped to Int. */
function ktToInt(d: number): number {
  if (Number.isNaN(d)) return 0
  if (d >= 2147483647) return 2147483647
  if (d <= -2147483648) return -2147483648
  return Math.trunc(d)
}

/** `(active as? JsonPrimitive)?.content?.toDoubleOrNull()?.toInt()?.let(Device::projectFromNode)`. */
export function activeProject(active: JsonValue | undefined): number | null {
  if (active === undefined || active === null) return null
  if (typeof active === 'object') return null
  const content = typeof active === 'string' ? active : String(active)
  const d = ktToDoubleOrNull(content)
  return d === null ? null : projectFromNode(ktToInt(d))
}

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
    sameMap(a.learned, b.learned, (x, y) => x === y)
  )
}

export class MirrorController {
  private mirror: LiveMirror | null = null
  private mirrorSession: Session | null = null
  private unlisten: (() => void) | null = null
  private pushOff: (() => void) | null = null
  private tick: unknown = null

  constructor(private readonly host: MirrorHost) {}

  /** Whether the mirror listens right now. */
  get running(): boolean {
    return this.mirror !== null
  }

  /** Sets mirror.state to the snapshot, unless it equals the one shown. */
  private publish(m: LiveMirror, patch: Partial<MirrorUi> = {}): void {
    const st = m.snapshot(this.host.perfNow())
    this.host.store.update((cur) => {
      const mi = cur.mirror
      if (!mi) return cur
      const state = sameMirrorState(mi.state, st) ? mi.state : st
      const next: MirrorUi = { ...mi, state, ...patch }
      if (next.state === mi.state && next.loading === mi.loading && next.error === mi.error) return cur
      return { ...cur, mirror: next }
    })
  }

  async open(): Promise<void> {
    const { host } = this
    // Already running for this connection (opened twice): keep it.
    if (this.mirror !== null && this.mirrorSession !== null && this.mirrorSession === host.session()) return
    this.stop()
    const s = host.session()
    const events = host.liveEvents()
    if (s === null || events === null) {
      host.store.update((st) => ({ ...st, mirror: this.notConnected() }))
      return
    }
    const m = new LiveMirror(host.prefs.loadLearned(), host.prefs.savedPadOrder(), (learned) => this.saveLearned(learned))
    this.mirror = m
    this.mirrorSession = s
    host.store.update((st) => ({ ...st, mirror: { state: m.snapshot(host.perfNow()), loading: true, error: null } }))
    // Listen first, so nothing played while reading is missed.
    this.unlisten = events((e) => m.onMidi(e))
    this.pushOff = s.onPush((f) => {
      const fid = parsePadPush(f)
      if (!fid) return
      m.onPadPush(fid, host.perfNow())
      // Another project on the device: read its pads.
      if (fid.project !== m.snapshot(host.perfNow()).activeProject) this.loadProject(m, fid.project)
    })
    // At most ~30 states a second; time-based changes (pruned pads, a stale tempo) still get through.
    const loop = (): void => {
      if (this.mirror !== m) return
      this.publish(m)
      this.tick = host.setTimeout(loop, MIRROR_TICK_MS)
    }
    this.tick = host.setTimeout(loop, MIRROR_TICK_MS)
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
    if (this.mirror === m) this.publish(m, { loading: false })
  }

  private loadProject(m: LiveMirror, project: number): void {
    void (async () => {
      const groups = await this.host.tasks.exclusive('mirror', true, async (ss) => (await projectLayout(ss, project)).pads)
      if (groups === null) return
      if (this.mirror === m) {
        m.setProject(project, groups)
        this.publish(m)
      }
    })()
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
    return { state: emptyMirrorState(this.host.prefs.savedPadOrder()), loading: false, error: MirrorText.NOT_CONNECTED }
  }

  close(): void {
    this.stop()
    this.host.store.update((st) => ({ ...st, mirror: null }))
  }

  stop(): void {
    if (this.tick !== null) this.host.clearTimeout(this.tick)
    this.tick = null
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
