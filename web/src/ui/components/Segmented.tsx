// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (Segmented)
//
// A row of equal blocks to choose one of a few values (Theme, Keep, Pad order):
// navy when selected, pale grey otherwise, like the tabs. Gap 8, min height 44,
// radius 10, padding 10/12, capsKeySmall. On the web it is a radio group:
// one tab stop, arrow keys move the choice.
//
// [compact] (the Step 1c rows): small pale caps sized to their words, sitting
// on the right of a SettingRow; with [fill] they share the full width. A
// choice can be [disabled] (greyed, skipped by the arrow keys, its reason in
// [disabledNote]), and [descriptions] give the screen-reader names.
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

/**
 * [rovingIndex], stepping over the items [skip] names (disabled choices): the
 * next one in the key's direction that isn't skipped, or null if none is.
 */
export function rovingIndexSkipping(
  current: number,
  key: string,
  count: number,
  skip: (i: number) => boolean,
  rtl = false,
): number | null {
  let at = current
  for (let n = 0; n < count; n++) {
    const next = rovingIndex(at, key, count, rtl)
    if (next === null) return null
    if (!skip(next)) return next
    // Home / End land on an end: walk inwards from there.
    at = next
    if (key === 'Home') key = rtl ? 'ArrowLeft' : 'ArrowRight'
    else if (key === 'End') key = rtl ? 'ArrowRight' : 'ArrowLeft'
  }
  return null
}

/** Handles a roving key press inside [container]: selects and focuses the new item. */
export function handleRovingKey(
  e: TargetedKeyboardEvent<HTMLElement>,
  current: number,
  count: number,
  container: HTMLElement | null,
  onSelect: (i: number) => void,
  skip?: (i: number) => boolean,
): void {
  const rtl = container ? getComputedStyle(container).direction === 'rtl' : false
  const next = skip ? rovingIndexSkipping(current, e.key, count, skip, rtl) : rovingIndex(current, e.key, count, rtl)
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
  /** id of the note that describes the group (SettingRow's note). */
  describedBy?: string | undefined
  /** Small caps sized to their words (a SettingRow's control). */
  compact?: boolean
  /** With [compact]: the caps share the full width. */
  fill?: boolean
  /** Per option: greyed out and not selectable (the chosen one never is). */
  disabled?: readonly boolean[]
  /** Why a disabled option is greyed out (its tooltip and description). */
  disabledNote?: string
  /** Per option: the name screen readers read, when the word alone is too short. */
  descriptions?: readonly string[]
  class?: string
  id?: string
}

export function Segmented(props: SegmentedProps): JSX.Element {
  const { options, selected, onSelect, compact = false } = props
  const row = useRef<HTMLDivElement>(null)
  const off = (i: number): boolean => i !== selected && (props.disabled?.[i] ?? false)
  const cls =
    'segmented' +
    (compact ? ' segmented--compact' : '') +
    (compact && props.fill ? ' segmented--fill' : '') +
    (props.class ? ` ${props.class}` : '')
  return (
    <div
      ref={row}
      id={props.id}
      class={cls}
      role="radiogroup"
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      aria-describedby={props.describedBy}
      onKeyDown={(e) => handleRovingKey(e, selected, options.length, row.current, onSelect, props.disabled ? off : undefined)}
    >
      {options.map((text, i) => {
        const on = i === selected
        const disabled = off(i)
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={props.descriptions?.[i]}
            aria-disabled={disabled || undefined}
            title={disabled ? props.disabledNote : undefined}
            aria-description={disabled ? props.disabledNote : undefined}
            tabIndex={on || (selected < 0 && i === 0) ? 0 : -1}
            data-roving=""
            class={`segmented__block cap-3d${on ? ' is-on is-down' : ''}${disabled ? ' is-disabled' : ''}`}
            onClick={() => {
              if (!disabled) onSelect(i)
            }}
          >
            <span class="segmented__text">{text}</span>
          </button>
        )
      })}
    </div>
  )
}
