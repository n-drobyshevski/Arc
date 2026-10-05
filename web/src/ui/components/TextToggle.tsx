// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (TextToggle)
//
// A quiet switch between views: words side by side, the chosen one in ink and
// underlined with an 18x2 navy bar (like the pocket operator app's DRUMS /
// KEYPAD), the others graphite. Each word is min 40 high with 8px padding,
// 4px apart. On the web it is a tab list (arrow keys move and select).
import type { JSX, Ref } from 'preact'
import { useRef } from 'preact/hooks'
import { handleRovingKey } from './Segmented'
import './TextToggle.css'

export interface TextToggleProps {
  options: readonly string[]
  selected: number
  onSelect: (index: number) => void
  /** The list's name for screen readers. */
  label?: string
  /** id of the panel the selected tab shows (aria-controls). */
  controls?: string
  class?: string
  id?: string
  ref?: Ref<HTMLDivElement>
}

export function TextToggle(props: TextToggleProps): JSX.Element {
  const { options, selected, onSelect } = props
  const row = useRef<HTMLDivElement | null>(null)
  return (
    <div
      ref={(el: HTMLDivElement | null) => {
        row.current = el
        const r = props.ref
        if (typeof r === 'function') r(el)
        else if (r) r.current = el
      }}
      id={props.id}
      class={`text-toggle${props.class ? ` ${props.class}` : ''}`}
      role="tablist"
      aria-label={props.label}
      onKeyDown={(e) => handleRovingKey(e, selected, options.length, row.current, onSelect)}
    >
      {options.map((text, i) => {
        const on = i === selected
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={on ? props.controls : undefined}
            tabIndex={on || (selected < 0 && i === 0) ? 0 : -1}
            data-roving=""
            class={`text-toggle__word${on ? ' is-on' : ''}`}
            onClick={() => onSelect(i)}
          >
            <span class="text-toggle__text">{text}</span>
            <span class="text-toggle__bar" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
