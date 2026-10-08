package dev.arc.ep133.audio

import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.VoiceMode
import dev.arc.ep133.formats.VoiceShape
import dev.arc.ep133.formats.fx.FxControl
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.fail
import org.junit.jupiter.api.Test
import java.io.File
import kotlin.random.Random

/**
 * The vectors the native engine's C++ mixer is checked against (an addition):
 * scenarios played through the Kotlin [VoiceMixer] (VoiceMixerTest's cases,
 * then long random ones at real rates and pitches, then the voice shapes:
 * each of [VoiceShape]'s settings and modes, and long random ones with random
 * shapes, then the timed commands: starts and tagged releases at a frame,
 * inside a render, on its edge and late, and long random ones as the
 * pattern sequencer sends them, at real rates and block sizes, then the FX
 * bus: sends, the dry law, the sidechain's duck, smoothing and the tempo, and
 * long random ones with random controls, then the tone effects: the
 * distortion, the filter, the compressor and the master compressor, their
 * knobs swept and their types switched, and random ones), written out
 * with every
 * command and what each render gave (its samples, or a hash of them for long
 * renders, the voices started and the keys). The host test
 * (src/test/cpp/VoiceMixerParityTest.cpp, run by `./gradlew test` through
 * :app:hostMixerTest) replays them through the C++ port and wants the same,
 * sample for sample.
 *
 * This test fails when the Kotlin mixer no longer writes the committed file
 * (src/test/cpp/voice-mixer.golden): after a deliberate change to it, write the
 * file again with `./gradlew :app:testDebugUnitTest -Parc.updateGolden=true`,
 * and change the C++ port until the host test passes. New scenarios go at the
 * end: the first [LEGACY_SCENARIOS] (those from before the FX bus) must come
 * out as they always have, and the test won't write the file otherwise.
 */
class VoiceMixerGoldenTest {
    @Test
    fun `the Kotlin mixer still writes the committed vectors`() {
        val golden = File(System.getProperty("arc.mixerGolden") ?: fail("arc.mixerGolden not set"))
        val text = vectors()
        // The scenarios from before the FX bus, to the byte: the bus at its defaults changes nothing.
        assertEquals(LEGACY_FNV, fnv(legacy(text))) {
            "The first $LEGACY_SCENARIOS scenarios no longer come out as they did before the FX bus: new scenarios go at the end."
        }
        if (System.getProperty("arc.updateGolden") == "true") {
            golden.writeText(text)
            return
        }
        assertTrue(golden.exists()) { "$golden is missing: run ./gradlew :app:testDebugUnitTest -Parc.updateGolden=true" }
        if (golden.readText() != text) {
            fail<Unit>(
                "The Kotlin VoiceMixer no longer renders what $golden holds. If that was meant, write it again with " +
                    "./gradlew :app:testDebugUnitTest -Parc.updateGolden=true and bring the C++ port (src/main/cpp/VoiceMixer.cpp) along.",
            )
        }
    }

    /** Writes a scenario: each command as the C++ side replays it, each render's results. */
    private class Trace(private val out: StringBuilder, private val keys: LiveKeys, name: String, outRate: Int, maxVoices: Int) {
        val mixer = VoiceMixer(outRate, maxVoices)
        private val samples = ArrayList<Pair<ShortArray, Int>>()

        init {
            out.append("scenario ").append(name).append(' ').append(outRate).append(' ').append(maxVoices).append('\n')
        }

        /** A noise sound ([channels], [frames] long) both sides make from [seed], so the file needn't hold it. */
        fun noise(channels: Int, frames: Int, seed: Long): ShortArray {
            val pcm = noiseOf(frames * channels, seed)
            samples += pcm to channels
            out.append("noise ").append(samples.size - 1).append(' ').append(channels).append(' ').append(pcm.size)
                .append(' ').append(seed).append('\n')
            return pcm
        }

        private fun sample(pcm: ShortArray, channels: Int): Int {
            // The same contents are the same sound to the mixer: written once.
            val known = samples.indexOfFirst { it.first.contentEquals(pcm) && it.second == channels }
            if (known >= 0) return known
            samples += pcm to channels
            val id = samples.size - 1
            if (pcm.size > 1 && pcm.all { it == pcm[0] }) {
                // One value throughout: "fill".
                out.append("fill $id $channels ${pcm.size} ${pcm[0]}\n")
                return id
            }
            out.append("sample ").append(id).append(' ').append(channels).append(' ').append(pcm.size)
            for (v in pcm) out.append(' ').append(v)
            out.append('\n')
            return id
        }

        /**
         * A start; a [shape] other than the default (its semitones aside, which
         * go into the pitch, as the native output does) adds its fields to the
         * line: the gain's float bits, pan, start, end, attack, release, the
         * mode's ordinal and the mute group, then, for a voice on a bus or a
         * duck source, the bus and 1 or 0 for the source. A timed one ([at])
         * is a "startat" line, with its frame after the tag.
         */
        fun start(
            key: String,
            pcm: ShortArray,
            channels: Int,
            rate: Int,
            semitones: Int = 0,
            tag: Long = 0,
            shape: VoiceShape = VoiceShape.DEFAULT,
            at: Long = VoiceMixer.NOW,
        ) {
            val id = sample(pcm, channels)
            mixer.start(key, pcm, channels, rate, semitones, tag, shape, at)
            val pitch = java.lang.Long.toHexString(VoiceMixer.pitchRatio(semitones + shape.semitones).toRawBits())
            if (at == VoiceMixer.NOW) {
                out.append("start ${keys.id(key)} $id $rate $pitch $tag")
            } else {
                out.append("startat ${keys.id(key)} $id $rate $pitch $tag $at")
            }
            val routed = shape.bus != -1 || shape.duckSource
            if (routed || shape.copy(semitones = 0.0) != VoiceShape.DEFAULT) {
                out.append(' ').append(Integer.toHexString(shape.gain.toRawBits())).append(' ').append(shape.pan)
                    .append(' ').append(shape.start).append(' ').append(shape.end).append(' ').append(shape.attackMs)
                    .append(' ').append(shape.releaseMs).append(' ').append(shape.mode.ordinal).append(' ').append(shape.muteGroup)
            }
            if (routed) out.append(' ').append(shape.bus).append(' ').append(if (shape.duckSource) 1 else 0)
            out.append('\n')
        }

        /** An FX bus command ([FxControl]): its kind, index and the float bits of its two values. */
        fun control(what: Int, index: Int, x: Float, y: Float) {
            mixer.control(what, index, x, y)
            out.append("control $what $index ${Integer.toHexString(x.toRawBits())} ${Integer.toHexString(y.toRawBits())}\n")
        }

        fun release(key: String) {
            mixer.release(key)
            out.append("release ${keys.id(key)}\n")
        }

        /** A timed or tagged release: its frame ([VoiceMixer.NOW] as a number) and tag. */
        fun releaseAt(key: String, at: Long, tag: Long) {
            mixer.release(key, at, tag)
            out.append("releaseat ${keys.id(key)} $at $tag\n")
        }

        fun flushTimed() {
            mixer.flushTimed()
            out.append("flushtimed\n")
        }

        fun cut(key: String) {
            mixer.cut(key)
            out.append("cut ${keys.id(key)}\n")
        }

        fun stopAll() {
            mixer.stopAll()
            out.append("stop\n")
        }

