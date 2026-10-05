// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/Sheets.kt (Actions, ActionsScope)
//
// The two-column action grid of a sheet: "wide" keys span both columns, "half"
// keys pair up two to a row; a half key left alone (before a wide key or at the
// end) gets the whole row. 10px between rows and between the keys of a row.
import type { ComponentChildren, JSX } from 'preact'
import './Sheets.css'

export interface ActionKey {
  /** Spans both columns (Kotlin `wide { }`) instead of half of one row (`half { }`). */
  readonly wide: boolean
  readonly key: ComponentChildren
}

/** The rows the keys are laid out in, as indexes into [keys] (Actions' pairing loop). */
export function actionRows(keys: readonly { readonly wide: boolean }[]): number[][] {
  const rows: number[][] = []
  let pending: number | null = null
  keys.forEach((k, i) => {
    if (k.wide) {
      if (pending !== null) rows.push([pending])
      pending = null
      rows.push([i])
    } else if (pending === null) {
      pending = i
    } else {
      rows.push([pending, i])
      pending = null
    }
  })
  if (pending !== null) rows.push([pending])
  return rows
}

export function Actions(props: { keys: readonly (ActionKey | null | false)[] }): JSX.Element {
  const keys = props.keys.filter((k): k is ActionKey => !!k)
  return (
    <div class="sheet-actions">
      {actionRows(keys).map((row) => (
        <div key={row.join('-')} class="sheet-actions__row">
          {row.map((i) => <div key={i} class="sheet-actions__cell">{keys[i]?.key}</div>)}
        </div>
      ))}
    </div>
  )
}
