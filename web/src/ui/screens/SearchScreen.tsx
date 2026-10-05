// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/SearchScreen.kt
//
// STUB (phase P4): the props are the real screen's (SearchScreen(search, fmtDay,
// onQuery, onOpen, onBack)); phase P5 replaces the body.
import type { JSX } from 'preact'
import { FeatureText } from '../../core/text/featureText'
import type { BackupRecord } from '../../core/text/libraryRules'
import { Strings } from '../../core/text/strings'
import type { SearchUi } from '../../state/types'
import { Caption } from '../components/Caption'
import { Key } from '../components/Key'

export interface SearchScreenProps {
  search: SearchUi
  fmtDay: (ms: number) => string
  onQuery: (q: string) => void
  /** A hit's backup: its contents screen. */
  onOpen: (b: BackupRecord) => void
  onBack: () => void
}

export function SearchScreen(props: SearchScreenProps): JSX.Element {
  return (
    <div class="screen-stub screen-stub--full" data-screen="search">
      <div class="screen-stub__head">
        <Caption text={FeatureText.SEARCH_SOUNDS} align="start" />
        <Key text={Strings.DONE} variant="quiet" size="small" onClick={props.onBack} />
      </div>
    </div>
  )
}