        fun render(frames: Int) {
            val pcm = ShortArray(frames * 2)
            mixer.render(pcm, frames)
            out.append("render ").append(frames).append('\n')
            if (pcm.size <= 128) {
                out.append("out ").append(pcm.size)
                for (v in pcm) out.append(' ').append(v)
                out.append('\n')
            } else {
                out.append("hash ").append(java.lang.Long.toHexString(fnv(pcm))).append('\n')
            }
            out.append("started ").append(mixer.started.size)
            for (s in mixer.started) out.append(' ').append(keys.id(s.key)).append(' ').append(s.tag).append(' ').append(s.frame)
            out.append('\n')
            out.append("keys ").append(mixer.keys.size)
            for (k in mixer.keys) out.append(' ').append(keys.id(k))
            out.append('\n')
            out.append("frame ").append(mixer.frame).append('\n')
        }

        fun end() {
            out.append("end\n")
        }
    }

    private fun vectors(): String {
        val out = StringBuilder("# Written by VoiceMixerGoldenTest from the Kotlin VoiceMixer; replayed by VoiceMixerParityTest.cpp. Do not edit.\n")
        val keys = LiveKeys()
        fun scenario(name: String, outRate: Int = 1000, maxVoices: Int = VoiceMixer.MAX_VOICES, body: Trace.() -> Unit) {
            Trace(out, keys, name, outRate, maxVoices).apply(body).end()
        }
        fun steady(n: Int, v: Short = 1000) = ShortArray(n) { v }

        // VoiceMixerTest's cases, at 1000 Hz: one frame a millisecond.
        scenario("mono-own-rate") {
            start("a", shortArrayOf(0, 100, 200, 300), 1, 1000)
            render(6)
        }
        scenario("other-rates") {
            start("a", shortArrayOf(0, 100, 200, 300, 400), 1, 2000)
            render(4)
            start("b", shortArrayOf(0, 100, 200), 1, 500)
            render(6)
        }
        scenario("octaves") {
            start("k", ShortArray(9) { (it * 100).toShort() }, 1, 1000, semitones = 12)
            render(6)
            start("k", ShortArray(9) { (it * 100).toShort() }, 1, 1000, semitones = -12)
            render(20)
        }
        scenario("stereo") {
            start("s", shortArrayOf(1, -1, 2, -2), 2, 1000)
            render(3)
        }
        scenario("gate-and-fade") {
            start("a", steady(1000), 1, 1000)
            render(100)
            release("a")
            render(40)
        }
        scenario("minimum-gate") {
            start("a", steady(1000), 1, 1000)
            release("a")
            render(200)
        }
        scenario("chord-and-clip") {
            start("a", steady(10, 1000), 1, 1000)
            start("b", steady(10, 2000), 1, 1000)
            render(1)
            start("c", steady(10, 32000), 1, 1000)
            render(1)
            start("d", steady(10, -32000), 1, 1000)
            start("e", steady(10, -32000), 1, 1000)
            render(2)
        }
        scenario("same-key-again") {
            start("a", steady(1000, 1000), 1, 1000)
            render(10)
            start("a", steady(1000, 1000), 1, 1000)
            render(10)
        }
        scenario("voice-limit", maxVoices = 2) {
            start("a", steady(100), 1, 1000)
            start("b", steady(100), 1, 1000)
            start("c", steady(100), 1, 1000)
            render(1)
        }
        scenario("let-go-goes-first", maxVoices = 2) {
            start("a", steady(1000), 1, 1000)
            start("b", steady(1000), 1, 1000)
            render(1)
            release("b")
            start("c", steady(1000), 1, 1000)
            render(1)
        }
        scenario("chord-survives-run") {
            for (k in listOf("note:60", "note:64", "note:67")) start(k, steady(1000), 1, 1000)
            render(1)
            for (n in 72 until 82) {
                release("note:${n - 1}")
                start("note:$n", steady(1000), 1, 1000)
                render(1)
            }
        }
        scenario("stop-all") {
            start("a", steady(1000), 1, 1000)
            start("b", steady(1000), 1, 1000)
            render(5)
            stopAll()
            render(10)
        }
        scenario("started-frame-and-tag") {
            render(64)
            start("a", steady(10), 1, 1000, tag = 42)
            render(16)
            render(16)
        }
        scenario("release-nothing") {
            release("nothing")
            start("a", steady(10), 1, 1000)
            render(1)
        }
        scenario("cut-inside-gate") {
            start("a", steady(1000), 1, 1000)
            render(10)
            cut("a")
            render(20)
        }
        scenario("cut-with-start") {
            start("a", steady(1000), 1, 1000)
            cut("a")
            render(10)
        }
        scenario("cut-after-release") {
            start("a", steady(1000), 1, 1000)
            release("a")
            render(5)
            cut("a")
            render(10)
        }
        scenario("cut-leaves-others") {
            start("a", steady(1000, 1000), 1, 1000)
            start("b", steady(1000, 2000), 1, 1000)
            render(5)
            cut("a")
            render(10)
        }
        scenario("cut-nothing") {
            start("a", steady(1000), 1, 1000)
            render(1)
            cut("nothing")
            render(10)
        }
        scenario("many-renders") {
            for (n in 0 until 20) {
                start("a", steady(1000), 1, 1000, tag = n.toLong())
                start("b", steady(1000), 1, 1000)
                render(10)
                render(10)
                cut("b")
                render(10)
                release("a")
                render(200)
            }
        }
        scenario("too-short-to-play") {
            start("a", ShortArray(0), 1, 1000)
            start("b", shortArrayOf(5), 2, 1000)
            start("c", shortArrayOf(7), 1, 1000)
            render(3)
        }
        scenario("cut-mid-fade") {
            start("a", steady(1000), 1, 1000)
            render(60)
            release("a")
            render(12)
            cut("a")
            render(5)
            start("a", steady(1000), 1, 1000)
            render(30)
            release("a")
            render(85)
            stopAll()
            render(4)
        }

        // Real rates and pitches, the EP-133's 46875 Hz sounds among them, with random presses.
        val rates = intArrayOf(46875, 44100, 48000, 22050, 96000)
        val pool = listOf("live:1:0", "live:1:5", "live:2:11", "note:48", "note:55", "note:60", "note:61", "note:67", "note:72", "note:84")
        for ((i, setup) in listOf(48000 to 8, 44100 to 8, 46875 to 3, 96000 to 8, 48000 to 2, 16000 to 8).withIndex()) {
            val random = Random(133 + i)
            scenario("random-$i", outRate = setup.first, maxVoices = setup.second) {
                val sounds = List(6) {
                    val channels = 1 + random.nextInt(2)
                    val frames = 20 + random.nextInt(if (it == 0) 20000 else 3000)
                    Triple(noise(channels, frames, random.nextLong(1, Long.MAX_VALUE)), channels, rates[random.nextInt(rates.size)])
                }
                repeat(400) {
                    val key = pool[random.nextInt(pool.size)]
                    when (random.nextInt(100)) {
                        in 0 until 34 -> {
                            val (pcm, channels, rate) = sounds[random.nextInt(sounds.size)]
                            start(key, pcm, channels, rate, random.nextInt(-36, 37), random.nextLong(1, 1_000_000))
                        }
                        in 34 until 58 -> release(key)
                        in 58 until 68 -> cut(key)
                        in 68 until 71 -> stopAll()
                        else -> render(1 + random.nextInt(if (random.nextInt(4) == 0) 2000 else 300))
                    }
                }
                render(setup.first / 4)
            }
        }
        shapes(::scenario)
        timed(::scenario)
        fx(::scenario)
        tone(::scenario)
        return out.toString()
    }

