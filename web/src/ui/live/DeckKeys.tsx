// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/DeckKeys.kt (DeckStrip, DeckKey, DeckStyle, DeckGlyph, drawGlyph, KeyGrid, WordKey)
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
// - [DeckKeyProps.focusable] keeps an off key in the tab order (aria-disabled),
//   so a key that turns itself off (TRIM's END) doesn't drop the focus.
// - DeckKey's hold (Compose's onLongClick, the Claude page's PASTE) is held
//   for HOLD_MS, a pointer or Enter or Space, as IconBlock's onHold: a bar
//   fills along the key's foot meanwhile, and it acts as it is let go of
//   once the bar is full, not as the bar fills (a browser opens a file
//   picker on a touch's release, not mid-press). [DeckKeyProps.describedBy]
//   points a screen reader at the hint that tells of it (Kotlin's
//   onLongClickLabel).
// - [useHold] is exported: the Claude page's saved prompts are held to be
//   deleted the same way.
// - KeyGrid takes a [label] for screen readers (a group named after the word
//   its answers change). A WordKey that is one of a set of choices is a radio
//   (Kotlin's RadioButton role), one that is in or out a checkbox.
import type { ButtonHTMLAttributes, JSX, Ref, TargetedKeyboardEvent, TargetedPointerEvent } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { HOLD_MS } from '../components/IconBlock'
import { useHaptic } from '../useHaptic'
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
  /** Off ([enabled] false), still focusable: read as unavailable, a tap does nothing. */
  focusable?: boolean
  /** The key's button, to put the focus back on it. */
  keyRef?: Ref<HTMLButtonElement>
  /** Held (Kotlin onLongClick): called as a hold of HOLD_MS is let go of; a tap is then [onClick]'s. */
  onHold?: () => void
  /** Web: the id of what says how the key is used (aria-describedby; the hold's hint). */
  describedBy?: string
}

/**
 * A key of the strip: a cap with [glyph] over its [label], read as
 * [description]. With [selected] it is one of a set of choices, with
 * [checked] a switch.
 */
export function DeckKey(props: DeckKeyProps): JSX.Element {
  const { style = 'normal', enabled = true } = props
  const off = !enabled && props.focusable === true
  const role = props.selected !== undefined ? 'radio' : props.checked !== undefined ? 'switch' : undefined
  const hold = useHold(props.onHold, props.onClick, enabled)
  return (
    <button
      type="button"
      class={`deck-key deck-key--${style} cap-3d`}
      role={role}
      aria-checked={props.selected ?? props.checked}
      aria-label={props.description}
      aria-describedby={props.describedBy}
      ref={props.keyRef}
      disabled={!enabled && !off}
      aria-disabled={off || undefined}
      {...hold.handlers}
      onClick={() => {
        if (hold.swallow()) return
        if (enabled) props.onClick()
      }}
    >
      <Glyph glyph={props.glyph} color={props.glyphColor} />
      <span class="deck-key__label" aria-hidden="true">
        {props.label.toUpperCase()}
      </span>
      {hold.holding && <span class="deck-key__hold" style={{ animationDuration: `${HOLD_MS}ms` }} aria-hidden="true" />}
    </button>
  )
}

/**
 * The answers to a question on the glass (an addition: the Claude page's
 * prompt words): [keys] in rows of [columns], the last row's gaps left empty
 * so each key keeps its width.
 */
export function KeyGrid(props: { keys: readonly JSX.Element[]; columns?: number; label?: string }): JSX.Element {
  const columns = props.columns ?? 4
  const rows: JSX.Element[][] = []
  for (let i = 0; i < props.keys.length; i += columns) rows.push(props.keys.slice(i, i + columns))
  return (
    <div class="deck-strip" role={props.label !== undefined ? 'group' : undefined} aria-label={props.label}>
      {rows.map((row, i) => (
        <div key={i} class="deck-strip__row">
          {row}
          {Array.from({ length: columns - row.length }, (_, j) => (
            <span key={`gap${j}`} class="deck-strip__gap" aria-hidden="true" />
          ))}
        </div>
      ))}
    </div>
  )
}

export interface WordKeyProps {
  /** The word on the key, upper-cased where shown. */
  label: string
  /** What a screen reader reads. */
  description: string
  onClick: () => void
  /** The line under the word ("118-126"). */
  sub?: string
  /** The one picked of a set (read as such). */
  selected?: boolean
  /** A part that is in or out (read as checked or not). */
  checked?: boolean
  enabled?: boolean
}

