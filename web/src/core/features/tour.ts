// Port of core/src/main/kotlin/dev/arc/ep133/features/Tour.kt
//
// "Try arc": the short tour on the real Live screen that a new install gets in
// place of the first-run guide overlay (an addition to the web version).
//
// Every step waits until the thing was done: the EP-133 connected, a pad
// pressed on it lit here, a pad held here sounded, a backup saved. Without
// the EP-133 (chosen on the welcome card, or where MIDI is missing) it shows
// what works offline instead: Live tools, the shortcut guide, Backups. This is the
// tour's logic only, pure so both ports share it: which step shows, when one
// counts as done, and what is kept. The overlay and the cards are the UI's.
//
// Progress is kept as text ([Tour.encode]) in the settings, so a tour left half
// way resumes, and a restore of library.json brings it back. A step ticks once
// and never un-ticks.
//
// Web deltas:
// - enum class TourStep is a const object of the ids plus a string-union type
//   (TOUR_STEPS is TourStep.entries); sets are ReadonlySet<TourStep>.
// - data class copy() is an object spread; [Tour.advance] returns the very
//   objects it was given when nothing changed, so a caller can compare with ===.
// - Kotlin's Pair is a two-element tuple; merge(String, String) is [Tour.mergeText].
// - TourSnapshot.hitAt is in the clock the caller passes as `now` (the web uses
//   performance.now(), the clock of the MIDI events that light the pads).

import { ktTrim } from '../util/kotlinText'

export const TourStep = {
  WELCOME: 'welcome',
  /** Bring back the library after a reinstall: only while it is empty. */
  RESTORE: 'restore',
  CONNECT: 'connect',
  /** In place of the steps that need the EP-133 where MIDI is missing. */
  MIDI: 'midi',
  PAD: 'pad',
  HEAR: 'hear',
  BACKUP: 'backup',
  /** The offline path: Live tools, the EP-133 shortcut guide, Backups. */
  TOOLS: 'tools',
  GUIDE: 'guide',
  SECTIONS: 'sections',
  DONE: 'done',
} as const
export type TourStep = (typeof TourStep)[keyof typeof TourStep]

/** TourStep.entries, in declaration order. */
export const TOUR_STEPS: readonly TourStep[] = Object.freeze([
  TourStep.WELCOME,
  TourStep.RESTORE,
  TourStep.CONNECT,
  TourStep.MIDI,
  TourStep.PAD,
  TourStep.HEAR,
  TourStep.BACKUP,
  TourStep.TOOLS,
  TourStep.GUIDE,
  TourStep.SECTIONS,
  TourStep.DONE,
])

/** What the tour has done and skipped, kept across starts. */
export interface TourProgress {
  readonly done: ReadonlySet<TourStep>
  readonly skipped: ReadonlySet<TourStep>
}

export function TourProgress(done: Iterable<TourStep> = [], skipped: Iterable<TourStep> = []): TourProgress {
  return { done: new Set(done), skipped: new Set(skipped) }
}

/** TourProgress.handled */
export function handled(p: TourProgress, step: TourStep): boolean {
  return p.done.has(step) || p.skipped.has(step)
}

/** TourProgress.isEmpty */
export function isEmptyProgress(p: TourProgress): boolean {
  return p.done.size === 0 && p.skipped.size === 0
}

/** Data class equality of two progresses. */
export function sameProgress(a: TourProgress, b: TourProgress): boolean {
  const same = (x: ReadonlySet<TourStep>, y: ReadonlySet<TourStep>): boolean => x.size === y.size && [...x].every((s) => y.has(s))
  return same(a.done, b.done) && same(a.skipped, b.skipped)
}

/** What the app shows now, as the tour reads it. */
export interface TourSnapshot {
  /** Backups in the library. */
  readonly backups: number
  /** A folder can be picked to bring an earlier library back (none picked yet). */
  readonly canRestore: boolean
  /** This phone or browser can talk MIDI at all. */
  readonly midi: boolean
  /** Connected, and the device has been read. */
  readonly connected: boolean
  /** A task (backup, restore, connect) is running. */
  readonly busy?: boolean
  /** When the last pad hit from the EP-133 lit its pad (PadLight.onAt); null without one. */
  readonly hitAt?: number | null
  /** That pad's sample has a name, so it can play here. */
  readonly hitNamed?: boolean
  /** A pad or key is sounding on the phone. */
  readonly heard?: boolean
  /** The web demo's simulated EP-133. */
  readonly demo?: boolean
  /** Live tools, the shortcut guide, Backups: open on screen now. */
  readonly toolsOpen?: boolean
  readonly guideOpen?: boolean
  readonly onBackups?: boolean
}

