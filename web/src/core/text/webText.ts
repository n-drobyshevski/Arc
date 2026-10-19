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
  /** EDIT's page keys for screen readers (Kotlin's are plain keys under the knobs). */
  EDIT_PAGES: 'Sound edit pages',
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
  /** Replaces MirrorText.TAKES_NOTE "A take holds the pads and keys played on the phone, …". */
  TAKES_NOTE:
    "A take holds the pads and keys played in this browser, connected or not, not the EP-133's own sound. Takes stay in arc until you delete them; Save or Share copies one out, and Voice message shares one as a voice message (Telegram sends it as one).",
  /** A take's key (web only): Android's SHARE gives Telegram the voice message itself, which the Web Share API can't. */
  VOICE_MESSAGE: 'Share as a voice message',
  /** Takes' "Save or Share" where the browser can't share files: Save WAV is the only way out. */
  TAKES_NOTE_SAVE_ONLY:
    "A take holds the pads and keys played in this browser, connected or not, not the EP-133's own sound. Takes stay in arc until you delete them; Save WAV copies one out.",
  // ---------- Live's device view (web only: the EP-133 drawn on a wide screen) ----------
  /** The device view's label for screen readers. */
  DEVICE_VIEW: 'EP-133 K.O. II',
  /** A key's shortcuts card: "SOUND on the EP-133". */
  keyOnDevice(key: string): string {
    return `${key} on the EP-133`
  },
  /** Under a key's shortcuts: what the key does in arc. */
  DEVICE_KEY_NOTE: 'arc only listens in Live. This key works on the device.',
  DEVICE_PLAY_NOTE: 'Lit while the EP-133 plays. arc never starts or stops the device.',
  /** Under the knobs' and the fader's shortcuts: what turning them does in arc (nothing goes to the device). */
  DEVICE_VOLUME_NOTE: "Turn it for arc's own volume: the pads, the click and the effects as this computer plays them. Takes record before it; the device keeps its own volume.",
  DEVICE_KNOB_X_NOTE:
    "Turn it for the effect's X in arc. It follows the device: KEYS held the key, TEMPO the tempo, SOUND the pad's level, EDIT or a pad's sheet the page's X, TIMING the interval, OUTPUT the drive, SIDECHAIN the length, SAMPLE its LEVEL, STEP the step's VEL.",
  DEVICE_KNOB_Y_NOTE:
    "Turn it for the effect's Y in arc. It follows the device: KEYS held the scale, SOUND the pad's pitch, EDIT or a pad's sheet the page's Y, TIMING the swing, OUTPUT the speed, SIDECHAIN the shape, SAMPLE its THRESH, STEP the step's LEN, TEMPO the click's level.",
  DEVICE_FADER_NOTE: "Drag the fader for the shown group's level in arc's sound, or what FADER + a pad gave it (on the FX page, its send to the effect). Each group keeps its own, with the project's effects.",
  /** A knob's or the fader's second action, for screen readers. */
  DEVICE_TURN_HINT: 'Arrow keys turn it, Enter shows its shortcuts',
  // What the drawn knobs and fader change, for screen readers ("Knob X", "effect X, 62%").
  TURN_VOLUME: "arc's volume",
  TURN_FX_X: 'effect X',
  TURN_FX_Y: 'effect Y',
  TURN_TEMPO: 'tempo',
  TURN_NOTHING: 'nothing here',
  /** The fader on group [g]: "group B's level". */
  turnGroup(g: string): string {
    return `group ${g}'s level`
  },
  /** A knob's or the fader's value for screen readers: "effect X, 62%". */
  turnValue(what: string, value: string): string {
    return `${what}, ${value}`
  },
  /** The plate's hit line while a knob or the fader turns, as the EP-133's display shows it: "FX X · 62". */
  turnShown(name: string, value: string): string {
    return `${name} \u00B7 ${value}`
  },
  TURN_CLICK: "the click's level",
  /** TEMPO's Y at the bottom: the click off. */
  CLICK_OFF: 'OFF',
  TURN_KEY: "KEYS' key",
  TURN_SCALE: "KEYS' scale",
  TURN_INTERVAL: 'the note interval',
  TURN_SWING: 'swing',
  /** OUTPUT's compressor knob: "output drive". */
  turnOutput(label: string): string {
    return `output ${label.toLowerCase()}`
  },
  /** The sidechain's knob: "sidechain length". */
  turnSidechain(label: string): string {
    return `sidechain ${label.toLowerCase()}`
  },
  /** The fader assigned to [param] (FADER + a pad): "group B's LPF". */
  turnFader(param: string, g: string): string {
    return `group ${g}'s ${param}`
  },
  /** FX + the group keys: "SOLO · A C", or "SOLO · OFF" once none is. */
  soloShown(groups: readonly string[]): string {
    return `SOLO \u00B7 ${groups.length === 0 ? 'OFF' : groups.join(' ')}`
  },
  /** The fader on the FX page: "group B's send to the effect". */
  turnSend(g: string): string {
    return `group ${g}'s send to the effect`
  },
  // ---------- the drawn EP-133's keys, as the device's combos (ui/live/deviceKeys.ts) ----------
  /** What the device does with a combo arc has nothing for, on the plate: "SYSTEM · NOT IN ARC". */
  notInArc(word: string): string {
    return `${word} \u00B7 NOT IN ARC`
  },
  /** The combos arc has nothing for, by deviceKeys' NotInArc, as the plate names them. */
  DEVICE_NOT_IN_ARC: {
    SYSTEM: 'SYSTEM',
    CHOP: 'CHOP',
    CROP: 'CROP',
    SONG: 'SONG',
    TEMPO_DETECT: 'TEMPO DETECT',
    TIME_SIGNATURE: 'TIME SIGNATURE',
    DELETE_SAMPLE: 'DELETE SAMPLE',
    COPY_SOUND: 'COPY SOUND',
    AUTOMATION: 'AUTOMATION',
    SOLO: 'SOLO',
    FADER_RESET: 'FADER RESET',
  } as Readonly<Record<string, string>>,
  /** The drawn FADER and SHIFT keys' names (the fader itself is "Fader"). */
  DEVICE_FADER_KEY: 'Fader key',
  DEVICE_SHIFT_KEY: 'Shift',
  DEVICE_MAIN_KEY: 'Main',
  DEVICE_TIMING_KEY: 'Timing',
  /** The guide overlay's tags on the drawn MAIN and TEMPO, which take the device's combos (CoachText's are the row's keys). */
  COACH_DEVICE_MAIN: 'Main page; hold + pad 1–9: project',
  COACH_DEVICE_TEMPO: 'Tempo page; tap again: tap tempo',
  /** A drawn group key's state, first in its description (a tab has no pressed state): "Held, soloed". */
  groupKeyState(latched: boolean, held: boolean, soloed: boolean, silenced: boolean): string {
    const words = [latched ? 'Latched' : held ? 'Held' : null, soloed ? 'soloed' : silenced ? 'silenced' : null].filter((w): w is string => w !== null)
    const t = words.join(', ')
    return t === '' ? '' : t.charAt(0).toUpperCase() + t.slice(1)
  },
  /** A page asked for while SAMPLE takes: it would end the take. */
  DEVICE_TAKE_GOING: 'SAMPLING \u00B7 STOP THE TAKE FIRST',
  /** SHIFT + SOUND held: arc keeps every turn as it goes. */
  DEVICE_SAVED: 'SAVED',
  /** The pages' names on the plate. */
  DEVICE_PAGES: {
    MAIN: 'MAIN',
    SOUND: 'SOUND',
    EDIT: 'EDIT',
    TEMPO: 'TEMPO',
    TIMING: 'TIMING',
    FX: 'FX',
    OUTPUT: 'OUTPUT',
    SIDECHAIN: 'SIDECHAIN',
  } as Readonly<Record<string, string>>,
  /** What − / + do on each page, after its knobs on the plate's page line. */
  DEVICE_PAGE_STEPS: {
    SOUND: '\u2212/+ SOUND',
    EDIT: '\u2212/+ PAGE',
    TEMPO: 'TAP TEMPO',
    TIMING: '\u2212 QUANTIZE \u00B7 + FREE',
    FX: '\u2212/+ EFFECT \u00B7 FADER SEND',
    OUTPUT: '+ SIDECHAIN',
    SIDECHAIN: '\u2212 OUTPUT',
  } as Readonly<Record<string, string>>,
  /** The plate's page line: "EDIT · TRIM — X START · Y LENGTH · −/+ PAGE". */
  devicePageLine(head: string, parts: readonly string[]): string {
    return parts.length === 0 ? head : `${head} \u2014 ${parts.join(' \u00B7 ')}`
  },
  /** The page line's key, for screen readers: what it opens. */
  DEVICE_PAGE_SHEET: "Open arc's full sheet",
  /** SOUND's − / +: "002 SNARE" (the slot, and its sound's name). */
  slotShown(slot: number, name: string | null): string {
    const n = String(slot).padStart(3, '0')
    return name === null ? n : `${n} ${name}`
  },
  /** SOUND's − / + with no pad played yet. */
  DEVICE_PLAY_A_PAD: 'PLAY A PAD FIRST',
  /** A pattern's length on the plate: "4 BARS". */
  barsShown(n: number): string {
    return `${n} ${n === 1 ? 'BAR' : 'BARS'}`
  },
  /** A slot typed (or stepped to) with no sound in it. */
  noSoundAt(slot: number): string {
    return `NO SOUND AT ${String(slot).padStart(3, '0')}`
  },
  /** The plate's line for a value set: "LENGTH · 4 BARS". */
  deviceSet(name: string, value: string): string {
    return `${name} \u00B7 ${value}`
  },
  /** Each drawn key's combos, for screen readers (its aria-description). */
  DEVICE_KEY_HINTS: {
    SOUND: 'Sound page. Shift: edit page. Held: type a slot on the pads; held and let go: the pad sheet',
    MAIN: 'Main page. Held: a pad 1 to 9 picks a project, minus and plus the scene; held and let go: the project sheet. Shift: commit the scene',
    TEMPO: 'Tempo page; on it, tap the tempo. Held: type the tempo on the pads, or turn knob X; held and let go: the tempo sheet',
    KEYS: 'Pads or keys. Held: minus and plus the octave, a pad the key, knob X the key, knob Y the scale',
    FADER: 'Held: a pad gives the fader what is printed over it. Shift: its parameters reset, again restored',
    SHIFT: 'Held with another key: its second action. A click holds it for the next key',
    SAMPLE: 'Sample panel; while a hands-free take runs, stops it',
    TIMING: 'Timing page. Held: a pad repeats. Shift: timing correct',
    FX: 'Effect page. Held: the pads are the punch-ins, a group key solos it. Shift: output page',
    ERASE: 'A tap latches erase. Held: erase while held; with a group, clear its pattern',
    GROUP: 'Held: minus and plus its pattern, or type the pattern on the pads. Shift with A: next free pattern, B: undo, C: copy, D: paste',
    RIGHT_CLICK: 'Right-click holds it until the next right-click',
  } as Readonly<Record<string, string>>,
  /** − and + on the drawn device, by what they step (deviceKeys' MinusPlusRoute): [minus, plus]. */
  DEVICE_MINUS_PLUS: {
    octave: ['Octave down', 'Octave up'],
    group: ['Previous group', 'Next group'],
    pattern: ['Previous pattern', 'Next pattern'],
    scene: ['Previous scene', 'Next scene'],
    length: ['Shorter pattern', 'Longer pattern'],
    step: ['Previous step', 'Next step'],
    sampleSource: ['Previous source', 'Next source'],
    sampleBars: ['Fewer bars', 'More bars'],
    slot: ['Previous sound', 'Next sound'],
    editPage: ['Previous page', 'Next page'],
    timing: ['Quantize', 'Free time'],
    fx: ['Previous effect', 'Next effect'],
    output: ['Minus', 'Sidechain'],
    sidechain: ['Output', 'Plus'],
  } as Readonly<Record<string, readonly [string, string]>>,
  /** The link to the guide, searched for the key. */
  allShortcuts(key: string): string {
    return `All ${key} shortcuts`
  },
  NO_SHORTCUTS: 'No shortcuts in the guide use this key on its own.',
  /** Live tools' third view on the desk: the EP-133 drawn whole. */
  VIEW_DEVICE: 'Device',
  /** A beat card or prompt copied where the browser has no share sheet (Android's chooser). */
  CARD_COPIED: 'Copied. Paste it to Claude.',
  /** PASTE BEAT where the page can't read the clipboard: the box a paste goes into. */
  PASTE_HERE: 'Paste the beat card here',
  PASTE_HERE_NOTE: 'This browser lets a page read the clipboard only from a paste: press Ctrl+V (⌘V), or long-press and Paste.',
  /** Replaces ClaudeText.LEARN_PROMPT, which says Android. */
  LEARN_PROMPT:
    'Use the arc-beats skill to teach me the EP-133 K.O. II, starting at lesson 1 (Meet the pads). I use the Arc web app. ' +
    'Go one step at a time: explain the step, give me something to try on the device, and wait for me before the next one.',
  /** After a pad's or KEYS key's name for screen readers while it is held for the arp or note repeat (Android outlines it only). */
  ARP_HELD: ', held for the arp',
  /** The plate's line while TAKE waits. */
  TAKE_ARMED: 'Take armed: play a pad or start the EP-133',
  /** −/+ in the pads view. */
  PREV_GROUP: 'Previous group',
  NEXT_GROUP: 'Next group',
  OCTAVE_DOWN: 'Octave down',
  OCTAVE_UP: 'Octave up',
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
  KEYS_DEVICE: 'Live, the drawn EP-133',
  KEY_MINUS_PLUS: "The device's − and +",
  KEY_SHIFT_HELD: "The device's SHIFT, while held",
  KEY_GROUP_HELD: 'A group key, held while it is down (held a moment, the pads type its pattern)',
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

  // ---------- SAMPLE (Live) ----------
  /** The SAMPLE panel's ✕ (Kotlin closes it with a swipe or Back). */
  CLOSE_SAMPLE: 'Close sampling',
  /** The mic refused (MirrorText.NO_MIC's web wording: no USB, and no app settings to open). */
  NO_MIC: 'arc needs the microphone to sample it. RSP works without it.',
  /** MirrorText.inputFailed's reasons for the mic on the web. */
  NO_MIC_FOUND: 'no microphone found',
  MIC_FAILED: "this browser can't sample the microphone here",
  /**
   * A source's name for screen readers: MirrorText.sourceName with arc's
   * sound for RSP (the web resamples arc's own mix, not the phone's).
   */
  sampleSourceName(source: 'mic' | 'rsp' | 'usb', stereo: boolean): string {
    const name = source === 'mic' ? 'Microphone' : source === 'rsp' ? "Resample arc's sound" : 'EP-133 over USB'
    return name + (stereo ? ', stereo' : ', mono')
  },

  // ---------- app updates (PWA; no Android counterpart) ----------
  UPDATE_READY: 'A new version of arc is ready.',
  UPDATE_RELOAD: 'Reload',
} as const
