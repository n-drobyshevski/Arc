package dev.arc.ep133.features

import dev.arc.ep133.protocol.MidiEvent

/** A pad file id from a pad push: project 1..99, group 0..3 (A..D) and the pad's number in the project file (pNN). */
data class PadFid(val project: Int, val group: Int, val pad: Int)

/** A pad that is sounding (or fading out): its velocity, when it started, and when it was released. */
data class PadLight(val velocity: Int, val channel: Int, val onAt: Long, val offAt: Long? = null)

/** What the mirror shows about a pad that was hit. */
data class Hit(val pad: PhysicalPad?, val note: Int, val channel: Int, val velocity: Int, val slot: Int?, val name: String?)

data class MirrorState(
    val pads: Map<PhysicalPad, PadLight> = emptyMap(),
    /** Notes outside the pad range (KEYS mode or other sources) that are held, note -> channel. */
    val keysHeld: Map<Int, Int> = emptyMap(),
    val lastKeysNote: Int? = null,
    val lastHit: Hit? = null,
    val playing: Boolean? = null,
    val bpm: Double? = null,
    val activeProject: Int? = null,
    /** Pad offsets (0..11) whose pad number in the project file has been learned. */
    val learned: Map<Int, Int> = emptyMap(),
    /** Whether a pad push has ever been seen this session. */
    val pushesSeen: Boolean = false,
    val padOrder: PadOrder = PadOrder.FROM_TOP,
)

/**
 * The live mirror's state (an addition to the web version). It only listens:
 *
 * - Notes 36-83 light the pad the official note map names (PadNotes).
 * - Start / Continue / Stop and clock give play state and tempo. The device
 *   sends them only with MIDI clock out (system setting 102).
 * - Which sample a pad plays is not in the MIDI. Community notes say a
 *   physical pad press also makes the device push its pad file id over SysEx.
 *   A note and a push for the same group close together link that physical
 *   pad (its offset) to its number in the project file; the project's pad
 *   layout then gives the slot, and the sound list its name. Without such a
 *   link no name is shown: nothing is guessed. The link is the same in every
 *   project and group (it is the keypad's numbering), so it is kept.
 *
 * All times are nanoseconds on one clock (the MIDI receiver's timestamps and
 * System.nanoTime in the app).
 */
