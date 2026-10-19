// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArpPlan.kt
//
// ARP: the arpeggiator and note repeat (an addition to the device's TIMING +
// pads): what Live shows of it (ArpUi) and the notes the controller keeps
// for it (ArpDesk), which the sequencer plays (ArpPlan, patternScheduler.ts).
//
// Web deltas:
// - Times are performance.now() ms, not System.nanoTime: [ArpDesk.pressMs].
// - The RANDOM order's seed is the press's time folded to 32 bits.
// - plan() gives what LiveAudio.arpPlan takes: the pads' sounds as sample
//   keys and shapes (LiveArpPlan), built by the controller.

import { ArpSettings, type ArpNote } from '../core/features/arp'
import type { NoteNames } from '../core/features/keys'
import { TimingSettings } from '../core/features/pattern'
import { MirrorText } from '../core/text/mirrorText'
import type { LiveArpPlan } from '../platform/audio/liveAudio'
import type { VoiceShape } from '../core/formats/voiceMixer'
import { PressureSense } from './pressure'

/** How often a held note's pressure may hand the sequencer a new plan, at most (ms). */
export const ARP_PRESSURE_MS = 20

/**
 * The arp as Live shows it (an addition): switched [on] (ARP in KEYS, RPT
 * in PADS), [latch]ed, the notes it plays ([held], in the order pressed,
 * latched ones too), whether they are KEYS notes (the arp) or pad hits
 * (note repeat: [keys] false), whether it plays now ([sounding]: on, with
 * notes), its [settings] and TIMING's ([timing]), and the display line's
 * text while it plays ([line]: "ARP · 1/16 · DO FA LA"; null otherwise).
 */
export interface ArpUi {
  readonly on: boolean
  readonly latch: boolean
  readonly held: readonly ArpNote[]
  readonly keys: boolean
  readonly sounding: boolean
  readonly settings: ArpSettings
  readonly timing: TimingSettings
  readonly line: string | null
}

export const ARP_UI: ArpUi = {
  on: false,
  latch: false,
  held: [],
  keys: true,
  sounding: false,
  settings: ArpSettings.DEFAULT,
  timing: TimingSettings.DEFAULT,
  line: null,
}

/** Whether [a] and [b] are the same note: the same pad, and the same pitch on it (or both pad hits). */
export function sameArpNote(a: ArpNote, b: ArpNote): boolean {
  return a.pad.group === b.pad.group && a.pad.offset === b.pad.offset && a.semitones === b.semitones
}

/** A pressure's place in its range (0..1) as a velocity: 1 + 126 × it, so the lightest is 1 and the hardest 127. */
export function pressureVelocity(level: number): number {
  return 1 + Math.round(126 * Math.min(Math.max(level, 0), 1))
}

/** The pads' sounds an ArpPlan plays: sample keys and shapes by pad key (LiveArpPlan's). */
export interface ArpVoices {
  readonly voices: ReadonlyMap<number, string>
  readonly shapes: ReadonlyMap<number, Partial<VoiceShape>>
  readonly keysShapes: ReadonlyMap<number, Partial<VoiceShape>>
}

/**
 * The notes the arp plays, as the controller keeps them (an addition): the
 * fingers down (by their voice's key, "note:<midi>" or "live:<group>:<offset>")
 * and the notes they hold ([notes], in the order pressed). A finger up lets
 * its note go, unless latched: then the notes stay until a press after
 * every finger is up, which starts a set of its own (the classic latch). A
 * KEYS note and a pad hit don't arp together: one of the other kind starts
 * a set of its own too. A set's first press starts the run ([pressMs]),
 * the sequencer's first step on it. A held note's pressure, on a device
 * that tells pressure, is its velocity.
 */
export class ArpDesk {
  private _notes: readonly ArpNote[] = []
  private _keys = true
  private _pressMs = 0
  // The fingers down, by voice key: the note each holds.
  private readonly down = new Map<string, ArpNote>()
  // The presses a scroll may yet take, by voice key: when each came, for RECORD's start once kept.
  private readonly unsure = new Map<string, number>()
  private readonly sense = new PressureSense()

  /** The notes the arp plays, in the order pressed (latched ones too). */
  get notes(): readonly ArpNote[] {
    return this._notes
  }

  /** The notes are KEYS notes (the arp), not pad hits (note repeat). */
  get keys(): boolean {
    return this._keys
  }

  /** When the press that started the run came (performance.now() ms). */
  get pressMs(): number {
    return this._pressMs
  }

