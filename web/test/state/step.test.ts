// STEP and CORRECT in the controller (ArcController.kt's STEP section, state/pattern.ts): the panel
// opens stopped, its RECORD places a pad on the cursor's step (which sounds but never records), − / +
// move the cursor and its notes sound, a long press picks a note to nudge; CORRECT puts a pad's notes on
// the grid, in the panel with a tap and while playing as a pad is held (silently), and ERASE and CORRECT
// turn each other off.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectPatterns } from '../../src/core/features/pattern'
import { physicalPad } from '../../src/core/features/padNotes'
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
const ORDER = { 'arc.mirror.order': 'FROM_BOTTOM' }

async function liveOn(): Promise<LiveHarness> {
  const h = await liveHarness({ storage: memoryStorage(ORDER) })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  await vi.waitFor(() => expect(h.c.pattern.ui.value.project).toBe(1))
  // The pad's sound in memory: presses and auditions don't wait for a load.
  await h.c.playPad(A0)
  h.c.releasePad(A0)
  return h
}

const now = (): number => performance.now()
const ticks = (h: LiveHarness, g = 0) => ProjectPatterns.group(h.c.pattern.patternsNow, g).notes.map((n) => n.tick)

describe('STEP', () => {
  it("opens stopped; its RECORD places the pad on the cursor's step, which sounds and records nothing else", async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setErase(true)
    p.setStepOpen(true, 0)
    expect(p.step.value.open).toBe(true)
    expect(p.erasing).toBe(false)
    // Without RECORD a press only sounds.
    const presses = h.liveAudio.presses.length
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0, now())
    expect(h.liveAudio.presses.length).toBe(presses + 1)
    expect(ticks(h)).toEqual([])
    // RECORD held: on the cursor's step (+ moved it one on).
    p.stepBy(1)
    p.stepRecordDown()
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0, now())
    expect(p.step.value.status).toBe('+ KICK')
    p.stepRecordUp()
    expect(ticks(h)).toEqual([24])
    expect(p.step.value.occupied[1]).toBe(true)
    expect(p.ui.value.phase).toBe('STOPPED')
    // PLAY folds the panel.
    p.stepPlay()
    expect(p.step.value.open).toBe(false)
    expect(p.ui.value.phase).toBe('PLAYING')
    p.stop()
    // Not while the pattern plays.
    p.play()
    p.setStepOpen(true, 0)
    expect(p.step.value.open).toBe(false)
  })

  it('− / + move the cursor and its notes sound; a long press picks a note, which + nudges', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setStepOpen(true, 0)
    p.stepRecordDown()
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0, now())
    p.stepRecordUp()
    p.stepBy(1)
    p.stepBy(-1)
    // Back on step 1: its kick sounds on the pattern's own voice key.
    expect(h.liveAudio.presses.at(-1)?.id).toBe('live:0:0')
    expect(h.c.stepPadPick(A0)).toBe(true)
    expect(p.step.value.picked).toEqual({ pad: A0, semitones: null })
    p.stepBy(1)
    expect(ticks(h)).toEqual([24])
    expect(p.step.value.step).toBe(1)
    p.undo()
    expect(ticks(h)).toEqual([0])
  })

  it("KEYS in the panel places a note at its pitch on the KEYS sound's pad", async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setStepOpen(true, 0)
    p.stepRecordDown()
    await h.c.playNote(64, true, now())
    h.c.releaseNote(64, now())
    p.stepRecordUp()
    expect(ProjectPatterns.group(p.patternsNow, 0).notes.map((n) => n.semitones)).toEqual([4])
  })
  it('opened before any project is known, it stays open on the project read; another project closes it', async () => {
    const h = await liveHarness({ storage: memoryStorage(ORDER) })
    const p = h.c.pattern
    expect(p.ui.value.project).toBe(0)
    p.setStepOpen(true, 0)
    expect(p.step.value.open).toBe(true)
    // The patterns load late, then the device's project comes in.
    await p.switchProject(1)
    expect(p.ui.value.project).toBe(1)
    expect(p.step.value.open).toBe(true)
    await p.switchProject(2)
    expect(p.step.value.open).toBe(false)
  })
})

describe('CORRECT', () => {
  it("in the panel, a tap puts the pad's notes on the grid", async () => {
    const h = await liveOn()
    const p = h.c.pattern
    // A kick a little late, recorded in free time.
    p.setCountIn(false)
    p.setTimingQuantize(false)
    p.recordDown(now())
    const zero = now()
    await h.c.playPad(A0, true, false, zero)
    h.c.releasePad(A0, zero + 50)
    p.stop()
    p.setTimingQuantize(true)
    const before = ticks(h)
    p.setStepOpen(true, 0)
    p.stepRecordUp()
    p.setStepCorrect(true)
    p.stepBy(1)
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0, now())
    expect(ticks(h).every((t) => t % 24 === 0)).toBe(true)
    expect(p.step.value.status).toMatch(/corrected$/)
    expect(before.length).toBe(1)
  })

  it('while playing a pad tapped corrects silently; ERASE on turns CORRECT off', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setCountIn(false)
    p.setTimingQuantize(false)
    const held = performance.now()
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => held)
    p.recordDown(now())
    p.play()
    const zero = now() - 900
    h.liveAudio.runAt(zero, 240)
    await h.c.playPad(A0, true, false, zero + 20)
    h.c.releasePad(A0, zero + 60)
    p.recordDown(now())
    p.setTimingQuantize(true)
    expect(ticks(h)[0]).toBeGreaterThan(0)
    p.setStepCorrect(true)
    expect(p.correcting).toBe(true)
    const presses = h.liveAudio.presses.length
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0, now() + 50)
    expect(h.liveAudio.presses.length).toBe(presses)
    expect(ticks(h)).toEqual([0])
    expect(p.step.value.status).toBe('1 corrected')
    p.setErase(true)
    expect(p.step.value.correct).toBe(false)
    clock.mockRestore()
  })
})
