// Port of core/src/main/kotlin/dev/arc/ep133/text/MirrorText.kt
//
// Text for the live mirror (an addition to the web version).
//
// Web delta: jsToFixed is native toFixed.

import type { Hit } from '../features/liveMirror'
import { noteName } from '../features/padNotes'
import { FeatureText } from './featureText'

export const MirrorText = {
  LIVE: 'Live',
  TITLE: 'Live',
  READING: 'Reading the device…',
  NOT_CONNECTED: 'Connect your EP-133 to see it live.',
  PLAYING: 'Playing',
  STOPPED: 'Stopped',
  NO_TRANSPORT: 'Play/stop and tempo need MIDI clock out: SHIFT + ERASE, then 102 and ENTER.',
  WAITING: 'Press a pad on the EP-133.',
  KEYS: 'Keys',
  LEARN_NOTE:
    'Sample names are learned as you press pads: one press of a key, in any group, names that key in every group, and arc remembers it.',
  COMMUNITY_NOTE:
    "Pads follow the official MIDI note map; play/stop and tempo are standard MIDI clock messages. Naming the samples relies on community notes about the device's SysEx, not on the official guide.",
  NO_PUSHES: "No pad messages from the device yet, so samples can't be named. Pads still light up.",
  LISTEN_ONLY:
    "arc only reads from the device here (sound names and the active project's pads); nothing on it is changed.",

  PAD_ORDER: 'Pad numbers in project files',
  FROM_TOP: 'From the top',
  FROM_BOTTOM: 'From the bottom',
  ORDER_NOTE:
    'Community notes disagree on how project files number the pads. If the names look wrong, try the other way.',
  GROUP: 'Group',

  // One group at a time (like the pocket operator app's single grid with its track keys).
  ALL_GROUPS: 'All groups',
  ONE_GROUP: 'One group',
  FOLLOW: 'Follow',
  TOOLS: 'Live tools',
  VIEW: 'View',
  FOLLOW_NOTE: 'Follow switches to the group of the pad just played.',

  groupKey(group: number): string {
    return String.fromCharCode(65 + group)
  },

  bpm(bpm: number): string {
    return `${bpm.toFixed(1)} BPM`
  },

  project(n: number): string {
    return `Project ${n}`
  },

  /** "P3", for the one-group view's one-line display. */
  projectShort(n: number): string {
    return `P${n}`
  },

  /** "A 7 · 001 kick · 96", or "C#5 · ch 1 · 80" for a note outside the pads. */
  hit(h: Hit): string {
    const where = h.pad !== null ? `${h.pad.groupLetter} ${h.pad.label}` : `${noteName(h.note)} · ch ${h.channel}`
    const sound = h.slot !== null ? ' · ' + FeatureText.slot(h.slot) + (h.name !== null ? ` ${h.name}` : '') : ''
    return `${where}${sound} · ${h.velocity}`
  },

  channel(ch: number): string {
    return `ch ${ch}`
  },
} as const
