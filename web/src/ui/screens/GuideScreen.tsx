// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/GuideScreen.kt
//
// Key combinations for the EP-133 (an addition to the web version), from
// teenage engineering's official guide: a search, one tab per section, and a
// compact row per entry with its keys as small caps. The selected row opens
// in place with its numbered steps, a note and the source.
//
// The screen fills its positioned parent (position: absolute; inset: 0): the
// shell's slide-in guide layer (opened from the GUIDE edge tab, the rail's
// Guide key or at #/guide), or the viewport when nothing above it is positioned.
//
// Web delta: the K.O. II (components/KoPanel) is drawn beside the list on the
// desk (from 1024px wide, ui/useDesk.ts), where the docked guide panel widens
// for it; Android draws it on a window at least 840dp wide that isn't short.
// Below the desk the list is alone, as on a phone.
import type { JSX } from 'preact'
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks'
import { parse as parseCombo } from '../../core/text/guideCombo'
import { of as keymapOf } from '../../core/text/guideKeymap'
import {
  CHECK_NOTE,
  CLOSE,
  HEADER,
  INTRO,
  NO_MATCHES,
  OFFICIAL_URL,
  OPEN_OFFICIAL,
  SEARCH,
  SOURCE,
  TITLE,
  filter,
  searchCount,
  sections as allSections,
  tab as tabLabel,
  type GuideEntry,
  type GuideSection,
} from '../../core/text/guideText'
import { Caption } from '../components/Caption'
import { Field } from '../components/Field'
import { CloseKey, ComboLine, KeymapSteps } from '../components/GuideKeys'
import { ArcIcon } from '../components/Icons'
import { Key } from '../components/Key'
import { KO_ASPECT, KoPanel } from '../components/KoPanel'
import { useDesk } from '../useDesk'
import './GuideScreen.css'

export interface GuideScreenProps {
  /** Closes the guide (the close key and Escape); undefined on a guide page with no close key. */
  onBack?: () => void
  /** The entry open at first ([entryId]), for tests and previews. */
  initialOpen?: string | null
  class?: string
  /** A search to show (web: the device view's "All … shortcuts"); a new object each time it is asked for. */
  search?: { readonly query: string } | null
}

/** The id an entry is opened by: its section and its action. */
export function entryId(section: GuideSection, entry: GuideEntry): string {
  return section.title + ':' + entry.action
}

/** The entry an id names, in any section (an open entry the search has hidden still lights the device). */
export function entryOf(id: string | null): GuideEntry | null {
  if (id === null) return null
  for (const s of allSections) for (const e of s.entries) if (entryId(s, e) === id) return e
  return null
}

/** Each tab's count: the section's entries, or its matches while searching. */
export function tabCounts(found: readonly GuideSection[] | null): number[] {
  return allSections.map((s) => (found === null ? s.entries.length : (found.find((f) => f.title === s.title)?.entries.length ?? 0)))
}

/** Every entry in the guide, for the search's placeholder. */
export const TOTAL = allSections.reduce((n, s) => n + s.entries.length, 0)

/** Opens [url] in a new tab; a blocked pop-up just does nothing (runCatching { uri.openUri }). */
function openUrl(url: string): void {
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    // nothing to open
  }
}

