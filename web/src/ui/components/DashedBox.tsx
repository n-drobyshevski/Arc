// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (DashedBox)
//
// The "No backups yet." box: a 2px keyEdge outline dashed 6/6 with radius 12,
// padding 22/18, 4px between children. The outline is an SVG rect so the dash
// pattern is exactly Android's (a CSS dashed border picks its own lengths).
import type { ComponentChildren, JSX, Ref } from 'preact'
import './DashedBox.css'

export interface DashedBoxProps {
  children?: ComponentChildren
  class?: string
  id?: string
  ref?: Ref<HTMLDivElement>
}

export function DashedBox(props: DashedBoxProps): JSX.Element {
  return (
    <div id={props.id} ref={props.ref} class={`dashed-box${props.class ? ` ${props.class}` : ''}`}>
      <svg class="dashed-box__outline" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="100%" height="100%" rx="12" ry="12" />
      </svg>
      {props.children}
    </div>
  )
}
