package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import dev.arc.ep133.text.ClaudeText
import java.io.File

class BeatCardTest {
    /** The spec's own text: its first fenced block is the example card. */
    private val spec: String by lazy { File(System.getProperty("arc.beatCardSpec") ?: error("arc.beatCardSpec not set")).readText() }
    private val example: String by lazy { spec.substringAfter("```\n").substringBefore("\n```") }
    private val exampleNames = mapOf(PhysicalPad(0, 9) to "kick", PhysicalPad(0, 11) to "snare", PhysicalPad(0, 6) to "hat")

    private fun hit(tick: Int, offset: Int, gate: Int = 24, semi: Int? = null, vel: Int = 127) = PatternNote(tick, offset, gate, semi, vel)

    private fun key(n: PatternNote) = "${n.tick}/${n.offset}/${n.gate}/${n.semitones}/${n.velocity}"

    /** A pattern's notes as a set: the order and the ids don't count. */
    private fun keys(p: Pattern) = p.notes.map(::key).toSet()

    private fun problems(r: CardRead) = r.problems.map { "${it.line} ${if (it.error) "error" else "warning"}: ${it.message}" }

    private fun text(vararg lines: String) = lines.joinToString("\n")

    private val bar = "A7 | X... .... .... .... |"

    private fun read(vararg lines: String) = BeatCards.read(text(*lines))

    private fun section(r: CardRead, i: Int = 0) = r.card!!.sections[i]

    private fun card(vararg sections: CardSection, swing: Int = 50) = BeatCard(null, null, swing, sections.toList())

    private fun a(vararg notes: PatternNote, bars: Int = 1, group: Int = 0, number: Int? = null, sounds: Map<Int, CardSound> = emptyMap()) =
        CardSection(group, number, Pattern(bars, notes.toList()), sounds)

    private fun snd(slot: Int, name: String? = null) = CardSound(slot, name)

    // ---- reading ----

    @Test
    fun `the spec's example card reads, and writes back as itself`() {
        val r = BeatCards.read(example)
        assertEquals(emptyList<String>(), problems(r))
        val c = r.card!!
        assertEquals("Lazy boom bap", c.name)
        assertEquals(92.0, c.tempo)
        assertEquals(58, c.swing)
        assertEquals(1, c.sections.size)
        assertEquals(0, c.sections[0].group)
        assertNull(c.sections[0].number)
        assertEquals(1, c.sections[0].pattern.bars)
        // The odd steps play 4 ticks late at swing 58; the notes list isn't swung.
        val kick = listOf(0, 144, 192).map { key(hit(it, 9, vel = if (it == 144) 100 else 127)) }
        val snare = listOf(key(hit(96, 11)), key(hit(288, 11)), key(hit(364, 11, vel = 64)))
        val hat = listOf(0, 48, 96, 144, 192, 240, 288, 336).map { key(hit(it, 6, vel = 100)) } + key(hit(364, 6, vel = 64))
        val notes = listOf(key(hit(366, 11, vel = 50)), key(hit(0, 3, gate = 48, semi = 0)))
        assertEquals((kick + snare + hat + notes).toSet(), keys(c.sections[0].pattern))
        assertEquals(kick.size + snare.size + hat.size + notes.size, c.sections[0].pattern.notes.size)
        assertEquals(example + "\n", BeatCards.write(c, names = { exampleNames[it] }))
        // The whole spec file reads as the example: the text before it and the closing fence are left out.
        assertEquals(c, BeatCards.read(spec).card)
    }

    @Test
    fun `text around the card is ignored, and reading stops at a closing fence or END`() {
        val chat = text("Sure, here is a beat:", "", "```text", "ARC BEAT 1", "[A]", bar, "```", "Hope you like it!", "[B]", "B7 | oops |")
        val r = BeatCards.read(chat)
        assertEquals(emptyList<String>(), problems(r))
        assertEquals(1, r.card!!.sections.size)
        assertEquals(setOf(key(hit(0, 9))), keys(section(r).pattern))
        // Lines count in the text given, chat and all.
        val bad = text("Sure:", "```", "ARC BEAT 1", "[A]", "A9 | X... .... .... ... |", "```")
        assertEquals(listOf("5 error: A9 bar 1 has 15 steps, needs 16."), problems(BeatCards.read(bad)))
        for (end in listOf("END", "end", "  End  ")) {
            val r2 = read("ARC BEAT 1", "[A]", bar, end, "[B]", "B7 | oops |")
            assertEquals(listOf(0), r2.card!!.sections.map { it.group })
            assertEquals(emptyList<String>(), problems(r2))
        }
        // Chat text that merely mentions the name isn't the start; CRLF line ends and a byte order mark are fine.
        val r3 = BeatCards.read("\uFEFFHere is your ARC BEAT:\r\nARC BEAT 1\r\n[A]\r\n$bar\r\n")
        assertEquals(emptyList<String>(), problems(r3))
        assertEquals(1, section(r3).pattern.notes.size)
    }

    @Test
    fun `a text has a card when it has an ARC BEAT line, mistakes or not`() {
        assertTrue(BeatCards.hasCard("ARC BEAT 1\n[A]\n$bar"))
        assertTrue(BeatCards.hasCard("Sure:\n```\n  arc beat 1\r\n[A]"))
        assertTrue(BeatCards.hasCard("\uFEFFARC BEAT"))
        // A card with a mistake is still a card; a mention of the name, or none, isn't.
        assertTrue(BeatCards.hasCard("ARC BEAT x\n[A]"))
        assertFalse(BeatCards.hasCard("Here is your ARC BEAT: enjoy"))
        assertFalse(BeatCards.hasCard("[A]\n$bar"))
        assertFalse(BeatCards.hasCard(""))
    }

    @Test
    fun `comments, blank lines and the case of keywords`() {
        val r = read("ARC BEAT 1 # version", "# a whole line", "", "name Foo # trailing", "[A] # section", "A7 | X... .... .... .... | # kick", "   ", "# end")
        assertEquals(emptyList<String>(), problems(r))
        assertEquals("Foo", r.card!!.name)
        assertEquals(1, section(r).pattern.notes.size)
        val up = read("arc beat 1", "NAME Foo", "TEMPO 100", "SWING 60", "[A] BARS 1 STEP 1/16", bar, "NOTES", "A9 AT 1.1.1 VEL 5 GATE 1/8 NOTE C4")
        assertEquals(emptyList<String>(), problems(up))
        assertEquals(BeatCard("Foo", 100.0, 60, up.card!!.sections), up.card)
        assertEquals(setOf(key(hit(0, 9)), key(hit(0, 11, gate = 48, semi = 0, vel = 5))), keys(section(up).pattern))
        // Pad labels, X and x, and note names do count.
        assertEquals(listOf("3 error: 'a7' isn't a pad. Use A to D, then . 0 E or 1 to 9."), problems(read("ARC BEAT 1", "[A]", "a7 | X... .... .... .... |")))
        assertEquals(listOf("5 error: A9 note: note must be a name from C-1 to G9, such as C4."), problems(read("ARC BEAT 1", "[A]", bar, "notes", "A9 at 1.1.1 note c4")))
    }

    @Test
    fun `a card needs its version, and a newer one is refused`() {
        assertEquals(listOf("1 error: No ARC BEAT line found."), problems(BeatCards.read("[A]\n$bar")))
        assertEquals(listOf("1 error: No ARC BEAT line found."), problems(BeatCards.read("")))
        assertEquals(listOf("1 error: ARC BEAT needs a version, as in ARC BEAT 1."), problems(BeatCards.read("ARC BEAT\n[A]\n$bar")))
        assertEquals(listOf("1 error: ARC BEAT needs a version, as in ARC BEAT 1."), problems(BeatCards.read("ARC BEAT one\n[A]\n$bar")))
        assertEquals(listOf("1 error: ARC BEAT needs a version, as in ARC BEAT 1."), problems(BeatCards.read("ARC BEAT 0\n[A]\n$bar")))
        val newer = BeatCards.read("ARC BEAT 2\nfuture 1\n[A]\n$bar")
        assertNull(newer.card)
        assertEquals(listOf("1 error: This card was made by a newer Arc (version 2)."), problems(newer))
        assertEquals(listOf("2 error: The card has no section, such as [A]."), problems(BeatCards.read("\nARC BEAT 1\nname Empty")))
    }

    @Test
    fun `the header`() {
        val r = read("ARC BEAT 1", "name Lazy boom bap", "tempo 92.5", "swing 66", "[A]", bar)
        assertEquals(BeatCard("Lazy boom bap", 92.5, 66, r.card!!.sections), r.card)
        val bare = read("ARC BEAT 1", "[A]", bar).card!!
        assertNull(bare.name)
        assertNull(bare.tempo)
        assertEquals(50, bare.swing)
        // The range of each word.
        assertEquals(40.0, read("ARC BEAT 1", "tempo 40", "[A]", bar).card!!.tempo)
        assertEquals(240.0, read("ARC BEAT 1", "tempo 240.0", "[A]", bar).card!!.tempo)
        assertEquals(75, read("ARC BEAT 1", "swing 75", "[A]", bar).card!!.swing)
        for (t in listOf("39.9", "241", "abc", "92.55", "-92", "", "92 bpm")) {
            assertEquals(listOf("2 error: Tempo must be 40 to 240, whole or with one decimal."), problems(read("ARC BEAT 1", "tempo $t", "[A]", bar)), t)
        }
        for (s in listOf("49", "76", "58.5", "x", "")) {
            assertEquals(listOf("2 error: Swing must be a whole number from 50 to 75."), problems(read("ARC BEAT 1", "swing $s", "[A]", bar)), s)
        }
        // A title is kept to 40 characters; the last of a repeated word counts.
        val long = read("ARC BEAT 1", "name " + "x".repeat(45), "[A]", bar)
        assertEquals(listOf("2 warning: Name is longer than 40 characters, shortened."), problems(long))
        assertEquals("x".repeat(40), long.card!!.name)
        assertEquals(listOf("2 warning: Name is empty, ignored."), problems(read("ARC BEAT 1", "name", "[A]", bar)))
        // Characters are counted and cut as whole characters: a surrogate pair is never split.
        val smile = "\uD83D\uDE00"
        val fit = read("ARC BEAT 1", "name a" + smile.repeat(20), "[A]", bar)
        assertEquals(emptyList<String>(), problems(fit))
        assertEquals("a" + smile.repeat(20), fit.card!!.name)
        val wide = read("ARC BEAT 1", "name a" + smile.repeat(45), "[A]", bar)
        assertEquals(listOf("2 warning: Name is longer than 40 characters, shortened."), problems(wide))
        assertEquals("a" + smile.repeat(39), wide.card!!.name)
        assertEquals(100.0, read("ARC BEAT 1", "tempo 90", "tempo 100", "[A]", bar).card!!.tempo)
        // Words a newer card may add, and header words too late, only warn.
        val odd = read("ARC BEAT 1", "groove 3", "[A]", bar, "tempo 100")
        assertEquals(listOf("2 warning: Unknown header word 'groove', ignored.", "5 warning: 'tempo' belongs before the first section, ignored."), problems(odd))
        assertNull(odd.card!!.tempo)
        // Rows and notes need a section.
        assertEquals(listOf("2 error: 'A7' needs a section first, such as [A]."), problems(read("ARC BEAT 1", bar, "[A]", bar)))
        assertEquals(listOf("2 error: 'notes' needs a section first, such as [A]."), problems(read("ARC BEAT 1", "notes", "[A]", bar)))
    }

