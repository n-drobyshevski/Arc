// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/ProjectSheet.kt
//
// PROJECT held: projects 1 to 9 as dark keys in the keypad's order (7 8 9
// over 4 5 6 over 1 2 3), as the EP-133 picks a project with its pads. The
// project shown is orange; the ones Live can't go to now are greyed out. A
// pick goes to [onPick] and the sheet closes.
import type { JSX } from 'preact'
import { MirrorText } from '../../core/text/mirrorText'
import { Strings } from '../../core/text/strings'
import type { ProjectChoice } from '../live/projectKey'
import { Key } from '../components/Key'
import { Sheet } from '../components/Sheet'
import './ProjectSheet.css'

/** The sheet's keys in the EP-133's keypad order. */
const KEYPAD_ROWS: readonly (readonly number[])[] = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
]

export interface ProjectSheetProps {
  open: boolean
  choices: readonly ProjectChoice[]
  onPick(n: number): void
  onDismiss: () => void
}

export function ProjectSheet(props: ProjectSheetProps): JSX.Element {
  const byN = new Map(props.choices.map((c) => [c.n, c]))
  return (
    <Sheet open={props.open} onDismiss={props.onDismiss} labelledBy="project-sheet-title" class="project-sheet">
      <h2 id="project-sheet-title" class="t-heading project-sheet__title">
        {MirrorText.PROJECT_TITLE}
      </h2>
      <div class="project-sheet__pad">
        {KEYPAD_ROWS.map((row, r) => (
          <div key={r} class="project-sheet__row">
            {row.map((n) => {
              const c = byN.get(n) ?? { n, enabled: false, shown: false }
              return (
                <button
                  key={n}
                  type="button"
                  class={`project-pick cap-3d${c.shown ? ' is-shown' : ''}`}
                  aria-label={MirrorText.projectChoice(n, c.shown)}
                  aria-current={c.shown ? 'true' : undefined}
                  disabled={!c.enabled}
                  onClick={() => {
                    props.onPick(n)
                    props.onDismiss()
                  }}
                >
                  <span class="project-pick__n" aria-hidden="true">
                    {n}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <Key text={Strings.DONE} variant="quiet" block onClick={props.onDismiss} />
    </Sheet>
  )
}
