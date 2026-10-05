package dev.arc.ep133.text

import dev.arc.ep133.features.Hit
import dev.arc.ep133.features.PadNotes
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
    const val PLAYING = "Playing"
    const val STOPPED = "Stopped"
    const val NO_TRANSPORT = "Play/stop and tempo need MIDI clock out: SHIFT + ERASE, then 102 and ENTER."
    const val WAITING = "Press a pad on the EP-133."
    const val KEYS = "Keys"
    const val LEARN_NOTE = "Sample names are learned as you press pads: one press of a key, in any group, names that key in every group, and arc remembers it."
    const val COMMUNITY_NOTE = "Pads follow the official MIDI note map; play/stop and tempo are standard MIDI clock messages. Naming the samples relies on community notes about the device's SysEx, not on the official guide."
    const val NO_PUSHES = "No pad messages from the device yet, so samples can't be named. Pads still light up."
    const val LISTEN_ONLY = "arc only reads from the device here (sound names, the active project's pads, and the samples on them, to keep a copy); nothing on it is changed."

    // Tapping a pad plays its sample on the phone.
    const val TAP_NOTE = "Hold a pad to hear its sample on the phone (it stops when you let go): from arc's copy of the device's sounds, a backup, or the device."
    const val NO_SAMPLE = "arc doesn't know this pad's sample yet."
    const val NO_COPY = "This sample isn't saved on the phone or in a backup yet."
    const val SOUNDS_CLEARED = "Saved pad sounds cleared."
    const val PLAY = "Play"

    // KEYS: one sound played as notes across the pads, like the EP-133's KEYS mode.
    const val MODE_PADS = "Pads"
    const val MODE_KEYS = "Keys"
    const val KEY = "Key"
    const val SCALE = "Scale"
    const val PICK_SOUND = "Tap a pad in Pads first: Keys plays that pad's sample."
    const val NO_SOUND = "No sound picked"

    /** The mode word under the grid, for screen readers: what it shows and what a tap does. */
    fun modeSwitch(keysOn: Boolean) = if (keysOn) "Keys. Tap for pads." else "Pads. Tap for keys."

    fun scaleChoice(s: dev.arc.ep133.features.Scale) = "Scale: ${scaleName(s)}. Tap to change."
    const val KEYS_NOTE = "Keys plays the pad last tapped (or played on the EP-133 in Pads) as notes. Notes the EP-133 sends in its own KEYS mode light their key."
    const val PIANO_HINT = "Turn the phone sideways for a piano (with auto-rotate off, tap the rotate button Android shows)."
    const val LEGEND = "Colours"
    const val LEGEND_ROOT = "Orange ring: the key's root"
    const val LEGEND_IN_SCALE = "Navy ring: in the scale"
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

    const val NOTE_NAMES = "Note names on the keys"

    /** The debug log's line for a Live sound: "live:0:3 heard 31 ms after the press (phone speaker)". */
    fun latencyNote(key: String, ms: Double, route: String) = "$key heard ${"%.0f".format(ms)} ms after the press ($route)"
    const val BLUETOOTH_DELAY = "Sound goes to Bluetooth, which plays late (often 0.2 s or more). Wired headphones or the phone speaker are much quicker."
    fun noteNames(n: dev.arc.ep133.features.NoteNames) = when (n) {
        dev.arc.ep133.features.NoteNames.SOLFEGE -> "DO RE MI"
        dev.arc.ep133.features.NoteNames.LETTERS -> "C D E"
    }
    const val NOTE_NAMES_NOTE = "How KEYS names its notes and the key picker: fixed-do solfège (DO is C) or letters, sharps as C#, D#."

    /** "A 7 · kick", the KEYS sound. */
    fun keysSound(pad: dev.arc.ep133.features.PhysicalPad, name: String?) = "${pad.groupLetter} ${pad.label}" + (name?.let { " \u00B7 $it" } ?: "")

    const val PAD_ORDER = "Pad numbers in project files"
    const val FROM_TOP = "From the top"
    const val FROM_BOTTOM = "From the bottom"
    const val ORDER_NOTE = "Community notes disagree on how project files number the pads. If the names look wrong, try the other way."
    const val GROUP = "Group"

    // One group at a time (like the pocket operator app's single grid with its track keys).
    const val ALL_GROUPS = "All groups"
    const val ONE_GROUP = "One group"
    const val FOLLOW = "Follow"
    const val TOOLS = "Live tools"
    const val VIEW = "View"
    const val FOLLOW_NOTE = "Follow switches to the group of the pad just played."

    /** The view word over the pads on a phone on its side, for screen readers: what it shows and what a tap does. */
    fun viewSwitch(oneGroup: Boolean) = if (oneGroup) "$ONE_GROUP. Tap for all groups." else "$ALL_GROUPS. Tap for one group."
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
}