    @Test
    fun `sections`() {
        val r = read("ARC BEAT 1", "[A07] bars 2 step 1/8", "A7 | X... .... |  X... .... |", "", "[D] step 1/16T", "D7 | Xxo. .... .... .... .... .... |")
        assertEquals(emptyList<String>(), problems(r))
        assertEquals(listOf(0, 3), r.card!!.sections.map { it.group })
        assertEquals(listOf(7, null), r.card!!.sections.map { it.number })
        assertEquals(listOf(2, 1), r.card!!.sections.map { it.pattern.bars })
        // 1/8 steps are 48 ticks; 1/16T steps 16.
        assertEquals(setOf(key(hit(0, 9, 48)), key(hit(384, 9, 48))), keys(section(r, 0).pattern))
        assertEquals(setOf(key(hit(0, 9, 16)), key(hit(16, 9, 16, vel = 100)), key(hit(32, 9, 16, vel = 64))), keys(section(r, 1).pattern))
        // The pattern number is 1 to 99, written with or without a zero.
        assertEquals(1, read("ARC BEAT 1", "[A1]", bar).card!!.sections[0].number)
        assertEquals(99, read("ARC BEAT 1", "[A99]", bar).card!!.sections[0].number)
        for (s in listOf("[A100]", "[A0]", "[A00]", "[A123]")) {
            val digits = s.substring(2, s.length - 1)
            assertEquals(listOf("2 error: The pattern number in [A$digits] must be 1 to 99."), problems(read("ARC BEAT 1", s, bar)), s)
        }
        // Faults on the section line; its rows aren't blamed for them.
        assertEquals(listOf("2 error: A section needs a group A to D, as in [A] or [A07]."), problems(read("ARC BEAT 1", "[E]", "E7 | X |")))
        assertEquals(listOf("2 error: A section needs a group A to D, as in [A] or [A07]."), problems(read("ARC BEAT 1", "[]", bar)))
        assertEquals(listOf("2 error: A section needs a group A to D, as in [A] or [A07]."), problems(read("ARC BEAT 1", "[a]", bar)))
        assertEquals(listOf("2 error: A section needs a closing ], as in [A]."), problems(read("ARC BEAT 1", "[A bars 2", bar)))
        for (b in listOf("0", "100", "x", "-1", "")) {
            assertEquals(listOf("2 error: bars must be a whole number from 1 to 99."), problems(read("ARC BEAT 1", "[A] bars $b", bar)), b)
        }
        assertEquals(listOf("2 error: step must be one of 1/8 1/16 1/32 1/8T 1/16T."), problems(read("ARC BEAT 1", "[A] step 1/4", bar)))
        assertEquals(listOf("2 error: step must be one of 1/8 1/16 1/32 1/8T 1/16T."), problems(read("ARC BEAT 1", "[A] step", bar)))
        assertEquals(99, read("ARC BEAT 1", "[A] bars 99", "A7 | " + "X... .... .... .... ".repeat(99) + "|").card!!.sections[0].pattern.bars)
        // A group comes once; the second is still read, for its own faults.
        val twice = read("ARC BEAT 1", "[A]", bar, "[B]", "B7 | X... .... .... .... |", "[A]", "A9 | X... |")
        assertEquals(listOf("6 error: Group A has two sections.", "7 error: A9 bar 1 has 4 steps, needs 16."), problems(twice))
        assertNull(twice.card)
        // Words a newer card may add only warn, with their value.
        val newer = read("ARC BEAT 1", "[A] colour red bars 2 loud", "A7 | X... .... .... .... | .... .... .... .... |")
        assertEquals(listOf("2 warning: Unknown option 'colour' on [A], ignored.", "2 warning: Unknown option 'loud' on [A], ignored."), problems(newer))
        assertEquals(2, section(newer).pattern.bars)
        // A card with no [ line has no section.
        assertEquals(listOf("1 error: The card has no section, such as [A]."), problems(read("ARC BEAT 1")))
    }

    @Test
    fun `grid rows`() {
        // Every step character, and a hold.
        val r = read("ARC BEAT 1", "[A]", "A7 kick drum | Xxo1 9--. .... .... |")
        assertEquals(emptyList<String>(), problems(r))
        assertEquals(
            setOf(key(hit(0, 9)), key(hit(24, 9, vel = 100)), key(hit(48, 9, vel = 64)), key(hit(72, 9, vel = 14)), key(hit(96, 9, gate = 72, vel = 126))),
            keys(section(r).pattern),
        )
        // Pads are written as printed on the device; ENTER is E; the name is for reading only.
        val pads = read(
            "ARC BEAT 1", "[A]",
            "A. | X... .... .... .... |", "A0|.X.. .... .... ....|", "AE | ..X. .... .... .... |", "AENTER | ...X .... .... .... |",
            "A1 | .... X... .... .... |", "A2 | .... .X.. .... .... |", "A3 | .... ..X. .... .... |", "A4 | .... ...X .... .... |",
            "A5 | .... .... X... .... |", "A6 | .... .... .X.. .... |", "A7 | .... .... ..X. .... |", "A8 | .... .... ...X .... |",
            "A9 | .... .... .... X... |",
        )
        assertEquals(emptyList<String>(), problems(pads))
        assertEquals(listOf(0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11), section(pads).pattern.notes.map { it.offset })
        assertEquals((0..12).map { it * 24 }, section(pads).pattern.notes.map { it.tick }.sorted())
        // Spaces and bars between the steps don't count; the hold goes across a bar line.
        val two = read("ARC BEAT 1", "[A] bars 2", "A7 | .... .... .... ...X | -- .. .... .... ...x |")
        assertEquals(setOf(key(hit(360, 9, gate = 72)), key(hit(744, 9, vel = 100))), keys(section(two).pattern))
        // A pad may have more than one row.
        val ghosts = read("ARC BEAT 1", "[A]", "A4 | x... x... x... x... |", "A4 | .o.. .o.. .o.. .o.. |")
        assertEquals(8, section(ghosts).pattern.notes.size)
        assertEquals(emptyList<String>(), problems(ghosts))
        // The same pad at the same tick is one hit, the louder, with a warning at the later row.
        for (rows in listOf(listOf("x...", "X..."), listOf("X...", "x..."), listOf("X...", "X..."))) {
            val dup = read("ARC BEAT 1", "[A]", "A7 | ${rows[0]} .... .... .... |", "A7 | ${rows[1]} .... .... .... |")
            assertEquals(listOf("4 warning: A7 has two hits at 1.1.1, kept the louder."), problems(dup))
            assertEquals(listOf(127), section(dup).pattern.notes.map { it.velocity })
        }
    }

    @Test
    fun `grid row errors name the row and the bar`() {
        fun one(vararg lines: String, header: String = "[A]") = problems(BeatCards.read(text("ARC BEAT 1", header, *lines)))
        assertEquals(listOf("3 error: A7 bar 1 has 15 steps, needs 16."), one("A7 | X... .... .... ... |"))
        assertEquals(listOf("3 error: A7 bar 2 has 15 steps, needs 16."), one("A7 | X... .... .... .... | .... .... .... ... |", header = "[A] bars 2"))
        assertEquals(listOf("3 error: A7 bar 2 has 0 steps, needs 16."), one(bar, header = "[A] bars 2"))
        assertEquals(listOf("3 error: A7 bar 1 has 0 steps, needs 16."), one("A7 | |"))
        assertEquals(listOf("3 error: A7 has 17 steps, needs 16."), one("A7 | X... .... .... .... . |"))
        assertEquals(listOf("3 error: A7 has 33 steps, needs 32."), one("A7 | " + "X... .... .... .... ".repeat(2) + ". |", header = "[A] bars 2"))
        assertEquals(listOf("3 error: A7 bar 1 has 1 step, needs 8."), one("A7 | X |", header = "[A] step 1/8"))
        assertEquals(listOf("3 error: A7 bar 1 has 20 steps, needs 24."), one("A7 | " + ".".repeat(20) + " |", header = "[A] step 1/16T"))
        assertEquals(listOf("3 error: A7 bar 1 has 'z', which isn't one of X x o 1-9 - or ."), one("A7 | X... .... .... ...z |"))
        assertEquals(listOf("3 error: A7 bar 2 has '0', which isn't one of X x o 1-9 - or ."), one("A7 | X... .... .... .... | 0... .... .... .... |", header = "[A] bars 2"))
        assertEquals(listOf("3 error: A7 bar 1 has 'O', which isn't one of X x o 1-9 - or ."), one("A7 | O... .... .... .... |"))
        assertEquals(listOf("3 error: A7 bar 1 has a - with no hit before it."), one("A7 | -... .... .... .... |"))
        assertEquals(listOf("3 error: A7 bar 1 has a - with no hit before it."), one("A7 | X.-. .... .... .... |"))
        assertEquals(listOf("3 error: B7 is in group B, but the section is [A]."), one("B7 | X... .... .... .... |"))
        assertEquals(listOf("3 error: 'Q7' isn't a pad. Use A to D, then . 0 E or 1 to 9."), one("Q7 | X... .... .... .... |"))
        assertEquals(listOf("3 error: 'A10' isn't a pad. Use A to D, then . 0 E or 1 to 9."), one("A10 | X... .... .... .... |"))
        assertEquals(listOf("3 error: A row needs a pad before its first |."), one("| X... .... .... .... |"))
        assertEquals(listOf("3 error: A7 needs a | before its steps."), one("A7 X... .... .... ...."))
        // Words that aren't rows only warn.
        assertEquals(listOf("3 warning: Unknown word 'groove', ignored."), one("groove 3"))
        // Each fault is its own line; the card is not read.
        val many = BeatCards.read(text("ARC BEAT 1", "[A]", "A7 | X |", "A8 | X... .... .... .... |", "A9 | z |"))
        assertNull(many.card)
        assertEquals(listOf(3, 5), many.problems.map { it.line })
        assertTrue(many.problems.all { it.error })
    }

    @Test
    fun `swing bends the odd steps of 1_8 and 1_16 rows only`() {
        fun ticks(header: String, swing: Int, row: String) =
            read("ARC BEAT 1", "swing $swing", header, "A7 | $row |").card!!.sections[0].pattern.notes.map { it.tick }
        assertEquals(listOf(0, 24, 48, 72), ticks("[A]", 50, "XXXX .... .... ...."))
        assertEquals(listOf(0, 28, 48, 76), ticks("[A]", 58, "XXXX .... .... ...."))
        assertEquals(listOf(0, 36, 48, 84), ticks("[A]", 75, "XXXX .... .... ...."))
        assertEquals(listOf(0, 63, 96, 159), ticks("[A] step 1/8", 66, "XXXX ...."))
        assertEquals(listOf(0, 72, 96, 168), ticks("[A] step 1/8", 75, "XXXX ...."))
        // Triplets and 32nds stay straight.
        assertEquals(listOf(0, 32, 64, 96), ticks("[A] step 1/8T", 75, "XXXX .... ...."))
        assertEquals(listOf(0, 16, 32, 48), ticks("[A] step 1/16T", 75, "XXXX " + "....".repeat(5)))
        assertEquals(listOf(0, 12, 24, 36), ticks("[A] step 1/32", 75, "XXXX " + "....".repeat(7)))
        // The notes list never swings; a hold keeps its length.
        val r = read("ARC BEAT 1", "swing 75", "[A]", "A7 | .X-. .... .... .... |", "notes", "A9 at 1.1.2", "A9 t 24 vel 50")
        assertEquals(listOf("7 warning: A9 has two hits at 1.1.2, kept the louder."), problems(r))
        assertEquals(setOf(key(hit(36, 9, gate = 48)), key(hit(24, 11))), keys(section(r).pattern))
    }

    @Test
    fun `the notes list`() {
        val r = read(
            "ARC BEAT 1", "[A] bars 2", "notes",
            "A9 at 1.1.1", "A9 at 1.2.3+8", "A9 at 1.1.2-3", "A9 at 2.1.1", "A9 t 100 vel 64 gate 10",
            "A1 at 1.1.1 note C4", "A1 at 1.1.2 note C-1", "A1 at 1.1.3 note G9", "A1 at 1.1.4 note C#3",
            "AE at 1.2.1 semi -127", "AE at 1.2.2 semi 127", "AE at 1.2.3 semi +3", "A. at 1.2.4 SEMI 0",
        )
        assertEquals(emptyList<String>(), problems(r))
        val want = setOf(
            hit(0, 11), hit(152, 11), hit(21, 11), hit(384, 11), hit(100, 11, gate = 10, vel = 64),
            hit(0, 3, semi = 0), hit(24, 3, semi = -60), hit(48, 3, semi = 67), hit(72, 3, semi = -11),
            hit(96, 2, semi = -127), hit(120, 2, semi = 127), hit(144, 2, semi = 3), hit(168, 0, semi = 0),
        ).map(::key).toSet()
        assertEquals(want, keys(section(r).pattern))
        // Defaults are vel 127, a 1/16 gate and a pad hit; every gate word.
        val gates = read("ARC BEAT 1", "[A]", "notes", "A9 t 0", "A9 t 1 gate 1/4", "A9 t 2 gate 1/8", "A9 t 3 gate 1/16", "A9 t 4 gate 1/32", "A9 t 5 gate 1/8T", "A9 t 6 gate 1/16T", "A9 t 7 gate 1/8t", "A9 t 8 gate 1")
        assertEquals(listOf(24, 96, 48, 24, 12, 32, 16, 32, 1), section(gates).pattern.notes.map { it.gate })
        assertTrue(section(gates).pattern.notes.all { it.velocity == 127 && it.semitones == null })
        // KEYS notes of one pad at one tick are different notes; the same pitch is one.
        val chord = read("ARC BEAT 1", "[A]", "notes", "A9 t 0 note C4", "A9 t 0 note E4", "A9 t 0", "A9 t 0 note C4 vel 50")
        assertEquals(listOf("7 warning: A9 has two hits at 1.1.1, kept the louder."), problems(chord))
        assertEquals(setOf(key(hit(0, 11, semi = 0)), key(hit(0, 11, semi = 4)), key(hit(0, 11))), keys(section(chord).pattern))
        // Options come in any order.
        val order = read("ARC BEAT 1", "[A]", "notes", "A9 gate 1/8 note D4 vel 20 at 1.1.1")
        assertEquals(setOf(key(hit(0, 11, 48, 2, 20))), keys(section(order).pattern))
    }

