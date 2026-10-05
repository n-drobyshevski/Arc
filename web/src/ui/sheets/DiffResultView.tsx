// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/Sheets.kt (DiffResultView)
//
// What a restore would change on the device (an addition to the web version):
// the summary, then every sound that would change and every project that is
// not the same, then what the device has that the backup doesn't. A pale
// key-coloured card, radius 10, padding 12/14, 6px between lines.
import type { JSX } from 'preact'
import type { DiffResult } from '../../core/features/backupDiff'
import { FeatureText } from '../../core/text/featureText'
import { Strings } from '../../core/text/strings'
import './Sheets.css'

/** The heading of one changed sound (the Kotlin call site's own "Sound <slot>, <name>"). */
export function soundLine(slot: number, backupName: string): string {
  return `Sound ${FeatureText.slot(slot)}, ${backupName}`
}

export function DiffResultView(props: { result: DiffResult }): JSX.Element {
  const r = props.result
  const untouched = FeatureText.untouched(r)
  return (
    <div class="diff-result" role="status">
      <p class="t-semi diff-result__summary">{FeatureText.diffSummary(r)}</p>
      {r.sounds.filter((d) => !d.unchanged).map((d) => (
        <div key={`s${d.slot}`} class="diff-result__item">
          <p class="t-small diff-result__name">{soundLine(d.slot, d.backupName)}</p>
          <p class="t-small diff-result__state">{FeatureText.soundState(d)}</p>
        </div>
      ))}
      {r.projects.filter((p) => p.state !== 'SAME').map((p) => (
        <div key={`p${p.project}`} class="diff-result__item">
          <p class="t-small diff-result__name">{Strings.projectLine(p.project)}</p>
          <p class="t-small diff-result__state">{FeatureText.projectState(p.state)}</p>
        </div>
      ))}
      {untouched.length > 0 && <p class="t-small diff-result__state">{untouched}</p>}
    </div>
  )
}
