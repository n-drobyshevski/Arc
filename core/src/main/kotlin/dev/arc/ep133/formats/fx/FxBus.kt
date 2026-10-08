package dev.arc.ep133.formats.fx

import kotlin.math.abs

/**
 * What [dev.arc.ep133.formats.VoiceMixer.control] takes (an addition): the
 * command ([FX_TYPE] to [PUNCH]) with its index and two values, as the FX
 * page and the punch-in pads send them; the effect types ([NONE] to
 * [COMPRESSOR], FxSettings' FxType by ordinal) and the punch-in slots
 * ([PITCH_RANDOM] to [DECIMATOR], the pad each is on in the comment).
 */
object FxControl {
    /** index: the type ([NONE] to [COMPRESSOR]); x, y: its knobs, 0..1. */
    const val FX_TYPE = 1

    /** x, y: the effect's knobs, 0..1. */
    const val FX_XY = 2

    /** index: the group, 0..3; x: its send to the effect, 0..1. */
    const val SEND = 3

    /** index: 1 on, 0 off; x: the master compressor's drive, y: its speed, 0..1. */
    const val COMP = 4

    /** index: the groups ducked (bit g for group g; 0 is off); x: the duck's length, y: its shape, 0..1. */
    const val SIDECHAIN = 5

    /** x: the tempo, in BPM (held to 20..300). */
    const val TEMPO = 6

    /** index: the slot ([PITCH_RANDOM] to [DECIMATOR]); x: its depth, 0..1 (0 or less lets go of it). */
    const val PUNCH = 7

    const val NONE = 0
    const val DELAY = 1
    const val REVERB = 2
    const val DISTORTION = 3
    const val CHORUS = 4
    const val FILTER = 5
    const val COMPRESSOR = 6
    /** The types, [NONE] included. */
    const val TYPES = 7

    /** '.' */
    const val PITCH_RANDOM = 0
    /** '0' */
    const val SLICE = 1
    /** ENTER */
    const val STUTTER = 2
    /** '1' */
    const val BEAT_REPEAT = 3
    /** '2' */
    const val TAPE_STOP = 4
    /** '3' */
    const val FILTER_LFO = 5
    /** '4' */
    const val LPF = 6
    /** '5' */
    const val HPF = 7
    /** '6' */
    const val SEND_FX = 8
    /** '7' */
    const val TREMOLO = 9
    /** '8' */
    const val OCTAVE_DOWN = 10
    /** '9' */
    const val DECIMATOR = 11
    const val SLOTS = 12

    /** The groups with a send (A to D); a voice on bus -1 has none. */
    const val GROUPS = 4
}

/**
 * An effect on the send bus. Levels are the mixer's (16-bit scale floats, as
 * its mix is); buffers are stereo, interleaved.
 */
interface Effect {
    /** True when its tail has died away (below 1e-6) and its input was silent for a whole block: the bus may skip it. */
    val silent: Boolean

    /** Back to silence, its tail dropped. */
    fun reset()

    /** Its knobs [x] and [y] (0..1, smoothed) and the tempo, at most once a block, before [process]. */
    fun setParams(x: Float, y: Float, bpm: Float)

    /** Adds its return for [frames] frames of [input] into [out]. */
    fun process(input: FloatArray, out: FloatArray, frames: Int)
}

