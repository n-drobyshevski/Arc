// Port of core/src/main/kotlin/dev/arc/ep133/text/GuideCombo.kt

import { ktTrim } from '../util/kotlinText'

/** How a key is drawn: the EP-133's pale keys, its dark keys, a pad, a knob or the fader. */
export type KeyKind = 'LIGHT' | 'DARK' | 'PAD' | 'KNOB' | 'FADER'
export const KeyKind = { LIGHT: 'LIGHT', DARK: 'DARK', PAD: 'PAD', KNOB: 'KNOB', FADER: 'FADER' } as const

/** What to do with a key, shown above it: hold it, type a number on the pads, turn it, move it, press it twice. */
export type KeyAction = 'HOLD' | 'DIAL' | 'TURN' | 'MOVE' | 'TWICE'
export const KeyAction = { HOLD: 'HOLD', DIAL: 'DIAL', TURN: 'TURN', MOVE: 'MOVE', TWICE: 'TWICE' } as const

export interface KeyCap {
  readonly label: string
  readonly kind: KeyKind
  readonly action: KeyAction | null
}

/** Keys pressed together, or (when [alternatives]) any one of them. */
export interface ComboStep {
  readonly keys: readonly KeyCap[]
  readonly alternatives: boolean
}

/** Steps one after another; [options] are separate ways to do the same thing. */
export interface Combo {
  readonly context: string | null
  readonly options: readonly (readonly ComboStep[])[]
}

/** KeyCap(label, kind, action = null), as the Kotlin data class constructor. */
export function keyCap(label: string, kind: KeyKind, action: KeyAction | null = null): KeyCap {
  return { label, kind, action }
}

/** ComboStep(keys, alternatives = false), as the Kotlin data class constructor. */
export function comboStep(keys: readonly KeyCap[], alternatives = false): ComboStep {
  return { keys, alternatives }
}

/** Malformed notation: an unclosed context or mixed + and / (Kotlin `require`, IllegalArgumentException). */
export class ComboSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ComboSyntaxError'
  }
}

/** An unknown key or action name (Kotlin `error`, IllegalStateException). */
export class ComboKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ComboKeyError'
  }
}

/*
 * A small notation for drawing a guide entry's keys as key caps (an addition
 * to the web version). Each entry's combo is written from that entry's own
 * key text and checked against it by a test, so the caps never show a key
 * the official guide does not name.
 *
 * `[context] option | option`; an option is `step > step`; a step is keys
 * joined by ` + ` (together) or ` / ` (either). A key is `action:NAME` or
 * `NAME`, where action is hold, dial, turn, move or x2.
 */

const LIGHT: ReadonlySet<string> = new Set(['SHIFT', '-', '+'])
const DARK: ReadonlySet<string> = new Set(['MAIN', 'SOUND', 'SAMPLE', 'FX', 'TEMPO', 'RECORD', 'PLAY', 'ERASE', 'KEYS', 'TIMING', 'A', 'B', 'C', 'D', 'A-D'])
const PAD: ReadonlySet<string> = new Set(['pad', 'ENTER', '1-9', '0-9'])
const KNOB: ReadonlySet<string> = new Set(['KNOB X', 'KNOB Y'])
const ACTIONS: ReadonlyMap<string, KeyAction> = new Map([
  ['hold', KeyAction.HOLD],
  ['dial', KeyAction.DIAL],
  ['turn', KeyAction.TURN],
  ['move', KeyAction.MOVE],
  ['x2', KeyAction.TWICE],
])

/** Every key name the notation knows, for checking combos against their text. */
export const KEY_NAMES: ReadonlySet<string> = new Set([...LIGHT, ...DARK, ...PAD, ...KNOB, 'FADER', '-/+'])

export function parse(text: string): Combo {
  let rest = ktTrim(text)
  let context: string | null = null
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']')
    if (!(close > 0)) throw new ComboSyntaxError(`unclosed context in "${text}"`)
    context = ktTrim(rest.substring(1, close))
    rest = ktTrim(rest.substring(close + 1))
  }
  const options = rest.split(' | ').map((option) => option.split(' > ').map((step) => parseStep(ktTrim(step), text)))
  return { context, options }
}

function parseStep(step: string, whole: string): ComboStep {
  const together = step.includes(' + ')
  const either = step.includes(' / ')
  if (together && either) throw new ComboSyntaxError(`mixed + and / in "${whole}"`)
  const parts = either ? step.split(' / ') : step.split(' + ')
  const keys = parts.flatMap((p) => parseKey(ktTrim(p), whole))
  return { keys, alternatives: either }
}

function parseKey(token: string, whole: string): KeyCap[] {
  const colon = token.indexOf(':')
  let action: KeyAction | null = null
  if (colon > 0) {
    const a = ACTIONS.get(token.substring(0, colon))
    if (a === undefined) throw new ComboKeyError(`unknown action in "${whole}"`)
    action = a
  }
  const name = colon > 0 ? token.substring(colon + 1) : token
  // "- / +" is two pale keys side by side, as on the device.
  if (name === '-/+') return [keyCap('-', KeyKind.LIGHT, action), keyCap('+', KeyKind.LIGHT)]
  let kind: KeyKind
  if (LIGHT.has(name)) kind = KeyKind.LIGHT
  else if (DARK.has(name)) kind = KeyKind.DARK
  else if (PAD.has(name)) kind = KeyKind.PAD
  else if (KNOB.has(name)) kind = KeyKind.KNOB
  else if (name === 'FADER') kind = KeyKind.FADER
  else throw new ComboKeyError(`unknown key "${name}" in "${whole}"`)
  return [keyCap(name, kind, action)]
}
