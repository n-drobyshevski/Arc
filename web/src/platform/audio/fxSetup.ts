// Port of app/src/main/kotlin/dev/arc/ep133/audio/FxSetup.kt
//
// The FX bus's settings as last sent to Live's output (an addition), so an
// output made afresh (Live back after a close, a new latencyHint, a glitching
// output replaced) gets them all again, as LiveAudio sends them.
//
// One value per setting, the last one sent: the effect (its type and knobs,
// FX_TYPE and FX_XY together, so a type change's own knobs aren't undone by
// an older drag), each group's send, the compressor, the sidechain, each
// group's level and the tempo. Punch-ins aren't kept: one lasts only while it is held, and a new
// output starts with none. Nothing sent, nothing replayed, so a mixer at its
// defaults stays at them.
//
// Web deltas: no lock (one thread); [commands] lists the settings (Kotlin's
// replay hands them to a function); a suspended output keeps its mixer, so
// only a new one is replayed to (Android: a native stream reopened too). The
// groups' levels (GROUP_LEVEL, the drawn EP-133's fader) are the web's own,
// and so are their mutes, filters, balances, pitches and envelopes
// (GROUP_MUTE to GROUP_ENV: solo and mute, the fader's other parameters),
// kept the same way, one a group each, after the levels.

import { FxControl } from '../../core/formats/fx/fxBus'

// Where each setting is kept: the effect, the four sends, the compressor, the sidechain, the four levels,
// then (web) four each of mutes, filters, balances, pitches and envelopes, the tempo.
const EFFECT = 0
const SENDS = 1
const COMP = SENDS + FxControl.GROUPS
const SIDECHAIN = COMP + 1
const LEVELS = SIDECHAIN + 1
const MUTES = LEVELS + FxControl.GROUPS
const FILTERS = MUTES + FxControl.GROUPS
const PANS = FILTERS + FxControl.GROUPS
const PITCHES = PANS + FxControl.GROUPS
const ENVS = PITCHES + FxControl.GROUPS
const TEMPO = ENVS + FxControl.GROUPS
const SLOTS = TEMPO + 1

/** Where a group's command [what] is kept (its first group's slot), or -1 for none. */
function groupSlot(what: number): number {
  switch (what) {
    case FxControl.SEND:
      return SENDS
    case FxControl.GROUP_LEVEL:
      return LEVELS
    case FxControl.GROUP_MUTE:
      return MUTES
    case FxControl.GROUP_FILTER:
      return FILTERS
    case FxControl.GROUP_PAN:
      return PANS
    case FxControl.GROUP_PITCH:
      return PITCHES
    case FxControl.GROUP_ENV:
      return ENVS
    default:
      return -1
  }
}

/** One of FxControl's commands (FX_TYPE to GROUP_ENV), as VoiceMixer.control takes it. */
export interface FxCommand {
  readonly what: number
  readonly index: number
  readonly x: number
  readonly y: number
}

/** The FX settings kept for Live's next output. */
export class FxSetup {
  private readonly kept: (FxCommand | null)[] = new Array<FxCommand | null>(SLOTS).fill(null)
  // The effect as it stands; before any type is chosen, none, at the mixer's own knobs.
  private effect: FxCommand = { what: FxControl.FX_TYPE, index: FxControl.NONE, x: 0.5, y: 0.5 }

  /** Keeps FxControl command [what] (its [index], [x] and [y]) as the latest of its setting; a punch-in isn't kept. */
  record(what: number, index: number, x: number, y: number): void {
    switch (what) {
      case FxControl.FX_TYPE:
        this.effect = { what, index, x, y }
        this.kept[EFFECT] = this.effect
        return
      case FxControl.FX_XY:
        // The effect stays as it is; only its knobs move.
        this.effect = { what: FxControl.FX_TYPE, index: this.effect.index, x, y }
        this.kept[EFFECT] = this.effect
        return
      case FxControl.COMP:
        this.kept[COMP] = { what, index, x, y }
        return
      case FxControl.SIDECHAIN:
        this.kept[SIDECHAIN] = { what, index, x, y }
        return
      case FxControl.TEMPO:
        this.kept[TEMPO] = { what, index, x, y }
        return
    }
    // A group's own: each group's last.
    const slot = groupSlot(what)
    if (slot >= 0 && Number.isInteger(index) && index >= 0 && index < FxControl.GROUPS) this.kept[slot + index] = { what, index, x, y }
  }

  /** Every setting kept, as the commands that set it: the effect first, the tempo last. */
  commands(): FxCommand[] {
    return this.kept.filter((c): c is FxCommand => c !== null)
  }
}
