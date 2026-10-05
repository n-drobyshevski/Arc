// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (Caption)
//
// A small uppercase label above a panel ("VIDEO", "KEYPAD" in the pocket
// operator app): caps style, graphite, one line with an ellipsis, full width,
// centred unless told otherwise.
import type { JSX } from 'preact'
import './Caption.css'

export interface CaptionProps {
  /** The text as written; the caption uppercases it. */
  text: string
  /** Text colour (default var(--graphite)). */
  color?: string
  /** TextAlign (default 'center'). */
  align?: 'center' | 'start' | 'end'
  /** Element to render; a section caption can be a heading (default 'p'). */
  as?: 'p' | 'div' | 'span' | 'h1' | 'h2' | 'h3'
  class?: string
  id?: string
}

export function Caption(props: CaptionProps): JSX.Element {
  const { text, color, align = 'center', as: Tag = 'p', id } = props
  return (
    <Tag
      id={id}
      class={`caption caption--${align}${props.class ? ` ${props.class}` : ''}`}
      style={color ? { color } : undefined}
    >
      {text}
    </Tag>
  )
}
