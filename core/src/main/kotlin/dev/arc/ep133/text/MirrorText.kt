package dev.arc.ep133.text

import dev.arc.ep133.features.FactorySounds
import dev.arc.ep133.features.Hit
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectSource
import dev.arc.ep133.features.SampleSource
import dev.arc.ep133.util.jsToFixed

/** Text for the live mirror (an addition to the web version). */
object MirrorText {
    const val LIVE = "Live"
    const val TITLE = "Live"
    const val READING = "Reading the device\u2026"
    const val NOT_CONNECTED = "Connect your EP-133 to see it live."
    // Not connected, with the last read kept: the pads and names as they were then.
    const val OFFLINE = "Offline"
    const val OFFLINE_NOTE = "Not connected: the pads and sample names are as arc last read them. Connect your EP-133 to see it live."
    // Screen reader state of the folded note under "Offline".
    const val NOTE_SHOWN = "Note shown"
    const val NOTE_HIDDEN = "Tap for a note"
    /** "Last seen 5 Oct, 14:02", for the display while offline. */
    fun lastSeen(at: String) = "Last seen $at"
    // Not connected, with the factory sounds in the library: one of their projects (the first unless PROJECT steps on).
    const val FACTORY = "Factory sounds"
    fun factoryNote(project: Int) = "Not connected: these are the EP-133's factory sounds, project $project as it ships. Connect your EP-133 to see it live."
    // Not connected and never read: a way to play without it.
    const val GET_FACTORY = "Get the factory sounds to play without it"
    /** The note under "Offline" for the display's offline line ([lastSeen] or [FACTORY]), showing [project]. */
    fun offlineNote(offline: String, project: Int = FactorySounds.PROJECT) = if (offline == FACTORY) factoryNote(project) else OFFLINE_NOTE
    const val PLAYING = "Playing"
    const val STOPPED = "Stopped"
    const val NO_TRANSPORT = "Play/stop and tempo need MIDI clock out: SHIFT + ERASE, then 102 and ENTER."
    const val WAITING = "Press a pad on the EP-133."
    const val KEYS = "Keys"
    const val LEARN_NOTE = "Sample names are learned as you press pads: one press of a key, in any group, names that key in every group, and arc remembers it."
    const val COMMUNITY_NOTE = "Pads follow the official MIDI note map; play/stop and tempo are standard MIDI clock messages. Naming the samples relies on community notes about the device's SysEx, not on the official guide."
    const val NO_PUSHES = "No pad messages from the device yet, so samples can't be named. Pads still light up."
    /** How Live uses the device: it reads, and writes only a pad's sound (in EDIT) and the active project (PROJECT), when asked. */
    const val LISTEN_ONLY = "arc reads the device here (sound names, the active project's pads, and the samples on them, to keep a copy). It changes the device only when you give a pad another sound in EDIT, switch projects with PROJECT, or keep a sample in SAMPLE."

    // Tapping a pad plays its sample on the phone.
    const val TAP_NOTE = "Hold a pad to hear its sample on the phone (it stops when you let go): from arc's copy of the device's sounds, a backup, or the device."
    const val NO_SAMPLE = "arc doesn't know this pad's sample yet."
    const val NO_COPY = "This sample isn't saved on the phone or in a backup yet."
    // The same for a factory sound (FactorySounds.unnamed) while the pack isn't in the library.
    const val NO_COPY_FACTORY = "This factory sample isn't saved on the phone yet: Settings → Live → Factory sounds → Get."
    const val SOUNDS_CLEARED = "Saved pad sounds cleared."
    const val PLAY = "Play"

    // KEYS: one sound played as notes across the pads, like the EP-133's KEYS mode.
    const val MODE_PADS = "Pads"
    const val MODE_KEYS = "Keys"
    const val KEY = "Key"
    const val SCALE = "Scale"
    const val PICK_SOUND = "Tap a pad in Pads first: Keys plays that pad's sample."
    const val NO_SOUND = "No sound picked"

    // KEYS on the grid or the piano: two small icon keys after the KEYS word, remembered per window shape.
    const val KEYS_VIEW = "Keys view"
    const val VIEW_PADS = "Pads"
    const val VIEW_PIANO = "Piano"
    /** What each icon key shows, for screen readers and long-press. */
    fun keysView(piano: Boolean) = if (piano) "Keys on a piano" else "Keys on the pads"
    /** Why the piano key is greyed out. */
    const val PIANO_NO_ROOM = "No room for the piano here"

