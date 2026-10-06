// Port of core/src/main/kotlin/dev/arc/ep133/text/FeatureText.kt
//
// Text for the device browser, sample upload and compare screens. These are
// additions to the web version, so there is no original wording; it follows
// the web version's tone (short, plain, no jargon).
//
// Web deltas:
// - Kotlin's jsNumberToString / jsRound / jsToFixed are native String(),
//   Math.round and toFixed here. playNote keeps Kotlin's kotlin.math.round,
//   which rounds ties to even (roundHalfEven below), not Math.round.
// - range() takes an inclusive {from, to} (deviceBrowser's SlotBlock shape)
//   for Kotlin's IntRange.
// - settingValue() takes a parsed JSON value: a string prints raw, anything
//   else goes through JSON.stringify.
// - projectSoundNames() takes a ReadonlyMap for Kotlin's Map<Int, String>.

import type { DiffResult, ProjectState, SoundDiff } from '../features/backupDiff'
import type { PadChange, SoundChange } from '../features/pakCompare'
import type { JsonValue } from '../protocol/fs'
import { Format, plural } from './format'
import { Strings } from './strings'

const PLAY = 'Play'
const STOP = 'Stop'
const NO_CHANGES = 'Everything you picked is already on the device.'
const AUDIO_CHANGED = 'Audio changed'

const SETTING_LABELS: ReadonlyMap<string, string> = new Map([
  ['sound.playmode', 'Play mode'],
  ['sound.rootnote', 'Root note'],
  ['sound.pitch', 'Pitch'],
  ['sound.pan', 'Pan'],
  ['sound.amplitude', 'Volume'],
  ['sound.loopstart', 'Loop start'],
  ['sound.loopend', 'Loop end'],
  ['sound.bpm', 'BPM'],
  ['time.mode', 'Time mode'],
  ['envelope.attack', 'Attack'],
  ['envelope.release', 'Release'],
])

/** kotlin.math.round: to the nearest integer, ties to the even one. */
function roundHalfEven(x: number): number {
  if (!Number.isFinite(x)) return x
  const f = Math.floor(x)
  const d = x - f
  if (d < 0.5) return f
  if (d > 0.5) return f + 1
  return f % 2 === 0 ? f : f + 1
}

function slot(n: number): string {
  return String(n).padStart(3, '0')
}

function settingLabel(key: string): string {
  return SETTING_LABELS.get(key) ?? key
}

/** "Group A"; a group with an unexpected name keeps it. */
function groupLetter(name: string): string {
  return name.length === 1 ? name.toUpperCase() : name
}

/** "1.5 s" or "850 ms" */
function duration(seconds: number): string {
  // The unit follows the rounded value, so 0.9996 s reads "1.0 s", not "1000 ms".
  const ms = Math.round(seconds * 1000)
  return ms < 1000 ? `${ms} ms` : `${seconds.toFixed(1)} s`
}

/** Kotlin's replaceFirstChar { it.uppercase() }. */
function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}

