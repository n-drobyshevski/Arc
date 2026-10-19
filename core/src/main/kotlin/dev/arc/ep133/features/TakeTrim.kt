package dev.arc.ep133.features

import kotlin.math.max
import kotlin.math.min

/**
 * A take's trim (an addition): the frames from [start] to [end] (exclusive)
 * that SHARE, SAVE, EP and PLAY use. Nothing is cut: the take's file stays
 * whole and the trim is kept beside it as text ([text]), so RESET brings the
 * whole take back.
 */
data class TakeTrim(val start: Long, val end: Long) {
    val frames get() = end - start

    /** As kept in the take's .trim file: "start end". */
    fun text() = "$start $end"

    /** The trim as an upload's frames (the Device tab's TRIM). */
    fun range(): IntRange = start.toInt() until end.toInt()

    companion object {
        /** The shortest part a trim keeps. */
        const val MIN_SECONDS = 0.1

        /** The shortest part, in frames, at [rate]. */
        fun minFrames(rate: Int): Long = max(1L, (MIN_SECONDS * rate).toLong())

        /**
         * [start] to [end] in a take of [total] frames at [rate]: kept inside
         * it, at least [MIN_SECONDS] long (the end moves, else the start), or
         * null when that is the whole take.
         */
        fun of(start: Long, end: Long, total: Long, rate: Int): TakeTrim? {
            if (total <= 0) return null
            val least = min(minFrames(rate), total)
            var s = start.coerceIn(0, total - least)
            var e = end.coerceIn(0, total)
            if (e - s < least) {
                e = min(total, s + least)
                s = e - least
            }
            return if (s == 0L && e == total) null else TakeTrim(s, e)
        }

        /** A .trim file's text for a take of [total] frames: null when it isn't one, or is the whole take. */
        fun parse(text: String, total: Long, rate: Int): TakeTrim? {
            val parts = text.trim().split(Regex("\\s+"))
            if (parts.size != 2) return null
            val s = parts[0].toLongOrNull() ?: return null
            val e = parts[1].toLongOrNull() ?: return null
            if (e <= s) return null
            return of(s, e, total, rate)
        }

        /** [columns] min/max pairs of interleaved [pcm] across its channels, for the glass's wave. */
        fun peaks(pcm: ShortArray, channels: Int, columns: Int): List<Peak> {
            val ch = max(1, channels)
            val n = pcm.size / ch
            if (n == 0 || columns <= 0) return List(max(0, columns)) { Peak(0f, 0f) }
            return List(columns) { col ->
                val from = (col.toLong() * n / columns).toInt()
                val to = max(from + 1, ((col + 1).toLong() * n / columns).toInt()).coerceAtMost(n)
                var lo = 0
                var hi = 0
                // Long columns are sampled with a stride; the shape is what matters here.
                val step = max(1, (to - from) / 256)
                var f = from
                while (f < to) {
                    for (c in 0 until ch) {
                        val v = pcm[f * ch + c].toInt()
                        lo = min(lo, v)
                        hi = max(hi, v)
                    }
                    f += step
                }
                Peak(lo / 32768f, hi / 32767f)
            }
        }
    }
}
