// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Icons.kt (IconBlock)
//
// A square (or round) icon key. Long-press (500 ms) shows its name in a small
// tooltip below it, as the Material PlainTooltip does on Android, and the click
// that would follow the long press is swallowed. Screen readers read [label]
// (aria-label); mouse and keyboard users get it as the native title.
// Faded to .4 when disabled; a black 12% overlay while pressed.
//
// Web only: [checked] makes the key one radio of a group (the desk's theme
// switch, ThemeSwitch.tsx): role=radio with aria-checked, held down while
// checked, and a [data-roving] item for the group's arrow keys ([tabIndex]).
import type { CSSProperties, JSX, Ref, TargetedPointerEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Icon, type ArcIcon } from './Icons'
import './IconBlock.css'

/** Material's long-press timeout (ViewConfiguration.longPressTimeoutMillis). */
export const LONG_PRESS_MS = 500
/** How long the tooltip stays up after a long press (Material TooltipDefaults: 1500 ms). */
export const TOOLTIP_MS = 1500

export interface LongPressTimers {
  set(fn: () => void, ms: number): number
  clear(handle: number): void
}

export interface LongPress {
  /** Pointer went down on the control. */
  down(): void
  /** Pointer went up normally. */
  up(): void
  /** Pointer left, was cancelled, or moved too far: no long press. */
  cancel(): void
  /**
   * Called from the click handler: true when this click ends a long press and
   * must be ignored. Resets, so the next click goes through.
   */
  consumeClick(): boolean
  /** Clears any pending timer (unmount). */
  dispose(): void
}

/**
 * Long-press timing, apart from the DOM so it can be tested: [onLongPress]
 * fires [delay] ms after down() unless up()/cancel() comes first, and the click
 * the browser sends after that pointer-up is reported by consumeClick().
 */
export function createLongPress(onLongPress: () => void, timers: LongPressTimers, delay = LONG_PRESS_MS): LongPress {
  let handle: number | null = null
  let fired = false
  const stop = (): void => {
    if (handle !== null) timers.clear(handle)
    handle = null
  }
  return {
    down() {
      stop()
      fired = false
      handle = timers.set(() => {
        handle = null
        fired = true
        onLongPress()
      }, delay)
    },
    up() { stop() },
    cancel() { stop() },
    consumeClick() {
      const swallow = fired
      fired = false
      return swallow
    },
    dispose() { stop() },
  }
}

export type TipAlign = 'start' | 'center' | 'end'

/**
 * Where the tooltip sits under its anchor: centred, unless that would cross the
 * viewport edge (8px margin), then flush with the anchor's start or end.
 */
export function tipAlign(left: number, right: number, viewport: number, tipWidth: number, margin = 8): TipAlign {
  const centre = (left + right) / 2
  if (centre + tipWidth / 2 > viewport - margin) return 'end'
  if (centre - tipWidth / 2 < margin) return 'start'
  return 'center'
}

const browserTimers: LongPressTimers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (h) => window.clearTimeout(h),
}

/** Movement (px) that turns a press into a scroll and cancels the long press. */
const SLOP = 10

export interface IconBlockProps {
  icon: ArcIcon
  /** The name: aria-label, title and the long-press tooltip (uppercased). */
  label: string
  /** Face colour, a CSS colour (e.g. 'var(--signal)'). */
  face: string
  /** Icon colour. */
  ink: string
  onClick: () => void
  disabled?: boolean
  /** Edge length in px (default 44). */
  size?: number
  /** Icon edge length in px (default 22). */
  iconSize?: number
  /** Circle instead of the 8px rounded square. */
  round?: boolean
  class?: string
  /** Web only: a radio of a group (role=radio, aria-checked), held down while true. */
  checked?: boolean
  /** The roving tab stop of a radio group (0 on the checked one, -1 on the rest). */
  tabIndex?: number
  /** Extra attributes for the coach registry and tests. */
  id?: string
  /** Forwarded to the <button> (Preact 11 passes ref as a prop). */
  ref?: Ref<HTMLButtonElement>
}

export function IconBlock(props: IconBlockProps): JSX.Element {
  const { icon, label, face, ink, onClick, disabled = false, size = 44, iconSize = 22, round = false, checked } = props
  const radio = checked !== undefined
  const [tip, setTip] = useState<TipAlign | null>(null)
  const self = useRef<HTMLButtonElement | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const hide = useRef<number | null>(null)
  // The long-press handler is created once; it reads the current label from here.
  const labelRef = useRef(label)
  labelRef.current = label
  const press = useMemo(
    () => createLongPress(() => {
      const r = self.current?.getBoundingClientRect()
      setTip(r ? tipAlign(r.left, r.right, window.innerWidth, labelRef.current.length * 10 + 16) : 'center')
      if (hide.current !== null) window.clearTimeout(hide.current)
      hide.current = window.setTimeout(() => setTip(null), TOOLTIP_MS)
    }, browserTimers),
    [],
  )
  useEffect(() => () => {
    press.dispose()
    if (hide.current !== null) window.clearTimeout(hide.current)
  }, [press])

  const onPointerDown = (e: TargetedPointerEvent<HTMLButtonElement>): void => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    start.current = { x: e.clientX, y: e.clientY }
    press.down()
  }
  const onPointerMove = (e: TargetedPointerEvent<HTMLButtonElement>): void => {
    const s = start.current
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) {
      start.current = null
      press.cancel()
    }
  }
  const end = (): void => {
    start.current = null
    press.up()
  }
  const cancel = (): void => {
    start.current = null
    press.cancel()
  }

  const style: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    '--cap-face': face,
    '--cap-ink': ink,
  }
  return (
    <span class={`icon-block-wrap${props.class ? ` ${props.class}` : ''}`}>
      <button
        type="button"
        id={props.id}
        ref={(el: HTMLButtonElement | null) => {
          self.current = el
          const r = props.ref
          if (typeof r === 'function') r(el)
          else if (r) r.current = el
        }}
        class={`icon-block cap-3d${round ? ' icon-block--round cap-3d--round' : ''}${checked ? ' is-down' : ''}`}
        style={style}
        disabled={disabled}
        role={radio ? 'radio' : undefined}
        aria-checked={radio ? checked : undefined}
        tabIndex={props.tabIndex}
        data-roving={radio ? '' : undefined}
        aria-label={label}
        title={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onContextMenu={(e) => { if (start.current !== null || tip) e.preventDefault() }}
        onClick={() => {
          if (press.consumeClick()) return
          onClick()
        }}
      >
        <Icon icon={icon} size={iconSize} />
      </button>
      {tip && (
        <span class={`icon-block__tip icon-block__tip--${tip}`} role="tooltip" aria-hidden="true">
          {label}
        </span>
      )}
    </span>
  )
}
