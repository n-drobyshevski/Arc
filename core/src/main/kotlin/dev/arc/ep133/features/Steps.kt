package dev.arc.ep133.features

/**
 * A pattern as steps, as the device steps through it while stopped (− / +,
 * and RECORD + pad to place a note): one step a TIMING interval, swung as
 * the grid is. Every interval but OFF divides a bar, so a pattern of n bars
 * has exactly n * 384 / ticks steps. The interval is never OFF here: callers
 * pass [TimingSettings.interval], whatever the quantize mode is. Pure.
 */
object Steps {
    /** How many steps [p] has at [interval]. */
    fun count(p: Pattern, interval: Timing): Int = p.lengthTicks / interval.ticks

    /** The tick step [step] plays at: its place on the grid, played late by the swing on the odd ones. */
    fun tickOf(step: Int, interval: Timing, swing: Int): Int = step * interval.ticks + interval.swingOffset(step.toLong(), swing)

    /**
     * The step a note at [tick] sits on: the nearest point of the swung grid
     * (as recording snaps to it), of [count]. A swung point k lies within
     * half a step after k * ticks, so the step is the grid tick's whole
     * steps; a note near the end rounds up to [count], which is step 0.
     */
    fun indexOf(tick: Int, interval: Timing, swing: Int, count: Int): Int {
        val k = Math.floorDiv(interval.quantize(tick.toDouble(), swing), interval.ticks.toLong())
        return Math.floorMod(k, count.toLong()).toInt()
    }

    /** The notes that play on [step], in the pattern's order; notes past the end aren't on any. */
    fun notesOn(p: Pattern, step: Int, interval: Timing, swing: Int): List<PatternNote> {
        val n = count(p, interval)
        return p.notes.filter { it.tick < p.lengthTicks && indexOf(it.tick, interval, swing, n) == step }
    }

    /** For each step, whether a note plays on it: what the step strip marks. */
    fun occupied(p: Pattern, interval: Timing, swing: Int): BooleanArray {
        val n = count(p, interval)
        val out = BooleanArray(n)
        for (note in p.notes) if (note.tick < p.lengthTicks) out[indexOf(note.tick, interval, swing, n)] = true
        return out
    }

    /** The pads with a note on [step], as (offset, semitones) pairs: what lights, a KEYS note by its pitch. */
    fun padsOn(p: Pattern, step: Int, interval: Timing, swing: Int): Set<Pair<Int, Int?>> =
        notesOn(p, step, interval, swing).map { it.offset to it.semitones }.toSet()

    /** [step] wrapped round the [count] steps, as − / + go past either end. */
    fun clampStep(step: Int, count: Int): Int = Math.floorMod(step, count)

    /** The step at [to] where [step] at [from] starts (rounded down): the cursor keeps its place when the interval changes. */
    fun convert(step: Int, from: Timing, to: Timing): Int = step * from.ticks / to.ticks
}
