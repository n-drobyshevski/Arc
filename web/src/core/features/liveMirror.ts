// Port of core/src/main/kotlin/dev/arc/ep133/features/LiveMirror.kt
//
// The live mirror's state (an addition to the web version). It only listens:
//
// - Notes 36-83 light the pad the official note map names (padNotes).
// - Start / Continue / Stop and clock give play state and tempo. The device
//   sends them only with MIDI clock out (system setting 102).
// - Which sample a pad plays is not in the MIDI. Community notes say a
//   physical pad press also makes the device push its pad file id over SysEx.
//   A note and a push for the same group close together link that physical
//   pad (its offset) to its number in the project file; the project's pad
//   layout then gives the slot, and the sound list its name. Without such a
//   link no name is shown: nothing is guessed. The link is the same in every
//   project and group (it is the keypad's numbering), so it is kept.
//
// Web deltas: all times are MILLISECONDS on one clock (MIDIMessageEvent
// timeStamp / performance.now()), where the Kotlin uses nanoseconds;
// @Synchronized is dropped (single-threaded JS); pads are keyed by
// padKey() = group * 12 + offset; padSamples keys a pad by group * 100 +
// its number where Kotlin uses a Pair, and distinct() compares the fields.

import type { MidiEvent } from '../protocol/midiInput'
import { pad as padOfNote, padKey, type PhysicalPad } from './padNotes'
import type { LiveSnapshot } from './liveSnapshot'
import { OfflinePads, SoundSource, type OfflinePad } from './offlinePads'
import { PadOrder, topNumber } from './padPush'
import { groupOrder, type PadGroup } from './projectPads'

/**
 * Where a physical pad's sound is set (an addition): the active [project]'s
 * pad file for [group] and [pad] (its number in the project file, pNN), and
 * the [slot] its pad record holds now (null when empty or not in the records).
 */
export interface PadTarget {
  readonly project: number
  readonly group: number
  readonly pad: number
  readonly slot: number | null
}

/**
 * The sound to play for a pad (an addition): its [slot] and [name], and
 * whether it is a factory sound put on the pad offline ([factory]), which
 * plays from the factory pack first.
 */
export interface PadSample {
  readonly slot: number
  readonly name: string
  readonly factory: boolean
}

/** A pad file id from a pad push: project 1..99, group 0..3 (A..D) and the pad's number in the project file (pNN). */
export interface PadFid {
  project: number
  group: number
  pad: number
}

/** A pad that is sounding (or fading out): its velocity, when it started, and when it was released (ms). */
export interface PadLight {
  velocity: number
  channel: number
  onAt: number
  offAt: number | null
}

/** What the mirror shows about a pad that was hit. */
export interface Hit {
  pad: PhysicalPad | null
  note: number
  channel: number
  velocity: number
  slot: number | null
  name: string | null
}

export interface MirrorState {
  /** Lit or fading pads, keyed by padKey(). */
  pads: Map<number, PadLight>
  /** Notes outside the pad range (KEYS mode or other sources) that are held, note -> channel. */
  keysHeld: Map<number, number>
  lastKeysNote: number | null
  lastHit: Hit | null
  playing: boolean | null
  bpm: number | null
  activeProject: number | null
  /** Pad offsets (0..11) whose pad number in the project file has been learned. */
  learned: Map<number, number>
  /** Whether a pad push has ever been seen this session. */
  pushesSeen: boolean
  padOrder: PadOrder
  /** Every note held or fading, pads or not, for the KEYS view (the device's KEYS mode sends any note). */
  notes: Map<number, PadLight>
  /** The latest note played, any note. */
  lastNote: number | null
}

/** How close a note and a pad push must be to belong to the same press. */
export const MATCH_WINDOW_MS = 250
/** Released pads stay in the state this long, for the fade-out. */
export const FADE_MS = 1000
/** No clock for this long: the tempo is no longer known. */
export const CLOCK_TIMEOUT_MS = 2000
const CLOCK_WINDOW = 48