/**
 * The mixer's effects (an addition), as the EP-133's FX page has them: each
 * group (A to D) sends some of itself to one master effect, whose return is
 * added to the mix; then the punch-ins play over the whole mix, and the
 * master compressor (an addition) comes last, before the mixer's clip. The
 * sidechain (an addition too) ducks the groups it names whenever its source
 * pad starts.
 *
 * The mixer owns it and calls it from its render: [begin] at a block's start,
 * [gains] for each stretch between timed commands (so a timed start ducks on
 * its own frame), and [process] at the block's end. A voice on bus g adds its
 * sample times [dry] (g) to the mix and times [send] (g) to [fxIn]; a voice on
 * bus -1 just adds itself, as before FX. Per frame:
 *
 * - dry = duck × dry law(send), send = duck × send (raised to SEND_FX's depth
 *   while that punch-in is held);
 * - the dry law follows the effect: DELAY, REVERB and CHORUS keep more of the
 *   dry as the send rises (1 - 0.3 send, as OS 2.5 does), DISTORTION, FILTER
 *   and COMPRESSOR take it away (1 - send), and with no effect it is 1;
 * - the duck: a start with [dev.arc.ep133.formats.VoiceShape.duckSource] dips
 *   the groups in the sidechain's mask from where the duck is to 0.1 (-20 dB)
 *   in 2 ms, linearly, then lets them back up to 1 by the duck's length
 *   (30 + 570 x ms from the start), along a curve from fast (y = 0) to slow
 *   (y = 1). Before any start, after the length, or with the sidechain off it
 *   is exactly 1.
 *
 * Sends, the effect's knobs and the compressor's go to their new values over
 * about 20 ms (a one-pole, [onePoleCoef]), landing exactly on them. A new
 * effect type crossfades from the old one's return over 20 ms, and the old
 * one is then reset. The tempo goes to the effect and the punch-ins as it is.
 *
 * At its defaults (no effect, no send, no punch-in, the compressor and
 * sidechain off) it leaves the mix exactly as it was: every gain is exactly 1
 * or 0, and [process] touches nothing.
 *
 * Every step is one Float operation in the order written; the C++
 * (app/src/main/cpp/fx/FxBus.h) and web (web/src/core/formats/fx/fxBus.ts)
 * ports do the same, and VoiceMixerGoldenTest's FX scenarios hold them to it.
 * Like the mixer, it allocates only when a block is longer than any before.
 */
class FxBus(val outRate: Int) {
    companion object {
        /** How long the sends and knobs take to reach a new value, about. */
        const val SMOOTH_MS = 20f
        /** A smoothed value this close to its target lands on it. */
        const val SNAP = 1e-6f
        /** A new effect type fades in over this long, the old one out. */
        const val CROSSFADE_MS = 20
        /** The duck's floor: -20 dB. */
        const val DUCK_FLOOR = 0.1f
        /** How long the duck takes to reach its floor. */
        const val DUCK_DIP_MS = 2
        /** The duck's length at x = 0, and what x = 1 adds to it. */
        const val DUCK_MS = 30f
        const val DUCK_MS_RANGE = 570f
        const val BPM_DEFAULT = 120f
        const val BPM_MIN = 20f
        const val BPM_MAX = 300f
        /** No duck running. */
        private const val IDLE = Long.MIN_VALUE
    }

    private val delay = Delay(outRate)
    private val reverb = Reverb(outRate)
    private val distortion = Distortion(outRate)
    private val chorus = Chorus(outRate)
    private val filter = Filter(outRate)
    private val compressorFx = Compressor(outRate)
    private val compressor = Compressor(outRate)
    private val punch = Punch(outRate)

    /** By type; [FxControl.NONE] has none. */
    private val effects: Array<Effect?> = arrayOf(null, delay, reverb, distortion, chorus, filter, compressorFx)

    private val smoothK = onePoleCoef(SMOOTH_MS, outRate)
    private val fadeFrames = maxOf(1, CROSSFADE_MS * outRate / 1000)
    private val dip = maxOf(1, DUCK_DIP_MS * outRate / 1000)

    private var type = FxControl.NONE
    private var fxX = 0.5f
    private var fxY = 0.5f
    private var fxXTo = 0.5f
    private var fxYTo = 0.5f
    /** The type fading out, and the frames of the fade still to go (0: none). */
    private var oldType = FxControl.NONE
    private var fade = 0

    private val sends = FloatArray(FxControl.GROUPS)
    private val sendsTo = FloatArray(FxControl.GROUPS)

    private var compOn = false
    private var compX = 0.5f
    private var compY = 0.5f
    private var compXTo = 0.5f
    private var compYTo = 0.5f

    private var dests = 0
    private var duckX = 0.3f
    private var duckY = 0.5f
    private var duckLength = lengthOf(duckX)
    private var duckAt = IDLE
    private var duckFrom = 1f

    private var bpm = BPM_DEFAULT

    /** The send bus's input for the block: what the voices send, stereo, interleaved. */
    var fxIn = FloatArray(0)
        private set
    private var dryGains = Array(FxControl.GROUPS) { FloatArray(0) }
    private var sendGains = Array(FxControl.GROUPS) { FloatArray(0) }
    private val dryOn = BooleanArray(FxControl.GROUPS)
    private val sendOn = BooleanArray(FxControl.GROUPS)
    private var fadeOld = FloatArray(0)
    private var fadeNew = FloatArray(0)
    private var frames = 0
    /** How much of [fxIn] may be other than 0; whether anything was sent this block. */
    private var dirty = 0
    private var sent = false

