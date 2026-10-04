package dev.arc.ep133.features

/** A physical pad: group 0..3 (A..D) and its place in the group's note octave, 0..11. */
data class PhysicalPad(val group: Int, val offset: Int) {
    val label: String get() = PadNotes.LABELS[offset]
    val groupLetter: Char get() = 'A' + group
}

/**
 * The official MIDI note map of the EP-133 (teenage engineering's guide,
 * "midi note map" and implementation chart): notes 36-83 are the pads,
 * one octave per group (A 36-47, B 48-59, C 60-71, D 72-83). Inside a group
 * the notes go '.', '0', 'enter', '1' ... '9'. In KEYS mode the device can
 * send any note 0-127, so a note in this range may also be a KEYS note.
 */
object PadNotes {
    const val FIRST = 36
    const val LAST = 83
    val LABELS = listOf(".", "0", "ENTER", "1", "2", "3", "4", "5", "6", "7", "8", "9")

    /** The keypad as it sits on the device, top row first: 7 8 9 / 4 5 6 / 1 2 3 / . 0 ENTER. */
    val ROWS: List<List<Int>> = listOf(listOf(9, 10, 11), listOf(6, 7, 8), listOf(3, 4, 5), listOf(0, 1, 2))

    fun pad(note: Int): PhysicalPad? =
        if (note in FIRST..LAST) PhysicalPad((note - FIRST) / 12, (note - FIRST) % 12) else null

    fun note(pad: PhysicalPad): Int = FIRST + pad.group * 12 + pad.offset

    private val NAMES = listOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

    /** "C2" for 36, as the guide's note table names it (middle C 60 = C4). */
    fun noteName(note: Int): String = NAMES[note % 12] + (note / 12 - 1)
}
