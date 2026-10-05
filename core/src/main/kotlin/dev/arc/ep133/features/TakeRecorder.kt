package dev.arc.ep133.features

/** Live's REC key: off, waiting for the first sound, or recording for [Recording.seconds]. */
sealed interface RecState {
    data object Idle : RecState
    data object Armed : RecState
    data class Recording(val seconds: Int) : RecState
}

/**
 * Which part of Live's mix goes into a take (an addition): REC arms it, the
 * first sound after that starts it (so a take has no silence in front, as on
 * the EP-133's sampler), and it runs until [stop] or [maxFrames]. Silence
 * after the last sound is left out when it stops.
 *
 * Only the output's thread calls it: [onBurst] once for each burst the mixer
 * renders, before the next.
 */
class TakeRecorder(val outRate: Int, val maxFrames: Long = MAX_SECONDS.toLong() * outRate) {
    companion object {
        /** Ten minutes: about 115 MB at 48 kHz stereo. */
        const val MAX_SECONDS = 600
    }

    enum class State { IDLE, ARMED, RECORDING }

    /** Record [frames] frames of the burst from frame [from]; [last] when the take reached [maxFrames] with them. */
    class Keep(val from: Int, val frames: Int, val last: Boolean)

    var state = State.IDLE
        private set

    /** Frames recorded so far. */
    var frames = 0L
        private set

    /** Frames up to the last one that isn't silent: what the take keeps. */
    var audible = 0L
        private set

    val seconds: Int get() = (frames / outRate).toInt()

    fun arm() {
        if (state != State.IDLE) return
        state = State.ARMED
        frames = 0
        audible = 0
    }

    /**
     * The burst just rendered: [frames] stereo frames in [out], the first at
     * mix frame [at]; [firstStart] is the earliest mix frame a voice began at
     * in it, if any did. Returns the part to record, or null for none.
     */
    fun onBurst(out: ShortArray, frames: Int, at: Long, firstStart: Long?): Keep? {
        val from = when (state) {
            State.IDLE -> return null
            State.ARMED -> {
                if (firstStart == null) return null
                state = State.RECORDING
                (firstStart - at).coerceIn(0, frames.toLong()).toInt()
            }
            State.RECORDING -> 0
        }
        val n = minOf((frames - from).toLong(), maxFrames - this.frames).toInt()
        for (i in n - 1 downTo 0) {
            val j = 2 * (from + i)
            if (out[j].toInt() != 0 || out[j + 1].toInt() != 0) {
                audible = this.frames + i + 1
                break
            }
        }
        this.frames += n
        val last = this.frames >= maxFrames
        if (last) state = State.IDLE
        return Keep(from, n, last)
    }

    /** Stops: the frames the take keeps, 0 when nothing was played since REC. */
    fun stop(): Long {
        val keep = if (state == State.ARMED) 0L else audible
        state = State.IDLE
        return keep
    }
}
