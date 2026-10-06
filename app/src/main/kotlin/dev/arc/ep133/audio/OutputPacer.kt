package dev.arc.ep133.audio

/**
 * When a stream output takes its next burst (an addition), so a burst is
 * rendered just before it is needed rather than rendered and then left to
 * wait in a blocking write: from the frames written against the output's
 * play head, it says to write now, to wait (how long), or to write the old
 * way, blocking. Pure arithmetic, fed by [BurstOutput]; no Android in it.
 *
 * A play head that stands still while the output should have room, or one
 * that is past what was written, is not trusted: a still head gets one
 * blocking write at a time ([BLOCK]), and three in a row without it moving,
 * or a head that isn't sane, make the stream block for good ([blocking]).
 *
 * The buffer grows a burst when the output runs dry, and after [DECAY_NS]
 * without that steps back down a burst, never under [floor].
 *
 * [old]: the way it was before this pacing, for the debug screen's latency
 * test: every burst written blocking from the start, and a buffer that only
 * grows.
 */
internal class OutputPacer(val burst: Int, val rate: Int, private val floor: Int, private val old: Boolean = false) {
    companion object {
        /** [next]: write a burst now, without blocking. */
        const val WRITE = 0L

        /** [next]: write a burst now, blocking until the output takes it (as before this pacing). */
        const val BLOCK = -1L

        /** A buffer grown after the output ran dry shrinks again after this long without it running dry. */
        const val DECAY_NS = 10_000_000_000L

        /** Blocking writes in a row, the head standing still across them, before the stream blocks for good. */
        const val MAX_STALLS = 3

        // No time yet.
        private const val NONE = Long.MIN_VALUE
    }

    val burstNanos = burst * 1_000_000_000L / rate

    /** How long the head may stand still while a burst waits for room: a few bursts, at least 20 ms. */
    val stallNanos = maxOf(4 * burstNanos, 20_000_000L)

    /** Frames handed to the output so far. */
    var written = 0L
        private set

    /** The play head can't be trusted (or [old]): every burst is written blocking from now on. */
    var blocking = old
        private set

    // The play head, unwrapped (the output's counter is 32 bits), and its last raw value.
    private var head = 0L
    private var lastRaw = 0
    // Since when the burst waits with the head still (NONE: not waiting), and blocking writes in a row.
    private var waitingSince = NONE
    private var stalls = 0
    // The underruns seen, and when the buffer last changed or ran dry.
    private var underruns = 0
    private var changedAt = NONE

    /**
     * What to do now, the output's play head at [rawHead] and its buffer
     * [size] frames: [WRITE], [BLOCK], or the nanoseconds to wait before asking again.
     */
    fun next(rawHead: Int, size: Int, now: Long): Long {
        if (blocking) return BLOCK
        val moved = (rawHead - lastRaw).toLong() and 0xFFFFFFFFL
        if (head + moved > written) {
            // Past what was written (or gone backwards, read unsigned): not a head to pace by.
            blocking = true
            return BLOCK
        }
        if (moved != 0L) {
            head += moved
            lastRaw = rawHead
            stalls = 0
            if (waitingSince != NONE) waitingSince = now
        }
        // A buffer under a burst (a phone that rounds it down) still takes one at a time.
        val room = maxOf(size, burst) - (written - head)
        if (room >= burst) {
            waitingSince = NONE
            return WRITE
        }
        if (waitingSince == NONE) waitingSince = now
        if (now - waitingSince > stallNanos) {
            waitingSince = NONE
            if (++stalls >= MAX_STALLS) blocking = true
            return BLOCK
        }
        // Until the burst's room is free, as the rate says; in steps of an eighth to half a burst.
        val need = (burst - room) * 1_000_000_000L / rate
        return need.coerceIn(burstNanos / 8, burstNanos / 2).coerceAtLeast(1L)
    }

    /** [frames] more were handed to the output. */
    fun wrote(frames: Int) {
        written += frames
    }

    /**
     * The buffer size to use, the output having run dry [underruns] times so
     * far: a burst more after a new one (within [capacity]), a burst less after
     * [DECAY_NS] without one (down to [floor], and never when [old]), else
     * [size] as it is.
     */
    fun resize(size: Int, capacity: Int, underruns: Int, now: Long): Int {
        if (changedAt == NONE) changedAt = now
        if (underruns > this.underruns) {
            this.underruns = underruns
            changedAt = now
            return if (size + burst <= capacity) size + burst else size
        }
        if (!old && size - burst >= floor && now - changedAt > DECAY_NS) {
            changedAt = now
            return size - burst
        }
        return size
    }
}
