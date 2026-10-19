package dev.arc.ep133.features

import dev.arc.ep133.formats.Crc32
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.protocol.Device
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor

/**
 * The synth renderer: the same line always makes the same bytes, as the golden file
 * (skill/arc-beats/scripts/test_synth_golden.txt) pins them for the skill's script too.
 * Run with -Parc.updateGolden=true to write that file afresh.
 */
class SynthVoiceTest {
    /** The golden cases, in the file's order: the types alone, the skill's recipes, then the extremes. */
    private val bodies: List<String> = SynthType.entries.map { it.id } + listOf(
        "kick note F1 decay 70 bend 40 click 10 drive 20 name 808_kick",
        "kick note A1 decay 25 bend 60 click 50 drive 30 name punch_kick",
        "kick note G1 decay 45 tone 25 bend 45 click 25 name house_kick",
        "snare note G3 decay 30 tone 70 click 20 noise 70 name snare",
        "snare note A3 decay 20 tone 85 bend 30 noise 85 snap 30 name trap_snare",
        "clap decay 35 tone 55 reso 20 name clap",
        "hat decay 10 tone 75 name closed_hat",
        "openhat decay 45 tone 70 name open_hat",
        "hat wave none decay 12 tone 60 noise 100 name shaker",
        "rim name rim",
        "tom note D2 decay 45 bend 35 name low_tom",
        "cowbell name cowbell",
        "sub note C2 decay 35 drive 25 name sub",
        "bass note C2 decay 90 length 2 tone 30 detune 55 name reese",
        "bass note C2 wave square decay 25 tone 25 reso 75 sweep 70 drive 40 name acid",
        "pluck note C4 decay 30 tone 40 sweep 60 name pluck",
        "stab note C4 chord min7 decay 20 tone 50 sweep 50 name house_stab",
        "stab note C4 chord min decay 35 tone 35 detune 30 name dub_chord",
        "pad note C3 chord min7 attack 60 decay 60 length 3 tone 40 name dark_pad",
        "lead note C4 tone 70 detune 20 name lead",
        "bell note C5 decay 30 tone 40 name bell",
        "zap note C3 decay 25 bend 100 name dub_zap",
        "riser length 2 tone 80 reso 40 name riser",
    ) + listOf(
        "pad note C7 chord maj7 bend 100 detune 100 length 4",
        "hat chord min7 detune 100 length 4",
        "bell note C0 wave saw tone 100",
        "kick seed 1",
        "clap snap 50",
        "lead wave none",
        "snare attack 100 decay 100 snap 100",
        "zap note C7 tone 100 reso 100 sweep 100 bend 100 drive 100",
    )

    /** A body read as the golden file says: on A1 of a card that must read clean. */
    private fun synth(body: String): CardSynth {
        val r = BeatCards.read("ARC BEAT 1\n[A]\nsynth A1 $body\n")
        assertEquals(emptyList<CardProblem>(), r.problems, body)
        return r.card!!.sections[0].synths.getValue(3)
    }

    private val renders: Map<String, ShortArray> by lazy { bodies.associateWith { SynthVoice.render(synth(it)) } }

    private fun crcOf(pcm: ShortArray): String = "%08x".format(Locale.ROOT, Crc32.of(SynthVoice.pcmBytes(pcm)))

    @Test
    fun `notes are in tune from the semitone table`() {
        assertEquals(440.0, SynthVoice.noteHz(69))
        assertEquals(261.6255653005986, SynthVoice.noteHz(60))
        val semi = listOf(
            1.0, 1.0594630943592953, 1.122462048309373, 1.189207115002721, 1.2599210498948732, 1.3348398541700344,
            1.4142135623730951, 1.4983070768766815, 1.5874010519681994, 1.681792830507429, 1.7817974362806785, 1.8877486253633868,
        )
        assertEquals(semi.map { 440.0 * it }, (69..80).map { SynthVoice.noteHz(it) })
        assertEquals(semi.map { 440.0 * it * 0.5 }, (57..68).map { SynthVoice.noteHz(it) })
    }

    @Test
    fun `the same line makes the same sound, another seed another`() {
        val kick = synth("kick")
        assertArrayEquals(SynthVoice.render(kick), SynthVoice.render(kick))
        assertFalse(SynthVoice.render(kick).contentEquals(SynthVoice.render(synth("kick seed 1"))))
    }

    @Test
    fun `frames follow the decay within 0_05 to 4 s, or the length given`() {
        for (body in listOf("kick", "rim decay 0", "bass attack 100 decay 100", "riser length 0.05")) {
            assertEquals(SynthVoice.render(synth(body)).size, SynthVoice.frames(synth(body)), body)
        }
        assertEquals(SynthVoice.MIN_AUTO_FRAMES, SynthVoice.frames(synth("rim decay 0")))
        assertEquals(SynthVoice.MAX_FRAMES, SynthVoice.frames(synth("bass attack 100 decay 100")))
        assertEquals(2343, SynthVoice.frames(synth("kick length 0.05")))
        assertEquals(187_500, SynthVoice.frames(synth("kick length 4")))
    }