    @Test
    fun `notes list errors`() {
        fun one(vararg lines: String, header: String = "[A]") = problems(BeatCards.read(text("ARC BEAT 1", header, "notes", *lines)))
        val at = "at needs bar.beat.sixteenth, with beat and sixteenth 1 to 4, as in 1.2.3 or 1.2.3+6."
        assertEquals(listOf("4 error: A9 note needs at or t to place it."), one("A9 vel 50"))
        assertEquals(listOf("4 error: A9 note at tick 384 is outside the pattern (0 to 383)."), one("A9 t 384"))
        assertEquals(listOf("4 error: A9 note at tick 384 is outside the pattern (0 to 383)."), one("A9 at 2.1.1"))
        assertEquals(listOf("4 error: A9 note at tick -1 is outside the pattern (0 to 383)."), one("A9 at 1.1.1-1"))
        assertEquals(listOf("4 error: A9 note at tick 768 is outside the pattern (0 to 767)."), one("A9 at 2.4.4+24", header = "[A] bars 2"))
        for (bad in listOf("1.5.1", "1.1.5", "0.1.1", "1.0.1", "1.1", "1.1.1.1", "x", "1.1.1+", "1.1.1+x")) assertEquals(listOf("4 error: A9 note: $at"), one("A9 at $bad"), bad)
        for (bad in listOf("x", "-1", "1.5")) assertEquals(listOf("4 error: A9 note: t needs a whole tick number."), one("A9 t $bad"), bad)
        for (bad in listOf("0", "128", "x", "-5")) assertEquals(listOf("4 error: A9 note: vel must be 1 to 127."), one("A9 t 0 vel $bad"), bad)
        for (bad in listOf("0", "1/3", "x", "-5")) assertEquals(listOf("4 error: A9 note: gate must be a tick count or one of 1/4 1/8 1/16 1/32 1/8T 1/16T."), one("A9 t 0 gate $bad"), bad)
        for (bad in listOf("H4", "G#9", "C", "C10", "Db4", "c4", "60")) assertEquals(listOf("4 error: A9 note: note must be a name from C-1 to G9, such as C4."), one("A9 t 0 note $bad"), bad)
        for (bad in listOf("128", "-128", "x")) assertEquals(listOf("4 error: A9 note: semi must be -127 to 127."), one("A9 t 0 semi $bad"), bad)
        assertEquals(listOf("4 error: A9 note has both at and t."), one("A9 at 1.1.1 t 0"))
        assertEquals(listOf("4 error: A9 note has both note and semi."), one("A9 t 0 note C4 semi 1"))
        assertEquals(listOf("4 error: A9 note has both note and semi."), one("A9 t 0 semi 1 note C4"))
        assertEquals(listOf("4 error: A9 note: at needs a value."), one("A9 at"))
        assertEquals(listOf("4 error: B9 is in group B, but the section is [A]."), one("B9 t 0"))
        assertEquals(listOf("4 error: 'Z9' isn't a pad. Use A to D, then . 0 E or 1 to 9."), one("Z9 t 0"))
        // A word that isn't an option warns, and so does the value after it.
        val warn = BeatCards.read(text("ARC BEAT 1", "[A]", "notes", "A9 t 0 colour red vel 50 loud"))
        assertEquals(listOf("4 warning: Unknown option 'colour' on A9 note, ignored.", "4 warning: Unknown option 'loud' on A9 note, ignored."), problems(warn))
        assertEquals(setOf(key(hit(0, 11, vel = 50))), keys(warn.card!!.sections[0].pattern))
        // Rows can't follow the notes list: what is in it is a note.
        val row = BeatCards.read(text("ARC BEAT 1", "[A]", "notes", "A9 | X... .... .... .... |"))
        assertNull(row.card)
        assertTrue("4 error: A9 note needs at or t to place it." in problems(row))
        // The next section ends the list.
        val next = read("ARC BEAT 1", "[A]", "notes", "A9 t 0", "[B]", "B7 | X... .... .... .... |")
        assertEquals(emptyList<String>(), problems(next))
        assertEquals(listOf(1, 1), next.card!!.sections.map { it.pattern.notes.size })
    }

    @Test
    fun `at most 2048 notes in a pattern`() {
        val steps = 99 * 32
        fun card(hits: Int) = BeatCards.read(text("ARC BEAT 1", "[A] bars 99 step 1/32", "A7 | " + "x".repeat(hits) + ".".repeat(steps - hits) + " |"))
        assertEquals(emptyList<String>(), problems(card(2048)))
        assertEquals(2048, card(2048).card!!.sections[0].pattern.notes.size)
        val over = card(2049)
        assertEquals(listOf("2 error: Group A has 2049 notes, the most is 2048."), problems(over))
        assertNull(over.card)
        // Notes folded into one don't count twice.
        val folded = read("ARC BEAT 1", "[A]", "notes", *Array(3000) { "A9 t 5" })
        assertEquals(2999, folded.problems.size)
        assertTrue(folded.problems.none { it.error })
        assertEquals(1, section(folded).pattern.notes.size)
    }

    // ---- writing ----

    @Test
    fun `the header, the sections in order, and the name`() {
        val c = BeatCard("  Lazy # boom |bap  ", 92.5, 66, listOf(a(hit(0, 9), group = 2), a(hit(0, 9), group = 0, number = 2)))
        val want = text(
            "ARC BEAT 1", "name Lazy boom bap", "tempo 92.5", "swing 66", "",
            "[A02] bars 1 step 1/16", "A7 | X... .... .... .... |", "",
            "[C] bars 1 step 1/16", "C7 | X... .... .... .... |",
        ) + "\n"
        assertEquals(want, BeatCards.write(c))
        assertEquals(BeatCards.write(c), BeatCards.write(c.copy(sections = c.sections.reversed())))
        // Tempo is whole or one decimal; the name keeps to 40 characters; no title, no tempo, no line.
        assertTrue(BeatCards.write(c.copy(tempo = 90.0)).contains("\ntempo 90\n"))
        assertTrue(BeatCards.write(c.copy(tempo = 92.04)).contains("\ntempo 92\n"))
        assertTrue(BeatCards.write(c.copy(tempo = 92.06)).contains("\ntempo 92.1\n"))
        assertTrue(BeatCards.write(c.copy(name = "y".repeat(50))).contains("\nname ${"y".repeat(40)}\n"))
        val smile = "\uD83D\uDE00"
        assertTrue(BeatCards.write(c.copy(name = "a" + smile.repeat(50))).contains("\nname a${smile.repeat(39)}\n"))
        val plain = BeatCards.write(c.copy(name = null, tempo = null, swing = 50))
        assertTrue(plain.startsWith("ARC BEAT 1\nswing 50\n\n[A02]"))
        assertFalse(BeatCards.write(c.copy(name = " # | ")).contains("name"))
    }

    @Test
    fun `a pattern is written on the first of 1_16, 1_16T and 1_32 that fits its hits`() {
        // Triplets.
        val triplets = a(hit(0, 9, 16), hit(16, 9, 16, vel = 100), hit(32, 9, 16, vel = 64))
        assertEquals(
            text("[A] bars 1 step 1/16T", "A7 | Xxo. .... .... .... .... .... |"),
            BeatCards.write(card(triplets)).substringAfter("\n\n").trimEnd(),
        )
        // 32nds.
        assertEquals(
            text("[A] bars 1 step 1/32", "A7 | XX.. .... .... .... .... .... .... .... |"),
            BeatCards.write(card(a(hit(0, 9, 12), hit(12, 9, 12)))).substringAfter("\n\n").trimEnd(),
        )
        // Straight hits stay on 1/16 though they would fit 1/32.
        assertTrue(BeatCards.write(card(a(hit(0, 9), hit(48, 9)))).contains("step 1/16\n"))
        // KEYS notes and hits past the end don't choose the step.
        assertTrue(BeatCards.write(card(a(hit(0, 9), hit(5, 3, semi = 0), hit(400, 9)))).contains("step 1/16\n"))
        // None fits: 1/16, and the hit that doesn't fit goes to the notes list.
        assertEquals(text("[A] bars 1 step 1/16", "A7 | X... .... .... .... |", "notes", "A7 at 1.1.1+5"), BeatCards.write(card(a(hit(0, 9), hit(5, 9)))).substringAfter("\n\n").trimEnd())
        assertEquals(text("[A] bars 1 step 1/16", "notes", "A7 at 1.1.1+5"), BeatCards.write(card(a(hit(5, 9)))).substringAfter("\n\n").trimEnd())
    }

    @Test
    fun `rows go in keypad order, in groups of 4 with a bar between bars, after the sound's name`() {
        val c = card(a(*Array(12) { hit(0, it) }))
        val labels = BeatCards.write(c).lines().filter { it.startsWith("A") && " | " in it }.map { it.substringBefore(" ") }
        assertEquals(listOf("A7", "A8", "A9", "A4", "A5", "A6", "A1", "A2", "A3", "A.", "A0", "AE"), labels)
        val names = mapOf(PhysicalPad(0, 9) to "kick", PhysicalPad(0, 11) to "a|b # c")
        val two = card(a(hit(0, 9), hit(384 + 72, 9), hit(96, 11), hit(0, 6), bars = 2, number = 3))
        val want = text(
            "[A03] bars 2 step 1/16",
            "A7 kick      | X... .... .... .... | ...X .... .... .... |",
            "A9 a b c     | .... X... .... .... | .... .... .... .... |",
            "A4" + " ".repeat(11) + "| X... .... .... .... | .... .... .... .... |",
        )
        assertEquals(want, BeatCards.write(two, names = { names[it] }).substringAfter("\n\n").trimEnd())
        // A long name widens the column; no names, no column.
        val long = BeatCards.write(card(a(hit(0, 9))), names = { "twelve sound" }).lines().first { it.startsWith("A7") }
        assertEquals("A7 twelve sound | X... .... .... .... |", long)
        assertEquals("A7 | X... .... .... .... |", BeatCards.write(card(a(hit(0, 9)))).lines().first { it.startsWith("A7") })
        // Another group's pads are asked for by their own group.
        val b = BeatCards.write(card(a(hit(0, 9), group = 1)), names = { if (it == PhysicalPad(1, 9)) "bass" else "wrong" }).lines().first { it.startsWith("B7") }
        assertEquals("B7 bass      | X... .... .... .... |", b)
    }

    @Test
    fun `velocities and holds are written as characters, the rest goes to the notes list`() {
        val c = card(
            a(
                hit(0, 6), hit(48, 6, 72, vel = 100), hit(144, 6, vel = 64),
                hit(96, 11, 60), hit(240, 11, vel = 42), hit(366, 11, vel = 50),
                hit(23, 6),
                hit(0, 3, 72), hit(48, 3), hit(0, 3, 48, semi = 0),
                hit(0, 0, semi = 67), hit(24, 0, semi = 68), hit(48, 0, semi = -100),
            ),
        )
        val want = text(
            "[A] bars 1 step 1/16",
            "A9 | .... .... ..3. .... |",
            "A4 | X.x- -.o. .... .... |",
            "A1 | ..X. .... .... .... |",
            "notes",
            "A9 at 1.2.1 gate 60",
            "A9 at 1.4.4+6 vel 50",
            "A4 at 1.1.2-1",
            "A1 at 1.1.1 gate 72",
            "A1 at 1.1.1 note C4 gate 1/8",
            "A. at 1.1.1 note G9",
            "A. at 1.1.2 semi 68",
            "A. at 1.1.3 semi -100",
        )
        assertEquals(want, BeatCards.write(c).substringAfter("\n\n").trimEnd())
        // Every velocity character and its value.
        val vels = listOf(127 to "X", 100 to "x", 64 to "o", 14 to "1", 28 to "2", 42 to "3", 56 to "4", 70 to "5", 84 to "6", 98 to "7", 112 to "8", 126 to "9")
        val row = BeatCards.write(card(a(*vels.mapIndexed { i, (v, _) -> hit(i * 24, 9, vel = v) }.toTypedArray()))).lines().first { it.startsWith("A7") }
        assertEquals("A7 | " + vels.joinToString("") { it.second }.chunked(4).joinToString(" ") + " .... |", row)
        // A hold that stops at the next hit fits; one into it doesn't; one past the end doesn't.
        assertTrue(BeatCards.write(card(a(hit(0, 9, 48), hit(48, 9)))).contains("A7 | X-X. "))
        assertTrue(BeatCards.write(card(a(hit(0, 9, 72), hit(48, 9)))).contains("\nnotes\nA7 at 1.1.1 gate 72\n"))
        assertTrue(BeatCards.write(card(a(hit(360, 9, 48)))).contains("\nnotes\nA7 at 1.4.4 gate 1/8\n"))
        // Two hits on one pad and tick are one, the louder, as reading has it; notes past the end are left out.
        val dup = BeatCards.write(card(a(hit(0, 9, vel = 100), hit(0, 9), hit(400, 9), hit(384, 3, semi = 0))))
        assertEquals(text("[A] bars 1 step 1/16", "A7 | X... .... .... .... |"), dup.substringAfter("\n\n").trimEnd())
        // Gates that are a listed value are written as it.
        val gates = listOf(96, 48, 12, 32, 16, 100)
        val written = BeatCards.write(card(a(*gates.mapIndexed { i, g -> hit(i * 30, 3, g, semi = 0) }.toTypedArray())))
        val gateLines = text(
            "A1 at 1.1.1 note C4 gate 1/4",
            "A1 at 1.1.2+6 note C4 gate 1/8",
            "A1 at 1.1.3+12 note C4 gate 1/32",
            "A1 at 1.2.1-6 note C4 gate 1/8T",
            "A1 at 1.2.2 note C4 gate 1/16T",
            "A1 at 1.2.3+6 note C4 gate 100",
        )
        assertEquals(text("[A] bars 1 step 1/16", "notes", gateLines), written.substringAfter("\n\n").trimEnd())
    }

