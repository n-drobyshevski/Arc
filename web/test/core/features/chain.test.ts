// Port of core/src/test/kotlin/dev/arc/ep133/features/ChainTest.kt (the same cases, in the same order).
import { describe, expect, it } from 'vitest'
import { Chain, ChainPlay, chain, chainPlay, chainStep, type ChainAdvance, type ChainStep } from '../../../src/core/features/chain'
import { ChainOps } from '../../../src/core/features/chainOps'
import { Patterns, ProjectSeq, pattern, patternNote, projectSeq, scene, type Scene } from '../../../src/core/features/pattern'
import { PatternRecorder } from '../../../src/core/features/patternRecorder'
import { SceneOps } from '../../../src/core/features/scenes'

const scenes = (n: number): Scene[] => Array.from({ length: n }, () => scene())

const steps = (...s: [number, number][]): ChainStep[] => s.map(([sc, passes]) => chainStep(sc, passes))

const chained = (n: number, on: boolean, ...s: [number, number][]): ProjectSeq => projectSeq([], scenes(n), 0, chain(steps(...s), on))

const kick = pattern(1, [patternNote(0, 0, 24)])

const adv = (play: ChainPlay, sc: number | null): ChainAdvance => ({ play, scene: sc })

describe('ChainTest', () => {
  it('a project starts with no chain', () => {
    expect(ProjectSeq.DEFAULT.chain).toEqual(chain())
    expect(Chain.isBlank(ProjectSeq.DEFAULT.chain)).toBe(true)
    expect(Chain.MAX_STEPS).toBe(64)
    expect(Chain.PASSES).toEqual([1, 2, 4, 8])
  })

  it('a project holds its chain to its scenes', () => {
    // A step naming a scene past the last is dropped; passes held to 1..8; off when no step is left.
    const p = chained(2, true, [0, 0], [1, 9], [2, 1], [-1, 1])
    expect(p.chain.steps).toEqual(steps([0, 1], [1, 8]))
    expect(p.chain.on).toBe(true)
    expect(chained(2, true, [5, 1]).chain.on).toBe(false)
    expect(projectSeq([], [scene()], 0, chain([], true)).chain.on).toBe(false)
    // 64 steps at most.
    expect(projectSeq([], scenes(2), 0, chain(Array.from({ length: 70 }, (_, i) => chainStep(i % 2)))).chain.steps).toHaveLength(64)
    // Fewer scenes drop the steps that named the ones gone.
    const q = ProjectSeq.withScenes(chained(3, true, [0, 2], [2, 1]), scenes(2))
    expect(q.chain.steps).toEqual(steps([0, 2]))
    // withChain holds the chain too, and is the very project when nothing changes.
    expect(ProjectSeq.withChain(q, q.chain)).toBe(q)
    expect(ProjectSeq.withChain(q, chain(steps([0, 2], [7, 1]), true)).chain.steps).toEqual(steps([0, 2]))
    // The patterns keep the chain.
    expect(ProjectSeq.withPattern(q, 0, 1, kick).chain).toEqual(q.chain)
  })

  it('deleting a scene removes its steps and moves the later ones down', () => {
    // Scenes 0..4 are empty; the one at index 2 is playing.
    const p = projectSeq([], scenes(5), 2, chain(steps([0, 1], [1, 2], [2, 4], [3, 1], [4, 8], [2, 1], [3, 2]), true))
    const d = SceneOps.deleteScene(p)
    expect(d.scenes).toHaveLength(4)
    expect(d.chain.steps).toEqual(steps([0, 1], [1, 2], [2, 1], [3, 8], [2, 2]))
    expect(d.chain.on).toBe(true)
    // The last scene: its steps go, nothing else moves.
    const last = projectSeq([], scenes(3), 2, chain(steps([2, 1], [0, 1], [2, 2]), true))
    expect(SceneOps.deleteScene(last).chain.steps).toEqual(steps([0, 1]))
    // A chain of that scene only is gone, and off.
    const only = projectSeq([], scenes(2), 1, chain(steps([1, 4]), true))
    expect(SceneOps.deleteScene(only).chain).toEqual(chain())
    // A scene with notes isn't deleted: the chain is as it was.
    const kept = ProjectSeq.withPattern(projectSeq([], scenes(2), 1, chain(steps([1, 1]), true)), 0, 1, kick)
    expect(SceneOps.deleteScene(kept)).toBe(kept)
    // ERASE + MAIN deletes an empty scene the same way.
    expect(SceneOps.eraseScene(p).seq).toEqual(d)
  })

  it('commit and inserting shift the later steps up, a new scene at the end changes nothing', () => {
    const p = projectSeq([], scenes(4), 1, chain(steps([0, 1], [1, 2], [2, 1], [3, 4]), true))
    // COMMIT copies scene 1 right after it: the steps naming scenes 2 and 3 name 3 and 4; the copy is in no step.
    const c = SceneOps.commit(p)
    expect(c.scenes).toHaveLength(5)
    expect(c.scene).toBe(2)
    expect(c.chain.steps).toEqual(steps([0, 1], [1, 2], [3, 1], [4, 4]))
    expect(c.chain.on).toBe(true)
    // A new scene goes last and nothing moves.
    const n = SceneOps.newScene(p)
    expect(n.scenes).toHaveLength(5)
    expect(n.chain).toEqual(p.chain)
    // Inserting at the front moves every step; past the end goes last and moves none.
    const front = ProjectSeq.withSceneInserted(p, 0, scene())
    expect(front.chain.steps).toEqual(steps([1, 1], [2, 2], [3, 1], [4, 4]))
    expect(front.scene).toBe(0)
    expect(ProjectSeq.withSceneInserted(p, 99, scene()).chain.steps).toEqual(p.chain.steps)
    expect(ProjectSeq.withSceneInserted(p, 99, scene()).scene).toBe(4)
    // None past 99 scenes.
    const full = projectSeq([], scenes(99), 0, chain(steps([98, 1])))
    expect(ProjectSeq.withSceneInserted(full, 0, scene())).toBe(full)
    expect(SceneOps.commit(full)).toBe(full)
    // Taking one out directly, and keeping the one playing.
    const r = ProjectSeq.withSceneRemoved(p, 0)
    expect(r.chain.steps).toEqual(steps([0, 2], [1, 1], [2, 4]))
    expect(r.scene).toBe(0)
    expect(ProjectSeq.withSceneRemoved(ProjectSeq.DEFAULT, 0)).toBe(ProjectSeq.DEFAULT)
  })

  it("the chain row's edits", () => {
    let p = projectSeq([], scenes(3), 1)
    // + adds the scene shown, one pass; the chain is not on by itself.
    p = ChainOps.add(p)
    expect(p.chain.steps).toEqual(steps([1, 1]))
    expect(p.chain.on).toBe(false)
    p = ChainOps.add(p, 2)
    expect(p.chain.steps).toEqual(steps([1, 1], [2, 1]))
    // A scene the project doesn't have changes nothing.
    expect(ChainOps.add(p, 3)).toBe(p)
    expect(ChainOps.add(p, -1)).toBe(p)
    // A tap cycles the passes x1 x2 x4 x8 and round.
    const cycled: number[] = []
    let t = p
    for (let i = 0; i < 5; i++) {
      t = ChainOps.cyclePasses(t, 0)
      cycled.push(t.chain.steps[0]!.passes)
    }
    expect(cycled).toEqual([2, 4, 8, 1, 2])
    expect(ChainOps.cyclePasses(p, 5)).toBe(p)
    // Fewer passes goes the other way round: x8 x4 x2 x1 x8.
    const fewer: number[] = []
    let u = p
    for (let i = 0; i < 5; i++) {
      u = ChainOps.fewerPasses(u, 0)
      fewer.push(u.chain.steps[0]!.passes)
    }
    expect(fewer).toEqual([8, 4, 2, 1, 8])
    expect(ChainOps.fewerPasses(p, 5)).toBe(p)
    expect(ChainOps.cyclePasses(ProjectSeq.withChain(p, chain(steps([0, 3]), false)), 0).chain.steps[0]!.passes).toBe(4)
    // ON.
    const on = ChainOps.setOn(p, true)
    expect(on.chain.on).toBe(true)
    expect(ChainOps.setOn(ProjectSeq.DEFAULT, true).chain.on).toBe(false)
    // Choosing a scene by hand turns it off, and is nothing when it was off.
    expect(ChainOps.handPicked(on).chain.on).toBe(false)
    expect(ChainOps.handPicked(p)).toBe(p)
    // A long press removes a step; the last one takes the chain off.
    expect(ChainOps.remove(on, 0).chain.steps).toEqual(steps([2, 1]))
    expect(ChainOps.remove(on, 2)).toBe(on)
    expect(ChainOps.remove(ChainOps.remove(on, 0), 0).chain).toEqual(chain())
    expect(ChainOps.clear(on).chain).toEqual(chain())
    // 64 steps at most.
    let full = projectSeq([], scenes(2))
    for (let i = 0; i < 70; i++) full = ChainOps.add(full, 1)
    expect(full.chain.steps).toHaveLength(64)
  })

  it('a chain starts at the first step with the scene showing, else the first step', () => {
    const p = chained(4, true, [0, 2], [1, 1], [2, 1], [1, 4])
    expect(ChainPlay.start(p, 0)).toEqual(chainPlay(0))
    expect(ChainPlay.start(p, 1)).toEqual(chainPlay(1))
    expect(ChainPlay.start(p, 2)).toEqual(chainPlay(2))
    // A scene the chain doesn't have: the first step.
    expect(ChainPlay.start(p, 3)).toEqual(chainPlay(0))
    // The scene showing by default.
    expect(ChainPlay.start(ProjectSeq.withScenes(p, p.scenes, 1))).toEqual(chainPlay(1))
    expect(ChainPlay.start(ProjectSeq.DEFAULT)).toBeNull()
    expect(ChainPlay.scene(chainPlay(1), p.chain)).toBe(1)
    expect(ChainPlay.scene(chainPlay(9), p.chain)).toBeNull()
    expect(ChainPlay.passes(chainPlay(3), p.chain)).toBe(4)
    expect(ChainPlay.passes(chainPlay(9), p.chain)).toBe(1)
  })

  it("a scene's end plays the passes, then the next step, and the first after the last", () => {
    const c = chain(steps([0, 2], [1, 1], [0, 1]), true)
    // Step 0 has 2 passes: the second pass is the same scene, no switch.
    expect(ChainPlay.onSceneEnd(chainPlay(0, 1), c)).toEqual(adv(chainPlay(0, 2), null))
    // Then step 1, which switches to scene 1.
    expect(ChainPlay.onSceneEnd(chainPlay(0, 2), c)).toEqual(adv(chainPlay(1, 1), 1))
    expect(ChainPlay.onSceneEnd(chainPlay(1, 1), c)).toEqual(adv(chainPlay(2, 1), 0))
    // After the last step the chain goes back to the first: scene 0 again is already playing, so no switch.
    expect(ChainPlay.onSceneEnd(chainPlay(2, 1), c)).toEqual(adv(chainPlay(0, 1), null))
    // A full lap from the start, as the scheduler walks it.
    const walked: [number, number][] = []
    let a: ChainAdvance | null = adv(chainPlay(0), null)
    for (let i = 0; i < 8; i++) {
      walked.push([a!.play.step, a!.play.pass])
      a = ChainPlay.onSceneEnd(a!.play, c)
    }
    expect(walked).toEqual([[0, 1], [0, 2], [1, 1], [2, 1], [0, 1], [0, 2], [1, 1], [2, 1]])
    // One step of one pass loops on itself without a switch.
    const one = chain(steps([3, 1]), true)
    expect(ChainPlay.onSceneEnd(chainPlay(0, 1), one)).toEqual(adv(chainPlay(0, 1), null))
    // Two steps naming the same scene: no switch between them.
    const twice = chain(steps([1, 1], [1, 4], [2, 1]), true)
    expect(ChainPlay.onSceneEnd(chainPlay(0, 1), twice)).toEqual(adv(chainPlay(1, 1), null))
    expect(ChainPlay.onSceneEnd(chainPlay(1, 4), twice)).toEqual(adv(chainPlay(2, 1), 2))
    // A chain edited while it plays: a step no longer there starts it over; a pass past the passes is the last.
    expect(ChainPlay.onSceneEnd(chainPlay(7, 1), c)).toEqual(adv(chainPlay(0, 1), 0))
    expect(ChainPlay.onSceneEnd(chainPlay(0, 5), c)).toEqual(adv(chainPlay(1, 1), 1))
    expect(ChainPlay.onSceneEnd(chainPlay(0), chain())).toBeNull()
  })

  it('the chain is part of what undo goes back through', () => {
    const r = new PatternRecorder()
    const s0 = projectSeq([], scenes(3))
    r.seq = s0
    const s1 = r.editSeq(s0, ChainOps.add(ChainOps.add(s0, 0), 2))
    r.seq = s1
    const s2 = r.editSeq(s1, ChainOps.setOn(s1, true))
    r.seq = s2
    const s3 = r.editSeq(s2, SceneOps.commit(s2))
    expect(s3.chain.steps).toEqual(steps([0, 1], [3, 1]))
    expect(r.undo(s3)).toEqual(s2)
    expect(r.undo(s2)).toEqual(s1)
    expect(r.undo(s1)).toEqual(s0)
    expect(r.undo(s0)).toBeNull()
  })

  it('the chain is saved as version 3 and read back, a blank one not written', () => {
    const p = projectSeq([], [scene([1, 1, 1, 1]), scene([2, 1, 1, 1]), scene([3, 1, 1, 1])], 1, chain(steps([0, 2], [2, 1], [1, 8]), true))
    const all = Patterns.put(Patterns.EMPTY, 4, p)
    expect(Patterns.toJson(all)).toBe(
      '{"v":3,"projects":[{"project":4,"scene":1,"scenes":[[1,1,1,1],[2,1,1,1],[3,1,1,1]],"chain":{"on":true,"steps":[[0,2],[2,1],[1,8]]},"groups":[]}]}',
    )
    expect(Patterns.fromJson(Patterns.toJson(all))).toEqual(all)
    // Off is written as off; no steps, no chain key.
    const off = Patterns.put(Patterns.EMPTY, 4, ProjectSeq.withChain(p, chain(p.chain.steps, false)))
    expect(Patterns.toJson(off)).toContain('"on":false')
    expect(Patterns.fromJson(Patterns.toJson(off))).toEqual(off)
    expect(Patterns.toJson(Patterns.put(Patterns.EMPTY, 4, ProjectSeq.withChain(p, chain())))).not.toContain('chain')
    // A project whose only difference is its chain isn't blank.
    expect([...Patterns.put(Patterns.EMPTY, 5, ProjectSeq.withChain(projectSeq([], scenes(1)), chain(steps([0, 1]), false))).projects.keys()]).toEqual([5])
    // A version 2 file has no chain, and a version 2 reader's "chain" key is ignored.
    const v2 = '{"v":2,"projects":[{"project":1,"scene":0,"scenes":[[1,1,1,1],[2,2,2,2]],"chain":{"on":true,"steps":[[0,1]]},"groups":[]}]}'
    expect(Patterns.of(Patterns.fromJson(v2)!, 1).chain).toEqual(chain())
    expect(Patterns.of(Patterns.fromJson(v2)!, 1).scenes).toHaveLength(2)
    // Steps it can't read are skipped, passes held to 1..8, steps naming no scene dropped; on needs a real boolean.
    const v3 =
      '{"v":3,"projects":[{"project":1,"scenes":[[1,1,1,1],[2,2,2,2]],"chain":{"on":true,"steps":[[0,3],[1],"x",[1,"2"],[-1,1],[1,99],[5,1],[0,0],[1,1,1]]},"groups":[]},' +
      '{"project":2,"scenes":[[1,1,1,1]],"chain":{"on":"yes","steps":[[0,1]]},"groups":[]},' +
      '{"project":3,"scenes":[[1,1,1,1]],"chain":[[0,1]],"groups":[]},' +
      '{"project":4,"scenes":[[1,1,1,1]],"chain":{"on":true,"steps":[]},"groups":[]}]}'
    const read = Patterns.fromJson(v3)!
    expect(Patterns.of(read, 1).chain).toEqual(chain(steps([0, 3], [1, 8], [0, 1]), true))
    expect(Patterns.of(read, 2).chain).toEqual(chain(steps([0, 1]), false))
    expect(Patterns.of(read, 3).chain).toEqual(chain())
    expect(Patterns.of(read, 4).chain).toEqual(chain())
    // A version 3 file without a chain is a version 2 project.
    expect(Patterns.of(Patterns.fromJson('{"v":3,"projects":[{"project":1,"scenes":[[1,1,1,1],[2,2,2,2]],"groups":[]}]}')!, 1).chain).toEqual(chain())
  })
})
