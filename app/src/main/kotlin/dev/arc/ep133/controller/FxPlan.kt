package dev.arc.ep133.controller

import dev.arc.ep133.features.Comp
import dev.arc.ep133.features.FxBook
import dev.arc.ep133.features.FxSettings
import dev.arc.ep133.features.FxType
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.Sidechain
import dev.arc.ep133.formats.fx.FxControl
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// ---------- FX: the master effect, sends, compressor, sidechain and punch-ins (an addition) ----------

/** Where the FX bus's commands go: [FxControl] command `what` with its index and knobs (Live's output). */
internal typealias FxSend = (what: Int, index: Int, x: Float, y: Float) -> Unit

/** A group's send when an effect goes on with no group sending to it ([FxDesk.setType]). */
internal const val FIRST_SEND = 0.5f

/** A punch-in's lightest depth: a press always punches in, however light it is (0 would let go). */
internal const val PUNCH_MIN_DEPTH = 0.01f

/** The pads' labels in punch-in slot order, [FxControl.PITCH_RANDOM] ('.') to [FxControl.DECIMATOR] ('9'). */
private val PUNCH_PADS = listOf(".", "0", "ENTER", "1", "2", "3", "4", "5", "6", "7", "8", "9")

/**
 * The punch-in slot the pad at [offset] (0..11, its place in the group)
 * plays while FX is held, by the label printed on it: 7 TREMOLO, 8 OCTAVE
 * DOWN, 9 DECIMATOR / 4 LPF, 5 HPF, 6 SEND FX / 1 BEAT REPEAT, 2 TAPE STOP,
 * 3 FILTER LFO / '.' PITCH RANDOM, 0 SLICE, ENTER STUTTER. -1 for no pad.
 */
internal fun punchSlotForPad(offset: Int): Int = PadNotes.LABELS.getOrNull(offset)?.let(PUNCH_PADS::indexOf) ?: -1

/** A punch-in's depth as the mixer takes it: held to [PUNCH_MIN_DEPTH]..1 (NaN is the lightest). */
internal fun punchDepth(depth: Float): Float = if (depth > PUNCH_MIN_DEPTH) minOf(depth, 1f) else PUNCH_MIN_DEPTH

/** The sidechain's command index: the groups it ducks while on, 0 (off) otherwise. */
internal fun sidechainIndex(s: Sidechain): Int = if (s.on) s.dests else 0

/** Whether [pad]'s voices duck the sidechain's groups: it is on and [pad] is its source. */
internal fun duckSource(fx: FxSettings, pad: PhysicalPad): Boolean =
    fx.sidechain.on && pad.group == fx.sidechain.group && pad.offset == fx.sidechain.pad

/**
 * [s] whole, as the FX bus's commands to [send]: the effect with its knobs,
 * each group's send, the compressor and the sidechain. The tempo isn't a
 * setting of the project: the controller sends TEMPO's as it changes.
 */
internal fun sendFx(s: FxSettings, send: FxSend) {
    send(FxControl.FX_TYPE, s.type.ordinal, s.x, s.y)
    for (g in 0 until FxSettings.GROUPS) send(FxControl.SEND, g, s.sends[g], 0f)
    send(FxControl.COMP, if (s.comp.on) 1 else 0, s.comp.x, s.comp.y)
    send(FxControl.SIDECHAIN, sidechainIndex(s.sidechain), s.sidechain.x, s.sidechain.y)
}

/**
 * FX as the controller keeps it (an addition): every project's
 * [FxSettings] (fx.json's, read once with [load]), the one Live shows
 * ([fx], [project]'s) and the punch-ins held ([punches], in the order
 * pressed). Each change goes to the FX bus at once ([send]: Live's output,
 * which keeps the last of each setting for an output opened later), and an
 * edit is told to [edited], so the controller keeps it once the knobs rest.
 * Another project, or the file read, sends its settings whole. Main thread
 * only.
 */
internal class FxDesk(private val send: FxSend, private val edited: () -> Unit = {}) {
    // Every project's settings but the one shown, which is [fx]'s.
    private var book: Map<Int, FxSettings> = emptyMap()
    // The projects edited before the file was read: newer than the file.
    private val touched = HashSet<Int>()

    /** The project Live shows (0: none known yet). */
    var project = 0
        private set

    /** Whether fx.json has been read (or found missing); [json] is written only then. */
    var loaded = false
        private set

    private val _fx = MutableStateFlow(FxSettings.DEFAULT)
    /** The settings of [project]. */
    val fx: StateFlow<FxSettings> = _fx.asStateFlow()

    private val _punches = MutableStateFlow<Set<Int>>(emptySet())
    /** The punch-in slots held, in the order pressed ([FxControl.PITCH_RANDOM] to [FxControl.DECIMATOR]). */
    val punches: StateFlow<Set<Int>> = _punches.asStateFlow()

    /**
     * fx.json read ([read]; null when there is none or it can't be read):
     * the projects edited before it keep their edits, and the one shown is
     * sent whole. True when the file is to be written again for those edits.
     */
    fun load(read: Map<Int, FxSettings>?): Boolean {
        if (loaded) return false
        loaded = true
        book = read.orEmpty() + book
        show(if (project in touched) _fx.value else book[project] ?: FxSettings.DEFAULT)
        return touched.isNotEmpty()
    }

