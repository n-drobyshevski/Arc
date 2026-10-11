// PATTERN in the controller (ArcController.kt's pattern part, state/pattern.ts):
// RECORD and PLAY drive the sequencer on Live's output, a pad armed starts the
// recording on its press, presses become notes on TIMING's grid, the count-in
// is counted, the sheet's edits and settings, and the patterns are kept.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Patterns, ProjectPatterns, Seq } from '../../src/core/features/pattern'
import { physicalPad } from '../../src/core/features/padNotes'
import { MirrorText } from '../../src/core/text/mirrorText'
import { FeatureText } from '../../src/core/text/featureText'
import { memoryStorage } from '../../src/platform/storage/settings'
import { countInBeat, patternBpm, pressSkip, pressTickAt } from '../../src/state/patternPlan'
import { disposeAll, liveHarness, until, type LiveHarness } from './liveHarness'

// performance.now() starts near 0 in a fresh worker: the tests' presses a second back would be before it began,
// which a press's time never is. A clock 100 s on keeps them after it.
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
const B3 = physicalPad(1, 3)

// Pads counted from the bottom: project 1 holds kick (slot 1) on pad A ".", offset 0.
const ORDER = { 'arc.mirror.order': 'FROM_BOTTOM' }

async function liveOn(): Promise<LiveHarness> {
  const h = await liveHarness({ storage: memoryStorage(ORDER) })
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  // The patterns are the device's project's (switching to it would stop the transport mid-test).
  await vi.waitFor(() => expect(h.c.pattern.ui.value.project).toBe(1))
  return h
}

const now = (): number => performance.now()
const notes = (h: LiveHarness, g: number) => ProjectPatterns.group(h.c.pattern.patternsNow, g).notes

describe('PatternPlan', () => {
  it('counts the count-in, places presses and rounds the tempo', () => {
    expect(countInBeat(-Seq.TICKS_PER_BAR)).toBe(1)
    expect(countInBeat(-1)).toBe(4)
    expect(countInBeat(0)).toBeNull()
    expect(countInBeat(-Seq.TICKS_PER_BAR - 1)).toBeNull()
    expect(pressTickAt(1500, 1000, 120)).toBe(96)
    expect(pressSkip(null, true, false)).toBe(0)
    expect(pressSkip(3, true, true)).toBe(3)
    expect(pressSkip(null, false, false)).toBeNull()
    expect(patternBpm(121.96, 90)).toBe(122)
    expect(patternBpm(null, 300)).toBe(240)
  })
})

