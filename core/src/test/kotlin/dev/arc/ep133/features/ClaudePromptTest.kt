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
        // Every family has its genres; each fits the answer keys, three rows of four at most.
        assertEquals(GenreFamily.entries.toSet(), Genres.ALL.map { it.family }.toSet())
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
            goal = PromptGoal.SWING, edits = 5, length = 64, fromPick = true, lesson = 7, way = PlayWay.PERFORM, level = PlayLevel.SURE, speed = 75,
            text = "Line one; a\\b\nline=two",
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
            "Use the arc-beats skill to improve this EP-133 beat from Arc. I'll paste your new card back into Arc next to mine, so give it a short new name.\n" +
                "- First: analyse it, its groove, its energy and what makes it work\n" +
                "- Ask: make it busier\n" +
                "- Direction: toward dub techno\n" +
                "- Edits: one, as one new card\n" +
                "Keep its sound, FX and pad lines unless an edit needs to change them, or choose sounds from my sound list if one follows the card. The card:",
            PromptText.prompt(ClaudePrompt(goal = PromptGoal.BUSIER, genre = "dub-techno", edits = 1), SharePick.SCENE, true),
        )
        assertTrue(PromptText.prompt(ClaudePrompt(goal = PromptGoal.FILL, edits = 5), SharePick.CHAIN, true).contains("\n- Ask: add a fill\n- Edits: 4-5, as one new card of scenes with a chain line\n"))
    }

    @Test
    fun `a new beat, a track and a lesson say what was picked, as a list`() {
        val beat = ClaudePrompt(PromptTask.BEAT, genre = "dub-techno", tempo = 122, parts = setOf(PromptPart.FX, PromptPart.BASS, PromptPart.CHORDS))
        assertEquals(
            "Use the arc-beats skill to write a new beat for my EP-133. I'll paste your card into the Arc app and play it, so give one complete ARC BEAT card that passes the skill's check.\n" +
                "- Style: dub techno (start from the skill's recipe)\n" +
                "- Tempo: 122 BPM\n" +
                "- Length: 4 bars\n" +
                "- Parts: drums, a bassline, chords and FX that suit it\n" +
                "Reply with the card in one code block, then 2-4 lines on the feel and one thing to try changing.\n" +
                "Choose the sounds from my sound list, which follows:",
            PromptText.prompt(beat, SharePick.SCENE, sounds = true),
        )
        val plain = PromptText.prompt(ClaudePrompt(PromptTask.BEAT, bars = 1, parts = emptySet()), SharePick.SCENE, sounds = false)
        assertTrue(plain.contains("\n- Style: any style you like\n- Length: 1 bar\n- Parts: drums only\n"))
        assertFalse(plain.contains("Tempo") || plain.contains("sound list"))
        val track = PromptText.prompt(ClaudePrompt(PromptTask.TRACK).withGenre(Genres.of("steppers")), SharePick.SCENE, sounds = false)
        assertTrue(track.startsWith("Use the arc-beats skill to write a track idea for my EP-133: a card of scenes with a chain line"))
        assertTrue(track.contains("\n- Style: steppers (start from the skill's recipe)\n- Tempo: 78 BPM\n- Length: about 32 bars\n- Shape: an intro, a drop"))
        assertTrue(track.endsWith("then a line for each scene saying what changes."))
        val more = PromptText.prompt(ClaudePrompt(PromptTask.TRACK, length = 64, fromPick = true), SharePick.CHAIN, sounds = true)
        assertTrue(more.startsWith("Use the arc-beats skill to continue this EP-133 arrangement from Arc into a track idea"))
        assertTrue(more.contains("\n- Start: this arrangement as its first scenes, ") && more.endsWith("The card:"))
        assertEquals(ClaudeText.LEARN_PROMPT, PromptText.prompt(ClaudePrompt(PromptTask.LEARN), SharePick.SCENE, true))
        assertEquals(
            "Use the arc-beats skill to teach me the EP-133 K.O. II, starting at lesson 5 (Swing and timing). I use the Arc app on Android. " +
                "Go one step at a time: explain the step, give me something to try on the device, and wait for me before the next one.",
            PromptText.prompt(ClaudePrompt(PromptTask.LEARN, lesson = 5), SharePick.SCENE, true),
        )
        // Words of one's own go as they are.
        assertEquals("Just vibes", PromptText.prompt(beat.copy(text = "Just vibes"), SharePick.CHAIN, true))
    }

    @Test
    fun `up to two feel words go before the genre, the first leading, and into the prompt as a list`() {
        var p = ClaudePrompt(PromptTask.BEAT).withGenre(Genres.of("lo-fi"))
        p = p.withFeel(Feel.DREAMY)
        assertEquals("Write a 4-bar beat in dreamy lo-fi at 76 BPM for the EP-133 kit with bass", PromptText.sentence(p, FactoryKit.EP133).joinToString(" ") { it.text })
        p = p.withFeel(Feel.DARK).withFeel(Feel.HYPNOTIC)
        assertEquals(listOf(Feel.DARK, Feel.HYPNOTIC), p.feels)
        assertEquals(p, ClaudePrompt.decode(p.encode()))
        assertEquals(listOf(Feel.HYPNOTIC), p.withFeel(Feel.DARK).feels)
        assertTrue(PromptText.prompt(p, SharePick.SCENE, false).contains("\n- Style: lo-fi (start from the skill's recipe)\n- Feel: dark and hypnotic (the skill's feel words: change the recipe the way they say)\n- Tempo: 76 BPM\n"))
        assertFalse(PromptText.prompt(p.copy(feels = emptyList()), SharePick.SCENE, false).contains("Feel"))
        assertEquals("Dark lo-fi 76", PromptText.name(p))
        assertEquals(listOf(Feel.DREAMY), ClaudePrompt.decode("feels=DREAMY,DREAMY,NOPE").feels)
        // A track has them too; an improve doesn't.
        assertTrue(PromptSlot.FEEL in ClaudePrompt(PromptTask.TRACK).slots)
        assertFalse(PromptSlot.FEEL in ClaudePrompt(PromptTask.IMPROVE).slots)
    }

    @Test
    fun `the skill's genres md describes every feel word`() {
        val text = references.resolve("genres.md").readText()
        val table = text.substring(text.indexOf("## Feel words"), text.indexOf("## House"))
        for (f in Feel.entries) assertTrue(table.contains("| " + PromptText.feel(f).replaceFirstChar(Char::uppercase) + " |"), f.name)
    }

    @Test
    fun `a play asks to be taught the card, the way, the level and the start as a list`() {
        val p = ClaudePrompt(PromptTask.PLAY, way = PlayWay.STEPS, level = PlayLevel.SOME, speed = 75)
        assertTrue(p.withCard)
        assertEquals(
            "Use the arc-beats skill to teach me to play this EP-133 beat from Arc myself, on the device, not just import it.\n" +
                "- Way: step entry on the EP-133's sequencer, with the key combos of the official guide\n" +
                "- Me: I've had some practice\n" +
                "- Start: at 75% of its tempo, then work up to it\n" +
                "Go one step at a time: explain the step, give me something to play, and wait for me before the next one. The card:",
            PromptText.prompt(p, SharePick.PATTERN, true),
        )
        assertTrue(PromptText.prompt(p.copy(speed = 100), SharePick.CHAIN, true).contains("this EP-133 arrangement") )
        assertTrue(PromptText.prompt(p.copy(speed = 100), SharePick.CHAIN, true).contains("- Start: at its own tempo\n"))
        assertEquals("Teach me to play it by step entry as an improver starting at three-quarter tempo".lowercase(), PromptText.sentence(p, FactoryKit.EP133).joinToString(" ") { it.text }.lowercase())
        assertEquals("Play \u00B7 Steps 75%", PromptText.name(p))
        assertEquals("New", PromptText.tab(PromptTask.BEAT))
    }

    @Test
    fun `the glass's sentence has a slot for each choice`() {
        val p = ClaudePrompt(PromptTask.BEAT, genre = "uk-garage", tempo = 132, parts = setOf(PromptPart.LEAD, PromptPart.BASS))
        val s = PromptText.sentence(p, FactoryKit.EP40)
        assertEquals("Write a 4-bar beat in plain UK garage at 132 BPM for the EP-40 kit with bass · lead", s.joinToString(" ") { it.text })
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