    /** The voice shapes' scenarios: each setting and mode, then random ones. */
    private fun shapes(play: (String, Int, Int, Trace.() -> Unit) -> Unit) {
        fun scenario(name: String, outRate: Int = 1000, maxVoices: Int = VoiceMixer.MAX_VOICES, body: Trace.() -> Unit) =
            play(name, outRate, maxVoices, body)
        fun steady(n: Int, v: Short = 1000) = ShortArray(n) { v }
        val ramp = ShortArray(10) { (it * 100).toShort() }

        scenario("shape-gain") {
            start("a", steady(100), 1, 1000, shape = VoiceShape(gain = 0.5f))
            start("b", steady(100, 3001), 1, 1000, shape = VoiceShape(gain = 0.3f))
            render(4)
            start("c", steady(100, 7), 1, 1000, shape = VoiceShape(gain = 0f))
            render(4)
            release("a")
            release("b")
            release("c")
            render(64)
        }
        scenario("shape-pan") {
            val stereo = ShortArray(200) { if (it % 2 == 0) 1000 else -2000 }
            start("l", stereo, 2, 1000, shape = VoiceShape(pan = -16))
            render(2)
            start("l", stereo, 2, 1000, shape = VoiceShape(pan = 16))
            render(6)
            start("l", stereo, 2, 1000, shape = VoiceShape(pan = 5, gain = 0.7f))
            start("m", steady(100, 999), 1, 1000, shape = VoiceShape(pan = -3))
            render(6)
            start("l", stereo, 2, 1000, shape = VoiceShape(pan = 40))
            start("m", steady(100, 999), 1, 1000, shape = VoiceShape(pan = -40))
            render(6)
        }
        scenario("shape-trim") {
            start("a", ramp, 1, 1000, shape = VoiceShape(start = 2, end = 6))
            render(6)
            start("a", ramp, 1, 500, shape = VoiceShape(start = 7))
            render(10)
            start("a", ramp, 1, 1000, shape = VoiceShape(start = -5, end = 3))
            render(5)
            start("a", ramp, 1, 1000, shape = VoiceShape(start = 4, end = 5))
            render(3)
            // Nothing left: nothing plays, nothing is cut.
            start("b", ramp, 1, 1000, shape = VoiceShape(end = 40))
            start("b", ramp, 1, 1000, shape = VoiceShape(start = 6, end = 6))
            start("c", ramp, 1, 1000, shape = VoiceShape(start = 3, end = 1))
            start("d", ramp, 1, 1000, shape = VoiceShape(start = 10))
            render(12)
            val stereo = ShortArray(20) { (it * 37 - 300).toShort() }
            start("s", stereo, 2, 1000, semitones = 7, shape = VoiceShape(start = 3, end = 9))
            render(8)
        }
        scenario("shape-attack") {
            start("a", steady(1000), 1, 1000, shape = VoiceShape(attackMs = 10))
            render(16)
            release("a")
            render(64)
            render(16)
            // Let go of inside the attack, and cut inside it.
            start("b", steady(1000), 1, 1000, shape = VoiceShape(attackMs = 100))
            release("b")
            render(64)
            render(64)
            start("c", steady(1000), 1, 1000, shape = VoiceShape(attackMs = 30, gain = 0.9f, pan = 4))
            render(12)
            cut("c")
            render(8)
            start("d", steady(1000), 1, 1000, shape = VoiceShape(attackMs = -5))
            render(2)
        }
        scenario("shape-release") {
            start("a", steady(1000), 1, 1000, shape = VoiceShape(releaseMs = 100))
            release("a")
            render(64)
            render(64)
            render(64)
            start("b", steady(1000), 1, 1000, shape = VoiceShape(releaseMs = 5))
            render(60)
            release("b")
            render(30)
            start("c", steady(1000), 1, 1000, shape = VoiceShape(releaseMs = 50))
            render(70)
            release("c")
            render(10)
            cut("c")
            render(6)
        }
        scenario("mode-oneshot") {
            start("a", steady(40), 1, 1000, shape = VoiceShape(mode = VoiceMode.ONESHOT))
            release("a")
            render(50)
            start("a", steady(200), 1, 1000, shape = VoiceShape(mode = VoiceMode.ONESHOT))
            render(10)
            // The same key again starts over.
            start("a", steady(200, 2000), 1, 1000, shape = VoiceShape(mode = VoiceMode.ONESHOT))
            release("a")
            render(10)
            cut("a")
            render(6)
            start("b", steady(200), 1, 1000, shape = VoiceShape(mode = VoiceMode.ONESHOT))
            render(3)
            stopAll()
            render(6)
        }
        scenario("mode-oneshot-steal", maxVoices = 2) {
            // A one-shot let go of plays on, but past the limit it goes before an older held voice.
            start("a", steady(1000, 1000), 1, 1000)
            start("b", steady(1000, 2000), 1, 1000, shape = VoiceShape(mode = VoiceMode.ONESHOT))
            render(1)
            release("b")
            render(1)
            start("c", steady(1000, 4000), 1, 1000)
            render(8)
            // Still held, a one-shot is stolen only as the oldest held.
            start("b", steady(1000, 2000), 1, 1000, shape = VoiceShape(mode = VoiceMode.ONESHOT))
            render(8)
        }
        scenario("mode-key") {
            start("k", steady(1000, 1000), 1, 1000, shape = VoiceShape(mode = VoiceMode.KEY))
            render(4)
            start("k", steady(1000, 1000), 1, 1000, tag = 2, shape = VoiceShape(mode = VoiceMode.KEY))
            render(4)
            start("k", steady(1000, 500), 1, 1000, tag = 3, shape = VoiceShape(mode = VoiceMode.KEY))
            start("j", steady(1000, 100), 1, 1000)
            render(4)
            release("k")
            render(64)
            render(30)
            start("k", steady(1000, 1000), 1, 1000, shape = VoiceShape(mode = VoiceMode.KEY))
            start("k", steady(1000, 1000), 1, 1000, shape = VoiceShape(mode = VoiceMode.KEY))
            render(4)
            cut("k")
            render(6)
            // A gated start on the key cuts all its voices.
            start("k", steady(1000, 1000), 1, 1000, shape = VoiceShape(mode = VoiceMode.KEY))
            start("k", steady(1000, 1000), 1, 1000, shape = VoiceShape(mode = VoiceMode.KEY))
            render(2)
            start("k", steady(1000, 1000), 1, 1000)
            render(6)
            stopAll()
            render(6)
        }
        scenario("mode-key-steal", maxVoices = 3) {
            for (n in 0 until 5) {
                start("k", steady(1000, (100 * (n + 1)).toShort()), 1, 1000, tag = n.toLong(), shape = VoiceShape(mode = VoiceMode.KEY))
                render(1)
            }
            release("k")
            render(64)
            render(40)
        }
        scenario("mode-legato") {
            val sound = ShortArray(400) { (it * 5).toShort() }
            val other = ShortArray(400) { (2000 - it * 3).toShort() }
            start("l", sound, 1, 1000, shape = VoiceShape(mode = VoiceMode.LEGATO))
            render(8)
            // Held, the same sound: the voice goes on at the new pitch.
            start("l", sound, 1, 1000, semitones = 12, tag = 5, shape = VoiceShape(mode = VoiceMode.LEGATO))
            render(8)
            start("l", sound, 1, 1000, semitones = -7, tag = 6, shape = VoiceShape(mode = VoiceMode.LEGATO, semitones = 0.5))
            render(8)
            // Another sound: it starts over, as gated.
            start("l", other, 1, 1000, tag = 7, shape = VoiceShape(mode = VoiceMode.LEGATO))
            render(8)
            // Let go of: the next press starts a new voice.
            release("l")
            render(64)
            start("l", other, 1, 1000, tag = 8, shape = VoiceShape(mode = VoiceMode.LEGATO))
            render(8)
            // A gated voice held on the key isn't carried on.
            start("g", sound, 1, 1000)
            render(4)
            start("g", sound, 1, 1000, semitones = 3, shape = VoiceShape(mode = VoiceMode.LEGATO))
            render(8)
            start("g", sound, 1, 1000, semitones = 5, shape = VoiceShape(mode = VoiceMode.LEGATO))
            render(8)
            release("g")
            release("l")
            render(64)
            render(40)
        }
        scenario("mute-group") {
            start("open", steady(1000, 1000), 1, 1000, shape = VoiceShape(muteGroup = 1))
            start("ride", steady(1000, 300), 1, 1000, shape = VoiceShape(muteGroup = 2))
            start("kick", steady(1000, 50), 1, 1000)
            render(10)
            // The closed hat chokes the open one; the ride and the kick play on.
            start("closed", steady(1000, 2000), 1, 1000, shape = VoiceShape(muteGroup = 1, mode = VoiceMode.ONESHOT))
            render(10)
            start("open", steady(1000, 1000), 1, 1000, shape = VoiceShape(muteGroup = 1))
            start("snare", steady(1000, 7), 1, 1000)
            render(10)
            start("k1", steady(1000, 10), 1, 1000, shape = VoiceShape(muteGroup = 3, mode = VoiceMode.KEY))
            start("k1", steady(1000, 20), 1, 1000, shape = VoiceShape(muteGroup = 3, mode = VoiceMode.KEY))
            render(10)
            stopAll()
            render(6)
        }

        // Real rates and pitches with random shapes and presses.
        val rates = intArrayOf(46875, 44100, 48000, 22050, 96000)
        val pool = listOf("live:1:0", "live:1:5", "live:2:11", "note:48", "note:55", "note:60", "note:61", "note:67")
        val modes = VoiceMode.entries
        for ((i, setup) in listOf(48000 to 8, 46875 to 4, 44100 to 8, 22050 to 2).withIndex()) {
            val random = Random(1330 + i)
            scenario("random-shape-$i", setup.first, setup.second) {
                val sounds = List(5) {
                    val channels = 1 + random.nextInt(2)
                    val frames = 20 + random.nextInt(if (it == 0) 20000 else 3000)
                    Triple(noise(channels, frames, random.nextLong(1, Long.MAX_VALUE)), channels, rates[random.nextInt(rates.size)])
                }
                repeat(400) {
                    val key = pool[random.nextInt(pool.size)]
                    when (random.nextInt(100)) {
                        in 0 until 36 -> {
                            val (pcm, channels, rate) = sounds[random.nextInt(sounds.size)]
                            val frames = pcm.size / channels
                            val shape = VoiceShape(
                                semitones = if (random.nextBoolean()) 0.0 else random.nextInt(-240, 241) / 20.0,
                                gain = if (random.nextInt(3) == 0) 1f else random.nextInt(0, 101) / 100f,
                                pan = random.nextInt(-16, 17),
                                start = if (random.nextBoolean()) 0 else random.nextInt(-10, frames + 10),
                                end = if (random.nextBoolean()) Int.MAX_VALUE else random.nextInt(0, frames + 10),
                                attackMs = if (random.nextBoolean()) 0 else random.nextInt(0, 500),
                                releaseMs = if (random.nextBoolean()) VoiceMixer.FADE_MS else random.nextInt(0, 2000),
                                mode = modes[random.nextInt(modes.size)],
                                muteGroup = if (random.nextBoolean()) 0 else random.nextInt(1, 4),
                            )
                            start(key, pcm, channels, rate, random.nextInt(-12, 13), random.nextLong(1, 1_000_000), shape)
                        }
                        in 36 until 58 -> release(key)
                        in 58 until 66 -> cut(key)
                        in 66 until 68 -> stopAll()
                        else -> render(1 + random.nextInt(if (random.nextInt(4) == 0) 2000 else 300))
                    }
                }
                render(setup.first / 4)
            }
        }
    }

