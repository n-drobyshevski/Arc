// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/Sheets.kt (DetailSheetContent)
//
// The detail sheet's body (`#detail-sheet`): the name field, the facts, the
// projects with their sound counts, the notes field and the actions. Title and
// notes are saved when the sheet closes (BackupsSheets does that, however it
// closes: Done, Back, Escape, the scrim, or a key that opens something else).
import type { JSX } from 'preact'
import { FeatureText } from '../../core/text/featureText'
import { LibraryRules, type BackupRecord } from '../../core/text/libraryRules'
import { Strings } from '../../core/text/strings'
import { Field } from '../components/Field'
import { Key } from '../components/Key'
import { Actions } from './Actions'
import './Sheets.css'

export interface DetailSheetProps {
  b: BackupRecord
  title: string
  onTitle: (title: string) => void
  notes: string
  onNotes: (notes: string) => void
  /** fmtDateTime(b.createdAt) */
  madeText: string
  canRestore: boolean
  connected: boolean
  onRestore: () => void
  onShare: () => void
  onSave: () => void
  onDelete: () => void
  onDone: () => void
  onContents: () => void
  /** Only with two or more backups. */
  onCompareBackups: (() => void) | null
}

/** The title field's id: the sheet is named by its label. */
export const DETAIL_TITLE_ID = 'arc-detail-title'

export function DetailSheet(props: DetailSheetProps): JSX.Element {
  const { b } = props
  const facts = LibraryRules.facts(b, props.madeText)
  return (
    <>
      <Field id={DETAIL_TITLE_ID} label={Strings.NAME} value={props.title} onValueChange={props.onTitle} maxLength={80} />
      {/* Facts: grid-template-columns: auto 1fr, so the label column is as wide as the widest label. */}
      <dl class="detail-facts">
        {facts.map(([k, v]) => (
          <div key={k} class="detail-facts__row">
            <dt class="t-body15 detail-facts__key">{k}</dt>
            <dd class="t-body15 detail-facts__value">{v}</dd>
          </div>
        ))}
      </dl>
      {b.projects.length > 0 && (
        <ul class="detail-projects" role="list">
          {b.projects.map((n) => (
            <li key={n} class="detail-projects__row">
              <span class="t-body15 detail-projects__name">{Strings.projectLine(n)}</span>
              <span class="t-body15 detail-projects__sounds">{LibraryRules.projectSoundsDetail(b, n)}</span>
            </li>
          ))}
        </ul>
      )}
      <Field
        label={Strings.NOTES}
        value={props.notes}
        onValueChange={props.onNotes}
        singleLine={false}
        minLines={3}
        placeholder={Strings.NOTES_PLACEHOLDER}
      />
      <Actions
        keys={[
          {
            wide: true,
            key: (
              <Key
                text={props.connected ? Strings.RESTORE_TO_DEVICE : Strings.CONNECT_TO_RESTORE}
                variant="signal"
                block
                disabled={!props.canRestore}
                onClick={props.onRestore}
              />
            ),
          },
          { wide: false, key: <Key text={Strings.SHARE} block onClick={props.onShare} /> },
          { wide: false, key: <Key text={Strings.SAVE_PAK} block onClick={props.onSave} /> },
          // Addition to the web version: play and export what is inside.
          { wide: true, key: <Key text={FeatureText.CONTENTS} block onClick={props.onContents} /> },
          props.onCompareBackups !== null && {
            wide: true,
            key: <Key text={FeatureText.COMPARE_BACKUPS} block onClick={props.onCompareBackups} />,
          },
          { wide: true, key: <Key text={Strings.DELETE} variant="quiet" textColor="var(--danger)" block onClick={props.onDelete} /> },
        ]}
      />
      <button type="button" class="sheet-done t-bold" aria-label={Strings.CLOSE} onClick={props.onDone}>
        {Strings.DONE}
      </button>
    </>
  )
}
