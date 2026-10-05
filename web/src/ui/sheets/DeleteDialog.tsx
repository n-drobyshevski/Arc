// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/Sheets.kt (DeleteDialog)
//
// "Delete "<title>" from this browser? This can't be undone." with Cancel and a
// danger Delete (WebText.deleteConfirm: the library lives in the browser).
import type { JSX } from 'preact'
import { Strings } from '../../core/text/strings'
import { WebText } from '../../core/text/webText'
import { Dialog } from '../components/Dialog'

export interface DeleteDialogProps {
  open: boolean
  title: string
  onConfirm: () => void
  onDismiss: () => void
}

export function DeleteDialog(props: DeleteDialogProps): JSX.Element | null {
  return (
    <Dialog
      open={props.open}
      text={WebText.deleteConfirm(props.title)}
      confirm={Strings.DELETE}
      confirmColor="var(--danger)"
      onConfirm={props.onConfirm}
      onDismiss={props.onDismiss}
    />
  )
}