export class LiveMirror {
  static readonly MATCH_WINDOW_MS = MATCH_WINDOW_MS
  static readonly FADE_MS = FADE_MS
  static readonly CLOCK_TIMEOUT_MS = CLOCK_TIMEOUT_MS

  private readonly onLearned: (learned: Map<number, number>) => void
  private readonly pads = new Map<number, PadLight>()
  private readonly notes = new Map<number, PadLight>()
  private lastNote: number | null = null
  private readonly keysHeld = new Map<number, number>()
  private lastKeysNote: number | null = null
  private lastHit: Hit | null = null
  private playing: boolean | null = null
  private clocks: number[] = []
  private activeProject: number | null = null
  private layout = new Map<string, ReadonlyMap<number, number | null>>()
  private names: ReadonlyMap<number, string> = new Map()
  private local: OfflinePads = OfflinePads.EMPTY
  private readonly learned: Map<number, number>
  private pushesSeen = false
  private padOrder: PadOrder

  // The latest note-on and pad push per group not yet paired, with their times.
  private readonly pendingNote = new Map<number, { pad: PhysicalPad; at: number }>()
  private readonly pendingPush = new Map<number, { fid: PadFid; at: number }>()
  // Groups where two different pads (or pushes) came close together: their pairing is unsure.
  private readonly ambiguous = new Set<number>()
  // The project the latest push named; until its pads are read, hits get no name.
  private pushedProject: number | null = null

  constructor(
    learned: ReadonlyMap<number, number> = new Map(),
    padOrder: PadOrder = PadOrder.FROM_TOP,
    onLearned: (learned: Map<number, number>) => void = () => {},
  ) {
    this.learned = new Map(learned)
    this.padOrder = padOrder
    this.onLearned = onLearned
  }

  /** Drops every learned pad number; names come back as pads are pressed again. */
  forgetLearned(): void {
    if (this.learned.size === 0) return
    this.learned.clear()
    this.renameLastHit()
    this.onLearned(new Map(this.learned))
  }

  setPadOrder(order: PadOrder): void {
    this.padOrder = order
    this.renameLastHit()
  }

  setProject(project: number | null, groups: readonly PadGroup[]): void {
    this.activeProject = project
    this.layout = new Map(groups.map((g) => [g.name, g.pads]))
    this.renameLastHit()
  }

  /** Names the last hit again from the current layout, links and pad changes. */
  private renameLastHit(): void {
    const h = this.lastHit
    if (!h) return
    const p = h.pad
    if (!p) return
    this.lastHit = { ...h, slot: this.slotOf(p), name: this.nameOf(p) }
  }

  /**
   * The pad changes made offline (OfflinePads), only ever set on a mirror
   * showing the last read without the device: pads, names and their samples
   * follow them, while [saved] keeps what the device read.
   */
  setLocal(pads: OfflinePads): void {
    this.local = pads
    this.renameLastHit()
  }

  setNames(slotNames: ReadonlyMap<number, string>): void {
    this.names = slotNames
  }

  /** What was read from the device (project, pads, names), to show again while it is away. */
  saved(savedAt: number): LiveSnapshot {
    return {
      savedAt,
      activeProject: this.activeProject,
      groups: [...this.layout.entries()]
        .sort((a, b) => groupOrder(a[0], b[0]))
        .map(([name, pads]) => ({ name, pads: new Map(pads) })),
      names: this.names,
    }
  }

  /** Loads a saved read: the device's last project, pads and names. */
  load(s: LiveSnapshot): void {
    this.names = s.names
    this.setProject(s.activeProject, s.groups)
  }

