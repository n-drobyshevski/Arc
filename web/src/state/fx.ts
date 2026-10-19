// Port of app/src/main/kotlin/dev/arc/ep133/controller/FxPlan.kt (FxDesk, punchSlotForPad, punchDepth,
// sidechainIndex, duckSource, sendFx) and ArcController.kt's FX part
//
// FX as the controller keeps it: every project's settings (the master effect
// with its knobs, each group's send, the compressor and the sidechain), the
// one Live shows, and the punch-ins held. Each change goes to Live's output's
// FX bus at once (LiveAudioDeps.control, which keeps the last of each setting
// for an output opened later); the settings are kept once the knobs rest.
//
// Web deltas:
// - fx.json is the library database's kv row "fx" (Library.readFx / writeFx).
// - Kotlin's data-class equality is [sameFx].
// - The desk follows the project and the tempo through its [FxHost]; Live's
//   voices ask it for their shape ([shapeOf]): the FX bus of their group, and
//   whether they duck the sidechain.
// - Each group's level ([FxDesk.setGroupLevel], the drawn EP-133's fader) is
//   the web's own: kept with the sends, sent whole with them (as its gain,
//   levelGain), 1 where it was never moved.
// - So are the drawn EP-133's fader parameters and group mutes:
//   - [FxDesk.setGroupParam] / [FxDesk.groupParam]: each group's position
//     (0..1) of each FaderParam, LEVEL being setGroupLevel's level and FX
//     setSend's send (one value each), the rest FxSettings.faders, sent as
//     the bus hears them (GROUP_FILTER, GROUP_PAN, GROUP_PITCH, GROUP_ENV)
//     and kept with the project, as the levels are; TIME, VEL and MOD
//     aren't in arc ([faderParamSupported]: false, nothing changes).
//   - [FxDesk.faderAssign] / [FxDesk.setFaderAssign]: the parameter each
//     group's fader moves (LEVEL unless assigned), kept with the project.
//   - [FxDesk.resetGroupParams] / [FxDesk.restoreGroupParams]: a group's
//     parameters all back to their defaults (SHIFT + FADER's RES), and back
//     to where they were (SET), each one edit.
//   - [FxDesk.setMute] / [FxDesk.setSolo] (FX held + A..D): a group muted,
//     or the groups soloed (while any is, every other group is muted, mute
//     or not); [FxDesk.silenced] is what is heard of that, sent as
//     GROUP_MUTE. For the session only: never kept, the same across
//     projects.

import { computed, signal, type ReadonlySignal, type Signal } from '@preact/signals'
import {
  FADER_DEFAULTS,
  FADER_PARAMS,
  FxBook,
  FxSettings,
  faderParamSupported,
  fxTypeIndex,
  groupAttackMs,
  groupPan,
  groupReleaseMs,
  groupSemitones,
  levelGain,
  type Comp,
  type FaderParam,
  type FxType,
  type GroupFaders,
  type Sidechain,
} from '../core/features/fxSettings'
import { LABELS } from '../core/features/padNotes'
import { FxControl } from '../core/formats/fx/fxBus'
import type { VoiceShape } from '../core/formats/voiceMixer'

export { FADER_DEFAULTS, FADER_PARAMS, faderParamSupported, faderReadout, type FaderParam } from '../core/features/fxSettings'

/** A group's every FaderParam position, as [FxDesk.resetGroupParams] found them, for [FxDesk.restoreGroupParams]. */
export type GroupParamSnapshot = Readonly<Record<FaderParam, number>>

/** Where the FX bus's commands go: FxControl command [what] with its index and knobs (Live's output). */
export type FxSend = (what: number, index: number, x: number, y: number) => void

/** A group's send when an effect goes on with no group sending to it ([FxDesk.setType]). */
export const FIRST_SEND = 0.5

/** A punch-in's lightest depth: a press always punches in, however light it is (0 would let go). */
export const PUNCH_MIN_DEPTH = 0.01

/** The knobs turn many times a second: the settings are kept once they rest this long (ms). */
export const FX_SAVE_MS = 500