    /** Takes one of [FxControl]'s commands. */
    fun control(what: Int, index: Int, x: Float, y: Float) {
        when (what) {
            FxControl.FX_TYPE -> {
                val t = if (index in 0 until FxControl.TYPES) index else FxControl.NONE
                fxXTo = clamp01(x)
                fxYTo = clamp01(y)
                if (t == type) return
                // A new effect starts at its knobs; the one fading out (if any) goes at once.
                if (fade > 0) effects[oldType]?.reset()
                oldType = type
                type = t
                fade = fadeFrames
                fxX = fxXTo
                fxY = fxYTo
                effects[t]?.reset()
            }
            FxControl.FX_XY -> {
                fxXTo = clamp01(x)
                fxYTo = clamp01(y)
            }
            FxControl.SEND -> if (index in 0 until FxControl.GROUPS) sendsTo[index] = clamp01(x)
            FxControl.COMP -> {
                compOn = index != 0
                compXTo = clamp01(x)
                compYTo = clamp01(y)
            }
            FxControl.SIDECHAIN -> {
                dests = index and ((1 shl FxControl.GROUPS) - 1)
                duckX = clamp01(x)
                duckY = clamp01(y)
                duckLength = lengthOf(duckX)
            }
            FxControl.TEMPO -> {
                bpm = if (x > BPM_MIN) (if (x < BPM_MAX) x else BPM_MAX) else BPM_MIN
                punch.setTempo(bpm)
            }
            FxControl.PUNCH -> punch.set(index, x)
        }
    }

    /** A duck source starts at output frame [at]: the duck dips from where it is now. */
    fun trigger(at: Long) {
        duckFrom = duck(at)
        duckAt = at
    }

    /** A block of [frames] frames starts: [fxIn] cleared, the buffers grown if need be. */
    fun begin(frames: Int) {
        this.frames = frames
        val n = frames * 2
        if (fxIn.size < n) {
            fxIn = FloatArray(n)
            fadeOld = FloatArray(n)
            fadeNew = FloatArray(n)
            dryGains = Array(FxControl.GROUPS) { FloatArray(frames) }
            sendGains = Array(FxControl.GROUPS) { FloatArray(frames) }
            dirty = 0
        }
        if (dirty > 0) java.util.Arrays.fill(fxIn, 0, dirty, 0f)
        dirty = 0
        sent = false
    }

    /**
     * Works out each group's gains for the block's frames [offset] until
     * [offset] + [frames] (output frame [at] at [offset]): read them with
     * [dry] and [send].
     */
    fun gains(offset: Int, frames: Int, at: Long) {
        if (duckAt != IDLE && at - duckAt >= duckLength) duckAt = IDLE
        val boost = punch.sendBoost()
        var live = boost > 0f
        for (g in 0 until FxControl.GROUPS) {
            dryOn[g] = false
            sendOn[g] = false
            if (sends[g] != 0f || sendsTo[g] != 0f) live = true
        }
        val ducking = dests != 0 && duckAt != IDLE
        if (!live && !ducking) return
        for (i in 0 until frames) {
            val d = if (ducking) duck(at + i) else 1f
            for (g in 0 until FxControl.GROUPS) {
                val s0 = smooth(sends[g], sendsTo[g])
                sends[g] = s0
                val s = if (boost > s0) boost else s0
                val gd = if (((dests shr g) and 1) != 0) d else 1f
                val dry = gd * dryLaw(s)
                val send = gd * s
                dryGains[g][offset + i] = dry
                sendGains[g][offset + i] = send
                if (dry != 1f) dryOn[g] = true
                if (send != 0f) sendOn[g] = true
            }
        }
        for (g in 0 until FxControl.GROUPS) {
            if (sendOn[g]) {
                sent = true
                dirty = this.frames * 2
            }
        }
    }

    /** Group [bus]'s dry gains for the last [gains], by block frame; null when they are all exactly 1. */
    fun dry(bus: Int): FloatArray? = if (dryOn[bus]) dryGains[bus] else null

