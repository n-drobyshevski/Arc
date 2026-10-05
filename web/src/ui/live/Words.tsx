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
//   choices. Like the focusable Popup, Back closes it: the screen passes
//   [open] / [onOpen] backed by a navigation layer (dialog 'pick:<what>');
//   without them it keeps its own state.
import type { JSX, Ref, TargetedKeyboardEvent } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
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
      aria-selected={props['aria-selected']}
      aria-haspopup={props['aria-haspopup']}
      aria-expanded={props['aria-expanded']}
      data-coach={props['data-coach']}
      data-coach-label={props['data-coach-label']}
      data-coach-face={props['data-coach-face']}
      data-coach-ink={props['data-coach-ink']}
      tabIndex={props.tabIndex}
      onKeyDown={props.onKeyDown}
      onClick={onClick}
    >
      <span class="word__row">
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
}

/** A word showing a choice ("MAJOR ▾"); a tap lists the choices over the grid, the chosen one marked. */
export function PickWord<T>(props: PickWordProps<T>): JSX.Element {
  const { label, options, selected, name, onPick, description, alignEnd = false, coach } = props
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

  const onListKey = (e: TargetedKeyboardEvent<HTMLElement>): void => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role=option]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    let next: number | null = null
    if (e.key === 'ArrowDown') next = Math.min(items.length - 1, at + 1)
    else if (e.key === 'ArrowUp') next = Math.max(0, at - 1)
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
        onClick={() => setOpen(!open)}
        description={description}
        top
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
          class={`pick__list${alignEnd ? ' pick__list--end' : ''}`}
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
