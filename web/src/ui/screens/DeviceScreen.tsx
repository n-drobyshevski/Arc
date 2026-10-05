// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/DeviceScreen.kt
//
// STUB (phase P4): the props are the real screen's (DeviceScreen(state, onRefresh,
// onSoundDetails, onProjectSounds, onAddSamples, onBack, playing, onPlay, onStop,
// onPads, initialSection, initialOpen)); phase P5 replaces the body.
import type { JSX } from 'preact'
import { NavText } from '../../core/text/navText'
import type { UiState } from '../../state/types'
import { Caption } from '../components/Caption'

export interface DeviceScreenProps {
  state: UiState
  onRefresh: () => void
  onSoundDetails: (slot: number) => void
  onProjectSounds: (project: number) => void
  /** Needs the tap's user activation (the file picker). */
  onAddSamples: () => void
  /** Null on the Device tab, which has no Done key. */
  onBack?: (() => void) | null
  playing: string | null
  onPlay: (slot: number) => void
  onStop: () => void
  /** The project's pads sheet (a navigation layer 'pads:device:<n>'). */
  onPads: (project: number) => void
  /** For screenshots: 0 sounds, 1 projects. */
  initialSection?: number
  initialOpen?: number | null
}

export function DeviceScreen(_props: DeviceScreenProps): JSX.Element {
  return (
    <div class="screen-stub" data-screen="device">
      <Caption text={NavText.DEVICE} />
    </div>
  )
}
