package dev.arc.ep133.features

/** The scales Live's KEYS can play, as semitones from the root (an addition). */
enum class Scale(val intervals: List<Int>) {
    CHROMATIC((0..11).toList()),
    MAJOR(listOf(0, 2, 4, 5, 7, 9, 11)),
    MINOR(listOf(0, 2, 3, 5, 7, 8, 10)),
    DORIAN(listOf(0, 2, 3, 5, 7, 9, 10)),
    PHRYGIAN(listOf(0, 1, 3, 5, 7, 8, 10)),
    LYDIAN(listOf(0, 2, 4, 6, 7, 9, 11)),
    MIXOLYDIAN(listOf(0, 2, 4, 5, 7, 9, 10)),
    MAJOR_PENTATONIC(listOf(0, 2, 4, 7, 9)),
    MINOR_PENTATONIC(listOf(0, 3, 5, 7, 10)),
    BLUES(listOf(0, 3, 5, 6, 7, 10)),
}

/** How KEYS names its notes: fixed-do solfège (DO RE MI) or letters (C D E). */
enum class NoteNames { SOLFEGE, LETTERS }

/**
 * KEYS mode in Live (an addition), after the EP-133's: the 12 pads play one
 * sound as notes of a scale. Key i is the pad at offset i in the official
 * note order ('.' lowest, then '0', 'ENTER', '1' … '9'; see [PadNotes]).
 */
object Keys {
    /** A sound plays at its own pitch on this note (the EP-133's default root, C4). */
    const val ROOT_NOTE = 60
    const val MIN_OCTAVE = 0
    const val MAX_OCTAVE = 8

    private val SOLFEGE = listOf("DO", "DI", "RE", "RI", "MI", "FA", "FI", "SO", "SI", "LA", "LI", "TI")
    private val LETTERS = listOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

    /** The MIDI note of each key, lowest first: [scale] from [root] (0 = C) in [octave] (4 = C4 octave). */
    fun notes(root: Int, scale: Scale, octave: Int): List<Int> {
        val base = 12 * (octave + 1) + root.coerceIn(0, 11)
        val steps = scale.intervals
        return List(12) { i -> (base + 12 * (i / steps.size) + steps[i % steps.size]).coerceIn(0, 127) }
    }

    /** Fixed-do name of a note: DO is C, sharps are DI, RI, FI, SI, LI. */
    fun solfege(note: Int): String = SOLFEGE[((note % 12) + 12) % 12]

    /** Letter name of a note, sharps for the black keys: C, C#, D … B. */
    fun letter(note: Int): String = LETTERS[((note % 12) + 12) % 12]

    /** A note's name (no octave) the way [names] says. */
    fun name(note: Int, names: NoteNames): String = when (names) {
        NoteNames.SOLFEGE -> solfege(note)
        NoteNames.LETTERS -> letter(note)
    }

    /** The note's octave number as the guide's note table counts it (C4 = 60). */
    fun octaveOf(note: Int): Int = note / 12 - 1

    /** The key a note played on the device lights: the same note, else the first one with its name. */
    fun keyFor(note: Int, notes: List<Int>): Int? =
        notes.indexOf(note).takeIf { it >= 0 } ?: notes.indexOfFirst { it % 12 == note % 12 }.takeIf { it >= 0 }
}
