// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/GuideKeys.kt
//
// Key caps for the shortcut guide, drawn after the device: pale keys (SHIFT,
// - and +), dark keys, dark square pads with their label in the corner,
// knobs and the fader. A badge above a key says what to do with it (HOLD,
// DIAL, TURN, MOVE, 2×). These are the device's own colours, so they stay the
// same in the dark theme (--guide-* tokens).
import { Fragment } from 'preact'
import type { JSX, Ref } from 'preact'
import type { Combo, ComboStep, KeyAction, KeyCap } from '../../core/text/guideCombo'
import { OR, THEN, badge } from '../../core/text/guideText'
import './GuideKeys.css'

export interface ComboViewProps {
  combo: Combo
  /** The guide's own key text, read by screen readers instead of the caps. */
  spoken: string
  class?: string
}

/** A guide entry's keys as caps. Screen readers get [spoken] (clearAndSetSemantics). */
export function ComboView(props: ComboViewProps): JSX.Element {
  const { combo, spoken } = props
  return (
    <div class={`combo${props.class ? ` ${props.class}` : ''}`} role="img" aria-label={spoken}>
      {combo.context !== null && <span class="combo__note t-small" aria-hidden="true">{combo.context}</span>}
      {combo.options.map((option, i) => (
        <Fragment key={i}>
          {i > 0 && <span class="combo__note t-small" aria-hidden="true">{OR}</span>}
          <div class="combo__row" aria-hidden="true">
            {option.map((step, j) => (
              <Fragment key={j}>
                {j > 0 && <Joiner text={THEN} small />}
                <Step step={step} />
              </Fragment>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

function Step(props: { step: ComboStep }): JSX.Element {
  const { keys, alternatives } = props.step
  const badges = keys.some((k) => k.action !== null)
  return (
    <span class="combo__step">
      {keys.map((k, i) => (
        <Fragment key={i}>
          {/* "- +" sit side by side like the device's pair; other keys are joined by + or /. */}
          {i > 0 && !(k.label === '+' && keys[i - 1]?.label === '-' && !alternatives) && (
            <Joiner text={alternatives ? '/' : '+'} small={false} />
          )}
          <Cap cap={k} badgeSpace={badges} />
        </Fragment>
      ))}
    </span>
  )
}

/** As tall as a dark key, so the joiner sits on its middle (rows align at the bottom). */
function Joiner(props: { text: string; small: boolean }): JSX.Element {
  return <span class={`combo__joiner${props.small ? ' combo__joiner--small t-small' : ''}`}>{props.text}</span>
}

/** One key cap, with its badge slot above when any key of the step has a badge. */
export function Cap(props: { cap: KeyCap; badgeSpace: boolean }): JSX.Element {
  const k = props.cap
  return (
    <span class="cap">
      {props.badgeSpace && <span class="cap__badge-slot">{k.action !== null && <Badge action={k.action} />}</span>}
      <CapFace cap={k} />
    </span>
  )
}

function CapFace(props: { cap: KeyCap }): JSX.Element {
  const k = props.cap
  switch (k.kind) {
    case 'LIGHT':
      if (k.label === '-' || k.label === '+') {
        return (
          <KeyFace w={44} h={44} tone="light">
            <Glyph label={k.label} />
          </KeyFace>
        )
      }
      return (
        <KeyFace w={54} h={32} tone="light">
          <span class="cap__text">{k.label}</span>
        </KeyFace>
      )
    case 'DARK':
      return (
        <KeyFace w={k.label.length <= 3 ? 40 : 58} h={32} tone="dark">
          <span class="cap__text">{k.label}</span>
        </KeyFace>
      )
    case 'PAD':
      return (
        <KeyFace w={50} h={50} tone="dark" corner>
          <span class={`cap__text cap__pad-label${k.label === 'ENTER' || k.label === 'pad' ? ' cap__pad-label--small' : ''}`}>
            {padLabel(k.label)}
          </span>
        </KeyFace>
      )
    case 'KNOB':
      return <Knob axis={k.label.replace(/^KNOB /, '').trim()} />
    case 'FADER':
      return <Fader />
  }
}

function padLabel(label: string): string {
  switch (label) {
    // Any pad: named, so the cap doesn't read as a blank key.
    case 'pad':
      return 'PAD'
    case '0-9':
      return '0–9'
    case '1-9':
      return '1–9'
    default:
      return label
  }
}

/** A key face with a darker edge 2px right and 3px down (box w × h+3, face w-2 × h, radius 6). */
function KeyFace(props: { w: number; h: number; tone: 'light' | 'dark'; corner?: boolean; children: JSX.Element }): JSX.Element {
  const { w, h } = props
  return (
    <span class={`cap__key cap__key--${props.tone}`} style={{ width: `${w}px`, height: `${h + 3}px` }}>
      <span
        class={`cap__face${props.corner ? ' cap__face--corner' : ''}`}
        style={{ width: `${w - 2}px`, height: `${h}px` }}
      >
        {props.children}
      </span>
    </span>
  )
}

/** - and + drawn as strokes, so they line up whatever the font. */
function Glyph(props: { label: string }): JSX.Element {
  return (
    <svg class="cap__glyph" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d={props.label === '+' ? 'M0 9H18M9 0V18' : 'M0 9H18'} />
    </svg>
  )
}

function Knob(props: { axis: string }): JSX.Element {
  return (
    <span class="cap__knob">
      <span class="cap__knob-face">
        <span class="cap__text cap__knob-label">{props.axis}</span>
      </span>
    </span>
  )
}

/** Named above the drawing (rows of keys line up at the bottom). */
function Fader(): JSX.Element {
  return (
    <span class="cap__fader">
      <span class="cap__text cap__fader-label">FADER</span>
      <span class="cap__fader-track">
        <span class="cap__fader-cap" />
      </span>
    </span>
  )
}

function Badge(props: { action: KeyAction }): JSX.Element {
  const tone = props.action === 'HOLD' ? 'hold' : props.action === 'DIAL' ? 'dial' : 'plain'
  return (
    <span class={`cap__badge cap__badge--${tone}`}>
      <span class="cap__badge-text">{badge(props.action)}</span>
      {/* The small arrow from the badge down to its key. */}
      <svg class="cap__badge-arrow" width="8" height="7" viewBox="0 0 8 7" aria-hidden="true">
        <path d="M4 0V7M1 4L4 7L7 4" />
      </svg>
    </span>
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
