// Port of core/src/test/kotlin/dev/arc/ep133/features/TourTest.kt
//
// Web additions (after the Kotlin cases): the targets and DONE_TAGS are
// checked against the coachMark("…") ids the Android app really has
// (app/src/main/kotlin/**), and against the web's own COACH_IDS.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FirstRun,
  TOUR_STEPS,
  Tour,
  TourProgress,
  TourStep,
  handled,
  type TourSession,
  type TourSnapshot,
} from '../../../src/core/features/tour'
import { COACH_IDS } from '../../../src/ui/components/Coach'

const { WELCOME, RESTORE, CONNECT, MIDI, PAD, HEAR, BACKUP, TOOLS, GUIDE, SECTIONS, DONE } = TourStep

const fresh: TourSnapshot = { backups: 0, canRestore: false, midi: true, connected: false }

/** A run driven through [Tour.advance], as Root's effect does. */
class Run {
  s: TourSession
  now = 1000
  constructor(public p: TourProgress = TourProgress(), public snap: TourSnapshot = fresh) {
    this.s = Tour.open(p, false, false, snap.backups)
  }
  step(): TourStep {
    return Tour.current(this.p, this.s, this.snap)
  }
  update(change: (s: TourSnapshot) => TourSnapshot = (s) => s): TourStep {
    this.snap = change(this.snap)
    this.now += 100
    const [np, ns] = Tour.advance(this.p, this.s, this.snap, this.now)
    this.p = np
    this.s = ns
    return this.step()
  }
  start(): void {
    this.s = Tour.welcome(this.s)
    this.update()
  }
  skip(): void {
    this.p = Tour.skip(this.p, this.step())
    this.update()
  }
}

const run = (snap: TourSnapshot, p: TourProgress = TourProgress()): Run => new Run(p, snap)

