// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (GridPlate, PlateLine, Modifier.plateRow)
//
// A rounded pale plate whose rows are split by thin lines, like the pocket
// operator app's pad grid. Either put <PlateLine /> between children of a
// <GridPlate>, or (for long lists) give each row plateRowClass(first, last):
// only the plate's outer corners are rounded and a 1px line sits above every
// row but the first.
import type { AriaRole, CSSProperties, ComponentChildren, JSX, Ref } from 'preact'
import './GridPlate.css'

export interface GridPlateProps {
  children?: ComponentChildren
  class?: string
  style?: CSSProperties
  /** e.g. 'list' when the rows are list items. */
  role?: AriaRole
  'aria-label'?: string
  id?: string
  ref?: Ref<HTMLDivElement>
}

export function GridPlate(props: GridPlateProps): JSX.Element {
  return (
    <div
      id={props.id}
      ref={props.ref}
      role={props.role}
      aria-label={props['aria-label']}
      class={`grid-plate${props.class ? ` ${props.class}` : ''}`}
      style={props.style}
    >
      {props.children}
    </div>
  )
}

/** The 1px line between two rows of a GridPlate. */
export function PlateLine(): JSX.Element {
  return <div class="plate-line" aria-hidden="true" />
}

/** The classes of one row of a plate drawn row by row (Modifier.plateRow). */
export function plateRowClass(first: boolean, last: boolean): string {
  let cls = 'plate-row'
  if (first) cls += ' plate-row--first'
  if (last) cls += ' plate-row--last'
  return cls
}