    // ---------- The function keys over the pads: PROJECT, KEYS (MODE_KEYS over MODE_PADS) and TEMPO ----------
    /** The keys' two words: the main one on the cap, the second on its coloured lower half. */
    const val FN_PROJECT = "Project"
    const val FN_PROJECT_SUB = "1\u20139"
    const val FN_TEMPO = "Tempo"
    const val FN_TEMPO_SUB = "Tap"
    /** SOUND: EDIT on or off (its lower half says EDIT); held, the sheet of the pad played last. */
    const val FN_SOUND = "Sound"
    const val SOUND_SHEET = "Pad's sound"
    const val PLAY_A_PAD = "Play a pad first: SOUND held opens its sound."

    /** PROJECT for screen readers: "Project 3", "Factory project 3", or "No project" before one is read. */
    fun projectKeyState(n: Int?, source: ProjectSource) = when {
        n == null -> "No project"
        source == ProjectSource.FACTORY -> "Factory project $n"
        else -> project(n)
    }
    const val PROJECT_NEXT = "Next project"
    /** PROJECT held: the project sheet, its title, and each key there for screen readers. */
    const val PICK_PROJECT = "Choose a project"
    const val PROJECT_TITLE = "Project"
    fun projectChoice(n: Int, shown: Boolean) = project(n) + if (shown) ", shown" else ""
    /** Why PROJECT is greyed out. */
    const val PROJECT_UNAVAILABLE = "Connect the EP-133 or get the factory sounds to change projects"
    /** A pad tapped in EDIT while the device switches projects. */
    const val PROJECT_SWITCHING = "The EP-133 is switching projects. Try again in a moment."
    fun projectFailed(reason: String) = "The project couldn't be switched: $reason"

    // TEMPO: a click on the phone. Tap turns it on or off; hold opens the tempo sheet.
    const val CLICK = "Click"
    /** TEMPO for screen readers: "On, 120 BPM", "Off, 98 BPM, from the EP-133". */
    fun clickState(on: Boolean, bpm: Int, following: Boolean) =
        (if (on) "On" else "Off") + ", ${tempoValue(bpm)}" + if (following) ", from the EP-133" else ""
    const val SET_TEMPO = "Set tempo"
    const val TEMPO_TITLE = "Tempo"
    /** The sheet's big pad for screen readers (it shows [FN_TEMPO_SUB]). */
    const val TAP_TEMPO = "Tap tempo"
    const val SLOWER = "Slower"
    const val FASTER = "Faster"
    /** The sheet while the EP-133 sends MIDI clock: its tempo leads, so − + and TAP rest. */
    const val FOLLOWING = "Following the EP-133's tempo (MIDI clock)."
    /** "120 BPM". */
    fun tempoValue(bpm: Int) = "$bpm BPM"
    /** "120", under a narrow key. */
    fun tempoShort(bpm: Int) = "$bpm"

    /** The mode word under the grid, for screen readers: what it shows and what a tap does. */
    fun modeSwitch(keysOn: Boolean) = if (keysOn) "Keys. Tap for pads." else "Pads. Tap for keys."

    fun scaleChoice(s: dev.arc.ep133.features.Scale) = "Scale: ${scaleName(s)}. Tap to change."
    const val KEYS_NOTE = "Keys plays the pad last tapped (or played on the EP-133 in Pads) as notes. Notes the EP-133 sends in its own KEYS mode light their key."
    const val PIANO_HINT = "Turn the phone sideways for a piano (with auto-rotate off, tap the rotate button Android shows)."
    const val LEGEND = "Colours"
    const val LEGEND_ROOT = "Orange ring: the key's root"
    const val LEGEND_IN_SCALE = "Ring: in the scale"
    /** The same, when the keys show their names (and no rings). */
    const val LEGEND_ROOT_NAMED = "Orange name: the key's root"
    const val LEGEND_IN_SCALE_NAMED = "Name: in the scale"
    /** The piano's root, which has no ring. */
    const val LEGEND_ROOT_BAR = "Orange bar: the key's root"
    // The piano's rows: it shows every note, so the ones outside the scale too.
    const val LEGEND_OUT = "Dimmed: outside the scale (still plays)"
    const val LEGEND_C = "Number: the octave, on each C"
    const val LEGEND_DEVICE = "Filled: played on the EP-133"
    const val LEGEND_PHONE = "Outlined: playing on the phone"

    // The piano in landscape: − and + step the octave, and the key gets its own word.
    const val OCTAVE_DOWN = "Octave down"
    const val OCTAVE_UP = "Octave up"

    /** "KEY DO", the key word above the piano. */
    fun keyWord(root: Int, names: dev.arc.ep133.features.NoteNames) = "$KEY ${dev.arc.ep133.features.Keys.name(root, names)}"

