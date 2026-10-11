// Port of app/src/test/kotlin/dev/arc/ep133/controller/StepPlanTest.kt: STEP as the controller keeps it
// (the cursor, the panel's presses, − / +, the knobs, CORRECT, and what Live shows of them).
// Web delta: no arp yet, so arpTakesPress's asserts aren't here; times are ms.
import { beforeEach, describe, expect, it } from 'vitest'
import { Keys, NoteNames, ROOT_NOTE } from '../../src/core/features/keys'
import { physicalPad, type PhysicalPad } from '../../src/core/features/padNotes'
import {
  ProjectPatterns,
  ProjectSeq,
  Timing,
  TimingSettings,
  pattern,
  patternNote,
  projectPatterns,
  type PatternNote,
} from '../../src/core/features/pattern'
import { PatternRecorder } from '../../src/core/features/patternRecorder'
import { Steps } from '../../src/core/features/steps'
import {
  STEP_GATES,
  StepDesk,
  StepHosting,
  StepView,
  auditionMs,
  barStep,
  cursorAt,
  litHas,
  pressArms,
  snapGate,
  stepGroupFor,
  stepHosting,
  stepOffered,
  stepOpens,
  stepPage,
  stepView,
  stepWord,
  type StepNote,
} from '../../src/state/stepPlan'

const kick = physicalPad(0, 9)
const snare = physicalPad(0, 11)
const keysPad = physicalPad(0, 6)
const names = new Map<number, string>([
  [kick.offset, 'kick'],
  [snare.offset, 'snare'],
])
const t = TimingSettings.of({ interval: Timing.SIXTEENTH, swing: 50, quantize: true })

let recorder: PatternRecorder
let desk: StepDesk
beforeEach(() => {
  recorder = new PatternRecorder()
  desk = new StepDesk((n) => stepWord(n, n.pad.group === 0 ? (names.get(n.pad.offset) ?? null) : null, NoteNames.LETTERS))
})

const hit = (pad: PhysicalPad): StepNote => ({ pad, semitones: null })
const key = (pad: PhysicalPad): string => `live:${pad.group}:${pad.offset}`
const undo = (p: ProjectPatterns): ProjectPatterns | null => {
  const back = recorder.undo(ProjectSeq.withPlaying(recorder.seq, p))
  return back === null ? null : ProjectSeq.playing(back)
}
const patterns = (bars: number, ...notes: PatternNote[]): ProjectPatterns => ProjectPatterns.with(projectPatterns(), 0, pattern(bars, notes))
const note = (tick: number, pad: PhysicalPad, semitones: number | null = null, velocity = 127, gate = 24): PatternNote =>
  patternNote(tick, pad.offset, gate, semitones, velocity)
const ticks = (p: ProjectPatterns, pad: PhysicalPad): number[] =>
  ProjectPatterns.group(p, pad.group)
    .notes.filter((n) => n.offset === pad.offset)
    .map((n) => n.tick)
    .sort((a, b) => a - b)
const groupOf = (p: ProjectPatterns, g: number) => ProjectPatterns.group(p, g)
// One tick a millisecond.
const tickAt = (ms: number): number => ms

