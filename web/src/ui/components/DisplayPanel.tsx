// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (DisplayPanel)
//
// The dark display panel: the one loud element on the page. Radius 22,
// padding 18/18/20, 16px between children, a 1px pale rim below it and a 2px
// dark band along the top inner edge. A polite live region, as on Android.
import type { CSSProperties, ComponentChildren, JSX, Ref } from 'preact'
import './DisplayPanel.css'

export interface DisplayPanelProps {
  children?: ComponentChildren
  class?: string
  style?: CSSProperties
  /** aria-live="polite" (default true), as Modifier.semantics { liveRegion = Polite }. */
  live?: boolean
  id?: string
  ref?: Ref<HTMLDivElement>
}

export function DisplayPanel(props: DisplayPanelProps): JSX.Element {
  const { live = true } = props
  return (
    <div
      id={props.id}
      ref={props.ref}
      class={`display-panel${props.class ? ` ${props.class}` : ''}`}
      style={props.style}
      aria-live={live ? 'polite' : undefined}
    >
      {props.children}
    </div>
  )
}
