package dev.arc.ep133.features

import dev.arc.ep133.formats.Crc32
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor

/*
 * The sound a card's synth line makes (an addition), so that Arc and the
 * skill's script (skill/arc-beats/scripts/beatcard.py, render_synth) make
 * the same bytes, bit for bit. Everything is Double, one rounding a step,
 * in the order written here, with standard precedence left to right: never
 * reordered, factored or fused. Only + - * /, comparisons, abs, floor, Int
 * maths (a 32-bit LCG for the noise) and min/max: no sin, exp, pow, tanh or
 * other library function whose last bit can differ between runtimes, and
 * no Float (so not FxMath or its filters). An Int becomes a Double only
 * through toDouble(). The literals are written as the shortest text that
 * reads back to the same Double in Kotlin and Python.
 *
 * The golden file (skill/arc-beats/scripts/test_synth_golden.txt) pins the
 * frames, the PCM's CRC and the device name of every case; SynthVoiceTest
 * and the script's test both check it. Any change to a byte must bump
 * VERSION, which renames every made sound.
 */

/** How a synth's level moves: a hit that decays, a clap's bursts then a decay, or a held note with an end fade. */
enum class SynthShape { PERC, CLAP, SUSTAIN }

/** A synth's filter: low pass, band pass, high pass or none (bell). */
enum class SynthFilter { LP, BP, HP, NONE }

/**
 * A synth line with every setting filled in ([SynthVoice.resolve]): what the line gave, else its type's default. The
 * knobs are 0..100; [dLo]..[dHi] is the decay's range in ms, [cLo]..[cHi] the filter cutoff's in Hz and [bendMs] how
 * fast the pitch bend falls. [snap] is null when the noise has no decay of its own, and [length] (hundredths of a
 * second) when the length follows the decay.
 */
data class SynthSpec(
    val type: SynthType,
    val shape: SynthShape,
    val note: Int,
    val wave: SynthWave,
    val chord: SynthChord,
    val attack: Int,
    val decay: Int,
    val dLo: Double,
    val dHi: Double,
    val tone: Int,
    val cLo: Double,
    val cHi: Double,
    val filter: SynthFilter,
    val reso: Int,
    val bend: Int,
    val bendMs: Double,
    val click: Int,
    val noise: Int,
    val snap: Int?,
    val drive: Int,
    val detune: Int,
    val sweep: Int,
    val level: Int,
    val seed: Int,
    val length: Int?,
    val name: String?,
)

/**
 * Makes a card's synth line into a sound: 46875 Hz, mono, 16 bits, at most 4 s, peak normalised to -1 dBFS times its
 * level. The same line always makes the same bytes, and its device name ("808 kick 29f789") carries a tag of its
 * settings, so Arc finds a sound it made before.
 */
object SynthVoice {
    const val VERSION = 1
    const val RATE = 46875
    const val MAX_FRAMES = 187_500
    const val MIN_AUTO_FRAMES = 2_344

    private const val R = 46875.0
    private const val MS = 46.875

    /** Semitone ratios 2^(i/12), as their shortest Double text. */
    private val SEMI = doubleArrayOf(
        1.0, 1.0594630943592953, 1.122462048309373, 1.189207115002721, 1.2599210498948732, 1.3348398541700344,
        1.4142135623730951, 1.4983070768766815, 1.5874010519681994, 1.681792830507429, 1.7817974362806785, 1.8877486253633868,
    )

    /** The six square partials of `metal`, as the 808's hat has them. */
    private val METAL = doubleArrayOf(1.0, 1.48271, 1.80029, 2.54603, 2.6303, 3.89674)

    // A type's defaults: the columns of the spec's table.
    private class Preset(
        val shape: SynthShape, val note: Int, val wave: SynthWave, val chord: SynthChord, val attack: Int,
        val decay: Int, val dLo: Double, val dHi: Double, val tone: Int, val cLo: Double, val cHi: Double, val filter: SynthFilter,
        val reso: Int, val bend: Int, val bendMs: Double, val click: Int, val noise: Int, val snap: Int?,
        val drive: Int, val detune: Int, val sweep: Int, val level: Int, val length: Int?,
    )

