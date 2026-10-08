package dev.arc.ep133.formats

import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.pow

/** How a voice answers its release and the same key again (the EP-133's play modes, plus arc's gate). */
enum class VoiceMode {
    /** Sounds while held (at least [VoiceMixer.MIN_GATE_MS]), then fades; the same key again cuts it: arc's own way. */
    GATE,

    /** Plays to the end of the sound, release or not; the same key again cuts it and starts over. */
    ONESHOT,

    /** Gated like [GATE], but the same key again adds a voice beside the one still sounding. */
    KEY,

    /** Gated like [GATE]; the same key again while held only changes the pitch, carrying on where the sound is. */
    LEGATO,
}

/**
 * How one voice plays its sound (an addition): a pad's SOUND EDIT settings on
 * the EP-133, as the mixer takes them. [DEFAULT] plays a sound as the mixer
 * always has: its own pitch and level, centred, whole, no attack, the usual
 * release, gated.
 *
 * [semitones] adds to [VoiceMixer.start]'s (±12, may be fractional); [gain]
 * is linear, 0..1; [pan] is a balance, -16 (left) to 16 (right): the left
 * side's gain is min(1, (16 - pan) / 16), the right's min(1, (16 + pan) / 16).
 * [start] and [end] trim the sound, in its own frames: reading starts at
 * [start] and stops before [end] (clamped to the sound); an [end] at or before
 * [start] leaves nothing, and nothing plays, as with an empty sound. [attackMs]
 * fades the voice in from silence, linearly; [releaseMs] is the fade after
 * release, never shorter than [VoiceMixer.FADE_MS]. [mode] says how release
 * and the same key again are taken ([VoiceMode]). A [muteGroup] above 0 cuts
 * every other sounding voice of the same group as this one starts (in
 * [VoiceMixer.CHOKE_MS]), as an open hi-hat is choked by the closed one.
 */