    fun keyChoice(root: Int, names: dev.arc.ep133.features.NoteNames) = "$KEY: ${dev.arc.ep133.features.Keys.name(root, names)}. Tap to change."

    /** "MAJ", the scale word when the row above the piano runs out of room. */
    fun scaleCode(s: dev.arc.ep133.features.Scale) = when (s) {
        dev.arc.ep133.features.Scale.CHROMATIC -> "Chr"
        dev.arc.ep133.features.Scale.MAJOR -> "Maj"
        dev.arc.ep133.features.Scale.MINOR -> "Min"
        dev.arc.ep133.features.Scale.DORIAN -> "Dor"
        dev.arc.ep133.features.Scale.PHRYGIAN -> "Phr"
        dev.arc.ep133.features.Scale.LYDIAN -> "Lyd"
        dev.arc.ep133.features.Scale.MIXOLYDIAN -> "Mix"
        // The word is upper-cased, so the two pentatonics differ in letters, not case.
        dev.arc.ep133.features.Scale.MAJOR_PENTATONIC -> "Maj.P"
        dev.arc.ep133.features.Scale.MINOR_PENTATONIC -> "Min.P"
        dev.arc.ep133.features.Scale.BLUES -> "Blu"
    }

    /** A piano key for screen readers: "LA4, root", "LA4, in the scale" or "FA4, outside the scale". */
    fun pianoKey(note: Int, names: dev.arc.ep133.features.NoteNames, mark: dev.arc.ep133.features.KeyMark) = noteName(note, names) + when (mark) {
        dev.arc.ep133.features.KeyMark.ROOT -> ", root"
        dev.arc.ep133.features.KeyMark.IN -> ", in the scale"
        dev.arc.ep133.features.KeyMark.OUT -> ", outside the scale"
    }

    /** "Keyboard, DO3 to DO5", the piano as a whole for screen readers. */
    fun pianoRange(lo: Int, hi: Int, names: dev.arc.ep133.features.NoteNames) = "Keyboard, ${noteName(lo, names)} to ${noteName(hi, names)}"

    /** "DO2, below the keys": a note from the EP-133 the piano doesn't reach, for the display and the tick at that end. */
    fun outOfRange(note: Int, names: dev.arc.ep133.features.NoteNames, below: Boolean) =
        noteName(note, names) + if (below) ", below the keys" else ", above the keys"

    fun scaleName(s: dev.arc.ep133.features.Scale) = when (s) {
        dev.arc.ep133.features.Scale.CHROMATIC -> "Chromatic"
        dev.arc.ep133.features.Scale.MAJOR -> "Major"
        dev.arc.ep133.features.Scale.MINOR -> "Minor"
        dev.arc.ep133.features.Scale.DORIAN -> "Dorian"
        dev.arc.ep133.features.Scale.PHRYGIAN -> "Phrygian"
        dev.arc.ep133.features.Scale.LYDIAN -> "Lydian"
        dev.arc.ep133.features.Scale.MIXOLYDIAN -> "Mixolydian"
        dev.arc.ep133.features.Scale.MAJOR_PENTATONIC -> "Major penta"
        dev.arc.ep133.features.Scale.MINOR_PENTATONIC -> "Minor penta"
        dev.arc.ep133.features.Scale.BLUES -> "Blues"
    }

    /** "OCT 4", the octave word under the keys. */
    fun octave(n: Int) = "Oct $n"

    fun octaveChoice(n: Int) = "Octave $n. Tap to change."

    /** "MI4", or "E4" with letter names. */
    fun noteName(note: Int, names: dev.arc.ep133.features.NoteNames = dev.arc.ep133.features.NoteNames.SOLFEGE) =
        dev.arc.ep133.features.Keys.name(note, names) + dev.arc.ep133.features.Keys.octaveOf(note)

    const val NOTE_NAMES = "Note names"

    /** The debug log's line for a Live sound: "live:0:3 heard 31 ms after the press (phone speaker)". */
    fun latencyNote(key: String, ms: Double, route: String) = "$key heard ${"%.0f".format(ms)} ms after the press ($route)"
    const val BLUETOOTH_DELAY = "Sound goes to Bluetooth, which plays late (often 0.2 s or more). Wired headphones or the phone speaker are much quicker."
    /** Live's display line while the sound goes to Bluetooth; the line may cut it short, so the delay comes first. */
    const val WIRELESS_DELAY = "Bluetooth plays late: wired or the speaker is quicker"
    /** The same where the route isn't known but the output's own delay is long: "Sound plays 140 ms late: wired output is quicker". */
    fun slowOutput(ms: Int) = "Sound plays $ms ms late: wired output is quicker"
    fun noteNames(n: dev.arc.ep133.features.NoteNames) = when (n) {
        dev.arc.ep133.features.NoteNames.SOLFEGE -> "DO RE MI"
        dev.arc.ep133.features.NoteNames.LETTERS -> "C D E"
    }
    const val SHOW_NAMES = "Key labels"
    const val SHOW_NAMES_NOTE = "Off, the keys show only their rings and octave numbers; the display line still names the note."
    const val NOTE_NAMES_NOTE = "How KEYS names its notes and the key picker: fixed-do solfège (DO is C) or letters, sharps as C#, D#."

