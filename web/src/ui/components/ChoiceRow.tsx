// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (ChoiceRow)
//
// A radio or checkbox row on a pale key-coloured plate (`.radio` / `.check`):
// radius 10, padding 12/14, 12px gap; a 20px control in signal (graphite when
// unselected), the text in semi ink, an optional trailing note in small
// graphite. The whole row is the label of a native input, so it is
// keyboard- and screen-reader-ready; the row has no press styling.
import type { JSX, Ref, TargetedEvent, TargetedMouseEvent } from 'preact'
import './ChoiceRow.css'

export interface ChoiceRowProps {
  text: string
  selected: boolean
  onClick: () => void
  /** Radio (true) or checkbox (false). */
  radio: boolean
  disabled?: boolean
  trailing?: string | null
  /** Radio group name, so arrow keys move between the radios of one group. */
  name?: string
  class?: string
  id?: string
  ref?: Ref<HTMLInputElement>
}

export function ChoiceRow(props: ChoiceRowProps): JSX.Element {
  const { text, selected, onClick, radio, disabled = false, trailing } = props
  const control = {
    ref: props.ref,
    id: props.id,
    class: `choice-row__control choice-row__control--${radio ? 'radio' : 'check'}`,
    name: props.name,
    checked: selected,
    disabled,
    onChange: (e: TargetedEvent<HTMLInputElement>) => {
      // The caller owns the state: show [selected] until it re-renders.
      e.currentTarget.checked = selected
      onClick()
    },
    onClick: (e: TargetedMouseEvent<HTMLInputElement>) => {
      // A radio that is already selected sends no change; Compose still calls onClick.
      if (radio && selected) {
        e.currentTarget.checked = true
        onClick()
      }
    },
  }
  return (
    <label class={`choice-row${disabled ? ' is-disabled' : ''}${props.class ? ` ${props.class}` : ''}`}>
      {radio ? <input type="radio" {...control} /> : <input type="checkbox" {...control} />}
      <span class="choice-row__text">{text}</span>
      {trailing != null && <span class="choice-row__trailing">{trailing}</span>}
    </label>
  )
}
