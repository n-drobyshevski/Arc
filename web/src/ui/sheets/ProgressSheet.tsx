// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/Sheets.kt (ProgressSheetContent)
// and the progress ArcSheet of MainActivity.kt Root() (onDismiss = null, grip = false).
//
// Modal: no Escape, no scrim, no Back (app.tsx's back guard). Title, the
// tip-hot progress meter, the current item (one line, ellipsis, min height
// 24), the web's "keep this tab open" line (WebText.KEEP_TAB_OPEN replaces
// Strings.KEEP_SCREEN_ON) and Cancel, disabled while cancelling. Cancel stops
// after the current item.
import type { JSX } from 'preact'
import { useRef } from 'preact/hooks'
import { Strings } from '../../core/text/strings'
import { WebText } from '../../core/text/webText'
import type { TaskUi } from '../../state/types'
import { Key } from '../components/Key'
import { ProgressMeter } from '../components/Meter'
import { Sheet } from '../components/Sheet'
import './Sheets.css'

const TITLE_ID = 'arc-progress-title'

/** The sheet body. */
export function ProgressSheetContent(props: { task: TaskUi; onCancel: () => void }): JSX.Element {
  const t = props.task
  return (
    <>
      <h2 id={TITLE_ID} class="t-heading progress-sheet__title">{t.title}</h2>
      <ProgressMeter fraction={t.fraction} label={t.title} />
      <p class="t-bold progress-sheet__label" title={t.label || undefined}>{t.label}</p>
      <p class="t-small progress-sheet__hint">{WebText.KEEP_TAB_OPEN}</p>
      <Key text={Strings.CANCEL} variant="quiet" block disabled={t.cancelling} onClick={props.onCancel} />
    </>
  )
}

/** The modal sheet over any tab; [task] null hides it (the last task stays shown while it goes). */
export function ProgressSheet(props: { task: TaskUi | null; onCancel: () => void }): JSX.Element {
  const last = useRef<TaskUi | null>(null)
  if (props.task) last.current = props.task
  const t = last.current
  return (
    <Sheet open={props.task !== null} onDismiss={null} grip={false} labelledBy={TITLE_ID} class="progress-sheet">
      {t && <ProgressSheetContent task={t} onCancel={props.onCancel} />}
    </Sheet>
  )
}