    /** "A 7 · kick", the KEYS sound. */
    fun keysSound(pad: dev.arc.ep133.features.PhysicalPad, name: String?) = "${pad.groupLetter} ${pad.label}" + (name?.let { " \u00B7 $it" } ?: "")

    const val PAD_ORDER = "Pad numbers"
    const val FROM_TOP = "From the top"
    const val FROM_BOTTOM = "From the bottom"
    /** The same two, on the compact segmented control in Settings. */
    const val FROM_TOP_SHORT = "Top"
    const val FROM_BOTTOM_SHORT = "Bottom"
    const val ORDER_NOTE = "Community notes disagree on how project files number the pads. If the names look wrong, try the other way."
    const val GROUP = "Group"

    // One group at a time (like the pocket operator app's single grid with its track keys).
    const val ALL_GROUPS = "All groups"
    const val ONE_GROUP = "One group"
    const val FOLLOW = "Follow"
    const val TOOLS = "Live tools"
    const val VIEW = "View"
    const val FOLLOW_NOTE = "Follow switches to the group of the pad just played."

    // Live tools, redesigned: the long notes fold under one disclosure each.
    const val HOW_LIVE_READS = "How Live reads the EP-133"
    const val HOW_KEYS_WORKS = "How Keys works"
    /** The tools column's two tabs on a wide window: the tools, and the device's sounds to drag onto pads. */
    const val TAB_TOOLS = "Tools"
    const val TAB_SOUNDS = "Sounds"
    /** The hint beside the one-octave key picker. */
    const val KEY_HINT = "tap a note"

    /** "Keys \u00B7 MI4", the small display of the last note in the tools (upper-cased where shown). */
    fun lastNote(note: Int, names: dev.arc.ep133.features.NoteNames) = "$KEYS \u00B7 ${noteName(note, names)}"

    // The colours as compact chips (the long rows stay for screen readers).
    const val CHIP_DEVICE = "Played on the EP-133"
    const val CHIP_PHONE = "Playing on the phone"
    const val CHIP_ROOT = "Root"
    const val CHIP_OUT = "Outside the scale"

    fun groupKey(group: Int) = ('A' + group).toString()

    fun bpm(bpm: Double) = "${jsToFixed(bpm, 1)} BPM"

    fun project(n: Int) = "Project $n"

    /** "P3", for the one-group view's one-line display. */
    fun projectShort(n: Int) = "P$n"

    /** "A 7 \u00B7 001 kick \u00B7 96", or "C#5 \u00B7 ch 1 \u00B7 80" for a note outside the pads. */
    fun hit(h: Hit): String {
        val where = h.pad?.let { "${it.groupLetter} ${it.label}" } ?: "${PadNotes.noteName(h.note)} \u00B7 ch ${h.channel}"
        val sound = h.slot?.let { slot -> " \u00B7 " + FeatureText.slot(slot) + (h.name?.let { " $it" } ?: "") } ?: ""
        return "$where$sound \u00B7 ${h.velocity}"
    }

    fun channel(ch: Int) = "ch $ch"

    // ---------- EDIT: giving a pad another sound (community notes, see Device.assignPad) ----------
    /** The edge tab under GUIDE, upper-case like it. */
    const val EDIT_TAB = "EDIT"
    /** The tab for screen readers: what it does now. */
    fun editTab(on: Boolean) = if (on) "Editing pads. Tap to stop." else "Edit pads: change a pad's sound."
    /** The display line while EDIT is on, after the EDIT word. */
    const val EDIT_LINE = "Tap a pad to change its sound"

    /** "Pad A 8", the pad sheet's title. */
    fun padTitle(pad: dev.arc.ep133.features.PhysicalPad) = "Pad ${pad.groupLetter} ${pad.label}"

    /** "now 101 snare 2", or "now empty": the sound on the pad, under the title. */
    fun padNow(slot: Int?, name: String?) =
        "now " + if (slot == null) EMPTY else FeatureText.slot(slot) + (name?.let { " $it" } ?: "")

