// PATTERN in the controller (ArcController.kt's pattern part, state/pattern.ts):
// RECORD and PLAY drive the sequencer on Live's output, a pad armed starts the
// recording on its press, presses become notes on TIMING's grid, the count-in
// is counted, the sheet's edits and settings, and the patterns are kept.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Patterns, ProjectPatterns, Seq } from '../../src/core/features/pattern'
import { physicalPad } from '../../src/core/features/padNotes'
import { MirrorText } from '../../src/core/text/mirrorText'
import { memoryStorage } from '../../src/platform/storage/settings'
import { countInBeat, patternBpm, pressSkip, pressTickAt } from '../../src/state/patternPlan'
import { disposeAll, liveHarness, until, type LiveHarness } from './liveHarness'

afterEach(() => disposeAll())

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
})
