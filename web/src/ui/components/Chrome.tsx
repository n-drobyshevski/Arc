// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Chrome.kt
//
// The app around the sections, after the pocket operator app: no bar along the
// bottom. The top left holds a tag naming the section (like the PO's EDIT tag);
// a tap lists the sections. The EP-133 shortcut guide is a tab on the left edge
// (like the PO's TUTORIAL tab) that slides the guide in over the page.
//
// The pieces live in their own files (SectionTag, SectionMenu, TopBar,
// GuideEdgeTab, Shell); this module holds what they share and re-exports them.
import { NavText } from '../../core/text/navText'
import type { Tab } from '../../state/types'

export type { Tab }

/** enum class Tab(val label): the sections, in menu order. */
export const TAB_ENTRIES: readonly Tab[] = ['backups', 'live', 'device']

/** Tab.label */
export function tabLabel(t: Tab): string {
  switch (t) {
    case 'backups':
      return NavText.BACKUPS
    case 'live':
      return NavText.LIVE
    case 'device':
      return NavText.DEVICE
  }
}

/** EdgeTabWidth: how wide the left-edge guide tab is (screens keep this much gutter on the left). */
export const EDGE_TAB_WIDTH = 22

export { SectionTag, type SectionTagProps } from './SectionTag'
export { SectionMenu, type SectionMenuProps } from './SectionMenu'
export { TopBar, type TopBarProps } from './TopBar'
export { GuideEdgeTab, type GuideEdgeTabProps } from './GuideEdgeTab'
export { Shell, type ShellProps } from './Shell'