/** One run of the tour on screen: never stored. */
export interface TourSession {
  /** What the settings said when the tour opened (see [Tour.closes]). */
  readonly seenAtOpen: boolean
  readonly tourDoneAtOpen: boolean
  /** Backups when the tour opened: RESTORE shows only for an empty library. */
  readonly openBackups: number
  /** Progress was kept from an earlier start: the welcome says so. */
  readonly resumed: boolean
  readonly welcomed: boolean
  /** The step on screen, and when it came up (with the backup count then). */
  readonly step: TourStep | null
  readonly stepAt: number
  readonly stepBackups: number
  /** In HEAR, a pad sounded since the step came up. */
  readonly heardSince: boolean
  /** CONNECT ticked during this run; its card then waits for Next. */
  readonly connectTickedNow: boolean
  readonly connectAcked: boolean
  /** Done was reached: it stays for the rest of the run. */
  readonly reachedDone: boolean
  /** The run without the EP-133: the offline steps instead of the device's. */
  readonly offline: boolean
}

/** TourSession(...) with Kotlin's defaults. */
export function TourSession(
  init: Pick<TourSession, 'seenAtOpen' | 'tourDoneAtOpen' | 'openBackups'> & Partial<TourSession>,
): TourSession {
  return {
    resumed: false,
    welcomed: false,
    step: null,
    stepAt: 0,
    stepBackups: 0,
    heardSince: false,
    connectTickedNow: false,
    connectAcked: false,
    reachedDone: false,
    offline: false,
    ...init,
  }
}

const SESSION_KEYS: readonly (keyof TourSession)[] = [
  'seenAtOpen',
  'tourDoneAtOpen',
  'openBackups',
  'resumed',
  'welcomed',
  'step',
  'stepAt',
  'stepBackups',
  'heardSince',
  'connectTickedNow',
  'connectAcked',
  'reachedDone',
  'offline',
]

/** Data class equality of two sessions. */
export function sameSession(a: TourSession, b: TourSession): boolean {
  return SESSION_KEYS.every((k) => a[k] === b[k])
}

export const FirstRun = { TOUR: 'TOUR', COACH: 'COACH', NONE: 'NONE' } as const
export type FirstRun = (typeof FirstRun)[keyof typeof FirstRun]

/** The steps that are kept (WELCOME and DONE never are). */
const KEPT: readonly TourStep[] = [
  TourStep.RESTORE,
  TourStep.CONNECT,
  TourStep.MIDI,
  TourStep.PAD,
  TourStep.HEAR,
  TourStep.BACKUP,
  TourStep.TOOLS,
  TourStep.GUIDE,
  TourStep.SECTIONS,
]
const OFFLINE: readonly TourStep[] = [TourStep.TOOLS, TourStep.GUIDE, TourStep.SECTIONS]

const offlineStep = (p: TourProgress): TourStep => OFFLINE.find((s) => !handled(p, s)) ?? TourStep.DONE

const tick = (p: TourProgress, step: TourStep): TourProgress =>
  TourProgress([...p.done, step], [...p.skipped].filter((s) => s !== step))

const minus = (a: Iterable<TourStep>, b: ReadonlySet<TourStep>): TourStep[] => [...a].filter((s) => !b.has(s))

