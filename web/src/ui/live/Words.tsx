// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (WordButton),
// Icons.kt (ArcIcon.SWAP) and ui/screens/MirrorScreen.kt (PickWord)
//
// The words under Live's grid, as the pocket operator app shows DRUMS /
// KEYPAD: small, uppercase, caption grey. The mode word carries the
// two-squares mark; the scale and octave words list their choices over the
// grid.
//
// Web deltas:
// - WordButton and the SWAP mark are only used by Live, so they live here
//   rather than in components/.
// - PickWord's Compose Popup is an absolutely placed listbox anchored to the
//   word (bottom edge on the word's bottom, so it opens upward over the grid).
//   Escape, a tap outside or Tab away closes it; arrow keys move through the
//   choices ([columns]: a grid, the arrows moving across and down; [down]: it
//   opens downward, from a row over the piano). Like the focusable Popup, Back closes it: the screen passes
//   [open] / [onOpen] backed by a navigation layer (dialog 'pick:<what>');
//   without them it keeps its own state.
// - PickWord's [swipe] reads pointer events: past the touch slop, a drag along
//   the word is its own (captured, its click swallowed), across it the page's
//   (touch-action lets that scroll). A word turned on its side (writing-mode
//   vertical, read from the bottom up) steps up and down, as it reads.
//   TalkBack's Next and Previous actions are the arrow keys right and left on
//   the closed word, said in its aria-description.
import type { JSX, Ref, TargetedKeyboardEvent, TargetedPointerEvent } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { MirrorText } from '../../core/text/mirrorText'
import { WebText } from '../../core/text/webText'
import { TOUCH_SLOP } from './press'
import './Words.css'

/** Two overlapping squares, the PO app's mark beside its chosen mode (DRUMS / KEYPAD). */
export function SwapMark(props: { size?: number }): JSX.Element {
  const s = props.size ?? 12
  return (
    <svg class="word__mark" width={s} height={s} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect x="10" y="10" width="50" height="50" fill="none" stroke="currentColor" stroke-width="8" />
      <rect x="40" y="40" width="50" height="50" fill="none" stroke="currentColor" stroke-width="8" />
    </svg>
  )
}

