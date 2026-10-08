package dev.arc.ep133.features

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

/**
 * Recording into a project's patterns, as RECORD does on the device: every
 * edit is pure, taking the patterns and giving the new ones, and keeps the
 * undo checkpoints (SHIFT + B on the device).
 *
 * Ticks are global: counted from the transport's tick 0 (PLAY starts at bar
 * 1), negative during the count-in. A group's pattern takes them mod its
 * length, except while it is [Pattern.open]: then its tick is the global
 * one, and it grows instead of looping ([grow]).
 *
 * Undo: a checkpoint is the whole of a project's patterns, pushed on the
 * first change after a punch-in or a pass of a group being recorded into
 * ([passed]), and before each erase, clear, length change or double; at
 * most [maxUndo] are kept.
 */
class PatternRecorder(private val maxUndo: Int = 32) {
    /** A note recorded: the [patterns] with it and its [id] (0: nothing recorded), and the pass the scheduler skips, if any. */
    data class Recorded(val patterns: ProjectPatterns, val id: Int, val skipPass: Long?)

    private val checkpoints = ArrayDeque<ProjectPatterns>()
    // The next change pushes a checkpoint.
    private var pending = false
    private var nextId = 0
    // A held note's global start, for its gate.
    private val held = HashMap<Int, Long>()
    // An open group's length before it was opened, for a recording with no notes in it.
    private val openedFrom = IntArray(4) { Seq.DEFAULT_BARS }
    // The pass each group was last seen in, so one pass marks once.
    private val lastPass = LongArray(4) { Long.MIN_VALUE }
    // The erase going on while playing, so one held pad is one checkpoint.
    private var lastErase: EraseRun? = null

    val canUndo: Boolean get() = checkpoints.isNotEmpty()

    /**
     * Recording starts. Groups still empty open for AUTO length, but only
     * from stop ([fromStop]) with [autoLength] on: they start at a bar and
     * grow as it goes on.
     */
    fun punchIn(p: ProjectPatterns, fromStop: Boolean, autoLength: Boolean): ProjectPatterns {
        pending = true
        lastErase = null
        lastPass.fill(Long.MIN_VALUE)
        if (!fromStop || !autoLength) return p
        var out = p
        for (g in 0 until 4) {
            val pat = p.group(g)
            if (!pat.isEmpty || pat.open) continue
            openedFrom[g] = pat.bars
            out = out.with(g, Pattern(Seq.DEFAULT_BARS, pat.notes, open = true))
        }
        return out
    }

    /**
     * Recording stops at [tickNow]. An open group with notes closes at the
     * bars gone by, rounded up to 1, 2, 4 or 8; one with none goes back to
     * the length it had.
     */
    fun punchOut(p: ProjectPatterns, tickNow: Double): ProjectPatterns {
        lastErase = null
        held.clear()
        var out = p
        for (g in 0 until 4) {
            val pat = p.group(g)
            if (!pat.open) continue
            out = if (pat.isEmpty) {
                out.with(g, Pattern(openedFrom[g], pat.notes))
            } else {
                val elapsed = maxOf(ceil(tickNow / Seq.TICKS_PER_BAR).toInt(), pat.notes.maxOf { it.tick } / Seq.TICKS_PER_BAR + 1)
                out.with(g, Pattern(autoBars(elapsed), pat.notes))
            }
        }
        return out
    }

    /**
     * A pad (or a KEYS note on it, [semitones]) pressed at global [tick];
     * the phone played it at [heardTick]. On [timing]'s grid, a press up to
     * half a step before tick 0 records at 0 and earlier ones nothing. A
     * note on the same pad and pitch at that tick (with OFF, within 6 ticks)
     * is replaced. When the grid put the note after [heardTick], the pass
     * it lands in is to be skipped ([Recorded.skipPass]): it was heard.
     */
    fun noteOn(p: ProjectPatterns, pad: PhysicalPad, semitones: Int?, tick: Double, heardTick: Double, timing: Timing): Recorded {
        lastErase = null
        val q = timing.quantize(tick)
        if (q < 0) return Recorded(p, 0, null)
        val grown = grow(p, q.toDouble())
        val pat = grown.group(pad.group)
        val len = pat.lengthTicks
        val local = if (pat.open) q.toInt() else Math.floorMod(q, len.toLong()).toInt()
        val near = if (timing == Timing.OFF) OVERDUB_TICKS else 0
        // A note left past the end (the length made shorter) isn't played, so nothing played replaces it.
        val kept = pat.notes.filterNot {
            it.offset == pad.offset && it.semitones == semitones && (pat.open || it.tick < len) && distance(it.tick, local, len, pat.open) <= near
        }
        if (kept.size >= Seq.MAX_NOTES) return Recorded(p, 0, null)
        val id = ++nextId
        val gate = if (timing == Timing.OFF) Timing.SIXTEENTH.ticks else timing.ticks
        val out = grown.with(pad.group, pat.copy(notes = kept + PatternNote(local, pad.offset, gate, semitones, id = id)))
        checkpoint(p)
        held[id] = q
        return Recorded(out, id, if (q > heardTick) passOf(q, len) else null)
    }