    /** "Project 1 \u00B7 now 101 snare 2". */
    fun padSheetLine(n: Int, slot: Int?, name: String?) = "${project(n)} \u00B7 ${padNow(slot, name)}"
    const val EMPTY = "empty"
    const val FIND_FOR_PAD = "Find a sound for this pad"
    /** Marks the sound on the pad now in the sheet's list (upper-cased where shown). */
    const val ON_PAD = "On pad"
    const val UPLOAD_NEW = "Upload a new sample\u2026"
    const val ASSIGN_NOTE = "The pad takes the new sound at once. Its own settings (level, pitch and the rest) start again from the sample's, as when you change a pad's sound on the EP-133."

    /** "Pad A 8: vox chop", the toast after a pad got another sound (with UNDO). */
    fun assigned(pad: dev.arc.ep133.features.PhysicalPad, name: String) = "Pad ${pad.groupLetter} ${pad.label}: $name"
    const val UNDO = "Undo"
    /** "Pad A 8: back to snare 2", after UNDO. */
    fun restored(pad: dev.arc.ep133.features.PhysicalPad, name: String) = "Pad ${pad.groupLetter} ${pad.label}: back to $name"

    /** "snare 2 \u2192 vox chop", on a pad while a sound is dragged over it. */
    fun dropPreview(old: String?, new: String) = "${old ?: EMPTY} \u2192 $new"

    const val EDIT_OFFLINE = "Connect your EP-133 to change a pad's sound."
    const val EDIT_NO_PROJECT = "arc hasn't read the active project yet. Wait a moment, or press a pad on the EP-133."
    const val EDIT_PRESS_FIRST = "arc doesn't know which pad this is yet. Press it once on the EP-133, then tap it here."
    const val NO_FREE_SLOT = "No free slot left on the device. Delete a sound there first."
    fun assignFailed(reason: String) = "The pad's sound couldn't be changed: $reason"
    fun undoFailed(reason: String) = "The old sound couldn't be put back: $reason"
    fun uploadFailed(reason: String) = "The sample couldn't be uploaded: $reason"

    // ---------- EDIT: a pad's SOUND EDIT settings (community notes, see Device.writePadSettings) ----------
    /** The pages, as the device prints them (upper-cased where shown), in [pageName]'s order. */
    const val PAGE_SOUND = "Sound"
    const val PAGE_TRIM = "Trim"
    const val PAGE_ENV = "Env"
    const val PAGE_MIDI = "Midi"
    const val PAGE_MUTE = "Mute"
    /** Page [i]'s name: Sound, Trim, Env, Midi, Mute. */
    fun pageName(i: Int) = listOf(PAGE_SOUND, PAGE_TRIM, PAGE_ENV, PAGE_MIDI, PAGE_MUTE)[i]

    /** The knobs' names. */
    const val PITCH = "Pitch"
    const val LEVEL = "Level"
    const val MODE = "Mode"
    const val PAN = "Pan"
    const val START = "Start"
    const val LENGTH = "Length"
    const val ATTACK = "Attack"
    const val RELEASE = "Release"
    const val CHANNEL = "Channel"
    const val MUTE_GROUP = "Mute group"
    /** A knob's readout while its value isn't known (the trim before the sample's length is). */
    const val NO_VALUE = "\u2014"

    /** "+1.5", "-12", "0": semitones, at most two decimals. */
    fun pitchLabel(semitones: Double): String {
        val r = Math.round(semitones * 100) / 100.0
        if (r == 0.0 || r.isNaN()) return "0"
        return (if (r > 0) "+" else "-") + dev.arc.ep133.util.jsNumberToString(Math.abs(r))
    }

    /** "100". */
    fun levelLabel(level: Int) = "$level"

    /** "C" in the middle, "L8" to the left, "R16" to the right. */
    fun panLabel(pan: Int) = when {
        pan < 0 -> "L${-pan}"
        pan > 0 -> "R$pan"
        else -> "C"
    }

    fun modeLabel(m: dev.arc.ep133.features.PlayMode) = when (m) {
        dev.arc.ep133.features.PlayMode.ONESHOT -> "Oneshot"
        dev.arc.ep133.features.PlayMode.KEY -> "Key"
        dev.arc.ep133.features.PlayMode.LEGATO -> "Legato"
    }

    /** "0.25 s": [frames] at [rate] frames a second. */
    fun secondsLabel(frames: Long, rate: Double) = "${jsToFixed(if (rate > 0) frames / rate else 0.0, 2)} s"

    /** An envelope time as the device keeps it, 0..255 (its milliseconds aren't known for sure). */
    fun envLabel(ticks: Int) = "$ticks"

    /** "1".."16" for channels 0..15. */
    fun channelLabel(ch: Int) = "${ch + 1}"

