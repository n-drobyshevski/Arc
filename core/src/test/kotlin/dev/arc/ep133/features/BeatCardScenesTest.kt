package dev.arc.ep133.features

import dev.arc.ep133.text.ClaudeText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Beat cards with scenes and a chain (the spec's "Scenes and chains"). */
class BeatCardScenesTest {
    private fun hit(tick: Int, offset: Int, gate: Int = 24, semi: Int? = null, vel: Int = 127) = PatternNote(tick, offset, gate, semi, vel)

    private fun problems(r: CardRead) = r.problems.map { "${it.line} ${if (it.error) "error" else "warning"}: ${it.message}" }

    private fun read(vararg lines: String) = BeatCards.read(lines.joinToString("\n"))

    private val bar = "A7 | X... .... .... .... |"

    private fun a(vararg notes: PatternNote, bars: Int = 1, group: Int = 0, number: Int? = null, sounds: Map<Int, CardSound> = emptyMap(), pads: Map<Int, CardPad> = emptyMap()) =
        CardSection(group, number, Pattern(bars, notes.toList()), sounds, pads)

    private fun scene(name: String?, vararg sections: CardSection) = CardScene(name, sections.toList())

    private fun cardOf(vararg scenes: CardScene, chain: List<Pair<Int, Int>>? = null, fx: CardFx? = null) =
        BeatCard(null, null, 50, scenes.toList(), fx, chain, true)

    private fun snd(slot: Int, name: String? = null) = CardSound(slot, name)

    private fun keys(p: Pattern) = p.notes.map { "${it.tick}/${it.offset}/${it.gate}/${it.semitones}/${it.velocity}" }.toSet()

    /** A track idea: an intro, a drop and a B-only break, in a chain that repeats the drop. */
    private val track = listOf(
        "ARC BEAT 1", "name Track", "tempo 120", "chain 1x2 2 3x4 2",
        "scene Intro", "[A] bars 1", "A7 | X... .... .... .... |", "[B]", "B4 | x... .... x... .... |",
        "scene Drop", "[A]", "A7 | X.x. X.x. X.x. X.x. |",
        "scene", "[B] bars 2", "B4 | x... .... x... .... | x... .... x... .... |",
    ).joinToString("\n")

    // ---- reading ----

    @Test
    fun `a card with scene lines reads as scenes with their own sections and a chain`() {
        val r = BeatCards.read(track)
        assertEquals(emptyList<String>(), problems(r))
        val c = r.card!!
        assertEquals("Track", c.name)
        assertEquals(120.0, c.tempo)
        assertEquals(listOf("Intro", "Drop", null), c.scenes.map { it.name })
        assertEquals(listOf(listOf(0, 1), listOf(0), listOf(1)), c.scenes.map { s -> s.sections.map { it.group } })
        assertEquals(listOf(1 to 2, 2 to 1, 3 to 4, 2 to 1), c.chain)
        assertTrue(c.sceneLines)
        assertTrue(c.multiScene)
        // `sections` is the first scene's, allSections every scene's.
        assertEquals(c.scenes[0].sections, c.sections)
        assertEquals(4, c.allSections.size)
        assertEquals(2, c.scenes[2].sections[0].pattern.bars)
        assertEquals(8, c.scenes[1].sections[0].pattern.notes.size)
    }

    @Test
    fun `a card with no scene line is one implicit scene`() {
        val c = read("ARC BEAT 1", "[A]", bar, "[B]", "B7 | X... .... .... .... |").card!!
        assertEquals(1, c.scenes.size)
        assertNull(c.scenes[0].name)
        assertFalse(c.sceneLines)
        assertFalse(c.multiScene)
        assertNull(c.chain)
        assertEquals(2, c.sections.size)
        assertEquals(c.sections, c.allSections)
        // BeatCard(name, tempo, swing, sections) builds the same card, and withSections changes the first scene's.
        assertEquals(BeatCard(null, null, 50, c.sections), c)
        assertEquals(listOf(c.sections[1]), c.withSections(listOf(c.sections[1])).sections)
        assertThrows(IllegalArgumentException::class.java) { BeatCard(scenes = emptyList()) }
        // A scene line alone makes a card of scenes, even for one scene.
        val one = read("ARC BEAT 1", "scene", "[A]", bar).card!!
        assertTrue(one.sceneLines)
        assertTrue(one.multiScene)
        assertEquals(1, one.scenes.size)
    }

    @Test
    fun `scenes may leave groups out, repeat a group and hold no section at all`() {
        assertEquals(emptyList<String>(), problems(read("ARC BEAT 1", "scene", "[A]", bar, "scene", "[A]", bar)))
        val c = read("ARC BEAT 1", "scene", "scene", "[A]", bar).card!!
        assertEquals(listOf(0, 1), c.scenes.map { it.sections.size })
        assertEquals(listOf("1 error: The card has no section, such as [A]."), problems(read("ARC BEAT 1", "scene")))
        // A notes list ends at the next scene line; the keywords don't depend on case.
        val n = read("ARC BEAT 1", "SCENE Drop # loud", "[A]", bar, "notes", "A9 at 1.1.1", "Scene", "[A]", bar)
        assertEquals(emptyList<String>(), problems(n))
        assertEquals(listOf("Drop", null), n.card!!.scenes.map { it.name })
        assertEquals(2, n.card!!.scenes[0].sections[0].pattern.notes.size)
        // The sounds and pad lines belong to the scene's section.
        val s = read("ARC BEAT 1", "scene", "[A]", "sound A7 12 Kick", bar, "scene", "[A]", "sound A7 13", "pad A7 level 90", bar).card!!
        assertEquals(mapOf(9 to snd(12, "Kick")), s.scenes[0].sections[0].sounds)
        assertEquals(mapOf(9 to snd(13)), s.scenes[1].sections[0].sounds)
        assertEquals(mapOf(9 to CardPad(level = 90)), s.scenes[1].sections[0].pads)
    }

    @Test
    fun `scene problems`() {
        // A section before the first scene line.
        assertEquals(
            listOf("2 error: A section comes before the first scene line: once a card has scenes, every section belongs to one."),
            problems(read("ARC BEAT 1", "[A]", bar, "scene", "[B]", "B7 | X... .... .... .... |")),
        )
        // A group twice in one scene.
        assertEquals(listOf("5 error: Group A has two sections."), problems(read("ARC BEAT 1", "scene", "[A]", bar, "[A]", bar)))
        // Header lines after a scene line.
        assertEquals(
            listOf("3 warning: 'name' belongs before the first scene, ignored.", "4 warning: 'tempo' belongs before the first scene, ignored.", "5 error: 'fx' belongs before the first scene."),
            problems(read("ARC BEAT 1", "scene", "name Foo", "tempo 100", "fx delay", "[A]", bar)),
        )
        // The name: cut at 40 characters with a warning; a comment isn't part of it.
        val long = read("ARC BEAT 1", "scene " + "y".repeat(50), "[A]", bar)
        assertEquals(listOf("2 warning: Scene name is longer than 40 characters, shortened."), problems(long))
        assertEquals("y".repeat(40), long.card!!.scenes[0].name)
        // 16 scenes, not 17.
        fun scenes(n: Int) = arrayOf("ARC BEAT 1") + (1..n).flatMap { listOf("scene", "[A]", bar) }
        assertEquals(emptyList<String>(), problems(read(*scenes(16))))
        val many = read(*scenes(17))
        assertEquals(listOf("50 error: The card has more than 16 scenes, the most is 16."), problems(many))
        assertNull(many.card)
    }

    @Test
    fun `chain lines`() {
        val tail = arrayOf("scene", "[A]", bar, "scene", "[A]", bar)
        fun chain(vararg words: String) = read("ARC BEAT 1", *words, *tail)
        assertEquals(listOf(1 to 1, 2 to 8, 2 to 1), chain("chain 1 2x8 2").card!!.chain)
        assertEquals(emptyList<String>(), problems(chain("chain 1 2x8 2")))
        // Any case; a step may repeat scenes; up to 64 steps.
        assertEquals(listOf(1 to 2), chain("CHAIN 1X2").card!!.chain)
        assertEquals(64, chain("chain " + List(64) { "1" }.joinToString(" ")).card!!.chain!!.size)
        assertEquals(listOf("2 error: The chain has 65 steps, the most is 64."), problems(chain("chain " + List(65) { "1" }.joinToString(" "))))
        // Scenes the card doesn't have, passes out of range, words that aren't steps, an empty line.
        assertEquals(listOf("2 error: chain step 2 names scene 3, but the card has 2 scenes."), problems(chain("chain 1 3")))
        assertEquals(listOf("2 error: chain step '1x0': passes must be 1 to 8."), problems(chain("chain 1x0")))
        assertEquals(listOf("2 error: chain step '2x9': passes must be 1 to 8."), problems(chain("chain 1 2x9")))
        assertEquals(listOf("2 error: chain step '0': scenes count from 1."), problems(chain("chain 0")))
        assertEquals(listOf("2 error: 'two' isn't a chain step. Write a scene number, and its passes after an x, as in 2 or 2x4."), problems(chain("chain two")))
        assertEquals(listOf("2 error: 'x2' isn't a chain step. Write a scene number, and its passes after an x, as in 2 or 2x4."), problems(chain("chain x2")))
        assertEquals(listOf("2 error: chain needs at least one scene, as in chain 1 2x2 3."), problems(chain("chain")))
        // A line with a fault changes nothing: the earlier chain line stands, and the card is refused all the same.
        val faulty = chain("chain 2", "chain 1x0")
        assertNull(faulty.card)
        // A second chain line replaces the first, with a warning.
        val twice = chain("chain 1", "chain 1x2 2")
        assertEquals(listOf("3 warning: Two chain lines, kept the later."), problems(twice))
        assertEquals(listOf(1 to 2, 2 to 1), twice.card!!.chain)
        // A chain needs scene lines.
        assertEquals(listOf("2 error: A chain needs scenes: start each scene with a scene line."), problems(read("ARC BEAT 1", "chain 1", "[A]", bar)))
        // It is a header line: before the first scene, and so before any section.
        assertEquals(listOf("3 error: 'chain' belongs before the first scene."), problems(read("ARC BEAT 1", "scene", "chain 1", "[A]", bar)))
        assertEquals(listOf("5 error: 'chain' belongs before the first scene."), problems(read("ARC BEAT 1", "scene", "[A]", bar, "chain 1")))
        assertEquals(listOf("4 error: 'chain' belongs before the first scene."), problems(read("ARC BEAT 1", "[A]", bar, "chain 1")))
    }

    // ---- writing ----

    @Test
    fun `scenes are written after the chain, a section that repeats the one before is left out`() {
        val intro = scene("Intro", a(hit(0, 9), group = 0, number = 1), a(hit(0, 9), group = 1, number = 1))
        // B is the intro's pattern again, with other note ids: left out. A has another pattern.
        val drop = scene("Drop", a(hit(0, 9), hit(96, 9), group = 0, number = 2), CardSection(1, 5, Pattern(1, listOf(hit(0, 9).copy(id = 4)))))
        // A repeats the drop's: left out, and the scene is just its line.
        val outro = scene(null, a(hit(0, 9), hit(96, 9), group = 0))
        val c = cardOf(intro, drop, outro, chain = listOf(1 to 2, 2 to 1, 3 to 1))
        assertEquals(
            listOf(
                "ARC BEAT 1", "swing 50", "chain 1x2 2 3",
                "", "scene Intro",
                "[A01] bars 1 step 1/16", "A7 | X... .... .... .... |",
                "", "[B01] bars 1 step 1/16", "B7 | X... .... .... .... |",
                "", "scene Drop",
                "[A02] bars 1 step 1/16", "A7 | X... X... .... .... |",
                "", "scene",
            ),
            BeatCards.write(c).trimEnd().lines(),
        )
        // Read back it is the card without the sections left out.
        val back = BeatCards.read(BeatCards.write(c))
        assertEquals(emptyList<String>(), problems(back))
        assertEquals(cardOf(intro, scene("Drop", drop.sections[0]), scene(null), chain = listOf(1 to 2, 2 to 1, 3 to 1)), back.card)
        // And writes as the same text.
        assertEquals(BeatCards.write(c), BeatCards.write(back.card!!))
    }

    @Test
    fun `a section is left out only when its sounds and pad shaping repeat too`() {
        val kick = snd(12, "Kick")
        val first = scene(null, a(hit(0, 9), sounds = mapOf(9 to kick), pads = mapOf(9 to CardPad(level = 90))))
        val same = scene(null, a(hit(0, 9), sounds = mapOf(9 to kick), pads = mapOf(9 to CardPad(level = 90))))
        val newSound = scene(null, a(hit(0, 9), sounds = mapOf(9 to snd(13, "Snare")), pads = mapOf(9 to CardPad(level = 90))))
        val newPad = scene(null, a(hit(0, 9), sounds = mapOf(9 to kick), pads = mapOf(9 to CardPad(level = 80))))
        fun sections(vararg s: CardScene) = BeatCards.write(cardOf(first, *s)).lines().count { it.startsWith("[A") }
        assertEquals(1, sections(same))
        assertEquals(2, sections(newSound))
        assertEquals(2, sections(newPad))
        // The scene line is there either way; the order of a scene's sections is the groups'.
        val c = cardOf(scene("X", a(hit(0, 9), group = 2), a(hit(0, 9), group = 0)))
        assertEquals(listOf("scene X", "[A] bars 1 step 1/16", "[C] bars 1 step 1/16"), BeatCards.write(c).lines().filter { it.startsWith("[") || it.startsWith("scene") })
    }

    @Test
    fun `the chain line is written after the effect lines and only with steps that name a scene`() {
        val fx = CardFx(FxType.DELAY, 0.4f, 0.5f)
        val c = cardOf(scene("One", a(hit(0, 9))), scene("Two", a(hit(0, 9), hit(96, 9))), chain = listOf(1 to 1, 3 to 1, 2 to 4, 2 to 9, 0 to 1), fx = fx)
        val lines = BeatCards.write(c, tidy = true, silent = listOf(PhysicalPad(0, 9))).lines()
        assertEquals(listOf("ARC BEAT 1", "swing 50", "fx delay 40 50", "chain 1 2x4", "# no sound on: A7", BeatCards.TIDY_COMMENT), lines.take(6))
        // Steps that name nothing: no chain line. A chain on a card with no scene lines is a card of scenes.
        assertFalse("chain" in BeatCards.write(cardOf(scene(null, a(hit(0, 9))), chain = listOf(2 to 1))))
        val bare = BeatCard(null, null, 50, listOf(CardScene(null, listOf(a(hit(0, 9))))), null, listOf(1 to 3))
        assertTrue(bare.multiScene)
        assertEquals(listOf("swing 50", "chain 1x3", "", "scene"), BeatCards.write(bare).lines().drop(1).take(4))
        // A single-scene card with no scene lines is written as before.
        assertFalse("scene" in BeatCards.write(BeatCard(null, null, 50, listOf(a(hit(0, 9))))))
    }

    @Test
    fun `a card of scenes reads back as itself`() {
        val c = BeatCards.read(track).card!!
        val back = BeatCards.read(BeatCards.write(c))
        assertEquals(emptyList<String>(), problems(back))
        assertEquals(c, back.card)
        assertEquals(BeatCards.write(c), BeatCards.write(back.card!!))
        val tidy = BeatCards.read(BeatCards.write(c, tidy = true)).card!!
        assertEquals(c, tidy)
    }

    // ---- from a project's chain ----

    private val kickP = Pattern(1, listOf(hit(0, 9)))
    private val hatP = Pattern(1, listOf(hit(0, 6, vel = 100), hit(48, 6, vel = 100)))
    private val fullKick = Pattern(1, listOf(hit(0, 9), hit(96, 9)))

    private fun arrangement(chain: List<ChainStep>) = ProjectSeq(
        banks = listOf(mapOf(1 to kickP, 2 to fullKick), mapOf(1 to hatP), mapOf(3 to Pattern(2)), emptyMap()),
        scenes = listOf(Scene(listOf(1, 1, 3, 1)), Scene(listOf(2, 1, 3, 1)), Scene(listOf(1, 2, 1, 1)), Scene(listOf(2, 1, 1, 1))),
        scene = 0,
        chain = Chain(chain, true),
    )

    @Test
    fun `a chain becomes a card of scenes in first-play order`() {
        val steps = listOf(ChainStep(1, 2), ChainStep(0, 1), ChainStep(1, 1), ChainStep(2, 4))
        val seq = arrangement(steps)
        val sounds = { p: PhysicalPad -> if (p == PhysicalPad(0, 9)) CardSound(5, "Kick") else if (p == PhysicalPad(1, 6)) CardSound(201, "Hat") else null }
        val pads = { p: PhysicalPad -> if (p == PhysicalPad(0, 9)) PadSettings(level = 80) else null }
        val c = BeatCards.fromScenes("Arrangement", 120.0, 58, seq, sounds = sounds, pads = pads)!!
        assertEquals(listOf(1 to 2, 2 to 1, 1 to 1, 3 to 4), c.chain)
        assertTrue(c.sceneLines)
        assertEquals("Arrangement", c.name)
        assertEquals(58, c.swing)
        assertNull(c.fx)
        // Scene 1 is project scene 1: A (pattern 2) and B have notes, C and D (empty) are left out.
        val s1 = c.scenes[0].sections
        assertEquals(listOf(0, 1), s1.map { it.group })
        assertEquals(listOf(2, 1), s1.map { it.number })
        assertEquals(mapOf(9 to CardSound(5, "Kick")), s1[0].sounds)
        assertEquals(mapOf(9 to CardPad(level = 80)), s1[0].pads)
        assertEquals(mapOf(6 to CardSound(201, "Hat")), s1[1].sounds)
        // Scene 2 is project scene 0: only A changes (B is the hat again, C and D empty); the kick's sound isn't repeated.
        val s2 = c.scenes[1].sections
        assertEquals(listOf(0), s2.map { it.group })
        assertEquals(kickP, s2[0].pattern)
        assertEquals(emptyMap<Int, CardSound>(), s2[0].sounds)
        assertEquals(emptyMap<Int, CardPad>(), s2[0].pads)
        // Scene 3 is project scene 2: A is the kick again, and B is empty, which differs from the hat: an empty section.
        assertEquals(listOf(CardSection(1, 2, Pattern())), c.scenes[2].sections)
        assertEquals(3, c.scenes.size)
        // It writes, and reads back as itself.
        val text = BeatCards.write(c)
        assertTrue("\nchain 1x2 2 1 3x4\n" in text)
        assertEquals(c, BeatCards.read(text).card)
        // A note off the swung grid takes the swing back to 50. No chain, no card.
        val offGrid = ProjectSeq(banks = listOf(mapOf(1 to Pattern(1, listOf(hit(12, 9)))), emptyMap(), emptyMap(), emptyMap()), chain = Chain(listOf(ChainStep(0)), true))
        assertEquals(50, BeatCards.fromScenes(null, null, 58, offGrid)!!.swing)
        assertNull(BeatCards.fromScenes(null, null, 58, ProjectSeq.DEFAULT))
        assertNull(BeatCards.fromScenes(null, null, 58, seq, chain = emptyList()))
        // Another chain than the project's can be handed in; fx go in as for a pattern.
        val one = BeatCards.fromScenes(null, null, 50, seq, chain = listOf(ChainStep(3, 2), ChainStep(9, 1)), fx = FxSettings.DEFAULT.withType(FxType.REVERB))!!
        assertEquals(listOf(1 to 2), one.chain)
        assertEquals(FxType.REVERB, one.fx!!.type)
        // A first scene with no notes at all has all four groups.
        val blank = ProjectSeq(chain = Chain(listOf(ChainStep(0)), true))
        assertEquals(listOf(0, 1, 2, 3), BeatCards.fromScenes(null, null, 50, blank)!!.scenes[0].sections.map { it.group })
    }

    // ---- planning ----

    private val kick = Pattern(1, listOf(hit(0, 9)))

    private fun project(scene: List<Int> = listOf(1, 5, 1, 7)) = ProjectSeq(
        banks = listOf(mapOf(1 to kick, 2 to kick, 3 to kick), emptyMap(), emptyMap(), mapOf(7 to kick)),
        scenes = listOf(Scene(scene)),
    )

    @Test
    fun `a card of scenes adds a scene for each, each section in its group's next free pattern`() {
        val card = BeatCards.read(track).card!!
        val plan = BeatCards.plan(project(), card)
        assertNull(plan.fullGroup)
        assertTrue(plan.newScene)
        // A takes 4, then 5; B takes 6, then 7 (after the playing scene's 5).
        assertEquals(listOf(0 to 4, 1 to 6, 0 to 5, 1 to 7), plan.placed)
        assertEquals(listOf(1, 2, 3), plan.scenes)
        assertEquals(
            listOf(Scene(listOf(1, 5, 1, 7)), Scene(listOf(4, 6, 1, 7)), Scene(listOf(5, 6, 1, 7)), Scene(listOf(5, 7, 1, 7))),
            plan.seq.scenes,
        )
        // The first new scene is selected.
        assertEquals(1, plan.seq.scene)
        assertEquals(keys(card.scenes[0].sections[0].pattern), keys(plan.seq.pattern(0, 4)))
        assertEquals(keys(card.scenes[1].sections[0].pattern), keys(plan.seq.pattern(0, 5)))
        assertEquals(2, plan.seq.pattern(1, 7).bars)
        // The chain is mapped to the new scenes, and is the project's, on.
        val mapped = listOf(ChainStep(1, 2), ChainStep(2, 1), ChainStep(3, 4), ChainStep(2, 1))
        assertEquals(mapped, plan.chain)
        assertEquals(Chain(mapped, true), plan.seq.chain)
        // The notes' ids are 0.
        assertTrue(plan.seq.pattern(0, 4).notes.all { it.id == 0 })
    }

    @Test
    fun `the project's chain is replaced, or left alone with set chain off`() {
        val card = BeatCards.read(track).card!!
        val old = Chain(listOf(ChainStep(0, 3)), false)
        val seq = project().withChain(old)
        val on = BeatCards.plan(seq, card)
        assertEquals(listOf(ChainStep(1, 2), ChainStep(2, 1), ChainStep(3, 4), ChainStep(2, 1)), on.seq.chain.steps)
        assertTrue(on.seq.chain.on)
        val off = BeatCards.plan(seq, card, setChain = false)
        assertEquals(old, off.seq.chain)
        // The mapped chain is still there for the sheet.
        assertEquals(on.chain, off.chain)
        assertEquals(on.seq.scenes, off.seq.scenes)
        // A card with scenes and no chain leaves the chain as it is.
        val noChain = BeatCards.plan(seq, read("ARC BEAT 1", "scene", "[A]", bar, "scene", "[A]", bar).card!!)
        assertEquals(old, noChain.seq.chain)
        assertNull(noChain.chain)
        assertEquals(listOf(1, 2), noChain.scenes)
    }

    @Test
    fun `with replace the card's scenes take the place of the project's, from S01`() {
        val card = BeatCards.read(track).card!!
        val old = Chain(listOf(ChainStep(0, 3)), true)
        val seq = project().withChain(old)
        val replaced = BeatCards.plan(seq, card, replace = true)
        assertTrue(replaced.newScene)
        // The patterns go where they go either way; the scenes are the card's alone, the first selected.
        assertEquals(BeatCards.plan(seq, card).placed, replaced.placed)
        assertEquals(listOf(0, 1, 2), replaced.scenes)
        assertEquals(listOf(Scene(listOf(4, 6, 1, 7)), Scene(listOf(5, 6, 1, 7)), Scene(listOf(5, 7, 1, 7))), replaced.seq.scenes)
        assertEquals(0, replaced.seq.scene)
        // The card's chain names the new scenes from 0, and is on.
        val mapped = listOf(ChainStep(0, 2), ChainStep(1, 1), ChainStep(2, 4), ChainStep(1, 1))
        assertEquals(mapped, replaced.chain)
        assertEquals(Chain(mapped, true), replaced.seq.chain)
        // SET CHAIN off: the old chain named the old scenes, so it goes.
        assertEquals(Chain(), BeatCards.plan(seq, card, setChain = false, replace = true).seq.chain)
        // The project's patterns stay in the banks.
        assertEquals(kick, replaced.seq.pattern(0, 2))
        assertEquals(kick, replaced.seq.pattern(3, 7))
        // No room to add 3 scenes after 97, but room to replace them.
        val crowded = BeatCards.plan(ProjectSeq(scenes = List(97) { Scene() }), card, replace = true)
        assertTrue(crowded.newScene)
        assertEquals(3, crowded.seq.scenes.size)
    }

    @Test
    fun `with replace a card of several groups and no scene line is the project's one scene`() {
        val card = read("ARC BEAT 1", "[A]", bar, "[B]", "B7 | X... .... .... .... |").card!!
        val seq = project().withScenes(listOf(Scene(listOf(1, 5, 1, 7)), Scene(listOf(2, 5, 1, 7))), 1, Chain(listOf(ChainStep(1, 2)), true))
        val replaced = BeatCards.plan(seq, card, replace = true)
        assertTrue(replaced.newScene)
        assertEquals(listOf(0), replaced.scenes)
        assertEquals(listOf(Scene(listOf(4, 6, 1, 7))), replaced.seq.scenes)
        assertEquals(Chain(), replaced.seq.chain)
        // A card of one group adds no scene, so there is nothing to replace.
        val one = BeatCards.plan(seq, read("ARC BEAT 1", "[A]", bar).card!!, replace = true)
        assertFalse(one.newScene)
        assertEquals(seq.scenes, one.seq.scenes)
    }

    @Test
    fun `a group a scene leaves out takes the number of the scene before, the first scene the playing one's`() {
        val card = read("ARC BEAT 1", "scene", "[C]", "C7 | X... .... .... .... |", "scene", "[A]", bar, "scene").card!!
        val plan = BeatCards.plan(project(), card)
        // C takes 2 (after the playing scene's 1); A takes 4 (after the playing 1; 2 and 3 are used). The playing scene's A, B, D are kept in the first.
        assertEquals(listOf(Scene(listOf(1, 5, 1, 7)), Scene(listOf(1, 5, 2, 7)), Scene(listOf(4, 5, 2, 7)), Scene(listOf(4, 5, 2, 7))), plan.seq.scenes)
    }

    @Test
    fun `a section with no notes still takes a pattern of its own`() {
        val card = read("ARC BEAT 1", "scene", "[A] bars 2", "scene", "[A]", bar).card!!
        val plan = BeatCards.plan(ProjectSeq.DEFAULT, card)
        assertEquals(listOf(0 to 2, 0 to 3), plan.placed)
        assertEquals(Pattern(2), plan.seq.pattern(0, 2))
        assertEquals(1, plan.seq.pattern(0, 3).notes.size)
        assertEquals(listOf(Scene(listOf(1, 1, 1, 1)), Scene(listOf(2, 1, 1, 1)), Scene(listOf(3, 1, 1, 1))), plan.seq.scenes)
    }

    @Test
    fun `one scene line is one new scene, even with a single section`() {
        val one = BeatCards.plan(project(), read("ARC BEAT 1", "scene", "[A]", bar).card!!)
        assertTrue(one.newScene)
        assertEquals(listOf(1), one.scenes)
        assertEquals(1, one.seq.scene)
        assertEquals(Scene(listOf(4, 5, 1, 7)), one.seq.scenes[1])
        // Without scene lines a card of one section adds no scene, and one of two does, as before, naming it.
        val plain = BeatCards.plan(project(), read("ARC BEAT 1", "[A]", bar).card!!)
        assertFalse(plain.newScene)
        assertEquals(emptyList<Int>(), plain.scenes)
        assertNull(plain.chain)
        val two = BeatCards.plan(project(), read("ARC BEAT 1", "[A]", bar, "[B]", "B7 | X... .... .... .... |").card!!)
        assertTrue(two.newScene)
        assertEquals(listOf(1), two.scenes)
    }

    @Test
    fun `a full bank stops a card of scenes, and 99 scenes add none`() {
        val card = BeatCards.read(track).card!!
        val full = ProjectSeq(banks = listOf(emptyMap(), (1..Seq.MAX_PATTERNS).associateWith { kick }, emptyMap(), emptyMap()))
        val stopped = BeatCards.plan(full, card)
        assertSame(full, stopped.seq)
        assertEquals(emptyList<Pair<Int, Int>>(), stopped.placed)
        assertEquals(1, stopped.fullGroup)
        assertFalse(stopped.newScene)
        // Not enough room for all its scenes: none is added (and no chain), the patterns are placed all the same.
        val crowded = ProjectSeq(scenes = List(97) { Scene() }, chain = Chain(listOf(ChainStep(5, 2)), true))
        val none = BeatCards.plan(crowded, card)
        assertFalse(none.newScene)
        assertEquals(emptyList<Int>(), none.scenes)
        assertNull(none.chain)
        assertEquals(4, none.placed.size)
        assertEquals(97, none.seq.scenes.size)
        assertEquals(crowded.chain, none.seq.chain)
        // Exactly enough room.
        val snug = BeatCards.plan(ProjectSeq(scenes = List(96) { Scene() }), card)
        assertTrue(snug.newScene)
        assertEquals(99, snug.seq.scenes.size)
        assertEquals(listOf(96, 97, 98), snug.scenes)
    }

    // ---- sounds ----

    @Test
    fun `the sound lines of every scene count, a pad's last one wins`() {
        val card = cardOf(
            scene("One", a(hit(0, 9), sounds = mapOf(9 to snd(12, "Kick"))), a(hit(0, 6), group = 1)),
            scene("Two", a(hit(0, 9), sounds = mapOf(9 to snd(13, "Snare"))), a(hit(0, 3), group = 1, sounds = mapOf(3 to snd(300)))),
        )
        val available = mapOf(12 to "Kick", 13 to "Snare", 300 to "Rim")
        val picks = BeatCards.resolveSounds(card, available) { null }
        assertEquals(listOf(PhysicalPad(0, 9) to 13, PhysicalPad(1, 3) to 300), picks.map { it.pad to it.slot })
        assertEquals(listOf(SoundStatus.CHANGE, SoundStatus.CHANGE), picks.map { it.status })
        // A pad with a sound line in any scene isn't silent; B6 has none and plays nothing.
        assertEquals(listOf(PhysicalPad(1, 6)), BeatCards.silentPads(card, { null }, known = true))
        assertEquals(emptyList<PhysicalPad>(), BeatCards.silentPads(card, { null }, known = false))
        // Pads used in a later scene only are told too, once.
        val later = cardOf(scene(null, a(hit(0, 9))), scene(null, a(hit(0, 9), hit(0, 3)), a(hit(0, 3), group = 1)))
        assertEquals(listOf(PhysicalPad(0, 9), PhysicalPad(0, 3), PhysicalPad(1, 3)), BeatCards.silentPads(later, { null }, known = true))
    }
}