    /** The timed commands' scenarios: inside a render, on its edge and late, tags, a mute group, the flush, then random ones. */
    private fun timed(play: (String, Int, Int, Trace.() -> Unit) -> Unit) {
        fun scenario(name: String, outRate: Int = 1000, maxVoices: Int = VoiceMixer.MAX_VOICES, body: Trace.() -> Unit) =
            play(name, outRate, maxVoices, body)
        fun steady(n: Int, v: Short = 1000) = ShortArray(n) { v }
        val now = VoiceMixer.NOW

        scenario("timed-in-block") {
            render(16)
            // Inside the next render, on its end (so the one after's start), and gone already.
            start("a", steady(100, 1000), 1, 1000, tag = -1, at = 20)
            start("b", steady(100, 2000), 1, 1000, tag = -2, at = 32)
            start("c", steady(100, 3000), 1, 1000, tag = -3, at = 10)
            // Not timed: before the late one, though sent after it.
            start("d", steady(100, 50), 1, 1000, tag = 4)
            render(16)
            render(16)
            // Two at one frame keep their order; one a frame later.
            start("e", steady(100, 100), 1, 1000, tag = -5, at = 50)
            start("f", steady(100, 200), 1, 1000, tag = -6, at = 50)
            start("g", steady(100, 300), 1, 1000, tag = -7, at = 51)
            releaseAt("a", 40, -1)
            releaseAt("b", 63, -2)
            render(32)
            // Several in one render, and a render that ends just before one.
            start("a", steady(100, 400), 1, 1000, tag = -8, at = 85)
            start("b", steady(100, 500), 1, 1000, tag = -9, at = 90)
            start("c", steady(100, 600), 1, 1000, tag = -10, at = 92)
            start("d", steady(100, 700), 1, 1000, tag = -11, at = 97)
            render(17)
            render(1)
            render(64)
            stopAll()
            render(64)
            // An empty render applies what is due, and nothing else.
            start("h", steady(100, 800), 1, 1000, tag = -12, at = 226)
            start("i", steady(100, 900), 1, 1000, tag = -13, at = 227)
            render(0)
            render(1)
            render(4)
        }
        scenario("timed-tagged-release") {
            start("p", steady(1000, 1000), 1, 1000, tag = -5, at = 4)
            render(8)
            // A press of the same key cuts the sequencer's voice; the sequencer's note-off then leaves the press alone.
            start("p", steady(1000, 2000), 1, 1000, tag = 77)
            releaseAt("p", 20, -5)
            render(32)
            render(32)
            release("p")
            render(100)
            // Key mode: two voices on the key, one let go of by its tag.
            val key = VoiceShape(mode = VoiceMode.KEY)
            start("k", steady(1000, 1000), 1, 1000, tag = -6, shape = key, at = 174)
            start("k", steady(1000, 300), 1, 1000, tag = 9, shape = key)
            releaseAt("k", 180, -6)
            render(32)
            render(100)
            // Tagged, not timed.
            releaseAt("k", now, 9)
            render(100)
            // Legato: a press carrying on the sequencer's voice takes it over, tag and all.
            val legato = VoiceShape(mode = VoiceMode.LEGATO)
            val sound = ShortArray(1000) { (it * 3).toShort() }
            start("l", sound, 1, 1000, tag = -7, shape = legato, at = 410)
            render(16)
            start("l", sound, 1, 1000, semitones = 5, tag = 12, shape = legato)
            releaseAt("l", 490, -7)
            render(32)
            render(64)
            releaseAt("l", 560, 12)
            render(64)
            render(64)
            // A tag no voice has lets go of nothing; untagged and timed lets go of them all.
            start("m", steady(1000, 100), 1, 1000, tag = -8, shape = key)
            start("m", steady(1000, 200), 1, 1000, tag = -9, shape = key)
            releaseAt("m", 700, -10)
            render(16)
            releaseAt("m", 720, 0)
            render(64)
            render(64)
        }
        scenario("timed-mute-group") {
            start("open", steady(1000, 1000), 1, 1000, shape = VoiceShape(muteGroup = 1))
            start("ride", steady(1000, 300), 1, 1000, shape = VoiceShape(muteGroup = 2))
            render(8)
            // The closed hat chokes the open one on its frame, inside the render.
            start("closed", steady(1000, 2000), 1, 1000, tag = -1, shape = VoiceShape(muteGroup = 1, mode = VoiceMode.ONESHOT), at = 13)
            render(16)
            start("open", steady(1000, 1000), 1, 1000, tag = -2, shape = VoiceShape(muteGroup = 1), at = 30)
            start("snare", steady(1000, 7), 1, 1000, tag = -3, at = 30)
            render(16)
            render(8)
            stopAll()
            render(8)
        }
        scenario("timed-flush") {
            start("a", steady(100, 1000), 1, 1000, tag = -1, at = 10)
            releaseAt("a", 12, -1)
            flushTimed()
            // Sent after the flush: kept.
            start("b", steady(100, 2000), 1, 1000, tag = -2, at = 12)
            render(16)
            // Waiting from an earlier render, then flushed.
            start("c", steady(100, 3000), 1, 1000, tag = -3, at = 100)
            releaseAt("b", 90, -2)
            render(16)
            flushTimed()
            render(64)
            render(64)
            // A flush with nothing waiting.
            flushTimed()
            start("d", steady(100, 400), 1, 1000, tag = -4, at = 170)
            render(16)
            render(16)
        }

        // As the pattern sequencer sends them: notes ahead of the render (some late), each let go of by its
        // tag after its gate, with presses, cuts, stops and flushes between, at real rates and block sizes.
        val rates = intArrayOf(46875, 44100, 48000, 22050)
        val pool = listOf("seq:0:0", "seq:0:3", "seq:1:5", "seq:2:11", "live:0:3", "live:1:5", "note:60", "note:64")
        val modes = VoiceMode.entries
        var n = 0
        for (rate in intArrayOf(44100, 48000)) {
            for ((block, renders) in listOf(1 to 400, 96 to 200, 192 to 150, 1024 to 60)) {
                val random = Random(13300 + n++)
                scenario("random-timed-$rate-$block", rate, VoiceMixer.MAX_VOICES) {
                    val sounds = List(5) {
                        val channels = 1 + random.nextInt(2)
                        val frames = 20 + random.nextInt(if (it == 0) 20000 else 3000)
                        Triple(noise(channels, frames, random.nextLong(1, Long.MAX_VALUE)), channels, rates[random.nextInt(rates.size)])
                    }
                    // How far ahead the sequencer looks: about 50 ms, but at least a few renders.
                    val ahead = maxOf(rate / 20, block * 3)
                    var tag = 0L
                    repeat(renders) {
                        // One-frame renders get commands now and then, as a sequencer's would: and fewer voices
                        // fading out at once than the native mixer's VOICE_SLOTS (past those it drops the oldest).
                        if (block < 96 && random.nextInt(6) != 0) {
                            render(block)
                            return@repeat
                        }
                        repeat(random.nextInt(4)) {
                            val key = pool[random.nextInt(pool.size)]
                            val r = random.nextInt(100)
                            when {
                                r < 45 -> {
                                    val (pcm, channels, sr) = sounds[random.nextInt(sounds.size)]
                                    val shape = if (random.nextInt(3) == 0) {
                                        VoiceShape(
                                            gain = random.nextInt(0, 101) / 100f,
                                            pan = random.nextInt(-16, 17),
                                            attackMs = if (random.nextBoolean()) 0 else random.nextInt(0, 50),
                                            releaseMs = if (random.nextBoolean()) VoiceMixer.FADE_MS else random.nextInt(0, 300),
                                            mode = modes[random.nextInt(modes.size)],
                                            muteGroup = if (random.nextBoolean()) 0 else random.nextInt(1, 3),
                                        )
                                    } else {
                                        VoiceShape.DEFAULT
                                    }
                                    // Mostly ahead, now and then already gone.
                                    val at = mixer.frame + random.nextInt(-ahead / 4, ahead)
                                    val t = -(++tag)
                                    start(key, pcm, channels, sr, random.nextInt(-12, 13), t, shape, at)
                                    if (random.nextInt(5) != 0) releaseAt(key, at + random.nextInt(1, ahead * 2), t)
                                }
                                r < 60 -> {
                                    val (pcm, channels, sr) = sounds[random.nextInt(sounds.size)]
                                    start(key, pcm, channels, sr, random.nextInt(-12, 13), random.nextLong(1, 1_000_000))
                                }
                                r < 72 -> release(key)
                                r < 78 -> releaseAt(key, now, -random.nextLong(1, tag + 2))
                                r < 84 -> cut(key)
                                r < 87 -> stopAll()
                                r < 90 -> flushTimed()
                                else -> releaseAt(key, mixer.frame + random.nextInt(0, ahead), -random.nextLong(1, tag + 2))
                            }
                        }
                        render(block)
                    }
                    render(rate / 4)
                }
            }
        }
    }

