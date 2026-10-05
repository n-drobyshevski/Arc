// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/ContentsScreen.kt
//
// STUB (phase P4): the props are the real screen's (ContentsScreen(b, contents,
// playing, onPlay, onStop, onShareWav, onSaveWav, onShareProject, onSaveProject,
// onBack, onPads)); phase P5 replaces the body.
import type { JSX } from 'preact'
import type { PakSound } from '../../core/backup/pak'
import type { BackupRecord } from '../../core/text/libraryRules'
import { Strings } from '../../core/text/strings'
import type { ContentsUi } from '../../state/types'
import { Key } from '../components/Key'

export interface ContentsScreenProps {
  b: BackupRecord
  /** The opened backup (state.contents for b), null while it is read. */
  contents: ContentsUi | null
  playing: string | null
  onPlay: (slot: number) => void
  onStop: () => void
  onShareWav: (snd: PakSound) => void
  onSaveWav: (snd: PakSound) => void
  onShareProject: (n: number) => void
  onSaveProject: (n: number) => void
  onBack: () => void
  /** The project's pads sheet (a navigation layer 'pads:backup:<id>:<n>'). */
  onPads: (n: number) => void
}

export function ContentsScreen(props: ContentsScreenProps): JSX.Element {
  return (
    <div class="screen-stub screen-stub--full" data-screen="contents">
      <div class="screen-stub__head">
        <h1 class="t-heading">{props.b.title}</h1>
        <Key text={Strings.DONE} variant="quiet" size="small" onClick={props.onBack} />
      </div>
    </div>
  )
}
