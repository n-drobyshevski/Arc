// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/GuideKeys.kt
//
// Key caps for the shortcut guide, drawn after the device and small enough to
// sit in a line of text: pale keys (SHIFT, - and +, the group keys, ERASE),
// dark keys and pads, and the orange ones (KNOB X, RECORD). A tag before a
// key says what to do with it (HOLD, TYPE, TURN). These are the device's own
// colours, so they stay the same in the dark theme (--guide-* tokens).
import { Fragment } from 'preact'
import type { JSX, Ref } from 'preact'
import { KEY_NAMES, type Combo, type KeyAction } from '../../core/text/guideCombo'
import { DIGITS, GROUPS, PADS, keysFor, type GuideKeymap, type KeymapStep, type PanelKey } from '../../core/text/guideKeymap'
import { OR, modeTag, panelLabel, step as stepName, stepWord, tag as actionTag } from '../../core/text/guideText'
import './GuideKeys.css'

const LIGHT_KEYS: ReadonlySet<string> = new Set(['SHIFT', '-', '+', 'A', 'B', 'C', 'D', 'A-D', 'ERASE'])
const SIGNAL_KEYS: ReadonlySet<string> = new Set(['KNOB X', 'RECORD'])

/** A key name as its cap prints it: any pad is PAD, ranges get an en dash, minus a real minus. */
export function capText(label: string): string {
  switch (label) {
    case 'pad':
      return 'PAD'
    case '0-9':
      return '0\u20139'
    case '1-9':
      return '1\u20139'
    case 'A-D':
      return 'A\u2013D'
    case '-':
      return '\u2212'
    default:
      return label
  }
}

/** "- +" sit side by side like the device's pair; other keys are joined by + or /. */
function joined(labels: readonly string[], n: number, either: boolean): boolean {
  return n > 0 && !(labels[n] === '+' && labels[n - 1] === '-' && !either)
}

export interface ComboLineProps {
  combo: Combo
  keymap: GuideKeymap
  /** The guide's own key text, read by screen readers instead of the caps. */
  spoken: string
  class?: string
}

/**
 * A guide entry's combo as one line of small caps: the mode it starts in (or
 * its situation) first, keys pressed together joined by +, steps by an arrow,
 * separate ways by "or". Screen readers get [spoken] (clearAndSetSemantics).
 */
export function ComboLine(props: ComboLineProps): JSX.Element {
  const { combo, keymap, spoken } = props
  const mode = keymap.mode
  return (
    <span class={`combo-line${props.class ? ` ${props.class}` : ''}`} role="img" aria-label={spoken}>
      {mode !== null ? (
        <Tag text={modeTag(mode)} tone="mode" />
      ) : combo.context !== null ? (
        <Tag text={combo.context} tone="context" />
      ) : null}
      {combo.options.map((option, i) => (
        <Fragment key={i}>
          {i > 0 && <span class="combo-line__word">{OR}</span>}
          {option.map((step, j) => {
            const labels = step.keys.map((k) => k.label)
            return (
              <Fragment key={j}>
                {j > 0 && <Arrow />}
                {step.keys.map((k, n) => (
                  // A tag stays on the line with its key (and, web only, the + or / before it).
                  <span key={n} class="combo-line__key">
                    {joined(labels, n, step.alternatives) && <Joiner text={step.alternatives ? '/' : '+'} />}
                    {k.action !== null && <ActionTag action={k.action} />}
                    <MiniCap label={k.label} />
                  </span>
                ))}
              </Fragment>
            )
          })}
        </Fragment>
      ))}
    </span>
  )
}

/**
 * The expanded entry's numbered steps (the combo's first way, as the K.O. II
 * illustration numbers them): a badge, what to do, and the keys to do it on.
 */
