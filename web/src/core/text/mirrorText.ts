// Port of core/src/main/kotlin/dev/arc/ep133/text/MirrorText.kt
//
// Text for the live mirror (an addition to the web version).
//
// Web deltas:
// - jsToFixed and String.format("%.0f") are native toFixed.
// - The web has no REC (TAKE), so only its takeLength is here, for SAMPLE's
//   times; TAKE's words are Android's only.

import type { ArpNote, ArpOrder } from '../features/arp'
import { FactorySounds } from '../features/factorySounds'
import { FxSettings, FxType } from '../features/fxSettings'
import { Keys, NoteNames, Scale } from '../features/keys'
import type { Hit } from '../features/liveMirror'
import type { PlayMode } from '../features/padSettings'
import { noteName, type PhysicalPad } from '../features/padNotes'
import { ProjectSeq, Seq, TIMING_INTERVALS, Timing, timingTicks } from '../features/pattern'
import { KeyMark } from '../features/piano'
import { ProjectSource } from '../features/projectStep'
import { SampleSource } from '../features/sampleSource'
import { SwitchTime } from '../features/scenes'
import type { TransportState } from '../features/transport'
import { FeatureText } from './featureText'
import { plural } from './format'

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
  // Not connected, with the factory sounds in the library: one of their projects (the first unless PROJECT steps on).
  FACTORY: 'Factory sounds',
  factoryNote(project: number): string {
    return `Not connected: these are the EP-133's factory sounds, project ${project} as it ships. Connect your EP-133 to see it live.`
  },
  // Not connected and never read: a way to play without it.
  GET_FACTORY: 'Get the factory sounds to play without it',
  /** The note under "Offline" for the display's offline line ([lastSeen] or [FACTORY]), showing [project]. */
  offlineNote(offline: string, project: number = FactorySounds.PROJECT): string {
    return offline === MirrorText.FACTORY ? MirrorText.factoryNote(project) : MirrorText.OFFLINE_NOTE
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
  /** How Live uses the device: it reads, and writes only a pad's sound (in EDIT) and the active project (PROJECT), when asked. */
  // Web delta: the web has no PROJECT key (Android's Live function keys), so it isn't named here.
  LISTEN_ONLY:
    "arc reads the device here (sound names, the active project's pads, and the samples on them, to keep a copy). It changes the device only when you give a pad another sound in EDIT.",

  // Tapping a pad plays its sample on the phone.
  TAP_NOTE:
    "Hold a pad to hear its sample on the phone (it stops when you let go): from arc's copy of the device's sounds, a backup, or the device.",
  NO_SAMPLE: "arc doesn't know this pad's sample yet.",
  NO_COPY: "This sample isn't saved on the phone or in a backup yet.",
  // The same for a factory sound (FactorySounds.unnamed) while the pack isn't in the library.
  NO_COPY_FACTORY: "This factory sample isn't saved on the phone yet: Settings → Live → Factory sounds → Get.",
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

  // ---------- The function keys over the pads: PROJECT, KEYS (MODE_KEYS over MODE_PADS) and TEMPO ----------
  /** The keys' two words: the main one on the cap, the second on its coloured lower half. */
  FN_PROJECT: 'Project',
  FN_PROJECT_SUB: '1\u20139',
  FN_TEMPO: 'Tempo',
  FN_TEMPO_SUB: 'Tap',
  /** SOUND: EDIT on or off (its lower half says EDIT); held, the sheet of the pad played last. */
  FN_SOUND: 'Sound',
  SOUND_SHEET: "Pad's sound",
  PLAY_A_PAD: 'Play a pad first: SOUND held opens its sound.',

  /** PROJECT for screen readers: "Project 3", "Factory project 3", or "No project" before one is read. */
  projectKeyState(n: number | null, source: ProjectSource): string {
    if (n === null) return 'No project'
    if (source === ProjectSource.FACTORY) return `Factory project ${n}`
    return MirrorText.project(n)
  },
  PROJECT_NEXT: 'Next project',
  /** PROJECT held: the project sheet, its title, and each key there for screen readers. */
  PICK_PROJECT: 'Choose a project',
  PROJECT_TITLE: 'Project',
  projectChoice(n: number, shown: boolean): string {
    return MirrorText.project(n) + (shown ? ', shown' : '')
  },
  /** Why PROJECT is greyed out. */
  PROJECT_UNAVAILABLE: 'Connect the EP-133 or get the factory sounds to change projects',
  /** A pad tapped in EDIT while the device switches projects. */
  PROJECT_SWITCHING: 'The EP-133 is switching projects. Try again in a moment.',
  projectFailed(reason: string): string {
    return `The project couldn't be switched: ${reason}`
  },

  // TEMPO: a click on the phone. Tap turns it on or off; hold opens the tempo sheet.
  CLICK: 'Click',
  /** TEMPO for screen readers: "On, 120 BPM", "Off, 98 BPM, from the EP-133". */
  clickState(on: boolean, bpm: number, following: boolean): string {
    return (on ? 'On' : 'Off') + `, ${MirrorText.tempoValue(bpm)}` + (following ? ', from the EP-133' : '')
  },
  SET_TEMPO: 'Set tempo',
  TEMPO_TITLE: 'Tempo',
  /** The sheet's big pad for screen readers (it shows [FN_TEMPO_SUB]). */
  TAP_TEMPO: 'Tap tempo',
  SLOWER: 'Slower',
  FASTER: 'Faster',
  /** The sheet while the EP-133 sends MIDI clock: its tempo leads, so − + and TAP rest. */
  FOLLOWING: "Following the EP-133's tempo (MIDI clock).",
  /** "120 BPM". */
  tempoValue(bpm: number): string {
    return `${bpm} BPM`
  },
  /** "120", under a narrow key. */
  tempoShort(bpm: number): string {
    return `${bpm}`
  },

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
  /** The Bluetooth chip on Live's display line, for as long as the sound goes to Bluetooth: its tooltip and what a screen reader says. */
  WIRELESS_DELAY: 'Bluetooth plays late: wired or the speaker is quicker',
  /** The same chip while Make up for Bluetooth delay is on, with the delay it makes up for: "Bluetooth plays late (about 180 ms): arc makes up for it". */
  wirelessMadeUp(ms: number): string {
    return `Bluetooth plays late (about ${ms} ms): arc makes up for it`
  },
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

  // ---------- EDIT: a pad's SOUND EDIT settings (community notes, see device.writePadSettings) ----------
  /** The pages, as the device prints them (upper-cased where shown), in [pageName]'s order. */
  PAGE_SOUND: 'Sound',
  PAGE_TRIM: 'Trim',
  PAGE_ENV: 'Env',
  PAGE_MIDI: 'Midi',
  PAGE_MUTE: 'Mute',
  /** Page [i]'s name: Sound, Trim, Env, Midi, Mute. Kotlin's List.get throws past the end; this does too. */
  pageName(i: number): string {
    const pages = [MirrorText.PAGE_SOUND, MirrorText.PAGE_TRIM, MirrorText.PAGE_ENV, MirrorText.PAGE_MIDI, MirrorText.PAGE_MUTE]
    const p = pages[i]
    if (p === undefined) throw new RangeError(`Index ${i} out of bounds for length ${pages.length}`)
    return p
  },

  /** The knobs' names. */
  PITCH: 'Pitch',
  LEVEL: 'Level',
  MODE: 'Mode',
  PAN: 'Pan',
  START: 'Start',
  LENGTH: 'Length',
  ATTACK: 'Attack',
  RELEASE: 'Release',
  CHANNEL: 'Channel',
  MUTE_GROUP: 'Mute group',
  /** A knob's readout while its value isn't known (the trim before the sample's length is). */
  NO_VALUE: '\u2014',

  /** "+1.5", "-12", "0": semitones, at most two decimals. */
  pitchLabel(semitones: number): string {
    const r = Math.round(semitones * 100) / 100
    if (r === 0 || Number.isNaN(r)) return '0'
    return (r > 0 ? '+' : '-') + String(Math.abs(r))
  },

  /** "100". */
  levelLabel(level: number): string {
    return `${level}`
  },

  /** "C" in the middle, "L8" to the left, "R16" to the right. */
  panLabel(pan: number): string {
    return pan < 0 ? `L${-pan}` : pan > 0 ? `R${pan}` : 'C'
  },

  modeLabel(m: PlayMode): string {
    switch (m) {
      case 'oneshot':
        return 'Oneshot'
      case 'key':
        return 'Key'
      case 'legato':
        return 'Legato'
    }
  },

  /** "0.25 s": [frames] at [rate] frames a second. */
  secondsLabel(frames: number, rate: number): string {
    return `${(rate > 0 ? frames / rate : 0).toFixed(2)} s`
  },

  /** An envelope time as the device keeps it, 0..255 (its milliseconds aren't known for sure). */
  envLabel(ticks: number): string {
    return `${ticks}`
  },

  /** "1".."16" for channels 0..15. */
  channelLabel(ch: number): string {
    return `${ch + 1}`
  },

  onOff(on: boolean): string {
    return on ? 'On' : 'Off'
  },

  /** A knob for screen readers: "Pitch: +1.5." */
  knobDescription(name: string, value: string): string {
    return `${name}: ${value}.`
  },

  /** TRIM's waveform for screen readers: "Plays 46875 frames from frame 1200." */
  trimDescription(start: number, length: number): string {
    return `Plays ${length} frames from frame ${start}.`
  },
  /** Under ENV while the pad is Oneshot, which plays to the end. */
  ONESHOT_RELEASE: 'Oneshot plays to the end: release is for Key and Legato.',
  /** Under MUTE. */
  MUTE_NOTE: 'Pads with the mute group on cut each other off within their group: playing one stops the others.',

  /** The pad sheet's note under the knobs: while the pad's settings are read, offline, or else. */
  PAD_READING: "Reading the pad's settings\u2026",
  PAD_READ_FAILED: "The EP-133 didn't send this pad's settings. Close the sheet and open it again to retry.",
  PAD_SETTINGS_OFFLINE: "Offline, the pad's settings change in arc only. When you connect, arc asks before putting them on the EP-133.",
  PAD_SETTINGS_NOTE: 'Turns go on the EP-133 as soon as you let go.',
  /** The key that folds the sheet's sound list away while the settings show, and back. */
  CHANGE_SOUND: 'Change sound',
  HIDE_SOUNDS: 'Hide sounds',
  padSettingsFailed(reason: string): string {
    return `The pad's settings couldn't be changed: ${reason}`
  },

  // ---------- Offline: the sounds panel and pad changes in arc only, put on the EP-133 when it connects ----------
  /** The Device / Factory switch over the sound list. */
  SOURCE: 'Sounds from',
  SOURCE_DEVICE: 'Device',
  SOURCE_FACTORY: 'Factory',
  /** A device sound arc has no copy or backup of, dimmed in the list. */
  NEEDS_DEVICE: 'Needs the EP-133',

  /** "Pad A 8: kick, in arc until you connect", the toast after a pad got another sound offline. */
  assignedOffline(pad: PhysicalPad, name: string): string {
    return `${MirrorText.assigned(pad, name)}, in arc until you connect`
  },
  ASSIGN_NOTE_OFFLINE: 'Offline, the pad changes in arc only. When you connect, arc asks before putting it on the EP-133.',

  /** The Live tools row while offline changes are kept, with [RESET_PADS]. */
  OFFLINE_PADS: 'Offline pad changes',
  offlinePadsNote(n: number): string {
    return `${plural(n, 'pad')} changed in arc only. When you connect, arc asks before putting ${n === 1 ? 'it' : 'them'} on the EP-133.`
  },
  RESET_PADS: 'Reset pads',
  PADS_RESET: "Pads back to the EP-133's sounds.",

  /**
   * The question when the EP-133 connects with offline changes kept: [WRITE] or [DISCARD].
   * [n] counts the pad changes and [samples] the new recordings waiting to go on, so a
   * prompt for recordings alone doesn't call them pad changes.
   */
  putOffline(n: number, samples: number = 0): string {
    const what =
      samples === 0
        ? plural(n, 'offline pad change')
        : n === 0
          ? plural(samples, 'new sample')
          : `${plural(n, 'offline pad change')} and ${plural(samples, 'new sample')}`
    return `Put ${what} on the EP-133?`
  },
  WRITE: 'Write',
  DISCARD: 'Discard',
  /** "2 pads put on the EP-133. 1 skipped: …", after [WRITE]. */
  offlineWritten(written: number, skipped: number): string {
    return (
      `${plural(written, 'pad')} put on the EP-133.` +
      (skipped === 0 ? '' : ` ${skipped} skipped: the EP-133 has another sound or project there now.`)
    )
  },
  OFFLINE_DISCARDED: 'Offline pad changes discarded.',

  /** "0:12", "10:00". */
  takeLength(seconds: number): string {
    // Kotlin's toLong(): toward zero.
    const s = Math.trunc(seconds)
    return `${Math.trunc(s / 60)}:${String(s % 60).padStart(2, '0')}`
  },

  // ---------- SAMPLE: recording into a pad (an addition) ----------
  /** The sources' words, upper-cased where shown, as the device prints them. */
  MIC: 'Mic',
  RSP: 'Rsp',
  USB: 'Usb',
  STEREO: 'Stereo',

  /** "Rsp St", the source chip (upper-cased where shown: "RSP ST"); mono has no mark, as on the device. */
  sourceShort(s: SampleSource, stereo: boolean): string {
    const word = s === SampleSource.MIC ? MirrorText.MIC : s === SampleSource.RSP ? MirrorText.RSP : MirrorText.USB
    return word + (stereo ? ' St' : '')
  },

  /** The source spelt out for screen readers: "Phone mic, mono", "EP-133 over USB, stereo". */
  sourceName(s: SampleSource, stereo: boolean): string {
    const name = s === SampleSource.MIC ? 'Phone mic' : s === SampleSource.RSP ? "Resample the phone's sound" : 'EP-133 over USB'
    return name + (stereo ? ', stereo' : ', mono')
  },
  /** The − and + either side of the source chip. */
  PREV_SOURCE: 'Previous source',
  NEXT_SOURCE: 'Next source',

  // KNOB X is [LEVEL] (the input's gain) and KNOB Y the threshold, as on the device.
  /** THRESHOLD under knob Y; [THRESHOLD_NAME] for screen readers, where the short word reads badly. */
  THRESHOLD: 'Thresh',
  THRESHOLD_NAME: 'Threshold',

  /** "+12 dB", "−6 dB" or "0 dB": the input's gain under LEVEL. */
  gainReadout(db: number): string {
    return db > 0 ? `+${db} dB` : db < 0 ? `\u2212${-db} dB` : '0 dB'
  },

  /** "−24 dB", or "Off" with no threshold (recording starts at the press). */
  thresholdReadout(db: number | null): string {
    return db === null ? MirrorText.onOff(false) : MirrorText.gainReadout(db)
  },

  /** A take of a set length, in bars of the tempo: "Free" (until you let go), "1 bar", "2 bars". */
  BARS: 'Bars',
  barsChoice(n: number | null): string {
    return n === null ? 'Free' : plural(n, 'bar')
  },

  /**
   * The switch for hands-free takes, for one hand or a screen reader; while
   * one goes on (or counts in, or waits) its key reads STOP ([FeatureText.STOP]).
   */
  LATCH: 'Latch',
  LATCH_NOTE: 'Latch on: tap a pad to record hands-free. Tap it again or STOP to stop.',
  /** The meter, for screen readers, and its clip light. */
  INPUT_LEVEL: 'Input level',
  CLIPPING: 'Clipping',

  // The display line in the mode, grown into the SAMPLE panel: the tag, then what happens next.
  SAMPLE_TAG: 'Sample',
  SAMPLE_READY: 'Hold a pad to record',
  SAMPLE_READY_LATCH: 'Tap a pad to record hands-free',
  /** Armed with a threshold: the take starts with the first sound loud enough. */
  SAMPLE_WAITING: 'Waiting for sound',
  /** A take of set bars from USB while the EP-133 sends MIDI clock: it starts with the device's PLAY. */
  WAITING_FOR_PLAY: 'Press PLAY on the EP-133',
  countIn(beat: number): string {
    return `Count-in ${beat}`
  },

  /** "0:04 / 0:20": the take so far, and the longest it can be. */
  sampleTime(seconds: number, max: number): string {
    return `${MirrorText.takeLength(seconds)} / ${MirrorText.takeLength(max)}`
  },

  /** "Takes up to 40 s": the panel's wave strip before the first take, the longest one can be. */
  sampleMax(seconds: number): string {
    return `Takes up to ${seconds} s`
  },

  /** "Pad A 7: uploading, 40%"; without [percent] as a screen reader hears it, once rather than at each step. */
  sampleUploading(pad: PhysicalPad, percent: number | null = null): string {
    return `${MirrorText.padTitle(pad)}: uploading` + (percent === null ? '' : `, ${percent}%`)
  },

  /** A full-length take won't fit in the EP-133's free space, so takes stop sooner. */
  DISK_LOW: 'Disk low',
  diskLow(seconds: number): string {
    return `${MirrorText.DISK_LOW}: room for ${seconds} s`
  },

  /** Added to a pad's name for screen readers in the mode: ", has a sound" or ", empty". */
  padSampleState(filled: boolean): string {
    return filled ? ', has a sound' : ', empty'
  },
  /** Added to the take's pad instead: recording into it, or waiting to (for sound, the count-in or PLAY). */
  PAD_RECORDING: ', recording',
  PAD_WAITING: ', waiting to record',
  /** A pad's click in the mode for screen readers, which can't hold: a latched take, its end, or (before it starts) its cancel. */
  RECORD_HANDS_FREE: 'Record hands-free',
  STOP_RECORDING: 'Stop recording',
  CANCEL_RECORDING: 'Cancel recording',

  /** A short tap on an empty pad in the mode. */
  HOLD_TO_RECORD: 'Hold the pad to record. A tap plays a pad that has a sound.',
  /** The mic permission was refused for good, with [MIC_SETTINGS] to open the app's settings. */
  NO_MIC: 'arc needs the microphone to sample the mic or USB. RSP works without it.',
  MIC_SETTINGS: 'Settings',
  USB_EXPERIMENTAL: 'USB sampling is experimental. The EP-133 needs OS 2.5 and its sound going out over USB.',
  USB_GONE: 'The USB input went away. What was recorded is kept.',
  inputFailed(reason: string): string {
    return `The input couldn't be opened: ${reason}`
  },
  /** Android silences the mic while another app (a call, say) records. */
  MIC_BUSY: 'Another app is using the mic.',
  /** On return, after the take stopped because arc left the screen. */
  SAMPLE_BACKGROUND: 'Sampling stopped when arc left the screen. The recording is kept.',

  // The review sheet after a take: trim and hear it, then KEEP, RETAKE or DISCARD (with UNDO).
  REVIEW_TITLE: 'New sample',

  /** "Pad A 7 · 0:04 · RSP ST", under the review sheet's title. */
  reviewLine(pad: PhysicalPad, seconds: number, source: SampleSource, stereo: boolean): string {
    return `${MirrorText.padTitle(pad)} \u00B7 ${MirrorText.takeLength(seconds)} \u00B7 ${MirrorText.sourceShort(source, stereo).toUpperCase()}`
  },
  NORMALIZE: 'Normalize',
  NORMALIZE_NOTE: 'Raises the sample so its loudest point is at 0 dB.',
  TRIM_SILENCE: 'Trim silence',
  TRIM_SILENCE_NOTE: 'Starts the sample where the sound starts.',
  RETAKE: 'Retake',
  KEEP: 'Keep',

  /** "Slot 214, the next free one": where KEEP puts the sample (− and + step over the free slots). */
  slotLine(slot: number, next: boolean): string {
    return `Slot ${slot}` + (next ? ', the next free one' : '')
  },
  /** The − and + either side of the slot line. */
  PREV_SLOT: 'Previous free slot',
  NEXT_SLOT: 'Next free slot',
  /** Offline, the slot is picked on upload: the free ones aren't known until then. */
  SLOT_WHEN_CONNECTED: 'Goes into the next free slot when the EP-133 connects.',

  /** "Pad A 7: kept in arc. It goes on the EP-133 when you connect.", after KEEP offline. */
  sampleQueued(pad: PhysicalPad): string {
    return `${MirrorText.padTitle(pad)}: kept in arc. It goes on the EP-133 when you connect.`
  },
  /** "Pad A 7: new sample on the EP-133.", once the upload is done. */
  sampleSaved(pad: PhysicalPad): string {
    return `${MirrorText.padTitle(pad)}: new sample on the EP-133.`
  },
  /** A pad pressed for a sound only the EP-133 has while a new sample goes up to it, Live playing on. */
  DEVICE_UPLOADING: "The EP-133 is taking a new sample. This sound plays once it's done.",
  SAMPLE_DISCARDED: 'Sample discarded.',
  /** A take with no pad to go on (no project read yet): it isn't lost. */
  KEPT_IN_TAKES: 'Kept in Takes: read a project on the EP-133 to put samples on pads.',
  /** "2 samples kept in Takes.", after offline recordings were discarded or reset: never dropped. */
  samplesToTakes(n: number): string {
    return `${plural(n, 'sample')} kept in Takes.`
  },

  /** SAMPLE's BARS choice for a take as long as the pattern (upper-cased where shown: "PTN"). */
  PTN: 'Ptn',
  PTN_NAME: "The pattern's length",
  PTN_NOTE: 'Records as long as the longest pattern, from its start: at once when stopped, else from the next loop.',

  // ---------- PATTERN: the pads played into a looping pattern with RECORD and PLAY, as on the device ----------
  // PLAY, UNDO and LENGTH are the words above; a running pattern's key reads STOP ([FeatureText.STOP]).
  /** The sheet held RECORD opens. */
  PATTERN: 'Pattern',
  RECORD: 'Record',
  ERASE: 'Erase',
  TIMING: 'Timing',
  COUNT_IN: 'Count-in',
  COUNT_IN_NOTE: 'RECORD then PLAY counts a bar in. RECORD and PLAY together start at once.',
  /** AUTO length: a pattern recorded from stop into an empty group ends where you stop. */
  AUTO: 'Auto',
  AUTO_NOTE: 'An empty group recorded from stop ends where you stop: 1, 2, 4 or 8 bars.',
  CLEAR: 'Clear',
  CLEAR_ALL: 'Clear all',
  /** SHIFT + + on the device: twice as long, the notes copied in. [DOUBLE_NAME] for screen readers. */
  DOUBLE: '\u00D72',
  DOUBLE_NAME: 'Double the length',
  /** The − and + either side of a group's length. */
  SHORTER: 'Shorter',
  LONGER: 'Longer',
  PATTERN_NOTE: 'Patterns stay in arc and play on the phone.',

  /** "2.3 / 4": bar 2, beat 3 of a 4-bar pattern, on the display line while it runs. */
  patternPosition(bar: number, beat: number, bars: number): string {
    return `${bar}.${beat} / ${bars}`
  },

  /** "2.3 / 4 · 1/16" while recording: the grid the notes snap to as well. */
  patternRecording(bar: number, beat: number, bars: number, timing: Timing): string {
    return `${MirrorText.patternPosition(bar, beat, bars)} \u00B7 ${MirrorText.timingLabel(timing)}`
  },

  /** "/ 4" beside the count-in's big digit ([countIn] for screen readers). */
  countInOf(beats: number): string {
    return `/ ${beats}`
  },

  /** "Play a pad or PLAY \u00B7 1/16" on the display line while RECORD is armed: what starts it (a pad at once, PLAY after the count-in), and the grid. */
  patternArmed(timing: Timing): string {
    return `Play a pad or PLAY \u00B7 ${MirrorText.timingLabel(timing)}`
  },

  /** TIMING's choices: Off, 1/1, 1/2, 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32. */
  timingLabel(t: Timing): string {
    return t === Timing.OFF ? MirrorText.onOff(false) : t
  },

  /**
   * The display line while the arp plays: "ARP \u00B7 1/16 \u00B7 DO FA LA" (KEYS,
   * the notes held by [names]), "REPEAT \u00B7 1/16 \u00B7 A 7, B 1" for note repeat
   * (PADS: [repeat]), the pads held; "ARP \u221E \u00B7 \u2026" latched.
   */
  arpLine(repeat: boolean, latch: boolean, interval: Timing, notes: readonly ArpNote[], names: NoteNames): string {
    const words = notes.map((n) => (n.semitones !== null ? Keys.name(Keys.ROOT_NOTE + n.semitones, names) : `${n.pad.groupLetter} ${n.pad.label}`))
    const head = (repeat ? 'REPEAT' : 'ARP') + (latch ? ' \u221E' : '')
    return `${head} \u00B7 ${MirrorText.timingLabel(interval)} \u00B7 ${words.join(repeat ? ', ' : ' ')}`
  },

  /** A TIMING choice for screen readers: a triplet ("1/8T") said as "1/8 triplet". */
  timingName(t: Timing): string {
    return t === Timing.OFF ? 'Timing off: notes stay where you play them' : `Timing ${t}: notes snap to the nearest ${timingSpoken(t)}`
  },

  // ---------- ARP: the arpeggiator and note repeat, and TIMING (an addition: the device's TIMING + pads) ----------
  /** The switch on the pads' plate: ARP in KEYS, RPT (note repeat) in PADS; their names for screen readers. */
  ARP: 'Arp',
  RPT: 'Rpt',
  ARP_NAME: 'Arpeggiator',
  RPT_NAME: 'Note repeat',

  /** LATCH greyed out while the arp is off: why. */
  arpFirst(repeat: boolean): string {
    return `Turn on ${repeat ? 'RPT' : 'ARP'} first`
  },

  /** The tempo sheet's two pages: TEMPO (the click) and TIMING. */
  TEMPO_TAB: 'Tempo',
  INTERVAL: 'Interval',
  SWING: 'Swing',
  GATE: 'Gate',
  /** SWING's knob rests at the other intervals. */
  SWING_NOTE: 'Swing plays at 1/8 and 1/16.',
  QUANTIZE: 'Quantize',
  FREE_TIME: 'Free time',
  QUANTIZE_NOTE: 'Quantize: notes you record snap to the interval. Free time: they stay where you play them.',
  TIMING_NOTE: 'The interval is the step the arp and note repeat play at, and the grid recording snaps to.',
  ARP_SECTION: 'Arp and repeat',
  ORDER: 'Order',
  OCTAVES: 'Octaves',
  /** Beside GATE's knob: what it sets. */
  GATE_NOTE: 'How long each note sounds, as a share of the step.',
  ARP_LATCH_NOTE: 'Latch on: the notes play on after you let go. The next press starts a new set.',

  /** A knob's percent: "56%". */
  percent(v: number): string {
    return `${v}%`
  },

  /** An INTERVAL choice for screen readers: "Interval 1/8 triplet". */
  intervalName(t: Timing): string {
    return `Interval ${timingSpoken(t)}`
  },

  /** The arp's orders as their keys print them, and in full for screen readers. */
  arpOrderName(o: ArpOrder): string {
    return ARP_ORDER_NAMES[o]
  },

  arpOrderSpoken(o: ArpOrder): string {
    return o === 'played' ? 'As played' : o === 'updown' ? 'Up and down' : ARP_ORDER_NAMES[o]
  },

  /** "A · 2 bars", a group's length in the sheet; "Group A, 2 bars" for screen readers. */
  groupLength(group: number, bars: number): string {
    return `${groupLetter(group)} \u00B7 ${plural(bars, 'bar')}`
  },
  groupLengthName(group: number, bars: number): string {
    return `Group ${groupLetter(group)}, ${plural(bars, 'bar')}`
  },

  /** CLEAR asks in the sheet: one group's notes, or every group's. */
  clearAsk(group: number | null): string {
    return group === null ? "Clear every group's notes?" : `Clear group ${groupLetter(group)}'s notes?`
  },
  cleared(group: number | null): string {
    return group === null ? 'Patterns cleared.' : `Group ${groupLetter(group)} cleared.`
  },

  /** ERASE on: what a pad does now. */
  ERASE_NOTE: 'Tap a pad to erase its notes. Hold one while the pattern plays to erase it as it passes.',
  /** "Pad A 7: notes erased.", after a tap in ERASE. */
  erased(pad: PhysicalPad): string {
    return `${MirrorText.padTitle(pad)}: notes erased.`
  },
  /** Added to a pad's name for screen readers in ERASE. */
  PAD_HAS_NOTES: ', has notes',

  /** "3 pads not loaded": pads the pattern plays whose sounds aren't on the phone yet. */
  missingPads(n: number): string {
    return `${plural(n, 'pad')} not loaded`
  },
  MISSING_NOTE: "Their sounds aren't on the phone yet. They play once arc has them.",

  /** The RECORD key for screen readers: "Record, armed". */
  recordDescription(state: TransportState): string {
    const word =
      state.phase === 'ARMED' || (state.phase === 'COUNT_IN' && state.recording) ? 'armed' : state.recording ? 'recording' : 'off'
    return `${MirrorText.RECORD}, ${word}`
  },
  /** What a hold on RECORD does, for screen readers. */
  RECORD_HOLD: 'Pattern settings',

  /** The PLAY key for screen readers: "Play, bar 2 of 4". */
  playDescription(state: TransportState, bar: number, bars: number): string {
    switch (state.phase) {
      case 'STOPPED':
      case 'ARMED':
        return MirrorText.PLAY
      case 'COUNT_IN':
        return `${MirrorText.PLAY}, counting in`
      case 'PLAYING':
        return `${MirrorText.PLAY}, bar ${bar} of ${bars}`
    }
  },

  /** Said once when the transport changes: "Record armed", "Counting in", "Recording", "Playing", "Stopped". */
  transportAnnouncement(state: TransportState): string {
    switch (state.phase) {
      case 'STOPPED':
        return MirrorText.STOPPED
      case 'ARMED':
        return 'Record armed'
      case 'COUNT_IN':
        return 'Counting in'
      case 'PLAYING':
        return state.recording ? 'Recording' : MirrorText.PLAYING
    }
  },

  // ---------- SCENES: the pattern each group plays, picked as MAIN and GROUP do on the device; copy and paste ----------
  /** "P01": a group's pattern [n] (1..99). */
  patternLabel(n: number): string {
    return `P${twoDigits(n)}`
  },

  /** "S01": the scene at [index] (from 0), shown from 1. */
  sceneLabel(index: number): string {
    return `S${twoDigits(index + 1)}`
  },

  /** "A01": [group]'s pattern [n], as the group keys and the scene line show it. */
  groupPattern(group: number, n: number): string {
    return `${groupLetter(group)}${twoDigits(n)}`
  },

  /** "S01 · A01 B03 C01 D02": the scene playing, and each group's pattern in it. */
  sceneLine(seq: ProjectSeq): string {
    const groups = [0, 1, 2, 3].map((g) => MirrorText.groupPattern(g, ProjectSeq.selected(seq, g)))
    return `${MirrorText.sceneLabel(seq.scene)} \u00B7 ${groups.join(' ')}`
  },

  /** The scene change setting's choices (410 to 412 on the device). */
  switchName(t: SwitchTime): string {
    switch (t) {
      case SwitchTime.IMMEDIATE:
        return 'Immediate'
      case SwitchTime.BAR:
        return 'Bar end'
      case SwitchTime.PATTERN:
        return 'Pattern end'
    }
  },

  /** "P01 → P05": a group's pattern playing, and the one waiting to take over. */
  queuedLabel(from: number, to: number): string {
    return `${MirrorText.patternLabel(from)} \u2192 ${MirrorText.patternLabel(to)}`
  },

  /** What SHIFT + C copied: pattern [n], [bar] (as shown, from 1) or a pad's notes (the pad's [name]). */
  copiedPattern(n: number): string {
    return `${MirrorText.patternLabel(n)} copied.`
  },
  copiedBar(bar: number): string {
    return `Bar ${bar} copied.`
  },
  copiedPad(name: string): string {
    return `${name} copied.`
  },

  /** Where SHIFT + D pasted: into pattern [n], [bar] (from 1) or onto a pad (its [name]). */
  pastedPattern(n: number): string {
    return `Pasted into ${MirrorText.patternLabel(n)}.`
  },
  pastedBar(bar: number): string {
    return `Pasted into bar ${bar}.`
  },
  pastedPad(name: string): string {
    return `Pasted onto ${name}.`
  },

  /** ERASE + MAIN held: CLR emptied the scene's patterns, DEL deleted the empty scene. */
  CLEARED_SCENE: 'Scene cleared.',
  DELETED_SCENE: 'Scene deleted.',

  // The scene panel's status line (upper-cased where shown) and what a screen reader is told of each change.
  /** When a pick takes over, for the status and screen readers: "now", "at bar end", "at pattern end". */
  switchAt(t: SwitchTime): string {
    switch (t) {
      case SwitchTime.IMMEDIATE:
        return 'now'
      case SwitchTime.BAR:
        return 'at bar end'
      case SwitchTime.PATTERN:
        return 'at pattern end'
    }
  },

  /** "B → 05": group [group] changing to pattern [to]. */
  groupMove(group: number, to: number): string {
    return `${groupLetter(group)} \u2192 ${twoDigits(to)}`
  },

  /** "→ S03": the scene waiting to take over. */
  sceneMove(index: number): string {
    return `\u2192 ${MirrorText.sceneLabel(index)}`
  },

  /** "B → 05 at bar end": what waits ([move]: groupMove's, or sceneMove's) and for when. */
  queuedLine(move: string, t: SwitchTime): string {
    return `${move} ${MirrorText.switchAt(t)}`
  },

  /** "S03 committed": COMMIT made the scene at [index]. */
  sceneCommitted(index: number): string {
    return `${MirrorText.sceneLabel(index)} committed`
  },

  /** COMMIT with 99 scenes already. */
  SCENES_FULL: 'No room for another scene',

  /** "S05 cleared", "S05 deleted": what ERASE + MAIN held did to the scene at [index]. */
  sceneCleared(index: number): string {
    return `${MirrorText.sceneLabel(index)} cleared`
  },
  sceneDeleted(index: number): string {
    return `${MirrorText.sceneLabel(index)} deleted`
  },

  /** "B · pick 01–99": the grid open over the pads for [group]. */
  gridStatus(group: number): string {
    return `${groupLetter(group)} \u00B7 pick 01\u201399`
  },

  /** "A01 copied", "A bar 2 copied", "KICK copied": [what] the clip took; "A05 pasted", "SNARE pasted": where it went. */
  clipCopied(what: string): string {
    return `${what} copied`
  },
  clipPasted(what: string): string {
    return `${what} pasted`
  },

  /** The PAD clip's two stages: COPY waits for the pad to copy, then PASTE for the pad ([word], the one copied) to paste onto. */
  PAD_TAP_SOURCE: 'Tap a pad',
  padTapTarget(word: string): string {
    return `${word} \u2192 tap target`
  },

  /** PASTE with nothing of its kind copied. */
  NO_PATTERN_COPIED: 'No pattern copied',
  NO_BAR_COPIED: 'No bar copied',
  NO_PAD_COPIED: 'No pad copied',

  /** A scene for screen readers: "Scene 2 of 3, patterns A 1, B 3, C 1, D 2". */
  sceneSpoken(index: number, count: number, patterns: readonly number[]): string {
    return `Scene ${index + 1} of ${count}, patterns ${patterns.map((n, g) => `${groupLetter(g)} ${n}`).join(', ')}`
  },

  /** A group's pattern for screen readers: "Group B, pattern 5, 4 bars". */
  patternSpoken(group: number, n: number, bars: number): string {
    return `Group ${groupLetter(group)}, pattern ${n}, ${bars} ${bars === 1 ? 'bar' : 'bars'}`
  },

  /** A change waiting, for screen readers: "Group B, pattern 5, at bar end", "Scene 3, at pattern end". */
  patternQueuedSpoken(group: number, n: number, t: SwitchTime): string {
    return `Group ${groupLetter(group)}, pattern ${n}, ${MirrorText.switchAt(t)}`
  },
  sceneQueuedSpoken(index: number, t: SwitchTime): string {
    return `Scene ${index + 1}, ${MirrorText.switchAt(t)}`
  },

  /** COMMIT for screen readers: "Scene 3 committed". */
  sceneCommittedSpoken(index: number): string {
    return `Scene ${index + 1} committed`
  },

  // The scene panel's own words (upper-cased where shown) and their names for screen readers.
  /** The panel's name, and ✕ closing it; the S01 chip on the display line for screen readers: "Scenes, scene 2 of 3". */
  SCENE_NAME: 'Scenes and patterns',
  CLOSE_SCENE: 'Close scenes and patterns',
  sceneChipName(index: number, count: number): string {
    return `Scenes, scene ${index + 1} of ${count}`
  },

  /** The panel's status while nothing else is said: "Scene 2 of 3". */
  sceneStatus(index: number, count: number): string {
    return `Scene ${index + 1} of ${count}`
  },

  /** "03": a pattern's number as the group keys and columns show it; "03→05": the one playing and the one waiting. */
  patternNumber(n: number): string {
    return twoDigits(n)
  },
  numberMove(n: number, to: number): string {
    return `${twoDigits(n)}\u2192${twoDigits(to)}`
  },

  /** The head's − and + around the scene; + on the last scene makes a new one. */
  PREV_SCENE: 'Previous scene',
  NEXT_SCENE: 'Next scene',
  NEW_SCENE: 'New scene',

  /** A group's column: its name for screen readers ("Group B, pattern 3, has notes"), and what its number does. */
  groupColumn(group: number, n: number, notes: boolean): string {
    return `Group ${groupLetter(group)}, pattern ${n}` + (notes ? ', has notes' : '')
  },
  PICK_PATTERN: 'Pick a pattern',
  groupPrevious(group: number): string {
    return `Group ${groupLetter(group)}, previous pattern`
  },
  groupNext(group: number): string {
    return `Group ${groupLetter(group)}, next pattern`
  },

  /** NEXT FREE: the first pattern after this one with no notes ("Group B, next free pattern"). */
  NEXT_FREE: 'Next free',
  groupNextFree(group: number): string {
    return `Group ${groupLetter(group)}, next free pattern`
  },

  /** A group key's pattern for screen readers, after its name: ", pattern 3", and ", changing to 5" while one waits. */
  groupKeyPattern(n: number, queued: number | null): string {
    return `, pattern ${n}` + (queued !== null ? `, changing to ${queued}` : '')
  },

  /** COMMIT (duplicates the scene), and what it does for screen readers. */
  COMMIT: 'Commit',
  COMMIT_NOTE: 'Makes a new scene after this one, with copies of the patterns in free slots.',

  /** CLR and DEL, the hold key (DEL when the scene is empty): its name, what holding does, and the status while it is held ("Hold · Del S05"). */
  CLR: 'Clr',
  DEL: 'Del',
  eraseSceneName(del: boolean): string {
    return del ? 'Delete scene' : 'Clear scene'
  },
  HOLD_NOTE: 'Hold for two seconds.',
  eraseHolding(del: boolean, scene: string): string {
    return `Hold \u00B7 ${del ? MirrorText.DEL : MirrorText.CLR} ${scene}`
  },

  /** CHANGE: when a pick takes over. The chip's name for screen readers ("Scene change: Bar end") and what a tap does. */
  CHANGE: 'Change',
  changeName(t: SwitchTime): string {
    return `Scene change: ${MirrorText.switchName(t)}`
  },
  CHANGE_NOTE: 'Tap to change when a pick takes over: now, at bar end, or at pattern end. Stopped, it is always at once.',

  /** The pattern sheet's SCENE CHANGE row, the same setting: its caption and a line under the choices. */
  SCENE_CHANGE: 'Scene change',
  SCENE_CHANGE_NOTE: "Playing: a new pattern or scene waits for the bar's or pattern's end. Stopped: always at once.",

  /** CLIP: PTN, BAR and PAD (their names for screen readers), COPY and PASTE, and the bar pages' row ("Group A · bar", "Clip · A bar 2"). */
  CLIP: 'Clip',
  CLIP_PAD: 'Pad',
  CLIP_PTN_NAME: 'Whole pattern',
  CLIP_BAR_NAME: 'One bar',
  CLIP_PAD_NAME: "One pad's notes",
  COPY: 'Copy',
  PASTE: 'Paste',
  barPagesGroup(group: number): string {
    return `Group ${groupLetter(group)} \u00B7 bar`
  },
  clipHeld(what: string): string {
    return `Clip \u00B7 ${what}`
  },

  /** The 1–99 grid over the pads: its name, ✕ closing it, its title ("Group B") and the pattern it starts on ("P03 · 4 bars"). */
  GRID_NAME: 'Pattern grid',
  CLOSE_GRID: 'Close pattern grid',
  gridTitle(group: number): string {
    return `Group ${groupLetter(group)}`
  },
  gridDetail(n: number, bars: number): string {
    return `${MirrorText.patternLabel(n)} \u00B7 ${plural(bars, 'bar')}`
  },

  /** A cell of the grid for screen readers: "Pattern 5, has notes" (the pattern playing is selected; the next free one says so). */
  patternCell(n: number, notes: boolean): string {
    return `Pattern ${n}` + (notes ? ', has notes' : '')
  },

  /** The grid's legend (upper-cased where shown). */
  GRID_HAS_NOTES: 'Has notes',
  GRID_EMPTY: 'Empty',
  GRID_PLAYING: 'Playing',

  // ---------- STEP: the pattern a step at a time while stopped, and timing correct, as on the device ----------
  /**
   * The step cursor as the device shows it: bar, beat and the step in the
   * beat, from 1 ("1.2.1" is the 5th 1/16). At a beat or longer the third is
   * 1; triplets count 1..3 in a beat at 1/8T, 1..6 at 1/16T.
   */
  stepLabel(step: number, interval: Timing): string {
    const ticks = timingTicks(interval)
    const t = step * ticks
    const sub = ticks < Seq.PPQN ? Math.trunc((t % Seq.PPQN) / ticks) + 1 : 1
    return `${Math.trunc(t / Seq.TICKS_PER_BAR) + 1}.${Math.trunc((t % Seq.TICKS_PER_BAR) / Seq.PPQN) + 1}.${sub}`
  },

  /** A note's length on a step: an interval's word ("1/16"), "1 bar", sixteenths ("3/16"), else ticks ("50 tk"). */
  gateLabel(ticks: number): string {
    if (ticks === Seq.TICKS_PER_BAR) return '1 bar'
    const interval = TIMING_INTERVALS.find((t) => timingTicks(t) === ticks)
    if (interval !== undefined) return interval
    const sixteenth = timingTicks(Timing.SIXTEENTH)
    return ticks % sixteenth === 0 ? `${ticks / sixteenth}/16` : `${ticks} tk`
  },

  /** "3 corrected": the notes timing correct put on the grid. */
  correctedLine(n: number): string {
    return `${n} corrected`
  },

  /** The STEP panel's status as RECORD + pad puts a note on the step: "+ SNARE". */
  stepPlaced(word: string): string {
    return `+ ${word}`
  },

  /** A note put on a step, for screen readers: "SNARE on step 1.2.1". */
  stepPlacedSpoken(word: string, step: string): string {
    return `${word} on step ${step}`
  },

  /** "KICK → 1.2.2": the note picked, nudged, and the step it sits on now. */
  stepNudged(word: string, step: string): string {
    return `${word} → ${step}`
  },

  /** A nudge for screen readers: "KICK moved to step 1.2.2". */
  stepNudgedSpoken(word: string, step: string): string {
    return `${word} moved to step ${step}`
  },

  /** "KICK +1 tk": a held pad's notes moved by CORRECT's − / +, the ticks so far ("−2 tk" earlier). */
  stepShifted(word: string, ticks: number): string {
    const signed = ticks > 0 ? `+${ticks}` : ticks < 0 ? `−${-ticks}` : '0'
    return `${word} ${signed} tk`
  },

  /** A shift for screen readers: "KICK 1 tick later", "KICK 2 ticks earlier", "KICK back in place". */
  stepShiftedSpoken(word: string, ticks: number): string {
    if (ticks === 0) return `${word} back in place`
    const n = Math.abs(ticks)
    return `${word} ${n} ${n === 1 ? 'tick' : 'ticks'} ${ticks > 0 ? 'later' : 'earlier'}`
  },

  /** The step cursor for screen readers: "Step 1.2.1", and ", 2 notes" with notes on it. */
  stepSpoken(step: string, notes: number): string {
    return `Step ${step}` + (notes === 0 ? '' : notes === 1 ? ', 1 note' : `, ${notes} notes`)
  },

  /** The STEP chip on the stopped display line and the panel it opens (upper-cased where shown); its name for screen readers. */
  STEP: 'Step',
  STEP_NAME: 'Step editing',
  CLOSE_STEP: 'Close step editing',

  /** "STEP 1.2.1": the panel's status line while nothing else is said. */
  stepStatus(step: string): string {
    return `STEP ${step}`
  },

  /** The panel's RECORD, held: what it does, for screen readers (a click holds it until the next). */
  STEP_RECORD_NOTE: 'Hold and tap a pad to put it on the step',

  /** − and + either side of the strip. */
  PREV_STEP: 'Previous step',
  NEXT_STEP: 'Next step',

  /** A cell of the strip for screen readers: "Step 1.2.1, has notes". */
  stepCell(step: string, notes: boolean): string {
    return `Step ${step}` + (notes ? MirrorText.PAD_HAS_NOTES : '')
  },

  /** The panel's knobs, every note on the step (upper-cased where shown), and their names for screen readers. */
  VEL: 'Vel',
  LEN: 'Len',
  VELOCITY: 'Velocity',
  NOTE_LENGTH: 'Note length',

  /** BAR's pages under a pattern longer than a bar; "Bar 2" for screen readers. */
  BAR: 'Bar',
  barPage(bar: number): string {
    return `Bar ${bar}`
  },

  /** The panel's latches: NUDGE (a tap picks a lit pad for − / +) and CORRECT (timing correct), upper-cased where shown. */
  NUDGE: 'Nudge',
  CORRECT: 'Correct',

  /** NUDGE with a note picked: "Nudge · KICK". */
  nudgeChip(word: string | null): string {
    return word === null ? MirrorText.NUDGE : `${MirrorText.NUDGE} · ${word}`
  },

  /** What NUDGE and CORRECT do, after their state for screen readers. */
  NUDGE_NOTE: 'Tap a lit pad to pick it, then − and + move its note.',
  CORRECT_NOTE: 'Tap a pad to put its notes on the grid. While the pattern plays, hold one to correct it as it passes.',

  /** Added to a pad's or key's name for screen readers in the STEP panel: on the cursor's step, and picked for − / +. */
  ON_STEP: ', on the step',
  PICKED: ', picked',

  /** A long press on a lit pad or key: picked for − / +; its action's name for screen readers. */
  PICK: 'Pick to nudge',

  // ---------- FX: the master effect, the sends, the output compressor and the sidechain (an addition) ----------
  /** FX, the fourth function key: its two words. A tap opens the FX sheet; held, the pads play the punch-ins. */
  FN_FX: 'FX',
  FN_FX_SUB: 'Page',
  /** FX for screen readers, before the effect on (fxName): "Effects, Delay". */
  FX_EFFECTS: 'Effects',
  FX_SHEET: 'Effect settings',
  PUNCH_INS: 'Punch-ins',

  /** An effect's name for screen readers and the XY pad: "Delay", or "Off" for none. */
  fxName(type: FxType): string {
    switch (type) {
      case FxType.NONE:
        return MirrorText.onOff(false)
      case FxType.DELAY:
        return 'Delay'
      case FxType.REVERB:
        return 'Reverb'
      case FxType.DISTORTION:
        return 'Distortion'
      case FxType.CHORUS:
        return 'Chorus'
      case FxType.FILTER:
        return 'Filter'
      case FxType.COMPRESSOR:
        return 'Compressor'
    }
  },

  /** Its three letters, as the sheet's row and the narrow column's key print them: DLY, REV, DST, CHO, FLT, CMP; OFF for none. */
  fxCode(type: FxType): string {
    switch (type) {
      case FxType.NONE:
        return 'OFF'
      case FxType.DELAY:
        return 'DLY'
      case FxType.REVERB:
        return 'REV'
      case FxType.DISTORTION:
        return 'DST'
      case FxType.CHORUS:
        return 'CHO'
      case FxType.FILTER:
        return 'FLT'
      case FxType.COMPRESSOR:
        return 'CMP'
    }
  },

  /** The word on FX's light in the row, no longer than six letters so four keys fit across a narrow phone: "Delay", "Dist", "FX off". */
  fxKeyLabel(type: FxType): string {
    if (type === FxType.NONE) return 'FX off'
    if (type === FxType.DISTORTION) return 'Dist'
    if (type === FxType.COMPRESSOR) return 'Comp'
    return MirrorText.fxName(type)
  },

  /** "Effects, Delay", the FX key as a screen reader says it. */
  fxKeyDescription(type: FxType): string {
    return `${MirrorText.FX_EFFECTS}, ${MirrorText.fxName(type)}`
  },

  /** The FX sheet's title and its two pages. */
  FX_TITLE: 'FX',
  FX_EFFECT: 'Effect',
  FX_OUTPUT: 'Output',

  /** An effect in the sheet's row for screen readers: the one on says a tap turns it off. */
  fxChoice(type: FxType, on: boolean): string {
    return MirrorText.fxName(type) + (on ? ', on. Tap again to turn it off.' : '')
  },

  /** The XY pad: its name, and what X and Y do now: "Length 1/8D, feedback 38%". */
  XY_PAD: 'X and Y',
  xyState(type: FxType, x: number, y: number, bpm: number): string {
    return (
      `${knobWord(FxSettings.xLabel(type))} ${FxSettings.xReadout(type, x, bpm)}, ` +
      `${FxSettings.yLabel(type).toLowerCase()} ${FxSettings.yReadout(type, y)}`
    )
  },

  /** "1/8D · 38%", the pad's readout under the effect's name. */
  xyReadout(type: FxType, x: number, y: number, bpm: number): string {
    return `${FxSettings.xReadout(type, x, bpm)} \u00B7 ${FxSettings.yReadout(type, y)}`
  },

  /** A screen reader's step on the pad: "Length up", "Feedback down". */
  xyStep(label: string, up: boolean): string {
    return knobWord(label) + (up ? ' up' : ' down')
  },

  /** The pad with no effect on. */
  XY_OFF: 'Pick an effect to play X and Y',

  /** Each group's send to the effect: "Send A", its value 0 to 100. */
  SENDS: 'Sends',
  sendName(group: number): string {
    return `Send ${MirrorText.groupKey(group)}`
  },
  sendValue(v: number): string {
    return `${Math.round(Math.fround(v * 100))}`
  },

  /** OUTPUT: the compressor after everything, and the sidechain. */
  OUTPUT_COMP: 'Output comp',
  OUTPUT_COMP_NOTE: 'Evens out everything the phone plays, last.',
  DRIVE: 'Drive',
  SPEED: 'Speed',
  SIDECHAIN: 'Sidechain',
  SIDECHAIN_NOTE: 'Each hit of the source pad ducks the groups picked, then lets them back up.',
  SC_SOURCE: 'Source',
  SHAPE: 'Shape',
  DUCKS: 'Ducks',

  /** "A 7 kick", the sidechain's source (its pad alone while its sound isn't known). */
  sidechainSource(pad: PhysicalPad, name: string | null): string {
    return `${pad.groupLetter} ${pad.label}` + (name !== null ? ` ${name}` : '')
  },

  /** SOURCE for screen readers: "Sidechain source, A 7 kick". */
  sidechainSourceDescription(pad: PhysicalPad, name: string | null): string {
    return `${MirrorText.SIDECHAIN} ${MirrorText.SC_SOURCE.toLowerCase()}, ${MirrorText.sidechainSource(pad, name)}`
  },

  /** What a tap on SOURCE does: "Set to B 1", the pad played last. */
  setSource(pad: PhysicalPad): string {
    return `Set to ${pad.groupLetter} ${pad.label}`
  },

  /** SOURCE with no pad played yet. */
  PLAY_FOR_SOURCE: 'Play a pad to pick it',

  /** A group's key under DUCKS for screen readers: "Duck group A". */
  duckChoice(group: number): string {
    return `Duck group ${MirrorText.groupKey(group)}`
  },

  /** How long the duck lasts: "180 ms". */
  sidechainLength(x: number): string {
    return `${Math.round(Math.fround(30 + Math.fround(570 * x)))} ms`
  },

  /** How it comes back up: "SNAP 40" (fast, then easing), "EVEN", "PUMP 40" (slow, then fast). */
  sidechainShape(y: number): string {
    const tilt = Math.round(Math.fround(Math.fround(y - 0.5) * 200))
    return tilt < 0 ? `SNAP ${-tilt}` : tilt > 0 ? `PUMP ${tilt}` : 'EVEN'
  },

  /** Under the sheet's pad cap: what holding it does. */
  FX_HEAR: 'Hold the pad to hear it through the effects.',

  /** Under the cap with no effect on: the pad plays dry. */
  FX_HEAR_OFF: 'No effect on: pick one, then hold the pad to hear it.',

  /** Under the cap when the pad's group (letter) sends nothing: the pad plays dry. */
  fxHearNoSend(letter: string): string {
    return `Group ${letter} sends nothing to the effect: raise its fader to hear it.`
  },

  /** Before any pad was played: the cap has no pad to play yet. */
  FX_HEAR_NONE: 'Play a pad in Live to hear the effects here.',

  /** The sheet's note: the effects are the phone's alone. */
  FX_NOTE: "The effects play in Live's sound on the phone; the EP-133's own FX stay as they are.",

  /**
   * FX held: the pads play the twelve punch-ins. Each one's name where a pad
   * prints its sound, in slot order ('.' PITCH RND, '0' SLICE, ENTER STUTTER,
   * '1' REPEAT ... '9' DECIMATE): "Repeat", "Oct ↓".
   */
  punchName(slot: number): string {
    return PUNCH_NAMES[slot]!
  },

  /** Its name in full for screen readers: "Beat repeat", "Octave down". */
  punchDescription(slot: number): string {
    return PUNCH_WORDS[slot]!
  },

  /** Printed small under a punch-in's name while it isn't held. */
  PUNCH_HOLD: 'hold',

  /** A punch-in pad's click for screen readers (no finger to hold: it stays in until clicked again), and its state while in. */
  PUNCH_IN: 'Punch in',
  PUNCH_OUT: 'Let go',
  PUNCHED_IN: 'In',

  /** The display line while punch-ins are held, in the order pressed: "PUNCH · REPEAT + LPF". */
  punchLine(slots: Iterable<number>): string {
    return 'PUNCH · ' + [...slots].map((s) => MirrorText.punchName(s).toUpperCase()).join(' + ')
  },

  /** That line as a screen reader says it: "Punch-ins, Beat repeat, Low-pass filter". */
  punchSpoken(slots: Iterable<number>): string {
    return [MirrorText.PUNCH_INS, ...[...slots].map((s) => MirrorText.punchDescription(s))].join(', ')
  },
} as const

