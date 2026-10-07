package dev.arc.ep133.audio

import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.VoiceMode
import dev.arc.ep133.formats.VoiceShape
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
 * shapes), written out with every
 * command and what each render gave (its samples, or a hash of them for long
 * renders, the voices started and the keys). The host test
 * (src/test/cpp/VoiceMixerParityTest.cpp, run by `./gradlew test` through
 * :app:hostMixerTest) replays them through the C++ port and wants the same,
 * sample for sample.
 *
 * This test fails when the Kotlin mixer no longer writes the committed file
 * (src/test/cpp/voice-mixer.golden): after a deliberate change to it, write the
 * file again with `./gradlew :app:testDebugUnitTest -Parc.updateGolden=true`,
 * and change the C++ port until the host test passes.
 */
class VoiceMixerGoldenTest {
    @Test
    fun `the Kotlin mixer still writes the committed vectors`() {
        val golden = File(System.getProperty("arc.mixerGolden") ?: fail("arc.mixerGolden not set"))
        val text = vectors()
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
         * mode's ordinal and the mute group.
         */
        fun start(key: String, pcm: ShortArray, channels: Int, rate: Int, semitones: Int = 0, tag: Long = 0, shape: VoiceShape = VoiceShape.DEFAULT) {
            val id = sample(pcm, channels)
            mixer.start(key, pcm, channels, rate, semitones, tag, shape)
            val pitch = java.lang.Long.toHexString(VoiceMixer.pitchRatio(semitones + shape.semitones).toRawBits())
            out.append("start ${keys.id(key)} $id $rate $pitch $tag")
            if (shape.copy(semitones = 0.0) != VoiceShape.DEFAULT) {
                out.append(' ').append(Integer.toHexString(shape.gain.toRawBits())).append(' ').append(shape.pan)
                    .append(' ').append(shape.start).append(' ').append(shape.end).append(' ').append(shape.attackMs)
                    .append(' ').append(shape.releaseMs).append(' ').append(shape.mode.ordinal).append(' ').append(shape.muteGroup)
            }
            out.append('\n')
        }

        fun release(key: String) {
            mixer.release(key)
            out.append("release ${keys.id(key)}\n")
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

    private companion object {
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
