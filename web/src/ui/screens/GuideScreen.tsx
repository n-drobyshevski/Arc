// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/GuideScreen.kt
//
// Key combinations for the EP-133 (an addition to the web version), from
// teenage engineering's official guide, laid out like a printed guide: one
// tab per section, each entry's keys drawn as caps with what they do below.
// Tap an entry for the guide's own wording, a note and the source.
//
// The screen fills its positioned parent (position: absolute; inset: 0): the
// shell's slide-in guide layer (opened from the GUIDE edge tab or at #/guide),
// or the viewport when nothing above it is positioned.
import type { JSX } from 'preact'
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks'
import { parse } from '../../core/text/guideCombo'
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
  sections as allSections,
  tab as tabLabel,
  type GuideEntry,
  type GuideSection,
} from '../../core/text/guideText'
import { Caption } from '../components/Caption'
import { Field } from '../components/Field'
import { CloseKey, ComboView } from '../components/GuideKeys'
import { Key } from '../components/Key'
import './GuideScreen.css'

export interface GuideScreenProps {
  /** Closes the guide (the close key and Escape); undefined on a guide page with no close key. */
  onBack?: () => void
  class?: string
  /** A search to show (web: the device view's "All … shortcuts"); a new object each time it is asked for. */
  search?: { readonly query: string } | null
}

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
  const [tab, setTab] = useState(0)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const searching = query.trim().length > 0
  const sections = useMemo<readonly GuideSection[]>(() => {
    if (searching) return filter(query)
    const s = allSections[tab]
    return s ? [s] : []
  }, [query, tab, searching])
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
      class={`guide${props.class ? ` ${props.class}` : ''}`}
      data-screen="guide"
      role="region"
      aria-label={TITLE}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div class="guide__column">
        {/* Header: the title centred, the close key on the right. */}
        <header class="guide__head">
          <Caption text={HEADER} as="h1" class="guide__title" />
          {onBack && <CloseKey class="guide__close" onClick={onBack} description={CLOSE} />}
        </header>
        {/* The page: tabs on top, entries below, on the pale key colour. */}
        <div class="guide__page">
          <Tabs selected={selected} onSelect={selectTab} tabId={tabId} panelId={panelId} />
          <div
            ref={list}
            id={panelId}
            class="guide__list"
            role={searching ? 'region' : 'tabpanel'}
            aria-labelledby={searching ? undefined : tabId(tab)}
            aria-label={searching ? SEARCH : undefined}
          >
            <div class="guide__search">
              <Field label={SEARCH} value={query} onValueChange={setQuery} type="search" enterKeyHint="search" background="var(--shell)" />
            </div>
            {sections.length === 0 && <p class="guide__none t-body15">{NO_MATCHES}</p>}
            {sections.map((s) => (
              <section key={s.title} class="guide__section" aria-label={searching ? undefined : s.title}>
                {searching && <h2 class="guide__section-title t-small t-mono">{tabLabel(s)}</h2>}
                {s.entries.map((e) => {
                  const id = s.title + ':' + e.action
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
      </div>
    </div>
  )
}

interface TabsProps {
  /** -1 while searching: no tab is selected. */
  selected: number
  onSelect: (i: number) => void
  tabId: (i: number) => string
  panelId: string
}

/** One tab per section; the selected one is a navy block, like the tabs along the bottom. */
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
      r.scrollLeft = Math.max(0, left - 12)
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
    <div class="guide-tabs">
      <div ref={row} class="guide-tabs__row" role="tablist" aria-label={HEADER} onKeyDown={onKeyDown}>
        {allSections.map((s, i) => {
          const on = i === selected
          return (
            <button
              key={s.title}
              type="button"
              role="tab"
              id={props.tabId(i)}
              data-tab={i}
              class={`guide-tabs__tab${on ? ' is-on' : ''}`}
              aria-selected={on}
              aria-controls={on ? props.panelId : undefined}
              tabIndex={i === focusable ? 0 : -1}
              onClick={() => onSelect(i)}
            >
              {tabLabel(s)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface EntryProps {
  entry: GuideEntry
  open: boolean
  onToggle: () => void
}

function Entry(props: EntryProps): JSX.Element {
  const { entry: e, open } = props
  const combo = useMemo(() => (e.combo !== null ? parse(e.combo) : null), [e.combo])
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
        {combo !== null ? (
          <ComboView combo={combo} spoken={e.keys} />
        ) : (
          // Not drawable as keys (power-up and setup steps): the guide's words instead.
          <span class="guide-entry__keys t-body15 t-mono">{e.keys}</span>
        )}
        <span class="guide-entry__action">{e.action}</span>
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
          {combo !== null && <p class="t-small t-mono">{e.keys}</p>}
          {e.note !== null && <p class="t-small">{e.note}</p>}
          <a class="guide-entry__source t-small" href={e.source} target="_blank" rel="noopener noreferrer">
            {SOURCE}
          </a>
        </div>
      )}
    </div>
  )
}