    fun onOff(on: Boolean) = if (on) "On" else "Off"

    /** A knob for screen readers: "Pitch: +1.5." */
    fun knobDescription(name: String, value: String) = "$name: $value."

    /** TRIM's waveform for screen readers: "Plays 46875 frames from frame 1200." */
    fun trimDescription(start: Long, length: Long) = "Plays $length frames from frame $start."
    /** Under ENV while the pad is Oneshot, which plays to the end. */
    const val ONESHOT_RELEASE = "Oneshot plays to the end: release is for Key and Legato."
    /** Under MUTE. */
    const val MUTE_NOTE = "Pads with the mute group on cut each other off within their group: playing one stops the others."

    /** The pad sheet's note under the knobs: while the pad's settings are read, offline, or else. */
    const val PAD_READING = "Reading the pad's settings\u2026"
    /** The EP-133 didn't answer for the pad's settings: the knobs rest. */
    const val PAD_READ_FAILED = "The EP-133 didn't send this pad's settings. Close the sheet and open it again to retry."
    const val PAD_SETTINGS_OFFLINE = "Offline, the pad's settings change in arc only. When you connect, arc asks before putting them on the EP-133."
    const val PAD_SETTINGS_NOTE = "Turns go on the EP-133 as soon as you let go."
    /** The key that folds the sheet's sound list away while the settings show, and back. */
    const val CHANGE_SOUND = "Change sound"
    const val HIDE_SOUNDS = "Hide sounds"
    fun padSettingsFailed(reason: String) = "The pad's settings couldn't be changed: $reason"

    // ---------- Offline: the sounds panel and pad changes in arc only, put on the EP-133 when it connects ----------
    /** The Device / Factory switch over the sound list. */
    const val SOURCE = "Sounds from"
    const val SOURCE_DEVICE = "Device"
    const val SOURCE_FACTORY = "Factory"
    /** A device sound arc has no copy or backup of, dimmed in the list. */
    const val NEEDS_DEVICE = "Needs the EP-133"

    /** "Pad A 8: kick, in arc until you connect", the toast after a pad got another sound offline. */
    fun assignedOffline(pad: dev.arc.ep133.features.PhysicalPad, name: String) = "${assigned(pad, name)}, in arc until you connect"
    const val ASSIGN_NOTE_OFFLINE = "Offline, the pad changes in arc only. When you connect, arc asks before putting it on the EP-133."

    /** The Live tools row while offline changes are kept, with [RESET_PADS]. */
    const val OFFLINE_PADS = "Offline pad changes"
    fun offlinePadsNote(n: Int) =
        "${Format.plural(n, "pad")} changed in arc only. When you connect, arc asks before putting ${if (n == 1) "it" else "them"} on the EP-133."
    const val RESET_PADS = "Reset pads"
    const val PADS_RESET = "Pads back to the EP-133's sounds."

    /**
     * The question when the EP-133 connects with offline changes kept: [WRITE] or [DISCARD].
     * [n] counts the pad changes and [samples] the new recordings waiting to go on, so a
     * prompt for recordings alone doesn't call them pad changes.
     */
    fun putOffline(n: Int, samples: Int = 0) = "Put " + when {
        samples == 0 -> Format.plural(n, "offline pad change")
        n == 0 -> Format.plural(samples, "new sample")
        else -> "${Format.plural(n, "offline pad change")} and ${Format.plural(samples, "new sample")}"
    } + " on the EP-133?"
    const val WRITE = "Write"
    const val DISCARD = "Discard"
    /** "2 pads put on the EP-133. 1 skipped: …", after [WRITE]. */
    fun offlineWritten(written: Int, skipped: Int) = "${Format.plural(written, "pad")} put on the EP-133." +
        if (skipped == 0) "" else " $skipped skipped: the EP-133 has another sound or project there now."
    const val OFFLINE_DISCARDED = "Offline pad changes discarded."

    // ---------- REC: takes of what is played on the phone ----------
    const val REC = "Rec"
    const val TAKES = "Takes"
    const val NO_TAKES = "Tap REC on the display, then play: recording starts with the first sound and stops when you tap REC again."
    const val TAKES_NOTE = "A take holds the pads and keys played on the phone, connected or not, not the EP-133's own sound. Takes stay in arc until you delete them; Save or Share copies one out."
    const val TO_DEVICE = "To EP-133"
    const val DELETE_TAKE = "Delete this take?"
    const val NO_OUTPUT = "There is no sound output to record from."
    const val SHARE_TAKE_FAILED = "Sharing failed. Use Save WAV instead."