    /** The FX bus's scenarios: sends, the dry law, the duck, smoothing, the tempo, then random ones. */
    private fun fx(play: (String, Int, Int, Trace.() -> Unit) -> Unit) {
        fun scenario(name: String, outRate: Int = 1000, maxVoices: Int = VoiceMixer.MAX_VOICES, body: Trace.() -> Unit) =
            play(name, outRate, maxVoices, body)
        fun steady(n: Int, v: Short = 1000) = ShortArray(n) { v }
        fun on(bus: Int, duck: Boolean = false, mode: VoiceMode = VoiceMode.GATE) = VoiceShape(bus = bus, duckSource = duck, mode = mode)

        scenario("fx-sends-none") {
            // No effect: the dry law is 1, so every group plays as before, sends or not.
            for ((g, send) in listOf(0.25f, 0.5f, 0.75f, 1f).withIndex()) control(FxControl.SEND, g, send, 0f)
            start("a", steady(1000, 1000), 1, 1000, shape = on(0))
            start("b", steady(1000, 2000), 1, 1000, shape = on(1))
            start("c", steady(1000, 3000), 1, 1000, shape = on(2))
            start("d", steady(1000, 4000), 1, 1000, shape = on(3))
            start("e", steady(1000, 500), 1, 1000)
            render(16)
            render(64)
            control(FxControl.SEND, 1, 0f, 0f)
            release("a")
            release("c")
            render(64)
            render(64)
        }
        scenario("fx-dry-law") {
            // A send with an effect (the delay adds nothing so far): the dry gives way by the effect's law.
            control(FxControl.FX_TYPE, FxControl.DELAY, 0.3f, 0.6f)
            control(FxControl.SEND, 0, 1f, 0f)
            control(FxControl.SEND, 2, 0.5f, 0f)
            start("a", steady(2000, 1000), 1, 1000, shape = on(0))
            start("b", steady(2000, 2000), 1, 1000, shape = on(1))
            start("c", steady(2000, 3000), 1, 1000, shape = on(2))
            start("free", steady(2000, 300), 1, 1000)
            render(32)
            render(64)
            for (type in listOf(FxControl.DISTORTION, FxControl.FILTER, FxControl.REVERB, FxControl.CHORUS, FxControl.COMPRESSOR)) {
                control(FxControl.FX_TYPE, type, 0.5f, 0.5f)
                render(48)
            }
            control(FxControl.FX_XY, 0, 0.9f, 0.1f)
            render(16)
            // Two changes in one render, a type out of range (none), and back.
            control(FxControl.FX_TYPE, FxControl.DELAY, 0.5f, 0.5f)
            control(FxControl.FX_TYPE, FxControl.REVERB, 0.5f, 0.5f)
            render(8)
            control(FxControl.FX_TYPE, 9, 0.5f, 0.5f)
            render(40)
            control(FxControl.FX_TYPE, FxControl.FILTER, 0.5f, 0.5f)
            control(FxControl.SEND, 0, 0f, 0f)
            render(64)
            stopAll()
            render(16)
        }
        scenario("fx-duck-now") {
            control(FxControl.SIDECHAIN, 0b0001, 0f, 0f)
            start("bass", steady(1000, 1000), 1, 1000, shape = on(0))
            start("pad", steady(1000, 2000), 1, 1000, shape = on(1))
            render(8)
            // The source plays (straight to the mix) and ducks group A: 2 ms down, back by 30 ms.
            start("kick", steady(20, 500), 1, 1000, shape = on(-1, duck = true))
            render(48)
            // Again inside the duck: from where it is. Then the slow curve and the longest.
            start("kick", steady(20, 500), 1, 1000, shape = on(-1, duck = true))
            render(10)
            start("kick", steady(20, 500), 1, 1000, shape = on(-1, duck = true))
            render(40)
            control(FxControl.SIDECHAIN, 0b0011, 1f, 1f)
            start("kick", steady(20, 500), 1, 1000, shape = on(2, duck = true))
            render(64)
            render(64)
            render(64)
            render(64)
            render(64)
            render(64)
            render(64)
            render(64)
            render(64)
            render(64)
        }
        scenario("fx-duck-timed-silent") {
            control(FxControl.SIDECHAIN, 0b0001, 0.2f, 0.5f)
            start("bass", steady(1000, 1000), 1, 1000, shape = on(0))
            render(4)
            // Nothing to play, timed inside the next render: it ducks on its own frame all the same.
            start("ghost", ShortArray(0), 1, 1000, tag = -1, shape = on(-1, duck = true), at = 10)
            render(64)
            render(64)
            // Trimmed to nothing, and a legato start that only changes a held voice's pitch: both duck.
            start("trim", steady(100), 1, 1000, tag = -2, shape = VoiceShape(start = 50, end = 50, duckSource = true), at = 140)
            render(64)
            val lead = steady(1000, 700)
            start("lead", lead, 1, 1000, shape = on(0, mode = VoiceMode.LEGATO))
            render(64)
            start("lead", lead, 1, 1000, semitones = 3, tag = -3, shape = on(0, duck = true, mode = VoiceMode.LEGATO), at = 270)
            render(64)
            render(64)
            // A source on a bus that's ducked ducks itself.
            start("self", steady(100, 4000), 1, 1000, shape = on(0, duck = true))
            render(32)
        }
        scenario("fx-duck-dests") {
            control(FxControl.SIDECHAIN, 0b0101, 0.1f, 0.3f)
            for (g in 0 until 4) start("g$g", steady(2000, (1000 * (g + 1)).toShort()), 1, 1000, shape = on(g))
            start("free", steady(2000, 100), 1, 1000)
            render(4)
            start("kick", ShortArray(0), 1, 1000, shape = on(-1, duck = true))
            render(32)
            // The mask changes while ducking: the duck carries on, on the new groups.
            control(FxControl.SIDECHAIN, 0b1010, 0.1f, 0.3f)
            render(16)
            // Off mid-duck: back to 1 at once; on again: still mid-duck.
            control(FxControl.SIDECHAIN, 0, 0.1f, 0.3f)
            render(4)
            control(FxControl.SIDECHAIN, 0b1111, 0.1f, 0.3f)
            render(32)
            start("kick", ShortArray(0), 1, 1000, shape = on(-1, duck = true))
            render(64)
            render(64)
        }
        scenario("fx-control-smoothing", outRate = 48000) {
            control(FxControl.FX_TYPE, FxControl.DISTORTION, 0.5f, 0.5f)
            start("a", steady(48000, 10000), 1, 48000, shape = on(0))
            start("b", steady(48000, -8000), 1, 48000, shape = on(3))
            render(64)
            // A send glides up over about 20 ms (the dry down with it), then down.
            control(FxControl.SEND, 0, 1f, 0f)
            control(FxControl.SEND, 3, 0.3f, 0f)
            repeat(20) { render(64) }
            render(4096)
            render(64)
            control(FxControl.SEND, 0, 0.2f, 0f)
            control(FxControl.FX_XY, 0, 0f, 1f)
            repeat(20) { render(64) }
            // SEND_FX held: every group sends at least its depth.
            control(FxControl.PUNCH, FxControl.SEND_FX, 0.6f, 0f)
            repeat(4) { render(64) }
            control(FxControl.PUNCH, FxControl.SEND_FX, 0f, 0f)
            repeat(4) { render(64) }
            render(24000)
            render(64)
        }
        scenario("fx-tempo-and-the-rest") {
            // The tempo, held to 20..300, then the punch-ins (stubs for now) and the master compressor.
            start("a", steady(1000, 1000), 1, 1000, shape = on(1))
            control(FxControl.SEND, 1, 0.5f, 0f)
            control(FxControl.FX_TYPE, FxControl.DELAY, 0.5f, 0.5f)
            for (bpm in listOf(90f, 5f, 400f, Float.NaN, 120f)) {
                control(FxControl.TEMPO, 0, bpm, 0f)
                render(8)
            }
            for (slot in 0 until FxControl.SLOTS) control(FxControl.PUNCH, slot, 0.7f, 0f)
            control(FxControl.PUNCH, 12, 1f, 0f)
            control(FxControl.PUNCH, -1, 1f, 0f)
            render(16)
            for (slot in 0 until FxControl.SLOTS) control(FxControl.PUNCH, slot, -1f, 0f)
            render(16)
            control(FxControl.COMP, 1, 0.8f, 0.2f)
            render(16)
            control(FxControl.COMP, 0, 0.8f, 0.2f)
            // Out of range and not numbers: held, or ignored.
            control(FxControl.SEND, 7, 1f, 0f)
            control(FxControl.SEND, 1, Float.NaN, 0f)
            control(FxControl.SIDECHAIN, -1, 2f, -3f)
            control(99, 0, 1f, 1f)
            render(16)
            render(32)
        }

        // As the controller will send them: random controls between renders, voices on random buses (some of
        // them duck sources, some timed), at real rates and block sizes.
        val rates = intArrayOf(46875, 44100, 48000, 22050)
        val pool = listOf("seq:0:0", "seq:0:3", "seq:1:5", "seq:2:11", "live:0:3", "live:1:5", "live:3:7", "note:60")
        val modes = VoiceMode.entries
        var n = 0
        for (rate in intArrayOf(44100, 48000)) {
            for ((block, renders) in listOf(96 to 300, 192 to 150, 1024 to 60)) {
                val random = Random(13310 + n++)
                scenario("random-fx-$rate-$block", rate, VoiceMixer.MAX_VOICES) {
                    val sounds = List(5) {
                        val channels = 1 + random.nextInt(2)
                        val frames = if (it == 4) 0 else 20 + random.nextInt(if (it == 0) 20000 else 3000)
                        Triple(noise(channels, frames, random.nextLong(1, Long.MAX_VALUE)), channels, rates[random.nextInt(rates.size)])
                    }
                    val ahead = maxOf(rate / 20, block * 3)
                    var tag = 0L
                    repeat(renders) {
                        repeat(random.nextInt(3)) {
                            when (random.nextInt(8)) {
                                0 -> control(FxControl.FX_TYPE, random.nextInt(FxControl.TYPES), random.nextFloat(), random.nextFloat())
                                1 -> control(FxControl.FX_XY, 0, random.nextFloat(), random.nextFloat())
                                2, 3 -> control(FxControl.SEND, random.nextInt(4), if (random.nextInt(3) == 0) 0f else random.nextFloat(), 0f)
                                4 -> control(FxControl.SIDECHAIN, random.nextInt(16), random.nextFloat(), random.nextFloat())
                                5 -> control(FxControl.COMP, random.nextInt(2), random.nextFloat(), random.nextFloat())
                                6 -> control(FxControl.TEMPO, 0, 60f + random.nextInt(140), 0f)
                                else -> control(FxControl.PUNCH, random.nextInt(FxControl.SLOTS), if (random.nextBoolean()) 0f else random.nextFloat(), 0f)
                            }
                        }
                        repeat(random.nextInt(4)) {
                            val key = pool[random.nextInt(pool.size)]
                            val r = random.nextInt(100)
                            val (pcm, channels, sr) = sounds[random.nextInt(sounds.size)]
                            val shape = VoiceShape(
                                gain = if (random.nextBoolean()) 1f else random.nextInt(0, 101) / 100f,
                                pan = if (random.nextBoolean()) 0 else random.nextInt(-16, 17),
                                mode = modes[random.nextInt(modes.size)],
                                bus = random.nextInt(-1, 4),
                                duckSource = random.nextInt(5) == 0,
                            )
                            when {
                                r < 45 -> {
                                    val at = mixer.frame + random.nextInt(-ahead / 4, ahead)
                                    val t = -(++tag)
                                    start(key, pcm, channels, sr, random.nextInt(-12, 13), t, shape, at)
                                    if (random.nextInt(5) != 0) releaseAt(key, at + random.nextInt(1, ahead * 2), t)
                                }
                                r < 70 -> start(key, pcm, channels, sr, random.nextInt(-12, 13), random.nextLong(1, 1_000_000), shape)
                                r < 88 -> release(key)
                                r < 94 -> cut(key)
                                r < 96 -> stopAll()
                                else -> flushTimed()
                            }
                        }
                        render(block)
                    }
                    render(rate / 4)
                }
            }
        }
    }

