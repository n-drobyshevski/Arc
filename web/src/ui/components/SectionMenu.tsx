// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Chrome.kt (SectionMenu)
//
// The sections, as blocks stacked under the section tag (drawn in place, not
// in a popup window): the current one navy. A tap outside closes the list.
// It fades in and out; it sits under the top bar, so the tag stays in view.
import type { JSX, TargetedKeyboardEvent } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { NavText } from '../../core/text/navText'
import type { Tab } from '../../state/types'
import { TAB_ENTRIES, tabLabel } from './Chrome'
import './SectionMenu.css'

export interface SectionMenuProps {
  open: boolean
  current: Tab
  onPick: (t: Tab) => void
  onDismiss: () => void
  id?: string
}

export function SectionMenu(props: SectionMenuProps): JSX.Element {
  const { open, current, onPick, onDismiss } = props
  const list = useRef<HTMLDivElement | null>(null)

  // Focus the current section when the list opens; Escape closes it.
  useEffect(() => {
    if (!open) return
    const on = list.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')
    on?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const onKeyDown = (e: TargetedKeyboardEvent<HTMLElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]
    next?.focus()
    e.preventDefault()
  }

  return (
    <div class={`section-menu${open ? ' is-open' : ''}`} id={props.id} aria-hidden={open ? undefined : 'true'}>
      <div class="section-menu__scrim" onClick={() => onDismiss()} />
      <nav class="section-menu__list" aria-label={NavText.TABS} ref={list} onKeyDown={onKeyDown}>
        {TAB_ENTRIES.map((t) => {
          const on = t === current
          return (
            <button
              key={t}
              type="button"
              class={`section-menu__item${on ? ' is-current' : ''}`}
              aria-current={on ? 'page' : undefined}
              tabIndex={open ? 0 : -1}
              onClick={() => onPick(t)}
            >
              {tabLabel(t)}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
