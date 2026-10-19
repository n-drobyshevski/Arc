// Port of core/src/main/kotlin/dev/arc/ep133/text/GuideKeymap.kt
//
// Web delta: the Kotlin enums `PanelKey` and `StepKind` are const objects plus
// string-union types of the same name (the values are the enum names); the
// PanelKeymap object's functions are module functions, also gathered in
// `PanelKeymap`. Kotlin `error()` is a ComboKeyError, as in guideCombo.

import { ComboKeyError, KeyAction, parse as parseCombo, type ComboStep, type KeyCap } from './guideCombo'
import type { GuideEntry } from './guideText'
import { ktTrim } from '../util/kotlinText'

/**
 * A key, knob or the fader on the K.O. II's panel, as the Guide's
 * illustration draws it (an addition to the web version): the knob row
 * (VOLUME, SOUND, MAIN, TEMPO, KNOB X, KNOB Y), the KEYS / FADER / SHIFT
 * column, the group keys A-D, the twelve pads top row first, and the
 * function keys beside them.
 */
export const PanelKey = {
  VOL: 'VOL',
  SOUND: 'SOUND',
  MAIN: 'MAIN',
  TEMPO: 'TEMPO',
  X: 'X',
  Y: 'Y',
  KEYS: 'KEYS',
  FADER: 'FADER',
  SHIFT: 'SHIFT',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  P7: 'P7',
  P8: 'P8',
  P9: 'P9',
  P4: 'P4',
  P5: 'P5',
  P6: 'P6',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  DOT: 'DOT',
  P0: 'P0',
  ENTER: 'ENTER',
  SAMPLE: 'SAMPLE',
  TIMING: 'TIMING',
  FX: 'FX',
  ERASE: 'ERASE',
  MINUS: 'MINUS',
  PLUS: 'PLUS',
  REC: 'REC',
  PLAY: 'PLAY',
} as const
export type PanelKey = (typeof PanelKey)[keyof typeof PanelKey]

