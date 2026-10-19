package dev.arc.ep133.features

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

/**
 * Recording into a project's patterns, as RECORD does on the device: every
 * edit is pure, taking the patterns playing and giving the new ones, and
 * keeps the undo checkpoints (SHIFT + B on the device).
 *
 * Ticks are global: counted from the transport's tick 0 (PLAY starts at bar
 * 1), negative during the count-in. A group's pattern takes them from its
 * anchor ([phase]: where it started, bar 1 of the pattern) mod its length
 * ([localTick]), except while it is [Pattern.open]: then its tick is the
 * global one less the anchor, and it grows instead of looping ([grow]).
 *
 * Undo: a checkpoint is the whole of the project's sequencer ([seq], with
 * the patterns as they were), pushed on the first change after a punch-in
 * or a pass of a group being recorded into ([passed]), before each erase,
 * clear, length change or double, and before each edit of the scenes or
 * the banks ([editSeq]); at most [maxUndo] are kept. A gesture (a pad held
 * in ERASE or to correct, a knob turned on a step, presses of − / + on one
 * pad) is one checkpoint. Picking a pattern or a scene is no checkpoint and
 * keeps them all: an undo after it goes back to the checkpoint whole, its
 * pick included.
 *
 * Step edits (place, velocity, length, nudge) are for a stopped transport,
 * whose patterns are never open; on an open pattern they, and the shifts
 * and corrects, give the patterns back as they were.
 */
class PatternRecorder(private val maxUndo: Int = 32) {
    /** A note recorded: the [patterns] with it and its [id] (0: nothing recorded), and the pass the scheduler skips, if any. */
    data class Recorded(val patterns: ProjectPatterns, val id: Int, val skipPass: Long?)

    /** Notes nudged: the [patterns] with them moved, and the [step] they sit on now (the old one if none moved). */
    data class Nudged(val patterns: ProjectPatterns, val step: Int)

    /** Notes corrected to the grid: the [patterns] and how many [moved] (dropped onto another note counts too). */
    data class Corrected(val patterns: ProjectPatterns, val moved: Int)

    private val checkpoints = ArrayDeque<ProjectSeq>()
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
    // The step edit or correct going on, by its kind and target ("vel:0:5"), so one knob turn or held pad is one checkpoint.
    private var lastRun: String? = null
    // Whether that run has pushed its checkpoint.
    private var runPushed = false

    /**
     * The project's sequencer as it stands, which the patterns handed to the
     * edits are the playing ones of; the caller sets it whenever the picks,
     * the banks or the scenes change. A checkpoint is this with the patterns
     * before the edit.
     */
    var seq: ProjectSeq = ProjectSeq.DEFAULT

    /**
     * Where each group's pattern started, which the global ticks handed to
     * the edits are counted from; the caller sets it as the transport starts
     * (all 0) and as a pick takes over a group.
     */
    var phase: PhaseAnchors = PhaseAnchors.ZERO
        set(value) {
            // A group whose pattern starts afresh counts its passes anew.
            for (g in 0 until 4) if (value.of(g) != field.of(g)) lastPass[g] = Long.MIN_VALUE
            field = value
        }

    val canUndo: Boolean get() = checkpoints.isNotEmpty()

    /**
     * Recording starts. Groups still empty open for AUTO length, but only
     * from stop ([fromStop]) with [autoLength] on: they start at a bar and
     * grow as it goes on.
     */
    fun punchIn(p: ProjectPatterns, fromStop: Boolean, autoLength: Boolean): ProjectPatterns {
        pending = true
        breakRuns()
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
        breakRuns()
        held.clear()
        var out = p
        for (g in 0 until 4) {
            val pat = p.group(g)
            if (!pat.open) continue
            out = if (pat.isEmpty) {
                out.with(g, Pattern(openedFrom[g], pat.notes))
            } else {
                val now = localTick(tickNow, phase.of(g), pat)
                val elapsed = maxOf(ceil(now / Seq.TICKS_PER_BAR).toInt(), pat.notes.maxOf { it.tick } / Seq.TICKS_PER_BAR + 1)
                out.with(g, Pattern(autoBars(elapsed), pat.notes))
            }
        }
        return out
    }

