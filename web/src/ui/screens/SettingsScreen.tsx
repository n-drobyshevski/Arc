// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/SettingsScreen.kt
//
// STUB (phase P4): the props are the real screen's (SettingsScreen(settings, state,
// padOrder, version, onTheme, onAutoConnect, onKeepScreenOn, pruneCount,
// onKeepLast, onPadOrder, onForgetNames, onRestoreFolder, onSource,
// onFontLicence, onDebug, onBack) plus the web's folder actions); phase P5
// replaces the body. Its confirm dialogs are navigation layers
// (dialog 'prune:<keep>' / 'forget') opened through useNav().
import type { JSX } from 'preact'
import type { PadOrder } from '../../core/features/padPush'
import { SettingsText, type ThemeChoice } from '../../core/text/settingsText'
import { Strings } from '../../core/text/strings'
import type { AppSettings } from '../../platform/storage/settings'
import type { UiState } from '../../state/types'
import { Caption } from '../components/Caption'
import { Key } from '../components/Key'

export interface SettingsScreenProps {
  settings: AppSettings
  state: UiState
  padOrder: PadOrder
  version: string
  onTheme: (t: ThemeChoice) => void
  onAutoConnect: (on: boolean) => void
  onKeepScreenOn: (on: boolean) => void
  /** How many backups a new Keep value would delete now. */
  pruneCount: (keep: number | null) => number
  onKeepLast: (keep: number | null) => void
  onPadOrder: (order: PadOrder) => void
  onForgetNames: () => void
  onRestoreFolder: () => void
  /** Web: give the remembered library folder's permission back. */
  onReconnectFolder: () => void
  /** Web: zip of the library where no folder can be picked. */
  onExportLibrary: () => void
  onSource: () => void
  onFontLicence: () => void
  onDebug: () => void
  onBack: () => void
}

export function SettingsScreen(props: SettingsScreenProps): JSX.Element {
  return (
    <div class="screen-stub screen-stub--full" data-screen="settings">
      <div class="screen-stub__head">
        <Caption text={SettingsText.TITLE} align="start" />
        <Key text={Strings.DONE} variant="quiet" size="small" onClick={props.onBack} />
      </div>
      <Key text={Strings.DEBUG_TITLE} variant="quiet" size="small" onClick={props.onDebug} />
    </div>
  )
}