    /** Note [id] let go of at global [tick]: its gate runs from its start on the grid to here, 1 tick to the pattern's length. */
    fun noteOff(p: ProjectPatterns, id: Int, tick: Double): ProjectPatterns {
        if (id == 0) return p
        val start = held.remove(id)
        for (g in 0 until 4) {
            val pat = p.group(g)
            val i = pat.notes.indexOfFirst { it.id == id }
            if (i < 0) continue
            val n = pat.notes[i]
            val len = pat.lengthTicks
            // From the global start while it is known; else (an undo in between) from where it sits, wrapping.
            val delta = if (start != null) tick - start else floorMod(tick - n.tick, len.toDouble())
            val gate = floor(delta + 0.5).toLong().coerceIn(1, len.toLong()).toInt()
            return p.with(g, pat.copy(notes = pat.notes.toMutableList().also { it[i] = n.copy(gate = gate) }))
        }
        return p
    }

    /** [group], being recorded into, starts its [pass]: the next change in it pushes a checkpoint. */
    fun passed(group: Int, pass: Long) {
        if (lastPass[group] == pass) return
        lastPass[group] = pass
        pending = true
    }

    /** ERASE + pad: every note on [pad], or only its KEYS note [semitones]. */
    fun erasePad(p: ProjectPatterns, pad: PhysicalPad, semitones: Int? = null): ProjectPatterns {
        lastErase = null
        val pat = p.group(pad.group)
        return edit(p, p.with(pad.group, pat.copy(notes = pat.notes.filterNot { on(it, pad, semitones) })))
    }

    /**
     * ERASE held on [pad] while playing: its notes from global [fromTick] to
     * [toTick], wrapping round the pattern. Ranges that follow on from the
     * last one on the same pad are the same gesture: one checkpoint.
     */
    fun eraseRange(p: ProjectPatterns, pad: PhysicalPad, semitones: Int?, fromTick: Double, toTick: Double): ProjectPatterns {
        val last = lastErase
        val goingOn = last != null && last.pad == pad && last.semitones == semitones && last.end == fromTick
        val run = EraseRun(pad, semitones, toTick, goingOn && last?.pushed == true)
        lastErase = run
        if (toTick <= fromTick) return p
        val pat = p.group(pad.group)
        val len = pat.lengthTicks.toDouble()
        val whole = !pat.open && toTick - fromTick >= len
        val from = if (pat.open) fromTick else floorMod(fromTick, len)
        val to = if (pat.open) toTick else floorMod(toTick, len)
        // Notes left past the end aren't played, so the playhead never passes them.
        val inRange = { t: Int -> (pat.open || t < len) && (whole || if (from <= to) t >= from && t < to else t >= from || t < to) }
        val out = p.with(pad.group, pat.copy(notes = pat.notes.filterNot { on(it, pad, semitones) && inRange(it.tick) }))
        if (out == p || run.pushed) return out
        run.pushed = true
        return edit(p, out)
    }

    /** ERASE + group: [group]'s notes, or every group's (null); the lengths stay. */
    fun clear(p: ProjectPatterns, group: Int?): ProjectPatterns {
        lastErase = null
        var out = p
        for (g in 0 until 4) if (group == null || g == group) out = out.with(g, out.group(g).copy(notes = emptyList()))
        return edit(p, out)
    }

