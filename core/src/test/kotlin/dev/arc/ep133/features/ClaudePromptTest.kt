package dev.arc.ep133.features

import dev.arc.ep133.text.ClaudeText
import dev.arc.ep133.text.PromptPiece
import dev.arc.ep133.text.PromptText
import java.io.File
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue

class ClaudePromptTest {
    private val references = File(System.getProperty("arc.beatCardSpec")!!).parentFile

    @Test
    fun `every genre is a recipe of the skill, with its BPM range and its card's tempo`() {
        val text = references.resolve("genres.md").readText()
        // "## Dub techno", its "- BPM: 118-126" line, and its card's "tempo 122".
        val recipes = Regex("^## ([^\\n]+)\\n- BPM: (\\d+)-(\\d+).*?^tempo (\\d+)$", setOf(RegexOption.MULTILINE, RegexOption.DOT_MATCHES_ALL))
            .findAll(text).associate { m -> m.groupValues[1].removeSuffix(" (EP-40)") to Triple(m.groupValues[2].toInt(), m.groupValues[3].toInt(), m.groupValues[4].toInt()) }
        for (g in Genres.ALL) {
            val (lo, hi, bpm) = recipes[g.name] ?: error("no recipe ${g.name}")
            assertEquals(lo..hi, g.tempo, g.name)
            assertEquals(bpm, g.bpm, g.name)
        }
        // Every recipe but the arrangement is offered, the EP-40's as the riddim family.
        assertEquals(recipes.keys - "Breakcore arrangement", Genres.ALL.map { it.name }.toSet())
        assertEquals(setOf("One drop", "Rockers", "Steppers", "Dub", "Digital riddim", "Dancehall", "UK dub"), Genres.ALL.filter { it.ep40 }.map { it.name }.toSet())
        assertTrue(Regex("^## (.+) \\(EP-40\\)$", RegexOption.MULTILINE).findAll(text).all { m -> Genres.ALL.first { it.name == m.groupValues[1] }.ep40 })
        assertEquals(Genres.ALL.size, Genres.ALL.map { it.id }.toSet().size)
        // Each family fits the answer keys: three rows of four at most.
        for (f in GenreFamily.entries) assertTrue(Genres.inFamily(f).size in 1..12, f.name)
    }

    @Test
    fun `the lessons are the skill's, in order`() {
        val titles = Regex("^## Lesson (\\d+): (.+)$", RegexOption.MULTILINE).findAll(references.resolve("lessons.md").readText()).map { it.groupValues[2] }.toList()
        assertEquals(titles, ClaudePrompt.LESSONS)
    }

    @Test
    fun `a prompt keeps through its text, its own words escaped`() {
        val p = ClaudePrompt(
            PromptTask.BEAT, bars = 8, genre = "dub-techno", tempo = 121, kit = FactoryKit.EP40, parts = setOf(PromptPart.FX, PromptPart.BASS),
            goal = PromptGoal.SWING, edits = 5, length = 64, fromPick = true, lesson = 7, text = "Line one; a\\b\nline=two",
        )
        assertEquals(p, ClaudePrompt.decode(p.encode()))
        assertEquals(ClaudePrompt(), ClaudePrompt.decode(ClaudePrompt().encode()))
        assertFalse(p.encode().contains("\n"))
        // Nothing, or what isn't one, is the default's.
        assertEquals(ClaudePrompt(), ClaudePrompt.decode(""))
        assertEquals(ClaudePrompt(), ClaudePrompt.decode("task=NOPE;bars=3;genre=polka;tempo=999;kit=ep9;goal=X;edits=2;length=12;pick=maybe;lesson=13;text="))
        assertEquals(emptySet<PromptPart>(), ClaudePrompt.decode("parts=").parts)
    }

    @Test
    fun `saved prompts keep their names and prompts, one a line`() {
        val list = listOf(SavedPrompt("Dub; \\ techno", ClaudePrompt(PromptTask.BEAT, genre = "dub-techno", tempo = 122)), SavedPrompt("Mine ✎", ClaudePrompt(text = "a\nb")))
        assertEquals(list, SavedPrompt.decodeAll(SavedPrompt.encodeAll(list)))
        assertEquals(2, SavedPrompt.encodeAll(list).lines().size)
        assertEquals(emptyList<SavedPrompt>(), SavedPrompt.decodeAll(""))
        assertEquals(emptyList<SavedPrompt>(), SavedPrompt.decodeAll("garbage\nname=;task=BEAT"))
    }

    @Test
    fun `a genre brings its tempo, another task drops the hand-edited words`() {
        val p = ClaudePrompt(PromptTask.BEAT, tempo = 90).withGenre(Genres.of("steppers"))
        assertEquals("steppers", p.genre)
        assertEquals(78, p.tempo)
        assertEquals(78, p.withGenre(null).tempo)
        assertNull(p.withGenre(null).genre)
        val edited = p.copy(text = "mine")
        assertEquals(edited, edited.withTask(PromptTask.BEAT))
        assertNull(edited.withTask(PromptTask.TRACK).text)
        assertTrue(ClaudePrompt(PromptTask.IMPROVE).withCard)
        assertFalse(ClaudePrompt(PromptTask.TRACK).withCard)
        assertTrue(ClaudePrompt(PromptTask.TRACK, fromPick = true).withCard)
        assertFalse(ClaudePrompt(PromptTask.BEAT, fromPick = true).withCard)
    }

