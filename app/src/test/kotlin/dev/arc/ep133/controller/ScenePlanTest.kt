package dev.arc.ep133.controller

import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.Pattern
import dev.arc.ep133.features.PhaseAnchors
import dev.arc.ep133.features.PatternNote
import dev.arc.ep133.features.PatternRecorder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectSeq
import dev.arc.ep133.features.Scene
import dev.arc.ep133.features.SceneErase
import dev.arc.ep133.features.SceneOps
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.SwitchTime
import dev.arc.ep133.text.MirrorText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Scenes as the controller keeps them: the picks and their queue, the tick each mode gives, the CLIP row and its PAD flow, and what Live shows. */
class ScenePlanTest {
    private val kick = PhysicalPad(0, 9)
    private val snare = PhysicalPad(1, 11)
    private val names = mapOf(kick to "kick", snare to "snare")
    private val recorder = PatternRecorder()
    private val desk = SceneDesk { stepWord(StepNote(it, null), names[it], NoteNames.LETTERS) }
    private val bar = Seq.TICKS_PER_BAR
    private val idle = ProjectSeq.DEFAULT

    private fun note(tick: Int, pad: PhysicalPad = kick) = PatternNote(tick, pad.offset, 24)

    // [seq] with [group]'s pattern [n] holding [notes], [bars] long.
    private fun with(seq: ProjectSeq, group: Int, n: Int, bars: Int, vararg notes: PatternNote) = seq.withPattern(group, n, Pattern(bars, notes.toList()))

    // Two scenes, the first playing: [1,1,1,1] and [2,2,2,2].
    private fun twoScenes() = SceneOps.selectScene(SceneOps.newScene(idle), 0)

    // 99 scenes, the last playing.
    private fun fullScenes(): ProjectSeq {
        var s = idle
        repeat(Seq.MAX_SCENES - 1) { s = SceneOps.newScene(s) }
        return s
    }

    @Test
    fun `stopped, a pick plays at once, and the grid it was made on closes`() {
        desk.open(0)
        desk.grid(1)
        val out = desk.pickPattern(idle, 1, 5, at = null, time = SwitchTime.BAR)
        assertEquals(5, out.selected(1))
        assertEquals(0, desk.waiting)
        assertNull(desk.gridGroup)
        assertEquals("Group B, pattern 5, 1 bar", desk.said)
        // Held to 1..99.
        assertEquals(99, desk.pickPattern(idle, 0, 250, null, SwitchTime.BAR).selected(0))
        assertEquals(1, desk.pickPattern(idle, 0, -3, null, SwitchTime.BAR).selected(0))
        // A new scene, or the scene picked, plays at once too.
        assertEquals(1, desk.pickScene(twoScenes(), 1, null, SwitchTime.PATTERN).scene)
        assertEquals(2, desk.pickScene(twoScenes(), 2, null, SwitchTime.PATTERN).scene)
        assertEquals(0, desk.waiting)
    }

    @Test
    fun `playing, a pick waits for its tick, the sequencer as it was, and Live shows it queued`() {
        val seq = with(idle, 1, 1, 2)
        val out = desk.pickPattern(seq, 1, 5, at = 100.0, time = SwitchTime.PATTERN)
        assertSame(seq, out)
        assertEquals(mapOf(1 to QueuedPick(5, 2L * bar, SwitchTime.PATTERN)), desk.targets(seq))
        val ui = desk.ui(seq, SwitchTime.PATTERN)
        assertEquals(1, ui.groups[1].number)
        assertEquals(5, ui.groups[1].queued)
        assertNull(ui.groups[0].queued)
        assertEquals("B → 05 at pattern end", ui.status)
        assertEquals("Group B, pattern 5, at pattern end", ui.said)
        // Immediate: queued for the next whole tick, and no word for it.
        val now = SceneDesk { "" }
        now.pickPattern(seq, 0, 3, at = 100.2, time = SwitchTime.IMMEDIATE)
        assertEquals(mapOf(0 to QueuedPick(3, 101, SwitchTime.IMMEDIATE)), now.targets(seq))
        assertNull(now.ui(seq, SwitchTime.IMMEDIATE).status)
        assertEquals("Group A, pattern 3, 1 bar", now.said)
    }