    /**
     * The tone effects' scenarios: the distortion, the filter and the compressor on the send bus, and the
     * master compressor, through the mixer's controls (knobs swept a block at a time, types switched
     * mid-sound and mid-fade, tails into silence), then random ones.
     */
    private fun tone(play: (String, Int, Int, Trace.() -> Unit) -> Unit) {
        fun scenario(name: String, outRate: Int = 1000, maxVoices: Int = VoiceMixer.MAX_VOICES, body: Trace.() -> Unit) =
            play(name, outRate, maxVoices, body)
        fun steady(n: Int, v: Short = 1000) = ShortArray(n) { v }
        fun on(bus: Int) = VoiceShape(bus = bus)
        // An impulse, for the filters' ringing and tails.
        val click = ShortArray(32).also {
            it[0] = 30000
            it[1] = -20000
        }

        scenario("tone-distortion", outRate = 48000) {
            val hiss = noise(2, 48000, 1331)
            control(FxControl.FX_TYPE, FxControl.DISTORTION, 0f, 0.5f)
            control(FxControl.SEND, 0, 1f, 0f)
            control(FxControl.SEND, 1, 0.5f, 0f)
            start("a", hiss, 2, 48000, shape = on(0))
            start("b", click, 1, 48000, shape = on(1))
            render(32)
            render(96)
            // The drive up, the colour from bright to dark, a block at a time.
            for (i in 0..20) {
                control(FxControl.FX_XY, 0, i / 20f, 1f - i / 20f)
                render(96)
            }
            // Back and forth across the middle of the colour, at the hardest drive.
            start("b", click, 1, 48000, shape = on(1))
            for (i in 0..10) {
                control(FxControl.FX_XY, 0, 1f, 0.45f + i * 0.01f)
                render(64)
            }
            for (i in 10 downTo 0) {
                control(FxControl.FX_XY, 0, 0.6f, 0.45f + i * 0.01f)
                render(96)
            }
            // Its tail once the sound is gone, then silence (skipped).
            release("a")
            repeat(10) { render(96) }
            render(4800)
            render(96)
        }
        scenario("tone-filter", outRate = 44100) {
            val hiss = noise(1, 44100, 2024)
            control(FxControl.FX_TYPE, FxControl.FILTER, 0.1f, 0.2f)
            control(FxControl.SEND, 2, 1f, 0f)
            start("n", hiss, 1, 44100, shape = on(2))
            start("free", steady(44100, 500), 1, 44100)
            render(64)
            render(96)
            // From the low-pass across the middle to the high-pass, the resonance up with it, and back.
            for (i in 0..40) {
                control(FxControl.FX_XY, 0, i / 40f, i / 40f)
                render(96)
            }
            for (i in 40 downTo 0 step 4) {
                control(FxControl.FX_XY, 0, i / 40f, 0.5f)
                render(96)
            }
            // Jumps: the low-pass over to the high-pass, and back before that has faded.
            control(FxControl.FX_XY, 0, 0.05f, 1f)
            repeat(3) { render(96) }
            control(FxControl.FX_XY, 0, 0.95f, 1f)
            render(64)
            control(FxControl.FX_XY, 0, 0.05f, 1f)
            repeat(4) { render(96) }
            // The resonance rings on a click once the noise is gone (the same type: the knobs only).
            cut("n")
            control(FxControl.FX_TYPE, FxControl.FILTER, 0.3f, 1f)
            repeat(4) { render(96) }
            start("c", click, 1, 44100, shape = on(2))
            render(64)
            repeat(6) { render(96) }
            control(FxControl.FX_XY, 0, 0.8f, 1f)
            start("c", click, 1, 44100, shape = on(2))
            repeat(6) { render(96) }
            render(8820)
        }
        scenario("tone-compressor", outRate = 48000) {
            val loud = noise(2, 24000, 99)
            control(FxControl.FX_TYPE, FxControl.COMPRESSOR, 0f, 0f)
            control(FxControl.SEND, 0, 1f, 0f)
            control(FxControl.SEND, 3, 0.6f, 0f)
            start("loud", loud, 2, 48000, shape = on(0))
            start("quiet", steady(48000, 1500), 1, 48000, shape = on(3))
            render(64)
            render(96)
            // Through each speed, then the drive up.
            for (y in 0..8) {
                control(FxControl.FX_XY, 0, 0.5f, y / 8f)
                render(192)
            }
            for (x in 0..8) {
                control(FxControl.FX_XY, 0, x / 8f, 0.3f)
                render(96)
            }
            // The loud one lets go: the envelope with it, the quiet one below the threshold.
            release("loud")
            repeat(10) { render(96) }
            // Nothing sent: skipped once silent; then a peak again.
            cut("quiet")
            repeat(20) { render(96) }
            start("loud", loud, 2, 48000, shape = on(0))
            render(96)
            render(4800)
        }
        scenario("tone-master-compressor", outRate = 44100) {
            start("a", noise(2, 44100, 5), 2, 44100)
            start("b", steady(44100, 3000), 1, 44100, shape = on(1))
            render(64)
            control(FxControl.COMP, 1, 0.5f, 0.5f)
            render(64)
            render(96)
            for (i in 0..8) {
                control(FxControl.COMP, 1, i / 8f, 1f - i / 8f)
                render(96)
            }
            control(FxControl.COMP, 0, 0.5f, 0.5f)
            render(96)
            // On again: from silence.
            control(FxControl.COMP, 1, 1f, 0f)
            render(64)
            // With an effect in front of it, and SEND_FX held, then let go.
            control(FxControl.FX_TYPE, FxControl.DISTORTION, 0.8f, 0.2f)
            control(FxControl.PUNCH, FxControl.SEND_FX, 0.7f, 0f)
            repeat(5) { render(96) }
            control(FxControl.PUNCH, FxControl.SEND_FX, 0f, 0f)
            repeat(5) { render(96) }
            stopAll()
            repeat(4) { render(96) }
        }
        scenario("tone-switches", outRate = 48000) {
            val hiss = noise(2, 96000, 4242)
            control(FxControl.SEND, 0, 0.8f, 0f)
            start("a", hiss, 2, 48000, shape = on(0))
            // Each change crossfades over 20 ms (960 frames).
            for (type in listOf(FxControl.DISTORTION, FxControl.FILTER, FxControl.COMPRESSOR, FxControl.NONE, FxControl.FILTER, FxControl.DISTORTION)) {
                control(FxControl.FX_TYPE, type, 0.2f, 0.8f)
                render(96)
                render(96)
                render(960)
            }
            // Changes inside a fade, a block apart, then two in one render.
            control(FxControl.FX_TYPE, FxControl.FILTER, 0.9f, 0.6f)
            render(96)
            control(FxControl.FX_TYPE, FxControl.COMPRESSOR, 0.9f, 0.6f)
            render(96)
            control(FxControl.FX_TYPE, FxControl.DISTORTION, 0.9f, 0.6f)
            render(64)
            control(FxControl.FX_TYPE, FxControl.FILTER, 0.1f, 0.1f)
            control(FxControl.FX_TYPE, FxControl.COMPRESSOR, 0.1f, 0.1f)
            render(96)
            render(1200)
            cut("a")
            repeat(3) { render(96) }
            // A ringing tail fading out into no effect.
            control(FxControl.FX_TYPE, FxControl.FILTER, 0.2f, 1f)
            start("c", click, 1, 48000, shape = on(0))
            render(96)
            control(FxControl.FX_TYPE, FxControl.NONE, 0.5f, 0.5f)
            repeat(12) { render(96) }
        }
        scenario("tone-every-sample") {
            // At 1000 Hz, short renders: each effect's samples written out whole.
            var seed = 31L
            for (type in listOf(FxControl.DISTORTION, FxControl.FILTER, FxControl.COMPRESSOR)) {
                control(FxControl.FX_TYPE, type, 0.7f, 0.3f)
                control(FxControl.SEND, 0, 1f, 0f)
                start("a", noise(1, 200, seed++), 1, 1000, shape = on(0))
                start("b", click, 1, 1000, shape = on(0))
                render(40)
                render(40)
                control(FxControl.FX_XY, 0, 0.2f, 0.9f)
                render(40)
                control(FxControl.FX_XY, 0, 0.5f, 0.5f)
                render(40)
                stopAll()
                render(20)
            }
            control(FxControl.COMP, 1, 1f, 0f)
            start("a", noise(2, 200, seed), 2, 1000)
            render(40)
            control(FxControl.COMP, 1, 0f, 1f)
            render(40)
        }

        // Random knob moves, sends and type changes among these three, with the master compressor on and
        // off, voices on random buses, at real rates and block sizes.
        val types = intArrayOf(FxControl.NONE, FxControl.DISTORTION, FxControl.FILTER, FxControl.COMPRESSOR)
        val pool = listOf("seq:0:0", "seq:0:3", "seq:1:5", "seq:2:11", "live:0:3", "live:3:7")
        var n = 0
        for ((rate, block) in listOf(44100 to 96, 48000 to 192)) {
            val random = Random(13399 + n++)
            scenario("random-tone-$rate-$block", rate, VoiceMixer.MAX_VOICES) {
                val sounds = List(4) {
                    val channels = 1 + random.nextInt(2)
                    Pair(noise(channels, 200 + random.nextInt(if (it == 0) 30000 else 4000), random.nextLong(1, Long.MAX_VALUE)), channels)
                }
                repeat(200) {
                    when (random.nextInt(10)) {
                        0 -> control(FxControl.FX_TYPE, types[random.nextInt(types.size)], random.nextFloat(), random.nextFloat())
                        1, 2, 3 -> control(FxControl.FX_XY, 0, random.nextFloat(), random.nextFloat())
                        4 -> control(FxControl.SEND, random.nextInt(4), if (random.nextInt(4) == 0) 0f else random.nextFloat(), 0f)
                        5 -> control(FxControl.COMP, random.nextInt(2), random.nextFloat(), random.nextFloat())
                        6 -> control(FxControl.PUNCH, FxControl.SEND_FX, if (random.nextBoolean()) 0f else random.nextFloat(), 0f)
                        else -> {}
                    }
                    if (random.nextInt(3) == 0) {
                        val key = pool[random.nextInt(pool.size)]
                        when (random.nextInt(10)) {
                            in 0 until 6 -> {
                                val (pcm, channels) = sounds[random.nextInt(sounds.size)]
                                val shape = VoiceShape(
                                    gain = if (random.nextBoolean()) 1f else random.nextInt(0, 101) / 100f,
                                    pan = if (random.nextBoolean()) 0 else random.nextInt(-16, 17),
                                    bus = random.nextInt(-1, 4),
                                )
                                start(key, pcm, channels, rate, random.nextInt(-12, 13), random.nextLong(1, 1_000_000), shape)
                            }
                            in 6 until 9 -> release(key)
                            else -> cut(key)
                        }
                    }
                    render(block)
                }
                render(rate / 4)
            }
        }
    }

