package dev.arc.ep133.controller

import dev.arc.ep133.audio.ArpPlan
import dev.arc.ep133.audio.PadVoice
import dev.arc.ep133.features.ArpNote
import dev.arc.ep133.features.ArpSettings
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.TimingSettings
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.screens.PressureSense
import kotlin.math.roundToInt

// ---------- ARP: the arpeggiator and note repeat (an addition to the device's TIMING + pads) ----------

/** How often a held note's pressure may hand the sequencer a new plan, at most. */
internal const val ARP_PRESSURE_MS = 20L

/**
 * The arp as Live shows it (an addition): switched [on] (ARP in KEYS, RPT
 * in PADS), [latch]ed, the notes it plays ([held], in the order pressed,
 * latched ones too), whether they are KEYS notes (the arp) or pad hits
 * (note repeat: [keys] false), whether it plays now ([sounding]: on, with
 * notes), its [settings] and TIMING's ([timing]), and the display line's
 * text while it plays ([line]: "ARP · 1/16 · DO FA LA"; null otherwise).
 */
data class ArpUi(
    val on: Boolean = false,
    val latch: Boolean = false,
    val held: List<ArpNote> = emptyList(),
    val keys: Boolean = true,
    val sounding: Boolean = false,
    val settings: ArpSettings = ArpSettings.DEFAULT,
    val timing: TimingSettings = TimingSettings(),
    val line: String? = null,
)

/** Whether [a] and [b] are the same note: the same pad, and the same pitch on it (or both pad hits). */
internal fun sameArpNote(a: ArpNote, b: ArpNote): Boolean = a.pad == b.pad && a.semitones == b.semitones

/** A pressure's place in its range (0..1) as a velocity: 1 + 126 × it, so the lightest is 1 and the hardest 127. */
internal fun pressureVelocity(level: Float): Int = 1 + (126 * level.coerceIn(0f, 1f)).roundToInt()

/**
 * The notes the arp plays, as the controller keeps them (an addition): the
 * fingers down (by their voice's key, "note:<midi>" or "live:<group>:<offset>")
 * and the notes they hold ([notes], in the order pressed). A finger up lets
 * its note go, unless latched: then the notes stay until a press after
 * every finger is up, which starts a set of its own (the classic latch). A
 * KEYS note and a pad hit don't arp together: one of the other kind starts
 * a set of its own too. A set's first press starts the run ([pressNanos]),
 * the sequencer's first step on it. A held note's pressure, on a phone
 * that tells pressure, is its velocity. Main thread only.
 */
internal class ArpDesk {
    /** The notes the arp plays, in the order pressed (latched ones too). */
    var notes: List<ArpNote> = emptyList()
        private set

    /** The notes are KEYS notes (the arp), not pad hits (note repeat). */
    var keys = true
        private set

    /** When the press that started the run came (System.nanoTime). */
    var pressNanos = 0L
        private set

    // The fingers down, by voice key: the note each holds.
    private val down = LinkedHashMap<String, ArpNote>()
    private val sense = PressureSense()

    /** The RANDOM order's seed: the run's own, from its press. */
    val seed: Int get() = (pressNanos xor (pressNanos ushr 32)).toInt()

    /** Whether any finger is down. */
    val anyDown: Boolean get() = down.isNotEmpty()

    /**
     * A finger down on voice [key] at [at], holding [note] ([keys]: a KEYS
     * note), [latch] on or off. True when it starts a run of its own (its
     * first step on this press).
     */
    fun press(key: String, note: ArpNote, keys: Boolean, at: Long, latch: Boolean): Boolean {
        val fresh = notes.isEmpty() || keys != this.keys || latch && down.isEmpty()
        if (fresh) {
            notes = listOf(note)
            this.keys = keys
            pressNanos = at
        } else if (notes.none { sameArpNote(it, note) }) {
            notes = notes + note
        }
        down[key] = note
        return fresh
    }

    /** The finger on voice [key] up: its note goes (unless [latch], or another finger holds it). True when the notes changed. */
    fun release(key: String, latch: Boolean): Boolean {
        val n = down.remove(key) ?: return false
        if (latch || down.values.any { sameArpNote(it, n) }) return false
        return drop(n)
    }

    /** The press on voice [key] was a scroll after all: its note goes, latched or not. True when the notes changed. */
    fun cut(key: String): Boolean {
        val n = down.remove(key) ?: return false
        if (down.values.any { sameArpNote(it, n) }) return false
        return drop(n)
    }

    /** LATCH off: the notes no finger holds go. True when the notes changed. */
    fun unlatch(): Boolean {
        val kept = notes.filter { n -> down.values.any { sameArpNote(it, n) } }
        if (kept.size == notes.size) return false
        notes = kept
        return true
    }

    /** Every note goes, and every finger is forgotten. True when there were notes. */
    fun clear(): Boolean {
        down.clear()
        if (notes.isEmpty()) return false
        notes = emptyList()
        return true
    }

    /**
     * The finger on voice [key] presses at [pressure] (the touch's own): its
     * note's velocity follows, once the phone has shown it tells pressure
     * ([PressureSense]); till then it stays as pressed (127). True when the
     * velocity changed.
     */
    fun pressure(key: String, pressure: Float): Boolean {
        val level = sense.level(pressure)
        val n = down[key] ?: return false
        level ?: return false
        val v = pressureVelocity(level)
        if (v == n.velocity) return false
        val m = n.copy(velocity = v)
        for (k in down.keys) if (sameArpNote(down.getValue(k), m)) down[k] = m
        notes = notes.map { if (sameArpNote(it, m)) m else it }
        return true
    }

    /** What the sequencer plays: the notes on [voices], at [timing], [settings] and [bpm]; null with no notes. */
    fun plan(voices: Map<PhysicalPad, PadVoice>, timing: TimingSettings, settings: ArpSettings, bpm: Double): ArpPlan? =
        notes.takeIf { it.isNotEmpty() }?.let { ArpPlan(it, voices, keys, timing, settings, bpm, seed, pressNanos) }

    /** What Live shows: [on] and the settings, the notes, and the display line (notes named by [names]) while it plays. */
    fun ui(on: Boolean, settings: ArpSettings, timing: TimingSettings, names: NoteNames): ArpUi {
        val sounding = on && notes.isNotEmpty()
        return ArpUi(
            on = on,
            latch = settings.latch,
            held = notes,
            keys = keys,
            sounding = sounding,
            settings = settings,
            timing = timing,
            line = if (sounding) MirrorText.arpLine(!keys, settings.latch, timing.interval, notes, names) else null,
        )
    }

    // [n] out of the notes; true when it was in them.
    private fun drop(n: ArpNote): Boolean {
        val kept = notes.filterNot { sameArpNote(it, n) }
        if (kept.size == notes.size) return false
        notes = kept
        return true
    }
}
