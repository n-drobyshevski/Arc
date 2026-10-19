package dev.arc.ep133.features

import dev.arc.ep133.protocol.Device
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.floor

/**
 * Where SAMPLE records from: the phone's mic, a resample of Live's own mix
 * (the device's RSP), or the EP-133's sound over USB audio (an addition on
 * the phone; experimental). [id] is the word kept in settings and sound names.
 */
enum class SampleSource(val id: String) {
    MIC("mic"),
    RSP("rsp"),
    USB("usb");

    companion object {
        fun of(id: String): SampleSource? = entries.firstOrNull { it.id == id }
    }
}

/** What SAMPLE's −/+ picks: a [source], recorded in mono or [stereo]. */
data class SampleInput(val source: SampleSource, val stereo: Boolean) {
    companion object {
        /** The device's −/+ order: MIC, MIC ST, RSP, RSP ST, USB, USB ST. */
        val ORDER: List<SampleInput> = SampleSource.entries.flatMap { listOf(SampleInput(it, false), SampleInput(it, true)) }

        /**
         * The input [step] presses of −/+ away from [from], in [ORDER] and
         * wrapping round both ways, counting only the inputs in [available]
         * (USB is left out while nothing is plugged in, a stereo mic on a
         * phone with one mic). From an input that isn't available, the
         * first press lands on the next one that is; [from] itself when
         * none are.
         */
        fun cycle(available: List<SampleInput>, from: SampleInput, step: Int): SampleInput {
            if (ORDER.none { it in available }) return from
            if (step == 0) return if (from in available) from else cycle(available, from, 1)
            val dir = if (step > 0) 1 else -1
            var i = ORDER.indexOf(from)
            repeat(abs(step)) {
                do {
                    i = Math.floorMod(i + dir, ORDER.size)
                } while (ORDER[i] !in available)
            }
            return ORDER[i]
        }
    }
}

/**
 * How long a take can be, as on the EP-133 (OS 2.5): 20 s in stereo, 40 s in
 * mono. Both come to the same bytes once the device holds them at 46875 Hz,
 * which is what the free-space checks count.
 */
object SampleLimits {
    const val MAX_STEREO_S = 20
    const val MAX_MONO_S = 40

    fun maxSeconds(stereo: Boolean): Int = if (stereo) MAX_STEREO_S else MAX_MONO_S

    /** The longest take in frames at [rate]. */
    fun maxFrames(stereo: Boolean, rate: Int): Int = maxSeconds(stereo) * rate

    /**
     * The bytes [frames] at [rate] take on the device: 16-bit samples at the
     * rate it keeps them at, since uploads above 46875 Hz are resampled down
     * to it and slower ones go up as they are.
     */
    fun deviceBytes(frames: Long, rate: Int, channels: Int): Long =
        frames * stored(rate) / rate * 2 * channels

    /**
     * Whether a full-length take in mono or [stereo] won't fit in [free]
     * bytes on the device: SAMPLE shows "Disk low" then. False while the
     * free space isn't known.
     */
    fun lowSpace(free: Double?, stereo: Boolean): Boolean {
        if (free == null) return false
        val channels = if (stereo) 2 else 1
        return free < deviceBytes(maxFrames(stereo, Device.MAX_SAMPLE_RATE).toLong(), Device.MAX_SAMPLE_RATE, channels)
    }

    /**
     * The longest take in frames at [rate] that fits in [free] bytes on the
     * device, to cap a take with when space is low; null while the free
     * space isn't known.
     */
    fun framesThatFit(free: Double?, channels: Int, rate: Int): Int? {
        if (free == null) return null
        val onDevice = floor(maxOf(free, 0.0) / (2 * channels)).toLong()
        return (onDevice * rate / stored(rate)).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }

    private fun stored(rate: Int): Int = minOf(rate, Device.MAX_SAMPLE_RATE)
}

/**
 * The name a new recording goes on the EP-133 with (an addition): the
 * source's word and when it was made, "mic 1007-142301" (month, day, then
 * the time to the second), so takes sort by when they were made and fit the
 * device's [Device.MAX_SOUND_NAME] characters.
 */
object SampleName {
    private val STAMP = DateTimeFormatter.ofPattern("MMdd-HHmmss")

    fun of(source: SampleSource, nowMs: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        "${source.id} ${STAMP.withZone(zone).format(Instant.ofEpochMilli(nowMs))}".take(Device.MAX_SOUND_NAME)
}

/**
 * The frames [bars] bars of 4/4 last at [bpm] and [rate], for a take of a set
 * length; rounded half up, as the web twin does.
 */
fun barFrames(bars: Int, bpm: Double, rate: Int): Long =
    floor(bars * Tempo.BEATS_PER_BAR * 60.0 * rate / bpm + 0.5).toLong()