    @Test
    fun `rows use the swing of the card`() {
        val p = a(hit(0, 9), hit(28, 9))
        assertEquals(text("[A] bars 1 step 1/16", "A7 | XX.. .... .... .... |"), BeatCards.write(card(p, swing = 58)).substringAfter("\n\n").trimEnd())
        assertEquals(text("[A] bars 1 step 1/16", "A7 | X... .... .... .... |", "notes", "A7 at 1.1.2+4"), BeatCards.write(card(p, swing = 50)).substringAfter("\n\n").trimEnd())
        assertTrue(BeatCards.write(card(p, swing = 58)).startsWith("ARC BEAT 1\nswing 58\n"))
        // Swing is held to 50..75 when written.
        assertTrue(BeatCards.write(card(p, swing = 99)).startsWith("ARC BEAT 1\nswing 75\n"))
        // Triplets are not swung: the card's swing doesn't move them.
        val triplets = a(hit(0, 9, 16), hit(16, 9, 16))
        assertEquals(text("[A] bars 1 step 1/16T", "A7 | XX.. .... .... .... .... .... |"), BeatCards.write(card(triplets, swing = 70)).substringAfter("\n\n").trimEnd())
    }

    @Test
    fun `tidy rounds velocities and short gates, and says so`() {
        val p = a(hit(0, 9, 10, vel = 90), hit(24, 9, vel = 113), hit(48, 9, vel = 114), hit(72, 9, vel = 81), hit(96, 9, 30, vel = 82))
        val raw = BeatCards.write(card(p))
        assertFalse(raw.contains("tidied"))
        assertEquals(
            text(
                "[A] bars 1 step 1/16", "notes",
                "A7 at 1.1.1 vel 90 gate 10", "A7 at 1.1.2 vel 113", "A7 at 1.1.3 vel 114", "A7 at 1.1.4 vel 81", "A7 at 1.2.1 vel 82 gate 30",
            ),
            raw.substringAfter("\n\n").trimEnd(),
        )
        val tidy = BeatCards.write(card(p), tidy = true)
        assertEquals(
            text(
                "ARC BEAT 1", "swing 50", "# tidied: velocities and short gates rounded", "",
                "[A] bars 1 step 1/16", "A7 | xxXo .... .... .... |", "notes", "A7 at 1.2.1 vel 100 gate 30",
            ) + "\n",
            tidy,
        )
        // The comment is a comment: the tidied card reads back as the tidied pattern.
        val back = BeatCards.read(tidy)
        assertEquals(emptyList<String>(), problems(back))
        assertEquals(setOf(hit(0, 9, vel = 100), hit(24, 9, vel = 100), hit(48, 9), hit(72, 9, vel = 64), hit(96, 9, 30, vel = 100)).map(::key).toSet(), keys(section(back).pattern))
        // KEYS notes are rounded too.
        val keysCard = BeatCards.write(card(a(hit(0, 3, 5, semi = 0, vel = 70))), tidy = true)
        assertTrue(keysCard.endsWith("\nnotes\nA1 at 1.1.1 vel 64 note C4\n"))
    }

    // ---- round trips ----

    private fun rich(): BeatCard {
        val a = CardSection(
            0, 4,
            Pattern(
                2,
                listOf(
                    hit(0, 9), hit(28, 9, vel = 100), hit(48, 9, 72, vel = 64), hit(384 + 96, 11), hit(366, 11, vel = 50), hit(456, 11), hit(23, 6, 12),
                    hit(0, 3, 48, semi = 0), hit(96, 3, 24, semi = 7, vel = 90), hit(96, 3, 24, semi = 4, vel = 90), hit(200, 1, 100, semi = -100),
                    hit(500, 4, 96), hit(520, 4, 32), hit(760, 5, 16, vel = 14),
                ),
            ),
        )
        val c = CardSection(2, null, Pattern(1, listOf(hit(0, 9, 16), hit(16, 9, 16, vel = 100), hit(32, 9, 16, vel = 64), hit(48, 6, 16, semi = 12))))
        val d = CardSection(3, 99, Pattern(1, listOf(hit(0, 0, 12), hit(12, 0, 12), hit(36, 0, 12, vel = 42), hit(60, 2))))
        return BeatCard("Rich beat", 87.5, 58, listOf(a, c, d))
    }

    @Test
    fun `a card Arc wrote reads back to the same patterns and writes out as the same text`() {
        val names = mapOf(PhysicalPad(0, 9) to "kick", PhysicalPad(2, 9) to "tom", PhysicalPad(3, 0) to "shaker")
        for (c in listOf(rich(), BeatCards.read(example).card!!, BeatCard(null, null, 50, listOf(a(hit(0, 9)))))) {
            val text = BeatCards.write(c, names = { names[it] })
            val back = BeatCards.read(text)
            assertEquals(emptyList<String>(), problems(back), text)
            val b = back.card!!
            assertEquals(c.name, b.name)
            assertEquals(c.tempo, b.tempo)
            assertEquals(c.swing, b.swing)
            assertEquals(c.sections.map { it.group to it.number }, b.sections.map { it.group to it.number })
            for ((x, y) in c.sections.sortedBy { it.group }.zip(b.sections)) {
                assertEquals(x.pattern.bars, y.pattern.bars)
                assertEquals(keys(x.pattern), keys(y.pattern), text)
                assertEquals(x.pattern.notes.size, y.pattern.notes.size)
            }
            assertEquals(text, BeatCards.write(b, names = { names[it] }))
        }
        // Reading puts the notes in tick order, with no ids.
        val order = BeatCards.read(BeatCards.write(rich())).card!!.sections[0].pattern.notes
        assertEquals(order.sortedBy { it.tick }.map { it.tick }, order.map { it.tick })
        assertTrue(order.all { it.id == 0 })
        // Everything in the rich card that has to leave the rows did.
        val text = BeatCards.write(rich())
        assertTrue(text.contains("notes\n"))
        assertTrue(text.contains("[A04] bars 2 step 1/16"))
        assertTrue(text.contains("[C] bars 1 step 1/16T"))
        assertTrue(text.contains("[D99] bars 1 step 1/32"))
    }

    @Test
    fun `a card of every pattern shape round trips`() {
        // A bar of each step, with holds, accents, ghosts and odd steps; at several swings.
        for (swing in listOf(50, 54, 58, 66, 75)) for (bars in listOf(1, 2, 3)) {
            val notes = ArrayList<PatternNote>()
            for (k in 0 until bars * 16) {
                val tick = Steps.tickOf(k, Timing.SIXTEENTH, swing)
                if (k % 3 == 0) notes += hit(tick, k % 12, 24 * (1 + k % 2), vel = listOf(127, 100, 64, 14 * (1 + k % 9))[k % 4])
                if (k % 5 == 0) notes += hit(tick + 3, (k + 4) % 12, 24, semi = k % 13 - 6)
            }
            val c = BeatCard(null, null, swing, listOf(CardSection(1, null, Pattern(bars, notes))))
            val text = BeatCards.write(c)
            val back = BeatCards.read(text)
            assertEquals(emptyList<String>(), problems(back), text)
            assertEquals(keys(c.sections[0].pattern), keys(back.card!!.sections[0].pattern), text)
            assertEquals(text, BeatCards.write(back.card!!))
        }
    }

    // ---- from patterns ----

    @Test
    fun `the swing of an export is the timing swing only when the hits fit that grid`() {
        val swung = a(hit(0, 9), hit(28, 9), hit(48, 9, vel = 100), hit(76, 11))
        assertEquals(58, BeatCards.fromPatterns("n", 90.0, 58, listOf(swung)).swing)
        assertEquals(50, BeatCards.fromPatterns("n", 90.0, 50, listOf(swung)).swing)
        // Hits on the straight odd steps, on triplets or between steps do not fit a swung grid.
        assertEquals(50, BeatCards.fromPatterns(null, null, 58, listOf(a(hit(0, 9), hit(24, 9)))).swing)
        assertEquals(50, BeatCards.fromPatterns(null, null, 58, listOf(a(hit(0, 9, 16), hit(16, 9, 16)))).swing)
        assertEquals(50, BeatCards.fromPatterns(null, null, 58, listOf(a(hit(5, 9)))).swing)
        // Hits on the even steps fit every swing; KEYS notes, hits past the end and empty patterns don't count.
        assertEquals(66, BeatCards.fromPatterns(null, null, 66, listOf(a(hit(0, 9), hit(48, 9), hit(5, 3, semi = 0), hit(400, 9)))).swing)
        assertEquals(66, BeatCards.fromPatterns(null, null, 66, listOf(a())).swing)
        // Every section has to fit.
        assertEquals(50, BeatCards.fromPatterns(null, null, 58, listOf(swung, a(hit(24, 9), group = 1))).swing)
        assertEquals(58, BeatCards.fromPatterns(null, null, 58, listOf(swung, a(hit(0, 9), group = 1))).swing)
        // The swing is held to 50..75.
        assertEquals(75, BeatCards.fromPatterns(null, null, 99, listOf(a(hit(0, 9)))).swing)
        assertEquals(50, BeatCards.fromPatterns(null, null, 10, listOf(a(hit(0, 9)))).swing)
        // The card written from it reads back to the same pattern.
        val c = BeatCards.fromPatterns("n", 90.0, 58, listOf(swung))
        assertEquals(keys(swung.pattern), keys(BeatCards.read(BeatCards.write(c)).card!!.sections[0].pattern))
    }

    @Test
    fun `an export holds the sections with notes, in group order`() {
        val sections = listOf(a(hit(0, 9), group = 3), a(group = 1), a(hit(0, 9), group = 0, number = 2), a(bars = 4, group = 2))
        val c = BeatCards.fromPatterns("Scene", 100.0, 50, sections)
        assertEquals(listOf(0, 3), c.sections.map { it.group })
        assertEquals("Scene", c.name)
        assertEquals(100.0, c.tempo)
        // A pattern with no notes alone is kept, as written (a card needs a section).
        val blank = BeatCards.fromPatterns(null, null, 50, listOf(a(bars = 2, group = 2)))
        assertEquals(listOf(2), blank.sections.map { it.group })
        assertEquals(blank, BeatCards.read(BeatCards.write(blank)).card)
    }

    // ---- sounds ----

    @Test
    fun `sound lines give a pad its slot and name, anywhere in the section`() {
        val r = read(
            "ARC BEAT 1", "[A]",
            "sound A7 12 Kick 808",
            "sound A9 140",
            "SOUND AENTER 7   Open   hat  # soft",
            "Sound A. 999 Last.wav",
            "sound A1 5 Kick#2",
            bar,
        )
        assertEquals(emptyList<String>(), problems(r))
        assertEquals(mapOf(9 to snd(12, "Kick 808"), 11 to snd(140), 2 to snd(7, "Open hat"), 0 to snd(999, "Last.wav"), 3 to snd(5, "Kick 2")), section(r).sounds)
        // Before or after the rows, and after notes, where the lines that follow are still notes.
        val after = read(
            "ARC BEAT 1", "[A]", "sound A7 12 Kick", bar, "notes", "A9 at 1.1.1", "sound A9 140 Snare", "A5 at 1.2.1",
            "[B]", "B7 | X... .... .... .... |", "sound B7 3",
        )
        assertEquals(emptyList<String>(), problems(after))
        assertEquals(mapOf(9 to snd(12, "Kick"), 11 to snd(140, "Snare")), section(after).sounds)
        assertEquals(3, section(after).pattern.notes.size)
        assertEquals(mapOf(9 to snd(3)), section(after, 1).sounds)
        // A pad with no notes can have a sound; a section with no sound lines has none.
        assertEquals(mapOf(3 to snd(8)), section(read("ARC BEAT 1", "[A]", "sound A1 8", bar)).sounds)
        assertEquals(emptyMap<Int, CardSound>(), section(read("ARC BEAT 1", "[A]", bar)).sounds)
        assertEquals(mapOf(3 to snd(8)), section(read("ARC BEAT 1", "[A]", "sound A1 8")).sounds)
        // The slots run 1 to 999.
        assertEquals(mapOf(9 to snd(1)), section(read("ARC BEAT 1", "[A]", "sound A7 001")).sounds)
    }

