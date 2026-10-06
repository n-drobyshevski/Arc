package dev.arc.ep133.features

import dev.arc.ep133.protocol.MidiEvent

/** A pad file id from a pad push: project 1..99, group 0..3 (A..D) and the pad's number in the project file (pNN). */
data class PadFid(val project: Int, val group: Int, val pad: Int)

/**
 * Where a physical pad's sound is set (an addition): the active [project]'s
 * pad file for [group] and [pad] (its number in the project file, pNN), and
 * the [slot] its pad record holds now (null when empty or not in the records).
 */
data class PadTarget(val project: Int, val group: Int, val pad: Int, val slot: Int?)

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
    /** Every note held or fading, pads or not, for the KEYS view (the device's KEYS mode sends any note). */
    val notes: Map<Int, PadLight> = emptyMap(),
    /** The latest note played, any note. */
    val lastNote: Int? = null,
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
    private val notes = LinkedHashMap<Int, PadLight>()
    private var lastNote: Int? = null
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

    /** Drops every learned pad number; names come back as pads are pressed again. */
    @Synchronized
    fun forgetLearned() {
        if (learned.isEmpty()) return
        learned.clear()
        renameLastHit()
        onLearned(LinkedHashMap(learned))
    }

    @Synchronized
    fun setPadOrder(order: PadOrder) {
        padOrder = order
        renameLastHit()
    }

    // The latest note-on and pad push per group not yet paired, with their times.
    private val pendingNote = HashMap<Int, Pair<PhysicalPad, Long>>()
    private val pendingPush = HashMap<Int, Pair<PadFid, Long>>()
    // Groups where two different pads (or pushes) came close together: their pairing is unsure.
    private val ambiguous = HashSet<Int>()
    // The project the latest push named; until its pads are read, hits get no name.
    private var pushedProject: Int? = null

    @Synchronized
    fun setProject(project: Int?, groups: List<PadGroup>) {
        activeProject = project
        layout = groups.associate { it.name to it.pads }
        renameLastHit()
    }

    /** Names the last hit again from the current layout and links. */
    private fun renameLastHit() {
        val h = lastHit ?: return
        val p = h.pad ?: return
        val slot = slotOf(p)
        lastHit = h.copy(slot = slot, name = slot?.let { names[it] })
    }

    @Synchronized
    fun setNames(slotNames: Map<Int, String>) {
        names = slotNames
    }

    /** What was read from the device (project, pads, names), to show again while it is away. */
    @Synchronized
    fun saved(savedAt: Long): LiveSnapshot = LiveSnapshot(
        savedAt = savedAt,
        activeProject = activeProject,
        groups = layout.entries.sortedWith(compareBy(ProjectPads.groupOrder) { it.key }).map { PadGroup(it.key, it.value) },
        names = names,
    )

    /** Loads a saved read: the device's last project, pads and names. */
    @Synchronized
    fun load(s: LiveSnapshot) {
        names = s.names
        setProject(s.activeProject, s.groups)
    }

    @Synchronized
    fun onMidi(e: MidiEvent) {
        when (e) {
            is MidiEvent.NoteOn -> {
                notes[e.note] = PadLight(e.velocity, e.channel, e.time)
                lastNote = e.note
                val pad = PadNotes.pad(e.note)
                if (pad == null) {
                    keysHeld[e.note] = e.channel
                    lastKeysNote = e.note
                    lastHit = Hit(null, e.note, e.channel, e.velocity, null, null)
                } else {
                    pads[pad] = PadLight(e.velocity, e.channel, e.time)
                    // Two different pads of one group close together: which one the push
                    // belongs to can't be told, so this group's pairing is dropped.
                    val prev = pendingNote[pad.group]
                    if (prev != null && prev.first != pad && e.time - prev.second <= MATCH_WINDOW_NS) ambiguous.add(pad.group)
                    pendingNote[pad.group] = pad to e.time
                    tryLink(pad.group)
                    val slot = slotOf(pad)
                    lastHit = Hit(pad, e.note, e.channel, e.velocity, slot, slot?.let { names[it] })
                }
            }
            is MidiEvent.NoteOff -> {
                notes[e.note]?.let { if (it.offAt == null) notes[e.note] = it.copy(offAt = e.time) }
                val pad = PadNotes.pad(e.note)
                if (pad == null) {
                    keysHeld.remove(e.note)
                } else {
                    pads[pad]?.let { if (it.offAt == null) pads[pad] = it.copy(offAt = e.time) }
                }
            }
            is MidiEvent.Clock -> {
                // After a gap (a pause, or Continue without Start) the old clocks would drag the tempo down.
                val prev = clocks.lastOrNull()
                if (prev != null && e.time - prev > CLOCK_TIMEOUT_NS) clocks.clear()
                clocks.addLast(e.time)
                while (clocks.size > CLOCK_WINDOW) clocks.removeFirst()
            }
            is MidiEvent.Start -> {
                playing = true
                clocks.clear()
            }
            is MidiEvent.Continue -> {
                playing = true
                clocks.clear()
            }
            is MidiEvent.Stop -> {
                playing = false
                // A note-off lost at stop would leave a pad lit forever: release what is held.
                for ((p, l) in pads.entries.toList()) if (l.offAt == null) pads[p] = l.copy(offAt = e.time)
                for ((n, l) in notes.entries.toList()) if (l.offAt == null) notes[n] = l.copy(offAt = e.time)
                keysHeld.clear()
            }
            is MidiEvent.ControlChange -> Unit
        }
    }

    /** A pad push: the device's "active" pad changed, which community notes tie to a physical press. */
    @Synchronized
    fun onPadPush(fid: PadFid, time: Long) {
        pushesSeen = true
        pushedProject = fid.project
        val prev = pendingPush[fid.group]
        if (prev != null && prev.first != fid && time - prev.second <= MATCH_WINDOW_NS) ambiguous.add(fid.group)
        pendingPush[fid.group] = fid to time
        tryLink(fid.group)
    }

    private fun tryLink(group: Int) {
        val (pad, noteAt) = pendingNote[group] ?: return
        val (fid, pushAt) = pendingPush[group] ?: return
        if (kotlin.math.abs(noteAt - pushAt) > MATCH_WINDOW_NS) return
        pendingNote.remove(group)
        pendingPush.remove(group)
        // An unsure pairing is not learned: a wrong link would name pads wrongly in every project.
        if (ambiguous.remove(group)) return
        // The keypad numbering is one to one: a pad number belongs to one key only.
        val dropped = learned.entries.removeAll { it.key != pad.offset && it.value == fid.pad }
        val changed = learned.put(pad.offset, fid.pad) != fid.pad
        if (dropped || changed) onLearned(LinkedHashMap(learned))
        // Name the hit that was just linked (again, if the link changed).
        if (lastHit?.pad == pad) renameLastHit()
    }

    /**
     * The slot on a physical pad in the active project. Counted from the top,
     * the pad's number is the learned pad file id term; counted from the
     * bottom, it is the official note order plus one (see [PadOrder]).
     */
    @Synchronized
    fun slotOf(pad: PhysicalPad): Int? {
        // The device moved to another project whose pads aren't read yet: no name rather than a wrong one.
        if (pushedProject != null && pushedProject != activeProject) return null
        val number = when (padOrder) {
            PadOrder.FROM_TOP -> learned[pad.offset] ?: return null
            PadOrder.FROM_BOTTOM -> pad.offset + 1
        }
        return layout[('a' + pad.group).toString()]?.get(number)
    }

    @Synchronized
    fun nameOf(pad: PhysicalPad): String? = slotOf(pad)?.let { names[it] }

    /**
     * A physical pad's number in the project file, to write its sound: the
     * learned number, else (counting from the top, before any press) the
     * numbering kmorrill's notes give, '7' = 1 down to ENTER = 12; counted
     * from the bottom, the official note order plus one (see [PadOrder]).
     */
    @Synchronized
    fun padNumber(pad: PhysicalPad): Int = when (padOrder) {
        PadOrder.FROM_TOP -> learned[pad.offset] ?: PadPush.topNumber(pad.offset)
        PadOrder.FROM_BOTTOM -> pad.offset + 1
    }

    /**
     * Where [pad]'s sound is set in the active project, and the slot on it
     * now (for the pad sheet's "now" line and for undo). Null while the
     * active project is unknown, or the device moved to one not read yet.
     */
    @Synchronized
    fun target(pad: PhysicalPad): PadTarget? {
        val project = activeProject ?: return null
        if (pushedProject != null && pushedProject != project) return null
        val number = padNumber(pad)
        return PadTarget(project, pad.group, number, layout[('a' + pad.group).toString()]?.get(number))
    }

    /**
     * arc put [slot] on [t]'s pad (or put the old one back): the layout
     * follows at once, so names and the saved read update without reading
     * the project again. Ignored if the active project changed meanwhile.
     */
    @Synchronized
    fun assigned(t: PadTarget, slot: Int?) {
        if (t.project != activeProject) return
        val group = ('a' + t.group).toString()
        layout = layout + (group to (layout[group].orEmpty() + (t.pad to slot)).toSortedMap())
        renameLastHit()
    }

    /** The state at [now]: released pads past their fade are dropped, and a stale tempo is cleared. */
    @Synchronized
    fun snapshot(now: Long): MirrorState {
        pads.entries.removeAll { (_, l) -> l.offAt != null && now - l.offAt > FADE_NS }
        notes.entries.removeAll { (_, l) -> l.offAt != null && now - l.offAt > FADE_NS }
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
            notes = LinkedHashMap(notes),
            lastNote = lastNote,
        )
    }
}
