// Port of the Android-worded text in core/src/main/kotlin/dev/arc/ep133/text/{Strings,FeatureText,SettingsText,CoachText}.kt
// and app/src/main/kotlin/dev/arc/ep133/{midi/MidiConnector,files/Files,data/ExternalLibrary}.kt
// (+ reference/src/app.js, reference/src/webmidi.js)
//
// Web rewordings of the sentences that talk about the phone, Android,
// Documents/arc or the share sheet. Everything else is used as it is from the
// core text modules. Same tone as Android: short and plain.
//
// The MIDI and other-tab sentences are the same strings as MIDI_TEXT in
// platform/midi/webmidi.ts and OWNER_TEXT in platform/midi/owner.ts (core may
// not import from platform); keep them identical.

import { bytes, plural } from './format'

/** files/Files.kt TOO_LARGE: larger than any EP-133 backup (64 MB of samples). */
const TOO_LARGE = 'This file is too large to be a backup'

export const WebText = {
  // ---------- no WebMIDI (Strings.NO_MIDI_*, reference app.js:69-72) ----------
  NO_MIDI_TITLE: 'No MIDI in this browser',
  NO_MIDI_HINT:
    'Open arc in Chrome on Android or on a computer to connect your EP-133. Your saved backups still work here.',
  /** Firefox desktop gates WebMIDI (with SysEx) behind a site permission add-on. */
  FIREFOX_MIDI_HINT:
    'In Firefox, MIDI needs a site permission add-on. Allow it when Firefox asks, then connect again.',

  // ---------- MIDI errors (MidiConnector.kt, reference webmidi.js) ----------
  /** = MIDI_TEXT.unsupported (replaces "This phone can't connect to your EP-133. …"). */
  MIDI_UNSUPPORTED: "This browser can't connect to your EP-133. Your saved backups still work here.",
  /** = MIDI_TEXT.denied: the permission prompt was refused or MIDI is blocked for the site. */
  MIDI_DENIED: 'MIDI access was blocked. Allow MIDI for this site in the browser settings, then connect again.',
  /** = MIDI_TEXT.notFound (word for word from Android). */
  MIDI_NOT_FOUND: 'No EP-133 found. Plug it in with a USB-C cable, turn it on, then connect again.',
  /** = MIDI_TEXT.blocked: the ports would not open (word for word from Android). */
  MIDI_BLOCKED: 'MIDI access was blocked. Unplug the EP-133, plug it back in, then connect again.',
  /** = OWNER_TEXT.OTHER_TAB: another tab holds the 'arc-device' Web Lock. */
  OTHER_TAB: 'arc is connected to the EP-133 in another tab or window. Disconnect it there, then connect again.',

  // ---------- transfers (TransferService has no web equivalent) ----------
  /** Toast when the tab is hidden while a task runs: timers slow down in the background. */
  KEEP_IN_FRONT: 'Keep this tab in front until arc is done. In the background the transfer can stall.',
  /** Progress sheet line (replaces Strings.KEEP_SCREEN_ON). */
  KEEP_TAB_OPEN: 'Keep this tab open and the cable plugged in.',
  /** beforeunload text; most browsers show their own wording instead. */
  LEAVE_WARNING: 'arc is still working with the EP-133. Leaving now stops it.',

  // ---------- files and sharing (Files.kt, MainActivity share/save) ----------
  TOO_LARGE,
  OPEN_FAILED: 'Could not open the file',
  /** reference app.js:348: navigator.share can't take files here, so the file was downloaded. */
  SHARE_SAVED_INSTEAD: "This browser can't share files directly, so the .pak was saved instead.",
  /** The share fallback toast for [fileName]: the reference wording for a .pak, else the same sentence about "the file". */
  savedInstead(fileName: string): string {
    return /\.pak$/i.test(fileName)
      ? "This browser can't share files directly, so the .pak was saved instead."
      : "This browser can't share files directly, so the file was saved instead."
  },
  /** Import by drag and drop (no Android counterpart; Android opens .pak files from other apps). */
  DROP_HINT: 'Drop a .pak file here to import it.',

  // ---------- storage ("this phone") ----------
  /** Strings.storageNote with "stored in this browser". */
  storageNote(count: number, totalSize: number, spaceLeft: number | null | undefined): string {
    if (count === 0) return ''
    return (
      `${plural(count, 'backup')}, ${bytes(totalSize)} stored in this browser` +
      (spaceLeft != null ? ` (${bytes(Math.max(0, spaceLeft))} space left)` : '') +
      '.'
    )
  },
  /** Strings.deleteConfirm with "from this browser". */
  deleteConfirm(title: string): string {
    return `Delete "${title}" from this browser? This can't be undone.`
  },

  // ---------- settings (SettingsText) ----------
  /** Replaces "The phone doesn't sleep while the Live tab is open." */
  KEEP_SCREEN_ON_NOTE: "The screen doesn't sleep while the Live tab is open.",
  /** SettingsText.KEEP_NOTE: mentions the library folder only when one is in use. */
  keepNote(folder: boolean): string {
    return folder
      ? 'After each backup or import, older backups beyond this many are deleted, here and in the library folder.'
      : 'After each backup or import, older backups beyond this many are deleted.'
  },
  /** SettingsText.pruneConfirm, same rule as [keepNote]. */
  pruneConfirm(n: number, folder: boolean): string {
    return (
      (n === 1 ? 'This deletes the oldest backup' : `This deletes the ${n} oldest backups`) +
      (folder ? ', also from the library folder.' : '.')
    )
  },

  // ---------- coach (CoachText.PLAY "Play on the phone") ----------
  COACH_PLAY: 'Play it here',

  // ---------- Live (MirrorText / SettingsText sentences about "the phone") ----------
  /** Replaces MirrorText.TAP_NOTE "Hold a pad to hear its sample on the phone …". */
  LIVE_TAP_NOTE:
    "Hold a pad to hear its sample here (it stops when you let go): from arc's copy of the device's sounds, a backup, or the device.",
  /** Replaces MirrorText.NO_COPY "This sample isn't saved on the phone or in a backup yet." */
  LIVE_NO_COPY: "This sample isn't saved in this browser or in a backup yet.",
  /** Replaces MirrorText.NO_COPY_FACTORY ("on the phone"). */
  LIVE_NO_COPY_FACTORY: "This factory sample isn't saved in this browser yet: Settings → Live → Factory sounds → Get.",
  /** Replaces MirrorText.PIANO_HINT "Turn the phone sideways for a piano (with auto-rotate off, …)". */
  LIVE_PIANO_HINT: 'Turn the screen sideways, or make the window wider than it is tall, for a piano.',
  /** Replaces MirrorText.LEGEND_PHONE "Outlined: playing on the phone". */
  LIVE_LEGEND_HERE: 'Outlined: playing here',
  /**
   * Replaces MirrorText.BLUETOOTH_DELAY. Browsers don't say where the sound
   * goes, so this is a guess from the output's delay, and names no phone speaker.
   */
  LIVE_SLOW_OUTPUT:
    'Sound plays late here (often 0.2 s or more), as it does over Bluetooth. A wired output or the built-in speakers are much quicker.',
  /** Replaces SettingsText.PAD_SOUNDS "Pad sounds saved on the phone". */
  PAD_SOUNDS: 'Pad sounds saved in this browser',
  /** SettingsText.padSounds with [PAD_SOUNDS]. */
  padSounds(size: string): string {
    return `${WebText.PAD_SOUNDS}: ${size}`
  },
  /** Replaces SettingsText.SAVED_HERE "Saved on the phone", the group title for what Settings can clear. */
  SAVED_HERE: 'Saved in this browser',
  /** Replaces MirrorText.CHIP_PHONE "Playing on the phone". */
  CHIP_HERE: 'Playing here',

  // ---------- Live: sounds onto pads with the mouse (no Android counterpart) ----------
  /** Under the SOUNDS tab's list on a wide window. */
  DRAG_HINT: 'Drag a sound onto a pad of the active project. Right-click a pad for more.',
  /** The same while offline: changes stay in arc until the EP-133 connects. */
  DRAG_HINT_OFFLINE: 'Offline: drag a sound onto a pad to change it in arc only. Dimmed sounds need the EP-133.',
  /** The drop zone under the list. */
  DROP_SAMPLE: 'Drop a WAV here or on a pad to upload it to a free slot',
  /** The tag on the pad a sound or file is dragged over. */
  DROP: 'Drop',

  // ---------- library folder (FeatureText folder text; Documents/arc → File System Access) ----------
  LIBRARY_FOLDER: 'Library folder',
  PICK_FOLDER: 'Pick a library folder',
  /** Shown before a folder is picked. */
  FOLDER_NOTE_OFF: 'Pick a folder to keep a copy of every backup outside the browser, as the Android app does in Documents/arc.',
  /** Replaces FOLDER_NOTE "Backups are also kept in Documents/arc, so they survive reinstalling arc." */
  folderNote(folderName: string): string {
    return `Backups are also kept in the ${folderName} folder, so they survive clearing this browser.`
  },
  /** The browser forgot the permission (after a restart): one tap gives it back. */
  RECONNECT_FOLDER: 'Reconnect library folder',
  RECONNECT_HINT: 'arc needs your OK to use the library folder again.',
  STOP_FOLDER: 'Stop using this folder',
  /** Replaces RESTORE_FOLDER "Restore from Documents/arc". */
  RESTORE_FOLDER: 'Restore from a folder',
  /** Replaces RESTORE_HINT "Reinstalled arc? Pick the Documents/arc folder …". */
  RESTORE_HINT: 'New browser, or coming from the Android app? Pick an arc folder to bring your backups back.',
  /** = FeatureText.NOTHING_TO_RESTORE. */
  NOTHING_TO_RESTORE: 'No backups found in that folder.',
  /** Replaces "That folder has no arc backups. Pick the arc folder inside Documents." */
  PICK_ARC_FOLDER: 'That folder has no arc backups. Pick the arc folder with your .pak files.',
  /** Replaces copyFailed "Could not copy to Documents/arc: …". */
  copyFailed(message: string): string {
    return `Could not copy to the library folder: ${message}`
  },
  /** ExternalLibrary.kt:152 (the SAF wording, which names no folder). */
  couldNotCreate(name: string): string {
    return `Could not create ${name} in the folder`
  },
  /** ExternalLibrary.kt:124. */
  couldNotWrite(name: string): string {
    return `Could not write ${name}`
  },
  /** Browsers without a folder picker: a zip of every .pak plus library.json. */
  EXPORT_LIBRARY: 'Export library',
  EXPORT_LIBRARY_NOTE: "This browser can't keep a library folder. Export the library now and then to keep a copy.",

  // ---------- playback (SoundPlayer) ----------
  /** createBuffer refused the format: the browser's range is narrower than SoundPlayer.canPlay's. */
  unplayableHere(channels: number, sampleRate: number): string {
    return `${channels} channels at ${sampleRate} Hz can't be played in this browser.`
  },
  /** SoundPlayer.routeName: the web can't tell where the sound goes. */
  ROUTE: 'default output',

  // ---------- debug log (MainActivity.logText header) ----------
  /** Replaces "arc X on Android R (API n), Maker Model" with the user agent. */
  logHeader(version: string, userAgent: string, midiDescription: string, nowMs: number): string[] {
    return [
      `arc ${version} on ${userAgent}`,
      `MIDI: ${midiDescription.length !== 0 ? midiDescription : 'not connected'}`,
      // ISO_INSTANT leaves out a zero fraction of a second.
      `Exported ${new Date(nowMs).toISOString().replace('.000Z', 'Z')}`,
    ]
  },

  // ---------- the computer keyboard (desktop; no Android counterpart) ----------
  // Never "shortcuts": that word is the EP-133's own, in the Guide.
  KEYS_TITLE: 'Keyboard keys',
  KEYS_NOW: 'Keys that work here now. Single keys pause while you type in a field.',
  /** The sheet opened away from Live (Settings): all of Live's keys. */
  KEYS_ALL: "Live's keys, and the ones that work everywhere. Single keys pause while you type in a field.",
  /** The sheet with single keys switched off. */
  KEYS_OFF: 'Single keys are off: Settings → Live → Computer keyboard turns them on.',
  KEYS_PADS: 'Live, pads',
  KEYS_EDIT: 'Live, EDIT',
  KEYS_GRID: 'Live, keys',
  KEYS_PIANO: 'Live, piano',
  KEYS_EVERYWHERE: 'Everywhere',
  KEY_PADS: 'Hold to play the pads, as on the EP-133',
  KEY_PADS_ROW: 'The same pads, by their numbers',
  KEY_GROUP: 'Group A to D',
  KEY_EDIT: 'EDIT on or off',
  KEY_EDIT_PAD: "Open that pad's sound",
  KEY_VIEW_PADS: 'All groups or one group',
  KEY_FOLLOW: 'Follow on or off',
  KEY_FIND: 'Find a sound',
  KEY_MODE: 'Pads or keys',
  KEY_GRID: 'Hold to play the keys',
  KEY_PIANO: 'Play the piano',
  KEY_OCTAVE: 'Octave down, up',
  KEY_ROOT: 'Key down, up',
  KEY_SCALE: 'Scale before, after',
  KEY_VIEW_KEYS: 'Grid or piano',
  KEY_HELP: 'These keys',
  KEY_ESCAPE: 'Close a screen; in Live, leave EDIT or stop the sound',
  KEY_UNDO: 'Undo a new pad sound, while its UNDO shows',
  /** The tools panel's line in PADS. */
  LIVE_PADS_KEYS_HINT: 'Keyboard: 1 to 9 or the number pad play pads · A to D group · E edit · M keys · ? all keys',
  /** The KEYS tools panel's line. */
  LIVE_KEYS_KEYS_HINT: 'Keyboard: M pads · Z X octave · [ ] key · Shift+[ ] scale · ? all keys',
  COMPUTER_KEYS: 'Computer keyboard',
  COMPUTER_KEYS_NOTE: 'Single keys play Live and run its controls. Show keys lists them.',
  SHOW_KEYS: 'Show keys',
  /** What a key just switched, for screen readers: "Follow, on". */
  switched(label: string, on: boolean): string {
    return `${label}, ${on ? 'on' : 'off'}`
  },
  /** A control's tooltip with its key: "EDIT (E)". */
  keyHint(label: string, key: string): string {
    return `${label} (${key})`
  },

  // ---------- app updates (PWA; no Android counterpart) ----------
  UPDATE_READY: 'A new version of arc is ready.',
  UPDATE_RELOAD: 'Reload',
} as const
