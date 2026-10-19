package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * The skill's synth recipes (skill/arc-beats/references/synth-sounds.md): every card there reads with no problems and
 * writes back as itself, and its synth lines are the recipes the golden file pins.
 */
class SynthRecipesTest {
    private val recipes: String by lazy { File(System.getProperty("arc.synthRecipes") ?: error("arc.synthRecipes not set")).readText() }

    /** The fenced ARC BEAT cards of the page, in order. */
    private val cards: List<String> by lazy {
        Regex("```\\n(ARC BEAT 1\\n.*?)\\n```", RegexOption.DOT_MATCHES_ALL).findAll(recipes).map { it.groupValues[1] }.toList()
    }

    /** The golden file's cases as body to device name, in its order: 17 types, then the 23 recipes, then the extremes. */
    private val golden: List<Pair<String, String>> by lazy {
        File(System.getProperty("arc.synthGolden") ?: error("arc.synthGolden not set")).readLines()
            .filter { it.isNotBlank() && !it.startsWith("#") }
            .map { line -> line.split(" | ").let { it[0] to it[3] } }
    }

    private fun problems(r: CardRead) = r.problems.map { "${it.line} ${if (it.error) "error" else "warning"} ${it.message}" }

    @Test
    fun `every recipe card reads with no problems and writes back as itself`() {
        assertEquals(4, cards.size)
        for (text in cards) {
            val r = BeatCards.read(text)
            assertEquals(emptyList<String>(), problems(r), text.lines()[1])
            val card = r.card!!
            assertTrue(card.name != null && card.tempo != null, text.lines()[1])
            assertTrue(card.allSections.all { it.synths.isNotEmpty() }, text.lines()[1])
            assertEquals(card, BeatCards.read(BeatCards.write(card)).card, text.lines()[1])
        }
        // One card a part: drums, bass, keys, then a lead with FX.
        assertEquals(listOf(0, 1, 2, 3), cards.map { BeatCards.read(it).card!!.sections.single().group })
    }

    @Test
    fun `the synth lines are the recipes, each once, as Arc writes them`() {
        val lines = cards.flatMap { text -> text.lines().filter { it.startsWith("synth ") } }
        // The body is the line without "synth <pad> ".
        val bodies = lines.map { it.split(' ', limit = 3)[2] }
        val recipeBodies = golden.subList(SynthType.entries.size, SynthType.entries.size + 23).map { it.first }
        assertEquals(recipeBodies.sorted(), bodies.sorted())
        // Each line is in writer form, so a card's text holds it as Arc would write it.
        for (text in cards) {
            val card = BeatCards.read(text).card!!
            for (s in card.allSections) {
                for ((offset, synth) in s.synths) assertTrue(BeatCards.synthText(s.group, offset, synth) in text.lines(), "$offset $synth")
            }
        }
    }

    @Test
    fun `each recipe makes the device name the golden file has, and melodic ones play in KEYS`() {
        val names = golden.toMap()
        val melodic = setOf(SynthType.SUB, SynthType.BASS, SynthType.PLUCK, SynthType.STAB, SynthType.BELL, SynthType.LEAD, SynthType.PAD)
        for (text in cards) {
            val card = BeatCards.read(text).card!!
            for (line in text.lines().filter { it.startsWith("synth ") }) {
                val body = line.split(' ', limit = 3)[2]
                val synth = BeatCards.read("ARC BEAT 1\n[A]\nsynth A1 $body\n").card!!.sections[0].synths.getValue(3)
                assertEquals(names[body], SynthVoice.deviceName(synth), body)
            }
            for (s in card.allSections) {
                for ((offset, synth) in s.synths) {
                    if (synth.type in melodic) assertEquals(PlayMode.KEY, s.pads[offset]?.mode, "${s.group} $offset ${synth.type}")
                }
            }
        }
    }
}
