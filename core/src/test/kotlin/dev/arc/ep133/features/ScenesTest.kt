package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ScenesTest {
    private val kick = Pattern(1, listOf(PatternNote(0, 0, 24, id = 3)))
    private val full = Pattern(1, listOf(PatternNote(0, 0, 24)))

    /** Every pattern of a bank with notes. */
    private val fullBank = (1..Seq.MAX_PATTERNS).associateWith { full }

    private fun scene(vararg n: Int) = Scene(n.toList())

    private fun ticks(p: Pattern) = p.notes.map { it.tick }

    @Test
    fun `a project starts with one scene of patterns 1 and empty banks`() {
        val d = ProjectSeq()
        assertEquals(ProjectSeq.DEFAULT, d)
        assertEquals(listOf(scene(1, 1, 1, 1)), d.scenes)
        assertEquals(0, d.scene)
        assertEquals(List(4) { emptyMap<Int, Pattern>() }, d.banks)
        assertEquals(Pattern(), d.pattern(2, 40))
        assertEquals(1, d.selected(3))
        assertEquals(ProjectPatterns(), d.playing())
        assertTrue(d.isEmpty)
        assertEquals(99, Seq.MAX_PATTERNS)
        assertEquals(99, Seq.MAX_SCENES)
        // Blank patterns stay out of the banks; 1 to 99 scenes; the index held to them.
        assertEquals(d, ProjectSeq(banks = listOf(mapOf(1 to Pattern())), scenes = emptyList(), scene = 5))
        assertEquals(99, ProjectSeq(scenes = List(120) { Scene() }).scenes.size)
        assertEquals(1, ProjectSeq(scenes = List(2) { Scene() }, scene = 7).scene)
        assertFalse(d.withPattern(1, 50, Pattern(2)).banks[1].isEmpty())
        assertTrue(d.withPattern(1, 50, Pattern(2)).isEmpty)
        assertSame(d, d.withPattern(1, 100, kick))
    }

    @Test
    fun `playing and withPlaying go through the scene's slots`() {
        val p = ProjectSeq(banks = listOf(mapOf(1 to kick), mapOf(2 to Pattern(2)), emptyMap(), emptyMap()), scenes = listOf(scene(1, 2, 3, 4)))
        assertEquals(ProjectPatterns(listOf(kick, Pattern(2), Pattern(), Pattern())), p.playing())
        assertSame(p, p.withPlaying(p.playing()))
        val edited = p.playing().with(1, full).with(0, Pattern())
        val q = p.withPlaying(edited)
        assertEquals(full, q.pattern(1, 2))
        // A blank pattern leaves the bank.
        assertFalse(1 in q.banks[0])
        assertEquals(edited, q.playing())
        // Scenes sharing a slot share its pattern.
        val two = ProjectSeq(banks = listOf(mapOf(1 to kick)), scenes = listOf(scene(1, 1, 1, 1), scene(1, 2, 1, 1)), scene = 1)
        val shared = two.withPlaying(two.playing().with(0, full))
        assertEquals(full, SceneOps.selectScene(shared, 0).playing().group(0))
        assertFalse(shared.isEmpty)
    }

    @Test
    fun `picking a pattern, held to 1 to 99`() {
        val d = ProjectSeq.DEFAULT
        val p = SceneOps.selectPattern(d, 1, 5)
        assertEquals(listOf(scene(1, 5, 1, 1)), p.scenes)
        assertEquals(5, p.selected(1))
        assertEquals(99, SceneOps.selectPattern(d, 0, 120).selected(0))
        assertSame(d, SceneOps.selectPattern(d, 0, 0))
        // Only the scene playing.
        val two = ProjectSeq(scenes = listOf(scene(1, 1, 1, 1), scene(2, 2, 2, 2)), scene = 1)
        assertEquals(listOf(scene(1, 1, 1, 1), scene(2, 2, 2, 7)), SceneOps.selectPattern(two, 3, 7).scenes)
    }

    @Test
    fun `the next free pattern is the first after the one selected with no notes, round 1 to 99`() {
        val d = ProjectSeq.DEFAULT
        assertEquals(2, SceneOps.nextFree(d, 0))
        val p = d.withPattern(0, 2, full).withPattern(0, 3, full).withPattern(0, 4, Pattern(4))
        // A pattern with only a length has no notes: free.
        assertEquals(4, SceneOps.nextFree(p, 0))
        assertEquals(2, SceneOps.nextFree(p, 1))
        // Round past 99.
        val end = SceneOps.selectPattern(d.withPattern(0, 98, full).withPattern(0, 99, full), 0, 97)
        assertEquals(1, SceneOps.nextFree(end, 0))
        // The one selected counts last: free only when nothing else is.
        val nine = SceneOps.selectPattern(ProjectSeq(banks = listOf(fullBank - 9)), 0, 9)
        assertEquals(9, SceneOps.nextFree(nine, 0))
        // Every pattern with notes: the one selected.
        val all = SceneOps.selectPattern(ProjectSeq(banks = listOf(fullBank)), 0, 40)
        assertEquals(40, SceneOps.nextFree(all, 0))
    }

    @Test
    fun `picking a scene, held to those there are`() {
        val p = ProjectSeq(scenes = listOf(scene(1, 1, 1, 1), scene(2, 2, 2, 2), scene(3, 3, 3, 3)))
        assertEquals(2, SceneOps.selectScene(p, 2).scene)
        assertEquals(2, SceneOps.selectScene(p, 10).scene)
        assertSame(p, SceneOps.selectScene(p, -1))
        assertEquals(3, SceneOps.selectScene(p, 2).selected(0))
    }

    @Test
    fun `a new scene goes at the end, each group on its next free pattern`() {
        val p = ProjectSeq.DEFAULT.withPattern(0, 1, kick).withPattern(0, 2, full)
        val n = SceneOps.newScene(p)
        assertEquals(listOf(scene(1, 1, 1, 1), scene(3, 2, 2, 2)), n.scenes)
        assertEquals(1, n.scene)
        assertEquals(ProjectPatterns(), n.playing())
        // From the first of three, it still goes at the end.
        val three = SceneOps.selectScene(SceneOps.newScene(n), 0)
        assertEquals(3, SceneOps.newScene(three).scene)
        val most = ProjectSeq(scenes = List(Seq.MAX_SCENES) { Scene() })
        assertSame(most, SceneOps.newScene(most))
    }

    @Test
    fun `commit copies the patterns with notes into free ones, in a scene right after`() {
        val c = Pattern(2, listOf(PatternNote(96, 5, 24, semitones = 2, id = 9)))
        val p = ProjectSeq(
            banks = listOf(mapOf(1 to kick), mapOf(1 to Pattern(2)), mapOf(3 to c), fullBank),
            scenes = listOf(scene(1, 1, 3, 1), scene(5, 5, 5, 5)),
        )
        val out = SceneOps.commit(p)
        // A copied into 2, C into 4; B empty and D with no free pattern share theirs.
        assertEquals(listOf(scene(1, 1, 3, 1), scene(2, 1, 4, 1), scene(5, 5, 5, 5)), out.scenes)
        assertEquals(1, out.scene)
        // The copies' notes have no ids.
        assertEquals(Pattern(1, listOf(PatternNote(0, 0, 24))), out.pattern(0, 2))
        assertEquals(Pattern(2, listOf(PatternNote(96, 5, 24, semitones = 2))), out.pattern(2, 4))
        assertEquals(kick, out.pattern(0, 1))
        assertEquals(Pattern(2), out.playing().group(1))
        // The new scene plays what the old one did.
        assertEquals(p.playing().groups.map { ticks(it) }, out.playing().groups.map { ticks(it) })
        val most = ProjectSeq(scenes = List(Seq.MAX_SCENES) { Scene() })
        assertSame(most, SceneOps.commit(most))
    }

    @Test
    fun `clear empties the scene's patterns, delete takes an empty scene away`() {
        val p = ProjectSeq(banks = listOf(mapOf(1 to Pattern(2, kick.notes), 2 to full)), scenes = listOf(scene(1, 1, 1, 1), scene(2, 1, 1, 1)))
        val cleared = SceneOps.clearScene(p)
        // The length stays; another scene's pattern keeps its notes.
        assertEquals(Pattern(2), cleared.pattern(0, 1))
        assertEquals(full, cleared.pattern(0, 2))
        assertSame(cleared, SceneOps.clearScene(cleared))
        // Not empty, or the only scene: no delete.
        assertSame(p, SceneOps.deleteScene(p))
        assertSame(ProjectSeq.DEFAULT, SceneOps.deleteScene(ProjectSeq.DEFAULT))
        val three = ProjectSeq(banks = listOf(mapOf(1 to full, 3 to full)), scenes = listOf(scene(1, 1, 1, 1), scene(2, 2, 2, 2), scene(3, 1, 1, 1)), scene = 1)
        val d = SceneOps.deleteScene(three)
        assertEquals(listOf(scene(1, 1, 1, 1), scene(3, 1, 1, 1)), d.scenes)
        assertEquals(1, d.scene)
        // The last one deleted: the index on the new last.
        val last = SceneOps.selectScene(SceneOps.newScene(ProjectSeq.DEFAULT.withPattern(0, 1, full)), 1)
        val dl = SceneOps.deleteScene(last)
        assertEquals(listOf(scene(1, 1, 1, 1)), dl.scenes)
        assertEquals(0, dl.scene)
        // ERASE + MAIN: DEL when it can, else CLR.
        assertEquals(SceneErased(d, SceneErase.DELETED), SceneOps.eraseScene(three))
        assertEquals(SceneErased(cleared, SceneErase.CLEARED), SceneOps.eraseScene(p))
        assertEquals(SceneErased(ProjectSeq.DEFAULT, SceneErase.CLEARED), SceneOps.eraseScene(ProjectSeq.DEFAULT))
    }

    @Test
    fun `a pattern copied and pasted into another group`() {
        val a = Pattern(2, listOf(PatternNote(0, 3, 24, id = 5), PatternNote(500, 4, 12, semitones = 1, id = 6)), open = true)
        val p = SceneOps.selectPattern(ProjectSeq.DEFAULT.withPlaying(ProjectPatterns().with(0, a)), 1, 3)
        val clip = SceneOps.copyPattern(p, 0)
        assertEquals(Clip.PatternClip(Pattern(2, listOf(PatternNote(0, 3, 24), PatternNote(500, 4, 12, semitones = 1)))), clip)
        val out = SceneOps.pastePattern(p, 1, clip)
        assertEquals(clip.pattern, out.pattern(1, 3))
        assertEquals(clip.pattern, out.playing().group(1))
        // Over the pattern's own, length too.
        val over = SceneOps.pastePattern(ProjectSeq.DEFAULT.withPattern(2, 1, Pattern(8, kick.notes)), 2, clip)
        assertEquals(clip.pattern, over.pattern(2, 1))
    }

    @Test
    fun `a bar copied and pasted, none past the end`() {
        val notes = listOf(0, 100, 384, 500, 800).map { PatternNote(it, 1, 24, id = it) }
        val p = ProjectSeq.DEFAULT.withPattern(0, 1, Pattern(2, notes)).withPattern(1, 1, Pattern(1, listOf(PatternNote(10, 2, 24))))
        val clip = SceneOps.copyBar(p, 0, 1)
        assertEquals(Clip.BarClip(listOf(PatternNote(0, 1, 24), PatternNote(116, 1, 24))), clip)
        assertEquals(listOf(0, 100), SceneOps.copyBar(p, 0, 0).notes.map { it.tick })
        val b = SceneOps.pasteBar(p, 1, 0, clip)
        assertEquals(listOf(PatternNote(0, 1, 24), PatternNote(116, 1, 24)), b.pattern(1, 1).notes)
        // Into A's first bar: the rest stay, past the end too.
        assertEquals(listOf(384, 500, 800, 0, 116), ticks(SceneOps.pasteBar(p, 0, 0, clip).pattern(0, 1)))
        assertEquals(listOf(0, 100, 800, 384, 500), ticks(SceneOps.pasteBar(p, 0, 1, clip).pattern(0, 1)))
        // B is a bar long: nothing past it.
        assertSame(p, SceneOps.pasteBar(p, 1, 1, clip))
        assertSame(p, SceneOps.pasteBar(p, 1, -1, clip))
    }

    @Test
    fun `a pad's notes pasted onto a pad in another group, cut to its length`() {
        val a3 = PhysicalPad(0, 3)
        val b7 = PhysicalPad(1, 7)
        val a = Pattern(2, listOf(PatternNote(0, 3, 24), PatternNote(96, 3, 24, semitones = 2, id = 4), PatternNote(48, 4, 24), PatternNote(500, 3, 12)))
        val b = Pattern(1, listOf(PatternNote(10, 0, 24), PatternNote(200, 7, 24, semitones = 5)))
        val p = ProjectSeq.DEFAULT.withPattern(0, 1, a).withPattern(1, 1, b)
        val clip = SceneOps.copyPad(p, a3)
        assertEquals(Clip.PadClip(listOf(PatternNote(0, 3, 24), PatternNote(96, 3, 24, semitones = 2), PatternNote(500, 3, 12)), 768), clip)
        val out = SceneOps.pastePad(p, b7, clip)
        // B7's own notes (every pitch) go; the one at 500 is past B's bar.
        assertEquals(listOf(PatternNote(10, 0, 24), PatternNote(0, 7, 24), PatternNote(96, 7, 24, semitones = 2)), out.pattern(1, 1).notes)
        // Back onto A 3 itself: the same notes, at the end.
        assertEquals(a.notes.filter { it.offset != 3 } + clip.notes, SceneOps.pastePad(p, a3, clip).pattern(0, 1).notes)
    }

    @Test
    fun `every paste stops at the note cap`() {
        val crowd = Pattern(1, List(Seq.MAX_NOTES - 1) { PatternNote(0, 0, 1) })
        val p = ProjectSeq.DEFAULT.withPattern(1, 1, crowd).withPattern(0, 1, Pattern(1, listOf(PatternNote(0, 5, 24), PatternNote(96, 5, 24), PatternNote(192, 5, 24))))
        val pad = SceneOps.pastePad(p, PhysicalPad(1, 7), SceneOps.copyPad(p, PhysicalPad(0, 5)))
        assertEquals(Seq.MAX_NOTES, pad.pattern(1, 1).notes.size)
        assertEquals(listOf(0), pad.pattern(1, 1).notes.filter { it.offset == 7 }.map { it.tick })
        val crowdBar = ProjectSeq.DEFAULT.withPattern(1, 1, Pattern(2, List(Seq.MAX_NOTES - 1) { PatternNote(400, 0, 1) }))
        val bar = SceneOps.pasteBar(crowdBar, 1, 0, SceneOps.copyBar(p, 0, 0))
        assertEquals(Seq.MAX_NOTES, bar.pattern(1, 1).notes.size)
        val big = Clip.PatternClip(Pattern(99, List(Seq.MAX_NOTES + 2) { PatternNote(it, 0, 1) }))
        assertEquals(Seq.MAX_NOTES, SceneOps.pastePattern(ProjectSeq.DEFAULT, 0, big).pattern(0, 1).notes.size)
    }

    @Test
    fun `undo goes back through a pick, to the checkpoint whole`() {
        val r = PatternRecorder()
        val s0 = ProjectSeq.DEFAULT
        r.seq = s0
        val s1 = s0.withPlaying(r.setLength(s0.playing(), 0, 2))
        r.seq = s1
        // A pick is no checkpoint and keeps them.
        val s2 = SceneOps.selectPattern(s1, 0, 5)
        r.seq = s2
        assertTrue(r.canUndo)
        val s3 = s2.withPlaying(r.setLength(s2.playing(), 0, 4))
        r.seq = s3
        assertEquals(4, s3.pattern(0, 5).bars)
        assertEquals(s2, r.undo(s3))
        // Back to before the first edit: pattern 1 picked again, a bar long.
        assertEquals(s0, r.undo(s2))
        assertNull(r.undo(s0))
    }

    @Test
    fun `scene and paste edits are checkpoints of their own, and end the gestures going on`() {
        val r = PatternRecorder()
        val s0 = ProjectSeq.DEFAULT.withPattern(0, 1, Pattern(1, listOf(PatternNote(0, 3, 24))))
        r.seq = s0
        val sa = s0.withPlaying(r.stepVelocity(s0.playing(), 0, 0, Timing.SIXTEENTH, 50, 90))
        r.seq = sa
        val sb = r.editSeq(sa, SceneOps.pastePattern(sa, 1, SceneOps.copyPattern(sa, 0)))
        r.seq = sb
        // The same knob turned again after the paste: a checkpoint of its own.
        val sc = sb.withPlaying(r.stepVelocity(sb.playing(), 0, 0, Timing.SIXTEENTH, 50, 80))
        r.seq = sc
        val sd = r.editSeq(sc, SceneOps.commit(sc))
        r.seq = sd
        assertEquals(2, sd.scenes.size)
        // Nothing changed: no checkpoint, the very seq back.
        assertSame(sd, r.editSeq(sd, SceneOps.deleteScene(sd)))
        assertEquals(sc, r.undo(sd))
        assertEquals(sb, r.undo(sc))
        assertEquals(sa, r.undo(sb))
        assertEquals(s0, r.undo(sa))
        assertNull(r.undo(s0))
    }

    @Test
    fun `a switch takes over at once, at the next bar line or at the pattern's end`() {
        assertEquals(SwitchTime.IMMEDIATE, SwitchTime.DEFAULT)
        assertEquals(listOf("now", "bar", "ptn"), SwitchTime.entries.map { it.id })
        assertEquals(SwitchTime.PATTERN, SwitchTime.of("ptn"))
        assertNull(SwitchTime.of("song"))
        val now = SwitchTime.IMMEDIATE
        assertEquals(listOf(101L, 100L, -3L, 0L), listOf(100.2, 100.0, -3.5, -0.5).map { SceneOps.switchTick(now, it, 384) })
        // A press exactly on a line switches there.
        assertEquals(
            listOf(0L, 384L, 384L, 384L, 768L, 0L, 3840L),
            listOf(0.0, 1.0, 383.9, 384.0, 384.5, -10.0, 3840.0).map { SceneOps.switchTick(SwitchTime.BAR, it, 768) },
        )
        assertEquals(
            listOf(0L, 768L, 768L, 1536L),
            listOf(0.0, 100.0, 768.0, 800.0).map { SceneOps.switchTick(SwitchTime.PATTERN, it, 768) },
        )
        assertEquals(2304L, SceneOps.switchTick(SwitchTime.PATTERN, 1153.0, 1152))
        assertEquals(1152L, SceneOps.switchTick(SwitchTime.PATTERN, 1152.0, 1152))
    }

    @Test
    fun `the lines of a switch count from the tick the pattern started at`() {
        // A 2-bar pattern that started at tick 100: its bar lines are 484, 868, ..., its ends 868, 1636, ...
        assertEquals(listOf(100L, 484L, 484L, 868L), listOf(100.0, 101.0, 484.0, 484.5).map { SceneOps.switchTick(SwitchTime.BAR, it, 768, 100) })
        assertEquals(listOf(100L, 868L, 868L, 1636L), listOf(100.0, 300.0, 868.0, 868.5).map { SceneOps.switchTick(SwitchTime.PATTERN, it, 768, 100) })
        // Now is now whatever the anchor.
        assertEquals(301L, SceneOps.switchTick(SwitchTime.IMMEDIATE, 300.2, 768, 100))
        // Started at 0, as before.
        assertEquals(768L, SceneOps.switchTick(SwitchTime.PATTERN, 100.0, 768, 0))
    }
}
