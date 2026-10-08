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
     * live as it was recorded). Nothing is allocated but the notes.
     */
    fun window(p: ProjectPatterns, clock: TransportClock, from: Long, to: Long, skip: Map<Int, Long>, out: MutableList<SeqNote>) {
        out.clear()
        if (to <= from) return
        val first = maxOf(firstTick(clock, from), 0L)
        val end = firstTick(clock, to)
        if (end <= first) return
        for (g in 0 until 4) {
            val pat = p.group(g)
            val len = pat.lengthTicks.toLong()
            for (i in pat.notes.indices) {
                val n = pat.notes[i]
                if (n.tick >= len) continue
                var pass = if (pat.open) 0L else Math.floorDiv(first - n.tick + len - 1, len)
                var t = n.tick + pass * len
                while (t < end) {
                    if (t >= first && (n.id == 0 || skip.isEmpty() || skip[n.id] != pass)) out += SeqNote(g, n, t, clock.frameOf(t))
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

/** Which pass of a pattern [lengthTicks] long global [globalTick] falls in: 0 for the first, −1 in the count-in. */
fun passOf(globalTick: Long, lengthTicks: Int): Long = Math.floorDiv(globalTick, lengthTicks.toLong())

/** The first loop start (a whole number of [lengthTicks]) at or after [globalTick]: 0 during the count-in. */
fun nextLoopStart(globalTick: Double, lengthTicks: Int): Long = maxOf(ceil(globalTick / lengthTicks).toLong(), 0L) * lengthTicks

/** Where a pattern is: [bar] and [beat] from 1, of [bars], and [fraction] of the way through the loop (0..1). */
data class PatternPosition(val bar: Int, val beat: Int, val bars: Int, val fraction: Float)

/** Where [p] is at global [globalTick]; the count-in shows its start. */
fun positionOf(globalTick: Double, p: Pattern): PatternPosition {
    val len = p.lengthTicks.toDouble()
    val t = when {
        globalTick <= 0 -> 0.0
        p.open -> globalTick
        else -> globalTick - floor(globalTick / len) * len
    }
    val bar = floor(t / Seq.TICKS_PER_BAR).toInt()
    val beat = floor((t - bar * Seq.TICKS_PER_BAR) / Seq.PPQN).toInt()
    return PatternPosition(bar + 1, beat + 1, p.bars, (t / len).coerceIn(0.0, 1.0).toFloat())
}
