package dev.arc.ep133.features

/** A note to play or let go of, from [NoteTouches]. */
sealed interface NoteEvent {
    val note: Int

    /** Play [note]; again, cutting the old voice short, if another finger already holds it. */
    data class Press(override val note: Int) : NoteEvent

    /** Let go of [note]: the last finger on it lifted or slid away. */
    data class Release(override val note: Int) : NoteEvent
}

/**
 * The fingers on Live's KEYS (an addition), on the piano and on the grid:
 * the note under each pointer (on the grid, each key is a pointer of its
 * own), and how many fingers are on each note. A finger sliding across the
 * keys lets go of one note and plays the next (a glissando); a second finger
 * on a held note strikes it again; a note is let go of only when its last
 * finger lifts or leaves. Pure bookkeeping: the screen feeds it pointer
 * changes and plays the events that come back.
 */
class NoteTouches {
    private val fingers = HashMap<Long, Int>()
    private val counts = LinkedHashMap<Int, Int>()

    /** The notes some finger is on, first pressed first. */
    val held: Set<Int> get() = counts.keys.toSet()

    /** Pointer [id] lands on [note]. */
    fun down(id: Long, note: Int): List<NoteEvent> =
        // An id still on a note (its lift was lost) lets go of that one first.
        listOfNotNull(lift(id), press(id, note))

    /** Pointer [id] is over [note] now, or off the plate (null). Coming back onto the plate plays again. */
    fun move(id: Long, note: Int?): List<NoteEvent> {
        if (fingers[id] == note) return emptyList()
        return listOfNotNull(lift(id), note?.let { press(id, it) })
    }

    /** Pointer [id] lifts (or is cancelled). */
    fun up(id: Long): List<NoteEvent> = listOfNotNull(lift(id))

    /** Every finger gone at once (the gesture ended or the keys went away): each held note let go of once. */
    fun releaseAll(): List<NoteEvent> {
        val out = counts.keys.map { NoteEvent.Release(it) }
        fingers.clear()
        counts.clear()
        return out
    }

    private fun press(id: Long, note: Int): NoteEvent {
        fingers[id] = note
        counts[note] = (counts[note] ?: 0) + 1
        return NoteEvent.Press(note)
    }

    private fun lift(id: Long): NoteEvent? {
        val note = fingers.remove(id) ?: return null
        val left = (counts[note] ?: 1) - 1
        if (left > 0) {
            counts[note] = left
            return null
        }
        counts.remove(note)
        return NoteEvent.Release(note)
    }
}
