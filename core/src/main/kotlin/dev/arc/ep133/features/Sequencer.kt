package dev.arc.ep133.features

import kotlin.math.ceil
import kotlin.math.floor

/**
 * The pattern transport's clock (arc's own, free running): global tick 0
 * (bar 1) falls on mix frame [anchorFrame] at [rate] frames a second, and
 * the ticks go at [bpm], [Seq.PPQN] a beat.
 */
data class TransportClock(val anchorFrame: Long, val rate: Int, val bpm: Double) {
    val framesPerTick: Double get() = rate * 60.0 / (bpm * Seq.PPQN)

    /** The mix frame [tick] plays at, rounded half up (as [barFrames]). */
    fun frameOf(tick: Long): Long = anchorFrame + floor(tick * framesPerTick + 0.5).toLong()

    /** The tick at mix frame [frame], fractional. */
    fun tickAt(frame: Long): Double = (frame - anchorFrame) / framesPerTick

    /** Another tempo from [atFrame] on: the tick there stays. */
    fun retempo(atFrame: Long, bpm: Double): TransportClock = TransportClock(atFrame, rate, bpm).let { c ->
        c.copy(anchorFrame = atFrame - floor(tickAt(atFrame) * c.framesPerTick + 0.5).toLong())
    }

    /** [tick] at [atFrame] of a new frame count at [rate] (the stream opened again, or another engine). */
    fun rebase(atFrame: Long, tick: Double, rate: Int): TransportClock = TransportClock(atFrame, rate, bpm).let { c ->
        c.copy(anchorFrame = atFrame - floor(tick * c.framesPerTick + 0.5).toLong())
    }

    /**
     * The click's beats for an output stamped [c]: beat 0 on tick 0 and its
     * bar known, so the count-in's beats are −4..−1.
     */
    fun beatGrid(c: FrameClock): BeatGrid = BeatGrid(nanosOf(0, c), 0, 60e9 / bpm, true)

    /** When [tick] plays on [c]'s clock (the frame it plays at, through the output's stamp). */
    fun nanosOf(tick: Long, c: FrameClock): Long = c.nanos + floor((frameOf(tick) - c.frame) * 1e9 / c.rate + 0.5).toLong()
}

/**
 * Where each group's pattern started (an addition): the global tick of its
 * local tick 0, one for each group (0..3). A pattern switched in while the
 * transport runs starts at its bar 1 on the tick the switch takes over, as
 * the device starts it, so its local tick is the global one less its anchor
 * ([localTick]); all are 0 when the transport starts ([ZERO]).
 */
data class PhaseAnchors(val ticks: List<Long> = List(4) { 0L }) {
    /** [group]'s anchor; 0 for a group out of range. */
    fun of(group: Int): Long = ticks.getOrElse(group) { 0L }

    /** [group]'s pattern starts at global [tick]. */
    fun with(group: Int, tick: Long): PhaseAnchors =
        if (group !in 0..3 || of(group) == tick) this else PhaseAnchors(ticks.mapIndexed { g, t -> if (g == group) tick else t })

    companion object {
        val ZERO = PhaseAnchors()
    }
}

/** A note of [group]'s pattern to play: at global [startTick], mix frame [startFrame]. */
data class SeqNote(val group: Int, val note: PatternNote, val startTick: Long, val startFrame: Long)

/** Which notes of a project's patterns play in a stretch of mix frames. */
object PatternPlayer {
    // By tick, then group; written out so sorting boxes nothing.
    private val ORDER = Comparator<SeqNote> { a, b -> if (a.startTick != b.startTick) a.startTick.compareTo(b.startTick) else a.group - b.group }

    /**
     * Into [out] (cleared), in tick order: the notes whose start frame is in
     * [[from], [to]), so windows back to back miss and repeat none. Negative
     * ticks (the count-in) play nothing; an open pattern plays once, not
     * looping. [skip] gives a note's id the pass not to play (it was heard
     * live as it was recorded), counted from the group's anchor in [phase]
     * (nothing of a pattern plays before it). Nothing is allocated but the notes.
     */
    fun window(
        p: ProjectPatterns,
        clock: TransportClock,
        from: Long,
        to: Long,
        skip: Map<Int, Long>,
        out: MutableList<SeqNote>,
        phase: PhaseAnchors = PhaseAnchors.ZERO,
    ) {
        out.clear()
        if (to <= from) return
        val first = maxOf(firstTick(clock, from), 0L)
        val end = firstTick(clock, to)
        if (end <= first) return
        for (g in 0 until 4) {
            val pat = p.group(g)
            val len = pat.lengthTicks.toLong()
            val anchor = phase.of(g)
            val start = maxOf(first, anchor)
            for (i in pat.notes.indices) {
                val n = pat.notes[i]
                if (n.tick >= len) continue
                var pass = if (pat.open) 0L else firstPassAtOrAfter(start, n.tick, len.toInt(), anchor)
                var t = globalTickOf(n.tick, pass, len.toInt(), anchor)
                while (t < end) {
                    if (t >= start && (n.id == 0 || skip.isEmpty() || skip[n.id] != pass)) out += SeqNote(g, n, t, clock.frameOf(t))
                    if (pat.open) break
                    pass++
                    t += len
                }
            }
        }
        out.sortWith(ORDER)
    }

