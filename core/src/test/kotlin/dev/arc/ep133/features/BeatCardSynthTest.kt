package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/** Synth lines: read as the shared cases (skill/arc-beats/scripts/test_synth_cases.txt) have them, and written back the same. */
class BeatCardSynthTest {
    /** A case of the shared file: its card's text and the problems expected, as "line level message". */
    private class Case(val name: String, val text: String, val expect: List<String>)

    private val cases: List<Case> by lazy {
        val lines = File(System.getProperty("arc.synthCases") ?: error("arc.synthCases not set")).readLines()
        val out = ArrayList<Case>()
        var i = lines.indexOfFirst { it.startsWith("=== ") }
        while (i in lines.indices) {
            val name = lines[i].removePrefix("=== ")
            val card = ArrayList<String>()
            i++
            while (lines[i] != "--- expect") card += lines[i++]
            i++
            val expect = ArrayList<String>()
            while (lines[i] != "--- python") expect += lines[i++]
            // The python block runs to the next case.
            while (i < lines.size && !lines[i].startsWith("=== ")) i++
            out += Case(name, card.joinToString("\n", postfix = "\n"), expect)
        }
        out
    }

    private fun case(name: String): Case = cases.first { it.name == name }

    private fun read(name: String): CardRead = BeatCards.read(case(name).text)

    private fun card(name: String): BeatCard = read(name).card ?: error("$name: ${read(name).problems}")

    private fun synths(name: String): Map<Int, CardSynth> = card(name).sections[0].synths

    private fun problems(r: CardRead) = r.problems.map { "${it.line} ${if (it.error) "error" else "warning"} ${it.message}" }

    @Test
    fun `every shared case gives exactly its problems, and a card exactly when none is an error`() {
        assertEquals(27, cases.size)
        for (c in cases) {
            val r = BeatCards.read(c.text)
            assertEquals(c.expect, problems(r), c.name)
            assertEquals(c.expect.none { it.split(' ')[1] == "error" }, r.card != null, c.name)
        }
    }

    @Test
    fun `a line keeps only what it gives`() {
        assertEquals(mapOf(9 to CardSynth(SynthType.KICK)), synths("minimal"))
        assertEquals(
            CardSynth(
                SynthType.BASS, note = 36, wave = SynthWave.SQUARE, chord = SynthChord.OCT, attack = 3, decay = 25, length = 125, tone = 30, reso = 75,
                sweep = 70, bend = 5, click = 10, noise = 5, snap = 20, drive = 40, detune = 10, level = 90, seed = 7, name = "acid_bass",
            ),
            synths("every-key")[9],
        )
        val line = "synth B7 bass note C2 wave square chord oct attack 3 decay 25 length 1.25 tone 30 reso 75 sweep 70 bend 5 click 10 noise 5 snap 20 drive 40 detune 10 level 90 seed 7 name acid_bass"
        assertEquals(listOf(line), BeatCards.write(card("every-key")).lines().filter { it.startsWith("synth ") })
    }

    @Test
    fun `words are read in any case, a later key wins and the name keeps its case`() {
        assertEquals(CardSynth(SynthType.KICK, wave = SynthWave.SAW, decay = 20, name = "Decay"), synths("any-case")[9])
        assertTrue(BeatCards.write(card("any-case")).contains("\nsynth A7 kick wave saw decay 20 name Decay\n"))
    }

    @Test
    fun `lines with warnings are still read`() {
        // After notes: read, with a warning.
        assertEquals(CardSynth(SynthType.SUB, note = 36), synths("after-notes")[3])
        // An unknown type leaves the line out; a known one in any case is read.
        assertEquals(setOf(10), synths("unknown-type").keys)
        // Unknown settings are skipped with their value when it isn't a key.
        val unknown = synths("unknown-setting")
        assertEquals(listOf(9, 10, 11, 6), unknown.keys.toList())
        assertTrue(unknown.values.all { it.tone == 40 })
        assertEquals(CardSynth(SynthType.STAB, tone = 50), synths("unknown-words")[9])
    }