export const FeatureText = {
  BROWSE: 'Browse',
  DEVICE_TITLE: 'On the device',
  REFRESH: 'Refresh',
  ADD_SAMPLES: 'Add samples',
  SOUNDS: 'Sounds',
  PROJECTS: 'Projects',
  NO_SOUNDS: 'No sounds on the device.',
  NO_PROJECTS: 'No projects on the device.',
  READING: 'Reading…',
  NOT_CONNECTED: 'Connect your EP-133 to see what is on it.',
  TAP_FOR_DETAILS: 'Tap for details',
  TAP_FOR_SOUNDS: 'Tap to see which sounds it uses',
  NO_CHECKSUM: 'not reported',

  // The Device tab's layout (sections, find, groups of slots, project tiles).
  NO_DEVICE_TITLE: 'No EP-133',
  FIND_SOUND: 'Find a sound',
  FIND_HINT: 'Name or slot number',
  NO_FIND_MATCHES: 'No sounds match.',
  PROJECT: 'Project',
  PICK_PROJECT: 'Tap a project to see its sounds and pads.',

  // The Device tab, redesigned: storage as a split meter, the factory layout per range, projects as pads.
  /** "free of 61 MB", under the free space in large type. */
  freeOf(total: number): string {
    return `free of ${Format.bytes(total)}`
  },
  FREE: 'Free',

  /**
   * The factory layout's kind of sound for the range of slots starting at
   * [first] (from the official guide's note on SOUND mode: kicks 1-99,
   * snares 100-199, hi-hats 200-299, percussion 300-399, bass 400-499,
   * melodic 500-599), or null from 600 up, which the guide leaves free.
   */
  factoryCategory(first: number): string | null {
    if (first >= 1 && first <= 99) return 'Kicks'
    if (first >= 100 && first <= 199) return 'Snares'
    if (first >= 200 && first <= 299) return 'Hats'
    if (first >= 300 && first <= 399) return 'Perc'
    if (first >= 400 && first <= 499) return 'Bass'
    if (first >= 500 && first <= 599) return 'Melodic'
    return null
  },

  /** "12 · 2.1 MB", the sounds binder's bar after "Sounds". */
  soundsTotal(n: number, bytes: number): string {
    return `${n} · ${Format.bytes(bytes)}`
  },

  ALL: 'All',
  /** "In P3 · 7", the filter for the sounds the selected project uses. */
  inProject(project: number, n: number): string {
    return `In ${FeatureText.projectBadge(project)} · ${n}`
  },

  /** "P3", on a sound the selected project uses. */
  projectBadge(project: number): string {
    return `P${project}`
  },

  /** A project slot with nothing in it, on its pad key. */
  EMPTY_PROJECT: 'empty',

  /** "352 KB · 7 sounds", beside the selected project's name. */
  projectSummary(size: number, sounds: number): string {
    return `${Format.bytes(size)} · ${plural(sounds, 'sound')}`
  },

  /** "001–099" (en dash). */
  range(r: { readonly from: number; readonly to: number }): string {
    return slot(r.from) + '–' + slot(r.to)
  },

  /** "212 sounds · 6 projects". */
  counts(sounds: number, projects: number): string {
    return `${sounds} ${Strings.soundsLabel(sounds)} · ${projects} ${Strings.projectsLabel(projects)}`
  },

  /** "Sounds 212", for the section switch. */
  sectionLabel(name: string, n: number): string {
    return `${name} ${n}`
  },

  /**
   * "001 kick · 004 hat closed", or the slot alone when no sound is there. The
   * slot and the name are joined by a no-break space so a line never splits them.
   */
  projectSoundNames(slots: readonly number[], names: ReadonlyMap<number, string>): string {
    if (slots.length === 0) return 'Uses no sounds'
    return slots
      .map((s) => {
        const name = names.get(s)
        return slot(s) + (name !== undefined ? ` ${name}` : '')
      })
      .join(' · ')
  },

  // Playing (an addition): what to say when nothing can be heard.
  SILENT_SOUND: 'This sound is silent.',
  VOLUME_OFF: 'Media volume is off. Turn it up to hear the sound.',
  NO_AUDIO_OUTPUT: 'No audio output is available.',

  cantPlay(reason: string): string {
    return `Can't play this sound: ${reason}`
  },

  unplayableFormat(channels: number, sampleRate: number): string {
    return `${channels} channels at ${sampleRate} Hz can't be played.`
  },

  /** The debug log's line for a sound that started: "play backup:…:3: 46875 Hz, 1 ch, 0.52 s -> Bluetooth (Buds)". */
  playNote(key: string, sampleRate: number, channels: number, seconds: number, route: string): string {
    return `play ${key}: ${sampleRate} Hz, ${channels} ch, ${String(roundHalfEven(seconds * 100) / 100)} s -> ${route}`
  },

  play(name: string): string {
    return `${PLAY} ${name}`
  },

  stop(name: string): string {
    return `${STOP} ${name}`
  },

  storage(free: number, total: number): string {
    return total !== 0 ? `${Format.bytes(free)} free of ${Format.bytes(total)}` : ''
  },

  slot,

  projectUses(slots: readonly number[]): string {
    return slots.length === 0
      ? 'Uses no sounds'
      : `Uses ${slots.length === 1 ? 'sound' : 'sounds'} ${Format.list(slots.map(String))}`
  },

  channels(ch: number): string {
    if (ch === 1) return 'Mono'
    if (ch === 2) return 'Stereo'
    return `${String(ch)} channels`
  },

  sampleRate(hz: number): string {
    return `${String(hz)} Hz`
  },

  settingLabel,

  settingValue(v: JsonValue): string {
    return typeof v === 'string' ? v : JSON.stringify(v)
  },

  // ---------- upload ----------
  UPLOAD_TITLE: 'Add samples',
  UPLOAD_HINT: 'Each file goes into the sample slot shown. Change a slot to put it somewhere else.',
  SLOT: 'Slot',
  NO_FREE_SLOT: 'No free slot left. Pick one to replace.',
  UPLOADING: 'Uploading',

  replaces(name: string): string {
    return `Replaces ${name}`
  },
  unusable(message: string): string {
    return `Can't be uploaded: ${message}`
  },
  uploadButton(n: number): string {
    return n > 0 ? `Upload ${plural(n, 'sound')}` : 'Nothing to upload'
  },
  duplicateSlot(s: number): string {
    return `Two files are set to slot ${s}.`
  },
  uploaded(n: number): string {
    return `Uploaded ${plural(n, 'sound')}.`
  },

  // ---------- compare ----------
  COMPARE: 'Compare with device',
  COMPARING: 'Comparing',
  NO_CHANGES,

  diffSummary(r: DiffResult): string {
    return r.changes === 0 ? NO_CHANGES : `Restoring changes ${plural(r.changes, 'item')} on your EP-133:`
  },

  soundState(d: SoundDiff): string {
    const parts: string[] = []
    switch (d.state) {
      case 'SAME_AUDIO':
        if (d.unchanged) parts.push('Same')
        break
      case 'DIFFERENT_AUDIO':
        parts.push('Different sound on the device')
        break
      case 'NOT_ON_DEVICE':
        parts.push('Slot is empty on the device')
        break
      case 'UNVERIFIED':
        parts.push('Probably the same (the device reports no checksum)')
        break
    }
    if (d.nameDiffers) parts.push(`named "${d.deviceName}" on the device`)
    if (d.settingsDiffer.length > 0) {
      parts.push(`different ${Format.list(d.settingsDiffer.map((k) => settingLabel(k).toLowerCase()))}`)
    }
    return capitalize(parts.join(', '))
  },

  projectState(state: ProjectState): string {
    switch (state) {
      case 'SAME':
        return 'Same'
      case 'DIFFERENT':
        return 'Different on the device'
      case 'NOT_ON_DEVICE':
        return 'Not on the device'
    }
  },

  untouched(r: DiffResult): string {
    const parts: string[] = []
    if (r.deviceOnlySlots.length > 0) {
      parts.push(`${r.deviceOnlySlots.length === 1 ? 'sound' : 'sounds'} ${Format.list(r.deviceOnlySlots.map(String))}`)
    }
    if (r.deviceOnlyProjects.length > 0) {
      parts.push(
        `${r.deviceOnlyProjects.length === 1 ? 'project' : 'projects'} ${Format.list(r.deviceOnlyProjects.map(String))}`,
      )
    }
    return parts.length === 0
      ? ''
      : `Also on the device and not in this backup, left as they are: ${parts.join(' and ')}.`
  },

  // ---------- backup contents, playback, export ----------
  CONTENTS: 'Contents',
  OPENING: 'Opening…',
  PLAY,
  STOP,
  SHARE_WAV: 'Share WAV',
  SAVE_WAV: 'Save WAV',
  SHARE_PROJECT: 'Share project',
  SAVE_PROJECT: 'Save project',
  NO_SOUNDS_IN_BACKUP: 'No sounds in this backup.',
  NO_PROJECTS_IN_BACKUP: 'No projects in this backup.',
  EXPORT_HINT: 'A project is shared as its own .pak with the sounds it uses.',

  duration,

  // ---------- trim ----------
  TRIM: 'Trim',
  PLAY_SELECTION: 'Play selection',
  RESET: 'Reset',
  START: 'Start',
  END: 'End',

  trimmed(seconds: number): string {
    return `Trimmed to ${duration(seconds)}`
  },
  selection(startS: number, endS: number): string {
    return `${duration(startS)} to ${duration(endS)}, ${duration(endS - startS)} long`
  },

  // ---------- pad layout ----------
  PADS: 'Pads',
  EMPTY_PAD: 'Empty',
  MISSING_PAD: 'Sound not found',
  NO_PADS: 'No pad assignments found in this project.',
  PADS_NOTE: 'Pads are shown by number, not by where they sit on the device.',

  /** "Group A"; a group with an unexpected name keeps it. */
  group(name: string): string {
    return `Group ${groupLetter(name)}`
  },

  padsTitle(project: number): string {
    return `Project ${project} pads`
  },

  // ---------- library search ----------
  SEARCH: 'Search',
  SEARCH_SOUNDS: 'Search sounds',
  SEARCH_HINT: 'Find a sound by name in every saved backup.',
  NO_SOUND_MATCHES: 'No sounds match.',
  INDEXING: 'Indexing backups…',

  matches(n: number): string {
    return plural(n, 'match', 'matches')
  },

  // ---------- compare two backups ----------
  COMPARE_BACKUPS: 'Compare with another backup',
  PICK_OTHER: 'Compare with which backup?',
  COMPARING_BACKUPS: 'Comparing…',
  SOUNDS_ADDED: 'Sounds added',
  SOUNDS_REMOVED: 'Sounds removed',
  SOUNDS_CHANGED: 'Sounds changed',
  PROJECTS_ADDED: 'Projects added',
  PROJECTS_REMOVED: 'Projects removed',
  PROJECTS_CHANGED: 'Projects changed',
  NOTHING_CHANGED: 'Nothing changed: the same sounds and projects.',
  AUDIO_CHANGED,
  PATTERNS_CHANGED: 'Patterns or settings changed; each pad still has the same sound.',
  PROJECT_CHANGED: 'Changed.',

  compareHeader(oldTitle: string, oldDay: string, newTitle: string, newDay: string): string {
    return `From ${oldTitle} (${oldDay}) to ${newTitle} (${newDay})`
  },

  unchanged(sounds: number, projects: number): string {
    const parts: string[] = []
    if (sounds > 0) parts.push(plural(sounds, 'sound'))
    if (projects > 0) parts.push(plural(projects, 'project'))
    return parts.length === 0 ? '' : `Unchanged: ${parts.join(' and ')}.`
  },

  /** "Renamed from kick; audio changed; settings changed: Pitch, Volume" */
  soundChange(c: SoundChange): string {
    const parts: string[] = []
    if (c.renamed && c.oldName !== null) parts.push(`Renamed from ${c.oldName}`)
    if (c.audioChanged) parts.push(parts.length === 0 ? AUDIO_CHANGED : 'audio changed')
    if (c.settingsChanged.length > 0) {
      const labels = c.settingsChanged.map(settingLabel).join(', ')
      parts.push(parts.length === 0 ? `Settings changed: ${labels}` : `settings changed: ${labels}`)
    }
    return parts.join('; ')
  },

  /** "Pad A3: 001 kick, now 005 clap" */
  padChange(c: PadChange, oldName: string | null, newName: string | null): string {
    const side = (s: number | null, name: string | null): string =>
      s === null ? 'empty' : slot(s) + (name !== null ? ` ${name}` : '')
    return `Pad ${groupLetter(c.group)}${c.pad}: ${side(c.oldSlot, oldName)}, now ${side(c.newSlot, newName)}`
  },

  // ---------- library folder (kept across reinstalls) ----------
  FOLDER_NOTE: 'Backups are also kept in Documents/arc, so they survive reinstalling arc.',
  RESTORE_FOLDER: 'Restore from Documents/arc',
  RESTORE_HINT: 'Reinstalled arc? Pick the Documents/arc folder to bring your backups back.',
  NOTHING_TO_RESTORE: 'No backups found in that folder.',
  PICK_ARC_FOLDER: 'That folder has no arc backups. Pick the arc folder inside Documents.',

  restored(n: number): string {
    return `Restored ${plural(n, 'backup')}`
  },

  copyFailed(message: string): string {
    return `Could not copy to Documents/arc: ${message}`
  },

  // ---------- factory sounds (FactorySounds) ----------
  FACTORY_SOUNDS: 'Factory sounds',
  FACTORY_TITLE: 'EP-133 factory sounds',
  FACTORY_NOTE:
    "The EP-133's factory sounds, from teenage engineering's EP Sample Tool. Live plays them until it has read your EP-133.",
  FACTORY_SAVED: 'In your backups. Live plays them until it has read your EP-133.',
  GET: 'Get',
  SAVED: 'Saved',
  GETTING_FACTORY: 'Getting factory sounds',
  /** The progress sheet's note while they download (no cable involved). */
  FACTORY_KEEP_OPEN: "Keep arc open until they're saved.",
  NOT_FACTORY: "teenage engineering's file isn't an EP-133 factory pack.",

  /** The download's progress: "12.3 MB of 27.4 MB". */
  factoryProgress(done: number, total: number): string {
    return `${Format.bytes(done)} of ${Format.bytes(total)}`
  },

  factorySaved(sounds: number): string {
    return `Factory sounds saved: ${plural(sounds, 'sound')}. Live plays them until it has read your EP-133.`
  },

  factoryFailed(message: string): string {
    return `Couldn't get the factory sounds: ${message}`
  },
} as const