    /**
     * A pad (or a KEYS note on it, [semitones]) pressed at global [tick];
     * the phone played it at [heardTick], at [velocity] (1..127). On
     * [timing]'s grid (the pattern's own: from its anchor), swung by [swing],
     * a press up to half a step before the pattern's tick 0 records at 0 and
     * earlier ones nothing. A note on the same pad
     * and pitch at that tick (with OFF, within 6 ticks) is replaced. When the
     * grid put the note after [heardTick], the pass it lands in is to be
     * skipped ([Recorded.skipPass]): it was heard.
     */
    fun noteOn(
        p: ProjectPatterns,
        pad: PhysicalPad,
        semitones: Int?,
        tick: Double,
        heardTick: Double,
        timing: Timing,
        swing: Int = TimingSettings.SWING_MIN,
        velocity: Int = 127,
    ): Recorded {
        breakRuns()
        val anchor = phase.of(pad.group)
        // On the pattern's own time, from its anchor: its grid is the pattern's.
        val q = timing.quantize(sinceAnchor(tick, anchor), swing)
        if (q < 0) return Recorded(p, 0, null)
        val grown = grow(p, (q + anchor).toDouble())
        val pat = grown.group(pad.group)
        val len = pat.lengthTicks
        val local = localTick(q + anchor, anchor, pat).toInt()
        val near = if (timing == Timing.OFF) OVERDUB_TICKS else 0
        // A note left past the end (the length made shorter) isn't played, so nothing played replaces it.
        val kept = pat.notes.filterNot {
            it.offset == pad.offset && it.semitones == semitones && (pat.open || it.tick < len) && distance(it.tick, local, len, pat.open) <= near
        }
        if (kept.size >= Seq.MAX_NOTES) return Recorded(p, 0, null)
        val id = ++nextId
        val gate = if (timing == Timing.OFF) Timing.SIXTEENTH.ticks else timing.ticks
        val out = grown.with(pad.group, pat.copy(notes = kept + PatternNote(local, pad.offset, gate, semitones, velocity, id)))
        checkpoint(p)
        held[id] = q + anchor
        return Recorded(out, id, if (q + anchor > heardTick) passOf(q + anchor, len, anchor) else null)
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
            val delta = if (start != null) tick - start else floorMod(localTick(tick, phase.of(g), pat) - n.tick, len.toDouble())
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
        breakRuns()
        val pat = p.group(pad.group)
        return edit(p, p.with(pad.group, pat.copy(notes = pat.notes.filterNot { on(it, pad, semitones) })))
    }

    /**
     * ERASE held on [pad] while playing: its notes from global [fromTick] to
     * [toTick] (nothing before the pattern started), wrapping round the
     * pattern. Ranges that follow on from the
     * last one on the same pad are the same gesture: one checkpoint.
     */
    fun eraseRange(p: ProjectPatterns, pad: PhysicalPad, semitones: Int?, fromTick: Double, toTick: Double): ProjectPatterns {
        val last = lastErase
        val goingOn = last != null && last.pad == pad && last.semitones == semitones && last.end == fromTick
        val run = EraseRun(pad, semitones, toTick, goingOn && last?.pushed == true)
        lastErase = run
        lastRun = null
        val pat = p.group(pad.group)
        val anchor = phase.of(pad.group)
        // What passed before the pattern started was another's.
        val start = maxOf(fromTick, anchor.toDouble())
        if (toTick <= start) return p
        val len = pat.lengthTicks.toDouble()
        val whole = !pat.open && toTick - start >= len
        val from = localTick(start, anchor, pat)
        val to = localTick(toTick, anchor, pat)
        // Notes left past the end aren't played, so the playhead never passes them.
        val inRange = { t: Int -> (pat.open || t < len) && (whole || if (from <= to) t >= from && t < to else t >= from || t < to) }
        val out = p.with(pad.group, pat.copy(notes = pat.notes.filterNot { on(it, pad, semitones) && inRange(it.tick) }))
        // Nothing passed: the very patterns back, so a pad held over empty stretches changes nothing.
        if (out == p) return p
        if (run.pushed) return out
        run.pushed = true
        return edit(p, out)
    }