  onMidi(e: MidiEvent): void {
    switch (e.type) {
      case 'NoteOn': {
        this.notes.set(e.note, { velocity: e.velocity, channel: e.channel, onAt: e.time, offAt: null })
        this.lastNote = e.note
        const pad = padOfNote(e.note)
        if (pad == null) {
          this.keysHeld.set(e.note, e.channel)
          this.lastKeysNote = e.note
          this.lastHit = { pad: null, note: e.note, channel: e.channel, velocity: e.velocity, slot: null, name: null }
        } else {
          this.pads.set(padKey(pad), { velocity: e.velocity, channel: e.channel, onAt: e.time, offAt: null })
          // Two different pads of one group close together: which one the push
          // belongs to can't be told, so this group's pairing is dropped.
          const prev = this.pendingNote.get(pad.group)
          if (prev && padKey(prev.pad) !== padKey(pad) && e.time - prev.at <= MATCH_WINDOW_MS) {
            this.ambiguous.add(pad.group)
          }
          this.pendingNote.set(pad.group, { pad, at: e.time })
          this.tryLink(pad.group)
          this.lastHit = {
            pad,
            note: e.note,
            channel: e.channel,
            velocity: e.velocity,
            slot: this.slotOf(pad),
            name: this.nameOf(pad),
          }
        }
        break
      }
      case 'NoteOff': {
        const n = this.notes.get(e.note)
        if (n && n.offAt == null) this.notes.set(e.note, { ...n, offAt: e.time })
        const pad = padOfNote(e.note)
        if (pad == null) {
          this.keysHeld.delete(e.note)
        } else {
          const key = padKey(pad)
          const l = this.pads.get(key)
          if (l && l.offAt == null) this.pads.set(key, { ...l, offAt: e.time })
        }
        break
      }
      case 'Clock': {
        // After a gap (a pause, or Continue without Start) the old clocks would drag the tempo down.
        const prev = this.clocks[this.clocks.length - 1]
        if (prev !== undefined && e.time - prev > CLOCK_TIMEOUT_MS) this.clocks = []
        this.clocks.push(e.time)
        while (this.clocks.length > CLOCK_WINDOW) this.clocks.shift()
        break
      }
      case 'Start':
      case 'Continue':
        this.playing = true
        this.clocks = []
        break
      case 'Stop':
        this.playing = false
        // A note-off lost at stop would leave a pad lit forever: release what is held.
        for (const [k, l] of [...this.pads.entries()]) if (l.offAt == null) this.pads.set(k, { ...l, offAt: e.time })
        for (const [n, l] of [...this.notes.entries()]) if (l.offAt == null) this.notes.set(n, { ...l, offAt: e.time })
        this.keysHeld.clear()
        break
      case 'ControlChange':
        break
    }
  }

  /** A pad push: the device's "active" pad changed, which community notes tie to a physical press. */
  onPadPush(fid: PadFid, time: number): void {
    this.pushesSeen = true
    this.pushedProject = fid.project
    const prev = this.pendingPush.get(fid.group)
    if (prev && !sameFid(prev.fid, fid) && time - prev.at <= MATCH_WINDOW_MS) this.ambiguous.add(fid.group)
    this.pendingPush.set(fid.group, { fid, at: time })
    this.tryLink(fid.group)
  }

  private tryLink(group: number): void {
    const note = this.pendingNote.get(group)
    if (!note) return
    const push = this.pendingPush.get(group)
    if (!push) return
    if (Math.abs(note.at - push.at) > MATCH_WINDOW_MS) return
    const { pad } = note
    const { fid } = push
    this.pendingNote.delete(group)
    this.pendingPush.delete(group)
    // An unsure pairing is not learned: a wrong link would name pads wrongly in every project.
    if (this.ambiguous.delete(group)) return
    // The keypad numbering is one to one: a pad number belongs to one key only.
    let dropped = false
    for (const [k, v] of [...this.learned.entries()]) {
      if (k !== pad.offset && v === fid.pad) {
        this.learned.delete(k)
        dropped = true
      }
    }
    const changed = this.learned.get(pad.offset) !== fid.pad
    this.learned.set(pad.offset, fid.pad)
    if (dropped || changed) this.onLearned(new Map(this.learned))
    // Name the hit that was just linked (again, if the link changed).
    const hitPad = this.lastHit?.pad
    if (hitPad && padKey(hitPad) === padKey(pad)) this.renameLastHit()
  }