    @Test
    fun `sound line errors and warnings name the line`() {
        val errors = listOf(
            "sound B7 12" to "3 error: B7 is in group B, but the section is [A].",
            "sound A7 0" to "3 error: A7 sound: the slot must be a whole number from 1 to 999.",
            "sound A7 1000" to "3 error: A7 sound: the slot must be a whole number from 1 to 999.",
            "sound A7 -1" to "3 error: A7 sound: the slot must be a whole number from 1 to 999.",
            "sound A7 12.5" to "3 error: A7 sound: the slot must be a whole number from 1 to 999.",
            "sound A7 kick" to "3 error: A7 sound: the slot must be a whole number from 1 to 999.",
            "sound A7" to "3 error: A7 sound: the slot must be a whole number from 1 to 999.",
            "sound kick 12" to "3 error: 'kick' isn't a pad. Use A to D, then . 0 E or 1 to 9.",
            "sound a7 12" to "3 error: 'a7' isn't a pad. Use A to D, then . 0 E or 1 to 9.",
            "sound" to "3 error: A sound line needs a pad and a slot, as in sound A7 12 Kick.",
        )
        for ((line, message) in errors) {
            val r = read("ARC BEAT 1", "[A]", line, bar)
            assertEquals(listOf(message), problems(r), line)
            assertNull(r.card, line)
        }
        // After notes the line is still a sound line; before any section it has no place.
        assertEquals(listOf("5 error: B7 is in group B, but the section is [A]."), problems(read("ARC BEAT 1", "[A]", bar, "notes", "sound B7 12")))
        assertEquals(listOf("2 error: 'sound' needs a section first, such as [A]."), problems(read("ARC BEAT 1", "sound A7 12", "[A]", bar)))
        // A second line for a pad replaces the first, nameless or not.
        val twice = read("ARC BEAT 1", "[A]", "sound A7 12 Kick", bar, "sound A8 3", "sound A7 14")
        assertEquals(listOf("6 warning: A7 has two sound lines, kept the later."), problems(twice))
        assertEquals(mapOf(9 to snd(14), 10 to snd(3)), section(twice).sounds)
        // Lines of a skipped section are not read; those of a second section of a group are read for their faults, then dropped.
        assertEquals(listOf("2 error: bars must be a whole number from 1 to 99."), problems(read("ARC BEAT 1", "[A] bars 0", "sound A7 0")))
        val dup = read("ARC BEAT 1", "[A]", bar, "[A]", "sound A7 0")
        assertEquals(listOf("4 error: Group A has two sections.", "5 error: A7 sound: the slot must be a whole number from 1 to 999."), problems(dup))
    }

    @Test
    fun `a section's sound lines are written right after its line, in keypad order`() {
        val s = a(
            hit(0, 9), hit(96, 11),
            sounds = mapOf(0 to snd(5, "Cowbell"), 9 to snd(12, "Kick 808"), 11 to snd(140), 3 to snd(7, "Big  Kick#2"), 4 to snd(300, "  ")),
        )
        val lines = BeatCards.write(card(s), names = { if (it.offset == 9) "kick" else null }).lines()
        assertEquals(
            listOf("[A] bars 1 step 1/16", "sound A7 12 Kick 808", "sound A9 140", "sound A1 7 Big Kick 2", "sound A2 300", "sound A. 5 Cowbell"),
            lines.drop(3).take(6),
        )
        assertTrue(lines[9].startsWith("A7 kick "))
        // Slots a card can't read are left out.
        val bad = BeatCards.write(card(a(hit(0, 9), sounds = mapOf(9 to snd(0, "Kick"), 11 to snd(1000)))))
        assertFalse(bad.contains("sound"))
        // A section with sounds and no notes still writes them.
        assertEquals(listOf("[B] bars 1 step 1/16", "sound B7 9 Kick"), BeatCards.write(card(a(group = 1, sounds = mapOf(9 to snd(9, "Kick"))))).lines().drop(3).take(2))
    }

    @Test
    fun `a card with sounds round trips`() {
        val base = rich()
        val sounds = listOf(
            mapOf(9 to snd(12, "Kick 808"), 3 to snd(7), 4 to snd(200, "Open hat")),
            mapOf(9 to snd(40, "Tom")),
            mapOf(0 to snd(999, "Shaker.wav"), 2 to snd(1)),
        )
        val c = base.copy(sections = base.sections.zip(sounds) { s, m -> s.copy(sounds = m) })
        val text = BeatCards.write(c)
        val back = BeatCards.read(text)
        assertEquals(emptyList<String>(), problems(back), text)
        assertEquals(c.sections.map { it.sounds }, back.card!!.sections.map { it.sounds })
        assertEquals(text, BeatCards.write(back.card!!))
        assertTrue(text.contains("[A04] bars 2 step 1/16\nsound A7 12 Kick 808\nsound A1 7\nsound A2 200 Open hat\n"))
        // The sound list Arc adds after the closing fence is not part of the card.
        val shared = "Check this:\n\n```\n" + text + "```\n" + BeatCards.soundList(ClaudeText.SOUNDS_FROM_DEVICE, mapOf(12 to "Kick 808", 7 to "Snare"))
        val viaShare = BeatCards.read(shared)
        assertEquals(emptyList<String>(), problems(viaShare))
        assertEquals(back.card, viaShare.card)
    }

    @Test
    fun `an export gives each pad its notes use the sound it plays`() {
        val sections = listOf(a(hit(0, 9), hit(96, 3, semi = 0), group = 0), a(hit(0, 9), group = 1))
        val known = mapOf(PhysicalPad(0, 9) to snd(12, "Kick"), PhysicalPad(0, 3) to snd(30, "Bass"), PhysicalPad(0, 4) to snd(99, "Unused"), PhysicalPad(1, 9) to snd(13))
        val c = BeatCards.fromPatterns("n", null, 50, sections, sounds = { known[it] })
        // KEYS notes count as use; a pad no note uses is left out.
        assertEquals(mapOf(9 to snd(12, "Kick"), 3 to snd(30, "Bass")), c.sections[0].sounds)
        assertEquals(mapOf(9 to snd(13)), c.sections[1].sounds)
        // A pad the lookup doesn't know gets none, and without a lookup there are none.
        assertEquals(mapOf(9 to snd(12, "Kick")), BeatCards.fromPatterns(null, null, 50, sections.take(1), sounds = { known[it]?.takeIf { s -> s.slot == 12 } }).sections[0].sounds)
        assertEquals(listOf(emptyMap<Int, CardSound>(), emptyMap()), BeatCards.fromPatterns(null, null, 50, sections).sections.map { it.sounds })
        // The sounds are on the card written, and read back.
        assertEquals(c.sections.map { it.sounds }, BeatCards.read(BeatCards.write(c)).card!!.sections.map { it.sounds })
    }

    private val library = mapOf(12 to "Kick 808", 14 to "Snare.wav", 20 to "Hat", 30 to "Clap", 31 to " clap.WAV ")

    private fun pick(p: SoundPick) = "${p.pad.groupLetter}${p.pad.label} ${p.status} ${p.slot} ${p.name} ${p.currentSlot}"

    @Test
    fun `sound lines are matched to the user's sounds by slot and name`() {
        val sounds = mapOf(
            9 to snd(12, "kick 808"), // slot holds the name, ignoring case
            10 to snd(14, "SNARE"), // ... and ".wav"
            11 to snd(13, "Hat"), // slot is empty: the name is found in 20
            6 to snd(99, "Clap"), // two slots hold it: the lowest
            7 to snd(77, "clap"), // ... but the pad's own first
            8 to snd(99), // no name and no such slot
            3 to snd(500, "Cymbal"), // nowhere
            4 to snd(20, "Hat"), // already on the pad
            5 to snd(20), // no name, the slot is there
            0 to snd(12, "Snare"), // the slot holds another sound: the name is found in 14
        )
        val current = mapOf(PhysicalPad(0, 9) to 3, PhysicalPad(0, 7) to 31, PhysicalPad(0, 4) to 20, PhysicalPad(0, 3) to 8, PhysicalPad(0, 11) to 20)
        val c = BeatCard(null, null, 50, listOf(a(sounds = sounds), a(group = 1, sounds = mapOf(9 to snd(12)))))
        val picks = BeatCards.resolveSounds(c, library) { current[it] }
        assertEquals(
            listOf(
                "A7 CHANGE 12 Kick 808 3",
                "A8 CHANGE 14 Snare.wav null",
                "A9 SAME 20 Hat 20",
                "A4 FOUND_BY_NAME 30 Clap null",
                "A5 SAME 31  clap.WAV  31",
                "A6 MISSING null null null",
                "A1 MISSING null null 8",
                "A2 SAME 20 Hat 20",
                "A3 CHANGE 20 Hat null",
                "A. FOUND_BY_NAME 14 Snare.wav null",
                "B7 CHANGE 12 Kick 808 null",
            ),
            picks.map(::pick),
        )
        assertEquals(snd(13, "Hat"), picks[2].wanted)
        assertEquals(PhysicalPad(1, 9), picks.last().pad)
        // A pad that plays another sound is a change; one that plays the named sound by another slot is a change to that slot.
        val moved = BeatCards.resolveSounds(BeatCard(null, null, 50, listOf(a(sounds = mapOf(9 to snd(13, "Hat"))))), library) { 12 }
        assertEquals(listOf("A7 FOUND_BY_NAME 20 Hat 12"), moved.map(::pick))
        // A card with no sound lines, or no sounds to choose from.
        assertEquals(emptyList<SoundPick>(), BeatCards.resolveSounds(BeatCard(null, null, 50, listOf(a(hit(0, 9)))), library) { null })
        assertEquals(listOf(SoundStatus.MISSING), BeatCards.resolveSounds(c.copy(sections = listOf(a(sounds = mapOf(9 to snd(12, "Kick"))))), emptyMap()) { null }.map { it.status })
    }

    @Test
    fun `the sound list is a header and a line for each sound in slot order`() {
        val text = BeatCards.soundList(ClaudeText.SOUNDS_FROM_DEVICE, mapOf(20 to "Hat #2", 14 to "Snare.wav", 12 to "Kick  808", 21 to " ", 1000 to "x", 0 to "y"))
        assertEquals("My EP-133's sounds (slot name), from the EP-133:\n12 Kick 808\n14 Snare.wav\n20 Hat 2\n21\n", text)
        assertEquals("My EP-133's sounds (slot name), from the last read:\n", BeatCards.soundList(ClaudeText.SOUNDS_FROM_LAST_READ, emptyMap()))
        assertEquals("My EP-133's sounds (slot name), from the factory pack:\n1 Kick\n", BeatCards.soundList(ClaudeText.SOUNDS_FROM_FACTORY, mapOf(1 to "Kick")))
        // A name read from the list is the one the card writes, so it matches.
        val c = BeatCard(null, null, 50, listOf(a(sounds = mapOf(9 to snd(20, "Hat 2")))))
        assertEquals(listOf(SoundStatus.CHANGE), BeatCards.resolveSounds(c, mapOf(20 to "Hat #2")) { null }.map { it.status })
    }

    @Test
    fun `sound names take the factory pack's name for a slot the device lists unnamed`() {
        val device = mapOf(1 to "001.pcm", 200 to "200.pcm", 201 to " 201.PCM ", 202 to "202.pcm", 203 to "203.pcm", 204 to "Mine", 300 to "300.pcm")
        val factory = mapOf(1 to "KICK 808", 200 to "HH CLOSED", 201 to "HH OPEN", 202 to "202.pcm", 203 to "  ", 204 to "Factory", 999 to "Other")
        assertEquals(
            mapOf(1 to "KICK 808", 200 to "HH CLOSED", 201 to "HH OPEN", 202 to "202.pcm", 203 to "203.pcm", 204 to "Mine", 300 to "300.pcm"),
            BeatCards.soundNames(device, factory),
        )
        // Without the pack the device's names stand.
        assertEquals(device, BeatCards.soundNames(device, null))
        assertEquals(device, BeatCards.soundNames(device, emptyMap()))
    }

    @Test
    fun `a card name that is its own slot's file name counts as no name`() {
        // The skill has Claude copy "200.pcm"; after the factory pack the slot is named, and the line still resolves.
        val available = mapOf(200 to "HH CLOSED")
        val picks = BeatCards.resolveSounds(BeatCard(null, null, 50, listOf(a(sounds = mapOf(9 to snd(200, "200.pcm"))))), available) { null }
        assertEquals(listOf("A7 CHANGE 200 HH CLOSED null false"), picks.map { pick(it) + " " + it.unverified })
    }