export interface WordButtonProps {
  label: string
  onClick: () => void
  /** The two-squares mark before it (a word that switches modes). */
  mark?: boolean
  /** Drawn pale (a choice not taken). */
  dim?: boolean
  /** What screen readers read, when given. */
  description?: string
  /** What screen readers read after it (its keys), when given. */
  'aria-description'?: string
  /** Text at the top of the touch area rather than its middle (a row hugging the grid above). */
  top?: boolean
  class?: string
  role?: 'option'
  'aria-selected'?: boolean
  'aria-haspopup'?: 'listbox'
  'aria-expanded'?: boolean
  'data-coach'?: string
  'data-coach-label'?: string
  'data-coach-face'?: string
  'data-coach-ink'?: string
  tabIndex?: number
  onKeyDown?: (e: TargetedKeyboardEvent<HTMLButtonElement>) => void
  onPointerDown?: (e: TargetedPointerEvent<HTMLButtonElement>) => void
  onPointerMove?: (e: TargetedPointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (e: TargetedPointerEvent<HTMLButtonElement>) => void
  onPointerCancel?: (e: TargetedPointerEvent<HTMLButtonElement>) => void
  ref?: Ref<HTMLButtonElement>
}

/** A word under the grid (Kotlin WordButton): 44 high to touch, the word quiet. */
export function WordButton(props: WordButtonProps): JSX.Element {
  const { label, onClick, mark = false, dim = false, description, top = false } = props
  const cls = ['word', top ? 'word--top' : '', dim ? 'word--dim' : '', props.class ?? ''].filter(Boolean).join(' ')
  return (
    <button
      ref={props.ref}
      type="button"
      class={cls}
      role={props.role}
      aria-label={description}
      aria-description={props['aria-description']}
      aria-selected={props['aria-selected']}
      aria-haspopup={props['aria-haspopup']}
      aria-expanded={props['aria-expanded']}
      data-coach={props['data-coach']}
      data-coach-label={props['data-coach-label']}
      data-coach-face={props['data-coach-face']}
      data-coach-ink={props['data-coach-ink']}
      tabIndex={props.tabIndex}
      onKeyDown={props.onKeyDown}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onClick={onClick}
    >
      {/* What the guide overlay points at: the word, not its whole touch area. */}
      <span class="word__row" data-coach-box={props['data-coach'] ? '' : undefined}>
        {mark && <SwapMark />}
        <span class="word__text">{label}</span>
      </span>
    </button>
  )
}

export interface PickWordProps<T> {
  label: string
  options: readonly T[]
  selected: T
  name: (o: T) => string
  onPick: (o: T) => void
  description: string
  /** At the row's end: the list opens leftward, staying on screen. */
  alignEnd?: boolean
  coach?: { id: string; label: string }
  /** Whether the list is open, when the caller keeps it (a navigation layer, so Back closes it). */
  open?: boolean
  onOpen?: (open: boolean) => void
  /** A grid this many choices wide, filled row by row (the keys' two rows of six). */
  columns?: number
  /** The list opens downward (a row over the keys); else upward, over the grid above the word. */
  down?: boolean
  /** The word in the middle of its touch area (a row over the keys) rather than at its top. */
  middle?: boolean
  /**
   * A short swipe along the word steps the choice without the list: right the next, left the
   * one before (up and down on a word turned on its side, as it reads), stopping at either
   * end. The arrow keys right and left do the same (TalkBack's Next and Previous actions).
   */
  swipe?: boolean
}

/** How far a [PickWord] swipe goes past the touch slop to step the choice: short, about the word's height. */
export const PICK_SWIPE = 32

/** A [PickWord] swipe that went [moved] along the word (px, forward positive): the step it makes, 1, -1 or none. */
export function pickSwipeStep(moved: number, slop: number = TOUCH_SLOP, far: number = PICK_SWIPE): 1 | -1 | 0 {
  if (Math.abs(moved) - slop < far) return 0
  return moved > 0 ? 1 : -1
}

/** The choice [delta] from [selected] in [options], or null past either end. */
export function pickStepped<T>(options: readonly T[], selected: T, delta: number): T | null {
  const i = options.indexOf(selected) + delta
  return i >= 0 && i < options.length ? options[i]! : null
}

/** A word showing a choice ("MAJOR ▾"); a tap lists the choices over the grid, the chosen one marked. */
export function PickWord<T>(props: PickWordProps<T>): JSX.Element {
  const { label, options, selected, name, onPick, description, alignEnd = false, coach, columns, swipe = false } = props
  const [own, setOwn] = useState(false)
  const open = props.open ?? own
  const onOpen = useRef(props.onOpen)
  onOpen.current = props.onOpen
  const setOpen = (o: boolean): void => {
    if (onOpen.current) onOpen.current(o)
    else setOwn(o)
  }
  const box = useRef<HTMLDivElement | null>(null)
  const word = useRef<HTMLButtonElement | null>(null)
  const list = useRef<HTMLDivElement | null>(null)

  const close = (refocus: boolean): void => {
    setOpen(false)
    if (refocus) word.current?.focus()
  }

  // Closed from elsewhere (Back) with focus in the list it took away: back to the word.
  const wasOpen = useRef(open)
  useEffect(() => {
    const active = typeof document !== 'undefined' ? document.activeElement : null
    if (wasOpen.current && !open && (active === null || active === document.body)) word.current?.focus()
    wasOpen.current = open
  }, [open])

  // Focus the chosen one on open; a tap outside closes, and only closes (the
  // focusable Popup takes that touch), so it doesn't also sound a pad.
  useEffect(() => {
    if (!open) return
    const items = list.current?.querySelectorAll<HTMLElement>('[role=option]')
    const i = Math.max(0, options.indexOf(selected))
    items?.[i]?.focus()
    const outside = (e: PointerEvent): void => {
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])

  // The choice [delta] from the one picked, if there is one there.
  const step = (delta: number): void => {
    const o = pickStepped(options, selected, delta)
    if (o !== null) onPick(o)
  }
  // The swipe as it goes: where it went down, whether the word is turned, and once past the slop
  // whether it goes along the word (null before). A swipe swallows the click its lift brings.
  const drag = useRef<{ id: number; x: number; y: number; turned: boolean; along: boolean | null } | null>(null)
  const swallow = useRef(false)
  // The travel along the word and across it, in its own frame: a turned word reads from the bottom up.
  const travel = (g: { x: number; y: number; turned: boolean }, e: PointerEvent): [number, number] => {
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    return g.turned ? [-dy, dx] : [dx, dy]
  }
  const swiping = swipe
    ? {
        onPointerDown: (e: TargetedPointerEvent<HTMLButtonElement>): void => {
          // With the list open, a touch on the word only closes it (its click).
          if (open || (e.pointerType === 'mouse' && e.button !== 0)) return
          swallow.current = false
          const turned = getComputedStyle(e.currentTarget).writingMode.startsWith('vertical')
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, turned, along: null }
        },
        onPointerMove: (e: TargetedPointerEvent<HTMLButtonElement>): void => {
          const g = drag.current
          if (g === null || g.id !== e.pointerId || g.along !== null) return
          const [a, b] = travel(g, e)
          if (Math.hypot(a, b) <= TOUCH_SLOP) return
          // Across it: the page's (a scroll), nothing here.
          g.along = Math.abs(a) >= Math.abs(b)
          if (!g.along) {
            drag.current = null
            return
          }
          // Along it: the drag is the word's, so its lift doesn't open the list.
          swallow.current = true
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // Gone already: the lift will not come.
          }
        },
        onPointerUp: (e: TargetedPointerEvent<HTMLButtonElement>): void => {
          const g = drag.current
          if (g === null || g.id !== e.pointerId) return
          drag.current = null
          if (g.along !== true) return
          // The click (where the lift brings one) comes in this task; after it, a key's click is a click again.
          setTimeout(() => {
            swallow.current = false
          }, 0)
          const s = pickSwipeStep(travel(g, e)[0])
          if (s !== 0) step(s)
        },
        onPointerCancel: (e: TargetedPointerEvent<HTMLButtonElement>): void => {
          if (drag.current?.id !== e.pointerId) return
          drag.current = null
          swallow.current = false
        },
        // Right the next, left the one before, on the closed word.
        onKeyDown: (e: TargetedKeyboardEvent<HTMLButtonElement>): void => {
          if (open || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
          const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
          if (delta === 0) return
          e.preventDefault()
          e.stopPropagation()
          step(delta)
        },
      }
    : {}

  const onListKey = (e: TargetedKeyboardEvent<HTMLElement>): void => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role=option]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    let next: number | null = null
    const row = columns ?? 1
    if (e.key === 'ArrowDown') next = Math.min(items.length - 1, at + row)
    else if (e.key === 'ArrowUp') next = Math.max(0, at - row)
    else if (columns && e.key === 'ArrowRight') next = Math.min(items.length - 1, at + 1)
    else if (columns && e.key === 'ArrowLeft') next = Math.max(0, at - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
      return
    } else if (e.key === 'Tab') {
      setOpen(false)
      return
    }
    if (next === null) return
    e.preventDefault()
    items[next]?.focus()
  }

  return (
    <div ref={box} class="pick">
      <WordButton
        ref={word}
        label={`${label} ▾`}
        onClick={() => {
          if (swallow.current) swallow.current = false
          else setOpen(!open)
        }}
        description={description}
        aria-description={swipe ? WebText.pickSteps(MirrorText.PICK_NEXT, MirrorText.PICK_PREVIOUS) : undefined}
        class={swipe ? 'word--swipe' : undefined}
        {...swiping}
        top={!props.middle}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-coach={coach?.id}
        data-coach-label={coach?.label}
        data-coach-face={coach ? 'var(--navy)' : undefined}
        data-coach-ink={coach ? 'var(--on-navy)' : undefined}
      />
      {open && (
        <div
          ref={list}
          class={`pick__list${alignEnd ? ' pick__list--end' : ''}${props.down ? ' pick__list--down' : ''}${columns ? ' pick__list--grid' : ''}`}
          style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(52px, auto))` } : undefined}
          role="listbox"
          aria-label={description}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => {
            const on = o === selected
            return (
              <WordButton
                key={i}
                label={name(o)}
                role="option"
                aria-selected={on}
                mark={on}
                dim={!on}
                tabIndex={-1}
                onClick={() => {
                  onPick(o)
                  close(true)
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
