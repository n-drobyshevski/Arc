// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/DeckKeys.kt (DeckStrip, DeckKey, DeckStyle, DeckGlyph, drawGlyph)
//
// The keys under a page's glass (an addition: Live tools' Takes and Claude
// pages, as the device's display): caps with a drawn glyph over a word, in one
// row where each gets KEY_MIN, else two rows of half each.
//
// Web deltas:
// - The strip measures its own width (a ResizeObserver) where Compose's
//   BoxWithConstraints is given it.
// - A glyph is an inline SVG drawn on a 100 × 100 box in currentColor, the
//   same shapes as drawGlyph's on its square.
// - VOICE is a web glyph (a speech bubble): Takes' voice message key, which
//   Android folds into SHARE.
// - A switch is read on or off from aria-checked (Kotlin's stateDescription).
// - KeyGrid and WordKey (the Claude page's prompt words) and DeckKey's hold
//   (PASTE's) come with the Claude page's port.
import type { JSX } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import './DeckKeys.css'

/** The narrowest a key of the strip gets; under it the strip takes two rows. */
const KEY_MIN = 48
const KEY_GAP = 7

/** enum class DeckStyle. */
export type DeckStyle = 'normal' | 'signal' | 'navy'

/** enum class DeckGlyph, and the web's VOICE. */
export type DeckGlyph =
  | 'dot' | 'play' | 'stop' | 'share' | 'trim' | 'dup' | 'start' | 'end' | 'reset' | 'done' | 'save' | 'send' | 'delete'
  | 'scene' | 'pattern' | 'chain' | 'paste' | 'edit' | 'next' | 'voice'

/** How many keys of [count] go in a row of [width] px: all where each gets KEY_MIN, else half (rounded up). */
export function deckPerRow(width: number, count: number): number {
  return width >= KEY_MIN * count + KEY_GAP * (count - 1) ? count : Math.ceil(count / 2)
}

/** The strip: [keys] in one row, or two where the row is too narrow for them all. */
export function DeckStrip(props: { keys: readonly JSX.Element[] }): JSX.Element {
  const keys = props.keys
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    const put = (): void => setWidth(node.clientWidth)
    put()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(put) : null
    ro?.observe(node)
    return () => ro?.disconnect()
  }, [])
  const perRow = Math.max(1, deckPerRow(width, keys.length))
  const rows: JSX.Element[][] = []
  for (let i = 0; i < keys.length; i += perRow) rows.push(keys.slice(i, i + perRow))
  return (
    <div ref={ref} class="deck-strip">
      {rows.map((row, i) => (
        <div key={i} class="deck-strip__row">
          {row}
        </div>
      ))}
    </div>
  )
}

export interface DeckKeyProps {
  glyph: DeckGlyph
  /** The word under the glyph, upper-cased where shown. */
  label: string
  /** What a screen reader reads (the key's name). */
  description: string
  onClick: () => void
  style?: DeckStyle
  enabled?: boolean
  /** The glyph's colour where it isn't the label's (TAKE's signal dot). */
  glyphColor?: string
  /** One of a set of choices (read as selected or not). */
  selected?: boolean
  /** A switch (read as on or off). */
  checked?: boolean
}

/**
 * A key of the strip: a cap with [glyph] over its [label], read as
 * [description]. With [selected] it is one of a set of choices, with
 * [checked] a switch.
 */
export function DeckKey(props: DeckKeyProps): JSX.Element {
  const { style = 'normal', enabled = true } = props
  const role = props.selected !== undefined ? 'radio' : props.checked !== undefined ? 'switch' : undefined
  return (
    <button
      type="button"
      class={`deck-key deck-key--${style} cap-3d`}
      role={role}
      aria-checked={props.selected ?? props.checked}
      aria-label={props.description}
      disabled={!enabled}
      onClick={() => props.onClick()}
    >
      <Glyph glyph={props.glyph} color={props.glyphColor} />
      <span class="deck-key__label" aria-hidden="true">
        {props.label.toUpperCase()}
      </span>
    </button>
  )
}

