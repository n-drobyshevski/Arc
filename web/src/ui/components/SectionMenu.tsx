// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Chrome.kt (SectionMenu)
//
// The sections, as blocks stacked under the section tag (drawn in place, not
// in a popup window): the current one navy. After them, set apart by a gap,
// Settings (an addition), a block like an unselected one with the gear before
// its word. A tap outside closes the list. It fades in and out; it sits under
// the top bar, so the tag stays in view.
//
// Web only, on the desk: no Settings entry ([onSettings] left out), as the
// nav rail has its key.
import type { JSX, TargetedKeyboardEvent } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { CoachText } from '../../core/text/coachText'
import { NavText } from '../../core/text/navText'
import type { Tab } from '../../state/types'
import { TAB_ENTRIES, tabLabel } from './Chrome'
import { ArcIcon, Icon } from './Icons'
import './SectionMenu.css'

export interface SectionMenuProps {
  open: boolean
  current: Tab
  onPick: (t: Tab) => void
  /** Opens Settings, the entry after the sections (the caller closes the list); left out: no entry. */
  onSettings?: () => void
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
              class={`section-menu__item cap-3d${on ? ' is-current is-down' : ''}`}
              aria-current={on ? 'page' : undefined}
              tabIndex={open ? 0 : -1}
              onClick={() => onPick(t)}
            >
              {tabLabel(t)}
            </button>
          )
        })}
        {props.onSettings && (
          <button
            type="button"
            class="section-menu__item section-menu__settings cap-3d"
            tabIndex={open ? 0 : -1}
            onClick={props.onSettings}
          >
            <Icon icon={ArcIcon.GEAR} size={20} />
            {CoachText.SETTINGS}
          </button>
        )}
      </nav>
    </div>
  )
}
