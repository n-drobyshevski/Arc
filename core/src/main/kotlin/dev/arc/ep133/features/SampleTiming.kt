package dev.arc.ep133.features

import kotlin.math.floor

/**
 * An input stream's timestamp: [frame] was captured at [nanos]
 * (System.nanoTime) at [rate] frames a second. SAMPLE uses it to turn a
 * moment (a pad press, the downbeat after a count-in) into the input frame
 * recorded then.
 */
data class FrameClock(val frame: Long, val nanos: Long, val rate: Int) {
    /** The frame captured at [t] nanoseconds, before or after the stamp; rounded half up. */
    fun frameAt(t: Long): Long = frame + floor((t - nanos).toDouble() * rate / 1e9 + 0.5).toLong()
}

/**
 * SAMPLE's count-in before a take of set bars (an addition): the click's
 * beats go in, and it waits for a bar's first beat (an accented one), counts
 * from it, and on the last of [beats] beats gives when the take starts: the
 * beat after it. Beats skipped (a late click) still count by their index;
 * a count going back, as on a new Start from the EP-133, starts again from
 * the next accent. After [Step.Start] it waits for an accent again.
 */
class CountIn(val beats: Int = Tempo.BEATS_PER_BAR) {
    sealed interface Step {
        /** Before the bar's first beat. */
        data object Waiting : Step

        /** Beat [beat] of the count, 1 to [beats] − 1. */
        data class Counting(val beat: Int) : Step

        /** The last beat of the count: the take starts at [atNanos]. */
        data class Start(val atNanos: Long) : Step
    }

    // The beat the count started on, while counting.
    private var downbeat: Beat? = null

    /** [beat] was clicked, beats being [periodNs] apart. */
    fun onBeat(beat: Beat, periodNs: Double): Step {
        val down = downbeat
        val n = if (down == null) 0L else beat.index - down.index + 1
        if (n < 1) {
            if (!beat.accent) {
                downbeat = null
                return Step.Waiting
            }
            downbeat = beat
            return if (beats <= 1) start(beat, 1, periodNs) else Step.Counting(1)
        }
        return if (n >= beats) start(beat, n, periodNs) else Step.Counting(n.toInt())
    }

    fun reset() {
        downbeat = null
    }

    // From the latest beat rather than the downbeat, so a tempo nudged during the count is followed.
    private fun start(beat: Beat, n: Long, periodNs: Double): Step.Start {
        downbeat = null
        return Step.Start(beat.at + floor((beats - n + 1) * periodNs + 0.5).toLong())
    }
}

/** Whether the EP-133 just started playing: [playing] now and not before ([was]); unknown counts as not. */
fun followStart(playing: Boolean?, was: Boolean?): Boolean = playing == true && was != true
