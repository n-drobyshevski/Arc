package dev.arc.ep133.controller

import dev.arc.ep133.features.BeatCard
import dev.arc.ep133.features.BeatCards
import dev.arc.ep133.features.CardSection
import dev.arc.ep133.features.Pattern
import dev.arc.ep133.features.PatternNote
import dev.arc.ep133.features.PatternRecorder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectSeq
import dev.arc.ep133.features.SceneOps
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.Timing
import dev.arc.ep133.text.ClaudeText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Beat cards as the controller works them: what a share sends, the sheet's plan and grids, and an import as one UNDO step. */
class BeatPlanTest {
    private val kick = PhysicalPad(0, 9)
    private val names = mapOf(kick to "kick", PhysicalPad(0, 11) to "snare")
    private val nameOf: (PhysicalPad) -> String? = { names[it] }
    private val bar = Seq.TICKS_PER_BAR

    private fun hit(tick: Int, offset: Int = 9, velocity: Int = 127) = PatternNote(tick, offset, 24, null, velocity)

    private fun pattern(vararg notes: PatternNote, bars: Int = 1) = Pattern(bars, notes.toList())

    private fun with(seq: ProjectSeq, group: Int, n: Int, p: Pattern) = seq.withPattern(group, n, p)

    private fun card(vararg sections: CardSection, tempo: Double? = null, swing: Int = 50, name: String? = null) = BeatCard(name, tempo, swing, sections.toList())

    private fun section(group: Int, p: Pattern) = CardSection(group, null, p)

    private fun read(card: BeatCard) = BeatCards.read(BeatCards.write(card))

    // ---- sharing ----

