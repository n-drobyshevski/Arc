package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ChainTest {
    private fun scenes(n: Int) = List(n) { Scene() }

    private fun steps(vararg s: Pair<Int, Int>) = s.map { ChainStep(it.first, it.second) }

    private fun chained(n: Int, on: Boolean, vararg s: Pair<Int, Int>) = ProjectSeq(scenes = scenes(n), chain = Chain(steps(*s), on))

    private val kick = Pattern(1, listOf(PatternNote(0, 0, 24)))

    @Test
    fun `a project starts with no chain`() {
        assertEquals(Chain(), ProjectSeq.DEFAULT.chain)
        assertTrue(ProjectSeq.DEFAULT.chain.isBlank)
        assertEquals(64, Chain.MAX_STEPS)
        assertEquals(listOf(1, 2, 4, 8), Chain.PASSES)
    }

    @Test
    fun `a project holds its chain to its scenes`() {
        // A step naming a scene past the last is dropped; passes held to 1..8; off when no step is left.
        val p = chained(2, true, 0 to 0, 1 to 9, 2 to 1, -1 to 1)
        assertEquals(steps(0 to 1, 1 to 8), p.chain.steps)
        assertTrue(p.chain.on)
        assertFalse(chained(2, true, 5 to 1).chain.on)
        assertFalse(ProjectSeq(chain = Chain(emptyList(), true)).chain.on)
        // 64 steps at most.
        assertEquals(64, ProjectSeq(scenes = scenes(2), chain = Chain(List(70) { ChainStep(it % 2) })).chain.steps.size)
        // Fewer scenes drop the steps that named the ones gone.
        val q = chained(3, true, 0 to 2, 2 to 1).withScenes(scenes(2))
        assertEquals(steps(0 to 2), q.chain.steps)
        // withChain holds the chain too, and is the very project when nothing changes.
        assertSame(q, q.withChain(q.chain))
        assertEquals(steps(0 to 2), q.withChain(Chain(steps(0 to 2, 7 to 1), true)).chain.steps)
        // The patterns keep the chain.
        assertEquals(q.chain, q.withPattern(0, 1, kick).chain)
    }

    @Test
    fun `deleting a scene removes its steps and moves the later ones down`() {
        // Scenes 0..4 are empty; the one at index 2 is playing.
        val p = ProjectSeq(scenes = scenes(5), scene = 2, chain = Chain(steps(0 to 1, 1 to 2, 2 to 4, 3 to 1, 4 to 8, 2 to 1, 3 to 2), true))
        val d = SceneOps.deleteScene(p)
        assertEquals(4, d.scenes.size)
        assertEquals(steps(0 to 1, 1 to 2, 2 to 1, 3 to 8, 2 to 2), d.chain.steps)
        assertTrue(d.chain.on)
        // The last scene: its steps go, nothing else moves.
        val last = ProjectSeq(scenes = scenes(3), scene = 2, chain = Chain(steps(2 to 1, 0 to 1, 2 to 2), true))
        assertEquals(steps(0 to 1), SceneOps.deleteScene(last).chain.steps)
        // A chain of that scene only is gone, and off.
        val only = ProjectSeq(scenes = scenes(2), scene = 1, chain = Chain(steps(1 to 4), true))
        assertEquals(Chain(), SceneOps.deleteScene(only).chain)
        // A scene with notes isn't deleted: the chain is as it was.
        val kept = ProjectSeq(scenes = scenes(2), scene = 1, chain = Chain(steps(1 to 1), true)).withPattern(0, 1, kick)
        assertSame(kept, SceneOps.deleteScene(kept))
        // ERASE + MAIN deletes an empty scene the same way.
        assertEquals(d, SceneOps.eraseScene(p).seq)
    }

    @Test
    fun `commit and inserting shift the later steps up, a new scene at the end changes nothing`() {
        val p = ProjectSeq(scenes = scenes(4), scene = 1, chain = Chain(steps(0 to 1, 1 to 2, 2 to 1, 3 to 4), true))
        // COMMIT copies scene 1 right after it: the steps naming scenes 2 and 3 name 3 and 4; the copy is in no step.
        val c = SceneOps.commit(p)
        assertEquals(5, c.scenes.size)
        assertEquals(2, c.scene)
        assertEquals(steps(0 to 1, 1 to 2, 3 to 1, 4 to 4), c.chain.steps)
        assertTrue(c.chain.on)
        // A new scene goes last and nothing moves.
        val n = SceneOps.newScene(p)
        assertEquals(5, n.scenes.size)
        assertEquals(p.chain, n.chain)
        // Inserting at the front moves every step; past the end goes last and moves none.
        val front = p.withSceneInserted(0, Scene())
        assertEquals(steps(1 to 1, 2 to 2, 3 to 1, 4 to 4), front.chain.steps)
        assertEquals(0, front.scene)
        assertEquals(p.chain.steps, p.withSceneInserted(99, Scene()).chain.steps)
        assertEquals(4, p.withSceneInserted(99, Scene()).scene)
        // None past 99 scenes.
        val full = ProjectSeq(scenes = scenes(99), chain = Chain(steps(98 to 1)))
        assertSame(full, full.withSceneInserted(0, Scene()))
        assertSame(full, SceneOps.commit(full))
        // Taking one out directly, and keeping the one playing.
        val r = p.withSceneRemoved(0)
        assertEquals(steps(0 to 2, 1 to 1, 2 to 4), r.chain.steps)
        assertEquals(0, r.scene)
        assertSame(ProjectSeq.DEFAULT, ProjectSeq.DEFAULT.withSceneRemoved(0))
    }

    @Test
    fun `the chain row's edits`() {
        var p = ProjectSeq(scenes = scenes(3), scene = 1)
        // + adds the scene shown, one pass; the chain is not on by itself.
        p = ChainOps.add(p)
        assertEquals(steps(1 to 1), p.chain.steps)
        assertFalse(p.chain.on)
        p = ChainOps.add(p, 2)
        assertEquals(steps(1 to 1, 2 to 1), p.chain.steps)
        // A scene the project doesn't have changes nothing.
        assertSame(p, ChainOps.add(p, 3))
        assertSame(p, ChainOps.add(p, -1))
        // A tap cycles the passes x1 x2 x4 x8 and round.
        assertEquals(listOf(2, 4, 8, 1, 2), generateSequence(p) { ChainOps.cyclePasses(it, 0) }.drop(1).take(5).map { it.chain.steps[0].passes }.toList())
        assertSame(p, ChainOps.cyclePasses(p, 5))
        // Fewer passes goes the other way round: x8 x4 x2 x1 x8.
        assertEquals(listOf(8, 4, 2, 1, 8), generateSequence(p) { ChainOps.fewerPasses(it, 0) }.drop(1).take(5).map { it.chain.steps[0].passes }.toList())
        assertSame(p, ChainOps.fewerPasses(p, 5))
        assertEquals(4, ChainOps.cyclePasses(p.withChain(Chain(steps(0 to 3), false)), 0).chain.steps[0].passes)
        // ON.
        val on = ChainOps.setOn(p, true)
        assertTrue(on.chain.on)
        assertFalse(ChainOps.setOn(ProjectSeq.DEFAULT, true).chain.on)
        // Choosing a scene by hand turns it off, and is nothing when it was off.
        assertFalse(ChainOps.handPicked(on).chain.on)
        assertSame(p, ChainOps.handPicked(p))
        // A long press removes a step; the last one takes the chain off.
        assertEquals(steps(2 to 1), ChainOps.remove(on, 0).chain.steps)
        assertSame(on, ChainOps.remove(on, 2))
        assertEquals(Chain(), ChainOps.remove(ChainOps.remove(on, 0), 0).chain)
        assertEquals(Chain(), ChainOps.clear(on).chain)
        // 64 steps at most.
        var full = ProjectSeq(scenes = scenes(2))
        repeat(70) { full = ChainOps.add(full, 1) }
        assertEquals(64, full.chain.steps.size)
    }

    @Test
    fun `a chain starts at the first step with the scene showing, else the first step`() {
        val p = chained(4, true, 0 to 2, 1 to 1, 2 to 1, 1 to 4)
        assertEquals(ChainPlay(0), ChainPlay.start(p, 0))
        assertEquals(ChainPlay(1), ChainPlay.start(p, 1))
        assertEquals(ChainPlay(2), ChainPlay.start(p, 2))
        // A scene the chain doesn't have: the first step.
        assertEquals(ChainPlay(0), ChainPlay.start(p, 3))
        // The scene showing by default.
        assertEquals(ChainPlay(1), ChainPlay.start(p.copyScene(1)))
        assertNull(ChainPlay.start(ProjectSeq.DEFAULT))
        assertEquals(1, ChainPlay(1).scene(p.chain))
        assertNull(ChainPlay(9).scene(p.chain))
        assertEquals(4, ChainPlay(3).passes(p.chain))
        assertEquals(1, ChainPlay(9).passes(p.chain))
    }

    private fun ProjectSeq.copyScene(i: Int) = withScenes(scenes, i)

    @Test
    fun `a scene's end plays the passes, then the next step, and the first after the last`() {
        val c = Chain(steps(0 to 2, 1 to 1, 0 to 1), true)
        // Step 0 has 2 passes: the second pass is the same scene, no switch.
        assertEquals(ChainAdvance(ChainPlay(0, 2), null), ChainPlay(0, 1).onSceneEnd(c))
        // Then step 1, which switches to scene 1.
        assertEquals(ChainAdvance(ChainPlay(1, 1), 1), ChainPlay(0, 2).onSceneEnd(c))
        assertEquals(ChainAdvance(ChainPlay(2, 1), 0), ChainPlay(1, 1).onSceneEnd(c))
        // After the last step the chain goes back to the first: scene 0 again is already playing, so no switch.
        assertEquals(ChainAdvance(ChainPlay(0, 1), null), ChainPlay(2, 1).onSceneEnd(c))
        // A full lap from the start, as the scheduler walks it: the scene switched to each time (null: stay).
        val walked = generateSequence(ChainAdvance(ChainPlay(0), null)) { it.play.onSceneEnd(c) }.take(8).map { it.play.step to it.play.pass }.toList()
        assertEquals(listOf(0 to 1, 0 to 2, 1 to 1, 2 to 1, 0 to 1, 0 to 2, 1 to 1, 2 to 1), walked)
        // One step of one pass loops on itself without a switch.
        val one = Chain(steps(3 to 1), true)
        assertEquals(ChainAdvance(ChainPlay(0, 1), null), ChainPlay(0, 1).onSceneEnd(one))
        // Two steps naming the same scene: no switch between them.
        val twice = Chain(steps(1 to 1, 1 to 4, 2 to 1), true)
        assertEquals(ChainAdvance(ChainPlay(1, 1), null), ChainPlay(0, 1).onSceneEnd(twice))
        assertEquals(ChainAdvance(ChainPlay(2, 1), 2), ChainPlay(1, 4).onSceneEnd(twice))
        // A chain edited while it plays: a step no longer there starts it over; a pass past the passes is the last.
        assertEquals(ChainAdvance(ChainPlay(0, 1), 0), ChainPlay(7, 1).onSceneEnd(c))
        assertEquals(ChainAdvance(ChainPlay(1, 1), 1), ChainPlay(0, 5).onSceneEnd(c))
        assertNull(ChainPlay(0).onSceneEnd(Chain()))
    }

    @Test
    fun `the chain is part of what undo goes back through`() {
        val r = PatternRecorder()
        val s0 = ProjectSeq(scenes = scenes(3))
        r.seq = s0
        val s1 = r.editSeq(s0, ChainOps.add(ChainOps.add(s0, 0), 2))
        r.seq = s1
        val s2 = r.editSeq(s1, ChainOps.setOn(s1, true))
        r.seq = s2
        val s3 = r.editSeq(s2, SceneOps.commit(s2))
        assertEquals(steps(0 to 1, 3 to 1), s3.chain.steps)
        assertEquals(s2, r.undo(s3))
        assertEquals(s1, r.undo(s2))
        assertEquals(s0, r.undo(s1))
        assertNull(r.undo(s0))
    }

    @Test
    fun `the chain is saved as version 3 and read back, a blank one not written`() {
        val p = ProjectSeq(scenes = listOf(Scene(listOf(1, 1, 1, 1)), Scene(listOf(2, 1, 1, 1)), Scene(listOf(3, 1, 1, 1))), scene = 1, chain = Chain(steps(0 to 2, 2 to 1, 1 to 8), true))
        val all = Patterns.EMPTY.put(4, p)
        assertEquals(
            """{"v":3,"projects":[{"project":4,"scene":1,"scenes":[[1,1,1,1],[2,1,1,1],[3,1,1,1]],"chain":{"on":true,"steps":[[0,2],[2,1],[1,8]]},"groups":[]}]}""",
            all.toJson(),
        )
        assertEquals(all, Patterns.fromJson(all.toJson()))
        // Off is written as off; no steps, no chain key.
        val off = Patterns.EMPTY.put(4, p.withChain(p.chain.copy(on = false)))
        assertTrue(""""on":false""" in off.toJson())
        assertEquals(off, Patterns.fromJson(off.toJson()))
        assertFalse("chain" in Patterns.EMPTY.put(4, p.withChain(Chain())).toJson())
        // A project whose only difference is its chain isn't blank.
        assertEquals(setOf(5), Patterns.EMPTY.put(5, ProjectSeq(scenes = scenes(1)).withChain(Chain(steps(0 to 1), false))).projects.keys)
        // A version 2 file has no chain, and a version 2 reader's "chain" key is ignored.
        val v2 = """{"v":2,"projects":[{"project":1,"scene":0,"scenes":[[1,1,1,1],[2,2,2,2]],"chain":{"on":true,"steps":[[0,1]]},"groups":[]}]}"""
        assertEquals(Chain(), Patterns.fromJson(v2)!!.of(1).chain)
        assertEquals(2, Patterns.fromJson(v2)!!.of(1).scenes.size)
        // Steps it can't read are skipped, passes held to 1..8, steps naming no scene dropped; on needs a real boolean.
        val v3 = """{"v":3,"projects":[{"project":1,"scenes":[[1,1,1,1],[2,2,2,2]],"chain":{"on":true,"steps":[[0,3],[1],"x",[1,"2"],[-1,1],[1,99],[5,1],[0,0],[1,1,1]]},"groups":[]},
            |{"project":2,"scenes":[[1,1,1,1]],"chain":{"on":"yes","steps":[[0,1]]},"groups":[]},
            |{"project":3,"scenes":[[1,1,1,1]],"chain":[[0,1]],"groups":[]},
            |{"project":4,"scenes":[[1,1,1,1]],"chain":{"on":true,"steps":[]},"groups":[]}]}""".trimMargin()
        val read = Patterns.fromJson(v3)!!
        assertEquals(Chain(steps(0 to 3, 1 to 8, 0 to 1), true), read.of(1).chain)
        assertEquals(Chain(steps(0 to 1), false), read.of(2).chain)
        assertEquals(Chain(), read.of(3).chain)
        assertEquals(Chain(), read.of(4).chain)
        // A version 3 file without a chain is a version 2 project.
        assertEquals(Chain(), Patterns.fromJson("""{"v":3,"projects":[{"project":1,"scenes":[[1,1,1,1],[2,2,2,2]],"groups":[]}]}""")!!.of(1).chain)
    }
}
