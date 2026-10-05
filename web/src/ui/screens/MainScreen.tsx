// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MainScreen.kt
//
// STUB (phase P4): the props are the real screen's (MainScreen(state, fmtDay,
// onBackup, onImport, onOpen, onSearch, onRestoreFolder) plus the web's library
// folder actions); phase P5 replaces the body.
import type { JSX } from 'preact'
import type { BackupRecord } from '../../core/text/libraryRules'
import { NavText } from '../../core/text/navText'
import type { UiState } from '../../state/types'
import { Caption } from '../components/Caption'

export interface MainScreenProps {
  state: UiState
  fmtDay: (ms: number) => string
  onBackup: () => void
  onImport: () => void
  /** A row tap: the detail sheet. */
  onOpen: (b: BackupRecord) => void
  onSearch: () => void
  /** Restore from a folder (Android: Documents/arc). */
  onRestoreFolder: () => void
  /** Web: the "Reconnect library folder" banner (state.folderStatus === 'prompt'). */
  onReconnectFolder: () => void
  /** Web: "Export library" where no folder can be picked (!state.canPickFolder). */
  onExportLibrary: () => void
}

export function MainScreen(props: MainScreenProps): JSX.Element {
  return (
    <div class="screen-stub" data-screen="backups">
      <Caption text={NavText.DEVICE_CAPTION} />
      <Caption text={NavText.BACKUPS} align="start" />
      <ul class="screen-stub__list" role="list">
        {props.state.backups.map((b) => (
          <li key={b.id}>
            <button type="button" class="screen-stub__row" onClick={() => props.onOpen(b)}>
              <span class="t-bold">{b.title}</span>
              <span class="t-small">{props.fmtDay(b.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