    @Test
    fun `a share is the scene's patterns or a group's as a tidied card in a fenced block, or nothing without notes`() {
        assertNull(beatShare(ProjectSeq.DEFAULT, null, 120.0, 50, nameOf))
        assertNull(beatShare(ProjectSeq.DEFAULT, 0, 120.0, 50, nameOf))
        var seq = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0)))
        seq = with(seq, 2, 1, pattern(hit(0, 11), hit(96, 11), bars = 2))
        val scene = beatShare(seq, null, 92.0, 50, nameOf)!!
        assertEquals("Arc beat S01", scene.subject)
        assertTrue(scene.text.startsWith(ClaudeText.SHARE_PROMPT + "\n\n```\nARC BEAT 1\nname S01\ntempo 92\nswing 50\n# tidied"))
        assertTrue(scene.text.endsWith("\n```\n"))
        // The blank groups (B, D) are left out; the pad's name is on its row.
        val card = BeatCards.read(scene.text).card!!
        assertEquals(listOf(0, 2), card.sections.map { it.group })
        assertTrue(scene.text.contains("A7 kick"))
        // One group: its own pattern, named by the number and the scene; a group with no notes shares nothing.
        val one = beatShare(seq, 2, 92.0, 50, nameOf)!!
        assertEquals("Arc beat P01 S01", one.subject)
        assertEquals(listOf(2), BeatCards.read(one.text).card!!.sections.map { it.group })
        assertNull(beatShare(seq, 1, 92.0, 50, nameOf))
        // The scene playing and the pattern picked: the second scene's own.
        val two = SceneOps.newScene(seq)
        assertNull(beatShare(two, null, 92.0, 50, nameOf))
        assertEquals("Arc beat S02", beatShare(with(two, 1, 2, pattern(hit(0))), null, 92.0, 50, nameOf)!!.subject)
    }

    @Test
    fun `the swing is kept only where every hit sits on it`() {
        val seq = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0), hit(24 + 6)))
        // 1/16 swung 58%: the odd step plays 4 ticks late (24 + 4 = 28), so 30 is off the grid: the card is straight.
        assertTrue(beatShare(seq, 0, 120.0, 58, nameOf)!!.text.contains("\nswing 50\n"))
        val swung = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0), hit(28)))
        assertTrue(beatShare(swung, 0, 120.0, 58, nameOf)!!.text.contains("\nswing 58\n"))
    }

    // ---- the grid ----

    @Test
    fun `a grid has a row for each pad with notes, the keypad's order, lit by velocity`() {
        val g = beatGrid(
            section(0, pattern(hit(0, 9, 127), hit(96, 9, 100), hit(192, 9, 40), hit(0, 11, 127), hit(48, 6, 100))),
            50, nameOf, 4,
        )
        assertEquals(Timing.SIXTEENTH, g.step)
        assertEquals(16, g.perBar)
        assertEquals(4, g.goesTo)
        // The keypad goes 7 8 9 / 4 5 6 from the top: 7 (offset 9), 9 (offset 11), then 4 (offset 6).
        assertEquals(listOf(9, 11, 6), g.rows.map { it.pad.offset })
        assertEquals(listOf("kick", "snare", null), g.rows.map { it.name })
        assertEquals(listOf(3, 1, 1), g.rows.map { it.hits })
        val kicks = g.rows[0].cells
        assertEquals(16, kicks.size)
        assertEquals(Weight.ACCENT, kicks[0])
        assertEquals(Weight.NORMAL, kicks[4])
        assertEquals(Weight.GHOST, kicks[8])
        assertNull(kicks[1])
        assertEquals(0, g.moreBars)
    }

    @Test
    fun `a long pattern shows its first two bars, and the rest as more bars`() {
        val g = beatGrid(section(0, pattern(hit(0), hit(bar * 3), bars = 4)), 50, nameOf, 1)
        assertEquals(2, g.shownBars)
        assertEquals(2, g.moreBars)
        assertEquals(32, g.rows[0].cells.size)
        // The hit in bar 4 is a hit of the row all the same.
        assertEquals(2, g.rows[0].hits)
    }

    @Test
    fun `a grid reads in 1_16T or 1_32 when the hits need it, and notes past the end are left out`() {
        assertEquals(Timing.SIXTEENTH_T, beatGrid(section(0, pattern(hit(0), hit(16))), 50, nameOf, 1).step)
        assertEquals(Timing.THIRTY_SECOND, beatGrid(section(0, pattern(hit(0), hit(12))), 50, nameOf, 1).step)
        val g = beatGrid(section(0, pattern(hit(0), hit(bar + 24))), 50, nameOf, 1)
        assertEquals(listOf(1), g.rows.map { it.hits })
    }

    // ---- the sheet ----

    @Test
    fun `the sheet names where each section goes, the scene a card adds, and the tempo and swing it says`() {
        val seq = with(ProjectSeq.DEFAULT, 0, 2, pattern(hit(0)))
        val a = pattern(hit(0), hit(96), bars = 2)
        val b = pattern(hit(48, 11))
        val one = beatImportUi(read(card(section(0, a), tempo = 92.0, swing = 50, name = "Lazy")), seq, 120.0, nameOf)
        assertEquals("Lazy", one.title)
        assertEquals("Beat card · 2 bars · 1 pad · 2 hits", one.summary)
        // A is on pattern 1 (with notes in 2): the next free after it is 3.
        assertEquals(listOf(0 to 3), one.placed)
        assertEquals(listOf(3), one.grids.map { it.goesTo })
        assertNull(one.scene)
        assertEquals(92, one.tempo)
        assertEquals(120, one.tempoNow)
        assertNull(one.swing)
        assertNull(one.blocked)
        assertTrue(one.problems.isEmpty())
        // Three groups: a new scene (the second), the tempo is the same (hidden) and the swing is said.
        val swung = pattern(hit(0), hit(28))
        val three = beatImportUi(read(card(section(0, swung), section(1, b), section(3, b), tempo = 120.4, swing = 58)), seq, 120.0, nameOf)
        assertEquals(1, three.scene)
        assertEquals(3, three.placed.size)
        assertNull(three.tempo)
        assertEquals(58, three.swing)
        assertEquals("Beat card", three.title)
        assertEquals("Beat card · 1 bar · 3 pads · 4 hits", three.summary)
        // The bars are the longest group's, as the scene loops over it, not the groups' lengths added up.
        val mixed = card(section(0, pattern(hit(0))), section(1, pattern(hit(0), bars = 2)), section(2, pattern(hit(0), bars = 4)))
        assertEquals("Beat card · 4 bars · 3 pads · 3 hits", beatImportUi(read(mixed), seq, 120.0, nameOf).summary)
        // No tempo on the card: nothing to offer.
        assertNull(beatImportUi(read(card(section(0, a))), seq, 100.0, nameOf).tempo)
    }

    @Test
    fun `a card that can't be read lists its problems and a full group blocks the import`() {
        val bad = BeatCards.read("ARC BEAT 1\n[A]\nA7 | X... |\n")
        val ui = beatImportUi(bad, ProjectSeq.DEFAULT, 120.0, nameOf)
        assertNull(ui.card)
        assertNull(ui.summary)
        assertEquals(ClaudeText.FIX_ERRORS, ui.blocked)
        assertTrue(ui.problems.any { it.error })
        assertEquals(emptyList<BeatGridUi>(), ui.grids)
        var full = ProjectSeq.DEFAULT
        for (n in 1..Seq.MAX_PATTERNS) full = with(full, 1, n, pattern(hit(0)))
        val blocked = beatImportUi(read(card(section(0, pattern(hit(0))), section(1, pattern(hit(0))))), full, 120.0, nameOf)
        assertEquals("Group B has no free pattern.", blocked.blocked)
        assertEquals(emptyList<Pair<Int, Int>>(), blocked.placed)
        assertEquals(listOf(null, null), blocked.grids.map { it.goesTo })
    }

    // ---- import ----

    @Test
    fun `a card of one group goes into the next free pattern and is picked, in one undo step`() {
        val recorder = PatternRecorder()
        var seq = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0, 11)))
        recorder.seq = seq
        val applied = applyBeat(seq, card(section(0, pattern(hit(0), hit(96), bars = 2))), recorder)
        assertNull(applied.fullGroup)
        assertEquals(listOf(0 to 2), applied.placed)
        assertNull(applied.scene)
        assertEquals(2, applied.seq.selected(0))
        assertEquals(2, applied.seq.pattern(0, 2).bars)
        assertEquals(1, applied.seq.scenes.size)
        // The pattern that was there stays, in its slot.
        assertFalse(applied.seq.pattern(0, 1).isEmpty)
        assertEquals("Imported to A · 02. UNDO takes it back.", beatImported(applied))
        assertTrue(recorder.canUndo)
        // One undo: the banks and the picks as they were.
        seq = applied.seq
        assertEquals(with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0, 11))), recorder.undo(seq))
        assertFalse(recorder.canUndo)
    }

    @Test
    fun `a card of several groups adds a scene that plays them, in one undo step`() {
        val recorder = PatternRecorder()
        val seq = with(ProjectSeq.DEFAULT, 2, 1, pattern(hit(0)))
        recorder.seq = seq
        val applied = applyBeat(seq, card(section(0, pattern(hit(0))), section(1, pattern(hit(48, 11)))), recorder)
        assertEquals(1, applied.scene)
        assertEquals(1, applied.seq.scene)
        assertEquals(2, applied.seq.scenes.size)
        // A and B on their new patterns; C and D, which the card hasn't, keep the numbers of the scene playing.
        assertEquals(listOf(1, 1, 1, 1), applied.seq.scenes[0].patterns)
        assertEquals(listOf(2, 2, 1, 1), applied.seq.scenes[1].patterns)
        assertEquals("Imported to scene S02. UNDO takes it back.", beatImported(applied))
        assertEquals(seq, recorder.undo(applied.seq))
        assertFalse(recorder.canUndo)
    }

    @Test
    fun `with 99 scenes the patterns are placed and picked in the scene playing`() {
        var seq = ProjectSeq.DEFAULT
        repeat(Seq.MAX_SCENES - 1) { seq = SceneOps.newScene(seq) }
        assertEquals(Seq.MAX_SCENES, seq.scenes.size)
        val recorder = PatternRecorder()
        recorder.seq = seq
        val applied = applyBeat(seq, card(section(0, pattern(hit(0))), section(1, pattern(hit(0)))), recorder)
        assertNull(applied.scene)
        assertEquals(Seq.MAX_SCENES, applied.seq.scenes.size)
        // The last scene played pattern 99 in every group: the next free after it wraps to 1.
        assertEquals(listOf(0 to 1, 1 to 1), applied.placed)
        assertEquals(listOf(1, 1, 99, 99), List(4) { applied.seq.selected(it) })
        assertEquals("Imported to A \u00B7 01, B \u00B7 01. UNDO takes it back.", beatImported(applied))
        assertEquals(seq, recorder.undo(applied.seq))
    }

    @Test
    fun `a full group changes nothing and makes no undo step`() {
        var seq = ProjectSeq.DEFAULT
        for (n in 1..Seq.MAX_PATTERNS) seq = with(seq, 0, n, pattern(hit(0)))
        val recorder = PatternRecorder()
        recorder.seq = seq
        val applied = applyBeat(seq, card(section(0, pattern(hit(0)))), recorder)
        assertEquals(0, applied.fullGroup)
        assertSame(seq, applied.seq)
        assertTrue(applied.placed.isEmpty())
        assertFalse(recorder.canUndo)
    }
}
