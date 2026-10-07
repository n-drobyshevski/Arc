package dev.arc.ep133.features

import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow

/**
 * SAMPLE mode's input meter (an addition): the loudest sample of each block
 * goes in through [onBlock], and it reads out in dBFS, or 0..1 across
 * [FLOOR_DB]..0 dB for drawing. A peak holds for 300 ms, then falls at
 * 20 dB a second, so a short hit stays readable on a phone screen; a peak at
 * full scale lights [clip] for a second.
 *
 * Time is counted in input frames at [rate], not on a clock, so the meter
 * moves with the audio it was fed. Only the input's thread calls [onBlock];
 * the readings may be taken from any thread, as the meter is drawn.
 */
class PeakMeter(val rate: Int) {
    companion object {
        /** The bottom of the meter: quieter reads as this, and as 0 on the 0..1 scale. */
        const val FLOOR_DB = -60f

        /** How long a peak holds before it falls, in milliseconds. */
        const val HOLD_MS = 300

        /** How fast the level falls after the hold, in dB a second. */
        const val DECAY_DB_PER_S = 20.0

        /** A peak at or above this (0..1 of full scale) counts as clipping. */
        const val CLIP = 0.999f

        /** A linear level, 0..1 of full scale, in dBFS; silence reads [FLOOR_DB]. */
        fun toDb(linear: Float): Float =
            if (linear <= 0f) FLOOR_DB else max(FLOOR_DB.toDouble(), 20 * log10(linear.toDouble())).toFloat()

        /** A level in dBFS as linear, 0..1 of full scale: what a threshold set in dB compares samples against. */
        fun fromDb(db: Float): Float = 10.0.pow(db / 20.0).toFloat()

        /** Where [thresholdDb] sits on the 0..1 scale of [level01], for the meter's threshold mark. */
        fun markOf(thresholdDb: Float): Float = scale(thresholdDb.toDouble())

        private fun scale(db: Double): Float = ((db - FLOOR_DB) / -FLOOR_DB).coerceIn(0.0, 1.0).toFloat()
    }

    private val holdFrames = rate.toLong() * HOLD_MS / 1000

    // Volatile because the meter is drawn from the UI thread; the level is
    // kept as a Double so slow decays don't round away.
    @Volatile
    private var levelDb = FLOOR_DB.toDouble()

    @Volatile
    private var clipLeft = 0L

    private var holdLeft = 0L

    /** Whether a peak at full scale came in during the last second of input. */
    val clip: Boolean get() = clipLeft > 0

    /**
     * A block of [frames] frames whose loudest sample was [peak] (0..1 of
     * full scale). The block's time passes first, then its peak is taken as
     * if at its end, so a peak always holds for the full 300 ms.
     */
    fun onBlock(peak: Float, frames: Int) {
        val n = max(0, frames).toLong()
        var level = levelDb
        if (holdLeft >= n) {
            holdLeft -= n
        } else {
            val falling = n - holdLeft
            holdLeft = 0
            level = max(FLOOR_DB.toDouble(), level - DECAY_DB_PER_S * falling / rate)
        }
        val db = toDb(peak).toDouble()
        if (db >= level) {
            level = db
            holdLeft = holdFrames
        }
        levelDb = level
        clipLeft = if (peak >= CLIP) rate.toLong() else max(0L, clipLeft - n)
    }

    /** The held or falling level in dBFS, [FLOOR_DB] for silence. */
    fun dbfs(): Float = levelDb.toFloat()

    /** [dbfs] on a 0..1 scale across [FLOOR_DB]..0 dB, as the meter draws it; the same scale as [markOf]. */
    fun level01(): Float = scale(levelDb)

    /** Back to silence, with no clip lit: for a new input or a new take. */
    fun reset() {
        levelDb = FLOOR_DB.toDouble()
        holdLeft = 0
        clipLeft = 0
    }
}
