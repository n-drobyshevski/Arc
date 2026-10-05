// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/CompareScreen.kt (ComparePickerContent)
//
// Picks the second backup to compare with (an addition to the web version):
// a heading, the other backups as the Backups list (no fresh dot), Cancel.
import type { JSX } from 'preact'
import { FeatureText } from '../../core/text/featureText'
import type { BackupRecord } from '../../core/text/libraryRules'
import { Strings } from '../../core/text/strings'
import { Key } from '../components/Key'
import { BackupList } from '../screens/MainScreen'

export const COMPARE_PICK_TITLE_ID = 'arc-compare-pick-title'

export interface ComparePickerProps {
  others: readonly BackupRecord[]
  fmtDay: (ms: number) => string
  onPick: (b: BackupRecord) => void
  onCancel: () => void
}

export function ComparePicker(props: ComparePickerProps): JSX.Element {
  return (
    <>
      <h2 id={COMPARE_PICK_TITLE_ID} class="t-heading">{FeatureText.PICK_OTHER}</h2>
      <BackupList list={props.others} freshId={null} fmtDay={props.fmtDay} onOpen={props.onPick} />
      <Key text={Strings.CANCEL} variant="quiet" block onClick={props.onCancel} />
    </>
  )
}