/** A glyph of the strip's keys (drawGlyph), [size] px square, in [color] or the text's. */
export function Glyph(props: { glyph: DeckGlyph; color?: string; size?: number; class?: string }): JSX.Element {
  const size = props.size ?? 18
  return (
    <svg
      class={`deck-glyph${props.class ? ` ${props.class}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={props.color ? { color: props.color } : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {shape(props.glyph)}
    </svg>
  )
}

// drawGlyph's stroke: 12% of the square, round ends.
const S = { fill: 'none', stroke: 'currentColor', 'stroke-width': 12, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const

function line(x1: number, y1: number, x2: number, y2: number): JSX.Element {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} {...S} />
}

function shape(glyph: DeckGlyph): JSX.Element {
  switch (glyph) {
    case 'dot':
      return <circle cx={50} cy={50} r={30} fill="currentColor" />
    case 'play':
      return <path d="M22 12L88 50L22 88Z" fill="currentColor" />
    case 'stop':
      return <rect x={20} y={20} width={60} height={60} fill="currentColor" />
    case 'share':
      return (
        <>
          {line(22, 78, 78, 22)}
          {line(38, 22, 78, 22)}
          {line(78, 22, 78, 62)}
        </>
      )
    // Scissors: two blades crossing above two rings.
    case 'trim':
      return (
        <>
          {line(30, 12, 62, 62)}
          {line(70, 12, 38, 62)}
          <circle cx={28} cy={76} r={14} {...S} />
          <circle cx={72} cy={76} r={14} {...S} />
        </>
      )
    // Two sheets, one over the other.
    case 'dup':
      return (
        <>
          <rect x={12} y={12} width={50} height={50} rx={7} {...S} />
          <rect x={38} y={38} width={50} height={50} rx={7} fill="currentColor" />
        </>
      )
    // A bracket opening right, and one closing.
    case 'start':
    case 'end': {
      const [x0, x1] = glyph === 'start' ? [32, 62] : [68, 38]
      return (
        <>
          {line(x0, 12, x0, 88)}
          {line(x0, 12, x1, 12)}
          {line(x0, 88, x1, 88)}
        </>
      )
    }
    // A ring nearly closed (from -60° round 290°), with its arrow's head.
    case 'reset':
      return (
        <>
          <path d="M66 22.29A32 32 0 1 1 29.43 25.49" {...S} />
          {line(66, 6, 68, 26)}
          {line(68, 26, 86, 18)}
        </>
      )
    case 'done':
      return (
        <>
          {line(16, 52, 40, 76)}
          {line(40, 76, 86, 26)}
        </>
      )
    case 'save':
      return (
        <>
          {line(50, 10, 50, 66)}
          {line(26, 44, 50, 68)}
          {line(74, 44, 50, 68)}
          {line(18, 90, 82, 90)}
        </>
      )
    case 'send':
      return (
        <>
          {line(12, 50, 86, 50)}
          {line(56, 22, 86, 50)}
          {line(56, 78, 86, 50)}
        </>
      )
    case 'delete':
      return (
        <>
          {line(24, 24, 76, 76)}
          {line(76, 24, 24, 76)}
        </>
      )
    // Four groups' rows of steps.
    case 'scene':
      return (
        <>
          {[0, 1, 2, 3].map((r) => (
            <rect key={r} x={10} y={12 + r * 21} width={80} height={13} rx={4} fill="currentColor" />
          ))}
        </>
      )
    // One group's steps.
    case 'pattern':
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={6 + i * 23} y={40} width={17} height={20} rx={4} fill="currentColor" />
          ))}
        </>
      )
    // Scenes linked in a row.
    case 'chain':
      return (
        <>
          {line(20, 50, 80, 50)}
          {[16, 50, 84].map((x) => (
            <circle key={x} cx={x} cy={50} r={13} fill="currentColor" />
          ))}
        </>
      )
    // A pencil, its point down to the left.
    case 'edit':
      return (
        <>
          {line(20, 66, 64, 22)}
          {line(34, 80, 78, 36)}
          {line(64, 22, 78, 36)}
          {line(20, 66, 12, 88)}
          {line(12, 88, 34, 80)}
        </>
      )
    case 'next':
      return (
        <>
          {line(36, 18, 68, 50)}
          {line(68, 50, 36, 82)}
        </>
      )
    // A clipboard.
    case 'paste':
      return (
        <>
          <rect x={20} y={18} width={60} height={72} rx={8} {...S} />
          <rect x={36} y={8} width={28} height={18} rx={5} fill="currentColor" />
          {line(34, 50, 66, 50)}
          {line(34, 68, 58, 68)}
        </>
      )
    // Web: a speech bubble with its tail down to the left.
    case 'voice':
      return (
        <>
          <path d="M18 14H82Q88 14 88 20V60Q88 66 82 66H40L18 86Z" {...S} />
          {line(36, 40, 36, 40)}
          {line(52, 40, 52, 40)}
          {line(68, 40, 68, 40)}
        </>
      )
  }
}