describe('TourTest', () => {
  it('progress is kept as canonical text', () => {
    const p = TourProgress([PAD, CONNECT], [BACKUP])
    expect(Tour.encode(p)).toBe('connect,pad,~backup')
    expect(Tour.decode('connect,pad,~backup')).toEqual(p)
    expect(Tour.decode(' ~backup ,pad,welcome,nonsense,,connect,done')).toEqual(p)
    expect(Tour.encode(Tour.decode('sections,~tools,connect'))).toBe('connect,~tools,sections')
    expect(Tour.encode(TourProgress())).toBe('')
    expect(Tour.decode('')).toEqual(TourProgress())
    // Done wins over skipped.
    expect(Tour.decode('~hear,hear')).toEqual(TourProgress([HEAR]))
  })

  it('merging joins both, done winning over skipped', () => {
    expect(Tour.mergeText('connect,pad,~backup', 'backup,~hear')).toBe('connect,pad,~hear,backup')
    expect(Tour.mergeText('', 'connect')).toBe('connect')
  })

  it('the whole tour, step by step', () => {
    const r = run(fresh)
    expect(r.step()).toBe(WELCOME)
    r.start()
    expect(r.step()).toBe(CONNECT)
    // Connected: the card stays, ticked, until Next.
    expect(r.update((it) => ({ ...it, connected: true }))).toBe(CONNECT)
    expect(r.p.done.has(CONNECT)).toBe(true)
    r.s = Tour.ackConnect(r.s)
    expect(r.update()).toBe(PAD)
    // An old hit (before the step came up) doesn't count; a new one does.
    expect(r.update((it) => ({ ...it, hitAt: 500, hitNamed: true }))).toBe(PAD)
    expect(r.update((it) => ({ ...it, hitAt: r.now + 1 }))).toBe(HEAR)
    // HEAR ticks when the pad is let go after sounding.
    expect(r.update((it) => ({ ...it, heard: true }))).toBe(HEAR)
    expect(r.update((it) => ({ ...it, heard: false }))).toBe(BACKUP)
    expect(r.update((it) => ({ ...it, busy: true }))).toBe(BACKUP)
    expect(r.update((it) => ({ ...it, busy: false, backups: 1 }))).toBe(DONE)
    expect(Tour.encode(r.p)).toBe('connect,pad,hear,backup')
    expect(Tour.laterNote(r.p, true)).toBe(false)
  })

  it('done stays for the rest of the run', () => {
    const r = run(fresh)
    r.start()
    r.skip()
    expect(r.step()).toBe(DONE)
    // The EP-133 showing up later doesn't bring the steps back in this run.
    expect(r.update((it) => ({ ...it, connected: true }))).toBe(DONE)
  })

  it('without MIDI the Needs MIDI card leads to the offline steps', () => {
    const r = run({ ...fresh, midi: false })
    r.start()
    expect(r.step()).toBe(MIDI)
    r.skip()
    expect(r.step()).toBe(TOOLS)
    expect(Tour.stepsFor(r.s, false)).toBe(3)
    r.skip()
    r.skip()
    r.skip()
    expect(r.step()).toBe(DONE)
    expect(Tour.encode(r.p)).toBe('~midi,~tools,~guide,~sections')
    expect(Tour.laterNote(r.p, false)).toBe(false)
  })

  it('without the EP-133, each offline step waits until it was opened', () => {
    const r = run(fresh)
    r.s = Tour.goOffline(r.s)
    expect(r.update()).toBe(TOOLS)
    expect(Tour.stepsFor(r.s)).toBe(3)
    // Live tools open: ticked; the next card waits until it is closed (the UI hides the tour meanwhile).
    expect(r.update((it) => ({ ...it, toolsOpen: true }))).toBe(GUIDE)
    expect(r.update((it) => ({ ...it, toolsOpen: false }))).toBe(GUIDE)
    expect(r.update((it) => ({ ...it, guideOpen: true }))).toBe(SECTIONS)
    expect(r.update((it) => ({ ...it, guideOpen: false }))).toBe(SECTIONS)
    expect(r.update((it) => ({ ...it, onBackups: true }))).toBe(DONE)
    expect(Tour.encode(r.p)).toBe('tools,guide,sections')
    // Nothing of the device's was ticked or skipped.
    expect(handled(r.p, CONNECT) || handled(r.p, PAD) || handled(r.p, BACKUP)).toBe(false)
  })

  it("try the pads moves from the offline path to the device's steps", () => {
    const r = run(fresh)
    r.s = Tour.goOffline(r.s)
    r.update()
    // The EP-133 connects on the way: ticked, and the Connect card shows it once.
    r.update((it) => ({ ...it, connected: true }))
    expect(r.step()).toBe(TOOLS)
    r.s = Tour.goDevice(r.s)
    expect(Tour.stepsFor(r.s)).toBe(4)
    expect(r.update()).toBe(CONNECT)
    expect(r.p.done.has(CONNECT)).toBe(true)
    r.s = Tour.ackConnect(r.s)
    expect(r.update()).toBe(PAD)
    // From the offline Done without a device: plain Connect.
    const d = run(fresh)
    d.s = Tour.goOffline(d.s)
    d.update()
    d.skip()
    d.skip()
    d.skip()
    expect(d.step()).toBe(DONE)
    d.s = Tour.goDevice(d.s)
    expect(d.update()).toBe(CONNECT)
    expect(d.p.done.has(CONNECT)).toBe(false)
  })

  it('skipping Connect skips everything that needs the device', () => {
    const r = run(fresh)
    r.start()
    r.skip()
    expect(r.step()).toBe(DONE)
    expect(Tour.laterNote(r.p, true)).toBe(true)
  })

  it('restore shows first for an empty library that can be restored', () => {
    const r = run({ ...fresh, canRestore: true })
    r.start()
    expect(r.step()).toBe(RESTORE)
    expect(r.update((it) => ({ ...it, backups: 3 }))).toBe(CONNECT)
    expect(r.p.done.has(RESTORE)).toBe(true)
    // First time here skips it.
    const r2 = run({ ...fresh, canRestore: true })
    r2.start()
    r2.skip()
    expect(r2.step()).toBe(CONNECT)
    expect(Tour.encode(r2.p)).toBe('~restore')
    // Picking a folder (nothing to restore any more) moves on without keeping anything.
    const r3 = run({ ...fresh, canRestore: true })
    r3.start()
    expect(r3.update((it) => ({ ...it, canRestore: false }))).toBe(CONNECT)
    expect(Tour.encode(r3.p)).toBe('')
    // Never with backups, never in the demo.
    const withBackups = run({ ...fresh, canRestore: true, backups: 2 })
    withBackups.start()
    expect(withBackups.step()).toBe(CONNECT)
    const inDemo = run({ ...fresh, canRestore: true, demo: true })
    inDemo.start()
    expect(inDemo.step()).toBe(CONNECT)
  })

  it('a connection made before Start shows the ticked card once', () => {
    const r = run({ ...fresh, connected: true })
    expect(r.update()).toBe(WELCOME)
    expect(r.p.done.has(CONNECT)).toBe(false)
    r.start()
    expect(r.step()).toBe(CONNECT)
    expect(r.p.done.has(CONNECT)).toBe(true)
    r.s = Tour.ackConnect(r.s)
    expect(r.update()).toBe(PAD)
  })

  it('a resumed tour skips what was done and counts from there', () => {
    const p = Tour.decode('connect,pad')
    const r = run({ ...fresh, connected: true, hitNamed: true }, p)
    expect(r.s.resumed).toBe(true)
    expect(Tour.resumeAt(r.p)).toBe(3)
    r.start()
    // CONNECT was done earlier: no ticked card this time.
    expect(r.step()).toBe(HEAR)
    expect(run(fresh).s.resumed).toBe(false)
  })

  it('hear is passed by silently without a named sample', () => {
    const r = run({ ...fresh, connected: true }, Tour.decode('connect'))
    r.start()
    expect(r.step()).toBe(PAD)
    expect(r.update((it) => ({ ...it, hitAt: r.now + 1, hitNamed: false }))).toBe(BACKUP)
    expect(handled(r.p, HEAR)).toBe(false)
    // laterNote doesn't count a HEAR that couldn't show.
    expect(Tour.laterNote(r.p, true)).toBe(true)
    r.update((it) => ({ ...it, backups: 1 }))
    expect(Tour.laterNote(r.p, true)).toBe(false)
  })

  it('steps need fresh actions after Try arc again', () => {
    // An existing user: a library, a connected device, an old hit.
    const snap: TourSnapshot = { ...fresh, backups: 4, connected: true, hitAt: 10, hitNamed: true }
    const r = run(snap)
    r.start()
    r.s = Tour.ackConnect(r.s)
    expect(r.update()).toBe(PAD)
    expect(r.update()).toBe(PAD)
    expect(r.update((it) => ({ ...it, hitAt: r.now + 1 }))).toBe(HEAR)
    r.skip()
    // The library already has backups: only a new one ticks BACKUP.
    expect(r.update()).toBe(BACKUP)
    expect(r.update((it) => ({ ...it, backups: 5 }))).toBe(DONE)
  })

  it('progress never un-ticks', () => {
    const r = run(fresh)
    r.start()
    r.update((it) => ({ ...it, connected: true }))
    r.update((it) => ({ ...it, connected: false }))
    expect(r.p.done.has(CONNECT)).toBe(true)
    expect(Tour.skip(TourProgress([CONNECT]), CONNECT)).toEqual(TourProgress([CONNECT]))
    expect(Tour.skip(TourProgress(), WELCOME)).toEqual(TourProgress())
  })

  it('first run decision', () => {
    expect(Tour.firstRun(false, false, '', 0, false)).toBe(FirstRun.TOUR)
    expect(Tour.firstRun(false, false, '', 3, false)).toBe(FirstRun.COACH)
    expect(Tour.firstRun(false, false, 'connect', 3, false)).toBe(FirstRun.TOUR)
    expect(Tour.firstRun(false, false, '', 3, true)).toBe(FirstRun.TOUR)
    expect(Tour.firstRun(true, false, '', 0, false)).toBe(FirstRun.NONE)
    expect(Tour.firstRun(true, true, '', 0, true)).toBe(FirstRun.NONE)
    expect(Tour.firstRun(false, true, '', 0, false)).toBe(FirstRun.COACH)
  })

  it('the tour closes when it was finished elsewhere', () => {
    const s = Tour.open(TourProgress(), false, false, 0)
    expect(Tour.closes(s, false, false)).toBe(false)
    expect(Tour.closes(s, true, false)).toBe(true)
    expect(Tour.closes(s, false, true)).toBe(true)
    // Try arc again: the old flags don't close it.
    const again = Tour.open(TourProgress(), true, true, 3)
    expect(Tour.closes(again, true, true)).toBe(false)
  })

  it('settings reach library json only with a library', () => {
    expect(Tour.syncsIndex(false, 0)).toBe(false)
    expect(Tour.syncsIndex(true, 0)).toBe(true)
    expect(Tour.syncsIndex(false, 1)).toBe(true)
  })

  it('numbers, targets and what passes touches through', () => {
    expect(TOUR_STEPS.map((s) => Tour.number(s))).toEqual([null, null, 1, null, 2, 3, 4, 1, 2, 3, null])
    expect(TOUR_STEPS.filter((s) => Tour.passThrough(s))).toEqual([HEAR, TOOLS, GUIDE, SECTIONS])
    expect(TOUR_STEPS.filter((s) => Tour.needsDevice(s))).toEqual([PAD, BACKUP])
    expect(Tour.target(CONNECT)).toBe('top.connection')
    expect(Tour.target(PAD)).toBe('live.pads')
    expect(Tour.target(HEAR)).toBe('live.pads')
    expect(Tour.target(BACKUP)).toBe('backups.backup')
    expect(Tour.target(WELCOME)).toBeNull()
    expect(Tour.target(DONE)).toBeNull()
    // Every id is a coach mark the app has (Coach.kt's call sites).
    const marks = new Set(['top.connection', 'live.pads', 'backups.backup', 'top.help', 'edge.guide', 'side.more', 'top.sections'])
    expect(Tour.target(TOOLS)).toBe('side.more')
    expect(Tour.target(GUIDE)).toBe('edge.guide')
    expect(Tour.target(SECTIONS)).toBe('top.sections')
    const ids = [...TOUR_STEPS.map((s) => Tour.target(s)).filter((t): t is string => t !== null), ...Tour.DONE_TAGS]
    expect(ids.every((id) => marks.has(id))).toBe(true)
    expect(Tour.resumeAt(Tour.decode('connect,pad,~hear'))).toBe(4)
    expect(Tour.resumeAt(TourProgress())).toBe(1)
  })
})

/** Every .kt file under [dir]. */
function ktFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...ktFiles(p))
    else if (name.endsWith('.kt')) out.push(p)
  }
  return out
}

describe('the tour points at real coach marks (web)', () => {
  const appSrc = fileURLToPath(new URL('../../../../app/src/main/kotlin', import.meta.url))
  const kotlinMarks = new Set<string>()
  for (const f of ktFiles(appSrc)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/coachMark\(\s*"([^"]+)"/g)) kotlinMarks.add(m[1] as string)
  }
  const used = [...TOUR_STEPS.map((s) => Tour.target(s)).filter((t): t is string => t !== null), ...Tour.DONE_TAGS]

  it('the Android app marks every target and Done tag (coachMark("…") in app/src/main/kotlin)', () => {
    expect(kotlinMarks.size).toBeGreaterThan(0)
    for (const id of used) expect(kotlinMarks, id).toContain(id)
  })

  it('so does the web (COACH_IDS)', () => {
    for (const id of used) expect(COACH_IDS as readonly string[], id).toContain(id)
  })
})
