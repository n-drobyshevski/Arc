// PRACTICE in the controller (ArcController.kt's PRACTICE section, state/pattern.ts): a web addition, as Kotlin has no
// test of it. A practice plays the scene from a bar counted in with the player's hits taken out, at its own speed, on
// one group's pads; a press is scored by when it is heard (in WAIT, by whether the step waits for it); ■ keeps the
// counts, ✕ puts the scene back, RECORD ends it, and COPY puts how it went on the clipboard.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectPatterns } from '../../src/core/features/pattern'
import { physicalPad } from '../../src/core/features/padNotes'
import { Practice, practiceSpec } from '../../src/core/features/practice'
import { PracticeText } from '../../src/core/text/practiceText'
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
const A1 = physicalPad(0, 1)
const ORDER = { 'arc.mirror.order': 'FROM_BOTTOM' }
const now = (): number => performance.now()

/** Live on, with A's pattern: A0 on steps 1 and 5 (ticks 0 and 96), placed with STEP. */
async function withBeat(): Promise<LiveHarness> {
  const h = await liveHarness({ storage: memoryStorage(ORDER) })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  await vi.waitFor(() => expect(h.c.pattern.ui.value.project).toBe(1))
  await h.c.playPad(A0)
  h.c.releasePad(A0)
  const p = h.c.pattern
  p.setStepOpen(true, 0)
  p.stepRecordDown()
  for (const step of [0, 4]) {
    p.stepJump(step)
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0, now())
  }
  p.stepRecordUp()
  p.setStepOpen(false)
  expect(ProjectPatterns.group(p.patternsNow, 0).notes.map((n) => n.tick)).toEqual([0, 96])
  return h
}