  /** The RANDOM order's seed: the run's own, from its press. */
  get seed(): number {
    const us = Math.round(this._pressMs * 1000)
    return (us ^ Math.floor(us / 2 ** 32)) | 0
  }

  /** Whether any finger is down. */
  get anyDown(): boolean {
    return this.down.size > 0
  }

  /**
   * A finger down on voice [key] at [at], holding [note] ([keys]: a KEYS
   * note), [latch] on or off; [unsure] while a scroll may yet take it
   * ([keep], [cut]). True when it starts a run of its own (its first step
   * on this press).
   */
  press(key: string, note: ArpNote, keys: boolean, at: number, latch: boolean, unsure = false): boolean {
    const fresh = this._notes.length === 0 || keys !== this._keys || (latch && this.down.size === 0)
    if (fresh) {
      this._notes = [note]
      this._keys = keys
      this._pressMs = at
    } else if (!this._notes.some((n) => sameArpNote(n, note))) {
      this._notes = [...this._notes, note]
    }
    this.down.set(key, note)
    if (unsure) this.unsure.set(key, at)
    else this.unsure.delete(key)
    return fresh
  }

  /** The press on voice [key] was a press after all: when it came, if it was [press]ed unsure (else null). */
  keep(key: string): number | null {
    const at = this.unsure.get(key)
    if (at === undefined) return null
    this.unsure.delete(key)
    return at
  }

  /** The finger on voice [key] up: its note goes (unless [latch], or another finger holds it). True when the notes changed. */
  release(key: string, latch: boolean): boolean {
    this.unsure.delete(key)
    const n = this.down.get(key)
    if (n === undefined) return false
    this.down.delete(key)
    if (latch || this.held(n)) return false
    return this.drop(n)
  }

  /** The press on voice [key] was a scroll after all: its note goes, latched or not. True when the notes changed. */
  cut(key: string): boolean {
    this.unsure.delete(key)
    const n = this.down.get(key)
    if (n === undefined) return false
    this.down.delete(key)
    if (this.held(n)) return false
    return this.drop(n)
  }

  /** LATCH off: the notes no finger holds go. True when the notes changed. */
  unlatch(): boolean {
    const kept = this._notes.filter((n) => this.held(n))
    if (kept.length === this._notes.length) return false
    this._notes = kept
    return true
  }

  /** Every note goes, and every finger is forgotten. True when there were notes. */
  clear(): boolean {
    this.down.clear()
    this.unsure.clear()
    if (this._notes.length === 0) return false
    this._notes = []
    return true
  }

  /**
   * The finger on voice [key] presses at [pressure] (the touch's own): its
   * note's velocity follows, once the device has shown it tells pressure
   * (PressureSense); till then it stays as pressed (127). True when the
   * velocity changed.
   */
  pressure(key: string, pressure: number): boolean {
    const level = this.sense.level(pressure)
    const n = this.down.get(key)
    if (n === undefined || level === null) return false
    const v = pressureVelocity(level)
    if (v === n.velocity) return false
    const m: ArpNote = { ...n, velocity: v }
    for (const [k, d] of this.down) if (sameArpNote(d, m)) this.down.set(k, m)
    this._notes = this._notes.map((x) => (sameArpNote(x, m) ? m : x))
    return true
  }

  /** What the sequencer plays: the notes on [voices], at [timing], [settings] and [bpm]; null with no notes. */
  plan(voices: ArpVoices, timing: TimingSettings, settings: ArpSettings, bpm: number): LiveArpPlan | null {
    if (this._notes.length === 0) return null
    return { notes: this._notes, ...voices, keys: this._keys, timing, settings, bpm, seed: this.seed, pressMs: this._pressMs }
  }

  /** What Live shows: [on] and the settings, the notes, and the display line (notes named by [names]) while it plays. */
  ui(on: boolean, settings: ArpSettings, timing: TimingSettings, names: NoteNames): ArpUi {
    const sounding = on && this._notes.length > 0
    return {
      on,
      latch: settings.latch,
      held: this._notes,
      keys: this._keys,
      sounding,
      settings,
      timing,
      line: sounding ? MirrorText.arpLine(!this._keys, settings.latch, timing.interval, this._notes, names) : null,
    }
  }

  // Whether a finger down holds [n].
  private held(n: ArpNote): boolean {
    for (const d of this.down.values()) if (sameArpNote(d, n)) return true
    return false
  }

  // [n] out of the notes; true when it was in them.
  private drop(n: ArpNote): boolean {
    const kept = this._notes.filter((x) => !sameArpNote(x, n))
    if (kept.length === this._notes.length) return false
    this._notes = kept
    return true
  }
}