    @Test
    fun `the tick of a pick is the setting's, now, the bar line or the pattern's end, and a press on a line switches there`() {
        assertEquals(listOf(101L, 100L), listOf(100.2, 100.0).map { queueTick(SwitchTime.IMMEDIATE, it, bar) })
        assertEquals(listOf(384L, 384L, 768L), listOf(100.0, 384.0, 384.5).map { queueTick(SwitchTime.BAR, it, 2 * bar) })
        assertEquals(listOf(768L, 768L, 1536L), listOf(100.0, 768.0, 768.5).map { queueTick(SwitchTime.PATTERN, it, 2 * bar) })
        // Counting in, no sooner than bar 1.
        assertEquals(listOf(0L, 0L, 0L), SwitchTime.entries.map { queueTick(it, -1000.0, bar) })
    }

    @Test
    fun `a group's pick takes its own pattern's length under PATTERN, a scene's the longest, and BAR is one line for all`() {
        // Group A 1 bar, B 2, C 4, D 1.
        val seq = with(with(with(twoScenes(), 1, 1, 2), 2, 1, 4), 3, 1, 1)
        for ((g, end) in listOf(0 to 384L, 1 to 768L, 2 to 1536L)) {
            val d = SceneDesk { "" }
            d.pickPattern(seq, g, 7, 100.0, SwitchTime.PATTERN)
            assertEquals(end, d.targets(seq).getValue(g).at)
        }
        val patternEnd = SceneDesk { "" }
        patternEnd.pickScene(seq, 1, 100.0, SwitchTime.PATTERN)
        // All four groups at the end of the longest, A's pattern 1 playing 1 bar notwithstanding.
        assertEquals(setOf(1536L), patternEnd.targets(seq).values.map { it.at }.toSet())
        assertEquals(setOf(0, 1, 2, 3), patternEnd.targets(seq).keys)
        val barEnd = SceneDesk { "" }
        barEnd.pickScene(seq, 1, 100.0, SwitchTime.BAR)
        assertEquals(setOf(384L), barEnd.targets(seq).values.map { it.at }.toSet())
        assertEquals("→ S02 at bar end", barEnd.ui(seq, SwitchTime.BAR).status)
        assertEquals(2, barEnd.ui(seq, SwitchTime.BAR).sceneQueued)
        assertEquals(2, barEnd.ui(seq, SwitchTime.BAR).groups[0].queued)
    }

