// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (SwitchRow)
//
// A setting that is on or off: its name (bold) and note (small graphite), and
// an ON / OFF block (navy when on, min 56x34, radius 8). The whole row is the
// switch (role="switch"), padding 16/12, as the Kotlin Role.Switch row.
import type { JSX, Ref } from 'preact'
import { useId } from 'preact/hooks'
import { SettingsText } from '../../core/text/settingsText'
import './SwitchRow.css'

export interface SwitchRowProps {
  title: string
  note: string
  on: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  class?: string
  id?: string
  ref?: Ref<HTMLButtonElement>
}

export function SwitchRow(props: SwitchRowProps): JSX.Element {
  const { title, note, on, onChange, disabled = false } = props
  const titleId = useId()
  const noteId = useId()
  return (
    <button
      ref={props.ref}
      id={props.id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={titleId}
      aria-describedby={noteId}
      disabled={disabled}
      class={`switch-row${on ? ' is-on' : ''}${props.class ? ` ${props.class}` : ''}`}
      onClick={() => onChange(!on)}
    >
      <span class="switch-row__text">
        <span class="switch-row__title" id={titleId}>{title}</span>
        <span class="switch-row__note" id={noteId}>{note}</span>
      </span>
      <span class="switch-row__block" aria-hidden="true">{on ? SettingsText.ON : SettingsText.OFF}</span>
    </button>
  )
}