    /** What the REC key does now, for screen readers. */
    fun recDescription(state: dev.arc.ep133.features.RecState) = when (state) {
        dev.arc.ep133.features.RecState.Idle -> "Record. Recording starts with the first sound you play."
        dev.arc.ep133.features.RecState.Armed -> "Record, waiting for the first sound. Tap to cancel."
        is dev.arc.ep133.features.RecState.Recording -> "Recording, ${takeLength(state.seconds.toDouble())}. Tap to stop."
    }

    /** "0:12", "10:00". */
    fun takeLength(seconds: Double): String {
        val s = seconds.toLong()
        return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
    }

    fun takeSaved(seconds: Double) = "Take saved (${takeLength(seconds)}). It's in Live tools."

    fun takeAtLimit(seconds: Double) =
        "The take reached ${dev.arc.ep133.features.TakeRecorder.MAX_SECONDS / 60} minutes and was saved (${takeLength(seconds)})."

    fun takeFailed(reason: String) = "The take couldn't be saved: $reason"

    // ---------- SAMPLE: recording into a pad (an addition) ----------
    /** The sources' words, upper-cased where shown, as the device prints them. */
    const val MIC = "Mic"
    const val RSP = "Rsp"
    const val USB = "Usb"
    const val STEREO = "Stereo"

    /** "Rsp St", the source chip (upper-cased where shown: "RSP ST"); mono has no mark, as on the device. */
    fun sourceShort(s: SampleSource, stereo: Boolean) = when (s) {
        SampleSource.MIC -> MIC
        SampleSource.RSP -> RSP
        SampleSource.USB -> USB
    } + if (stereo) " St" else ""

    /** The source spelt out for screen readers: "Phone mic, mono", "EP-133 over USB, stereo". */
    fun sourceName(s: SampleSource, stereo: Boolean) = when (s) {
        SampleSource.MIC -> "Phone mic"
        SampleSource.RSP -> "Resample the phone's sound"
        SampleSource.USB -> "EP-133 over USB"
    } + if (stereo) ", stereo" else ", mono"
    /** The − and + either side of the source chip. */
    const val PREV_SOURCE = "Previous source"
    const val NEXT_SOURCE = "Next source"

    // KNOB X is [LEVEL] (the input's gain) and KNOB Y the threshold, as on the device.
    /** THRESHOLD under knob Y; [THRESHOLD_NAME] for screen readers, where the short word reads badly. */
    const val THRESHOLD = "Thresh"
    const val THRESHOLD_NAME = "Threshold"

    /** "+12 dB", "−6 dB" or "0 dB": the input's gain under LEVEL. */
    fun gainReadout(db: Int) = when {
        db > 0 -> "+$db dB"
        db < 0 -> "\u2212${-db} dB"
        else -> "0 dB"
    }

    /** "−24 dB", or "Off" with no threshold (recording starts at the press). */
    fun thresholdReadout(db: Int?) = if (db == null) onOff(false) else gainReadout(db)

    /** A take of a set length, in bars of the tempo: "Free" (until you let go), "1 bar", "2 bars". */
    const val BARS = "Bars"
    fun barsChoice(n: Int?) = if (n == null) "Free" else Format.plural(n, "bar")

    /**
     * The switch for hands-free takes, for one hand or a screen reader; while
     * one goes on (or counts in, or waits) its key reads STOP ([FeatureText.STOP]).
     */
    const val LATCH = "Latch"
    const val LATCH_NOTE = "Latch on: tap a pad to record hands-free. Tap it again or STOP to stop."
    /** The meter, for screen readers, and its clip light. */
    const val INPUT_LEVEL = "Input level"
    const val CLIPPING = "Clipping"

    // The display line in the mode, grown into the SAMPLE panel: the tag, then what happens next.
    const val SAMPLE_TAG = "Sample"
    const val SAMPLE_READY = "Hold a pad to record"
    const val SAMPLE_READY_LATCH = "Tap a pad to record hands-free"
    /** Armed with a threshold: the take starts with the first sound loud enough. */
    const val SAMPLE_WAITING = "Waiting for sound"
    /** A take of set bars from USB while the EP-133 sends MIDI clock: it starts with the device's PLAY. */
    const val WAITING_FOR_PLAY = "Press PLAY on the EP-133"
    fun countIn(beat: Int) = "Count-in $beat"

    /** "0:04 / 0:20": the take so far, and the longest it can be. */
    fun sampleTime(seconds: Int, max: Int) = "${takeLength(seconds.toDouble())} / ${takeLength(max.toDouble())}"

    /** "Takes up to 40 s": the panel's wave strip before the first take, the longest one can be. */
    fun sampleMax(seconds: Int) = "Takes up to $seconds s"

