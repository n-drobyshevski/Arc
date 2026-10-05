// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Chrome.kt (GuideEdgeTab)
//
// The vertical tab on the left edge that opens the EP-133 shortcut guide (the
// PO's TUTORIAL tab): 22×112, navy, rounded on its right, "GUIDE" reading
// bottom to top.
import type { JSX } from 'preact'
import { CoachText } from '../../core/text/coachText'
import { NavText } from '../../core/text/navText'
import './GuideEdgeTab.css'

export interface GuideEdgeTabProps {
  onClick: () => void
  class?: string
  /** Out of reach (under the section list's scrim). */
  inert?: boolean
}

export function GuideEdgeTab(props: GuideEdgeTabProps): JSX.Element {
  return (
    <button
      type="button"
      class={`guide-edge-tab${props.class ? ` ${props.class}` : ''}`}
      data-coach="edge.guide"
      aria-label={CoachText.GUIDE_TAB}
      title={CoachText.GUIDE_TAB}
      inert={props.inert || undefined}
      onClick={() => props.onClick()}
    >
      <span class="guide-edge-tab__text" aria-hidden="true">{NavText.GUIDE_TAB}</span>
    </button>
  )
}
