package dev.arc.ep133.controller

import dev.arc.ep133.audio.PadVoice
import dev.arc.ep133.audio.PcmSound
import dev.arc.ep133.features.PatternRecorder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectPatterns
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TransportPhase
import dev.arc.ep133.features.TransportState
import dev.arc.ep133.formats.VoiceShape
import kotlin.math.floor

// ---------- PATTERN: record and play on the phone (an addition) ----------

/**
 * PATTERN as Live's line and its sheet show it (an addition): the
 * transport's [phase], whether pads played go into the pattern
 * ([recording]), the count-in's beat as it is heard ([countIn], 1..4; null
 * outside it, or before its first beat), the settings ([timing],
 * [countInOn], [autoLength]), each group's length and whether it has notes
 * ([bars], [hasNotes], A..D), the pads with notes ([notePads], ERASE's
 * dots), the group last played into ([focusGroup], whose position the line
 * counts), ERASE ([erase]), whether UNDO has something ([canUndo]), how
 * many pads the patterns play have sounds not on the phone yet ([missing])
 * and the project they are [project]'s (0: none known).
 */
data class PatternUiState(
    val phase: TransportPhase = TransportPhase.STOPPED,
    val recording: Boolean = false,
    val countIn: Int? = null,
    val timing: Timing = Timing.DEFAULT,
    val countInOn: Boolean = true,
    val autoLength: Boolean = false,
    val bars: List<Int> = List(4) { Seq.DEFAULT_BARS },
    val hasNotes: List<Boolean> = List(4) { false },
    val notePads: Set<PhysicalPad> = emptySet(),
    val focusGroup: Int = 0,
    val erase: Boolean = false,
    val canUndo: Boolean = false,
    val missing: Int = 0,
    val project: Int = 0,
) {
    /** Counting in or playing: the sequencer runs. */
    val running: Boolean get() = phase == TransportPhase.COUNT_IN || phase == TransportPhase.PLAYING

    /** Any group has notes (ERASE and PTN are offered). */
    val anyNotes: Boolean get() = hasNotes.any { it }
}

/** [ui] showing [p] (lengths, notes, pads with notes) and the transport as [state] has it. */
internal fun patternShown(ui: PatternUiState, p: ProjectPatterns, state: TransportState, canUndo: Boolean): PatternUiState = ui.copy(
    phase = state.phase,
    recording = state.recording,
    // Only while counting in; the loop sets it as each beat is heard.
    countIn = ui.countIn.takeIf { state.phase == TransportPhase.COUNT_IN },
    bars = p.groups.map { it.bars },
    hasNotes = p.groups.map { !it.isEmpty },
    // Every note, those past the end too: ERASE takes them all.
    notePads = p.groups.flatMapIndexed { g, pat -> pat.notes.map { PhysicalPad(g, it.offset) } }.toSet(),
    canUndo = canUndo,
)

/**
 * The sounds the patterns play: for each pad in [used] that [memory] has
 * (decoded, in arc's memory), its [PadVoice], shaped as a press ([shape]
 * with keys false) and as a KEYS note (true). Second, the pads with a sound
 * ([hasSound]) not in memory yet, to load: an empty pad plays nothing and
 * isn't missing.
 */
internal fun patternVoices(
    used: Set<PhysicalPad>,
    memory: (PhysicalPad) -> PcmSound?,
    shape: (PhysicalPad, Boolean) -> VoiceShape,
    hasSound: (PhysicalPad) -> Boolean = { true },
): Pair<Map<PhysicalPad, PadVoice>, Set<PhysicalPad>> {
    val voices = HashMap<PhysicalPad, PadVoice>()
    val missing = HashSet<PhysicalPad>()
    for (pad in used) {
        val a = memory(pad)
        if (a == null) {
            if (hasSound(pad)) missing += pad
            continue
        }
        voices[pad] = PadVoice(a.pcm, a.channels, a.sampleRate, shape(pad, false), shape(pad, true))
    }
    return voices to missing
}

/**
 * Whether [a] and [b] play the same: the same pads, each with the same
 * samples (the very arrays) and shapes. A plan made again with nothing
 * changed isn't handed to the sequencer, which would only tell its missing
 * pads again.
 */
internal fun sameVoices(a: Map<PhysicalPad, PadVoice>, b: Map<PhysicalPad, PadVoice>): Boolean {
    if (a.size != b.size) return false
    for ((pad, v) in a) {
        val w = b[pad] ?: return false
        if (v.pcm !== w.pcm || v.channels != w.channels || v.rate != w.rate || v.shape != w.shape || v.keysShape != w.keysShape) return false
    }
    return true
}

/**
 * The pattern's tempo: TEMPO's, which is the EP-133's while it sends its
 * clock ([device], to 0.1 BPM as the display has it), else the phone's
 * ([liveTempo]).
 */
internal fun patternBpm(device: Double?, liveTempo: Int): Double =
    device?.takeIf { it > 0 }?.let { floor(it * 10 + 0.5) / 10 } ?: Tempo.clamp(liveTempo).toDouble()

/**
 * The global tick heard at [nanos] in a run a pad's press started at
 * [pressAt] (tick 0 there, both System.nanoTime), at [bpm]: for the presses
 * before the sequencer's timeline is out. Fractional; below 0 before the press.
 */
internal fun pressTickAt(nanos: Long, pressAt: Long, bpm: Double): Double = (nanos - pressAt) * bpm * Seq.PPQN / 60e9

/** The count-in's beat heard at global [tick], 1..4 through the bar before tick 0; null before it and from tick 0. */
internal fun countInBeat(tick: Double): Int? {
    if (tick >= 0) return null
    val beat = floor(tick / Seq.PPQN).toInt() + Tempo.BEATS_PER_BAR + 1
    return beat.takeIf { it in 1..Tempo.BEATS_PER_BAR }
}

/** [ticks] of the pattern at [bpm] as frames at [rate] (an input's own), rounded half up as [dev.arc.ep133.features.barFrames]. */
internal fun ticksToFrames(ticks: Long, bpm: Double, rate: Int): Long = floor(ticks * 60.0 * rate / (bpm * Seq.PPQN) + 0.5).toLong()

/**
 * [p] with the notes [held] (by id, their pads or keys still down) ended at
 * global [tick], as recording stops there ([recorder]'s punch-out or stop):
 * each keeps the gate it had up to then, not a grid step.
 */
internal fun heldNotesEnded(p: ProjectPatterns, recorder: PatternRecorder, held: Collection<Int>, tick: Double): ProjectPatterns {
    var out = p
    for (id in held) out = recorder.noteOff(out, id, tick)
    return out
}

/** [p] without note [id] (a press that was a scroll or a swipe after all); [p] itself when no note has it. */
internal fun withoutNote(p: ProjectPatterns, id: Int): ProjectPatterns {
    if (id == 0) return p
    for (g in 0 until 4) {
        val pat = p.group(g)
        if (pat.notes.none { it.id == id }) continue
        return p.with(g, pat.copy(notes = pat.notes.filterNot { it.id == id }))
    }
    return p
}
