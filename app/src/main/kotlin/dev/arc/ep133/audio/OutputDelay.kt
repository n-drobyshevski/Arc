package dev.arc.ep133.audio

import dev.arc.ep133.features.BeatGrid
import dev.arc.ep133.features.Seq
import kotlin.math.floor

/**
 * The delay Live makes up for when its sound goes to Bluetooth or a hearing
 * aid (an addition): the maths, with no Android in it.
 *
 * The output's own stamp ([dev.arc.ep133.features.FrameClock]) says when a
 * frame is presented, and every heard-time figure here ([Timeline], the click)
 * goes through it. How much of a wireless link's delay the stamp counts is up
 * to the device's audio HAL: some report the link in the presentation position,
 * so the stamp is already the heard time, others only the phone's own buffers,
 * and then the link's delay comes on top of it. The output's latency
 * ([latencyMs], the frames written but not yet presented by that same stamp)
 * is therefore the part the stamp *counts*, and what is made up for ([ms]) is
 * the rest of the delay a wireless output is taken to have ([TYPICAL_MS] at
 * least): nothing when the stamp already covers it, and never the measured
 * latency itself, which would count it twice.
 *
 * Live's mix, and so every pattern note and click, carries on as it was: only
 * what is lined up with something else is moved by the delay. Two cases, both
 * decided by what the clock is:
 * - The pattern transport is arc's own free-running clock, and the phone's
 *   sound is its only reference, so the audio is not moved. What the eye
 *   follows (the playhead and the count-in, the click's light) and where a
 *   live press lands on the timeline are moved instead, to what is heard: a
 *   tick is heard that long after the stamp says. See [PatternScheduler] and
 *   [dev.arc.ep133.controller.ArcController].
 * - The click that follows the EP-133's MIDI clock lines up with sound that
 *   does not wait for the phone, so it is sent earlier by the delay and heard
 *   on the device's beat ([earlier]).
 *
 * Wired, or with the setting off, the delay is 0 and nothing moves.
 */
object OutputDelay {
    /**
     * What a wireless output is taken to delay in all, at least, in milliseconds:
     * a typical A2DP link with a common codec, the phone's buffers included. It
     * is all of the delay when nothing can be measured.
     */
    const val TYPICAL_MS = 180

    private fun counted(countedMs: Int?): Int = countedMs?.takeIf { it > 0 } ?: 0

    /**
     * The delay a wireless output is taken to have in all, in milliseconds:
     * [TYPICAL_MS], or what the output [countedMs] (its latency, null or not
     * above 0 when it couldn't be told) when that is longer.
     */
    fun totalMs(countedMs: Int?): Int = maxOf(counted(countedMs), TYPICAL_MS)

    /**
     * The delay to make up for, in milliseconds: 0 unless the output is
     * [wireless] and the setting is [on]; then [totalMs] less the part the
     * output's stamp already [countedMs], so what is left is the part it leaves
     * out. Never the measured latency itself.
     */
    fun ms(on: Boolean, wireless: Boolean, countedMs: Int?): Int =
        if (!on || !wireless) 0 else totalMs(countedMs) - counted(countedMs)

    /** [ms] in nanoseconds. */
    fun nanos(ms: Int): Long = ms * 1_000_000L

    /** [delayNs] as ticks of the pattern at [bpm] ([Seq.PPQN] a beat), fractional. */
    fun ticks(delayNs: Long, bpm: Double): Double = delayNs * bpm * Seq.PPQN / 60e9

    /**
     * Where a press is recorded: [heard], the tick the player hears at the
     * press (the tick the stamp has at it, [tick], less the delay). A press
     * heard in the pass before the one the stamp is in wraps by itself: the
     * ticks are global, and the recorder floors them into the pattern. Only a
     * [heard] below 0 has no earlier pass to be in, as the run has just begun
     * and nothing before it was heard:
     * - in a run that was counted in ([countedIn]) the player is hearing the
     *   count-in, so the press stays as heard, in the count-in, for the
     *   recorder to snap or drop as it does wired (a downbeat a little early
     *   is still the downbeat);
     * - in a run a pad press started there is nothing to play to yet, so the
     *   press counts as the stamp has it, no earlier than the start: a chord's
     *   other fingers, or a fast roll, within the delay of the first press
     *   land at the start rather than before it or at the loop's end.
     */
    fun placed(tick: Double, heard: Double, countedIn: Boolean): Double =
        if (heard >= 0 || countedIn) heard else maxOf(heard, minOf(tick, 0.0))

    /**
     * The latency of an output that has written [written] frames, as an
     * estimate from its timestamp ([stampFrame] was presented at
     * [stampNanos]) and the time [now] (both System.nanoTime), at [rate]:
     * the time the frames not yet presented take, in whole milliseconds. This
     * is the part of the output's delay that the stamp itself counts (see the
     * class), for the display and for [ms]. Null when nothing is in flight or
     * a figure can't be had (no rate, a stamp from the future).
     */
    fun latencyMs(written: Long, stampFrame: Long, stampNanos: Long, now: Long, rate: Int): Int? {
        if (rate <= 0 || now < stampNanos) return null
        val played = stampFrame + (now - stampNanos) * rate / 1e9
        val inFlight = written - played
        if (inFlight <= 0) return null
        return floor(inFlight / rate * 1000 + 0.5).toInt().takeIf { it > 0 }
    }

    /** The EP-133's beats sent [delayNs] earlier, so they are heard on the device's. */
    fun earlier(grid: BeatGrid, delayNs: Long): BeatGrid = if (delayNs == 0L) grid else grid.copy(anchor = grid.anchor - delayNs)
}
