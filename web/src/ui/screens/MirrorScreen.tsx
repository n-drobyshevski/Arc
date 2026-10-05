// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt
//
// STUB (phase P4): the props are the real screen's (MirrorScreen(mirror, nameOf,
// onPadOrder, onBack, fixedNow, oneGroup, onOneGroup, follow, onFollow,
// initialGroup, initialToolsOpen)); phase P5 replaces the body. The tools side
// panel is a navigation layer (overlay 'side'), so Back closes it first:
// [toolsOpen] / [onTools] carry it.
import type { JSX } from 'preact'
import type { PadOrder } from '../../core/features/padPush'
import type { PhysicalPad } from '../../core/features/padNotes'
import { NavText } from '../../core/text/navText'
import type { MirrorUi } from '../../state/types'
import { Caption } from '../components/Caption'

export interface MirrorScreenProps {
  mirror: MirrorUi | null
  nameOf: (pad: PhysicalPad) => string | null
  onPadOrder: (order: PadOrder) => void
  /** Null on the Live tab, which has no close key. */
  onBack?: (() => void) | null
  /** A fixed time for screenshots; normally the frame clock drives the fade. */
  fixedNow?: number | null
  oneGroup: boolean
  onOneGroup: (on: boolean) => void
  follow: boolean
  onFollow: (on: boolean) => void
  initialGroup?: number
  /** The tools side panel (a navigation layer). */
  toolsOpen: boolean
  onTools: (open: boolean) => void
}

export function MirrorScreen(props: MirrorScreenProps): JSX.Element {
  return (
    <div class="screen-stub" data-screen="live">
      <Caption text={NavText.LIVE} />
      {props.mirror?.error && <p class="t-small screen-stub__note">{props.mirror.error}</p>}
    </div>
  )
}