    @Test
    fun `every golden case starts and ends at 0 and peaks at -1 dBFS times its level`() {
        for ((body, pcm) in renders) {
            val s = synth(body)
            assertEquals(0, pcm.first().toInt(), body)
            assertEquals(0, pcm.last().toInt(), body)
            val peak = pcm.maxOf { abs(it.toInt()) }
            if (SynthVoice.silent(s)) {
                assertEquals(0, peak, body)
                continue
            }
            val level = SynthVoice.resolve(s).level
            assertEquals(floor(0.8912509381337456 * (level / 100.0) * 32767.0 + 0.5).toInt(), peak, body)
            if (level == 100) assertEquals(29204, peak, body)
        }
        assertEquals(17522, renders.getValue("hat").maxOf { abs(it.toInt()) })
        assertEquals(23363, renders.getValue("clap").maxOf { abs(it.toInt()) })
        assertTrue(SynthVoice.silent(synth("lead wave none")))
    }

    @Test
    fun `the canonical text holds every setting but the name`() {
        assertEquals(
            "arc synth 1 kick note 31 wave sine chord one attack 0 decay 40 length auto tone 30 reso 0 sweep 0 bend 50 click 30 noise 0 snap off drive 10 detune 0 level 100 seed 0",
            SynthVoice.canonical(synth("kick")),
        )
        assertEquals(
            "arc synth 1 snare note 54 wave sine chord one attack 0 decay 30 length auto tone 70 reso 0 sweep 0 bend 20 click 20 noise 70 snap 40 drive 0 detune 0 level 100 seed 0",
            SynthVoice.canonical(synth("snare")),
        )
        assertTrue(SynthVoice.canonical(synth("pad")).contains(" length 300 "))
        assertEquals(SynthVoice.tag(synth("kick")), SynthVoice.tag(synth("kick decay 40")))
        assertNotEquals(SynthVoice.tag(synth("kick")), SynthVoice.tag(synth("kick decay 41")))
        val named = synth("kick name big_kick")
        assertEquals(SynthVoice.tag(synth("kick")), SynthVoice.tag(named))
        assertEquals("kick 08bcfa", SynthVoice.deviceName(synth("kick")))
        assertEquals("big kick 08bcfa", SynthVoice.deviceName(named))
        assertEquals("808 kick 29f789", SynthVoice.deviceName(synth("kick note F1 decay 70 bend 40 click 10 drive 20 name 808_kick")))
    }

    @Test
    fun `device names fit the EP-133 as they are`() {
        for (body in bodies + "kick name abcdefghijklm") {
            val name = SynthVoice.deviceName(synth(body))
            assertTrue(name.length <= Device.MAX_SOUND_NAME, name)
            assertEquals(name, Device.cleanSoundName(name), body)
        }
    }

    @Test
    fun `the offline file is named by the sound and the pad`() {
        val kick = synth("kick")
        val name = SynthVoice.fileName(kick, 3, 0, 9)
        assertEquals("syn-%08x-3-0-9.wav".format(Locale.ROOT, SynthVoice.crc(kick)), name)
        assertTrue(Regex("^syn-[0-9a-f]{8}-3-0-9\\.wav$").matches(name), name)
        assertTrue(name.startsWith("syn-08bcfa"), name)
    }

    @Test
    fun `the wav decodes to the same samples at 46875 Hz, mono`() {
        val s = synth("hat")
        val wav = SynthVoice.wav(s)
        val pcm = SynthVoice.render(s)
        assertEquals(44 + 2 * pcm.size, wav.size)
        val d = Wav.decode(wav)
        assertEquals(46875L, d.sampleRate)
        assertEquals(1, d.channels)
        assertArrayEquals(SynthVoice.pcmBytes(pcm), d.pcm)
    }

    @Test
    fun `the golden file pins every case's frames, samples and device name`() {
        val lines = bodies.map { body ->
            val pcm = renders.getValue(body)
            "$body | ${pcm.size} | ${crcOf(pcm)} | ${SynthVoice.deviceName(synth(body))}"
        }
        val file = File(System.getProperty("arc.synthGolden") ?: error("arc.synthGolden not set"))
        if (System.getProperty("arc.updateGolden") == "true") {
            file.writeText(
                listOf(
                    "# Synth renders: what each synth line makes, written by Arc (SynthVoiceTest, ./gradlew :core:test -Parc.updateGolden=true).",
                    "# scripts/test_beatcard.py renders every case and checks it against this file.",
                    "# One case a line: body, frames, PCM CRC-32 and device name. The card read is ARC BEAT 1, [A], then synth A1 and the body.",
                ).plus(lines).joinToString("\n", postfix = "\n"),
            )
            return
        }
        assertEquals(lines, file.readLines().filter { it.isNotBlank() && !it.startsWith("#") })
    }
}
