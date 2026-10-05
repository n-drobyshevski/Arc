// Port of core/src/main/kotlin/dev/arc/ep133/text/Strings.kt (+ reference/src/index.html, reference/src/app.js)
//
// Interface text, word for word from the web version (index.html, app.js).
// The few web-only sentences were reworded for Android in Kotlin; they are
// marked "Android" and kept byte-identical here (web rewordings live elsewhere).
//
// Web delta: UPLOADING, COMPARING and uploaded() point at FeatureText in
// Kotlin. Their values are written out here (identical to FeatureText.kt:114,
// 120, 124) so this module does not depend on the feature text layer.

import { bytes, plural } from './format'

export const Strings = {
  WORDMARK: 'arc',
  CONNECT: 'Connect',
  DISCONNECT: 'Disconnect',
  NO_DEVICE: 'No device',
  READING_DEVICE: 'Reading device',
  PLUG_IN_HINT: 'Plug in the EP-133 with a USB-C cable and turn it on, then tap Connect.',
  ONE_MOMENT: 'One moment.',
  BACK_UP: 'Back up device',
  BACKUPS: 'Backups',
  IMPORT: 'Import .pak',
  EMPTY_TITLE: 'No backups yet.',
  EMPTY_TEXT: 'Connect your EP-133 and back it up, or import a .pak file from the official Sample Tool or a friend.',
  FOOTER: 'Free and open source. Not affiliated with teenage engineering.',

  // Android: replaces "No MIDI in this browser" and its hint.
  NO_MIDI_TITLE: 'No MIDI on this phone',
  NO_MIDI_HINT: "This phone can't connect to your EP-133. Your saved backups still work here.",

  osVersion(v: string): string {
    return v.length !== 0 ? `OS ${v}` : ''
  },
  soundsLabel(n: number): string {
    return n === 1 ? 'sound' : 'sounds'
  },
  projectsLabel(n: number): string {
    return n === 1 ? 'project' : 'projects'
  },
  FREE: 'free',
  meterDescription(used: number, total: number): string {
    return total !== 0 ? `${bytes(used)} of ${bytes(total)} used` : ''
  },

  backupRowMeta(sounds: number, projects: number, size: number): string {
    return `${plural(sounds, 'sound')}, ${plural(projects, 'project')}, ${bytes(size)}`
  },

  /** "3 backups, 1.2 MB stored on this phone (4.1 GB space left)." or "" when empty. */
  storageNote(count: number, totalSize: number, spaceLeft: number | null | undefined): string {
    if (count === 0) return ''
    return (
      `${plural(count, 'backup')}, ${bytes(totalSize)} stored on this phone` +
      (spaceLeft != null ? ` (${bytes(Math.max(0, spaceLeft))} space left)` : '') +
      '.'
    )
  },

  // Detail sheet
  NAME: 'Name',
  NOTES: 'Notes',
  NOTES_PLACEHOLDER: "What's in this backup?",
  RESTORE_TO_DEVICE: 'Restore to device',
  CONNECT_TO_RESTORE: 'Connect a device to restore',
  SHARE: 'Share',
  SAVE_PAK: 'Save .pak file',
  DELETE: 'Delete',
  DONE: 'Done',
  CLOSE: 'Close',
  CANCEL: 'Cancel',
  deleteConfirm(title: string): string {
    return `Delete "${title}" from this phone? This can't be undone.`
  },
  projectLine(n: number): string {
    return `Project ${n}`
  },

  // Restore sheet
  EVERYTHING: 'Everything in this backup',
  PICK_PROJECTS: 'Pick projects',
  ALSO_OTHER_SOUNDS: 'Also restore sounds no picked project uses',
  PICK_SOMETHING: 'Pick something to restore',

  // Progress sheet
  BACKING_UP: 'Backing up',
  RESTORING: 'Restoring',
  KEEP_SCREEN_ON: 'Keep the screen on and the cable plugged in.',
  STOPPING: 'Stopping after the current item',

  // Toasts
  CANCELLED: 'Cancelled. Nothing after that point was changed.',
  DISCONNECTED: 'The EP-133 was disconnected.',
  BACKUP_DELETED: 'Backup deleted.',
  SHARE_FAILED: 'Sharing failed. Use Save .pak file instead.',
  saved(sounds: number, projects: number): string {
    return `Saved ${plural(sounds, 'sound')} and ${plural(projects, 'project')}.`
  },
  restored(sounds: number, projects: number): string {
    return `Restored ${plural(sounds, 'sound')} and ${plural(projects, 'project')}.`
  },
  imported(sounds: number, projects: number): string {
    return `Imported ${plural(sounds, 'sound')} and ${plural(projects, 'project')}.`
  },
  importFailed(name: string, message: string): string {
    return `Couldn't import ${name}: ${message}`
  },
  libraryFailed(message: string): string {
    return `Couldn't open saved backups: ${message}`
  },
  FILE_MISSING: 'The backup file is missing from this device',

  // Android-only text
  SHARE_TITLE_PREFIX: 'EP-133 backup: ',
  NOTIFICATION_CHANNEL: 'Backups and restores',
  DEBUG_TITLE: 'SysEx log',
  DEBUG_SHARE: 'Share log',
  DEBUG_SAVE: 'Save log',
  DEBUG_COPY: 'Copy',
  DEBUG_CLEAR: 'Clear',
  DEBUG_TOGGLE: 'Log traffic',
  DEBUG_EMPTY: 'Nothing logged yet. Connect the EP-133 to see SysEx traffic.',
  DEBUG_COPIED: 'Log copied.',
  DEBUG_COPY_TRUNCATED: '(older messages left out; use Save log or Share log for the full log)',
  SAVE_FAILED: 'The file could not be saved. Try again.',
  /** = FeatureText.UPLOADING */
  UPLOADING: 'Uploading',
  /** = FeatureText.COMPARING */
  COMPARING: 'Comparing',
  /** = FeatureText.uploaded(n) */
  uploaded(n: number): string {
    return `Uploaded ${plural(n, 'sound')}.`
  },
} as const
