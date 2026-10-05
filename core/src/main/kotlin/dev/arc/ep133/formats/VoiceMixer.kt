package dev.arc.ep133.formats

import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.pow

/**
 * Live's pads and keys mixed into one stereo stream (an addition), so they
 * play through a single output that is always open: starting a sound is
 * adding a voice, not opening a track. Each voice is a sound read at its own
 * speed: its sample rate against the output's, times the pitch (KEYS reads a
 * sound faster to play it higher, as a sampler does, so higher is shorter).
 *
 * A voice sounds until it is released (a gate), then fades out over
 * [FADE_MS]; it sounds at least [MIN_GATE_MS], so the quickest tap is heard.
 * The same key again cuts the old voice short with a click-free fade, and past
 * [maxVoices] the oldest does the same: the oldest let go of first, then the
 * oldest still held, so a run up the keys keeps the other hand's chord.
 *
 * [start], [release] and [stopAll] may be called from any thread; they take
 * effect at the next [render], which only the output's thread calls.
 */
class VoiceMixer(val outRate: Int, val maxVoices: Int = MAX_VOICES) {
    companion object {
        const val MAX_VOICES = 8
        const val MIN_GATE_MS = 60
        const val FADE_MS = 24
        /** A voice cut short (the same key again, or too many) fades this fast. */
        const val CHOKE_MS = 3

        /** How much faster a sound is read to play [semitones] higher. */
        fun pitchRatio(semitones: Int): Double = 2.0.pow(semitones / 12.0)
    }

    /** A voice that began in the last [render]: its [tag] (the caller's), at output frame [frame]. */
    data class Started(val key: String, val tag: Long, val frame: Long)

    private sealed interface Command {
        class Start(val key: String, val pcm: ShortArray, val channels: Int, val step: Double, val tag: Long) : Command
        class Release(val key: String) : Command
        data object StopAll : Command
    }

    private class Voice(val key: String, val pcm: ShortArray, val channels: Int, val step: Double, val startFrame: Long) {
        val frames = pcm.size / channels
        var pos = 0.0
        /** The output frame the fade starts at; [Long.MAX_VALUE] while held. */
        var fadeAt = Long.MAX_VALUE
        var fadeFrames = 1
        /** Cut short: no longer the voice of its key. */
        var choked = false
    }

    private val commands = ConcurrentLinkedQueue<Command>()
    private val voices = ArrayList<Voice>()
    private var mix = FloatArray(0)
    private val minGate = MIN_GATE_MS * outRate / 1000L
    private val fade = maxOf(1, FADE_MS * outRate / 1000)
    private val choke = maxOf(1, CHOKE_MS * outRate / 1000)

    /** Output frames rendered so far. */
    var frame = 0L
        private set

    /** Voices that began in the last [render]. */
    val started = ArrayList<Started>()

    /** The keys sounding (and not cut short) after the last [render]. */
    var keys: Set<String> = emptySet()
        private set

    /**
     * Plays [pcm] (16-bit, [channels] interleaved, at [sampleRate]) as voice
     * [key], [semitones] from its own pitch, until [release]. [tag] comes back
     * in [started].
     */
    fun start(key: String, pcm: ShortArray, channels: Int, sampleRate: Int, semitones: Int = 0, tag: Long = 0) {
        require(channels in 1..2) { "channels: $channels" }
        commands.add(Command.Start(key, pcm, channels, sampleRate.toDouble() / outRate * pitchRatio(semitones), tag))
    }

    /** Lets go of voice [key]: it fades out now, or once it has sounded [MIN_GATE_MS]. */
    fun release(key: String) {
        commands.add(Command.Release(key))
    }

    /** Fades every voice out quickly. */
    fun stopAll() {
        commands.add(Command.StopAll)
    }

    /** Mixes the next [frames] stereo frames into [out] (left, right, …). */
    fun render(out: ShortArray, frames: Int) {
        started.clear()
        while (true) apply(commands.poll() ?: break)
        if (mix.size < frames * 2) mix = FloatArray(frames * 2)
        java.util.Arrays.fill(mix, 0, frames * 2, 0f)
        val it = voices.iterator()
        while (it.hasNext()) if (!play(it.next(), frames)) it.remove()
        for (i in 0 until frames * 2) out[i] = mix[i].coerceIn(-32768f, 32767f).toInt().toShort()
        frame += frames
        val now = voices.filterNot { it.choked }.mapTo(LinkedHashSet()) { it.key }
        if (now != keys) keys = now
    }

    private fun apply(c: Command) {
        when (c) {
            is Command.Start -> {
                if (c.pcm.size < c.channels) return
                voices.filter { it.key == c.key && !it.choked }.forEach(::cut)
                while (voices.count { !it.choked } >= maxVoices) {
                    cut(voices.firstOrNull { !it.choked && it.fadeAt != Long.MAX_VALUE } ?: voices.first { !it.choked })
                }
                voices += Voice(c.key, c.pcm, c.channels, c.step, frame)
                started += Started(c.key, c.tag, frame)
            }
            is Command.Release -> voices.filter { it.key == c.key && !it.choked && it.fadeAt == Long.MAX_VALUE }.forEach {
                it.fadeAt = maxOf(frame, it.startFrame + minGate)
                it.fadeFrames = fade
            }
            Command.StopAll -> voices.filterNot { it.choked }.forEach(::cut)
        }
    }

    /** Cuts [v] short: from wherever its level is now, down to nothing in [CHOKE_MS]. */
    private fun cut(v: Voice) {
        v.choked = true
        val g = gain(v, frame)
        v.fadeFrames = choke
        v.fadeAt = frame - ((1f - g) * choke).toLong()
    }

    private fun gain(v: Voice, at: Long): Float = if (at < v.fadeAt) 1f else 1f - (at - v.fadeAt).toFloat() / v.fadeFrames

    /** Adds [frames] of [v] to the mix; false once it has ended. */
    private fun play(v: Voice, frames: Int): Boolean {
        val last = v.frames - 1
        val pcm = v.pcm
        val ch = v.channels
        for (i in 0 until frames) {
            val p = v.pos
            if (p > last) return false
            val at = frame + i
            val gain = gain(v, at)
            if (gain <= 0f) return false
            val i0 = p.toInt()
            val i1 = minOf(i0 + 1, last)
            val frac = (p - i0).toFloat()
            val l0 = pcm[i0 * ch].toFloat()
            val l = l0 + (pcm[i1 * ch] - l0) * frac
            val r = if (ch == 2) {
                val r0 = pcm[i0 * 2 + 1].toFloat()
                r0 + (pcm[i1 * 2 + 1] - r0) * frac
            } else {
                l
            }
            mix[2 * i] += l * gain
            mix[2 * i + 1] += r * gain
            v.pos = p + v.step
        }
        return true
    }
}