    /** Group [bus]'s send gains for the last [gains], by block frame; null when they are all exactly 0. */
    fun send(bus: Int): FloatArray? = if (sendOn[bus]) sendGains[bus] else null

    /**
     * The block's end, before the mixer's clip: the effect's return added to
     * [mix] ([frames] stereo frames), then the punch-ins, then the master
     * compressor. Each is skipped when it has nothing to do.
     */
    fun process(mix: FloatArray, frames: Int) {
        val x = fxX
        val y = fxY
        fxX = glide(fxX, fxXTo, frames)
        fxY = glide(fxY, fxYTo, frames)
        val cx = compX
        val cy = compY
        compX = glide(compX, compXTo, frames)
        compY = glide(compY, compYTo, frames)
        val effect = effects[type]
        if (fade > 0) {
            crossfade(mix, frames, effect, x, y)
        } else if (effect != null && (sent || !effect.silent)) {
            effect.setParams(x, y, bpm)
            effect.process(fxIn, mix, frames)
        }
        punch.record(mix, frames)
        if (punch.active) punch.process(mix, frames)
        if (compOn) {
            compressor.setParams(cx, cy, bpm)
            compressor.processInPlace(mix, frames)
        }
    }

    /** The old effect's return fading out under the new one's, by the frame; the old one reset once it is gone. */
    private fun crossfade(mix: FloatArray, frames: Int, effect: Effect?, x: Float, y: Float) {
        val n = frames * 2
        java.util.Arrays.fill(fadeOld, 0, n, 0f)
        java.util.Arrays.fill(fadeNew, 0, n, 0f)
        val old = effects[oldType]
        old?.process(fxIn, fadeOld, frames)
        if (effect != null) {
            effect.setParams(x, y, bpm)
            effect.process(fxIn, fadeNew, frames)
        }
        for (i in 0 until frames) {
            var a = 0f
            var b = 1f
            if (fade > 0) {
                b = (fadeFrames - fade).toFloat() / fadeFrames.toFloat()
                a = 1f - b
                fade--
            }
            mix[2 * i] += fadeOld[2 * i] * a + fadeNew[2 * i] * b
            mix[2 * i + 1] += fadeOld[2 * i + 1] * a + fadeNew[2 * i + 1] * b
        }
        if (fade == 0) {
            old?.reset()
            oldType = FxControl.NONE
        }
    }

    /** The duck's gain at output frame [at] (before the sidechain's mask). */
    private fun duck(at: Long): Float {
        if (duckAt == IDLE) return 1f
        val t = at - duckAt
        if (t < dip) return lerp(duckFrom, DUCK_FLOOR, t.toFloat() / dip.toFloat())
        if (t >= duckLength) return 1f
        val u = (t - dip).toFloat() / (duckLength - dip).toFloat()
        val v = 1f - u
        val fast = 1f - v * v * v
        val slow = u * u * u
        return DUCK_FLOOR + (1f - DUCK_FLOOR) * lerp(fast, slow, duckY)
    }

    /** The duck's length in frames for an [x] of 0..1, longer than its dip. */
    private fun lengthOf(x: Float): Int {
        val ms = DUCK_MS + DUCK_MS_RANGE * x
        return maxOf(dip + 1, (ms * outRate.toFloat() / 1000f).toInt())
    }

    /** How much of the dry a group keeps at send [s], by the effect. */
    private fun dryLaw(s: Float): Float = when (type) {
        FxControl.DELAY, FxControl.REVERB, FxControl.CHORUS -> 1f - 0.3f * s
        FxControl.DISTORTION, FxControl.FILTER, FxControl.COMPRESSOR -> 1f - s
        else -> 1f
    }

    /**
     * One frame of the one-pole from [cur] toward [target], landing on it once
     * within [SNAP], or once a step no longer moves it (in Float a slow
     * one-pole stalls short of its target, about 3e-5 off at 48 kHz).
     */
    private fun smooth(cur: Float, target: Float): Float {
        val d = target - cur
        if (abs(d) < SNAP) return target
        val next = cur + smoothK * d
        return if (next == cur) target else next
    }

    /** [frames] frames of [smooth]. */
    private fun glide(cur: Float, target: Float, frames: Int): Float {
        var c = cur
        for (i in 0 until frames) {
            if (c == target) break
            c = smooth(c, target)
        }
        return c
    }
}
