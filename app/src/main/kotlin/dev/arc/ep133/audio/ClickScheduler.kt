package dev.arc.ep133.audio

import dev.arc.ep133.features.Beat
import dev.arc.ep133.features.BeatGrid
import dev.arc.ep133.features.Tempo
import kotlin.math.roundToLong

/**
 * Where the clicks fall in a click stream (an addition), block by block, to
 * the frame: pure arithmetic for [MetronomeOutput], no Android in it.
 *
 * - Free run, at the phone's tempo: the next beat's frame is kept as a
 *   Double and moved on a beat's frames (rate × 60 / bpm) at each click, so
 *   the beats never drift; a new tempo applies from the beat after the next.
 * - Following the EP-133's clock (a [BeatGrid] for the block): each beat's
 *   time is turned into a frame through the output's timestamp (a frame and
 *   the nanoTime it is heard). A beat up to [LATE_NS] past is clicked at
 *   once (a re-fitted grid nudging it back); one further past is skipped.
 * - Clicks closer than [MIN_GAP] of a beat are one beat: the grid re-fitted
 *   or re-anchored (a Start), or the switch from free run to following.
 * - When the grid goes (the clock stopped), it runs free on from the last
 *   click, at the phone's tempo, counting on from the device's beat.
 *
 * Each click's [Beat] is when it is heard, so the TEMPO key's light can wait
 * for it. A bar's first beat is accented (beat 0, 4, 8 …) while the bar is
 * known: always in a free run from the start, only after a Start when
 * following ([BeatGrid.barKnown]).
 */
internal class ClickScheduler(private val rate: Int) {
    companion object {
        /** A beat this little past is still clicked, at the block's start. */
        const val LATE_NS = 2_000_000L

        /** Clicks closer than this share of a beat are one beat. */
        const val MIN_GAP = 0.4

        // No frame yet.
        private const val NONE = Double.NaN
    }

    /** A click at frame [offset] of the block, heard as [beat]. */
    class Click(val offset: Int, val beat: Beat)

    private val clicks = ArrayList<Click>(4)
    private val framesPerNs = rate / 1e9
    // The free run's next beat (NONE: from the last click, or now), and its number.
    private var next = NONE
    private var index = 0L
    // The last click's frame (NONE: none yet), and whether the bar is known.
    private var last = NONE
    private var barKnown = true

    /** Whether the last block followed the device's clock. */
    var following = false
        private set

    /**
     * The clicks in the block of [frames] from stream frame [from]: at
     * [bpm] in a free run, else on [grid]'s beats. [stampFrame] is heard at
     * [stampNanos] (System.nanoTime). The list is reused by the next call.
     */
    fun block(from: Long, frames: Int, bpm: Int, grid: BeatGrid?, stampFrame: Long, stampNanos: Long): List<Click> {
        clicks.clear()
        val end = from + frames
        fun frameOf(t: Long): Double = stampFrame + (t - stampNanos) * framesPerNs
        fun timeOf(f: Long): Long = stampNanos + ((f - stampFrame) / framesPerNs).roundToLong()
        if (grid != null) {
            following = true
            val period = grid.periodNs * framesPerNs
            var i = grid.indexFrom(timeOf(from) - LATE_NS)
            while (true) {
                val f = maxOf(frameOf(grid.at(i)).roundToLong(), from)
                if (f >= end) break
                if (last.isNaN() || f - last >= MIN_GAP * period) {
                    barKnown = grid.barKnown
                    click(f, from, i, timeOf(f))
                    index = i + 1
                }
                i++
            }
            // Should the grid go, the free run starts from the last click.
            next = NONE
            return clicks
        }
        following = false
        val period = rate * 60.0 / Tempo.clamp(bpm)
        if (next.isNaN()) next = if (last.isNaN()) from.toDouble() else last + period
        // Fallen behind (a grid gone long after its last click): the beats missed are skipped.
        while (next.roundToLong() < from) {
            next += period
            index++
        }
        while (true) {
            val f = next.roundToLong()
            if (f >= end) break
            click(f, from, index, timeOf(f))
            index++
            next += rate * 60.0 / Tempo.clamp(bpm)
        }
        return clicks
    }

    private fun click(f: Long, from: Long, i: Long, at: Long) {
        last = f.toDouble()
        val accent = barKnown && Math.floorMod(i, Tempo.BEATS_PER_BAR.toLong()) == 0L
        clicks.add(Click((f - from).toInt(), Beat(i, at, accent)))
    }
}