describe('StepPlan', () => {
  it("the cursor keeps its place across intervals and wraps into a shorter pattern, and the strip's page follows it", () => {
    expect(cursorAt(5, Timing.SIXTEENTH, Timing.EIGHTH, 16)).toBe(2)
    expect(cursorAt(2, Timing.EIGHTH, Timing.SIXTEENTH, 32)).toBe(4)
    expect(cursorAt(20, Timing.SIXTEENTH, Timing.SIXTEENTH, 16)).toBe(4)
    expect(cursorAt(-1, Timing.SIXTEENTH, Timing.SIXTEENTH, 16)).toBe(15)
    expect([stepPage(15, Timing.SIXTEENTH), stepPage(16, Timing.SIXTEENTH), stepPage(3, Timing.QUARTER), stepPage(4, Timing.QUARTER)]).toEqual([0, 1, 0, 1])
    expect(barStep(1, Timing.SIXTEENTH)).toBe(16)
    expect(barStep(1, Timing.EIGHTH_T)).toBe(12)

    const p = patterns(2)
    desk.openOn(1, 0)
    desk.minusPlus(-1, p, recorder, t)
    const ui = desk.ui(p, t)
    expect(ui.step).toBe(31)
    expect(ui.count).toBe(32)
    expect(ui.page).toBe(1)
    expect(ui.label).toBe('2.4.4')
    expect(ui.bars).toBe(2)
    desk.minusPlus(1, p, recorder, t)
    expect(desk.ui(p, t).page).toBe(0)
    desk.jump(6, p, recorder, t)
    expect(desk.ui(p, TimingSettings.withInterval(t, Timing.EIGHTH)).step).toBe(3)
    expect(desk.ui(p, t).step).toBe(6)
    desk.page(1, p, recorder, t)
    for (let i = 0; i < 5; i++) desk.minusPlus(1, p, recorder, t)
    expect(desk.ui(p, t).step).toBe(21)
    expect(desk.ui(patterns(1), t).step).toBe(5)
    desk.setGroup(1)
    expect(desk.ui(p, t).step).toBe(0)
    desk.setGroup(0)
    expect(desk.ui(p, t).step).toBe(21)
    desk.project = 2
    expect(desk.ui(p, t).step).toBe(0)
  })

  it('LEN snaps to the gate table, and an audition lasts the gate at the tempo, 60 ms to 1,5 s', () => {
    expect([0, 1, 5, 25, 30, 34, 100, 1000].map(snapGate)).toEqual([1, 1, 4, 24, 32, 32, 96, 384])
    expect(STEP_GATES.length).toBe(20)
    expect([...STEP_GATES].sort((a, b) => a - b)).toEqual(STEP_GATES)
    expect(auditionMs(24, 120)).toBe(125)
    expect(auditionMs(1, 120)).toBe(60)
    expect(auditionMs(384, 60)).toBe(1500)
  })

  it('the status names a KEYS note by its pitch, a pad by its sound in capitals, else by the pad', () => {
    expect(stepWord({ pad: keysPad, semitones: 4 }, 'piano', NoteNames.SOLFEGE)).toBe(Keys.name(ROOT_NOTE + 4, NoteNames.SOLFEGE))
    expect(stepWord(hit(kick), ' kick 2 ', NoteNames.LETTERS)).toBe('KICK 2')
    expect(stepWord(hit(kick), null, NoteNames.LETTERS)).toBe('A 7')
    expect(stepWord(hit(kick), '  ', NoteNames.LETTERS)).toBe('A 7')
  })

  it("the cursor's step lights its pads, KEYS notes by pitch, and the knobs show its first note", () => {
    const p = patterns(1, note(26, kick, null, 90, 48), note(22, keysPad, 3, 64, 12), note(24, keysPad, 5), note(48, keysPad, 7))
    desk.openOn(1, 0)
    desk.jump(1, p, recorder, t)
    const ui = desk.ui(p, t)
    expect(ui.lit).toEqual(new Set([Steps.padKey(kick.offset, null), Steps.padKey(keysPad.offset, 3), Steps.padKey(keysPad.offset, 5)]))
    expect(ui.velocity).toBe(64)
    expect(ui.gate).toBe(12)
    expect(ui.occupied).toEqual([false, true, true, ...new Array<boolean>(13).fill(false)])
    expect(litHas(ui.lit, hit(keysPad))).toBe(true)
    expect(litHas(ui.lit, { pad: keysPad, semitones: 3 })).toBe(true)
    expect(litHas(ui.lit, { pad: keysPad, semitones: 7 })).toBe(false)
    expect(litHas(ui.lit, hit(snare))).toBe(false)
    desk.jump(5, p, recorder, t)
    expect(desk.ui(p, t).velocity).toBeNull()
    expect(desk.ui(p, t).gate).toBeNull()
    expect(desk.velocity(80, p, recorder, t)).toBe(p)
  })

  it("a press places its note only while the panel's RECORD is held", () => {
    const p = patterns(1)
    desk.openOn(1, 0)
    desk.jump(4, p, recorder, t)
    const heard = desk.press(key(kick), hit(kick), Number.NaN, p, recorder, t)
    expect(heard.patterns).toBe(p)
    expect(heard.plays).toBe(true)
    expect(desk.release(key(kick), p, recorder, t)).toBe(p)
    expect(recorder.canUndo).toBe(false)

    desk.record(true)
    const placed = desk.press(key(kick), hit(kick), Number.NaN, p, recorder, t).patterns
    expect(groupOf(placed, 0).notes).toEqual([patternNote(96, kick.offset, 24, null, 127)])
    expect(desk.status).toBe('+ KICK')
    expect(desk.said).toBe('KICK on step 1.2.1')
    desk.release(key(kick), placed, recorder, t)
    const again = desk.press(key(kick), hit(kick), Number.NaN, placed, recorder, t).patterns
    const both = desk.press('note:63', { pad: kick, semitones: 3 }, Number.NaN, again, recorder, t).patterns
    expect(ticks(both, kick)).toEqual([96, 96])
    expect(desk.ui(both, t).lit).toEqual(new Set([Steps.padKey(kick.offset, null), Steps.padKey(kick.offset, 3)]))
    desk.record(false)
    expect(desk.ui(both, t).occupied[4]).toBe(true)
  })

  it('presses in the panel do not arm the pattern; the panel opens stopped or armed', () => {
    expect(pressArms('ARMED', false, false)).toBe(true)
    expect(pressArms('ARMED', false, true)).toBe(false)
    expect(pressArms('ARMED', true, false)).toBe(false)
    expect(pressArms('STOPPED', false, false)).toBe(false)
    expect((['STOPPED', 'ARMED', 'COUNT_IN', 'PLAYING'] as const).map(stepOpens)).toEqual([true, true, false, false])
  })

  it('the view Live shows is told from KEYS, the piano and the one-group switch', () => {
    expect(stepView(false, false, true)).toBe(StepView.ONE_GROUP)
    expect(stepView(false, false, false)).toBe(StepView.ALL_GROUPS)
    expect(stepView(true, false, true)).toBe(StepView.KEYS_GRID)
    expect(stepView(true, true, false)).toBe(StepView.PIANO)
    expect(stepView(false, true, false)).toBe(StepView.ALL_GROUPS)
  })

  it("STEP is offered in every view on the Live tab with the pattern's transport, and nowhere else", () => {
    expect(stepOffered(true, true, true)).toBe(true)
    expect(stepOffered(false, true, true)).toBe(false)
    expect(stepOffered(true, false, true)).toBe(false)
    expect(stepOffered(true, true, false)).toBe(false)
  })

  it('the display line grows into the panel where there are function keys under it, else the panel takes their place', () => {
    for (const sideways of [false, true]) {
      for (const short of [false, true]) {
        expect(stepHosting(StepView.ONE_GROUP, sideways, short)).toBe(StepHosting.MORPH)
        expect(stepHosting(StepView.ALL_GROUPS, sideways, short)).toBe(StepHosting.MORPH)
      }
    }
    expect(stepHosting(StepView.KEYS_GRID, false, false)).toBe(StepHosting.MORPH)
    expect(stepHosting(StepView.KEYS_GRID, false, true)).toBe(StepHosting.MORPH)
    expect(stepHosting(StepView.KEYS_GRID, true, true)).toBe(StepHosting.SLOT)
    expect(stepHosting(StepView.KEYS_GRID, true, false)).toBe(StepHosting.SLOT)
    expect(stepHosting(StepView.PIANO, false, false)).toBe(StepHosting.MORPH)
    expect(stepHosting(StepView.PIANO, true, false)).toBe(StepHosting.MORPH)
    expect(stepHosting(StepView.PIANO, true, true)).toBe(StepHosting.SLOT)
  })

  it("the panel edits the KEYS sound's group on KEYS and the group shown on the pads", () => {
    expect(stepGroupFor(StepView.KEYS_GRID, 0, 2)).toBe(2)
    expect(stepGroupFor(StepView.PIANO, 1, 3)).toBe(3)
    expect(stepGroupFor(StepView.PIANO, 1, null)).toBeNull()
    expect(stepGroupFor(StepView.ONE_GROUP, 1, 3)).toBe(1)
    expect(stepGroupFor(StepView.ALL_GROUPS, 1, 3)).toBe(1)
    expect(stepGroupFor(StepView.ALL_GROUPS, 0, null)).toBe(0)
  })

  it('a pad pressed on another group of the all-groups page takes the panel there, on the step it shows', () => {
    const hat = physicalPad(2, 6)
    const p = ProjectPatterns.with(ProjectPatterns.with(projectPatterns(), 0, pattern(1, [note(0, kick)])), 2, pattern(1, [note(48, hat)]))
    desk.openOn(1, 0)
    desk.jump(2, p, recorder, t)
    expect(desk.group).toBe(0)
    desk.record(true)
    const out = desk.press(key(hat), hit(hat), Number.NaN, p, recorder, t)
    expect(desk.group).toBe(2)
    expect(desk.cursor(p, t.interval)).toBe(2)
    expect(Steps.notesOn(groupOf(out.patterns, 2), 2, t.interval, t.swing).length).toBeGreaterThan(0)
    desk.setGroup(0)
    expect(desk.cursor(p, t.interval)).toBe(2)
  })

  it('minus and plus shift a held pad with CORRECT on, else nudge the pick, else move the cursor', () => {
    const p = patterns(1, note(0, kick), note(100, kick), note(48, snare))
    desk.openOn(1, 0)
    desk.setCorrect(true, recorder)
    desk.press(key(kick), hit(kick), Number.NaN, p, recorder, t)
    const once = desk.minusPlus(1, p, recorder, t)
    expect(once.audition).toBe(false)
    expect(ticks(once.patterns, kick)).toEqual([1, 101])
    expect(desk.status).toBe('KICK +1 tk')
    const twice = desk.minusPlus(1, once.patterns, recorder, t).patterns
    expect(ticks(twice, kick)).toEqual([2, 102])
    expect(desk.status).toBe('KICK +2 tk')
    expect(desk.said).toBe('KICK 2 ticks later')
    expect(desk.ui(twice, t).step).toBe(0)
    expect(desk.release(key(kick), twice, recorder, t)).toBe(twice)

    desk.setCorrect(false, recorder)
    expect(desk.pick(hit(kick), twice, recorder, t)).toBe(true)
    expect(desk.picked).toEqual(hit(kick))
    const nudged = desk.minusPlus(1, twice, recorder, t)
    expect(nudged.audition).toBe(false)
    expect(ticks(nudged.patterns, kick)).toEqual([24, 102])
    expect(desk.ui(nudged.patterns, t).step).toBe(1)
    expect(desk.status).toBe('KICK → 1.1.2')
    expect(desk.pick(hit(kick), nudged.patterns, recorder, t)).toBe(true)
    expect(desk.picked).toBeNull()
    const moved = desk.minusPlus(1, nudged.patterns, recorder, t)
    expect(moved.audition).toBe(true)
    expect(moved.patterns).toBe(nudged.patterns)
    expect(desk.ui(moved.patterns, t).step).toBe(2)
    expect(desk.said).toBe('Step 1.1.3, 1 note')
    expect(desk.status).toBeNull()
    expect(desk.pick(hit(kick), moved.patterns, recorder, t)).toBe(false)

    const beforeNudge = undo(moved.patterns)
    expect(beforeNudge).toEqual(twice)
    expect(undo(beforeNudge!)).toEqual(p)
  })

  it('NUDGE latched picks with a tap instead of sounding, and CORRECT turns it off', () => {
    const p = patterns(1, note(0, kick))
    desk.openOn(1, 0)
    desk.nudge(true, recorder)
    const r = desk.press(key(kick), hit(kick), Number.NaN, p, recorder, t)
    expect(r.plays).toBe(false)
    expect(desk.picked).toEqual(hit(kick))
    expect(desk.nudgePick).toBe(true)
    desk.setCorrect(true, recorder)
    expect(desk.nudgePick).toBe(false)
    expect(desk.picked).toBeNull()
    expect(desk.pick(hit(kick), p, recorder, t)).toBe(false)
    desk.nudge(true, recorder)
    expect(desk.correct).toBe(false)
  })

  it("a tap with CORRECT on in the panel puts the pad's notes on the grid and says how many", () => {
    const p = patterns(1, note(5, kick), note(50, kick), note(96, kick), note(30, snare))
    desk.openOn(1, 0)
    desk.setCorrect(true, recorder)
    const r = desk.press(key(kick), hit(kick), Number.NaN, p, recorder, t)
    expect(r.plays).toBe(true)
    const out = desk.release(key(kick), r.patterns, recorder, t)
    expect(ticks(out, kick)).toEqual([0, 48, 96])
    expect(ticks(out, snare)).toEqual([30])
    expect(desk.status).toBe('2 corrected')
  })

  it('VEL and LEN set every note on the step, a turn being one UNDO step', () => {
    const p = patterns(1, note(24, kick), note(24, snare), note(48, kick))
    desk.openOn(1, 0)
    desk.jump(1, p, recorder, t)
    const a = desk.velocity(100, p, recorder, t)
    const b = desk.velocity(80, a, recorder, t)
    expect(groupOf(b, 0).notes.map((n) => n.velocity)).toEqual([80, 80, 127])
    recorder.endRun()
    const c = desk.gate(30, b, recorder, t)
    expect(groupOf(c, 0).notes.map((n) => n.gate)).toEqual([32, 32, 24])
    expect(undo(c)).toEqual(b)
    expect(undo(b)).toEqual(p)
  })

  it('a pad held with CORRECT on while playing corrects its notes as they pass, one UNDO step', () => {
    const p = patterns(1, note(5, kick), note(101, kick), note(197, kick), note(290, kick))
    desk.setCorrect(true, recorder)
    desk.holdDown('0:9:null', hit(kick), 0)
    expect(desk.holding).toBe(true)
    expect(desk.status).toBe('0 corrected')
    expect(desk.held(p, recorder, t, 100, 100, tickAt)).toBe(p)
    const a = desk.held(p, recorder, t, 100, 300, tickAt)
    expect(ticks(a, kick)).toEqual([0, 101, 197, 290])
    const b = desk.held(a, recorder, t, 200, 320, tickAt)
    expect(ticks(b, kick)).toEqual([0, 96, 192, 290])
    expect(desk.status).toBe('3 corrected')
    const c = desk.holdUp('0:9:null', 350, b, recorder, t, tickAt)
    expect(ticks(c, kick)).toEqual([0, 96, 192, 288])
    expect(desk.status).toBe('4 corrected')
    expect(desk.holding).toBe(false)
    expect(undo(c)).toEqual(p)
    expect(undo(p)).toBeNull()
    desk.correctedShown()
    expect(desk.status).toBeNull()
  })

  it('two pads held with CORRECT on while playing are one UNDO step, from the first down to the last up', () => {
    const p = patterns(1, note(5, kick), note(101, kick), note(197, kick), note(10, snare), note(130, snare), note(290, snare))
    desk.setCorrect(true, recorder)
    desk.holdDown('0:9:null', hit(kick), 0)
    desk.holdDown('0:11:null', hit(snare), 50)
    let out = desk.held(p, recorder, t, 100, 300, tickAt)
    out = desk.held(out, recorder, t, 200, 320, tickAt)
    out = desk.held(out, recorder, t, 300, 340, tickAt)
    expect(ticks(out, kick)).toEqual([0, 96, 192])
    expect(ticks(out, snare)).toEqual([10, 120, 288])
    out = desk.holdUp('0:9:null', 350, out, recorder, t, tickAt)
    expect(desk.holding).toBe(true)
    out = desk.held(out, recorder, t, 380, 400, tickAt)
    out = desk.holdUp('0:11:null', 450, out, recorder, t, tickAt)
    expect(desk.holding).toBe(false)
    expect(ticks(out, kick)).toEqual([0, 96, 192])
    expect(ticks(out, snare)).toEqual([0, 120, 288])
    expect(undo(out)).toEqual(p)
    expect(undo(p)).toBeNull()
    desk.holdDown('0:9:null', hit(kick), 0)
    const next = desk.holdUp('0:9:null', 100, p, recorder, t, tickAt)
    expect(undo(next)).toEqual(p)
  })

  it('a pad tapped with another held to correct while playing is part of its gesture', () => {
    const p = patterns(1, note(5, kick), note(101, kick), note(10, snare))
    desk.setCorrect(true, recorder)
    desk.holdDown('0:9:null', hit(kick), 0)
    let out = desk.held(p, recorder, t, 50, 300, tickAt)
    desk.holdDown('0:11:null', hit(snare), 310)
    out = desk.holdUp('0:11:null', 330, out, recorder, t, tickAt)
    expect(ticks(out, snare)).toEqual([0])
    out = desk.held(out, recorder, t, 150, 400, tickAt)
    out = desk.holdUp('0:9:null', 450, out, recorder, t, tickAt)
    expect(ticks(out, kick)).toEqual([0, 96])
    expect(undo(out)).toEqual(p)
    expect(undo(p)).toBeNull()
  })

  it("a tap with CORRECT on while playing corrects the pad's every note, and CORRECT off ends the holds", () => {
    const p = patterns(1, note(5, kick), note(290, kick))
    desk.setCorrect(true, recorder)
    desk.holdDown('0:9:null', hit(kick), 0)
    const out = desk.holdUp('0:9:null', 100, p, recorder, t, tickAt)
    expect(ticks(out, kick)).toEqual([0, 288])
    expect(desk.status).toBe('2 corrected')
    desk.holdDown('0:9:null', hit(kick), 0)
    desk.setCorrect(false, recorder)
    expect(desk.holding).toBe(false)
    desk.holdDown('0:9:null', hit(kick), 0)
    expect(desk.holding).toBe(false)
  })

  it('closing lets go of the pick, NUDGE, RECORD and the status, and keeps CORRECT', () => {
    const p = patterns(1, note(0, kick))
    desk.openOn(1, 0)
    desk.record(true)
    desk.press(key(kick), hit(kick), Number.NaN, p, recorder, t)
    desk.record(false)
    desk.pick(hit(kick), p, recorder, t)
    desk.setCorrect(true, recorder)
    desk.close(recorder)
    const ui = desk.ui(p, t)
    expect(ui.open).toBe(false)
    expect(ui.recordHeld).toBe(false)
    expect(ui.nudgePick).toBe(false)
    expect(ui.picked).toBeNull()
    expect(ui.status).toBeNull()
    expect(ui.said).toBeNull()
    expect(ui.correct).toBe(true)
    desk.openOn(1, 0)
    desk.setCorrect(false, recorder)
    desk.pick(hit(kick), p, recorder, t)
    desk.setGroup(1)
    expect(desk.picked).toBeNull()
    expect(desk.ui(p, t).group).toBe(1)
  })
})