describe('PATTERN', () => {
  it('PLAY plays from bar 1 and stops; RECORD arms and disarms', async () => {
    const h = await liveHarness()
    const p = h.c.pattern
    p.play()
    expect(p.ui.value.phase).toBe('PLAYING')
    expect(h.liveAudio.seqLog).toContain('play:0:0:null')
    p.play()
    expect(p.ui.value.phase).toBe('STOPPED')
    expect(h.liveAudio.seqLog.at(-2)).toBe('stop')
    p.recordDown(now())
    expect(p.ui.value.phase).toBe('ARMED')
    expect(h.liveAudio.seqLog.at(-1)).toBe('arm:true')
    p.recordDown(now())
    expect(p.ui.value.phase).toBe('STOPPED')
    expect(h.liveAudio.seqLog.at(-1)).toBe('arm:false')
  })

  it('armed, PLAY counts a bar in (with its lead), then plays and records', async () => {
    const h = await liveHarness()
    const p = h.c.pattern
    p.recordDown(now())
    p.recordUp(now())
    p.play()
    expect(p.ui.value).toMatchObject({ phase: 'COUNT_IN', recording: true })
    expect(h.liveAudio.seqLog).toContain('play:1:150:null')
    // Beat 3 of the count-in is heard now: tick 0 a beat and a half on.
    h.liveAudio.runAt(now() + 750)
    await vi.waitFor(() => expect(p.ui.value.countIn).toBe(3))
    h.liveAudio.runAt(now() - 10)
    await vi.waitFor(() => expect(p.ui.value.phase).toBe('PLAYING'))
    expect(p.ui.value.countIn).toBeNull()
    expect(p.ui.value.recording).toBe(true)
  })

  it('COUNT-IN off: PLAY records at once', async () => {
    const h = await liveHarness()
    const p = h.c.pattern
    p.setCountIn(false)
    p.recordDown(now())
    p.play()
    expect(p.ui.value).toMatchObject({ phase: 'PLAYING', recording: true, countInOn: false })
    expect(h.liveAudio.seqLog).toContain('play:0:0:null')
  })

  it('a pad played while armed starts the recording on its press, as its first note', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.recordDown(now())
    const at = now()
    await h.c.playPad(A0, true, false, at)
    expect(p.ui.value).toMatchObject({ phase: 'PLAYING', recording: true, focusGroup: 0 })
    expect(h.liveAudio.seqLog).toContain(`play:0:0:${at}`)
    expect(notes(h, 0)).toMatchObject([{ tick: 0, offset: 0 }])
    // Heard live as it was pressed: not played again in its first pass.
    expect(h.liveAudio.plans.at(-1)?.skip.get(notes(h, 0)[0]!.id)).toBe(0)
  })

  it('presses land on TIMING grid by the timeline, gates end at the release', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setCountIn(false)
    p.recordDown(now())
    p.play()
    // Tick 0 a little over a beat ago (120 BPM: 500 ms a beat, 96 ticks).
    const zero = now() - 530
    h.liveAudio.runAt(zero)
    await h.c.playPad(B3, true, false, zero + 260)
    h.c.releasePad(B3, zero + 520)
    const n = notes(h, 1)
    expect(n).toHaveLength(1)
    // 260 ms is tick 49.9: on the 1/16 grid, 48.
    expect(n[0]).toMatchObject({ tick: 48, offset: 3 })
    expect(n[0]!.gate).toBe(Math.round(520 * 0.192) - 48)
    p.stop()
    expect(p.ui.value).toMatchObject({ phase: 'STOPPED', recording: false, hasNotes: [false, true, false, false] })
  })

  it('KEYS notes record on the KEYS pad with their pitch', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setCountIn(false)
    await h.c.playPad(A0)
    h.c.releasePad(A0)
    p.recordDown(now())
    p.play()
    h.liveAudio.runAt(now())
    await h.c.playNote(67, true, now())
    h.c.releaseNote(67)
    expect(notes(h, 0)).toMatchObject([{ offset: 0, semitones: 7 }])
  })

  it('TIMING OFF keeps free time', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setTiming('off')
    expect(p.ui.value.timing).toBe('off')
    p.setCountIn(false)
    p.recordDown(now())
    p.play()
    const zero = now() - 600
    h.liveAudio.runAt(zero)
    await h.c.playPad(B3, true, false, zero + 260)
    expect(notes(h, 1)[0]?.tick).toBe(50)
  })

  it('no output: says so, and stays stopped', async () => {
    const h = await liveHarness()
    h.liveAudio.available = false
    h.c.pattern.play()
    expect(h.c.pattern.ui.value.phase).toBe('STOPPED')
    expect(h.toasts.at(-1)).toMatchObject({ text: MirrorText.NO_OUTPUT, error: true })
  })

  it('the output going stops the transport', async () => {
    const h = await liveHarness()
    const p = h.c.pattern
    p.play()
    h.liveAudio.runAt(now())
    await vi.waitFor(() => expect(p.position(now())).not.toBeNull())
    h.liveAudio.timeline.value = null
    expect(p.ui.value.phase).toBe('STOPPED')
  })

  it('counts where the focus group is', async () => {
    const h = await liveHarness()
    const p = h.c.pattern
    p.setLength(0, 2)
    p.play()
    h.liveAudio.runAt(now() - 2600)
    const pos = p.position(now())
    expect(pos).toMatchObject({ bar: 2, beat: 2, bars: 2 })
  })

  it('length, ×2, CLEAR and UNDO edit the patterns', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.setCountIn(false)
    p.recordDown(now())
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0)
    p.stop()
    expect(p.ui.value.hasNotes[0]).toBe(true)
    p.double(0)
    expect(p.ui.value.bars[0]).toBe(2)
    expect(notes(h, 0)).toHaveLength(2)
    p.setLength(0, 4)
    expect(p.ui.value.bars[0]).toBe(4)
    p.clear(0)
    expect(p.ui.value.hasNotes[0]).toBe(false)
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.cleared(0))
    expect(p.ui.value.canUndo).toBe(true)
    p.undo()
    expect(p.ui.value.hasNotes[0]).toBe(true)
  })

  it('keeps the patterns, and reads them back', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.recordDown(now())
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0)
    p.stop()
    await p.flush()
    const json = await h.library.readPatterns()
    expect(json).not.toBeNull()
    const all = Patterns.fromJson(json!)!
    expect([...all.projects.keys()]).toEqual([1])
    // A new controller on the same library has them.
    const h2 = await liveHarness({ library: h.library, storage: memoryStorage(ORDER) })
    await h2.c.connect()
    h2.c.setLive(true)
    await until(h2, (s) => s.mirror !== null && !s.mirror.loading && s.mirror.offline == null)
    await vi.waitFor(() => expect(h2.c.pattern.ui.value.hasNotes[0]).toBe(true))
  })

  it('hands the sequencer the pads in memory and loads the rest', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.recordDown(now())
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0)
    p.stop()
    const plan = h.liveAudio.plans.at(-1)!
    expect([...plan.voices.keys()]).toEqual([0])
    expect(h.liveAudio.has(plan.voices.get(0)!)).toBe(true)
    expect(plan.bpm).toBe(120)
  })

  it('keeps its settings', async () => {
    const h = await liveHarness()
    h.c.pattern.setTiming('1/8')
    h.c.pattern.setAutoLength(true)
    expect(h.c.pattern.ui.value).toMatchObject({ timing: '1/8', autoLength: true })
  })

  it('ERASE: a tap on a pad erases its notes and plays nothing', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    p.recordDown(now())
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0)
    p.stop()
    expect(p.ui.value.hasNotes[0]).toBe(true)
    p.setErase(true)
    expect(p.ui.value.erase).toBe(true)
    const presses = h.liveAudio.presses.length
    await h.c.playPad(A0, true, false, now())
    h.c.releasePad(A0, now())
    expect(h.liveAudio.presses.length).toBe(presses)
    expect(p.ui.value.hasNotes[0]).toBe(false)
    expect(h.toasts.at(-1)?.text).toBe(MirrorText.erased(A0))
    // An unsure press that turned into a scroll erases nothing.
    p.setErase(false)
    p.undo()
    p.setErase(true)
    await h.c.playPad(A0, true, true, now())
    h.c.cutPad(A0)
    expect(p.ui.value.hasNotes[0]).toBe(true)
  })

  it('ERASE: a pad held while playing erases its notes as they pass, only there', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    // The pad's sound in memory first: the timed presses below don't wait for a load.
    await h.c.playPad(A0)
    h.c.releasePad(A0)
    p.setCountIn(false)
    p.setTiming('1/4')
    // The clock held still, so a slow run can't age the presses' own times (they count only up to a second back).
    const held = performance.now()
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => held)
    p.recordDown(now())
    p.play()
    // 240 BPM: 250 ms a beat.
    const zero = now() - 900
    h.liveAudio.runAt(zero, 240)
    for (const b of [0, 1, 2, 3]) {
      await h.c.playPad(A0, true, false, zero + b * 250)
      h.c.releasePad(A0, zero + b * 250 + 50)
    }
    p.recordDown(now())
    expect(notes(h, 0).map((n) => n.tick)).toEqual([0, 96, 192, 288])
    p.setErase(true)
    // Held from tick 88 to tick 215: beats 2 and 3 go.
    await h.c.playPad(A0, true, false, zero + 230)
    h.c.releasePad(A0, zero + 560)
    expect(notes(h, 0).map((n) => n.tick)).toEqual([0, 288])
    clock.mockRestore()
  })

  it('ERASE: KEYS notes erase their own pitch on the KEYS pad', async () => {
    const h = await liveOn()
    const p = h.c.pattern
    await h.c.playPad(A0)
    h.c.releasePad(A0)
    p.setCountIn(false)
    p.recordDown(now())
    p.play()
    h.liveAudio.runAt(now())
    await h.c.playNote(67, true, now())
    h.c.releaseNote(67)
    await h.c.playNote(64, true, now())
    h.c.releaseNote(64)
    p.stop()
    p.setErase(true)
    await h.c.playNote(67, true, now())
    h.c.releaseNote(67, now())
    expect(notes(h, 0).map((n) => n.semitones)).toEqual([4])
  })

  it("TEMPO: the click on and off, at the phone's tempo, and its beats light TEMPO", async () => {
    const h = await liveHarness()
    const p = h.c.pattern
    p.setClick(true)
    expect(p.metronome.value).toEqual({ on: true, bpm: 120 })
    expect(h.liveAudio.clickLog).toEqual(['click:true:120:free'])
    h.liveAudio.beat({ index: 0, at: 1000, accent: true })
    expect(p.beats.value).toEqual({ index: 0, at: 1000, accent: true })
    p.setTempo(97.4)
    expect(p.metronome.value.bpm).toBe(97)
    expect(h.liveAudio.clickLog.at(-1)).toBe('click:true:97:free')
    // The pattern plays at the phone's tempo too while the EP-133 sends no clock.
    expect(h.liveAudio.plans.at(-1)?.bpm).toBe(97)
    p.setTempo(500)
    expect(p.metronome.value.bpm).toBe(240)
    p.setClick(false)
    expect(h.liveAudio.clickLog.at(-1)).toBe('click:false:240:free')
    // The tempo is kept (the click isn't): a new controller starts at it, off.
    const h2 = await liveHarness({ storage: h.storage })
    expect(h2.c.pattern.metronome.value).toEqual({ on: false, bpm: 240 })
  })

  it('TEMPO: no output says so, and the click stays off', async () => {
    const h = await liveHarness()
    h.liveAudio.available = false
    h.c.pattern.setClick(true)
    expect(h.c.pattern.metronome.value.on).toBe(false)
    expect(h.toasts.at(-1)?.text).toBe(FeatureText.NO_AUDIO_OUTPUT)
  })

  it('TEMPO: tap tempo sets the tempo from the second tap', async () => {
    const h = await liveHarness()
    const p = h.c.pattern
    expect(p.tapTempo(1000)).toBeNull()
    expect(p.tapTempo(1500)).toBe(120)
    expect(p.tapTempo(1900)).toBe(133)
    expect(p.metronome.value.bpm).toBe(133)
  })

  it("TEMPO: the EP-133's clock lights TEMPO, and the click follows its beats", async () => {
    const h = await liveHarness()
    const p = h.c.pattern
    const t0 = now()
    // 30 clocks at 120 BPM (24 a beat, 500 ms): a beat on the first and the 25th.
    p.midi({ type: 'Start', time: t0 } as never)
    for (let i = 0; i < 30; i++) p.midi({ type: 'Clock', time: t0 + (i * 500) / 24 } as never)
    expect(p.beats.value).toMatchObject({ index: 1, accent: false })
    p.setClick(true)
    expect(h.liveAudio.clickLog.at(-1)).toBe('click:true:120:grid')
  })
})