    @Test
    fun `a later pick of the group replaces its queue, one of what plays cancels it, and other groups keep theirs`() {
        val seq = idle
        desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR)
        desk.pickPattern(seq, 2, 3, 100.0, SwitchTime.BAR)
        desk.pickPattern(seq, 1, 7, 200.0, SwitchTime.BAR)
        assertEquals(mapOf(1 to 7, 2 to 3), desk.targets(seq).mapValues { it.value.to })
        assertEquals("B → 07, C → 03 at bar end", desk.ui(seq, SwitchTime.BAR).status)
        desk.pickPattern(seq, 1, 1, 200.0, SwitchTime.BAR)
        assertEquals(mapOf(2 to 3), desk.targets(seq).mapValues { it.value.to })
        assertEquals(1, desk.waiting)
    }

    @Test
    fun `a scene change cancels the groups' picks, and a group's pick cancels the scene's`() {
        val seq = twoScenes()
        desk.pickPattern(seq, 0, 9, 100.0, SwitchTime.BAR)
        desk.pickScene(seq, 1, 100.0, SwitchTime.BAR)
        assertEquals(1, desk.waiting)
        assertEquals(setOf(0, 1, 2, 3), desk.targets(seq).keys)
        assertEquals(listOf(2, 2, 2, 2), desk.targets(seq).values.map { it.to })
        desk.pickPattern(seq, 0, 9, 100.0, SwitchTime.BAR)
        assertEquals(mapOf(0 to 9), desk.targets(seq).mapValues { it.value.to })
        assertNull(desk.ui(seq, SwitchTime.BAR).sceneQueued)
        // The scene playing picked is no change: it cancels the scene's queue.
        desk.pickScene(seq, 1, 100.0, SwitchTime.BAR)
        desk.pickScene(seq, 0, 100.0, SwitchTime.BAR)
        assertEquals(0, desk.waiting)
        assertTrue(desk.targets(seq).isEmpty())
    }

    @Test
    fun `a scene queued for a scene sharing a group's pattern leaves that group playing it`() {
        val seq = ProjectSeq(scenes = listOf(Scene(listOf(1, 1, 1, 1)), Scene(listOf(1, 3, 1, 4))))
        desk.pickScene(seq, 1, 100.0, SwitchTime.BAR)
        assertEquals(mapOf(1 to 3, 3 to 4), desk.targets(seq).mapValues { it.value.to })
        val ui = desk.ui(seq, SwitchTime.BAR)
        assertEquals(listOf(null, 3, null, 4), ui.groups.map { it.queued })
    }

    @Test
    fun `- and + step from the number shown, the queued one, wrapping round 1 to 99`() {
        val seq = idle
        desk.stepPattern(seq, 0, 1, 100.0, SwitchTime.BAR)
        desk.stepPattern(seq, 0, 1, 100.0, SwitchTime.BAR)
        assertEquals(3, desk.targets(seq).getValue(0).to)
        // Back to the one playing: no queue.
        desk.stepPattern(seq, 0, -1, 100.0, SwitchTime.BAR)
        desk.stepPattern(seq, 0, -1, 100.0, SwitchTime.BAR)
        assertEquals(0, desk.waiting)
        assertEquals(99, desk.stepPattern(seq, 0, -1, null, SwitchTime.BAR).selected(0))
        assertEquals(1, desk.stepPattern(SceneOps.selectPattern(seq, 0, 99), 0, 1, null, SwitchTime.BAR).selected(0))
        assertEquals(listOf(99, 1, 2, 98), listOf(wrapPattern(1, -1), wrapPattern(99, 1), wrapPattern(1, 1), wrapPattern(99, -1)))
    }

    @Test
    fun `the scene's + past the last is a new scene, queued like the rest, and - stays on the first`() {
        val seq = twoScenes()
        desk.stepScene(seq, 1, 100.0, SwitchTime.BAR)
        assertEquals(2, desk.ui(seq, SwitchTime.BAR).sceneQueued)
        desk.stepScene(seq, 1, 100.0, SwitchTime.BAR)
        // The third: the scene to come.
        assertEquals(3, desk.ui(seq, SwitchTime.BAR).sceneQueued)
        desk.stepScene(seq, 1, 100.0, SwitchTime.BAR)
        assertEquals(3, desk.ui(seq, SwitchTime.BAR).sceneQueued)
        // The new scene's patterns are the groups' next free ones.
        assertEquals(listOf(2, 2, 2, 2), desk.targets(seq).values.map { it.to })
        val out = desk.due(seq, 384.0)
        assertEquals(3, out.scenes.size)
        assertEquals(2, out.scene)
        assertEquals("Scene 3 of 3, patterns A 2, B 2, C 2, D 2", desk.said)
        // - from the first scene is no change.
        val first = SceneDesk { "" }
        assertEquals(0, first.stepScene(seq, -1, null, SwitchTime.BAR).scene)
        first.stepScene(seq, -1, 100.0, SwitchTime.BAR)
        assertEquals(0, first.waiting)
        // At 99 scenes + past the last has nowhere to go.
        val full = fullScenes()
        val last = SceneDesk { "" }
        last.stepScene(full, 1, 100.0, SwitchTime.BAR)
        assertEquals(0, last.waiting)
        assertSame(full, last.stepScene(full, 1, null, SwitchTime.BAR))
    }

    @Test
    fun `NEXT FREE picks the first pattern with no notes after the number shown`() {
        var seq = idle
        for (n in 1..3) seq = with(seq, 0, n, 1, note(0))
        assertEquals(4, desk.pickNextFree(seq, 0, null, SwitchTime.BAR).selected(0))
        // Playing, queued; asked again, it goes on from the queued number.
        desk.pickNextFree(seq, 0, 100.0, SwitchTime.BAR)
        assertEquals(4, desk.targets(seq).getValue(0).to)
        seq = with(seq, 0, 4, 1, note(0))
        desk.pickNextFree(seq, 0, 100.0, SwitchTime.BAR)
        assertEquals(5, desk.targets(seq).getValue(0).to)
    }

    @Test
    fun `the picks take over as the playhead passes their ticks, each in its turn`() {
        // A 1 bar, B 2: BAR and PATTERN give their own ticks.
        val seq = with(idle, 1, 1, 2)
        desk.pickPattern(seq, 0, 5, 100.0, SwitchTime.PATTERN)
        desk.pickPattern(seq, 1, 6, 100.0, SwitchTime.PATTERN)
        assertSame(seq, desk.due(seq, 383.5))
        assertEquals(2, desk.waiting)
        val a = desk.due(seq, 384.0)
        assertEquals(listOf(5, 1), listOf(a.selected(0), a.selected(1)))
        assertEquals(1, desk.waiting)
        assertEquals("Group A, pattern 5, 1 bar", desk.said)
        assertNull(desk.status)
        val b = desk.due(a, 900.0)
        assertEquals(listOf(5, 6), listOf(b.selected(0), b.selected(1)))
        assertEquals(0, desk.waiting)
        assertNull(desk.dueTick())
        // The ticks the controller wakes for.
        desk.pickPattern(b, 2, 7, 1000.0, SwitchTime.BAR)
        desk.pickPattern(b, 3, 8, 1000.0, SwitchTime.PATTERN)
        assertEquals(1152L, desk.dueTick())
    }

    @Test
    fun `a scene change takes over every group at its tick, and a new scene is made then`() {
        val seq = twoScenes()
        desk.pickScene(seq, 1, 100.0, SwitchTime.BAR)
        assertSame(seq, desk.due(seq, 300.0))
        val out = desk.due(seq, 384.0)
        assertEquals(1, out.scene)
        assertEquals(0, desk.waiting)
        assertEquals("Scene 2 of 2, patterns A 2, B 2, C 2, D 2", desk.said)
    }

    @Test
    fun `a pattern taking over starts at its bar 1 on that tick, and only the groups it changes`() {
        val seq = ProjectSeq(scenes = listOf(Scene(listOf(1, 1, 1, 1)), Scene(listOf(1, 3, 1, 4))))
        assertEquals(PhaseAnchors.ZERO, desk.phase)
        // A scene change: the groups that change start at the scene's tick, the others go on.
        desk.pickScene(seq, 1, 100.0, SwitchTime.BAR)
        desk.due(seq, 384.0)
        assertEquals(listOf(0L, 384L, 0L, 384L), (0 until 4).map { desk.phase.of(it) })
        // A pick of a group: now, the next whole tick.
        val out = SceneOps.selectScene(seq, 1)
        desk.pickPattern(out, 2, 5, 500.2, SwitchTime.IMMEDIATE)
        assertEquals(384L, desk.phase.of(1))
        val after = desk.due(out, 501.0)
        assertEquals(5, after.selected(2))
        assertEquals(listOf(0L, 384L, 501L, 384L), (0 until 4).map { desk.phase.of(it) })
        // The transport starting afresh, or another project, puts them back to bar 1.
        desk.restart()
        assertEquals(PhaseAnchors.ZERO, desk.phase)
        desk.pickPattern(after, 0, 7, 10.0, SwitchTime.IMMEDIATE)
        desk.due(after, 11.0)
        assertEquals(10L, desk.phase.of(0))
        desk.reset()
        assertEquals(PhaseAnchors.ZERO, desk.phase)
    }

    @Test
    fun `STOP leaves where the patterns started alone, the next PLAY putting them back`() {
        val seq = twoScenes()
        desk.pickPattern(seq, 0, 9, 100.0, SwitchTime.BAR)
        val out = desk.flush(seq)
        assertEquals(9, out.selected(0))
        assertEquals(PhaseAnchors.ZERO, desk.phase)
    }

    @Test
    fun `Bar end and Pattern end for a group's pick are its own pattern's lines from where it started`() {
        // Group A's 2-bar pattern 2 started at tick 100 (an immediate pick).
        val seq = with(with(idle, 0, 1, 2), 0, 2, 2)
        desk.pickPattern(seq, 0, 2, 100.0, SwitchTime.IMMEDIATE)
        val on = desk.due(seq, 100.0)
        assertEquals(100L, desk.phase.of(0))
        fun queuedAt(at: Double, time: SwitchTime): Long {
            desk.pickPattern(on, 0, 7, at, time)
            return desk.targets(on).getValue(0).at
        }
        assertEquals(484L, queuedAt(300.0, SwitchTime.BAR))
        assertEquals(868L, queuedAt(300.0, SwitchTime.PATTERN))
        // A line the press is on switches there.
        assertEquals(868L, queuedAt(868.0, SwitchTime.PATTERN))
        assertEquals(1636L, queuedAt(868.5, SwitchTime.PATTERN))
        // Another group goes by the transport's lines.
        desk.pickPattern(on, 1, 7, 300.0, SwitchTime.BAR)
        assertEquals(384L, desk.targets(on).getValue(1).at)
    }

    @Test
    fun `a scene's Bar end is the transport's line, its Pattern end the earliest end of the longest patterns from where they started`() {
        // Groups A and B on 4-bar patterns 3, started at ticks 100 and 300.
        val seq = with(with(twoScenes(), 0, 3, 4), 1, 3, 4)
        desk.pickPattern(seq, 0, 3, 100.0, SwitchTime.IMMEDIATE)
        val a = desk.due(seq, 100.0)
        desk.pickPattern(a, 1, 3, 300.0, SwitchTime.IMMEDIATE)
        val on = desk.due(a, 300.0)
        assertEquals(listOf(100L, 300L, 0L, 0L), (0 until 4).map { desk.phase.of(it) })
        desk.pickScene(on, 1, 500.0, SwitchTime.PATTERN)
        assertEquals(setOf(1636L), desk.targets(on).values.map { it.at }.toSet())
        desk.pickScene(on, 1, 500.0, SwitchTime.BAR)
        assertEquals(setOf(768L), desk.targets(on).values.map { it.at }.toSet())
    }

    @Test
    fun `an open pattern left closes by its own bars`() {
        val open = Pattern(2, listOf(PatternNote(10, 0, 24)), open = true)
        // Started at tick 384: at global 384 + 700 it is in its bar 2.
        assertEquals(2, closedAt(open, 384.0 + 700, 384).bars)
        assertEquals(4, closedAt(open, 384.0 + 1000, 384).bars)
        assertEquals(4, closedAt(open, 384.0 * 3 - 1, 0).bars)
    }

    @Test
    fun `STOP applies every pick waiting at once`() {
        val seq = with(twoScenes(), 0, 1, 2, note(0))
        desk.pickScene(seq, 1, 100.0, SwitchTime.PATTERN)
        val out = desk.flush(seq)
        assertEquals(1, out.scene)
        assertEquals(0, desk.waiting)
        desk.pickPattern(out, 2, 9, 100.0, SwitchTime.PATTERN)
        desk.pickPattern(out, 3, 8, 100.0, SwitchTime.BAR)
        val both = desk.flush(out)
        assertEquals(listOf(9, 8), listOf(both.selected(2), both.selected(3)))
        // Nothing waiting, nothing changes.
        assertSame(both, desk.flush(both))
    }

    @Test
    fun `a pattern left while it is open is closed as punch-out closes it, so it loops when picked again`() {
        val notes = listOf(note(10), note(500))
        val open = Pattern(1, notes, open = true)
        // 800 ticks gone: 3 bars, rounded up to 4.
        assertEquals(Pattern(4, notes), closedAt(open, 800.0))
        assertEquals(Pattern(2, notes), closedAt(open, 100.0))
        assertEquals(Pattern(8, notes), closedAt(open, 5000.0))
        assertEquals(Pattern(1), closedAt(Pattern(4, open = true), 800.0))
        val closed = Pattern(2, notes)
        assertSame(closed, closedAt(closed, 800.0))
        val seq = idle.withPattern(0, 1, open)
        desk.pickPattern(seq, 0, 2, 799.5, SwitchTime.IMMEDIATE)
        val out = desk.due(seq, 800.0)
        assertEquals(2, out.selected(0))
        assertEquals(Pattern(4, notes), out.pattern(0, 1))
        // A scene change closes those of the groups it changes only.
        val shared = ProjectSeq(scenes = listOf(Scene(listOf(1, 1, 1, 1)), Scene(listOf(1, 2, 1, 1)))).withPattern(0, 1, open).withPattern(1, 1, open)
        desk.pickScene(shared, 1, 799.5, SwitchTime.IMMEDIATE)
        val moved = desk.due(shared, 800.0)
        assertTrue(moved.pattern(0, 1).open)
        assertFalse(moved.pattern(1, 1).open)
    }

    @Test
    fun `a pattern left while it is open is closed at the pick's tick, not where the playhead was found past it`() {
        val notes = listOf(note(10), note(500))
        val seq = idle.withPattern(0, 1, Pattern(1, notes, open = true))
        // Left at the line of bar 3 (tick 768), found a little after it: 2 bars gone, not 3 (rounded up to 4).
        desk.pickPattern(seq, 0, 2, 700.0, SwitchTime.BAR)
        val out = desk.due(seq, 770.0)
        assertEquals(2, out.selected(0))
        assertEquals(Pattern(2, notes), out.pattern(0, 1))
    }

    @Test
    fun `COMMIT and the CLR hold are one UNDO step each, at once, and drop the picks waiting`() {
        val seq = with(twoScenes(), 0, 1, 1, note(0))
        recorder.seq = seq
        desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR)
        val committed = desk.commit(seq, recorder)
        assertEquals(3, committed.scenes.size)
        assertEquals(1, committed.scene)
        assertEquals(0, desk.waiting)
        assertEquals("S02 committed", desk.status)
        assertEquals("Scene 2 committed", desk.said)
        assertEquals(seq, recorder.undo(committed))
        // The scene's notes: CLR, which the line reads from canDelete.
        assertFalse(desk.ui(seq, SwitchTime.BAR).canDelete)
        desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR)
        val cleared = desk.erase(seq, recorder)!!
        assertEquals(SceneErase.CLEARED, cleared.erase)
        assertTrue(cleared.seq.playing().isEmpty)
        assertEquals(2, cleared.seq.scenes.size)
        assertEquals(0, desk.waiting)
        assertEquals("S01 cleared", desk.status)
        assertEquals(MirrorText.CLEARED_SCENE, desk.said)
        assertEquals(seq, recorder.undo(cleared.seq))
    }

    @Test
    fun `an empty scene that isn't the only one is deleted, any other is cleared, and the only empty one does nothing`() {
        val two = SceneOps.newScene(idle)
        recorder.seq = two
        val ui = desk.ui(two, SwitchTime.BAR)
        assertTrue(ui.canDelete)
        val deleted = desk.erase(two, recorder)!!
        assertEquals(SceneErase.DELETED, deleted.erase)
        assertEquals(1, deleted.seq.scenes.size)
        assertEquals("S02 deleted", desk.status)
        assertEquals(MirrorText.DELETED_SCENE, desk.said)
        assertEquals(two, recorder.undo(deleted.seq))
        // The only scene, empty: nothing to clear, and nothing to delete.
        assertFalse(desk.ui(idle, SwitchTime.BAR).canDelete)
        assertNull(desk.erase(idle, PatternRecorder()))
        assertFalse(PatternRecorder().canUndo)
        // With notes the scene can't be deleted, only cleared.
        val noted = with(two, 1, 2, 1, note(0))
        assertFalse(desk.ui(noted, SwitchTime.BAR).canDelete)
        assertEquals(SceneErase.CLEARED, desk.erase(noted, PatternRecorder())!!.erase)
    }

    @Test
    fun `COMMIT at 99 scenes does nothing but say so`() {
        val full = fullScenes()
        val r = PatternRecorder()
        assertSame(full, desk.commit(full, r))
        assertEquals(MirrorText.SCENES_FULL, desk.status)
        assertFalse(r.canUndo)
    }

    @Test
    fun `PTN copies the focused group's pattern, PASTE replaces the one the focus is on, and UNDO takes it back`() {
        val seq = with(idle, 0, 1, 2, note(0), note(400, snare))
        recorder.seq = seq
        desk.open(0)
        desk.copy(seq)
        assertEquals(ClipUi(ClipMode.PTN, "A01"), desk.ui(seq, SwitchTime.BAR).clip)
        assertEquals("A01 copied", desk.status)
        assertEquals("P01 copied.", desk.said)
        desk.focus(2)
        val out = desk.paste(seq, recorder)
        assertEquals(Pattern(2, seq.pattern(0, 1).notes.map { it.copy(id = 0) }), out.pattern(2, 1))
        assertEquals("C01 pasted", desk.status)
        assertEquals("Pasted into P01.", desk.said)
        assertEquals(seq, recorder.undo(out))
        // The clipboard stays for another paste.
        assertEquals(ClipUi(ClipMode.PTN, "A01"), desk.ui(seq, SwitchTime.BAR).clip)
    }

    @Test
    fun `BAR copies the bar page of the focused group and pastes into the page held to the group it lands in`() {
        val seq = with(idle, 0, 1, 2, note(10), note(400), note(500, snare))
        recorder.seq = seq
        desk.mode(ClipMode.BAR)
        desk.page(1)
        desk.copy(seq)
        assertEquals(ClipUi(ClipMode.BAR, "bar 2"), desk.ui(seq, SwitchTime.BAR).clip)
        assertEquals("A bar 2 copied", desk.status)
        assertEquals("Bar 2 copied.", desk.said)
        // Group B has one bar: the page shows, and pastes into, its bar 1.
        desk.focus(1)
        assertEquals(0, desk.ui(seq, SwitchTime.BAR).bar)
        val out = desk.paste(seq, recorder)
        assertEquals(listOf(16, 116), out.pattern(1, 1).notes.map { it.tick })
        assertEquals("B bar 1 pasted", desk.status)
        assertEquals("Pasted into bar 1.", desk.said)
        assertEquals(seq, recorder.undo(out))
        // The page itself is kept, held on the way out.
        desk.focus(0)
        assertEquals(1, desk.ui(seq, SwitchTime.BAR).bar)
        desk.page(500)
        assertEquals(1, desk.ui(seq, SwitchTime.BAR).bar)
    }

    @Test
    fun `PASTE with nothing of the mode's kind copied says so and changes nothing`() {
        val seq = with(idle, 0, 1, 1, note(0))
        val r = PatternRecorder()
        r.seq = seq
        // Nothing copied at all.
        for ((mode, word) in listOf(ClipMode.PTN to MirrorText.NO_PATTERN_COPIED, ClipMode.BAR to MirrorText.NO_BAR_COPIED, ClipMode.PAD to MirrorText.NO_PAD_COPIED)) {
            desk.mode(mode)
            assertSame(seq, desk.paste(seq, r))
            assertEquals(word, desk.status)
            assertEquals(PadStage.NONE, desk.padStage)
        }
        // A pattern copied, a bar asked for.
        desk.mode(ClipMode.PTN)
        desk.copy(seq)
        desk.mode(ClipMode.BAR)
        assertSame(seq, desk.paste(seq, r))
        assertEquals(MirrorText.NO_BAR_COPIED, desk.status)
        assertFalse(r.canUndo)
    }

    @Test
    fun `PAD asks for a tap to copy, then a tap to paste, in any group, and the pads taken play nothing`() {
        // The kick has notes at 0 and 400 of a 2-bar pattern; group B's pattern is a bar long.
        val seq = with(idle, 0, 1, 2, note(0), note(400), note(8, PhysicalPad(0, 3))).withPattern(1, 1, Pattern(1, listOf(note(5, snare), note(7, PhysicalPad(1, 4)))))
        recorder.seq = seq
        desk.open(0)
        desk.mode(ClipMode.PAD)
        // COPY waits for a pad; COPY again drops it.
        desk.copy(seq)
        assertEquals(PadStage.SOURCE, desk.padStage)
        assertEquals("Tap a pad", desk.ui(seq, SwitchTime.BAR).status)
        desk.copy(seq)
        assertEquals(PadStage.NONE, desk.padStage)
        desk.copy(seq)
        assertSame(seq, desk.padTap(kick, seq, recorder))
        assertEquals(PadStage.NONE, desk.padStage)
        assertEquals(ClipUi(ClipMode.PAD, "KICK"), desk.ui(seq, SwitchTime.BAR).clip)
        assertEquals("KICK copied", desk.status)
        assertEquals("KICK copied.", desk.said)
        // PASTE waits for the target, and says which pad is on the clipboard.
        desk.paste(seq, recorder)
        assertEquals(PadStage.TARGET, desk.padStage)
        assertEquals("KICK → tap target", desk.ui(seq, SwitchTime.BAR).status)
        val out = desk.padTap(snare, seq, recorder)
        assertEquals(PadStage.NONE, desk.padStage)
        // The snare's notes are the kick's, those past group B's one bar left out; its other pads stay.
        assertEquals(listOf(0), out.pattern(1, 1).notes.filter { it.offset == snare.offset }.map { it.tick })
        assertEquals(listOf(7), out.pattern(1, 1).notes.filter { it.offset == 4 }.map { it.tick })
        assertEquals("SNARE pasted", desk.status)
        assertEquals("Pasted onto SNARE.", desk.said)
        assertEquals(seq, recorder.undo(out))
        // A tap when none waits is nobody's.
        assertSame(seq, desk.padTap(kick, seq, recorder))
        assertEquals(ClipUi(ClipMode.PAD, "KICK"), desk.ui(seq, SwitchTime.BAR).clip)
    }

    @Test
    fun `the PAD flow ends with another mode, the grid, closing the panel, or ERASE`() {
        val seq = with(idle, 0, 1, 1, note(0))
        desk.open(0)
        desk.mode(ClipMode.PAD)
        desk.copy(seq)
        desk.mode(ClipMode.PTN)
        assertEquals(PadStage.NONE, desk.padStage)
        desk.mode(ClipMode.PAD)
        desk.copy(seq)
        desk.grid(1)
        assertEquals(PadStage.NONE, desk.padStage)
        desk.copy(seq)
        desk.close()
        assertEquals(PadStage.NONE, desk.padStage)
        desk.open(0)
        desk.copy(seq)
        desk.endStage()
        assertEquals(PadStage.NONE, desk.padStage)
        assertNull(desk.status)
    }

    @Test
    fun `the status shows what was done, else the PAD flow, else the grid, else the queue`() {
        val seq = idle
        desk.open(0)
        desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR)
        assertEquals("B → 05 at bar end", desk.ui(seq, SwitchTime.BAR).status)
        desk.grid(2)
        assertEquals("C · pick 01–99", desk.ui(seq, SwitchTime.BAR).status)
        assertEquals(2, desk.ui(seq, SwitchTime.BAR).gridGroup)
        desk.grid(null)
        desk.mode(ClipMode.PAD)
        desk.copy(seq)
        assertEquals("Tap a pad", desk.ui(seq, SwitchTime.BAR).status)
        desk.endStage()
        assertEquals("B → 05 at bar end", desk.ui(seq, SwitchTime.BAR).status)
        desk.mode(ClipMode.PTN)
        desk.copy(seq)
        assertEquals("A01 copied", desk.ui(seq, SwitchTime.BAR).status)
        // The next thing done clears it.
        desk.focus(1)
        assertEquals("B → 05 at bar end", desk.ui(seq, SwitchTime.BAR).status)
    }

    @Test
    fun `Live shows the scene, each column's number, filled patterns, next free one and length`() {
        var seq = twoScenes()
        for (n in listOf(1, 2, 3, 5)) seq = with(seq, 1, n, 1, note(0))
        seq = with(SceneOps.selectPattern(seq, 1, 3), 1, 3, 4, note(0))
        val ui = desk.ui(seq, SwitchTime.PATTERN)
        assertFalse(ui.open)
        assertEquals(0, ui.index)
        assertEquals(2, ui.count)
        assertEquals("S01", ui.label)
        assertEquals(SwitchTime.PATTERN, ui.switchTime)
        val b = ui.groups[1]
        assertEquals(3, b.number)
        assertEquals(setOf(1, 2, 3, 5), b.filled)
        assertEquals(4, b.nextFree)
        assertEquals(4, b.bars)
        assertTrue(ui.groups[0].filled.isEmpty())
        assertEquals(2, ui.groups[0].nextFree)
        // The next free one is from the number shown: the queued one, once there is one.
        desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR)
        assertEquals(6, desk.ui(seq, SwitchTime.BAR).groups[1].nextFree)
        // A pattern with notes makes the scene one that can't be deleted.
        assertFalse(ui.canDelete)
        assertNull(ui.clip)
        assertNull(ui.status)
        assertNull(ui.said)
    }

    @Test
    fun `closing keeps the picks waiting and the clipboard, another project drops the picks and keeps the clipboard`() {
        val seq = with(idle, 0, 1, 1, note(0))
        desk.open(2)
        assertEquals(2, desk.group)
        desk.copy(seq)
        desk.pickPattern(seq, 1, 5, 100.0, SwitchTime.BAR)
        desk.grid(1)
        desk.close()
        assertFalse(desk.open)
        assertNull(desk.gridGroup)
        assertNull(desk.said)
        assertEquals(1, desk.waiting)
        assertEquals(ClipMode.PTN, desk.ui(seq, SwitchTime.BAR).clip?.mode)
        desk.reset()
        assertEquals(0, desk.waiting)
        assertNull(desk.dueTick())
        // The clipboard is the device's too: it stays for the other project.
        assertEquals(ClipUi(ClipMode.PTN, "C01"), desk.ui(seq, SwitchTime.BAR).clip)
    }

    @Test
    fun `a pattern copied in one project pastes in another`() {
        val rec = PatternRecorder()
        val a = with(idle, 0, 1, 1, note(0))
        desk.open(0)
        desk.copy(a)
        desk.reset()
        val b = idle
        rec.seq = b
        val out = desk.paste(b, rec)
        assertEquals(listOf(note(0)), out.pattern(0, 1).notes.map { it.copy(id = 0) })
        assertEquals(ClipMode.PTN, desk.clipMode)
    }

    @Test
    fun `CHANGE cycles Immediate, Bar end, Pattern end`() {
        assertEquals(listOf(SwitchTime.BAR, SwitchTime.PATTERN, SwitchTime.IMMEDIATE), SwitchTime.entries.map { it.cycled() })
    }

    @Test
    fun `the grid's filled numbers are those with notes`() {
        val seq = with(with(idle, 0, 4, 2, note(0)), 0, 9, 1)
        assertEquals(setOf(4), filledPatterns(seq, 0))
        assertTrue(filledPatterns(seq, 1).isEmpty())
    }
}