  /**
   * A physical pad's number in the project file, to name it. Counted from
   * the top, it is the learned pad file id term; counted from the bottom,
   * the official note order plus one (see PadOrder).
   */
  private numberOf(pad: { readonly group: number; readonly offset: number }): number | null {
    return this.padOrder === PadOrder.FROM_TOP ? (this.learned.get(pad.offset) ?? null) : pad.offset + 1
  }

  /**
   * The sound put on [pad] offline, if any: the change for the active
   * project's pad at the number a write would use (padNumber), so a pad
   * placed before it was pressed shows its change too.
   */
  localOf(pad: { readonly group: number; readonly offset: number }): OfflinePad | null {
    if (OfflinePads.size(this.local) === 0) return null
    const project = this.activeProject
    if (project === null) return null
    if (this.pushedProject != null && this.pushedProject !== project) return null
    const number = this.padNumber(pad)
    if (number === null) return null
    return OfflinePads.at(this.local, project, pad.group, number)
  }

  /**
   * The slot on a physical pad in the active project: its offline change,
   * else the project's pad layout at its number (numberOf).
   */
  slotOf(pad: { readonly group: number; readonly offset: number }): number | null {
    // The device moved to another project whose pads aren't read yet: no name rather than a wrong one.
    if (this.pushedProject != null && this.pushedProject !== this.activeProject) return null
    const local = this.localOf(pad)
    if (local !== null) return local.slot
    const number = this.numberOf(pad)
    return number === null ? null : this.slotAt(pad.group, number)
  }

  /** The name on a physical pad: its offline change's, else the sound list's for its slot. */
  nameOf(pad: { readonly group: number; readonly offset: number }): string | null {
    const local = this.localOf(pad)
    if (local !== null) return local.name
    const slot = this.slotOf(pad)
    return slot != null ? (this.names.get(slot) ?? null) : null
  }

  /** The sound to play for [pad]: its offline change, else the read's slot and name; null when either is unknown. */
  sampleOf(pad: { readonly group: number; readonly offset: number }): PadSample | null {
    const local = this.localOf(pad)
    if (local !== null) return { slot: local.slot, name: local.name, factory: local.source === SoundSource.FACTORY }
    const slot = this.slotOf(pad)
    if (slot === null) return null
    const name = this.names.get(slot)
    return name === undefined ? null : { slot, name, factory: false }
  }

