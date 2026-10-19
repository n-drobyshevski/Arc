// PRACTICE in the controller (ArcController.kt's PRACTICE section, state/pattern.ts): a web addition, as Kotlin has no
// test of it. A practice plays the scene from a bar counted in with the player's hits taken out, at its own speed, on
// one group's pads; a press is scored by when it is heard (in WAIT, by whether the step waits for it); ■ keeps the
// counts, ✕ puts the scene back, RECORD ends it, and COPY puts how it went on the clipboard. IMPORT AND PRACTISE
// practises what the last IMPORT placed: a card's lesson a step at a time (four clean passes open the next, ‹ › change
// step, each step's record kept for the result and the report).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectPatterns } from '../../src/core/features/pattern'
import { physicalPad, type PhysicalPad } from '../../src/core/features/padNotes'
import { Practice, PracticeCounts, practiceSpec } from '../../src/core/features/practice'
import { PracticeText } from '../../src/core/text/practiceText'
import { memoryStorage } from '../../src/platform/storage/settings'
import { disposeAll, liveHarness, until, type LiveHarness } from './liveHarness'

let clockSpy: { mockRestore(): void } | null = null
// How far the clock is ahead of the real one (a lesson's passes move it on, as playing them would).
let shift = 100_000
beforeEach(() => {
  const real = performance.now.bind(performance)
  shift = 100_000
  clockSpy = vi.spyOn(performance, 'now').mockImplementation(() => real() + shift)
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

/** Live on, nothing recorded. */
async function liveOn(): Promise<LiveHarness> {
  const h = await liveHarness({ storage: memoryStorage(ORDER) })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  await vi.waitFor(() => expect(h.c.pattern.ui.value.project).toBe(1))
  return h
}

const A7 = physicalPad(0, 9)
const A9 = physicalPad(0, 11)
const LESSON = [
  'ARC BEAT 1',
  'name Lesson beat',
  'lesson Kick alone | A7 | 50 | Count out loud',
  'lesson Add the snare | A7 A9 | 75',
  '[A] bars 1',
  'A7 kick  | X... .... X... .... |',
  'A9 snare | .... X... .... X... |',
].join('\n')

// Where the practice on is heard from (tick 0), set by [playClean] from its first pass.
let zero = 0

/** The practice on, from pass [from] (0: heard from now) to [to]: its hits on [pads] each played in time, a frame at each pass's end. */
async function playClean(h: LiveHarness, pads: Record<number, PhysicalPad>, from: number, to: number): Promise<void> {
  const p = h.c.pattern
  const bpm = h.liveAudio.plans.at(-1)!.bpm
  if (from === 0) {
    zero = now()
    h.liveAudio.runAt(zero, bpm)
  }
  const ui = p.practice.value!
  const length = ui.bars * 384
  const hits = Object.entries(pads)
    .flatMap(([o, pad]) => ProjectPatterns.group(p.patternsNow, pad.group).notes.filter((n) => n.offset === Number(o)).map((n) => [n.tick, pad] as const))
    .sort((a, b) => a[0] - b[0])
  for (let pass = from; pass < to; pass++) {
    for (const [tick, pad] of hits) {
      const at = zero + Practice.msOf(pass * length + tick, bpm)
      // The clock gets to the press: a press stamped later than now is taken as now.
      shift += Math.max(at - now(), 0)
      await h.c.playPad(pad, true, false, at)
      h.c.releasePad(pad, at)
    }
    p.practiceFrame(zero + Practice.msOf((pass + 1) * length, bpm))
  }
}

describe('IMPORT AND PRACTISE', () => {
  it("practises what the last IMPORT placed: its first group with pad hits, at 75%; another practice isn't a lesson", async () => {
    const h = await liveOn()
    const p = h.c.pattern
    // Nothing imported yet: nothing to practise.
    h.c.practiseImport()
    expect(p.practice.value).toBeNull()
    await h.c.receiveBeat(['ARC BEAT 1', 'name Four', '[B]', 'B7 | X... X... X... X... |'].join('\n'))
    p.importBeat(false)
    h.c.practiseImport()
    const ui = p.practice.value!
    expect(ui.spec.group).toBe(1)
    expect(ui.spec.speed).toBe(75)
    expect(ui.lesson).toBeNull()
    expect(h.c.settings.value.liveOneGroup).toBe(true)
  })

  it("a card's lesson runs a step at a time: its pads and speed, ‹ › change step, four clean passes open the next", async () => {
    const h = await liveOn()
    const p = h.c.pattern
    await h.c.receiveBeat(LESSON)
    p.importBeat(false)
    h.c.practiseImport()
    let ui = p.practice.value!
    expect(ui.lesson).toEqual({ step: 1, steps: 2, title: 'Kick alone', tip: 'Count out loud', passesToGo: 4, records: [null, null], done: false })
    expect([...ui.spec.pads!]).toEqual([9])
    expect(ui.spec.speed).toBe(50)
    expect(ui.pads).toEqual([9])
    // ›: the next step, its pads and speed; past the last, nothing.
    p.lessonStep(1)
    ui = p.practice.value!
    expect(ui.lesson!.step).toBe(2)
    expect([...ui.spec.pads!].sort()).toEqual([11, 9].sort())
    expect(ui.spec.speed).toBe(75)
    p.lessonStep(1)
    expect(p.practice.value).toBe(ui)
    // ‹: back to the first, nothing played so nothing kept.
    p.lessonStep(-1)
    expect(p.practice.value!.lesson!.step).toBe(1)
    expect(p.practice.value!.lesson!.records).toEqual([null, null])

    // Two clean passes: two to go.
    await playClean(h, { 9: A7 }, 0, 2)
    expect(p.practice.value!.lesson!.passesToGo).toBe(2)
    // Four: the step is done, the next opens with a toast.
    await playClean(h, { 9: A7 }, 2, 4)
    expect(h.toasts.map((t) => t.text)).toContain(PracticeText.stepDone(1, 'Add the snare'))
    await vi.waitFor(() => expect(p.practice.value!.lesson!.step).toBe(2))
    expect(p.practice.value!.lesson!.records[0]).toEqual({ percent: 100, passes: 4, done: true, worst: null })
    expect(p.practice.value!.spec.speed).toBe(75)

    // The last step's clean passes: the lesson is done and it stops, the result listing every step.
    await playClean(h, { 9: A7, 11: A9 }, 0, 4)
    expect(h.toasts.at(-1)?.text).toBe(PracticeText.LESSON_DONE)
    await vi.waitFor(() => expect(p.ui.value.phase).toBe('STOPPED'))
    ui = p.practice.value!
    expect(ui.lesson!.done).toBe(true)
    expect(ui.lesson!.records.map((r) => r?.done)).toEqual([true, true])
    expect(PracticeCounts.percent(ui.counts)).toBe(100)

    // COPY: each step with its share in time and passes, for Claude.
    const copied: string[] = []
    ;(h.deps as { clipboard?: unknown }).clipboard = { writeText: async (t: string) => void copied.push(t) }
    await h.c.copyPracticeReport()
    const r0 = ui.lesson!.records[0]!
    const r1 = ui.lesson!.records[1]!
    expect(copied[0]!.split('\n')).toEqual([
      // Live's tempo, the last step's at 75%.
      PracticeText.reportLessonHead('Lesson beat', Math.round((h.liveAudio.plans.at(-1)!.bpm * 100) / 75)),
      PracticeText.reportStep(1, 'Kick alone', 'A7', 50, PracticeText.reportResult(100, r0.passes, true, null)),
      PracticeText.reportStep(2, 'Add the snare', 'A7 A9', 75, PracticeText.reportResult(100, r1.passes, true, null)),
      PracticeText.REPORT_ASK,
    ])

    // A practice from elsewhere ends the lesson.
    h.c.practise(practiceSpec(0))
    expect(p.practice.value!.lesson).toBeNull()
  })

  it("a step left with hits keeps its record; one never played reads 'not played yet'; ✕ ends the lesson", async () => {
    const h = await liveOn()
    const p = h.c.pattern
    await h.c.receiveBeat(LESSON)
    p.importBeat(false)
    h.c.practiseImport()
    await playClean(h, { 9: A7 }, 0, 1)
    p.lessonStep(1)
    const rec = p.practice.value!.lesson!.records[0]!
    expect(rec).toEqual({ percent: 100, passes: 1, done: false, worst: null })
    p.lessonStep(-1)
    const report = p.practiceReport()!.split('\n')
    expect(report[2]).toBe(PracticeText.reportStep(2, 'Add the snare', 'A7 A9', 75, PracticeText.REPORT_NOT_PLAYED))
    p.endPractice()
    h.c.practise(practiceSpec(0))
    expect(p.practice.value!.lesson).toBeNull()
  })
})