    private val PRESETS: Map<SynthType, Preset> = mapOf(
        SynthType.KICK to Preset(SynthShape.PERC, 31, SynthWave.SINE, SynthChord.ONE, 0, 40, 20.0, 600.0, 30, 100.0, 12000.0, SynthFilter.LP, 0, 50, 30.0, 30, 0, null, 10, 0, 0, 100, null),
        SynthType.SNARE to Preset(SynthShape.PERC, 54, SynthWave.SINE, SynthChord.ONE, 0, 30, 20.0, 400.0, 70, 500.0, 16000.0, SynthFilter.LP, 0, 20, 15.0, 20, 70, 40, 0, 0, 0, 100, null),
        SynthType.CLAP to Preset(SynthShape.CLAP, 60, SynthWave.NONE, SynthChord.ONE, 0, 35, 30.0, 500.0, 55, 400.0, 6000.0, SynthFilter.BP, 20, 0, 30.0, 0, 100, null, 0, 0, 0, 80, null),
        SynthType.HAT to Preset(SynthShape.PERC, 56, SynthWave.METAL, SynthChord.ONE, 0, 15, 10.0, 300.0, 70, 2000.0, 14000.0, SynthFilter.HP, 10, 0, 30.0, 0, 40, null, 0, 0, 0, 60, null),
        SynthType.OPENHAT to Preset(SynthShape.PERC, 56, SynthWave.METAL, SynthChord.ONE, 0, 50, 10.0, 500.0, 70, 2000.0, 14000.0, SynthFilter.HP, 10, 0, 30.0, 0, 40, null, 0, 0, 0, 55, null),
        SynthType.TOM to Preset(SynthShape.PERC, 43, SynthWave.SINE, SynthChord.ONE, 0, 40, 30.0, 800.0, 30, 100.0, 8000.0, SynthFilter.LP, 0, 30, 60.0, 15, 5, null, 0, 0, 0, 100, null),
        SynthType.RIM to Preset(SynthShape.PERC, 81, SynthWave.TRI, SynthChord.ONE, 0, 10, 3.0, 60.0, 60, 500.0, 8000.0, SynthFilter.BP, 30, 0, 30.0, 50, 20, null, 0, 0, 0, 70, null),
        SynthType.COWBELL to Preset(SynthShape.PERC, 73, SynthWave.SQUARE, SynthChord.FIFTH, 0, 25, 20.0, 600.0, 50, 300.0, 8000.0, SynthFilter.BP, 30, 0, 30.0, 0, 0, null, 0, 0, 0, 70, null),
        SynthType.SUB to Preset(SynthShape.PERC, 36, SynthWave.SINE, SynthChord.ONE, 0, 30, 100.0, 3000.0, 40, 100.0, 8000.0, SynthFilter.LP, 0, 10, 40.0, 10, 0, null, 20, 0, 0, 100, null),
        SynthType.BASS to Preset(SynthShape.PERC, 36, SynthWave.SAW, SynthChord.ONE, 0, 30, 50.0, 2000.0, 40, 80.0, 12000.0, SynthFilter.LP, 20, 0, 30.0, 0, 0, null, 0, 0, 40, 100, null),
        SynthType.PLUCK to Preset(SynthShape.PERC, 60, SynthWave.SAW, SynthChord.ONE, 0, 30, 30.0, 1500.0, 50, 100.0, 16000.0, SynthFilter.LP, 10, 0, 30.0, 0, 0, null, 0, 0, 50, 100, null),
        SynthType.STAB to Preset(SynthShape.PERC, 60, SynthWave.SAW, SynthChord.MIN, 0, 25, 30.0, 1500.0, 55, 100.0, 16000.0, SynthFilter.LP, 10, 0, 30.0, 0, 0, null, 0, 20, 40, 100, null),
        // Bell has no filter: its tone is the FM depth, so its cutoff range is unused.
        SynthType.BELL to Preset(SynthShape.PERC, 72, SynthWave.SINE, SynthChord.ONE, 0, 35, 100.0, 3000.0, 40, 0.0, 0.0, SynthFilter.NONE, 0, 0, 30.0, 0, 0, null, 0, 0, 0, 100, null),
        SynthType.ZAP to Preset(SynthShape.PERC, 48, SynthWave.SINE, SynthChord.ONE, 0, 25, 20.0, 600.0, 100, 200.0, 16000.0, SynthFilter.LP, 0, 100, 40.0, 0, 0, null, 0, 0, 0, 100, null),
        SynthType.LEAD to Preset(SynthShape.SUSTAIN, 60, SynthWave.SAW, SynthChord.ONE, 5, 30, 10.0, 1500.0, 60, 100.0, 16000.0, SynthFilter.LP, 10, 0, 30.0, 0, 0, null, 0, 15, 0, 100, 100),
        SynthType.PAD to Preset(SynthShape.SUSTAIN, 48, SynthWave.SAW, SynthChord.MIN, 60, 50, 50.0, 3000.0, 45, 100.0, 12000.0, SynthFilter.LP, 5, 0, 30.0, 0, 0, null, 0, 40, 0, 100, 300),
        // Riser's cutoff also rises with the attack ramp.
        SynthType.RISER to Preset(SynthShape.SUSTAIN, 60, SynthWave.NONE, SynthChord.ONE, 100, 5, 10.0, 1500.0, 70, 500.0, 12000.0, SynthFilter.BP, 40, 0, 30.0, 0, 100, null, 0, 0, 0, 100, 200),
    )

