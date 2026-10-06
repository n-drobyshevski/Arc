// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Chrome.kt (EditEdgeTab)
//
// Live's EDIT (giving a pad another sound): a vertical tab on the left edge,
// stacked under the GUIDE tab and drawn like it (22×112, "EDIT" reading
// bottom to top), with an LED near its top. On, it turns signal orange and
// its LED lights white. It shows on Live, in PADS, only.
//
// Web only, on the desk (from 1024px wide): the same tab hangs on the left
// side of the K.O. II panel (MirrorScreen) rather than the window's edge,
// which holds the nav rail.
import type { JSX } from 'preact'
import { CoachText } from '../../core/text/coachText'
import { MirrorText } from '../../core/text/mirrorText'
import './EditEdgeTab.css'

export interface EditEdgeTabProps {
  on: boolean
  onChange: (on: boolean) => void
  class?: string
  /** Out of reach (under the section list's scrim). */
  inert?: boolean
}

export function EditEdgeTab(props: EditEdgeTabProps): JSX.Element {
  const { on } = props
  return (
    <button
      type="button"
      class={`edit-edge-tab${on ? ' is-on' : ''}${props.class ? ` ${props.class}` : ''}`}
      aria-pressed={on}
      aria-label={MirrorText.editTab(on)}
      title={MirrorText.editTab(on)}
      data-coach="edge.edit"
      inert={props.inert || undefined}
      onClick={() => props.onChange(!on)}
    >
      <span class="edit-edge-tab__led" aria-hidden="true" />
      <span class="edit-edge-tab__text" aria-hidden="true">{MirrorText.EDIT_TAB}</span>
    </button>
  )
}