    @Test
    fun `an unnamed slot is used by its slot, unverified`() {
        val available = mapOf(200 to "200.pcm", 201 to "201.pcm", 205 to "HH CLOSED", 12 to "Kick")
        val current = mapOf(PhysicalPad(0, 9) to 200, PhysicalPad(0, 10) to 200)
        val sounds = mapOf(
            9 to snd(200, "HH CLOSED"), // the slot is unnamed, but the name is found in 205 first
            10 to snd(200, "SNARE"), // the name is nowhere: the unnamed slot is used, and it is on the pad already
            11 to snd(201, "SNARE"), // ... a change
            6 to snd(201), // no name
            7 to snd(201, "201.pcm"), // the card gave the device's own name
            8 to snd(12, "Snare"), // a named slot with another sound: missing
            5 to snd(202, "HH OPEN"), // no such slot
        )
        val picks = BeatCards.resolveSounds(BeatCard(null, null, 50, listOf(a(sounds = sounds))), available) { current[it] }
        assertEquals(
            listOf(
                "A7 FOUND_BY_NAME 205 HH CLOSED 200 false",
                "A8 SAME 200 200.pcm 200 true",
                "A9 CHANGE 201 201.pcm null true",
                "A4 CHANGE 201 201.pcm null true",
                "A5 CHANGE 201 201.pcm null true",
                "A6 MISSING null null null false",
                "A3 MISSING null null null false",
            ),
            picks.map { pick(it) + " " + it.unverified },
        )
        // Named sounds are never unverified.
        val named = BeatCards.resolveSounds(BeatCard(null, null, 50, listOf(a(sounds = mapOf(9 to snd(12, "Kick"))))), available) { null }
        assertEquals(listOf(false), named.map { it.unverified })
    }

    @Test
    fun `the sound list notes the factory sounds without names, when it lists one`() {
        val note = "Names like 200.pcm are factory sounds the EP-133 keeps without a name. By slot: kicks 1-99, snares 100-199, hats 200-299, percussion 300-399, bass 400-499, melodic 500-599."
        assertEquals(note, ClaudeText.UNNAMED_SOUNDS_NOTE)
        val text = BeatCards.soundList(ClaudeText.SOUNDS_FROM_DEVICE, mapOf(200 to "200.pcm", 12 to "Kick", 343 to "HH"))
        assertEquals("My EP-133's sounds (slot name), from the EP-133:\n$note\n12 Kick\n200 200.pcm\n343 HH\n", text)
        // A name that is another slot's file name is a name; none unnamed: no note.
        assertFalse(BeatCards.soundList(ClaudeText.SOUNDS_FROM_DEVICE, mapOf(200 to "201.pcm", 12 to "Kick")).contains("Names like"))
        // The note is not part of a card.
        val shared = "```\n" + BeatCards.write(BeatCard(null, null, 50, listOf(a(hit(0, 9))))) + "```\n" + text
        assertEquals(1, BeatCards.read(shared).card!!.sections.size)
    }

    // ---- import ----

    private val kick = Pattern(1, listOf(hit(0, 9)))

    private fun project(scene: List<Int> = listOf(1, 5, 1, 7)) = ProjectSeq(
        banks = listOf(mapOf(1 to kick, 2 to kick, 3 to kick), emptyMap(), emptyMap(), mapOf(7 to kick)),
        scenes = listOf(Scene(scene)),
    )

    @Test
    fun `a card goes into the next free pattern of each group, and a new scene plays them`() {
        val c = card(a(hit(0, 9), hit(24, 11), bars = 2), a(hit(24, 3), group = 2, number = 5))
        val seq = project()
        val plan = BeatCards.plan(seq, c)
        assertNull(plan.fullGroup)
        assertTrue(plan.newScene)
        // Group A's 2 and 3 have notes: the next free is 4. Group C's bank is empty: 2.
        assertEquals(listOf(0 to 4, 2 to 2), plan.placed)
        assertEquals(keys(c.sections[0].pattern), keys(plan.seq.pattern(0, 4)))
        assertEquals(2, plan.seq.pattern(0, 4).bars)
        assertEquals(keys(c.sections[1].pattern), keys(plan.seq.pattern(2, 2)))
        assertTrue(plan.seq.pattern(0, 4).notes.all { it.id == 0 })
        // Nothing was overwritten.
        for (n in 1..3) assertSame(kick, plan.seq.pattern(0, n))
        assertSame(kick, plan.seq.pattern(3, 7))
        assertEquals(seq.banks[1], plan.seq.banks[1])
        // The new scene is the last, selected; groups the card hasn't keep the scene playing's numbers.
        assertEquals(2, plan.seq.scenes.size)
        assertEquals(1, plan.seq.scene)
        assertEquals(listOf(4, 5, 2, 7), plan.seq.current.patterns)
        assertEquals(Scene(listOf(1, 5, 1, 7)), plan.seq.scenes[0])
        // The card is the same planned from any scene playing.
        assertEquals(listOf(4, 6, 2, 8), BeatCards.plan(project(listOf(1, 6, 1, 8)), c).seq.current.patterns)
    }

    @Test
    fun `one section goes in without a new scene, and the next card goes after it`() {
        val c = card(a(hit(0, 9), group = 2))
        val first = BeatCards.plan(project(), c)
        assertEquals(listOf(2 to 2), first.placed)
        assertFalse(first.newScene)
        assertNull(first.fullGroup)
        assertEquals(project().scenes, first.seq.scenes)
        assertEquals(0, first.seq.scene)
        assertEquals(keys(c.sections[0].pattern), keys(first.seq.pattern(2, 2)))
        val second = BeatCards.plan(first.seq, c)
        assertEquals(listOf(2 to 3), second.placed)
        assertEquals(keys(c.sections[0].pattern), keys(second.seq.pattern(2, 2)))
        assertEquals(keys(c.sections[0].pattern), keys(second.seq.pattern(2, 3)))
        // Counting starts after the pattern selected.
        assertEquals(listOf(0 to 6), BeatCards.plan(project(listOf(5, 1, 1, 1)), card(a(hit(0, 9)))).placed)
        // A card with no section changes nothing.
        val none = BeatCards.plan(project(), BeatCard())
        assertEquals(emptyList<Pair<Int, Int>>(), none.placed)
        assertFalse(none.newScene)
        assertEquals(project(), none.seq)
    }

    @Test
    fun `a group with every pattern used stops the whole card`() {
        val seq = ProjectSeq(banks = listOf(emptyMap(), (1..Seq.MAX_PATTERNS).associateWith { kick }, emptyMap(), emptyMap()))
        val plan = BeatCards.plan(seq, card(a(hit(0, 9)), a(hit(0, 9), group = 1)))
        assertSame(seq, plan.seq)
        assertEquals(emptyList<Pair<Int, Int>>(), plan.placed)
        assertFalse(plan.newScene)
        assertEquals(1, plan.fullGroup)
        // A card without that group goes in.
        val other = BeatCards.plan(seq, card(a(hit(0, 9)), a(hit(0, 9), group = 2)))
        assertNull(other.fullGroup)
        assertEquals(listOf(0 to 2, 2 to 2), other.placed)
        // Patterns with no notes are free, however long.
        val blanks = ProjectSeq(banks = listOf((2..Seq.MAX_PATTERNS).associateWith { kick } + (1 to Pattern(3)), emptyMap(), emptyMap(), emptyMap()))
        assertEquals(listOf(0 to 1), BeatCards.plan(blanks, card(a(hit(0, 9)))).placed)
    }

    @Test
    fun `no new scene past 99 scenes, but the patterns are still placed`() {
        val seq = ProjectSeq(scenes = List(Seq.MAX_SCENES) { Scene() })
        val plan = BeatCards.plan(seq, card(a(hit(0, 9)), a(hit(0, 9), group = 1)))
        assertFalse(plan.newScene)
        assertEquals(listOf(0 to 2, 1 to 2), plan.placed)
        assertEquals(Seq.MAX_SCENES, plan.seq.scenes.size)
        assertEquals(0, plan.seq.scene)
        assertEquals(1, plan.seq.pattern(1, 2).notes.size)
    }

    // ---- effects and pad shaping ----

    private fun pad(group: Int, offset: Int) = PhysicalPad(group, offset)

    private fun fxCard(vararg lines: String, tail: String = bar) = read("ARC BEAT 1", *lines, "[A]", tail)

    @Test
    fun `a card without effect lines has no fx, and an all effect card reads`() {
        assertNull(BeatCards.read(example).card!!.fx)
        val r = fxCard("fx delay 40 55", "send A 20 C 35.5", "comp 40 60", "sidechain A7 BC 25 70")
        assertEquals(emptyList<String>(), problems(r))
        val fx = r.card!!.fx!!
        assertEquals(FxType.DELAY, fx.type)
        assertEquals(0.4f, fx.x)
        assertEquals(0.55f, fx.y)
        assertEquals(mapOf(0 to 0.2f, 2 to 0.355f), fx.sends)
        assertEquals(Comp(true, 0.4f, 0.6f), fx.comp)
        assertEquals(Sidechain(true, 0, 9, 0b0110, 0.25f, 0.7f), fx.sidechain)
    }

    @Test
    fun `effect lines default their knobs, any case, and each kind stands alone`() {
        val fx = fxCard("FX Reverb", "sidechain B. A").card!!.fx!!
        assertEquals(FxType.REVERB, fx.type)
        assertEquals(0.5f, fx.x)
        assertEquals(0.5f, fx.y)
        assertNull(fx.sends)
        assertNull(fx.comp)
        // Length and shape default to 30 and 50; the pad's own group may be in the list.
        assertEquals(Sidechain(true, 1, 0, 0b0001, 0.3f, 0.5f), fx.sidechain)
        assertEquals(CardFx(comp = Comp(false)), fxCard("comp OFF").card!!.fx)
        assertEquals(CardFx(sidechain = Sidechain(on = false)), fxCard("sidechain off").card!!.fx)
        assertEquals(CardFx(sends = mapOf(1 to 1f)), fxCard("send B 100").card!!.fx)
        assertEquals(CardFx(FxType.NONE, 0.5f, 0.5f), fxCard("fx none").card!!.fx)
        // Whole or one decimal, as the knob's percent.
        assertEquals(0.075f, fxCard("fx filter 7.5 0").card!!.fx!!.x)
        assertEquals(0f, fxCard("fx filter 7.5 0").card!!.fx!!.y)
    }

    @Test
    fun `send lines add up, a group given twice keeps the later value`() {
        val r = fxCard("send A 10 B 20", "send B 30 D 40 A 50")
        assertEquals(emptyList<String>(), problems(r))
        assertEquals(mapOf(0 to 0.5f, 1 to 0.3f, 3 to 0.4f), r.card!!.fx!!.sends)
    }

    @Test
    fun `a second fx, comp or sidechain line replaces the first, with a warning`() {
        val r = fxCard("fx delay 10 10", "fx reverb 20 30", "comp 10 10", "comp off", "sidechain A7 B", "sidechain A9 C")
        assertEquals(
            listOf("3 warning: Two fx lines, kept the later.", "5 warning: Two comp lines, kept the later.", "7 warning: Two sidechain lines, kept the later."),
            problems(r),
        )
        val fx = r.card!!.fx!!
        assertEquals(CardFx(FxType.REVERB, 0.2f, 0.3f, null, Comp(false), Sidechain(true, 0, 11, 0b0100, 0.3f, 0.5f)), fx)
    }

    @Test
    fun `effect line mistakes are errors with their line, extra words a warning`() {
        fun one(line: String) = problems(fxCard(line)).single()
        val types = "none, delay, reverb, distortion, chorus, filter or compressor"
        assertEquals("2 error: fx needs an effect: $types.", one("fx"))
        assertEquals("2 error: 'flanger' isn't an effect. Use $types.", one("fx flanger"))
        assertEquals("2 error: fx x must be 0 to 100, whole or with one decimal.", one("fx delay 101"))
        assertEquals("2 error: fx y must be 0 to 100, whole or with one decimal.", one("fx delay 50 -1"))
        assertEquals("2 error: fx x must be 0 to 100, whole or with one decimal.", one("fx delay 5.55"))
        assertEquals("2 error: send needs a group and a value, as in send A 40 B 20.", one("send"))
        assertEquals("2 error: 'E' isn't a group. Use A to D.", one("send E 10"))
        assertEquals("2 error: 'a' isn't a group. Use A to D.", one("send a 10"))
        assertEquals("2 error: send B needs a value, 0 to 100, whole or with one decimal.", one("send A 10 B"))
        assertEquals("2 error: send A must be 0 to 100, whole or with one decimal.", one("send A 101"))
        assertEquals("2 error: comp needs off, or a drive and a speed, as in comp 40 60.", one("comp"))
        assertEquals("2 error: comp drive must be 0 to 100, whole or with one decimal, or use comp off.", one("comp on"))
        assertEquals("2 error: comp needs a speed after the drive, as in comp 40 60.", one("comp 40"))
        assertEquals("2 error: comp speed must be 0 to 100, whole or with one decimal.", one("comp 40 200"))
        assertEquals("2 error: sidechain needs off, or a pad and the groups it ducks, as in sidechain A7 BC.", one("sidechain"))
        assertEquals("2 error: 'A17' isn't a pad. Use A to D, then . 0 E or 1 to 9.", one("sidechain A17 B"))
        assertEquals("2 error: sidechain A7 needs the groups it ducks, as in sidechain A7 BC.", one("sidechain A7"))
        assertEquals("2 error: '25' isn't a list of groups. Use the letters A to D, as in BC.", one("sidechain A7 25"))
        assertEquals("2 error: 'bc' isn't a list of groups. Use the letters A to D, as in BC.", one("sidechain A7 bc"))
        assertEquals("2 error: sidechain length must be 0 to 100, whole or with one decimal.", one("sidechain A7 B 120"))
        assertEquals("2 error: sidechain shape must be 0 to 100, whole or with one decimal.", one("sidechain A7 B 20 x"))
        // A line with a fault sets nothing, and the card isn't read.
        assertNull(fxCard("fx flanger").card)
        // Left-over words are ignored.
        assertEquals("2 warning: The fx line has extra words from 'oops', ignored.", one("fx delay 10 20 oops"))
        assertEquals("2 warning: The comp line has extra words from 'x', ignored.", one("comp off x"))
        assertEquals("2 warning: The sidechain line has extra words from 'z', ignored.", one("sidechain A7 B 10 20 z"))
        assertEquals(CardFx(FxType.DELAY, 0.1f, 0.2f), fxCard("fx delay 10 20 oops").card!!.fx)
    }