    /** ERASE + group: [group]'s notes, or every group's (null); the lengths stay. */
    fun clear(p: ProjectPatterns, group: Int?): ProjectPatterns {
        breakRuns()
        var out = p
        for (g in 0 until 4) if (group == null || g == group) out = out.with(g, out.group(g).copy(notes = emptyList()))
        return edit(p, out)
    }

    /** [group]'s length, 1 to 99 bars; notes past the end are kept but not played. It closes an open group. */
    fun setLength(p: ProjectPatterns, group: Int, bars: Int): ProjectPatterns {
        breakRuns()
        val pat = p.group(group)
        return edit(p, p.with(group, pat.copy(bars = bars.coerceIn(1, Seq.MAX_BARS), open = false)))
    }

    /**
     * SHIFT + +: [group] twice as long (up to 99 bars) with its notes copied
     * into the new part, over anything left past the old end.
     */
    fun double(p: ProjectPatterns, group: Int): ProjectPatterns {
        breakRuns()
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

    /** Open groups grow to take in global [tickNow] (from their anchors): 1, 2, 4 or 8 bars; past 8 they close and loop. */
    fun grow(p: ProjectPatterns, tickNow: Double): ProjectPatterns {
        var out = p
        for (g in 0 until 4) {
            val pat = p.group(g)
            if (!pat.open) continue
            val now = localTick(tickNow, phase.of(g), pat)
            if (now < 0) continue
            val need = floor(now / Seq.TICKS_PER_BAR).toInt() + 1
            val bars = maxOf(pat.bars, autoBars(need))
            val open = need <= Seq.MAX_AUTO_BARS
            if (bars != pat.bars || open != pat.open) out = out.with(g, pat.copy(bars = bars, open = open))
        }
        return out
    }

    /**
     * RECORD + pad on [step], stopped: [pad] (or its KEYS note [semitones])
     * placed there for one [interval], at [velocity] (1..127). A note of the
     * same pad and pitch on the step is replaced; the pattern full
     * ([Seq.MAX_NOTES]), nothing is placed.
     */
    fun stepPlace(
        p: ProjectPatterns,
        pad: PhysicalPad,
        semitones: Int?,
        step: Int,
        interval: Timing,
        swing: Int,
        velocity: Int = 127,
    ): ProjectPatterns {
        breakRuns()
        val pat = p.group(pad.group)
        if (pat.open) return p
        val onStep = onStep(pat, step, interval, swing)
        val kept = pat.notes.filterNot { it.offset == pad.offset && it.semitones == semitones && onStep(it) }
        if (kept.size >= Seq.MAX_NOTES) return p
        val note = PatternNote(Steps.tickOf(step, interval, swing), pad.offset, interval.ticks, semitones, velocity.coerceIn(1, 127))
        return edit(p, p.with(pad.group, pat.copy(notes = kept + note)))
    }

    /** SHIFT + KNOB X on [step], stopped: every note on it at [velocity] (1..127). One turn of the knob is one checkpoint. */
    fun stepVelocity(p: ProjectPatterns, group: Int, step: Int, interval: Timing, swing: Int, velocity: Int): ProjectPatterns {
        val v = velocity.coerceIn(1, 127)
        return stepNotes(p, "vel:$group:$step", group, step, interval, swing) { it.copy(velocity = v) }
    }

    /** SHIFT + KNOB Y on [step], stopped: every note on it [gate] ticks long (1 tick to a bar). One turn of the knob is one checkpoint. */
    fun stepGate(p: ProjectPatterns, group: Int, step: Int, interval: Timing, swing: Int, gate: Int): ProjectPatterns {
        val g = gate.coerceIn(1, Seq.TICKS_PER_BAR)
        return stepNotes(p, "gate:$group:$step", group, step, interval, swing) { it.copy(gate = g) }
    }

    /**
     * SHIFT + pad and − / + on [step], stopped: the notes of [pad] there
     * (every pitch, or only [semitones]) a step earlier or later ([dir] -1
     * or +1) on the swung grid with [quantize], else a tick, off the grid;
     * both wrap round the pattern. A note moved onto one of the same pad and
     * pitch replaces it. The presses on one pad are one checkpoint.
     */
    fun nudge(
        p: ProjectPatterns,
        pad: PhysicalPad,
        semitones: Int?,
        step: Int,
        interval: Timing,
        swing: Int,
        quantize: Boolean,
        dir: Int,
    ): Nudged {
        val key = "nudge:${pad.group}:${pad.offset}:$semitones"
        val pat = p.group(pad.group)
        if (pat.open) return Nudged(gesture(key, key, p, p), step)
        val len = pat.lengthTicks
        val count = Steps.count(pat, interval)
        val onStep = onStep(pat, step, interval, swing)
        val target = Steps.tickOf(Math.floorMod(step + dir, count), interval, swing)
        val moves = HashMap<Int, Int>()
        pat.notes.forEachIndexed { i, n ->
            if (on(n, pad, semitones) && onStep(n)) moves[i] = if (quantize) target else Math.floorMod(n.tick + dir, len)
        }
        val out = gesture(key, key, p, p.with(pad.group, pat.copy(notes = settle(pat, moves, movedWins = true).first)))
        if (out == p) return Nudged(p, step)
        // The cursor follows the note: the first of them, where it sits now.
        return Nudged(out, Steps.indexOf(moves.getValue(moves.keys.min()), interval, swing, count))
    }

    /**
     * SHIFT + TIMING, a pad held and − / +: all of [pad]'s notes that play
     * (every pitch, or only [semitones]) a tick earlier or later ([dir] -1
     * or +1), wrapping round the pattern; notes past the end stay put. A
     * note moved onto one of the same pad and pitch replaces it. The presses
     * on one pad are one checkpoint.
     */
    fun shiftPad(p: ProjectPatterns, pad: PhysicalPad, semitones: Int?, dir: Int): ProjectPatterns {
        val key = "shift:${pad.group}:${pad.offset}:$semitones"
        val pat = p.group(pad.group)
        if (pat.open) return gesture(key, key, p, p)
        val len = pat.lengthTicks
        val moves = HashMap<Int, Int>()
        pat.notes.forEachIndexed { i, n -> if (on(n, pad, semitones) && n.tick < len) moves[i] = Math.floorMod(n.tick + dir, len) }
        return gesture(key, key, p, p.with(pad.group, pat.copy(notes = settle(pat, moves, movedWins = true).first)))
    }

    /**
     * SHIFT + TIMING and a pad, stopped (timing correct): all of [pad]'s
     * notes that play (every pitch, or only [semitones]) onto [interval]'s
     * grid swung by [swing], wrapping round the pattern. Of two of one pitch
     * that land on the same tick, the first (in tick order) stays. A tap
     * with other pads held ([inRun]) is part of their gesture
     * ([correctRange]): one checkpoint with theirs.
     */
    fun correctPad(p: ProjectPatterns, pad: PhysicalPad, semitones: Int?, interval: Timing, swing: Int, inRun: Boolean = false): Corrected {
        if (!inRun) breakRuns()
        val pat = p.group(pad.group)
        if (pat.open) return Corrected(if (inRun) gesture(CORRECT_RUN, CORRECT_RUN, p, p) else p, 0)
        val (out, moved) = correct(p, pat, pad, semitones, interval, swing) { it < pat.lengthTicks }
        return Corrected(if (inRun) gesture(CORRECT_RUN, CORRECT_RUN, p, out) else edit(p, out), moved)
    }

    /**
     * SHIFT + TIMING with [pad] held while playing: its notes from global
     * [fromTick] to [toTick] (as [eraseRange] takes them) corrected as
     * [correctPad] does. Every range, of any pad, from the first hold to
     * [endRun] is the same gesture: one checkpoint. [Corrected.moved] counts
     * this range's notes only.
     */
    fun correctRange(
        p: ProjectPatterns,
        pad: PhysicalPad,
        semitones: Int?,
        fromTick: Double,
        toTick: Double,
        interval: Timing,
        swing: Int,
    ): Corrected {
        val pat = p.group(pad.group)
        val anchor = phase.of(pad.group)
        val start = maxOf(fromTick, anchor.toDouble())
        if (pat.open || toTick <= start) return Corrected(gesture(CORRECT_RUN, CORRECT_RUN, p, p), 0)
        val len = pat.lengthTicks.toDouble()
        val whole = toTick - start >= len
        val from = localTick(start, anchor, pat)
        val to = localTick(toTick, anchor, pat)
        val (out, moved) = correct(p, pat, pad, semitones, interval, swing) { t ->
            t < len && (whole || if (from <= to) t >= from && t < to else t >= from || t < to)
        }
        return Corrected(gesture(CORRECT_RUN, CORRECT_RUN, p, out), moved)
    }

    /** The knob let go of or the pad lifted: the next step edit or correct is a gesture of its own. */
    fun endRun() {
        lastRun = null
    }

    /**
     * An edit of the scenes or the banks (a commit, a clear or delete, a
     * paste), from [before] to [after]: as [edit], a checkpoint of its own
     * when it changed anything, and the gestures going on end.
     */
    fun editSeq(before: ProjectSeq, after: ProjectSeq): ProjectSeq {
        breakRuns()
        if (after == before) return before
        pushSeq(before.withPlaying(closed(before.playing())))
        pending = true
        return after
    }

    /** The project's sequencer before the last checkpoint (those the same as [current] skipped), or null with none left. */
    fun undo(current: ProjectSeq): ProjectSeq? {
        breakRuns()
        while (checkpoints.isNotEmpty()) {
            val c = checkpoints.removeAt(checkpoints.lastIndex)
            if (c != current) {
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

    // Any edit but the run it is part of ends the gestures going on.
    private fun breakRuns() {
        lastErase = null
        lastRun = null
    }

    // A step edit or correct, part of the run [key]: its first change is a checkpoint, as [edit], and the rest of the
    // run's none. It goes on from the last run when that was [follows].
    private fun gesture(follows: String, key: String, before: ProjectPatterns, after: ProjectPatterns): ProjectPatterns {
        lastErase = null
        val pushed = lastRun == follows && runPushed
        lastRun = key
        runPushed = pushed
        if (after == before) return before
        if (pushed) return after
        runPushed = true
        return edit(before, after)
    }

    // [stepVelocity] and [stepGate]: [change] on every note on [step] of [group].
    private fun stepNotes(
        p: ProjectPatterns,
        key: String,
        group: Int,
        step: Int,
        interval: Timing,
        swing: Int,
        change: (PatternNote) -> PatternNote,
    ): ProjectPatterns {
        val pat = p.group(group)
        if (pat.open) return gesture(key, key, p, p)
        val onStep = onStep(pat, step, interval, swing)
        return gesture(key, key, p, p.with(group, pat.copy(notes = pat.notes.map { if (onStep(it)) change(it) else it })))
    }

    // [pad]'s notes at the ticks [selected] takes, onto the grid: the patterns, and how many moved or were dropped.
    private fun correct(
        p: ProjectPatterns,
        pat: Pattern,
        pad: PhysicalPad,
        semitones: Int?,
        interval: Timing,
        swing: Int,
        selected: (Int) -> Boolean,
    ): Pair<ProjectPatterns, Int> {
        val len = pat.lengthTicks
        val moves = HashMap<Int, Int>()
        pat.notes.forEachIndexed { i, n ->
            if (on(n, pad, semitones) && selected(n.tick)) moves[i] = Math.floorMod(interval.quantize(n.tick.toDouble(), swing), len.toLong()).toInt()
        }
        val (notes, dropped) = settle(pat, moves, movedWins = false)
        val moved = pat.notes.indices.count { i -> dropped[i] || moves[i].let { it != null && it != pat.notes[i].tick } }
        return p.with(pad.group, pat.copy(notes = notes)) to moved
    }

    // An erase, clear, length or double: its own checkpoint when it changed anything, and what is recorded next another.
    private fun edit(before: ProjectPatterns, after: ProjectPatterns): ProjectPatterns {
        if (after == before) return before
        push(before)
        pending = true
        return after
    }

    private fun push(before: ProjectPatterns) = pushSeq(seq.withPlaying(closed(before)))

    private fun pushSeq(c: ProjectSeq) {
        checkpoints.addLast(c)
        while (checkpoints.size > maxUndo) checkpoints.removeAt(0)
    }

    // Open groups go back as they were before the punch-in: closed, at their old length.
    private fun closed(p: ProjectPatterns): ProjectPatterns {
        var c = p
        for (g in 0 until 4) {
            val pat = c.group(g)
            if (pat.open) c = c.with(g, Pattern(if (pat.isEmpty) openedFrom[g] else pat.bars, pat.notes))
        }
        return c
    }

    // A pad held in ERASE while playing: where its last range ended, and whether it pushed its checkpoint.
    private class EraseRun(val pad: PhysicalPad, val semitones: Int?, val end: Double, var pushed: Boolean)

    private companion object {
        /** With TIMING OFF, a note this near one on the same pad and pitch replaces it. */
        const val OVERDUB_TICKS = 6

        /** The gesture of the pads held to correct while playing: one run, whatever the pad. */
        const val CORRECT_RUN = "correct"

        fun on(n: PatternNote, pad: PhysicalPad, semitones: Int?) = n.offset == pad.offset && (semitones == null || n.semitones == semitones)

        /** Whether a note plays on [step] of [pat] (notes past the end are on none). */
        fun onStep(pat: Pattern, step: Int, interval: Timing, swing: Int): (PatternNote) -> Boolean {
            val count = Steps.count(pat, interval)
            return { it.tick < pat.lengthTicks && Steps.indexOf(it.tick, interval, swing, count) == step }
        }

        /**
         * [pat]'s notes, in their order, with those at [moves]' indices at
         * their new ticks. Where notes of one pad and pitch then share a tick
         * a moved one landed on, one stays: a moved one when [movedWins], else
         * the first as they were in tick order. Also which notes were dropped.
         */
        fun settle(pat: Pattern, moves: Map<Int, Int>, movedWins: Boolean): Pair<List<PatternNote>, BooleanArray> {
            val notes = pat.notes
            // Only where a moved note landed can two meet.
            val landed = moves.map { (i, t) -> Triple(notes[i].offset, notes[i].semitones, t) }.toSet()
            val order = notes.indices.sortedWith(compareBy({ if (movedWins && it !in moves) 1 else 0 }, { notes[it].tick }))
            val seen = HashSet<Triple<Int, Int?, Int>>()
            val dropped = BooleanArray(notes.size)
            for (i in order) {
                val t = moves[i] ?: notes[i].tick
                // Notes past the end aren't played: nothing lands on them.
                if (t >= pat.lengthTicks) continue
                val k = Triple(notes[i].offset, notes[i].semitones, t)
                if (k in landed && !seen.add(k)) dropped[i] = true
            }
            val out = notes.mapIndexedNotNull { i, n -> if (dropped[i]) null else moves[i]?.let { n.copy(tick = it) } ?: n }
            return out to dropped
        }

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