    @Test
    fun `values at their edges`() {
        assertEquals(CardSynth(SynthType.KICK, attack = 0, decay = 100, level = 1, seed = 999), synths("knobs-edges")[9])
        assertEquals(CardSynth(SynthType.KICK, tone = 0, drive = 7), synths("knobs-edges")[10])
        assertEquals(listOf(12, 96, 30), listOf(7, 8, 9).map { synths("notes-edges").getValue(it).note })
        val lengths = synths("lengths-ok")
        assertEquals(listOf(400, 50, 5, 250), listOf(7, 8, 9, 10).map { lengths.getValue(it).length })
        val written = BeatCards.write(card("lengths-ok")).lines().filter { it.startsWith("synth ") }
        // In keypad order: 7 8 before 4 5 6.
        assertEquals(listOf("synth D7 riser length 0.05", "synth D8 riser length 2.5", "synth D5 riser length 4", "synth D6 riser length 0.5"), written)
    }

    @Test
    fun `a length with a line separator after it is refused, as the web and the script refuse it`() {
        // lines() splits only on \r and \n, so these stay at the end of the value.
        for (end in listOf("\u0085", " ", " ")) {
            for (v in listOf("1", "2.5")) {
                val r = BeatCards.read("ARC BEAT 1\n[A] bars 1 step 1/16\nsynth A7 kick length $v$end\n")
                assertNull(r.card, "$v + ${end[0].code}")
                assertEquals(listOf("3 error A7 synth: length must be 0.05 to 4 seconds, with up to two decimals."), problems(r))
            }
        }
    }

    @Test
    fun `names are one word, cut to 13 characters, and a later line for a pad wins`() {
        val names = synths("names")
        assertEquals(listOf("808_kick", "a_very_long_k", "808"), listOf(3, 6, 7).map { names.getValue(it).name })
        assertEquals(60, synths("duplicate").getValue(9).decay)
        // A line with an error leaves the earlier one.
        assertNull(read("duplicate-with-error").card)
        val both = card("sound-and-synth").sections[0]
        assertTrue(9 in both.sounds && 9 in both.synths)
    }

    @Test
    fun `every card without an error reads back the same from what it writes`() {
        for (c in cases) {
            val card = BeatCards.read(c.text).card ?: continue
            val text = BeatCards.write(card)
            assertEquals(card, BeatCards.read(text).card, "${c.name}\n$text")
        }
    }

    @Test
    fun `a section writes its sound lines, then its synth lines, then its pad lines, each in keypad order`() {
        val text = """
            ARC BEAT 1
            [A] bars 1 step 1/16
            pad A1 level 80
            synth A1 sub
            sound A4 5 hat
            synth A7 kick decay 50
            pad A7 pitch 2
            sound A7 1 kick
            A7 kick | X... .... X... .... |
        """.trimIndent()
        val written = BeatCards.write(BeatCards.read(text).card!!).lines()
        assertEquals(
            listOf("sound A7 1 kick", "sound A4 5 hat", "synth A7 kick decay 50", "synth A1 sub", "pad A7 pitch 2", "pad A1 level 80"),
            written.filter { it.startsWith("sound ") || it.startsWith("synth ") || it.startsWith("pad ") },
        )
        // And before the rows.
        assertTrue(written.indexOf("pad A1 level 80") < written.indexOfFirst { it.startsWith("A7 ") })
    }

    @Test
    fun `scenes keep each scene's synth line, and a pad takes the last`() {
        val card = card("scenes")
        assertEquals(mapOf(PhysicalPad(0, 9) to CardSynth(SynthType.KICK, decay = 60)), BeatCards.synthsByPad(card))
        val text = BeatCards.write(card)
        assertTrue(text.contains("\nsynth A7 kick decay 40\n"), text)
        assertTrue(text.contains("\nsynth A7 kick decay 60\n"), text)
    }

    @Test
    fun `a pad with a synth line is not silent`() {
        assertEquals(listOf(PhysicalPad(0, 10)), BeatCards.silentPads(card("silent-pads"), { null }, true))
    }

    @Test
    fun `a sound is found on the device by its name`() {
        val names = mapOf(5 to "808 kick 29f789", 40 to "808 KICK 29F789.wav", 7 to "kick")
        assertEquals(5, BeatCards.slotNamed(names, "808 kick 29f789", null))
        assertEquals(40, BeatCards.slotNamed(names, "808 kick 29f789", 40))
        assertNull(BeatCards.slotNamed(names, "808 kick 000000", 5))
    }

    @Test
    fun `a sound pick carries no synth unless it is one`() {
        val r = BeatCards.read(case("sound-and-synth").text)
        val pick = BeatCards.resolveSounds(r.card!!, mapOf(1 to "MICRO KICK"), current = { null }).single()
        assertNull(pick.synth)
        assertNotNull(r.card!!.sections[0].synths[9])
        assertFalse(pick.status == SoundStatus.MISSING)
    }
}
