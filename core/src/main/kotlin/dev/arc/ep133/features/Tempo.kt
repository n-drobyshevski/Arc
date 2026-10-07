package dev.arc.ep133.features

import dev.arc.ep133.protocol.MidiEvent
import kotlin.math.ceil
import kotlin.math.floor

/** Live's TEMPO key (an addition): the phone's click, its tempo, and following the EP-133's MIDI clock. */
object Tempo {
    const val MIN = 40
    const val MAX = 240
    const val DEFAULT = 120
    /** The click accents a bar's first beat, in 4/4 (the EP-133's own count). */
    const val BEATS_PER_BAR = 4
    /** MIDI clocks per quarter note. */
    const val TICKS_PER_BEAT = 24

    fun clamp(bpm: Int): Int = bpm.coerceIn(MIN, MAX)

    /** [bpm] rounded half up (JS Math.round) and clamped. */
    fun round(bpm: Double): Int = clamp(floor(bpm + 0.5).toInt())
}

/**
 * Tap tempo: the mean of up to the last [maxTaps] − 1 intervals. A pause
 * longer than [resetNs] starts again; so does an interval more than half
 * off the mean so far, from the tap before it (a changed mind, not jitter).
 * Times are nanoseconds on one clock.
 */
class TapTempo(private val maxTaps: Int = 5, private val resetNs: Long = 2_000_000_000L) {
    private val taps = ArrayDeque<Long>()

    /** A tap at [at]: the tempo the taps give, rounded and clamped; null on a run's first tap. */
    fun tap(at: Long): Int? {
        val last = taps.lastOrNull()
        if (last != null) {
            val interval = at - last
            if (interval <= 0 || interval > resetNs) {
                taps.clear()
            } else if (taps.size >= 2) {
                val mean = (last - taps.first()).toDouble() / (taps.size - 1)
                if (interval > mean * 1.5 || interval < mean * 0.5) {
                    taps.clear()
                    taps.addLast(last)
                }
            }
        }
        taps.addLast(at)
        while (taps.size > maxTaps) taps.removeFirst()
        if (taps.size < 2) return null
        val mean = (taps.last() - taps.first()).toDouble() / (taps.size - 1)
        return Tempo.round(60e9 / mean)
    }

    fun reset() = taps.clear()
}

/**
 * A beat to click or flash: the [index]th counted (from Start when one was
 * seen), at [at] nanoseconds; [accent] on a bar's first beat, only while the
 * bar is known.
 */
data class Beat(val index: Long, val at: Long, val accent: Boolean)

/**
 * The device's beats as fitted from its clock: beat [beatIndex] falls at
 * [anchor] (ns) and the rest every [periodNs] from it. [barKnown] once a
 * Start was seen and the device counts its clocks: then the beats are in
 * phase with the device's and index 0, 4, 8 … start its bars. Without it
 * only the tempo is the device's; the phase comes from whichever clock was
 * counted first.
 */
data class BeatGrid(val anchor: Long, val beatIndex: Long, val periodNs: Double, val barKnown: Boolean) {
    val bpm: Double get() = 60e9 / periodNs

    /** When beat [index] falls. */
    fun at(index: Long): Long = anchor + Math.round((index - beatIndex) * periodNs)

    /** The first beat at or after [t]. */
    fun indexFrom(t: Long): Long = beatIndex + ceil((t - anchor) / periodNs).toLong()

    fun accent(index: Long): Boolean = barKnown && Math.floorMod(index, Tempo.BEATS_PER_BAR.toLong()) == 0L

    fun beat(index: Long): Beat = Beat(index, at(index), accent(index))
}

/**
 * Follows the EP-133's MIDI clock (24 a beat) for the click and the TEMPO
 * key's light. The clocks' times are fitted to a line (least squares over
 * the last [window]), so the beats come out steady through the MIDI
 * receiver's jitter.
 *
 * - Start counts from 0: the first clock after it is a bar's first beat.
 * - Stop holds the count; Continue goes on from it. Clocks while stopped
 *   keep the tempo but count nothing.
 * - Opened while the device plays (no Start seen), the tempo is followed
 *   and the phase is unknown until the next Start.
 * - Like Live's BPM: no grid under [MIN_CLOCKS] clocks, or after
 *   [LiveMirror.CLOCK_TIMEOUT_NS] without one. Except after a Start, a
 *   Continue or a pause in the clock: the clocks before it go (a gap would
 *   drag the fit), but the tempo they gave is held, so the grid is there
 *   from the first clock after it, in the device's phase, until enough new
 *   ones are fitted.
 *
 * Times are nanoseconds on the MIDI receiver's clock.
 */