    @Test
    fun `effect lines after the first section are errors, and a pad line before it needs a section`() {
        val late = read("ARC BEAT 1", "[A]", bar, "fx delay", "send A 10", "[B]", "B7 | X... .... .... .... |", "comp off", "sidechain off")
        assertEquals(
            listOf(
                "4 error: 'fx' belongs before the first section.",
                "5 error: 'send' belongs before the first section.",
                "8 error: 'comp' belongs before the first section.",
                "9 error: 'sidechain' belongs before the first section.",
            ),
            problems(late),
        )
        assertNull(late.card)
        // Even inside the notes list.
        assertEquals(listOf("5 error: 'FX' belongs before the first section."), problems(read("ARC BEAT 1", "[A]", bar, "notes", "FX delay")))
        assertEquals(listOf("2 error: 'pad' needs a section first, such as [A]."), problems(read("ARC BEAT 1", "pad A7 level 10", "[A]", bar)))
    }

    @Test
    fun `pad lines read the settings they give`() {
        val r = read("ARC BEAT 1", "[A]", bar, "pad A7 pitch -7.5 level 90 pan -4 attack 3 release 20 mode Key", "pad A. level 0", "pad AE mode legato", "pad A1 pitch +3 pan 16")
        assertEquals(emptyList<String>(), problems(r))
        assertEquals(
            mapOf(
                9 to CardPad(-7.5, 90, -4, 3, 20, PlayMode.KEY),
                0 to CardPad(level = 0),
                2 to CardPad(mode = PlayMode.LEGATO),
                3 to CardPad(pitch = 3.0, pan = 16),
            ),
            section(r).pads,
        )
        // The ranges' ends, and a pad line after the notes list is still a pad line.
        val ends = read("ARC BEAT 1", "[B]", "notes", "B7 at 1.1.1", "pad B7 pitch -12 level 100 pan 0 attack 255 release 0", "pad B8 pitch 12.00 pan -16")
        assertEquals(emptyList<String>(), problems(ends))
        assertEquals(CardPad(-12.0, 100, 0, 255, 0), section(ends).pads[9])
        assertEquals(CardPad(pitch = 12.0, pan = -16), section(ends).pads[10])
        // A second line merges, the later settings winning; the same setting twice on a line keeps the later.
        val twice = read("ARC BEAT 1", "[A]", bar, "pad A7 pitch 1 level 50", "pad A7 level 60 pan 2", "pad A8 level 1 level 2")
        assertEquals(listOf("5 warning: A7 has two pad lines, merged, the later settings win."), problems(twice))
        assertEquals(CardPad(1.0, 60, 2), section(twice).pads[9])
        assertEquals(CardPad(level = 2), section(twice).pads[10])
        assertEquals(emptyMap<Int, CardPad>(), section(read("ARC BEAT 1", "[A]", bar)).pads)
    }

    @Test
    fun `pad line mistakes are errors with their line, an unknown setting a warning`() {
        fun one(line: String) = problems(read("ARC BEAT 1", "[A]", bar, line)).single()
        assertEquals("4 error: A pad line needs a pad and a setting, as in pad A7 pitch -7 level 90.", one("pad"))
        assertEquals("4 error: 'X7' isn't a pad. Use A to D, then . 0 E or 1 to 9.", one("pad X7 level 5"))
        assertEquals("4 error: B7 is in group B, but the section is [A].", one("pad B7 level 5"))
        assertEquals("4 error: A7 pad: give at least one of pitch, level, pan, attack, release or mode.", one("pad A7"))
        assertEquals("4 error: A7 pad: pitch needs a value.", one("pad A7 pitch"))
        assertEquals("4 error: A7 pad: pitch must be -12 to 12 semitones, whole or with up to two decimals.", one("pad A7 pitch 12.5"))
        assertEquals("4 error: A7 pad: pitch must be -12 to 12 semitones, whole or with up to two decimals.", one("pad A7 pitch 1.234"))
        assertEquals("4 error: A7 pad: level must be a whole number from 0 to 100.", one("pad A7 level 101"))
        assertEquals("4 error: A7 pad: level must be a whole number from 0 to 100.", one("pad A7 level 50.5"))
        assertEquals("4 error: A7 pad: pan must be a whole number from -16 to 16, negative is left.", one("pad A7 pan 17"))
        assertEquals("4 error: A7 pad: attack must be a whole number from 0 to 255.", one("pad A7 attack 256"))
        assertEquals("4 error: A7 pad: release must be a whole number from 0 to 255.", one("pad A7 release -1"))
        assertEquals("4 error: A7 pad: mode must be oneshot, key or legato.", one("pad A7 mode loop"))
        assertEquals("4 warning: Unknown setting 'colour' on A7 pad, ignored.", problems(read("ARC BEAT 1", "[A]", bar, "pad A7 level 5 colour red")).single())
        // All unknown: nothing given.
        assertEquals(
            listOf("4 warning: Unknown setting 'colour' on A7 pad, ignored.", "4 error: A7 pad: give at least one of pitch, level, pan, attack, release or mode."),
            problems(read("ARC BEAT 1", "[A]", bar, "pad A7 colour red")),
        )
        assertNull(read("ARC BEAT 1", "[A]", bar, "pad A7 level 101").card)
    }

    @Test
    fun `a card with effects and pad shaping writes them in the spec's order and reads back as itself`() {
        val fx = CardFx(FxType.DISTORTION, 0.6f, 0.35f, mapOf(0 to 0.2f, 1 to 0.05f), Comp(true, 0.4f, 0.6f), Sidechain(true, 0, 9, 0b0110, 0.25f, 0.7f))
        val pads = mapOf(9 to CardPad(-7.0, level = 90), 3 to CardPad(pan = -4, release = 20, mode = PlayMode.KEY), 4 to CardPad(pitch = 0.25, attack = 5), 0 to CardPad(pitch = -0.5))
        val c = BeatCard("Fx", 140.0, 56, listOf(a(hit(0, 9), hit(48, 3), sounds = mapOf(9 to snd(12, "Kick"), 3 to snd(300))).copy(pads = pads)), fx)
        val t = BeatCards.write(c)
        assertEquals(
            listOf(
                "ARC BEAT 1", "name Fx", "tempo 140", "swing 56",
                "fx distortion 60 35", "send A 20 B 5", "comp 40 60", "sidechain A7 BC 25 70",
                "",
                "[A] bars 1 step 1/16",
                "sound A7 12 Kick", "sound A1 300",
                "pad A7 pitch -7 level 90", "pad A1 pan -4 release 20 mode key", "pad A2 pitch 0.25 attack 5", "pad A. pitch -0.5",
            ),
            t.lines().take(16),
        )
        val r = BeatCards.read(t)
        assertEquals(emptyList<String>(), problems(r))
        assertEquals(fx, r.card!!.fx)
        assertEquals(pads, section(r).pads)
        assertEquals(c.sections[0].sounds, section(r).sounds)
        assertEquals(t, BeatCards.write(r.card!!))
        // The tidy comment follows the effect lines, and the other kinds of line stay out when the card has none.
        val tidy = BeatCards.write(BeatCard(null, null, 50, listOf(a(hit(0, 9))), CardFx(sends = mapOf(2 to 1f))), tidy = true).lines()
        assertEquals(listOf("ARC BEAT 1", "swing 50", "send C 100", BeatCards.TIDY_COMMENT), tidy.take(4))
        assertFalse(BeatCards.write(card(a(hit(0, 9)))).lines().any { it.startsWith("fx") || it.startsWith("send") || it.startsWith("pad") })
        // off lines, and a sidechain with no groups written as off.
        val off = BeatCards.write(BeatCard(null, null, 50, listOf(a(hit(0, 9))), CardFx(FxType.NONE, comp = Comp(false), sidechain = Sidechain(on = true, dests = 0)))).lines()
        assertEquals(listOf("fx none", "comp off", "sidechain off"), off.slice(2..4))
    }

    @Test
    fun `fromPatterns writes the fx only when they make a sound, and pad lines only for what differs`() {
        val sections = listOf(a(hit(0, 9), hit(0, 6), hit(24, 7)))
        assertNull(BeatCards.fromPatterns(null, null, 50, sections, fx = FxSettings.DEFAULT).fx)
        assertNull(BeatCards.fromPatterns(null, null, 50, sections).fx)
        // Knobs moved, but no effect, send, compressor or sidechain on: nothing to say.
        assertNull(BeatCards.fromPatterns(null, null, 50, sections, fx = FxSettings(x = 0.9f, comp = Comp(false, 0.2f, 0.2f))).fx)
        val fx = FxSettings(
            FxType.REVERB, 0.337f, 0.5f, listOf(0.2f, 0f, 0.004f, 0.5f), Comp(true, 0.4f, 0.6f),
            Sidechain(true, 0, 9, 0b0110, 0.25f, 0.7f),
        )
        val c = BeatCards.fromPatterns(null, null, 50, sections, fx = fx)
        // Whole percents, the groups above 0 only: 0.004 is 0.
        assertEquals(CardFx(FxType.REVERB, 0.34f, 0.5f, mapOf(0 to 0.2f, 3 to 0.5f), Comp(true, 0.4f, 0.6f), Sidechain(true, 0, 9, 0b0110, 0.25f, 0.7f)), c.fx)
        assertEquals(c, BeatCards.read(BeatCards.write(c)).card!!.copy(sections = c.sections))
        // Only a compressor on: the effect line is there too.
        val only = BeatCards.fromPatterns(null, null, 50, sections, fx = FxSettings(comp = Comp(true, 0.5f, 0.5f)))
        assertEquals(CardFx(FxType.NONE, 0.5f, 0.5f, null, Comp(true, 0.5f, 0.5f), null), only.fx)
        assertEquals(listOf("fx none", "comp 50 50"), BeatCards.write(only).lines().slice(2..3))
        // A sidechain on with no groups does nothing.
        assertNull(BeatCards.fromPatterns(null, null, 50, sections, fx = FxSettings(sidechain = Sidechain(on = true, dests = 0))).fx)

        val settings = mapOf(
            pad(0, 9) to PadSettings(pitch = -7.0, level = 90),
            pad(0, 6) to PadSettings(mode = PlayMode.KEY, release = 20, attack = 4),
            pad(0, 7) to PadSettings(), // the defaults
            pad(0, 8) to PadSettings(pan = 3), // no note: no line
        )
        val shaped = BeatCards.fromPatterns(null, null, 50, sections, pads = { settings[it] })
        assertEquals(mapOf(9 to CardPad(pitch = -7.0, level = 90), 6 to CardPad(attack = 4, release = 20, mode = PlayMode.KEY)), shaped.sections[0].pads)
        // Key mode's own release (15) isn't written; the oneshot default (255) neither; 255 in key mode is.
        assertEquals(CardPad(mode = PlayMode.KEY), BeatCards.padOf(PadSettings(mode = PlayMode.KEY, release = 15)))
        assertEquals(CardPad(mode = PlayMode.LEGATO, release = 255), BeatCards.padOf(PadSettings(mode = PlayMode.LEGATO, release = 255)))
        assertEquals(CardPad(release = 40), BeatCards.padOf(PadSettings(release = 40)))
        assertNull(BeatCards.padOf(PadSettings()))
        // The fields the card carries only: trim, mute and MIDI channel don't count.
        assertNull(BeatCards.padOf(PadSettings(start = 100, end = 900, muteGroup = true, midiChannel = 3, timeMode = "bar")))
        // A setting out of range is held in it, as the sheet does.
        assertEquals(CardPad(pitch = 12.0, level = 0), BeatCards.padOf(PadSettings(pitch = 30.0, level = -5)))
        // The text reads back as the card.
        val back = BeatCards.read(BeatCards.write(shaped)).card!!
        assertEquals(shaped.sections[0].pads, back.sections[0].pads)
        assertEquals(listOf("pad A7 pitch -7 level 90", "pad A4 attack 4 release 20 mode key"), BeatCards.write(shaped).lines().filter { it.startsWith("pad") })
    }