    /** [s] with every setting filled in: what the line gave, else its type's default. */
    fun resolve(s: CardSynth): SynthSpec {
        val p = PRESETS.getValue(s.type)
        return SynthSpec(
            type = s.type,
            shape = p.shape,
            note = s.note ?: p.note,
            wave = s.wave ?: p.wave,
            chord = s.chord ?: p.chord,
            attack = s.attack ?: p.attack,
            decay = s.decay ?: p.decay,
            dLo = p.dLo,
            dHi = p.dHi,
            tone = s.tone ?: p.tone,
            cLo = p.cLo,
            cHi = p.cHi,
            filter = p.filter,
            reso = s.reso ?: p.reso,
            bend = s.bend ?: p.bend,
            bendMs = p.bendMs,
            click = s.click ?: p.click,
            noise = s.noise ?: p.noise,
            snap = s.snap ?: p.snap,
            drive = s.drive ?: p.drive,
            detune = s.detune ?: p.detune,
            sweep = s.sweep ?: p.sweep,
            level = s.level ?: p.level,
            seed = s.seed ?: 0,
            length = s.length ?: p.length,
            name = s.name,
        )
    }

    /**
     * The sound's settings as text, every one resolved and in a fixed order: what its tag is made from. The name is not
     * in it, so renaming a sound doesn't make a new one, and `synth A1 kick` is the same sound as `synth A1 kick decay 40`.
     */
    fun canonical(s: CardSynth): String {
        val r = resolve(s)
        return "arc synth $VERSION ${r.type.id} note ${r.note} wave ${r.wave.id} chord ${r.chord.id} attack ${r.attack} decay ${r.decay}" +
            " length ${r.length ?: "auto"} tone ${r.tone} reso ${r.reso} sweep ${r.sweep} bend ${r.bend} click ${r.click} noise ${r.noise}" +
            " snap ${r.snap ?: "off"} drive ${r.drive} detune ${r.detune} level ${r.level} seed ${r.seed}"
    }

    /** The CRC-32 of [canonical]'s ASCII bytes. */
    fun crc(s: CardSynth): Long = Crc32.of(canonical(s).toByteArray(Charsets.US_ASCII))

    /** Six hex digits of [crc] (its top 24 bits): the tag after the device name. */
    fun tag(s: CardSynth): String = "%06x".format(Locale.ROOT, crc(s) ushr 8)

    /** The name to show: the line's name, else its type, `_` as a space ("808 kick"). */
    fun shownName(s: CardSynth): String = (s.name ?: s.type.id).replace('_', ' ')

    /** The sound's name on the EP-133: [shownName] and [tag] ("808 kick 29f789"), at most 20 characters. */
    fun deviceName(s: CardSynth): String = shownName(s) + " " + tag(s)

    /** The file Arc keeps the sound in offline, one for each pad: "syn-<crc>-<project>-<group>-<pad>.wav". */
    fun fileName(s: CardSynth, project: Int, group: Int, pad: Int): String =
        "syn-%08x-%d-%d-%d.wav".format(Locale.ROOT, crc(s), project, group, pad)