    /** Live shows project [p]: its settings come in and are sent whole. */
    fun switchTo(p: Int) {
        if (p == project) return
        book = kept()
        project = p
        show(book[p] ?: FxSettings.DEFAULT)
    }

    /** Every project's settings as fx.json keeps them: those at the defaults left out. */
    fun kept(): Map<Int, FxSettings> {
        val s = _fx.value
        return if (s == FxSettings.DEFAULT) book - project else book + (project to s)
    }

    /** fx.json's text; null when every project is at the defaults (no file). */
    fun json(): String? = kept().takeIf { it.isNotEmpty() }?.let(FxBook::toJson)

    /**
     * The effect: [t], or none when [t] is the one on already (its key tapped
     * again). Its knobs stay. An effect put on while no group sends to it
     * (every send at 0, as a new project has them) would be silent: group
     * [group] (the pad played last's, when known) then sends [FIRST_SEND], so
     * the effect is heard at once.
     */
    fun setType(t: FxType, group: Int? = null) {
        val s = _fx.value.let { it.withType(if (it.type == t) FxType.NONE else t) }
        if (edit(s)) send(FxControl.FX_TYPE, s.type.ordinal, s.x, s.y)
        if (s.type != FxType.NONE && group != null && s.sends.all { it == 0f }) setSend(group, FIRST_SEND)
    }

    /** The effect's knobs (0..1). */
    fun setXY(x: Float, y: Float) {
        val s = _fx.value.withXY(x, y)
        if (edit(s)) send(FxControl.FX_XY, 0, s.x, s.y)
    }

    /** Group [group]'s (0..3) send to the effect (0..1). */
    fun setSend(group: Int, v: Float) {
        if (group !in 0 until FxSettings.GROUPS) return
        val s = _fx.value.withSend(group, v)
        if (edit(s)) send(FxControl.SEND, group, s.sends[group], 0f)
    }

    /** The master compressor: [on], its drive [x] and speed [y] (0..1); what is left out stays. */
    fun setComp(on: Boolean = _fx.value.comp.on, x: Float = _fx.value.comp.x, y: Float = _fx.value.comp.y) {
        val s = _fx.value.withComp(Comp(on, x, y)).clamped()
        if (edit(s)) send(FxControl.COMP, if (s.comp.on) 1 else 0, s.comp.x, s.comp.y)
    }

    /** The sidechain on or off. */
    fun setSidechainOn(on: Boolean) = sidechain(_fx.value.sidechain.copy(on = on))

    /** The sidechain's source: pad [pad] (0..11) of group [group] (0..3). */
    fun setSidechainSource(group: Int, pad: Int) = sidechain(_fx.value.sidechain.copy(group = group, pad = pad))

    /** Group [group] (0..3) ducked by the sidechain, or no longer. */
    fun toggleSidechainDest(group: Int) {
        if (group !in 0 until FxSettings.GROUPS) return
        sidechain(_fx.value.sidechain.let { it.copy(dests = it.dests xor (1 shl group)) })
    }

    /** The duck's length [x] and shape [y] (0..1). */
    fun setSidechainXY(x: Float, y: Float) = sidechain(_fx.value.sidechain.copy(x = x, y = y))

    private fun sidechain(c: Sidechain) {
        val s = _fx.value.withSidechain(c).clamped()
        // The source isn't the bus's to know (the voices' shapes carry it): only what it hears is sent.
        if (edit(s)) send(FxControl.SIDECHAIN, sidechainIndex(s.sidechain), s.sidechain.x, s.sidechain.y)
    }

    /** Punch-in [slot] (0..11) pressed, at [depth] (held to (0, 1]). */
    fun punchDown(slot: Int, depth: Float) {
        if (slot !in 0 until FxControl.SLOTS) return
        send(FxControl.PUNCH, slot, punchDepth(depth), 0f)
        _punches.value += slot
    }

    /** A punch-in held goes deeper or lighter. */
    fun punchMove(slot: Int, depth: Float) {
        if (slot in _punches.value) send(FxControl.PUNCH, slot, punchDepth(depth), 0f)
    }

    /** A punch-in let go of. */
    fun punchUp(slot: Int) {
        if (slot !in _punches.value) return
        send(FxControl.PUNCH, slot, 0f, 0f)
        _punches.value -= slot
    }

    /** Every punch-in let go of (FX let go of, or Live closing). */
    fun punchAllUp() {
        for (slot in _punches.value) send(FxControl.PUNCH, slot, 0f, 0f)
        _punches.value = emptySet()
    }

    /** [s] shown and sent whole. */
    private fun show(s: FxSettings) {
        _fx.value = s
        sendFx(s, send)
    }

    /** [s] is the project's now, unless nothing changed (false); kept once the file has been read. */
    private fun edit(s: FxSettings): Boolean {
        if (s == _fx.value) return false
        _fx.value = s
        if (!loaded) touched += project
        edited()
        return true
    }
}