class ClockFollow(private val window: Int = 48) {
    companion object {
        /** Clocks needed for a tempo, as for Live's BPM. */
        const val MIN_CLOCKS = 25
    }

    /** (clock number, time); the number counts every clock, so the fit spans stops. */
    private val clocks = ArrayDeque<Pair<Long, Long>>()
    private var seq = 0L
    /** The count of the next clock while playing (24 per beat). */
    private var nextTick = 0L
    /** The count of the last clock, and its number in [clocks]. */
    private var lastTick = -1L
    private var lastTickSeq = -1L
    private var stopped = false
    private var barKnown = false
    /** The last fitted tempo, ns a clock, held over a [drop] (NaN: none yet). */
    private var held = Double.NaN

    /** Feeds one event; a [Beat] when it is a clock that lands on a beat. */
    @Synchronized
    fun onMidi(e: MidiEvent): Beat? {
        when (e) {
            is MidiEvent.Clock -> {
                val prev = clocks.lastOrNull()
                if (prev != null && e.time - prev.second > LiveMirror.CLOCK_TIMEOUT_NS) drop()
                clocks.addLast(++seq to e.time)
                while (clocks.size > window) clocks.removeFirst()
                if (stopped) return null
                val tick = nextTick++
                lastTick = tick
                lastTickSeq = seq
                if (tick % Tempo.TICKS_PER_BEAT != 0L) return null
                val index = tick / Tempo.TICKS_PER_BEAT
                return Beat(index, e.time, barKnown && index % Tempo.BEATS_PER_BAR == 0L)
            }
            is MidiEvent.Start -> {
                // As LiveMirror: a gap before Start would drag the fit.
                drop()
                nextTick = 0
                lastTick = -1
                stopped = false
                barKnown = true
            }
            is MidiEvent.Continue -> {
                drop()
                stopped = false
            }
            is MidiEvent.Stop -> stopped = true
            else -> Unit
        }
        return null
    }

    /** Clears the clocks, holding the tempo they gave. */
    private fun drop() {
        slopeOf()?.let { held = it }
        clocks.clear()
    }

    /** The clocks' fitted ns a clock (least squares), or null under [MIN_CLOCKS]. */
    private fun slopeOf(): Double? {
        if (clocks.size < MIN_CLOCKS) return null
        val n0 = clocks.first().first
        val t0 = clocks.first().second
        var sx = 0.0
        var sy = 0.0
        for ((n, t) in clocks) {
            sx += (n - n0).toDouble()
            sy += (t - t0).toDouble()
        }
        val mx = sx / clocks.size
        val my = sy / clocks.size
        var sxy = 0.0
        var sxx = 0.0
        for ((n, t) in clocks) {
            val dx = (n - n0) - mx
            sxy += dx * ((t - t0) - my)
            sxx += dx * dx
        }
        return (sxy / sxx).takeIf { it > 0 }
    }

    /** The beats at [now], or null while the tempo isn't known. */
    @Synchronized
    fun grid(now: Long): BeatGrid? {
        if (clocks.isEmpty() || now - clocks.last().second > LiveMirror.CLOCK_TIMEOUT_NS) return null
        // Too few clocks since a Start: the tempo held from before it, laid through them.
        val slope = slopeOf() ?: held.takeIf { clocks.size < MIN_CLOCKS && !it.isNaN() } ?: return null
        // time = t0 + mean + slope * (n - meanN), in Doubles relative to the first clock.
        val n0 = clocks.first().first
        val t0 = clocks.first().second
        var sx = 0.0
        var sy = 0.0
        for ((n, t) in clocks) {
            sx += (n - n0).toDouble()
            sy += (t - t0).toDouble()
        }
        val mx = sx / clocks.size
        val my = sy / clocks.size
        fun timeOf(n: Long) = t0 + Math.round(my + slope * ((n - n0) - mx))
        // Beats go by the play count when the last clock was counted (as onMidi's do),
        // else (clocks while stopped) by clock number.
        val lastN = clocks.last().first
        val counted = lastTick >= 0 && lastTickSeq == lastN
        val count = if (counted) lastTick else lastN
        val beatIndex = Math.floorDiv(count, Tempo.TICKS_PER_BEAT.toLong())
        val beatN = lastN - (count - beatIndex * Tempo.TICKS_PER_BEAT)
        return BeatGrid(timeOf(beatN), beatIndex, slope * Tempo.TICKS_PER_BEAT, counted && barKnown)
    }

    @Synchronized
    fun reset() {
        clocks.clear()
        seq = 0
        nextTick = 0
        lastTick = -1
        lastTickSeq = -1
        stopped = false
        barKnown = false
        held = Double.NaN
    }
}
