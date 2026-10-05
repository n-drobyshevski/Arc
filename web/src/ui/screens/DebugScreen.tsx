// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/DebugScreen.kt
//
// STUB (phase P4): the props are the real screen's (DebugScreen(log, onShare,
// onSave, onCopy, onBack)); phase P5 replaces the body.
import type { JSX } from 'preact'
import type { TrafficLog } from '../../core/protocol/trafficLog'
import { Strings } from '../../core/text/strings'
import { Key } from '../components/Key'

export interface DebugScreenProps {
  log: TrafficLog
  /** These three need the tap's user activation. */
  onShare: () => void
  onSave: () => void
  onCopy: () => void
  onBack: () => void
}

export function DebugScreen(props: DebugScreenProps): JSX.Element {
  return (
    <div class="screen-stub screen-stub--full" data-screen="debug">
      <div class="screen-stub__head">
        <h1 class="t-heading">{Strings.DEBUG_TITLE}</h1>
        <Key text={Strings.DONE} variant="quiet" size="small" onClick={props.onBack} />
      </div>
    </div>
  )
}
