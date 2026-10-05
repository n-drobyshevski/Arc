// Port of core/src/main/kotlin/dev/arc/ep133/text/MirrorText.kt
//
// Text for the live mirror (an addition to the web version).
//
// Web delta: jsToFixed and String.format("%.0f") are native toFixed.

import { Keys, NoteNames, Scale } from '../features/keys'
import { KeyMark } from '../features/piano'
import type { Hit } from '../features/liveMirror'
import { noteName, type PhysicalPad } from '../features/padNotes'
import { FeatureText } from './featureText'

export const MirrorText = {
  LIVE: 'Live',
  TITLE: 'Live',
  READING: 'Reading the device…',
  NOT_CONNECTED: 'Connect your EP-133 to see it live.',
  // Not connected, with the last read kept: the pads and names as they were then.
  OFFLINE: 'Offline',
  OFFLINE_NOTE:
    'Not connected: the pads and sample names are as arc last read them. Connect your EP-133 to see it live.',
  // Screen reader state of the folded note under "Offline".
  NOTE_SHOWN: 'Note shown',
  NOTE_HIDDEN: 'Tap for a note',
  /** "Last seen 5 Oct, 14:02", for the display while offline. */
  lastSeen(at: string): string {
    return `Last seen ${at}`
  },
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
    "arc only reads from the device here (sound names, the active project's pads, and the samples on them, to keep a copy); nothing on it is changed.",

  // Tapping a pad plays its sample on the phone.
  TAP_NOTE:
    "Hold a pad to hear its sample on the phone (it stops when you let go): from arc's copy of the device's sounds, a backup, or the device.",
  NO_SAMPLE: "arc doesn't know this pad's sample yet.",
  NO_COPY: "This sample isn't saved on the phone or in a backup yet.",
  SOUNDS_CLEARED: 'Saved pad sounds cleared.',
  PLAY: 'Play',

  // KEYS: one sound played as notes across the pads, like the EP-133's KEYS mode.
  MODE_PADS: 'Pads',
  MODE_KEYS: 'Keys',
  KEY: 'Key',
  SCALE: 'Scale',
  PICK_SOUND: "Tap a pad in Pads first: Keys plays that pad's sample.",
  NO_SOUND: 'No sound picked',

  /** The mode word under the grid, for screen readers: what it shows and what a tap does. */
  modeSwitch(keysOn: boolean): string {
    return keysOn ? 'Keys. Tap for pads.' : 'Pads. Tap for keys.'
  },

  scaleChoice(s: Scale): string {
    return `Scale: ${MirrorText.scaleName(s)}. Tap to change.`
  },
  KEYS_NOTE:
    'Keys plays the pad last tapped (or played on the EP-133 in Pads) as notes. Notes the EP-133 sends in its own KEYS mode light their key.',
  PIANO_HINT: 'Turn the phone sideways for a piano (with auto-rotate off, tap the rotate button Android shows).',
  LEGEND: 'Colours',
  LEGEND_ROOT: "Orange ring: the key's root",
  LEGEND_IN_SCALE: 'Navy ring: in the scale',
  // The piano's rows: it shows every note, so the ones outside the scale too.
  LEGEND_OUT: 'Dimmed: outside the scale (still plays)',
  LEGEND_C: 'Number: the octave, on each C',
  LEGEND_DEVICE: 'Filled: played on the EP-133',
  LEGEND_PHONE: 'Outlined: playing on the phone',

  // The piano in landscape: − and + step the octave, and the key gets its own word.
  OCTAVE_DOWN: 'Octave down',
  OCTAVE_UP: 'Octave up',

  /** "KEY DO", the key word above the piano. */
  keyWord(root: number, names: NoteNames): string {
    return `${MirrorText.KEY} ${Keys.name(root, names)}`
  },

  keyChoice(root: number, names: NoteNames): string {
    return `${MirrorText.KEY}: ${Keys.name(root, names)}. Tap to change.`
  },

  /** "MAJ", the scale word when the row above the piano runs out of room. */
  scaleCode(s: Scale): string {
    switch (s) {
      case Scale.CHROMATIC:
        return 'Chr'
      case Scale.MAJOR:
        return 'Maj'
      case Scale.MINOR:
        return 'Min'
      case Scale.DORIAN:
        return 'Dor'
      case Scale.PHRYGIAN:
        return 'Phr'
      case Scale.LYDIAN:
        return 'Lyd'
      case Scale.MIXOLYDIAN:
        return 'Mix'
      // The word is upper-cased, so the two pentatonics differ in letters, not case.
      case Scale.MAJOR_PENTATONIC:
        return 'Maj.P'
      case Scale.MINOR_PENTATONIC:
        return 'Min.P'
      case Scale.BLUES:
        return 'Blu'
    }
  },

  /** A piano key for screen readers: "LA4, root", "LA4, in the scale" or "FA4, outside the scale". */
  pianoKey(note: number, names: NoteNames, mark: KeyMark): string {
    const where = mark === KeyMark.ROOT ? ', root' : mark === KeyMark.IN ? ', in the scale' : ', outside the scale'
    return MirrorText.noteName(note, names) + where
  },

  /** "Keyboard, DO3 to DO5", the piano as a whole for screen readers. */
  pianoRange(lo: number, hi: number, names: NoteNames): string {
    return `Keyboard, ${MirrorText.noteName(lo, names)} to ${MirrorText.noteName(hi, names)}`
  },

  /** "DO2, below the keys": a note from the EP-133 the piano doesn't reach, for the display and the tick at that end. */
  outOfRange(note: number, names: NoteNames, below: boolean): string {
    return MirrorText.noteName(note, names) + (below ? ', below the keys' : ', above the keys')
  },

  scaleName(s: Scale): string {
    switch (s) {
      case Scale.CHROMATIC:
        return 'Chromatic'
      case Scale.MAJOR:
        return 'Major'
      case Scale.MINOR:
        return 'Minor'
      case Scale.DORIAN:
        return 'Dorian'
      case Scale.PHRYGIAN:
        return 'Phrygian'
      case Scale.LYDIAN:
        return 'Lydian'
      case Scale.MIXOLYDIAN:
        return 'Mixolydian'
      case Scale.MAJOR_PENTATONIC:
        return 'Major penta'
      case Scale.MINOR_PENTATONIC:
        return 'Minor penta'
      case Scale.BLUES:
        return 'Blues'
    }
  },

  /** "OCT 4", the octave word under the keys. */
  octave(n: number): string {
    return `Oct ${n}`
  },

  octaveChoice(n: number): string {
    return `Octave ${n}. Tap to change.`
  },

  /** "MI4", or "E4" with letter names. */
  noteName(note: number, names: NoteNames = NoteNames.SOLFEGE): string {
    return Keys.name(note, names) + Keys.octaveOf(note)
  },

  NOTE_NAMES: 'Note names on the keys',

  /** The debug log's line for a Live sound: "live:0:3 heard 31 ms after the press (phone speaker)". */
  latencyNote(key: string, ms: number, route: string): string {
    return `${key} heard ${ms.toFixed(0)} ms after the press (${route})`
  },
  BLUETOOTH_DELAY:
    'Sound goes to Bluetooth, which plays late (often 0.2 s or more). Wired headphones or the phone speaker are much quicker.',
  noteNames(n: NoteNames): string {
    switch (n) {
      case NoteNames.SOLFEGE:
        return 'DO RE MI'
      case NoteNames.LETTERS:
        return 'C D E'
    }
  },
  NOTE_NAMES_NOTE: 'How KEYS names its notes and the key picker: fixed-do solfège (DO is C) or letters, sharps as C#, D#.',

  /** "A 7 · kick", the KEYS sound. */
  keysSound(pad: PhysicalPad, name?: string | null): string {
    return `${pad.groupLetter} ${pad.label}` + (name != null ? ` \u00B7 ${name}` : '')
  },

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
