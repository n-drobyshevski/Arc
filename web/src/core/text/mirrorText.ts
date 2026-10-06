// Port of core/src/main/kotlin/dev/arc/ep133/text/MirrorText.kt
//
// Text for the live mirror (an addition to the web version).
//
// Web delta: jsToFixed and String.format("%.0f") are native toFixed.

import { Keys, NoteNames, Scale } from '../features/keys'
import type { Hit } from '../features/liveMirror'
import { noteName, type PhysicalPad } from '../features/padNotes'
import { KeyMark } from '../features/piano'
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
  // Not connected and never read, with the factory sounds in the library: their first project.
  FACTORY: 'Factory sounds',
  FACTORY_NOTE:
    "Not connected: these are the EP-133's factory sounds, project 1 as it ships. Connect your EP-133 to see it live.",
  // Not connected and never read: a way to play without it.
  GET_FACTORY: 'Get the factory sounds to play without it',
  /** The note under "Offline" for the display's offline line ([lastSeen] or [FACTORY]). */
  offlineNote(offline: string): string {
    return offline === MirrorText.FACTORY ? MirrorText.FACTORY_NOTE : MirrorText.OFFLINE_NOTE
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
  /** How Live uses the device: it reads, and writes only a pad's sound, when asked in EDIT. */
  LISTEN_ONLY:
    "arc reads the device here (sound names, the active project's pads, and the samples on them, to keep a copy). It changes the device only when you give a pad another sound in EDIT.",

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

  // KEYS on the grid or the piano: two small icon keys after the KEYS word, remembered per window shape.
  KEYS_VIEW: 'Keys view',
  VIEW_PADS: 'Pads',
  VIEW_PIANO: 'Piano',
  /** What each icon key shows, for screen readers and long-press. */
  keysView(piano: boolean): string {
    return piano ? 'Keys on a piano' : 'Keys on the pads'
  },
  /** Why the piano key is greyed out. */
  PIANO_NO_ROOM: 'No room for the piano here',

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
  LEGEND_OCTAVE: 'Ring: the octave, pale and orange in turn (its number is in the corner)',
  LEGEND_OCTAVE_NAMED: 'Name: the octave, pale and orange in turn (its number is in the corner)',
  LEGEND_DEVICE: 'Filled: played on the EP-133',
  LEGEND_PHONE: 'Outlined: playing on the phone',
  LEGEND_ROOT: "Orange ring: the key's root",
  LEGEND_IN_SCALE: 'Ring: in the scale',
  /** The same, when the keys show their names (and no rings). */
  LEGEND_ROOT_NAMED: "Orange name: the key's root",
  LEGEND_IN_SCALE_NAMED: 'Name: in the scale',
  /** The piano's root, which has no ring. */
  LEGEND_ROOT_BAR: "Orange bar: the key's root",
  // The piano's rows: it shows every note, so the ones outside the scale too.
  LEGEND_OUT: 'Dimmed: outside the scale (still plays)',
  LEGEND_C: 'Number: the octave, on each C',

  // The piano: − and + step the octave, and the key gets its own word.
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

  NOTE_NAMES: 'Note names',

  /** The debug log's line for a Live sound: "live:0:3 heard 31 ms after the press (phone speaker)". */
  latencyNote(key: string, ms: number, route: string): string {
    return `${key} heard ${ms.toFixed(0)} ms after the press (${route})`
  },
  BLUETOOTH_DELAY:
    'Sound goes to Bluetooth, which plays late (often 0.2 s or more). Wired headphones or the phone speaker are much quicker.',
  /** Live's display line while the sound goes to Bluetooth; the line may cut it short, so the delay comes first. */
  WIRELESS_DELAY: 'Bluetooth plays late: wired or the speaker is quicker',
  /** The same where the route isn't known but the output's own delay is long: "Sound plays 140 ms late: wired output is quicker". */
  slowOutput(ms: number): string {
    return `Sound plays ${ms} ms late: wired output is quicker`
  },
  noteNames(n: NoteNames): string {
    switch (n) {
      case NoteNames.SOLFEGE:
        return 'DO RE MI'
      case NoteNames.LETTERS:
        return 'C D E'
    }
  },
  SHOW_NAMES: 'Key labels',
  SHOW_NAMES_NOTE: 'Off, the keys show only their rings and octave numbers; the display line still names the note.',
  NOTE_NAMES_NOTE: 'How KEYS names its notes and the key picker: fixed-do solfège (DO is C) or letters, sharps as C#, D#.',

  /** "A 7 · kick", the KEYS sound. */
  keysSound(pad: PhysicalPad, name?: string | null): string {
    return `${pad.groupLetter} ${pad.label}` + (name != null ? ` \u00B7 ${name}` : '')
  },

  PAD_ORDER: 'Pad numbers',
  FROM_TOP: 'From the top',
  FROM_BOTTOM: 'From the bottom',
  /** The same two, on the compact segmented control in Settings. */
  FROM_TOP_SHORT: 'Top',
  FROM_BOTTOM_SHORT: 'Bottom',
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

  // Live tools, redesigned: the long notes fold under one disclosure each.
  HOW_LIVE_READS: 'How Live reads the EP-133',
  HOW_KEYS_WORKS: 'How Keys works',
  /** The tools column's two tabs on a wide window: the tools, and the device's sounds to drag onto pads. */
  TAB_TOOLS: 'Tools',
  TAB_SOUNDS: 'Sounds',
  /** The hint beside the one-octave key picker. */
  KEY_HINT: 'tap a note',

  /** "Keys · MI4", the small display of the last note in the tools (upper-cased where shown). */
  lastNote(note: number, names: NoteNames): string {
    return `${MirrorText.KEYS} \u00B7 ${MirrorText.noteName(note, names)}`
  },

  // The colours as compact chips (the long rows stay for screen readers).
  CHIP_DEVICE: 'Played on the EP-133',
  CHIP_PHONE: 'Playing on the phone',
  CHIP_ROOT: 'Root',
  CHIP_OUT: 'Outside the scale',

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

  // ---------- EDIT: giving a pad another sound (community notes, see device.assignPad) ----------
  /** The edge tab under GUIDE, upper-case like it. */
  EDIT_TAB: 'EDIT',
  /** The tab for screen readers: what it does now. */
  editTab(on: boolean): string {
    return on ? 'Editing pads. Tap to stop.' : "Edit pads: change a pad's sound."
  },
  /** The display line while EDIT is on, after the EDIT word. */
  EDIT_LINE: 'Tap a pad to change its sound',

  /** "Pad A 8", the pad sheet's title. */
  padTitle(pad: PhysicalPad): string {
    return `Pad ${pad.groupLetter} ${pad.label}`
  },

  /** "now 101 snare 2", or "now empty": the sound on the pad, under the title. */
  padNow(slot: number | null, name: string | null): string {
    return 'now ' + (slot === null ? MirrorText.EMPTY : FeatureText.slot(slot) + (name !== null ? ` ${name}` : ''))
  },

  /** "Project 1 · now 101 snare 2". */
  padSheetLine(n: number, slot: number | null, name: string | null): string {
    return `${MirrorText.project(n)} \u00B7 ${MirrorText.padNow(slot, name)}`
  },
  EMPTY: 'empty',
  FIND_FOR_PAD: 'Find a sound for this pad',
  /** Marks the sound on the pad now in the sheet's list (upper-cased where shown). */
  ON_PAD: 'On pad',
  UPLOAD_NEW: 'Upload a new sample\u2026',
  ASSIGN_NOTE:
    "The pad takes the new sound at once. Its own settings (level, pitch and the rest) start again from the sample's, as when you change a pad's sound on the EP-133.",

  /** "Pad A 8: vox chop", the toast after a pad got another sound (with UNDO). */
  assigned(pad: PhysicalPad, name: string): string {
    return `Pad ${pad.groupLetter} ${pad.label}: ${name}`
  },
  UNDO: 'Undo',
  /** "Pad A 8: back to snare 2", after UNDO. */
  restored(pad: PhysicalPad, name: string): string {
    return `Pad ${pad.groupLetter} ${pad.label}: back to ${name}`
  },

  /** "snare 2 → vox chop", on a pad while a sound is dragged over it. */
  dropPreview(old: string | null, next: string): string {
    return `${old ?? MirrorText.EMPTY} \u2192 ${next}`
  },

  EDIT_OFFLINE: "Connect your EP-133 to change a pad's sound.",
  EDIT_NO_PROJECT: "arc hasn't read the active project yet. Wait a moment, or press a pad on the EP-133.",
  EDIT_PRESS_FIRST: "arc doesn't know which pad this is yet. Press it once on the EP-133, then tap it here.",
  NO_FREE_SLOT: 'No free slot left on the device. Delete a sound there first.',
  assignFailed(reason: string): string {
    return `The pad's sound couldn't be changed: ${reason}`
  },
  undoFailed(reason: string): string {
    return `The old sound couldn't be put back: ${reason}`
  },
  uploadFailed(reason: string): string {
    return `The sample couldn't be uploaded: ${reason}`
  },
} as const
