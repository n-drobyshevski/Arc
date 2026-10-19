// SCENES in the controller (ArcController.kt's SCENES section, state/pattern.ts): a pick plays at once while
// stopped and waits for its tick while the pattern plays (the plan carrying it as a queued switch), STOP
// applies what waits, COMMIT copies the scene (one UNDO step), and the CLIP row's PAD flow takes a pad's tap.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectPatterns } from '../../src/core/features/pattern'
import { physicalPad } from '../../src/core/features/padNotes'
import { MirrorText } from '../../src/core/text/mirrorText'
import { memoryStorage } from '../../src/platform/storage/settings'
import { disposeAll, liveHarness, until, type LiveHarness } from './liveHarness'

let clockSpy: { mockRestore(): void } | null = null
beforeEach(() => {
  const real = performance.now.bind(performance)
  clockSpy = vi.spyOn(performance, 'now').mockImplementation(() => real() + 100_000)
})

afterEach(() => {
  disposeAll()
  clockSpy?.mockRestore()
})

const A0 = physicalPad(0, 0)
const A4 = physicalPad(0, 4)
const ORDER = { 'arc.mirror.order': 'FROM_BOTTOM' }

async function liveOn(): Promise<LiveHarness> {
  const h = await liveHarness({ storage: memoryStorage(ORDER) })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  await vi.waitFor(() => expect(h.c.pattern.ui.value.project).toBe(1))
  await h.c.playPad(A0)
  h.c.releasePad(A0)
  return h
}

const now = (): number => performance.now()

/** A note recorded on [pad] into the pattern A plays, stopped after. */
async function recordOne(h: LiveHarness, pad = A0): Promise<void> {
  const p = h.c.pattern
  p.setCountIn(false)
  p.recordDown(now())
  await h.c.playPad(pad, true, false, now())
  h.c.releasePad(pad, now())
  p.stop()
}

describe('SCENES', () => {
  it('stopped, a pick plays at once; COMMIT copies the scene, one UNDO step', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    await recordOne(h)
    p.setSceneOpen(true, 0)
    expect(p.scene.value.open).toBe(true)
    expect(p.scene.value.label).toBe('S01')
    p.scenePatternStep(1, 1)
    expect(p.scene.value.groups[1]?.number).toBe(2)
    p.sceneCommit()
    expect(p.scene.value.label).toBe('S02')
    expect(p.scene.value.count).toBe(2)
    // The copy plays what played: A's notes are there.
    expect(p.ui.value.hasNotes[0]).toBe(true)
    p.undo()
    expect(p.scene.value.count).toBe(1)
    p.sceneStep(1)
    // + past the last is a new scene, each group on its next free pattern: A's notes aren't in it.
    expect(p.scene.value.label).toBe('S02')
    expect(p.ui.value.hasNotes[0]).toBe(false)
  })

  it('playing, a pick waits for its tick in the plan, and STOP applies it', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    await recordOne(h)
    p.setSceneSwitch('bar')
    p.setSceneOpen(true, 0)
    p.play()
    h.liveAudio.runAt(now() - 100)
    p.scenePatternStep(0, 1)
    const ui = p.scene.value
    expect(ui.groups[0]?.number).toBe(1)
    expect(ui.groups[0]?.queued).toBe(2)
    expect(ui.status).toBe(MirrorText.queuedLine(MirrorText.groupMove(0, 2), 'bar'))
    const plan = h.liveAudio.plans.at(-1)!
    expect(plan.queued?.get(0)?.atTick).toBe(384)
    p.stop()
    expect(p.scene.value.groups[0]?.number).toBe(2)
    expect(p.scene.value.groups[0]?.queued).toBeNull()
    expect(h.liveAudio.plans.at(-1)?.queued?.size ?? 0).toBe(0)
  })

  it("the CLIP row's PAD flow takes a pad's tap: COPY one pad, PASTE onto another", async () => {
    const h = await liveOn()
    const p = h.c.pattern
    await recordOne(h)
    p.setSceneOpen(true, 0)
    p.setClipMode('PAD')
    p.clipCopy()
    expect(p.scene.value.padStage).toBe('SOURCE')
    const presses = h.liveAudio.presses.length
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0, now())
    expect(h.liveAudio.presses.length).toBe(presses)
    expect(p.scene.value.clip?.mode).toBe('PAD')
    p.clipPaste()
    expect(p.scene.value.padStage).toBe('TARGET')
    await h.c.playPad(A4, true, false, now())
    h.c.releasePad(A4, now())
    const notes = ProjectPatterns.group(p.patternsNow, 0).notes
    expect(new Set(notes.map((n) => n.offset))).toEqual(new Set([0, 4]))
    expect(p.scene.value.padStage).toBe('NONE')
  })
})