const ARP_ORDER_NAMES: Record<ArpOrder, string> = {
  played: 'Played',
  up: 'Up',
  down: 'Down',
  updown: 'Up-dn',
  random: 'Random',
}

const PUNCH_NAMES = [
  'Pitch rnd', 'Slice', 'Stutter', 'Repeat', 'Tape stop', 'Filter LFO',
  'LPF', 'HPF', 'Send FX', 'Tremolo', 'Oct ↓', 'Decimate',
]

const PUNCH_WORDS = [
  'Pitch random', 'Slice', 'Stutter', 'Beat repeat', 'Tape stop', 'Filter LFO',
  'Low-pass filter', 'High-pass filter', 'Send to FX', 'Tremolo', 'Octave down', 'Decimator',
]

/** A knob's printed name as a word: "LENGTH" to "Length". */
function knobWord(label: string): string {
  const w = label.toLowerCase()
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/** "A" for group 0 (Kotlin's 'A' + group). */
function groupLetter(group: number): string {
  return String.fromCharCode(65 + group)
}

/** A timing as said aloud: a triplet ("1/8T") as "1/8 triplet". */
function timingSpoken(t: Timing): string {
  return t.endsWith('T') ? `${t.slice(0, -1)} triplet` : t
}

/** "05" for 5: a pattern or scene number as the device shows it. */
function twoDigits(n: number): string {
  return String(n).padStart(2, '0')
}