    /** "Pad A 7: uploading, 40%"; without [percent] as a screen reader hears it, once rather than at each step. */
    fun sampleUploading(pad: PhysicalPad, percent: Int? = null) = "${padTitle(pad)}: uploading" + (percent?.let { ", $it%" } ?: "")

    /** A full-length take won't fit in the EP-133's free space, so takes stop sooner. */
    const val DISK_LOW = "Disk low"
    fun diskLow(seconds: Int) = "$DISK_LOW: room for $seconds s"

    /** Added to a pad's name for screen readers in the mode: ", has a sound" or ", empty". */
    fun padSampleState(filled: Boolean) = if (filled) ", has a sound" else ", empty"
    /** Added to the take's pad instead: recording into it, or waiting to (for sound, the count-in or PLAY). */
    const val PAD_RECORDING = ", recording"
    const val PAD_WAITING = ", waiting to record"
    /** A pad's click in the mode for screen readers, which can't hold: a latched take, its end, or (before it starts) its cancel. */
    const val RECORD_HANDS_FREE = "Record hands-free"
    const val STOP_RECORDING = "Stop recording"
    const val CANCEL_RECORDING = "Cancel recording"

    /** A short tap on an empty pad in the mode. */
    const val HOLD_TO_RECORD = "Hold the pad to record. A tap plays a pad that has a sound."
    /** The mic permission was refused for good, with [MIC_SETTINGS] to open the app's settings. */
    const val NO_MIC = "arc needs the microphone to sample the mic or USB. RSP works without it."
    const val MIC_SETTINGS = "Settings"
    const val USB_EXPERIMENTAL = "USB sampling is experimental. The EP-133 needs OS 2.5 and its sound going out over USB."
    const val USB_GONE = "The USB input went away. What was recorded is kept."
    fun inputFailed(reason: String) = "The input couldn't be opened: $reason"
    /** Android silences the mic while another app (a call, say) records. */
    const val MIC_BUSY = "Another app is using the mic."
    /** On return, after the take stopped because arc left the screen. */
    const val SAMPLE_BACKGROUND = "Sampling stopped when arc left the screen. The recording is kept."

    // The review sheet after a take: trim and hear it, then KEEP, RETAKE or DISCARD (with UNDO).
    const val REVIEW_TITLE = "New sample"

    /** "Pad A 7 \u00B7 0:04 \u00B7 RSP ST", under the review sheet's title. */
    fun reviewLine(pad: PhysicalPad, seconds: Double, source: SampleSource, stereo: Boolean) =
        "${padTitle(pad)} \u00B7 ${takeLength(seconds)} \u00B7 ${sourceShort(source, stereo).uppercase()}"
    const val NORMALIZE = "Normalize"
    const val NORMALIZE_NOTE = "Raises the sample so its loudest point is at 0 dB."
    const val TRIM_SILENCE = "Trim silence"
    const val TRIM_SILENCE_NOTE = "Starts the sample where the sound starts."
    const val RETAKE = "Retake"
    const val KEEP = "Keep"

    /** "Slot 214, the next free one": where KEEP puts the sample (− and + step over the free slots). */
    fun slotLine(slot: Int, next: Boolean) = "Slot $slot" + if (next) ", the next free one" else ""
    /** The − and + either side of the slot line. */
    const val PREV_SLOT = "Previous free slot"
    const val NEXT_SLOT = "Next free slot"
    /** Offline, the slot is picked on upload: the free ones aren't known until then. */
    const val SLOT_WHEN_CONNECTED = "Goes into the next free slot when the EP-133 connects."

    /** "Pad A 7: kept in arc. It goes on the EP-133 when you connect.", after KEEP offline. */
    fun sampleQueued(pad: PhysicalPad) = "${padTitle(pad)}: kept in arc. It goes on the EP-133 when you connect."
    /** "Pad A 7: new sample on the EP-133.", once the upload is done. */
    fun sampleSaved(pad: PhysicalPad) = "${padTitle(pad)}: new sample on the EP-133."
    /** A pad pressed for a sound only the EP-133 has while a new sample goes up to it, Live playing on. */
    const val DEVICE_UPLOADING = "The EP-133 is taking a new sample. This sound plays once it's done."
    const val SAMPLE_DISCARDED = "Sample discarded."
    /** A take with no pad to go on (no project read yet): it isn't lost. */
    const val KEPT_IN_TAKES = "Kept in Takes: read a project on the EP-133 to put samples on pads."
    /** "2 samples kept in Takes.", after offline recordings were discarded or reset: never dropped. */
    fun samplesToTakes(n: Int) = "${Format.plural(n, "sample")} kept in Takes."
}