/**
 * A key with a word on it instead of a glyph (an answer: "Dub" over
 * "118-126"): navy when it is the one picked ([selected]) or a part that is in
 * ([checked]).
 */
export function WordKey(props: WordKeyProps): JSX.Element {
  const { enabled = true } = props
  const on = props.selected === true || props.checked === true
  const role = props.checked !== undefined ? 'checkbox' : props.selected !== undefined ? 'radio' : undefined
  // One word shrinks to fit rather than break; two or more may take two lines.
  const words = props.label.trim().includes(' ')
  return (
    <button
      type="button"
      class={`deck-key word-key cap-3d${on ? ' deck-key--navy' : ''}`}
      role={role}
      aria-checked={props.checked ?? props.selected}
      aria-label={props.description}
      disabled={!enabled}
      onClick={() => {
        if (enabled) props.onClick()
      }}
    >
      <span class={`word-key__label${words ? ' is-words' : ''}`} aria-hidden="true">
        {props.label.toUpperCase()}
      </span>
      {props.sub !== undefined && (
        <span class="word-key__sub" aria-hidden="true">
          {props.sub}
        </span>
      )}
    </button>
  )
}

/** Movement (px) that turns a press into a scroll and drops the hold. */
const SLOP = 10

/**
 * A key's hold, when it has [onHold]: a pointer or Enter or Space held for
 * HOLD_MS fills the bar (felt as a confirm), and letting go then calls it,
 * the click that follows swallowed; let go early, it is a tap ([onTap], Enter's
 * and Space's handled here). Without [onHold] it adds nothing.
 */
export function useHold(
  onHold: (() => void) | undefined,
  onTap: () => void,
  enabled: boolean,
): { holding: boolean; swallow: () => boolean; handlers: ButtonHTMLAttributes<HTMLButtonElement> } {
  const [holding, setHolding] = useState(false)
  const feel = useHaptic()
  const timer = useRef<number | null>(null)
  // The bar is full: letting go acts.
  const ready = useRef(false)
  const byKey = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swallowNext = useRef(false)
  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  const stop = (): void => {
    clear()
    ready.current = false
    byKey.current = false
    start.current = null
    setHolding(false)
  }
  // A key that goes off mid-hold must not act when it is let go of.
  useEffect(() => {
    if (!enabled) stop()
  }, [enabled])
  if (onHold === undefined) return { holding: false, swallow: () => false, handlers: {} }
  const begin = (): void => {
    clear()
    ready.current = false
    setHolding(true)
    timer.current = window.setTimeout(() => {
      timer.current = null
      ready.current = true
      feel('confirm')
    }, HOLD_MS)
  }
  // Let go: the hold's, when the bar is full (whether it acted).
  const letGo = (): boolean => {
    const done = ready.current
    stop()
    if (done) onHold()
    return done
  }
  const activates = (e: KeyboardEvent): boolean => e.key === 'Enter' || e.key === ' '
  return {
    holding,
    swallow: () => {
      const s = swallowNext.current
      swallowNext.current = false
      return s
    },
    handlers: {
      onPointerDown: (e: TargetedPointerEvent<HTMLButtonElement>) => {
        swallowNext.current = false
        if (!enabled || byKey.current || (e.pointerType === 'mouse' && e.button !== 0)) return
        start.current = { x: e.clientX, y: e.clientY }
        begin()
      },
      onPointerMove: (e: TargetedPointerEvent<HTMLButtonElement>) => {
        const s = start.current
        if (s !== null && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) stop()
      },
      onPointerUp: () => {
        if (byKey.current || start.current === null) return
        if (letGo()) swallowNext.current = true
      },
      onPointerCancel: () => {
        if (!byKey.current) stop()
      },
      onPointerLeave: () => {
        if (!byKey.current) stop()
      },
      onContextMenu: (e: Event) => {
        if (start.current !== null) e.preventDefault()
      },
      // The browser's click (Enter's keydown, Space's keyup) is held back: the tap is let go of here.
      onKeyDown: (e: TargetedKeyboardEvent<HTMLButtonElement>) => {
        if (!enabled || !activates(e)) return
        e.preventDefault()
        if (e.repeat || byKey.current) return
        byKey.current = true
        begin()
      },
      onKeyUp: (e: TargetedKeyboardEvent<HTMLButtonElement>) => {
        if (!activates(e)) return
        e.preventDefault()
        if (!byKey.current) return
        if (!letGo()) onTap()
      },
      onBlur: stop,
    },
  }
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