    @Test
    fun `applying effect lines sets each kind apart`() {
        val now = FxSettings(
            FxType.DELAY, 0.3f, 0.4f, listOf(0.1f, 0.2f, 0.3f, 0.4f), Comp(true, 0.7f, 0.8f),
            Sidechain(true, 1, 4, 0b1000, 0.6f, 0.2f),
        )
        // Nothing on the card: nothing changes.
        assertEquals(now, BeatCards.applyFx(now, CardFx()))
        // The effect line: type and knobs, the rest alone.
        assertEquals(now.copy(type = FxType.CHORUS, x = 0.8f, y = 0.1f), BeatCards.applyFx(now, CardFx(FxType.CHORUS, 0.8f, 0.1f)))
        // None leaves the knobs.
        assertEquals(now.copy(type = FxType.NONE), BeatCards.applyFx(now, CardFx(FxType.NONE, 0.5f, 0.5f)))
        // Sends: the groups named, the others 0.
        assertEquals(now.copy(sends = listOf(0f, 0.9f, 0f, 0.25f)), BeatCards.applyFx(now, CardFx(sends = mapOf(1 to 0.9f, 3 to 0.25f))))
        // The compressor: on with its knobs, or off keeping them.
        assertEquals(now.copy(comp = Comp(true, 0.1f, 0.2f)), BeatCards.applyFx(now, CardFx(comp = Comp(true, 0.1f, 0.2f))))
        assertEquals(now.copy(comp = Comp(false, 0.7f, 0.8f)), BeatCards.applyFx(now, CardFx(comp = Comp(false))))
        // The sidechain: on as written, or off keeping its source and groups.
        assertEquals(now.copy(sidechain = Sidechain(true, 0, 9, 0b0110, 0.25f, 0.7f)), BeatCards.applyFx(now, CardFx(sidechain = Sidechain(true, 0, 9, 0b0110, 0.25f, 0.7f))))
        assertEquals(now.copy(sidechain = Sidechain(false, 1, 4, 0b1000, 0.6f, 0.2f)), BeatCards.applyFx(now, CardFx(sidechain = Sidechain(on = false))))
        // From a read card, onto the default.
        val card = fxCard("fx delay 40 55", "send A 20 C 35", "comp 40 60", "sidechain A7 BC 25 70").card!!
        val applied = BeatCards.applyFx(FxSettings.DEFAULT, card.fx!!)
        assertEquals(FxSettings(FxType.DELAY, 0.4f, 0.55f, listOf(0.2f, 0f, 0.35f, 0f), Comp(true, 0.4f, 0.6f), Sidechain(true, 0, 9, 0b0110, 0.25f, 0.7f)), applied)
        // A share's own card applies to the same settings.
        val own = FxSettings(FxType.FILTER, 0.2f, 0.6f, listOf(0.5f, 0f, 0f, 0.25f), Comp(true, 0.3f, 0.9f), Sidechain(true, 2, 11, 0b0011, 0.4f, 0.8f))
        assertEquals(own, BeatCards.applyFx(FxSettings.DEFAULT, BeatCards.fxOf(own)!!))
        // Out of range values are held in it.
        assertEquals(1f, BeatCards.applyFx(now, CardFx(sends = mapOf(0 to 7f))).sends[0])
    }

    @Test
    fun `applying a pad line sets the settings it gives, as the pad sheet does`() {
        val now = PadSettings(pitch = 2.0, level = 80, pan = 3, attack = 10, release = 255, start = 5, end = 900, muteGroup = true, midiChannel = 4, timeMode = "bpm")
        assertEquals(now, BeatCards.applyPad(now, CardPad()))
        assertEquals(now.copy(pitch = -7.5, level = 0), BeatCards.applyPad(now, CardPad(pitch = -7.5, level = 0)))
        assertEquals(now.copy(pan = -16, attack = 255), BeatCards.applyPad(now, CardPad(pan = -16, attack = 255)))
        // Leaving oneshot sets the key release, as the sheet's MODE knob does; a release on the line wins.
        assertEquals(now.copy(mode = PlayMode.KEY, release = PadSettings.KEY_RELEASE), BeatCards.applyPad(now, CardPad(mode = PlayMode.KEY)))
        assertEquals(now.copy(mode = PlayMode.KEY, release = 20), BeatCards.applyPad(now, CardPad(mode = PlayMode.KEY, release = 20)))
        assertEquals(now.copy(mode = PlayMode.LEGATO, release = 0), BeatCards.applyPad(now, CardPad(release = 0, mode = PlayMode.LEGATO)))
        // Back to oneshot: plays to the end.
        val key = now.copy(mode = PlayMode.KEY, release = 40)
        assertEquals(key.copy(mode = PlayMode.ONESHOT, release = 255), BeatCards.applyPad(key, CardPad(mode = PlayMode.ONESHOT)))
        // The same mode again changes nothing; a release alone keeps the mode.
        assertEquals(key, BeatCards.applyPad(key, CardPad(mode = PlayMode.KEY)))
        assertEquals(key.copy(release = 90), BeatCards.applyPad(key, CardPad(release = 90)))
        // Clamped like the sheet, whatever the card object holds.
        assertEquals(now.copy(pitch = 12.0, level = 100, pan = -16, attack = 0), BeatCards.applyPad(now, CardPad(pitch = 40.0, level = 400, pan = -50, attack = -3)))
        // A share's own pad line applies to the same settings.
        val own = PadSettings(pitch = -7.0, level = 90, pan = -4, attack = 3, release = 20, mode = PlayMode.KEY)
        assertEquals(own, BeatCards.applyPad(PadSettings.DEFAULT, BeatCards.padOf(own)!!))
    }

    @Test
    fun `silent pads are the pads the notes use that have no sound and no sound line, in keypad order for each group`() {
        // Offsets: 9 is the 7 key, 6 the 4 key, 3 the 1 key (see PadNotes.ROWS); the keypad goes 7 8 9 4 5 6 1 2 3 . 0 E.
        val a7 = PhysicalPad(0, 9)
        val a4 = PhysicalPad(0, 6)
        val a1 = PhysicalPad(0, 3)
        val c7 = PhysicalPad(2, 9)
        val d7 = PhysicalPad(3, 9)
        val card = card(
            a(hit(0, 3), hit(48, 6), hit(0, 9), group = 0),
            a(hit(0, 9, semi = 0), hit(24, 9, semi = 4), hit(48, 9, semi = 7), group = 2),
            a(hit(0, 9, semi = 0), hit(96, 9, semi = 3), group = 3),
        )
        // Pad hits and KEYS notes both count; a pad with a sound is not silent.
        assertEquals(listOf(a4, a1, c7, d7), BeatCards.silentPads(card, { if (it == a7) 12 else null }, known = true))
        // The pads aren't read yet: nothing is known to be empty.
        assertEquals(emptyList<PhysicalPad>(), BeatCards.silentPads(card, { null }, known = false))
        // A sound line of the card is a sound: the pad it is on isn't silent.
        val lined = card(
            a(hit(0, 9), hit(0, 6), group = 0, sounds = mapOf(6 to snd(100))),
            a(hit(0, 9, semi = 0), group = 3, sounds = mapOf(9 to snd(512, "PIANO"))),
        )
        assertEquals(listOf(a7), BeatCards.silentPads(lined, { null }, known = true))
        assertEquals(emptyList<PhysicalPad>(), BeatCards.silentPads(lined, { 5 }, known = true))
        // Sections in any order come out by group, and a pad is listed once.
        val shuffled = card(a(hit(0, 9, semi = 0), group = 3), a(hit(0, 9), group = 0), a(hit(0, 9), hit(0, 3), group = 0))
        assertEquals(listOf(a7, a1, d7), BeatCards.silentPads(shuffled, { null }, known = true))
        // A note past the pattern's end doesn't play, so its pad isn't used.
        val past = card(a(hit(0, 9), hit(Seq.TICKS_PER_BAR, 6), group = 1))
        assertEquals(listOf(PhysicalPad(1, 9)), BeatCards.silentPads(past, { null }, known = true))
        // A card with no notes has none.
        assertEquals(emptyList<PhysicalPad>(), BeatCards.silentPads(card(a(group = 1)), { null }, known = true))
    }

    @Test
    fun `a sound line with a slot out of range is no sound, and notes are counted by pad`() {
        val bad = card(a(hit(0, 9), group = 0, sounds = mapOf(9 to snd(0))))
        assertEquals(listOf(PhysicalPad(0, 9)), BeatCards.silentPads(bad, { null }, known = true))
        val s = a(hit(0, 9), hit(48, 9), hit(0, 10, semi = 0), hit(Seq.TICKS_PER_BAR + 5, 6), group = 0)
        assertEquals(mapOf(9 to 2, 10 to 1), BeatCards.notesByPad(s))
    }

    @Test
    fun `the pads with no sound are one comment right after the header, which readers ignore`() {
        val d7 = PhysicalPad(3, 9)
        val c7 = PhysicalPad(2, 9)
        val c = BeatCard("Test", 92.0, 50, listOf(a(hit(0, 9))))
        val plain = BeatCards.write(c)
        assertFalse(plain.contains("no sound"))
        val text = BeatCards.write(c, silent = listOf(c7, d7))
        assertEquals("# no sound on: C7 D7", ClaudeText.noSoundOn(listOf(c7, d7)))
        assertEquals(
            listOf("ARC BEAT 1", "name Test", "tempo 92", "swing 50", "# no sound on: C7 D7", ""),
            text.lines().take(6),
        )
        // Tidy cards carry it too, before their own comment.
        val tidy = BeatCards.write(c, tidy = true, silent = listOf(d7)).lines()
        assertEquals("# no sound on: D7", tidy[4])
        assertEquals(BeatCards.TIDY_COMMENT, tidy[5])
        // The comment changes nothing about what is read.
        val r = BeatCards.read(text)
        assertEquals(emptyList<String>(), problems(r))
        assertEquals(BeatCards.read(plain).card, r.card)
        // ENTER is E, as the card writes its pad.
        assertEquals("# no sound on: AE", ClaudeText.noSoundOn(listOf(PhysicalPad(0, 2))))
    }

    @Test
    fun `the silent pads rows are worded for one note or several`() {
        val d7 = PhysicalPad(3, 9)
        assertEquals("D7 \u00B7 12 notes, no sound: they will be silent", ClaudeText.silentRow(d7, 12))
        assertEquals("D7 \u00B7 1 note, no sound: it will be silent", ClaudeText.silentRow(d7, 1))
        assertEquals("D7: 12 notes, no sound, they will be silent", ClaudeText.silentRowName(d7, 12))
        assertEquals("D7: will get 512 PIANO", ClaudeText.pickedRowName(d7, "512 PIANO"))
        assertEquals("Pick a sound for D7", ClaudeText.pickSoundName(d7))
        assertEquals("Pick another sound for D7, now 512 PIANO", ClaudeText.changePickName(d7, "512 PIANO"))
        assertEquals("Sound for D7", ClaudeText.pickTitle(d7))
        assertEquals("12 notes of the card play on this pad.", ClaudeText.pickLine(12))
    }

    @Test
    fun `every recipe card in the skill reads cleanly, and the ones with effect lines carry them`() {
        val genres = File(System.getProperty("arc.beatCardSpec")!!).parentFile.resolve("genres.md").readText()
        val cards = Regex("```\\n(ARC BEAT 1\\n.*?)\\n```", RegexOption.DOT_MATCHES_ALL).findAll(genres).map { it.groupValues[1] }.toList()
        assertTrue(cards.size >= 28)
        for (text in cards) {
            val r = BeatCards.read(text)
            assertEquals(emptyList<String>(), problems(r), text.lines().getOrNull(1))
            // What is read writes back to a card that reads the same.
            assertEquals(r.card!!.fx, BeatCards.read(BeatCards.write(r.card!!)).card!!.fx)
        }
        val withFx = cards.map { BeatCards.read(it).card!! }.filter { it.fx != null }
        assertEquals(setOf("House groove", "Dub chord echo", "Industrial pressure", "Hard techno pound", "Schranz pressure", "Hard groove workout", "Dusty lo-fi", "Amen shred"), withFx.map { it.name }.toSet())
        val house = withFx.first { it.name == "House groove" }.fx!!
        assertEquals(Sidechain(true, 0, 9, 0b0010, 0.3f, 0.55f), house.sidechain)
        assertEquals(FxType.FILTER, withFx.first { it.name == "Dusty lo-fi" }.fx!!.type)
    }
}