    /** Whether the sound is all silence: no oscillator, no noise and no click. Arc never offers one; it still renders, as zeros. */
    fun silent(s: CardSynth): Boolean {
        val r = resolve(s)
        return r.wave == SynthWave.NONE && r.noise == 0 && r.click == 0
    }

    /** How many frames the sound has: its length when it has one, else the attack and five times the decay (0.05 to 4 s). */
    fun frames(s: CardSynth): Int = frames(resolve(s))

    private fun frames(r: SynthSpec): Int {
        r.length?.let { return it * 1875 / 4 }
        val ka = r.attack / 100.0
        val kd = r.decay / 100.0
        val attackMs = 2000.0 * (ka * ka * ka)
        val decayMs = r.dLo + (r.dHi - r.dLo) * (kd * kd)
        var tail = decayMs
        if (r.snap != null) {
            val ks = r.snap / 100.0
            val snapMs = 10.0 + 990.0 * (ks * ks)
            if (snapMs > tail) tail = snapMs
        }
        val n = floor((attackMs + 5.0 * tail + (if (r.shape == SynthShape.CLAP) 30.0 else 0.0)) * 46.875)
        return minOf(maxOf(n, MIN_AUTO_FRAMES.toDouble()), MAX_FRAMES.toDouble()).toInt()
    }

    /** MIDI [midi] in Hz, from A4 = 440 by the semitone table and octave doublings. */
    fun noteHz(midi: Int): Double {
        val d = midi - 69
        val o = Math.floorDiv(d, 12)
        val s = d - 12 * o
        var h = 440.0 * SEMI[s]
        for (i in 0 until o) h = h * 2.0
        for (i in 0 until -o) h = h * 0.5
        return h
    }

    // A one-pole step that settles over about [ms].
    private fun coef(ms: Double): Double = 1.0 / (1.0 + ms * MS)

    // About sin(2 pi p) for p in [0, 1), within about 0.001: a parabola, corrected.
    private fun sine(p: Double): Double {
        val t = if (p < 0.5) 2.0 * p else 2.0 * p - 2.0
        val a = abs(t)
        val y = 4.0 * t * (1.0 - a)
        return 0.225 * (y * abs(y) - y) + y
    }

    private fun tri(p: Double): Double {
        if (p < 0.25) return 4.0 * p
        if (p < 0.75) return 2.0 - 4.0 * p
        return 4.0 * p - 4.0
    }

    // The band-limited step's correction near a jump, so a saw or square doesn't alias.
    private fun blep(p: Double, dt: Double): Double {
        if (p < dt) {
            val x = p / dt
            return x + x - x * x - 1.0
        }
        if (p > 1.0 - dt) {
            val x = (p - 1.0) / dt
            return x * x + x + x + 1.0
        }
        return 0.0
    }

    // One sample of a sine, tri, saw or square at phase [p].
    private fun waveAt(w: SynthWave, p: Double, dt: Double): Double {
        if (w == SynthWave.SINE) return sine(p)
        if (w == SynthWave.TRI) return tri(p)
        if (w == SynthWave.SAW) return (2.0 * p - 1.0) - blep(p, dt)
        var q = p + 0.5
        if (q >= 1.0) q = q - 1.0
        return ((if (p < 0.5) 1.0 else -1.0) + blep(p, dt)) - blep(q, dt)
    }

    private fun softClip(x: Double): Double {
        if (x > 3.0) return 1.0
        if (x < -3.0) return -1.0
        return (x * (27.0 + x * x)) / (27.0 + 9.0 * (x * x))
    }