data class VoiceShape(
    val semitones: Double = 0.0,
    val gain: Float = 1f,
    val pan: Int = 0,
    val start: Int = 0,
    val end: Int = Int.MAX_VALUE,
    val attackMs: Int = 0,
    val releaseMs: Int = VoiceMixer.FADE_MS,
    val mode: VoiceMode = VoiceMode.GATE,
    val muteGroup: Int = 0,
) {
    companion object {
        /** The mixer's own way of playing a sound. */
        val DEFAULT = VoiceShape()
    }
}

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
 * A press that turns out to be a scroll is [cut]: it fades out over
 * [CHOKE_MS] at once, minimum gate or not.
 *
 * Each voice also has a shape ([VoiceShape], an addition): the pad's own
 * pitch, level, pan, trim, attack and release, its play mode and its mute
 * group, so a pad plays as the EP-133 plays it. Its level at each frame is
 * the attack's ramp times the fade's level times the shape's gain, then the
 * pan's per side; a cut fades from the fade's level, as without a shape. The
 * modes change what the paragraph above says: a [VoiceMode.ONESHOT] voice
 * ignores its release and plays to its end; a [VoiceMode.KEY] voice isn't cut
 * by the same key again (a new voice joins it, and [release] and [cut] take
 * all of the key's voices); a [VoiceMode.LEGATO] start on a key whose legato
 * voice is still held, on the same sound, starts no voice: the held one takes
 * the new pitch where it is (on another sound it starts over, as gated). The
 * [DEFAULT] shape plays exactly as before shapes.
 *
 * A start or a release may also be timed (an addition, for the pattern
 * sequencer): given an output frame, it waits for that frame and takes effect
 * there, inside a render if need be (the render plays up to it, applies it,
 * and goes on), so a note lands on its frame rather than on a block's edge.
 * One whose frame has already passed takes effect at the next render's start,
 * after the commands that aren't timed. A timed release may name a tag: it
 * then lets go of only the voices started with that tag, so the sequencer's
 * note-off never ends a press of the same pad. [flushTimed] drops the timed
 * commands still waiting. Without timed commands a render plays exactly as
 * before them.
 *
 * [start], [release], [cut], [stopAll] and [flushTimed] may be called from
 * any thread; they take effect at the next [render], which only the output's
 * thread calls. [render] allocates nothing unless a voice starts, a timed
 * command waits, or [keys] changes, so the output's thread doesn't feed the
 * garbage collector.
 */
class VoiceMixer(val outRate: Int, val maxVoices: Int = MAX_VOICES) {
    companion object {
        const val MAX_VOICES = 8
        const val MIN_GATE_MS = 60
        const val FADE_MS = 24
        /** A voice cut short (the same key again, too many, [cut] or its mute group) fades this fast. */
        const val CHOKE_MS = 3
        /** [VoiceShape.pan]'s reach either way. */
        const val PAN_MAX = 16
        /** A command's frame when it isn't timed: it takes effect at the next [render]'s start. */
        const val NOW = Long.MIN_VALUE

        /** How much faster a sound is read to play [semitones] higher. */
        fun pitchRatio(semitones: Double): Double = 2.0.pow(semitones / 12.0)

        /** [pitchRatio] in whole semitones: the same double as the [Double] one. */
        fun pitchRatio(semitones: Int): Double = pitchRatio(semitones.toDouble())
    }

    /**
     * A voice that began in the last [render]: its [tag] (the caller's), at
     * output frame [frame] (a timed start's own, unless it came late). A
     * legato start that only changed a held voice's pitch is reported too,
     * with its own tag, at the frame the pitch changed.
     */
    data class Started(val key: String, val tag: Long, val frame: Long)

    /** [at]: the output frame a timed command waits for, [NOW] for none. */
    private sealed interface Command {
        val at: Long get() = NOW

        class Start(
            val key: String,
            val pcm: ShortArray,
            val channels: Int,
            val step: Double,
            val tag: Long,
            val shape: VoiceShape,
            override val at: Long,
        ) : Command

        /** [tag] other than 0: only the voices started with it. */
        class Release(val key: String, override val at: Long, val tag: Long) : Command
        class Cut(val key: String) : Command
        data object StopAll : Command
        data object FlushTimed : Command
    }

    /**
     * A voice: [pcm] read from frame [first] to before [end], [level] and the
     * pan's [left] and [right] its gains, faded in over [attack] frames and
     * out over [release] after its gate.
     */
    private class Voice(
        val key: String,
        var tag: Long,
        val pcm: ShortArray,
        val channels: Int,
        var step: Double,
        val startFrame: Long,
        first: Int,
        val end: Int,
        val level: Float,
        val left: Float,
        val right: Float,
        val attack: Int,
        val release: Int,
        val mode: VoiceMode,
        val group: Int,
    ) {
        var pos = first.toDouble()
        /** The output frame the fade starts at; [Long.MAX_VALUE] while held. */
        var fadeAt = Long.MAX_VALUE
        var fadeFrames = 1
        /** Cut short: no longer the voice of its key. */
        var choked = false
        /** Released (a [VoiceMode.ONESHOT] voice too, though it plays on): stolen before voices still held. */
        var letGo = false
    }

    private val commands = ConcurrentLinkedQueue<Command>()
    // Timed commands waiting for their frame: by frame, then as they came (the output's thread only).
    private val pending = ArrayList<Command>()
    private val voices = ArrayList<Voice>()
    private var mix = FloatArray(0)
    private val minGate = MIN_GATE_MS * outRate / 1000L
    private val fade = maxOf(1, FADE_MS * outRate / 1000)
    private val choke = maxOf(1, CHOKE_MS * outRate / 1000)

    /** Output frames rendered so far. */
    var frame = 0L
        private set

    /** Voices that began in the last [render]; the same list each time, read it on the output's thread. */
    val started = ArrayList<Started>()

    /** The keys sounding (and not cut short) after the last [render]: a new set only when they change. */
    var keys: Set<String> = emptySet()
        private set

    /**
     * Plays [pcm] (16-bit, [channels] interleaved, at [sampleRate]) as voice
     * [key], [semitones] (plus [shape]'s) from its own pitch, shaped by
     * [shape], until [release]. [tag] comes back in [started]. Timed, it
     * starts at output frame [at] ([NOW]: at the next render).
     */
    fun start(
        key: String,
        pcm: ShortArray,
        channels: Int,
        sampleRate: Int,
        semitones: Int = 0,
        tag: Long = 0,
        shape: VoiceShape = VoiceShape.DEFAULT,
        at: Long = NOW,
    ) {
        require(channels in 1..2) { "channels: $channels" }
        val step = sampleRate.toDouble() / outRate * pitchRatio(semitones + shape.semitones)
        commands.add(Command.Start(key, pcm, channels, step, tag, shape, at))
    }

    /**
     * Lets go of voice [key] (every one of a [VoiceMode.KEY] key): it fades
     * out now, or once it has sounded [MIN_GATE_MS]. A [VoiceMode.ONESHOT]
     * voice plays on. Timed, it lets go at output frame [at]; a [tag] other
     * than 0 lets go of only the voices started with that tag.
     */
    fun release(key: String, at: Long = NOW, tag: Long = 0) {
        commands.add(Command.Release(key, at, tag))
    }

    /** Ends voice [key] (all of its voices) now, in [CHOKE_MS], even inside its [MIN_GATE_MS]: the press was a scroll. */
    fun cut(key: String) {
        commands.add(Command.Cut(key))
    }

    /** Fades every voice out quickly. */
    fun stopAll() {
        commands.add(Command.StopAll)
    }

    /** Drops the timed starts and releases still waiting for their frame; those sent after it wait as usual. */
    fun flushTimed() {
        commands.add(Command.FlushTimed)
    }

    /**
     * Mixes the next [frames] stereo frames into [out] (left, right, …): the
     * commands first, then the timed ones already due, then the voices up to
     * the next timed command's frame inside the render, that command, and on.
     */
    fun render(out: ShortArray, frames: Int) {
        started.clear()
        while (true) take(commands.poll() ?: break)
        if (mix.size < frames * 2) mix = FloatArray(frames * 2)
        java.util.Arrays.fill(mix, 0, frames * 2, 0f)
        val end = frame + frames
        var done = 0
        while (true) {
            applyDue()
            val next = if (pending.isEmpty()) end else minOf(end, pending[0].at)
            val n = (next - frame).toInt()
            if (n > 0) {
                playAll(done, n)
                done += n
                frame += n
            }
            if (frame >= end) break
        }
        for (i in 0 until frames * 2) out[i] = mix[i].coerceIn(-32768f, 32767f).toInt().toShort()
        if (keysChanged()) keys = voices.filterNot { it.choked }.mapTo(LinkedHashSet()) { it.key }
    }

    /** A command off the queue: applied now or, timed, kept until its frame, behind those already waiting for it. */
    private fun take(c: Command) {
        if (c.at == NOW) return apply(c)
        var i = pending.size
        while (i > 0 && pending[i - 1].at > c.at) i--
        pending.add(i, c)
    }

    /** Applies the timed commands whose frame has come (or gone), in order. */
    private fun applyDue() {
        var n = 0
        while (n < pending.size && pending[n].at <= frame) n++
        if (n == 0) return
        for (i in 0 until n) apply(pending[i])
        // Moved down in place: no view, no copy.
        for (i in n until pending.size) pending[i - n] = pending[i]
        while (n-- > 0) pending.removeAt(pending.size - 1)
    }

    /** Adds the next [frames] of every voice to the mix, from its frame [offset]; ended voices are dropped. */
    private fun playAll(offset: Int, frames: Int) {
        // Ended voices dropped in place, by index: no iterator, no copy.
        var kept = 0
        for (i in voices.indices) {
            val v = voices[i]
            if (play(v, offset, frames)) voices[kept++] = v
        }
        while (voices.size > kept) voices.removeAt(voices.size - 1)
    }

    /**
     * Whether the voices not cut short differ from [keys], without building a
     * set. A [VoiceMode.KEY] key may have several such voices: each key is
     * counted at its first.
     */
    private fun keysChanged(): Boolean {
        var n = 0
        for (i in voices.indices) {
            val v = voices[i]
            if (v.choked || keyBefore(i)) continue
            if (v.key !in keys) return true
            n++
        }
        return n != keys.size
    }

    /** Whether a voice before [index], not cut short, has its key. */
    private fun keyBefore(index: Int): Boolean {
        val key = voices[index].key
        for (i in 0 until index) {
            val v = voices[i]
            if (!v.choked && v.key == key) return true
        }
        return false
    }

    private fun apply(c: Command) {
        when (c) {
            is Command.Start -> {
                if (c.pcm.size < c.channels) return
                val shape = c.shape
                val frames = c.pcm.size / c.channels
                val first = shape.start.coerceIn(0, frames)
                val end = shape.end.coerceIn(first, frames)
                // Trimmed to nothing: as an empty sound.
                if (end <= first) return
                if (shape.mode == VoiceMode.LEGATO && legato(c)) return
                if (shape.mode != VoiceMode.KEY) cutKey(c.key)
                if (shape.muteGroup > 0) {
                    for (i in voices.indices) {
                        val v = voices[i]
                        if (v.group == shape.muteGroup && !v.choked) cut(v)
                    }
                }
                while (voices.count { !it.choked } >= maxVoices) {
                    cut(voices.firstOrNull { !it.choked && (it.letGo || it.fadeAt != Long.MAX_VALUE) } ?: voices.first { !it.choked })
                }
                val pan = shape.pan.coerceIn(-PAN_MAX, PAN_MAX)
                voices += Voice(
                    c.key, c.tag, c.pcm, c.channels, c.step, frame, first, end,
                    level = shape.gain.coerceIn(0f, 1f),
                    left = minOf(1f, (PAN_MAX - pan) / PAN_MAX.toFloat()),
                    right = minOf(1f, (PAN_MAX + pan) / PAN_MAX.toFloat()),
                    attack = framesOf(shape.attackMs),
                    release = maxOf(fade, framesOf(shape.releaseMs)),
                    mode = shape.mode,
                    group = shape.muteGroup,
                )
                started += Started(c.key, c.tag, frame)
            }
            is Command.Release -> for (i in voices.indices) {
                val v = voices[i]
                if (v.key != c.key || v.choked || (c.tag != 0L && v.tag != c.tag)) continue
                v.letGo = true
                if (v.fadeAt != Long.MAX_VALUE || v.mode == VoiceMode.ONESHOT) continue
                v.fadeAt = maxOf(frame, v.startFrame + minGate)
                v.fadeFrames = v.release
            }
            is Command.Cut -> cutKey(c.key)
            Command.StopAll -> for (i in voices.indices) if (!voices[i].choked) cut(voices[i])
            Command.FlushTimed -> pending.clear()
        }
    }

    /**
     * A legato start: when [c]'s key has a legato voice still held on the same
     * sound, that voice takes [c]'s pitch and tag where it is (its other
     * voices, if any, are cut) and true comes back; false when a voice is to
     * start.
     */
    private fun legato(c: Command.Start): Boolean {
        var held: Voice? = null
        for (i in voices.indices) {
            val v = voices[i]
            if (v.key == c.key && !v.choked && v.fadeAt == Long.MAX_VALUE && v.mode == VoiceMode.LEGATO) held = v
        }
        val v = held ?: return false
        if (v.pcm !== c.pcm || v.channels != c.channels) return false
        for (i in voices.indices) {
            val o = voices[i]
            if (o !== v && o.key == c.key && !o.choked) cut(o)
        }
        v.step = c.step
        v.tag = c.tag
        started += Started(c.key, c.tag, frame)
        return true
    }

    /** [ms] in output frames (0 for less than none). */
    private fun framesOf(ms: Int): Int = minOf(Int.MAX_VALUE.toLong(), maxOf(0, ms).toLong() * outRate / 1000).toInt()

    /** Cuts short the voices of [key], if any sound. */
    private fun cutKey(key: String) {
        for (i in voices.indices) {
            val v = voices[i]
            if (v.key == key && !v.choked) cut(v)
        }
    }

    /** Cuts [v] short: from wherever its fade's level is now, down to nothing in [CHOKE_MS]. */
    private fun cut(v: Voice) {
        v.choked = true
        val g = gain(v, frame)
        v.fadeFrames = choke
        v.fadeAt = frame - ((1f - g) * choke).toLong()
    }

    /** The fade's level at output frame [at]: 1 until it starts, then down to 0. */
    private fun gain(v: Voice, at: Long): Float = if (at < v.fadeAt) 1f else 1f - (at - v.fadeAt).toFloat() / v.fadeFrames

    /** The attack's level at output frame [at]: up from 0 to 1 over [Voice.attack] frames. */
    private fun ramp(v: Voice, at: Long): Float {
        val since = at - v.startFrame
        return if (since >= v.attack) 1f else since.toFloat() / v.attack.toFloat()
    }

    /** Adds [frames] of [v] to the mix from its frame [offset] (output frame [frame]); false once it has ended. */
    private fun play(v: Voice, offset: Int, frames: Int): Boolean {
        val last = v.end - 1
        val pcm = v.pcm
        val ch = v.channels
        for (i in 0 until frames) {
            val p = v.pos
            if (p > last) return false
            val at = frame + i
            val fadeGain = gain(v, at)
            if (fadeGain <= 0f) return false
            val gain = ramp(v, at) * fadeGain * v.level
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
            mix[2 * (offset + i)] += l * gain * v.left
            mix[2 * (offset + i) + 1] += r * gain * v.right
            v.pos = p + v.step
        }
        return true
    }
}