    // The first tick whose frame is at or after [frame].
    private fun firstTick(clock: TransportClock, frame: Long): Long {
        var t = ceil(clock.tickAt(frame)).toLong() - 1
        while (clock.frameOf(t) < frame) t++
        return t
    }
}

/**
 * The time since a pattern's [anchor] ([PhaseAnchors]) at [globalTick]: what
 * [localTick] takes the loop out of, and what a press is quantized on.
 */
fun sinceAnchor(globalTick: Double, anchor: Long): Double = globalTick - anchor

/** [sinceAnchor] of a whole tick. */
fun sinceAnchor(globalTick: Long, anchor: Long): Long = globalTick - anchor

/**
 * [globalTick] on a pattern's own clock (where a global tick becomes a local
 * one, with [sinceAnchor], [passOf], [firstPassAtOrAfter] and [globalTickOf]):
 * the time since its [anchor] ([PhaseAnchors]), round its loop unless it is
 * open, where it grows instead. Fractional; below 0 before the anchor for an
 * open pattern.
 */
fun localTick(globalTick: Double, anchor: Long, p: Pattern): Double {
    val t = sinceAnchor(globalTick, anchor)
    if (p.open) return t
    val len = p.lengthTicks.toDouble()
    return t - floor(t / len) * len
}

/** [localTick] of a whole tick. */
fun localTick(globalTick: Long, anchor: Long, p: Pattern): Long =
    if (p.open) sinceAnchor(globalTick, anchor) else Math.floorMod(sinceAnchor(globalTick, anchor), p.lengthTicks.toLong())

/**
 * Which pass of a pattern [lengthTicks] long global [globalTick] falls in,
 * counted from its [anchor]: 0 for the first, −1 before it (the count-in).
 */
fun passOf(globalTick: Long, lengthTicks: Int, anchor: Long = 0L): Long = Math.floorDiv(sinceAnchor(globalTick, anchor), lengthTicks.toLong())

/** The first pass in which a note at [noteTick] of a pattern [lengthTicks] long plays at or after global [globalTick], counted from its [anchor]. */
fun firstPassAtOrAfter(globalTick: Long, noteTick: Int, lengthTicks: Int, anchor: Long = 0L): Long =
    Math.floorDiv(sinceAnchor(globalTick, anchor) - noteTick + lengthTicks - 1, lengthTicks.toLong())

/** The global tick a note at [noteTick] plays in [pass] of a pattern [lengthTicks] long, counted from its [anchor]. */
fun globalTickOf(noteTick: Int, pass: Long, lengthTicks: Int, anchor: Long = 0L): Long = anchor + noteTick + pass * lengthTicks

/** The first loop start (the [anchor] and a whole number of [lengthTicks] on) at or after [globalTick]: the anchor before it (the count-in). */
fun nextLoopStart(globalTick: Double, lengthTicks: Int, anchor: Long = 0L): Long =
    anchor + maxOf(ceil((globalTick - anchor) / lengthTicks).toLong(), 0L) * lengthTicks

/** Where a pattern is: [bar] and [beat] from 1, of [bars], and [fraction] of the way through the loop (0..1). */
data class PatternPosition(val bar: Int, val beat: Int, val bars: Int, val fraction: Float)

/** Where [p], started at global tick [anchor], is at global [globalTick]; the count-in (and before the anchor) shows its start. */
fun positionOf(globalTick: Double, p: Pattern, anchor: Long = 0L): PatternPosition {
    val len = p.lengthTicks.toDouble()
    val t = if (globalTick <= anchor) 0.0 else localTick(globalTick, anchor, p)
    val bar = floor(t / Seq.TICKS_PER_BAR).toInt()
    val beat = floor((t - bar * Seq.TICKS_PER_BAR) / Seq.PPQN).toInt()
    return PatternPosition(bar + 1, beat + 1, p.bars, (t / len).coerceIn(0.0, 1.0).toFloat())
}