export function GuideScreen(props: GuideScreenProps): JSX.Element {
  const { onBack } = props
  const desk = useDesk()
  const [tab, setTab] = useState(0)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(props.initialOpen ?? null)
  const searching = query.trim().length > 0
  const found = useMemo(() => (searching ? filter(query) : null), [query, searching])
  const sections = found ?? (allSections[tab] ? [allSections[tab]] : [])
  const counts = useMemo(() => tabCounts(found), [found])
  const keymap = useMemo(() => {
    const e = entryOf(open)
    return e === null ? null : keymapOf(e)
  }, [open])
  const list = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const ids = useId()

  // Asked to search (from a key's shortcuts): the field shows it.
  useEffect(() => {
    if (props.search) setQuery(props.search.query)
  }, [props.search])

  // A new tab starts at its top.
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0
  }, [tab])

  // Slid in over the shell: focus moves into the guide (Tab then reaches the close key first).
  useEffect(() => {
    if (onBack) root.current?.focus({ preventScroll: true })
  }, [])

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && onBack && !e.defaultPrevented) {
      e.preventDefault()
      e.stopPropagation()
      onBack()
    }
  }

  const selectTab = (i: number): void => {
    setTab(i)
    setQuery('')
  }

  const selected = searching ? -1 : tab
  const panelId = `${ids}-panel`
  const tabId = (i: number): string => `${ids}-tab-${i}`

  return (
    <div
      ref={root}
      class={`guide${desk ? ' guide--desk' : ''}${props.class ? ` ${props.class}` : ''}`}
      data-screen="guide"
      role="region"
      aria-label={TITLE}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ '--ko-aspect': String(KO_ASPECT) }}
    >
      <div class="guide__column">
        {/* Header: the title centred, the close key on the right. */}
        <header class="guide__head">
          <Caption text={HEADER} as="h1" class="guide__title" />
          {onBack && <CloseKey class="guide__close" onClick={onBack} description={CLOSE} />}
        </header>
        <div class="guide__body">
          <div class="guide__list-col">
            <div class="guide__search">
              <Field
                label={SEARCH}
                hideLabel
                icon={ArcIcon.SEARCH}
                value={query}
                onValueChange={setQuery}
                placeholder={searchCount(TOTAL)}
                type="search"
                enterKeyHint="search"
              />
            </div>
            <Tabs selected={selected} counts={counts} onSelect={selectTab} tabId={tabId} panelId={panelId} />
            <div
              ref={list}
              id={panelId}
              class="guide__list"
              role={searching ? 'region' : 'tabpanel'}
              aria-labelledby={searching ? undefined : tabId(tab)}
              aria-label={searching ? SEARCH : undefined}
            >
              {sections.length === 0 && <p class="guide__none t-body15">{NO_MATCHES}</p>}
              {sections.map((s) => (
                <section key={s.title} class="guide__section" aria-label={searching ? undefined : s.title}>
                  {searching && <Caption text={tabLabel(s)} as="h2" align="start" class="guide__section-title" />}
                  {s.entries.map((e) => {
                    const id = entryId(s, e)
                    return (
                      <Entry
                        key={'e:' + id}
                        entry={e}
                        open={open === id}
                        onToggle={() => setOpen((o) => (o === id ? null : id))}
                      />
                    )
                  })}
                </section>
              ))}
              <footer class="guide__footer">
                <p class="t-small">{INTRO}</p>
                <p class="t-small">{CHECK_NOTE}</p>
                <Key text={OPEN_OFFICIAL} block onClick={() => openUrl(OFFICIAL_URL)} />
              </footer>
            </div>
          </div>
          {/* The device as tall as the room allows, beside the list (the desk only). */}
          {desk && (
            <div class="guide__device">
              <KoPanel keymap={keymap} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface TabsProps {
  /** -1 while searching: no tab is selected. */
  selected: number
  /** Each section's count (its matches while searching). */
  counts: readonly number[]
  onSelect: (i: number) => void
  tabId: (i: number) => string
  panelId: string
}

/**
 * One cap per section with its count; the selected one is navy and down. In
 * a row that scrolls on a phone, wrapped on the desk.
 */
function Tabs(props: TabsProps): JSX.Element {
  const { selected, onSelect } = props
  const row = useRef<HTMLDivElement>(null)
  const focusable = selected >= 0 ? selected : 0

  // Keep the selected tab in view in the scrolling row.
  useEffect(() => {
    if (selected < 0) return
    const el = row.current?.querySelector<HTMLElement>(`[data-tab="${selected}"]`)
    const r = row.current
    if (!el || !r) return
    const left = el.offsetLeft - r.offsetLeft
    if (left < r.scrollLeft || left + el.offsetWidth > r.scrollLeft + r.clientWidth) {
      r.scrollLeft = Math.max(0, left - 16)
    }
  }, [selected])

  // Arrow keys move between tabs (roving tabindex), Home / End jump to the ends.
  const onKeyDown = (e: KeyboardEvent): void => {
    const n = allSections.length
    const current = selected >= 0 ? selected : 0
    let next: number
    switch (e.key) {
      case 'ArrowRight':
        next = (current + 1) % n
        break
      case 'ArrowLeft':
        next = (current - 1 + n) % n
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = n - 1
        break
      default:
        return
    }
    e.preventDefault()
    onSelect(next)
    row.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus()
  }

  return (
    <div ref={row} class="guide-tabs" role="tablist" aria-label={HEADER} onKeyDown={onKeyDown}>
      {allSections.map((s, i) => {
        const on = i === selected
        return (
          <button
            key={s.title}
            type="button"
            role="tab"
            id={props.tabId(i)}
            data-tab={i}
            class={`guide-tabs__tab cap-3d${on ? ' is-on is-down' : ''}`}
            aria-selected={on}
            aria-controls={on ? props.panelId : undefined}
            tabIndex={i === focusable ? 0 : -1}
            onClick={() => onSelect(i)}
          >
            <span class="guide-tabs__label">{tabLabel(s)}</span>
            <span class="guide-tabs__count">{props.counts[i] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}

interface EntryProps {
  entry: GuideEntry
  open: boolean
  onToggle: () => void
}

/**
 * An entry: what it does, then its keys as small caps. Open, it sits on a
 * plate with a signal bar on its left and adds its numbered steps, the note
 * and the source.
 */
function Entry(props: EntryProps): JSX.Element {
  const { entry: e, open } = props
  const combo = useMemo(() => (e.combo !== null ? parseCombo(e.combo) : null), [e.combo])
  const keymap = useMemo(() => keymapOf(e), [e])
  const moreId = useId()
  return (
    <div class={`guide-entry${open ? ' is-open' : ''}`}>
      <button
        type="button"
        class="guide-entry__main"
        aria-expanded={open}
        aria-controls={open ? moreId : undefined}
        onClick={() => props.onToggle()}
      >
        <span class="guide-entry__action">{e.action}</span>
        {combo !== null && keymap !== null ? (
          <ComboLine combo={combo} keymap={keymap} spoken={e.keys} />
        ) : (
          // Not drawable as keys (power-up and setup steps): the guide's words instead.
          <span class="guide-entry__keys t-tiny">{e.keys}</span>
        )}
      </button>
      {open && (
        <div
          id={moreId}
          class="guide-entry__more"
          onClick={(ev) => {
            // The whole entry toggles, as in the app; the source link opens instead.
            if (!(ev.target instanceof Element && ev.target.closest('a'))) props.onToggle()
          }}
        >
          {keymap !== null && keymap.steps.length > 0 && <KeymapSteps keymap={keymap} class="guide-entry__steps" />}
          {e.note !== null && <p class="guide-entry__note t-tiny">{e.note}</p>}
          <a class="guide-entry__source" href={e.source} target="_blank" rel="noopener noreferrer">
            {SOURCE.toUpperCase()}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path d="M4.2 1.8L8.4 6L4.2 10.2" />
            </svg>
          </a>
        </div>
      )}
    </div>
  )
}