/** The pads' labels in punch-in slot order, PITCH_RANDOM ('.') to DECIMATOR ('9'). */
const PUNCH_PADS = ['.', '0', 'ENTER', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * The punch-in slot the pad at [offset] (0..11, its place in the group)
 * plays while FX is held, by the label printed on it: 7 TREMOLO, 8 OCTAVE
 * DOWN, 9 DECIMATOR / 4 LPF, 5 HPF, 6 SEND FX / 1 BEAT REPEAT, 2 TAPE STOP,
 * 3 FILTER LFO / '.' PITCH RANDOM, 0 SLICE, ENTER STUTTER. -1 for no pad.
 */
export function punchSlotForPad(offset: number): number {
  const label = LABELS[offset]
  return label === undefined ? -1 : PUNCH_PADS.indexOf(label)
}

/** A punch-in's depth as the mixer takes it: held to PUNCH_MIN_DEPTH..1 (NaN is the lightest). */
export function punchDepth(depth: number): number {
  return depth > PUNCH_MIN_DEPTH ? Math.min(depth, 1) : PUNCH_MIN_DEPTH
}

/** The sidechain's command index: the groups it ducks while on, 0 (off) otherwise. */
export function sidechainIndex(s: Sidechain): number {
  return s.on ? s.dests : 0
}

/** Whether [pad]'s voices duck the sidechain's groups: it is on and [pad] is its source. */
export function duckSource(fx: FxSettings, pad: { readonly group: number; readonly offset: number }): boolean {
  return fx.sidechain.on && pad.group === fx.sidechain.group && pad.offset === fx.sidechain.pad
}

/** [s] whole, as the FX bus's commands to [send]: the effect with its knobs, each group's send, the compressor, the sidechain and (web) each group's level, then its fader parameters (sendFaders). */
export function sendFx(s: FxSettings, send: FxSend): void {
  send(FxControl.FX_TYPE, fxTypeIndex(s.type), s.x, s.y)
  for (let g = 0; g < FxSettings.GROUPS; g++) send(FxControl.SEND, g, s.sends[g] ?? 0, 0)
  send(FxControl.COMP, s.comp.on ? 1 : 0, s.comp.x, s.comp.y)
  send(FxControl.SIDECHAIN, sidechainIndex(s.sidechain), s.sidechain.x, s.sidechain.y)
  for (let g = 0; g < FxSettings.GROUPS; g++) send(FxControl.GROUP_LEVEL, g, levelGain(s.levels[g] ?? 1), 0)
  for (let g = 0; g < FxSettings.GROUPS; g++) sendFaders(s, g, send)
}

/** Group [g]'s fader parameters in [s] (web), as the bus hears them: its filters, balance, pitch and envelopes. */
export function sendFaders(s: FxSettings, g: number, send: FxSend): void {
  const fs = s.faders[g]
  if (fs === undefined) return
  send(FxControl.GROUP_FILTER, g, fs.LPF, fs.HPF)
  send(FxControl.GROUP_PAN, g, groupPan(fs), 0)
  send(FxControl.GROUP_PITCH, g, groupSemitones(fs), 0)
  send(FxControl.GROUP_ENV, g, groupAttackMs(fs), groupReleaseMs(fs))
}

/** The bus's command for [fs]'s [p] (one of FxSettings.faders') to [send]. */
function sendFader(fs: GroupFaders, g: number, p: FaderParam, send: FxSend): void {
  switch (p) {
    case 'LPF':
    case 'HPF':
      send(FxControl.GROUP_FILTER, g, fs.LPF, fs.HPF)
      return
    case 'PAN':
      send(FxControl.GROUP_PAN, g, groupPan(fs), 0)
      return
    case 'PITCH':
    case 'TUNE':
      send(FxControl.GROUP_PITCH, g, groupSemitones(fs), 0)
      return
    case 'ATK':
    case 'REL':
      send(FxControl.GROUP_ENV, g, groupAttackMs(fs), groupReleaseMs(fs))
      return
  }
}

/** Whether group [g] is silenced: soloing others ([soloed] not empty, without it), else [muted]. */
export function silencedGroup(g: number, muted: ReadonlySet<number>, soloed: ReadonlySet<number>): boolean {
  return soloed.size > 0 ? !soloed.has(g) : muted.has(g)
}

const sameComp = (a: Comp, b: Comp): boolean => a.on === b.on && a.x === b.x && a.y === b.y
const sameSidechain = (a: Sidechain, b: Sidechain): boolean =>
  a.on === b.on && a.group === b.group && a.pad === b.pad && a.dests === b.dests && a.x === b.x && a.y === b.y

/** Kotlin's FxSettings equality (and the web's levels). */
export function sameFx(a: FxSettings, b: FxSettings): boolean {
  return (
    a.type === b.type &&
    a.x === b.x &&
    a.y === b.y &&
    a.sends.length === b.sends.length &&
    a.sends.every((v, i) => v === b.sends[i]) &&
    sameComp(a.comp, b.comp) &&
    sameSidechain(a.sidechain, b.sidechain) &&
    a.levels.length === b.levels.length &&
    a.levels.every((v, i) => v === b.levels[i]) &&
    a.faders.length === b.faders.length &&
    a.faders.every((v, i) => {
      const w = b.faders[i]
      return w !== undefined && v.PITCH === w.PITCH && v.LPF === w.LPF && v.HPF === w.HPF && v.ATK === w.ATK && v.REL === w.REL && v.PAN === w.PAN && v.TUNE === w.TUNE
    }) &&
    a.assign.length === b.assign.length &&
    a.assign.every((p, i) => p === b.assign[i])
  )
}

/**
 * FX as the controller keeps it: every project's settings (read once with
 * [load]), the one Live shows ([fx], [project]'s) and the punch-ins held
 * ([punches], in the order pressed). Each change goes to the FX bus at once
 * ([send]), and an edit is told to [edited], so the controller keeps it once
 * the knobs rest. Another project, or the settings read, sends its settings whole.
 */
export class FxDesk {
  // Every project's settings but the one shown, which is [fx]'s.
  private book: ReadonlyMap<number, FxSettings> = new Map()
  // The projects edited before the settings were read: newer than what was kept.
  private readonly touched = new Set<number>()
  private _project = 0
  private _loaded = false
  private readonly _fx: Signal<FxSettings> = signal(FxSettings.DEFAULT)
  /** The settings of [project]. */
  readonly fx: ReadonlySignal<FxSettings> = this._fx
  private readonly _punches: Signal<ReadonlySet<number>> = signal(new Set<number>())
  /** The punch-in slots held, in the order pressed (PITCH_RANDOM to DECIMATOR). */
  readonly punches: ReadonlySignal<ReadonlySet<number>> = this._punches
  /** The parameter each group's fader moves (A..D; web), [project]'s: LEVEL unless assigned. */
  readonly faderAssign: ReadonlySignal<readonly FaderParam[]> = computed(() => this._fx.value.assign)
  private readonly _muted: Signal<ReadonlySet<number>> = signal(new Set<number>())
  /** The groups muted (0..3; web, FX held + A..D's mute), whatever is soloed. Not kept. */
  readonly muted: ReadonlySignal<ReadonlySet<number>> = this._muted
  private readonly _soloed: Signal<ReadonlySet<number>> = signal(new Set<number>())
  /** The groups soloed (0..3; web): while any is, every other group is silenced. Not kept. */
  readonly soloed: ReadonlySignal<ReadonlySet<number>> = this._soloed
  /** The groups silenced (0..3; web), as heard: those not soloed while any is, else those muted. */
  readonly silenced: ReadonlySignal<ReadonlySet<number>> = computed(() => {
    const muted = this._muted.value
    const soloed = this._soloed.value
    const out = new Set<number>()
    for (let g = 0; g < FxSettings.GROUPS; g++) if (silencedGroup(g, muted, soloed)) out.add(g)
    return out
  })

  constructor(
    private readonly send: FxSend,
    private readonly edited: () => void = () => {},
  ) {}

  /** The project Live shows (0: none known yet). */
  get project(): number {
    return this._project
  }

  /** Whether the settings have been read (or found missing); [json] is written only then. */
  get loaded(): boolean {
    return this._loaded
  }

  /**
   * The settings read ([read]; null when there are none or they can't be
   * read): the projects edited before keep their edits, and the one shown is
   * sent whole. True when they are to be written again for those edits.
   */
  load(read: ReadonlyMap<number, FxSettings> | null): boolean {
    if (this._loaded) return false
    this._loaded = true
    this.book = new Map([...(read ?? new Map<number, FxSettings>()), ...this.book])
    this.show(this.touched.has(this._project) ? this._fx.peek() : (this.book.get(this._project) ?? FxSettings.DEFAULT))
    return this.touched.size > 0
  }

  /** Live shows project [p]: its settings come in and are sent whole. */
  switchTo(p: number): void {
    if (p === this._project) return
    this.book = this.kept()
    this._project = p
    this.show(this.book.get(p) ?? FxSettings.DEFAULT)
  }

  /** Every project's settings as they are kept: those at the defaults left out. */
  kept(): ReadonlyMap<number, FxSettings> {
    const s = this._fx.peek()
    const out = new Map(this.book)
    if (sameFx(s, FxSettings.DEFAULT)) out.delete(this._project)
    else out.set(this._project, s)
    return out
  }

  /** The settings' JSON (FxBook); null when every project is at the defaults (nothing kept). */
  json(): string | null {
    const k = this.kept()
    return k.size === 0 ? null : FxBook.toJson(k)
  }

  /** The FX of project [p]: the one shown, or the one kept for when Live shows it. */
  of(p: number): FxSettings {
    return p === this._project ? this._fx.peek() : (this.book.get(p) ?? FxSettings.DEFAULT)
  }

  /**
   * [s] whole as project [p]'s FX (a beat card's, or taken back): the project
   * shown has them sent at once, another project keeps them for when Live
   * shows it. Both are kept.
   */
  replace(p: number, s: FxSettings): void {
    const c = FxSettings.clamped(s)
    if (p === this._project) {
      if (this.edit(c)) sendFx(c, this.send)
      return
    }
    this.book = new Map(this.book).set(p, c)
    if (!this._loaded) this.touched.add(p)
    this.edited()
  }

  /**
   * The effect: [t], or none when [t] is the one on already (its key tapped
   * again). Its knobs stay. An effect put on while no group sends to it would
   * be silent: group [group] (the pad played last's, when known) then sends
   * FIRST_SEND, so the effect is heard at once.
   */
  setType(t: FxType, group: number | null = null): void {
    const cur = this._fx.peek()
    const s = FxSettings.withType(cur, cur.type === t ? 'NONE' : t)
    if (this.edit(s)) this.send(FxControl.FX_TYPE, fxTypeIndex(s.type), s.x, s.y)
    if (s.type !== 'NONE' && group !== null && s.sends.every((v) => v === 0)) this.setSend(group, FIRST_SEND)
  }

  /** The effect's knobs (0..1). */
  setXY(x: number, y: number): void {
    const s = FxSettings.withXY(this._fx.peek(), x, y)
    if (this.edit(s)) this.send(FxControl.FX_XY, 0, s.x, s.y)
  }

  /** Group [group]'s (0..3) send to the effect (0..1). */
  setSend(group: number, v: number): void {
    if (group < 0 || group >= FxSettings.GROUPS) return
    const s = FxSettings.withSend(this._fx.peek(), group, v)
    if (this.edit(s)) this.send(FxControl.SEND, group, s.sends[group] ?? 0, 0)
  }

  /** Group [group]'s (0..3) level (0..1; web: the drawn EP-133's fader), heard at its levelGain. */
  setGroupLevel(group: number, v: number): void {
    if (group < 0 || group >= FxSettings.GROUPS) return
    const s = FxSettings.withLevel(this._fx.peek(), group, v)
    if (this.edit(s)) this.send(FxControl.GROUP_LEVEL, group, levelGain(s.levels[group] ?? 1), 0)
  }

  /**
   * Group [group]'s (0..3) [param] at fader position [v] (0..1; web): LEVEL
   * is setGroupLevel, FX setSend, the rest the group's own (kept with the
   * project, glided by the bus). False, and nothing changes, for a group out
   * of range or a parameter arc hasn't (TIME, VEL, MOD).
   */
  setGroupParam(group: number, param: FaderParam, v: number): boolean {
    if (group < 0 || group >= FxSettings.GROUPS || !faderParamSupported(param)) return false
    if (param === 'LEVEL') this.setGroupLevel(group, v)
    else if (param === 'FX') this.setSend(group, v)
    else {
      const s = FxSettings.withFader(this._fx.peek(), group, param, v)
      const fs = s.faders[group]
      if (this.edit(s) && fs !== undefined) sendFader(fs, group, param, this.send)
    }
    return true
  }

  /**
   * Group [group]'s position of [param] (0..1; web), [project]'s, read
   * through [fx] (so a component reading it follows it): FADER_DEFAULTS'
   * where never moved, and always for one arc hasn't.
   */
  groupParam(group: number, param: FaderParam): number {
    return FxSettings.faderOf(this._fx.value, group, param)
  }

  /** Group [group]'s (0..3) fader moves [param] from now (web); false, and nothing changes, for one arc hasn't. */
  setFaderAssign(group: number, param: FaderParam): boolean {
    if (group < 0 || group >= FxSettings.GROUPS || !faderParamSupported(param)) return false
    this.edit(FxSettings.withAssign(this._fx.peek(), group, param))
    return true
  }

  /**
   * Every parameter of group [group] (0..3) back to its default, as one edit
   * (web: SHIFT + FADER's RES): its level full, no send, the rest centred or
   * open. What they were comes back, for restoreGroupParams.
   */
  resetGroupParams(group: number): GroupParamSnapshot {
    const before = this.snapshot(group)
    this.applyGroup(group, FADER_DEFAULTS)
    return before
  }

  /** Group [group]'s parameters back to [snapshot] (resetGroupParams'), as one edit (web: SHIFT + FADER's SET). */
  restoreGroupParams(group: number, snapshot: GroupParamSnapshot): void {
    this.applyGroup(group, snapshot)
  }

  /** Group [group] (0..3) muted ([on]) or not (web); heard as such unless a solo decides. Not kept. */
  setMute(group: number, on: boolean): void {
    if (group < 0 || group >= FxSettings.GROUPS) return
    const cur = this._muted.peek()
    if (cur.has(group) === on) return
    const next = new Set(cur)
    if (on) next.add(group)
    else next.delete(group)
    this.mutes(() => {
      this._muted.value = next
    })
  }

  /** The groups soloed (web): those of [groups] in 0..3; none ends the solo. Not kept. */
  setSolo(groups: ReadonlySet<number>): void {
    const next = new Set<number>()
    for (const g of groups) if (Number.isInteger(g) && g >= 0 && g < FxSettings.GROUPS) next.add(g)
    const cur = this._soloed.peek()
    if (next.size === cur.size && [...next].every((g) => cur.has(g))) return
    this.mutes(() => {
      this._soloed.value = next
    })
  }

  /** [change] made to the mutes or solos, and each group whose silence it changed sent (GROUP_MUTE). */
  private mutes(change: () => void): void {
    const before = this.silenced.peek()
    change()
    const after = this.silenced.peek()
    for (let g = 0; g < FxSettings.GROUPS; g++) {
      if (before.has(g) !== after.has(g)) this.send(FxControl.GROUP_MUTE, g, after.has(g) ? 1 : 0, 0)
    }
  }

  /** Group [group]'s every FaderParam position now. */
  private snapshot(group: number): GroupParamSnapshot {
    const s = this._fx.peek()
    const out = {} as Record<FaderParam, number>
    for (const p of FADER_PARAMS) out[p] = FxSettings.faderOf(s, group, p)
    return out
  }

  /** Group [group]'s parameters arc has set to [values] as one edit, and sent whole for the group. */
  private applyGroup(group: number, values: GroupParamSnapshot): void {
    if (group < 0 || group >= FxSettings.GROUPS) return
    let s = this._fx.peek()
    for (const p of FADER_PARAMS) if (faderParamSupported(p)) s = FxSettings.withFader(s, group, p, values[p])
    if (!this.edit(s)) return
    this.send(FxControl.SEND, group, s.sends[group] ?? 0, 0)
    this.send(FxControl.GROUP_LEVEL, group, levelGain(s.levels[group] ?? 1), 0)
    sendFaders(s, group, this.send)
  }

  /** The master compressor: [on], its drive [x] and speed [y] (0..1); what is left out stays. */
  setComp(fields: Partial<Comp>): void {
    const cur = this._fx.peek()
    const s = FxSettings.clamped(FxSettings.withComp(cur, { ...cur.comp, ...fields }))
    if (this.edit(s)) this.send(FxControl.COMP, s.comp.on ? 1 : 0, s.comp.x, s.comp.y)
  }

  /** The sidechain on or off. */
  setSidechainOn(on: boolean): void {
    this.sidechain({ ...this._fx.peek().sidechain, on })
  }

  /** The sidechain's source: pad [pad] (0..11) of group [group] (0..3). */
  setSidechainSource(group: number, pad: number): void {
    this.sidechain({ ...this._fx.peek().sidechain, group, pad })
  }

  /** Group [group] (0..3) ducked by the sidechain, or no longer. */
  toggleSidechainDest(group: number): void {
    if (group < 0 || group >= FxSettings.GROUPS) return
    const c = this._fx.peek().sidechain
    this.sidechain({ ...c, dests: c.dests ^ (1 << group) })
  }

  /** The duck's length [x] and shape [y] (0..1). */
  setSidechainXY(x: number, y: number): void {
    this.sidechain({ ...this._fx.peek().sidechain, x, y })
  }

  private sidechain(c: Sidechain): void {
    const s = FxSettings.clamped(FxSettings.withSidechain(this._fx.peek(), c))
    // The source isn't the bus's to know (the voices' shapes carry it): only what it hears is sent.
    if (this.edit(s)) this.send(FxControl.SIDECHAIN, sidechainIndex(s.sidechain), s.sidechain.x, s.sidechain.y)
  }

  /** Punch-in [slot] (0..11) pressed, at [depth] (held to (0, 1]). */
  punchDown(slot: number, depth: number): void {
    if (slot < 0 || slot >= FxControl.SLOTS) return
    this.send(FxControl.PUNCH, slot, punchDepth(depth), 0)
    this._punches.value = new Set([...this._punches.peek(), slot])
  }

  /** A punch-in held goes deeper or lighter. */
  punchMove(slot: number, depth: number): void {
    if (this._punches.peek().has(slot)) this.send(FxControl.PUNCH, slot, punchDepth(depth), 0)
  }

  /** A punch-in let go of. */
  punchUp(slot: number): void {
    const held = this._punches.peek()
    if (!held.has(slot)) return
    this.send(FxControl.PUNCH, slot, 0, 0)
    const next = new Set(held)
    next.delete(slot)
    this._punches.value = next
  }

  /** Every punch-in let go of (FX let go of, or Live closing). */
  punchAllUp(): void {
    const held = this._punches.peek()
    if (held.size === 0) return
    for (const slot of held) this.send(FxControl.PUNCH, slot, 0, 0)
    this._punches.value = new Set()
  }

  /** [s] shown and sent whole. */
  private show(s: FxSettings): void {
    this._fx.value = s
    sendFx(s, this.send)
  }

  /** [s] is the project's now, unless nothing changed (false); kept once the settings have been read. */
  private edit(s: FxSettings): boolean {
    if (sameFx(s, this._fx.peek())) return false
    this._fx.value = s
    if (!this._loaded) this.touched.add(this._project)
    this.edited()
    return true
  }
}

/** Where the FX desk keeps its settings (the library's kv row). */
export interface FxStore {
  readFx(): Promise<string | null>
  writeFx(json: string | null): Promise<void>
}

/**
 * The FX desk as the controller runs it: settings read once and kept once
 * the knobs rest, and each voice's [shapeOf].
 */
export class FxKeeper {
  readonly desk: FxDesk
  private saveTimer: unknown = null

  constructor(
    send: FxSend,
    private readonly store: FxStore,
    private readonly timers: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void },
  ) {
    this.desk = new FxDesk(send, () => this.save())
  }

  /** The settings, read once; what was changed before they were read is kept over them. */
  async load(): Promise<void> {
    if (this.desk.loaded) return
    let read: ReadonlyMap<number, FxSettings> | null
    try {
      const json = await this.store.readFx()
      read = json === null ? null : FxBook.fromJson(json)
    } catch {
      read = null
    }
    if (this.desk.load(read)) this.save()
  }

  /** Keeps every project's settings once the knobs rest; none forgets them. */
  private save(): void {
    if (!this.desk.loaded) return
    if (this.saveTimer !== null) this.timers.clearTimeout(this.saveTimer)
    this.saveTimer = this.timers.setTimeout(() => {
      this.saveTimer = null
      void this.store.writeFx(this.desk.json()).catch(() => undefined)
    }, FX_SAVE_MS)
  }

  /** A voice of [pad]: its group's FX bus, and whether it ducks the sidechain. */
  shapeOf(pad: { readonly group: number; readonly offset: number }): Partial<VoiceShape> {
    return duckSource(this.desk.fx.peek(), pad) ? { bus: pad.group, duckSource: true } : { bus: pad.group }
  }

  dispose(): void {
    if (this.saveTimer !== null) this.timers.clearTimeout(this.saveTimer)
    this.saveTimer = null
  }
}
