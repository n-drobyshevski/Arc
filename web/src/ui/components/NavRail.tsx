// Web only: the desktop layout's nav rail (no Kotlin counterpart; the Android
// app's sections are reached through the section tag only, as on the phone here).
//
// From 1024px wide (ui/useDesk.ts) a column of hardware keys runs down the
// left of the page, the way the EP-133 Sample Tool lays out the K.O. II's
// keys: the sections (Live, Backups, Device) at the top, the shortcut guide
// and settings at the bottom. Each key has an LED above it; the current one is
// held down, navy, its LED lit. The keys do what the phone's controls do: a
// section key is the section list's pick (selectTab), Guide is the GUIDE edge
// tab (hidden on the desk; its coach mark moves here) and Settings the top
// bar's gear. The section tag and its list stay in the top bar.
import type { JSX, TargetedKeyboardEvent } from 'preact'
import { useRef } from 'preact/hooks'
import { CoachText } from '../../core/text/coachText'
import { NavText } from '../../core/text/navText'
import { Strings } from '../../core/text/strings'
import type { Tab } from '../../state/types'
import { tabLabel } from './Chrome'
import { COACH_MARKS, useCoachMark } from './Coach'
import './NavRail.css'

/** The rail's sections, top to bottom (the K.O. II's order of use, not the menu's). */
export const RAIL_TABS: readonly Tab[] = ['live', 'backups', 'device']

/** What the rail shows as current: a section, or the settings screen. */
export type RailCurrent = Tab | 'settings'

export interface NavRailProps {
  current: RailCurrent
  /** The guide panel is open (its key is lit and held down too). */
  guideOpen: boolean
  onTab: (t: Tab) => void
  /** Opens or closes the guide panel. */
  onGuide: () => void
  onSettings: () => void
  /** Out of reach (under the section list's scrim). */
  inert?: boolean
  class?: string
}

export function NavRail(props: NavRailProps): JSX.Element {
  const { current, guideOpen } = props
  const keys = useRef<HTMLElement | null>(null)
  const guide = COACH_MARKS['edge.guide']
  const guideMark = useCoachMark('edge.guide', guide.label, guide.face, guide.ink)

  // Up and down move along the keys (as in the section list).
  const onKeyDown = (e: TargetedKeyboardEvent<HTMLElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(keys.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
    e.preventDefault()
  }

  return (
    <nav
      class={`nav-rail${props.class ? ` ${props.class}` : ''}`}
      aria-label={NavText.TABS}
      ref={keys}
      inert={props.inert || undefined}
      // Hidden from screen readers with it, as inert does (and from tools that
      // only read aria-hidden): the section list's own Sections is the one then.
      aria-hidden={props.inert ? 'true' : undefined}
      onKeyDown={onKeyDown}
    >
      <span class="nav-rail__mark t-wordmark" aria-hidden="true">{Strings.WORDMARK}</span>
      {RAIL_TABS.map((t) => (
        <RailKey key={t} label={tabLabel(t)} on={t === current} current={t === current} onClick={() => props.onTab(t)} />
      ))}
      <span class="nav-rail__spacer" />
      <RailKey
        label={NavText.GUIDE}
        extra="nav-rail__guide"
        title={CoachText.GUIDE_TAB}
        on={guideOpen}
        expanded={guideOpen}
        keyRef={guideMark}
        onClick={() => props.onGuide()}
      />
      <RailKey
        label={CoachText.SETTINGS}
        on={current === 'settings'}
        current={current === 'settings'}
        onClick={() => {
          if (current !== 'settings') props.onSettings()
        }}
      />
    </nav>
  )
}

interface RailKeyProps {
  label: string
  /** Lit and held down. */
  on: boolean
  /** aria-current="page" (a section, or settings). */
  current?: boolean
  /** aria-expanded (the guide's toggle). */
  expanded?: boolean
  title?: string
  /** Another class on the cap (Shell finds the guide's key by it to give focus back). */
  extra?: string
  keyRef?: (el: Element | null) => void
  onClick: () => void
}

/** One key: the LED, then the cap with its name in the bottom corner. */
function RailKey(props: RailKeyProps): JSX.Element {
  return (
    <div class={`nav-rail__item${props.on ? ' is-on' : ''}`}>
      <span class="nav-rail__led" aria-hidden="true" />
      <button
        type="button"
        class={`nav-rail__key cap-3d${props.extra ? ` ${props.extra}` : ''}${props.on ? ' is-down' : ''}`}
        aria-current={props.current ? 'page' : undefined}
        aria-expanded={props.expanded}
        title={props.title}
        ref={props.keyRef}
        onClick={() => props.onClick()}
      >
        {props.label}
      </button>
    </div>
  )
}