    /** The sound as 16-bit samples: the first and last are 0, and the peak is 29204 times its level (all 0 when silent). */
    fun render(s: CardSynth): ShortArray {
        val r = resolve(s)
        val n0 = frames(r)
        val ka = r.attack / 100.0
        val kd = r.decay / 100.0
        val kt = r.tone / 100.0
        val kr = r.reso / 100.0
        val kb = r.bend / 100.0
        val kc = r.click / 100.0
        val kn = r.noise / 100.0
        val kdr = r.drive / 100.0
        val kdt = r.detune / 100.0
        val ksw = r.sweep / 100.0
        val attackMs = 2000.0 * (ka * ka * ka)
        val decayMs = r.dLo + (r.dHi - r.dLo) * (kd * kd)
        val cutoff = r.cLo + (r.cHi - r.cLo) * (kt * kt * kt)
        val q = 0.6 + 7.4 * kr
        val bendMult = 1.0 + 15.0 * (kb * kb)
        val noiseGain = 1.5 * kn
        val driveGain = 1.0 + 9.0 * kdr
        val cents = 40.0 * kdt
        val fmIndex = 0.5 + 7.5 * kt
        val level = r.level / 100.0
        val hz = noteHz(r.note)
        val c = cents * 0.0005776226504666211
        // The voices: chord notes from the root up, each as -c, 0, +c when detuned.
        val ratioList = ArrayList<Double>()
        for (i in r.chord.intervals) {
            val iv = SEMI[i % 12] * (if (i >= 12) 2.0 else 1.0)
            if (cents > 0.0) {
                ratioList += iv * (1.0 - c)
                ratioList += iv
                ratioList += iv * (1.0 + c)
            } else {
                ratioList += iv
            }
        }
        val ratios = ratioList.toDoubleArray()
        val nv = ratios.size
        val bell = r.type == SynthType.BELL
        val rise = r.type == SynthType.RISER
        val phase = Array(nv) { DoubleArray(6) }
        val mod = DoubleArray(nv)
        // The noise: a 32-bit LCG, wrapping as an Int does; its top 24 bits are the sample.
        var seed = 1592590336 + 7919 * r.type.ordinal + 104729 * r.seed
        val aN = floor(attackMs * MS).toInt()
        val keepD = 1.0 - coef(decayMs)
        val keepBurst = 1.0 - coef(2.0)
        val keepS = r.snap?.let { 1.0 - coef(10.0 + 990.0 * ((it / 100.0) * (it / 100.0))) }
        val keepF = 1.0 - coef(0.5 * decayMs)
        val keepC = 1.0 - coef(1.0)
        val keepB = 1.0 - coef(r.bendMs)
        val rN = minOf(floor(decayMs * MS).toInt(), n0 / 2)
        var d = 1.0
        var e = 1.0
        var ns = 1.0
        var fe = 1.0
        var ec = 1.0
        var bf = 1.0
        var ic1 = 0.0
        var ic2 = 0.0
        val y = DoubleArray(n0)
        for (n in 0 until n0) {
            // 1. Noise: exactly one draw a sample, always.
            seed = seed * 1664525 + 1013904223
            val w = (seed ushr 8).toDouble() / 16777216.0 * 2.0 - 1.0
            // 2. Envelopes, as they are for this sample.
            val ramp = if (aN > 0 && n < aN) n.toDouble() / aN.toDouble() else 1.0
            val env = when (r.shape) {
                SynthShape.PERC -> ramp * d
                SynthShape.CLAP -> if (n < 1407) {
                    if (n % 469 == 0) e = 1.0
                    ramp * e
                } else {
                    ramp * d
                }
                SynthShape.SUSTAIN -> {
                    val rel = if (rN > 0 && n >= n0 - rN) (n0 - n).toDouble() / rN.toDouble() else 1.0
                    ramp * rel
                }
            }
            val envN = if (keepS == null) env else ramp * ns
            // 3. Pitch, with the bend falling away.
            val f = hz * (1.0 + (bendMult - 1.0) * bf)
            // 4. Oscillators.
            var o = 0.0
            if (r.wave != SynthWave.NONE) {
                var acc = 0.0
                for (v in 0 until nv) {
                    val fv = f * ratios[v]
                    var off = 0.0
                    if (bell) off = ((fmIndex * 0.15915494309189535) * sine(mod[v])) * env
                    val ph = phase[v]
                    if (r.wave == SynthWave.METAL) {
                        var sm = 0.0
                        for (j in 0 until 6) {
                            var dt = (fv * METAL[j]) / R
                            if (dt > 0.45) dt = 0.45
                            var pp = ph[j]
                            if (bell) {
                                pp = pp + off
                                pp = pp - floor(pp)
                            }
                            sm = sm + (if (pp < 0.5) 1.0 else -1.0)
                            ph[j] = ph[j] + dt
                            if (ph[j] >= 1.0) ph[j] = ph[j] - 1.0
                        }
                        acc = acc + sm / 6.0
                    } else {
                        var dt = fv / R
                        if (dt > 0.45) dt = 0.45
                        var pp = ph[0]
                        if (bell) {
                            pp = pp + off
                            pp = pp - floor(pp)
                        }
                        acc = acc + waveAt(r.wave, pp, dt)
                        ph[0] = ph[0] + dt
                        if (ph[0] >= 1.0) ph[0] = ph[0] - 1.0
                    }
                    if (bell) {
                        var dm = (fv * 3.5) / R
                        if (dm > 0.45) dm = 0.45
                        mod[v] = mod[v] + dm
                        if (mod[v] >= 1.0) mod[v] = mod[v] - 1.0
                    }
                }
                o = acc / nv.toDouble()
            }
            // 5. Mix.
            val x = o * env + (w * noiseGain) * envN
            // 6. Filter: a state-variable filter (Simper's TPT form) in Double, retuned every sample.
            val out = if (r.filter != SynthFilter.NONE) {
                val base = if (rise) cutoff * (0.125 + 0.875 * (ramp * ramp)) else cutoff
                val cut = base + ((18000.0 - base) * ksw) * fe
                val h = if (cut > 18750.0) 18750.0 else cut
                val w0 = (3.141592653589793 * h) / R
                val w2 = w0 * w0
                val g = (w0 * (15.0 - w2)) / (15.0 - 6.0 * w2)
                val kq = 1.0 / q
                val a1 = 1.0 / (1.0 + g * (g + kq))
                val a2 = g * a1
                val a3 = g * a2
                val v3 = x - ic2
                val v1 = a1 * ic1 + a2 * v3
                val v2 = ic2 + a2 * ic1 + a3 * v3
                ic1 = 2.0 * v1 - ic1
                if (abs(ic1) < 1e-30) ic1 = 0.0
                ic2 = 2.0 * v2 - ic2
                if (abs(ic2) < 1e-30) ic2 = 0.0
                when (r.filter) {
                    SynthFilter.LP -> v2
                    SynthFilter.BP -> v1
                    else -> x - kq * v1 - v2
                }
            } else {
                x
            }
            // 7. Click, after the filter.
            y[n] = out + (kc * w) * ec
            // 8. State updates, in this order.
            if (r.shape == SynthShape.PERC && n >= aN) d = d * keepD
            if (r.shape == SynthShape.CLAP) {
                if (n < 1407) e = e * keepBurst else d = d * keepD
            }
            if (keepS != null && n >= aN) ns = ns * keepS
            fe = fe * keepF
            ec = ec * keepC
            bf = bf * keepB
        }
        // Pass 2: normalise, drive, fades.
        var peak = 0.0
        for (v in y) if (abs(v) > peak) peak = abs(v)
        if (peak > 0.0) {
            val inv = 1.0 / peak
            for (n in 0 until n0) y[n] = y[n] * inv
        }
        if (r.drive > 0) {
            for (n in 0 until n0) y[n] = softClip(y[n] * driveGain)
        }
        for (n in 0 until minOf(8, n0)) y[n] = y[n] * (n.toDouble() / 8.0)
        val fade = minOf(256, n0 / 4)
        for (n in n0 - fade until n0) y[n] = y[n] * ((n0 - 1 - n).toDouble() / fade.toDouble())
        // Pass 3: level and 16 bits.
        peak = 0.0
        for (v in y) if (abs(v) > peak) peak = abs(v)
        val gain = if (peak > 0.0) (0.8912509381337456 * level) / peak else 0.0
        return ShortArray(n0) { floor(y[it] * gain * 32767.0 + 0.5).coerceIn(-32768.0, 32767.0).toInt().toShort() }
    }

    /** [pcm] as 16-bit little-endian bytes. */
    fun pcmBytes(pcm: ShortArray): ByteArray {
        val out = ByteArray(pcm.size * 2)
        for (i in pcm.indices) {
            val v = pcm[i].toInt()
            out[2 * i] = v.toByte()
            out[2 * i + 1] = (v shr 8).toByte()
        }
        return out
    }

    /** The sound as a WAV file: 46875 Hz, mono, 16 bits, no settings chunk. */
    fun wav(s: CardSynth): ByteArray = SampleEdit.toWavBytes(render(s), 1, RATE)
}
