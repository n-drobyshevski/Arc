// Port of core/src/main/kotlin/dev/arc/ep133/text/PracticeText.kt
//
// PRACTICE on Live (an addition): play along with a pattern, its hits lit on
// the pads ahead of time, the rest of the scene underneath, and how it went.
// Its panel grows from the display line as STEP's does.
//
// Web delta: steps() takes [percent, done] tuples where the Kotlin has Pairs.

import type { HitMark } from '../features/practice'
import { plural } from './format'

const PRACTICE = 'Practice'
const LOOP_ALL = 'All'

function passes(n: number): string {
  return plural(n, 'pass', 'passes')
}

export const PracticeText = {
  PRACTICE,
  /** The panel for screen readers, and its ✕. */
  PANE: 'Practice panel',
  CLOSE: 'End practice',

  /** "PRACTICE A · 01": the header's start. */
  head: (place: string): string => `${PRACTICE} ${place}`,

  /** The header's status: "12/14 ON TIME", "WAIT 3/8", "READY". */
  onTime: (onTime: number, hits: number): string => `${onTime}/${hits} on time`,
  waitStep: (step: number, steps: number): string => `Wait ${step + 1}/${steps}`,
  READY: 'Ready',
  said: (onTime: number, hits: number): string => `${onTime} of ${hits} hits on time`,

  /** The keys. */
  WAIT: 'Wait',
  WAIT_NAME: 'Wait for each hit',
  speed: (percent: number): string => `${percent}%`,
  speedName: (percent: number, bpm: number): string => `Speed, ${percent} percent, ${bpm} BPM`,
  LOOP_ALL,
  loop: (bars: number | null): string => (bars !== null ? plural(bars, 'bar') : LOOP_ALL),
  loopName: (bars: number | null): string => 'Loop ' + (bars !== null ? 'the first ' + plural(bars, 'bar') : 'the whole pattern'),
  BACKING: 'Backing',
  BACKING_NAME: 'The rest of the scene plays underneath',
  PLAY: 'Play',
  STOP: 'Stop',

  /** The lane's caption, and the result after a stop. */
  bpm: (bpm: number, percent: number): string => `${bpm} BPM · ${percent}%`,
  result: (percent: number): string => `${percent}% on time`,
  counts: (hits: number, onTime: number, early: number, late: number, missed: number, extra: number): string =>
    [
      plural(hits, 'hit'),
      `${onTime} on time`,
      early > 0 ? `${early} early` : null,
      late > 0 ? `${late} late` : null,
      missed > 0 ? `${missed} missed` : null,
      extra > 0 ? `${extra} extra` : null,
    ]
      .filter((s) => s !== null)
      .join(' · '),

  /** "The kick came early most": the pad most often off, by its name. */
  worst: (name: string, mark: HitMark): string =>
    mark === 'EARLY' ? `${name} came early most` : mark === 'LATE' ? `${name} came late most` : `${name} was missed most`,

  WAIT_HINT: 'Play the lit pads in turn: the beat waits for each hit.',
  START_HINT: 'Lit pads play next; the number counts the beats to go.',
  passes,

  /** A pad lit to play next, for screen readers. */
  PLAY_NEXT: ', play next',
  inBeats: (n: number): string => `, in ${plural(n, 'beat')}`,

  /** The toast when a group has nothing to practise. */
  nothingToPlay: (place: string): string => `No pad hits in ${place} to practise.`,

  /** The beat card sheet's LESSON block: "A7 A9 · 50%" for a step, and what IMPORT AND PRACTISE does with them. */
  LESSON: 'Lesson',
  lessonPads: (pads: string, speed: number): string => `${pads} · ${speed}%`,
  LESSON_NOTE: "IMPORT AND PRACTISE runs these steps on Live's pads, one at a time: four clean passes open the next.",

  /** A card's lesson: the header ("STEP 2/4"), the line over the lane, the step keys, the toasts. */
  step: (step: number, steps: number): string => `Step ${step}/${steps}`,
  toGo: (n: number): string => plural(n, 'clean pass', 'clean passes') + ' to go',
  PREVIOUS: '‹',
  NEXT: '›',
  PREVIOUS_NAME: 'The step before',
  NEXT_NAME: 'The next step',
  stepDone: (step: number, next: string): string => `Step ${step} done. Next: ${next}`,
  LESSON_DONE: 'Lesson done: every step played clean.',
  /** The result's steps: "1 94% ✓ · 2 71% · 3 –". */
  steps: (records: readonly (readonly [number, boolean] | null)[]): string =>
    records.map((r, i) => `${i + 1} ` + (r !== null ? `${r[0]}%` + (r[1] ? ' ✓' : '') : '–')).join(' · '),

  /** COPY HOW IT WENT: a short report to paste back to Claude. */
  COPY_REPORT: 'Copy',
  COPY_REPORT_SUB: 'how it went',
  COPY_REPORT_NAME: 'Copy how it went, to paste to Claude',
  REPORT_SUBJECT: 'How my practice went',
  reportHead: (what: string, bpm: number, percent: number): string =>
    `Use the arc-beats skill. I practised ${what} in Arc's PRACTICE at ${bpm} BPM (${percent}% of its tempo). How it went:`,
  reportLessonHead: (name: string | null, bpm: number): string =>
    'Use the arc-beats skill. I practised the lesson of ' +
    (name === null || name.trim() === '' ? 'the card' : `"${name}"`) +
    ` in Arc's PRACTICE, the card at ${bpm} BPM. How it went:`,
  reportStep: (step: number, title: string, pads: string, speed: number, result: string): string =>
    `- Step ${step}, ${title} (${pads}, ${speed}%): ${result}`,
  reportResult: (percent: number, n: number, done: boolean, worst: string | null): string =>
    `${percent}% on time over ${passes(n)}` + (done ? ', done' : '') + (worst !== null ? `; ${worst}` : ''),
  REPORT_NOT_PLAYED: 'not played yet',
  reportPlain: (counts: string, n: number, worst: string | null): string =>
    '- ' + counts + ', ' + passes(n) + (worst !== null ? `; ${worst}` : ''),
  REPORT_ASK: 'What should I practise next?',

  /** PRACTICE on Claude's page and on the beat card sheet. */
  PRACTICE_NAME: "Practise playing it on Live's pads",
  IMPORT_PRACTICE: 'Import and practise',
} as const