export const Tour = {
  /** The numbered steps, "Step n of 4" (of 3 without the EP-133). */
  STEPS: 4,
  OFFLINE_STEPS: 3,

  /** The coach marks Done tags: "?", the GUIDE tab and the more-tools strip. */
  DONE_TAGS: Object.freeze(new Set(['top.help', 'edge.guide', 'side.more'])) as ReadonlySet<string>,

  encode(p: TourProgress): string {
    return KEPT.flatMap((s) => (p.done.has(s) ? [s] : p.skipped.has(s) ? ['~' + s] : [])).join(',')
  },

  /** Unknown ids are ignored; a step both done and skipped counts as done. */
  decode(text: string): TourProgress {
    const done = new Set<TourStep>()
    const skipped = new Set<TourStep>()
    for (const raw of text.split(',')) {
      const t = ktTrim(raw)
      const skip = t.startsWith('~')
      const id = skip ? t.slice(1) : t
      const step = KEPT.find((s) => s === id)
      if (step === undefined) continue
      if (skip) skipped.add(step)
      else done.add(step)
    }
    return TourProgress(done, minus(skipped, done))
  },

  /** Two kept progresses (library.json and a newer copy) joined. */
  merge(a: TourProgress, b: TourProgress): TourProgress {
    const done = new Set([...a.done, ...b.done])
    return TourProgress(done, minus([...a.skipped, ...b.skipped], done))
  },

  /** merge(String, String) */
  mergeText(a: string, b: string): string {
    return Tour.encode(Tour.merge(Tour.decode(a), Tour.decode(b)))
  },

  /** What a start shows by itself. A demo always gets the tour; it keeps no settings. */
  firstRun(seen: boolean, tourDone: boolean, tourSteps: string, backups: number, demo: boolean): FirstRun {
    if (!tourDone && !seen && (demo || backups === 0 || tourSteps.length !== 0)) return FirstRun.TOUR
    if (!seen) return FirstRun.COACH
    return FirstRun.NONE
  },

  /** A fresh run of the tour, with the settings as they are now. */
  open(p: TourProgress, seen: boolean, tourDone: boolean, backups: number): TourSession {
    return TourSession({ seenAtOpen: seen, tourDoneAtOpen: tourDone, openBackups: backups, resumed: !isEmptyProgress(p) })
  },

  /**
   * The tour closes by itself when the settings say it was finished since it
   * opened: a restore that brought back a finished tour, or another tab.
   */
  closes(s: TourSession, seen: boolean, tourDone: boolean): boolean {
    return (tourDone && !s.tourDoneAtOpen) || (seen && !s.seenAtOpen)
  },

  /** Settings reach library.json only once there is a library to keep them with. */
  syncsIndex(folderPicked: boolean, backups: number): boolean {
    return folderPicked || backups > 0
  },

  /** The step to show. */
  current(p: TourProgress, s: TourSession, snap: TourSnapshot): TourStep {
    if (!s.welcomed) return TourStep.WELCOME
    if (s.reachedDone) return TourStep.DONE
    if (!handled(p, TourStep.RESTORE) && s.openBackups === 0 && snap.canRestore && !(snap.demo ?? false)) return TourStep.RESTORE
    if (s.offline) return offlineStep(p)
    if (!snap.midi) return handled(p, TourStep.MIDI) ? offlineStep(p) : TourStep.MIDI
    const connectDone = p.done.has(TourStep.CONNECT)
    if (!handled(p, TourStep.CONNECT) || (s.connectTickedNow && !s.connectAcked)) return TourStep.CONNECT
    if (!connectDone) return TourStep.DONE
    if (!handled(p, TourStep.PAD)) return TourStep.PAD
    if (!handled(p, TourStep.HEAR) && p.done.has(TourStep.PAD) && (snap.hitNamed ?? false)) return TourStep.HEAR
    if (!handled(p, TourStep.BACKUP)) return TourStep.BACKUP
    return TourStep.DONE
  },

  /**
   * Brings the run and the progress up to date with what the app shows now:
   * the step's baseline when a new one comes up, then ticks. CONNECT ticks
   * whenever the EP-133 is connected; other steps only while on screen.
   */
  advance(p: TourProgress, s: TourSession, snap: TourSnapshot, now: number): [TourProgress, TourSession] {
    let prog = p
    let sess = s
    if (snap.connected && !prog.done.has(TourStep.CONNECT) && sess.welcomed) {
      prog = tick(prog, TourStep.CONNECT)
      sess = { ...sess, connectTickedNow: true }
    }
    // Each pass moves at most one step on, so a new step gets its own baseline first.
    for (let i = 0; i < KEPT.length + 2; i++) {
      const step = Tour.current(prog, sess, snap)
      if (step !== sess.step) {
        sess = { ...sess, step, stepAt: now, stepBackups: snap.backups, heardSince: false }
        if (step === TourStep.DONE) sess = { ...sess, reachedDone: true }
        continue
      }
      if (step === TourStep.HEAR && (snap.heard ?? false) && !sess.heardSince) sess = { ...sess, heardSince: true }
      let ticks: boolean
      switch (step) {
        case TourStep.RESTORE:
          ticks = snap.backups > sess.openBackups
          break
        case TourStep.PAD:
          ticks = snap.hitAt != null && snap.hitAt > sess.stepAt
          break
        case TourStep.HEAR:
          ticks = sess.heardSince && !(snap.heard ?? false)
          break
        case TourStep.BACKUP:
          ticks = snap.backups > sess.stepBackups
          break
        case TourStep.TOOLS:
          ticks = snap.toolsOpen ?? false
          break
        case TourStep.GUIDE:
          ticks = snap.guideOpen ?? false
          break
        case TourStep.SECTIONS:
          ticks = snap.onBackups ?? false
          break
        default:
          ticks = false
      }
      if (!ticks) return [prog, sess]
      prog = tick(prog, step)
    }
    return [prog, sess]
  },

  /** "Skip", "Later", "First time here" and the Needs MIDI card's Next. */
  skip(p: TourProgress, step: TourStep): TourProgress {
    return !KEPT.includes(step) || p.done.has(step) ? p : TourProgress(p.done, [...p.skipped, step])
  },

  /** Start or Continue on the welcome card. */
  welcome(s: TourSession): TourSession {
    return { ...s, welcomed: true }
  },

  /** Next on the Connect card once every row is ticked. */
  ackConnect(s: TourSession): TourSession {
    return { ...s, connectAcked: true }
  },

  /** "Without the EP-133" on the welcome card. */
  goOffline(s: TourSession): TourSession {
    return { ...Tour.welcome(s), offline: true }
  },

  /** "Try the pads": from the offline path to the device's steps. */
  goDevice(s: TourSession): TourSession {
    return { ...s, welcomed: true, offline: false, reachedDone: false, step: null }
  },

  /** How many steps this run counts: the offline three without the EP-133 or without MIDI. */
  stepsFor(s: TourSession, midi = true): number {
    return s.offline || !midi ? Tour.OFFLINE_STEPS : Tour.STEPS
  },

  /** "Step n of 4" (or of 3, offline), or null for the cards that aren't counted. */
  number(step: TourStep): number | null {
    switch (step) {
      case TourStep.CONNECT:
      case TourStep.TOOLS:
        return 1
      case TourStep.PAD:
      case TourStep.GUIDE:
        return 2
      case TourStep.HEAR:
      case TourStep.SECTIONS:
        return 3
      case TourStep.BACKUP:
        return 4
      default:
        return null
    }
  },

  /** The first numbered step not done yet, for "stopped at step n". */
  resumeAt(p: TourProgress): number {
    const first = [TourStep.CONNECT, TourStep.PAD, TourStep.HEAR, TourStep.BACKUP].find((s) => !handled(p, s))
    return first !== undefined ? (Tour.number(first) ?? Tour.STEPS) : Tour.STEPS
  },

  /** The steps that need the EP-133 connected: without it their card asks to connect. */
  needsDevice(step: TourStep): boolean {
    return step === TourStep.PAD || step === TourStep.BACKUP
  },

  /** The coach mark a step points at; null for a card on the veil alone. */
  target(step: TourStep): string | null {
    switch (step) {
      case TourStep.CONNECT:
        return 'top.connection'
      case TourStep.PAD:
      case TourStep.HEAR:
        return 'live.pads'
      // Back up is the first key of the Backups caption row: the step shows on Backups.
      case TourStep.BACKUP:
        return 'backups.backup'
      case TourStep.TOOLS:
        return 'side.more'
      case TourStep.GUIDE:
        return 'edge.guide'
      case TourStep.SECTIONS:
        return 'top.sections'
      default:
        return null
    }
  },

  /** The steps done on the page itself: touches go through to it (the pads, the strip, the tab, the tag). */
  passThrough(step: TourStep): boolean {
    return step === TourStep.HEAR || OFFLINE.includes(step)
  },

  /** Done mentions Try arc again when a step that could be done was left. */
  laterNote(p: TourProgress, midi: boolean): boolean {
    return midi && ([TourStep.CONNECT, TourStep.PAD, TourStep.BACKUP].some((s) => !p.done.has(s)) || p.skipped.has(TourStep.HEAR))
  },
}