    /** [group]'s length, 1 to 99 bars; notes past the end are kept but not played. It closes an open group. */
    fun setLength(p: ProjectPatterns, group: Int, bars: Int): ProjectPatterns {
        lastErase = null
        val pat = p.group(group)
        return edit(p, p.with(group, pat.copy(bars = bars.coerceIn(1, Seq.MAX_BARS), open = false)))
    }

    /**
     * SHIFT + +: [group] twice as long (up to 99 bars) with its notes copied
     * into the new part, over anything left past the old end.
     */
    fun double(p: ProjectPatterns, group: Int): ProjectPatterns {
        lastErase = null
        val pat = p.group(group)
        if (pat.bars >= Seq.MAX_BARS) return p
        val len = pat.lengthTicks
        val bars = minOf(pat.bars * 2, Seq.MAX_BARS)
        val end = bars * Seq.TICKS_PER_BAR
        val notes = pat.notes.filterNot { it.tick in len until end }.toMutableList()
        for (n in pat.playable()) {
            if (notes.size >= Seq.MAX_NOTES) break
            if (n.tick + len < end) notes += n.copy(tick = n.tick + len, id = 0)
        }
        return edit(p, p.with(group, Pattern(bars, notes)))
    }

    /** Open groups grow to take in [tickNow]: 1, 2, 4 or 8 bars; past 8 they close and loop. */
    fun grow(p: ProjectPatterns, tickNow: Double): ProjectPatterns {
        if (tickNow < 0) return p
        var out = p
        val need = floor(tickNow / Seq.TICKS_PER_BAR).toInt() + 1
        for (g in 0 until 4) {
            val pat = p.group(g)
            if (!pat.open) continue
            val bars = maxOf(pat.bars, autoBars(need))
            val open = need <= Seq.MAX_AUTO_BARS
            if (bars != pat.bars || open != pat.open) out = out.with(g, pat.copy(bars = bars, open = open))
        }
        return out
    }

    /** The patterns before the last checkpoint, or null with none left. */
    fun undo(p: ProjectPatterns): ProjectPatterns? {
        lastErase = null
        while (checkpoints.isNotEmpty()) {
            val c = checkpoints.removeAt(checkpoints.lastIndex)
            if (c != p) {
                pending = true
                return c
            }
        }
        return null
    }

    // A recording edit: [before] goes on the stack if a checkpoint is due.
    private fun checkpoint(before: ProjectPatterns) {
        if (!pending) return
        push(before)
        pending = false
    }

    // An erase, clear, length or double: its own checkpoint when it changed anything, and what is recorded next another.
    private fun edit(before: ProjectPatterns, after: ProjectPatterns): ProjectPatterns {
        if (after == before) return before
        push(before)
        pending = true
        return after
    }

    private fun push(before: ProjectPatterns) {
        // Open groups go back as they were before the punch-in: closed, at their old length.
        var c = before
        for (g in 0 until 4) {
            val pat = c.group(g)
            if (pat.open) c = c.with(g, Pattern(if (pat.isEmpty) openedFrom[g] else pat.bars, pat.notes))
        }
        checkpoints.addLast(c)
        while (checkpoints.size > maxUndo) checkpoints.removeAt(0)
    }

    // A pad held in ERASE while playing: where its last range ended, and whether it pushed its checkpoint.
    private class EraseRun(val pad: PhysicalPad, val semitones: Int?, val end: Double, var pushed: Boolean)

    private companion object {
        /** With TIMING OFF, a note this near one on the same pad and pitch replaces it. */
        const val OVERDUB_TICKS = 6

        fun on(n: PatternNote, pad: PhysicalPad, semitones: Int?) = n.offset == pad.offset && (semitones == null || n.semitones == semitones)

        /** 1, 2, 4 or 8 bars: the power of two at or over [bars], at most [Seq.MAX_AUTO_BARS]. */
        fun autoBars(bars: Int): Int {
            var n = 1
            while (n < bars && n < Seq.MAX_AUTO_BARS) n *= 2
            return n
        }

        /** Ticks between [a] and [b], round the loop unless [open]. */
        fun distance(a: Int, b: Int, len: Int, open: Boolean): Int {
            val d = abs(a - b)
            return if (open) d else minOf(d, len - d)
        }

        fun floorMod(x: Double, m: Double) = x - floor(x / m) * m
    }
}