describe('PRACTICE', () => {
  it("plays the scene from a bar counted in, the player's hits taken out, on one group's pads; ✕ puts it back", async () => {
    const h = await withBeat()
    const p = h.c.pattern
    h.c.setLiveOneGroup(false)
    h.c.setLiveKeys(true)
    h.c.practise(practiceSpec(0))
    const ui = p.practice.value!
    expect(ui.place).toBe('A · 01')
    expect(ui.pads).toEqual([0])
    expect(ui.bars).toBe(1)
    expect(h.liveAudio.seqLog.filter((l) => l.startsWith('play:')).at(-1)).toMatch(/^play:1:/)
    expect(p.ui.value.phase).toBe('COUNT_IN')
    // The sequencer plays A's pattern without its hits; the pattern itself keeps them.
    expect(ProjectPatterns.group(h.liveAudio.plans.at(-1)!.patterns, 0).notes).toEqual([])
    expect(ProjectPatterns.group(p.patternsNow, 0).notes).toHaveLength(2)
    expect(h.c.settings.value.liveOneGroup).toBe(true)
    expect(h.c.settings.value.liveKeys).toBe(false)
    p.endPractice()
    expect(p.practice.value).toBeNull()
    expect(p.ui.value.phase).toBe('STOPPED')
    expect(ProjectPatterns.group(h.liveAudio.plans.at(-1)!.patterns, 0).notes).toHaveLength(2)
  })

  it('a group with no pad hits toasts and starts nothing', async () => {
    const h = await withBeat()
    const p = h.c.pattern
    h.c.practise(practiceSpec(1))
    expect(p.practice.value).toBeNull()
    expect(h.toasts.at(-1)?.text).toBe(PracticeText.nothingToPlay('B · 01'))
    expect(p.ui.value.phase).toBe('STOPPED')
  })

  it("a press is scored by when it is heard: in time, extra; the frame lights the next hit; ■ keeps the counts", async () => {
    const h = await withBeat()
    const p = h.c.pattern
    h.c.practise(practiceSpec(0, { speed: 50 }))
    const bpm = h.liveAudio.plans.at(-1)!.bpm
    expect(p.practice.value!.bpm).toBe(Math.round(bpm))
    // Tick 0 is heard now.
    const zero = now()
    h.liveAudio.runAt(zero, bpm)
    const frame = p.practiceFrame(zero)!
    expect(frame.upcoming.map(([t, d]) => [t.tick, d])).toEqual([[0, 0], [96, 96]])
    await h.c.playPad(A0, true, false, zero + Practice.msOf(2, bpm))
    h.c.releasePad(A0, zero + 100)
    expect(p.practice.value!.counts.onTime).toBe(1)
    // A1 has no hit: extra. Another pad's group isn't scored at all.
    await h.c.playPad(A1, true, false, zero + Practice.msOf(4, bpm))
    h.c.releasePad(A1, zero + 100)
    await h.c.playPad(physicalPad(1, 0), true, false, zero + Practice.msOf(4, bpm))
    h.c.releasePad(physicalPad(1, 0), zero + 100)
    expect(p.practice.value!.counts.extra).toBe(1)
    // Nothing was recorded.
    expect(ProjectPatterns.group(p.patternsNow, 0).notes).toHaveLength(2)
    expect(ProjectPatterns.group(p.patternsNow, 1).notes).toHaveLength(0)
    p.practiceStop()
    expect(p.ui.value.phase).toBe('STOPPED')
    expect(p.practice.value!.counts.onTime).toBe(1)
    // ▶ starts over, the counts cleared.
    p.practicePlay()
    expect(p.practice.value!.counts.onTime).toBe(0)
    expect(p.ui.value.phase).toBe('COUNT_IN')
  })

  it("WAIT stands still at each step until its pads are played; the keys' changes start it over", async () => {
    const h = await withBeat()
    const p = h.c.pattern
    h.c.practise(practiceSpec(0))
    p.changePractice((s) => ({ ...s, wait: true }))
    expect(p.ui.value.phase).toBe('STOPPED')
    expect(p.practice.value!.waitSteps).toBe(2)
    expect([...p.practice.value!.waiting]).toEqual([0])
    // Nothing plays meanwhile.
    expect(ProjectPatterns.isEmpty(h.liveAudio.plans.at(-1)!.patterns)).toBe(true)
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0, now())
    expect(p.practice.value!.waitStep).toBe(1)
    await h.c.playPad(A1, true, false, now())
    h.c.releasePad(A1, now())
    expect(p.practice.value!.counts.extra).toBe(1)
    // The same spec again changes nothing.
    const ui = p.practice.value
    p.changePractice((s) => ({ ...s }))
    expect(p.practice.value).toBe(ui)
  })

  it("RECORD, STEP and the scene chip end it; the line's PLAY plays or stops it", async () => {
    const h = await withBeat()
    const p = h.c.pattern
    h.c.practise(practiceSpec(0))
    p.play()
    expect(p.ui.value.phase).toBe('STOPPED')
    expect(p.practice.value).not.toBeNull()
    p.play()
    expect(p.ui.value.phase).toBe('COUNT_IN')
    p.recordDown(now())
    expect(p.practice.value).toBeNull()
    p.stop()
    h.c.practise(practiceSpec(0))
    p.stop()
    p.setStepOpen(true, 0)
    expect(p.practice.value).toBeNull()
    expect(p.step.value.open).toBe(true)
    h.c.practise(practiceSpec(0))
    expect(p.step.value.open).toBe(false)
    p.setSceneOpen(true, 0)
    expect(p.practice.value).toBeNull()
  })

  it("from Claude's page: a pattern's own group, else the scene's first with pad hits, at 75%; COPY says how it went", async () => {
    const h = await withBeat()
    const p = h.c.pattern
    h.c.practisePick('SCENE', 2)
    expect(p.practice.value!.spec.group).toBe(0)
    expect(p.practice.value!.spec.speed).toBe(75)
    p.endPractice()
    h.c.practisePick('PATTERN', 2)
    expect(p.practice.value).toBeNull()
    h.c.practisePick('PATTERN', 0)
    const ui = p.practice.value!
    const copied: string[] = []
    ;(h.deps as { clipboard?: unknown }).clipboard = { writeText: async (t: string) => void copied.push(t) }
    await h.c.copyPracticeReport()
    expect(copied).toHaveLength(1)
    expect(copied[0]!.split('\n')).toEqual([
      PracticeText.reportHead('A · 01', ui.bpm, 75),
      PracticeText.reportPlain(PracticeText.counts(0, 0, 0, 0, 0, 0), 0, null),
      PracticeText.REPORT_ASK,
    ])
  })
})