class LiveMirror(
    learned: Map<Int, Int> = emptyMap(),
    padOrder: PadOrder = PadOrder.FROM_TOP,
    private val onLearned: (Map<Int, Int>) -> Unit = {},
) {
    companion object {
        /** How close a note and a pad push must be to belong to the same press. */
        const val MATCH_WINDOW_NS = 250_000_000L
        /** Released pads stay in the state this long, for the fade-out. */
        const val FADE_NS = 1_000_000_000L
        /** No clock for this long: the tempo is no longer known. */
        const val CLOCK_TIMEOUT_NS = 2_000_000_000L
        private const val CLOCK_WINDOW = 48
    }

    private val pads = LinkedHashMap<PhysicalPad, PadLight>()
    private val keysHeld = LinkedHashMap<Int, Int>()
    private var lastKeysNote: Int? = null
    private var lastHit: Hit? = null
    private var playing: Boolean? = null
    private val clocks = ArrayDeque<Long>()
    private var activeProject: Int? = null
    private var layout: Map<String, Map<Int, Int?>> = emptyMap()
    private var names: Map<Int, String> = emptyMap()
    private val learned = LinkedHashMap(learned)
    private var pushesSeen = false
    private var padOrder = padOrder

    @Synchronized
    fun setPadOrder(order: PadOrder) {
        padOrder = order
    }

    // The latest note-on and pad push per group not yet paired, with their times.
    private val pendingNote = HashMap<Int, Pair<PhysicalPad, Long>>()
    private val pendingPush = HashMap<Int, Pair<PadFid, Long>>()

    @Synchronized
    fun setProject(project: Int?, groups: List<PadGroup>) {
        activeProject = project
        layout = groups.associate { it.name to it.pads }
    }

    @Synchronized
    fun setNames(slotNames: Map<Int, String>) {
        names = slotNames
    }

    @Synchronized
    fun onMidi(e: MidiEvent) {
        when (e) {
            is MidiEvent.NoteOn -> {
                val pad = PadNotes.pad(e.note)
                if (pad == null) {
                    keysHeld[e.note] = e.channel
                    lastKeysNote = e.note
                    lastHit = Hit(null, e.note, e.channel, e.velocity, null, null)
                } else {
                    pads[pad] = PadLight(e.velocity, e.channel, e.time)
                    pendingNote[pad.group] = pad to e.time
                    tryLink(pad.group)
                    val slot = slotOf(pad)
                    lastHit = Hit(pad, e.note, e.channel, e.velocity, slot, slot?.let { names[it] })
                }
            }
            is MidiEvent.NoteOff -> {
                val pad = PadNotes.pad(e.note)
                if (pad == null) {
                    keysHeld.remove(e.note)
                } else {
                    pads[pad]?.let { if (it.offAt == null) pads[pad] = it.copy(offAt = e.time) }
                }
            }
            is MidiEvent.Clock -> {
                clocks.addLast(e.time)
                while (clocks.size > CLOCK_WINDOW) clocks.removeFirst()
            }
            is MidiEvent.Start -> {
                playing = true
                clocks.clear()
            }
            is MidiEvent.Continue -> playing = true
            is MidiEvent.Stop -> {
                playing = false
                // A note-off lost at stop would leave a pad lit forever: release what is held.
                for ((p, l) in pads.entries.toList()) if (l.offAt == null) pads[p] = l.copy(offAt = e.time)
                keysHeld.clear()
            }
            is MidiEvent.ControlChange -> Unit
        }
    }

    /** A pad push: the device's "active" pad changed, which community notes tie to a physical press. */
    @Synchronized
    fun onPadPush(fid: PadFid, time: Long) {
        pushesSeen = true
        pendingPush[fid.group] = fid to time
        tryLink(fid.group)
    }

    private fun tryLink(group: Int) {
        val (pad, noteAt) = pendingNote[group] ?: return
        val (fid, pushAt) = pendingPush[group] ?: return
        if (kotlin.math.abs(noteAt - pushAt) > MATCH_WINDOW_NS) return
        pendingNote.remove(group)
        pendingPush.remove(group)
        if (learned[pad.offset] != fid.pad) {
            learned[pad.offset] = fid.pad
            onLearned(LinkedHashMap(learned))
        }
        // Name the hit that was just linked.
        val hit = lastHit
        if (hit?.pad == pad && hit.slot == null) {
            val slot = slotOf(pad)
            lastHit = hit.copy(slot = slot, name = slot?.let { names[it] })
        }
    }

    /**
     * The slot on a physical pad in the active project. Counted from the top,
     * the pad's number is the learned pad file id term; counted from the
     * bottom, it is the official note order plus one (see [PadOrder]).
     */
    @Synchronized
    fun slotOf(pad: PhysicalPad): Int? {
        val number = when (padOrder) {
            PadOrder.FROM_TOP -> learned[pad.offset] ?: return null
            PadOrder.FROM_BOTTOM -> pad.offset + 1
        }
        return layout[('a' + pad.group).toString()]?.get(number)
    }

    @Synchronized
    fun nameOf(pad: PhysicalPad): String? = slotOf(pad)?.let { names[it] }

    /** The state at [now]: released pads past their fade are dropped, and a stale tempo is cleared. */
    @Synchronized
    fun snapshot(now: Long): MirrorState {
        pads.entries.removeAll { (_, l) -> l.offAt != null && now - l.offAt > FADE_NS }
        val lastClock = clocks.lastOrNull()
        val bpm = if (lastClock == null || now - lastClock > CLOCK_TIMEOUT_NS || clocks.size < 25) {
            null
        } else {
            val span = clocks.last() - clocks.first()
            val ticks = clocks.size - 1
            // 24 clocks per quarter note.
            if (span <= 0) null else 60e9 * ticks / (span * 24.0)
        }
        return MirrorState(
            pads = LinkedHashMap(pads),
            keysHeld = LinkedHashMap(keysHeld),
            lastKeysNote = lastKeysNote,
            lastHit = lastHit,
            playing = playing,
            bpm = bpm,
            activeProject = activeProject,
            learned = LinkedHashMap(learned),
            pushesSeen = pushesSeen,
            padOrder = padOrder,
        )
    }
}
