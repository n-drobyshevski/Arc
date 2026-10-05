// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/SearchScreen.kt
//
// Finds sounds by name in every saved backup (an addition to the web
// version). Tapping a result opens that backup's contents, where it plays.
//
// Web deltas: the LazyColumn is a plain column (the page scrolls); each
// backup's hits are a <section> named by its title row.
import type { JSX } from 'preact'
import { useId, useLayoutEffect, useRef } from 'preact/hooks'
import { FeatureText } from '../../core/text/featureText'
import type { BackupRecord } from '../../core/text/libraryRules'
import { Strings } from '../../core/text/strings'
import type { SearchUi } from '../../state/types'
import { Field } from '../components/Field'
import { Key } from '../components/Key'
import { Plate } from './DeviceScreen'
import './SearchScreen.css'

export interface SearchScreenProps {
  search: SearchUi
  fmtDay: (ms: number) => string
  onQuery: (q: string) => void
  /** A hit's backup: its contents screen. */
  onOpen: (b: BackupRecord) => void
  onBack: () => void
}

/**
 * The line under the field: the hint while the query is blank, "no matches"
 * when nothing was found, else nothing (Kotlin `when` on query / results).
 */
export function searchNote(search: Pick<SearchUi, 'query' | 'results'>): string | null {
  if (search.query.trim() === '') return FeatureText.SEARCH_HINT
  if (search.results.length === 0) return FeatureText.NO_SOUND_MATCHES
  return null
}

export function SearchScreen(props: SearchScreenProps): JSX.Element {
  const { search } = props
  const root = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const note = searchNote(search)

  // Focus moves onto the screen when it opens; the list starts at the top.
  useLayoutEffect(() => {
    root.current?.focus({ preventScroll: true })
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }, [])

  return (
    <div ref={root} class="search" data-screen="search" tabIndex={-1} aria-labelledby={titleId}>
      <div class="search__column">
        <header class="search__head">
          <h1 id={titleId} class="t-heading search__title">{FeatureText.SEARCH_SOUNDS}</h1>
          <Key text={Strings.DONE} variant="quiet" size="small" onClick={props.onBack} />
        </header>
        <Field label={FeatureText.SEARCH} value={search.query} onValueChange={props.onQuery} enterKeyHint="search" />
        {search.indexing && <p class="t-small search__dim" role="status">{FeatureText.INDEXING}</p>}
        {note !== null && <p class="t-body15 search__dim" aria-live="polite">{note}</p>}
        {search.results.map((g) => {
          const headId = `${titleId}-${g.backup.id}`
          return (
            <section key={`g:${g.backup.id}`} class="search__group" aria-labelledby={headId}>
              <div class="search__group-head">
                <h2 id={headId} class="t-bold search__group-title">{g.backup.title}</h2>
                <span class="t-small search__dim search__day">{props.fmtDay(g.backup.createdAt)}</span>
              </div>
              {g.hits.map((hit) => (
                <Plate
                  key={`h:${g.backup.id}:${hit.slot}`}
                  onClick={() => props.onOpen(g.backup)}
                  enabled
                  class="search__hit"
                >
                  <div class="search__line">
                    <span class="t-bold search__slot">{FeatureText.slot(hit.slot)}</span>
                    <span class="t-bold search__name">{hit.name}</span>
                  </div>
                </Plate>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