export function KeymapSteps(props: { keymap: GuideKeymap; class?: string }): JSX.Element {
  return (
    <ol class={`keymap-steps${props.class ? ` ${props.class}` : ''}`}>
      {props.keymap.steps.map((step, i) => {
        const labels = stepLabels(step)
        const typed = step.kind === 'TYPE'
        const spoken =
          stepName(i + 1) + ': ' + stepWord(step.kind) + (typed ? '' : ' ' + labels.map(capText).join(step.either ? ' / ' : ' + '))
        return (
          <li key={i} class="keymap-steps__step">
            {i > 0 && <Arrow />}
            <span class="keymap-steps__body" role="img" aria-label={spoken}>
              <StepBadge n={i + 1} hold={step.kind === 'HOLD'} />
              <span class="keymap-steps__word">{stepWord(step.kind)}</span>
              {/* Typing names its keys already ("on the pads"). */}
              {!typed &&
                labels.map((label, n) => (
                  <Fragment key={n}>
                    {joined(labels, n, step.either) && <Joiner text={step.either ? '/' : '+'} />}
                    <MiniCap label={label} />
                  </Fragment>
                ))}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** The pill numbering a step, in the hold colour for a held key and signal orange otherwise. */
export function StepBadge(props: { n: number; hold: boolean }): JSX.Element {
  return <span class={`step-badge${props.hold ? ' step-badge--hold' : ''}`}>{props.n}</span>
}

/** A whole set of panel keys named as one key in the combo notation. */
const SETS: readonly (readonly [readonly PanelKey[], string])[] = [
  [PADS, 'pad'],
  [DIGITS, '0-9'],
  [DIGITS.slice(1), '1-9'],
  [GROUPS, 'A-D'],
]

/** Each panel key's name in the combo notation ("KNOB X", "-"), for keys the notation names one by one. */
let keyNames: ReadonlyMap<PanelKey, string> | null = null
function keyName(k: PanelKey): string | undefined {
  if (keyNames === null) {
    const m = new Map<PanelKey, string>()
    for (const n of KEY_NAMES) {
      let keys: readonly PanelKey[]
      try {
        keys = keysFor(n)
      } catch {
        continue
      }
      if (keys.length === 1) m.set(keys[0]!, n)
    }
    keyNames = m
  }
  return keyNames.get(k)
}

/** A step's panel keys as key names: a whole set (any pad, the digits, the groups) as one. */
export function stepLabels(step: KeymapStep): string[] {
  let rest: readonly PanelKey[] = step.keys
  const named: [number, string][] = []
  for (const [set, name] of SETS) {
    if (set.every((k) => rest.includes(k))) {
      named.push([step.keys.indexOf(set[0]!), name])
      rest = rest.filter((k) => !set.includes(k))
    }
  }
  for (const k of rest) named.push([step.keys.indexOf(k), keyName(k) ?? panelLabel(k).toUpperCase()])
  return named.sort((a, b) => a[0] - b[0]).map((n) => n[1])
}

/** The colours of a key name's mini cap: signal (KNOB X, RECORD), pale, or dark. */
export function capTone(label: string): 'signal' | 'light' | 'dark' {
  return SIGNAL_KEYS.has(label) ? 'signal' : LIGHT_KEYS.has(label) ? 'light' : 'dark'
}

/** A small key cap in the device's colours, with the flat edge of every key in the app. */
function MiniCap(props: { label: string }): JSX.Element {
  return <span class={`mini-cap mini-cap--${capTone(props.label)}`}>{capText(props.label)}</span>
}

/** HOLD, TYPE, TURN, MOVE or 2\u00D7 before a key. */
function ActionTag(props: { action: KeyAction }): JSX.Element {
  const a = props.action
  return <Tag text={actionTag(a)} tone={a === 'HOLD' ? 'hold' : a === 'DIAL' ? 'dial' : 'plain'} />
}

function Tag(props: { text: string; tone: 'mode' | 'context' | 'hold' | 'dial' | 'plain' }): JSX.Element {
  return <span class={`guide-tag guide-tag--${props.tone}`}>{props.text}</span>
}

function Joiner(props: { text: string }): JSX.Element {
  return <span class="combo-line__word">{props.text}</span>
}

/** The arrow between steps, drawn so it lines up whatever the font. */
function Arrow(): JSX.Element {
  return (
    <svg class="combo-line__arrow" width="12" height="10" viewBox="0 0 12 10" aria-hidden="true" focusable="false">
      <path d="M0.7 5H11.3M7.3 1.5L11.3 5L7.3 8.5" />
    </svg>
  )
}

export interface CloseKeyProps {
  onClick: () => void
  /** contentDescription (e.g. GuideText.CLOSE). */
  description: string
  class?: string
  ref?: Ref<HTMLButtonElement>
}

/** A square grey key with a cross, for closing the guide; it presses down like the other keys. */
export function CloseKey(props: CloseKeyProps): JSX.Element {
  return (
    <button
      ref={props.ref}
      type="button"
      class={`close-key${props.class ? ` ${props.class}` : ''}`}
      aria-label={props.description}
      title={props.description}
      onClick={() => props.onClick()}
    >
      <span class="close-key__face" aria-hidden="true">
        <svg width="46" height="46" viewBox="0 0 46 46">
          <path d="M15 15L31 31M31 15L15 31" />
        </svg>
      </span>
    </button>
  )
}
