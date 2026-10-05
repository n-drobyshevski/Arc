// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (Segmented)
//
// A row of equal blocks to choose one of a few values (Theme, Keep, Pad order):
// navy when selected, pale grey otherwise, like the tabs. Gap 8, min height 44,
// radius 10, padding 10/12, capsKeySmall. On the web it is a radio group:
// one tab stop, arrow keys move the choice.
import type { JSX, TargetedKeyboardEvent } from 'preact'
import { useRef } from 'preact/hooks'
import './Segmented.css'

/**
 * Roving focus for a one-of-n row: the index [key] moves to from [current]
 * (ArrowLeft/Up back, ArrowRight/Down on, wrapping; Home/End to the ends), or
 * null when the key is not a navigation key. RTL flips left and right.
 */
export function rovingIndex(current: number, key: string, count: number, rtl = false): number | null {
  if (count <= 0) return null
  const from = current < 0 || current >= count ? 0 : current
  const back = rtl ? 'ArrowRight' : 'ArrowLeft'
  const on = rtl ? 'ArrowLeft' : 'ArrowRight'
  switch (key) {
    case back:
    case 'ArrowUp':
      return (from - 1 + count) % count
    case on:
    case 'ArrowDown':
      return (from + 1) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/** Handles a roving key press inside [container]: selects and focuses the new item. */
export function handleRovingKey(
  e: TargetedKeyboardEvent<HTMLElement>,
  current: number,
  count: number,
  container: HTMLElement | null,
  onSelect: (i: number) => void,
): void {
  const rtl = container ? getComputedStyle(container).direction === 'rtl' : false
  const next = rovingIndex(current, e.key, count, rtl)
  if (next === null) return
  e.preventDefault()
  if (next !== current) onSelect(next)
  const items = container?.querySelectorAll<HTMLElement>('[data-roving]')
  items?.[next]?.focus()
}

export interface SegmentedProps {
  options: readonly string[]
  selected: number
  onSelect: (index: number) => void
  /** The group's name for screen readers (usually the label above it). */
  label?: string
  /** id of the visible label, instead of [label]. */
  labelledBy?: string
  class?: string
  id?: string
}

export function Segmented(props: SegmentedProps): JSX.Element {
  const { options, selected, onSelect } = props
  const row = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={row}
      id={props.id}
      class={`segmented${props.class ? ` ${props.class}` : ''}`}
      role="radiogroup"
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      onKeyDown={(e) => handleRovingKey(e, selected, options.length, row.current, onSelect)}
    >
      {options.map((text, i) => {
        const on = i === selected
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (selected < 0 && i === 0) ? 0 : -1}
            data-roving=""
            class={`segmented__block cap-3d${on ? ' is-on is-down' : ''}`}
            onClick={() => onSelect(i)}
          >
            <span class="segmented__text">{text}</span>
          </button>
        )
      })}
    </div>
  )
}
