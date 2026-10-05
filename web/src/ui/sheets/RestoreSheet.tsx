// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/Sheets.kt (RestoreSheetContent)
//
// The restore sheet (`#restore-sheet`): everything, or picked projects (their
// sounds, and optionally the sounds no project uses), the overwrite warning,
// what the restore would change on the device once compared (only while the
// result matches the current selection), and Restore / Compare / Cancel.
//
// The choices start at their defaults each time the sheet opens (Kotlin's
// rememberSaveable inside the sheet): BackupsSheets mounts this per opening.
import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { FeatureText } from '../../core/text/featureText'
import { LibraryRules, type BackupRecord, type RestoreSelection } from '../../core/text/libraryRules'
import { Strings } from '../../core/text/strings'
import type { DiffUi } from '../../state/types'
import { ChoiceRow } from '../components/ChoiceRow'
import { Key } from '../components/Key'
import { Actions } from './Actions'
import { DiffResultView } from './DiffResultView'
import './Sheets.css'

export const RESTORE_TITLE_ID = 'arc-restore-title'

export interface RestoreSheetProps {
  b: BackupRecord
  onRestore: (sel: RestoreSelection) => void
  onCancel: () => void
  diff: DiffUi | null
  canCompare: boolean
  onCompare: (sel: RestoreSelection) => void
}

/** Kotlin data class equality of two selections (same slots and projects, in order). */
export function sameSelection(a: RestoreSelection, b: RestoreSelection): boolean {
  const eq = (x: readonly number[], y: readonly number[]): boolean => x.length === y.length && x.every((v, i) => v === y[i])
  return eq(a.slots, b.slots) && eq(a.projects, b.projects)
}

/** The compare result to show: only the one made for this backup and this selection. */
export function shownDiff(diff: DiffUi | null, backupId: string, sel: RestoreSelection): DiffUi | null {
  return diff !== null && diff.backupId === backupId && sameSelection(diff.selection, sel) ? diff : null
}

export function RestoreSheet(props: RestoreSheetProps): JSX.Element {
  const { b } = props
  const [everything, setEverything] = useState(true)
  const [other, setOther] = useState(false)
  const [picked, setPicked] = useState<readonly number[]>(() => [...b.projects])
  // Checked projects in display order.
  const sel = LibraryRules.restoreSelection(b, everything, b.projects.filter((n) => picked.includes(n)), other)
  const warning = LibraryRules.restoreWarning(sel)
  const shown = shownDiff(props.diff, b.id, sel)
  const can = LibraryRules.canRestore(sel)
  const group = `arc-restore-${b.id}`
  return (
    <>
      <h2 id={RESTORE_TITLE_ID} class="t-heading">{Strings.RESTORE_TO_DEVICE}</h2>
      <div class="restore-choices" role="radiogroup" aria-labelledby={RESTORE_TITLE_ID}>
        <ChoiceRow text={Strings.EVERYTHING} selected={everything} onClick={() => setEverything(true)} radio name={group} />
        <ChoiceRow text={Strings.PICK_PROJECTS} selected={!everything} onClick={() => setEverything(false)} radio name={group} />
      </div>
      <div class={`restore-picks${everything ? ' is-off' : ''}`}>
        {/* #restore-projects is a plain block: its rows stack without gaps. */}
        <div class="restore-picks__projects">
          {b.projects.map((n) => (
            <ChoiceRow
              key={n}
              text={Strings.projectLine(n)}
              selected={picked.includes(n)}
              onClick={() => setPicked(picked.includes(n) ? picked.filter((p) => p !== n) : [...picked, n])}
              radio={false}
              disabled={everything}
              trailing={LibraryRules.projectSoundsRestore(b, n)}
            />
          ))}
        </div>
        <ChoiceRow text={Strings.ALSO_OTHER_SOUNDS} selected={other} onClick={() => setOther(!other)} radio={false} disabled={everything} />
      </div>
      {/* An empty <p> takes no height (the Spacer keeps the 16px gap). */}
      <p class="t-small restore-warning" aria-live="polite">{warning}</p>
      {/* Addition to the web version: what this restore would change on the device. */}
      {shown !== null && <DiffResultView result={shown.result} />}
      <Actions
        keys={[
          {
            wide: true,
            key: <Key text={LibraryRules.restoreButton(sel)} variant="signal" block disabled={!can} onClick={() => props.onRestore(sel)} />,
          },
          props.canCompare && shown === null && {
            wide: true,
            key: <Key text={FeatureText.COMPARE} block disabled={!can} onClick={() => props.onCompare(sel)} />,
          },
          { wide: true, key: <Key text={Strings.CANCEL} variant="quiet" block onClick={props.onCancel} /> },
        ]}
      />
    </>
  )
}