    @Test
    fun `an improve as it starts asks what the plain share does`() {
        assertEquals(ClaudeText.SHARE_PROMPT, PromptText.prompt(ClaudePrompt(), SharePick.SCENE, sounds = true))
        assertEquals(ClaudeText.SHARE_PROMPT, PromptText.prompt(ClaudePrompt(), SharePick.PATTERN, sounds = false))
        assertEquals(ClaudeText.SHARE_CHAIN_PROMPT, PromptText.prompt(ClaudePrompt(), SharePick.CHAIN, sounds = true))
        assertEquals(
            "Analyse this EP-133 beat from Arc with the arc-beats skill, then make it busier and take it toward dub techno: suggest one edit as a new card. " +
                "Keep its sound, FX and pad lines, or choose sounds from my sound list if one follows the card:",
            PromptText.prompt(ClaudePrompt(goal = PromptGoal.BUSIER, genre = "dub-techno", edits = 1), SharePick.SCENE, true),
        )
        assertTrue(PromptText.prompt(ClaudePrompt(goal = PromptGoal.FILL), SharePick.CHAIN, true).contains("then add a fill: suggest 2-3 edits as a new card of scenes with a chain line."))
    }

    @Test
    fun `a new beat, a track and a lesson say what was picked`() {
        val beat = ClaudePrompt(PromptTask.BEAT, genre = "dub-techno", tempo = 122, parts = setOf(PromptPart.FX, PromptPart.BASS, PromptPart.CHORDS))
        assertEquals(
            "Use the arc-beats skill. Write a new 4-bar dub techno beat at 122 BPM for my EP-133, with a bassline, chords and FX that suit it. Choose the sounds from my sound list:",
            PromptText.prompt(beat, SharePick.SCENE, sounds = true),
        )
        assertEquals(
            "Use the arc-beats skill. Write a new 1-bar beat in any style you like for my EP-133, drums only.",
            PromptText.prompt(ClaudePrompt(PromptTask.BEAT, bars = 1, parts = emptySet()), SharePick.SCENE, sounds = false),
        )
        assertEquals(
            "Use the arc-beats skill. Write a track idea as a card of scenes with a chain line: about 32 bars of steppers at 78 BPM for my EP-133, " +
                "with an intro, a drop, a breakdown and a second drop.",
            PromptText.prompt(ClaudePrompt(PromptTask.TRACK).withGenre(Genres.of("steppers")), SharePick.SCENE, sounds = false),
        )
        assertEquals(
            "Use the arc-beats skill. Continue this EP-133 arrangement from Arc into a track idea: a card of scenes with a chain line, about 64 bars in any style you like, " +
                "with this arrangement as its first scenes. Keep its sound, FX and pad lines, or choose sounds from my sound list if one follows the card:",
            PromptText.prompt(ClaudePrompt(PromptTask.TRACK, length = 64, fromPick = true), SharePick.CHAIN, sounds = true),
        )
        assertEquals(ClaudeText.LEARN_PROMPT, PromptText.prompt(ClaudePrompt(PromptTask.LEARN), SharePick.SCENE, true))
        assertEquals(
            "Use the arc-beats skill. Teach me lesson 5 of the EP-133 K.O. II, Swing and timing, one step at a time. I use the Arc app on Android.",
            PromptText.prompt(ClaudePrompt(PromptTask.LEARN, lesson = 5), SharePick.SCENE, true),
        )
        // Words of one's own go as they are.
        assertEquals("Just vibes", PromptText.prompt(beat.copy(text = "Just vibes"), SharePick.CHAIN, true))
    }

    @Test
    fun `the glass's sentence has a slot for each choice`() {
        val p = ClaudePrompt(PromptTask.BEAT, genre = "uk-garage", tempo = 132, parts = setOf(PromptPart.LEAD, PromptPart.BASS))
        val s = PromptText.sentence(p, FactoryKit.EP40)
        assertEquals("Write a 4-bar beat in UK garage at 132 BPM for the EP-40 kit with bass · lead", s.joinToString(" ") { it.text })
        for (t in PromptTask.entries) {
            val q = p.copy(task = t)
            assertEquals(q.slots, PromptText.sentence(q, FactoryKit.EP133).mapNotNull(PromptPiece::slot))
        }
        assertEquals("Improve it: make it better in its own style in 2-3 edits on the EP-133 kit", PromptText.sentence(ClaudePrompt(), FactoryKit.EP133).joinToString(" ") { it.text })
        assertEquals("toward one drop", PromptText.value(ClaudePrompt(genre = "one-drop"), PromptSlot.GENRE, FactoryKit.EP40))
        assertEquals("any tempo", PromptText.value(ClaudePrompt(PromptTask.TRACK), PromptSlot.TEMPO, FactoryKit.EP40))
        assertEquals("lesson 9: bass and melody in keys", PromptText.value(ClaudePrompt(lesson = 9), PromptSlot.LESSON, FactoryKit.EP40))
    }

    @Test
    fun `saving names a prompt once and keeps at most twelve`() {
        val a = ClaudePrompt(PromptTask.BEAT, genre = "dub-techno", tempo = 122)
        assertEquals("Dub techno 122", PromptText.name(a))
        assertEquals("New beat", PromptText.name(ClaudePrompt(PromptTask.BEAT)))
        assertEquals("Improve · Busier", PromptText.name(ClaudePrompt(goal = PromptGoal.BUSIER)))
        assertEquals("Track · 32 bars", PromptText.name(ClaudePrompt(PromptTask.TRACK)))
        assertEquals("Lesson 3 ✎", PromptText.name(ClaudePrompt(PromptTask.LEARN, lesson = 3, text = "x")))
        var list = PromptText.withSaved(emptyList(), a)
        assertEquals(list, PromptText.withSaved(list, a))
        list = PromptText.withSaved(list, a.copy(bars = 8))
        assertEquals(listOf("Dub techno 122", "Dub techno 122 2"), list.map { it.name })
        repeat(20) { i -> list = PromptText.withSaved(list, a.copy(tempo = 60 + i)) }
        assertEquals(SavedPrompt.MAX, list.size)
    }
}
