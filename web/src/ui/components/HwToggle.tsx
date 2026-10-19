// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Rows.kt (HwToggle)
//
// An on/off setting as a hardware key (the Step 1c redesign, in place of
// SwitchRow's block): a small cap with an LED and ON / OFF. On, the cap is navy
// and stays down, its LED lit signal orange; off, a pale cap with an unlit LED.
// A role="switch" button; the row around it names it (labelledBy / describedBy).
import type { JSX, Ref } from 'preact'
import { SettingsText } from '../../core/text/settingsText'
import './HwToggle.css'

export interface HwToggleProps {
  on: boolean
  onChange: (on: boolean) => void
  /** The switch's name, when no visible label names it ([labelledBy]). */
  label?: string
  /** id of the visible name (SettingRow's title). */
  labelledBy?: string
  /** id of the note that describes it. */
  describedBy?: string
  disabled?: boolean
  class?: string
  id?: string
  ref?: Ref<HTMLButtonElement>
}

export function HwToggle(props: HwToggleProps): JSX.Element {
  const { on, onChange, disabled = false } = props
  return (
    <button
      ref={props.ref}
      id={props.id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      aria-describedby={props.describedBy}
      disabled={disabled}
      class={`hw-toggle cap-3d${on ? ' is-on is-down' : ''}${props.class ? ` ${props.class}` : ''}`}
      onClick={() => onChange(!on)}
    >
      <span class="hw-toggle__led" aria-hidden="true" />
      <span class="hw-toggle__text" aria-hidden="true">{on ? SettingsText.ON : SettingsText.OFF}</span>
    </button>
  )
}
