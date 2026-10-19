// Port of core/src/main/kotlin/dev/arc/ep133/text/NavText.kt
//
// The top bar and the tabs along the bottom (an addition to the web version,
// which is a single page; the layout follows teenage engineering's pocket
// operator app).
//
// Web delta: LIVE is MirrorText.LIVE in Kotlin; the value ("Live",
// MirrorText.kt:9) is written out so this module does not depend on the
// mirror text layer.

import { Strings } from './strings'

const TABS = 'Sections'

export const NavText = {
  BACKUPS: Strings.BACKUPS,
  /** = MirrorText.LIVE */
  LIVE: 'Live',
  DEVICE: 'Device',
  GUIDE: 'Guide',
  BACK_UP: 'Back up',
  TABS,
  // Web delta: the web's connection key still disconnects on a tap; the hold is Android's.
  /** The toast a tap on the connection key shows while connected: it takes a hold of one second to disconnect. */
  HOLD_TO_DISCONNECT: 'Hold to disconnect',
  /** The section tag's spoken name: "Live, sections". */
  sectionTag(section: string): string {
    return `${section}, ${TABS}`
  },
  /** The left-edge tab that slides the EP-133 shortcut guide in. */
  GUIDE_TAB: 'Guide',

  /** The device panel's caption on the Backups tab. */
  DEVICE_CAPTION: 'EP-133',
} as const
