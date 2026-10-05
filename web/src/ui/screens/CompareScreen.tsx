// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/CompareScreen.kt (CompareScreen)
//
// STUB (phase P4): the props are the real screen's (CompareScreen(old, new,
// compare, fmtDay, onBack)); phase P5 replaces the body.
import type { JSX } from 'preact'
import { FeatureText } from '../../core/text/featureText'
import type { BackupRecord } from '../../core/text/libraryRules'
import { Strings } from '../../core/text/strings'
import type { PakCompareUi } from '../../state/types'
import { Caption } from '../components/Caption'
import { Key } from '../components/Key'

export interface CompareScreenProps {
  /** The older of the pair (by createdAt). */
  old: BackupRecord
  new: BackupRecord
  /** state.pakCompare when it is for this pair, else null (still comparing). */
  compare: PakCompareUi | null
  fmtDay: (ms: number) => string
  onBack: () => void
}

export function CompareScreen(props: CompareScreenProps): JSX.Element {
  return (
    <div class="screen-stub screen-stub--full" data-screen="compare">
      <div class="screen-stub__head">
        <Caption text={FeatureText.COMPARE_BACKUPS} align="start" />
        <Key text={Strings.DONE} variant="quiet" size="small" onClick={props.onBack} />
      </div>
      <p class="t-small">{props.old.title} · {props.new.title}</p>
    </div>
  )
}