  /**
   * Every sound on the active project's pads, each once, by slot: the read's
   * layout with the offline changes over it. What to load before a pad is
   * pressed.
   */
  padSamples(): PadSample[] {
    // Keyed by group * 100 + pad number (Kotlin: a Pair).
    const byPad = new Map<number, PadSample>()
    for (const [name, pads] of this.layout) {
      if (name.length !== 1) continue
      const group = name.charCodeAt(0) - 97
      for (const [number, slot] of pads) {
        if (slot === null) continue
        const n = this.names.get(slot)
        if (n === undefined) continue
        byPad.set(group * 100 + number, { slot, name: n, factory: false })
      }
    }
    for (const p of this.local.list) {
      if (p.project === this.activeProject) {
        byPad.set(p.group * 100 + p.pad, { slot: p.slot, name: p.name, factory: p.source === SoundSource.FACTORY })
      }
    }
    // distinct(): data class equality.
    const seen = new Set<string>()
    const out: PadSample[] = []
    for (const s of byPad.values()) {
      const k = `${s.slot}:${s.factory}:${s.name}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(s)
    }
    // Stable, as Kotlin's sortedWith is.
    return out.sort((a, b) => a.slot - b.slot || Number(a.factory) - Number(b.factory))
  }

  /** The slot the read's layout has on the active project's pad [pad] of [group] (no offline change). */
  slotAt(group: number, pad: number): number | null {
    return this.layout.get(String.fromCharCode(97 + group))?.get(pad) ?? null
  }

  /**
   * A physical pad's number in the project file, to write its sound: the
   * learned number, else (counting from the top, before any press) the
   * numbering kmorrill's notes give, '7' = 1 down to ENTER = 12; counted
   * from the bottom, the official note order plus one (see PadOrder).
   * Null when that numbering's number already belongs to another, learned
   * key: the device numbers its pads otherwise, and a write would land on
   * that key's pad. The pad has to be pressed on the EP-133 first.
   */
  padNumber(pad: { readonly group: number; readonly offset: number }): number | null {
    if (this.padOrder !== PadOrder.FROM_TOP) return pad.offset + 1
    const learned = this.learned.get(pad.offset)
    if (learned !== undefined) return learned
    const top = topNumber(pad.offset)
    return [...this.learned.values()].includes(top) ? null : top
  }

  /**
   * Where [pad]'s sound is set in the active project, and the slot on it now,
   * its offline change's if it has one (for the pad sheet's "now" line and
   * for undo). Null while the active
   * project is unknown, the device moved to one not read yet, or the pad's
   * number isn't known (padNumber).
   */
  target(pad: { readonly group: number; readonly offset: number }): PadTarget | null {
    const project = this.activeProject
    if (project === null) return null
    if (this.pushedProject != null && this.pushedProject !== project) return null
    const number = this.padNumber(pad)
    if (number === null) return null
    const slot = OfflinePads.at(this.local, project, pad.group, number)?.slot ?? this.slotAt(pad.group, number)
    return { project, group: pad.group, pad: number, slot }
  }

  /**
   * arc put [slot] on [t]'s pad (or put the old one back): the layout follows
   * at once, so names and the saved read update without reading the project
   * again. Ignored if the active project changed meanwhile.
   */
  assigned(t: PadTarget, slot: number | null): void {
    if (t.project !== this.activeProject) return
    const group = String.fromCharCode(97 + t.group)
    const pads = new Map(this.layout.get(group) ?? [])
    pads.set(t.pad, slot)
    // Pads by number, as projectPads reads them (Kotlin toSortedMap).
    const next = new Map(this.layout)
    next.set(group, new Map([...pads.entries()].sort((a, b) => a[0] - b[0])))
    this.layout = next
    this.renameLastHit()
  }

  /** The state at [now] (ms): released pads past their fade are dropped, and a stale tempo is cleared. */
  snapshot(now: number): MirrorState {
    for (const [k, l] of [...this.pads.entries()]) if (l.offAt != null && now - l.offAt > FADE_MS) this.pads.delete(k)
    for (const [n, l] of [...this.notes.entries()]) if (l.offAt != null && now - l.offAt > FADE_MS) this.notes.delete(n)
    const first = this.clocks[0]
    const lastClock = this.clocks[this.clocks.length - 1]
    let bpm: number | null = null
    if (first !== undefined && lastClock !== undefined && now - lastClock <= CLOCK_TIMEOUT_MS && this.clocks.length >= 25) {
      const span = lastClock - first
      const ticks = this.clocks.length - 1
      // 24 clocks per quarter note.
      bpm = span <= 0 ? null : (60000 * ticks) / (span * 24)
    }
    return {
      pads: new Map(this.pads),
      keysHeld: new Map(this.keysHeld),
      lastKeysNote: this.lastKeysNote,
      lastHit: this.lastHit,
      playing: this.playing,
      bpm,
      activeProject: this.activeProject,
      learned: new Map(this.learned),
      pushesSeen: this.pushesSeen,
      padOrder: this.padOrder,
      notes: new Map(this.notes),
      lastNote: this.lastNote,
    }
  }
}

function sameFid(a: PadFid, b: PadFid): boolean {
  return a.project === b.project && a.group === b.group && a.pad === b.pad
}