    private companion object {
        /** The scenarios written before the FX bus, and the FNV-1a of the file's text up to the end of the last of them. */
        const val LEGACY_SCENARIOS = 55
        const val LEGACY_FNV = 0x350777a57d7b0e0eL

        /** [text] up to the end of its first [LEGACY_SCENARIOS] scenarios. */
        fun legacy(text: String): String {
            var at = 0
            repeat(LEGACY_SCENARIOS) {
                val end = text.indexOf("\nend\n", at)
                if (end < 0) return text
                at = end + 4
            }
            return text.substring(0, at + 1)
        }

        /** FNV-1a over [text]'s characters (ASCII). */
        fun fnv(text: String): Long {
            var h = -0x340d631b7bdddcdbL // 0xcbf29ce484222325
            for (c in text) {
                h = h xor c.code.toLong()
                h *= 0x100000001b3L
            }
            return h
        }

        /** Full-scale noise: xorshift64, the top 16 bits of each step (the C++ side makes the same). */
        fun noiseOf(size: Int, seed: Long): ShortArray {
            var x = seed
            return ShortArray(size) {
                x = x xor (x shl 13)
                x = x xor (x ushr 7)
                x = x xor (x shl 17)
                (x ushr 48).toShort()
            }
        }

        /** FNV-1a over the samples as 16-bit words, as the C++ side hashes them. */
        fun fnv(pcm: ShortArray): Long {
            var h = -0x340d631b7bdddcdbL // 0xcbf29ce484222325
            for (v in pcm) {
                h = h xor (v.toLong() and 0xFFFF)
                h *= 0x100000001b3L
            }
            return h
        }
    }
}