/** PanelKey.entries, in declaration order. */
export const PANEL_KEYS: readonly PanelKey[] = Object.freeze(Object.values(PanelKey))
/** The twelve pads, top row first, as they sit on the device. */
export const PADS: readonly PanelKey[] = Object.freeze(['P7', 'P8', 'P9', 'P4', 'P5', 'P6', 'P1', 'P2', 'P3', 'DOT', 'P0', 'ENTER'] as const)
export const DIGITS: readonly PanelKey[] = Object.freeze(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'] as const)
export const GROUPS: readonly PanelKey[] = Object.freeze(['A', 'B', 'C', 'D'] as const)

/** What a step asks of its keys: press, press twice, hold, type a number on the pads, turn a knob, move the fader. */
export const StepKind = { PRESS: 'PRESS', TWICE: 'TWICE', HOLD: 'HOLD', TYPE: 'TYPE', TURN: 'TURN', MOVE: 'MOVE' } as const
export type StepKind = (typeof StepKind)[keyof typeof StepKind]

/**
 * One step of a combo on the panel: the [keys] it lights and what it asks of
 * them ([kind]); [either] when any one of them will do ("A / B / C / D").
 */
export interface KeymapStep {
  readonly keys: readonly PanelKey[]
  readonly kind: StepKind
  readonly either: boolean
}

/** KeymapStep(keys, kind, either = false), as the Kotlin data class constructor. */
export function keymapStep(keys: readonly PanelKey[], kind: StepKind, either = false): KeymapStep {
  return { keys, kind, either }
}

/**
 * A combo as panel keys, for the Guide's illustration. [context] is the
 * bracketed situation as written; [mode] the mode it names, upper-case
 * ("SOUND" for "[In SOUND mode]", "MAIN" for "[In MAIN]"), else null.
 * [options] are separate ways to do the same thing, each its steps in order;
 * [steps] is the first way, the one the illustration numbers, and [keys]
 * every key it lights.
 */
export interface GuideKeymap {
  readonly context: string | null
  readonly mode: string | null
  readonly options: readonly (readonly KeymapStep[])[]
  readonly steps: readonly KeymapStep[]
  readonly keys: ReadonlySet<PanelKey>
}

/*
 * Reads a guide entry's combo (guideCombo notation) as steps on the panel.
 * Keys pressed together stay one step; keys held while others are pressed
 * become a HOLD step of their own first ("hold:SOUND + dial:0-9" is hold
 * SOUND, then type on the pads). A step's kind comes from its keys' actions:
 * turn, then move, then dial (TYPE), then twice; else a press.
 */

const MODE = /^In (\S+)(?: mode)?$/i

const NAMED: ReadonlyMap<string, PanelKey> = new Map<string, PanelKey>([
  ['SOUND', 'SOUND'],
  ['MAIN', 'MAIN'],
  ['TEMPO', 'TEMPO'],
  ['KNOB X', 'X'],
  ['KNOB Y', 'Y'],
  ['KEYS', 'KEYS'],
  ['FADER', 'FADER'],
  ['SHIFT', 'SHIFT'],
  ['A', 'A'],
  ['B', 'B'],
  ['C', 'C'],
  ['D', 'D'],
  ['ENTER', 'ENTER'],
  ['SAMPLE', 'SAMPLE'],
  ['TIMING', 'TIMING'],
  ['FX', 'FX'],
  ['ERASE', 'ERASE'],
  ['-', 'MINUS'],
  ['+', 'PLUS'],
  ['RECORD', 'REC'],
  ['PLAY', 'PLAY'],
])

/** The panel keys a guideCombo key name stands for: "pad" is any pad, "0-9" the digits, "A-D" the groups. */
export function keysFor(label: string): readonly PanelKey[] {
  switch (label) {
    case 'pad':
      return PADS
    case '0-9':
      return DIGITS
    case '1-9':
      return DIGITS.slice(1)
    case 'A-D':
      return GROUPS
  }
  const k = NAMED.get(label)
  if (k === undefined) throw new ComboKeyError(`no panel key for "${label}"`)
  return [k]
}

/** The mode a context names: "In SOUND mode" is SOUND, "In MAIN" is MAIN; anything else none. */
export function modeOf(context: string | null | undefined): string | null {
  if (context == null) return null
  const m = MODE.exec(ktTrim(context))
  return m ? m[1]!.toUpperCase() : null
}

export function parse(combo: string): GuideKeymap {
  const c = parseCombo(combo)
  const options = c.options.map(optionSteps)
  const steps = options[0] ?? []
  return { context: c.context, mode: modeOf(c.context), options, steps, keys: new Set(steps.flatMap((s) => s.keys)) }
}

/** An entry's keymap, or null when it has no combo (the text says it all). */
export function of(entry: GuideEntry): GuideKeymap | null {
  return entry.combo === null ? null : parse(entry.combo)
}

const sameKeys = (a: readonly PanelKey[], b: readonly PanelKey[]): boolean => a.length === b.length && a.every((k, i) => k === b[i])

/** One way's steps; keys still held from the step before are not held again ("hold:pad + SHIFT + C > hold:pad + SHIFT + D"). */
function optionSteps(option: readonly ComboStep[]): KeymapStep[] {
  const out: KeymapStep[] = []
  let holding: readonly PanelKey[] = []
  for (const step of option) {
    const held = panel(step.keys.filter((k) => k.action === KeyAction.HOLD))
    for (const s of stepSteps(step)) {
      if (!(s.kind === StepKind.HOLD && sameKeys(s.keys, holding) && sameKeys(held, holding) && out.length > 0)) out.push(s)
    }
    holding = held
  }
  return out
}

function stepSteps(step: ComboStep): KeymapStep[] {
  const held = step.keys.filter((k) => k.action === KeyAction.HOLD)
  const rest = step.keys.filter((k) => k.action !== KeyAction.HOLD)
  if (rest.length === 0) return [keymapStep(panel(held), StepKind.HOLD, step.alternatives)]
  const actions = new Set(rest.map((k) => k.action).filter((a) => a !== null))
  const kind = actions.has(KeyAction.TURN)
    ? StepKind.TURN
    : actions.has(KeyAction.MOVE)
      ? StepKind.MOVE
      : actions.has(KeyAction.DIAL)
        ? StepKind.TYPE
        : actions.has(KeyAction.TWICE)
          ? StepKind.TWICE
          : StepKind.PRESS
  const main = keymapStep(panel(rest), kind, step.alternatives)
  return held.length === 0 ? [main] : [keymapStep(panel(held), StepKind.HOLD), main]
}

function panel(caps: readonly KeyCap[]): PanelKey[] {
  return [...new Set(caps.flatMap((c) => keysFor(c.label)))]
}

/** The Kotlin `PanelKeymap` object. */
export const PanelKeymap = { keysFor, modeOf, parse, of } as const
